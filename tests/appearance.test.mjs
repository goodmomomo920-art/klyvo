import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_APPEARANCE,
  HOMEPAGE_SECTIONS,
  heroTitle,
  normalizeAppearance,
  sectionVisible,
  toPlainText,
  validateAppearanceInput,
} from "../src/lib/appearance.ts";

test("unsafe text is stripped of markup and control characters", () => {
  assert.equal(toPlainText("<script>alert(1)</script>"), "scriptalert(1)/script");
  assert.equal(toPlainText("  عصير\u0000 طازج  "), "عصير طازج");
  assert.equal(toPlainText(42), "");
});

test("appearance input rejects unsafe URLs, colours, and fonts", () => {
  const base = { ...DEFAULT_APPEARANCE };
  assert.equal(validateAppearanceInput({ ...base, logoUrl: "javascript:alert(1)" }).ok, false);
  assert.equal(validateAppearanceInput({ ...base, logoUrl: "data:image/svg+xml;base64,AAA" }).ok, false);
  assert.equal(validateAppearanceInput({ ...base, logoUrl: "https://cdn.example.com/logo.png" }).ok, true);
  assert.equal(validateAppearanceInput({ ...base, primaryColor: "red" }).ok, false);
  assert.equal(validateAppearanceInput({ ...base, primaryColor: "#1A2B3C" }).ok, true);
  assert.equal(validateAppearanceInput({ ...base, fontFamily: "comic" }).ok, false);
});

test("invalid non-object input is rejected", () => {
  assert.equal(validateAppearanceInput(null).ok, false);
  assert.equal(validateAppearanceInput("settings").ok, false);
});

test("defaults are preserved for missing settings", () => {
  const appearance = normalizeAppearance(null);
  assert.equal(appearance.primaryColor, DEFAULT_APPEARANCE.primaryColor);
  assert.equal(appearance.fontFamily, "sans");
  assert.equal(appearance.sections.length, HOMEPAGE_SECTIONS.length);
});

test("sections are canonical and unique", () => {
  const appearance = normalizeAppearance({
    sections: [
      { id: "catalog", visible: false },
      { id: "unknown", visible: true },
      { id: "catalog", visible: true },
    ],
  });
  assert.deepEqual(
    appearance.sections.map((section) => section.id),
    HOMEPAGE_SECTIONS
  );
  assert.equal(sectionVisible(appearance, "catalog"), true);
});

test("hero copy is sanitized and falls back per language", () => {
  const appearance = normalizeAppearance({
    hero: { titleEn: "<img src=x onerror=alert(1)>", titleAr: "مرحبا" },
  });
  assert.equal(appearance.hero.titleEn, "img src=x onerror=alert(1)");
  assert.equal(heroTitle(appearance.hero, "ar", "Store"), "مرحبا");
  assert.equal(heroTitle(appearance.hero, "en", "Store"), appearance.hero.titleEn);
});

test("stored unsafe content is neutralised on read", () => {
  const appearance = normalizeAppearance({
    primaryColor: "not-a-colour",
    logoUrl: "javascript:alert(1)",
  });
  assert.equal(appearance.primaryColor, DEFAULT_APPEARANCE.primaryColor);
  assert.equal(appearance.logoUrl, "");
});
