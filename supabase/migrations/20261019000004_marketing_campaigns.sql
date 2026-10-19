-- ==============================================================================
-- KLYVO MARKETING CAMPAIGNS
-- Migration: 20261019000004_marketing_campaigns.sql
-- Description:
--   1. public.marketing_campaigns — campaign metadata linked to an EXISTING
--      coupon (no second discount engine).
--   2. public.campaign_visits    — deduplicated tracked-link visits.
--   3. public.campaign_orders    — orders attributed to a campaign, one row per
--      order, revenue copied from the authoritative order row.
--   4. record_campaign_visit(...) / record_campaign_order(...) — narrowly scoped
--      SECURITY DEFINER RPCs for anonymous storefront traffic.
--
--   Measurement semantics (measured, never estimated):
--     - A "visit" is one unique browser token that loaded a campaign link while
--       the campaign was active. Repeated loads by the same token do not count.
--       No IP address, user agent, or personal data is stored.
--     - An "attributed order" is an order the buyer's browser reported for the
--       campaign token AFTER the order transaction committed. The RPC verifies
--       the order belongs to the campaign's store, was created inside the
--       campaign window and within the last 30 minutes, and has not already been
--       attributed (UNIQUE order_id). Revenue comes from orders.total, never
--       from the client.
--     - This is same-browser session attribution, not click-ID cross-device
--       tracking; the dashboard labels it as such.
--
--   Delivery:
--     - No email/SMS/WhatsApp/ads integration is implemented or claimed.
--       Campaigns generate shareable tracked links only.
--
--   Security:
--     - RLS: merchant owns campaign CRUD; visit/order measurement rows are
--       read-only to the merchant. anon writes exclusively through the RPCs.
--     - Coupons remain the only discount system; campaigns only reference them.
--
--   Additive; no previously applied migration file is modified.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  name text NOT NULL,
  token text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  product_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT marketing_campaigns_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT marketing_campaigns_token_format CHECK (token ~ '^[A-Za-z0-9_-]{16,64}$'),
  CONSTRAINT marketing_campaigns_status_allowed CHECK (status IN ('draft', 'active', 'paused')),
  CONSTRAINT marketing_campaigns_ends_after_starts CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT marketing_campaigns_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS marketing_campaigns_store_created_idx
  ON public.marketing_campaigns (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_campaigns_store_status_idx
  ON public.marketing_campaigns (store_id, status);

CREATE TABLE IF NOT EXISTS public.campaign_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  visitor_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT campaign_visits_visitor_key_format CHECK (visitor_key ~ '^[0-9a-f]{32}$'),
  CONSTRAINT campaign_visits_unique_visitor UNIQUE (campaign_id, visitor_key)
);

