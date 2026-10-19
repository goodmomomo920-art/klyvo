"use client";

import Link from "next/link";
import { useProducts } from "@/lib/demoProducts";

export default function DashboardOverviewPage() {
  const products = useProducts();
  const productCount = products.length;

  const metricCards = [
    {
      label: "Total Sales",
      value: "EGP 0",
      change: "No orders yet",
      icon: (
        <svg className="h-5 w-5 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    {
      label: "Orders",
      value: "0",
      change: "0 fulfillment pending",
      icon: (
        <svg className="h-5 w-5 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
          />
        </svg>
      ),
    },
    {
      label: "Products",
      value: productCount.toString(),
      change: productCount > 0 ? `${productCount} items in demo catalog` : "Catalog ready to setup",
      icon: (
        <svg className="h-5 w-5 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      ),
    },
    {
      label: "Customers",
      value: "0",
      change: "0 profiles created",
      icon: (
        <svg className="h-5 w-5 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
              Welcome to your store
            </h2>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-[#2563EB] border border-blue-200/60">
              Demo
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            Monitor real-time sales, order dispatches, and inventory for your Egyptian store.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/products"
            className="inline-flex items-center justify-center rounded-xl bg-[#2563EB] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-600 transition-colors"
          >
            + Add Product
          </Link>
        </div>
      </div>

      {/* 4 Summary Cards (Clearly labeled demo data) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricCards.map((metric) => (
          <div
            key={metric.label}
            className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs transition-all hover:border-zinc-300"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500">{metric.label}</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                {metric.icon}
              </div>
            </div>
            <p className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-zinc-950 font-mono">
              {metric.value}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
              <span>{metric.change}</span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.2 text-[10px] font-mono text-zinc-500">
                Demo
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Getting Started Guide */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-7 shadow-xs space-y-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-zinc-950">
            Getting Started Checklist
          </h3>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Complete these essential steps to prepare your store for Egyptian buyers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Step 1: Products */}
          <Link
            href="/dashboard/products"
            className="group rounded-xl border border-zinc-200 bg-zinc-50/50 p-5 transition-all hover:bg-white hover:border-[#2563EB]/40 hover:shadow-md hover:shadow-blue-500/5 text-left"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#080B12] text-xs font-bold text-white">
                1
              </span>
              <span className="text-xs font-bold text-[#2563EB] group-hover:translate-x-0.5 transition-transform">
                Configure Catalog →
              </span>
            </div>
            <h4 className="mt-3 text-sm font-bold text-zinc-950 group-hover:text-[#2563EB] transition-colors">
              Add your first products
            </h4>
            <p className="mt-1 text-xs text-zinc-600 leading-relaxed">
              Upload photos, set prices in EGP, and define size, color, or spec variants.
            </p>
          </Link>

          {/* Step 2: Store Settings */}
          <Link
            href="/dashboard/settings"
            className="group rounded-xl border border-zinc-200 bg-zinc-50/50 p-5 transition-all hover:bg-white hover:border-[#2563EB]/40 hover:shadow-md hover:shadow-blue-500/5 text-left"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#080B12] text-xs font-bold text-white">
                2
              </span>
              <span className="text-xs font-bold text-[#2563EB] group-hover:translate-x-0.5 transition-transform">
                Setup Payments & Shipping →
              </span>
            </div>
            <h4 className="mt-3 text-sm font-bold text-zinc-950 group-hover:text-[#2563EB] transition-colors">
              Enable Egyptian payments & couriers
            </h4>
            <p className="mt-1 text-xs text-zinc-600 leading-relaxed">
              Configure InstaPay, Vodafone Cash, Meeza cards, and governorate delivery rates.
            </p>
          </Link>
        </div>
      </div>

      {/* Recent Orders Section with Polished Empty State */}
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-zinc-950">Recent Orders</h3>
            <p className="text-xs text-zinc-500">Live order queue and fulfillment pipeline</p>
          </div>
          <Link
            href="/dashboard/orders"
            className="text-xs font-bold text-[#2563EB] hover:text-blue-700 transition-colors"
          >
            View all orders →
          </Link>
        </div>

        {/* Polished Empty State */}
        <div className="py-16 px-6 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 border border-zinc-200 text-zinc-400">
            <svg className="h-7 w-7 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
          </div>
          <div className="max-w-sm mx-auto space-y-1">
            <h4 className="text-base font-bold text-zinc-950">No orders received yet</h4>
            <p className="text-xs text-zinc-500 leading-relaxed">
              When Egyptian shoppers purchase items from your storefront via InstaPay, cards, or Cash on Delivery, their orders will appear here automatically.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/dashboard/products"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              Add products to start selling
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
