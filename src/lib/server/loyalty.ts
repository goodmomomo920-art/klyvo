"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStore } from "@/lib/server/stores";
import type { ActionResult } from "@/lib/server/storeSettings";
import {
  LoyaltyCustomerLedger,
  StoreLoyaltyOverview,
} from "@/types/loyalty";

/**
 * Server Actions for the Loyalty Points feature (migration
 * 20261018000000_analytics_carts_loyalty.sql).
 *
 * Security model (same as the other server modules):
 * - Merchant identity and store id are ALWAYS resolved server-side via
 *   getAuthorizedStore(); nothing below trusts a client-supplied store id.
 * - Every RPC verifies ownership AGAINST the Supabase session user
 *   (owner_id = auth.uid()) inside the SECURITY DEFINER function body.
 * - The ledger has no write path at all from SQL clients: points move ONLY
 *   inside definer functions with unique idempotency keys.
 * - All numeric inputs are validated and bounded server-side.
 */

const MAX_POINTS_PER_UNIT = 10000;
const MAX_MIN_ORDER = 999999.99;

export interface LoyaltySettingsInput {
  enabled: boolean;
  pointsPerUnit: number;
  minOrderAmount: number;
}

export interface LoyaltyAdjustmentInput {
  customerId: string;
  /** Signed audit delta; negative debits are row-locked against overdrafts. */
  delta: number;
  notes?: string;
}

/**
 * Server Action: loads the loyalty overview (settings, real balances, real
 * aggregate stats) for the authenticated merchant's store, plus the paged
 * customer balances.
 */
export async function getAuthorizedLoyaltyOverview(page?: number, pageSize?: number): Promise<ActionResult<StoreLoyaltyOverview>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safePageSize = Math.min(50, Math.max(1, Math.floor(Number(pageSize) || 10)));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_store_loyalty_overview", {
    p_page: safePage,
    p_page_size: safePageSize,
  });

  if (error || !data) {
    return { success: false, error: error?.message || "Failed to load loyalty overview." };
  }

  const payload = data as Record<string, unknown>;
  const settings = payload.settings as Record<string, unknown> | undefined;
  const stats = payload.stats as Record<string, unknown> | undefined;
  const storeInfo = payload.store as Record<string, unknown> | undefined;

  if (!settings || !stats || !storeInfo) {
    return { success: false, error: "Loyalty payload was malformed; please retry." };
  }

  const intOf = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  return {
    success: true,
    data: {
      store: {
        name: String(storeInfo.name ?? store.name),
        slug: String(storeInfo.slug ?? store.slug),
        currency: String(storeInfo.currency ?? store.currency),
      },
      settings: {
        enabled: Boolean(settings.enabled),
        pointsPerUnit: Number(settings.points_per_unit ?? 1),
        minOrderAmount: Number(settings.min_order_amount ?? 0),
        redemptionEnabled: Boolean(settings.redemption_enabled),
        pointsToCurrency: Number(settings.points_to_currency ?? 0),
        redemptionCapPercent: Number(settings.redemption_cap_percent ?? 25),
      },
      stats: {
        total_balance: intOf(stats.total_balance),
        total_earned: intOf(stats.total_earned),
        total_redeemed: intOf(stats.total_redeemed),
        customers_count: intOf(stats.customers_count),
      },
      customers: (Array.isArray(payload.customers) ? payload.customers : [])
        .map((row) => row as Record<string, unknown>)
        .map((row) => ({
          customer_id: String(row.customer_id),
          name: String(row.name ?? "Customer"),
          balance: intOf(row.balance),
          lifetime_earned: intOf(row.lifetime_earned),
          lifetime_redeemed: intOf(row.lifetime_redeemed),
          updated_at: String(row.updated_at ?? new Date().toISOString()),
        })),
    },
  };
}

/**
 * Server Action: upserts the merchant's loyalty program settings. Earning can
 * be enabled/disabled here; REDEMPTION cannot be enabled from this UI (guest
 * checkout has no verified identity — see src/types/loyalty.ts).
 */
