-- ########## FILE: 20261018000000_analytics_carts_loyalty.sql ##########
-- ==============================================================================
-- KLYVO: STORE ANALYTICS + ABANDONED CARTS + LOYALTY POINTS
-- Migration: 20261018000000_analytics_carts_loyalty.sql
-- Description (additive only; no previously applied migration is modified):
--
--   FEATURE A — Store Analytics (read-only, owner-verified RPC):
--     * get_store_sales_analytics(p_from_date, p_to_date)
--       All totals are computed from real public.orders rows for the caller's
--       own store (owner_id = auth.uid()). Day boundaries use the store's own
--       timezone. Cancelled orders are excluded from sales; collected revenue
--       counts only payment_status = 'Paid' rows. No customer PII is returned.
--
--   FEATURE B — Abandoned Carts (anonymous-browser cart lifecycle):
--     * public.carts                 — one row per synced storefront browser
--       cart, keyed by (store_id, SHA-256 token hash). The browser-only token
--       is high-entropy random; ONLY its hash is stored. Items are stored as
--       catalog product references; prices/values are always derived from the
--       current catalog server-side (never client-supplied).
--     * public.abandoned_cart_settings — per-store tracking config
--       (inactivity threshold). Abandoned status converges lazily on read:
--       the merchant-facing list RPC promotes idle active carts, so lifecycle
--       accounting stays correct even with no scheduled job configured.
--     * sync_public_cart(...)        — anonymous cart up/sync (validated)
--     * restore_public_cart(...)     — token-scoped cart restore for recovery
--     * complete_public_cart(...)    — idempotent conversion marking; verifies
--       the order really belongs to the cart's store before marking.
--     * get_store_abandoned_carts(...) — merchant-only listing + real stats.
--
--   FEATURE C — Loyalty Points (audited ledger, merchant actions only):
--     * public.loyalty_settings      — per-store program config. Defaults keep
--       the program DISABLED and REDEMPTION DISABLED so checkout behavior
--       cannot change until the merchant explicitly enables earning.
--     * public.customer_loyalty      — derived balance (never negative).
--     * public.loyalty_ledger        — append-only audited entries
--       (earn / reverse / adjust) with unique idempotency keys; duplicates
--       from retries or repeated status transitions are impossible.
--     * award_order_loyalty_points / reverse_order_loyalty_points — called
--       server-side from the merchant's order status workflow. Earning
--       requires payment_status = 'Paid' on a non-cancelled order.
--     * adjust_customer_loyalty_points — audited administrative adjustment
--       with a non-negative balance guarantee (row-locked, transactional).
--     * get_store_loyalty_overview / get_customer_loyalty_ledger — owner-only
--       reads. Ledger rows themselves have NO insert/update/delete policies:
--       they can only be written inside the SECURITY DEFINER functions.
--
--   Redemptions at public checkout are intentionally NOT wired: guest checkout
--   has no verified customer identity, so redemption_enabled stays read-only
--   until a real identity mechanism exists. Earning + ledger + settings are
--   fully live. No fake metrics, no fabricated data.
--
--   Security model (same conventions as migrations 0000-0005 + coupons):
--     - New tables are RLS-locked; anon/PUBLIC get NOTHING.
--     - All functions are SECURITY DEFINER with SET search_path = public, pg_temp.
--     - Merchant functions verify store ownership via auth.uid() inside the
--       function body (RLS is bypassed by definer, so verification is explicit).
--     - Public functions strictly validate every input and only ever expose
--       catalog-safe projections. Tokens are stored hashed (sha256, built-in).
-- ==============================================================================

