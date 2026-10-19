"use client";

import { useState } from "react";
import Link from "next/link";

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [language, setLanguage] = useState<"EN" | "AR">("EN");

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === "EN" ? "AR" : "EN"));
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#080B12]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Wordmark */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-xl font-black tracking-tight text-white transition-opacity group-hover:opacity-90">
              Klyvo<span className="text-[#2563EB]">.</span>
            </span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 border border-white/10">
              EG
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6" aria-label="Main Navigation">
            <a
              href="#storefront-preview"
              className="text-sm font-medium text-zinc-300 transition-colors hover:text-white"
            >
              Demo Storefront
            </a>
            <a
              href="#features"
              className="text-sm font-medium text-zinc-300 transition-colors hover:text-white"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-zinc-300 transition-colors hover:text-white"
            >
              How It Works
            </a>
            <a
              href="#benefits"
              className="text-sm font-medium text-zinc-300 transition-colors hover:text-white"
            >
              Benefits
            </a>
          </nav>
        </div>

        {/* Right Actions */}
        <div className="hidden md:flex items-center gap-4">
          {/* Language Selector Placeholder */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
            title="Toggle language preview"
            aria-label="Language selector"
          >
            <svg
              className="h-3.5 w-3.5 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{language === "EN" ? "EN · Egypt" : "العربية · مصر"}</span>
          </button>

          {/* Sign In Link */}
          <Link
            href="/login"
            className="text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
          >
            Sign In
          </Link>

          {/* Primary CTA */}
          <a
            href="#early-access"
            className="inline-flex items-center justify-center rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2 focus:ring-offset-[#080B12]"
          >
            Get Early Access
          </a>
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden items-center gap-2">
          <button
            type="button"
            onClick={toggleLanguage}
            className="rounded border border-white/15 bg-white/5 px-2 py-1 text-xs font-semibold text-zinc-300"
            aria-label="Toggle language"
          >
            {language}
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex items-center justify-center rounded-md p-2 text-zinc-300 hover:bg-white/10 hover:text-white focus:outline-none"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            <span className="sr-only">Open main menu</span>
            {mobileMenuOpen ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-white/10 bg-[#080B12] px-4 pt-2 pb-6 space-y-3">
          <a
            href="#storefront-preview"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-200 hover:text-white"
          >
            Demo Storefront
          </a>
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-200 hover:text-white"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-200 hover:text-white"
          >
            How It Works
          </a>
          <a
            href="#benefits"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-200 hover:text-white"
          >
            Benefits
          </a>
          <Link
            href="/login"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-200 hover:text-white"
          >
            Sign In
          </Link>
          <div className="pt-2">
            <a
              href="#early-access"
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-center rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-blue-600"
            >
              Get Early Access
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
