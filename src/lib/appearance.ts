import type {
  AppearanceHero,
  AppearanceSection,
  FontFamily,
  HomepageSectionId,
  StoreAppearance,
} from "../types/appearance";

/**
 * Store appearance validation / normalization.
 *
 * - All text is treated as plain text. Control characters and angle brackets
 *   are stripped, and nothing is ever rendered with dangerouslySetInnerHTML.
 * - Only 6-digit hex colors, http(s) URLs up to 2048 chars, a fixed font
 *   allowlist and a fixed homepage-section allowlist are accepted.
 * - `normalizeAppearance` is lenient (used when reading published data);
 *   `validateAppearanceInput` reports errors for merchant writes.
 */

export const HOMEPAGE_SECTIONS: HomepageSectionId[] = [
  "hero",
  "categories",
  "catalog",
];

export const FONT_FAMILIES: FontFamily[] = ["sans", "serif", "display"];

export const DEFAULT_APPEARANCE: StoreAppearance = {
  logoUrl: "",
  primaryColor: "#2563EB",
  secondaryColor: "#09090B",
  fontFamily: "sans",
  hero: {
    visible: true,
    titleEn: "",
    titleAr: "",
    subtitleEn: "",
    subtitleAr: "",
    imageUrl: "",
    ctaLabelEn: "",
    ctaLabelAr: "",
  },
  sections: HOMEPAGE_SECTIONS.map((id) => ({ id, visible: true })),
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const LIMITS = {
  logoUrl: 2048,
  heroTitle: 80,
  heroSubtitle: 160,
  heroCta: 40,
  imageUrl: 2048,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strips control characters and any HTML-ish angle brackets. */
export function toPlainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .trim();
}

function readText(
  value: unknown,
  max: number,
  label: string,
  fallback: string,
  errors?: string[]
): string {
  const text = toPlainText(value);
  if (text.length > max) {
    errors?.push(`${label} cannot exceed ${max} characters.`);
    return text.slice(0, max);
  }
  return text || fallback;
}

function readHttpUrl(
  value: unknown,
  label: string,
  max: number,
  fallback: string,
  errors?: string[]
): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  if (raw.length > max) {
    errors?.push(`${label} cannot exceed ${max} characters.`);
    return "";
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      errors?.push(`${label} must be an http(s) URL.`);
      return "";
    }
    return raw;
  } catch {
    errors?.push(`${label} must be a valid http(s) URL.`);
    return "";
  }
}

function readHexColor(
  value: unknown,
  label: string,
  fallback: string,
  errors?: string[]
): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (HEX_COLOR.test(raw)) return raw.toLowerCase();
  errors?.push(`${label} must be a 6-digit hex color such as #2563EB.`);
  return fallback;
}

function readFontFamily(
  value: unknown,
  fallback: FontFamily,
  errors?: string[]
): FontFamily {
  if (value === undefined) return fallback;
  if (
    typeof value === "string" &&
    (FONT_FAMILIES as readonly string[]).includes(value)
  ) {
    return value as FontFamily;
  }
  errors?.push("Font family must be one of: sans, serif, display.");
  return fallback;
}

function readHero(
  raw: unknown,
  fallback: AppearanceHero,
  errors?: string[]
): AppearanceHero {
  const hero = isRecord(raw) ? raw : {};
  return {
    visible:
      hero.visible === undefined ? fallback.visible : Boolean(hero.visible),
    titleEn: readText(hero.titleEn, LIMITS.heroTitle, "Hero title (English)", fallback.titleEn, errors),
    titleAr: readText(hero.titleAr, LIMITS.heroTitle, "Hero title (Arabic)", fallback.titleAr, errors),
    subtitleEn: readText(hero.subtitleEn, LIMITS.heroSubtitle, "Hero subtitle (English)", fallback.subtitleEn, errors),
    subtitleAr: readText(hero.subtitleAr, LIMITS.heroSubtitle, "Hero subtitle (Arabic)", fallback.subtitleAr, errors),
    imageUrl: readHttpUrl(hero.imageUrl, "Hero image", LIMITS.imageUrl, fallback.imageUrl, errors),
    ctaLabelEn: readText(hero.ctaLabelEn, LIMITS.heroCta, "Hero button label (English)", fallback.ctaLabelEn, errors),
    ctaLabelAr: readText(hero.ctaLabelAr, LIMITS.heroCta, "Hero button label (Arabic)", fallback.ctaLabelAr, errors),
  };
}