export async function updateLoyaltySettings(input: LoyaltySettingsInput): Promise<ActionResult<void>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const pointsPerUnit = Number(input.pointsPerUnit);
  if (!Number.isFinite(pointsPerUnit) || pointsPerUnit < 0 || pointsPerUnit > MAX_POINTS_PER_UNIT) {
    return { success: false, error: "Points per unit must be between 0 and 10,000." };
  }

  const minOrderAmount = Number(input.minOrderAmount);
  if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0 || minOrderAmount > MAX_MIN_ORDER) {
    return { success: false, error: "Minimum order amount must be a valid non-negative amount." };
  }

  const payload = {
    store_id: store.id,
    enabled: Boolean(input.enabled),
    points_per_unit: Math.round(pointsPerUnit * 10000) / 10000,
    min_order_amount: Math.round(minOrderAmount * 100) / 100,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("loyalty_settings")
    .upsert(payload, { onConflict: "store_id" });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: undefined };
}

/**
 * Server Action: audited administrative point adjustment for one of the
 * merchant's OWN customers. Executes inside the transactional SECURITY
 * DEFINER RPC, which row-locks balances and can never overdraw.
 */
export async function adjustCustomerLoyaltyPoints(input: LoyaltyAdjustmentInput): Promise<ActionResult<{ balance: number }>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const customerId = (input.customerId ?? "").toString().trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(customerId)) {
    return { success: false, error: "Invalid customer reference." };
  }

  const delta = Math.trunc(Number(input.delta));
  if (!Number.isFinite(delta) || delta === 0) {
    return { success: false, error: "Adjustment must be a non-zero integer number of points." };
  }
  if (Math.abs(delta) > 100000000) {
    return { success: false, error: "Adjustment exceeds the ±100,000,000 point ceiling." };
  }

  const notes = (input.notes ?? "").trim();
  if (notes.length > 500) {
    return { success: false, error: "Adjustment notes cannot exceed 500 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_customer_loyalty_points", {
    p_customer_id: customerId,
    p_delta: delta,
    p_notes: notes || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const payload = data as Record<string, unknown> | null;
  if (!payload?.ok) {
    const err = String(payload?.error ?? "Adjustment failed.");
    return {
      success: false,
      error: err === "INSUFFICIENT_BALANCE" ? "That customer's balance is too low for this debit." : err,
    };
  }

  return { success: true, data: { balance: Number(payload.balance ?? 0) } };
}

/**
 * Server Action: fetches the bounded per-customer ledger (owner-verified
 * inside the RPC). Used by the dashboard's account history drawer.
 */
export async function getCustomerLoyaltyLedger(customerId: string): Promise<ActionResult<{ balance: number; entries: LoyaltyCustomerLedger["entries"] }>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const id = (customerId ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return { success: false, error: "Invalid customer reference." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_customer_loyalty_ledger", {
    p_customer_id: id,
    p_limit: 25,
    p_offset: 0,
  });

  if (error || !data) {
    return { success: false, error: error?.message || "Failed to load the ledger." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = data as any;
  if (!payload.ok) {
    return { success: false, error: String(payload.error ?? "Failed to load the ledger.") };
  }

  const entries = (Array.isArray(payload.entries) ? payload.entries : []).map(
    (row: Record<string, unknown>) => ({
      id: String(row.id),
      delta: Number(row.delta),
      reason: String(row.reason) as "earn" | "redeem" | "reverse" | "adjust",
      notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
      order_number: row.order_number === null || row.order_number === undefined ? null : String(row.order_number),
      created_at: String(row.created_at ?? new Date().toISOString()),
    })
  );

  return { success: true, data: { balance: Number(payload.balance ?? 0), entries } };
}

/**
 * Award path implementation hook. Called automatically by the orders module
 * after a merchant drives an order to a Paid, non-cancelled status; also safe
 * to call after refund/cancel for a reversal. It is exported only to compose
 * the workflow — never exposed to the browser as a shortcut: awarding is only
 * meaningful for an order the merchant has already confirmed paid, verified
 * inside the RPC against the session user's own store.
 */
export async function applyLoyaltyForOrderTransition(orderId: string, opts: { paid: boolean; cancelled: boolean }): Promise<void> {
  const id = (orderId ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return;

  const supabase = await createClient();
  try {
    if (opts.cancelled) {
      await supabase.rpc("reverse_order_loyalty_points", { p_order_id: id });
      return;
    }
    if (opts.paid) {
      await supabase.rpc("award_order_loyalty_points", { p_order_id: id });
    }
  } catch {
    // Loyalty is an additive side effect and must never break order flows.
  }
}
