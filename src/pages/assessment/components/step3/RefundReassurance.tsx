// Calm money-back protection card.
//
// Mounted in Step 3 left (trust) column. Reads to a single short paragraph
// + a link to the existing /no-risk-guarantee page. No countdown, no
// "guaranteed" superlatives, no urgency — just calm reassurance that the
// user is protected if they do not qualify.

import { Link } from "react-router-dom";

const BRAND_GREEN = "#1A5C4F";
const BRAND_GREEN_SOFT = "#E8F1EE";

export default function RefundReassurance() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_0_rgba(15,23,42,0.03),0_8px_28px_-14px_rgba(15,23,42,0.12)] overflow-hidden">
      <div className="px-5 py-5 flex items-start gap-3.5">
        <div
          className="w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0"
          style={{ backgroundColor: BRAND_GREEN_SOFT }}
        >
          <i className="ri-refund-2-line text-xl" style={{ color: BRAND_GREEN }}></i>
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-slate-900 leading-snug tracking-tight">
            Money-Back Protection
          </p>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            If you do not qualify for an ESA letter, your purchase is protected by our money-back policy. There&apos;s no pressure to decide today.
          </p>
          <Link
            to="/no-risk-guarantee"
            className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold hover:underline cursor-pointer"
            style={{ color: BRAND_GREEN }}
          >
            <i className="ri-external-link-line text-xs"></i>
            Read our money-back policy
          </Link>
        </div>
      </div>
    </div>
  );
}
