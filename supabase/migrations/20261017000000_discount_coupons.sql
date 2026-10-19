-- ==============================================================================
-- KLYVO DISCOUNT COUPONS
-- Migration: 20261017000000_discount_coupons.sql
-- Description:
--   Adds per-store discount coupons (percentage / fixed amount) end to end:
--     1. public.coupons        — merchant-owned coupon definitions (RLS-gated)
--     2. public.coupon_usage   — audit rows for every successfully applied coupon
--     3. orders                — additive coupon_code / discount_amount columns
--     4. validate_public_coupon(...) — safe public pre-checkout validation
--     5. create_public_store_order(...) — REPLACED with an extended hardened
--        version that validates + locks + redeems the coupon atomically.
--
--   Security model:
--     - Coupons are private merchant data: RLS restricts all access to the
--       owning merchant via stores.owner_id = auth.uid(). anon gets NOTHING.
--     - Customers interact only through two narrowly scoped SECURITY DEFINER
--       functions with a fixed safe search_path. They can never list, read,
--       edit, or enumerate coupons — only obtain a boolean-ish validation
--       verdict for one validated code in one validated store.
--     - All discount math is server-side from catalog prices + saved store
--       settings. The browser only ever sends the coupon CODE (a string).
--     - Concurrency: the checkout RPC takes FOR UPDATE on the coupon row before
--       evaluating usage limits. Concurrent checkouts serialize on that lock;
--       total and per-customer limits can never be exceeded. Usage is recorded
--       in the SAME transaction as the order — a failed order consumes nothing.
--     - (coupon_id, order_id) is UNIQUE: duplicate usage records are impossible.
--
--   Payments: unchanged. No online payment processing is introduced; coupons
--   affect the recorded payable total only.
--
--   Fully additive except for the deliberate replacement of the public
--   checkout RPC signature (adds p_coupon_code). No previously applied
--   migration file is modified.
-- ==============================================================================

-- ==============================================================================
-- 1. TABLE: public.coupons
--    code is stored UPPERCASE so uniqueness is case-insensitive per store.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_type text NOT NULL,
  discount_value numeric(12, 2) NOT NULL,
  min_order_subtotal numeric(12, 2),
  max_discount_amount numeric(12, 2),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  usage_limit integer,
  per_customer_limit integer,
  is_active boolean NOT NULL DEFAULT true,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- store_id FK is declared inline above (auto-named coupons_store_id_fkey,
  -- matching the schema convention used by products/customers/orders).
  CONSTRAINT coupons_code_format CHECK (code ~ '^[A-Z0-9_-]{2,32}$'),
  CONSTRAINT coupons_discount_type_allowed
    CHECK (discount_type IN ('percentage', 'fixed_amount')),
  CONSTRAINT coupons_discount_value_positive CHECK (discount_value > 0),
  CONSTRAINT coupons_percentage_value_max
    CHECK (discount_type <> 'percentage' OR discount_value <= 100),
  CONSTRAINT coupons_min_subtotal_non_negative
    CHECK (min_order_subtotal IS NULL OR min_order_subtotal >= 0),
  CONSTRAINT coupons_max_discount_positive
    CHECK (max_discount_amount IS NULL OR max_discount_amount > 0),
  CONSTRAINT coupons_max_discount_percentage_only
    CHECK (discount_type <> 'fixed_amount' OR max_discount_amount IS NULL),
  CONSTRAINT coupons_expires_after_starts
    CHECK (expires_at IS NULL OR expires_at > starts_at),
  CONSTRAINT coupons_usage_limit_positive
    CHECK (usage_limit IS NULL OR usage_limit > 0),
  CONSTRAINT coupons_per_customer_limit_positive
    CHECK (per_customer_limit IS NULL OR per_customer_limit > 0),
  CONSTRAINT coupons_usage_count_non_negative CHECK (usage_count >= 0),
  CONSTRAINT coupons_code_unique_per_store UNIQUE (store_id, code)
);

CREATE INDEX IF NOT EXISTS coupons_store_created_idx ON public.coupons (store_id, created_at DESC);

COMMENT ON TABLE public.coupons IS
  'Merchant-owned discount coupons. code is stored uppercase; uniqueness (store_id, code) makes codes case-insensitive within a store. Anonymous browsers can never read this table — validation happens only via SECURITY DEFINER RPCs.';