-- ==============================================================================
-- 1A. STORE ANALYTICS RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_store_sales_analytics(
  p_from_date date,
  p_to_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_store record;
  v_tz text;
  v_from date;
  v_to date;
  v_stats record;
  v_sales_series jsonb;
  v_best_sellers jsonb;
BEGIN
  ------------------------------------------------------------------ guards ---
  -- Exactly one store is resolved for the authenticated merchant (same order
  -- as the app's getAuthorizedStore), so no cross-store data can be touched.
  SELECT s.id, s.name, s.slug, s.currency, s.timezone
  INTO v_store
  FROM public.stores s
  WHERE s.owner_id = (SELECT auth.uid())
  ORDER BY s.created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: No store context for current merchant' USING ERRCODE = '42501';
  END IF;

  IF p_from_date IS NULL OR p_to_date IS NULL THEN
    RAISE EXCEPTION 'Validation error: Date range is required' USING ERRCODE = '22023';
  END IF;

  v_from := date_trunc('day', p_from_date)::date;
  v_to := date_trunc('day', p_to_date)::date;
  IF v_from > v_to THEN
    RAISE EXCEPTION 'Validation error: Range start must not be after range end' USING ERRCODE = '22023';
  END IF;

  -- Bounded range: at most 366 days.
  IF (v_to - v_from) > 366 THEN
    RAISE EXCEPTION 'Validation error: Date range is limited to 366 days' USING ERRCODE = '22023';
  END IF;

  v_tz := COALESCE(NULLIF(btrim(COALESCE(v_store.timezone, '')), ''), 'UTC');

  -- Defensive: an invalid stored tz string breaks AT TIME ZONE, so validate it
  -- against the live IANA list and fall back to UTC when unknown.
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    v_tz := 'UTC';
  END IF;

  ------------------------------------------------------------------ stats ---
  -- Calculation contract (labels match the dashboard):
  --   gross_sales      = SUM(subtotal) of NON-CANCELLED orders (merchandise,
  --                      BEFORE any coupon discount). Not profit.
  --   collected_sales  = SUM(total) of payment_status = 'Paid' AND not
  --                      refunded. (Paid money actually taken.)
  --   average_order     = gross_sales / COUNT(non-cancelled orders).
  --   completed_*      = status = 'Delivered'.
  --   open_orders      = Pending + Processing + Shipped.
  --   outstanding_*    = non-cancelled unpaid value (payment_status <> 'Paid').
  --   refunded_value   = payment_status = 'Refunded'.
  --   discount/shipping = their columns on non-cancelled orders.
  SELECT
    COALESCE(SUM(o.subtotal) FILTER (WHERE o.status <> 'Cancelled'), 0)::numeric AS gross_sales,
    COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'Paid'), 0)::numeric AS collected_sales,
    COALESCE(COUNT(*) FILTER (WHERE o.status <> 'Cancelled'), 0)::int AS live_orders,
    COALESCE(COUNT(*), 0)::int AS total_orders,
    COALESCE(COUNT(*) FILTER (WHERE o.status = 'Cancelled'), 0)::int AS cancelled_orders,
    COALESCE(COUNT(*) FILTER (WHERE o.status = 'Delivered'), 0)::int AS completed_orders,
    COALESCE(SUM(o.total) FILTER (WHERE o.status = 'Delivered'), 0)::numeric AS completed_sales,
    COALESCE(COUNT(*) FILTER (WHERE o.status IN ('Pending', 'Processing', 'Shipped')), 0)::int AS open_orders,
    COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'Cancelled' AND o.payment_status <> 'Paid'), 0)::numeric AS outstanding_value,
    COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'Refunded'), 0)::numeric AS refunded_value,
    COALESCE(SUM(COALESCE(o.discount_amount, 0)) FILTER (WHERE o.status <> 'Cancelled'), 0)::numeric AS discount_value,
    COALESCE(SUM(o.shipping_fee) FILTER (WHERE o.status <> 'Cancelled'), 0)::numeric AS shipping_value
  INTO v_stats
  FROM public.orders o
  WHERE o.store_id = v_store.id
    AND (o.created_at AT TIME ZONE v_tz)::date BETWEEN v_from AND v_to;

  ------------------------------------------------------------ timeseries ---
  SELECT jsonb_agg(x ORDER BY x.day)::jsonb
  INTO v_sales_series
  FROM (
    SELECT
      d.day,
      COALESCE(pd.orders, 0) AS orders,
      COALESCE(pd.sales, 0)::numeric AS sales
    FROM (SELECT gs::date AS day FROM generate_series(v_from::timestamp, v_to::timestamp, '1 day'::interval) AS gs) AS d
    LEFT JOIN (
      SELECT
        (o.created_at AT TIME ZONE v_tz)::date AS day,
        COUNT(*)::int AS orders,
        COALESCE(SUM(CASE WHEN o.status <> 'Cancelled' THEN o.subtotal ELSE 0 END), 0)::numeric AS sales
      FROM public.orders o
      WHERE o.store_id = v_store.id
        AND (o.created_at AT TIME ZONE v_tz)::date BETWEEN v_from AND v_to
      GROUP BY 1
    ) pd ON pd.day = d.day
  ) x;

  ------------------------------------------------------------ best sellers ---
  -- Real order_items snapshots for non-cancelled orders; grouped by the stored
  -- product name so deleted/renamed products still report truthfully.
  SELECT COALESCE(jsonb_agg(x ORDER BY x.units DESC, x.orders DESC), '[]'::jsonb)::jsonb
  INTO v_best_sellers
  FROM (
    SELECT
      oi.product_name AS name,
      SUM(oi.quantity)::int AS units,
      COUNT(DISTINCT o.id)::int AS orders
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.store_id = v_store.id
      AND o.status <> 'Cancelled'
      AND (o.created_at AT TIME ZONE v_tz)::date BETWEEN v_from AND v_to
    GROUP BY oi.product_name
    ORDER BY units DESC, orders DESC
    LIMIT 8
  ) x;

  ------------------------------------------------------------ recent orders ---
  RETURN jsonb_build_object(
    'store', jsonb_build_object(
      'name', v_store.name,
      'slug', v_store.slug,
      'currency', v_store.currency,
      'timezone', v_tz
    ),
    'stats', jsonb_build_object(
      'gross_sales', round(v_stats.gross_sales, 2),
      'collected_sales', round(v_stats.collected_sales, 2),
      'average_order_value',
        CASE WHEN v_stats.live_orders > 0
             THEN round(v_stats.gross_sales / v_stats.live_orders, 2)
             ELSE 0 END,
      'total_orders', v_stats.total_orders,
      'cancelled_orders', v_stats.cancelled_orders,
      'completed_orders', v_stats.completed_orders,
      'completed_sales', round(v_stats.completed_sales, 2),
      'open_orders', v_stats.open_orders,
      'outstanding_value', round(v_stats.outstanding_value, 2),
      'refunded_value', round(v_stats.refunded_value, 2),
      'discount_value', round(v_stats.discount_value, 2),
      'shipping_value', round(v_stats.shipping_value, 2)
    ),
    'timeseries', v_sales_series,
    'best_sellers', v_best_sellers,
    'recent_orders', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb)::jsonb
      FROM (
        SELECT
          o.order_number,
          o.status,
          o.payment_status,
          o.currency,
          round(o.total, 2) AS total,
          o.created_at
        FROM public.orders o
        WHERE o.store_id = v_store.id
          AND (o.created_at AT TIME ZONE v_tz)::date BETWEEN v_from AND v_to
        ORDER BY o.created_at DESC
        LIMIT 10
      ) x
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_store_sales_analytics(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_sales_analytics(date, date) TO authenticated;

COMMENT ON FUNCTION public.get_store_sales_analytics(date, date) IS
  'Tenant-isolated sales analytics for the merchant''s own store over an inclusive date range in the store''s timezone. Cancelled orders excluded from sales; collected = payment_status Paid. No customer PII returned. SECURITY DEFINER with fixed search_path.';

-- ==============================================================================
-- 1B. TABLES: public.carts + public.abandoned_cart_settings
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  -- sha256 (hex, 64 chars) of the browser-held high-entropy token. The raw
  -- token NEVER leaves the customer's browser; only its hash is stored.
  token_hash text NOT NULL,
  -- lifecycle: 'active' -> 'abandoned' (idle) -> 'converted' (resulted in an
  -- order). 'active' again if a previously-abandoned cart resumes activity.
  status text NOT NULL DEFAULT 'active',
  -- Catalog references synced from the browser: [{product_id, quantity}].
  -- Sync only stores VALID, ACTIVE products of this store; prices stay in the
  -- catalog, so estimated_value is always catalog-derived, never client data.
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  item_count integer NOT NULL DEFAULT 0,
  estimated_value numeric(12, 2) NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  abandoned_at timestamptz,
  restored_at timestamptz,
  converted_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT carts_status_allowed CHECK (status IN ('active', 'abandoned', 'converted')),
  CONSTRAINT carts_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT carts_item_count_non_negative CHECK (item_count >= 0),
  CONSTRAINT carts_estimated_value_non_negative CHECK (estimated_value >= 0),
  CONSTRAINT carts_unique_per_store_token UNIQUE (store_id, token_hash)
);

