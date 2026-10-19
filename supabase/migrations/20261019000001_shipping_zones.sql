-- ==============================================================================
-- KLYVO SHIPPING ZONES (EGYPT)
-- Migration: 20261019000001_shipping_zones.sql
-- Description:
--   Adds per-store delivery areas. Each row is one governorate + area with its
--   own fee and optional free-shipping threshold. When a store has at least one
--   active zone, checkout must select one of those zones; otherwise the store's
--   existing default shipping settings continue to apply unchanged.
--
--   Rules (mirrored exactly in src/lib/shipping.ts and enforced authoritatively
--   inside the checkout RPC in 20261019000005_storefront_rpc_extensions.sql):
--     fee = 0 when zone.free_shipping_threshold is set and subtotal >= it,
--           else zone.fee.
--     zone threshold falls back to stores.free_shipping_threshold when NULL.
--     merchant default fee is used only when the store has no active zones.
--
--   Security:
--     - RLS: owning merchant only (select/insert/update/delete).
--     - anon never reads the table directly; the public store RPC exposes only
--       active zones (governorate, area, fee, threshold) in a safe projection.
--     - This is merchant configuration only. No courier integration exists.
--
--   Additive; no previously applied migration file is modified.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.shipping_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  governorate text NOT NULL,
  area text NOT NULL DEFAULT 'All areas',
  fee numeric(12, 2) NOT NULL DEFAULT 0,
  free_shipping_threshold numeric(12, 2),
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT shipping_zones_governorate_valid CHECK (
    governorate IN (
      'Cairo', 'Giza', 'Alexandria', 'Qalyubia', 'Port Said', 'Suez',
      'Dakahlia', 'Sharqia', 'Monufia', 'Beheira', 'Ismailia', 'Fayoum',
      'Beni Suef', 'Minya', 'Asyut', 'Sohag', 'Qena', 'Luxor', 'Aswan',
      'Red Sea', 'New Valley', 'Matrouh', 'North Sinai', 'South Sinai',
      'Damietta', 'Kafr El Sheikh', 'Gharbia'
    )
  ),
  CONSTRAINT shipping_zones_area_length CHECK (char_length(btrim(area)) BETWEEN 1 AND 120),
  CONSTRAINT shipping_zones_fee_non_negative CHECK (fee >= 0),
  CONSTRAINT shipping_zones_fee_max CHECK (fee <= 999999.99),
  CONSTRAINT shipping_zones_threshold_non_negative
    CHECK (free_shipping_threshold IS NULL OR free_shipping_threshold >= 0),
  CONSTRAINT shipping_zones_threshold_max
    CHECK (free_shipping_threshold IS NULL OR free_shipping_threshold <= 999999.99),
  CONSTRAINT shipping_zones_position_non_negative CHECK (position >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS shipping_zones_store_area_unique
  ON public.shipping_zones (store_id, lower(btrim(governorate)), lower(btrim(area)));
CREATE INDEX IF NOT EXISTS shipping_zones_store_active_idx
  ON public.shipping_zones (store_id, is_active, governorate);

COMMENT ON TABLE public.shipping_zones IS
  'Merchant-configured Egyptian delivery areas with per-area fees and optional free-shipping thresholds. RLS: owning merchant only; public exposure is a safe active-only projection.';

DROP TRIGGER IF EXISTS trigger_shipping_zones_updated_at ON public.shipping_zones;
CREATE TRIGGER trigger_shipping_zones_updated_at
  BEFORE UPDATE ON public.shipping_zones
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shipping_zones FROM anon;
REVOKE ALL ON TABLE public.shipping_zones FROM PUBLIC;

DROP POLICY IF EXISTS "Merchants can view their shipping zones" ON public.shipping_zones;
CREATE POLICY "Merchants can view their shipping zones"
  ON public.shipping_zones FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = shipping_zones.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can create their shipping zones" ON public.shipping_zones;
CREATE POLICY "Merchants can create their shipping zones"
  ON public.shipping_zones FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = shipping_zones.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can update their shipping zones" ON public.shipping_zones;
CREATE POLICY "Merchants can update their shipping zones"
  ON public.shipping_zones FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = shipping_zones.store_id AND s.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = shipping_zones.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can delete their shipping zones" ON public.shipping_zones;
CREATE POLICY "Merchants can delete their shipping zones"
  ON public.shipping_zones FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = shipping_zones.store_id AND s.owner_id = (SELECT auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.shipping_zones TO authenticated;
