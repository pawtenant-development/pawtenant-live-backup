import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import { ESA_PRICE_LABELS } from "@/config/pricing";

const plans = [
  {
    name: "One-Time ESA Letter",
    price: ESA_PRICE_LABELS.oneTime,
    sub: "Delivered Within 24 Hours",
    popular: false,
    badge: null,
    highlight: false,
    isSubscription: false,
    features: [
      "Official ESA Letter from Licensed LMHP",
      "Fair Housing Act (FHA) Compliant",
      "Licensed Professional Signature & NPI",
      "PDF Delivery via Email",
      "Valid for 1 Year",
      "Landlord Verification Support",
    ],
  },
  {
    name: "Annual Subscription",
    price: ESA_PRICE_LABELS.subscription,
    sub: "Per Year — Auto-Renews",
    popular: true,
    badge: "Best Value",
    highlight: true,
    isSubscription: true,
    features: [
      "Official ESA Letter from Licensed LMHP",
      "Fair Housing Act (FHA) Compliant",
      "Licensed Professional Signature & NPI",
      "PDF Delivery via Email",
      "Valid for 1 Year — Renews Automatically",
      "Landlord Verification Support",
      "Save $11 vs. one-time every year",
    ],
  },
];

export default function PricingSection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section id="pricing" className="py-12 sm:py-20 bg-orange-50">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        {/* Header */}
        <div className="text-center mb-5 sm:mb-6">
          <p className="text-orange-500 text-xs sm:text-sm font-semibold tracking-widest uppercase mb-2">Transparent Pricing</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight">
            Simple <span className="text-orange-500">Pricing</span> — No Hidden Fees
          </h2>
          <p className="text-gray-600 mt-2.5 sm:mt-3 max-w-xl mx-auto text-[13px] sm:text-sm leading-snug">
            Choose the plan that fits. Every letter is legally valid and signed by a licensed mental health professional.
          </p>
        </div>

        {/* Reassurance strip — tighter on mobile so the pill row doesn't
            push the price cards further down the fold. */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mb-7 sm:mb-10">
          {[
            { icon: "ri-shield-check-fill", text: "Money-back if not approved" },
            { icon: "ri-award-fill", text: "Licensed professionals only" },
            { icon: "ri-lock-fill", text: "HIPAA secure" },
            { icon: "ri-timer-flash-fill", text: "24-hour delivery" },
          ].map((b) => (
            <div key={b.text} className="flex items-center gap-1.5 bg-white border border-orange-100 rounded-full px-3 py-1.5 sm:px-4 sm:py-2">
              <i className={`${b.icon} text-orange-500 text-sm`}></i>
              <span className="text-[11px] sm:text-xs font-semibold text-gray-700">{b.text}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 max-w-3xl mx-auto items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white rounded-2xl flex flex-col transition-all ${
                plan.highlight
                  ? "border-2 border-orange-500 md:-mt-4 md:pb-4"
                  : "border border-gray-200"
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className={`text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap ${plan.highlight ? "bg-orange-500" : "bg-gray-500"}`}>
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Card header — tighter padding on mobile */}
              <div className={`px-6 sm:px-8 pt-6 sm:pt-8 pb-4 sm:pb-5 ${plan.highlight ? "bg-orange-500 rounded-t-2xl" : ""}`}>
                <h3 className={`font-bold text-base mb-1 ${plan.highlight ? "text-white" : "text-gray-900"}`}>{plan.name}</h3>
                <p className={`text-[11px] sm:text-xs mb-2.5 sm:mb-3 ${plan.highlight ? "text-orange-100" : "text-gray-500"}`}>{plan.sub}</p>
                <div className="flex items-end gap-1">
                  <span className={`text-[34px] sm:text-4xl font-extrabold leading-none ${plan.highlight ? "text-white" : "text-gray-900"}`}>{plan.price}</span>
                  <span className={`text-[13px] sm:text-sm mb-1 sm:mb-1.5 ${plan.highlight ? "text-orange-100" : "text-gray-400"}`}>
                    {plan.isSubscription ? ESA_PRICE_LABELS.subscriptionSuffix : ESA_PRICE_LABELS.oneTimeSuffix}
                  </span>
                </div>
              </div>

              {/* Features — tighter padding + row rhythm on mobile so the
                  full feature set still fits without the card feeling tall.
                  All features stay visible at every breakpoint (legal /
                  commercial proof points). */}
              <div className="px-6 sm:px-8 py-4 sm:py-5 flex-1">
                {/* Klarna chip — matches the /esa-letter-housing in-card chip
                    pattern. Sits on the white features panel (not the orange
                    highlight header) so the pink stays legible on both
                    plain + highlighted cards. */}
                <div className="inline-flex items-center gap-2 mb-3 sm:mb-4 px-2.5 py-1 rounded-md bg-[#FFA8CD]/20 border border-[#FFA8CD]/60">
                  <span className="text-[10px] font-extrabold tracking-tight text-[#7A3F5F]">Klarna.</span>
                  <span className="text-[10px] text-slate-700">Available at checkout</span>
                </div>
                <ul className="space-y-2 sm:space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 sm:gap-2.5 text-[13.5px] sm:text-sm text-gray-700 leading-snug">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className={`ri-checkbox-circle-fill text-base ${plan.highlight ? "text-orange-500" : "text-orange-400"}`}></i>
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA — tighter bottom padding on mobile */}
              <div className="px-6 sm:px-8 pb-6 sm:pb-8">
                <Link
                  to={withAttribution("/assessment")}
                  className={`whitespace-nowrap w-full py-3 text-sm font-bold rounded-md transition-colors cursor-pointer text-center block ${
                    plan.highlight
                      ? "bg-orange-500 text-white hover:bg-orange-600"
                      : "border-2 border-orange-500 text-orange-500 hover:bg-orange-50"
                  }`}
                >
                  Get Started — {plan.price}{plan.isSubscription ? ESA_PRICE_LABELS.subscriptionSuffix : ""}
                </Link>
                {plan.highlight && (
                  <p className="text-center text-[11px] sm:text-xs text-gray-400 mt-2 flex items-center justify-center gap-1">
                    <i className="ri-shield-check-line text-orange-400"></i>
                    Money-back if not approved
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Klarna trust panel — mirrors the /esa-letter-housing panel but
            sized tighter for the home page since this section already has
            a trust badges row below. Mobile-first compact spacing. */}
        <div className="mt-6 sm:mt-8 max-w-xl mx-auto bg-gradient-to-br from-[#FFF5FA] to-[#FFE9F1] border border-[#FFA8CD] rounded-xl p-4 sm:p-5 flex items-start gap-3 shadow-[0_2px_12px_rgba(255,168,205,0.20)]">
          <span
            aria-hidden
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#FFA8CD] text-[#1A0A12] flex items-center justify-center flex-shrink-0 font-black text-base sm:text-lg leading-none tracking-tight shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
          >
            K.
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] sm:text-[14px] font-semibold text-slate-900 leading-snug mb-1">
              Pay with <span className="text-[#B8527F]">Klarna</span> at checkout.
            </div>
            <div className="text-[12px] sm:text-[12.5px] text-slate-600 leading-relaxed">
              Subject to eligibility and{" "}
              <a
                href="https://www.klarna.com/us/terms-of-use/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-slate-800"
              >
                Klarna payment terms
              </a>
              . Eligibility is determined by Klarna &mdash; approval is not guaranteed.
            </div>
          </div>
        </div>

        {/* Trust badges row — tightened mobile gap so the section closes
            with a calmer footprint. */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-7 sm:mt-10">
          <div className="inline-flex items-center gap-2 text-sm text-gray-600">
            <i className="ri-shield-check-line text-orange-500 text-lg"></i>
            <strong>100% Money-Back Guarantee</strong> — If you don&apos;t qualify, you pay nothing.
          </div>
          <span className="hidden sm:block text-gray-300">|</span>
          <a
            href="/esa-letter-verification"
            className="whitespace-nowrap inline-flex items-center gap-2 px-4 py-2 bg-[#FFF7ED] border border-orange-200 text-[#92400e] text-sm font-bold rounded-full hover:bg-orange-100 transition-colors cursor-pointer"
          >
            <i className="ri-qr-code-line text-base"></i>
            Landlord-Verifiable Letters — Unique QR &amp; Verification ID
          </a>
        </div>
      </div>
    </section>
  );
}
