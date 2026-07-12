import { Link } from "react-router-dom";

/**
 * LetterProofSection — CRO redesign, polish pass 2026-07-12
 * (HOMEPAGE-CRO-RESPONSIVE-TYPOGRAPHY-POLISH-001).
 *
 * The single verification/proof section: the canonical sample letter as the
 * clean visual focus (owner decision: NO annotation labels or leader lines),
 * plus the /verify band and the three real landlord objections.
 * The sample is the synthetic /images/checkout/esa-sample-letter.svg — a pure
 * VECTOR document (no embedded rasters, no PII), so it stays crisp at any
 * size and on any DPI.
 *
 * SEO: H2 preserved verbatim — "A Professional, Landlord-Ready ESA Letter".
 */

const FONT_DISPLAY = { fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' };

const OBJECTIONS = [
  {
    q: "My landlord says he doesn’t accept ESA letters.",
    a: (
      <>
        Under the <b className="text-[#3F7061]">Fair Housing Act</b>, landlords must consider
        reasonable accommodation requests — even in no-pet buildings.
      </>
    ),
  },
  {
    q: "How would they know it’s real?",
    a: (
      <>
        They scan the QR or enter the verification ID —{" "}
        <b className="text-[#3F7061]">instant confirmation</b>, any time, without contacting us.
      </>
    ),
  },
  {
    q: "Is the provider actually licensed?",
    a: (
      <>
        License number and NPI are printed on the letter and{" "}
        <b className="text-[#3F7061]">verifiable with the state licensing board</b>.
      </>
    ),
  },
];

export default function LetterProofSection() {
  return (
    <section className="py-14 sm:py-20 bg-[#F7F2E9]">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        {/* ── The letter — clean visual focus, no overlays or labels ────── */}
        <div>
          <div className="max-w-[420px] sm:max-w-[460px] lg:max-w-[500px] mx-auto bg-white rounded-2xl p-3.5 sm:p-4 shadow-[0_2px_6px_rgba(35,31,26,0.08),0_20px_50px_-20px_rgba(35,31,26,0.28)]">
            <img
              src="/images/checkout/esa-sample-letter.svg"
              alt="Sample PawTenant ESA letter showing provider license details, signature and verification ID"
              width={800}
              height={1035}
              loading="lazy"
              decoding="async"
              className="w-full rounded-md"
            />
          </div>
        </div>

        {/* ── Copy + verify band + objections ─────────────────────────── */}
        <div>
          <p className="text-[#4A8472] text-xs sm:text-sm font-extrabold tracking-widest uppercase mb-2.5">
            The Letter Itself
          </p>
          <h2
            className="text-[26px] sm:text-4xl font-semibold text-[#231F1A] leading-tight mb-4"
            style={FONT_DISPLAY}
          >
            A Professional, Landlord-Ready ESA Letter
          </h2>
          <p className="text-[#6B6359] text-[15.5px] sm:text-base leading-relaxed max-w-xl">
            Most ESA letters get questioned. Ours get verified. Every PawTenant letter carries the
            details landlords and property managers actually check — and a verification ID they can
            confirm themselves.
          </p>

          {/* Verify band */}
          <div className="mt-6 bg-[#EDF4F0] border border-[#D6E5DF] rounded-2xl px-5 py-4 flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#231F1A] text-white flex items-center justify-center flex-shrink-0">
              <i className="ri-qr-code-line text-xl" aria-hidden></i>
            </div>
            <div>
              <h3 className="text-[15px] font-extrabold text-[#3F7061] mb-0.5">
                Landlords verify in under a minute
              </h3>
              <p className="text-[13px] text-[#4A443C] leading-relaxed">
                They scan the QR or enter the letter ID at <b>pawtenant.com/verify</b>. No health
                information is ever shown.{" "}
                <Link
                  to="/esa-letter-verification"
                  className="text-[#3F7061] font-extrabold underline hover:text-[#2f5d50]"
                >
                  See how verification works →
                </Link>
              </p>
            </div>
          </div>

          {/* Landlord objections */}
          <div className="mt-6 space-y-3">
            {OBJECTIONS.map((o) => (
              <div key={o.q} className="bg-white border border-[#EAE3D7] rounded-xl px-4 sm:px-5 py-4 min-w-0">
                <p className="text-sm font-extrabold text-[#231F1A] mb-1">&ldquo;{o.q}&rdquo;</p>
                <p className="text-[13px] text-[#6B6359] leading-relaxed">{o.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
