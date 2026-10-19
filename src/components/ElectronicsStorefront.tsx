"use client";

import { useState } from "react";

interface Product {
  id: string;
  name: string;
  category: "audio" | "phones" | "wearables" | "accessories";
  price: number;
  originalPrice?: number;
  rating: number;
  reviews: number;
  badge?: string;
  specs: string[];
  imageUrl: string;
}

const products: Product[] = [
  {
    id: "p1",
    name: "AeroSound Pro Wireless ANC Headphones",
    category: "audio",
    price: 3250,
    originalPrice: 3800,
    rating: 4.9,
    reviews: 142,
    badge: "Best Seller",
    specs: ["40h Battery", "Active Noise Cancelling", "Hi-Res Audio"],
    imageUrl:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "p2",
    name: "Apex Nova 5G Smartphone (256GB)",
    category: "phones",
    price: 16900,
    originalPrice: 18500,
    rating: 4.8,
    reviews: 89,
    badge: "Official Warranty",
    specs: ["6.7\" AMOLED 120Hz", "50MP Triple Cam", "5000mAh 67W"],
    imageUrl:
      "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "p3",
    name: "Titan Ultra GPS Smartwatch",
    category: "wearables",
    price: 4100,
    originalPrice: 4600,
    rating: 4.9,
    reviews: 64,
    badge: "New Release",
    specs: ["Sapphire Glass", "Heart & SpO2", "14-Day Battery"],
    imageUrl:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "p4",
    name: "AirBeat Pro TWS Earbuds w/ Spatial Audio",
    category: "audio",
    price: 1650,
    originalPrice: 1950,
    rating: 4.8,
    reviews: 112,
    badge: "Popular",
    specs: ["Quad Mics", "Wireless Case", "IPX5 Sweatproof"],
    imageUrl:
      "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "p5",
    name: "BassWave 360 Portable Bluetooth Speaker",
    category: "audio",
    price: 2100,
    originalPrice: 2450,
    rating: 4.7,
    reviews: 73,
    badge: "Waterproof",
    specs: ["24W Output", "IPX7 Submersible", "18h Playtime"],
    imageUrl:
      "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "p6",
    name: "TurboCharge 65W GaN Fast Charger (3-Port)",
    category: "accessories",
    price: 780,
    originalPrice: 920,
    rating: 4.9,
    reviews: 204,
    badge: "Local Stock",
    specs: ["2x USB-C + 1x USB-A", "Laptop & Phone", "Cool GaN Tech"],
    imageUrl:
      "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80",
  },
];