-- updated_at trigger (same convention as the rest of the schema)
CREATE TRIGGER trigger_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 2. TABLE: public.coupon_usage
--    One row per successful redemption = audit trail + authoritative usage
--    record. (coupon_id, order_id) UNIQUE makes duplicate redemptions for the
--    same order impossible even under racing submissions.
--    customer_phone_hash = md5(store_id || ':' || normalized phone) — the same
--    trusted server-side identity scheme as checkout_rate_limits. It lets us
--    enforce per-customer limits for anonymous buyers without trusting any
--    browser-supplied customer id.
--    DELETE of a coupon is RESTRICTED while usage rows exist (audit stays);
--    the dashboard only deletes unused coupons.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.coupon_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_phone_hash text NOT NULL,
  discount_amount numeric(12, 2) NOT NULL,
  order_subtotal numeric(12, 2) NOT NULL,
  order_total numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT coupon_usage_discount_positive CHECK (discount_amount > 0),
  CONSTRAINT coupon_usage_phone_hash_not_empty
    CHECK (char_length(customer_phone_hash) = 32),
  CONSTRAINT coupon_usage_unique_per_order UNIQUE (coupon_id, order_id)
);

CREATE INDEX IF NOT EXISTS coupon_usage_coupon_customer_idx
  ON public.coupon_usage (coupon_id, customer_phone_hash);
CREATE INDEX IF NOT EXISTS coupon_usage_coupon_created_idx
  ON public.coupon_usage (coupon_id, created_at DESC);

COMMENT ON TABLE public.coupon_usage IS
  'Audit of every successful coupon redemption. Written exclusively by the SECURITY DEFINER checkout RPC inside the order transaction, so failed checkouts never consume usage.';

-- ==============================================================================
-- 3. ORDERS: additive coupon columns
-- ==============================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12, 2);

COMMENT ON COLUMN public.orders.coupon_code IS
  'Uppercase coupon code applied at checkout, recorded server-side. NULL when no coupon was used.';
COMMENT ON COLUMN public.orders.discount_amount IS
  'Server-computed discount. total = subtotal - discount_amount + shipping_fee. NULL or 0 when no coupon was used.';

-- Backfill defensive default semantics: historical rows keep NULL (no coupon).
-- ==============================================================================
-- 4. RLS on the new tables (merchant-only access; anon gets nothing)
-- ==============================================================================
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usage ENABLE ROW LEVEL SECURITY;

-- LOCK DOWN anon explicitly (defense in depth; no policies are created for it).
REVOKE ALL ON TABLE public.coupons FROM anon;
REVOKE ALL ON TABLE public.coupon_usage FROM anon;
REVOKE ALL ON TABLE public.coupons FROM PUBLIC;
REVOKE ALL ON TABLE public.coupon_usage FROM PUBLIC;

-- --- coupons -------------------------------------------------------------------
DROP POLICY IF EXISTS "Merchants can view their store coupons" ON public.coupons;
CREATE POLICY "Merchants can view their store coupons"
  ON public.coupons
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = coupons.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can create coupons for their stores" ON public.coupons;
CREATE POLICY "Merchants can create coupons for their stores"
  ON public.coupons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = coupons.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can update their store coupons" ON public.coupons;
CREATE POLICY "Merchants can update their store coupons"
  ON public.coupons
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = coupons.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = coupons.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can delete their unused store coupons" ON public.coupons;
CREATE POLICY "Merchants can delete their unused store coupons"
  ON public.coupons
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = coupons.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.coupon_usage u
      WHERE u.coupon_id = coupons.id
    )
  );

-- --- coupon_usage ---------------------------------------------------------------
-- Read-only for merchants (audit visibility). No INSERT/UPDATE/DELETE policies:
-- rows are created exclusively inside the SECURITY DEFINER checkout transaction.
DROP POLICY IF EXISTS "Merchants can view their store coupon usage" ON public.coupon_usage;
CREATE POLICY "Merchants can view their store coupon usage"
  ON public.coupon_usage
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = coupon_usage.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coupons TO authenticated;
GRANT SELECT ON TABLE public.coupon_usage TO authenticated;

