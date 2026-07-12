import { Link } from "react-router-dom";

/**
 * GuaranteeSection — CRO redesign 2026-07-11 (HOMEPAGE-CRO-REDESIGN-TEST-IMPLEMENT-001).
 *
 * Owner correction D: deep teal (not black/brown), shield-with-check trust
 * icon, accurate refund wording (refund on non-qualification only — no
 * guaranteed approval, no guaranteed landlord acceptance). Includes the single
 * Klarna eligibility note and the transparent-pricing link to /esa-letter-cost.
 */

const FONT_DISPLAY = { fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' };

export default function GuaranteeSection() {
  return (
    <section className="py-10 sm:py-14 bg-[#FDFBF7]">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        <div className="max-w-[880px] mx-auto rounded-2xl px-6 py-6 sm:px-8 sm:py-7 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5 bg-gradient-to-br from-[#15433C] to-[#1D5A50] text-white shadow-[0_2px_6px_rgba(21,67,60,0.15),0_20px_50px_-24px_rgba(21,67,60,0.55)]">
          {/* Shield-with-check trust icon */}
          <div className="w-12 h-12 rounded-xl bg-white/12 border border-white/15 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#6EE7B7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l7 3v5c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V6l7-3z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={FONT_DISPLAY}>
              100% Money-Back Guarantee
            </h2>
            <p className="text-white/80 text-[13.5px] sm:text-sm leading-relaxed">
              If a licensed provider determines you don&rsquo;t qualify, you&rsquo;re refunded in
              full — you don&rsquo;t have to ask, file anything, or make a case. Approval is never
              automatic, and that&rsquo;s exactly why our letters hold up.
            </p>
          </div>
        </div>

        <p className="max-w-[880px] mx-auto text-center text-[13px] text-[#6B6359] font-semibold mt-4">
          Klarna available at checkout — subject to eligibility ·{" "}
          <Link
            to="/esa-letter-cost"
            className="text-[#3F7061] font-extrabold underline hover:text-[#2f5d50]"
          >
            See our transparent pricing →
          </Link>
        </p>
      </div>
    </section>
  );
}
