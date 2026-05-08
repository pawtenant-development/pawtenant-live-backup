const CALLOUTS = [
  {
    num: 1,
    label: "Written by a licensed provider",
    desc: "Every letter is prepared and signed by a licensed mental health professional after your eligibility review.",
  },
  {
    num: 2,
    label: "Includes the details housing offices expect",
    desc: "Your letter includes provider credentials, license details, issue date, and the information needed for housing accommodation review.",
  },
  {
    num: 3,
    label: "Built for Fair Housing Act requests",
    desc: "The format is designed around ESA housing documentation standards, so it is easy for landlords and property managers to review.",
  },
  {
    num: 4,
    label: "Verification included",
    desc: "Each completed letter includes a unique verification ID so housing offices can confirm authenticity when needed.",
  },
  {
    num: 5,
    label: "Clear, professional, and ready to submit",
    desc: "No confusing paperwork or generic templates — just a clean letter you can send to your landlord, leasing office, or housing provider.",
  },
  {
    num: 6,
    label: "Valid for 12 months",
    desc: "Your ESA letter is dated and can be used for housing accommodation requests during its active coverage period.",
  },
];

export default function LetterPreviewSection() {
  return (
    <section className="py-16 md:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-5 md:px-6">

        {/* Header */}
        <div className="text-center mb-10 md:mb-14">
          <span className="inline-block px-4 py-1.5 bg-orange-50 text-orange-600 text-xs font-semibold rounded-full uppercase tracking-widest mb-3">
            What You Receive
          </span>
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">
            A Professional, <span className="text-orange-500">Landlord-Ready</span> ESA Letter
          </h2>
          <p className="text-gray-500 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
            Every letter is written and signed by a licensed mental health professional — formatted to meet Fair Housing Act requirements.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-start">

          {/* Letter Mockup — same SVG asset used in Step 3 checkout */}
          <div className="w-full lg:w-[480px] flex-shrink-0">
            <div className="rounded-2xl overflow-hidden shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] ring-1 ring-slate-200 bg-white relative">
              <img
                src="/assets/documents/esa-sample-letter.svg"
                alt="Sample PawTenant ESA letter showing verification ID, patient info, and licensed provider signature"
                className="w-full h-auto block"
              />
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-white/90 backdrop-blur ring-1 ring-slate-200 text-[9px] font-semibold tracking-[0.24em] text-slate-500 uppercase">
                Sample
              </div>
            </div>
          </div>

          {/* Right column — warmer, conversion-focused */}
          <div className="flex-1 space-y-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5">Why landlords take it seriously</p>
            {CALLOUTS.map((c) => (
              <div key={c.num} className="flex items-start gap-4 group">
                <div className="w-7 h-7 flex items-center justify-center rounded-full text-white text-xs font-extrabold flex-shrink-0 mt-0.5 bg-orange-500">
                  {c.num}
                </div>
                <div className="flex-1 border-b border-gray-100 pb-4">
                  <p className="text-sm font-bold text-gray-900 mb-1">{c.label}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{c.desc}</p>
                </div>
              </div>
            ))}

            {/* Bottom callout */}
            <div className="mt-6 bg-orange-50 border border-orange-100 rounded-xl px-5 py-4 flex items-start gap-3">
              <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0">
                <i className="ri-shield-check-fill text-orange-500 text-base"></i>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 mb-1">Made for real housing conversations</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Whether your apartment is requesting documentation, your lease renewal is coming up, or your pet has been questioned by management, your PawTenant letter is prepared to look professional, clear, and easy to verify.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
