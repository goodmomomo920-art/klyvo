"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AbandonedCartsOverview,
  CartLifecycleStatus,
} from "@/types/abandonedCarts";
import {
  discardAbandonedCart,
  getAuthorizedAbandonedCarts,
} from "@/lib/server/cartLifecycle";

const STATUS_TABS: Array<{ key: CartLifecycleStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "abandoned", label: "Abandoned" },
  { key: "converted", label: "Converted" },
];

const STATUS_BADGE: Record<CartLifecycleStatus, { bg: string; text: string; border: string }> = {
  active: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200" },
  abandoned: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
  converted: { bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200" },
};

function formatMoney(value: number, currency: string): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-EG", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 0)} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-lg font-black text-zinc-950 sm:text-xl">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p>}
    </div>
  );
}

function itemsSummary(items: { product_id: string; quantity: number }[] | null): string {
  if (!items || items.length === 0) return "—";
  return `${items.length} line${items.length === 1 ? "" : "s"} · ${items.reduce((a, it) => a + it.quantity, 0)} units`;
}

export default function AbandonedCartsPage() {
  const [statusFilter, setStatusFilter] = useState<CartLifecycleStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [overview, setOverview] = useState<AbandonedCartsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(
    async (status: CartLifecycleStatus | "all", targetPage: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getAuthorizedAbandonedCarts({
          status: status === "all" ? undefined : status,
          page: targetPage,
          pageSize: 10,
        });
        if (res.success && res.data) {
          setOverview(res.data);
          setPage(targetPage);
        } else {
          setOverview(null);
          setError(res.success ? "No data returned." : res.error);
        }
      } catch (err: unknown) {
        setOverview(null);
        setError(err instanceof Error ? err.message : "Failed to load abandoned carts.");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    // Deferred so the effect body itself never triggers synchronous setState.
    const timer = window.setTimeout(() => void load(statusFilter, 1), 0);
    return () => window.clearTimeout(timer);
  }, [statusFilter, load]);

  const stats = overview?.stats;
  const currency = overview?.store.currency ?? "";

  const recoveryRate = useMemo(() => {
    if (!stats) return null;
    const denominator = stats.abandoned_count + stats.converted_count;
    if (denominator === 0) return null;
    return `${Math.round((stats.converted_count / denominator) * 100)}%`;
  }, [stats]);

  const handleDiscard = async (cartId: string) => {
    setConfirmingId(null);
    setDiscardingId(cartId);
    try {
      const res = await discardAbandonedCart(cartId);
      if (res.success) {
        setNotice("Cart discarded.");
        await load(statusFilter, page);
      } else {
        setError(res.error);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Discard failed.");
    } finally {
      setDiscardingId(null);
    }
  };

  if (isLoading && !overview) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-zinc-100 bg-zinc-50" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-zinc-100 bg-zinc-50" />
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-xs font-semibold text-rose-800"
      >
        ⚠ {error}
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-xs">
        <p className="text-sm font-bold text-zinc-950">No cart data</p>
        <p className="mt-1 text-xs text-zinc-500">
          Storefront carts appear here automatically once your store receives visits.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Abandoned Carts</h1>
          <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
            Anonymous storefront cart lifecycle. Idle carts become abandoned after{" "}
            {overview.config.inactivity_hours} hour(s) of inactivity.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(statusFilter, page)}
          className="self-start whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-xs hover:bg-zinc-50"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Active carts"
          value={String(stats!.active_count)}
          sub={`${formatMoney(stats!.active_value, currency)} potential`}
        />
        <StatCard
          label="Abandoned carts"
          value={String(stats!.abandoned_count)}
          sub={`${formatMoney(stats!.abandoned_value, currency)} at stake`}
        />
        <StatCard
          label="Converted carts"
          value={String(stats!.converted_count)}
          sub={`${formatMoney(stats!.converted_value, currency)} realized`}
        />
        <StatCard
          label="Recovery rate"
          value={recoveryRate ?? "—"}
          sub="Converted ÷ (abandoned + converted)"
        />
      </div>

      {notice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800"
        >
          ✓ {notice}
        </div>
      )}

      {/* Status filters */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === tab.key
                ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/25"
                : "border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Carts table */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-xs sm:p-4">
        {overview.carts.length === 0 ? (
          <p className="py-10 text-center text-xs text-zinc-500">
            No carts match this filter yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-100 text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="px-3 py-2.5 font-bold">Last activity</th>
                  <th className="px-3 py-2.5 font-bold">First seen</th>
                  <th className="px-3 py-2.5 font-bold">Items</th>
                  <th className="px-3 py-2.5 font-bold">Est. value</th>
                  <th className="px-3 py-2.5 font-bold">Status</th>
                  <th className="px-3 py-2.5 font-bold">Conversion</th>
                  <th className="px-3 py-2.5 text-right font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {overview.carts.map((cart) => {
                  const badge = STATUS_BADGE[cart.status] ?? STATUS_BADGE.active;
                  return (
                    <tr key={cart.id} className="border-b border-zinc-50 last:border-0">
                      <td className="px-3 py-3">
                        <span className="block font-semibold text-zinc-900">
                          {formatRelative(cart.last_activity_at)}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {formatDate(cart.last_activity_at)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-zinc-500">
                        {formatDate(cart.first_seen_at)}
                      </td>
                      <td className="px-3 py-3 text-zinc-700">
                        {itemsSummary(cart.items)}
                      </td>
                      <td className="px-3 py-3 font-bold text-zinc-950">
                        {formatMoney(cart.estimated_value, currency)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {cart.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-zinc-600">
                        {cart.converted_order_number ? (
                          <span className="font-mono font-semibold text-blue-700">
                            {cart.converted_order_number}
                            {cart.converted_at && (
                              <span className="ml-1 font-sans font-normal text-zinc-400">
                                {formatDate(cart.converted_at)}
                              </span>
                            )}
                          </span>
                        ) : cart.restored_at ? (
                          <span className="text-zinc-400">restored {formatRelative(cart.restored_at)}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {cart.status !== "converted" ? (
                          confirmingId === cart.id ? (
                            <span className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={discardingId === cart.id}
                                onClick={() => handleDiscard(cart.id)}
                                className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                              >
                                {discardingId === cart.id ? "…" : "Confirm"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingId(null)}
                                className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-bold text-zinc-600"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmingId(cart.id)}
                              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50"
                            >
                              Discard
                            </button>
                          )
                        ) : (
                          <span className="text-[10px] text-zinc-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination — server-side bounded queries (10/page). */}
        <div className="flex items-center justify-between border-t border-zinc-100 px-2 pt-3">
          <button
            type="button"
            disabled={page <= 1 || isLoading}
            onClick={() => load(statusFilter, Math.max(1, page - 1))}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="text-[11px] text-zinc-400">Page {page}</span>
          <button
            type="button"
            disabled={overview.carts.length < 10 || isLoading}
            onClick={() => load(statusFilter, page + 1)}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      </section>

      <p className="px-1 text-[11px] leading-relaxed text-zinc-400">
        Estimated values are catalog-derived at sync time (never client-supplied) and may differ from
        checkout totals after coupons, stock changes or price edits. Conversion counts only carts
        whose own token produced a verified store order — no estimates are presented as guaranteed
        sales. Because recovery outreach (email/WhatsApp/SMS) has no provider configured, there is
        no merchant-facing recovery link; token-based restore works only from the customer&apos;s own
        browser.
      </p>
    </div>
  );
}
