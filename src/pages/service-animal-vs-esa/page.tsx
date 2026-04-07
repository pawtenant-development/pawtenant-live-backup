import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";

const comparisonRows = [
  { feature: "Training Required", service: "Extensive task-specific training", therapy: "Certification training for clinical settings", esa: "No training required" },
  { feature: "Legal Status", service: "ADA protection — public access", therapy: "No federal public access rights", esa: "FHA housing rights only" },
  { feature: "Access Rights", service: "All public places, stores, restaurants, airlines", therapy: "Only invited to clinical settings", esa: "Housing only (apartment, dorm)" },
  { feature: "Airline Travel", service: "In-cabin access under ACAA", therapy: "Treated as pet", esa: "Treated as pet since 2021" },
  { feature: "Documentation", service: "Task training verification", therapy: "Handler & animal certification", esa: "ESA letter from licensed LMHP" },
  { feature: "Primary Purpose", service: "Perform tasks for handler's disability", therapy: "Comfort multiple people in clinical settings", esa: "Emotional support for one individual" },
  { feature: "Cost", service: "High (professional training)", therapy: "Moderate (certification)", esa: "Affordable ($100 with PawTenant)" }
];

const faqs = [
  { q: "Is my ESA considered a service animal?", a: "No. ESAs are not classified as service animals under the ADA. They are classified separately under the Fair Housing Act. Service animals perform specific trained tasks; ESAs provide comfort through companionship." },
  { q: "Can my dog become a Psychiatric Service Dog?", a: "If your dog is trained to perform specific tasks directly related to a mental health disability — such as interrupting a panic attack, alerting to anxiety, or providing deep pressure therapy — it may qualify as a PSD." },
  { q: "Do I need different documentation for a service animal vs. ESA?", a: "Yes. For an ESA, you need a letter from a licensed mental health professional. For a PSD, you need documentation of your disability and the specific tasks your dog performs, often also from an LMHP." },
  { q: "Can a landlord ask if I have a service animal or ESA?", a: "Landlords may ask whether you have a disability-related need and what accommodation you're requesting. They cannot ask about your diagnosis but may request reasonable documentation." },
  { q: "What conditions qualify for a service animal vs. ESA?", a: "Service animals (including PSDs) are for disabilities where task training provides benefit. ESAs are for mental health conditions where the animal's companionship has therapeutic value, even without task training." }
];

