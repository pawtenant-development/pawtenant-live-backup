// PsdUpsellCard — shown in /my-orders only for customers who have a paid ESA
// letter and NO PSD order. Cross-sells the (distinct) PSD documentation product.
// CUSTOMER-PORTAL-REPEAT-PURCHASE-UPSSELL-REVIEWS-001.
//
// Pricing is read from src/config/pricing.ts (never hardcoded). CTA starts a
// FRESH /psd-assessment — repeat purchase with the same email is now allowed
// server-side, so no order is reused or blocked.
//
// Compliance: PSD documentation is different from an ESA letter; a letter does
// NOT create service-dog status; no guaranteed approval; no "legit(imate)".

import { getPsdOneTimeTotal, getPsdAnnualTotal } from "../../../config/pricing";

export default function PsdUpsellCard() {
  const oneTime = getPsdOneTimeTotal(1);
  const annual = getPsdAnnualTotal(1);

  const benefits = [
    { icon: "ri-stethoscope-line", text: "Psychiatric-service-dog-focused provider review" },
    { icon: "ri-home-4-line", text: "Supports housing and travel contexts, where applicable" },
    { icon: "ri-file-shield-2-line", text: "Provider-reviewed documentation if you qualify" },
    { icon: "ri-checkbox-circle-line", text: "Clear, PSD-specific documentation" },
  ];

  return (
    <div className="rounded-2xl border border-[#dbe4f0] bg-white overflow-hidden">
      <div className="bg-gradient-to-r from-[#3b6ea5] to-[#1e3a5f] px-5 py-3 flex items-center gap-2">
        <div className="w-7 h-7 flex items-center justify-center bg-white/20 rounded-lg flex-shrink-0">
          <i className="ri-service-line text-white text-base"></i>
        </div>
        <p className="text-sm font-extrabold text-white">Need documentation for a psychiatric service dog?</p>
        <span className="ml-auto text-[10px] font-bold text-[#3b6ea5] bg-white px-2 py-0.5 rounded-full whitespace-nowrap">New</span>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-gray-700 leading-relaxed mb-3">
          PSD documentation is <strong>different from an ESA letter</strong>. For eligible customers with a
          psychiatric service dog, a licensed provider can review your situation and, if appropriate, prepare
          PSD-specific documentation.
        </p>
        <div className="grid sm:grid-cols-2 gap-2 mb-4">
          {benefits.map((b) => (
            <div key={b.text} className="flex items-start gap-2">
              <div className="w-6 h-6 flex items-center justify-center bg-[#e8f0f9] rounded-md flex-shrink-0 mt-0.5">
                <i className={`${b.icon} text-[#3b6ea5] text-sm`}></i>
              </div>
              <p className="text-xs text-gray-700 leading-snug">{b.text}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-gray-600">
            <span className="font-extrabold text-gray-900 text-base">${oneTime}</span> one-time
            <span className="text-gray-300 mx-1.5">·</span>
            <span className="font-bold text-[#1e3a5f]">${annual}/yr</span> annual
          </div>
          <a
            href="/psd-assessment"
            className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 bg-[#3b6ea5] text-white text-sm font-extrabold rounded-lg hover:bg-[#1e3a5f] transition-colors cursor-pointer"
          >
            <i className="ri-arrow-right-line"></i>Start PSD Assessment
          </a>
        </div>
        <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
          Eligibility is determined by a licensed provider. A letter does not by itself create service-dog status,
          and approval is never guaranteed.
        </p>
      </div>
    </div>
  );
}
