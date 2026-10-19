import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-[#F3F4F6] text-zinc-600">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand info */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-zinc-950">
                Klyvo<span className="text-[#2563EB]">.</span>
              </span>
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700">
                Egypt
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-xs sm:text-sm text-zinc-500 leading-relaxed">
              The bold commerce platform engineered for Egyptian merchants, direct-to-consumer brands, and retailers. Built for InstaPay, governorate fulfillment, and high-converting storefronts.
            </p>
            <div className="mt-4 flex items-center gap-2.5 text-xs text-zinc-500">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span>Tailored for Cairo, Alexandria, and nationwide retail</span>
            </div>
          </div>

          {/* Column 1: Platform */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-950">
              Platform
            </h3>
            <ul className="mt-4 space-y-2.5 text-xs sm:text-sm">
              <li>
                <a href="#storefront-preview" className="hover:text-zinc-950 transition-colors">
                  Electronics Storefront
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-zinc-950 transition-colors">
                  Catalog & Variants
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-zinc-950 transition-colors">
                  Orders & Courier Waybills
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-zinc-950 transition-colors">
                  Store Management
                </a>
              </li>
            </ul>
          </div>

          {/* Column 2: Egyptian Rails */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-950">
              Egyptian Rails
            </h3>
            <ul className="mt-4 space-y-2.5 text-xs sm:text-sm">
              <li>
                <span className="text-zinc-600">InstaPay Verification</span>
              </li>
              <li>
                <span className="text-zinc-600">Vodafone Cash & Telecom Wallets</span>
              </li>
              <li>
                <span className="text-zinc-600">Courier Zone Rate Engines</span>
              </li>
              <li>
                <span className="text-zinc-600">Cash on Delivery Reconciliation</span>
              </li>
            </ul>
          </div>

          {/* Column 3: Trust & Info */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-950">
              Company
            </h3>
            <ul className="mt-4 space-y-2.5 text-xs sm:text-sm">
              <li>
                <a href="#benefits" className="hover:text-zinc-950 transition-colors">
                  Why Klyvo
                </a>
              </li>
              <li>
                <a href="#early-access" className="hover:text-zinc-950 transition-colors">
                  Early Access Cohort
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-zinc-950 transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <Link href="/login" className="hover:text-zinc-950 transition-colors">
                  Merchant Sign In
                </Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-zinc-950 transition-colors">
                  Create Account
                </Link>
              </li>
              <li>
                <span className="text-zinc-400">Cairo, Egypt</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 border-t border-zinc-200/80 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>© 2026 Klyvo Technologies. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <span className="hover:text-zinc-900 cursor-pointer">Privacy Policy</span>
            <span className="hover:text-zinc-900 cursor-pointer">Terms of Service</span>
            <span className="hover:text-zinc-900 cursor-pointer">Merchant Guidelines</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
