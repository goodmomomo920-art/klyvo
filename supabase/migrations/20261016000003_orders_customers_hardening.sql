-- ==============================================================================
-- KLYVO ORDERS & CUSTOMERS FOCUSED HARDENING
-- Migration: 20261016000003_orders_customers_hardening.sql
-- Description: 
--   1. Enforces strict numeric bounds (rejects NaN, Infinity, negative, excessive, overflow).
--   2. Strengthens same-store customer/product integrity with unique constraints & row locks.
--   3. Restricts order-number unique retries specifically to `orders_order_number_unique`.
--   4. Explicitly enforces that archived products cannot be ordered.
--   5. Reviews and secures search_path and EXECUTE privileges for all SECURITY DEFINER functions.
-- ==============================================================================

-- ==============================================================================
-- 1. DECLARATIVE UNIQUE CONSTRAINTS FOR COMPOSITE INTEGRITY
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_store_id_id_unique'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_store_id_id_unique UNIQUE (store_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_store_id_id_unique'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_store_id_id_unique UNIQUE (store_id, id);
  END IF;
END $$;

-- ==============================================================================
-- 2. HARDENED REFERENTIAL INTEGRITY TRIGGERS WITH ROW LOCKING
-- ==============================================================================

-- Trigger function: Verify order customer belongs to order store with row lock
CREATE OR REPLACE FUNCTION public.check_order_customer_store()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    -- Use FOR SHARE to lock the customer row and prevent concurrent store transfer/deletion
    IF NOT EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = NEW.customer_id AND store_id = NEW.store_id
      FOR SHARE
    ) THEN
      RAISE EXCEPTION 'Cross-store violation: Customer % does not belong to store %', NEW.customer_id, NEW.store_id
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger function: Verify order item product belongs to order store with row lock
CREATE OR REPLACE FUNCTION public.check_order_item_product_store()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_store_id uuid;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT store_id INTO v_order_store_id
    FROM public.orders
    WHERE id = NEW.order_id;

    IF v_order_store_id IS NULL THEN
      RAISE EXCEPTION 'Parent order % not found for order item %', NEW.order_id, NEW.id
        USING ERRCODE = '23503';
    END IF;

    -- Use FOR SHARE to lock the product row and prevent concurrent store transfer/deletion
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = NEW.product_id AND store_id = v_order_store_id
      FOR SHARE
    ) THEN
      RAISE EXCEPTION 'Cross-store violation: Product % does not belong to the store of order %', NEW.product_id, NEW.order_id
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure triggers exist
DROP TRIGGER IF EXISTS trigger_check_order_customer_store ON public.orders;
CREATE TRIGGER trigger_check_order_customer_store
  BEFORE INSERT OR UPDATE OF customer_id, store_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.check_order_customer_store();

DROP TRIGGER IF EXISTS trigger_check_order_item_product_store ON public.order_items;
CREATE TRIGGER trigger_check_order_item_product_store
  BEFORE INSERT OR UPDATE OF product_id, order_id ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.check_order_item_product_store();

