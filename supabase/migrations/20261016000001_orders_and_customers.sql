-- ==============================================================================
-- KLYVO ORDERS & CUSTOMERS FOUNDATION
-- Migration: 20261016000001_orders_and_customers.sql
-- Description: Adds tenant-scoped tables for customers, orders, and order_items
--              with historical item snapshots, foreign keys, cascade rules,
--              performance indexes, and Row Level Security (RLS) policies.
-- ==============================================================================

-- ==============================================================================
-- 1. TABLE: customers
-- Customers belong strictly to a store tenant. In Egypt, phone number is
-- the primary identification key along with optional email.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text NOT NULL,
  address text DEFAULT '',
  city text DEFAULT '',
  governorate text DEFAULT '',
  total_orders integer NOT NULL DEFAULT 0,
  total_spent numeric(12, 2) NOT NULL DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT customers_name_not_empty CHECK (char_length(trim(name)) > 0),
  CONSTRAINT customers_phone_not_empty CHECK (char_length(trim(phone)) > 0),
  CONSTRAINT customers_total_orders_non_negative CHECK (total_orders >= 0),
  CONSTRAINT customers_total_spent_non_negative CHECK (total_spent >= 0),
  CONSTRAINT customers_store_phone_unique UNIQUE (store_id, phone)
);

-- Documentation
COMMENT ON TABLE public.customers IS 'Store-scoped customer directory for merchants in Klyvo.';
COMMENT ON COLUMN public.customers.store_id IS 'Foreign key to public.stores establishing multi-tenant ownership.';
COMMENT ON COLUMN public.customers.phone IS 'Customer primary contact phone number, unique per store.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON public.customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_store_created_at ON public.customers(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_store_email ON public.customers(store_id, email);

-- Updated_at Trigger
DROP TRIGGER IF EXISTS trigger_customers_updated_at ON public.customers;
CREATE TRIGGER trigger_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 2. TABLE: orders
-- Orders placed with a merchant store, capturing status, payment details,
-- and Egyptian delivery destination.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_number text NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text NOT NULL,
  shipping_address text NOT NULL,
  shipping_city text DEFAULT '',
  shipping_governorate text DEFAULT '',
  status text NOT NULL DEFAULT 'Pending',
  payment_status text NOT NULL DEFAULT 'Unpaid',
  payment_method text NOT NULL DEFAULT 'Cash on Delivery',
  currency text NOT NULL DEFAULT 'EGP',
  subtotal numeric(12, 2) NOT NULL DEFAULT 0.00,
  shipping_fee numeric(12, 2) NOT NULL DEFAULT 0.00,
  total numeric(12, 2) NOT NULL DEFAULT 0.00,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT orders_order_number_unique UNIQUE (store_id, order_number),
  CONSTRAINT orders_customer_name_not_empty CHECK (char_length(trim(customer_name)) > 0),
  CONSTRAINT orders_customer_phone_not_empty CHECK (char_length(trim(customer_phone)) > 0),
  CONSTRAINT orders_shipping_address_not_empty CHECK (char_length(trim(shipping_address)) > 0),
  CONSTRAINT orders_subtotal_non_negative CHECK (subtotal >= 0),
  CONSTRAINT orders_shipping_fee_non_negative CHECK (shipping_fee >= 0),
  CONSTRAINT orders_total_non_negative CHECK (total >= 0),
  CONSTRAINT orders_status_valid CHECK (status IN ('Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled')),
  CONSTRAINT orders_payment_status_valid CHECK (payment_status IN ('Unpaid', 'Paid', 'Refunded')),
  CONSTRAINT orders_payment_method_valid CHECK (payment_method IN ('Cash on Delivery', 'InstaPay', 'Vodafone Cash', 'Credit / Debit Card'))
);

-- Documentation
COMMENT ON TABLE public.orders IS 'Merchant customer orders with delivery and payment status tracking.';
COMMENT ON COLUMN public.orders.order_number IS 'Unique merchant order identifier formatted as ORD-YYYYMMDD-RANDOM.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_created_at ON public.orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_store_status ON public.orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_store_customer_id ON public.orders(store_id, customer_id);

-- Updated_at Trigger
DROP TRIGGER IF EXISTS trigger_orders_updated_at ON public.orders;
CREATE TRIGGER trigger_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 3. TABLE: order_items
-- Historical item snapshot preserving product name, SKU, price, and line totals.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  sku text,
  unit_price numeric(12, 2) NOT NULL,
  quantity integer NOT NULL,
  line_total numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT order_items_product_name_not_empty CHECK (char_length(trim(product_name)) > 0),
  CONSTRAINT order_items_unit_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT order_items_line_total_non_negative CHECK (line_total >= 0)
);

-- Documentation
COMMENT ON TABLE public.order_items IS 'Line item snapshots for orders preserving historical pricing and quantities.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict multi-tenant isolation: Merchants can only access data belonging to
-- stores they own.
-- ==============================================================================

-- Enable and force RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Policies for public.customers
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Merchants can view customers of their stores" ON public.customers;
CREATE POLICY "Merchants can view customers of their stores"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = customers.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can insert customers for their stores" ON public.customers;
CREATE POLICY "Merchants can insert customers for their stores"
  ON public.customers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = customers.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can update customers of their stores" ON public.customers;
CREATE POLICY "Merchants can update customers of their stores"
  ON public.customers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = customers.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = customers.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can delete customers of their stores" ON public.customers;
CREATE POLICY "Merchants can delete customers of their stores"
  ON public.customers
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = customers.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- Policies for public.orders
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Merchants can view orders of their stores" ON public.orders;
CREATE POLICY "Merchants can view orders of their stores"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = orders.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can insert orders for their stores" ON public.orders;
CREATE POLICY "Merchants can insert orders for their stores"
  ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = orders.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can update orders of their stores" ON public.orders;
CREATE POLICY "Merchants can update orders of their stores"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = orders.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = orders.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can delete orders of their stores" ON public.orders;
CREATE POLICY "Merchants can delete orders of their stores"
  ON public.orders
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = orders.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- Policies for public.order_items
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Merchants can view order items of their stores" ON public.order_items;
CREATE POLICY "Merchants can view order items of their stores"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.stores s ON s.id = o.store_id
      WHERE o.id = order_items.order_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can insert order items for their stores" ON public.order_items;
CREATE POLICY "Merchants can insert order items for their stores"
  ON public.order_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.stores s ON s.id = o.store_id
      WHERE o.id = order_items.order_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can update order items of their stores" ON public.order_items;
CREATE POLICY "Merchants can update order items of their stores"
  ON public.order_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.stores s ON s.id = o.store_id
      WHERE o.id = order_items.order_id
        AND s.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.stores s ON s.id = o.store_id
      WHERE o.id = order_items.order_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can delete order items of their stores" ON public.order_items;
CREATE POLICY "Merchants can delete order items of their stores"
  ON public.order_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.stores s ON s.id = o.store_id
      WHERE o.id = order_items.order_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

-- ==============================================================================
-- 5. TABLE PRIVILEGES (GRANTS)
-- Grant CRUD privileges strictly to the authenticated role.
-- No privileges granted to anon.
-- ==============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_items TO authenticated;
