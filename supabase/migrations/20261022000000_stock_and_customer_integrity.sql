-- ########## FILE: 20261022000000_stock_and_customer_integrity.sql ##########
-- ==============================================================================
-- KLYVO: STOCK INTEGRITY + CUSTOMER PROFILE PROTECTION  (variant-aware, re-runnable)
-- Migration: 20261022000000_stock_and_customer_integrity.sql
-- Apply AFTER 20261019000005_storefront_rpc_extensions.sql (it re-creates the
-- public checkout, and section 4 below patches the final version).
--
-- Fixes problems found by attacking the public checkout as an anonymous user:
--
-- 1. Stock was checked but never reduced: a product with stock = 1 could be sold
--    again and again. Now every order line reduces stock atomically
--    (row-locked UPDATE ... WHERE stock >= quantity):
--      * a line with a variant  -> product_variants.stock (products.stock is
--        re-derived from variants by the existing trigger),
--      * a line without variant on a product that has no variants -> products.stock,
--      * a manual/custom line (no product) or a variant-owned product ordered
--        without a variant -> unchanged.
--    Cancelling an order gives stock back, re-opening takes it again, deleting a
--    non-cancelled order gives it back.
--
-- 2. Anonymous checkout could overwrite an existing customer's name, email,
--    address, city and governorate by reusing their phone number. When there is
--    no logged-in user (auth.uid() IS NULL) existing non-empty profile fields
--    are now kept; counters still update; the order still stores its own address.
--
-- 3. Two buyers ordering the same item at the same moment could hit a
--    "deadlock detected" error (FOR SHARE lock upgraded to UPDATE). The checkout
--    functions are re-created with FOR UPDATE so the second buyer simply waits
--    and then sees the real remaining stock.
--
-- Safe to run more than once. No existing business function is rewritten by hand.
-- Effect to know: a merchant manual order for more units than are in stock is now
-- rejected ("Insufficient stock").
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1a. One place that changes stock for an order line
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_line_stock(
  p_product_id uuid,
  p_variant_id uuid,
  p_delta integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF p_product_id IS NULL OR p_delta = 0 THEN
    RETURN;
  END IF;

  IF p_variant_id IS NOT NULL THEN
    UPDATE public.product_variants
    SET stock = stock + p_delta
    WHERE id = p_variant_id
      AND stock + p_delta >= 0;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 AND EXISTS (SELECT 1 FROM public.product_variants WHERE id = p_variant_id) THEN
      RAISE EXCEPTION 'Insufficient stock for the selected option' USING ERRCODE = '22023';
    END IF;
    RETURN;
  END IF;

  -- Product with variants but a line without variant: stock is owned by the variants.
  IF EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = p_product_id) THEN
    RETURN;
  END IF;

  UPDATE public.products
  SET stock = stock + p_delta
  WHERE id = p_product_id
    AND stock + p_delta >= 0;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 AND EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Insufficient stock for this product' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.change_line_stock(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 1b. Reduce stock when an order item is created
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_order_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.change_line_stock(NEW.product_id, NEW.variant_id, -NEW.quantity);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_order_item_stock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_order_items_apply_stock ON public.order_items;
CREATE TRIGGER trigger_order_items_apply_stock
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.apply_order_item_stock();

-- ------------------------------------------------------------------------------
-- 1c. Cancel -> give stock back; re-open -> take it again
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_order_stock_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'Cancelled' AND OLD.status <> 'Cancelled' THEN
    FOR r IN
      SELECT product_id, variant_id, SUM(quantity)::integer AS qty
      FROM public.order_items
      WHERE order_id = NEW.id AND product_id IS NOT NULL
      GROUP BY product_id, variant_id
    LOOP
      PERFORM public.change_line_stock(r.product_id, r.variant_id, r.qty);
    END LOOP;

  ELSIF OLD.status = 'Cancelled' AND NEW.status <> 'Cancelled' THEN
    FOR r IN
      SELECT product_id, variant_id, SUM(quantity)::integer AS qty
      FROM public.order_items
      WHERE order_id = NEW.id AND product_id IS NOT NULL
      GROUP BY product_id, variant_id
    LOOP
      PERFORM public.change_line_stock(r.product_id, r.variant_id, -r.qty);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_order_stock_on_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_orders_sync_stock_on_status ON public.orders;
CREATE TRIGGER trigger_orders_sync_stock_on_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_stock_on_status_change();

-- ------------------------------------------------------------------------------
-- 1d. Deleting a non-cancelled order gives its stock back
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restock_on_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
BEGIN
  IF OLD.status <> 'Cancelled' THEN
    FOR r IN
      SELECT product_id, variant_id, SUM(quantity)::integer AS qty
      FROM public.order_items
      WHERE order_id = OLD.id AND product_id IS NOT NULL
      GROUP BY product_id, variant_id
    LOOP
      PERFORM public.change_line_stock(r.product_id, r.variant_id, r.qty);
    END LOOP;
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.restock_on_order_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_orders_restock_on_delete ON public.orders;
CREATE TRIGGER trigger_orders_restock_on_delete
  BEFORE DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.restock_on_order_delete();

-- ------------------------------------------------------------------------------
-- 2. Public checkout must not overwrite an existing customer's profile
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_customer_profile_from_public_checkout()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- auth.uid() is NULL for anonymous storefront checkout (and for raw SQL run as
  -- postgres). A logged-in merchant editing a customer is never affected.
  IF auth.uid() IS NULL THEN
    NEW.name        := COALESCE(NULLIF(btrim(OLD.name), ''),        NEW.name);
    NEW.email       := COALESCE(NULLIF(btrim(OLD.email), ''),       NEW.email);
    NEW.address     := COALESCE(NULLIF(btrim(OLD.address), ''),     NEW.address);
    NEW.city        := COALESCE(NULLIF(btrim(OLD.city), ''),        NEW.city);
    NEW.governorate := COALESCE(NULLIF(btrim(OLD.governorate), ''), NEW.governorate);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_customers_protect_profile ON public.customers;
CREATE TRIGGER trigger_customers_protect_profile
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.protect_customer_profile_from_public_checkout();

-- ------------------------------------------------------------------------------
-- 3/4. Lock "FOR SHARE" -> "FOR UPDATE" in the order-creating functions
-- (CREATE OR REPLACE keeps grants, SECURITY DEFINER and search_path.)
-- ------------------------------------------------------------------------------
DO $patch$
DECLARE
  r record;
  v_def text;
  v_left integer;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('create_public_store_order', 'create_store_order')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF v_def LIKE '%FOR SHARE%' THEN
      EXECUTE replace(v_def, 'FOR SHARE', 'FOR UPDATE');
    END IF;
  END LOOP;

  SELECT count(*) INTO v_left
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('create_public_store_order', 'create_store_order')
    AND p.prosrc LIKE '%FOR SHARE%';

  IF v_left > 0 THEN
    RAISE EXCEPTION 'Lock patch failed: % function(s) still use FOR SHARE', v_left;
  END IF;
END
$patch$;
