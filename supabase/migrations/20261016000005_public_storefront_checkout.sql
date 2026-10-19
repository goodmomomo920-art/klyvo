-- ==============================================================================
-- KLYVO PUBLIC STOREFRONT & CHECKOUT
-- Migration: 20261016000005_public_storefront_checkout.sql
-- Description:
--   Enables the customer-facing storefront WITHOUT opening public RLS policies
--   on stores/products/store_payment_methods/customers (they remain completely
--   inaccessible to anon via table RLS). Instead, three hardened SECURITY
--   DEFINER RPCs expose only safe, read-only projections plus a strict checkout
--   transaction:
--     1. get_public_store(slug)         -> safe storefront config projection
--     2. get_public_store_products(...) -> Active products, paginated/filtered
--     3. create_public_store_order(...) -> anonymous atomic order creation
--
--   Order integrity (the client is never trusted):
--     - Store is resolved ONLY by its unique validated slug; never by client IDs.
--     - Prices come strictly from the catalog; client-supplied prices/totals are ignored.
--     - Shipping fee & totals are computed server-side from the store's saved
--       settings (shipping enabled / fee / free-shipping threshold).
--     - The payment method must be enabled in that store's payment configuration.
--     - Quantities are clamped to available stock; Draft/Archived products are
--       never orderable; all items must belong to the resolved store.
--     - A DB-backed rate limit (checkout_rate_limits) throttles checkout per
--       phone number per store. Not in-memory; survives restarts.
--
--   Payment note: this records orders and manual payment instructions only.
--   No card numbers, CVVs, or payment secrets are accepted or stored, and no
--   online payment provider is integrated.
--
--   Compatible with migrations 0000-0004; no previous migration is modified.
-- ==============================================================================

-- ==============================================================================
-- 1. TABLE: checkout_rate_limits (private; no grants, RLS enabled, no policies)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.checkout_rate_limits (
  identity text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  order_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT checkout_rate_limits_order_count_non_negative CHECK (order_count >= 0),
  CONSTRAINT checkout_rate_limits_identity_not_empty CHECK (char_length(identity) > 0)
);

COMMENT ON TABLE public.checkout_rate_limits IS
  'DB-backed abuse protection for anonymous checkout. One row per phone-hash + store with a rolling 10-minute request window. Accessed exclusively by the SECURITY DEFINER checkout RPC.';

ALTER TABLE public.checkout_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.checkout_rate_limits FROM anon, authenticated;
REVOKE ALL ON TABLE public.checkout_rate_limits FROM PUBLIC;

-- ==============================================================================
-- 2. PUBLIC STORE CONFIG RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_public_store(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_store record;
BEGIN
  IF p_slug IS NULL
     OR char_length(btrim(p_slug)) = 0
     OR char_length(p_slug) > 100
     OR p_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Validation error: Invalid store slug' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.name, s.slug, s.description, s.logo_url,
         s.primary_color, s.secondary_color, s.language, s.currency,
         s.shipping_enabled, s.shipping_fee, s.free_shipping_threshold,
         s.contact_email, s.contact_phone, s.city, s.governorate
  INTO v_store
  FROM public.stores s
  WHERE s.slug = btrim(p_slug)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_store.id,
    'name', v_store.name,
    'slug', v_store.slug,
    'description', COALESCE(v_store.description, ''),
    'logo_url', v_store.logo_url,
    'primary_color', v_store.primary_color,
    'secondary_color', v_store.secondary_color,
    'language', v_store.language,
    'currency', v_store.currency,
    'shipping_enabled', v_store.shipping_enabled,
    'shipping_fee', v_store.shipping_fee,
    'free_shipping_threshold', v_store.free_shipping_threshold,
    'contact_email', v_store.contact_email,
    'contact_phone', v_store.contact_phone,
    'city', v_store.city,
    'governorate', v_store.governorate,
    'payment_methods', (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object(
          'method', m.method,
          'instructions', COALESCE(m.instructions, '')
        ) ORDER BY m.method),
        '[]'::jsonb
      )
      FROM public.store_payment_methods m
      WHERE m.store_id = v_store.id
        AND m.enabled = true
    )
  );
END;
$$;

