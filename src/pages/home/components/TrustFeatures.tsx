const features = [
  {
    icon: "ri-user-star-line",
    color: "bg-orange-50 text-orange-500",
    cardBg: "bg-gray-50",
    title: "Licensed Professionals",
    desc: "Our network of licensed mental health professionals ensures you receive a legitimate, legally valid ESA letter.",
  },
  {
    icon: "ri-file-shield-2-line",
    color: "text-[#92400e]",
    cardBg: "bg-[#FFF7ED]",
    title: "Legitimate ESA Letters",
    desc: "Every letter meets federal and state housing requirements and is signed by a licensed clinician.",
  },
  {
    icon: "ri-flashlight-line",
    color: "bg-orange-50 text-orange-500",
    cardBg: "bg-gray-50",
    title: "Fast Turnaround",
    desc: "Receive your ESA letter within 24 hours of your assessment — often the same day.",
  },
  {
    icon: "ri-lock-password-line",
    color: "text-[#92400e]",
    cardBg: "bg-[#FFF7ED]",
    title: "100% Confidential",
    desc: "Your personal information and health details are protected under HIPAA regulations at all times.",
  },
  {
    icon: "ri-home-heart-line",
    color: "bg-orange-50 text-orange-500",
    cardBg: "bg-gray-50",
    title: "Housing Protection",
    desc: "Our ESA letters are fully compliant with the Fair Housing Act, protecting your right to live with your pet.",
  },
  {
    icon: "ri-verified-badge-line",
    color: "text-[#92400e]",
    cardBg: "bg-[#FFF7ED]",
    title: "Landlord Verification",
    desc: "Every finalized letter includes a Verification ID. Landlords can confirm authenticity online — your health details are never disclosed.",
    link: "/esa-letter-verification",
    linkLabel: "How it works",
  },
];

export default function TrustFeatures() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-orange-500 text-sm font-semibold tracking-widest uppercase mb-2">Why Choose Us</p>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Why Thousands Get Their{" "}
            <span className="text-orange-500">Legit ESA Letter</span> With Us
          </h2>
          <p className="text-gray-600 mt-3 max-w-xl mx-auto text-sm">
            We make getting a <strong>legitimate ESA letter online</strong> fast, affordable, and completely stress-free — from licensed professionals you can trust.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className={`${f.cardBg} rounded-xl p-6 hover:shadow-sm transition-shadow border border-gray-100`}
            >
              <div className={`w-11 h-11 flex items-center justify-center rounded-lg mb-4 ${f.cardBg === "bg-[#FFF7ED]" ? "bg-orange-100" : "bg-orange-100"} ${f.color}`}>
                <i className={`${f.icon} text-xl`}></i>
              </div>
              <h3 className="text-gray-900 font-bold text-base mb-2">{f.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
              {"link" in f && f.link && (
                <a
                  href={f.link}
                  className="whitespace-nowrap inline-flex items-center gap-1 mt-3 text-xs font-bold text-[#92400e] hover:underline cursor-pointer"
                >
                  {f.linkLabel}
                  <i className="ri-arrow-right-line text-xs"></i>
                </a>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        {/* Inline keyword reinforcement */}
        <p className="text-center text-gray-500 text-xs mt-8 max-w-lg mx-auto">
          Looking for a <strong className="text-gray-700">legit ESA letter online</strong>? PawTenant connects you with licensed clinicians who issue <strong className="text-gray-700">legitimate ESA letters</strong> accepted by landlords across all 50 states.
        </p>

        <div className="text-center mt-6">
          <a
            href="#pricing"
            className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            Get Your Legit ESA Letter Now
            <i className="ri-arrow-right-line"></i>
          </a>
        </div>
      </div>
    </section>
  );
}
