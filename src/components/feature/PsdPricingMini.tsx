import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";

/**
 * PsdPricingMini — compact, mobile-first PSD (Psychiatric Service Dog) letter
 * pricing cards for the PSD conversion / AEO pages.
 *
 * Mirrors the EsaPricingMini visual language but with PSD pricing and a CTA to
 * /psd-assessment (the PSD intake), not /assessment (ESA intake). Pricing
 * matches the existing /how-to-get-psd-letter page so the two stay consistent:
 *   Standard $100 (2–3 business days) · Priority $120 (24h) · Annual $99/yr.
 *
 * Compliance-safe wording only:
 *   - "Licensed mental health professional review" — no algorithmic approval.
 *   - "Refund if you don't qualify" — no approval / acceptance guarantee.
 *   - "Landlord documentation support" — NO airline / public-access promise.
 *   - PSD requires a qualifying disability and trained psychiatric tasks; this
 *     component never registers, certifies, or trains a dog.
 *
 * Pure presentational + Tailwind + remixicon. No business logic, no network.
 */

interface Props {
  /** Optional section bg override. Default: white. */
  className?: string;
}

const PLANS = [
  {
    name: "Standard",
    speed: "2–3 business days",
    price: "$100",
    highlight: false,
    features: [
      "PSD letter from a licensed LMHP",
      "Provider signature, license number & NPI",
      "Secure PDF delivered by email",
      "Valid for 1 year",
      "Landlord documentation support",
    ],
  },
  {
    name: "Priority",
    speed: "Within 24 hours",
    price: "$120",
    highlight: true,
    features: [
      "PSD letter from a licensed LMHP",
      "Provider signature, license number & NPI",
      "Secure PDF delivered by email",
      "Valid for 1 year",
      "Landlord documentation support",
      "Same-day priority processing",
    ],
  },
  {
    name: "Annual",
    speed: "Per year — renews automatically",
    price: "$99",
    suffix: "/year",
    highlight: false,
    features: [
      "PSD letter from a licensed LMHP",
      "Provider signature, license number & NPI",
      "Secure PDF delivered by email",
      "Annual renewal so your letter stays recent",
      "Landlord documentation support",
    ],
  },
];

export default function PsdPricingMini({ className }: Props) {
  const { withAttribution } = useAttributionParams();

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
            Every plan includes a licensed mental health professional review. A
            psychiatric service dog letter requires a qualifying disability and a
            dog trained to perform specific tasks — approval is not guaranteed,
            and you&rsquo;re refunded if you don&rsquo;t qualify.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 items-stretch">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white rounded-3xl p-6 sm:p-8 flex flex-col ${
                plan.highlight
                  ? "border-2 border-[#4A8472] shadow-[0_14px_40px_-18px_rgba(74,132,114,0.45)]"
                  : "border border-gray-200 shadow-[0_8px_30px_-18px_rgba(15,23,42,0.18)]"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 right-5 bg-[#4A8472] text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full whitespace-nowrap shadow-sm">
                  Most popular
                </span>
              )}
              <p className="text-[11px] font-bold tracking-widest uppercase text-gray-500 mb-1">
                {plan.name}
              </p>
              <p className="text-[12px] text-gray-400 mb-3">{plan.speed}</p>
              <div className="flex items-baseline gap-1.5 mb-5">
                <span className="text-4xl sm:text-5xl font-black text-gray-900 leading-none">
                  {plan.price}
                </span>
                <span className="text-sm text-gray-400">{plan.suffix ?? "/ 1 dog"}</span>
              </div>
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
                    ? "bg-[#4A8472] text-white hover:bg-[#3F7061] shadow-[0_4px_12px_rgba(74,132,114,0.30)]"
                    : "border-2 border-[#4A8472] text-[#4A8472] hover:bg-[#4A8472]/5"
                }`}
              >
                Start PSD Assessment
              </Link>
            </div>
          ))}
        </div>

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
