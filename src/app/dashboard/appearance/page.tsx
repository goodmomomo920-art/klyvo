"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppearanceState,
  FontFamily,
  HomepageSectionId,
  StoreAppearance,
} from "@/types/appearance";
import {
  DEFAULT_APPEARANCE,
  FONT_FAMILIES,
  HOMEPAGE_SECTIONS,
  fontFamilyStack,
  heroCta,
  heroSubtitle,
  heroTitle,
  sectionVisible,
} from "@/lib/appearance";
import {
  discardAuthorizedAppearanceDraft,
  getAuthorizedStoreAppearance,
  publishAuthorizedAppearance,
  saveAuthorizedAppearanceDraft,
} from "@/lib/server/appearance";

const SECTION_LABELS: Record<HomepageSectionId, { title: string; hint: string }> = {
  hero: { title: "Hero banner", hint: "Large headline, subtitle, image and button." },
  categories: { title: "Category links", hint: "Quick category filters above the catalog." },
  catalog: { title: "Product catalog", hint: "Search, filters and the product grid." },
};

const inputClass =
  "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-zinc-700">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

export default function AppearancePage() {
  const [state, setState] = useState<AppearanceState | null>(null);
  const [draft, setDraft] = useState<StoreAppearance>(DEFAULT_APPEARANCE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const [previewLang, setPreviewLang] = useState<"en" | "ar">("en");

  const load = useCallback(async () => {
    try {
      const res = await getAuthorizedStoreAppearance();
      if (res.success) {
        setState(res.data);
        setDraft(res.data.draft);
      } else {
        setLoadError(res.error);
      }
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load appearance.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Defer the fetch one tick so the initial synchronous render is never
    // interrupted by state updates (react-hooks/set-state-in-effect).
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const isDirty = useMemo(() => {
    if (!state) return false;
    return JSON.stringify(state.draft) !== JSON.stringify(draft);
  }, [state, draft]);

  const notify = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const saveDraft = async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const res = await saveAuthorizedAppearanceDraft(draft);
      if (res.success) {
        setState(res.data);
        setDraft(res.data.draft);
        notify("success", "Appearance draft saved. Customers still see the published version.");
        return true;
      }
      notify("error", res.error);
      return false;
    } catch (err: unknown) {
      notify("error", err instanceof Error ? err.message : "Failed to save appearance.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const publish = async () => {
    setIsSaving(true);
    try {
      const saved = await saveAuthorizedAppearanceDraft(draft);
      if (!saved.success) {
        notify("error", saved.error);
        return;
      }
      const res = await publishAuthorizedAppearance();
      if (res.success) {
        setState(res.data);
        setDraft(res.data.draft);
        notify("success", "Appearance published. Customers now see these settings.");
      } else {
        notify("error", res.error);
      }
    } catch (err: unknown) {
      notify("error", err instanceof Error ? err.message : "Failed to publish appearance.");
    } finally {
      setIsSaving(false);
    }
  };

  const discard = async () => {
    setIsSaving(true);
    try {
      const res = await discardAuthorizedAppearanceDraft();
      if (res.success) {
        setState(res.data);
        setDraft(res.data.draft);
        notify("success", "Draft reverted to the published appearance.");
      } else {
        notify("error", res.error);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const setHero = (patch: Partial<StoreAppearance["hero"]>) =>
    setDraft((prev) => ({ ...prev, hero: { ...prev.hero, ...patch } }));

  const toggleSection = (id: HomepageSectionId) =>
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.id === id ? { ...section, visible: !section.visible } : section
      ),
    }));

  const previewTitle = heroTitle(
    draft.hero,
    previewLang,
    previewLang === "ar" ? "متجرك" : "Your Store"
  );
  const previewSubtitle = heroSubtitle(draft.hero, previewLang);
  const previewCta = heroCta(draft.hero, previewLang);

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs sm:text-sm font-semibold ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Store Appearance</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Customize the storefront logo, colors, typography, hero content and homepage
            sections. Nothing reaches customers until you publish.
          </p>
        </div>
        <div className="text-xs">
          {state?.publishedAt ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-bold text-emerald-800">
              Published {new Date(state.publishedAt).toLocaleString()}
            </span>
          ) : (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-bold text-amber-800">
              Not published yet — storefront uses store defaults
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-48 animate-pulse rounded-2xl bg-zinc-100" />
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          <p className="font-bold">Could not load appearance settings.</p>
          <p className="mt-1 text-xs">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setLoadError(null);
              void load();
            }}
            className="mt-3 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          {/* Editor */}
          <div className="space-y-4 xl:col-span-3">
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
              <h2 className="text-sm font-bold text-zinc-950">Brand</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field
                    id="appearance-logo"
                    label="Logo URL"
                    hint="http(s) only. Leave empty to use the logo from Store Profile."
                  >
                    <input
                      id="appearance-logo"
                      type="url"
                      value={draft.logoUrl}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, logoUrl: e.target.value }))
                      }
                      placeholder="https://example.com/logo.png"
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Field id="appearance-primary" label="Primary color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Primary color picker"
                      value={draft.primaryColor}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, primaryColor: e.target.value }))
                      }
                      className="h-10 w-14 cursor-pointer rounded-lg border border-zinc-200 bg-white p-1"
                    />
                    <input
                      type="text"
                      aria-label="Primary color hex"
                      value={draft.primaryColor}
                      maxLength={7}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, primaryColor: e.target.value }))
                      }
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                </Field>
                <Field id="appearance-secondary" label="Secondary / header color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Secondary color picker"
                      value={draft.secondaryColor}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, secondaryColor: e.target.value }))
                      }
                      className="h-10 w-14 cursor-pointer rounded-lg border border-zinc-200 bg-white p-1"
                    />
                    <input
                      type="text"
                      aria-label="Secondary color hex"
                      value={draft.secondaryColor}
                      maxLength={7}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, secondaryColor: e.target.value }))
                      }
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                </Field>
                <Field id="appearance-font" label="Typography">
                  <select
                    id="appearance-font"
                    value={draft.fontFamily}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        fontFamily: e.target.value as FontFamily,
                      }))
                    }
                    className={inputClass}
                  >
                    {FONT_FAMILIES.map((font) => (
                      <option key={font} value={font}>
                        {font === "sans"
                          ? "Sans (modern)"
                          : font === "serif"
                            ? "Serif (classic)"
                            : "Display (bold)"}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-zinc-950">Hero / banner</h2>
                  <p className="text-[11px] text-zinc-500">
                    Plain text only — HTML and scripts are rejected.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-zinc-700">
                  <input
                    type="checkbox"
                    checked={draft.hero.visible}
                    onChange={(e) => setHero({ visible: e.target.checked })}
                    className="h-4 w-4 accent-[#2563EB]"
                  />
                  Visible
                </label>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="hero-title-en" label="Title (English)">
                  <input
                    id="hero-title-en"
                    value={draft.hero.titleEn}
                    maxLength={80}
                    onChange={(e) => setHero({ titleEn: e.target.value })}
                    placeholder="New season, new favorites"
                    className={inputClass}
                  />
                </Field>
                <Field id="hero-title-ar" label="Title (Arabic)">
                  <input
                    id="hero-title-ar"
                    dir="rtl"
                    value={draft.hero.titleAr}
                    maxLength={80}
                    onChange={(e) => setHero({ titleAr: e.target.value })}
                    placeholder="موسم جديد، مفضلات جديدة"
                    className={inputClass}
                  />
                </Field>
                <Field id="hero-subtitle-en" label="Subtitle (English)">
                  <textarea
                    id="hero-subtitle-en"
                    rows={2}
                    value={draft.hero.subtitleEn}
                    maxLength={160}
                    onChange={(e) => setHero({ subtitleEn: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field id="hero-subtitle-ar" label="Subtitle (Arabic)">
                  <textarea
                    id="hero-subtitle-ar"
                    dir="rtl"
                    rows={2}
                    value={draft.hero.subtitleAr}
                    maxLength={160}
                    onChange={(e) => setHero({ subtitleAr: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field
                    id="hero-image"
                    label="Banner image URL"
                    hint="http(s) URL. Rendered as a background image with a dark overlay."
                  >
                    <input
                      id="hero-image"
                      type="url"
                      value={draft.hero.imageUrl}
                      onChange={(e) => setHero({ imageUrl: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Field id="hero-cta-en" label="Button label (English)">
                  <input
                    id="hero-cta-en"
                    value={draft.hero.ctaLabelEn}
                    maxLength={40}
                    onChange={(e) => setHero({ ctaLabelEn: e.target.value })}
                    placeholder="Shop now"
                    className={inputClass}
                  />
                </Field>
                <Field id="hero-cta-ar" label="Button label (Arabic)">
                  <input
                    id="hero-cta-ar"
                    dir="rtl"
                    value={draft.hero.ctaLabelAr}
                    maxLength={40}
                    onChange={(e) => setHero({ ctaLabelAr: e.target.value })}
                    placeholder="تسوق الآن"
                    className={inputClass}
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
              <h2 className="text-sm font-bold text-zinc-950">Homepage sections</h2>
              <div className="mt-3 space-y-2">
                {HOMEPAGE_SECTIONS.map((id) => (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2.5"
                  >
                    <span>
                      <span className="block text-xs font-bold text-zinc-900">
                        {SECTION_LABELS[id].title}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {SECTION_LABELS[id].hint}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={sectionVisible(draft, id)}
                      onChange={() => toggleSection(id)}
                      className="h-4 w-4 accent-[#2563EB]"
                    />
                  </label>
                ))}
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void saveDraft()}
                disabled={isSaving || !isDirty}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs font-bold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save draft"}
              </button>
              <button
                type="button"
                onClick={() => void publish()}
                disabled={isSaving}
                className="rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-600 disabled:opacity-50"
              >
                {isSaving ? "Publishing…" : "Publish appearance"}
              </button>
              <button
                type="button"
                onClick={() => void discard()}
                disabled={isSaving || !isDirty}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                Discard draft edits
              </button>
              {isDirty && (
                <span className="text-[11px] font-semibold text-amber-700">
                  Unsaved changes
                </span>
              )}
            </div>
          </div>

          {/* Preview */}
          <aside className="xl:col-span-2">
            <div className="xl:sticky xl:top-24 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-950">Preview</h2>
                <div className="flex overflow-hidden rounded-lg border border-zinc-200 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setPreviewLang("en")}
                    className={`px-2.5 py-1 ${
                      previewLang === "en" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"
                    }`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewLang("ar")}
                    className={`px-2.5 py-1 ${
                      previewLang === "ar" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"
                    }`}
                  >
                    AR
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500">
                Draft preview — customers still see the published version until you press
                Publish. Product cards below are samples.
              </p>

              <div
                dir={previewLang === "ar" ? "rtl" : "ltr"}
                className="overflow-hidden rounded-2xl border border-zinc-200 shadow-sm"
                style={{ fontFamily: fontFamilyStack(draft.fontFamily) }}
              >
                <div
                  className="flex items-center justify-between px-3 py-2"
                  style={{ backgroundColor: draft.secondaryColor }}
                >
                  <span className="flex items-center gap-2 text-xs font-black text-white">
                    {draft.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={draft.logoUrl}
                        alt=""
                        className="h-6 w-6 rounded object-cover"
                      />
                    ) : (
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded text-[10px] text-white"
                        style={{ backgroundColor: draft.primaryColor }}
                      >
                        S
                      </span>
                    )}
                    {previewLang === "ar" ? "متجرك" : "Your store"}
                  </span>
                  <span
                    className="rounded px-2 py-1 text-[10px] font-bold text-white"
                    style={{ backgroundColor: draft.primaryColor }}
                  >
                    {previewLang === "ar" ? "السلة" : "Cart"}
                  </span>
                </div>

                {draft.hero.visible && sectionVisible(draft, "hero") && (
                  <div
                    className="relative px-4 py-6"
                    style={{ backgroundColor: draft.secondaryColor }}
                  >
                    {draft.hero.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={draft.hero.imageUrl}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 h-full w-full object-cover opacity-35"
                      />
                    )}
                    <div className="relative space-y-2">
                      <h3 className="text-lg font-black leading-tight text-white">
                        {previewTitle}
                      </h3>
                      {previewSubtitle && (
                        <p className="text-[11px] leading-relaxed text-white/80">
                          {previewSubtitle}
                        </p>
                      )}
                      {previewCta && (
                        <span
                          className="inline-block rounded-lg px-3 py-1.5 text-[10px] font-bold text-white"
                          style={{ backgroundColor: draft.primaryColor }}
                        >
                          {previewCta}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-3 bg-white p-3">
                  {sectionVisible(draft, "categories") && (
                    <div className="flex flex-wrap gap-1.5">
                      {(previewLang === "ar"
                        ? ["الكل", "إلكترونيات", "أزياء"]
                        : ["All", "Electronics", "Fashion"]
                      ).map((label, index) => (
                        <span
                          key={label}
                          className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                          style={
                            index === 0
                              ? { backgroundColor: draft.primaryColor, color: "white" }
                              : { backgroundColor: "#f4f4f5", color: "#52525b" }
                          }
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                  {sectionVisible(draft, "catalog") ? (
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2].map((sample) => (
                        <div
                          key={sample}
                          className="overflow-hidden rounded-lg border border-zinc-200"
                        >
                          <div className="h-16 bg-zinc-100" />
                          <div className="space-y-1 p-2">
                            <p className="text-[10px] font-bold text-zinc-900">
                              {previewLang === "ar" ? "منتج تجريبي" : "Sample product"}
                            </p>
                            <p className="text-[10px] font-mono text-zinc-500">
                              {(sample * 249).toLocaleString()} EGP
                            </p>
                            <span
                              className="inline-block rounded px-1.5 py-0.5 text-[8px] font-bold text-white"
                              style={{ backgroundColor: draft.primaryColor }}
                            >
                              {previewLang === "ar" ? "أضف" : "Add"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-zinc-200 p-3 text-center text-[10px] text-zinc-500">
                      {previewLang === "ar"
                        ? "قسم المنتجات مخفي."
                        : "Product catalog section is hidden."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
