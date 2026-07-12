import { useAttributionParams } from "@/hooks/useAttributionParams";

/**
 * CTASection — CRO redesign 2026-07-11 (HOMEPAGE-CRO-REDESIGN-TEST-IMPLEMENT-001).
 * Final close band. Warm ink (replaces the brown gradient), one CTA verb
 * ("Check If You Qualify" — consistent with every other primary CTA on the
 * page), refund microtrust line, phone path for call-preferring visitors.
 * H2 wording preserved verbatim for SEO.
 */

const FONT_DISPLAY = { fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' };

export default function CTASection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section className="py-16 sm:py-24 bg-[#231F1A] text-center">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        <h2
          className="text-[26px] sm:text-4xl font-semibold text-white leading-tight mb-4"
          style={FONT_DISPLAY}
        >
          Get Your ESA Letter Online &amp; Keep Your Pet by Your Side
        </h2>
        <p className="text-white/65 text-[14.5px] sm:text-base max-w-xl mx-auto mb-8 leading-relaxed">
          One assessment. One licensed review. One letter your landlord can verify.
        </p>
        <a
          href={withAttribution("/assessment")}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-orange-500 text-white font-extrabold text-base rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-lg shadow-black/30"
        >
          Check If You Qualify
          <i className="ri-arrow-right-line" aria-hidden></i>
        </a>
        <p className="text-white/60 text-[13px] font-semibold mt-3 flex items-center justify-center gap-1.5">
          <i className="ri-checkbox-circle-fill text-emerald-300" aria-hidden></i>
          Full refund if you don&rsquo;t qualify
        </p>
        <p className="text-white/75 text-sm font-bold mt-7">
          Questions? Call{" "}
          <a href="tel:+14099655885" className="text-white underline hover:text-white/90">
            (409) 965-5885
          </a>{" "}
          · Mon–Fri 7am–6pm CT
        </p>
      </div>
    </section>
  );
}
