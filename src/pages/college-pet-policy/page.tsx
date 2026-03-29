import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { colleges } from "../../mocks/colleges";

const laws = [
  { title: "Fair Housing Act (FHA)", desc: "Requires colleges offering housing to accommodate ESAs as a disability accommodation for students with mental health conditions." },
  { title: "Americans with Disabilities Act (ADA)", desc: "Provides broad protections for individuals with disabilities in educational settings, including public universities." },
  { title: "Section 504 – Rehabilitation Act", desc: "Prohibits discrimination against students with disabilities at any institution receiving federal funding — virtually all universities." },
  { title: "HUD Guidelines (2020)", desc: "Clarified that colleges must engage in an individualized interactive process for ESA requests and cannot have blanket no-pet bans override ESA rights." }
];

const faqs = [
  { q: "Can my university deny my ESA request?", a: "Yes, but only in limited circumstances: if the animal poses a direct threat to others, causes substantial property damage, or requires a fundamental alteration of housing programs. Blanket no-pet policies are not sufficient legal grounds." },
  { q: "Do I need a new ESA letter each academic year?", a: "Most universities require annual renewal of ESA accommodations with updated documentation. PawTenant makes renewal easy and affordable." },
  { q: "Can I keep my ESA in off-campus housing near my college?", a: "Any housing covered by the Fair Housing Act (which includes most private rentals) must also accommodate ESAs. Your rights extend well beyond campus." },
  { q: "What if my roommate is allergic to my ESA?", a: "Universities must try to find a reasonable solution — either providing alternative housing for one party or finding an arrangement that works for both students." },
  { q: "Can I have a dog as my ESA in a college dorm?", a: "Yes. Dogs are among the most commonly approved ESA species in college housing. There are no breed restrictions under the Fair Housing Act." },
  { q: "How fast can I get my ESA letter?", a: "With PawTenant, most students receive their ESA letter within 24 hours of their consultation. We process requests quickly knowing you may have housing deadlines." }
];

