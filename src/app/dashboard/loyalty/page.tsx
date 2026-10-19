"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LoyaltyCustomerLedger,
  StoreLoyaltyOverview,
} from "@/types/loyalty";
import {
  adjustCustomerLoyaltyPoints,
  getAuthorizedLoyaltyOverview,
  getCustomerLoyaltyLedger,
  updateLoyaltySettings,
} from "@/lib/server/loyalty";

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-colors";

const REASON_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  earn: { bg: "bg-emerald-50", text: "text-emerald-800", label: "Earned" },
  redeem: { bg: "bg-blue-50", text: "text-blue-800", label: "Redeemed" },
  reverse: { bg: "bg-rose-50", text: "text-rose-800", label: "Reversed" },
  adjust: { bg: "bg-zinc-100", text: "text-zinc-700", label: "Adjusted" },
};

function points(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function LoyaltyPage() {
  const [overview, setOverview] = useState<StoreLoyaltyOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    enabled: false,
    pointsPerUnit: "1",
    minOrderAmount: "0",
  });

  // Adjustment modal state
  const [adjusting, setAdjusting] = useState<{ id: string; name: string; balance: number } | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Ledger drawer state
  const [ledgerFor, setLedgerFor] = useState<{ id: string; name: string } | null>(null);
  const [ledger, setLedger] = useState<LoyaltyCustomerLedger["entries"] | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getAuthorizedLoyaltyOverview(1, 20);
      if (res.success && res.data) {
        setOverview(res.data);
        setSettingsForm({
          enabled: res.data.settings.enabled,
          pointsPerUnit: String(res.data.settings.pointsPerUnit),
          minOrderAmount: String(res.data.settings.minOrderAmount),
        });
      } else {
        setError(res.success ? "No data returned." : res.error);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load loyalty overview.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so the effect body itself never triggers synchronous setState.
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3500);
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const ppu = Number(settingsForm.pointsPerUnit);
    const min = Number(settingsForm.minOrderAmount);
    if (!Number.isFinite(ppu) || ppu < 0 || ppu > 10000) {
      flash("Points per unit must be between 0 and 10,000.");
      return;
    }
    if (!Number.isFinite(min) || min < 0) {
      flash("Minimum order amount must be a valid non-negative amount.");
      return;
    }

    setIsSavingSettings(true);
    try {
      const res = await updateLoyaltySettings({
        enabled: settingsForm.enabled,
        pointsPerUnit: ppu,
        minOrderAmount: min,
      });
      if (res.success) {
        flash("Loyalty settings saved. ✓");
        await load();
      } else {
        flash(res.error);
      }
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const openAdjust = (row: { customer_id: string; name: string; balance: number }) => {
    setAdjusting({ id: row.customer_id, name: row.name, balance: row.balance });
    setAdjustDelta("");
    setAdjustNotes("");
    setAdjustError(null);
  };

  const submitAdjust = async () => {
    if (!adjusting) return;
    const delta = Math.trunc(Number(adjustDelta));
    if (!Number.isFinite(delta) || delta === 0) {
      setAdjustError("Enter a non-zero integer (± points).");
      return;
    }
    setIsAdjusting(true);
    setAdjustError(null);
    try {
      const res = await adjustCustomerLoyaltyPoints({
        customerId: adjusting.id,
        delta,
        notes: adjustNotes,
      });
      if (res.success && res.data) {
        flash(`Adjusted ${adjusting.name}: balance now ${points(res.data.balance)} points.`);
        setAdjusting(null);
        await load();
      } else {
        setAdjustError(res.success ? "Adjustment failed." : res.error);
      }
    } catch (err: unknown) {
      setAdjustError(err instanceof Error ? err.message : "Adjustment failed.");
    } finally {
      setIsAdjusting(false);
    }
  };

  const openLedger = async (row: { customer_id: string; name: string }) => {
    setLedgerFor({ id: row.customer_id, name: row.name });
    setLedger(null);
    setLedgerLoading(true);
    try {
      const res = await getCustomerLoyaltyLedger(row.customer_id);
      if (res.success && res.data) {
        setLedger(res.data.entries);
      } else {
        setLedger([]);
      }
    } catch {
      setLedger([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  if (isLoading) {
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
        <p className="text-sm font-bold text-zinc-950">No loyalty data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight">Loyalty Points</h1>
        <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
          Audited points program for <strong>{overview.store.name}</strong>. Balances come only from
          the real ledger — every change is recorded and client-trusted balances are never possible.
        </p>
      </div>

      {notice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800"
        >
          ✓ {notice}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Total outstanding points</p>
          <p className="mt-1 text-lg font-black text-zinc-950 sm:text-xl">{points(overview.stats.total_balance)}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">Across {overview.stats.customers_count} customer(s)</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Lifetime earned</p>
          <p className="mt-1 text-lg font-black text-zinc-950 sm:text-xl">{points(overview.stats.total_earned)}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">Paid, non-cancelled orders only</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Program status</p>
          <p className={`mt-1 text-lg font-black sm:text-xl ${overview.settings.enabled ? "text-emerald-600" : "text-zinc-400"}`}>
            {overview.settings.enabled ? "Enabled" : "Disabled"}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {overview.settings.pointsPerUnit} point(s) per {overview.store.currency} of merchandise
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-amber-50/60 p-4 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Redemption</p>
          <p className="mt-1 text-lg font-black text-amber-800">Not active</p>
          <p className="mt-0.5 text-[11px] text-amber-700">
            Guest checkout has no verified customer identity — redemption stays safely disabled.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Settings */}
        <form
          onSubmit={handleSaveSettings}
          className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs"
        >
          <div>
            <h2 className="text-sm font-bold text-zinc-950">Program settings</h2>
            <p className="mt-1 text-[11px] text-zinc-500">
              Earning applies server-side when you mark an order paid. Disabled programs never earn
              or redeem.
            </p>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-3">
            <span>
              <span className="block text-xs font-bold text-zinc-900">Enable loyalty program</span>
              <span className="mt-0.5 block text-[10px] text-zinc-500">
                Paid orders earn points automatically and exactly once.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settingsForm.enabled}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="h-5 w-9 cursor-pointer accent-[#2563EB]"
              aria-label="Enable loyalty program"
            />
          </label>

          <div>
            <label htmlFor="loyalty-ppu" className="mb-1.5 block text-xs font-semibold text-zinc-700">
              Points earned per {overview.store.currency} of merchandise
            </label>
            <input
              id="loyalty-ppu"
              type="number"
              step="0.0001"
              min="0"
              max="10000"
              required
              value={settingsForm.pointsPerUnit}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, pointsPerUnit: e.target.value }))}
              className={inputClass}
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              Merchandise = subtotal − coupon discount. Shipping and taxes never earn points.
            </p>
          </div>

          <div>
            <label htmlFor="loyalty-min" className="mb-1.5 block text-xs font-semibold text-zinc-700">
              Minimum order amount ({overview.store.currency})
            </label>
            <input
              id="loyalty-min"
              type="number"
              step="0.01"
              min="0"
              required
              value={settingsForm.minOrderAmount}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, minOrderAmount: e.target.value }))}
              className={inputClass}
            />
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-[11px] leading-relaxed text-blue-900">
            <span className="font-bold">Redemption rates (points-to-currency, cap %) are stored but
            inert:</span> connecting redemption to public checkout requires verified customer
            identity first. Enabling redemption by data change later uses the same tables — no new
            migration.
          </div>

          <button
            type="submit"
            disabled={isSavingSettings}
            className="w-full rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-600 disabled:opacity-50"
          >
            {isSavingSettings ? "Saving…" : "Save settings"}
          </button>
        </form>

        {/* Customers & balances */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs xl:col-span-2">
          <h2 className="text-sm font-bold text-zinc-950">Customer balances</h2>
          <p className="mt-1 mb-3 text-[11px] text-zinc-500">
            Derived from ledger entries. Debit attempts beyond the balance are refused, so a
            negative balance is impossible.
          </p>

          {overview.customers.length === 0 ? (
            <p className="py-10 text-center text-xs text-zinc-500">
              No loyalty balances yet. They appear once you enable the program and confirm paid orders
              that have a linked customer.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="px-3 py-2.5 font-bold">Customer</th>
                    <th className="px-3 py-2.5 font-bold">Balance</th>
                    <th className="px-3 py-2.5 font-bold">Earned</th>
                    <th className="px-3 py-2.5 font-bold">Redeemed</th>
                    <th className="px-3 py-2.5 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.customers.map((row) => (
                    <tr key={row.customer_id} className="border-b border-zinc-50 last:border-0">
                      <td className="px-3 py-3 font-semibold text-zinc-900">{row.name}</td>
                      <td className="px-3 py-3 font-black text-zinc-950">{points(row.balance)}</td>
                      <td className="px-3 py-3 text-emerald-700">{points(row.lifetime_earned)}</td>
                      <td className="px-3 py-3 text-zinc-400">{points(row.lifetime_redeemed)}</td>
                      <td className="px-3 py-3 text-right">
                        <span className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openLedger(row)}
                            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50"
                          >
                            History
                          </button>
                          <button
                            type="button"
                            onClick={() => openAdjust(row)}
                            className="rounded-lg bg-[#2563EB] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-600"
                          >
                            Adjust
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Adjustment modal */}
      {adjusting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Adjust loyalty points for ${adjusting.name}`}
        >
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h3 className="text-sm font-bold text-zinc-950">Adjust points — {adjusting.name}</h3>
            <p className="text-[11px] text-zinc-500">
              Current balance: <strong>{points(adjusting.balance)}</strong> points. Debits are
              row-locked and cannot overdraw.
            </p>
            <div>
              <label htmlFor="adjust-delta" className="mb-1.5 block text-xs font-semibold text-zinc-700">
                Change (± points, integer)
              </label>
              <input
                id="adjust-delta"
                type="number"
                step="1"
                required
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                className={inputClass}
                placeholder="e.g. -50 or 200"
              />
            </div>
            <div>
              <label htmlFor="adjust-notes" className="mb-1.5 block text-xs font-semibold text-zinc-700">
                Reason (audited, recorded in the ledger)
              </label>
              <input
                id="adjust-notes"
                type="text"
                maxLength={500}
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
                className={inputClass}
                placeholder="e.g. goodwill compensation"
              />
            </div>
            {adjustError && (
              <p role="alert" className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700">
                ⚠ {adjustError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdjusting(null)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-bold text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isAdjusting}
                onClick={submitAdjust}
                className="rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {isAdjusting ? "Applying…" : "Apply adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ledger drawer */}
      {ledgerFor && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Loyalty history for ${ledgerFor.name}`}
        >
          <div className="max-h-[70vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-950">Ledger — {ledgerFor.name}</h3>
              <button
                type="button"
                onClick={() => setLedgerFor(null)}
                className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-bold text-zinc-600"
                aria-label="Close ledger"
              >
                ✕
              </button>
            </div>
            {ledgerLoading ? (
              <p className="py-6 text-center text-xs text-zinc-500">Loading entries…</p>
            ) : !ledger || ledger.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-500">No ledger entries yet.</p>
            ) : (
              <ul className="space-y-2">
                {ledger.map((entry) => {
                  const badge = REASON_BADGE[entry.reason] ?? REASON_BADGE.adjust;
                  return (
                    <li key={entry.id} className="rounded-xl border border-zinc-100 px-3 py-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded-full border border-transparent px-2 py-0.5 text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                        <span className={`font-black ${entry.delta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {entry.delta >= 0 ? "+" : ""}
                          {points(entry.delta)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400">
                        <span className="font-mono">
                          {entry.order_number ? `Order ${entry.order_number}` : "—"}
                        </span>
                        <span>{new Date(entry.created_at).toLocaleString("en-EG")}</span>
                      </div>
                      {entry.notes && <p className="mt-1 text-[10px] text-zinc-500">“{entry.notes}”</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
