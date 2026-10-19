"use client";

import { useState } from "react";

interface Order {
  id: string;
  customer: string;
  location: string;
  amount: string;
  paymentMethod: "InstaPay" | "Vodafone Cash" | "Credit Card" | "Cash on Delivery";
  status: "Paid & Packing" | "Dispatched" | "Delivered" | "Out for Delivery";
  time: string;
}

const mockOrders: Order[] = [
  {
    id: "#KV-1048",
    customer: "Farida M.",
    location: "New Cairo, 5th Settlement",
    amount: "EGP 1,450",
    paymentMethod: "InstaPay",
    status: "Paid & Packing",
    time: "4 mins ago",
  },
  {
    id: "#KV-1047",
    customer: "Tarek H.",
    location: "Sidi Gaber, Alexandria",
    amount: "EGP 890",
    paymentMethod: "Vodafone Cash",
    status: "Dispatched",
    time: "18 mins ago",
  },
  {
    id: "#KV-1046",
    customer: "Salma K.",
    location: "Degla, Maadi",
    amount: "EGP 2,400",
    paymentMethod: "Credit Card",
    status: "Delivered",
    time: "42 mins ago",
  },
  {
    id: "#KV-1045",
    customer: "Mahmoud A.",
    location: "El-Mansoura, Daqahlia",
    amount: "EGP 670",
    paymentMethod: "Cash on Delivery",
    status: "Out for Delivery",
    time: "1 hr ago",
  },
  {
    id: "#KV-1044",
    customer: "Nour E.",
    location: "Sheikh Zayed, Giza",
    amount: "EGP 1,820",
    paymentMethod: "InstaPay",
    status: "Paid & Packing",
    time: "2 hrs ago",
  },
];

