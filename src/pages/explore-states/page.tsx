import { useState } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { Link } from "react-router-dom";
import { usStates } from "../../mocks/states";

const faqs = [
  { q: "What are the benefits of emotional support animals (ESA) for owners?", a: "An emotional support animal can put numerous beneficial effects of the mental health of people facing different mental or emotional health issues. However, you cannot attain these type of benefits from service dogs. These dogs are trained to perform any kind of task for the disabled, an ESA offers companionship and emotional support. Staying with an ESA can helps people minimize their anxiety, depression and loneliness because, essentially, an ESA is the same as a companion-constant stability and comfort. You can even do exercise with your ESA, and it is observed to increase relaxation. With help of it, you can improve your blood pressure, dopamine, and serotonin." },
  { q: "Does emotional support animals need to be registered?", a: "No — there is no official ESA registry in the United States. What matters is a valid ESA letter from a licensed mental health professional. Be cautious of websites selling 'ESA registration' as these have no legal standing." },
  { q: "Can my emotional support animal accompany me in public places?", a: "ESAs are not granted public access rights like service animals under the ADA. However, they are protected in housing under the FHA. Some businesses may voluntarily allow ESAs, but they are not required to do so." },
  { q: "What does an ESA letter enable me to do?", a: "A valid ESA letter allows you to live with your emotional support animal in housing that has a no-pet policy, waive pet deposits and fees, and request reasonable accommodations from your landlord under the Fair Housing Act." },
  { q: "How Fair Housing Act is applicable on emotional support animals (ESAs)?", a: "The FHA requires housing providers to make reasonable accommodations for people with disabilities, including allowing ESAs. This applies to most types of rental housing, regardless of no-pet policies." },
  { q: "What rules can be encountered while traveling through airlines with emotional support animals?", a: "Following recent changes to airline policies, most major airlines no longer allow ESAs in the cabin as untrained animals. Service animals (under the ADA) may still be permitted. Check with your specific airline for their current pet and ESA policies." },
  { q: "If I qualify, how I can get an emotional support animal?", a: "Start with a mental health evaluation from a licensed professional. If you qualify, you'll receive an ESA letter. You can then choose any domestic animal — most commonly dogs or cats — as your emotional support animal." },
  { q: "What sets PawTenant's ESA letters apart as legitimate?", a: "PawTenant's letters are issued by licensed mental health professionals, include all required documentation (NPI, license number, clinician signature), are compliant with the Fair Housing Act, and come with a 100% money-back guarantee." },
  { q: "Do I need renewal of my ESA letter?", a: "Yes — ESA letters are typically valid for one year. Annual renewal ensures your letter remains current and meets your landlord's documentation requirements." },
  { q: "Can I register multiple pets in one ESA letter?", a: "Yes — PawTenant offers ESA letters for up to 2 pets in a single letter for a slightly higher fee." },
];

