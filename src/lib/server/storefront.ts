"use server";

import { createPublicClient } from "@/lib/supabase/public";
import {
  cachedPublicStore,
  cachedPublicStoreProducts,
  cachedPublicStoreProductDetail,
  cachedPublicStoreProductReviews,
} from "@/lib/server/storefrontCache";
import { completeCartConversion } from "@/lib/server/cartLifecycle";
import { PublicCouponCheck as PublicCouponVerdict } from "@/types/coupons";
import {
  PublicOrderResult,
  PublicProduct,
  PublicProductDetail,
  PublicProductPage,
  PublicStoreConfig,
  CheckoutFormData,
  CartItem,
  MAX_QUANTITY_PER_LINE,
} from "@/types/storefront";
import { PaymentMethod } from "@/types/database";
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
} from "@/lib/appearance";
import { isValidCampaignToken } from "@/lib/campaigns";
import { validateReviewSubmission } from "@/lib/reviews";
import type { CampaignVisitResult } from "@/types/campaigns";
import type {
  PublicReview,
  PublicReviewPage,
  ReviewSubmission,
} from "@/types/reviews";
import type { PublicShippingZone } from "@/types/shipping";
import type { ProductOption, PublicVariant } from "@/types/variants";

const SUPPORTED_PAYMENT_METHODS: PaymentMethod[] = [
  "Cash on Delivery",
  "InstaPay",
  "Vodafone Cash",
  "Credit / Debit Card",
];

function mapShippingZones(raw: unknown): PublicShippingZone[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>)
    .map((zone) => ({
      id: String(zone.id),
      governorate: String(zone.governorate ?? ""),
      area: String(zone.area ?? "All areas"),
      fee: Number(zone.fee ?? 0),
      freeShippingThreshold:
        zone.free_shipping_threshold === null ||
        zone.free_shipping_threshold === undefined
          ? null
          : Number(zone.free_shipping_threshold),
    }))
    .filter((zone) => /^[0-9a-fA-F-]{36}$/.test(zone.id) && zone.governorate.length > 0);
}

function mapStoreConfig(row: Record<string, unknown>): PublicStoreConfig {
  const fallbackAppearance = {
    ...DEFAULT_APPEARANCE,
    logoUrl: (row.logo_url as string | null) ?? "",
    primaryColor: String(row.primary_color ?? DEFAULT_APPEARANCE.primaryColor),
    secondaryColor: String(row.secondary_color ?? DEFAULT_APPEARANCE.secondaryColor),
  };
  // Only the published snapshot is exposed by the RPC. Draft edits never reach
  // a customer. Malformed values fall back safely.
  const appearance = normalizeAppearance(row.appearance, fallbackAppearance);

  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: String(row.description ?? ""),
    logoUrl: appearance.logoUrl || ((row.logo_url as string | null) ?? null),
    primaryColor: appearance.primaryColor,
    secondaryColor: appearance.secondaryColor,
    appearance,
    shippingZones: mapShippingZones(row.shipping_zones),
    language: (row.language as "en" | "ar") === "ar" ? "ar" : "en",
    currency: String(row.currency ?? "EGP"),
    shippingEnabled: Boolean(row.shipping_enabled),
    shippingFee: Number(row.shipping_fee ?? 0),
    freeShippingThreshold:
      row.free_shipping_threshold === null || row.free_shipping_threshold === undefined
        ? null
        : Number(row.free_shipping_threshold),
    contactEmail: (row.contact_email as string | null) ?? null,
    contactPhone: (row.contact_phone as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    governorate: (row.governorate as string | null) ?? null,
    paymentMethods: Array.isArray(row.payment_methods)
      ? (row.payment_methods as Array<Record<string, unknown>>).map((pm) => ({
          method: String(pm.method) as PaymentMethod,
          instructions: String(pm.instructions ?? ""),
        }))
      : [],
  };
}

function mapOptions(raw: unknown): ProductOption[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>)
    .map((option, optionIndex) => ({
      id: String(option.id),
      name: String(option.name ?? ""),
      position: Number(option.position ?? optionIndex),
      values: Array.isArray(option.values)
        ? (option.values as Array<Record<string, unknown>>).map((value, valueIndex) => ({
            id: String(value.id),
            optionId: String(option.id),
            value: String(value.value ?? ""),
            position: valueIndex,
          }))
        : [],
    }))
    .filter((option) => /^[0-9a-fA-F-]{36}$/.test(option.id));
}