CREATE INDEX IF NOT EXISTS carts_store_activity_idx ON public.carts (store_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS carts_store_status_idx ON public.carts (store_id, status);

COMMENT ON TABLE public.carts IS
  'Abandoned-cart lifecycle records. One row per storefront browser cart per store, keyed by hashed token. Anonymous browser can only write via SECURITY DEFINER sync/restore/complete RPCs; no anon policies exist.';

DROP TRIGGER IF EXISTS trigger_carts_updated_at ON public.carts;
CREATE TRIGGER trigger_carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.abandoned_cart_settings (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  tracking_enabled boolean NOT NULL DEFAULT true,
  -- A cart becomes abandoned after this many hours of inactivity (1 - 720).
  inactivity_hours integer NOT NULL DEFAULT 24,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT abandoned_cart_settings_inactivity_range
    CHECK (inactivity_hours BETWEEN 1 AND 720)
);

COMMENT ON TABLE public.abandoned_cart_settings IS
  'Per-store abandoned-cart tracking configuration: enable/disable tracking and the inactivity threshold. Commerce code computes abandonment lazily from this config, so no scheduler is required for correctness.';

DROP TRIGGER IF EXISTS trigger_abandoned_cart_settings_updated_at ON public.abandoned_cart_settings;
CREATE TRIGGER trigger_abandoned_cart_settings_updated_at
  BEFORE UPDATE ON public.abandoned_cart_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 1C. PUBLIC CART RPCs
-- ==============================================================================

-- Shared helper: strict cart token validation. Tokens are base64url, 43-64
-- chars of high entropy generated in the browser. Returns the hash or NULL.
CREATE OR REPLACE FUNCTION public.__cart_token_hash(p_token text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text;
BEGIN
  v_token := btrim(COALESCE(p_token, ''));
  IF v_token IS NULL
     OR char_length(v_token) < 32
     OR char_length(v_token) > 128
     OR v_token !~ '^[A-Za-z0-9_-]+$' THEN
    RETURN NULL;
  END IF;
  RETURN encode(sha256(convert_to(v_token, 'UTF8')), 'hex');
END;
$$;

REVOKE ALL ON FUNCTION public.__cart_token_hash(text) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- sync_public_cart: called by the storefront after local cart changes (debounced)
-- and with an EMPTY item list after checkout success (or a manual customer
-- clear). The empty case only removes a row still in 'active' status — a
-- converted cart (with a real order behind it) is preserved for analytics.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_public_cart(
  p_slug text,
  p_token text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text;
  v_token_hash text;
  v_store_id uuid;
  v_item jsonb;
  v_raw_prod_id text;
  v_prod record;
  v_cfg record;
  v_kept jsonb := '[]'::jsonb;
  v_count int := 0;
  v_value numeric(12, 2) := 0;
  v_qty int;
  v_row record;
BEGIN
  v_slug := btrim(COALESCE(p_slug, ''));
  IF char_length(v_slug) = 0
     OR char_length(v_slug) > 100
     OR v_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Validation error: Invalid store slug' USING ERRCODE = '22023';
  END IF;

  v_token_hash := public.__cart_token_hash(p_token);
  IF v_token_hash IS NULL THEN
    RAISE EXCEPTION 'Validation error: Invalid cart token' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_store_id FROM public.stores s WHERE s.slug = v_slug LIMIT 1;
  IF v_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'store_not_found');
  END IF;

  -- Per-store tracking config; safe defaults when no settings row exists.
  SELECT s.tracking_enabled, s.inactivity_hours
  INTO v_cfg
  FROM public.abandoned_cart_settings s
  WHERE s.store_id = v_store_id
  LIMIT 1;

  IF v_cfg IS NULL OR v_cfg.tracking_enabled IS NULL THEN
    SELECT true AS tracking_enabled, 24 AS inactivity_hours INTO v_cfg;
  END IF;

  -- Tracking disabled for this store: never create/refresh cart rows.
  IF v_cfg.tracking_enabled = false THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'tracking_disabled');
  END IF;

  -- Normalize an absent/invalid items payload to empty (which then either
  -- updates with no items [→ row kept only if it exists] or deletes an
  -- 'active' row below). 10-min window and rate limiting are unnecessary:
  -- this RPC writes anonymous cart data strictly scoped to a validated store
  -- and a hashed token, and every field is derived server-side.
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Validation error: Item list must be an array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Validation error: Too many cart items' USING ERRCODE = '22023';
  END IF;

  -- Keep only valid ACTIVE products of this store; ignore the rest safely
  -- (deleted / deactivated products never poison the stored cart).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_raw_prod_id := btrim(COALESCE(v_item->>'product_id', ''));
    IF v_raw_prod_id IS NULL OR v_raw_prod_id = '' THEN
      CONTINUE;
    END IF;

    SELECT id, price, stock INTO v_prod
    FROM public.products
    WHERE store_id = v_store_id
      AND id::text = v_raw_prod_id
      AND status = 'Active'
    LIMIT 1;

    IF NOT FOUND OR v_prod.stock <= 0 THEN
      CONTINUE;
    END IF;

    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 OR v_qty > 100000 THEN
      v_qty := LEAST(GREATEST(v_qty, 1), 100000);
    END IF;

    v_kept := v_kept || jsonb_build_object('product_id', v_prod.id::text, 'quantity', v_qty);
    v_count := v_count + v_qty;
    v_value := v_value + round(v_prod.price, 2) * v_qty;
  END LOOP;

  IF v_value > 9999999999.99 THEN
    v_value := 9999999999.99;
  END IF;

  -----------------------------------------------------------------------------
  -- Empty cart: DELETE only an ACTIVE row. Checkout success (conversion
  -- marking) or any other lifecycle state must never be erased this way.
  -----------------------------------------------------------------------------
  IF v_kept = '[]'::jsonb THEN
    DELETE FROM public.carts
    WHERE store_id = v_store_id
      AND token_hash = v_token_hash
      AND status = 'active';
    RETURN jsonb_build_object('ok', true, 'items', 0);
  END IF;

  -----------------------------------------------------------------------------
  -- Upsert the cart row: refresh items/value/activity. An abandoned cart
  -- being touched again returns to 'active' before its customer converts.
  -----------------------------------------------------------------------------
  INSERT INTO public.carts (store_id, token_hash, items, item_count, estimated_value)
  VALUES (v_store_id, v_token_hash, v_kept, v_count, round(v_value, 2))
  ON CONFLICT (store_id, token_hash) DO UPDATE
  SET items = v_kept,
      item_count = v_count,
      estimated_value = round(v_value, 2),
      last_activity_at = now(),
      status = 'active',
      abandoned_at = NULL,
      updated_at = now();

  SELECT status INTO v_row FROM public.carts
  WHERE store_id = v_store_id AND token_hash = v_token_hash;

  RETURN jsonb_build_object('ok', true, 'items', v_count, 'value', round(v_value, 2), 'status', v_row.status);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_public_cart(text, text, jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_public_cart(text, text, jsonb) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- restore_public_cart: token-scoped recovery read. Only the hash is stored, so
-- the raw token must come from the customer's own browser. Returns catalog-
-- priced items (price/stock always CURRENT), excluding unavailable products.
-- A converted cart no longer restores (its token is dead after conversion).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_public_cart(
  p_slug text,
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text;
  v_token_hash text;
  v_cart record;
  v_item jsonb;
  v_prod record;
  v_kept jsonb := '[]'::jsonb;
BEGIN
  v_slug := btrim(COALESCE(p_slug, ''));
  IF char_length(v_slug) = 0
     OR char_length(v_slug) > 100
     OR v_slug !~ '^[a-z0-9-]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_store');
  END IF;

  v_token_hash := public.__cart_token_hash(p_token);
  IF v_token_hash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  SELECT c.id, c.store_id, c.status, c.items
  INTO v_cart
  FROM public.carts c
  JOIN public.stores s ON s.id = c.store_id
  WHERE c.token_hash = v_token_hash
    AND s.slug = v_slug
  LIMIT 1;

  IF NOT FOUND OR v_cart.status = 'converted' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_available');
  END IF;

  -- Re-validate against the live catalog: only purchasable products restore;
  -- everything else is silently skipped, stocks/prices come from the catalog.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_cart.items, '[]'::jsonb)) LOOP
    SELECT id::text, name, name_ar, name_en, price, stock, image_url
    INTO v_prod
    FROM public.products
    WHERE store_id = v_cart.store_id
      AND id::text = COALESCE(v_item->>'product_id', '')
      AND status = 'Active'
    LIMIT 1;

    IF FOUND AND v_prod.stock > 0 AND COALESCE((v_item->>'quantity')::int, 0) > 0 THEN
      v_kept := v_kept || jsonb_build_object(
        'product_id', v_prod.id,
        'name', v_prod.name,
        'name_ar', v_prod.name_ar,
        'name_en', v_prod.name_en,
        'price', round(v_prod.price, 2),
        'stock', v_prod.stock,
        'image_url', v_prod.image_url,
        'quantity', LEAST((v_item->>'quantity')::int, v_prod.stock, 100000)
      );
    END IF;
  END LOOP;

  -- Mark that a restore happened (analytics), bounded: idempotent re-calls
  -- only refresh the timestamp.
  IF v_kept <> '[]'::jsonb THEN
    UPDATE public.carts
    SET restored_at = now(),
        status = CASE WHEN status = 'abandoned' THEN 'active' ELSE status END,
        abandoned_at = CASE WHEN status = 'abandoned' THEN NULL ELSE abandoned_at END
    WHERE id = v_cart.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'items', v_kept);