export default function DashboardPreview() {
  const [activeTab, setActiveTab] = useState<"orders" | "payments" | "couriers">("orders");

  return (
    <div
      id="dashboard-preview"
      className="w-full rounded-2xl border border-zinc-200/90 bg-white shadow-xl shadow-zinc-950/5 overflow-hidden text-left"
    >
      {/* Top Browser / App Chrome */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-zinc-300" />
          <div className="h-3 w-3 rounded-full bg-zinc-300" />
          <div className="h-3 w-3 rounded-full bg-zinc-300" />
          <div className="ml-3 hidden sm:flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-mono text-zinc-700">admin.klyvo.com/cairo-threads</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200/60">
            Storefront Live · EGP
          </span>
          <span className="text-xs text-zinc-500">Klyvo OS v1.0</span>
        </div>
      </div>

      {/* Main Dashboard Layout */}
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 bg-white">
        {/* Top Header inside Dashboard */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-zinc-950 sm:text-xl">Nile Threads Boutique</h2>
              <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 border border-zinc-200">
                Cairo & Alexandria
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
              Live store analytics and fulfillment management
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 shadow-xs"
            >
              <span>klyvo.store/nilethreads</span>
              <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
            >
              + Add Product
            </button>
          </div>
        </div>

        {/* Real-time Metric Cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 transition-all">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-xs font-medium">Today&apos;s Revenue</span>
              <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/50">
                +22%
              </span>
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
              EGP 42,850
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">Across 18 Egyptian cities</p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 transition-all">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-xs font-medium">New Orders</span>
              <span className="text-[11px] font-semibold text-zinc-600 bg-zinc-200/60 px-1.5 py-0.5 rounded">
                Today
              </span>
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
              78 orders
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">14 pending courier dispatch</p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 transition-all">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-xs font-medium">Average Order</span>
              <span className="text-[11px] font-semibold text-zinc-600 bg-zinc-200/60 px-1.5 py-0.5 rounded">
                EGP
              </span>
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
              EGP 549
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">2.4 items per cart</p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 transition-all">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-xs font-medium">InstaPay & Wallets</span>
              <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/50">
                71% share
              </span>
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
              EGP 30,420
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">Fast digital settlements</p>
          </div>
        </div>

        {/* Interactive View Tabs */}
        <div className="flex items-center gap-2 border-b border-zinc-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("orders")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "orders"
                ? "bg-zinc-950 text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
            }`}
          >
            Recent Orders ({mockOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("payments")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "payments"
                ? "bg-zinc-950 text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
            }`}
          >
            Egyptian Payment Rails
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("couriers")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "couriers"
                ? "bg-zinc-950 text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
            }`}
          >
            Courier Waybills & Zones
          </button>
        </div>

        {/* Tab 1: Orders Table */}
        {activeTab === "orders" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 overflow-x-auto rounded-xl border border-zinc-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Order</th>
                    <th className="py-2.5 px-3">Customer & Area</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-3">Total</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {mockOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="py-3 px-3 font-semibold text-zinc-950">
                        {order.id}
                        <span className="block text-[10px] font-normal text-zinc-400">
                          {order.time}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-zinc-900 block">{order.customer}</span>
                        <span className="text-[11px] text-zinc-500">{order.location}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 border border-zinc-200">
                          {order.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-zinc-900">{order.amount}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                            order.status === "Delivered"
                              ? "bg-zinc-100 text-zinc-800 border-zinc-300"
                              : order.status === "Dispatched"
                              ? "bg-sky-50 text-sky-700 border-sky-200"
                              : order.status === "Out for Delivery"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sidebar info card */}
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                    Courier Dispatch Ready
                  </h3>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  <strong className="text-zinc-900">14 orders</strong> packed and ready for local courier pickup in New Cairo & Giza today.
                </p>
                <div className="pt-2 border-t border-zinc-200 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Waybills generated</span>
                  <span className="font-semibold text-zinc-900">14 / 14</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Estimated transit</span>
                  <span className="font-semibold text-zinc-900">24-48 hrs</span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 p-4 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                  WhatsApp Commerce Alert
                </h3>
                <p className="text-xs text-zinc-600">
                  Automated delivery tracking links sent to 100% of today&apos;s buyers.
                </p>
                <div className="rounded bg-zinc-100 p-2 text-[11px] text-zinc-700 font-mono">
                  &quot;Hello Salma, your Nile Threads package (#KV-1046) is on its way...&quot;
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Payments View */}
        {activeTab === "payments" && (
          <div className="rounded-xl border border-zinc-200 p-4 sm:p-6 bg-zinc-50/40 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Connected Egyptian Payment Methods</h3>
                <p className="text-xs text-zinc-500">
                  Allow your Egyptian buyers to pay using their preferred local channel.
                </p>
              </div>
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                All Rails Online
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="rounded-lg border border-zinc-200 bg-white p-3.5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-zinc-900">InstaPay Direct Settlement</h4>
                  <p className="text-[11px] text-zinc-500">Instant transfer verification via IPA handle</p>
                </div>
                <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  Active
                </span>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-3.5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-zinc-900">Vodafone & Telecom Wallets</h4>
                  <p className="text-[11px] text-zinc-500">Vodafone Cash, Orange, Etisalat, WE Pay</p>
                </div>
                <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  Active
                </span>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-3.5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-zinc-900">Local Debit & Credit Cards</h4>
                  <p className="text-[11px] text-zinc-500">Meeza, Visa, Mastercard with 3D Secure</p>
                </div>
                <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  Active
                </span>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-3.5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-zinc-900">Cash on Delivery (COD)</h4>
                  <p className="text-[11px] text-zinc-500">Automated courier reconciliation & cash collections</p>
                </div>
                <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  Active
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Couriers View */}
        {activeTab === "couriers" && (
          <div className="rounded-xl border border-zinc-200 p-4 sm:p-6 bg-zinc-50/40 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Governorate Shipping Zones & Couriers</h3>
              <p className="text-xs text-zinc-500">
                Automated shipping rates and instant barcode generation for Egyptian delivery fleets.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="rounded-lg border border-zinc-200 bg-white p-3.5 space-y-1">
                <span className="text-[10px] font-semibold uppercase text-zinc-400">Zone 1</span>
                <h4 className="text-xs font-bold text-zinc-900">Greater Cairo & Giza</h4>
                <p className="text-xs text-zinc-600">Rate: EGP 45 · Next-day dispatch</p>
                <span className="inline-block text-[10px] text-emerald-600 font-medium">99.2% delivery success</span>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-white p-3.5 space-y-1">
                <span className="text-[10px] font-semibold uppercase text-zinc-400">Zone 2</span>
                <h4 className="text-xs font-bold text-zinc-900">Alexandria & Delta</h4>
                <p className="text-xs text-zinc-600">Rate: EGP 65 · 24-48 hours</p>
                <span className="inline-block text-[10px] text-emerald-600 font-medium">Auto-assigned courier</span>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-white p-3.5 space-y-1">
                <span className="text-[10px] font-semibold uppercase text-zinc-400">Zone 3</span>
                <h4 className="text-xs font-bold text-zinc-900">Canal & Upper Egypt</h4>
                <p className="text-xs text-zinc-600">Rate: EGP 85 · 48-72 hours</p>
                <span className="inline-block text-[10px] text-emerald-600 font-medium">SMS confirmation enabled</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
