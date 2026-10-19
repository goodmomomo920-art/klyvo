"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { getFinancialReport } from "@/lib/server/financial";
import { financialCsv, type FinancialMetrics } from "@/lib/financialReport";

const blank: FinancialMetrics = { grossSales: 0, discounts: 0, refunds: 0, netSales: 0, orderCount: 0, averageOrderValue: 0, shippingRevenue: 0, cogs: null, profit: null, margin: null };

export default function FinancialPage() {
  const now = new Date();
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10));
  const [metrics, setMetrics] = useState(blank);
  const [daily, setDaily] = useState<Array<{ date: string; orders: number; netSales: number }>>([]);
  const [error, setError] = useState("");
  const load = async () => { const result = await getFinancialReport(from, to); if (result.success) { setMetrics(result.metrics ?? blank); setDaily(result.daily ?? []); } else setError(result.error ?? "Failed to load report."); };
  useEffect(() => { void load(); }, []);
  const exportCsv = () => { const blob = new Blob([financialCsv(metrics, daily)], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "klyvo-financial-report.csv"; a.click(); URL.revokeObjectURL(url); };
  const card = (label: string, value: string) => <div className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="text-xs font-bold uppercase tracking-wide text-zinc-500">{label}</div><div className="mt-2 text-2xl font-black text-zinc-950">{value}</div></div>;
  return <div className="space-y-6"><div className="flex flex-col gap-3 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-3xl font-black text-zinc-950">Financial reports</h2><p className="mt-1 text-sm text-zinc-600">Gross sales, discounts, refunds, net sales, and recorded shipping revenue.</p></div><button onClick={exportCsv} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold">Export CSV</button></div><div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4"><label className="text-xs font-bold text-zinc-500">From<input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-zinc-200 p-2 text-sm" /></label><label className="text-xs font-bold text-zinc-500">To<input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1 block rounded-lg border border-zinc-200 p-2 text-sm" /></label><button onClick={() => void load()} className="rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-bold text-white">Apply</button></div>{error && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{card("Gross sales", `EGP ${metrics.grossSales.toLocaleString()}`)}{card("Net sales", `EGP ${metrics.netSales.toLocaleString()}`)}{card("Orders", metrics.orderCount.toLocaleString())}{card("Average order", `EGP ${metrics.averageOrderValue.toFixed(2)}`)}{card("Discounts", `EGP ${metrics.discounts.toLocaleString()}`)}{card("Refunds", `EGP ${metrics.refunds.toLocaleString()}`)}{card("Shipping revenue", `EGP ${metrics.shippingRevenue.toLocaleString()}`)}{card("Profit", metrics.profit === null ? "Unavailable" : `EGP ${metrics.profit.toLocaleString()}`)}</div><div className="rounded-2xl border border-zinc-200 bg-white p-5"><h3 className="font-bold">Daily summary</h3><p className="mt-1 text-xs text-zinc-500">Profit and margin remain unavailable because the existing schema does not record reliable product costs or operating expenses.</p><div className="mt-4 divide-y divide-zinc-100">{daily.map(row => <div key={row.date} className="flex justify-between py-3 text-sm"><span>{row.date}</span><span>{row.orders} orders · EGP {row.netSales.toLocaleString()}</span></div>)}</div></div></div>;
}
