"use server";

import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { getAuthorizedStore } from "@/lib/server/stores";
import type { ActionResult } from "@/lib/server/storeSettings";
import {
  AbandonedCartsOverview,
  CartLifecycleStatus,
  CartSyncItem,
  CartStoredItem,
  RestoredStorefrontItem,
} from "@/types/abandonedCarts";

/**
 * Server Actions for the Abandoned Carts feature (migration
 * 20261018000000_analytics_carts_loyalty.sql).
 *
 * Security model:
 * - Merchant-facing list/settings actions resolve the store from the verified
 *   session; the RPCs re-verify owner_id = auth.uid() internally.
 * - Anonymous sync/restore flow through the narrowly scoped SECURITY DEFINER
 *   RPCs exactly like the public coupon calls; token hashes never leave the
 *   server and no customer PII is stored anywhere in the lifecycle.
 * - Server-side cart mutability from the browser is bounded (item count,
 *   quantities, product validity) inside the RPC.
 */

export interface SyncCartInput {
  slug: string;
  token: string;
  items: CartSyncItem[];
}

/**
 * Server Action: anonymous browser-cart sync, called (debounced) by the
 * CartLifecycleSync component on cart changes and with an empty item list
 * after checkout success / manual customer clear.
 */
export async function syncPublicCart(input: SyncCartInput): Promise<ActionResult<void>> {
  const slug = (input.slug ?? "").toString().trim();
  if (!slug || slug.length > 100 || !/^[a-z0-9-]+$/.test(slug)) {
    return { success: false, error: "Invalid store." };
  }

  const token = (input.token ?? "").toString().trim();
  if (
    token.length < 32 ||
    token.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(token)
  ) {
    return { success: false, error: "Invalid cart token." };
  }

  const rawItems =
    Array.isArray(input.items) ? input.items.slice(0, 50) : [];
  const items: CartSyncItem[] = [];
  for (const entry of rawItems) {
    const productId = (entry?.product_id ?? "").toString().trim();
    const quantity = Number(entry?.quantity);
    if (!/^[0-9a-fA-F-]{36}$/.test(productId)) continue;
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 100000) continue;
    items.push({ product_id: productId, quantity });
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("sync_public_cart", {
    p_slug: slug,
    p_token: token,
    p_items: items,
  });

  if (error) {
    // Best-effort feature: never break the storefront over a sync hiccup.
    console.error("sync_public_cart failed:", error.message);
    return { success: false, error: error.message };
  }

  const payload = data as Record<string, unknown> | null;
  if (!payload?.ok) {
    return { success: false, error: String(payload?.reason ?? "Cart sync rejected.") };
  }

  return { success: true, data: undefined };
}

/**
 * Server Action: token-scoped cart restore for the recovery path. Only
 * computes when the caller presents the raw token (customer's own browser) —
 * the merchant never sees raw tokens, only hashed records.
 */
