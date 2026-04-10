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

          {/* Letter Mockup */}
          <div className="w-full lg:w-[480px] flex-shrink-0">
            <div className="relative bg-white rounded-2xl border border-gray-200 overflow-hidden" style={{ fontFamily: "'Georgia', serif" }}>
              {/* Watermark strip */}
              <div className="bg-orange-500 h-2 w-full"></div>

              <div className="p-6 md:p-8 space-y-5">
                {/* Letterhead */}
                <div className="flex items-start justify-between border-b border-gray-100 pb-5">
                  <div>
                    <p className="text-orange-500 font-extrabold text-lg tracking-tight" style={{ fontFamily: "sans-serif" }}>PawTenant</p>
                    <p className="text-gray-400 text-xs mt-0.5" style={{ fontFamily: "sans-serif" }}>Licensed Mental Health Services</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-500 text-xs" style={{ fontFamily: "sans-serif" }}>Issue Date: Jan 15, 2025</p>
                    <p className="text-gray-500 text-xs" style={{ fontFamily: "sans-serif" }}>Valid Through: Jan 15, 2026</p>
                    {/* Callout 4 */}
                    <div className="absolute right-6 top-[72px]">
                      <CalloutDot num={4} color="bg-rose-500" />
                    </div>
                  </div>
                </div>

                {/* Provider block */}
                <div className="relative">
                  <p className="text-gray-800 text-sm font-semibold" style={{ fontFamily: "sans-serif" }}>Dr. Sarah Mitchell, LCSW</p>
                  <p className="text-gray-500 text-xs" style={{ fontFamily: "sans-serif" }}>License #: CA-LCSW-98234 &nbsp;|&nbsp; NPI: 1234567890</p>
                  <p className="text-gray-500 text-xs" style={{ fontFamily: "sans-serif" }}>State of California — Licensed Clinical Social Worker</p>
                  <div className="absolute -left-3 top-0">
                    <CalloutDot num={1} color="bg-orange-500" />
                  </div>
                </div>

                {/* Patient block */}
                <div className="relative bg-gray-50 rounded-lg px-4 py-3">
                  <p className="text-gray-500 text-xs mb-1" style={{ fontFamily: "sans-serif" }}>RE: Emotional Support Animal Accommodation</p>
                  <p className="text-gray-800 text-sm font-semibold" style={{ fontFamily: "sans-serif" }}>Patient: Jessica A. Thompson</p>
                  <p className="text-gray-500 text-xs" style={{ fontFamily: "sans-serif" }}>ESA: Biscuit — Golden Retriever</p>
                  <div className="absolute -right-3 top-3">
                    <CalloutDot num={3} color="bg-teal-500" />
                  </div>
                </div>

                {/* Body text */}
                <div className="relative">
                  <p className="text-gray-700 text-xs leading-relaxed">
                    To Whom It May Concern,
                  </p>
                  <p className="text-gray-700 text-xs leading-relaxed mt-2">
                    I am writing to confirm that <strong>Jessica A. Thompson</strong> is currently under my professional care and has been diagnosed with a condition that qualifies as a disability under the Fair Housing Act (42 U.S.C. § 3604). As part of her treatment plan, I have determined that an Emotional Support Animal provides therapeutic benefit essential to her mental health and well-being.
                  </p>
                  <p className="text-gray-700 text-xs leading-relaxed mt-2">
                    I respectfully request that reasonable accommodation be granted to allow her ESA, <strong>Biscuit</strong>, to reside with her in her housing unit pursuant to the Fair Housing Act.
                  </p>
                  <div className="absolute -left-3 top-8">
                    <CalloutDot num={2} color="bg-amber-500" />
                  </div>
                </div>

                {/* Signature */}
                <div className="relative border-t border-gray-100 pt-4">
                  <p className="text-gray-800 text-sm italic" style={{ fontFamily: "cursive", fontSize: "18px", color: "#1a3a5c" }}>Dr. Sarah Mitchell</p>
                  <p className="text-gray-500 text-xs mt-0.5" style={{ fontFamily: "sans-serif" }}>Licensed Clinical Social Worker, LCSW</p>
                  <div className="absolute -left-3 top-4">
                    <CalloutDot num={5} color="bg-violet-500" />
                  </div>
                </div>

                {/* Verification footer */}
                <div className="relative bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-3">
                  {/* QR placeholder */}
                  <div className="w-12 h-12 flex-shrink-0 bg-gray-200 rounded-lg flex items-center justify-center">
                    <i className="ri-qr-code-line text-gray-500 text-xl"></i>
                  </div>
                  <div>
                    <p className="text-gray-700 text-xs font-bold" style={{ fontFamily: "sans-serif" }}>Verification ID: PT-ESA-2025-98234</p>
                    <p className="text-gray-400 text-[10px]" style={{ fontFamily: "sans-serif" }}>Scan QR or visit pawtenant.com/verify to confirm authenticity</p>
                  </div>
                  <div className="absolute -right-3 top-3">
                    <CalloutDot num={6} color="bg-sky-500" />
                  </div>
                </div>
              </div>

              {/* Bottom accent */}
              <div className="bg-orange-500 h-1 w-full"></div>

              {/* Sample watermark */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-gray-200 text-5xl font-extrabold rotate-[-30deg] select-none opacity-40 tracking-widest">SAMPLE</p>
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

function CalloutDot({ num, color }: { num: number; color: string }) {
  return (
    <div className={`w-5 h-5 flex items-center justify-center rounded-full text-white text-[10px] font-extrabold ${color}`}>
      {num}
    </div>
  );
}
