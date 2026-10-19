import ElectronicsStorefront from "./ElectronicsStorefront";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-12 pb-24 md:pt-20 md:pb-36 bg-[#080B12] text-white">
      {/* Strategic Electric Blue ambient backlight / glow */}
      <div
        className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-0 h-[500px] w-[800px] rounded-full bg-[#2563EB]/15 blur-[120px] opacity-70"
        aria-hidden="true"
      />

      {/* Subtle modern tech grid */}
      <div
        className="absolute inset-0 -z-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_80%,transparent_100%)] opacity-40"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center space-y-6">
          {/* Bold pill badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-zinc-300 shadow-inner">
            <span className="h-2 w-2 rounded-full bg-[#2563EB] animate-pulse" />
            <span className="tracking-wide">Bold Commerce for Egyptian Merchants</span>
          </div>

          {/* Hero Headline */}
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl sm:leading-[1.1]">
            Build an online store that commands attention.
          </h1>

          {/* Supporting Copy */}
          <p className="mx-auto max-w-2xl text-base text-zinc-300 sm:text-lg sm:leading-relaxed">
            Klyvo equips Egyptian brands with modern storefronts and local commerce infrastructure:
            seamless InstaPay & digital wallet checkouts, governorate courier automation, and instant bilingual catalog management.
          </p>

          {/* Dual CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a
              href="#early-access"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-[#2563EB] px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-blue-600/30 transition-all hover:bg-blue-600 active:scale-98 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2 focus:ring-offset-[#080B12]"
            >
              Get Early Access
              <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
            <a
              href="#storefront-preview"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10 hover:border-white/30 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            >
              Explore Live Electronics Demo
            </a>
          </div>

          {/* Capability chips */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-400 font-medium">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              InstaPay & Vodafone Cash Native
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Automated Courier Dispatch in Cairo & Egypt
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Bilingual Arabic & English
            </span>
          </div>
        </div>

        {/* Central Visual Showcase: Realistic Electronics Storefront */}
        <div id="storefront-preview" className="mt-14 sm:mt-20 scroll-mt-24">
          <div className="mb-3 flex items-center justify-between text-xs text-zinc-400 px-2">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Interactive Demo: Consumer Electronics Storefront built on Klyvo
            </span>
            <span className="hidden sm:inline font-mono text-[11px] text-zinc-400">
              Try adding products or toggling to Merchant Admin
            </span>
          </div>

          <ElectronicsStorefront />
        </div>
      </div>
    </section>
  );
}