END;
$$;

REVOKE ALL ON FUNCTION public.restore_public_cart(text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_public_cart(text, text) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- complete_public_cart: called by the server-side checkout action after a
-- successful order. Verifies the order really belongs to the cart's store so a
-- token can never mark a cross-store conversion. Idempotent.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_public_cart(
  p_token text,
  p_order_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token_hash text;
  v_cart record;
  v_validated boolean := false;
BEGIN
  v_token_hash := public.__cart_token_hash(p_token);
  IF v_token_hash IS NULL OR p_order_id IS NULL THEN
    RETURN false;
  END IF;


  SELECT c.id, c.store_id
  INTO v_cart
  FROM public.carts c
  WHERE c.token_hash = v_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_validated := EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = p_order_id
      AND o.store_id = v_cart.store_id
  );

  IF NOT v_validated THEN
    RETURN false;
  END IF;

  UPDATE public.carts
  SET status = 'converted',
      converted_order_id = p_order_id,
      converted_at = now(),
      abandoned_at = CASE WHEN status = 'abandoned' THEN abandoned_at ELSE NULL END
  WHERE id = v_cart.id
    AND status <> 'converted';

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_public_cart(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_public_cart(text, uuid) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- get_store_abandoned_carts: merchant-only listing + real stats. Each call
-- lazily promotes idle active carts ('abandoned') using the store's configured
-- inactivity threshold — the lifecycle stays correct with no scheduler.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_store_abandoned_carts(
  p_status text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_store record;
  v_cfg record;
  v_page int;
  v_page_size int;
  v_filter text;
  v_stats record;
  v_rows jsonb;
BEGIN
  SELECT s.id, s.name, s.slug, s.currency
  INTO v_store
  FROM public.stores s
  WHERE s.owner_id = (SELECT auth.uid())
  ORDER BY s.created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: No store context for current merchant' USING ERRCODE = '42501';
  END IF;

  SELECT s.tracking_enabled, s.inactivity_hours
  INTO v_cfg
  FROM public.abandoned_cart_settings s
  WHERE s.store_id = v_store.id;

  IF v_cfg IS NULL OR v_cfg.tracking_enabled IS NULL THEN
    SELECT true AS tracking_enabled, 24 AS inactivity_hours INTO v_cfg;
  END IF;

  IF p_status IS NOT NULL AND btrim(p_status) <> '' THEN
    IF btrim(p_status) NOT IN ('active', 'abandoned', 'converted') THEN
      RAISE EXCEPTION 'Validation error: Invalid status filter' USING ERRCODE = '22023';
    END IF;
    v_filter := btrim(p_status);
  END IF;

  v_page := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size := LEAST(GREATEST(COALESCE(p_page_size, 10), 1), 50);

  -- Lazily promote idle active carts (correct even when execution is delayed;
  -- 'converted' rows are never touched by this update).
  IF v_cfg.tracking_enabled THEN
    UPDATE public.carts
    SET status = 'abandoned',
        abandoned_at = now()
    WHERE store_id = v_store.id
      AND status = 'active'
      AND last_activity_at < now() - make_interval(hours => v_cfg.inactivity_hours);
  END IF;

  SELECT
    COALESCE(COUNT(*) FILTER (WHERE c.status = 'active'), 0)::int AS active_count,
    COALESCE(COUNT(*) FILTER (WHERE c.status = 'abandoned'), 0)::int AS abandoned_count,
    COALESCE(COUNT(*) FILTER (WHERE c.status = 'converted'), 0)::int AS converted_count,
    COALESCE(SUM(c.estimated_value) FILTER (WHERE c.status = 'active'), 0)::numeric AS active_value,
    COALESCE(SUM(c.estimated_value) FILTER (WHERE c.status = 'abandoned'), 0)::numeric AS abandoned_value,
    COALESCE(SUM(c.estimated_value) FILTER (WHERE c.status = 'converted'), 0)::numeric AS converted_value
  INTO v_stats
  FROM public.carts c
  WHERE c.store_id = v_store.id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'status', c.status,
        'item_count', c.item_count,
        'estimated_value', round(c.estimated_value, 2),
        'items', c.items,
        'first_seen_at', c.first_seen_at,
        'last_activity_at', c.last_activity_at,
        'abandoned_at', c.abandoned_at,
        'restored_at', c.restored_at,
        'converted_at', c.converted_at,
        'converted_order_number', o.order_number
      )
      ORDER BY c.last_activity_at DESC
    ) FILTER (WHERE c.id IS NOT NULL),
    '[]'::jsonb
  )::jsonb
  INTO v_rows
  FROM (
    SELECT c.*
    FROM public.carts c
    WHERE c.store_id = v_store.id
      AND (v_filter IS NULL OR c.status = v_filter)
    ORDER BY c.last_activity_at DESC
    LIMIT v_page_size
    OFFSET (v_page - 1) * v_page_size
  ) c
  LEFT JOIN public.orders o ON o.id = c.converted_order_id;

  RETURN jsonb_build_object(
    'store', jsonb_build_object('name', v_store.name, 'slug', v_store.slug, 'currency', v_store.currency),
    'config', jsonb_build_object(
      'tracking_enabled', v_cfg.tracking_enabled,
      'inactivity_hours', v_cfg.inactivity_hours
    ),
    'stats', jsonb_build_object(
      'active_count', v_stats.active_count,
      'abandoned_count', v_stats.abandoned_count,
      'converted_count', v_stats.converted_count,
      'active_value', round(v_stats.active_value, 2),
      'abandoned_value', round(v_stats.abandoned_value, 2),
      'converted_value', round(v_stats.converted_value, 2)
    ),
    'carts', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_store_abandoned_carts(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_abandoned_carts(text, integer, integer) TO authenticated;

-- ==============================================================================
-- 2A. TABLES: loyalty settings, balances, ledger
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.loyalty_settings (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  -- Points earned per 1 unit of store currency spent on ELIGIBLE merchandise
  -- (subtotal minus coupon discount; shipping never earns points).
  points_per_unit numeric(12, 4) NOT NULL DEFAULT 1.0,
  -- Orders below this merchandise amount never earn points.
  min_order_amount numeric(12, 2) NOT NULL DEFAULT 0,
  -- Redemption is NOT wired into guest checkout (no verified customer
  -- identity exists yet) and stays false by default; these columns hold the
  -- planned conversion parameters so enabling later is a data change only.
  redemption_enabled boolean NOT NULL DEFAULT false,
  points_to_currency numeric(12, 4) NOT NULL DEFAULT 0,
  -- Max share of the eligible merchandise subtotal redeemable, 0-100.
  redemption_cap_percent numeric(5, 2) NOT NULL DEFAULT 25,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT loyalty_settings_points_positive CHECK (points_per_unit >= 0),
  CONSTRAINT loyalty_settings_points_ceiling CHECK (points_per_unit <= 10000),
  CONSTRAINT loyalty_settings_min_order_non_negative CHECK (min_order_amount >= 0),
  CONSTRAINT loyalty_settings_rate_non_negative CHECK (points_to_currency >= 0),
  CONSTRAINT loyalty_settings_cap_range CHECK (redemption_cap_percent BETWEEN 0 AND 100),
  CONSTRAINT loyalty_settings_redem_requires_supported CHECK (redemption_enabled IN (true, false))
);

DROP TRIGGER IF EXISTS trigger_loyalty_settings_updated_at ON public.loyalty_settings;
CREATE TRIGGER trigger_loyalty_settings_updated_at
  BEFORE UPDATE ON public.loyalty_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.loyalty_settings IS
  'Per-store loyalty program configuration. Defaults keep earning OFF and redemption OFF: a fresh store''s checkout behavior is unchanged until the merchant explicitly enables the program.';

CREATE TABLE IF NOT EXISTS public.customer_loyalty (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0,
  lifetime_earned bigint NOT NULL DEFAULT 0,
  lifetime_redeemed bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (store_id, customer_id),
  CONSTRAINT customer_loyalty_balance_non_negative CHECK (balance >= 0),
  CONSTRAINT customer_loyalty_aggregates_non_negative CHECK (lifetime_earned >= 0 AND lifetime_redeemed >= 0)
);

COMMENT ON TABLE public.customer_loyalty IS
  'Derived per-customer loyalty balance. Written ONLY inside SECURITY DEFINER functions under row locks; merchants have read access only. A negative balance is impossible by constraint.';

CREATE TABLE IF NOT EXISTS public.loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  delta bigint NOT NULL,
  reason text NOT NULL,
  notes text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT loyalty_ledger_reason_allowed CHECK (reason IN ('earn', 'redeem', 'reverse', 'adjust')),
  CONSTRAINT loyalty_ledger_delta_non_zero CHECK (delta <> 0),
  CONSTRAINT loyalty_ledger_notes_bounded CHECK (notes IS NULL OR char_length(notes) <= 500),
  -- Duplicate points from retries / repeated transitions / duplicate webhooks
  -- are structurally impossible: the same key can never create two entries.
  CONSTRAINT loyalty_ledger_unique_key UNIQUE (store_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS loyalty_ledger_customer_created_idx
  ON public.loyalty_ledger (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS loyalty_ledger_store_created_idx
  ON public.loyalty_ledger (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS loyalty_ledger_order_idx
  ON public.loyalty_ledger (order_id) WHERE order_id IS NOT NULL;

COMMENT ON TABLE public.loyalty_ledger IS
  'Append-only audited points ledger. No INSERT/UPDATE/DELETE policies exist: rows are written exclusively inside SECURITY DEFINER functions with unique idempotency keys.';

-- ==============================================================================
-- 2B. RLS + grants for all the new tables
-- ==============================================================================
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_cart_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_loyalty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;

-- LOCK DOWN anon/public explicitly (defense in depth; no anon policies exist).
REVOKE ALL ON TABLE public.carts FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.abandoned_cart_settings FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.loyalty_settings FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.customer_loyalty FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.loyalty_ledger FROM anon, PUBLIC;

-- --- carts: merchant manages rows of its own store --------------------------
DROP POLICY IF EXISTS "Merchants can view their store carts" ON public.carts;
CREATE POLICY "Merchants can view their store carts"
  ON public.carts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = carts.store_id AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can delete their store carts" ON public.carts;
CREATE POLICY "Merchants can delete their store carts"
  ON public.carts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = carts.store_id AND s.owner_id = (SELECT auth.uid())
    )
  );

-- No INSERT/UPDATE policies: public writes only via the definer RPCs.
GRANT SELECT, DELETE ON TABLE public.carts TO authenticated;

-- --- abandoned_cart_settings: merchant-only full CRUD ------------------------
DROP POLICY IF EXISTS "Merchants can view their cart settings" ON public.abandoned_cart_settings;
CREATE POLICY "Merchants can view their cart settings"
  ON public.abandoned_cart_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = abandoned_cart_settings.store_id AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can manage their cart settings" ON public.abandoned_cart_settings;
CREATE POLICY "Merchants can manage their cart settings"
  ON public.abandoned_cart_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = abandoned_cart_settings.store_id AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can update their cart settings" ON public.abandoned_cart_settings;
CREATE POLICY "Merchants can update their cart settings"
  ON public.abandoned_cart_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = abandoned_cart_settings.store_id AND s.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = abandoned_cart_settings.store_id AND s.owner_id = (SELECT auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.abandoned_cart_settings TO authenticated;

-- --- loyalty_settings: merchant-only full CRUD (mutated by server actions) ---
DROP POLICY IF EXISTS "Merchants can view their loyalty settings" ON public.loyalty_settings;
CREATE POLICY "Merchants can view their loyalty settings"
  ON public.loyalty_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = loyalty_settings.store_id AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can create their loyalty settings" ON public.loyalty_settings;
CREATE POLICY "Merchants can create their loyalty settings"
  ON public.loyalty_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = loyalty_settings.store_id AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can update their loyalty settings" ON public.loyalty_settings;
CREATE POLICY "Merchants can update their loyalty settings"
  ON public.loyalty_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = loyalty_settings.store_id AND s.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = loyalty_settings.store_id AND s.owner_id = (SELECT auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.loyalty_settings TO authenticated;

-- --- customer_loyalty: merchant read-only; writes only inside definer fns ----
DROP POLICY IF EXISTS "Merchants can view their customers loyalty balances" ON public.customer_loyalty;
CREATE POLICY "Merchants can view their customers loyalty balances"
  ON public.customer_loyalty
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = customer_loyalty.store_id AND s.owner_id = (SELECT auth.uid())
    )
  );

GRANT SELECT ON TABLE public.customer_loyalty TO authenticated;

-- --- loyalty_ledger: merchant read-only; writes only inside definer fns ------
DROP POLICY IF EXISTS "Merchants can view their loyalty ledger" ON public.loyalty_ledger;
CREATE POLICY "Merchants can view their loyalty ledger"
  ON public.loyalty_ledger
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = loyalty_ledger.store_id AND s.owner_id = (SELECT auth.uid())
    )
  );

GRANT SELECT ON TABLE public.loyalty_ledger TO authenticated;

-- ==============================================================================
-- 2C. LOYALTY RPCs (SECURITY DEFINER; all verify ownership intra-function)
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- award_order_loyalty_points: called from the merchant order-status workflow.
-- Eligibility (authoritative):
--   * order belongs to the caller's own store (owner_id = auth.uid()),
--   * loyalty program enabled for that store,
--   * order payment_status = 'Paid' and status <> 'Cancelled',
--   * order has a linked customer,
--   * eligible merchandise amount = subtotal - discount (coupon), which must
--     be >= min_order_amount and produce at least 1 point.
-- Earning on shipping/taxes never happens: only merchandise is used.
-- Idempotent via idempotency_key = 'earn:' || order_id.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_order_loyalty_points(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order record;
  v_settings record;
  v_merch numeric(12, 2);
  v_points bigint;
  v_delta bigint;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_required');
  END IF;

  SELECT o.id, o.store_id, o.customer_id, o.status, o.payment_status, o.subtotal, o.discount_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = v_order.store_id AND s.owner_id = (SELECT auth.uid())
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_order.customer_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'no_customer');
  END IF;

  SELECT * INTO v_settings
  FROM public.loyalty_settings
  WHERE store_id = v_order.store_id;

  IF NOT FOUND OR NOT COALESCE(v_settings.enabled, false) THEN
    RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'program_disabled');
  END IF;

  IF v_order.status = 'Cancelled' OR v_order.payment_status <> 'Paid' THEN
    RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'not_eligible_status');
  END IF;

  v_merch := round(v_order.subtotal - COALESCE(v_order.discount_amount, 0), 2);

  IF v_settings.min_order_amount IS NOT NULL AND v_merch < v_settings.min_order_amount THEN
    RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'below_min_order');
  END IF;

  v_points := floor(v_merch * COALESCE(v_settings.points_per_unit, 0))::bigint;
  IF v_points IS NULL OR v_points <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'zero_points');
  END IF;

  v_points := LEAST(v_points, 1000000000)::bigint;

  INSERT INTO public.loyalty_ledger (
    store_id, customer_id, order_id, delta, reason, notes, idempotency_key
  ) VALUES (
    v_order.store_id,
    v_order.customer_id,
    v_order.id,
    v_points,
    'earn',
    'Earned from order ' || (SELECT order_number FROM public.orders WHERE id = v_order.id),
    'earn:' || v_order.id::text
  )
  ON CONFLICT (store_id, idempotency_key) DO NOTHING
  RETURNING delta INTO v_delta;

  IF v_delta IS NULL THEN
    -- Already processed (retry / repeated transition): never duplicate points.
    RETURN jsonb_build_object('ok', true, 'awarded', true, 'points', 0, 'reason', 'already_processed');
  END IF;

  INSERT INTO public.customer_loyalty (store_id, customer_id, balance, lifetime_earned)
  VALUES (v_order.store_id, v_order.customer_id, v_delta, v_delta)
  ON CONFLICT (store_id, customer_id) DO UPDATE
  SET balance = public.customer_loyalty.balance + v_delta,
      lifetime_earned = public.customer_loyalty.lifetime_earned + v_delta,
      updated_at = now();

  RETURN jsonb_build_object('ok', true, 'awarded', true, 'points', v_delta);
