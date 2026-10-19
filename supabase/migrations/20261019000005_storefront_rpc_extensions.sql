-- ==============================================================================
-- KLYVO STOREFRONT RPC EXTENSIONS
-- Migration: 20261019000005_storefront_rpc_extensions.sql
-- Depends on (apply in order):
--   20261019000000_product_variants.sql
--   20261019000001_shipping_zones.sql
--   20261019000002_store_appearance.sql
--   20261019000003_product_reviews.sql
--   20261019000004_marketing_campaigns.sql
--   …and all previously applied migrations 20261016* / 20261017*.
--
-- Description:
--   Replaces three public SECURITY DEFINER projections so the storefront can
--   consume the new features without opening table access:
--     1. get_public_store(text)            — adds published appearance and
--                                            active shipping zones.
--     2. get_public_store_products(…)      — adds active variants, option
--                                            values, rating average/count.
--     3. create_public_store_order(…)      — adds variant-aware pricing/stock
--                                            and per-zone shipping.
--
--   Checkout authority (unchanged principles):
--     - Store resolved only by validated slug.
--     - Unit price from products / product_variants only.
--     - Variant required when the product has active variants; variant must
--       belong to the product, store, and be active.
--     - Stock checked against the selected variant (or product when variantless).
--     - Shipping fee from the selected ACTIVE zone of this store; if the store
--       has active zones, a zone is mandatory and the governorate must match.
--     - Coupon rules remain exactly as in 20261017000000 (FOR UPDATE lock,
--       atomic usage recording).
--     - Client-supplied prices, totals and store ids are ignored.
--
--   The old 11-argument checkout function is dropped because PostgreSQL cannot
--   distinguish two overloads when the new trailing parameter has a default.
--
--   No previously applied migration file is modified.
-- ==============================================================================

-- ==============================================================================
-- 1. PUBLIC STORE CONFIG (appearance + shipping zones)
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
    ),
    -- Published appearance only; draft settings never leave the dashboard.
    'appearance', (
      SELECT sa.published
      FROM public.store_appearance sa
      WHERE sa.store_id = v_store.id
    ),
    -- Active delivery areas only.
    'shipping_zones', (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object(
          'id', z.id,
          'governorate', z.governorate,
          'area', z.area,
          'fee', z.fee,
          'free_shipping_threshold', z.free_shipping_threshold
        ) ORDER BY z.governorate, z.position, z.area),
        '[]'::jsonb
      )
      FROM public.shipping_zones z
      WHERE z.store_id = v_store.id
        AND z.is_active = true
    )
  );
END;
$$;

