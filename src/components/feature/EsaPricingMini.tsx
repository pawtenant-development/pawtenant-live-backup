import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import { ESA_PRICE_LABELS } from "@/config/pricing";

interface Props {
  /** Optional section bg override. Default: white. */
  className?: string;
  /**
   * When true, render the taller, homepage-style premium cards (richer
   * proof-point list, header band on the highlight card, price-in-CTA,
   * money-back microcopy). Used by the ESA state-page template so the
   * cards don't feel short next to the rest of the page.
   *
   * Default (false) keeps the original compact cards byte-for-byte, so
   * every other consumer (/how-to-get-esa-letter, /housing-rights-esa,
   * AI SEO pages) is unchanged.
   */
  premium?: boolean;
}

/**
 * EsaPricingMini — polished, mobile-first pricing cards for trust / education
 * pages (AI SEO pages, /how-to-get-esa-letter, /housing-rights-esa, state
 * pages via state-esa template).
 *
 * Pricing values come from src/config/pricing.ts — single source of truth.
 * No hard-coded numbers. CTA routes to /assessment with attribution preserved.
 *
 * Each card now carries its own feature list and a neutral Klarna chip
 * INSIDE the card (not just a tiny bullet below). Compliance-safe wording only:
 *   - "Klarna available at checkout" — no pay-in-4 / interest-free / financing
 *     promotion. Eligibility + terms link live in the header note.
 *   - "Money-back if not approved" (no approval guarantee)
 *
 * A short PSD note sits below — surfaces PSD support without rewriting the
 * host page around PSD.
 */

function KlarnaChip() {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FFB3C7]/25 border border-[#FFB3C7]/70">
      <span className="text-[11px] font-extrabold tracking-tight text-[#8A2D4D]">Klarna.</span>
      <span className="text-[10.5px] text-slate-600 leading-none">Available at checkout</span>
    </div>
  );
}

// Compact feature list — original cards (non-premium consumers).
const COMPACT_FEATURES = [
  { icon: "ri-stethoscope-line", text: "Licensed provider review" },
  { icon: "ri-shield-check-line", text: "Money-back if not approved" },
  { icon: "ri-qr-code-line", text: "Verifiable, housing-ready letter" },
];

// Richer proof-point list for the premium (state-page) variant — mirrors
// the homepage pricing card feature set. Compliance-safe wording only.
const PREMIUM_FEATURES = [
  { icon: "ri-stethoscope-line", text: "Official ESA letter from a licensed LMHP" },
  { icon: "ri-home-heart-line", text: "Fair Housing Act (FHA) compliant" },
  { icon: "ri-user-star-line", text: "Provider signature, license number & NPI" },
  { icon: "ri-mail-send-line", text: "Secure PDF delivered by email" },
  { icon: "ri-calendar-check-line", text: "Valid for 1 year" },
  { icon: "ri-qr-code-line", text: "Landlord verification support" },
];

