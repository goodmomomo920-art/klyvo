"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStore } from "@/lib/server/stores";
import { Coupon, CouponComputedStatus, CouponFormData, DiscountType } from "@/types/coupons";
import { CouponRow } from "@/types/database";

/**
 * Server Actions for the Discount Coupons feature.
 *
 * Security model (identical to products.ts / orders.ts / customers.ts):
 * - The merchant identity is ALWAYS derived from the verified server-side
 *   Supabase session via getAuthorizedStore(); client-supplied store IDs are
 *   never trusted, and every query additionally filters by store_id.
 * - Coupon RLS (migration 20261017000000) enforces the same isolation in the
 *   database, so even a compromised client cannot cross stores.
 * - All amounts are validated server-side: finite, positive where required,
 *   bounded; percentage must be (0, 100].
 * - Deleting a coupon with recorded usage is refused (usage rows are the
 *   audit trail; DB FK also restricts the delete).
 */

const MAX_AMOUNT = 999999.99; // consistent with storeSettings MAX_FEE
const CODE_RE = /^[A-Za-z0-9_-]{2,32}$/;

function mapCouponRow(row: CouponRow): Coupon {
  // Status is derived at server time so the browser never calls Date.now()
  // during render (React purity rules) and clock drift cannot flip a badge.
  const now = Date.now();
  const expired = row.expires_at !== null && new Date(row.expires_at).getTime() <= now;
  const scheduled = new Date(row.starts_at).getTime() > now;
  let computedStatus: CouponComputedStatus;
  if (expired) {
    computedStatus = "expired";
  } else if (!row.is_active) {
    computedStatus = "inactive";
  } else if (scheduled) {
    computedStatus = "scheduled";
  } else {
    computedStatus = "active";
  }

  return {
    id: row.id,
    storeId: row.store_id,
    code: row.code,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    minOrderSubtotal:
      row.min_order_subtotal === null ? null : Number(row.min_order_subtotal),
    maxDiscountAmount:
      row.max_discount_amount === null ? null : Number(row.max_discount_amount),
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    usageLimit: row.usage_limit,
    perCustomerLimit: row.per_customer_limit,
    isActive: row.is_active,
    usageCount: Number(row.usage_count || 0),
    computedStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateAmount(
  raw: string,
  label: string,
  opts: { positive?: boolean } = {}
): { ok: true; amount: number } | { ok: false; error: string } {
  const parsed = Number(raw);
  if (raw.trim() === "" || Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return { ok: false, error: `${label} must be a valid number.` };
  }
  if (opts.positive ? parsed <= 0 : parsed < 0) {
    return {
      ok: false,
      error: opts.positive
        ? `${label} must be greater than 0.`
        : `${label} cannot be negative.`,
    };
  }
  if (parsed > MAX_AMOUNT) {
    return { ok: false, error: `${label} cannot exceed ${MAX_AMOUNT}.` };
  }
  return { ok: true, amount: Math.round(parsed * 100) / 100 };
}

function validateCounts(
  raw: string,
  label: string
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw.trim() === "") return { ok: true, value: null };
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { ok: false, error: `${label} must be a whole number greater than 0.` };
  }
  if (parsed > 1000000) {
    return { ok: false, error: `${label} is too large.` };
  }
  return { ok: true, value: parsed };
}

function normalizeCode(raw: string): { ok: true; code: string } | { ok: false; error: string } {
  const code = raw.trim();
  if (!CODE_RE.test(code)) {
    return {
      ok: false,
      error: "Code must be 2–32 characters using letters, numbers, dashes or underscores.",
    };
  }
  return { ok: true, code: code.toUpperCase() };
}