-- ==============================================================================
-- 3. PUBLIC PRODUCT CATALOG RPC
-- Only 'Active' products are exposed. SKU is NOT returned (stays private).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_public_store_products(
  p_slug text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 12,
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_store_id uuid;
  v_page integer;
  v_size integer;
  v_pattern text;
  v_category text;
  v_total integer DEFAULT 0;
  v_has_more boolean DEFAULT false;
  v_product jsonb;
  v_products jsonb;
BEGIN
  IF p_slug IS NULL
     OR char_length(btrim(p_slug)) = 0
     OR char_length(p_slug) > 100
     OR p_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Validation error: Invalid store slug' USING ERRCODE = '22023';
  END IF;

  SELECT s.id INTO v_store_id
  FROM public.stores s
  WHERE s.slug = btrim(p_slug)
  LIMIT 1;

  IF v_store_id IS NULL THEN
    RETURN jsonb_build_object(
      'products', '[]'::jsonb, 'total', 0,
      'page', 1, 'page_size', 12, 'has_more', false
    );
  END IF;

  -- Clamp pagination to sane bounds
  v_page := GREATEST(1, COALESCE(p_page, 1));
  v_size := LEAST(GREATEST(1, COALESCE(p_page_size, 12)), 48);

  -- Category filter: exact match against existing catalog categories
  v_category := NULLIF(btrim(COALESCE(p_category, '')), '');
  IF v_category IS NOT NULL AND char_length(v_category) > 100 THEN
    RAISE EXCEPTION 'Validation error: Category filter too long' USING ERRCODE = '22023';
  END IF;

  -- Content search: strip ILIKE wildcards from user input
  v_pattern := NULL;
  IF COALESCE(p_search, '') <> '' THEN
    IF char_length(btrim(p_search)) > 100 THEN
      RAISE EXCEPTION 'Validation error: Search term too long' USING ERRCODE = '22023';
    END IF;
    v_pattern := '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  -- Single-product mode for public product-detail pages
  IF p_product_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'product', jsonb_build_object(
        'id', pr.id,
        'name', pr.name,
        'name_ar', NULLIF(btrim(COALESCE(pr.name_ar, '')), ''),
        'name_en', NULLIF(btrim(COALESCE(pr.name_en, '')), ''),
        'description', COALESCE(pr.description, ''),
        'category', pr.category,
        'price', pr.price,
        'compare_at_price', pr.compare_at_price,
        'stock', pr.stock,
        'image_url', pr.image_url
      )
    ) INTO v_product
    FROM public.products pr
    WHERE pr.store_id = v_store_id
      AND pr.id = p_product_id
      AND pr.status = 'Active';

    IF NOT FOUND THEN
      RETURN jsonb_build_object('product', NULL::jsonb);
    END IF;

    RETURN v_product;
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.products pr
  WHERE pr.store_id = v_store_id
    AND pr.status = 'Active'
    AND (v_category IS NULL OR pr.category = v_category)
    AND (
      v_pattern IS NULL
      OR pr.name ILIKE v_pattern
      OR COALESCE(pr.name_ar, '') ILIKE v_pattern
      OR COALESCE(pr.description, '') ILIKE v_pattern
    );

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'id', pr.id,
      'name', pr.name,
      'name_ar', NULLIF(btrim(COALESCE(pr.name_ar, '')), ''),
      'name_en', NULLIF(btrim(COALESCE(pr.name_en, '')), ''),
      'description', COALESCE(pr.description, ''),
      'category', pr.category,
      'price', pr.price,
      'compare_at_price', pr.compare_at_price,
      'stock', pr.stock,
      'image_url', pr.image_url
    ))
    FILTER (WHERE pr.id IS NOT NULL),
    '[]'::jsonb
  ) INTO v_products
  FROM (
    SELECT pr.*
    FROM public.products pr
    WHERE pr.store_id = v_store_id
      AND pr.status = 'Active'
      AND (v_category IS NULL OR pr.category = v_category)
      AND (
        v_pattern IS NULL
        OR pr.name ILIKE v_pattern
        OR COALESCE(pr.name_ar, '') ILIKE v_pattern
        OR COALESCE(pr.description, '') ILIKE v_pattern
      )
    ORDER BY pr.created_at DESC
    LIMIT v_size OFFSET (v_page - 1) * v_size
  ) pr;

  v_has_more := (v_total > v_page * v_size);

  RETURN jsonb_build_object(
    'products', v_products,
    'total', v_total,
    'page', v_page,
    'page_size', v_size,
    'has_more', v_has_more
  );
END;
$$;

