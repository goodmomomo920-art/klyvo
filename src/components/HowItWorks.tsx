export default function HowItWorks() {
  const steps = [
    {
      step: "01",
      title: "Set up your products & storefront",
      description:
        "Upload your catalog, configure size, color, or spec variants, set prices in EGP, and select a modern storefront layout tailored to your products.",
      details: [
        "Consumer electronics, fashion, or lifestyle catalog matrices",
        "Bilingual Arabic (RTL) & English product descriptions",
        "Mobile-first, high-conversion product card layouts",
      ],
    },
    {
      step: "02",
      title: "Activate Egyptian payments & shipping",
      description:
        "Connect the payment methods your customers actually use and establish automated shipping rates for all 27 Egyptian governorates.",
      details: [
        "Enable InstaPay, Vodafone Cash, Meeza, and card checkouts",
        "Configurable delivery zones for Cairo, Giza, Alexandria & Delta",
        "Automated Cash on Delivery tracking and receipt dispatch",
      ],
    },
    {
      step: "03",
      title: "Receive orders & fulfill seamlessly",
      description:
        "Link your store to Instagram, Facebook, TikTok, or your custom domain. Fulfill orders, print courier barcodes, and send tracking links via WhatsApp.",
      details: [
        "Live order fulfillment and status pipeline",
        "Instant courier airway bill & barcode generation",
        "Automated WhatsApp delivery updates to buyers",
      ],
    },
  ];

  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#2563EB] border border-blue-200/60 mb-3">
            <span>Simple 3-Step Setup</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl">
            From setup to your first sale in days.
          </h2>
          <p className="mt-4 text-base text-zinc-600">
            No complicated programming or overseas workarounds. Engineered specifically for Egyptian merchants who want a reliable, high-performing commerce presence.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
          {steps.map((item, index) => (
            <div
              key={item.step}
              className="relative flex flex-col justify-between rounded-2xl border border-zinc-200 bg-[#F3F4F6]/50 p-7 sm:p-8 transition-all hover:bg-white hover:border-[#2563EB]/40 hover:shadow-xl hover:shadow-blue-500/5"
            >
              <div>
                {/* Step indicator */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black tracking-widest text-[#2563EB]">
                    STEP {item.step}
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#080B12] text-xs font-bold text-white shadow-xs">
                    {index + 1}
                  </span>
                </div>

                <h3 className="mt-6 text-lg font-bold text-zinc-950">
                  {item.title}
                </h3>
                <p className="mt-2.5 text-sm text-zinc-600 leading-relaxed">
                  {item.description}
                </p>

                <ul className="mt-6 space-y-2.5 border-t border-zinc-200/80 pt-5">
                  {item.details.map((detail) => (
                    <li key={detail} className="flex items-start gap-2.5 text-xs text-zinc-700">
                      <svg
                        className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#2563EB]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="leading-relaxed">{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
