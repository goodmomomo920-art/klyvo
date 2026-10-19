-- ==============================================================================
-- KLYVO PRODUCT REVIEWS & RATINGS
-- Migration: 20261019000003_product_reviews.sql
-- Description:
--   1. public.product_reviews — merchant-moderated, phone-identity-deduplicated
--      product reviews.
--   2. submit_public_product_review(...) — anonymous submission with strict
--      validation, spam rate limiting and DB-proven purchase verification.
--   3. get_public_product_reviews(...) — published-only safe projection.
--
--   Identity / duplicate rules:
--     - The reviewer's phone is REQUIRED and is normalized server-side, but it
--       is NEVER stored. Only md5(store_id || ':' || product_id || ':' || phone)
--       is persisted as author_key. UNIQUE (product_id, author_key) makes
--       duplicate submissions for the same product impossible even under a race.
--     - author_store_key = md5(store_id || ':' || phone) powers a 5-per-hour
--       per-store spam limit without retaining personal data.
--
--   Verified purchase:
--     - TRUE only when the same normalized phone has a Delivered order in this
--       store that contains this product (orders + order_items are the actual
--       schema). Otherwise the review is accepted as unverified and still goes
--       through merchant moderation. No identity is invented.
--
--   Ratings:
--     - Only status = 'published' rows count toward averages/counts (computed in
--       SECURITY DEFINER RPCs; no public view bypasses RLS).
--
--   Security:
--     - RLS merchant-only for reads/updates/deletes. No authenticated INSERT
--       policy: public submissions use the definer RPC only.
--     - Bodies are stored as plain text, length-capped, control characters
--       stripped, and rendered by React as text — never as HTML.
--
--   Additive; no previously applied migration file is modified.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  rating integer NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL,
  reviewer_name text NOT NULL,
  author_key text NOT NULL,
  author_store_key text NOT NULL,
  is_verified_purchase boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  moderation_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,

  CONSTRAINT product_reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT product_reviews_title_length CHECK (char_length(title) <= 120),
  CONSTRAINT product_reviews_body_length CHECK (char_length(btrim(body)) BETWEEN 3 AND 2000),
  CONSTRAINT product_reviews_name_length CHECK (char_length(btrim(reviewer_name)) BETWEEN 2 AND 80),
  CONSTRAINT product_reviews_author_key_format CHECK (author_key ~ '^[0-9a-f]{32}$'),
  CONSTRAINT product_reviews_author_store_key_format CHECK (author_store_key ~ '^[0-9a-f]{32}$'),
  CONSTRAINT product_reviews_status_allowed CHECK (status IN ('pending', 'published', 'rejected')),
  CONSTRAINT product_reviews_moderation_note_length
    CHECK (moderation_note IS NULL OR char_length(moderation_note) <= 500),
  CONSTRAINT product_reviews_verified_requires_order
    CHECK (NOT is_verified_purchase OR order_id IS NOT NULL),
  CONSTRAINT product_reviews_unique_per_product_author UNIQUE (product_id, author_key)
);

CREATE INDEX IF NOT EXISTS product_reviews_store_status_created_idx
  ON public.product_reviews (store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS product_reviews_product_published_idx
  ON public.product_reviews (product_id, created_at DESC)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS product_reviews_author_store_recent_idx
  ON public.product_reviews (author_store_key, created_at DESC);

COMMENT ON TABLE public.product_reviews IS
  'Merchant-moderated product reviews. Only md5 author keys are stored; raw reviewer phone numbers are never persisted. Verified purchase requires a Delivered order containing the product.';
COMMENT ON COLUMN public.product_reviews.author_key IS
  'md5(store_id:product_id:normalized_phone). UNIQUE per product prevents duplicate submissions.';
COMMENT ON COLUMN public.product_reviews.author_store_key IS
  'md5(store_id:normalized_phone), used only for the per-store hourly spam limit.';

DROP TRIGGER IF EXISTS trigger_product_reviews_updated_at ON public.product_reviews;
CREATE TRIGGER trigger_product_reviews_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- RLS: merchant-only visibility and moderation
-- ==============================================================================
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_reviews FROM anon;
REVOKE ALL ON TABLE public.product_reviews FROM PUBLIC;

DROP POLICY IF EXISTS "Merchants can view their product reviews" ON public.product_reviews;
CREATE POLICY "Merchants can view their product reviews"
  ON public.product_reviews FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_reviews.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can moderate their product reviews" ON public.product_reviews;
CREATE POLICY "Merchants can moderate their product reviews"
  ON public.product_reviews FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_reviews.store_id AND s.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_reviews.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can delete their product reviews" ON public.product_reviews;
CREATE POLICY "Merchants can delete their product reviews"
  ON public.product_reviews FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_reviews.store_id AND s.owner_id = (SELECT auth.uid())));

