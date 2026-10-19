/**
 * Loyalty points domain types, mirroring public.loyalty_settings,
 * public.customer_loyalty, and public.loyalty_ledger from migration
 * 20261018000000_analytics_carts_loyalty.sql.
 *
 * IMPORTANT integration status (documented limitation, per spec):
 * - Earning is LIVE and automatic when the program is enabled: a paid,
 *   non-cancelled order earns points exactly once (ledger idempotency key
 *   `earn:<order_id>`, triggered from the merchant order-status workflow).
 * - REDEMPTION AT PUBLIC CHECKOUT IS NOT WIRED: guest checkout has no verified
 *   customer identity. The settings keep `redemptionEnabled` read-only here;
 *   enabling it requires a real customer-auth mechanism first. Data columns
 *   exist so enabling later is a data change only — not new schema.
 * - Eligible earning amount = subtotal - coupon discount (merchandise only).
 *   Shipping, taxes and discounts never earn points.
 * - Reversal happens when an awarded order is cancelled/refunded; it is
 *   clamped to the available balance and can never make a balance negative.
 * - Administrative adjustments are audited ledger entries ('adjust'), row-
 *   locked, and can never overdraw a balance.
 */

export interface LoyaltyProgramSettings {
  enabled: boolean;
  /** Points earned per 1 unit of store currency of eligible merchandise. */
  pointsPerUnit: number;
  /** Orders below this merchandise amount never earn points. */
  minOrderAmount: number;
  /** NOT enabled by default; see module doc block for why. */
  redemptionEnabled: boolean;
  /** Currency value of one point (read-only while redemption is unwired). */
  pointsToCurrency: number;
  /** Max share (0-100) of eligible merchandise purchasable with points. */
  redemptionCapPercent: number;
}

export type LoyaltyLedgerReason = "earn" | "redeem" | "reverse" | "adjust";

export interface LoyaltyLedgerEntry {
  id: string;
  /** Signed change: positive = credit, negative = debit. */
  delta: number;
  reason: LoyaltyLedgerReason;
  notes: string | null;
  /** Order number when the entry is tied to an order. */
  order_number: string | null;
  created_at: string;
}

export interface LoyaltyCustomerRow {
  customer_id: string;
  name: string;
  balance: number;
  lifetime_earned: number;
  lifetime_redeemed: number;
  updated_at: string;
}

export interface StoreLoyaltyOverview {
  store: {
    name: string;
    slug: string;
    currency: string;
  };
  settings: LoyaltyProgramSettings;
  stats: {
    /** Sum of real customer balances — real ledger output, no estimates. */
    total_balance: number;
    total_earned: number;
    total_redeemed: number;
    customers_count: number;
  };
  customers: LoyaltyCustomerRow[];
}

export interface LoyaltyCustomerLedger {
  ok: boolean;
  error?: string;
  balance: number;
  entries: LoyaltyLedgerEntry[];
}
