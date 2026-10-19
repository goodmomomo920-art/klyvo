-- ==============================================================================
-- KLYVO PRODUCT VARIANTS
-- Migration: 20261019000000_product_variants.sql
-- Description:
--   1. public.product_options       — option groups per product (Size, Color…)
--   2. public.product_option_values — allowed values per option group
--   3. public.product_variants      — purchasable combinations with own SKU /
--                                     price / stock
--   4. order_items.variant_id / variant_label — line-level variant snapshot
--
--   Inventory model (deliberately single-source):
--     - A product WITH variants derives products.stock from the SUM of its
--       active variant stocks via trigger. Merchants manage variant stock.
--     - A product WITHOUT variants keeps using products.stock exactly as
--       before. Deleting every variant leaves the last aggregate untouched.
--     - No second stock ledger is introduced. Orders remain non-decrementing,
--       matching the existing behavior of the catalog (stock is an availability
--       value, not a reservation ledger).
--
--   SKU uniqueness:
--     - Variants are unique per store on (store_id, lower(sku)).
--     - A trigger also rejects a variant SKU that collides with a product SKU
--       and vice-versa, under a per-store advisory transaction lock, so the
--       cross-table invariant cannot race.
--
--   Security:
--     - New tables are RLS-enabled and merchant-only (same policies as
--       products/coupons). anon never reads or writes them directly.
--     - Public ordering goes exclusively through SECURITY DEFINER RPCs added in
--       a separate migration (20261019000005_storefront_rpc_extensions.sql).
--
--   This migration is additive and does not modify any previously applied file.
-- ==============================================================================

-- ==============================================================================
-- 1. OPTION GROUPS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.product_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT product_options_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT product_options_position_non_negative CHECK (position >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_options_product_name_unique
  ON public.product_options (product_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS product_options_store_product_idx
  ON public.product_options (store_id, product_id);

-- ==============================================================================
-- 2. OPTION VALUES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.product_option_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.product_options(id) ON DELETE CASCADE,
  value text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT product_option_values_value_length CHECK (char_length(btrim(value)) BETWEEN 1 AND 60),
  CONSTRAINT product_option_values_position_non_negative CHECK (position >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_option_values_option_value_unique
  ON public.product_option_values (option_id, lower(btrim(value)));
CREATE INDEX IF NOT EXISTS product_option_values_store_product_idx
  ON public.product_option_values (store_id, product_id);

-- ==============================================================================
-- 3. VARIANTS
--    price NULL means "inherit the product price". stock is authoritative for
--    this combination. option_value_ids is kept sorted by trigger so the
--    combination uniqueness constraint is order-independent.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text NOT NULL,
  price numeric(12, 2),
  stock integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  option_value_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT product_variants_sku_length CHECK (char_length(btrim(sku)) BETWEEN 1 AND 120),
  CONSTRAINT product_variants_price_non_negative CHECK (price IS NULL OR price >= 0),
  CONSTRAINT product_variants_price_max CHECK (price IS NULL OR price <= 9999999.99),
  CONSTRAINT product_variants_stock_non_negative CHECK (stock >= 0),
  CONSTRAINT product_variants_option_values_not_empty CHECK (cardinality(option_value_ids) > 0),
  CONSTRAINT product_variants_combination_unique UNIQUE (product_id, option_value_ids)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_store_sku_unique
  ON public.product_variants (store_id, lower(btrim(sku)));
CREATE INDEX IF NOT EXISTS product_variants_store_product_idx
  ON public.product_variants (store_id, product_id);

COMMENT ON TABLE public.product_options IS
  'Merchant-defined option groups for a product (Size, Color, Type…). RLS: owning merchant only.';
COMMENT ON TABLE public.product_option_values IS
  'Allowed values for a product option group. RLS: owning merchant only.';
COMMENT ON TABLE public.product_variants IS
  'Purchasable option combinations. Each row owns its SKU, optional price override and stock. products.stock is derived from active variant stock while variants exist.';
COMMENT ON COLUMN public.product_variants.price IS
  'NULL inherits public.products.price. Otherwise this is the authoritative unit price for the combination.';

-- ==============================================================================
-- 4. TRIGGER: validate + normalize a variant row
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.validate_product_variant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_value_count integer;
  v_option_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = NEW.product_id AND p.store_id = NEW.store_id
  ) THEN
    RAISE EXCEPTION 'Variant product does not belong to this store' USING ERRCODE = '23503';
  END IF;

  IF NEW.option_value_ids IS NULL OR cardinality(NEW.option_value_ids) = 0 THEN
    RAISE EXCEPTION 'A variant must reference at least one option value' USING ERRCODE = '22023';
  END IF;

  IF cardinality(NEW.option_value_ids) <> (
    SELECT count(DISTINCT x) FROM unnest(NEW.option_value_ids) AS x
  ) THEN
    RAISE EXCEPTION 'A variant cannot reference the same option value twice' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), count(DISTINCT pv.option_id)
  INTO v_value_count, v_option_count
  FROM public.product_option_values pv
  WHERE pv.id = ANY (NEW.option_value_ids)
    AND pv.product_id = NEW.product_id
    AND pv.store_id = NEW.store_id;

  IF v_value_count <> cardinality(NEW.option_value_ids) THEN
    RAISE EXCEPTION 'Variant references option values that do not belong to this product and store'
      USING ERRCODE = '22023';
  END IF;

  IF v_option_count <> v_value_count THEN
    RAISE EXCEPTION 'A variant must select exactly one value per option group' USING ERRCODE = '22023';
  END IF;

  -- Canonical ordering makes the combination uniqueness constraint reliable.
  SELECT array_agg(x ORDER BY x) INTO NEW.option_value_ids
  FROM unnest(NEW.option_value_ids) AS x;

  NEW.sku := btrim(NEW.sku);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_product_variants_validate ON public.product_variants;
CREATE TRIGGER trigger_product_variants_validate
  BEFORE INSERT OR UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_product_variant();

-- ==============================================================================
-- 5. TRIGGER: cross-table, store-scoped SKU uniqueness
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.enforce_store_sku_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sku text;
BEGIN
  v_sku := btrim(NEW.sku);
  IF v_sku = '' THEN
    RAISE EXCEPTION 'SKU cannot be empty' USING ERRCODE = '22023';
  END IF;

  -- Serialize SKU allocation per store so the cross-table check cannot race.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.store_id::text));

  IF TG_TABLE_NAME = 'products' THEN
    IF EXISTS (
      SELECT 1 FROM public.product_variants v
      WHERE v.store_id = NEW.store_id
        AND lower(btrim(v.sku)) = lower(v_sku)
    ) THEN
      RAISE EXCEPTION 'SKU "%" is already used by a product variant in this store', v_sku
        USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.store_id = NEW.store_id
        AND p.id <> NEW.id
        AND lower(btrim(p.sku)) = lower(v_sku)
    ) THEN
      RAISE EXCEPTION 'SKU "%" is already used by another product in this store', v_sku
        USING ERRCODE = '23505';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.store_id = NEW.store_id
        AND lower(btrim(p.sku)) = lower(v_sku)
    ) THEN
      RAISE EXCEPTION 'SKU "%" is already used by a product in this store', v_sku
        USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.product_variants v
      WHERE v.store_id = NEW.store_id
        AND v.id <> NEW.id
        AND lower(btrim(v.sku)) = lower(v_sku)
    ) THEN
      RAISE EXCEPTION 'SKU "%" is already used by another variant in this store', v_sku
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_products_sku_uniqueness ON public.products;
CREATE TRIGGER trigger_products_sku_uniqueness
  BEFORE INSERT OR UPDATE OF sku, store_id ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_store_sku_uniqueness();