export default function ExploreStatesPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredStates = usStates.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const cols = [
    filteredStates.slice(0, Math.ceil(filteredStates.length / 3)),
    filteredStates.slice(Math.ceil(filteredStates.length / 3), Math.ceil((filteredStates.length / 3) * 2)),
    filteredStates.slice(Math.ceil((filteredStates.length / 3) * 2)),
  ];

  return (
    <main>
      <title>ESA Letter by State 2026: Emotional Support Animal Laws All 50 States | PawTenant</title>
      <meta name="description" content="Find ESA letter requirements and emotional support animal laws for all 50 US states. PawTenant's licensed professionals serve every state with same-day delivery." />
      <meta name="keywords" content="ESA letter by state, emotional support animal laws by state, state ESA requirements, ESA housing rights, ESA letter all states" />
      <link rel="canonical" href="https://www.pawtenant.com/explore-esa-letters-all-states" />
      <meta property="og:title" content="ESA Letter by State 2026 | All 50 States | PawTenant" />
      <meta property="og:description" content="ESA laws and letter requirements for all 50 states. Find your state and get a legitimate ESA letter from PawTenant — nationwide coverage, same-day delivery." />
      <meta property="og:url" content="https://www.pawtenant.com/explore-esa-letters-all-states" />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="ESA Letter by State 2026 | All 50 States | PawTenant" />
      <meta name="twitter:description" content="Emotional support animal laws and ESA letter requirements for all 50 states. Same-day delivery, licensed professionals, money-back guarantee." />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          { "@type": "Question", "name": "What are the benefits of emotional support animals (ESA) for owners?", "acceptedAnswer": { "@type": "Answer", "text": "An emotional support animal can put numerous beneficial effects on the mental health of people facing different mental or emotional health issues. Staying with an ESA helps people minimize their anxiety, depression and loneliness. You can improve your blood pressure, dopamine, and serotonin." } },
          { "@type": "Question", "name": "Does an emotional support animal need to be registered?", "acceptedAnswer": { "@type": "Answer", "text": "No — there is no official ESA registry in the United States. What matters is a valid ESA letter from a licensed mental health professional. Be cautious of websites selling 'ESA registration' as these have no legal standing." } },
          { "@type": "Question", "name": "What does an ESA letter enable me to do?", "acceptedAnswer": { "@type": "Answer", "text": "A valid ESA letter allows you to live with your emotional support animal in housing that has a no-pet policy, waive pet deposits and fees, and request reasonable accommodations from your landlord under the Fair Housing Act." } },
          { "@type": "Question", "name": "How does the Fair Housing Act apply to emotional support animals?", "acceptedAnswer": { "@type": "Answer", "text": "The FHA requires housing providers to make reasonable accommodations for people with disabilities, including allowing ESAs. This applies to most types of rental housing, regardless of no-pet policies." } },
          { "@type": "Question", "name": "Do I need to renew my ESA letter?", "acceptedAnswer": { "@type": "Answer", "text": "Yes — ESA letters are typically valid for one year. Annual renewal ensures your letter remains current and meets your landlord's documentation requirements." } }
        ]
      }) }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-28 pb-20">
        <div className="absolute inset-0">
          <img
            src="https://readdy.ai/api/search-image?query=USA%20map%20background%20with%20warm%20golden%20and%20orange%20tones%20abstract%20artistic%20rendering%20showing%20states%20and%20borders%20soft%20glow%20effect%20patriotic%20warm%20colors%20beige%20and%20amber%20gradient&width=1440&height=600&seq=exstates01&orientation=landscape"
            alt="Explore ESA Letters by State"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/55 to-black/30"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-6 text-center">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-400 mb-3">
            State-by-State Coverage
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
            Explore ESA Letter In Your State
          </h1>
          <p className="text-white/85 text-lg leading-relaxed mb-8 max-w-3xl mx-auto">
            Get your ESA letter smoothly through PawTenant. Find your state below and get to know about the current laws and requirements to obtain a letter for your Pet. We are dedicated to offer finest customer service — our team strives with all their efforts at every step so that you can easily get your ESA.
          </p>
          <Link
            to="/assessment"
            className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-white text-orange-600 font-bold rounded-md hover:bg-orange-50 transition-colors cursor-pointer"
          >
            Get Your ESA Letter Today
          </Link>
        </div>
      </section>

      {/* States Grid */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Get An Emotional Support Animal Letter In Your State
            </h2>
            <div className="max-w-md mx-auto">
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                  <i className="ri-search-line text-gray-400 text-sm"></i>
                </div>
                <input
                  type="text"
                  placeholder="Search your state..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-400 transition-colors"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-1 mb-10">
            {cols.map((col, colIdx) => (
              <div key={colIdx} className="space-y-1">
                {col.map((state) => (
                  <Link
                    key={state.slug}
                    to={`/esa-letter/${state.slug}`}
                    className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-orange-50 transition-colors group cursor-pointer"
                  >
                    <div className="w-5 h-5 flex items-center justify-center">
                      <i className="ri-map-pin-2-fill text-orange-500 text-sm group-hover:scale-110 transition-transform"></i>
                    </div>
                    <span className="text-sm text-gray-700 group-hover:text-orange-600 transition-colors">
                      {state.name}
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
          <div className="text-center">
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

      {/* FAQ */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Popular Questions</span>
            <h2 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
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

      {/* Contacts */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Our Contacts</span>
            <h2 className="text-3xl font-bold text-gray-900">Contacts</h2>
            <p className="text-gray-500 text-sm mt-2">We'd love to hear from you! Whether you have a question, feedback, or need assistance, feel free to reach out to us.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { icon: "ri-phone-line", title: "Phone", value: "(409) 965-5885", href: "tel:+14099655885" },
              { icon: "ri-mail-line", title: "Email", value: "hello@pawtenant.com", href: "mailto:hello@pawtenant.com" },
              { icon: "ri-map-pin-line", title: "Location", value: "17 Parkman Place, 2122 United States", href: "#" },
              { icon: "ri-time-line", title: "Open Hours", value: "Mon – Fri: 7am – 6pm\nSat: 9am – 4pm", href: "#" },
            ].map((c) => (
              <div key={c.title} className="bg-[#fafafa] rounded-xl p-6 text-center">
                <div className="w-12 h-12 flex items-center justify-center bg-orange-50 rounded-full mx-auto mb-4">
                  <i className={`${c.icon} text-orange-500 text-xl`}></i>
                </div>
                <p className="font-bold text-gray-900 text-sm mb-1">{c.title}</p>
                <a href={c.href} className="text-gray-600 text-sm hover:text-orange-500 transition-colors whitespace-pre-line">
                  {c.value}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