export default function EsaPricingMini({ className, premium = false }: Props) {
  const { withAttribution } = useAttributionParams();

  // ── Premium variant — taller, homepage-aligned cards ──────────────────────
  if (premium) {
    const renderCard = (kind: "oneTime" | "annual") => {
      const highlight = kind === "annual";
      const price = highlight ? ESA_PRICE_LABELS.subscription : ESA_PRICE_LABELS.oneTime;
      const suffix = highlight ? ESA_PRICE_LABELS.subscriptionSuffix : ESA_PRICE_LABELS.oneTimeSuffix;

      return (
        <div
          className={`relative bg-white rounded-3xl flex flex-col overflow-hidden ${
            highlight
              ? "border-2 border-orange-500 shadow-[0_18px_44px_-18px_rgba(249,115,22,0.40)]"
              : "border border-gray-200 shadow-[0_10px_34px_-20px_rgba(15,23,42,0.20)]"
          }`}
        >
          {highlight && (
            <span className="absolute top-4 right-4 z-10 bg-white/95 text-orange-600 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full whitespace-nowrap shadow-sm">
              Best value
            </span>
          )}

          {/* Header band — orange on the highlight card for stronger hierarchy */}
          <div className={`px-7 sm:px-8 pt-7 sm:pt-8 pb-5 sm:pb-6 ${highlight ? "bg-gradient-to-br from-orange-500 to-orange-600" : "bg-white"}`}>
            <p className={`text-[11px] font-bold tracking-widest uppercase mb-2.5 ${highlight ? "text-orange-100" : "text-gray-500"}`}>
              {highlight ? "Annual" : "One-time"}
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-5xl sm:text-[56px] font-black leading-none ${highlight ? "text-white" : "text-gray-900"}`}>
                {price}
              </span>
              <span className={`text-sm ${highlight ? "text-orange-100" : "text-gray-400"}`}>{suffix}</span>
            </div>
            <p className={`text-[13px] leading-snug mt-2.5 ${highlight ? "text-orange-50" : "text-gray-500"}`}>
              {highlight
                ? "Renews automatically. Save $11 vs. one-time every year."
                : "Valid for 1 year. Pay once — no auto-renewal."}
            </p>
          </div>

          {/* Body — Klarna chip + richer feature list (drives the taller card) */}
          <div className="px-7 sm:px-8 pt-5 sm:pt-6 flex-1 flex flex-col">
            <div className="mb-5">
              <KlarnaChip />
            </div>
            <ul className="space-y-3 sm:space-y-3.5">
              {PREMIUM_FEATURES.map((f) => (
                <li key={f.text} className="flex items-start gap-2.5 text-[13.5px] sm:text-sm text-gray-700 leading-snug">
                  <i className={`${f.icon} text-orange-500 text-base mt-0.5 flex-shrink-0`}></i>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA — price-in-button + money-back microcopy (homepage pattern) */}
          <div className="px-7 sm:px-8 pt-6 pb-7 sm:pb-8">
            <Link
              to={withAttribution("/assessment")}
              className={`whitespace-nowrap w-full py-3.5 text-sm font-bold rounded-xl text-center block transition-colors cursor-pointer ${
                highlight
                  ? "bg-orange-500 text-white hover:bg-orange-600 shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
                  : "border-2 border-orange-500 text-orange-600 hover:bg-orange-50"
              }`}
            >
              Get Started — {price}{highlight ? suffix : ""}
            </Link>
            <p className="text-center text-[11px] text-gray-400 mt-2.5 flex items-center justify-center gap-1">
              <i className="ri-shield-check-line text-orange-400"></i>
              Money-back if not approved
            </p>
          </div>
        </div>
      );
    };

    return (
      <section className={`py-14 sm:py-20 ${className || "bg-white"}`}>
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9 sm:mb-12">
            <p className="text-orange-500 text-xs sm:text-sm font-semibold tracking-widest uppercase mb-2">
              ESA Letter Pricing
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight">
              Clear, upfront pricing — <span className="text-orange-500">from {ESA_PRICE_LABELS.startingFrom}</span>
            </h2>
            <p className="text-gray-500 text-sm mt-2.5 max-w-xl mx-auto leading-snug">
              Pay by card, or choose Klarna at checkout — subject to eligibility and{" "}
              <a
                href="https://www.klarna.com/us/terms-of-use/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-700"
              >
                Klarna payment terms
              </a>
              . A licensed provider reviews your assessment — approval is not guaranteed.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-7 max-w-3xl mx-auto items-stretch">
            {renderCard("oneTime")}
            {renderCard("annual")}
          </div>

          <p className="text-center text-[11px] text-gray-400 mt-7 max-w-md mx-auto leading-relaxed">
            PawTenant also supports{" "}
            <strong className="text-gray-600">PSD (Psychiatric Service Dog)</strong>{" "}
            evaluations for qualifying individuals where clinically appropriate. PSD documentation
            requires disability-related task training and is different from ESA documentation.
          </p>
        </div>
      </section>
    );
  }

  // ── Default compact variant — unchanged for all other consumers ───────────
  const features = COMPACT_FEATURES;

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
            Pay by card, or choose Klarna at checkout — subject to eligibility and{" "}
            <a
              href="https://www.klarna.com/us/terms-of-use/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-700"
            >
              Klarna payment terms
            </a>
            . A licensed provider reviews your assessment — approval is not guaranteed.
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