export default function CollegePetPolicyPage() {
  return (
    <main>
      <title>ESA Letter for College Students 2026: Dorm Rights & University Policies | PawTenant</title>
      <meta name="description" content="Get an ESA letter for your college dorm in 2026. Federal law protects your right to keep an ESA in university housing. Same-day letters from licensed professionals at PawTenant." />
      <meta name="keywords" content="ESA letter college dorm, emotional support animal university, ESA housing college, ESA letter student, college ESA policy 2026" />
      <link rel="canonical" href="https://www.pawtenant.com/college-pet-policy" />
      <meta property="og:title" content="ESA Letter for College Students 2026 | PawTenant" />
      <meta property="og:description" content="Federal law protects college students' right to ESAs in dorms. Get a university-compliant ESA letter from PawTenant — same-day delivery, 100% money-back guarantee." />
      <meta property="og:url" content="https://www.pawtenant.com/college-pet-policy" />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="ESA Letter for College Students 2026 | Dorm Rights | PawTenant" />
      <meta name="twitter:description" content="Keep your ESA in your college dorm. Federal law protects you. Get a legitimate ESA letter from PawTenant — same-day delivery, 100% money-back guarantee." />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          { "@type": "Question", "name": "Can my university deny my ESA request?", "acceptedAnswer": { "@type": "Answer", "text": "Yes, but only in limited circumstances: if the animal poses a direct threat to others, causes substantial property damage, or requires a fundamental alteration of housing programs. Blanket no-pet policies are not sufficient legal grounds." } },
          { "@type": "Question", "name": "Do I need a new ESA letter each academic year?", "acceptedAnswer": { "@type": "Answer", "text": "Most universities require annual renewal of ESA accommodations with updated documentation. PawTenant makes renewal easy and affordable." } },
          { "@type": "Question", "name": "Can I keep my ESA in off-campus housing near my college?", "acceptedAnswer": { "@type": "Answer", "text": "Any housing covered by the Fair Housing Act (which includes most private rentals) must also accommodate ESAs. Your rights extend well beyond campus." } },
          { "@type": "Question", "name": "Can I have a dog as my ESA in a college dorm?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. Dogs are among the most commonly approved ESA species in college housing. There are no breed restrictions under the Fair Housing Act." } },
          { "@type": "Question", "name": "How fast can I get my ESA letter?", "acceptedAnswer": { "@type": "Answer", "text": "With PawTenant, most students receive their ESA letter within 24 hours of their consultation. We process requests quickly knowing you may have housing deadlines." } }
        ]
      }) }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="https://readdy.ai/api/search-image?query=university%20campus%20aerial%20view%20students%20walking%20with%20dogs%20green%20lawns%20autumn%20fall%20colorful%20trees%20academic%20buildings%20warm%20sunshine%20peaceful%20college%20life&width=1440&height=600&seq=cpphero&orientation=landscape"
            alt="University campus with students and pets"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900/80 via-gray-900/60 to-transparent"></div>
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <span className="inline-block px-3 py-1 bg-orange-500/20 text-orange-300 text-xs font-semibold rounded-full uppercase tracking-widest mb-4">
              ESA Letter for College Students
            </span>
            <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
              Emotional Support Animal Letter for College Students
            </h1>
            <p className="text-white/80 text-base leading-relaxed mb-8 max-w-xl">
              Federal law protects your right to keep an Emotional Support Animal in college housing. PawTenant connects you with licensed mental health professionals who provide university-compliant ESA letters — fast, legitimate, and backed by a 100% money-back guarantee.
            </p>
            <div className="flex gap-4">
              <Link
                to="/assessment"
                className="whitespace-nowrap px-6 py-3 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                Get My ESA Letter
              </Link>
              <a
                href="#colleges"
                className="whitespace-nowrap px-6 py-3 bg-white/10 text-white font-semibold text-sm rounded-md hover:bg-white/20 transition-colors cursor-pointer border border-white/30"
              >
                Find Your College
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Laws Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Laws That Protect a College Student&apos;s ESA</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-8">
                Bringing an Emotional Support Animal to college is protected by multiple federal laws. Understanding these laws helps you confidently advocate for your housing rights.
              </p>
              <div className="space-y-4">
                {laws.map((law) => (
                  <div key={law.title} className="flex items-start gap-3 p-4 bg-orange-50 rounded-xl border border-orange-100">
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className="ri-arrow-right-s-line text-orange-500 text-lg"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-1">{law.title}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{law.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <img
                src="https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/7efddf74-4a4d-4bfb-b606-afc0060a9955_Laws-That-Protect-a-College-Students-ESA.jpg?v=0df93183a2f7372a30c9683a689dd88e"
                alt="Federal laws that protect a college student's emotional support animal ESA rights in university housing"
                className="w-full h-[420px] object-cover object-top rounded-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Colleges Grid */}
      <section id="colleges" className="py-16 bg-[#fdf8f3]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Explore College ESA Policies Near You</h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">
              Select your college to learn about their specific ESA accommodation process, housing policies, and what documentation is required.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {colleges.map((college) => (
              <Link
                key={college.slug}
                to={`/college-pet-policy/${college.slug}`}
                className="group bg-white rounded-xl overflow-hidden border border-gray-100 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="h-36 overflow-hidden">
                  <img
                    src={college.image}
                    alt={college.name}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-orange-600 transition-colors leading-tight mb-1">{college.name}</p>
                  <p className="text-xs text-gray-400">{college.location}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-14 md:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">How to Get Your ESA Letter for College</h2>
            <p className="text-gray-500 text-sm max-w-lg mx-auto">Three simple steps to protect your housing rights on campus.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8">
            {[
              { step: "01", icon: "ri-stethoscope-line", title: "Complete Assessment", desc: "Answer a brief mental health questionnaire and schedule your video consultation with a licensed therapist." },
              { step: "02", icon: "ri-file-text-line", title: "Receive Your ESA Letter", desc: "Your licensed mental health professional writes and signs a university-compliant ESA letter, typically within 24 hours." },
              { step: "03", icon: "ri-home-heart-line", title: "Submit to Your University", desc: "Submit to your university&apos;s Accessibility Services or Disability Office. We help with any follow-up questions." }
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="relative inline-flex items-center justify-center w-16 h-16 mb-5">
                  <div className="absolute inset-0 bg-orange-100 rounded-full"></div>
                  <i className={`${s.icon} text-orange-500 text-2xl relative z-10`}></i>
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{s.step}</span>
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-block px-8 py-3.5 bg-orange-500 text-white font-semibold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              Start My ESA Letter — From $100
            </Link>
            <p className="text-xs text-gray-400 mt-2">100% money-back guarantee if not approved</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-[#fdf8f3]">
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