function mapPublicVariants(raw: unknown): PublicVariant[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>)
    .map((variant) => ({
      id: String(variant.id),
      sku: String(variant.sku ?? ""),
      price: Number(variant.price ?? 0),
      stock: Number(variant.stock ?? 0),
      optionValueIds: Array.isArray(variant.option_value_ids)
        ? (variant.option_value_ids as unknown[]).map(String)
        : [],
    }))
    .filter(
      (variant) =>
        /^[0-9a-fA-F-]{36}$/.test(variant.id) &&
        variant.optionValueIds.length > 0
    );
}

function mapProduct(row: Record<string, unknown>): PublicProduct {
  return {
    id: String(row.id),
    name: String(row.name),
    nameAr: (row.name_ar as string | null) ?? null,
    nameEn: (row.name_en as string | null) ?? null,
    description: String(row.description ?? ""),
    category: String(row.category ?? "General Merchandise"),
    price: Number(row.price ?? 0),
    compareAtPrice:
      row.compare_at_price === null || row.compare_at_price === undefined
        ? null
        : Number(row.compare_at_price),
    stock: Number(row.stock ?? 0),
    imageUrl: (row.image_url as string | null) ?? null,
    hasVariants: Boolean(row.has_variants),
    options: mapOptions(row.options),
    variants: mapPublicVariants(row.variants),
    ratingAverage: Number(row.rating_average ?? 0),
    reviewCount: Number(row.review_count ?? 0),
  };
}

/**
 * Public server helper: resolves a storefront by slug through the safe
 * SECURITY DEFINER RPC `get_public_store`. Returns null when not found.
 */
async function fetchPublicStore(slug: string): Promise<PublicStoreConfig | null> {
  const supabase = createPublicClient();
  const trimmed = slug.trim();
  if (!trimmed || trimmed.length > 100 || !/^[a-z0-9-]+$/.test(trimmed)) {
    return null;
  }

  const { data, error } = await supabase.rpc("get_public_store", { p_slug: trimmed });
  if (error) return null;
  if (!data) return null;
  return mapStoreConfig(data as Record<string, unknown>);
}

export async function getPublicStore(slug: string): Promise<PublicStoreConfig | null> {
  const trimmed = (slug ?? "").trim();
  return await cachedPublicStore(trimmed, fetchPublicStore);
}

/**
 * Public server helper: paginated Active product listing with optional search
 * and category filters via `get_public_store_products`.
 */
async function fetchPublicStoreProducts(params: {
  slug: string;
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
}): Promise<PublicProductPage> {
  const supabase = createPublicClient();
  const slug = params.slug.trim();

  if (!slug || slug.length > 100 || !/^[a-z0-9-]+$/.test(slug)) {
    return { products: [], total: 0, page: 1, pageSize: 12, hasMore: false };
  }

  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const pageSize = Math.min(48, Math.max(1, Math.floor(Number(params.pageSize) || 12)));

  const { data, error } = await supabase.rpc("get_public_store_products", {
    p_slug: slug,
    p_page: page,
    p_page_size: pageSize,
    p_search: params.search?.trim() ? params.search.trim() : null,
    p_category: params.category?.trim() ? params.category.trim() : null,
    p_product_id: null,
  });
  if (error || !data) {
    return { products: [], total: 0, page, pageSize, hasMore: false };
  }

  const payload = data as Record<string, unknown>;
  return {
    products: Array.isArray(payload.products)
      ? (payload.products as Array<Record<string, unknown>>).map(mapProduct)
      : [],
    total: Number(payload.total ?? 0),
    page: Number(payload.page ?? page),
    pageSize: Number(payload.page_size ?? pageSize),
    hasMore: Boolean(payload.has_more),
  };
}

export async function getPublicStoreProducts(params: {
  slug: string;
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
}): Promise<PublicProductPage> {
  return await cachedPublicStoreProducts(params, fetchPublicStoreProducts);
}

/**
 * Public server helper: single Active product detail by id via
 * `get_public_store_products(p_product_id)`.
 */