export async function restorePublicCartActions(
  slug: string,
  token: string
): Promise<ActionResult<RestoredStorefrontItem[]>> {
  const trimmedSlug = (slug ?? "").toString().trim();
  if (!trimmedSlug || trimmedSlug.length > 100 || !/^[a-z0-9-]+$/.test(trimmedSlug)) {
    return { success: false, error: "Invalid store." };
  }

  const rawToken = (token ?? "").toString().trim();
  if (
    rawToken.length < 32 ||
    rawToken.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(rawToken)
  ) {
    return { success: false, error: "Invalid recovery token." };
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("restore_public_cart", {
    p_slug: trimmedSlug,
    p_token: rawToken,
  });

  if (error || !data) {
    return { success: false, error: error?.message || "Cart restore failed." };
  }

  const payload = data as Record<string, unknown> | null;
  if (!payload?.ok) {
    const reason = String(payload?.reason ?? "not_available");
    return {
      success: false,
      error:
        reason === "not_available"
          ? "This recovery link is no longer valid."
          : "Cart restore failed.",
    };
  }

  const restored = (Array.isArray(payload.items) ? payload.items : [])
    .map((row) => row as Record<string, unknown>)
    .filter(
      (row) =>
        typeof row.product_id === "string" &&
        /^[0-9a-fA-F-]{36}$/.test(row.product_id) &&
        Number(row.quantity) >= 1 &&
        Number(row.quantity) <= 100000
    )
    .map(
      (row): RestoredStorefrontItem => ({
        productId: `${trimmedSlug}:${String(row.product_id)}`,
        name: String(row.name ?? "Product"),
        price: Number(row.price ?? 0),
        imageUrl: (row.image_url as string | null) ?? null,
        quantity: Math.floor(Number(row.quantity)),
        stock: Number(row.stock ?? 0),
      })
    );

  return { success: true, data: restored };
}

/**
 * Server Action: idempotent conversion marking after a successful public
 * order. Verifies the order belongs to the cart's store inside the RPC.
 */
export async function completeCartConversion(
  token: string,
  orderId: string
): Promise<ActionResult<boolean>> {
  const rawToken = (token ?? "").toString().trim();
  if (
    rawToken.length < 32 ||
    rawToken.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(rawToken)
  ) {
    return { success: false, error: "Invalid cart token." };
  }

  const orderRef = (orderId ?? "").toString().trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(orderRef)) {
    return { success: false, error: "Invalid order reference." };
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("complete_public_cart", {
    p_token: rawToken,
    p_order_id: orderRef,
  });

  if (error) {
    console.error("complete_public_cart failed:", error.message);
    return { success: false, error: error.message };
  }

  return { success: true, data: Boolean(data) };
}

/**
 * Server Action: merchant abandoned-carts listing + real stats. The RPC
 * lazily promotes idle carts using the store's own configured threshold.
 */
export async function getAuthorizedAbandonedCarts(filters?: {
  status?: CartLifecycleStatus;
  page?: number;
  pageSize?: number;
}): Promise<ActionResult<AbandonedCartsOverview>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const page = Math.max(1, Math.floor(Number(filters?.page) || 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(filters?.pageSize) || 10)));
  const status =
    filters?.status === "active" || filters?.status === "abandoned" || filters?.status === "converted"
      ? filters.status
      : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_store_abandoned_carts", {
    p_status: status,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error || !data) {
    return { success: false, error: error?.message || "Failed to load carts." };
  }

  const payload = data as Record<string, unknown>;
  if (!payload.stats || !payload.config || !payload.store) {
    return { success: false, error: "Carts payload was malformed; please retry." };
  }

  const intOf = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const statsRow = payload.stats as Record<string, unknown>;
  const configRow = payload.config as Record<string, unknown>;

  return {
    success: true,
    data: {
      store: payload.store as AbandonedCartsOverview["store"],
      config: {
        tracking_enabled: Boolean(configRow.tracking_enabled),
        inactivity_hours: intOf(configRow.inactivity_hours),
      },
      stats: {
        active_count: intOf(statsRow.active_count),
        abandoned_count: intOf(statsRow.abandoned_count),
        converted_count: intOf(statsRow.converted_count),
        active_value: intOf(statsRow.active_value),
        abandoned_value: intOf(statsRow.abandoned_value),
        converted_value: intOf(statsRow.converted_value),
      },
      carts: (Array.isArray(payload.carts) ? payload.carts : [])
        .map((row) => row as Record<string, unknown>)
        .map((row) => ({
          id: String(row.id),
          status: String(row.status) as CartLifecycleStatus,
          item_count: intOf(row.item_count),
          estimated_value: intOf(row.estimated_value),
          items:
            Array.isArray(row.items)
              ? (row.items as Array<Record<string, unknown>>).map(
                  (item): CartStoredItem => ({
                    product_id: String(item.product_id),
                    quantity: intOf(item.quantity),
                  })
                )
              : null,
          first_seen_at: String(row.first_seen_at ?? new Date().toISOString()),
          last_activity_at: String(row.last_activity_at ?? new Date().toISOString()),
          abandoned_at:
            row.abandoned_at === null || row.abandoned_at === undefined
              ? null
              : String(row.abandoned_at),
          restored_at:
            row.restored_at === null || row.restored_at === undefined
              ? null
              : String(row.restored_at),
          converted_at:
            row.converted_at === null || row.converted_at === undefined
              ? null
              : String(row.converted_at),
          converted_order_number:
            row.converted_order_number === null || row.converted_order_number === undefined
              ? null
              : String(row.converted_order_number),
        })),
    },
  };
}

export interface CartSettingsInput {
  trackingEnabled: boolean;
  inactivityHours: number;
}

/**
 * Server Action: updates the store's optional abandoned-cart tracking config
 * (RLS-scoped upsert — table has merchant INSERT/UPDATE policies).
 */
export async function updateCartSettings(input: CartSettingsInput): Promise<ActionResult<void>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const hours = Math.trunc(Number(input.inactivityHours));
  if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
    return { success: false, error: "Inactivity threshold must be between 1 and 720 hours." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("abandoned_cart_settings").upsert(
    {
      store_id: store.id,
      tracking_enabled: Boolean(input.trackingEnabled),
      inactivity_hours: hours,
    },
    { onConflict: "store_id" }
  );

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: undefined };
}

/**
 * Server Action: merchant discard of one cart row (id + store scoped; RLs
 * enforce ownership in the DELETE policy). Converted rows are intentionally
 * kept as conversion evidence — discarding is only allowed pre-conversion.
 */
export async function discardAbandonedCart(cartId: string): Promise<ActionResult<void>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const id = (cartId ?? "").toString().trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return { success: false, error: "Invalid cart reference." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("carts")
    .delete()
    .eq("id", id)
    .eq("store_id", store.id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: undefined };
}

/**
 * Internal note (not exported beyond the module doc): hash helper re-exporting
 * is intentionally avoided — hashCartToken lives in its own server-only file
 * so it can never be imported by client bundles.
 */
