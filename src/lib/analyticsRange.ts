import { AnalyticsPreset } from "@/types/analytics";

/**
 * Shared (client-safe) analytics range resolution.
 *
 * Lives outside any "use server" module so the pure helpers can be imported by
 * both the client dashboard page and the server action. All range math is
 * anchored to UTC calendar dates; the store's own timezone day boundaries are
 * re-derived authoritatively inside the RPC, so a merchant in Cairo always
 * still gets correct local-day grouping server-side.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseYmdStrict(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject overflow dates like 2026-02-31 (re-parses to March).
  return ymd(date) === value ? date : null;
}

export interface ResolvedAnalyticsRange {
  /** Inclusive ISO day boundaries (YYYY-MM-DD). */
  from: string;
  to: string;
}

export type AnalyticsRangeResult =
  | { ok: true; from: string; to: string }
  | { ok: false; error: string };

export function resolveAnalyticsRange(
  preset: AnalyticsPreset,
  customFrom?: string,
  customTo?: string
): AnalyticsRangeResult {
  const today = ymd(new Date());

  if (preset === "today") {
    return { ok: true, from: today, to: today };
  }

  if (preset === "7d" || preset === "30d") {
    const days = preset === "7d" ? 6 : 29;
    const from = ymd(new Date(Date.now() - days * DAY_MS));
    return { ok: true, from, to: today };
  }

  // Custom range: strict client validation; the RPC re-validates bounds.
  const from = parseYmdStrict(customFrom ?? "");
  const to = parseYmdStrict(customTo ?? "");
  if (!from || !to) {
    return { ok: false, error: "Pick both a start date and an end date." };
  }
  if (from > to) {
    return { ok: false, error: "The start date must not be after the end date." };
  }

  const bounds = parseYmdStrict(ymd(new Date()))!;
  const maxFrom = parseYmdStrict(ymd(new Date(bounds.getTime() - 366 * DAY_MS)))!;
  if (from < maxFrom) {
    return { ok: false, error: "Ranges are limited to the last 366 days." };
  }
  if (to > bounds) {
    return { ok: false, error: "The end date cannot be in the future." };
  }

  return { ok: true, from: customFrom as string, to: customTo as string };
}
