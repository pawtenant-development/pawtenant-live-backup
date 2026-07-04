import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import { ESA_PRICE_LABELS } from "@/config/pricing";
import { useSitePricing } from "@/hooks/useSitePricing";

/**
 * PricingSection — homepage service pricing.
 *
 * ESA Housing Letter and PSD Letter are presented as two EQUAL 50/50 service
 * cards (owner request 2026-07-04): same width, same hierarchy, same CTA
 * strength, stacked on mobile and side-by-side on desktop. Neither service is
 * shown as the main product with the other as a small add-on.
 *
 * Display-only prices come from useSitePricing() (admin-managed) with the
 * config fallbacks for prerender/offline safety. This NEVER affects Stripe
 * checkout amounts. No Standard/Priority split, no combo service, no
 * "Most Popular" tier — same-day PDF delivery is included/available, not an
 * upsell tier.
 *
 * Compliance: letters are reviewed by a licensed provider, approval is not
 * automatic, refund if the customer does not qualify. A PSD requires a
 * task-trained psychiatric service dog; a letter alone does not create
 * service-dog status.
 */
export default function PricingSection() {
  const { withAttribution } = useAttributionParams();
  // Admin-managed display prices (hydrates at runtime; falls back to config).
  const { price: getPrice } = useSitePricing();

  const esaFrom = getPrice("esa_single_pet", ESA_PRICE_LABELS.oneTime);
  const esaAnnual = getPrice("esa_subscription_annual", ESA_PRICE_LABELS.subscription);
  const psdFrom = getPrice("psd_standard", "$129");
  const psdAnnual = getPrice("psd_annual", "$109");

  const services = [
    {
      key: "esa",
      label: "ESA Housing Letter",
      audience: "For qualifying individuals with emotional support animals.",
      from: esaFrom,
      annual: esaAnnual,
      accent: "#F97316",
      accentHover: "#EA580C",
      icon: "ri-home-heart-line",
      to: withAttribution("/assessment"),
      cta: "Start ESA Assessment",
      features: [
        "Housing-focused documentation",
        "Licensed provider-reviewed",
        "Same-day PDF delivery available",
        "Valid for 12 months",
        "Landlord verification support",
      ],
    },
    {
      key: "psd",
      label: "PSD Letter",
      audience: "For qualifying individuals with a task-trained psychiatric service dog.",
      from: psdFrom,
      annual: psdAnnual,
      accent: "#4A8472",
      accentHover: "#3F7061",
      icon: "ri-shield-star-line",
      to: withAttribution("/psd-assessment"),
      cta: "Start PSD Assessment",
      features: [
        "Licensed provider-reviewed PSD documentation",
        "Same-day PDF delivery available",
        "Valid for 12 months",
        "Landlord/public-access documentation support where applicable",
      ],
    },
  ];

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
            Two clear services — an ESA housing letter and a PSD letter. Every letter is reviewed by a licensed mental health professional. Approval is not automatic, and you&rsquo;re refunded if you don&rsquo;t qualify.
          </p>
        </div>

        {/* Reassurance strip */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mb-7 sm:mb-10">
          {[
            { icon: "ri-shield-check-fill", text: "Refund if you don't qualify" },
            { icon: "ri-award-fill", text: "Licensed professionals only" },
            { icon: "ri-lock-fill", text: "HIPAA secure" },
            { icon: "ri-timer-flash-fill", text: "Same-day delivery available" },
          ].map((b) => (
            <div key={b.text} className="flex items-center gap-1.5 bg-white border border-orange-100 rounded-full px-3 py-1.5 sm:px-4 sm:py-2">
              <i className={`${b.icon} text-orange-500 text-sm`}></i>
              <span className="text-[11px] sm:text-xs font-semibold text-gray-700">{b.text}</span>
            </div>
          ))}
        </div>

        {/* Two equal 50/50 service cards — stacked on mobile, side-by-side on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 max-w-4xl mx-auto items-stretch">
          {services.map((s) => (
            <div
              key={s.key}
              className="relative bg-white rounded-2xl border border-gray-200 flex flex-col shadow-[0_8px_30px_-18px_rgba(15,23,42,0.18)]"
            >
              {/* Card header */}
              <div className="px-6 sm:px-8 pt-7 sm:pt-8 pb-4 sm:pb-5 border-b border-gray-100">
                <div className="flex items-center gap-2.5 mb-3">
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${s.accent}1A` }}
                  >
                    <i className={`${s.icon} text-lg`} style={{ color: s.accent }}></i>
                  </span>
                  <h3 className="font-extrabold text-lg text-gray-900">{s.label}</h3>
                </div>
                <p className="text-[12.5px] sm:text-sm text-gray-500 leading-snug mb-4 min-h-[38px]">{s.audience}</p>
                <div className="flex items-end gap-1.5">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">From</span>
                  <span className="text-[34px] sm:text-4xl font-extrabold leading-none text-gray-900">{s.from}</span>
                  <span className="text-[12.5px] text-gray-400 mb-1">one-time</span>
                </div>
                <div className="mt-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4A8472]/10 text-[#2f5d50] border border-[#4A8472]/25 px-3 py-1 text-[12.5px] sm:text-[13px] font-bold">
                    <i className="ri-refresh-line text-[12px]"></i>
                    Annual from {s.annual}/year
                  </span>
                </div>
              </div>

              {/* Features */}
              <div className="px-6 sm:px-8 py-5 flex-1">
                <ul className="space-y-2 sm:space-y-2.5">
                  {s.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 sm:gap-2.5 text-[13.5px] sm:text-sm text-gray-700 leading-snug">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-checkbox-circle-fill text-base" style={{ color: s.accent }}></i>
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA */}
              <div className="px-6 sm:px-8 pb-6 sm:pb-8">
                <Link
                  to={s.to}
                  className="whitespace-nowrap w-full py-3 text-sm font-bold rounded-md transition-colors cursor-pointer text-center block text-white"
                  style={{ backgroundColor: s.accent }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = s.accentHover)}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = s.accent)}
                >
                  {s.cta}
                </Link>
                <p className="text-center text-[11px] sm:text-xs text-gray-400 mt-2 flex items-center justify-center gap-1">
                  <i className="ri-shield-check-line" style={{ color: s.accent }}></i>
                  Refund if you don&apos;t qualify
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Shared compliance note — applies equally to both services */}
        <p className="text-center text-[11px] text-gray-400 mt-5 max-w-2xl mx-auto leading-relaxed">
          A PSD requires a task-trained psychiatric service dog; a letter alone does not create service-dog status.{" "}
          <Link to="/esa-vs-psd-letter" className="text-[#3F7061] font-semibold hover:underline">
            Compare an ESA letter vs a PSD letter
          </Link>{" "}
          to see which fits your situation.
        </p>

        {/* Neutral payment-support strip — applies to both services, not attached
            to only one card. */}
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
              Available on ESA and PSD checkout, subject to eligibility and{" "}
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

        {/* Trust badges row */}
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
