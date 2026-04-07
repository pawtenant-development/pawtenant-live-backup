import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const plans = [
  {
    name: "Standard Delivery",
    price: "$100",
    sub: "2–3 Business Days",
    popular: false,
    color: "border-gray-200",
    btnColor: "border-2 border-orange-500 text-orange-500 hover:bg-orange-50",
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
    color: "border-orange-500",
    btnColor: "bg-orange-500 text-white hover:bg-orange-600",
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
    color: "border-gray-200",
    btnColor: "border-2 border-orange-500 text-orange-500 hover:bg-orange-50",
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
        <div className="text-center mb-14">
          <p className="text-orange-500 text-sm font-semibold tracking-widest uppercase mb-2">Transparent Pricing</p>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Simple <span className="text-orange-500">Pricing</span> — No Hidden Fees
          </h2>
          <p className="text-gray-600 mt-3 max-w-xl mx-auto text-sm">
            Choose your delivery speed. All packages include a full, legally valid ESA letter from a licensed mental health professional.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white rounded-2xl border-2 ${plan.color} p-8 flex flex-col`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-orange-500 text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-gray-900 font-bold text-base mb-1">{plan.name}</h3>
                <p className="text-gray-600 text-xs mb-3">{plan.sub}</p>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-extrabold text-gray-900">{plan.price}</span>
                  <span className="text-gray-400 text-sm mb-1.5">
                    {plan.name === "Annual Subscription" ? "/year" : "one-time"}
                  </span>
                </div>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className="ri-checkbox-circle-fill text-orange-500 text-base"></i>
                    </div>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                to={withAttribution("/assessment")}
                className={`whitespace-nowrap w-full py-3 text-sm font-bold rounded-md transition-colors cursor-pointer text-center block ${plan.btnColor}`}
              >
                Get Started — {plan.price}
              </Link>
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
