/**
 * AffordabilityStrip — Phase 3 pricing / conversion framing.
 *
 * Mounted directly below StepsSection — the natural moment a visitor moves
 * from "I understand what this is" to "ok, but how much and how easy is
 * it actually?" Answering those two questions BEFORE the deep below-fold
 * content (and before PricingSection) reduces sticker-shock and increases
 * assessment starts without resorting to fake scarcity / countdowns / huge
 * discount banners.
 *
 * Three calm pillars:
 *   1. Five-minute assessment — sets the time expectation low
 *   2. 100% online            — removes friction (no clinic, no scheduling)
 *   3. Simple checkout        — Klarna mentioned neutrally, no financing promo
 *
 * Compliance + premium-feel guardrails:
 *   - No "guaranteed approval" or "guaranteed letter" copy.
 *   - No countdown / urgency / "only today" / fake scarcity.
 *   - Klarna text is neutral only ("available at checkout · subject to
 *     eligibility and Klarna payment terms") — no pay-in-4 / interest-free.
 *   - No CTA inside the strip — the page already has CTAs in TrustFeatures,
 *     PricingSection, and CTASection. This keeps the lower-page rhythm
 *     spacious and avoids button overload.
 */

const PILLARS = [
  {
    icon: "ri-time-line",
    title: "Five-minute assessment",
    body: "Short clinical questionnaire. No appointments, no waiting rooms.",
  },
  {
    icon: "ri-laptop-line",
    title: "100% online",
    body: "Complete from home on your phone or laptop — provider review happens behind the scenes.",
  },
  {
    icon: "ri-wallet-3-line",
    title: "Simple checkout",
    body: "Pay by card, or choose Klarna at checkout — subject to eligibility.",
  },
];

export default function AffordabilityStrip() {
  return (
    <section
      aria-label="Affordable and flexible"
      className="bg-[#fafbfb] border-t border-b border-slate-100"
    >
      <div className="max-w-6xl mx-auto px-5 py-10 sm:py-14">
        <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10">
          <p className="text-[11px] sm:text-xs font-bold tracking-[0.12em] uppercase text-[#4A8472] mb-2">
            Approachable &amp; flexible
          </p>
          <h2 className="text-[20px] sm:text-2xl font-bold text-slate-900 leading-tight">
            Made to fit your day &mdash; and your budget.
          </h2>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-7 max-w-5xl mx-auto">
          {PILLARS.map((p) => (
            <li
              key={p.title}
              className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6"
            >
              <div className="flex items-center gap-2.5 mb-2.5">
                <span
                  aria-hidden
                  className="w-8 h-8 rounded-full bg-[#4A8472]/15 text-[#4A8472] flex items-center justify-center flex-shrink-0"
                >
                  <i className={`${p.icon} text-lg`} />
                </span>
                <h3 className="text-[14px] sm:text-[15px] font-bold text-slate-900 leading-tight">
                  {p.title}
                </h3>
              </div>
              <p className="text-[13px] sm:text-[13.5px] text-slate-600 leading-snug">
                {p.body}
              </p>
            </li>
          ))}
        </ul>

        {/* Subtle Klarna footer — mirrors the lp-esa-housing pattern so the
            messaging stays consistent across landing surfaces. No sized-up
            Klarna logo, no discount badge. */}
        <div className="flex justify-center mt-7 sm:mt-9">
          <div className="inline-flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full bg-white border border-[#FFA8CD] shadow-[0_2px_8px_rgba(255,168,205,0.20)]">
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#FFA8CD] text-[#1A0A12] font-extrabold text-[11px] leading-none tracking-tight flex-shrink-0"
            >
              K.
            </span>
            <div className="text-left leading-tight">
              <div className="text-[11.5px] font-semibold text-slate-900">
                <span className="text-[#7A3F5F]">Klarna</span> available at checkout
              </div>
              <div className="text-[10px] text-slate-500">
                Subject to eligibility and{" "}
                <a
                  href="https://www.klarna.com/us/terms-of-use/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-700"
                >
                  Klarna payment terms
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