END;
$$;

-- -----------------------------------------------------------------------------
-- reverse_order_loyalty_points: cancels the award of a cancelled/refunded
-- order, exactly once (idempotency_key = 'reverse:' || order_id). The reversal
-- clamps to the still-available balance so a customer cannot go negative;
-- when the balance is exhausted, no entry is written and a later retry stays
-- possible (the idempotency slot is only consumed on an effective reversal).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_order_loyalty_points(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order record;
  v_earn record;
  v_balance bigint;
  v_clamped bigint;
  v_inserted_delta bigint;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_required');
  END IF;

  SELECT o.id, o.store_id, o.customer_id
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = v_order.store_id AND s.owner_id = (SELECT auth.uid())
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_earn
  FROM public.loyalty_ledger
  WHERE store_id = v_order.store_id
    AND customer_id = v_order.customer_id
    AND order_id = v_order.id
    AND reason = 'earn'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reversed', false, 'reason', 'nothing_to_reverse');
  END IF;

  IF v_order.customer_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'reversed', false, 'reason', 'no_customer');
  END IF;

  SELECT balance INTO v_balance
  FROM public.customer_loyalty
  WHERE store_id = v_order.store_id AND customer_id = v_order.customer_id
  FOR UPDATE;

  IF NOT FOUND OR v_balance IS NULL OR v_balance <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'reversed', false, 'reason', 'insufficient_balance');
  END IF;

  v_clamped := LEAST(v_earn.delta, v_balance);
  IF v_clamped <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'reversed', false, 'reason', 'insufficient_balance');
  END IF;

  INSERT INTO public.loyalty_ledger (
    store_id, customer_id, order_id, delta, reason, notes, idempotency_key
  ) VALUES (
    v_order.store_id,
    v_order.customer_id,
    v_order.id,
    -v_clamped,
    'reverse',
    'Reversed earning of order ' || (SELECT order_number FROM public.orders WHERE id = v_order.id),
    'reverse:' || v_order.id::text
  )
  ON CONFLICT (store_id, idempotency_key) DO NOTHING
  RETURNING delta INTO v_inserted_delta;

  IF v_inserted_delta IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'reversed', true, 'points', 0, 'reason', 'already_reversed');
  END IF;

  UPDATE public.customer_loyalty
  SET balance = balance + v_inserted_delta, -- delta is already negative for a reversal
      updated_at = now()
  WHERE store_id = v_order.store_id AND customer_id = v_order.customer_id;

  RETURN jsonb_build_object('ok', true, 'reversed', true, 'points', v_inserted_delta);