async function fetchPublicStoreProductDetail(
  slug: string,
  productId: string
): Promise<PublicProductDetail | null> {
  const supabase = createPublicClient();

  if (!productId || productId.length > 64 || !/^[0-9a-fA-F-]{36}$/.test(productId)) {
    return null;
  }

  const { data, error } = await supabase.rpc("get_public_store_products", {
    p_slug: slug.trim(),
    p_page: 1,
    p_page_size: 1,
    p_search: null,
    p_category: null,
    p_product_id: productId,
  });
  if (error || !data) return null;

  const payload = data as { product?: Record<string, unknown> | null };
  if (!payload?.product) return null;

  return { product: mapProduct(payload.product) };
}

export async function getPublicStoreProductDetail(
  slug: string,
  productId: string
): Promise<PublicProductDetail | null> {
  return await cachedPublicStoreProductDetail(slug, productId, fetchPublicStoreProductDetail);
}

function validatePhone(phone: string): boolean {
  return /^\+?[0-9][0-9 \-()]{4,49}$/.test(phone.trim());
}

function validateEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

/**
 * Server Action: pre-checkout coupon validation for the public storefront.
 *
 * Calls the narrowly scoped SECURITY DEFINER RPC `validate_public_coupon`, so
 * customers can never read, enumerate, or edit the merchant's coupons. The
 * verdict returned here is informational UX only — the exact same rules are
 * re-enforced authoritatively inside `create_public_store_order` against the
 * catalog-derived subtotal under a coupon row lock, so a tampered estimate can
 * never produce a wrong discount.
 */
