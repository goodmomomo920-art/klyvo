"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StoreRow, StorePaymentMethodRow, PaymentMethod } from "@/types/database";
import {
  getAuthorizedStoreSettings,
  updateStoreProfile,
  updateStoreAppearance,
  updateStoreRegional,
  updateStoreShipping,
  updateStorePaymentMethod,
  SupportedPaymentMethod,
} from "@/lib/server/storeSettings";
import { getAuthorizedShippingZones } from "@/lib/server/shipping";
import type { ShippingZone } from "@/types/shipping";
import ShippingZonesPanel from "@/components/dashboard/ShippingZonesPanel";

const TABS = [
  { id: "profile", label: "Store Profile" },
  { id: "appearance", label: "Appearance" },
  { id: "regional", label: "Regional Preferences" },
  { id: "shipping", label: "Shipping" },
  { id: "payments", label: "Payments" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SUPPORTED_METHODS: SupportedPaymentMethod[] = [
  "Cash on Delivery",
  "InstaPay",
  "Vodafone Cash",
  "Credit / Debit Card",
];

const GOVERNORATES = [
  "Cairo",
  "Giza",
  "Alexandria",
  "Qalyubia",
  "Port Said",
  "Suez",
  "Dakahlia",
  "Sharqia",
  "Monufia",
  "Beheira",
  "Ismailia",
  "Fayoum",
  "Beni Suef",
  "Minya",
  "Asyut",
  "Sohag",
  "Qena",
  "Luxor",
  "Aswan",
  "Red Sea",
  "New Valley",
  "Matrouh",
  "North Sinai",
  "South Sinai",
  "Damietta",
];

const CURRENCIES = ["EGP", "USD", "EUR", "GBP", "SAR", "AED"];

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-colors disabled:opacity-50";

const labelClass = "block text-xs font-semibold text-zinc-700 mb-1.5";

function Field({
  id,
  label,
  required,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [store, setStore] = useState<StoreRow | null>(null);
  const [, setPaymentMethods] = useState<StorePaymentMethodRow[]>([]);
  const [paymentEdits, setPaymentEdits] = useState<
    Record<PaymentMethod, { enabled: boolean; instructions: string; dirty: boolean }>
  >({
    "Cash on Delivery": { enabled: true, instructions: "", dirty: false },
    InstaPay: { enabled: true, instructions: "", dirty: false },
    "Vodafone Cash": { enabled: true, instructions: "", dirty: false },
    "Credit / Debit Card": { enabled: true, instructions: "", dirty: false },
  });

  // Profile form
  const [profile, setProfile] = useState({
    name: "",
    slug: "",
    logoUrl: "",
    description: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
    city: "",
    governorate: "",
  });
  // Regional / shipping forms
  const [regional, setRegional] = useState({ currency: "EGP", language: "en", timezone: "Africa/Cairo" });
  const [appearance, setAppearance] = useState({
    primaryColor: "#2563EB",
    secondaryColor: "#09090B",
  });
  const [shipping, setShipping] = useState({
    shippingEnabled: true,
    shippingFee: "0",
    freeShippingThreshold: "",
  });
  const [shippingZones, setShippingZones] = useState<ShippingZone[]>([]);
  const [shippingZonesError, setShippingZonesError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  const hydrate = useCallback((bundle: { store: StoreRow; paymentMethods: StorePaymentMethodRow[] }) => {
    const s = bundle.store;
    setStore(s);
    setProfile({
      name: s.name,
      slug: s.slug,
      logoUrl: s.logo_url ?? "",
      description: s.description ?? "",
      contactEmail: s.contact_email ?? "",
      contactPhone: s.contact_phone ?? "",
      address: s.address ?? "",
      city: s.city ?? "",
      governorate: s.governorate ?? "",
    });
    setAppearance({
      primaryColor: s.primary_color,
      secondaryColor: s.secondary_color,
    });
    setRegional({
      currency: s.currency,
      language: s.language,
      timezone: s.timezone,
    });
    setShipping({
      shippingEnabled: s.shipping_enabled,
      shippingFee: String(s.shipping_fee),
      freeShippingThreshold:
        s.free_shipping_threshold === null ? "" : String(s.free_shipping_threshold),
    });
    const edits: Partial<
      Record<PaymentMethod, { enabled: boolean; instructions: string; dirty: boolean }>
    > = {};
    for (const method of SUPPORTED_METHODS) {
      const row = bundle.paymentMethods.find((pm) => pm.method === method);
      edits[method] = {
        enabled: row?.enabled ?? true,
        instructions: row?.instructions ?? "",
        dirty: false,
      };
    }
    setPaymentEdits(edits as typeof paymentEdits);
  }, []);

  const reloadShippingZones = useCallback(async () => {
    const res = await getAuthorizedShippingZones();
    if (res.success) {
      setShippingZones(res.data);
      setShippingZonesError(null);
    } else {
      setShippingZones([]);
      setShippingZonesError(res.error);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const [res, zonesRes] = await Promise.all([
          getAuthorizedStoreSettings(),
          getAuthorizedShippingZones(),
        ]);
        if (ignore) return;
        if (res.success && res.data) {
          hydrate(res.data);
        } else {
          setLoadError(res.success ? "No store found." : res.error);
        }
        if (zonesRes.success) {
          setShippingZones(zonesRes.data);
          setShippingZonesError(null);
        } else {
          setShippingZones([]);
          setShippingZonesError(zonesRes.error);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setLoadError(err instanceof Error ? err.message : "Failed to load store settings.");
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [hydrate]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.name.trim()) {
      showToast("Store name is required.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const res = await updateStoreProfile({
        name: profile.name,
        slug: profile.slug,
        logoUrl: profile.logoUrl,
        description: profile.description,
        contactEmail: profile.contactEmail,
        contactPhone: profile.contactPhone,
        address: profile.address,
        city: profile.city,
        governorate: profile.governorate,
      });
      if (res.success && res.data) {
        setStore(res.data);
        setProfile((prev) => ({
          ...prev,
          name: res.data!.name,
          slug: res.data!.slug,
        }));
        showToast("Store profile saved successfully. ✓");
      } else {
        showToast(res.success ? "Save failed." : res.error, "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to save store profile.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAppearance = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await updateStoreAppearance({
        primaryColor: appearance.primaryColor,
        secondaryColor: appearance.secondaryColor,
      });
      if (res.success && res.data) {
        setStore(res.data);
        showToast("Brand appearance saved successfully. ✓");
      } else {
        showToast(res.success ? "Save failed." : res.error, "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to save appearance.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveRegional = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await updateStoreRegional({
        currency: regional.currency,
        language: regional.language,
        timezone: regional.timezone,
      });
      if (res.success && res.data) {
        setStore(res.data);
        showToast("Regional preferences saved successfully. ✓");
      } else {
        showToast(res.success ? "Save failed." : res.error, "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to save regional preferences.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveShipping = async (e: React.FormEvent) => {
    e.preventDefault();
    const fee = Number(shipping.shippingFee);
    if (shipping.shippingFee.trim() === "" || Number.isNaN(fee) || !Number.isFinite(fee) || fee < 0) {
      showToast("Default shipping fee must be a valid non-negative number.", "error");
      return;
    }
    let threshold: number | null = null;
    if (shipping.freeShippingThreshold.trim() !== "") {
      threshold = Number(shipping.freeShippingThreshold);
      if (Number.isNaN(threshold) || !Number.isFinite(threshold) || threshold < 0) {
        showToast("Free shipping threshold must be a valid non-negative number.", "error");
        return;
      }
    }
    setIsSaving(true);
    try {
      const res = await updateStoreShipping({
        shippingEnabled: shipping.shippingEnabled,
        shippingFee: fee,
        freeShippingThreshold: threshold,
      });
      if (res.success && res.data) {
        setStore(res.data);
        showToast("Shipping settings saved successfully. ✓");
      } else {
        showToast(res.success ? "Save failed." : res.error, "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to save shipping settings.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePaymentMethod = async (method: SupportedPaymentMethod) => {
    const edit = paymentEdits[method];
    setIsSaving(true);
    try {
      const res = await updateStorePaymentMethod(method, {
        enabled: edit.enabled,
        instructions: edit.instructions,
      });
      if (res.success && res.data) {
        setPaymentMethods((prev) => {
          const others = prev.filter((pm) => pm.method !== method);
          return [...others, res.data!];
        });
        setPaymentEdits((prev) => ({
          ...prev,
          [method]: { ...prev[method], dirty: false },
        }));
        showToast(`"${method}" configuration saved. ✓`);
      } else {
        showToast(res.success ? "Save failed." : res.error, "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to save payment method.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const dirtyPaymentCount = useMemo(
    () => SUPPORTED_METHODS.filter((m) => paymentEdits[m].dirty).length,
    [paymentEdits]
  );

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-12 sm:p-16 text-center shadow-xs space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center text-[#2563EB]">
          <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-zinc-950">Loading store settings...</h3>
        <p className="text-xs text-zinc-500 max-w-sm mx-auto">
          Retrieving your store configuration from Supabase.
        </p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-12 sm:p-16 text-center shadow-xs space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 text-2xl font-bold">
          !
        </div>
        <h3 className="text-base font-bold text-zinc-950">Could not load store settings</h3>
        <p className="text-xs text-zinc-500 max-w-sm mx-auto">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {feedback && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-xs sm:text-sm font-semibold border ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {feedback.type === "success" ? "✓ " : "⚠ "}
          {feedback.message}
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
              Store Settings
            </h2>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-700 border border-zinc-200">
              Connected
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            Profile, appearance, regional preferences, shipping, and payment configuration for{" "}
            <strong className="text-zinc-900">{store.name}</strong>.
          </p>
        </div>
        <span className="self-start inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800">
          <span className="h-2 w-2 rounded-full bg-emerald-600" />
          Persisted in Supabase · Tenant Isolated
        </span>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition-colors ${
              activeTab === tab.id
                ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/25"
                : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {tab.label}
            {tab.id === "payments" && dirtyPaymentCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-400/90 px-1.5 py-0.2 text-[10px] text-amber-950">
                {dirtyPaymentCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Store Profile */}
      {activeTab === "profile" && (
        <form onSubmit={handleSaveProfile} className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-xs">
          <h3 className="text-base font-bold text-zinc-950">Store Profile</h3>
          <p className="mt-1 text-xs text-zinc-500 mb-5">
            Public identity and contact details for your store.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="store-name" label="Store name" required>
              <input
                id="store-name"
                type="text"
                required
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className={inputClass}
                placeholder="My Klyvo Store"
              />
            </Field>
            <Field
              id="store-slug"
              label="Store URL slug"
              hint={`Normalized automatically. Storefront URL: /${profile.slug || "your-store"}`}
            >
              <input
                id="store-slug"
                type="text"
                value={profile.slug}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                  })
                }
                className={`${inputClass} font-mono`}
                placeholder="my-klyvo-store"
              />
            </Field>
            <Field
              id="store-logo"
              label="Store logo URL"
              hint="http(s) image URL. Logo upload uses your existing image-URL approach — no file storage is configured yet."
            >
              <input
                id="store-logo"
                type="url"
                value={profile.logoUrl}
                onChange={(e) => setProfile({ ...profile, logoUrl: e.target.value })}
                className={inputClass}
                placeholder="https://example.com/logo.png"
              />
            </Field>
            <Field id="store-contact-email" label="Contact email">
              <input
                id="store-contact-email"
                type="email"
                value={profile.contactEmail}
                onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })}
                className={inputClass}
                placeholder="support@mystore.com"
              />
            </Field>
            <Field id="store-contact-phone" label="Contact phone">
              <input
                id="store-contact-phone"
                type="tel"
                value={profile.contactPhone}
                onChange={(e) => setProfile({ ...profile, contactPhone: e.target.value })}
                className={inputClass}
                placeholder="+20 100 000 0000"
              />
            </Field>
            <Field id="store-city" label="City">
              <input
                id="store-city"
                type="text"
                value={profile.city}
                onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                className={inputClass}
                placeholder="Cairo"
              />
            </Field>
            <Field id="store-governorate" label="Governorate">
              <select
                id="store-governorate"
                value={profile.governorate}
                onChange={(e) => setProfile({ ...profile, governorate: e.target.value })}
                className={inputClass}
              >
                <option value="">Select governorate…</option>
                {GOVERNORATES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field id="store-address" label="Store address">
                <input
                  id="store-address"
                  type="text"
                  value={profile.address}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  className={inputClass}
                  placeholder="Street, building, area"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field id="store-description" label="Store description" hint="Shown to customers on your storefront. Max 2000 characters.">
                <textarea
                  id="store-description"
                  rows={3}
                  value={profile.description}
                  onChange={(e) => setProfile({ ...profile, description: e.target.value })}
                  className={inputClass}
                  placeholder="Describe what your store sells…"
                />
              </Field>
            </div>
          </div>
          <div className="mt-5 flex justify-end border-t border-zinc-100 pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </form>
      )}

      {/* Appearance */}
      {activeTab === "appearance" && (
        <form onSubmit={handleSaveAppearance} className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-xs">
          <h3 className="text-base font-bold text-zinc-950">Appearance</h3>
          <p className="mt-1 text-xs text-zinc-500 mb-5">
            Brand colors for your storefront. Klyvo defaults are electric blue on black.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="primary-color" label="Primary brand color" required>
              <div className="flex items-center gap-2">
                <input
                  id="primary-color"
                  type="color"
                  value={appearance.primaryColor}
                  onChange={(e) => setAppearance({ ...appearance, primaryColor: e.target.value })}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-zinc-200 bg-white p-1"
                  aria-label="Primary brand color picker"
                />
                <input
                  type="text"
                  aria-label="Primary brand color hex value"
                  value={appearance.primaryColor}
                  onChange={(e) => setAppearance({ ...appearance, primaryColor: e.target.value })}
                  className={`${inputClass} font-mono`}
                  placeholder="#2563EB"
                  maxLength={7}
                />
              </div>
            </Field>
            <Field id="secondary-color" label="Secondary / accent color" required>
              <div className="flex items-center gap-2">
                <input
                  id="secondary-color"
                  type="color"
                  value={appearance.secondaryColor}
                  onChange={(e) => setAppearance({ ...appearance, secondaryColor: e.target.value })}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-zinc-200 bg-white p-1"
                  aria-label="Secondary color picker"
                />
                <input
                  type="text"
                  aria-label="Secondary color hex value"
                  value={appearance.secondaryColor}
                  onChange={(e) => setAppearance({ ...appearance, secondaryColor: e.target.value })}
                  className={`${inputClass} font-mono`}
                  placeholder="#09090B"
                  maxLength={7}
                />
              </div>
            </Field>
          </div>

          {/* Live preview */}
          <div
            className="mt-5 rounded-2xl p-5 border border-zinc-200"
            style={{ backgroundColor: appearance.secondaryColor }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-2">
              Storefront Preview
            </p>
            <div
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold text-white"
              style={{ backgroundColor: appearance.primaryColor }}
            >
              Shop Now
            </div>
            <p className="mt-2 text-[11px]" style={{ color: appearance.primaryColor }}>
              Accent text example · {appearance.primaryColor}
            </p>
          </div>

          <div className="mt-5 flex justify-end border-t border-zinc-100 pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save Appearance"}
            </button>
          </div>
        </form>
      )}

      {/* Regional Preferences */}
      {activeTab === "regional" && (
        <form onSubmit={handleSaveRegional} className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-xs">
          <h3 className="text-base font-bold text-zinc-950">Regional Preferences</h3>
          <p className="mt-1 text-xs text-zinc-500 mb-5">
            Store-level currency, language, and timezone. These preferences apply to your store
            configuration and do not change your dashboard display language.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field id="store-currency" label="Currency" required>
              <select
                id="store-currency"
                value={regional.currency}
                onChange={(e) => setRegional({ ...regional, currency: e.target.value })}
                className={inputClass}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="store-language" label="Store language" required>
              <select
                id="store-language"
                value={regional.language}
                onChange={(e) => setRegional({ ...regional, language: e.target.value })}
                className={inputClass}
              >
                <option value="en">English (en)</option>
                <option value="ar">Arabic (ar)</option>
              </select>
            </Field>
            <Field id="store-timezone" label="Timezone" required hint="IANA timezone. Default for Egypt: Africa/Cairo.">
              <input
                id="store-timezone"
                type="text"
                required
                value={regional.timezone}
                onChange={(e) => setRegional({ ...regional, timezone: e.target.value })}
                className={`${inputClass} font-mono`}
                placeholder="Africa/Cairo"
              />
            </Field>
          </div>
          <div className="mt-5 flex justify-end border-t border-zinc-100 pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save Regional Preferences"}
            </button>
          </div>
        </form>
      )}

      {/* Shipping */}
      {activeTab === "shipping" && (
        <>
        <form onSubmit={handleSaveShipping} className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-xs">
          <h3 className="text-base font-bold text-zinc-950">Shipping</h3>
          <p className="mt-1 text-xs text-zinc-500 mb-5">
            Store-level shipping configuration applied at checkout. This configures your store only —
            no courier service is integrated.
          </p>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-3">
              <div>
                <p className="text-xs sm:text-sm font-semibold text-zinc-900">Shipping enabled</p>
                <p className="text-[11px] text-zinc-500">Offer delivery to customers at checkout.</p>
              </div>
              <label htmlFor="shipping-enabled" className="sr-only">
                Shipping enabled
              </label>
              <input
                id="shipping-enabled"
                type="checkbox"
                checked={shipping.shippingEnabled}
                onChange={(e) => setShipping({ ...shipping, shippingEnabled: e.target.checked })}
                className="h-5 w-9 cursor-pointer accent-[#2563EB]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="shipping-fee" label="Default shipping fee (EGP)" required hint="Default fee applied to orders.">
                <input
                  id="shipping-fee"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={shipping.shippingFee}
                  onChange={(e) => setShipping({ ...shipping, shippingFee: e.target.value })}
                  className={inputClass}
                  placeholder="65.00"
                />
              </Field>
              <Field
                id="free-shipping-threshold"
                label="Store-wide free shipping threshold (EGP, optional)"
                hint="Fallback threshold for areas without their own. Leave empty for none."
              >
                <input
                  id="free-shipping-threshold"
                  type="number"
                  step="0.01"
                  min="0"
                  value={shipping.freeShippingThreshold}
                  onChange={(e) => setShipping({ ...shipping, freeShippingThreshold: e.target.value })}
                  className={inputClass}
                  placeholder="1000.00"
                />
              </Field>
            </div>
          </div>
          <div className="mt-5 flex justify-end border-t border-zinc-100 pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save Shipping Settings"}
            </button>
          </div>
        </form>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-xs">
          <ShippingZonesPanel
            zones={shippingZones}
            error={shippingZonesError}
            onChanged={reloadShippingZones}
            onNotify={showToast}
          />
        </div>
        </>
      )}

      {/* Payments */}
      {activeTab === "payments" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            <strong>Configuration only:</strong> These settings choose which payment methods your
            customers can select and the instructions you show them. Klyvo does not process or
            collect online payments yet — no card details, wallet numbers, or payment secrets are
            ever collected or stored here. Enabling a method does not make online payment collection
            operational.
          </div>
          {SUPPORTED_METHODS.map((method) => {
            const edit = paymentEdits[method];
            return (
              <div
                key={method}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-zinc-950">{method}</h4>
                    <p className="text-[11px] text-zinc-500">
                      {method === "Cash on Delivery"
                        ? "Customer pays the courier in cash on delivery."
                        : method === "InstaPay"
                        ? "Customer transfers via InstaPay using your instructions."
                        : method === "Vodafone Cash"
                        ? "Customer sends payment to your Vodafone Cash wallet using your instructions."
                        : "Card payment option — requires a real payment-provider integration to be operational."}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label htmlFor={`pm-enabled-${method}`} className="text-xs font-semibold text-zinc-700">
                      Enabled
                    </label>
                    <input
                      id={`pm-enabled-${method}`}
                      type="checkbox"
                      checked={edit.enabled}
                      onChange={(e) =>
                        setPaymentEdits((prev) => ({
                          ...prev,
                          [method]: { ...prev[method], enabled: e.target.checked, dirty: true },
                        }))
                      }
                      className="h-5 w-9 cursor-pointer accent-[#2563EB]"
                    />
                    <button
                      type="button"
                      disabled={isSaving || !edit.dirty}
                      onClick={() => handleSavePaymentMethod(method)}
                      className="rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-600 transition-colors disabled:opacity-40"
                    >
                      {isSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <label htmlFor={`pm-instructions-${method}`} className={labelClass}>
                    Merchant instructions for customers
                  </label>
                  <textarea
                    id={`pm-instructions-${method}`}
                    rows={2}
                    value={edit.instructions}
                    onChange={(e) =>
                      setPaymentEdits((prev) => ({
                        ...prev,
                        [method]: { ...prev[method], instructions: e.target.value, dirty: true },
                      }))
                    }
                    className={inputClass}
                    placeholder={
                      method === "InstaPay"
                        ? "e.g. Transfer to yourinstapay@wallet and reply with the reference…"
                        : method === "Vodafone Cash"
                        ? "e.g. Send to 01000000000 and reply with the reference…"
                        : "Optional instructions shown to customers selecting this method."
                    }
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {`${edit.instructions.length}/1000 characters — never include card numbers, CVVs or passwords here.`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