export default function ServiceAnimalVsESAPage() {
  return (
    <main>
      <title>Service Animal vs ESA vs Therapy Dog: Key Differences 2026 | PawTenant</title>
      <meta name="description" content="What's the difference between a service animal, therapy dog, and ESA? Full comparison of legal rights, training, airline access, and housing protections in 2026." />
      <meta name="keywords" content="service animal vs ESA, emotional support animal vs service dog, therapy dog vs ESA, service dog vs emotional support animal, ESA rights 2026" />
      <link rel="canonical" href="https://www.pawtenant.com/service-animal-vs-esa" />
      <meta property="og:title" content="Service Animal vs ESA vs Therapy Dog 2026 | PawTenant" />
      <meta property="og:description" content="Clear comparison of service animals, emotional support animals, and therapy dogs — legal rights, housing, airline access, and how to get the right documentation." />
      <meta property="og:url" content="https://www.pawtenant.com/service-animal-vs-esa" />
      <meta property="og:type" content="article" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Service Animal vs ESA vs Therapy Dog: Full Comparison 2026 | PawTenant" />
      <meta name="twitter:description" content="Service animals, ESAs, and therapy dogs all look similar but have very different legal rights. Full breakdown of ADA, FHA, airline access, and documentation." />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          { "@type": "Question", "name": "Is my ESA considered a service animal?", "acceptedAnswer": { "@type": "Answer", "text": "No. ESAs are not classified as service animals under the ADA. They are classified separately under the Fair Housing Act. Service animals perform specific trained tasks; ESAs provide comfort through companionship." } },
          { "@type": "Question", "name": "Can my dog become a Psychiatric Service Dog?", "acceptedAnswer": { "@type": "Answer", "text": "If your dog is trained to perform specific tasks directly related to a mental health disability — such as interrupting a panic attack, alerting to anxiety, or providing deep pressure therapy — it may qualify as a PSD." } },
          { "@type": "Question", "name": "Do I need different documentation for a service animal vs. ESA?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. For an ESA, you need a letter from a licensed mental health professional. For a PSD, you need documentation of your disability and the specific tasks your dog performs, often also from an LMHP." } },
          { "@type": "Question", "name": "Can a landlord ask if I have a service animal or ESA?", "acceptedAnswer": { "@type": "Answer", "text": "Landlords may ask whether you have a disability-related need and what accommodation you're requesting. They cannot ask about your diagnosis but may request reasonable documentation." } }
        ]
      }) }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-24 pb-14 md:pt-32 md:pb-20 bg-[#fdf8f3]">
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div>
              <span className="inline-block px-3 py-1 bg-orange-100 text-orange-600 text-xs font-semibold rounded-full uppercase tracking-widest mb-4">
                Know Your Rights
              </span>
              <h1 className="text-4xl font-bold text-gray-900 mb-4 leading-tight">
                Service Animal vs. Emotional Support Animal vs. Therapy Dog
              </h1>
              <p className="text-gray-500 text-sm leading-relaxed mb-8">
                These three categories of assistance animals look similar on the surface but have very different legal statuses, training requirements, and rights. Understanding the differences helps you choose the right path for your needs.
              </p>
              <div className="flex gap-4">
                <Link
                  to="/assessment"
                  className="whitespace-nowrap px-5 py-2.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
                >
                  Get an ESA Letter
                </Link>
                <Link
                  to="/all-about-service-dogs"
                  className="whitespace-nowrap px-5 py-2.5 border border-orange-300 text-orange-600 font-semibold text-sm rounded-md hover:bg-orange-50 transition-colors cursor-pointer"
                >
                  Learn About PSDs
                </Link>
              </div>
            </div>
            <div className="hidden md:block">
              <img
                src="https://readdy.ai/api/search-image?query=three%20dogs%20sitting%20together%20one%20with%20service%20vest%20one%20therapy%20dog%20vest%20one%20emotional%20support%20bandana%20professional%20clean%20white%20background%20animals%20side%20by%20side&width=700&height=400&seq=savesahero-landscape&orientation=landscape"
                alt="Service animal, therapy dog, and ESA comparison"
                className="w-full h-[400px] object-cover object-top rounded-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Quick Definitions */}
      <section className="py-12 md:py-14 bg-white">
        <div className="max-w-7xl mx-auto px-5">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-6 md:mb-8 text-center">Quick Definitions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { title: "Service Animal", icon: "ri-service-fill", color: "bg-teal-50 border-teal-100 text-teal-600", badge: "ADA Protected", desc: "A dog (or miniature horse) individually trained to do work or perform tasks for a person with a disability. Tasks must be directly related to the person's disability. Has full public access rights." },
              { title: "Therapy Dog", icon: "ri-empathize-line", color: "bg-violet-50 border-violet-100 text-violet-600", badge: "Invited Access Only", desc: "A dog trained to provide comfort and affection to people in hospitals, schools, and other settings. Trained for interaction with many people, not just one handler. Has no federal public access rights." },
              { title: "Emotional Support Animal", icon: "ri-heart-fill", color: "bg-orange-50 border-orange-100 text-orange-600", badge: "Housing Protected", desc: "Any animal that provides therapeutic benefit to a person with a mental health condition. No task training required. Protected under the Fair Housing Act for housing accommodations with a valid ESA letter." }
            ].map((type) => (
              <div key={type.title} className={`rounded-2xl p-6 border ${type.color.split(" ").slice(1).join(" ")}`}>
                <div className={`w-10 h-10 flex items-center justify-center rounded-xl mb-4 ${type.color.split(" ")[0]}`}>
                  <i className={`${type.icon} text-xl ${type.color.split(" ")[2]}`}></i>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-base font-bold text-gray-900">{type.title}</h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${type.color}`}>{type.badge}</span>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed">{type.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-12 md:py-14 bg-[#fdf8f3]">
        <div className="max-w-7xl mx-auto px-5">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-6 md:mb-8 text-center">Side-by-Side Comparison</h2>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-3 px-4 text-gray-500 font-semibold text-xs uppercase tracking-wide bg-gray-50 rounded-tl-xl w-[22%]">Feature</th>
                  <th className="text-center py-3 px-4 text-teal-700 font-semibold text-xs uppercase tracking-wide bg-teal-50 w-[26%]">Service Animal</th>
                  <th className="text-center py-3 px-4 text-violet-700 font-semibold text-xs uppercase tracking-wide bg-violet-50 w-[26%]">Therapy Dog</th>
                  <th className="text-center py-3 px-4 text-orange-700 font-semibold text-xs uppercase tracking-wide bg-orange-50 rounded-tr-xl w-[26%]">Emotional Support Animal</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr key={row.feature} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="py-3.5 px-4 font-semibold text-gray-700 text-xs">{row.feature}</td>
                    <td className="py-3.5 px-4 text-center text-xs text-gray-600">{row.service}</td>
                    <td className="py-3.5 px-4 text-center text-xs text-gray-600">{row.therapy}</td>
                    <td className="py-3.5 px-4 text-center text-xs text-gray-600">{row.esa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Which Is Right For You */}
      <section className="py-12 md:py-14 bg-white">
        <div className="max-w-7xl mx-auto px-5">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-6 md:mb-8 text-center">Which Is Right for You?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { title: "Choose an ESA if...", icon: "ri-heart-line", points: ["You need your animal in housing that doesn&apos;t allow pets", "You live in a no-pets apartment or dormitory", "Your animal provides emotional/mental health support", "You want fast, affordable documentation", "Your condition is managed well with companionship"] },
              { title: "Consider a PSD if...", icon: "ri-service-line", points: ["Your animal performs specific tasks for your disability", "You need your animal in all public spaces", "You travel by air and need cabin access", "Your animal alerts you to anxiety or panic attacks", "Your animal provides deep pressure therapy"] },
              { title: "Consider a Therapy Dog if...", icon: "ri-empathize-fill", points: ["You want to help others with your well-trained dog", "You're interested in volunteering at hospitals or schools", "You have a calm, socialized animal", "You want to give back to your community", "Your dog meets certifying organization standards"] }
            ].map((option) => (
              <div key={option.title} className="bg-[#fdf8f3] rounded-2xl p-6 border border-orange-100">
                <div className="w-8 h-8 flex items-center justify-center mb-3">
                  <i className={`${option.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="text-sm font-bold text-gray-900 mb-3">{option.title}</h3>
                <ul className="space-y-2">
                  {option.points.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
                      <div className="w-3 h-3 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-check-line text-orange-400 text-xs"></i>
                      </div>
                      <span dangerouslySetInnerHTML={{ __html: p }} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="text-center mt-10 flex flex-col sm:flex-row justify-center gap-4">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-heart-line"></i>Get My ESA Letter
            </Link>
            <Link
              to="/psd-assessment"
              className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-gray-900 text-white font-semibold text-sm rounded-md hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <i className="ri-mental-health-line"></i>Get My PSD Letter
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 bg-[#fdf8f3]">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <details key={i} className="bg-white rounded-xl border border-gray-100 group">
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
