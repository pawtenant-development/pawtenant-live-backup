import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import { ESA_PRICE_LABELS } from "@/config/pricing";

interface Props {
  /** Optional section bg override. Default: white. */
  className?: string;
}

/**
 * EsaPricingMini — polished, mobile-first pricing cards for trust / education
 * pages (AI SEO pages, /how-to-get-esa-letter, /housing-rights-esa, state
 * pages via state-esa template).
 *
 * Pricing values come from src/config/pricing.ts — single source of truth.
 * No hard-coded numbers. CTA routes to /assessment with attribution preserved.
 *
 * Each card now carries its own feature list and a Klarna pay-later chip
 * INSIDE the card (not just a tiny bullet below). Legally-safe wording only:
 *   - "where eligible" / "at checkout" for Klarna (never guaranteed)
 *   - "Money-back if not approved" (no approval guarantee)
 *
 * A short PSD note sits below — surfaces PSD support without rewriting the
 * host page around PSD.
 */

function KlarnaChip() {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FFB3C7]/25 border border-[#FFB3C7]/70">
      <span className="text-[11px] font-extrabold tracking-tight text-[#8A2D4D]">Klarna.</span>
      <span className="text-[10.5px] text-slate-600 leading-none">Pay later · where eligible</span>
    </div>
  );
}

export default function EsaPricingMini({ className }: Props) {
  const { withAttribution } = useAttributionParams();

  const features = [
    { icon: "ri-stethoscope-line", text: "Licensed provider review" },
    { icon: "ri-shield-check-line", text: "Money-back if not approved" },
    { icon: "ri-qr-code-line", text: "Verifiable, housing-ready letter" },
  ];

  return (
    <section className={`py-14 sm:py-20 ${className || "bg-white"}`}>
      <div className="max-w-4xl mx-auto px-5 sm:px-6">
        <div className="text-center mb-8 sm:mb-10">
          <p className="text-orange-500 text-xs sm:text-sm font-semibold tracking-widest uppercase mb-2">
            ESA Letter Pricing
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight">
            Clear, upfront pricing — <span className="text-orange-500">from {ESA_PRICE_LABELS.startingFrom}</span>
          </h2>
          <p className="text-gray-500 text-sm mt-2.5 max-w-xl mx-auto leading-snug">
            Pay in full or split it with Klarna where available at checkout. A licensed provider
            reviews your assessment — approval is not guaranteed.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 max-w-3xl mx-auto items-stretch">
          {/* One-Time card */}
          <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 flex flex-col shadow-[0_8px_30px_-18px_rgba(15,23,42,0.18)]">
            <p className="text-[11px] font-bold tracking-widest uppercase text-gray-500 mb-2">
              One-time
            </p>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-4xl sm:text-5xl font-black text-gray-900 leading-none">
                {ESA_PRICE_LABELS.oneTime}
              </span>
              <span className="text-sm text-gray-400">{ESA_PRICE_LABELS.oneTimeSuffix}</span>
            </div>
            <p className="text-[13px] text-gray-500 leading-snug mb-3">
              Valid for 1 year. Pay once, no auto-renewal.
            </p>
            <div className="mb-4">
              <KlarnaChip />
            </div>
            <ul className="space-y-2 mb-6">
              {features.map((f) => (
                <li key={f.text} className="flex items-start gap-2 text-[13px] text-gray-700">
                  <i className={`${f.icon} text-orange-500 mt-0.5 flex-shrink-0`}></i>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
            <Link
              to={withAttribution("/assessment")}
              className="mt-auto whitespace-nowrap w-full py-3 text-sm font-bold rounded-xl text-center block border-2 border-orange-500 text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
            >
              Start ESA Assessment
            </Link>
          </div>

          {/* Annual card (highlighted) */}
          <div className="bg-white rounded-3xl border-2 border-orange-500 p-6 sm:p-8 flex flex-col relative shadow-[0_12px_36px_-16px_rgba(249,115,22,0.35)]">
            <span className="absolute -top-3 right-5 bg-orange-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full whitespace-nowrap shadow-sm">
              Best value
            </span>
            <p className="text-[11px] font-bold tracking-widest uppercase text-orange-500 mb-2">
              Annual
            </p>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-4xl sm:text-5xl font-black text-gray-900 leading-none">
                {ESA_PRICE_LABELS.subscription}
              </span>
              <span className="text-sm text-gray-400">{ESA_PRICE_LABELS.subscriptionSuffix}</span>
            </div>
            <p className="text-[13px] text-gray-500 leading-snug mb-3">
              Renews automatically. Save vs. one-time every year.
            </p>
            <div className="mb-4">
              <KlarnaChip />
            </div>
            <ul className="space-y-2 mb-6">
              {features.map((f) => (
                <li key={f.text} className="flex items-start gap-2 text-[13px] text-gray-700">
                  <i className={`${f.icon} text-orange-500 mt-0.5 flex-shrink-0`}></i>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
            <Link
              to={withAttribution("/assessment")}
              className="mt-auto whitespace-nowrap w-full py-3 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors cursor-pointer text-center block shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
            >
              Start ESA Assessment
            </Link>
          </div>
        </div>

        {/* PSD note — surfaces PSD support without rewriting host page */}
        <p className="text-center text-[11px] text-gray-400 mt-6 max-w-md mx-auto leading-relaxed">
          PawTenant also supports{" "}
          <strong className="text-gray-600">PSD (Psychiatric Service Dog)</strong>{" "}
          evaluations for qualifying individuals where clinically appropriate. PSD documentation
          requires disability-related task training and is different from ESA documentation.
        </p>
      </div>
    </section>
  );
}
