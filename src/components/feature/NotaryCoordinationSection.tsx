/**
 * NotaryCoordinationSection.tsx
 *
 * LIVE-PUBLIC-PAGES-CONVERSION-PRICING-VERIFICATION-HERO-PROVIDER-FIX-001
 *
 * INFORMATIONAL ONLY — owner-approved copy, verbatim.
 *
 * The operational notarization workflow does NOT exist yet: there is no notary
 * table, no add-on product, no checkout, no portal request flow, no provider
 * notification and no vendor booking automation anywhere in this repo or the
 * LIVE database (verified 2026-07-28 — zero matches for "notar" in src/,
 * supabase/ and docs/, and no matching table in project cvwbozlbbmrjxznknouq).
 * That build is queued separately as ORDER-NOTARY-SERVICE-WORKFLOW-001.
 *
 * Therefore this component MUST NOT:
 *   - create or link to a payment flow / checkout / Stripe price
 *   - write a database request or portal record
 *   - notify a provider or trigger vendor booking
 *   - state or imply that the workflow is automated, instant, same-day,
 *     included, free, or that an appointment is guaranteed
 *   - imply that every ESA letter needs notarization
 *
 * The CTA links ONLY to the existing support/contact experience.
 * The $99 figure is descriptive of the by-request service, not a live price
 * object — it is deliberately NOT read from src/config/pricing.ts, which is the
 * source of truth for CHARGED product prices only.
 */

import { Link } from "react-router-dom";

export interface NotaryCoordinationSectionProps {
  /** Section background override. */
  className?: string;
  /** "section" = full band (verification + landlord pages).
   *  "card"    = compact inline card for a brief contextual reference. */
  variant?: "section" | "card";
  id?: string;
}

const SUPPORT_HREF = "/contact-us";
const CTA_LABEL = "Contact Support to Request Notarization";

const BODY =
  "Most ESA letters do not require notarization. If your housing provider specifically requests it, PawTenant can help coordinate remote notarization of your provider-signed document for $99. The service is available by request and is subject to provider availability and identity-verification requirements. Your original letter remains preserved and unchanged.";

const SUPPORTING_NOTE =
  "Notarization is separate from Reasonable Accommodation documentation and does not guarantee landlord or housing-provider approval.";

export default function NotaryCoordinationSection({
  className,
  variant = "section",
  id = "notarized-copy",
}: NotaryCoordinationSectionProps) {
  if (variant === "card") {
    return (
      <div
        id={id}
        className={`rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 ${className || ""}`}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <i className="ri-quill-pen-line text-slate-600" aria-hidden="true"></i>
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-gray-900 mb-1.5">Need a notarized copy?</h3>
            <p className="text-[13px] text-gray-600 leading-relaxed">{BODY}</p>
            <Link
              to={SUPPORT_HREF}
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-orange-600 hover:underline cursor-pointer"
            >
              {CTA_LABEL}
              <i className="ri-arrow-right-line" aria-hidden="true"></i>
            </Link>
            <p className="text-[11px] text-gray-400 leading-relaxed mt-2.5">{SUPPORTING_NOTE}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section id={id} className={`py-12 sm:py-16 ${className || "bg-white"}`}>
      <div className="max-w-3xl mx-auto px-5 sm:px-6">
        <div className="rounded-2xl border border-gray-200 bg-[#FAFAF9] p-6 sm:p-9 text-center">
          <div className="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center mx-auto mb-4">
            <i className="ri-quill-pen-line text-slate-600 text-lg" aria-hidden="true"></i>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">Need a notarized copy?</h2>

          <p className="text-gray-600 text-[14px] sm:text-[15px] leading-relaxed max-w-2xl mx-auto">
            {BODY}
          </p>

          <Link
            to={SUPPORT_HREF}
            className="mt-6 inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-900 font-bold text-sm rounded-lg border border-gray-300 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
          >
            <i className="ri-customer-service-2-line" aria-hidden="true"></i>
            {CTA_LABEL}
          </Link>

          <p className="text-[12px] text-gray-500 leading-relaxed mt-5 max-w-xl mx-auto">
            {SUPPORTING_NOTE}
          </p>
        </div>
      </div>
    </section>
  );
}
