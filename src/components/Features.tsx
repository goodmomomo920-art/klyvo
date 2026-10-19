"use client";

import { useState } from "react";

export default function Features() {
  const [activeCategory, setActiveCategory] = useState<"products" | "orders" | "customization" | "management">("products");

  const categories = [
    { id: "products" as const, name: "Products & Inventory", label: "Catalog & Stock" },
    { id: "orders" as const, name: "Orders & Fulfillment", label: "Dispatch & Tracking" },
    { id: "customization" as const, name: "Store Customization", label: "Themes & Branding" },
    { id: "management" as const, name: "Store Management", label: "Finance & Staff" },
  ];

  return (
    <section id="features" className="py-20 md:py-28 bg-[#F3F4F6] border-y border-zinc-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#2563EB] border border-blue-200/60 mb-3">
            <span>Full-Stack E-Commerce</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl">
            Complete tools to run your retail operation.
          </h2>
          <p className="mt-4 text-base text-zinc-600 leading-relaxed">
            From consumer electronics catalogs to fashion boutiques, Klyvo is built to support your inventory, orders, courier pickups, and financial records in Egypt.
          </p>
        </div>

        {/* Feature Category Selector */}
        <div className="mt-10 flex flex-wrap gap-2 border-b border-zinc-200 pb-4">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition-all ${
                activeCategory === cat.id
                  ? "bg-[#080B12] text-white shadow-md shadow-zinc-950/10"
                  : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100 hover:text-zinc-950"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Dynamic Category Panels */}
        <div className="mt-8">
          {/* 1. Products & Inventory */}
          {activeCategory === "products" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs space-y-3 hover:border-[#2563EB]/40 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-950">Variant & SKU Management</h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Support for complex product matrices: technical specs, colors, storage capacities, clothes sizes, and warranty bundles with dedicated SKU codes and price points.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs space-y-3 hover:border-[#2563EB]/40 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-950">Automated Low-Stock Alerts</h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Prevent overselling with instant inventory deduction upon order placement and low-stock push alerts when warehouse or shop supply runs thin.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs space-y-3 hover:border-[#2563EB]/40 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-950">Bilingual Arabic Catalog</h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Enter product titles, technical specifications, and descriptions in Arabic and English side-by-side with high-legibility typography designed for Egyptian readers.
                </p>
              </div>
            </div>
          )}

          {/* 2. Orders & Fulfillment */}
          {activeCategory === "orders" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs space-y-3 hover:border-[#2563EB]/40 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-950">Centralized Order Pipeline</h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Track every order from initial checkout to packing, courier dispatch, and final doorstep delivery. Filter easily by payment type or Egyptian governorate.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs space-y-3 hover:border-[#2563EB]/40 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-950">Instant Courier Waybills</h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Print shipping labels and barcode waybills formatted specifically for Egypt&apos;s leading courier services in one click without repetitive data entry.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs space-y-3 hover:border-[#2563EB]/40 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-950">COD & Return Reconciliations</h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Keep tight control over Cash on Delivery payouts. Cross-check courier cash settlements against delivered packages to resolve discrepancies quickly.
                </p>
              </div>
            </div>
          )}

          {/* 3. Store Customization */}
          {activeCategory === "customization" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs space-y-3 hover:border-[#2563EB]/40 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-950">Modular Storefronts</h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Design a distinctive storefront with customizable hero banners, featured collection grids, announcement tickers, and category showcases.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs space-y-3 hover:border-[#2563EB]/40 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-950">Custom Domains & Branding</h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Connect your existing custom domain (e.g. <code>brandname.com</code> or <code>.eg</code>) or use a fast free Klyvo subdomain with included SSL certificates.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs space-y-3 hover:border-[#2563EB]/40 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-950">Mobile-First Shopping Experience</h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Engineered to deliver a friction-free experience on smartphones with sticky &quot;Add to Cart&quot; bars, instant search, and minimal checkout steps.
                </p>
              </div>
            </div>
          )}

          {/* 4. Store Management & Operations */}
          {activeCategory === "management" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs space-y-3 hover:border-[#2563EB]/40 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-950">EGP Revenue Analytics</h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Understand your net margins, top-selling items, return rates, and shipping costs with clear metrics anchored in Egyptian Pounds.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs space-y-3 hover:border-[#2563EB]/40 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-950">Staff Accounts & Role Controls</h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Assign staff roles: packing teams can print waybills, while sensitive revenue totals and bank payout settings remain locked to store owners.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs space-y-3 hover:border-[#2563EB]/40 transition-all">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-950">Egyptian Invoicing & Reports</h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Generate compliant invoice receipts with merchant tax registration numbers and export order spreadsheets ready for accountant review.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