END;
$$;

-- -----------------------------------------------------------------------------
-- adjust_customer_loyalty_points: audited administrative adjustment.
-- Positive deltas are added instantly; negative deltas are applied row-locked
-- and can never make the balance negative. Every call writes its own ledger
-- entry (idempotency key is a fresh UUID — each adjustment is a distinct,
-- authorized audit record).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_customer_loyalty_points(
  p_customer_id uuid,
  p_delta bigint,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer record;
  v_balance bigint;
  v_notes text;
  v_abs bigint;
  v_effective bigint;
BEGIN
  IF p_customer_id IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  IF abs(p_delta) > 100000000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'delta_out_of_range');
  END IF;

  SELECT c.id, c.store_id
  INTO v_customer
  FROM public.customers c
  WHERE c.id = p_customer_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'customer_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = v_customer.store_id AND s.owner_id = (SELECT auth.uid())
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_notes := NULLIF(btrim(COALESCE(p_notes, '')), '');
  IF v_notes IS NOT NULL AND char_length(v_notes) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'notes_too_long');
  END IF;

  IF p_delta > 0 THEN
    INSERT INTO public.customer_loyalty (store_id, customer_id, balance, lifetime_earned)
    VALUES (v_customer.store_id, v_customer.id, p_delta, p_delta)
    ON CONFLICT (store_id, customer_id) DO UPDATE
    SET balance = public.customer_loyalty.balance + p_delta,
        updated_at = now()
    RETURNING balance INTO v_balance;
  ELSE
    v_abs := -p_delta;
    SELECT balance INTO v_balance
    FROM public.customer_loyalty
    WHERE store_id = v_customer.store_id AND customer_id = v_customer.id
    FOR UPDATE;

    IF NOT FOUND OR v_balance < v_abs THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_BALANCE');
    END IF;

    UPDATE public.customer_loyalty
    SET balance = balance - v_abs,
        updated_at = now()
    WHERE store_id = v_customer.store_id AND customer_id = v_customer.id
    RETURNING balance INTO v_balance;
  END IF;

  INSERT INTO public.loyalty_ledger (
    store_id, customer_id, order_id, delta, reason, notes, idempotency_key
  ) VALUES (
    v_customer.store_id,
    v_customer.id,
    NULL,
    p_delta,
    'adjust',
    v_notes,
    'adjust:' || gen_random_uuid()::text
  );

  RETURN jsonb_build_object('ok', true, 'balance', v_balance);
