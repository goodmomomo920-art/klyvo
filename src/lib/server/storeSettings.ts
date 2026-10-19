"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStore, slugify } from "@/lib/server/stores";
import { invalidateStorefrontCache } from "@/lib/server/storefrontCache";
import { StoreRow, StorePaymentMethodRow } from "@/types/database";

/**
 * Server Actions for the Store Settings feature.
 *
 * Security model (identical to products.ts / orders.ts / customers.ts):
 * - The merchant identity is ALWAYS derived from the verified server-side
 *   Supabase session via getAuthorizedStore(); client-supplied store or owner
 *   IDs are never trusted.
 * - Every mutation filters by the session-resolved store id and is additionally
 *   protected by the RLS policies added in migration 0000 and 0004.
 * - All amounts are validated server-side: finite, non-negative, bounded.
 * - No payment credentials are ever accepted, processed, or stored. These
 *   actions configure payment-method availability and merchant instructions
 *   only; they do NOT process or collect payments.
 */

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface StoreProfileInput {
  name: string;
  slug: string;
  logoUrl?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  governorate?: string;
}

export interface StoreAppearanceInput {
  primaryColor: string;
  secondaryColor: string;
}

export interface StoreRegionalInput {
  currency: string;
  language: string;
  timezone: string;
}

export interface StoreShippingInput {
  shippingEnabled: boolean;
  shippingFee: number;
  freeShippingThreshold: number | null;
}

export type SupportedPaymentMethod =
  | "Cash on Delivery"
  | "InstaPay"
  | "Vodafone Cash"
  | "Credit / Debit Card";

export interface StorePaymentMethodInput {
  enabled: boolean;
  instructions?: string;
}

export interface StoreSettingsBundle {
  store: StoreRow;
  paymentMethods: StorePaymentMethodRow[];
}

const SUPPORTED_PAYMENT_METHODS: readonly SupportedPaymentMethod[] = [
  "Cash on Delivery",
  "InstaPay",
  "Vodafone Cash",
  "Credit / Debit Card",
];

const MAX_FEE = 999999.99;
const KNOWN_TIMEZONES: ReadonlySet<string> | null = (() => {
  try {
    const list = Intl.supportedValuesOf?.("timeZone");
    return list ? new Set(list) : null;
  } catch {
    return null;
  }
})();

/**
 * Validates a monetary amount server-side: rejects negative, NaN, Infinite and
 * out-of-bounds values, returning the value rounded to 2 decimals.
 */
function validateAmount(
  value: unknown,
  label: string
): { ok: true; amount: number } | { ok: false; error: string } {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return { ok: false, error: `${label} must be a valid finite number.` };
  }
  if (value < 0) {
    return { ok: false, error: `${label} cannot be negative.` };
  }
  const rounded = Math.round(value * 100) / 100;
  if (rounded > MAX_FEE) {
    return { ok: false, error: `${label} cannot exceed 999,999.99 EGP.` };
  }
  return { ok: true, amount: rounded };
}

function validateEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function validateHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Server Action: Loads the complete settings bundle for the authenticated
 * merchant's store. Ensures all four payment-method config rows exist
 * (idempotent, mirroring the migration's seed for legacy stores).
 */
export async function getAuthorizedStoreSettings(): Promise<ActionResult<StoreSettingsBundle>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();

  // Idempotently backfill the payment-method configuration rows for stores
  // created before migration 0004 seeded them.
  const { error: seedError } = await supabase
    .from("store_payment_methods")
    .upsert(
      SUPPORTED_PAYMENT_METHODS.map((method) => ({ store_id: store.id, method })),
      { onConflict: "store_id,method", ignoreDuplicates: true }
    );

  if (seedError) {
    return { success: false, error: seedError.message };
  }

  const { data: paymentMethods, error } = await supabase
    .from("store_payment_methods")
    .select("*")
    .eq("store_id", store.id);

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      store,
      paymentMethods: (paymentMethods ?? []) as StorePaymentMethodRow[],
    },
  };
}

