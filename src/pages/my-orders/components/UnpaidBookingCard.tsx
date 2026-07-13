// UnpaidBookingCard — the prominent "finish your booking" card shown at the top of
// an UNPAID lead's portal (UNPAID-CUSTOMER-PORTAL-AND-RESUME-CONTINUITY-001).
//
// The primary CTA label depends on saved progress (Choose Your Package / Complete
// Booking / Resume Checkout) and routes through the deterministic resume system
// (resumeHref → the assessment page resolves the exact unfinished step, preserving
// confirmation_id, product, package, plan, pets, discount, and attribution). It
// never hard-codes a generic checkout route.

import { Link } from "react-router-dom";
import { bookingCtaLabel, resumeHref, isPsdOrder, type BookingOrderLike } from "@/lib/bookingProgress";

export default function UnpaidBookingCard({
  order,
  onReviewAssessment,
}: {
  order: BookingOrderLike;
  onReviewAssessment?: () => void;
}) {
  const cta = bookingCtaLabel(order);
  const href = resumeHref(order);
  const product = isPsdOrder(order) ? "psychiatric service dog" : "emotional support animal";

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-b from-amber-50/80 to-white overflow-hidden">
      <div className="px-5 sm:px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 flex items-center justify-center bg-amber-100 rounded-xl flex-shrink-0">
            <i className="ri-bookmark-3-line text-amber-600 text-xl"></i>
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold text-[#1e3a5f] leading-tight">Your assessment is saved</h3>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">
              Complete your booking to begin your licensed provider review for your {product}. You can return here
              anytime using your verified account.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-2.5">
          <Link
            to={href}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm rounded-xl transition-colors cursor-pointer shadow-[0_8px_22px_-10px_rgba(249,115,22,0.5)]"
          >
            <i className="ri-arrow-right-circle-line"></i>{cta}
          </Link>
          {onReviewAssessment && (
            <button
              type="button"
              onClick={onReviewAssessment}
              className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-3 text-[#1e3a5f] font-semibold text-sm rounded-xl border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] transition-colors cursor-pointer"
            >
              <i className="ri-file-list-3-line"></i>Review My Assessment
            </button>
          )}
        </div>

        <p className="text-[11px] text-gray-400 mt-3 flex items-center gap-1.5">
          <i className="ri-shield-check-line text-emerald-500"></i>
          Secure &amp; private — nothing is charged until you complete checkout.
        </p>
      </div>
    </div>
  );
}
