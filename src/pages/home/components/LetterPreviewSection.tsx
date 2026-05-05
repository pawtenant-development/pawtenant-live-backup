const CALLOUTS = [
  { num: 1, label: "Provider Credentials", desc: "Full name, license type (LCSW/LMFT/LPC), NPI number, and state license number — verifiable by any landlord.", color: "bg-orange-500" },
  { num: 2, label: "Clinical Recommendation", desc: "Professionally worded recommendation language citing the Fair Housing Act and the patient's need for emotional support.", color: "bg-amber-500" },
  { num: 3, label: "Patient Information", desc: "Your full legal name and the specific animal(s) covered — exactly as required for housing accommodation requests.", color: "bg-teal-500" },
  { num: 4, label: "Issue & Expiry Date", desc: "Clearly dated letter valid for 12 months from issue — renewal reminders sent automatically.", color: "bg-rose-500" },
  { num: 5, label: "Provider Signature", desc: "Wet-style digital signature from your assigned licensed mental health professional.", color: "bg-violet-500" },
  { num: 6, label: "Verification ID", desc: "Unique QR code and verification ID so landlords can instantly confirm authenticity online.", color: "bg-sky-500" },
];

export default function LetterPreviewSection() {
  return (
    <section className="py-20 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-5 md:px-6">

        {/* Header */}
        <div className="text-center mb-12 md:mb-16">
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
                src="/images/checkout/esa-sample-letter.svg"
                alt="Sample PawTenant ESA letter showing verification ID, patient info, and licensed provider signature"
                className="w-full h-auto block"
              />
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-white/90 backdrop-blur ring-1 ring-slate-200 text-[9px] font-semibold tracking-[0.24em] text-slate-500 uppercase">
                Sample
              </div>
            </div>
          </div>

          {/* Callout Legend */}
          <div className="flex-1 space-y-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5">What each section means</p>
            {CALLOUTS.map((c) => (
              <div key={c.num} className="flex items-start gap-4 group">
                <div className={`w-7 h-7 flex items-center justify-center rounded-full text-white text-xs font-extrabold flex-shrink-0 mt-0.5 ${c.color}`}>
                  {c.num}
                </div>
                <div className="flex-1 border-b border-gray-100 pb-4">
                  <p className="text-sm font-bold text-gray-900 mb-1">{c.label}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{c.desc}</p>
                </div>
              </div>
            ))}

            {/* Trust note */}
            <div className="mt-6 bg-orange-50 border border-orange-100 rounded-xl px-5 py-4 flex items-start gap-3">
              <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0">
                <i className="ri-shield-check-fill text-orange-500 text-base"></i>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 mb-1">Accepted by housing providers nationwide</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Our letters are written to meet Fair Housing Act standards. Every letter includes the provider&apos;s NPI number and state license — the two things landlords and property managers look for.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
