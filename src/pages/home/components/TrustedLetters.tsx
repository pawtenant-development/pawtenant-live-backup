type BadgeTone = "orange" | "teal";

const sections: Array<{
  badge: string;
  tone: BadgeTone;
  icon: string;
  title: string;
  desc: string;
  bullets: string[];
  cta: string;
  img: string;
  reverse: boolean;
}> = [
  {
    badge: "Licensed Providers",
    tone: "orange",
    icon: "ri-user-heart-line",
    title: "Licensed Mental Health Professionals",
    desc: "Every ESA letter is reviewed and signed by a fully licensed mental health professional. Our network includes licensed therapists, psychologists, and clinical social workers credentialed in their state.",
    bullets: [
      "Licensed therapists, psychologists & clinical social workers",
      "Network of clinicians licensed in all 50 US states",
      "Clinical evaluation of your mental health needs",
      "Provider name, license number, and signature on every letter",
    ],
    cta: "Begin My Evaluation",
    img: "/assets/blog/fp-windowsill-dog.jpg",
    reverse: false,
  },
  {
    badge: "Housing Rights",
    tone: "teal",
    icon: "ri-home-smile-line",
    title: "Housing Protection Support",
    desc: "Our ESA letters are written to meet the documentation standards of the Fair Housing Act so housing providers can review reasonable accommodation requests confidently. We help you submit your letter calmly and clearly.",
    bullets: [
      "Fair Housing Act compliant documentation",
      "Eligible for reasonable accommodation in no-pet housing",
      "Pet deposits and pet rent typically waived for qualifying ESAs",
      "Plain-language guidance for landlord conversations",
    ],
    cta: "Learn About Your Housing Rights",
    img: "/assets/blog/fp-woman-jeans-living-room.jpg",
    reverse: true,
  },
  {
    badge: "Telehealth Process",
    tone: "orange",
    icon: "ri-smartphone-line",
    title: "Confidential Online Evaluation",
    desc: "The entire process happens privately online — no waiting rooms, no in-person visits. Complete your assessment from home and, if you qualify, your licensed provider issues your letter — typically within one business day.",
    bullets: [
      "100% online — complete from anywhere",
      "Quick 5-minute confidential assessment",
      "Same-day or next-day letter when clinically appropriate",
      "Digital + printable PDF, ready to share with your landlord",
    ],
    cta: "Begin My Evaluation",
    img: "/assets/blog/fp-woman-dog-couch.jpg",
    reverse: false,
  },
];

const TONE_STYLES: Record<BadgeTone, { wrap: string; iconBg: string; text: string }> = {
  orange: {
    wrap: "bg-orange-50 border-orange-200",
    iconBg: "bg-orange-500 text-white",
    text: "text-orange-700",
  },
  teal: {
    wrap: "bg-teal-50 border-teal-200",
    iconBg: "bg-teal-600 text-white",
    text: "text-teal-700",
  },
};

export default function TrustedLetters() {
  return (
    <section id="states" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-orange-500 text-sm font-semibold tracking-widest uppercase mb-2">Our Services</p>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Trusted <span className="text-orange-500">ESA Letters</span> You Can Rely On
          </h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto text-sm">
            We connect you with licensed professionals who provide legitimate ESA letters accepted by landlords and housing providers nationwide.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-20">
          {sections.map((s) => (
            <div
              key={s.title}
              className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch"
            >
              {/* Image — stretches to match content column on desktop */}
              <div className={`rounded-2xl overflow-hidden h-72 lg:h-auto lg:min-h-[420px] ${s.reverse ? "lg:order-2" : "lg:order-1"}`}>
                <img
                  src={s.img}
                  alt={s.title}
                  className="w-full h-full object-cover object-center"
                />
              </div>

              {/* Content */}
              <div className={`flex flex-col justify-center ${s.reverse ? "lg:order-1" : "lg:order-2"}`}>
                {(() => {
                  const t = TONE_STYLES[s.tone];
                  return (
                    <span
                      className={`self-start inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full border ${t.wrap} mb-5`}
                    >
                      <span
                        className={`w-6 h-6 flex items-center justify-center rounded-full ${t.iconBg} flex-shrink-0`}
                      >
                        <i className={`${s.icon} text-[13px]`}></i>
                      </span>
                      <span className={`text-[11px] font-bold tracking-[0.08em] uppercase ${t.text}`}>
                        {s.badge}
                      </span>
                    </span>
                  );
                })()}
                <h3 className="text-2xl font-extrabold text-gray-900 mb-4">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed mb-6">{s.desc}</p>
                <ul className="space-y-2.5 mb-8">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-sm text-gray-700">
                      <div className="w-5 h-5 flex items-center justify-center mt-0.5 flex-shrink-0">
                        <i className="ri-check-line text-orange-500 text-base font-bold"></i>
                      </div>
                      {b}
                    </li>
                  ))}
                </ul>
                <a
                  href="#pricing"
                  className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
                >
                  {s.cta}
                  <i className="ri-arrow-right-line"></i>
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