-- ==============================================================================
-- 2. PUBLIC CATALOG (variants + ratings)
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

  v_page := GREATEST(1, COALESCE(p_page, 1));
  v_size := LEAST(GREATEST(1, COALESCE(p_page_size, 12)), 48);

  v_category := NULLIF(btrim(COALESCE(p_category, '')), '');
  IF v_category IS NOT NULL AND char_length(v_category) > 100 THEN
    RAISE EXCEPTION 'Validation error: Category filter too long' USING ERRCODE = '22023';
  END IF;

  v_pattern := NULL;
  IF COALESCE(p_search, '') <> '' THEN
    IF char_length(btrim(p_search)) > 100 THEN
      RAISE EXCEPTION 'Validation error: Search term too long' USING ERRCODE = '22023';
    END IF;
    v_pattern := '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

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
        'image_url', pr.image_url,
        'has_variants', EXISTS (
          SELECT 1 FROM public.product_variants v
          WHERE v.product_id = pr.id AND v.is_active
        ),
        'rating_average', COALESCE((
          SELECT round(avg(r.rating)::numeric, 2)
          FROM public.product_reviews r
          WHERE r.product_id = pr.id AND r.status = 'published'
        ), 0),
        'review_count', (
          SELECT count(*) FROM public.product_reviews r
          WHERE r.product_id = pr.id AND r.status = 'published'
        ),
        'options', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', o.id,
            'name', o.name,
            'values', COALESCE((
              SELECT jsonb_agg(jsonb_build_object('id', ov.id, 'value', ov.value) ORDER BY ov.position, ov.value)
              FROM public.product_option_values ov
              WHERE ov.option_id = o.id
            ), '[]'::jsonb)
          ) ORDER BY o.position, o.name)
          FROM public.product_options o
          WHERE o.product_id = pr.id AND o.store_id = v_store_id
        ), '[]'::jsonb),
        'variants', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', v.id,
            'sku', v.sku,
            'price', COALESCE(v.price, pr.price),
            'stock', v.stock,
            'option_value_ids', to_jsonb(v.option_value_ids)
          ) ORDER BY v.created_at, v.sku)
          FROM public.product_variants v
          WHERE v.product_id = pr.id AND v.is_active
        ), '[]'::jsonb)
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
      'image_url', pr.image_url,
      'has_variants', EXISTS (
        SELECT 1 FROM public.product_variants v
        WHERE v.product_id = pr.id AND v.is_active
      ),
      'rating_average', COALESCE((
        SELECT round(avg(r.rating)::numeric, 2)
        FROM public.product_reviews r
        WHERE r.product_id = pr.id AND r.status = 'published'
      ), 0),
      'review_count', (
        SELECT count(*) FROM public.product_reviews r
        WHERE r.product_id = pr.id AND r.status = 'published'
      ),
      'options', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', o.id,
          'name', o.name,
          'values', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', ov.id, 'value', ov.value) ORDER BY ov.position, ov.value)
            FROM public.product_option_values ov
            WHERE ov.option_id = o.id
          ), '[]'::jsonb)
        ) ORDER BY o.position, o.name)
        FROM public.product_options o
        WHERE o.product_id = pr.id AND o.store_id = v_store_id
      ), '[]'::jsonb),
      'variants', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', v.id,
          'sku', v.sku,
          'price', COALESCE(v.price, pr.price),
          'stock', v.stock,
          'option_value_ids', to_jsonb(v.option_value_ids)
        ) ORDER BY v.created_at, v.sku)
        FROM public.product_variants v
        WHERE v.product_id = pr.id AND v.is_active
      ), '[]'::jsonb)
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
-- 3. CHECKOUT (variants + shipping zones + coupons)
--    The old 11-argument overload must go before adding the 12th parameter.
-- ==============================================================================
DROP FUNCTION IF EXISTS public.create_public_store_order(
  text, text, text, text, text, text, text, text, text, jsonb, text
);
DROP FUNCTION IF EXISTS public.create_public_store_order(
  text, text, text, text, text, text, text, text, text, jsonb, text, uuid
);

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
  p_coupon_code text DEFAULT NULL,
  p_shipping_zone_id uuid DEFAULT NULL
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
  v_variant record;
  v_raw_prod_id text;
  v_parsed_prod_id uuid;
  v_raw_variant_id text;
  v_parsed_variant_id uuid;
  v_active_variant_count integer;
  v_variant_label text;
  v_unit_price numeric(12, 2);
  v_raw_qty text;
  v_qty int;
  v_line_key text;
  v_line_total numeric(12, 2);
  v_product_name text;
  v_sku text;
  v_attempts int := 0;
  v_inserted boolean := false;
  v_err_constraint text;
  v_validated_items jsonb := '[]'::jsonb;
  v_validated_line_keys text[] := ARRAY[]::text[];

  -- Rate limiting locals
  v_rl_identity text;
  v_rl_count integer;
  v_rl_window timestamptz;

  v_phone_norm text;

  -- Coupon locals
  v_coupon_code text;
  v_coupon record;
  v_phone_hash text;
  v_customer_uses int := 0;

  -- Shipping zone locals
  v_zone record;
  v_has_zones boolean := false;
  v_shipping_zone_id uuid;
  v_shipping_area text;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Resolve store by validated slug
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
  -- 2. Validate buyer inputs
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
  -- 4. Items: catalog products of this store, variant-aware
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

    v_raw_variant_id := NULLIF(btrim(COALESCE(v_item->>'variant_id', '')), '');
    v_parsed_variant_id := NULL;
    IF v_raw_variant_id IS NOT NULL THEN
      BEGIN
        v_parsed_variant_id := v_raw_variant_id::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Validation error: Invalid variant reference' USING ERRCODE = '22P02';
      END;
    END IF;

    v_line_key := v_parsed_prod_id::text || ':' || COALESCE(v_parsed_variant_id::text, 'base');
    IF v_line_key = ANY (v_validated_line_keys) THEN
      RAISE EXCEPTION 'Validation error: Duplicate cart line' USING ERRCODE = '22023';
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

    SELECT count(*) INTO v_active_variant_count
    FROM public.product_variants v
    WHERE v.product_id = v_prod.id AND v.store_id = v_store.id AND v.is_active;

    v_variant_label := NULL;

    IF v_active_variant_count > 0 THEN
      IF v_parsed_variant_id IS NULL THEN
        RAISE EXCEPTION 'Product "%" requires selecting an option', v_prod.name USING ERRCODE = '22023';
      END IF;

      SELECT v.id, v.sku, v.price, v.stock, v.is_active, v.option_value_ids
      INTO v_variant
      FROM public.product_variants v
      WHERE v.id = v_parsed_variant_id
        AND v.product_id = v_prod.id
        AND v.store_id = v_store.id
      FOR SHARE;

      IF NOT FOUND OR v_variant.is_active = false THEN
        RAISE EXCEPTION 'The selected option for "%" is no longer available', v_prod.name USING ERRCODE = '22023';
      END IF;

      IF v_qty > v_variant.stock THEN
        RAISE EXCEPTION 'Only % unit(s) of "%" are available for the selected option', v_variant.stock, v_prod.name USING ERRCODE = '22023';
      END IF;

      v_unit_price := round(COALESCE(v_variant.price, v_prod.price), 2);
      v_sku := NULLIF(btrim(v_variant.sku), '');
      v_parsed_variant_id := v_variant.id;

      SELECT string_agg(o.name || ': ' || ov.value, ' / ' ORDER BY o.position, ov.value)
      INTO v_variant_label
      FROM public.product_option_values ov
      JOIN public.product_options o ON o.id = ov.option_id
      WHERE ov.id = ANY (v_variant.option_value_ids);

      v_variant_label := COALESCE(NULLIF(btrim(v_variant_label), ''), 'Selected option');
    ELSE
      IF v_parsed_variant_id IS NOT NULL THEN
        RAISE EXCEPTION 'Product "%" no longer has options', v_prod.name USING ERRCODE = '22023';
      END IF;

      IF v_qty > v_prod.stock THEN
        RAISE EXCEPTION 'Only % unit(s) of "%" are available in stock', v_prod.stock, v_prod.name USING ERRCODE = '22023';
      END IF;

      v_unit_price := round(v_prod.price, 2);
      v_sku := NULLIF(btrim(v_prod.sku), '');
    END IF;

    v_product_name := COALESCE(NULLIF(btrim(v_prod.name), ''), NULLIF(btrim(v_prod.name_ar), ''), v_prod.name_en, 'Product');

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
      'variant_id', v_parsed_variant_id,
      'variant_label', v_variant_label,
      'product_name', v_product_name,
      'sku', v_sku,
      'unit_price', v_unit_price,
      'quantity', v_qty,
      'line_total', v_line_total
    );
    v_validated_line_keys := array_append(v_validated_line_keys, v_line_key);
  END LOOP;

  ---------------------------------------------------------------------------
  -- 5. Shipping: selected active zone of THIS store, else store defaults.
  --    Mirrors src/lib/shipping.ts exactly.
  ---------------------------------------------------------------------------
  IF NOT v_store.shipping_enabled THEN
    v_shipping_fee := 0;
    v_shipping_zone_id := NULL;
    v_shipping_area := NULL;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.shipping_zones z
      WHERE z.store_id = v_store.id AND z.is_active
    ) INTO v_has_zones;

    IF v_has_zones THEN
      IF p_shipping_zone_id IS NULL THEN
        RAISE EXCEPTION 'Please select a delivery area' USING ERRCODE = '22023';
      END IF;

      SELECT z.id, z.governorate, z.area, z.fee, z.free_shipping_threshold
      INTO v_zone
      FROM public.shipping_zones z
      WHERE z.id = p_shipping_zone_id
        AND z.store_id = v_store.id
        AND z.is_active;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'The selected delivery area is not available for this store' USING ERRCODE = '22023';
      END IF;

      IF p_shipping_governorate IS NOT NULL
         AND btrim(p_shipping_governorate) <> ''
         AND lower(btrim(p_shipping_governorate)) <> lower(v_zone.governorate) THEN
        RAISE EXCEPTION 'The selected delivery area does not match the shipping governorate' USING ERRCODE = '22023';
      END IF;

      v_shipping_zone_id := v_zone.id;
      v_shipping_area := v_zone.governorate || ' — ' || v_zone.area;

      IF v_zone.free_shipping_threshold IS NOT NULL THEN
        v_shipping_fee := CASE
          WHEN v_subtotal >= v_zone.free_shipping_threshold THEN 0
          ELSE round(v_zone.fee, 2)
        END;
      ELSIF v_store.free_shipping_threshold IS NOT NULL
            AND v_subtotal >= v_store.free_shipping_threshold THEN
        v_shipping_fee := 0;
      ELSE
        v_shipping_fee := round(v_zone.fee, 2);
      END IF;
    ELSE
      v_shipping_zone_id := NULL;
      v_shipping_area := NULL;
      IF v_store.free_shipping_threshold IS NOT NULL
         AND v_subtotal >= v_store.free_shipping_threshold THEN
        v_shipping_fee := 0;
      ELSE
        v_shipping_fee := round(v_store.shipping_fee, 2);
      END IF;
    END IF;
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
  -- 7. Coupon redemption (unchanged rules; code string is the only input)
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

    IF v_discount <= 0 THEN
      RAISE EXCEPTION 'Coupon "%" provides no discount for this order', v_coupon_code USING ERRCODE = '22023';
    END IF;
  END IF;

  v_total := v_subtotal - v_discount + v_shipping_fee;
  IF v_total > 9999999999.99 THEN
    RAISE EXCEPTION 'Validation error: Order total exceeds maximum currency precision' USING ERRCODE = '22003';
  END IF;

  ---------------------------------------------------------------------------
  -- 8. Atomic customer directory upsert
  ---------------------------------------------------------------------------
  INSERT INTO public.customers (
    store_id, name, phone, email, address, city, governorate, total_orders, total_spent
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
  -- 9. Collision-resistant order number generation
  ---------------------------------------------------------------------------
  WHILE NOT v_inserted AND v_attempts < 5 LOOP
    v_attempts := v_attempts + 1;
    v_order_number := 'ORD-' || to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYYMMDD') || '-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));

    BEGIN
      INSERT INTO public.orders (
        store_id, customer_id, order_number, customer_name, customer_email,
        customer_phone, shipping_address, shipping_city, shipping_governorate,
        status, payment_status, payment_method, currency, subtotal,
        discount_amount, coupon_code, shipping_fee, total, notes
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
  -- 10. Order item snapshots (variant id + label included)
  ---------------------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_validated_items) LOOP
    INSERT INTO public.order_items (
      order_id, product_id, variant_id, variant_label, product_name, sku,
      unit_price, quantity, line_total
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::uuid,
      NULLIF(v_item->>'variant_id', '')::uuid,
      NULLIF(v_item->>'variant_label', ''),
      v_item->>'product_name',
      v_item->>'sku',
      (v_item->>'unit_price')::numeric,
      (v_item->>'quantity')::int,
      (v_item->>'line_total')::numeric
    );
  END LOOP;

  ---------------------------------------------------------------------------
  -- 11. Coupon usage audit inside the same transaction
  ---------------------------------------------------------------------------
  IF v_coupon_code IS NOT NULL THEN
    INSERT INTO public.coupon_usage (
      coupon_id, store_id, order_id, customer_id, customer_phone_hash,
      discount_amount, order_subtotal, order_total
    ) VALUES (
      v_coupon.id, v_store.id, v_order_id, v_customer_id, v_phone_hash,
      v_discount, v_subtotal, v_total
    );

    UPDATE public.coupons
    SET usage_count = usage_count + 1
    WHERE id = v_coupon.id;
  END IF;

  ---------------------------------------------------------------------------
  -- 12. Result payload
  ---------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'customer_id', v_customer_id,
    'subtotal', v_subtotal,
    'discount_amount', v_discount,
    'coupon_code', v_coupon_code,
    'shipping_fee', v_shipping_fee,
    'shipping_zone_id', v_shipping_zone_id,
    'shipping_area', v_shipping_area,
    'total', v_total,
    'currency', v_store.currency,
    'status', 'Pending',
    'payment_status', 'Unpaid',
    'payment_method', p_payment_method
  );
END;
$$;

-- ==============================================================================
-- 4. PRIVILEGES & COMMENTS
-- ==============================================================================
REVOKE ALL ON FUNCTION public.get_public_store(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_store(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_public_store_products(text, integer, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_store_products(text, integer, integer, text, text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.create_public_store_order(text, text, text, text, text, text, text, text, text, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_store_order(text, text, text, text, text, text, text, text, text, jsonb, text, uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_store IS
  'Safe public storefront config: public store fields, enabled payment methods, published appearance only, and active shipping zones only.';
COMMENT ON FUNCTION public.get_public_store_products IS
  'Safe public catalog: Active products with active variants/options, published review ratings, pagination/search/category and single-product mode.';
COMMENT ON FUNCTION public.create_public_store_order IS
  'Hardened anonymous checkout: catalog/variant pricing, variant-aware stock, mandatory active zone when zones exist, coupon lock/usage, DB rate limit, atomic customer/order creation.';
