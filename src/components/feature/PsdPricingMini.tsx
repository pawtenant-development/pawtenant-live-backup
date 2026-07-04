import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import { useSitePricing } from "@/hooks/useSitePricing";

/**
 * PsdPricingMini — compact, mobile-first PSD (Psychiatric Service Dog) letter
 * pricing cards for the PSD conversion / AEO pages.
 *
 * Mirrors the EsaPricingMini visual language but with PSD pricing and a CTA to
 * /psd-assessment (the PSD intake), not /assessment (ESA intake). Pricing
 * matches the current PSD offer so every surface stays consistent:
 *   One-time: $129 for 1 dog / $149 fixed total for 2–3 dogs.
 *   Annual:   $109/yr for 1 dog / $129/yr fixed total for 2–3 dogs.
 * Same benefits on both plans. Same-day PDF delivery is included/available —
 * NOT a separate paid priority tier. No Standard/Priority split.
 *
 * Compliance-safe wording only:
 *   - "Reviewed by a licensed provider" — no algorithmic/automatic approval.
 *   - "Refund if you don't qualify" — no approval / acceptance guarantee.
 *   - "Landlord documentation support" — NO airline / public-access promise.
 *   - PSD requires a qualifying disability and a task-trained psychiatric
 *     service dog; this component never registers, certifies, or trains a dog,
 *     and a letter alone does not create service-dog status.
 *
 * Pure presentational + Tailwind + remixicon. No business logic, no network.
 */

interface Props {
  /** Optional section bg override. Default: white. */
  className?: string;
}

// Shared PSD benefit rows. Same across one-time and annual; the annual plan
// adds a renewal-specific row. No Standard/Priority language, no combo — same-
// day PDF delivery is included/available, not a paid tier.
const PSD_BASE_FEATURES = [
  "Reviewed by a licensed provider (LMHP)",
  "PSD documentation if clinically appropriate",
  "Provider signature, license number & NPI",
  "Same-day PDF delivery available",
  "Valid for 12 months",
  "Landlord documentation support",
  "Public-access documentation support where applicable",
  "Secure online assessment",
];

const PLANS = [
  {
    name: "PSD Letter",
    speed: "One-time — from $129 for 1 dog",
    price: "$129",
    priceKey: "psd_standard",
    suffix: " for 1 dog",
    note: "$149 total for 2–3 dogs",
    annualPill: false,
    highlight: true,
    features: [...PSD_BASE_FEATURES, "Refund if you don't qualify"],
  },
  {
    name: "PSD Annual",
    speed: "Per year — renews automatically",
    price: "$109",
    priceKey: "psd_annual",
    suffix: "/year",
    note: "$129/year total for 2–3 dogs",
    annualPill: true,
    highlight: false,
    features: [
      ...PSD_BASE_FEATURES,
      "Annual renewal keeps your letter current",
      "Refund if you don't qualify",
    ],
  },
];

export default function PsdPricingMini({ className }: Props) {
  const { withAttribution } = useAttributionParams();
  // Admin-managed display prices (hydrates at runtime; falls back to the
  // hardcoded plan price string for prerender / offline safety).
  const { price: getPrice } = useSitePricing();

  return (
    <section className={`py-14 sm:py-20 ${className || "bg-white"}`}>
      <div className="max-w-5xl mx-auto px-5 sm:px-6">
        <div className="text-center mb-9 sm:mb-12">
          <p className="text-[#4A8472] text-xs sm:text-sm font-semibold tracking-widest uppercase mb-2">
            PSD Letter Pricing
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight">
            Clear, upfront pricing for a PSD letter
          </h2>
          <p className="text-gray-500 text-sm mt-2.5 max-w-xl mx-auto leading-snug">
            Both plans are reviewed by a licensed provider and include the same
            benefits. A psychiatric service dog letter requires a qualifying
            disability and a task-trained psychiatric service dog — approval is
            not automatic, and you&rsquo;re refunded if you don&rsquo;t qualify.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 items-stretch max-w-3xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white rounded-3xl p-6 sm:p-8 flex flex-col ${
                plan.highlight
                  ? "border-2 border-orange-400 shadow-[0_16px_44px_-18px_rgba(249,115,22,0.42)]"
                  : "border border-gray-200 shadow-[0_8px_30px_-18px_rgba(15,23,42,0.18)]"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full whitespace-nowrap shadow-sm">
                  Most Popular
                </span>
              )}
              <p className="text-[11px] font-bold tracking-widest uppercase text-gray-500 mb-1">
                {plan.name}
              </p>
              <p className="text-[12px] text-gray-400 mb-3">{plan.speed}</p>
              {plan.annualPill ? (
                <div className="flex flex-col gap-2 mb-5">
                  <span className="self-start inline-flex items-center gap-1.5 rounded-full bg-[#4A8472]/10 text-[#2f5d50] border border-[#4A8472]/25 px-3.5 py-1.5 text-sm font-extrabold">
                    <i className="ri-refresh-line text-[13px]"></i>
                    Annual from {getPrice(plan.priceKey, plan.price)}{plan.suffix}
                  </span>
                  <span className="self-start inline-flex items-center rounded-full bg-[#4A8472]/8 text-[#3F7061] border border-[#4A8472]/20 px-3 py-1 text-[12px] font-bold">
                    {plan.note}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="text-4xl sm:text-5xl font-black text-gray-900 leading-none">
                      {getPrice(plan.priceKey, plan.price)}
                    </span>
                    <span className="text-sm text-gray-400">{plan.suffix}</span>
                  </div>
                  <p className="text-[12px] text-gray-400 mb-5">{plan.note}</p>
                </>
              )}
              <ul className="space-y-2 mb-7 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-gray-700">
                    <i className="ri-checkbox-circle-fill text-[#4A8472] mt-0.5 flex-shrink-0"></i>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to={withAttribution("/psd-assessment")}
                className={`mt-auto whitespace-nowrap w-full py-3 text-sm font-bold rounded-xl text-center block transition-colors cursor-pointer ${
                  plan.highlight
                    ? "bg-orange-500 text-white hover:bg-orange-600 shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
                    : "border-2 border-[#4A8472] text-[#4A8472] hover:bg-[#4A8472]/5"
                }`}
              >
                Start PSD Assessment
              </Link>
            </div>
          ))}
        </div>

        {/* PSD Consultation ($79) — CTA intentionally DEFERRED for this LIVE
            release. The /psd-consultation route/page is not part of this
            release, so the "Book Consultation" link is omitted to avoid a
            production 404. Re-add this block with the consultation product
            launch (route + page + display pricing already seeded). */}

        <p className="text-center text-[11px] text-gray-400 mt-7 max-w-md mx-auto leading-relaxed">
          Looking for housing-only comfort support instead?{" "}
          <Link to="/esa-vs-psd-letter" className="text-[#4A8472] font-semibold hover:underline">
            Compare an ESA letter vs a PSD letter
          </Link>{" "}
          to see which fits your situation.
        </p>
      </div>
    </section>
  );
}
