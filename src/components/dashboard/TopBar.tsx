"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface TopBarProps {
  onOpenMobile: () => void;
  storeSlug?: string | null;
}

export default function TopBar({ onOpenMobile, storeSlug }: TopBarProps) {
  const pathname = usePathname();

  const getPageTitle = () => {
    if (pathname === "/dashboard/products") return "Products & Inventory";
    if (pathname === "/dashboard/orders") return "Orders & Fulfillment";
    if (pathname === "/dashboard/coupons") return "Discount Coupons";
    if (pathname === "/dashboard/customers") return "Customers Directory";
    if (pathname === "/dashboard/analytics") return "Store Analytics";
    if (pathname === "/dashboard/abandoned-carts") return "Abandoned Carts";
    if (pathname === "/dashboard/loyalty") return "Loyalty Points";
    if (pathname === "/dashboard/settings") return "Store Settings";
    return "Store Overview";
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-zinc-200 bg-white/95 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      {/* Left: Mobile hamburger & Dynamic Page Title */}
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={onOpenMobile}
          className="inline-flex items-center justify-center rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none md:hidden"
          aria-label="Open navigation menu"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div>
          <h1 className="text-base sm:text-lg font-bold text-zinc-950 tracking-tight">
            {getPageTitle()}
          </h1>
        </div>
      </div>

      {/* Right: Storefront preview button & Demo merchant profile */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Store Preview Link Button — real public storefront URL */}
        {storeSlug && (
          <Link
            href={`/store/${storeSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 transition-colors shadow-xs"
          >
            <span>View Public Store</span>
            <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>
        )}

        {/* Currency tag */}
        <div className="hidden lg:flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 border border-zinc-200">
          <span>EGP · Egyptian Pound</span>
        </div>

        {/* Demo Merchant Profile Area */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-zinc-200">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#080B12] text-white font-bold text-xs ring-2 ring-[#2563EB]/30">
            ND
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-bold text-zinc-950 leading-tight">Nile Demo</p>
            <p className="text-[10px] text-zinc-500 font-medium">Demo Merchant</p>
          </div>
        </div>
      </div>
    </header>
  );
}