export async function validatePublicStoreCoupon(
  slug: string,
  code: string,
  estimatedSubtotal: number,
  phone?: string
): Promise<{ success: boolean; data?: PublicCouponVerdict; error?: string }> {
  const trimmedSlug = (slug ?? "").trim();
  if (!trimmedSlug || trimmedSlug.length > 100 || !/^[a-z0-9-]+$/.test(trimmedSlug)) {
    return { success: false, error: "Invalid store." };
  }

  const rawCode = (code ?? "").toString().trim().toUpperCase();
  if (rawCode.length < 2 || rawCode.length > 32 || !/^[A-Z0-9_-]+$/.test(rawCode)) {
    return { success: false, error: "Enter a valid coupon code." };
  }

  const subtotal = Number(estimatedSubtotal);
  if (!Number.isFinite(subtotal) || subtotal < 0 || subtotal > 9999999999.99) {
    return { success: false, error: "Invalid cart subtotal." };
  }

  // Phone (when present) is normalized server-side exactly like checkout for
  // an indicative per-customer-limit check. Never trusted at face value.
  let phoneNorm: string | null = null;
  if (phone && validatePhone(phone)) {
    phoneNorm = phone.trim().toLowerCase().replace(/[^0-9+]/g, "");
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("validate_public_coupon", {
    p_slug: trimmedSlug,
    p_code: rawCode,
    p_subtotal: subtotal,
    p_phone_norm: phoneNorm,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const verdict = data as Record<string, unknown> | null;
  if (!verdict || typeof verdict !== "object") {
    return { success: false, error: "Coupon validation failed." };
  }

  return {
    success: true,
    data: {
      valid: Boolean(verdict.valid),
      errorCode: verdict.error_code === null || verdict.error_code === undefined ? null : String(verdict.error_code),
      message: verdict.message === null || verdict.message === undefined ? null : String(verdict.message),
      code: verdict.code === undefined ? undefined : String(verdict.code),
      discountType: verdict.discount_type === undefined ? undefined : (String(verdict.discount_type) as "percentage" | "fixed_amount"),
      discountValue: verdict.discount_value === undefined ? undefined : Number(verdict.discount_value),
      discountAmount:
        verdict.discount_amount === undefined || verdict.discount_amount === null
          ? undefined
          : Number(verdict.discount_amount),
    },
  };
}

/**
 * Server Action: submits an anonymous checkout order through the hardened
 * SECURITY DEFINER RPC `create_public_store_order`.
 *
 * Integrity rules (enforced DB-side; mirrored here for fast feedback):
 * - Store resolved only by validated slug; client-supplied store/product
 *   prices, fees and totals are ignored entirely.
 * - Items must be catalog products of this store; quantities are capped by
 * - stock; disabled payment methods are rejected.
 */
export async function submitPublicStoreOrder(
  slug: string,
  formData: CheckoutFormData,
  cartItems: CartItem[],
  couponCode?: string | null,
  cartToken?: string | null,
  campaignToken?: string | null
): Promise<{ success: boolean; data?: PublicOrderResult; error?: string }> {
  // Anonymous cart lifecycle token (Feature B). Strictly validated; used
  // ONLY to idempotently mark a converted cart after the order is created.
  const trimmedSlug = (slug ?? "").trim();
  if (!trimmedSlug || trimmedSlug.length > 100 || !/^[a-z0-9-]+$/.test(trimmedSlug)) {
    return { success: false, error: "Invalid store." };
  }

  const customerName = (formData.customerName ?? "").trim();
  if (!customerName || customerName.length > 255) {
    return { success: false, error: "Please provide your full name." };
  }

  const customerPhone = (formData.customerPhone ?? "").trim();
  if (!customerPhone || !validatePhone(customerPhone)) {
    return { success: false, error: "Please provide a valid phone number." };
  }

  const customerEmail = (formData.customerEmail ?? "").trim();
  if (customerEmail && !validateEmail(customerEmail)) {
    return { success: false, error: "Please provide a valid email address." };
  }

  const shippingAddress = (formData.shippingAddress ?? "").trim();
  if (!shippingAddress || shippingAddress.length > 500) {
    return { success: false, error: "Please provide a detailed delivery address." };
  }

  const shippingCity = (formData.shippingCity ?? "").trim().slice(0, 100);
  const shippingGovernorate = (formData.shippingGovernorate ?? "").trim().slice(0, 100);
  const notes = (formData.notes ?? "").trim().slice(0, 1000);

  // The zone id is a reference only — its fee is re-read server-side inside the
  // checkout RPC. A malformed id is rejected before any RPC call.
  const rawZoneId = (formData.shippingZoneId ?? "").toString().trim();
  const shippingZoneId = rawZoneId || null;
  if (shippingZoneId && !/^[0-9a-fA-F-]{36}$/.test(shippingZoneId)) {
    return { success: false, error: "Please select a valid delivery area." };
  }

  const paymentMethod = formData.paymentMethod;
  if (
    !paymentMethod ||
    !SUPPORTED_PAYMENT_METHODS.includes(paymentMethod)
  ) {
    return { success: false, error: "Please select a payment method." };
  }

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return { success: false, error: "Your cart is empty." };
  }
  if (cartItems.length > 50) {
    return { success: false, error: "Too many distinct items in the cart." };
  }

  const productsPayload: Array<{
    product_id: string;
    variant_id: string | null;
    quantity: number;
  }> = [];
  const seenLineKeys = new Set<string>();
  for (const [index, item] of cartItems.entries()) {
    // Accept legacy namespaced ids defensively, but never trust the shape.
    const rawId = (item?.productId ?? "").toString().trim();
    const productId = rawId.startsWith(`${trimmedSlug}:`)
      ? rawId.slice(trimmedSlug.length + 1).split(":")[0]
      : rawId;
    if (!productId || !/^[0-9a-fA-F-]{36}$/.test(productId)) {
      return { success: false, error: `Cart item #${index + 1} has an invalid product reference.` };
    }

    const rawVariantId = (item?.variantId ?? "").toString().trim();
    if (rawVariantId && !/^[0-9a-fA-F-]{36}$/.test(rawVariantId)) {
      return { success: false, error: `Cart item #${index + 1} has an invalid variant reference.` };
    }
    const variantId = rawVariantId || null;

    const lineKey = `${productId}:${variantId ?? "base"}`;
    if (seenLineKeys.has(lineKey)) {
      return { success: false, error: `Duplicate cart line: ${item?.name ?? productId}.` };
    }
    seenLineKeys.add(lineKey);

    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_QUANTITY_PER_LINE) {
      return {
        success: false,
        error: `Cart item #${index + 1}: invalid quantity.`,
      };
    }
    // Fast client-side feedback only; the RPC re-checks variant stock.
    const stock = Number(item.stock);
    if (Number.isFinite(stock) && qty > stock) {
      return {
        success: false,
        error: `Only ${stock} unit(s) of "${item?.name ?? "item"}" are available.`,
      };
    }
    productsPayload.push({ product_id: productId, variant_id: variantId, quantity: qty });
  }

  // The browser only ever sends the coupon CODE string — never an amount.
  // Any discount is recomputed server-side from catalog prices.
  const rawCouponCode = (couponCode ?? "").toString().trim();
  const normalizedCouponCode =
    rawCouponCode.length >= 2 &&
    rawCouponCode.length <= 32 &&
    /^[A-Za-z0-9_-]+$/.test(rawCouponCode)
      ? rawCouponCode.toUpperCase()
      : null;

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("create_public_store_order", {
    p_store_slug: trimmedSlug,
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_customer_email: customerEmail || null,
    p_shipping_address: shippingAddress,
    p_shipping_city: shippingCity || null,
    p_shipping_governorate: shippingGovernorate || null,
    p_payment_method: paymentMethod,
    p_notes: notes || null,
    p_items: productsPayload,
    p_coupon_code: normalizedCouponCode,
    p_shipping_zone_id: shippingZoneId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as Record<string, unknown> | null;
  if (!result?.order_id) {
    return { success: false, error: "Order transaction failed: no order reference returned." };
  }

  const orderId = String(result.order_id);

  // Cart lifecycle conversion (best-effort, idempotent, store-verified inside
  // the RPC so a token can never mark a cross-store conversion). Runs only
  // after the order transaction genuinely succeeded.
  if (cartToken) {
    await completeCartConversion(cartToken, orderId);
  }

  // Measured campaign attribution: best-effort, verified and idempotent inside
  // the RPC (order/store/window checks + UNIQUE order_id). Never blocks an
  // order that already committed.
  if (campaignToken && isValidCampaignToken(campaignToken)) {
    try {
      await supabase.rpc("record_campaign_order", {
        p_token: campaignToken,
        p_order_id: orderId,
      });
    } catch {
      /* Measurement is non-blocking. */
    }
  }

  return {
    success: true,
    data: {
      orderId,
      orderNumber: String(result.order_number),
      subtotal: Number(result.subtotal ?? 0),
      discountAmount: Number(result.discount_amount ?? 0),
      couponCode:
        result.coupon_code === null || result.coupon_code === undefined
          ? null
          : String(result.coupon_code),
      shippingFee: Number(result.shipping_fee ?? 0),
      shippingZoneId:
        result.shipping_zone_id === null || result.shipping_zone_id === undefined
          ? null
          : String(result.shipping_zone_id),
      shippingArea:
        result.shipping_area === null || result.shipping_area === undefined
          ? null
          : String(result.shipping_area),
      total: Number(result.total ?? 0),
      currency: String(result.currency ?? "EGP"),
      paymentMethod: String(result.payment_method) as PaymentMethod,
    },
  };
}

/**
 * Public Server Action: published reviews + rating aggregate for one product.
 * Only published rows are returned by the RPC; hidden/rejected reviews never
 * count toward the average or the count.
 */
async function fetchPublicStoreProductReviews(
  slug: string,
  productId: string,
  page = 1
): Promise<{ success: boolean; data?: PublicReviewPage; error?: string }> {
  const trimmedSlug = (slug ?? "").trim();
  if (!trimmedSlug || trimmedSlug.length > 100 || !/^[a-z0-9-]+$/.test(trimmedSlug)) {
    return { success: false, error: "Invalid store." };
  }
  if (!productId || !/^[0-9a-fA-F-]{36}$/.test(productId)) {
    return { success: false, error: "Invalid product." };
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_public_product_reviews", {
    p_slug: trimmedSlug,
    p_product_id: productId,
    p_page: Math.max(1, Math.floor(Number(page) || 1)),
    p_page_size: 10,
  });

  if (error || !data) {
    return { success: false, error: error?.message || "Failed to load reviews." };
  }

  const payload = data as Record<string, unknown>;
  const reviews: PublicReview[] = Array.isArray(payload.reviews)
    ? (payload.reviews as Array<Record<string, unknown>>).map((review) => ({
        id: String(review.id),
        rating: Number(review.rating ?? 0),
        title: String(review.title ?? ""),
        body: String(review.body ?? ""),
        reviewerName: String(review.reviewer_name ?? "Customer"),
        isVerifiedPurchase: Boolean(review.is_verified_purchase),
        createdAt: String(review.created_at ?? ""),
      }))
    : [];

  return {
    success: true,
    data: {
      reviews,
      total: Number(payload.total ?? 0),
      averageRating: Number(payload.average_rating ?? 0),
      reviewCount: Number(payload.review_count ?? payload.total ?? 0),
      page: Number(payload.page ?? page),
      hasMore: Boolean(payload.has_more),
    },
  };
}

export async function getPublicStoreProductReviews(
  slug: string,
  productId: string,
  page = 1
): Promise<{ success: boolean; data?: PublicReviewPage; error?: string }> {
  return await cachedPublicStoreProductReviews(
    slug,
    productId,
    page,
    fetchPublicStoreProductReviews
  );
}

/**
 * Public Server Action: submits a review for moderation.
 *
 * The RPC owns identity hashing, duplicate prevention, the per-store spam
 * limit and verified-purchase determination. This action mirrors validation
 * for fast feedback and never receives/stores the phone beyond the call.
 */
export async function submitPublicStoreProductReview(
  slug: string,
  productId: string,
  input: ReviewSubmission
): Promise<{
  success: boolean;
  data?: {
    reviewId: string;
    status: "pending";
    isVerifiedPurchase: boolean;
    message: string;
  };
  error?: string;
  errorCode?: string;
}> {
  const trimmedSlug = (slug ?? "").trim();
  if (!trimmedSlug || trimmedSlug.length > 100 || !/^[a-z0-9-]+$/.test(trimmedSlug)) {
    return { success: false, error: "Invalid store.", errorCode: "INVALID_STORE" };
  }
  if (!productId || !/^[0-9a-fA-F-]{36}$/.test(productId)) {
    return { success: false, error: "Invalid product.", errorCode: "PRODUCT_NOT_FOUND" };
  }

  const checked = validateReviewSubmission(input);
  if (!checked.ok) {
    return {
      success: false,
      error: checked.message,
      errorCode: checked.errorCode,
    };
  }

  const value = checked.value;
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("submit_public_product_review", {
    p_slug: trimmedSlug,
    p_product_id: productId,
    p_rating: value.rating,
    p_title: value.title,
    p_body: value.body,
    p_reviewer_name: value.reviewerName,
    p_phone: value.phone,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const verdict = data as Record<string, unknown> | null;
  if (!verdict || verdict.success !== true) {
    return {
      success: false,
      error:
        (verdict?.message as string | undefined) ||
        "Your review could not be submitted.",
      errorCode: (verdict?.error_code as string | undefined) || "SUBMIT_FAILED",
    };
  }

  return {
    success: true,
    data: {
      reviewId: String(verdict.review_id),
      status: "pending",
      isVerifiedPurchase: Boolean(verdict.is_verified_purchase),
      message: String(verdict.message ?? "Your review was submitted for moderation."),
    },
  };
}

/**
 * Public Server Action: records a deduplicated campaign link visit. Returns the
 * linked coupon code so checkout can offer it. Campaign measurement only — no
 * personal data is stored (the visitor token is hashed in the database).
 */
export async function recordPublicCampaignVisit(
  slug: string,
  token: string,
  visitorToken: string
): Promise<{ success: boolean; data?: CampaignVisitResult; error?: string }> {
  const trimmedSlug = (slug ?? "").trim();
  if (!trimmedSlug || trimmedSlug.length > 100 || !/^[a-z0-9-]+$/.test(trimmedSlug)) {
    return { success: false, error: "Invalid store." };
  }
  if (!isValidCampaignToken(token)) {
    return { success: false, error: "Invalid campaign link." };
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(visitorToken ?? "")) {
    return { success: false, error: "Invalid visitor token." };
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("record_campaign_visit", {
    p_slug: trimmedSlug,
    p_token: token,
    p_visitor_token: visitorToken,
  });

  if (error || !data) {
    return { success: false, error: error?.message || "Campaign tracking unavailable." };
  }

  const verdict = data as Record<string, unknown>;
  return {
    success: true,
    data: {
      valid: Boolean(verdict.valid),
      campaignId:
        verdict.campaign_id === undefined ? undefined : String(verdict.campaign_id),
      campaignName:
        verdict.campaign_name === undefined
          ? undefined
          : String(verdict.campaign_name),
      couponCode:
        verdict.coupon_code === undefined
          ? undefined
          : String(verdict.coupon_code),
      alreadyCounted: Boolean(verdict.already_counted),
      errorCode:
        verdict.error_code === undefined
          ? undefined
          : String(verdict.error_code),
    },
  };
}
