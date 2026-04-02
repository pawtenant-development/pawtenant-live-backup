import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { getPSDStateBySlug } from "../../mocks/statesPSD";

const whyPawtenant = [
  { title: "Licensed Psychiatric Specialists", desc: "Our team includes licensed professionals with expertise in psychiatric disabilities — your evaluation is thorough, empathetic, and legally sound.", icon: "ri-mental-health-line" },
  { title: "Task Training Guidance", desc: "We help you understand what tasks your PSD needs to be trained for, ensuring your dog meets ADA and housing law requirements.", icon: "ri-guide-line" },
  { title: "Nationwide + All 50 States", desc: "PawTenant has licensed professionals in every state. No matter where you live, we have a qualified provider ready to evaluate your need.", icon: "ri-map-pin-line" },
  { title: "HIPAA-Secure Telehealth", desc: "All consultations are conducted via HIPAA-compliant telehealth sessions — your privacy and mental health information are fully protected.", icon: "ri-shield-check-line" },
  { title: "Same-Day Digital Delivery", desc: "Once approved, your PSD letter is delivered digitally within 24 hours — ready to use for housing or as documentation of your service dog.", icon: "ri-send-plane-line" },
];

const psdTasks = [
  { task: "Deep Pressure Therapy (DPT)", desc: "Applying body weight to reduce panic attacks and anxiety episodes." },
  { task: "Grounding Techniques", desc: "Interrupting dissociative episodes by providing physical contact." },
  { task: "Alerting to Anxiety", desc: "Recognizing early signs of a psychiatric episode and alerting the handler." },
  { task: "Medication Reminders", desc: "Reminding the handler to take medication at scheduled times." },
  { task: "Room Clearing", desc: "Checking a room for the handler to reduce hypervigilance in PTSD." },
  { task: "Barrier Work", desc: "Creating personal space to reduce anxiety in crowded environments." },
];

