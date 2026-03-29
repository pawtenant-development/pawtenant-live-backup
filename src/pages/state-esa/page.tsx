import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { getStateBySlug } from "../../mocks/states";

const whyPawtenant = [
  { title: "Experienced Professionals You Can Trust", desc: "Our licensed team knows state and has years of experience providing ESA letters that meet all legal standards.", icon: "ri-shield-check-line" },
  { title: "A Support Team That Cares", desc: "We are here to help you every step of the way from setting up your appointment to making sure your ESA letter is legally valid.", icon: "ri-heart-line" },
  { title: "Available Across the State", desc: "No matter where you are in the state, we have licensed professionals ready to assist in your area.", icon: "ri-map-pin-line" },
  { title: "Honest and Lawful Process", desc: "All evaluations follow all legal rules. We only issue ESA letters after a proper mental health review — no shortcuts.", icon: "ri-scales-line" },
  { title: "Quick and Safe Delivery", desc: "Once your letter is approved, we will send it to you digitally. It is fast, secure, and ready to use right away.", icon: "ri-send-plane-line" },
];

export default function StateESAPage() {
  const { state: stateSlug } = useParams<{ state: string }>();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const stateData = getStateBySlug(stateSlug || "");

  useEffect(() => {
    if (!stateData) return;

    const title = `ESA Letter ${stateData.name} 2026 — Licensed LMHP, Same-Day Delivery | PawTenant`;
    const description = `Need an ESA letter in ${stateData.name}? PawTenant connects you with ${stateData.name}-licensed mental health professionals. Valid for housing across all of ${stateData.name}, HIPAA-secure, same-day delivery, 100% money-back guarantee. ${stateData.name} ESA housing rights explained.`;
    const canonical = `https://www.pawtenant.com/esa-letter/${stateData.slug}`;

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
    setMeta("keywords", `ESA letter ${stateData.name}, emotional support animal ${stateData.name}, ${stateData.name} ESA housing rights, ESA letter ${stateData.abbreviation}, ${stateData.abbreviation} ESA letter online, emotional support animal ${stateData.abbreviation}, ESA housing ${stateData.name} 2026, legitimate ESA letter ${stateData.name}, how to get ESA letter ${stateData.name}`);
    setLink("canonical", canonical);
    setMeta("og:title", title, true);
    setMeta("og:description", description, true);
    setMeta("og:url", canonical, true);
    setMeta("og:type", "website", true);
    setMeta("twitter:title", title, true);
    setMeta("twitter:description", description, true);

    // FAQPage + BreadcrumbList JSON-LD
    const existingSchema = document.getElementById("state-esa-schema");
    if (existingSchema) existingSchema.remove();

    const schema = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "FAQPage",
          "mainEntity": stateData.faqs.map((faq) => ({
            "@type": "Question",
            "name": faq.q,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": faq.a,
            },
          })),
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pawtenant.com" },
            { "@type": "ListItem", "position": 2, "name": "All States", "item": "https://www.pawtenant.com/explore-esa-letters-all-states" },
            { "@type": "ListItem", "position": 3, "name": `ESA Letter in ${stateData.name}`, "item": canonical },
          ],
        },
      ],
    };

    const script = document.createElement("script");
    script.id = "state-esa-schema";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);

    return () => {
      const schemaEl = document.getElementById("state-esa-schema");
      if (schemaEl) schemaEl.remove();
    };
  }, [stateData]);

  if (!stateData) {
    return (
      <main>
        <SharedNavbar />
        <div className="pt-40 pb-20 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">State Not Found</h1>
          <p className="text-gray-600 mb-8">We couldn't find information for this state.</p>
          <Link to="/explore-esa-letters-all-states" className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 cursor-pointer">
            View All States
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
            src={`https://readdy.ai/api/search-image?query=cozy%20home%20interior%20in%20$%7BstateData.name%7D%20warm%20living%20room%20with%20a%20happy%20dog%20sitting%20beside%20owner%20natural%20light%20calming%20atmosphere%20beige%20and%20warm%20tones%20ESA%20emotional%20support%20animal%20housing&width=1440&height=600&seq=state${stateData.abbreviation}01&orientation=landscape`}
            alt={`ESA Letter in ${stateData.name}`}
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/55 to-black/25"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Link to="/explore-esa-letters-all-states" className="text-white/70 hover:text-white text-sm transition-colors">
                All States
              </Link>
              <i className="ri-arrow-right-s-line text-white/50 text-xs"></i>
              <span className="text-white/90 text-sm">{stateData.name}</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
              About Emotional Support Animals in {stateData.name}
            </h1>
            <p className="text-white/85 text-base leading-relaxed mb-8">
              {stateData.introText}
            </p>
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-footprint-fill"></i>
              Get An ESA Letter Now
            </Link>
          </div>
        </div>
      </section>

      {/* Laws Summary */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-5">{stateData.name} ESA Laws</h2>
              <p className="text-gray-600 leading-relaxed mb-6">{stateData.lawsSummary}</p>
              <div className="bg-[#fdf6ee] rounded-xl p-6 mb-6">
                <h3 className="text-sm font-bold text-gray-900 mb-4">To Be Protected in {stateData.name}:</h3>
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
                to="/assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
              >
                <i className="ri-footprint-fill"></i>
                Get An ESA Letter Now
              </Link>
            </div>
            <div className="rounded-2xl overflow-hidden h-80">
              <img
                src={`https://readdy.ai/api/search-image?query=happy%20person%20with%20their%20dog%20relaxing%20at%20home%20in%20$%7BstateData.name%7D%20bright%20living%20room%20warm%20sunlight%20cozy%20atmosphere%20pet%20owner%20calm%20and%20peaceful%20modern%20home%20interior&width=700&height=450&seq=state${stateData.abbreviation}02&orientation=landscape`}
                alt={`ESA in ${stateData.name}`}
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Advantages */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="rounded-2xl overflow-hidden h-72">
              <img
                src={`https://readdy.ai/api/search-image?query=woman%20smiling%20with%20her%20cat%20on%20her%20lap%20in%20a%20bright%20cozy%20apartment%20looking%20relaxed%20and%20happy%20warm%20tones%20plants%20in%20background%20$%7BstateData.name%7D%20home%20emotional%20wellness&width=700&height=450&seq=state${stateData.abbreviation}03&orientation=landscape`}
                alt={`ESA advantages in ${stateData.name}`}
                className="w-full h-full object-cover object-top"
              />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-7">
                Advantages of Having an Emotional Support Animal for {stateData.name} Residents
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
                  to="/assessment"
                  className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
                >
                  <i className="ri-footprint-fill"></i>
                  Get An ESA Letter Now
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Pawtenant */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-8">Why PawTenant?</h2>
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
                  to="/assessment"
                  className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
                >
                  <i className="ri-footprint-fill"></i>
                  Get An ESA Letter Now
                </Link>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden h-80">
              <img
                src={`https://readdy.ai/api/search-image?query=telehealth%20consultation%20doctor%20on%20laptop%20screen%20patient%20at%20home%20with%20their%20dog%20nearby%20warm%20home%20setting%20online%20mental%20health%20appointment%20modern%20technology%20cozy%20and%20professional&width=700&height=500&seq=state${stateData.abbreviation}04&orientation=landscape`}
                alt="PawTenant telehealth consultation"
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
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Popular Questions</span>
            <h2 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h2>
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

      {/* CTA */}
      <section className="py-16 bg-white">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Book Your ESA Letter Consultation Today</h2>
          <p className="text-gray-500 mb-8">Feel confident with a trusted and reliable service</p>
          <Link
            to="/assessment"
            className="whitespace-nowrap inline-flex items-center gap-2 px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            <i className="ri-footprint-fill"></i>
            Get Your ESA Letter
          </Link>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
