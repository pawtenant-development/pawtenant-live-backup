// GoogleReviewCard — optional review CTA for /my-orders.
// CUSTOMER-PORTAL-REPEAT-PURCHASE-UPSSELL-REVIEWS-001.
//
// Behavior: subtle before a letter is delivered ("share feedback"), stronger
// after ("share your experience"). Opens in a new tab. Never gates anything and
// never offers incentives. Uses configured review URLs only — the Google button
// appears only when REVIEW_LINKS.google is set (owner must provide it); Trustpilot
// (the app's configured review platform) is shown as the working option.

import { REVIEW_LINKS } from "../../../config/portalLinks";

export default function GoogleReviewCard({ delivered }: { delivered: boolean }) {
  const hasGoogle = typeof REVIEW_LINKS.google === "string" && REVIEW_LINKS.google.trim().length > 0;
  const hasTrustpilot = typeof REVIEW_LINKS.trustpilot === "string" && REVIEW_LINKS.trustpilot.trim().length > 0;
  if (!hasGoogle && !hasTrustpilot) return null;

  const heading = delivered ? "Share your PawTenant experience" : "Had a good experience so far?";
  const sub = delivered
    ? "If PawTenant helped, a quick review means a lot to our team and other pet owners."
    : "Your feedback helps us improve. No pressure — only if you'd like to share.";

  return (
    <div className="mt-6 bg-white rounded-xl border border-gray-200 px-5 py-4">
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
            <i className="ri-star-smile-line text-amber-500 text-base"></i>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-800">{heading}</p>
            <p className="text-xs text-gray-500 leading-snug">{sub}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasGoogle && (
            <a
              href={REVIEW_LINKS.google}
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-lg hover:border-[#3b6ea5] hover:text-[#3b6ea5] transition-colors cursor-pointer"
            >
              <i className="ri-google-fill text-[#4285F4]"></i>Review on Google
            </a>
          )}
          {hasTrustpilot && (
            <a
              href={REVIEW_LINKS.trustpilot}
              target="_blank"
              rel="noopener noreferrer"
              className={`whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                delivered
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-white border border-gray-200 text-gray-700 hover:border-emerald-300 hover:text-emerald-600"
              }`}
            >
              <i className="ri-star-line"></i>Review on Trustpilot
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