END;
$$;

-- -----------------------------------------------------------------------------
-- Merchant reads: loyalty overview (settings + balances + real stats) and the
-- per-customer ledger. Read-only, paged, no cross-store access possible.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_store_loyalty_overview(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_store record;
  v_settings public.loyalty_settings;
  v_page int;
  v_page_size int;
  v_stats record;
  v_rows jsonb;
BEGIN
  SELECT s.id, s.name, s.slug, s.currency
  INTO v_store
  FROM public.stores s
  WHERE s.owner_id = (SELECT auth.uid())
  ORDER BY s.created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: No store context for current merchant' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_settings
  FROM public.loyalty_settings
  WHERE store_id = v_store.id;

  IF NOT FOUND THEN
    -- Fresh store: report safe defaults without silently creating a row.
    v_settings.store_id := v_store.id;
    v_settings.enabled := false;
    v_settings.points_per_unit := 1.0;
    v_settings.min_order_amount := 0;
    v_settings.redemption_enabled := false;
    v_settings.points_to_currency := 0;
    v_settings.redemption_cap_percent := 25;
    v_settings.updated_at := now();
  END IF;

  v_page := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size := LEAST(GREATEST(COALESCE(p_page_size, 10), 1), 50);

  SELECT
    COALESCE(SUM(cl.balance), 0)::bigint AS total_balance,
    COALESCE(SUM(cl.lifetime_earned), 0)::bigint AS total_earned,
    COALESCE(SUM(cl.lifetime_redeemed), 0)::bigint AS total_redeemed,
    COALESCE(COUNT(cl.customer_id), 0)::int AS customers_count
  INTO v_stats
  FROM public.customer_loyalty cl
  WHERE cl.store_id = v_store.id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'customer_id', x.customer_id,
        'name', x.name,
        'balance', x.balance,
        'lifetime_earned', x.lifetime_earned,
        'lifetime_redeemed', x.lifetime_redeemed,
        'updated_at', x.updated_at
      )
      ORDER BY x.balance DESC
    ),
    '[]'::jsonb
  )::jsonb
  INTO v_rows
  FROM (
    SELECT
      cl.customer_id,
      ct.name,
      cl.balance,
      cl.lifetime_earned,
      cl.lifetime_redeemed,
      cl.updated_at
    FROM public.customer_loyalty cl
    JOIN public.customers ct ON ct.id = cl.customer_id
    WHERE cl.store_id = v_store.id
    ORDER BY cl.balance DESC, ct.name ASC
    LIMIT v_page_size
    OFFSET (v_page - 1) * v_page_size
  ) x;

  RETURN jsonb_build_object(
    'store', jsonb_build_object('name', v_store.name, 'slug', v_store.slug, 'currency', v_store.currency),
    'settings', jsonb_build_object(
      'enabled', v_settings.enabled,
      'points_per_unit', v_settings.points_per_unit,
      'min_order_amount', v_settings.min_order_amount,
      'redemption_enabled', v_settings.redemption_enabled,
      'points_to_currency', v_settings.points_to_currency,
      'redemption_cap_percent', v_settings.redemption_cap_percent
    ),
    'stats', jsonb_build_object(
      'total_balance', v_stats.total_balance,
      'total_earned', v_stats.total_earned,
      'total_redeemed', v_stats.total_redeemed,
      'customers_count', v_stats.customers_count
    ),
    'customers', v_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_loyalty_ledger(
  p_customer_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer record;
  v_limit int;
  v_offset int;
  v_rows jsonb;
  v_balance bigint;
BEGIN
  SELECT c.id, c.store_id
  INTO v_customer
  FROM public.customers c
  WHERE c.id = p_customer_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'customer_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = v_customer.store_id AND s.owner_id = (SELECT auth.uid())
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 4900);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'delta', l.delta,
        'reason', l.reason,
        'notes', l.notes,
        'order_number', o.order_number,
        'created_at', l.created_at
      )
      ORDER BY l.created_at DESC
    ),
    '[]'::jsonb
  )::jsonb
  INTO v_rows
  FROM (
    SELECT l.*, l.id AS _l_id
    FROM public.loyalty_ledger l
    WHERE l.store_id = v_customer.store_id
      AND l.customer_id = v_customer.id
    ORDER BY l.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) l
  LEFT JOIN public.orders o ON o.id = l.order_id;

  SELECT balance INTO v_balance
  FROM public.customer_loyalty
  WHERE store_id = v_customer.store_id AND customer_id = v_customer.id;

  RETURN jsonb_build_object(
    'ok', true,
    'balance', COALESCE(v_balance, 0),
    'entries', v_rows
  );