function readSections(
  raw: unknown,
  fallback: AppearanceSection[],
  errors?: string[]
): AppearanceSection[] {
  if (raw === undefined) return fallback.map((section) => ({ ...section }));
  if (!Array.isArray(raw)) {
    errors?.push("Homepage sections must be a list.");
    return fallback.map((section) => ({ ...section }));
  }

  const byId = new Map<string, boolean>();
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id : "";
    if (!(HOMEPAGE_SECTIONS as readonly string[]).includes(id)) continue;
    byId.set(id, Boolean(entry.visible));
  }

  return HOMEPAGE_SECTIONS.map((id) => ({
    id,
    visible: byId.has(id) ? Boolean(byId.get(id)) : true,
  }));
}

/**
 * Lenient normalization used for published/public data and as the base for
 * strict validation. Unknown or malformed fields fall back safely.
 */
export function normalizeAppearance(
  raw: unknown,
  fallback: StoreAppearance = DEFAULT_APPEARANCE,
  errors?: string[]
): StoreAppearance {
  const input = isRecord(raw) ? raw : {};
  return {
    logoUrl: readHttpUrl(input.logoUrl, "Logo URL", LIMITS.logoUrl, fallback.logoUrl, errors),
    primaryColor: readHexColor(input.primaryColor, "Primary color", fallback.primaryColor, errors),
    secondaryColor: readHexColor(input.secondaryColor, "Secondary color", fallback.secondaryColor, errors),
    fontFamily: readFontFamily(input.fontFamily, fallback.fontFamily, errors),
    hero: readHero(input.hero, fallback.hero, errors),
    sections: readSections(input.sections, fallback.sections, errors),
  };
}

export type AppearanceValidationResult =
  | { ok: true; value: StoreAppearance }
  | { ok: false; errors: string[] };

/** Strict validation for merchant writes. */
export function validateAppearanceInput(input: unknown): AppearanceValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ["Appearance settings must be an object."] };
  }
  const value = normalizeAppearance(input, DEFAULT_APPEARANCE, errors);
  if (errors.length > 0) {
    return { ok: false, errors: Array.from(new Set(errors)) };
  }
  return { ok: true, value };
}

export function sectionVisible(
  appearance: StoreAppearance,
  id: HomepageSectionId
): boolean {
  return appearance.sections.find((section) => section.id === id)?.visible ?? true;
}

export function heroTitle(
  hero: AppearanceHero,
  language: "en" | "ar",
  storeName: string
): string {
  if (language === "ar") return hero.titleAr || hero.titleEn || storeName;
  return hero.titleEn || hero.titleAr || storeName;
}

export function heroSubtitle(
  hero: AppearanceHero,
  language: "en" | "ar"
): string {
  return language === "ar"
    ? hero.subtitleAr || hero.subtitleEn
    : hero.subtitleEn || hero.subtitleAr;
}

export function heroCta(
  hero: AppearanceHero,
  language: "en" | "ar"
): string {
  return language === "ar"
    ? hero.ctaLabelAr || hero.ctaLabelEn
    : hero.ctaLabelEn || hero.ctaLabelAr;
}

/** CSS font stack per allowlisted family. No external font fetching. */
export function fontFamilyStack(font: FontFamily): string {
  switch (font) {
    case "serif":
      return 'ui-serif, Georgia, "Times New Roman", serif';
    case "display":
      return '"Trebuchet MS", "Segoe UI", ui-sans-serif, system-ui, sans-serif';
    case "sans":
    default:
      return "ui-sans-serif, system-ui, -apple-system, sans-serif";
  }
}
