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
    img: "https://readdy.ai/api/search-image?query=professional%20mental%20health%20therapist%20in%20modern%20office%2C%20confident%20licensed%20psychologist%20at%20desk%20with%20diploma%20certificates%20on%20wall%2C%20professional%20portrait%2C%20warm%20office%20lighting%2C%20business%20professional%20attire%2C%20trustworthy%20demeanor&width=600&height=450&seq=prof001&orientation=landscape",
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
    img: "https://readdy.ai/api/search-image?query=happy%20young%20couple%20with%20their%20dog%20standing%20in%20front%20of%20a%20beautiful%20apartment%20building%2C%20moving%20into%20new%20home%20with%20emotional%20support%20pet%2C%20sunny%20day%2C%20suburban%20neighborhood%2C%20welcoming%20community%2C%20lifestyle%20photography&width=600&height=450&seq=house001&orientation=landscape",
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
    img: "https://readdy.ai/api/search-image?query=person%20relaxing%20on%20couch%20with%20laptop%20and%20phone%20completing%20online%20form%2C%20casual%20home%20setting%20with%20a%20dog%20nearby%2C%20comfortable%20living%20room%2C%20soft%20natural%20window%20lighting%2C%20modern%20home%20decor%2C%20candid%20lifestyle%20photography&width=600&height=450&seq=online001&orientation=landscape",
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
              className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
            >
              {/* Image */}
              <div className={`rounded-2xl overflow-hidden h-72 ${s.reverse ? "lg:order-2" : "lg:order-1"}`}>
                <img
                  src={s.img}
                  alt={s.title}
                  className="w-full h-full object-cover object-top"
                />
              </div>

              {/* Content */}
              <div className={s.reverse ? "lg:order-1" : "lg:order-2"}>
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
