-- ==============================================================================
-- KLYVO STORE APPEARANCE
-- Migration: 20261019000002_store_appearance.sql
-- Description:
--   Stores a merchant's draft and published storefront appearance side by side:
--     - draft     — editable settings; never shown to customers
--     - published — last explicitly published snapshot; the only value the
--                   public storefront RPC exposes
--
--   Shape (validated server-side in src/lib/appearance.ts):
--     {
--       "primaryColor": "#2563EB",
--       "secondaryColor": "#09090B",
--       "fontFamily": "sans" | "serif" | "display",
--       "hero": { "visible", "titleEn", "titleAr", "subtitleEn", "subtitleAr",
--                 "imageUrl", "ctaLabelEn", "ctaLabelAr" },
--       "sections": [{ "id": "hero"|"categories"|"catalog"|..., "visible" }]
--     }
--
--   Safety:
--     - Only server-validated JSON is written by the app: lengths capped, URLs
--       restricted to http(s), colors restricted to 6-digit hex, font and
--       section ids restricted to a fixed allowlist. No HTML or scripts are
--       accepted, and nothing is ever rendered with dangerouslySetInnerHTML.
--     - RLS: owning merchant only. anon reads the published snapshot solely
--       through the SECURITY DEFINER public store RPC.
--
--   Additive; no previously applied migration file is modified.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.store_appearance (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  published jsonb,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT store_appearance_draft_object CHECK (jsonb_typeof(draft) = 'object'),
  CONSTRAINT store_appearance_published_object
    CHECK (published IS NULL OR jsonb_typeof(published) = 'object')
);

COMMENT ON TABLE public.store_appearance IS
  'Draft/published storefront appearance per store. Draft is merchant-only; published is exposed to the public storefront through a safe RPC projection only.';
COMMENT ON COLUMN public.store_appearance.draft IS
  'Merchant-editable appearance draft. Never served to customers.';
COMMENT ON COLUMN public.store_appearance.published IS
  'Last explicitly published appearance snapshot. NULL until the merchant publishes for the first time.';

DROP TRIGGER IF EXISTS trigger_store_appearance_updated_at ON public.store_appearance;
CREATE TRIGGER trigger_store_appearance_updated_at
  BEFORE UPDATE ON public.store_appearance
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.store_appearance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.store_appearance FROM anon;
REVOKE ALL ON TABLE public.store_appearance FROM PUBLIC;

DROP POLICY IF EXISTS "Merchants can view their store appearance" ON public.store_appearance;
CREATE POLICY "Merchants can view their store appearance"
  ON public.store_appearance FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_appearance.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can create their store appearance" ON public.store_appearance;
CREATE POLICY "Merchants can create their store appearance"
  ON public.store_appearance FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_appearance.store_id AND s.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Merchants can update their store appearance" ON public.store_appearance;
CREATE POLICY "Merchants can update their store appearance"
  ON public.store_appearance FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_appearance.store_id AND s.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_appearance.store_id AND s.owner_id = (SELECT auth.uid())));

GRANT SELECT, INSERT, UPDATE ON TABLE public.store_appearance TO authenticated;