/**
 * Server Action: Updates the store profile (name, slug, logo, contact details).
 * Slug is normalized server-side and uniqueness-checked against all stores.
 */
export async function updateStoreProfile(
  input: StoreProfileInput
): Promise<ActionResult<StoreRow>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const name = (input.name ?? "").trim();
  if (name.length === 0) {
    return { success: false, error: "Store name is required." };
  }
  if (name.length > 255) {
    return { success: false, error: "Store name cannot exceed 255 characters." };
  }

  // Normalize the slug from the provided value, falling back to the store name.
  const slugBase = slugify((input.slug ?? "").trim() || name);
  if (slugBase.length === 0) {
    return {
      success: false,
      error: "Store slug could not be normalized. Use letters, numbers and dashes.",
    };
  }
  // Uniqueness: always suffix the owner id fragment, matching bootstrap behavior,
  // unless the merchant edited the slug themselves and kept it clean.
  let slug = slugBase;
  if ((input.slug ?? "").trim() === "") {
    slug = `${slugBase}-${store.owner_id.slice(0, 4)}`;
  }

  const supabase = await createClient();

  if (slug !== store.slug) {
    const { data: existing, error: slugCheckError } = await supabase
      .from("stores")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (slugCheckError) {
      return { success: false, error: slugCheckError.message };
    }
    if (existing && existing.id !== store.id) {
      return { success: false, error: `The store URL "${slug}" is already taken.` };
    }
  }

  const description = (input.description ?? "").trim();
  if (description.length > 2000) {
    return { success: false, error: "Store description cannot exceed 2000 characters." };
  }

  const contactEmail = (input.contactEmail ?? "").trim() || null;
  if (contactEmail && !validateEmail(contactEmail)) {
    return { success: false, error: "Contact email is not a valid email address." };
  }

  const contactPhone = (input.contactPhone ?? "").trim() || null;
  if (contactPhone && contactPhone.length > 50) {
    return { success: false, error: "Contact phone cannot exceed 50 characters." };
  }

  const address = (input.address ?? "").trim() || "";
  if (address.length > 500) {
    return { success: false, error: "Store address cannot exceed 500 characters." };
  }

  const city = (input.city ?? "").trim() || "";
  if (city.length > 100) {
    return { success: false, error: "City cannot exceed 100 characters." };
  }

  const governorate = (input.governorate ?? "").trim() || "";
  if (governorate.length > 100) {
    return { success: false, error: "Governorate cannot exceed 100 characters." };
  }

  const logoUrl = (input.logoUrl ?? "").trim() || null;
  if (logoUrl) {
    if (logoUrl.length > 2048 || !validateHttpUrl(logoUrl)) {
      return {
        success: false,
        error: "Store logo must be a valid http(s) image URL (max 2048 characters).",
      };
    }
  }

  const { data, error } = await supabase
    .from("stores")
    .update({
      name,
      slug,
      description,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      address,
      city,
      governorate,
      logo_url: logoUrl,
    })
    .eq("id", store.id)
    .select()
    .single();

  if (error) {
    // RLS limits our slug-availability scan to our own stores, so a collision
    // with another merchant's slug surfaces as a DB unique violation (23505).
    if (error.code === "23505" && error.message.includes("stores_slug_unique")) {
      return { success: false, error: `The store URL "${slug}" is already taken.` };
    }
    return { success: false, error: error.message };
  }

  invalidateStorefrontCache(store.slug);
  return { success: true, data: data as StoreRow };
}

/**
 * Server Action: Updates brand colors. Accepts 6-digit hex values only.
 */