DROP TRIGGER IF EXISTS trigger_product_variants_sku_uniqueness ON public.product_variants;
CREATE TRIGGER trigger_product_variants_sku_uniqueness
  BEFORE INSERT OR UPDATE OF sku, store_id ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_store_sku_uniqueness();

-- ==============================================================================
-- 6. TRIGGER: derive products.stock from active variants (single source)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.sync_product_stock_from_variants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product_id uuid;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);

  UPDATE public.products p
  SET stock = (
    SELECT COALESCE(SUM(v.stock), 0)::integer
    FROM public.product_variants v
    WHERE v.product_id = p.id AND v.is_active
  )
  WHERE p.id = v_product_id
    AND EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id);

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_product_variants_stock_sync ON public.product_variants;
CREATE TRIGGER trigger_product_variants_stock_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_product_stock_from_variants();

-- ==============================================================================
-- 7. ORDER LINE VARIANT SNAPSHOT
--    variant_id is NULL for non-variant lines. ON DELETE SET NULL preserves the
--    historical order line; variant_label keeps the human-readable combination.
-- ==============================================================================
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_label text;

COMMENT ON COLUMN public.order_items.variant_id IS
  'Variant purchased for this line, or NULL for a simple product line.';
COMMENT ON COLUMN public.order_items.variant_label IS
  'Human-readable snapshot of the purchased combination (e.g. "Size: M / Color: Blue").';

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (merchant-only, mirroring products/coupons)
-- ==============================================================================
ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_option_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_options FROM anon;
REVOKE ALL ON TABLE public.product_option_values FROM anon;
REVOKE ALL ON TABLE public.product_variants FROM anon;
REVOKE ALL ON TABLE public.product_options FROM PUBLIC;
REVOKE ALL ON TABLE public.product_option_values FROM PUBLIC;
REVOKE ALL ON TABLE public.product_variants FROM PUBLIC;

DROP POLICY IF EXISTS "Merchants can view their product options" ON public.product_options;
CREATE POLICY "Merchants can view their product options"
  ON public.product_options FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_options.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can create their product options" ON public.product_options;
CREATE POLICY "Merchants can create their product options"
  ON public.product_options FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_options.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can update their product options" ON public.product_options;
CREATE POLICY "Merchants can update their product options"
  ON public.product_options FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_options.store_id AND s.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_options.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can delete their product options" ON public.product_options;
CREATE POLICY "Merchants can delete their product options"
  ON public.product_options FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_options.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can view their product option values" ON public.product_option_values;
CREATE POLICY "Merchants can view their product option values"
  ON public.product_option_values FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_option_values.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can create their product option values" ON public.product_option_values;
CREATE POLICY "Merchants can create their product option values"
  ON public.product_option_values FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_option_values.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can update their product option values" ON public.product_option_values;
CREATE POLICY "Merchants can update their product option values"
  ON public.product_option_values FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_option_values.store_id AND s.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_option_values.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can delete their product option values" ON public.product_option_values;
CREATE POLICY "Merchants can delete their product option values"
  ON public.product_option_values FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_option_values.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can view their product variants" ON public.product_variants;
CREATE POLICY "Merchants can view their product variants"
  ON public.product_variants FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_variants.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can create their product variants" ON public.product_variants;
CREATE POLICY "Merchants can create their product variants"
  ON public.product_variants FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_variants.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can update their product variants" ON public.product_variants;
CREATE POLICY "Merchants can update their product variants"
  ON public.product_variants FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_variants.store_id AND s.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_variants.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can delete their product variants" ON public.product_variants;
CREATE POLICY "Merchants can delete their product variants"
  ON public.product_variants FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_variants.store_id AND s.owner_id = (SELECT auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_option_values TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_variants TO authenticated;