-- Ensure handle_updated_at has safe search_path
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ==============================================================================
-- 3. HARDENED ATOMIC ORDER CREATION RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_store_order(
  p_store_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_shipping_address text,
  p_shipping_city text,
  p_shipping_governorate text,
  p_payment_method text,
  p_shipping_fee numeric,
  p_notes text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(12, 2) := 0;
  v_shipping_fee numeric(12, 2);
  v_total numeric(12, 2);
  v_item jsonb;
  v_prod record;
  v_raw_prod_id text;
  v_parsed_prod_id uuid;
  v_unit_price numeric(12, 2);
  v_raw_price text;
  v_raw_qty text;
  v_qty int;
  v_line_total numeric(12, 2);
  v_product_name text;
  v_sku text;
  v_attempts int := 0;
  v_inserted boolean := false;
  v_err_constraint text;
  v_validated_items jsonb := '[]'::jsonb;
BEGIN
  -- 1. Authentication & Tenant Authorization Check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Validation error: store_id cannot be null' USING ERRCODE = '22004';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id AND owner_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'Forbidden: Store does not belong to the authenticated merchant' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Text Inputs
  IF p_customer_name IS NULL OR char_length(trim(p_customer_name)) = 0 THEN
    RAISE EXCEPTION 'Validation error: Customer name is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(trim(p_customer_name)) > 255 THEN
    RAISE EXCEPTION 'Validation error: Customer name exceeds 255 characters' USING ERRCODE = '22023';
  END IF;

  IF p_customer_phone IS NULL OR char_length(trim(p_customer_phone)) = 0 THEN
    RAISE EXCEPTION 'Validation error: Customer phone number is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(trim(p_customer_phone)) > 50 THEN
    RAISE EXCEPTION 'Validation error: Customer phone exceeds 50 characters' USING ERRCODE = '22023';
  END IF;

  IF p_customer_email IS NOT NULL AND char_length(trim(p_customer_email)) > 255 THEN
    RAISE EXCEPTION 'Validation error: Customer email exceeds 255 characters' USING ERRCODE = '22023';
  END IF;

  IF p_shipping_address IS NULL OR char_length(trim(p_shipping_address)) = 0 THEN
    RAISE EXCEPTION 'Validation error: Shipping address is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(trim(p_shipping_address)) > 500 THEN
    RAISE EXCEPTION 'Validation error: Shipping address exceeds 500 characters' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method NOT IN ('Cash on Delivery', 'InstaPay', 'Vodafone Cash', 'Credit / Debit Card') THEN
    RAISE EXCEPTION 'Validation error: Invalid payment method "%"', p_payment_method USING ERRCODE = '22023';
  END IF;

  -- 3. Validate Shipping Fee Numeric Bounds (precision and non-negative)
  IF p_shipping_fee IS NULL THEN
    RAISE EXCEPTION 'Validation error: Shipping fee cannot be null' USING ERRCODE = '22023';
  END IF;

  IF p_shipping_fee < 0 OR p_shipping_fee > 999999.99 THEN
    RAISE EXCEPTION 'Validation error: Shipping fee must be between 0 and 999,999.99 EGP' USING ERRCODE = '22023';
  END IF;
  v_shipping_fee := round(p_shipping_fee, 2);

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Validation error: An order must contain at least one item' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'Validation error: An order cannot contain more than 100 line items' USING ERRCODE = '22023';
  END IF;

  -- 4. Validate Line Items with Safe Numeric Bounds & Server-Enforced Pricing
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_raw_qty := v_item->>'quantity';
    IF v_raw_qty IS NULL OR NOT (v_raw_qty ~ '^[0-9]{1,6}$') THEN
      RAISE EXCEPTION 'Validation error: Item quantity must be a positive integer between 1 and 100,000' USING ERRCODE = '22023';
    END IF;

    v_qty := v_raw_qty::int;
    IF v_qty <= 0 OR v_qty > 100000 THEN
      RAISE EXCEPTION 'Validation error: Item quantity must be between 1 and 100,000' USING ERRCODE = '22023';
    END IF;

    v_raw_prod_id := trim(COALESCE(v_item->>'product_id', v_item->>'productId', ''));

    IF v_raw_prod_id <> '' THEN
      -- Validate UUID syntax
      BEGIN
        v_parsed_prod_id := v_raw_prod_id::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Validation error: Invalid product UUID "%"', v_raw_prod_id USING ERRCODE = '22P02';
      END;

      -- Catalog lookup: strictly for this tenant store with FOR SHARE lock
      SELECT id, name, name_ar, name_en, sku, price, status
      INTO v_prod
      FROM public.products
      WHERE id = v_parsed_prod_id AND store_id = p_store_id
      FOR SHARE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % does not exist in store %', v_parsed_prod_id, p_store_id USING ERRCODE = '23503';
      END IF;

      -- Enforce: Archived products cannot be added to new orders
      IF v_prod.status = 'Archived' THEN
        RAISE EXCEPTION 'Product "%" is archived and cannot be ordered', v_product_name USING ERRCODE = '22023';
      END IF;

      -- Overwrite with authoritative database values
      v_unit_price := round(v_prod.price, 2);
      v_product_name := COALESCE(NULLIF(trim(v_prod.name), ''), NULLIF(trim(v_prod.name_ar), ''), v_prod.name_en, 'Product');
      v_sku := NULLIF(trim(v_prod.sku), '');
    ELSE
      -- Manual custom line item
      v_parsed_prod_id := NULL;
      v_product_name := trim(COALESCE(v_item->>'product_name', v_item->>'productName', ''));
      IF char_length(v_product_name) = 0 THEN
        RAISE EXCEPTION 'Validation error: Line item name cannot be empty' USING ERRCODE = '22023';
      END IF;
      IF char_length(v_product_name) > 255 THEN
        RAISE EXCEPTION 'Validation error: Line item name exceeds 255 characters' USING ERRCODE = '22023';
      END IF;

      v_raw_price := COALESCE(v_item->>'unit_price', v_item->>'unitPrice');
      IF v_raw_price IS NULL OR NOT (v_raw_price ~ '^[0-9]+(\.[0-9]{1,4})?$') THEN
        RAISE EXCEPTION 'Validation error: Line item unit price must be a valid non-negative number' USING ERRCODE = '22023';
      END IF;

      BEGIN
        v_unit_price := v_raw_price::numeric;
      EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
        RAISE EXCEPTION 'Validation error: Line item unit price is out of allowed range' USING ERRCODE = '22003';
      END;

      IF v_unit_price < 0 OR v_unit_price > 9999999.99 THEN
        RAISE EXCEPTION 'Validation error: Line item unit price must be between 0 and 9,999,999.99 EGP' USING ERRCODE = '22023';
      END IF;
      v_unit_price := round(v_unit_price, 2);

      v_sku := NULLIF(trim(COALESCE(v_item->>'sku', '')), '');
      IF v_sku IS NOT NULL AND char_length(v_sku) > 100 THEN
        RAISE EXCEPTION 'Validation error: Line item SKU exceeds 100 characters' USING ERRCODE = '22023';
      END IF;
    END IF;

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
  END LOOP;

  v_total := v_subtotal + v_shipping_fee;
  IF v_total > 9999999999.99 THEN
    RAISE EXCEPTION 'Validation error: Order total exceeds maximum currency precision' USING ERRCODE = '22003';
  END IF;

  -- 5. Atomic Customer Directory Upsert with Aggregates
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
    p_store_id,
    trim(p_customer_name),
    trim(p_customer_phone),
    NULLIF(trim(p_customer_email), ''),
    trim(p_shipping_address),
    COALESCE(trim(p_shipping_city), ''),
    COALESCE(trim(p_shipping_governorate), ''),
    1,
    v_total
  )
  ON CONFLICT (store_id, phone) DO UPDATE
  SET total_orders = public.customers.total_orders + 1,
      total_spent = round(public.customers.total_spent + EXCLUDED.total_spent, 2),
      name = CASE WHEN trim(EXCLUDED.name) <> '' THEN trim(EXCLUDED.name) ELSE public.customers.name END,
      email = COALESCE(EXCLUDED.email, public.customers.email),
      address = CASE WHEN trim(EXCLUDED.address) <> '' THEN trim(EXCLUDED.address) ELSE public.customers.address END,
      city = CASE WHEN trim(EXCLUDED.city) <> '' THEN trim(EXCLUDED.city) ELSE public.customers.city END,
      governorate = CASE WHEN trim(EXCLUDED.governorate) <> '' THEN trim(EXCLUDED.governorate) ELSE public.customers.governorate END,
      updated_at = now()
  RETURNING id INTO v_customer_id;

  -- 6. Collision-Resistant Order Number Generation with Targeted Conflict Handling
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
        p_store_id,
        v_customer_id,
        v_order_number,
        trim(p_customer_name),
        NULLIF(trim(p_customer_email), ''),
        trim(p_customer_phone),
        trim(p_shipping_address),
        COALESCE(trim(p_shipping_city), ''),
        COALESCE(trim(p_shipping_governorate), ''),
        'Pending',
        'Unpaid',
        p_payment_method,
        'EGP',
        v_subtotal,
        v_shipping_fee,
        v_total,
        COALESCE(trim(p_notes), '')
      ) RETURNING id INTO v_order_id;

      v_inserted := true;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_err_constraint = CONSTRAINT_NAME;
      IF v_err_constraint = 'orders_order_number_unique' THEN
        -- Only retry for order_number collision
        IF v_attempts >= 5 THEN
          RAISE EXCEPTION 'Failed to allocate unique order number after 5 attempts' USING ERRCODE = '23505';
        END IF;
      ELSE
        -- Re-raise immediately if it is any other unique constraint violation
        RAISE;
      END IF;
    END;
  END LOOP;

  -- 7. Insert Order Items Snapshots
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
      CASE WHEN (v_item->>'product_id') IS NOT NULL THEN (v_item->>'product_id')::uuid ELSE NULL END,
      v_item->>'product_name',
      v_item->>'sku',
      (v_item->>'unit_price')::numeric,
      (v_item->>'quantity')::int,
      (v_item->>'line_total')::numeric
    );
  END LOOP;

  -- 8. Return Result Payload
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'customer_id', v_customer_id,
    'subtotal', v_subtotal,
    'shipping_fee', v_shipping_fee,
    'total', v_total,
    'status', 'Pending',
    'payment_status', 'Unpaid',
    'payment_method', p_payment_method
  );
END;
$$;

-- ==============================================================================
-- 4. FUNCTION PRIVILEGES & SECURITY REVIEW
-- ==============================================================================

-- Revoke execute from public & anon on RPC; grant solely to authenticated
REVOKE EXECUTE ON FUNCTION public.create_store_order(uuid, text, text, text, text, text, text, text, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_store_order(uuid, text, text, text, text, text, text, text, numeric, text, jsonb) TO authenticated;

-- Ensure triggers can be executed by authenticated role during DML
GRANT EXECUTE ON FUNCTION public.check_order_customer_store() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_order_item_product_store() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_customer_store_update() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_product_store_update() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO authenticated;

COMMENT ON FUNCTION public.create_store_order IS 'Hardened atomic merchant order creation RPC with numeric bound checks, target unique violation handling, and archived product restriction.';
