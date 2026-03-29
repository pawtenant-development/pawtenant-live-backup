import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";

const airlines = [
  { name: "Delta Airlines", logo: "ri-plane-fill", policy: "ESAs treated as pets. In-cabin small pets: $95/way. No free cabin ESA access.", psdFriendly: true },
  { name: "American Airlines", logo: "ri-plane-fill", policy: "ESAs travel as pets with standard fees. PSDs welcomed with advance notice.", psdFriendly: true },
  { name: "United Airlines", logo: "ri-plane-fill", policy: "ESAs no longer permitted as service animals. PSD accommodation available.", psdFriendly: true },
  { name: "Southwest Airlines", logo: "ri-plane-fill", policy: "ESAs treated as pets. Emotional support animals may be charged pet fees.", psdFriendly: true },
  { name: "Alaska Airlines", logo: "ri-plane-fill", policy: "ESAs accommodated as regular pets. PSDs with proper documentation accepted.", psdFriendly: true },
  { name: "JetBlue", logo: "ri-plane-fill", policy: "ESAs treated as standard pets with applicable fees. PSD documentation required.", psdFriendly: true },
  { name: "Frontier Airlines", logo: "ri-plane-fill", policy: "Small pets in-cabin for a fee. ESAs not given special status beyond pet policy.", psdFriendly: false },
  { name: "Spirit Airlines", logo: "ri-plane-fill", policy: "Standard pet policy applies to ESAs. No special ESA cabin privileges.", psdFriendly: false }
];

const faqs = [
  { q: "Can I fly with my ESA for free in 2026?", a: "No. Since the DOT rule change in January 2021, most major airlines no longer give ESAs free in-cabin access. ESAs are treated as regular pets and subject to pet fees, typically $95–$150 each way." },
  { q: "What is the difference between an ESA and a Psychiatric Service Dog for flying?", a: "A Psychiatric Service Dog (PSD) is trained to perform specific tasks related to a disability (like interrupting panic attacks), while an ESA provides comfort through companionship. PSDs retain in-cabin access rights under the ACAA; ESAs do not." },
  { q: "Can I get a PSD letter from PawTenant for airline travel?", a: "PawTenant can provide PSD documentation if our licensed professionals determine it is appropriate for your condition and your animal is task-trained. The tasks must be trained behaviors, not just comfort." },
  { q: "What documentation do airlines require for a Psychiatric Service Dog?", a: "Most airlines require DOT Service Animal Air Transportation Form signed by a licensed mental health or medical professional, confirming your PSD's training and your disability." },
  { q: "What if I need my ESA while traveling internationally?", a: "International travel rules vary by country. Some international carriers still allow ESAs with documentation. Research both the airline and destination country's laws carefully." }
];