-- ==============================================================================
-- 5. PUBLIC COUPON VALIDATION RPC
--    Returns a verdict object (never raw coupon rows). Identity for the
--    per-customer limit comes from a server-normalized phone (optional here;
--    always enforced authoritatively at order time).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.validate_public_coupon(
  p_slug text,
  p_code text,
  p_subtotal numeric,
  p_phone_norm text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text;
  v_code text;
  v_store_id uuid;
  v_coupon record;
  v_discount numeric(12, 2);
  v_phone_hash text;
  v_customer_uses int := 0;
BEGIN
  ------------------------------------------------------------------ inputs ---
  v_slug := btrim(COALESCE(p_slug, ''));
  IF char_length(v_slug) = 0
     OR char_length(v_slug) > 100
     OR v_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Validation error: Invalid store slug' USING ERRCODE = '22023';
  END IF;

  v_code := UPPER(btrim(COALESCE(p_code, '')));
  IF char_length(v_code) < 2
     OR char_length(v_code) > 32
     OR v_code !~ '^[A-Z0-9_-]+$' THEN
    RETURN jsonb_build_object('valid', false, 'error_code', 'NOT_FOUND',
      'message', 'Enter a valid coupon code.');
  END IF;

  IF p_subtotal IS NULL OR p_subtotal < 0 OR p_subtotal > 9999999999.99 THEN
    RAISE EXCEPTION 'Validation error: Invalid subtotal' USING ERRCODE = '22023';
  END IF;

  SELECT s.id INTO v_store_id
  FROM public.stores s
  WHERE s.slug = v_slug
  LIMIT 1;

  IF v_store_id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error_code', 'NOT_FOUND',
      'message', 'Store not found.');
  END IF;

  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE store_id = v_store_id AND code = v_code
  LIMIT 1;

  -- Unknown here == unknown in this store OR belongs to another store.
  -- Never distinguish the two publicly (cross-store enumeration leak).
  IF NOT FOUND OR v_coupon.is_active = false THEN
    RETURN jsonb_build_object('valid', false, 'error_code', 'NOT_FOUND',
      'message', 'This coupon code is not valid for this store.');
  END IF;

  IF v_coupon.starts_at > now() THEN
    RETURN jsonb_build_object('valid', false, 'error_code', 'NOT_STARTED',
      'message', 'This coupon is not active yet.');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at <= now() THEN
    RETURN jsonb_build_object('valid', false, 'error_code', 'EXPIRED',
      'message', 'This coupon has expired.');
  END IF;

  -- Denormalized usage_count is maintained only inside the locked checkout
  -- transaction, so reading it here is a safe, race-free upper bound.
  IF v_coupon.usage_limit IS NOT NULL AND v_coupon.usage_count >= v_coupon.usage_limit THEN
    RETURN jsonb_build_object('valid', false, 'error_code', 'USAGE_LIMIT',
      'message', 'This coupon has reached its usage limit.');
  END IF;

  IF p_phone_norm IS NOT NULL AND btrim(p_phone_norm) <> '' THEN
    v_phone_hash := md5(v_store_id::text || ':' || btrim(p_phone_norm));
    SELECT COUNT(*) INTO v_customer_uses
    FROM public.coupon_usage
    WHERE coupon_id = v_coupon.id
      AND customer_phone_hash = v_phone_hash;

    IF v_coupon.per_customer_limit IS NOT NULL
       AND v_customer_uses >= v_coupon.per_customer_limit THEN
      RETURN jsonb_build_object('valid', false, 'error_code', 'PER_CUSTOMER_LIMIT',
        'message', 'You have already used this coupon the maximum number of times.');
    END IF;
  END IF;

  -- Discount math (identical rules to the checkout RPC)
  IF v_coupon.discount_type = 'percentage' THEN
    v_discount := round(v_coupon.discount_value * p_subtotal / 100.0, 2);
    IF v_coupon.max_discount_amount IS NOT NULL THEN
      v_discount := LEAST(v_discount, round(v_coupon.max_discount_amount, 2));
    END IF;
    v_discount := LEAST(v_discount, p_subtotal);
  ELSE
    v_discount := round(v_coupon.discount_value, 2);
  END IF;

  IF p_subtotal <= 0 OR v_discount > p_subtotal THEN
    RETURN jsonb_build_object('valid', false, 'error_code', 'DISCOUNT_EXCEEDS_SUBTOTAL',
      'message', 'This coupon discount exceeds the eligible order subtotal.');
  END IF;

  -- A percentage discount can round to 0.00 on a tiny subtotal; coupon_usage
  -- requires discount_amount > 0, so reject explicitly instead of failing the
  -- checkout with an opaque constraint violation at order time.
  IF v_discount <= 0 THEN
    RETURN jsonb_build_object('valid', false, 'error_code', 'ZERO_DISCOUNT',
      'message', 'This coupon provides no discount for this order.');
  END IF;

  IF v_coupon.min_order_subtotal IS NOT NULL AND p_subtotal < v_coupon.min_order_subtotal THEN
    RETURN jsonb_build_object('valid', false, 'error_code', 'MIN_SUBTOTAL',
      'message', 'Your order does not reach the minimum required for this coupon.');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'error_code', NULL,
    'message', NULL,
    'code', v_coupon.code,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'discount_amount', v_discount
  );