export default function ElectronicsStorefront() {
  const [viewMode, setViewMode] = useState<"storefront" | "admin">("storefront");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [cartCount, setCartCount] = useState<number>(2);
  const [cartTotal, setCartTotal] = useState<number>(4900);
  const [addedItemName, setAddedItemName] = useState<string | null>(null);

  const filteredProducts =
    selectedCategory === "all"
      ? products
      : products.filter((p) => p.category === selectedCategory);

  const handleAddToCart = (product: Product) => {
    setCartCount((prev) => prev + 1);
    setCartTotal((prev) => prev + product.price);
    setAddedItemName(product.name);
    setTimeout(() => {
      setAddedItemName(null);
    }, 2500);
  };

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-[#0B0F19] text-left shadow-2xl shadow-blue-500/10 overflow-hidden">
      {/* Top Browser & Demo Mode Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/10 bg-[#080B12] px-4 py-3 gap-3">
        {/* Browser dots & store domain */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-rose-500/80" />
            <div className="h-3 w-3 rounded-full bg-amber-500/80" />
            <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
          </div>
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-zinc-300">
              {viewMode === "storefront"
                ? "volt-electronics.klyvo.store"
                : "admin.klyvo.store/volt-electronics"}
            </span>
            <span className="rounded bg-white/10 px-1 py-0.2 text-[10px] text-zinc-400">
              HTTPS
            </span>
          </div>
        </div>

        {/* View Switcher: Storefront vs Merchant Dashboard */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="hidden md:inline text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            Preview Mode:
          </span>
          <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("storefront")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                viewMode === "storefront"
                  ? "bg-[#2563EB] text-white shadow-xs"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Customer Storefront
            </button>
            <button
              type="button"
              onClick={() => setViewMode("admin")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                viewMode === "admin"
                  ? "bg-[#2563EB] text-white shadow-xs"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Merchant Admin
            </button>
          </div>
        </div>
      </div>

      {/* VIEW 1: CUSTOMER ELECTRONICS STOREFRONT */}
      {viewMode === "storefront" && (
        <div className="bg-white text-zinc-950 font-sans">
          {/* Storefront Notification Bar */}
          <div className="bg-[#080B12] text-zinc-200 py-2 px-4 text-center text-xs font-medium border-b border-white/10 flex items-center justify-between">
            <span className="hidden sm:inline text-zinc-400 text-[11px]">
              Cairo, Giza & Nationwide Delivery
            </span>
            <span className="mx-auto flex items-center gap-1.5 text-zinc-200">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
              Free express shipping on electronics over EGP 1,000 · Pay with InstaPay, Vodafone Cash, or Card
            </span>
            <span className="hidden sm:inline font-mono text-[11px] text-zinc-400">
              Currency: EGP
            </span>
          </div>

          {/* Storefront Navigation Bar */}
          <div className="border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              {/* Store Brand */}
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#080B12] text-white font-extrabold text-sm tracking-wider">
                  V
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-zinc-950">
                    VOLT TECH
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-medium">
                    Consumer Electronics · Cairo Store
                  </p>
                </div>
              </div>

              {/* Search Bar Placeholder */}
              <div className="hidden md:flex flex-1 max-w-xs items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-400">
                <svg className="mr-2 h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>Search headphones, phones, watches...</span>
              </div>

              {/* Cart & Trust Badge */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#2563EB] border border-blue-200/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
                  InstaPay Ready
                </div>

                <div className="relative flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800">
                  <svg className="h-4 w-4 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <span>Cart ({cartCount})</span>
                  <span className="hidden sm:inline text-zinc-400">|</span>
                  <span className="hidden sm:inline font-mono font-bold text-zinc-950">
                    EGP {cartTotal.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {[
                { id: "all", label: "All Electronics" },
                { id: "audio", label: "Audio & Headphones" },
                { id: "phones", label: "Smartphones" },
                { id: "wearables", label: "Smartwatches" },
                { id: "accessories", label: "Fast Chargers & Gear" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`rounded-full px-3 py-1 font-medium transition-all whitespace-nowrap ${
                    selectedCategory === cat.id
                      ? "bg-[#080B12] text-white shadow-xs"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Cart feedback alert */}
          {addedItemName && (
            <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-xs font-medium text-emerald-800 flex items-center justify-between transition-all">
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>
                  Added <strong>{addedItemName}</strong> to cart. Cart total updated!
                </span>
              </span>
              <span className="text-[11px] text-emerald-600 underline cursor-pointer">
                Checkout Now
              </span>
            </div>
          )}

          {/* Product Grid */}
          <div className="p-4 sm:p-6 lg:p-8 bg-zinc-50/70">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="group flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 transition-all hover:border-zinc-300 hover:shadow-lg hover:shadow-zinc-950/5"
                >
                  <div>
                    {/* Product Image Container */}
                    <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg bg-zinc-100 mb-3 border border-zinc-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                      {product.badge && (
                        <span className="absolute top-2 left-2 rounded-md bg-[#080B12]/90 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">
                          {product.badge}
                        </span>
                      )}
                    </div>

                    {/* Ratings & Specs */}
                    <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
                      <div className="flex items-center gap-1 text-amber-500 font-semibold">
                        <span>★</span>
                        <span className="text-zinc-800 text-xs">{product.rating}</span>
                        <span className="text-zinc-400 font-normal">({product.reviews})</span>
                      </div>
                      <span className="text-[11px] text-emerald-600 font-medium">In Stock</span>
                    </div>

                    {/* Product Name */}
                    <h4 className="text-sm font-bold text-zinc-950 line-clamp-2 leading-snug group-hover:text-[#2563EB] transition-colors">
                      {product.name}
                    </h4>

                    {/* Specs Pills */}
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {product.specs.map((spec) => (
                        <span
                          key={spec}
                          className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Price & Action */}
                  <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-extrabold text-zinc-950">
                          EGP {product.price.toLocaleString()}
                        </span>
                        {product.originalPrice && (
                          <span className="text-xs text-zinc-400 line-through">
                            EGP {product.originalPrice.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-500">VAT incl. · Free return in 14d</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddToCart(product)}
                      className="rounded-lg bg-[#080B12] px-3.5 py-2 text-xs font-semibold text-white transition-all hover:bg-[#2563EB] active:scale-95 shadow-xs"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Storefront Checkout Bar */}
            <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#2563EB] font-bold text-lg">
                  ⚡
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-zinc-950">
                    Express 1-Page Checkout for Egyptian Buyers
                  </h4>
                  <p className="text-[11px] text-zinc-500">
                    Accepts InstaPay, Vodafone Cash, Meeza, Visa/Mastercard & Cash on Delivery.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <span className="text-xs text-zinc-500">Total:</span>
                <span className="text-sm font-bold text-zinc-950 font-mono">
                  EGP {cartTotal.toLocaleString()}
                </span>
                <button
                  type="button"
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-600 transition-colors"
                >
                  Proceed to Checkout →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: MERCHANT ADMIN BACKSTAGE */}
      {viewMode === "admin" && (
        <div className="p-4 sm:p-6 lg:p-8 bg-[#0B0F19] text-white space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Volt Tech — Merchant Portal</h3>
                <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                  Storefront Live
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Connected Egyptian payment gateways & courier pickup schedule
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">Currency:</span>
              <span className="rounded border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-white">
                EGP (Egyptian Pound)
              </span>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <span className="text-xs text-zinc-400">Today&apos;s Store Sales</span>
              <p className="mt-1 text-xl sm:text-2xl font-extrabold text-white">EGP 58,900</p>
              <span className="text-[11px] text-emerald-400 font-medium">+24% vs yesterday</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <span className="text-xs text-zinc-400">Electronics Dispatched</span>
              <p className="mt-1 text-xl sm:text-2xl font-extrabold text-white">43 orders</p>
              <span className="text-[11px] text-zinc-400">Cairo & Alexandria</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <span className="text-xs text-zinc-400">InstaPay / Wallet Share</span>
              <p className="mt-1 text-xl sm:text-2xl font-extrabold text-[#2563EB]">74%</p>
              <span className="text-[11px] text-zinc-400">Instant bank verification</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <span className="text-xs text-zinc-400">Courier Status</span>
              <p className="mt-1 text-xl sm:text-2xl font-extrabold text-white">18 Ready</p>
              <span className="text-[11px] text-amber-400">Pickup in 45 mins</span>
            </div>
          </div>

          {/* Recent Orders in Egypt */}
          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Incoming Cairo & Alexandria Orders
              </span>
              <span className="text-xs text-zinc-400 font-mono">Live Sync</span>
            </div>
            <div className="divide-y divide-white/5 text-xs">
              <div className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white">#VT-4091 · Karim E.</span>
                  <p className="text-[11px] text-zinc-400">AeroSound Pro Headphones · New Cairo</p>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-white">EGP 3,250</span>
                  <span className="block text-[10px] text-emerald-400">InstaPay · Verified</span>
                </div>
              </div>
              <div className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white">#VT-4090 · Yasmine S.</span>
                  <p className="text-[11px] text-zinc-400">Titan Ultra Smartwatch · Alexandria</p>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-white">EGP 4,100</span>
                  <span className="block text-[10px] text-sky-400">Vodafone Cash · Dispatched</span>
                </div>
              </div>
              <div className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white">#VT-4089 · Ahmed M.</span>
                  <p className="text-[11px] text-zinc-400">Apex Nova 5G Smartphone · Sheikh Zayed</p>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-white">EGP 16,900</span>
                  <span className="block text-[10px] text-zinc-300">Card (Meeza / Visa)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
