-- ==============================================================================
-- KLYVO STORE SETTINGS
-- Migration: 20261016000004_store_settings.sql
-- Description:
--   1. Adds profile, branding, regional, and shipping settings columns to
--      public.stores (additive; all columns have safe defaults so existing
--      inserts and rows keep working unchanged).
--   2. Adds public.store_payment_methods for configuring the four payment
--      methods supported by the existing order model (Cash on Delivery,
--      InstaPay, Vodafone Cash, Credit / Debit Card). This is MERCHANT
--      CONFIGURATION ONLY -- it does not collect or process payments and must
--      never store payment secrets.
--   3. Enforces Row Level Security mirroring migrations 0000-0001 so a store
--      can only read and mutate its own settings.
-- ==============================================================================

-- ==============================================================================
-- 1. STORE SETTINGS COLUMNS (additive ALTERs on public.stores)
-- ==============================================================================

-- Store profile
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS description text DEFAULT '';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS address text DEFAULT '';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS city text DEFAULT '';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS governorate text DEFAULT '';

-- Appearance (Klyvo identity defaults: electric blue on black)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#2563EB';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS secondary_color text NOT NULL DEFAULT '#09090B';

-- Regional preferences (EGP is the default currency defined in migration 0000)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Cairo';

-- Shipping settings (merchant configuration only, no courier integration)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS shipping_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS shipping_fee numeric(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS free_shipping_threshold numeric(12, 2);

-- ==============================================================================
-- 2. CHECK CONSTRAINTS (server-side amounts are additionally validated in the
--    Next.js server actions; these are the database backstops)
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_description_max_length') THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_description_max_length
      CHECK (description IS NULL OR char_length(description) <= 2000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_logo_url_format') THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_logo_url_format
      CHECK (
        logo_url IS NULL
        OR (logo_url ~* '^https?://[^[:space:]]+$' AND char_length(logo_url) <= 2048)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_contact_email_format') THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_contact_email_format
      CHECK (
        contact_email IS NULL
        OR (contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
            AND char_length(contact_email) <= 255)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_contact_phone_max_length') THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_contact_phone_max_length
      CHECK (contact_phone IS NULL OR (char_length(trim(contact_phone)) <= 50));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_address_max_length') THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_address_max_length
      CHECK (address IS NULL OR char_length(address) <= 500);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_city_max_length') THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_city_max_length
      CHECK (city IS NULL OR char_length(city) <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_governorate_max_length') THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_governorate_max_length
      CHECK (governorate IS NULL OR char_length(governorate) <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_color_format') THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_color_format
      CHECK (
        primary_color ~ '^#[0-9a-fA-F]{6}$'
        AND secondary_color ~ '^#[0-9a-fA-F]{6}$'
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_language_valid') THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_language_valid
      CHECK (language IN ('en', 'ar'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_timezone_format') THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_timezone_format
      CHECK (
        char_length(trim(timezone)) > 0
        AND char_length(timezone) <= 100
        AND timezone ~ '^[A-Za-z][A-Za-z0-9_+\-/]*$'
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_shipping_fee_bounds') THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_shipping_fee_bounds
      CHECK (shipping_fee >= 0 AND shipping_fee <= 999999.99);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_free_shipping_threshold_bounds') THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_free_shipping_threshold_bounds
      CHECK (free_shipping_threshold IS NULL OR (free_shipping_threshold >= 0 AND free_shipping_threshold <= 999999.99));
  END IF;
END $$;

-- ==============================================================================
-- 3. TABLE: store_payment_methods
--    Merchant configuration for the payment methods the existing order model
--    (migrations 0001-0003) accepts. Instructions are free-form merchant notes
--    shown to customers at checkout. No card numbers, CVVs, passwords, tokens,
--    wallet numbers, or other payment secrets are ever stored here.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.store_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  method text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  instructions text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT store_payment_methods_method_valid
    CHECK (method IN ('Cash on Delivery', 'InstaPay', 'Vodafone Cash', 'Credit / Debit Card')),
  CONSTRAINT store_payment_methods_instructions_max_length
    CHECK (char_length(instructions) <= 1000),
  CONSTRAINT store_payment_methods_store_method_unique UNIQUE (store_id, method)
);

COMMENT ON TABLE public.store_payment_methods IS
  'Merchant-side enable/disable configuration and customer-facing instructions for each supported payment method. Configuration only; does not process or collect payments and must never hold payment credentials.';

CREATE INDEX IF NOT EXISTS idx_store_payment_methods_store_id
  ON public.store_payment_methods(store_id);

DROP TRIGGER IF EXISTS trigger_store_payment_methods_updated_at ON public.store_payment_methods;
CREATE TRIGGER trigger_store_payment_methods_updated_at
  BEFORE UPDATE ON public.store_payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Seed configuration rows for all existing stores (idempotent)
INSERT INTO public.store_payment_methods (store_id, method, enabled)
SELECT s.id, m.method, true
FROM public.stores s
CROSS JOIN (
  VALUES
    ('Cash on Delivery'),
    ('InstaPay'),
    ('Vodafone Cash'),
    ('Credit / Debit Card')
) AS m(method)
ON CONFLICT (store_id, method) DO NOTHING;

-- ==============================================================================
-- 4. ROW LEVEL SECURITY
--    Same isolation model as migrations 0000-0001: merchants may only read or
--    mutate their own store's settings.
-- ==============================================================================

ALTER TABLE public.store_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_payment_methods FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Merchants can view payment methods of their stores" ON public.store_payment_methods;
CREATE POLICY "Merchants can view payment methods of their stores"
  ON public.store_payment_methods
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_payment_methods.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can insert payment methods for their stores" ON public.store_payment_methods;
CREATE POLICY "Merchants can insert payment methods for their stores"
  ON public.store_payment_methods
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_payment_methods.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can update payment methods of their stores" ON public.store_payment_methods;
CREATE POLICY "Merchants can update payment methods of their stores"
  ON public.store_payment_methods
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_payment_methods.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_payment_methods.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Merchants can delete payment methods of their stores" ON public.store_payment_methods;
CREATE POLICY "Merchants can delete payment methods of their stores"
  ON public.store_payment_methods
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_payment_methods.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

-- ==============================================================================
-- 5. TABLE PRIVILEGES (GRANTS)
-- ==============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_payment_methods TO authenticated;
