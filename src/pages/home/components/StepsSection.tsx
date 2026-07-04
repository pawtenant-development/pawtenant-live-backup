import { useAttributionParams } from "@/hooks/useAttributionParams";

/*
 * 2026-07-04 compact-steps pass.
 *
 * Replaced the three heavy "artifact mockup" cards (assessment-question
 * mockup, provider-review mockup, embedded sample-letter image) with a clean,
 * icon-based 3-step section. Goal: shorter vertical height, easier to scan on
 * one screen, more premium. Desktop = 3-up cards on a soft connector line;
 * mobile = stacked cards with a chevron connector.
 *
 * H2 wording + section ID #how-it-works preserved (HeroSection deep-links to
 * this anchor). Compliance-safe copy: "reviewed by a licensed provider",
 * "if approved", "refund if you don't qualify" — no guaranteed-approval,
 * government-approved, or registry claims.
 */

const STEPS = [
  {
    icon: "ri-survey-line",
    title: "Complete the Assessment",
    desc: "Quick, secure questions about your needs and your animal — about 5 minutes, all online.",
  },
  {
    icon: "ri-shield-check-line",
    title: "Licensed Provider Review",
    desc: "A licensed provider reviews your information for eligibility in your state.",
  },
  {
    icon: "ri-file-download-line",
    title: "Receive Your Letter",
    desc: "If approved, your PDF letter is delivered online with landlord-ready verification details.",
  },
];

export default function StepsSection() {
  const { withAttribution } = useAttributionParams();

  return (
    <section id="how-it-works" className="py-12 sm:py-16 bg-[#f8f7f4]">
      <div className="max-w-5xl mx-auto px-5 sm:px-6">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-10">
          <p className="text-[#4A8472] text-[12px] sm:text-sm font-semibold tracking-widest uppercase mb-2">Simple Process</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight">
            Get Your <span className="text-orange-500">ESA Letter</span> in 3 Simple Steps
          </h2>
          <p className="text-gray-500 mt-2.5 max-w-lg mx-auto text-[13.5px] sm:text-sm leading-relaxed">
            A streamlined path from a quick assessment to a landlord-ready letter — no waiting rooms, no in-person visits.
          </p>
        </div>

        {/* Steps — compact icon cards. Desktop: 3-up on a soft connector line.
            Mobile: stacked with a chevron connector between cards. */}
        <div className="relative">
          <div
            aria-hidden
            className="hidden md:block absolute top-[92px] left-16 right-16 h-px bg-gradient-to-r from-[#4A8472]/0 via-[#4A8472]/30 to-[#4A8472]/0 pointer-events-none"
          />

          <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 relative">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative">
                <div className="relative z-10 h-full bg-white border border-gray-200 rounded-2xl px-6 py-7 text-center flex flex-col items-center shadow-[0_2px_8px_rgba(15,23,42,0.04)] hover:shadow-[0_6px_16px_rgba(15,23,42,0.07)] transition-shadow">
                  {/* Icon circle with step-number chip */}
                  <div className="relative mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-[#4A8472]/10 flex items-center justify-center">
                      <i className={`${step.icon} text-[#4A8472] text-2xl`}></i>
                    </div>
                    <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-orange-500 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-bold text-gray-900 mb-1.5">{step.title}</h3>
                  <p className="text-[13px] text-gray-500 leading-relaxed">{step.desc}</p>
                </div>

                {/* Mobile-only chevron connector under each card except the last */}
                {i < STEPS.length - 1 && (
                  <div aria-hidden className="md:hidden flex items-center justify-center mt-2 mb-1 text-[#4A8472]">
                    <i className="ri-arrow-down-s-line text-2xl leading-none -my-2"></i>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>

        {/* CTA + trust note */}
        <div className="text-center mt-8 sm:mt-10">
          <a
            href={withAttribution("/assessment")}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 sm:px-8 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.30)] sm:shadow-none"
          >
            Start Your ESA Letter Online
            <i className="ri-arrow-right-line"></i>
          </a>
          <p className="text-[12px] text-gray-500 mt-3">
            ≈ 5 minutes · Reviewed by a licensed provider · 100% refund if you don&apos;t qualify.
          </p>
        </div>
      </div>
    </section>
  );
}