GRANT SELECT, UPDATE, DELETE ON TABLE public.product_reviews TO authenticated;

-- ==============================================================================
-- PUBLIC REVIEW SUBMISSION RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.submit_public_product_review(
  p_slug text,
  p_product_id uuid,
  p_rating integer,
  p_title text,
  p_body text,
  p_reviewer_name text,
  p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text;
  v_store_id uuid;
  v_product_name text;
  v_rating integer;
  v_title text;
  v_body text;
  v_name text;
  v_phone_norm text;
  v_author_key text;
  v_author_store_key text;
  v_recent_count integer;
  v_order_id uuid;
  v_customer_id uuid;
  v_verified boolean := false;
  v_review_id uuid;
BEGIN
  -- Store resolution (validated slug only; never a client store id).
  v_slug := btrim(COALESCE(p_slug, ''));
  IF char_length(v_slug) = 0
     OR char_length(v_slug) > 100
     OR v_slug !~ '^[a-z0-9-]+$' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STORE',
      'message', 'Invalid store.');
  END IF;

  SELECT s.id INTO v_store_id FROM public.stores s WHERE s.slug = v_slug LIMIT 1;
  IF v_store_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STORE',
      'message', 'Store not found.');
  END IF;

  SELECT pr.name INTO v_product_name
  FROM public.products pr
  WHERE pr.id = p_product_id
    AND pr.store_id = v_store_id
    AND pr.status = 'Active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'PRODUCT_NOT_FOUND',
      'message', 'This product is not available for reviews.');
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_RATING',
      'message', 'Rating must be a whole number from 1 to 5.');
  END IF;
  v_rating := p_rating;

  v_title := btrim(regexp_replace(COALESCE(p_title, ''), '[[:cntrl:]]', '', 'g'));
  IF char_length(v_title) > 120 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TITLE_TOO_LONG',
      'message', 'Review title cannot exceed 120 characters.');
  END IF;

  v_body := btrim(regexp_replace(COALESCE(p_body, ''), '[[:cntrl:]]', '', 'g'));
  IF char_length(v_body) < 3 OR char_length(v_body) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_BODY',
      'message', 'Review text must be between 3 and 2000 characters.');
  END IF;

  v_name := btrim(regexp_replace(COALESCE(p_reviewer_name, ''), '[[:cntrl:]]', '', 'g'));
  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_NAME',
      'message', 'Please enter your name (2–80 characters).');
  END IF;

  -- Phone is required for identity only; it is hashed and never stored.
  IF p_phone IS NULL OR btrim(p_phone) !~ '^[+]?[0-9][0-9 \-()]{4,49}$' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PHONE',
      'message', 'Please enter a valid phone number.');
  END IF;
  v_phone_norm := lower(regexp_replace(btrim(p_phone), '[^0-9+]', '', 'g'));
  IF v_phone_norm = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_PHONE',
      'message', 'Please enter a valid phone number.');
  END IF;

  v_author_key := md5(v_store_id::text || ':' || p_product_id::text || ':' || v_phone_norm);
  v_author_store_key := md5(v_store_id::text || ':' || v_phone_norm);

  -- Spam guard: at most 5 review submissions per phone per store per hour.
  SELECT count(*) INTO v_recent_count
  FROM public.product_reviews r
  WHERE r.author_store_key = v_author_store_key
    AND r.created_at > now() - interval '1 hour';

  IF v_recent_count >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'RATE_LIMITED',
      'message', 'Too many review submissions. Please try again later.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.product_reviews r
    WHERE r.product_id = p_product_id AND r.author_key = v_author_key
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'DUPLICATE',
      'message', 'You have already reviewed this product.');
  END IF;

  -- Verified purchase: DB-proven Delivered order containing this product with
  -- the same normalized phone. This is the only path that sets the flag.
  SELECT o.id, o.customer_id
  INTO v_order_id, v_customer_id
  FROM public.orders o
  WHERE o.store_id = v_store_id
    AND o.status = 'Delivered'
    AND lower(regexp_replace(btrim(o.customer_phone), '[^0-9+]', '', 'g')) = v_phone_norm
    AND EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = o.id AND oi.product_id = p_product_id
    )
  ORDER BY o.created_at DESC
  LIMIT 1;

  v_verified := FOUND;

  BEGIN
    INSERT INTO public.product_reviews (
      store_id, product_id, customer_id, order_id, rating, title, body,
      reviewer_name, author_key, author_store_key, is_verified_purchase, status
    ) VALUES (
      v_store_id, p_product_id, v_customer_id, v_order_id, v_rating, v_title, v_body,
      v_name, v_author_key, v_author_store_key, v_verified, 'pending'
    )
    RETURNING id INTO v_review_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'DUPLICATE',
      'message', 'You have already reviewed this product.');
  END;

  RETURN jsonb_build_object(
    'success', true,
    'review_id', v_review_id,
    'status', 'pending',
    'is_verified_purchase', v_verified,
    'message', 'Thank you! Your review was submitted for moderation.'
  );
