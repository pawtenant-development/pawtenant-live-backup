const TIMELINE = [
  {
    step: "01",
    icon: "ri-file-check-line",
    title: "Assessment Submitted",
    subtitle: "Right now",
    desc: "Your confidential health screening is securely submitted to our licensed network.",
    color: "text-orange-500",
    bgColor: "bg-orange-100",
    accent: "border-orange-200",
  },
  {
    step: "02",
    icon: "ri-stethoscope-line",
    title: "Licensed Provider Reviews",
    subtitle: "Within a few hours",
    desc: "A state-licensed mental health professional evaluates your assessment, reviews your case, and signs your ESA letter.",
    color: "text-amber-500",
    bgColor: "bg-amber-100",
    accent: "border-amber-200",
  },
  {
    step: "03",
    icon: "ri-mail-send-line",
    title: "ESA Letter Emailed to You",
    subtitle: "24 hrs or 2–3 business days",
    desc: "Your official, HIPAA-compliant ESA letter arrives in your inbox — ready to download, print, or forward directly to your landlord.",
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
    accent: "border-emerald-200",
  },
  {
    step: "04",
    icon: "ri-home-heart-line",
    title: "Present to Housing & Live Freely",
    subtitle: "Same day you receive it",
    desc: "Hand your letter to any landlord or housing provider. Under the Fair Housing Act, they must allow your emotional support animal — no pet deposits, no extra fees.",
    color: "text-orange-500",
    bgColor: "bg-orange-100",
    accent: "border-orange-200",
  },
];

export default function WhatHappensNext() {
  return (
    <div className="mt-14 mb-4">
      {/* Section header */}
      <div className="text-center mb-8">
        <p className="text-orange-500 text-xs font-bold tracking-widest uppercase mb-2">After You Submit</p>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-2">What Happens Next?</h2>
        <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
          Here&apos;s exactly what to expect — no guesswork, no surprises.
        </p>
      </div>

      {/* Timeline */}
      <div className="relative max-w-2xl mx-auto">
        {/* Vertical connector line */}
        <div className="absolute left-[2.45rem] top-12 bottom-12 w-0.5 bg-gradient-to-b from-orange-200 via-amber-200 to-emerald-200 hidden sm:block" />

        <div className="flex flex-col gap-5">
          {TIMELINE.map((item, idx) => (
            <div key={item.step} className={`relative flex gap-4 bg-white rounded-2xl border ${item.accent} p-5`}>
              {/* Step icon */}
              <div className="flex-shrink-0 flex flex-col items-center">
                <div className={`w-11 h-11 flex items-center justify-center rounded-xl ${item.bgColor} relative z-10`}>
                  <i className={`${item.icon} text-lg ${item.color}`}></i>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs font-bold ${item.color}`}>{item.step}</span>
                  <h3 className="text-sm font-extrabold text-gray-900">{item.title}</h3>
                  <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                    {item.subtitle}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
              </div>

              {/* Arrow for non-last items */}
              {idx < TIMELINE.length - 1 && (
                <div className="absolute -bottom-3.5 left-[2.1rem] w-5 h-5 flex items-center justify-center z-10 hidden sm:flex">
                  <div className="w-5 h-5 flex items-center justify-center bg-white rounded-full border border-gray-200">
                    <i className="ri-arrow-down-s-line text-gray-400 text-xs"></i>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom trust note */}
      <div className="text-center mt-6">
        <div className="inline-flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-4 py-2">
          <div className="w-4 h-4 flex items-center justify-center">
            <i className="ri-shield-check-line text-orange-400"></i>
          </div>
          Your letter is valid nationwide and legally enforceable under the Fair Housing Act
        </div>
      </div>
    </div>
  );
}