END;
$$;

-- ==============================================================================
-- 6. CHECKOUT RPC: replace create_public_store_order with the extended version
--    Previous signature (10 args) is dropped; the new one adds the trailing
--    p_coupon_code. Body is identical to migration 0005 except:
--      * coupon lock + full server-side validation + atomic redemption
--      * discount column on orders; new return fields
-- ==============================================================================
DROP FUNCTION IF EXISTS public.create_public_store_order(text, text, text, text, text, text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_public_store_order(
  p_store_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_shipping_address text,
  p_shipping_city text,
  p_shipping_governorate text,
  p_payment_method text,
  p_notes text,
  p_items jsonb,
  p_coupon_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text;
  v_store record;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(12, 2) := 0;
  v_shipping_fee numeric(12, 2) := 0;
  v_discount numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_item jsonb;
  v_prod record;
  v_raw_prod_id text;
  v_parsed_prod_id uuid;
  v_unit_price numeric(12, 2);
  v_raw_qty text;
  v_qty int;
  v_line_total numeric(12, 2);
  v_product_name text;
  v_sku text;
  v_attempts int := 0;
  v_inserted boolean := false;
  v_err_constraint text;
  v_validated_items jsonb := '[]'::jsonb;

  -- Rate limiting locals
  v_rl_identity text;
  v_rl_count integer;
  v_rl_window timestamptz;

  v_phone_norm text;
  v_validated_product_ids uuid[] := ARRAY[]::uuid[];

  -- Coupon locals
  v_coupon_code text;
  v_coupon record;
  v_phone_hash text;
  v_customer_uses int := 0;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Resolve store by validated slug (never trusts client-supplied store IDs)
  ---------------------------------------------------------------------------
  v_slug := btrim(COALESCE(p_store_slug, ''));
  IF char_length(v_slug) = 0
     OR char_length(v_slug) > 100
     OR v_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Validation error: Invalid store slug' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.slug, s.currency, s.shipping_enabled, s.shipping_fee, s.free_shipping_threshold
  INTO v_store
  FROM public.stores s
  WHERE s.slug = v_slug
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found: Store does not exist' USING ERRCODE = '22023';
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Validate textual buyer inputs
  ---------------------------------------------------------------------------
  IF p_customer_name IS NULL OR char_length(btrim(p_customer_name)) = 0 THEN
    RAISE EXCEPTION 'Validation error: Customer name is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(p_customer_name)) > 255 THEN
    RAISE EXCEPTION 'Validation error: Customer name exceeds 255 characters' USING ERRCODE = '22023';
  END IF;

  IF p_customer_phone IS NULL OR char_length(btrim(p_customer_phone)) = 0 THEN
    RAISE EXCEPTION 'Validation error: Customer phone number is required' USING ERRCODE = '22023';
  END IF;
  IF btrim(p_customer_phone) !~ '^[+]?[0-9][0-9 \-()]{4,49}$' THEN
    RAISE EXCEPTION 'Validation error: Customer phone number is not valid' USING ERRCODE = '22023';
  END IF;

  -- Trusted server-side customer identity: only digits/+*, derived from the
  -- validated phone. Never accepted from the browser.
  v_phone_norm := LOWER(regexp_replace(btrim(p_customer_phone), '[^0-9+]', '', 'g'));

  IF p_customer_email IS NOT NULL AND btrim(p_customer_email) <> '' THEN
    IF btrim(p_customer_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       OR char_length(btrim(p_customer_email)) > 255 THEN
      RAISE EXCEPTION 'Validation error: Customer email is not valid' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_shipping_address IS NULL OR char_length(btrim(p_shipping_address)) = 0 THEN
    RAISE EXCEPTION 'Validation error: Shipping address is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(p_shipping_address)) > 500 THEN
    RAISE EXCEPTION 'Validation error: Shipping address exceeds 500 characters' USING ERRCODE = '22023';
  END IF;

  IF p_shipping_city IS NOT NULL AND char_length(btrim(p_shipping_city)) > 100 THEN
    RAISE EXCEPTION 'Validation error: City exceeds 100 characters' USING ERRCODE = '22023';
  END IF;

  IF p_shipping_governorate IS NOT NULL AND char_length(btrim(p_shipping_governorate)) > 100 THEN
    RAISE EXCEPTION 'Validation error: Governorate exceeds 100 characters' USING ERRCODE = '22023';
  END IF;

  IF p_notes IS NOT NULL AND char_length(btrim(p_notes)) > 1000 THEN
    RAISE EXCEPTION 'Validation error: Order notes exceed 1000 characters' USING ERRCODE = '22023';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Payment method must be supported AND enabled for this store
  ---------------------------------------------------------------------------
  IF p_payment_method NOT IN ('Cash on Delivery', 'InstaPay', 'Vodafone Cash', 'Credit / Debit Card') THEN
    RAISE EXCEPTION 'Validation error: Invalid payment method "%"', p_payment_method USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.store_payment_methods m
    WHERE m.store_id = v_store.id
      AND m.method = p_payment_method
      AND m.enabled = true
  ) THEN
    RAISE EXCEPTION 'Payment method "%" is not available for this store', p_payment_method USING ERRCODE = '22023';
  END IF;

  ---------------------------------------------------------------------------
  -- 4. Items must be catalog products of this store (no anonymous manual lines)
  ---------------------------------------------------------------------------
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Validation error: An order must contain at least one item' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Validation error: An order cannot contain more than 50 line items' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_raw_prod_id := btrim(COALESCE(v_item->>'product_id', ''));
    IF v_raw_prod_id = '' THEN
      RAISE EXCEPTION 'Validation error: Every item must reference a store product' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_parsed_prod_id := v_raw_prod_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Validation error: Invalid product reference' USING ERRCODE = '22P02';
    END;

    IF v_parsed_prod_id = ANY (v_validated_product_ids) THEN
      RAISE EXCEPTION 'Validation error: Duplicate products are merged into one line' USING ERRCODE = '22023';
    END IF;

    v_raw_qty := v_item->>'quantity';
    IF v_raw_qty IS NULL OR NOT (v_raw_qty ~ '^[0-9]{1,6}$') THEN
      RAISE EXCEPTION 'Validation error: Item quantity must be a positive integer between 1 and 100,000' USING ERRCODE = '22023';
    END IF;
    v_qty := v_raw_qty::int;
    IF v_qty <= 0 OR v_qty > 100000 THEN
      RAISE EXCEPTION 'Validation error: Item quantity must be between 1 and 100,000' USING ERRCODE = '22023';
    END IF;

    SELECT id, name, name_ar, name_en, sku, price, stock, status
    INTO v_prod
    FROM public.products
    WHERE id = v_parsed_prod_id AND store_id = v_store.id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product does not belong to this store or does not exist' USING ERRCODE = '23503';
    END IF;

    IF v_prod.status <> 'Active' THEN
      RAISE EXCEPTION 'Product "%" is not available for purchase', v_prod.name USING ERRCODE = '22023';
    END IF;

    IF v_qty > v_prod.stock THEN
      RAISE EXCEPTION 'Only % unit(s) of "%" are available in stock', v_prod.stock, v_prod.name USING ERRCODE = '22023';
    END IF;

    v_unit_price := round(v_prod.price, 2);
    v_product_name := COALESCE(NULLIF(btrim(v_prod.name), ''), NULLIF(btrim(v_prod.name_ar), ''), v_prod.name_en, 'Product');
    v_sku := NULLIF(btrim(v_prod.sku), '');

    v_line_total := round(v_unit_price * v_qty, 2);
    IF v_line_total > 9999999999.99 THEN
      RAISE EXCEPTION 'Validation error: Line total exceeds maximum currency precision' USING ERRCODE = '22003';
    END IF;

    v_subtotal := v_subtotal + v_line_total;
    IF v_subtotal > 9999999999.99 THEN
      RAISE EXCEPTION 'Validation error: Order subtotal exceeds maximum currency precision' USING ERRCODE = '22003';
    END IF;

    v_validated_items := v_validated_items || jsonb_build_object(
      'product_id', v_parsed_prod_id,
      'product_name', v_product_name,
      'sku', v_sku,
      'unit_price', v_unit_price,
      'quantity', v_qty,
      'line_total', v_line_total
    );
    v_validated_product_ids := array_append(v_validated_product_ids, v_parsed_prod_id);
  END LOOP;

  ---------------------------------------------------------------------------
  -- 5. Shipping: computed ONLY from the store's saved settings (pre-discount)
  ---------------------------------------------------------------------------
  IF NOT v_store.shipping_enabled THEN
    v_shipping_fee := 0;
  ELSIF v_store.free_shipping_threshold IS NOT NULL AND v_subtotal >= v_store.free_shipping_threshold THEN
    v_shipping_fee := 0;
  ELSE
    v_shipping_fee := round(v_store.shipping_fee, 2);
  END IF;

  ---------------------------------------------------------------------------
  -- 6. DB-backed rate limiting: max 5 orders per phone per store per 10 minutes
  ---------------------------------------------------------------------------
  v_rl_identity := md5(v_phone_norm || ':' || v_store.slug);

  INSERT INTO public.checkout_rate_limits (identity)
  VALUES (v_rl_identity)
  ON CONFLICT (identity) DO UPDATE SET
    window_started_at = CASE
      WHEN public.checkout_rate_limits.window_started_at < now() - interval '10 minutes'
      THEN now()
      ELSE public.checkout_rate_limits.window_started_at
    END,
    order_count = CASE
      WHEN public.checkout_rate_limits.window_started_at < now() - interval '10 minutes'
      THEN 1
      ELSE public.checkout_rate_limits.order_count + 1
    END,
    updated_at = now()
  RETURNING order_count, window_started_at INTO v_rl_count, v_rl_window;

  IF v_rl_count > 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded for this phone number. Please try again in a few minutes.'
      USING ERRCODE = '22023';
  END IF;

  ---------------------------------------------------------------------------
  -- 7. COUPON REDEMPTION (all server-side; code string is the only client input)
  --    FOR UPDATE serializes concurrent checkouts on the coupon row, making
  --    total & per-customer limits exact. Any failure here aborts the whole
  --    transaction — usage is never consumed by a failed order.
  ---------------------------------------------------------------------------
  v_coupon_code := UPPER(NULLIF(btrim(COALESCE(p_coupon_code, '')), ''));
  IF v_coupon_code IS NOT NULL THEN
    IF char_length(v_coupon_code) < 2
       OR char_length(v_coupon_code) > 32
       OR v_coupon_code !~ '^[A-Z0-9_-]+$' THEN
      RAISE EXCEPTION 'Validation error: Invalid coupon code' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE store_id = v_store.id AND code = v_coupon_code
    FOR UPDATE;

    IF NOT FOUND OR v_coupon.is_active = false THEN
      RAISE EXCEPTION 'Coupon "%" is not valid for this store', v_coupon_code USING ERRCODE = '22023';
    END IF;

    IF v_coupon.starts_at > now() THEN
      RAISE EXCEPTION 'Coupon "%" is not active yet', v_coupon_code USING ERRCODE = '22023';
    END IF;

    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at <= now() THEN
      RAISE EXCEPTION 'Coupon "%" has expired', v_coupon_code USING ERRCODE = '22023';
    END IF;

    IF v_coupon.usage_limit IS NOT NULL AND v_coupon.usage_count >= v_coupon.usage_limit THEN
      RAISE EXCEPTION 'Coupon "%" has reached its usage limit', v_coupon_code USING ERRCODE = '22023';
    END IF;

    -- Per-customer limit via the SAME trusted identity used by rate limiting.
    v_phone_hash := md5(v_store.id::text || ':' || v_phone_norm);
    SELECT COUNT(*) INTO v_customer_uses
    FROM public.coupon_usage
    WHERE coupon_id = v_coupon.id
      AND customer_phone_hash = v_phone_hash;

    IF v_coupon.per_customer_limit IS NOT NULL
       AND v_customer_uses >= v_coupon.per_customer_limit THEN
      RAISE EXCEPTION 'Coupon "%" has already been used the maximum number of times for this customer', v_coupon_code USING ERRCODE = '22023';
    END IF;

    IF v_coupon.min_order_subtotal IS NOT NULL AND v_subtotal < v_coupon.min_order_subtotal THEN
      RAISE EXCEPTION 'Your order of % does not reach the minimum subtotal required by coupon "%"', v_subtotal, v_coupon_code USING ERRCODE = '22023';
    END IF;

    -- Discount: computed from the validated catalog subtotal; can never exceed it
    IF v_coupon.discount_type = 'percentage' THEN
      v_discount := round(v_coupon.discount_value * v_subtotal / 100.0, 2);
      IF v_coupon.max_discount_amount IS NOT NULL THEN
        v_discount := LEAST(v_discount, round(v_coupon.max_discount_amount, 2));
      END IF;
      v_discount := LEAST(v_discount, v_subtotal);
    ELSE
      v_discount := round(v_coupon.discount_value, 2);
      IF v_discount > v_subtotal THEN
        RAISE EXCEPTION 'Coupon discount exceeds the eligible order subtotal' USING ERRCODE = '22023';
      END IF;
    END IF;

    -- A percentage discount can round to 0.00 on a tiny subtotal; coupon_usage
    -- requires discount_amount > 0, so reject explicitly instead of failing
    -- the checkout with an opaque constraint violation.
    IF v_discount <= 0 THEN
      RAISE EXCEPTION 'Coupon "%" provides no discount for this order', v_coupon_code USING ERRCODE = '22023';
    END IF;
  END IF;

  v_total := v_subtotal - v_discount + v_shipping_fee;
  IF v_total > 9999999999.99 THEN
    RAISE EXCEPTION 'Validation error: Order total exceeds maximum currency precision' USING ERRCODE = '22003';
  END IF;

  ---------------------------------------------------------------------------
  -- 8. Atomic customer directory upsert with aggregates
  ---------------------------------------------------------------------------
  INSERT INTO public.customers (
    store_id,
    name,
    phone,
    email,
    address,
    city,
    governorate,
    total_orders,
    total_spent
  ) VALUES (
    v_store.id,
    btrim(p_customer_name),
    btrim(p_customer_phone),
    NULLIF(btrim(COALESCE(p_customer_email, '')), ''),
    btrim(p_shipping_address),
    COALESCE(btrim(COALESCE(p_shipping_city, '')), ''),
    COALESCE(btrim(COALESCE(p_shipping_governorate, '')), ''),
    1,
    v_total
  )
  ON CONFLICT (store_id, phone) DO UPDATE
  SET total_orders = public.customers.total_orders + 1,
      total_spent = round(public.customers.total_spent + EXCLUDED.total_spent, 2),
      name = CASE WHEN btrim(EXCLUDED.name) <> '' THEN btrim(EXCLUDED.name) ELSE public.customers.name END,
      email = COALESCE(EXCLUDED.email, public.customers.email),
      address = CASE WHEN btrim(EXCLUDED.address) <> '' THEN btrim(EXCLUDED.address) ELSE public.customers.address END,
      city = CASE WHEN btrim(EXCLUDED.city) <> '' THEN btrim(EXCLUDED.city) ELSE public.customers.city END,
      governorate = CASE WHEN btrim(EXCLUDED.governorate) <> '' THEN btrim(EXCLUDED.governorate) ELSE public.customers.governorate END,
      updated_at = now()
  RETURNING id INTO v_customer_id;

  ---------------------------------------------------------------------------
  -- 9. Collision-resistant order number generation with coupon fields
  ---------------------------------------------------------------------------
  WHILE NOT v_inserted AND v_attempts < 5 LOOP
    v_attempts := v_attempts + 1;
    v_order_number := 'ORD-' || to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYYMMDD') || '-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));

    BEGIN
      INSERT INTO public.orders (
        store_id,
        customer_id,
        order_number,
        customer_name,
        customer_email,
        customer_phone,
        shipping_address,
        shipping_city,
        shipping_governorate,
        status,
        payment_status,
        payment_method,
        currency,
        subtotal,
        discount_amount,
        coupon_code,
        shipping_fee,
        total,
        notes
      ) VALUES (
        v_store.id,
        v_customer_id,
        v_order_number,
        btrim(p_customer_name),
        NULLIF(btrim(COALESCE(p_customer_email, '')), ''),
        btrim(p_customer_phone),
        btrim(p_shipping_address),
        COALESCE(btrim(COALESCE(p_shipping_city, '')), ''),
        COALESCE(btrim(COALESCE(p_shipping_governorate, '')), ''),
        'Pending',
        'Unpaid',
        p_payment_method,
        v_store.currency,
        v_subtotal,
        CASE WHEN v_coupon_code IS NULL THEN NULL ELSE v_discount END,
        v_coupon_code,
        v_shipping_fee,
        v_total,
        COALESCE(btrim(COALESCE(p_notes, '')), '')
      ) RETURNING id INTO v_order_id;

      v_inserted := true;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_err_constraint = CONSTRAINT_NAME;
      IF v_err_constraint = 'orders_order_number_unique' THEN
        IF v_attempts >= 5 THEN
          RAISE EXCEPTION 'Failed to allocate unique order number after 5 attempts' USING ERRCODE = '23505';
        END IF;
      ELSE
        RAISE;
      END IF;
    END;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 10. Insert order item snapshots
  ---------------------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_validated_items) LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_name,
      sku,
      unit_price,
      quantity,
      line_total
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      v_item->>'sku',
      (v_item->>'unit_price')::numeric,
      (v_item->>'quantity')::int,
      (v_item->>'line_total')::numeric
    );
  END LOOP;

  ---------------------------------------------------------------------------
  -- 11. Record coupon usage INSIDE the same transaction (audit + limits).
  --     The FOR UPDATE lock on the coupon row (taken above) guarantees the
  --     usage_count increment and uniqueness constraint cannot race.
  ---------------------------------------------------------------------------
  IF v_coupon_code IS NOT NULL THEN
    INSERT INTO public.coupon_usage (
      coupon_id,
      store_id,
      order_id,
      customer_id,
      customer_phone_hash,
      discount_amount,
      order_subtotal,
      order_total
    ) VALUES (
      v_coupon.id,
      v_store.id,
      v_order_id,
      v_customer_id,
      v_phone_hash,
      v_discount,
      v_subtotal,
      v_total
    );

    UPDATE public.coupons
    SET usage_count = usage_count + 1
    WHERE id = v_coupon.id;
  END IF;

  ---------------------------------------------------------------------------
  -- 12. Return result payload
  ---------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'customer_id', v_customer_id,
    'subtotal', v_subtotal,
    'discount_amount', v_discount,
    'coupon_code', v_coupon_code,
    'shipping_fee', v_shipping_fee,
    'total', v_total,
    'currency', v_store.currency,
    'status', 'Pending',
    'payment_status', 'Unpaid',
    'payment_method', p_payment_method
  );
END;
$$;

-- ==============================================================================
-- 7. FUNCTION PRIVILEGES
-- ==============================================================================
REVOKE ALL ON FUNCTION public.validate_public_coupon(text, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_public_coupon(text, text, numeric, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.create_public_store_order(text, text, text, text, text, text, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_store_order(text, text, text, text, text, text, text, text, text, jsonb, text) TO anon, authenticated;

COMMENT ON FUNCTION public.validate_public_coupon IS
  'Safe pre-checkout coupon verdict for one validated code in one validated store. Never exposes coupon table data or cross-store existence; per-customer checks use the server-normalized phone identity. SECURITY DEFINER; fixed search_path; table RLS untouched.';
COMMENT ON FUNCTION public.create_public_store_order IS
  'Hardened anonymous checkout with optional coupon redemption: catalog-priced items, settings-derived shipping, server-computed discount under FOR UPDATE lock, atomic usage recording, DB-backed rate limiting.';
