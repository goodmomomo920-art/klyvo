"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthorizedStoreAnalytics } from "@/lib/server/analytics";
import { resolveAnalyticsRange } from "@/lib/analyticsRange";
import { AnalyticsPreset, StoreAnalytics } from "@/types/analytics";
import { cached } from "@/lib/clientCache";

const PRESETS: Array<{ key: AnalyticsPreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "custom", label: "Custom" },
];

const STATUS_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  Pending: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
  Processing: { bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200" },
  Shipped: { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200" },
  Delivered: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200" },
  Cancelled: { bg: "bg-zinc-100", text: "text-zinc-600", border: "border-zinc-200" },
};

function formatMoney(value: number, currency: string): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-EG", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-xs ${
        accent
          ? "border-[#2563EB]/30 bg-gradient-to-br from-[#2563EB]/10 to-white"
          : "border-zinc-200 bg-white"
      }`}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-lg font-black text-zinc-950 sm:text-xl">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p>}
    </div>
  );
}

/** Simple bar chart from the timeseries (sales + order counts), pure SVG. */
function SalesChart({
  series,
  currency,
}: {
  series: Array<{ day: string; orders: number; sales: number }>;
  currency: string;
}) {
  const maxSales = Math.max(1, ...series.map((p) => p.sales));
  const maxOrders = Math.max(1, ...series.map((p) => p.orders));
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-full items-end gap-1.5" style={{ minWidth: Math.max(320, series.length * 26) }}>
        {series.map((point) => {
          const salesHeight = Math.round((point.sales / maxSales) * 140);
          const ordersHeight = Math.round((point.orders / maxOrders) * 140);
          const date = new Date(`${point.day}T12:00:00`);
          return (
            <div
              key={point.day}
              className="group relative flex flex-1 flex-col items-center justify-end"
              style={{ minWidth: 22 }}
              title={`${date.toLocaleDateString("en-EG", { month: "short", day: "numeric" })} — ${point.orders} orders · ${point.sales.toLocaleString()} ${currency}`}
            >
              <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 140 }}>
                <div
                  className="w-2.5 rounded-t bg-[#2563EB] transition-all"
                  style={{ height: Math.max(2, salesHeight) }}
                />
                <div
                  className="w-2.5 rounded-t bg-zinc-300 transition-all"
                  style={{ height: Math.max(2, ordersHeight) }}
                />
              </div>
              <span className="mt-1 w-full truncate text-center text-[9px] text-zinc-400">
                {date.getDate()}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-4 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#2563EB]" /> Sales (merchandise, non-cancelled)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-zinc-300" /> Orders
        </span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [preset, setPreset] = useState<AnalyticsPreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [analytics, setAnalytics] = useState<StoreAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: AnalyticsPreset, from?: string, to?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await cached(
        `dashboard:analytics:${p}:${from ?? ""}:${to ?? ""}`,
        () => getAuthorizedStoreAnalytics({ preset: p, from, to })
      );
      if (res.success && res.data) {
        setAnalytics(res.data);
      } else {
        setAnalytics(null);
        setError(res.error || "Failed to load analytics.");
      }
    } catch (err: unknown) {
      setAnalytics(null);
      setError(err instanceof Error ? err.message : "Failed to load analytics.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so the effect body itself never triggers synchronous setState.
    const timer = window.setTimeout(() => load(preset, customFrom, customTo), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const stats = analytics?.stats;
  const currency = analytics?.store.currency ?? "EGP";

  // Time-relative labels are computed post-mount (client-only) for two
  // reasons: (1) under cacheComponents any Date.now()/new Date() reach during
  // SSR prerender is flagged as an unstable prerender value; (2) the range
  // label depends on preset, customFrom, customTo and the loaded analytics
  // object, so it is kept in state to avoid re-render mismatches.
  const [rangeLabel, setRangeLabel] = useState("");
  useEffect(() => {
    const range = resolveAnalyticsRange(preset, customFrom, customTo);
    requestAnimationFrame(() => {
      setRangeLabel(
        range.ok
          ? `${formatDate(range.from)} → ${formatDate(range.to)}${
              analytics ? ` · ${analytics.store.timezone}` : ""
            }`
          : ""
      );
    });
  }, [preset, customFrom, customTo, analytics]);

  const hasError = isLoading || error || !analytics;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Store Analytics</h1>
          <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
            {rangeLabel || "Real order data for your store. Cancelled orders are excluded from sales."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setPreset(p.key);
              }}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                preset === p.key
                  ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/25"
                  : "bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom range inputs */}
      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
          <div>
            <label htmlFor="analytics-from" className="mb-1 block text-xs font-semibold text-zinc-700">
              From
            </label>
            <input
              id="analytics-from"
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-xl border border-zinc-300 px-3 py-2 text-xs focus:outline-none focus:border-[#2563EB]"
            />
          </div>
          <div>
            <label htmlFor="analytics-to" className="mb-1 block text-xs font-semibold text-zinc-700">
              To
            </label>
            <input
              id="analytics-to"
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-xl border border-zinc-300 px-3 py-2 text-xs focus:outline-none focus:border-[#2563EB]"
            />
          </div>
          <button
            type="button"
            disabled={!customFrom || !customTo || isLoading}
            onClick={() => load("custom", customFrom, customTo)}
            className="rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-600 disabled:opacity-50"
          >
            {isLoading ? "Loading…" : "Apply range"}
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800"
        >
          ⚠ {error}
        </div>
      )}

      {isLoading && !analytics && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-zinc-100 bg-zinc-50" />
          ))}
        </div>
      )}

      {analytics && !isLoading && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Gross sales (merchandise)"
              value={formatMoney(stats!.grossSales, currency)}
              sub="Non-cancelled orders, before coupon discounts. Not profit."
              accent
            />
            <StatCard
              label="Collected sales (paid)"
              value={formatMoney(stats!.collectedSales, currency)}
              sub="Payment status 'Paid' only."
            />
            <StatCard
              label="Average order value"
              value={formatMoney(stats!.averageOrderValue, currency)}
              sub="Gross sales ÷ non-cancelled orders."
            />
            <StatCard
              label="Total orders"
              value={stats!.totalOrders.toLocaleString()}
              sub={`${stats!.cancelledOrders.toLocaleString()} cancelled`}
            />
            <StatCard
              label="Completed orders"
              value={stats!.completedOrders.toLocaleString()}
              sub={`Delivered value: ${formatMoney(stats!.completedSales, currency)}`}
            />
            <StatCard
              label="Open (pending/in-progress)"
              value={stats!.openOrders.toLocaleString()}
              sub="Pending · Processing · Shipped"
            />
            <StatCard
              label="Outstanding (unpaid)"
              value={formatMoney(stats!.outstandingValue, currency)}
              sub={`Refunded: ${formatMoney(stats!.refundedValue, currency)}`}
            />
            <StatCard
              label="Coupons + shipping granted"
              value={`${formatMoney(stats!.discountValue, currency)} + ${formatMoney(
                stats!.shippingValue,
                currency
              )}`}
              sub="Discounts and shipping on non-cancelled orders."
            />
          </div>

          {/* Sales over time */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
            <h2 className="mb-4 text-sm font-bold">Sales &amp; orders over time</h2>
            {analytics.timeseries.length === 0 ? (
              <p className="py-8 text-center text-xs text-zinc-500">No data in this range.</p>
            ) : (
              <SalesChart series={analytics.timeseries} currency={currency} />
            )}
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* Best sellers */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
              <h2 className="mb-3 text-sm font-bold">Best-selling products</h2>
              {analytics.bestSellers.length === 0 ? (
                <p className="py-6 text-center text-xs text-zinc-500">
                  No product sales in this range yet.
                </p>
              ) : (
                <ol className="space-y-2">
                  {analytics.bestSellers.map((p, i) => (
                    <li
                      key={`${p.productId ?? p.name}-${i}`}
                      className="flex items-center gap-3 rounded-xl border border-zinc-100 px-3 py-2"
                    >
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[11px] font-black text-zinc-600">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-800">
                        {p.name}
                      </span>
                      <span className="whitespace-nowrap text-[11px] text-zinc-500">
                        {p.units.toLocaleString()} units · {p.orders.toLocaleString()} orders
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* Recent orders */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
              <h2 className="mb-3 text-sm font-bold">Recent orders</h2>
              {analytics.recentOrders.length === 0 ? (
                <p className="py-6 text-center text-xs text-zinc-500">No orders yet.</p>
              ) : (
                <ul className="space-y-2">
                  {analytics.recentOrders.map((o) => {
                    const badge = STATUS_BADGE[o.status] ?? STATUS_BADGE.Pending;
                    return (
                      <li
                        key={o.orderNumber}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-xs"
                      >
                        <span className="font-mono font-bold text-zinc-900">{o.orderNumber}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {o.status}
                        </span>
                        <span className="text-[11px] text-zinc-500">{o.paymentStatus}</span>
                        <span className="font-bold text-zinc-950">{formatMoney(o.total, o.currency)}</span>
                        <span className="text-[11px] text-zinc-400">{formatDate(o.createdAt)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {hasError && !isLoading && !error && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-xs">
          <p className="text-sm font-bold text-zinc-950">No analytics data</p>
          <p className="mt-1 text-xs text-zinc-500">
            Orders will appear here as soon as your store receives them.
          </p>
        </div>
      )}
    </div>
  );
}
