const sections = [
  {
    badge: "Experts",
    badgeColor: "bg-orange-100 text-orange-600",
    icon: "ri-user-heart-line",
    title: "Licensed Mental Health Professionals",
    desc: "Every ESA letter we provide is created and signed by a fully licensed mental health professional. Our network includes licensed therapists, psychologists, and clinical social workers who are authorized to prescribe ESA letters in your state.",
    bullets: [
      "Licensed therapists, psychologists & clinical social workers",
      "Authorized to prescribe ESAs in all 50 states",
      "Thorough evaluation of your mental health needs",
      "Professional signatures meet all legal requirements",
    ],
    cta: "Get Your ESA Letter",
    img: "/assets/blog/fp-windowsill-dog.jpg",
    reverse: false,
  },
  {
    badge: "Housing Rights",
    badgeColor: "bg-teal-100 text-teal-600",
    icon: "ri-home-smile-line",
    title: "Housing Protection Support",
    desc: "Our ESA letters are fully compliant with the Fair Housing Act, giving you the legal right to live with your emotional support animal — even in buildings with no-pet policies. We help you navigate housing situations confidently.",
    bullets: [
      "Fair Housing Act compliant ESA letters",
      "No-pet housing accommodation rights",
      "Waive pet deposits and monthly pet fees",
      "Support when communicating with landlords",
    ],
    cta: "Protect Your Housing Rights",
    img: "/assets/blog/fp-woman-jeans-living-room.jpg",
    reverse: true,
  },
  {
    badge: "Easy Process",
    badgeColor: "bg-orange-100 text-orange-600",
    icon: "ri-smartphone-line",
    title: "Simple Online Approval",
    desc: "Our entire process happens online — no appointments, no waiting rooms, no hassle. Complete your assessment from the comfort of your home and receive your ESA letter directly to your inbox, often the same day.",
    bullets: [
      "100% online — complete from anywhere",
      "Quick 5-minute assessment form",
      "Same-day or next-day letter delivery",
      "Instant digital and printable PDF format",
    ],
    cta: "Start Your Application",
    img: "/assets/blog/fp-woman-dog-couch.jpg",
    reverse: false,
  },
];

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
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${s.badgeColor} mb-4`}>
                  <i className={`${s.icon}`}></i>
                  {s.badge}
                </span>
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
