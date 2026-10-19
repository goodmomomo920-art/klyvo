"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStore } from "@/lib/server/stores";
import { resolveAnalyticsRange } from "@/lib/analyticsRange";
import {
  AnalyticsPreset,
  StoreAnalytics,
  StoreAnalyticsStats,
} from "@/types/analytics";

/**
 * Server Action: store analytics for the authenticated merchant's own store.
 *
 * Security & correctness contract:
 * - Store identity is ALWAYS resolved server-side from the verified Supabase
 *   session (getAuthorizedStore). Client-supplied store ids never matter.
 * - All aggregation happens inside the tenant-isolated SECURITY DEFINER RPC
 *   `get_store_sales_analytics` (owner verified against auth.uid()); the raw
 *   orders/order_items tables are never fetched to the browser and never
 *   computed client-side.
 * - Date bounds are validated here and re-validated inside the RPC (≤ 366
 *   days, from ≤ to, no future end date).
 * - The result contains no customer PII (no phones, no addresses).
 */

export interface AnalyticsRequest {
  preset: AnalyticsPreset;
  from?: string;
  to?: string;
}

export async function getAuthorizedStoreAnalytics(params: AnalyticsRequest): Promise<{
  success: boolean;
  data?: StoreAnalytics;
  error?: string;
}> {
  // The session check doubles as a cheap pre-flight before touching the RPC.
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const preset: AnalyticsPreset =
    params.preset === "today" || params.preset === "7d" || params.preset === "30d" || params.preset === "custom"
      ? params.preset
      : "30d";

  const range = resolveAnalyticsRange(preset, params.from, params.to);
  if (!range.ok) {
    return { success: false, error: range.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_store_sales_analytics", {
    p_from_date: range.from,
    p_to_date: range.to,
  });

  if (error || !data) {
    return { success: false, error: error?.message || "Analytics query failed." };
  }

  const payload = data as Record<string, unknown>;
  const stats = payload.stats as Record<string, unknown> | undefined;
  const storeInfo = payload.store as Record<string, unknown> | undefined;
  if (!stats || !storeInfo) {
    return { success: false, error: "Analytics payload was malformed; please retry." };
  }

  const num = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const mapped: StoreAnalytics = {
    store: {
      name: String(storeInfo.name ?? store.name),
      slug: String(storeInfo.slug ?? store.slug),
      currency: String(storeInfo.currency ?? store.currency),
      timezone: String(storeInfo.timezone ?? store.timezone),
    },
    stats: {
      grossSales: num(stats.gross_sales),
      collectedSales: num(stats.collected_sales),
      averageOrderValue: num(stats.average_order_value),
      totalOrders: num(stats.total_orders),
      cancelledOrders: num(stats.cancelled_orders),
      completedOrders: num(stats.completed_orders),
      completedSales: num(stats.completed_sales),
      openOrders: num(stats.open_orders),
      outstandingValue: num(stats.outstanding_value),
      refundedValue: num(stats.refunded_value),
      discountValue: num(stats.discount_value),
      shippingValue: num(stats.shipping_value),
    } satisfies StoreAnalyticsStats,
    timeseries: (Array.isArray(payload.timeseries) ? payload.timeseries : [])
      .map((point) => point as Record<string, unknown>)
      .map((point) => ({
        day: String(point.day),
        orders: num(point.orders),
        sales: num(point.sales),
      })),
    bestSellers: (Array.isArray(payload.best_sellers) ? payload.best_sellers : [])
      .map((row) => row as Record<string, unknown>)
      .map((row) => ({
        productId: row.product_id === null || row.product_id === undefined ? null : String(row.product_id),
        name: String(row.name ?? "Unknown product"),
        units: num(row.units),
        orders: num(row.orders),
      })),
    recentOrders: (Array.isArray(payload.recent_orders) ? payload.recent_orders : [])
      .map((row) => row as Record<string, unknown>)
      .map((row) => ({
        orderNumber: String(row.order_number ?? ""),
        status: String(row.status ?? "Pending") as StoreAnalytics["recentOrders"][number]["status"],
        paymentStatus: String(row.payment_status ?? "Unpaid") as StoreAnalytics["recentOrders"][number]["paymentStatus"],
        currency: String(row.currency ?? store.currency),
        total: num(row.total),
        createdAt: String(row.created_at ?? new Date().toISOString()),
      })),
  };

  return { success: true, data: mapped };
}