END;
$$;

-- ==============================================================================
-- PUBLIC REVIEW READ RPC (published only, safe projection)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_public_product_reviews(
  p_slug text,
  p_product_id uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text;
  v_store_id uuid;
  v_page integer;
  v_size integer;
  v_total integer := 0;
  v_average numeric(3, 2) := 0;
  v_reviews jsonb := '[]'::jsonb;
BEGIN
  v_slug := btrim(COALESCE(p_slug, ''));
  IF char_length(v_slug) = 0 OR char_length(v_slug) > 100 OR v_slug !~ '^[a-z0-9-]+$' THEN
    RETURN jsonb_build_object(
      'reviews', '[]'::jsonb, 'total', 0, 'average_rating', 0,
      'review_count', 0, 'page', 1, 'has_more', false
    );
  END IF;

  SELECT s.id INTO v_store_id FROM public.stores s WHERE s.slug = v_slug LIMIT 1;
  IF v_store_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.products pr
    WHERE pr.id = p_product_id AND pr.store_id = v_store_id
  ) THEN
    RETURN jsonb_build_object(
      'reviews', '[]'::jsonb, 'total', 0, 'average_rating', 0,
      'review_count', 0, 'page', 1, 'has_more', false
    );
  END IF;

  v_page := GREATEST(1, COALESCE(p_page, 1));
  v_size := LEAST(GREATEST(1, COALESCE(p_page_size, 10)), 50);

  SELECT count(*), COALESCE(round(avg(r.rating)::numeric, 2), 0)
  INTO v_total, v_average
  FROM public.product_reviews r
  WHERE r.product_id = p_product_id
    AND r.store_id = v_store_id
    AND r.status = 'published';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'rating', r.rating,
    'title', r.title,
    'body', r.body,
    'reviewer_name', r.reviewer_name,
    'is_verified_purchase', r.is_verified_purchase,
    'created_at', r.created_at
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_reviews
  FROM (
    SELECT r.*
    FROM public.product_reviews r
    WHERE r.product_id = p_product_id
      AND r.store_id = v_store_id
      AND r.status = 'published'
    ORDER BY r.created_at DESC
    LIMIT v_size OFFSET (v_page - 1) * v_size
  ) r;

  RETURN jsonb_build_object(
    'reviews', v_reviews,
    'total', v_total,
    'average_rating', v_average,
    'review_count', v_total,
    'page', v_page,
    'page_size', v_size,
    'has_more', v_total > v_page * v_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_product_review(text, uuid, integer, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_product_review(text, uuid, integer, text, text, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_public_product_reviews(text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_product_reviews(text, uuid, integer, integer) TO anon, authenticated;

COMMENT ON FUNCTION public.submit_public_product_review IS
  'Anonymous review submission for one validated store/product. Validates and length-caps all text, rate-limits per phone/store, deduplicates per product via a DB unique constraint, and sets verified purchase only from a Delivered order containing the product.';
COMMENT ON FUNCTION public.get_public_product_reviews IS
  'Published-only review projection with pagination and average rating. Never exposes author hashes, phones, customer ids or order ids.';
