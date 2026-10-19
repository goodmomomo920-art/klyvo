import { OrderStatus, PaymentStatus } from "@/types/database";

/**
 * Store analytics domain types, mirroring the exact projections returned by
 * the SECURITY DEFINER RPC `get_store_sales_analytics(p_from_date, p_to_date)`
 * from migration 20261018000000_analytics_carts_loyalty.sql.
 *
 * Calculation contract (enforced in the RPC, referenced by UI labels):
 * - Sales are computed ONLY from the caller's own store (owner = auth.uid()).
 * - Cancelled orders are excluded from all sales totals.
 * - Collected sales counts only payment_status = 'Paid' rows (never Pending).
 * - Gross = merchandise subtotal BEFORE coupon discounts; it is NOT profit —
 *   no cost/expense data exists in this schema, so no net profit is reported.
 * - Day boundaries use the store's own timezone.
 * - No customer PII (phones/addresses) is returned.
 */

export type AnalyticsPreset = "today" | "7d" | "30d" | "custom";

export interface StoreAnalyticsStats {
  /** Non-cancelled orders' merchandise subtotal before coupon discounts. Not profit. */
  grossSales: number;
  /** SUM(total) where payment_status = 'Paid'. */
  collectedSales: number;
  /** grossSales ÷ non-cancelled order count. */
  averageOrderValue: number;
  totalOrders: number;
  cancelledOrders: number;
  /** status = 'Delivered'. */
  completedOrders: number;
  /** SUM(total) where status = 'Delivered'. */
  completedSales: number;
  /** Pending + Processing + Shipped. */
  openOrders: number;
  /** Non-cancelled unpaid value (payment_status <> 'Paid'). */
  outstandingValue: number;
  /** SUM(total) where payment_status = 'Refunded'. */
  refundedValue: number;
  /** Coupon discounts granted on non-cancelled orders. */
  discountValue: number;
  /** Shipping fees on non-cancelled orders. */
  shippingValue: number;
}

export interface AnalyticsTimeseriesPoint {
  /** Local (store-timezone) day, YYYY-MM-DD. */
  day: string;
  orders: number;
  /** Merchandise sales (non-cancelled mandates) of that day. */
  sales: number;
}

export interface AnalyticsBestSeller {
  productId: string | null;
  name: string;
  units: number;
  orders: number;
}

export interface AnalyticsRecentOrder {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  currency: string;
  total: number;
  createdAt: string;
}

export interface StoreAnalytics {
  store: {
    name: string;
    slug: string;
    currency: string;
    timezone: string;
  };
  stats: StoreAnalyticsStats;
  timeseries: AnalyticsTimeseriesPoint[];
  bestSellers: AnalyticsBestSeller[];
  recentOrders: AnalyticsRecentOrder[];
}