CREATE INDEX IF NOT EXISTS campaign_visits_campaign_created_idx
  ON public.campaign_visits (campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.campaign_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  revenue numeric(12, 2) NOT NULL DEFAULT 0,
  discount_amount numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT campaign_orders_revenue_non_negative CHECK (revenue >= 0),
  CONSTRAINT campaign_orders_discount_non_negative CHECK (discount_amount >= 0),
  CONSTRAINT campaign_orders_unique_order UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS campaign_orders_campaign_created_idx
  ON public.campaign_orders (campaign_id, created_at DESC);

COMMENT ON TABLE public.marketing_campaigns IS
  'Merchant marketing campaigns linked to an existing coupon. Campaigns never create a second discount engine and do not deliver messages through any external channel.';
COMMENT ON TABLE public.campaign_visits IS
  'Unique tracked-link visitors per campaign (md5 visitor token, no personal data). Measured, not estimated.';
COMMENT ON TABLE public.campaign_orders IS
  'Orders attributed to a campaign after server-side verification. One row per order; revenue copied from orders.total.';

-- Reject product selections that do not belong to the campaign store.
CREATE OR REPLACE FUNCTION public.validate_campaign_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invalid uuid;
BEGIN
  IF NEW.product_ids IS NULL OR cardinality(NEW.product_ids) = 0 THEN
    NEW.product_ids := ARRAY[]::uuid[];
    RETURN NEW;
  END IF;

  IF cardinality(NEW.product_ids) > 200 THEN
    RAISE EXCEPTION 'A campaign cannot select more than 200 products' USING ERRCODE = '22023';
  END IF;

  SELECT x INTO v_invalid
  FROM unnest(NEW.product_ids) AS x
  LEFT JOIN public.products p ON p.id = x AND p.store_id = NEW.store_id
  WHERE p.id IS NULL
  LIMIT 1;

  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'Campaign product % does not belong to this store', v_invalid USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_marketing_campaigns_validate_products ON public.marketing_campaigns;
CREATE TRIGGER trigger_marketing_campaigns_validate_products
  BEFORE INSERT OR UPDATE ON public.marketing_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_campaign_products();

DROP TRIGGER IF EXISTS trigger_marketing_campaigns_updated_at ON public.marketing_campaigns;
CREATE TRIGGER trigger_marketing_campaigns_updated_at
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- RLS
-- ==============================================================================
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.marketing_campaigns FROM anon;
REVOKE ALL ON TABLE public.campaign_visits FROM anon;
REVOKE ALL ON TABLE public.campaign_orders FROM anon;
REVOKE ALL ON TABLE public.marketing_campaigns FROM PUBLIC;
REVOKE ALL ON TABLE public.campaign_visits FROM PUBLIC;
REVOKE ALL ON TABLE public.campaign_orders FROM PUBLIC;

DROP POLICY IF EXISTS "Merchants can view their campaigns" ON public.marketing_campaigns;
CREATE POLICY "Merchants can view their campaigns"
  ON public.marketing_campaigns FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = marketing_campaigns.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can create their campaigns" ON public.marketing_campaigns;
CREATE POLICY "Merchants can create their campaigns"
  ON public.marketing_campaigns FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = marketing_campaigns.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can update their campaigns" ON public.marketing_campaigns;
CREATE POLICY "Merchants can update their campaigns"
  ON public.marketing_campaigns FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = marketing_campaigns.store_id AND s.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = marketing_campaigns.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can delete their campaigns" ON public.marketing_campaigns;
CREATE POLICY "Merchants can delete their campaigns"
  ON public.marketing_campaigns FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = marketing_campaigns.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can view their campaign visits" ON public.campaign_visits;
CREATE POLICY "Merchants can view their campaign visits"
  ON public.campaign_visits FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = campaign_visits.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can view their attributed campaign orders" ON public.campaign_orders;
CREATE POLICY "Merchants can view their attributed campaign orders"
  ON public.campaign_orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = campaign_orders.store_id AND s.owner_id = (SELECT auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketing_campaigns TO authenticated;
GRANT SELECT ON TABLE public.campaign_visits TO authenticated;
GRANT SELECT ON TABLE public.campaign_orders TO authenticated;

-- ==============================================================================
-- PUBLIC: RECORD A TRACKED CAMPAIGN VISIT
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.record_campaign_visit(
  p_slug text,
  p_token text,
  p_visitor_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text;
  v_token text;
  v_visitor text;
  v_campaign record;
  v_coupon_code text;
  v_visitor_key text;
  v_inserted boolean := false;
BEGIN
  v_slug := btrim(COALESCE(p_slug, ''));
  IF char_length(v_slug) = 0 OR char_length(v_slug) > 100 OR v_slug !~ '^[a-z0-9-]+$' THEN
    RETURN jsonb_build_object('valid', false, 'error_code', 'INVALID_STORE');
  END IF;

  v_token := btrim(COALESCE(p_token, ''));
  IF v_token !~ '^[A-Za-z0-9_-]{16,64}$' THEN
    RETURN jsonb_build_object('valid', false, 'error_code', 'INVALID_CAMPAIGN');
  END IF;

  v_visitor := btrim(COALESCE(p_visitor_token, ''));
  IF char_length(v_visitor) < 16 OR char_length(v_visitor) > 128 OR v_visitor !~ '^[A-Za-z0-9_-]+$' THEN
    RETURN jsonb_build_object('valid', false, 'error_code', 'INVALID_VISITOR');
  END IF;

  SELECT c.id, c.store_id, c.name, c.status, c.starts_at, c.ends_at, cp.code
  INTO v_campaign
  FROM public.marketing_campaigns c
  JOIN public.stores s ON s.id = c.store_id
  JOIN public.coupons cp ON cp.id = c.coupon_id
  WHERE s.slug = v_slug
    AND c.token = v_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error_code', 'CAMPAIGN_NOT_FOUND');
  END IF;

  IF v_campaign.status <> 'active'
     OR v_campaign.starts_at > now()
     OR (v_campaign.ends_at IS NOT NULL AND v_campaign.ends_at <= now()) THEN
    RETURN jsonb_build_object('valid', false, 'error_code', 'CAMPAIGN_INACTIVE');
  END IF;

  v_coupon_code := v_campaign.code;
  v_visitor_key := md5(v_campaign.id::text || ':' || v_visitor);

  INSERT INTO public.campaign_visits (campaign_id, store_id, visitor_key)
  VALUES (v_campaign.id, v_campaign.store_id, v_visitor_key)
  ON CONFLICT (campaign_id, visitor_key) DO NOTHING;

  v_inserted := FOUND;

  RETURN jsonb_build_object(
    'valid', true,
    'campaign_id', v_campaign.id,
    'campaign_name', v_campaign.name,
    'coupon_code', v_coupon_code,
    'already_counted', NOT v_inserted
  );
END;
$$;

-- ==============================================================================
-- PUBLIC: ATTRIBUTE AN ORDER TO A CAMPAIGN (verified, idempotent)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.record_campaign_order(
  p_token text,
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text;
  v_campaign record;
  v_order record;
BEGIN
  v_token := btrim(COALESCE(p_token, ''));
  IF v_token !~ '^[A-Za-z0-9_-]{16,64}$' OR p_order_id IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'error_code', 'INVALID_INPUT');
  END IF;

  SELECT c.id, c.store_id, c.status, c.starts_at, c.ends_at
  INTO v_campaign
  FROM public.marketing_campaigns c
  WHERE c.token = v_token
  LIMIT 1;

  IF NOT FOUND OR v_campaign.status <> 'active' THEN
    RETURN jsonb_build_object('attributed', false, 'error_code', 'CAMPAIGN_INACTIVE');
  END IF;

  SELECT o.id, o.store_id, o.total, COALESCE(o.discount_amount, 0) AS discount_amount, o.created_at
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.store_id = v_campaign.store_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('attributed', false, 'error_code', 'ORDER_NOT_FOUND');
  END IF;

  -- Only orders created inside the campaign window and reported promptly are
  -- attributable. This blocks arbitrary historical-order injection.
  IF v_order.created_at < v_campaign.starts_at
     OR (v_campaign.ends_at IS NOT NULL AND v_order.created_at > v_campaign.ends_at)
     OR v_order.created_at < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('attributed', false, 'error_code', 'ORDER_OUT_OF_WINDOW');
  END IF;

  IF EXISTS (SELECT 1 FROM public.campaign_orders co WHERE co.order_id = v_order.id) THEN
    RETURN jsonb_build_object('attributed', false, 'error_code', 'ALREADY_ATTRIBUTED');
  END IF;

  BEGIN
    INSERT INTO public.campaign_orders (campaign_id, store_id, order_id, revenue, discount_amount)
    VALUES (v_campaign.id, v_campaign.store_id, v_order.id, v_order.total, v_order.discount_amount);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('attributed', false, 'error_code', 'ALREADY_ATTRIBUTED');
  END;

  RETURN jsonb_build_object(
    'attributed', true,
    'campaign_id', v_campaign.id,
    'order_id', v_order.id,
    'revenue', v_order.total,
    'discount_amount', v_order.discount_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_campaign_visit(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_campaign_visit(text, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.record_campaign_order(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_campaign_order(text, uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.record_campaign_visit IS
  'Deduplicated tracked-link visit for one validated active campaign. Stores only an md5 visitor token. Returns the linked coupon code so the storefront can offer it.';
COMMENT ON FUNCTION public.record_campaign_order IS
  'Verifies and records a measured campaign→order attribution with revenue copied from the order. Idempotent via UNIQUE(order_id).';
