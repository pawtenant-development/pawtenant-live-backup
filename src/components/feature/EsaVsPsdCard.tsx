interface Props {
  /** Optional section bg override. Default: slate-50 calm. */
  className?: string;
}

/**
 * EsaVsPsdCard — quick ESA vs PSD comparison card for trust/education
 * pages. Establishes that PawTenant supports both ESA and PSD
 * documentation while making clear that PSD is a different, higher-
 * requirement service for qualifying individuals.
 *
 * Legally cautious language only:
 *   "where clinically appropriate"
 *   "for qualifying individuals"
 *   "may require disability-related task training"
 *   "PSD documentation is different from ESA documentation"
 *
 * Reads as ESA-led with PSD as a stronger parallel service, not as
 * interchangeable with ESA.
 */
export default function EsaVsPsdCard({ className }: Props) {
  return (
    <section className={`py-12 sm:py-16 ${className || "bg-[#f8fafc]"}`}>
      <div className="max-w-4xl mx-auto px-5 sm:px-6">
        <div className="text-center mb-6 sm:mb-8">
          <p className="text-[#4A8472] text-xs sm:text-sm font-semibold tracking-widest uppercase mb-2">
            Two different services
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight">
            ESA letter vs. Psychiatric Service Dog
          </h2>
          <p className="text-gray-600 text-sm mt-2.5 max-w-xl mx-auto leading-snug">
            We support both. They are not the same — qualification, training,
            and access rights all differ.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {/* ESA card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-9 h-9 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center flex-shrink-0">
                <i className="ri-home-heart-line text-lg"></i>
              </span>
              <h3 className="text-base sm:text-lg font-bold text-gray-900">
                Emotional Support Animal (ESA)
              </h3>
            </div>
            <ul className="space-y-2 text-[13px] sm:text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                <span>
                  <strong>Housing-focused.</strong> Protected under the Fair
                  Housing Act for reasonable accommodation in no-pet housing.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                <span>
                  No specialized task training required — comfort and
                  companionship are the role.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                <span>
                  Any domesticated animal (most commonly dogs and cats).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                <span>
                  Letter from a licensed mental health professional after a
                  clinical review.
                </span>
              </li>
            </ul>
          </div>

          {/* PSD card */}
          <div className="bg-white rounded-2xl border border-[#4A8472]/40 p-5 sm:p-6">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-9 h-9 rounded-lg bg-[#4A8472]/15 text-[#4A8472] flex items-center justify-center flex-shrink-0">
                <i className="ri-shield-star-line text-lg"></i>
              </span>
              <h3 className="text-base sm:text-lg font-bold text-gray-900">
                Psychiatric Service Dog (PSD)
              </h3>
            </div>
            <ul className="space-y-2 text-[13px] sm:text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-[#4A8472] mt-0.5 flex-shrink-0"></i>
                <span>
                  <strong>Broader public-access scope</strong> under the ADA in
                  many contexts, dependent on qualification and task training.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-[#4A8472] mt-0.5 flex-shrink-0"></i>
                <span>
                  May require <strong>disability-related task training</strong>
                  {" "}— the dog must perform specific tasks tied to a qualifying
                  psychiatric disability.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-[#4A8472] mt-0.5 flex-shrink-0"></i>
                <span>
                  For <strong>qualifying individuals</strong> — disability
                  qualification is part of the clinical evaluation.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-check-line text-[#4A8472] mt-0.5 flex-shrink-0"></i>
                <span>
                  PSD documentation is different from ESA documentation and is
                  issued after a separate clinical determination.
                </span>
              </li>
            </ul>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-500 mt-5 max-w-xl mx-auto leading-relaxed">
          PSD is positioned as a stronger service option for individuals with
          qualifying psychiatric disabilities. Eligibility, task training, and
          documentation requirements are determined by a licensed provider
          during clinical review. This page is general information, not legal
          advice.
        </p>
      </div>
    </section>
  );
}
