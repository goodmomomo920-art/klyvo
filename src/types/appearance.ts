/**
 * Storefront appearance domain types (migration
 * 20261019000002_store_appearance.sql).
 *
 * Everything here is plain data. Nothing is ever rendered as HTML; React
 * escapes all text. URLs are restricted to http(s) at validation time.
 *
 * Runtime defaults and allowlists live in src/lib/appearance.ts.
 */

export type HomepageSectionId = "hero" | "categories" | "catalog";

export type FontFamily = "sans" | "serif" | "display";

export interface AppearanceHero {
  visible: boolean;
  titleEn: string;
  titleAr: string;
  subtitleEn: string;
  subtitleAr: string;
  imageUrl: string;
  ctaLabelEn: string;
  ctaLabelAr: string;
}

export interface AppearanceSection {
  id: HomepageSectionId;
  visible: boolean;
}

export interface StoreAppearance {
  /** Optional appearance-scoped logo override; falls back to stores.logo_url. */
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: FontFamily;
  hero: AppearanceHero;
  sections: AppearanceSection[];
}

export interface AppearanceState {
  draft: StoreAppearance;
  /** Null until the merchant publishes for the first time. */
  published: StoreAppearance | null;
  publishedAt: string | null;
}
