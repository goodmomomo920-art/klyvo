"use client";

import { useState } from "react";

export default function FinalCTA() {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [storeName, setStoreName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
  };

  return (
    <section id="early-access" className="py-20 md:py-32 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#080B12] px-6 py-16 sm:px-12 sm:py-24 text-center text-white shadow-2xl">
          {/* Subtle Electric Blue glow in background */}
          <div
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-0 h-[350px] w-[500px] rounded-full bg-[#2563EB]/20 blur-[100px]"
            aria-hidden="true"
          />

          {/* Grid pattern */}
          <div
            className="absolute inset-0 -z-0 bg-[radial-gradient(#ffffff15_1px,transparent_1px)] [background-size:18px_18px] opacity-40"
            aria-hidden="true"
          />

          <div className="relative z-10 mx-auto max-w-2xl space-y-6">
            <span className="inline-flex items-center rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold text-zinc-300 border border-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB] mr-2" />
              Early Access Cohort · Cairo, Alexandria & Beyond
            </span>

            <h2 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Ready to launch a storefront that converts?
            </h2>

            <p className="text-sm sm:text-base text-zinc-300 max-w-xl mx-auto leading-relaxed">
              Join leading Egyptian merchants and consumer electronics brands testing Klyvo. Secure priority onboarding and dedicated setup support.
            </p>

            {submitted ? (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-6 text-center max-w-md mx-auto shadow-lg">
                <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 mb-3">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-white">Application Received</h3>
                <p className="mt-1.5 text-xs text-zinc-300 leading-relaxed">
                  We&apos;ve reserved early access for <strong>{storeName || "your store"}</strong>. Our team will contact {email} with onboarding steps shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Brand or store name"
                    className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-sm text-white placeholder-zinc-500 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB] transition-colors"
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="merchant@example.com"
                    className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-sm text-white placeholder-zinc-500 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB] transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#2563EB] px-6 py-3.5 text-sm font-bold text-white transition-all hover:bg-blue-600 shadow-lg shadow-blue-500/30 active:scale-98 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  Request Early Access
                </button>
              </form>
            )}

            <div className="pt-2 flex flex-wrap items-center justify-center gap-5 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="text-[#2563EB]">✓</span> Dedicated WhatsApp merchant onboarding
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#2563EB]">✓</span> InstaPay & Courier setup guidance
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#2563EB]">✓</span> No credit card required
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