export default function StatePSDPage() {
  const { state: stateSlug } = useParams<{ state: string }>();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const stateData = getPSDStateBySlug(stateSlug || "");

  useEffect(() => {
    if (!stateData) return;

    const title = `PSD Letter ${stateData.name} 2026 — Psychiatric Service Dog Letter | PawTenant`;
    const description = `Need a PSD letter in ${stateData.name}? PawTenant connects you with ${stateData.name}-licensed mental health professionals for Psychiatric Service Dog documentation. ADA compliant, same-day delivery, 100% money-back guarantee. ${stateData.name} PSD rights explained.`;
    const canonical = `https://www.pawtenant.com/psd-letter/${stateData.slug}`;

    document.title = title;

    const setMeta = (name: string, content: string, prop = false) => {
      const attr = prop ? "property" : "name";
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const setLink = (rel: string, href: string) => {
      let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
    };

    setMeta("description", description);
    setMeta("keywords", `PSD letter ${stateData.name}, psychiatric service dog ${stateData.name}, ${stateData.name} PSD letter online, PSD letter ${stateData.abbreviation}, psychiatric service dog letter ${stateData.abbreviation}, service dog letter ${stateData.name} 2026, PSD documentation ${stateData.name}, how to get PSD letter ${stateData.name}`);
    setLink("canonical", canonical);
    setMeta("og:title", title, true);
    setMeta("og:description", description, true);
    setMeta("og:url", canonical, true);
    setMeta("og:type", "website", true);
    setMeta("twitter:title", title, true);
    setMeta("twitter:description", description, true);

    const existingSchema = document.getElementById("state-psd-schema");
    if (existingSchema) existingSchema.remove();

    const schema = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "FAQPage",
          "mainEntity": stateData.faqs.map((faq) => ({
            "@type": "Question",
            "name": faq.q,
            "acceptedAnswer": { "@type": "Answer", "text": faq.a },
          })),
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pawtenant.com" },
            { "@type": "ListItem", "position": 2, "name": "PSD Letters", "item": "https://www.pawtenant.com/how-to-get-psd-letter" },
            { "@type": "ListItem", "position": 3, "name": `PSD Letter in ${stateData.name}`, "item": canonical },
          ],
        },
        {
          "@type": "Service",
          "name": `PSD Letter in ${stateData.name}`,
          "description": description,
          "provider": { "@type": "Organization", "name": "PawTenant", "url": "https://www.pawtenant.com" },
          "areaServed": { "@type": "State", "name": stateData.name },
          "serviceType": "Psychiatric Service Dog Letter",
        },
      ],
    };

    const script = document.createElement("script");
    script.id = "state-psd-schema";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);

    return () => {
      const schemaEl = document.getElementById("state-psd-schema");
      if (schemaEl) schemaEl.remove();
    };
  }, [stateData]);

  if (!stateData) {
    return (
      <main>
        <SharedNavbar />
        <div className="pt-40 pb-20 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">State Not Found</h1>
          <p className="text-gray-600 mb-8">We couldn&apos;t find PSD information for this state.</p>
          <Link to="/how-to-get-psd-letter" className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 cursor-pointer">
            PSD Letter Guide
          </Link>
        </div>
        <SharedFooter />
      </main>
    );
  }

  return (
    <main>
      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-28 pb-20">
        <div className="absolute inset-0">
          <img
            src={`https://readdy.ai/api/search-image?query=person%20with%20psychiatric%20service%20dog%20in%20$%7BstateData.name%7D%20calm%20outdoor%20setting%20well-trained%20dog%20sitting%20beside%20owner%20natural%20light%20warm%20tones%20professional%20service%20animal%20therapy%20dog%20handler%20bond&width=1440&height=600&seq=psd${stateData.abbreviation}01&orientation=landscape`}
            alt={`PSD Letter in ${stateData.name} — Psychiatric Service Dog`}
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/25"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Link to="/how-to-get-psd-letter" className="text-white/70 hover:text-white text-sm transition-colors">
                PSD Letters
              </Link>
              <i className="ri-arrow-right-s-line text-white/50 text-xs"></i>
              <span className="text-white/90 text-sm">{stateData.name}</span>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <span className="inline-flex items-center gap-1.5 bg-orange-500/90 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                <i className="ri-shield-star-fill"></i> Psychiatric Service Dog
              </span>
              <span className="inline-flex items-center gap-1.5 bg-white/15 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                ADA Compliant
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
              PSD Letter in {stateData.name}
            </h1>
            <p className="text-white/85 text-base leading-relaxed mb-8">
              {stateData.introText}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/psd-assessment"
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                <i className="ri-mental-health-line"></i>
                Get My PSD Letter
              </Link>
              <Link
                to="/how-to-get-psd-letter"
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white/15 text-white font-semibold rounded-md hover:bg-white/25 transition-colors cursor-pointer border border-white/30"
              >
                Learn About PSDs
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ESA vs PSD Comparison Strip */}
      <section className="bg-orange-500 py-5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 text-center">
            {[
              { label: "Housing Rights", icon: "ri-home-heart-line" },
              { label: "ADA Public Access", icon: "ri-store-2-line" },
              { label: "Task-Trained", icon: "ri-award-line" },
              { label: "Same-Day Letter", icon: "ri-time-line" },
              { label: "100% Money-Back", icon: "ri-shield-check-line" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-white">
                <div className="w-5 h-5 flex items-center justify-center">
                  <i className={`${item.icon} text-white/90`}></i>
                </div>
                <span className="text-sm font-semibold">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Laws Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Legal Framework</span>
              <h2 className="text-3xl font-bold text-gray-900 mb-5">{stateData.name} PSD Laws & Protections</h2>
              <p className="text-gray-600 leading-relaxed mb-6">{stateData.lawsSummary}</p>
              <div className="bg-[#fdf6ee] rounded-xl p-6 mb-6">
                <h3 className="text-sm font-bold text-gray-900 mb-4">Your PSD Rights in {stateData.name}:</h3>
                <ul className="space-y-3">
                  {stateData.lawsBullets.map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-checkbox-circle-fill text-orange-500"></i>
                      </div>
                      <p className="text-gray-700 text-sm leading-relaxed">{b}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <Link
                to="/psd-assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
              >
                <i className="ri-mental-health-line"></i>
                Get My PSD Letter in {stateData.name}
              </Link>
            </div>
            <div className="rounded-2xl overflow-hidden h-80">
              <img
                src={`https://readdy.ai/api/search-image?query=professional%20handler%20with%20trained%20psychiatric%20service%20dog%20$%7BstateData.name%7D%20therapy%20dog%20in%20public%20space%20calm%20disciplined%20well-behaved%20service%20dog%20vest%20service%20animal%20rights%20housing&width=700&height=450&seq=psd${stateData.abbreviation}02&orientation=landscape`}
                alt={`Psychiatric Service Dog rights in ${stateData.name}`}
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* PSD Tasks Section */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">What PSDs Do</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Common Psychiatric Service Dog Tasks</h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">PSDs must be trained to perform specific tasks that directly mitigate a handler&apos;s psychiatric disability — this is what distinguishes them from ESAs.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {psdTasks.map((item) => (
              <div key={item.task} className="bg-white rounded-xl p-5 border border-gray-100">
                <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className="ri-mental-health-line text-orange-500"></i>
                </div>
                <h3 className="font-bold text-gray-900 text-sm mb-1.5">{item.task}</h3>
                <p className="text-gray-600 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Advantages */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="rounded-2xl overflow-hidden h-72">
              <img
                src={`https://readdy.ai/api/search-image?query=person%20with%20service%20dog%20sitting%20peacefully%20in%20park%20$%7BstateData.name%7D%20calm%20relaxed%20therapy%20dog%20handler%20outdoor%20natural%20light%20warm%20tones%20mental%20health%20support%20emotional%20wellbeing&width=700&height=450&seq=psd${stateData.abbreviation}03&orientation=landscape`}
                alt={`PSD advantages in ${stateData.name}`}
                className="w-full h-full object-cover object-top"
              />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Why It Matters</span>
              <h2 className="text-3xl font-bold text-gray-900 mb-7">
                Advantages of a Psychiatric Service Dog in {stateData.name}
              </h2>
              <div className="space-y-5">
                {stateData.advantages.map((adv) => (
                  <div key={adv.title} className="flex items-start gap-4">
                    <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0 mt-0.5">
                      <i className="ri-checkbox-circle-fill text-orange-500"></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm mb-1">{adv.title}</h3>
                      <p className="text-gray-600 text-sm leading-relaxed">{adv.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-7">
                <Link
                  to="/psd-assessment"
                  className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
                >
                  <i className="ri-mental-health-line"></i>
                  Start My PSD Assessment
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ESA vs PSD Comparison */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Know the Difference</span>
            <h2 className="text-3xl font-bold text-gray-900">PSD vs ESA in {stateData.name}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-orange-500 rounded-xl p-6 text-white">
              <div className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-lg mb-4">
                <i className="ri-mental-health-line text-white text-lg"></i>
              </div>
              <h3 className="font-bold text-lg mb-4">Psychiatric Service Dog (PSD)</h3>
              <ul className="space-y-2">
                {["Housing rights (FHA)", "ADA public access rights", "Must perform specific tasks", "Not classified as a pet", "Can go to most public places", "May have employment rights"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-white/90">
                    <i className="ri-check-line text-white text-xs flex-shrink-0"></i>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-4">
                <i className="ri-heart-line text-orange-500 text-lg"></i>
              </div>
              <h3 className="font-bold text-lg text-gray-900 mb-4">Emotional Support Animal (ESA)</h3>
              <ul className="space-y-2">
                {["Housing rights (FHA)", "No public access rights", "No task training required", "Not classified as a pet (housing only)", "Housing only — not in public", "No employment rights"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                    <i className="ri-check-line text-orange-400 text-xs flex-shrink-0"></i>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-5 pt-4 border-t border-gray-100">
                <Link to={`/esa-letter-${stateData.slug}`} className="text-orange-500 hover:text-orange-600 text-xs font-semibold cursor-pointer">
                  Looking for an ESA letter in {stateData.name}? &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why PawTenant */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-8">Why PawTenant for Your {stateData.name} PSD Letter?</h2>
              <div className="space-y-5">
                {whyPawtenant.map((item) => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
                      <i className={`${item.icon} text-orange-500`}></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm mb-1">{item.title}</h3>
                      <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-7">
                <Link
                  to="/psd-assessment"
                  className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
                >
                  <i className="ri-mental-health-line"></i>
                  Start My PSD Assessment
                </Link>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden h-80">
              <img
                src={`https://readdy.ai/api/search-image?query=telehealth%20doctor%20consultation%20on%20laptop%20screen%20licensed%20mental%20health%20professional%20patient%20at%20home%20with%20trained%20service%20dog%20nearby%20modern%20home%20office%20warm%20professional%20setting%20video%20call&width=700&height=500&seq=psd${stateData.abbreviation}04&orientation=landscape`}
                alt="PawTenant PSD telehealth consultation"
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3 block">Common Questions</span>
            <h2 className="text-3xl font-bold text-gray-900">PSD Letter FAQ — {stateData.name}</h2>
          </div>
          <div className="space-y-3">
            {stateData.faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className={`text-sm font-semibold ${openFaq === i ? "text-orange-500" : "text-gray-900"}`}>{faq.q}</span>
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 ml-4">
                    <i className={`${openFaq === i ? "ri-subtract-line" : "ri-add-line"} text-orange-500`}></i>
                  </div>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4">
                    <p className="text-gray-600 text-sm leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Related Links */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Related Resources for {stateData.name} Residents</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { to: `/esa-letter-${stateData.slug}`, label: `ESA Letter in ${stateData.name}`, icon: "ri-heart-line" },
              { to: "/how-to-get-psd-letter", label: "How to Get a PSD Letter", icon: "ri-guide-line" },
              { to: "/all-about-service-dogs", label: "Service Dogs Guide", icon: "ri-guide-line" },
              { to: "/resource-center", label: "Full ESA & PSD Resource Center", icon: "ri-book-open-line" },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex items-center gap-3 p-4 bg-[#fdf6ee] rounded-xl hover:bg-orange-50 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0">
                  <i className={`${link.icon} text-orange-500 text-sm`}></i>
                </div>
                <span className="text-sm font-semibold text-gray-800">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gray-900">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Get Your {stateData.name} PSD Letter Today</h2>
          <p className="text-gray-400 mb-8">Licensed professionals, same-day delivery, 100% money-back guarantee</p>
          <Link
            to="/psd-assessment"
            className="whitespace-nowrap inline-flex items-center gap-2 px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            <i className="ri-mental-health-line"></i>
            Start My PSD Assessment
          </Link>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
