export default function Benefits() {
  const benefits = [
    {
      title: "Built for Egyptian Payment Rails",
      description:
        "Direct checkout integration with InstaPay, Vodafone Cash, Orange, Etisalat, and Meeza debit/credit cards, alongside structured Cash on Delivery tracking.",
      icon: (
        <svg className="h-5 w-5 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
          />
        </svg>
      ),
    },
    {
      title: "Governorate Shipping & Courier Automation",
      description:
        "Pre-configured shipping zones for Greater Cairo, Giza, Alexandria, Delta, and Upper Egypt. Auto-generate waybill barcodes for Egyptian courier networks in one click.",
      icon: (
        <svg className="h-5 w-5 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
          />
        </svg>
      ),
    },
    {
      title: "Native Bilingual Experience (Arabic & English)",
      description:
        "Every storefront and management screen is engineered from the ground up for both Arabic (RTL) and English. Clean typography ensures high trust with Egyptian buyers.",
      icon: (
        <svg className="h-5 w-5 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
          />
        </svg>
      ),
    },
    {
      title: "Automated WhatsApp Commerce Alerts",
      description:
        "Send automatic order confirmations, shipping updates, and courier delivery tracking links straight to your buyers on Egypt's most used messaging platform.",
      icon: (
        <svg className="h-5 w-5 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      ),
    },
    {
      title: "Sub-Second Mobile Page Speeds",
      description:
        "Egyptian consumers shop heavily on mobile data networks. Klyvo storefronts are lightweight and performant, minimizing bounce rates and lost checkout carts.",
      icon: (
        <svg className="h-5 w-5 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      ),
    },
    {
      title: "Local EGP Accounting & Transparent Fees",
      description:
        "No foreign exchange markups or offshore transaction fees. All transactions, store payouts, and performance metrics are tracked natively in Egyptian Pounds.",
      icon: (
        <svg className="h-5 w-5 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
      ),
    },
  ];

  return (
    <section id="benefits" className="py-20 md:py-28 bg-[#F3F4F6] border-y border-zinc-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#2563EB] border border-blue-200/60 mb-3">
            <span>Built for Egyptian Commerce</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl">
            Why growing Egyptian brands choose Klyvo.
          </h2>
          <p className="mt-4 text-base text-zinc-600 leading-relaxed">
            Generic international platforms fail to handle Egypt&apos;s unique payment ecosystem, cash-on-delivery dynamics, and courier handoffs. Klyvo gives you a platform built specifically for this market.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="group rounded-2xl border border-zinc-200/90 bg-white p-7 transition-all hover:border-[#2563EB]/40 hover:shadow-lg hover:shadow-blue-500/5"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 border border-blue-100 group-hover:scale-105 transition-transform">
                {benefit.icon}
              </div>
              <h3 className="mt-5 text-base font-bold text-zinc-950 group-hover:text-[#2563EB] transition-colors">
                {benefit.title}
              </h3>
              <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
