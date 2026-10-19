-- ==============================================================================
-- KLYVO MULTI-TENANT DATABASE FOUNDATION
-- Migration: 20261016000000_secure_multi_tenant_foundation.sql
-- Description: Creates the stores and products tables with strict foreign keys,
--              constraints, performance indexes, and restrictive Row Level Security (RLS)
--              policies guaranteeing full cross-tenant data isolation.
-- ==============================================================================

-- 1. UTILITY: Automated updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 2. TABLE: stores (Tenant root)
-- Each merchant account in auth.users can own one or more stores.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  currency text NOT NULL DEFAULT 'EGP',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT stores_name_not_empty CHECK (char_length(trim(name)) > 0),
  CONSTRAINT stores_slug_not_empty CHECK (char_length(trim(slug)) > 0),
  CONSTRAINT stores_slug_unique UNIQUE (slug),
  CONSTRAINT stores_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT stores_currency_format CHECK (char_length(trim(currency)) = 3)
);

-- Comments for documentation & schema introspection
COMMENT ON TABLE public.stores IS 'Merchant store tenants in Klyvo. Owned by an authenticated Supabase user.';
COMMENT ON COLUMN public.stores.id IS 'Unique identifier for the store (tenant key).';
COMMENT ON COLUMN public.stores.owner_id IS 'Foreign key to auth.users indicating the store merchant.';
COMMENT ON COLUMN public.stores.slug IS 'Unique URL slug for public storefront identification.';

-- Performance Indexes for stores
CREATE INDEX IF NOT EXISTS idx_stores_owner_id ON public.stores(owner_id);

-- Trigger for stores updated_at
DROP TRIGGER IF EXISTS trigger_stores_updated_at ON public.stores;
CREATE TRIGGER trigger_stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 3. TABLE: products
-- Products belong strictly to a store_id. Cannot exist without a valid store.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_ar text,
  name_en text,
  sku text NOT NULL,
  description text DEFAULT '',
  category text NOT NULL DEFAULT 'General Merchandise',
  price numeric(12, 2) NOT NULL,
  compare_at_price numeric(12, 2),
  stock integer NOT NULL DEFAULT 0,
  image_url text,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT products_name_not_empty CHECK (char_length(trim(name)) > 0),
  CONSTRAINT products_price_non_negative CHECK (price >= 0),
  CONSTRAINT products_compare_at_price_non_negative CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  CONSTRAINT products_stock_non_negative CHECK (stock >= 0),
  CONSTRAINT products_status_valid CHECK (status IN ('Active', 'Draft', 'Archived')),
  CONSTRAINT products_store_sku_unique UNIQUE (store_id, sku)
);

-- Comments for products
COMMENT ON TABLE public.products IS 'Catalog items strictly isolated per store tenant.';
COMMENT ON COLUMN public.products.store_id IS 'Foreign key to public.stores establishing multi-tenant ownership.';
COMMENT ON COLUMN public.products.sku IS 'Stock Keeping Unit, unique per store.';

-- Performance Indexes for products
CREATE INDEX IF NOT EXISTS idx_products_store_status ON public.products(store_id, status);
CREATE INDEX IF NOT EXISTS idx_products_store_category ON public.products(store_id, category);
CREATE INDEX IF NOT EXISTS idx_products_store_created_at ON public.products(store_id, created_at DESC);

-- Trigger for products updated_at
DROP TRIGGER IF EXISTS trigger_products_updated_at ON public.products;
CREATE TRIGGER trigger_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict isolation: Merchants can only access data belonging to stores they own.
-- Anonymous / unauthenticated access is completely rejected.
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores FORCE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Policies for public.stores
-- ------------------------------------------------------------------------------

-- SELECT: Merchants can only view stores they own
DROP POLICY IF EXISTS "Merchants can view their own stores" ON public.stores;
CREATE POLICY "Merchants can view their own stores"
  ON public.stores
  FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- INSERT: Merchants can only create stores where owner_id is their own auth.uid()
DROP POLICY IF EXISTS "Merchants can insert their own stores" ON public.stores;
CREATE POLICY "Merchants can insert their own stores"
  ON public.stores
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

-- UPDATE: Merchants can only update stores they own
DROP POLICY IF EXISTS "Merchants can update their own stores" ON public.stores;
CREATE POLICY "Merchants can update their own stores"
  ON public.stores
  FOR UPDATE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

-- DELETE: Merchants can only delete stores they own
DROP POLICY IF EXISTS "Merchants can delete their own stores" ON public.stores;
CREATE POLICY "Merchants can delete their own stores"
  ON public.stores
  FOR DELETE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- ------------------------------------------------------------------------------
-- Policies for public.products
-- Cross-table tenant check: products can only be accessed if products.store_id
-- belongs to a store owned by (SELECT auth.uid()).
-- ------------------------------------------------------------------------------

-- SELECT: Merchants can only view products belonging to their authorized stores
DROP POLICY IF EXISTS "Merchants can view products of their stores" ON public.products;
CREATE POLICY "Merchants can view products of their stores"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = products.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

-- INSERT: Merchants can only insert products into stores they own
DROP POLICY IF EXISTS "Merchants can insert products into their stores" ON public.products;
CREATE POLICY "Merchants can insert products into their stores"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = products.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

-- UPDATE: Merchants can only update products in stores they own and cannot transfer
-- a product to another store unless they also own the destination store
DROP POLICY IF EXISTS "Merchants can update products in their stores" ON public.products;
CREATE POLICY "Merchants can update products in their stores"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = products.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = products.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

-- DELETE: Merchants can only delete products in stores they own
DROP POLICY IF EXISTS "Merchants can delete products in their stores" ON public.products;
CREATE POLICY "Merchants can delete products in their stores"
  ON public.products
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = products.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

-- ==============================================================================
-- 5. TABLE PRIVILEGES (GRANTS)
-- Grant CRUD privileges to authenticated role only.
-- Tenant isolation is strictly enforced by the RLS policies above.
-- Unauthenticated (anon) access is completely disallowed.
-- ==============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;