export default function AirlinePetPolicyPage() {
  return (
    <main>
      <title>Airline ESA & Pet Policy 2026: Can You Fly with an ESA? | PawTenant</title>
      <meta name="description" content="Can you fly with an ESA in 2026? Updated airline ESA policies for Delta, United, American, Southwest & more. Learn about Psychiatric Service Dog (PSD) letter for air travel." />
      <meta name="keywords" content="fly with ESA 2026, airline ESA policy, emotional support animal flight, PSD letter airline, ESA air travel rules, fly with emotional support animal" />
      <link rel="canonical" href="https://www.pawtenant.com/airline-pet-policy" />
      <meta property="og:title" content="Airline ESA Pet Policy 2026 | Can You Fly with an ESA? | PawTenant" />
      <meta property="og:description" content="Updated airline policies for ESAs in 2026. Most airlines treat ESAs as pets. Learn about Psychiatric Service Dogs (PSDs) for in-cabin air travel access." />
      <meta property="og:url" content="https://www.pawtenant.com/airline-pet-policy" />
      <meta property="og:type" content="article" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Can You Fly with an ESA in 2026? Airline Policy Guide | PawTenant" />
      <meta name="twitter:description" content="Most airlines now treat ESAs as regular pets after the 2021 DOT rule change. Here's what you need to know about flying with your ESA or PSD in 2026." />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          { "@type": "Question", "name": "Can I fly with my ESA for free in 2026?", "acceptedAnswer": { "@type": "Answer", "text": "No. Since the DOT rule change in January 2021, most major airlines no longer give ESAs free in-cabin access. ESAs are treated as regular pets and subject to pet fees, typically $95–$150 each way." } },
          { "@type": "Question", "name": "What is the difference between an ESA and a Psychiatric Service Dog for flying?", "acceptedAnswer": { "@type": "Answer", "text": "A Psychiatric Service Dog (PSD) is trained to perform specific tasks related to a disability, while an ESA provides comfort through companionship. PSDs retain in-cabin access rights under the ACAA; ESAs do not." } },
          { "@type": "Question", "name": "What documentation do airlines require for a Psychiatric Service Dog?", "acceptedAnswer": { "@type": "Answer", "text": "Most airlines require a DOT Service Animal Air Transportation Form signed by a licensed mental health or medical professional, confirming your PSD's training and your disability." } },
          { "@type": "Question", "name": "Can I get a PSD letter from PawTenant for airline travel?", "acceptedAnswer": { "@type": "Answer", "text": "PawTenant can provide PSD documentation if our licensed professionals determine it is appropriate for your condition and your animal is task-trained. The tasks must be trained behaviors, not just comfort." } }
        ]
      }) }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="https://readdy.ai/api/search-image?query=modern%20airport%20terminal%20interior%20large%20windows%20airplane%20planes%20on%20tarmac%20sunny%20day%20travel%20aviation%20calm%20professional%20atmosphere&width=1440&height=600&seq=airlinehero&orientation=landscape"
            alt="Airport terminal for ESA airline policy"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900/85 via-gray-900/60 to-transparent"></div>
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 max-w-2xl">
          <span className="inline-block px-3 py-1 bg-orange-500/20 text-orange-300 text-xs font-semibold rounded-full uppercase tracking-widest mb-4">
            Flying with Your Pet
          </span>
          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            Airline Pet &amp; ESA Policy Guide 2026
          </h1>
          <p className="text-white/80 text-sm leading-relaxed mb-8 max-w-xl">
            Airline policies for Emotional Support Animals changed significantly in 2021. Here&apos;s everything you need to know about flying with your ESA or Psychiatric Service Dog in 2026.
          </p>
          <Link
            to="/assessment"
            className="whitespace-nowrap inline-block px-6 py-3 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            Get a PSD Letter
          </Link>
        </div>
      </section>

      {/* Key Change Alert */}
      <section className="py-10 bg-amber-50 border-y border-amber-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
              <i className="ri-information-fill text-amber-500 text-2xl"></i>
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800 mb-1">Important Policy Change (2021 → 2026)</p>
              <p className="text-sm text-amber-700 leading-relaxed">
                In January 2021, the U.S. Department of Transportation updated its Air Carrier Access Act rules, allowing airlines to treat Emotional Support Animals as regular pets rather than service animals. This change remains in effect in 2026. Most major airlines now charge standard pet fees for ESAs. <strong>Psychiatric Service Dogs (PSDs)</strong> — which are task-trained — still have in-cabin access rights.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Airlines Grid */}
      <section className="py-14 md:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-5">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Major Airline ESA Policies</h2>
          <p className="text-gray-500 text-sm mb-8 max-w-xl">
            Current ESA and PSD policies for major U.S. carriers. Always verify directly with your airline before travel, as policies can change.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {airlines.map((airline) => (
              <div key={airline.name} className="bg-[#fdf8f3] rounded-xl p-5 border border-orange-100">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 flex items-center justify-center bg-white rounded-lg border border-gray-100">
                      <i className={`${airline.logo} text-orange-500`}></i>
                    </div>
                    <p className="text-sm font-bold text-gray-900">{airline.name}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${airline.psdFriendly ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"}`}>
                    {airline.psdFriendly ? "PSD Friendly" : "PSD — check policy"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{airline.policy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PSD vs ESA Section */}
      <section className="py-14 md:py-16 bg-[#fdf8f3]">
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">ESA vs. Psychiatric Service Dog for Flying</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                Understanding the distinction is crucial if you need your animal while traveling. The key difference is <strong>task training</strong>.
              </p>
              <div className="space-y-4">
                {[
                  { label: "ESA", icon: "ri-heart-fill", color: "orange", items: ["Provides comfort through companionship", "No specific task training required", "Housing protections under FHA", "Treated as regular pet on airplanes in 2026", "Pet fees typically apply for air travel"] },
                  { label: "Psychiatric Service Dog", icon: "ri-service-fill", color: "green", items: ["Performs specific disability-related tasks", "Task-trained for psychiatric conditions", "Full public access rights under ADA", "In-cabin airline access rights under ACAA", "Free cabin access on qualifying flights"] }
                ].map((type) => (
                  <div key={type.label} className={`bg-white rounded-xl p-5 border ${type.color === "orange" ? "border-orange-100" : "border-green-100"}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-6 h-6 flex items-center justify-center`}>
                        <i className={`${type.icon} ${type.color === "orange" ? "text-orange-500" : "text-green-500"} text-base`}></i>
                      </div>
                      <h3 className="text-sm font-bold text-gray-900">{type.label}</h3>
                    </div>
                    <ul className="space-y-1.5">
                      {type.items.map((item, i) => (
                        <li key={i} className="text-xs text-gray-500 flex items-start gap-2">
                          <div className="w-3 h-3 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <i className={`ri-check-line ${type.color === "orange" ? "text-orange-400" : "text-green-400"} text-xs`}></i>
                          </div>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <img
                src="https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/27841c36-74a5-4e2f-b810-72504b6b7e2a_Airline-Pet--ESA-Policy-Guide-2026.jpg?v=958e516b05dce6aa12bc43afa9d02919"
                alt="Airline ESA and pet policy guide 2026 — flying with emotional support animals and psychiatric service dogs"
                className="w-full h-[440px] object-cover object-top rounded-2xl"
              />
              <div className="mt-5 bg-white rounded-xl p-5 border border-gray-100">
                <p className="text-sm font-semibold text-gray-900 mb-2">Need a PSD Letter for Flying?</p>
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                  If your animal is trained to perform specific tasks related to your mental health condition, you may qualify for a Psychiatric Service Dog letter.
                </p>
                <Link
                  to="/assessment"
                  className="whitespace-nowrap block text-center py-2.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
                >
                  Apply for PSD Letter
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <details key={i} className="bg-[#fdf8f3] rounded-xl border border-orange-100 group">
                <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                  <span className="text-sm font-semibold text-gray-800">{faq.q}</span>
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 ml-4">
                    <i className="ri-add-line text-orange-500 group-open:hidden"></i>
                    <i className="ri-subtract-line text-orange-500 hidden group-open:block"></i>
                  </div>
                </summary>
                <div className="px-5 pb-5">
                  <p className="text-sm text-gray-500 leading-relaxed">{faq.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