-- ==============================================================================
-- 4. ANONYMOUS CHECKOUT RPC
-- Hardened atomic order creation for the public storefront. Modeled strictly on
-- the merchant RPC in migrations 0002/0003 (same transaction shape), but:
--   - auth is replaced by store-slug resolution,
--   - shipping fee is computed from store settings (client value is absent),
--   - the payment method must be enabled for the store,
--   - quantity cannot exceed available stock,
--   - manual custom line items are NOT allowed for anonymous buyers,
--   - a DB-backed rate limit throttles abuse.
-- ==============================================================================
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
  p_items jsonb
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
  -- 2. Validate textual buyer inputs (mirrors migration 0003 hardening)
  ---------------------------------------------------------------------------
  IF p_customer_name IS NULL OR char_length(btrim(p_customer_name)) = 0 THEN
    RAISE EXCEPTION 'Validation error: Customer name is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(p_customer_name)) > 255 THEN
    RAISE EXCEPTION 'Validation error: Customer name exceeds 255 characters' USING ERRCODE = '22023';
  END IF;

  -- Phone: trim, keep + digits spaces dashes parens; normalize digits for rate limit
  IF p_customer_phone IS NULL OR char_length(btrim(p_customer_phone)) = 0 THEN
    RAISE EXCEPTION 'Validation error: Customer phone number is required' USING ERRCODE = '22023';
  END IF;
  IF btrim(p_customer_phone) !~ '^[+]?[0-9][0-9 \-()]{4,49}$' THEN
    RAISE EXCEPTION 'Validation error: Customer phone number is not valid' USING ERRCODE = '22023';
  END IF;

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
  -- 3. Payment method must be one of the supported methods AND enabled for
  --    this store in the merchant's payment configuration.
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

    -- Catalog lookup strictly for this store, with a shared row lock
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

    -- Quantity cannot exceed available stock
    IF v_qty > v_prod.stock THEN
      RAISE EXCEPTION 'Only % unit(s) of "%" are available in stock', v_prod.stock, v_prod.name USING ERRCODE = '22023';
    END IF;

    -- Price strictly from the catalog
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
  -- 5. Shipping & total: computed ONLY from the store's saved settings
  ---------------------------------------------------------------------------
  IF NOT v_store.shipping_enabled THEN
    v_shipping_fee := 0;
  ELSIF v_store.free_shipping_threshold IS NOT NULL AND v_subtotal >= v_store.free_shipping_threshold THEN
    v_shipping_fee := 0;
  ELSE
    v_shipping_fee := round(v_store.shipping_fee, 2);
  END IF;

  v_total := v_subtotal + v_shipping_fee;
  IF v_total > 9999999999.99 THEN
    RAISE EXCEPTION 'Validation error: Order total exceeds maximum currency precision' USING ERRCODE = '22003';
  END IF;

  ---------------------------------------------------------------------------
  -- 6. DB-backed rate limiting: max 5 orders per phone per store per 10 minutes
  ---------------------------------------------------------------------------
  v_phone_norm := LOWER(regexp_replace(btrim(p_customer_phone), '[^0-9+]', '', 'g'));
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
  -- 7. Atomic customer directory upsert with aggregates (same as merchant RPC)
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
  -- 8. Collision-resistant order number generation (same as migration 0003)
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
  -- 9. Insert order item snapshots
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
  -- 10. Return result payload (order reference for the storefront)
  ---------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'customer_id', v_customer_id,
    'subtotal', v_subtotal,
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
-- 5. FUNCTION PRIVILEGES
-- Public store + products projections and anonymous checkout are callable by
-- the anon role through the publishable key. Table RLS remains untouched.
-- ==============================================================================
REVOKE ALL ON FUNCTION public.get_public_store(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_store(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_public_store_products(text, integer, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_store_products(text, integer, integer, text, text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.create_public_store_order(text, text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_store_order(text, text, text, text, text, text, text, text, text, jsonb) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_store IS 'Safe public projection of storefront configuration by validated slug. SECURITY DEFINER; table RLS untouched.';
COMMENT ON FUNCTION public.get_public_store_products IS 'Safe public product projection (Active only) with pagination, search, category, and single-product modes. SECURITY DEFINER; table RLS untouched.';
COMMENT ON FUNCTION public.create_public_store_order IS 'Hardened anonymous checkout: catalog-priced, settings-derived shipping, enabled payment methods, stock cap, DB-backed rate limiting, atomic customer upsert and order number allocation.';