function buildCouponPayload(
  storeId: string,
  data: CouponFormData,
  forUpdate = false
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  const code = normalizeCode(data.code);
  if (!code.ok) return code;

  if (data.discountType !== "percentage" && data.discountType !== "fixed_amount") {
    return { ok: false, error: "Discount type must be percentage or fixed amount." };
  }

  const value = validateAmount(String(data.discountValue), "Discount value", {
    positive: true,
  });
  if (!value.ok) return value;
  if (data.discountType === "percentage" && value.amount > 100) {
    return { ok: false, error: "Percentage discounts cannot exceed 100." };
  }

  let minSubtotal: number | null = null;
  if (data.minOrderSubtotal !== null && data.minOrderSubtotal !== undefined) {
    const parsed = validateAmount(String(data.minOrderSubtotal), "Minimum order subtotal");
    if (!parsed.ok) return parsed;
    minSubtotal = parsed.amount;
  }

  let maxDiscount: number | null = null;
  if (data.maxDiscountAmount !== null && data.maxDiscountAmount !== undefined) {
    if (data.discountType === "fixed_amount") {
      return { ok: false, error: "Maximum discount only applies to percentage coupons." };
    }
    const parsed = validateAmount(String(data.maxDiscountAmount), "Maximum discount amount", {
      positive: true,
    });
    if (!parsed.ok) return parsed;
    maxDiscount = parsed.amount;
  }

  if (!data.startsAt || Number.isNaN(Date.parse(data.startsAt))) {
    return { ok: false, error: "A valid start date is required." };
  }
  if (data.expiresAt && Number.isNaN(Date.parse(data.expiresAt))) {
    return { ok: false, error: "Expiration date is invalid." };
  }
  if (data.expiresAt && Date.parse(data.expiresAt) <= Date.parse(data.startsAt)) {
    return { ok: false, error: "Expiration must be after the start date." };
  }

  const usageLimit = validateCounts(String(data.usageLimit ?? ""), "Total usage limit");
  if (!usageLimit.ok) return usageLimit;

  const perCustomer = validateCounts(
    String(data.perCustomerLimit ?? ""),
    "Per-customer usage limit"
  );
  if (!perCustomer.ok) return perCustomer;

  const payload: Record<string, unknown> = {
    code: code.code,
    discount_type: data.discountType,
    discount_value: value.amount,
    min_order_subtotal: minSubtotal,
    max_discount_amount: maxDiscount,
    starts_at: new Date(data.startsAt).toISOString(),
    expires_at: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
    usage_limit: usageLimit.value,
    per_customer_limit: perCustomer.value,
    is_active: data.isActive,
  };
  if (!forUpdate) {
    payload.store_id = storeId;
  }
  return {
    ok: true,
    payload,
  };
}

/**
 * Server Action: Fetches all coupons for the authenticated merchant's store.
 */
export async function getAuthorizedStoreCoupons(): Promise<{
  success: boolean;
  data?: Coupon[];
  error?: string;
}> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01" || /relation .* does not exist/i.test(error.message)) {
      return {
        success: false,
        error:
          "Coupons table is missing. Run the coupons migration in Supabase first, then reload.",
      };
    }
    return { success: false, error: error.message };
  }

  return { success: true, data: (data as CouponRow[]).map(mapCouponRow) };
}

/**
 * Server Action: Creates a coupon strictly within the authenticated merchant's
 * store. Unique case-insensitive codes per store are enforced by the DB.
 */
export async function createAuthorizedStoreCoupon(
  formData: CouponFormData
): Promise<{ success: boolean; data?: Coupon; error?: string }> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const built = buildCouponPayload(store.id, formData);
  if (!built.ok) {
    return { success: false, error: built.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coupons")
    .insert(built.payload)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        error: `Coupon code "${String(built.payload.code)}" already exists in this store.`,
      };
    }
    return { success: false, error: error.message };
  }

  return { success: true, data: mapCouponRow(data as CouponRow) };
}

/**
 * Server Action: Updates an existing coupon of the authenticated merchant's
 * store. usage_count is database-managed and never writable here.
 */
export async function updateAuthorizedStoreCoupon(
  couponId: string,
  formData: CouponFormData
): Promise<{ success: boolean; data?: Coupon; error?: string }> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const built = buildCouponPayload(store.id, formData, true);
  if (!built.ok) {
    return { success: false, error: built.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coupons")
    .update(built.payload)
    .eq("id", couponId)
    .eq("store_id", store.id)
    .select()
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return {
        success: false,
        error: `Coupon code "${String(built.payload.code)}" already exists in this store.`,
      };
    }
    return { success: false, error: error?.message || "Failed to update coupon." };
  }

  return { success: true, data: mapCouponRow(data as CouponRow) };
}

/**
 * Server Action: Enables or disables a coupon.
 */
export async function setAuthorizedStoreCouponActive(
  couponId: string,
  isActive: boolean
): Promise<{ success: boolean; data?: Coupon; error?: string }> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coupons")
    .update({ is_active: isActive })
    .eq("id", couponId)
    .eq("store_id", store.id)
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Failed to update coupon status." };
  }

  return { success: true, data: mapCouponRow(data as CouponRow) };
}

/**
 * Server Action: Deletes a coupon — only when no successful order has used it
 * (usage rows are permanent audit records protected by an FK RESTRICT).
 */
export async function deleteAuthorizedStoreCoupon(
  couponId: string
): Promise<{ success: boolean; error?: string }> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("coupon_usage")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", couponId)
    .eq("store_id", store.id);

  if (count !== null && count > 0) {
    return {
      success: false,
      error: "This coupon has been used in orders and cannot be deleted. Disable it instead.",
    };
  }

  const { error } = await supabase
    .from("coupons")
    .delete()
    .eq("id", couponId)
    .eq("store_id", store.id);

  if (error) {
    if (error.code === "23503") {
      return {
        success: false,
        error: "This coupon has been used in orders and cannot be deleted. Disable it instead.",
      };
    }
    return { success: false, error: error.message };
  }

  return { success: true };
}

export type { DiscountType };
