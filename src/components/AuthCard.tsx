import Link from "next/link";
import React from "react";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export default function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#080B12] text-white selection:bg-[#2563EB] selection:text-white">
      {/* Background ambient glow & grid pattern */}
      <div
        className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(#2563EB_1px,transparent_1px)] [background-size:24px_24px] opacity-15"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 -z-0 h-[400px] w-[600px] rounded-full bg-[#2563EB]/10 blur-[120px]"
        aria-hidden="true"
      />

      {/* Top Header Bar with Back Link */}
      <header className="relative z-10 w-full border-b border-white/10 px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-xl font-black tracking-tight text-white transition-opacity group-hover:opacity-90">
              Klyvo<span className="text-[#2563EB]">.</span>
            </span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 border border-white/10">
              EG
            </span>
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to website</span>
          </Link>
        </div>
      </header>

      {/* Main Form Centerpiece */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          {/* Card Container */}
          <div className="rounded-2xl border border-white/10 bg-[#0E131F]/90 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-black/60">
            {/* Header Text */}
            <div className="text-left mb-6">
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                {title}
              </h1>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                {subtitle}
              </p>
            </div>

            {/* Form Slot */}
            {children}
          </div>

          {/* Demo disclaimer pill */}
          <div className="mt-6 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
              Phase 3 UI Prototype · Backend authentication not connected
            </span>
          </div>
        </div>
      </main>

      {/* Subtle Footer */}
      <footer className="relative z-10 border-t border-white/5 py-4 text-center text-xs text-zinc-400">
        <p>© 2026 Klyvo Technologies. Crafted for merchants across Egypt.</p>
      </footer>
    </div>
  );
}
