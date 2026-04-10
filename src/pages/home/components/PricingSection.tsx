import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const plans = [
  {
    name: "Standard Delivery",
    price: "$100",
    sub: "2–3 Business Days",
    popular: false,
    badge: null,
    highlight: false,
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
    name: "Priority Delivery",
    price: "$115",
    sub: "Within 24 Hours",
    popular: true,
    badge: "Most Popular",
    highlight: true,
    features: [
      "Official ESA Letter from Licensed LMHP",
      "Fair Housing Act (FHA) Compliant",
      "Licensed Professional Signature & NPI",
      "PDF Delivery via Email",
      "Valid for 1 Year",
      "Landlord Verification Support",
      "Same-Day Priority Processing",
    ],
  },
  {
    name: "Annual Subscription",
    price: "$90",
    sub: "Per Year — Auto-Renews",
    popular: false,
    badge: "Best Value",
    highlight: false,
    features: [
      "Official ESA Letter from Licensed LMHP",
      "Fair Housing Act (FHA) Compliant",
      "Licensed Professional Signature & NPI",
      "PDF Delivery via Email",
      "Valid for 1 Year — Renews Automatically",
      "Landlord Verification Support",
    ],
  },
];

export default function PricingSection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section id="pricing" className="py-20 bg-orange-50">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-6">
          <p className="text-orange-500 text-sm font-semibold tracking-widest uppercase mb-2">Transparent Pricing</p>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Simple <span className="text-orange-500">Pricing</span> — No Hidden Fees
          </h2>
          <p className="text-gray-600 mt-3 max-w-xl mx-auto text-sm">
            Choose your delivery speed. All packages include a full, legally valid ESA letter from a licensed mental health professional.
          </p>
        </div>

        {/* Reassurance strip */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
          {[
            { icon: "ri-shield-check-fill", text: "Money-back if not approved" },
            { icon: "ri-award-fill", text: "Licensed professionals only" },
            { icon: "ri-lock-fill", text: "HIPAA secure" },
            { icon: "ri-timer-flash-fill", text: "Same-day available" },
          ].map((b) => (
            <div key={b.text} className="flex items-center gap-1.5 bg-white border border-orange-100 rounded-full px-4 py-2">
              <i className={`${b.icon} text-orange-500 text-sm`}></i>
              <span className="text-xs font-semibold text-gray-700">{b.text}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
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

              {/* Card header */}
              <div className={`px-8 pt-8 pb-5 ${plan.highlight ? "bg-orange-500 rounded-t-2xl" : ""}`}>
                <h3 className={`font-bold text-base mb-1 ${plan.highlight ? "text-white" : "text-gray-900"}`}>{plan.name}</h3>
                <p className={`text-xs mb-3 ${plan.highlight ? "text-orange-100" : "text-gray-500"}`}>{plan.sub}</p>
                <div className="flex items-end gap-1">
                  <span className={`text-4xl font-extrabold ${plan.highlight ? "text-white" : "text-gray-900"}`}>{plan.price}</span>
                  <span className={`text-sm mb-1.5 ${plan.highlight ? "text-orange-100" : "text-gray-400"}`}>
                    {plan.name === "Annual Subscription" ? "/year" : "one-time"}
                  </span>
                </div>
              </div>

              {/* Features */}
              <div className="px-8 py-5 flex-1">
                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className={`ri-checkbox-circle-fill text-base ${plan.highlight ? "text-orange-500" : "text-orange-400"}`}></i>
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA */}
              <div className="px-8 pb-8">
                <Link
                  to={withAttribution("/assessment")}
                  className={`whitespace-nowrap w-full py-3 text-sm font-bold rounded-md transition-colors cursor-pointer text-center block ${
                    plan.highlight
                      ? "bg-orange-500 text-white hover:bg-orange-600"
                      : "border-2 border-orange-500 text-orange-500 hover:bg-orange-50"
                  }`}
                >
                  Get Started — {plan.price}
                </Link>
                {plan.highlight && (
                  <p className="text-center text-xs text-gray-400 mt-2 flex items-center justify-center gap-1">
                    <i className="ri-shield-check-line text-orange-400"></i>
                    Money-back if not approved
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Trust badges row */}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-10">
          <div className="inline-flex items-center gap-2 text-sm text-gray-600">
            <i className="ri-shield-check-line text-orange-500 text-lg"></i>
            <strong>100% Money-Back Guarantee</strong> — If you don&apos;t qualify, you pay nothing.
          </div>
          <span className="hidden sm:block text-gray-300">|</span>
          <a
            href="/ESA-letter-verification"
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