END;
$$;

-- Function privileges: merchant-only RPCs execute for authenticated only;
-- public RPCs stay open to anon + authenticated (storefront), like the coupon
-- RPCs from the coupons migration.
REVOKE ALL ON FUNCTION public.award_order_loyalty_points(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_order_loyalty_points(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reverse_order_loyalty_points(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_order_loyalty_points(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.adjust_customer_loyalty_points(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_customer_loyalty_points(uuid, bigint, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_store_loyalty_overview(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_loyalty_overview(integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.get_customer_loyalty_ledger(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_loyalty_ledger(uuid, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.award_order_loyalty_points(uuid) IS
  'Tenant-isolated loyalty earning when an order reaches Paid on a non-cancelled status, with the store''s own settings; idempotent via ledger key earn:<order_id>. SECURITY DEFINER, fixed search_path.';

COMMENT ON FUNCTION public.reverse_order_loyalty_points(uuid) IS
  'Idempotent reversal of a previously earned award when an order is cancelled/refunded; clamped to the available balance so it can never go negative.';

COMMENT ON FUNCTION public.adjust_customer_loyalty_points(uuid, bigint, text) IS
  'Audited administrative loyalty adjustment for a customer of the caller''s own store; negative deltas are row-locked and can never overdraw the balance.';

COMMENT ON FUNCTION public.get_store_loyalty_overview(integer, integer) IS
  'Read-only loyalty overview (settings + derived balances + aggregate stats) for the merchant''s own store.';

COMMENT ON FUNCTION public.get_customer_loyalty_ledger(uuid, integer, integer) IS
  'Read-only bounded per-customer loyalty ledger for the merchant''s own store.';

-- ==============================================================================
-- NOTES FOR THE OPERATOR (informational only — nothing in this block executes):
--  1. Apply this migration through the Supabase SQL Editor, after all previous
--     migrations. It is fully additive and idempotent (IF NOT EXISTS / OR
--     REPLACE / DROP POLICY IF EXISTS), so re-running it is safe.
--  2. No scheduler is required for correct abandonment tracking; the merchant
--     list RPC promotes idle carts lazily. If you later add Supabase Cron, a
--     nightly job can simply call:
--       SELECT public.get_store_abandoned_carts();  -- per merchant dashboard
--     or run the equivalent UPDATE directly as service role.
--  3. Redemption at guest checkout remains intentionally disabled; enabling it
--     requires a verified customer identity mechanism first.
-- ==============================================================================
