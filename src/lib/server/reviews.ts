"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStore } from "@/lib/server/stores";
import { ProductReview, ReviewStatus } from "@/types/reviews";
import { ProductReviewRow } from "@/types/database";
import { invalidateStorefrontCache } from "@/lib/server/storefrontCache";

/**
 * Server Actions for review moderation.
 *
 * - Store scoped by session + RLS; cross-store moderation is impossible.
 * - Merchants can publish, hide (pending), or reject. Publishing stamps
 *   published_at so public rating aggregates (which only count published rows)
 *   stay consistent.
 * - Reviews are never edited by the dashboard: only status/moderation_note.
 * - Deleting is permanent and confirmed in the UI.
 */

export type ReviewResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

function mapReview(
  row: ProductReviewRow,
  product?: { name?: string | null; sku?: string | null } | null
): ProductReview {
  return {
    id: row.id,
    storeId: row.store_id,
    productId: row.product_id,
    productName: product?.name ?? undefined,
    productSku: product?.sku ?? null,
    customerId: row.customer_id,
    orderId: row.order_id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    reviewerName: row.reviewer_name,
    isVerifiedPurchase: row.is_verified_purchase,
    status: row.status,
    moderationNote: row.moderation_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

export async function getAuthorizedStoreReviews(
  status?: ReviewStatus
): Promise<ReviewResult<ProductReview[]>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  let query = supabase
    .from("product_reviews")
    .select("*, products(name, sku)")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === "42P01") {
      return {
        success: false,
        error:
          "Product reviews table is missing. Apply migration 20261019000003_product_reviews.sql in Supabase first.",
      };
    }
    return { success: false, error: error.message };
  }

  const rows = (data ?? []) as Array<
    ProductReviewRow & { products?: { name?: string | null; sku?: string | null } | null }
  >;

  return {
    success: true,
    data: rows.map((row) => mapReview(row, row.products)),
  };
}

export async function moderateAuthorizedStoreReview(
  reviewId: string,
  status: ReviewStatus,
  moderationNote?: string | null
): Promise<ReviewResult<ProductReview>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  if (status !== "pending" && status !== "published" && status !== "rejected") {
    return { success: false, error: "Invalid review status." };
  }

  const note = (moderationNote ?? "").trim();
  if (note.length > 500) {
    return { success: false, error: "Moderation note cannot exceed 500 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_reviews")
    .update({
      status,
      moderation_note: note || null,
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .eq("id", reviewId)
    .eq("store_id", store.id)
    .select("*, products(name, sku)")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Failed to moderate review." };
  }

  const row = data as ProductReviewRow & {
    products?: { name?: string | null; sku?: string | null } | null;
  };
  invalidateStorefrontCache(store.slug);
  return { success: true, data: mapReview(row, row.products) };
}

export async function deleteAuthorizedStoreReview(
  reviewId: string
): Promise<ReviewResult<undefined>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("product_reviews")
    .delete()
    .eq("id", reviewId)
    .eq("store_id", store.id);

  if (error) {
    return { success: false, error: error.message };
  }

  invalidateStorefrontCache(store.slug);
  return { success: true, data: undefined };
}
