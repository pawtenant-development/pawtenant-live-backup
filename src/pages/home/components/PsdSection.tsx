import { Link } from "react-router-dom";
import { useAttributionParams } from "@/hooks/useAttributionParams";

/**
 * PsdSection — CRO redesign 2026-07-11 (HOMEPAGE-CRO-REDESIGN-TEST-IMPLEMENT-001).
 *
 * Dedicated Psychiatric Service Dog path (owner request). Secondary-style CTA
 * so the ESA path stays the single glowing primary. Compliance: task-trained
 * framing only — no vest/badge/certificate/registry imagery, no implication
 * that a letter creates service-dog status.
 *
 * Owner correction F: image = assets/veterans/man-on-porch-with-dog.jpg
 * (real photo, adult owner + attentive dog, calm genuine bond, everyday home
 * setting) with a new WebP variant for responsive delivery.
 */

const FONT_DISPLAY = { fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' };

const POINTS = [
  "Licensed provider-reviewed PSD documentation",
  "Housing accommodation documentation for your task-trained PSD",
  "Same-day PDF delivery available (most states)",
  "Valid for 12 months",
];

export default function PsdSection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section id="psd" className="py-14 sm:py-20 bg-[#FDFBF7]">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-8 lg:gap-14 items-center">
        {/* Photo — visible on all viewports. */}
        <div className="rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(35,31,26,0.05),0_10px_30px_-14px_rgba(35,31,26,0.14)] order-1">
          <picture>
            <source srcSet="/assets/veterans/man-on-porch-with-dog.webp" type="image/webp" />
            <img
              src="/assets/veterans/man-on-porch-with-dog.jpg"
              alt="Owner sitting on his porch calmly connecting with his attentive service dog"
              width={1300}
              height={864}
              loading="lazy"
              decoding="async"
              className="w-full h-56 sm:h-80 lg:h-[380px] object-cover"
            />
          </picture>
        </div>

        <div className="order-2">
          <p className="text-[#4A8472] text-xs sm:text-sm font-extrabold tracking-widest uppercase mb-2.5">
            Psychiatric Service Dogs
          </p>
          <h2
            className="text-[26px] sm:text-4xl font-semibold text-[#231F1A] leading-tight mb-4"
            style={FONT_DISPLAY}
          >
            Have a Task-Trained Service Dog? Get a PSD Letter
          </h2>
          <p className="text-[#6B6359] text-[15.5px] sm:text-base leading-relaxed max-w-xl">
            For qualifying individuals with a psychiatric service dog trained to perform specific
            tasks. A licensed clinician reviews your case and issues housing accommodation
            documentation — verifiable, just like our ESA letters.
          </p>

          <ul className="mt-5 mb-6 space-y-2.5">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-[#4A443C] leading-snug">
                <i className="ri-checkbox-circle-fill text-[#4A8472] mt-0.5 flex-shrink-0" aria-hidden></i>
                {p}
              </li>
            ))}
          </ul>

          <a
            href={withAttribution("/psd-assessment")}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white border-[1.5px] border-[#DCD2C0] text-[#231F1A] font-extrabold text-[15px] rounded-xl hover:border-[#B5AC9F] transition-colors cursor-pointer"
          >
            Check PSD Eligibility
          </a>
          <p className="text-[#6B6359] text-[13px] font-semibold mt-3 flex items-center gap-1.5">
            <i className="ri-checkbox-circle-fill text-[#4A8472]" aria-hidden></i>
            Refund if you don&rsquo;t qualify
          </p>

          <p className="mt-4 text-[13.5px] font-semibold text-[#6B6359]">
            <Link to="/how-to-get-psd-letter" className="text-[#3F7061] font-extrabold underline hover:text-[#2f5d50]">
              How to get a PSD letter →
            </Link>
            <span className="mx-2 text-[#B5AC9F]">·</span>
            <Link to="/esa-vs-psd-letter" className="text-[#3F7061] font-extrabold underline hover:text-[#2f5d50]">
              ESA letter vs PSD letter →
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
