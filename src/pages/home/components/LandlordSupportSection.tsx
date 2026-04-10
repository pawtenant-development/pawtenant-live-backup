const OBJECTIONS = [
  {
    icon: "ri-question-line",
    question: "\"I don't accept ESA letters.\"",
    answer: "Under the Fair Housing Act, housing providers are generally required to consider reasonable accommodation requests for emotional support animals — even in no-pet buildings. Our letters are written to meet these legal standards.",
    color: "border-orange-200 bg-orange-50",
    iconColor: "bg-orange-100 text-orange-600",
  },
  {
    icon: "ri-search-eye-line",
    question: "\"How do I know this letter is real?\"",
    answer: "Every PawTenant letter includes the provider's full name, state license number, NPI number, and a unique verification ID. Landlords can scan the QR code or visit our verification page to confirm authenticity instantly.",
    color: "border-teal-200 bg-teal-50",
    iconColor: "bg-teal-100 text-teal-600",
  },
  {
    icon: "ri-user-heart-line",
    question: "\"Is the provider actually licensed?\"",
    answer: "Yes. Every evaluation is conducted by a licensed mental health professional (LCSW, LMFT, LPC, or PhD) who is actively licensed in your state. License numbers are printed directly on the letter.",
    color: "border-amber-200 bg-amber-50",
    iconColor: "bg-amber-100 text-amber-700",
  },
  {
    icon: "ri-file-damage-line",
    question: "\"This letter looks like it came from the internet.\"",
    answer: "Our letters are formatted to professional clinical standards — the same format used by private therapists and mental health clinics. They include all the elements housing providers are trained to look for.",
    color: "border-violet-200 bg-violet-50",
    iconColor: "bg-violet-100 text-violet-600",
  },
];

const STEPS = [
  { icon: "ri-mail-send-line", title: "Submit the Letter", desc: "Send your ESA letter to your landlord or property manager via email or in person." },
  { icon: "ri-time-line", title: "Allow Review Time", desc: "Landlords typically have 10 business days to respond to a reasonable accommodation request." },
  { icon: "ri-customer-service-2-line", title: "We Support You", desc: "If your landlord has questions, our support team can provide additional documentation or guidance." },
];

export default function LandlordSupportSection() {
  return (
    <section className="py-20 md:py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-5 md:px-6">

        {/* Header */}
        <div className="text-center mb-12 md:mb-16">
          <span className="inline-block px-4 py-1.5 bg-orange-50 text-orange-600 text-xs font-semibold rounded-full uppercase tracking-widest mb-3">
            Landlord Questions
          </span>
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">
            What If My Landlord <span className="text-orange-500">Questions</span> the Letter?
          </h2>
          <p className="text-gray-500 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
            It&apos;s normal for landlords to ask questions. Here&apos;s how to handle the most common concerns — calmly and confidently.
          </p>
        </div>

        {/* Objection cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-14">
          {OBJECTIONS.map((o) => (
            <div key={o.question} className={`rounded-2xl border p-6 ${o.color}`}>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0 ${o.iconColor}`}>
                  <i className={`${o.icon} text-lg`}></i>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-2 italic">{o.question}</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{o.answer}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* How to submit strip */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 mb-10">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 text-center">How to Submit Your Letter</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => (
              <div key={s.title} className="flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 flex items-center justify-center bg-orange-50 border border-orange-200 rounded-xl">
                    <i className={`${s.icon} text-orange-500 text-lg`}></i>
                  </div>
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-orange-500 text-white text-[10px] font-extrabold rounded-full">
                    {i + 1}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-1">{s.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Verification CTA */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
          <div className="w-14 h-14 flex items-center justify-center bg-white/20 rounded-2xl flex-shrink-0">
            <i className="ri-qr-code-line text-white text-2xl"></i>
          </div>
          <div className="flex-1 text-center md:text-left">
            <p className="text-white font-extrabold text-lg mb-1">Instant Landlord Verification</p>
            <p className="text-white/80 text-sm leading-relaxed">
              Every PawTenant letter includes a unique verification ID and QR code. Landlords can scan it or visit our verification page to confirm the letter is genuine — no phone calls needed.
            </p>
          </div>
          <a
            href="/esa-letter-verification"
            className="whitespace-nowrap flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-white text-orange-600 font-bold text-sm rounded-xl hover:bg-orange-50 transition-colors cursor-pointer"
          >
            <i className="ri-shield-check-line"></i>
            See Verification Page
          </a>
        </div>

        {/* Disclaimer */}
        <p className="text-center text-xs text-gray-400 mt-6 max-w-2xl mx-auto leading-relaxed">
          <i className="ri-information-line mr-1"></i>
          PawTenant provides documentation from licensed mental health professionals. We do not provide legal advice. If you face housing discrimination, we recommend consulting a tenant rights attorney or contacting HUD.
        </p>

      </div>
    </section>
  );
}