export async function updateStoreAppearance(
  input: StoreAppearanceInput
): Promise<ActionResult<StoreRow>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const hex = /^#[0-9a-fA-F]{6}$/;
  const primaryColor = (input.primaryColor ?? "").trim();
  const secondaryColor = (input.secondaryColor ?? "").trim();

  if (!hex.test(primaryColor) || !hex.test(secondaryColor)) {
    return {
      success: false,
      error: "Colors must be valid 6-digit hex values, e.g. #2563EB.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .update({ primary_color: primaryColor.toLowerCase(), secondary_color: secondaryColor.toLowerCase() })
    .eq("id", store.id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  invalidateStorefrontCache(store.slug);
  return { success: true, data: data as StoreRow };
}

/**
 * Server Action: Updates regional preferences (currency, language, timezone).
 * Language is 'ar' or 'en'. Currency is an uppercase ISO 4217-style 3-letter code.
 * Timezone is validated against the runtime's IANA list when available.
 */
export async function updateStoreRegional(
  input: StoreRegionalInput
): Promise<ActionResult<StoreRow>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const currency = (input.currency ?? "").trim().toUpperCase();
  if (!/^[A-Za-z]{3}$/.test(input.currency?.trim() ?? "")) {
    return { success: false, error: "Currency must be a 3-letter ISO code, e.g. EGP." };
  }

  const language = (input.language ?? "").trim().toLowerCase();
  if (language !== "en" && language !== "ar") {
    return { success: false, error: "Language must be either English (en) or Arabic (ar)." };
  }

  const timezone = (input.timezone ?? "").trim();
  if (timezone.length === 0 || timezone.length > 100 || !/^[A-Za-z][A-Za-z0-9_+\-/]+$/.test(timezone)) {
    return { success: false, error: "Please provide a valid IANA timezone, e.g. Africa/Cairo." };
  }
  if (KNOWN_TIMEZONES && !KNOWN_TIMEZONES.has(timezone)) {
    return { success: false, error: `"${timezone}" is not a recognized IANA timezone.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .update({ currency, language, timezone })
    .eq("id", store.id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  invalidateStorefrontCache(store.slug);
  return { success: true, data: data as StoreRow };
}

/**
 * Server Action: Updates shipping configuration for the store. All amounts are
 * validated server-side (finite, non-negative, <= 999,999.99 EGP). This
 * configures the store only; it does not integrate any courier service.
 */
export async function updateStoreShipping(
  input: StoreShippingInput
): Promise<ActionResult<StoreRow>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const feeCheck = validateAmount(input.shippingFee, "Default shipping fee");
  if (!feeCheck.ok) {
    return { success: false, error: feeCheck.error };
  }

  let threshold: number | null = null;
  if (input.freeShippingThreshold !== null && input.freeShippingThreshold !== undefined) {
    const thresholdCheck = validateAmount(
      input.freeShippingThreshold,
      "Free shipping threshold"
    );
    if (!thresholdCheck.ok) {
      return { success: false, error: thresholdCheck.error };
    }
    threshold = thresholdCheck.amount;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .update({
      shipping_enabled: Boolean(input.shippingEnabled),
      shipping_fee: feeCheck.amount,
      free_shipping_threshold: threshold,
    })
    .eq("id", store.id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  invalidateStorefrontCache(store.slug);
  return { success: true, data: data as StoreRow };
}

/**
 * Server Action: Enables/disables one supported payment method and sets its
 * optional customer-facing instructions.
 *
 * IMPORTANT: This is merchant CONFIGURATION only. No card numbers, CVVs,
 * passwords, tokens, or other payment secrets are accepted or stored here, and
 * no payment collection is performed. Actual payment processing requires a
 * real payment-provider integration and is not part of this feature.
 */
export async function updateStorePaymentMethod(
  method: string,
  input: StorePaymentMethodInput
): Promise<ActionResult<StorePaymentMethodRow>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  if (!SUPPORTED_PAYMENT_METHODS.includes(method as SupportedPaymentMethod)) {
    return { success: false, error: "Unsupported payment method." };
  }

  const instructions = (input.instructions ?? "").trim();
  if (instructions.length > 1000) {
    return {
      success: false,
      error: "Payment instructions cannot exceed 1000 characters.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_payment_methods")
    .upsert(
      {
        store_id: store.id,
        method,
        enabled: Boolean(input.enabled),
        instructions,
      },
      { onConflict: "store_id,method" }
    )
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  invalidateStorefrontCache(store.slug);
  return { success: true, data: data as StorePaymentMethodRow };
}
