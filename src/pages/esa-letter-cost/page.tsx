import { useState, useEffect } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { Link } from "react-router-dom";

const pricingPlans = [
  {
    label: "Standard Delivery",
    sublabel: "2–3 Business Days",
    price: "$100",
    period: "one-time",
    highlight: false,
    cta: "Get Your Official ESA Letter",
    features: [
      "Full mental health evaluation",
      "Licensed clinician letter",
      "NPI & license number included",
      "Valid for housing nationwide",
      "Digital delivery within 2–3 days",
      "100% money-back guarantee",
    ],
  },
  {
    label: "Priority Delivery",
    sublabel: "Within 24 Hours",
    price: "$115",
    period: "one-time",
    highlight: true,
    cta: "Get Your Official ESA Letter",
    features: [
      "Full mental health evaluation",
      "Licensed clinician letter",
      "NPI & license number included",
      "Same-day priority processing",
      "Valid for housing nationwide",
      "Digital delivery within 24 hours",
      "100% money-back guarantee",
    ],
  },
  {
    label: "Annual Subscription",
    sublabel: "Per Year — Auto-Renews",
    price: "$90",
    period: "/year",
    highlight: false,
    cta: "Get Your Official ESA Letter",
    features: [
      "Full mental health evaluation",
      "Licensed clinician letter",
      "NPI & license number included",
      "Valid for housing nationwide",
      "Annual renewal — renews automatically",
      "100% money-back guarantee",
    ],
  },
];

const included = [
  "Thorough evaluation by licensed mental health professionals",
  "Legally enforced for rentals, vacation homes, and college dorms",
  "Compliant with Fair Housing Act for housing",
  "Affordable pricing with 'no pets' policies",
  "Money Back Guarantee for stress-free experience",
  "Dedicated customer support",
  "Legitimate ESA letter for peace of mind",
];

const whyChoose = [
  {
    title: "Affordable ESA Letters",
    desc: "PawTenant has the solution for you! Our ESA letters cover all housing arrangements, ensuring you can keep your beloved pet with you in rentals, vacation homes, or college dorms. Say goodbye to stressful moves and enjoy the comfort of having your furry companion by your side.",
    icon: "ri-price-tag-3-line",
  },
  {
    title: "Compliant & Legally Enforced",
    desc: "Our ESA letters are legally compliant and enforced for housing. Our licensed medical professionals are experts in ESA letter requirements, conducting thorough assessments to ensure that only those who genuinely need emotional support animals receive the necessary documentation.",
    icon: "ri-scales-line",
  },
  {
    title: "Optimal Pricing without Compromises",
    desc: "At PawTenant, we believe everyone should access affordable ESA letters without compromising quality. That's why we offer competitive pricing starting at just $100. You can now experience the benefits of an ESA letter without breaking the bank. We prioritize professionalism and authenticity to deliver top-notch ESA letters.",
    icon: "ri-hand-heart-line",
  },
  {
    title: "100% Money Back Guarantee",
    desc: "We stand behind the effectiveness of our ESA letters and your satisfaction. With our unique Money Back Guarantee, you're covered if your legitimate ESA letter doesn't work for any reason. We ensure a 100% refund if you don't qualify after consultation or if your landlord denies the letter despite a HUD-compliant.",
    icon: "ri-refund-2-line",
  },
  {
    title: "Customer Support and Satisfaction",
    desc: "Customer satisfaction is our priority, and we address any concerns promptly. PawTenant provides reliable customer support throughout the process, making it hassle-free to secure your ESA letter. Your stress-free experience with your pet is our goal.",
    icon: "ri-customer-service-line",
  },
  {
    title: "PawTenant: Your Trusted Source",
    desc: "Trust PawTenant to provide legitimate ESA letters at an unbeatable price. Our commitment to your well-being and the bond with your pet ensures high-quality ESA letters that meet all legal requirements. Don't miss the opportunity to benefit from an emotional support animal in your life.",
    icon: "ri-shield-star-line",
  },
];

const faqs = [
  { q: "What Types of Housing Are Covered By The Fair Housing Act?", a: "The Fair Housing Act covers a broad range of housing options, including rental apartments, condominiums, houses, and even some types of temporary housing. It applies to both public and private housing providers, with limited exceptions." },
  { q: "What Documents Are Required For Landlords To Accept An ESA?", a: "A valid ESA letter from a licensed mental health professional (LMHP). The letter should be on official letterhead and include the provider's name, license number, and confirmation that the tenant has a qualifying condition." },
  { q: "Can A Landlord Deny An ESA Based On Breed Or Size?", a: "No — under the Fair Housing Act, landlords cannot deny an ESA request based on the breed or size of the animal. The only grounds for denial are if the animal poses a direct threat to safety or if accommodation would cause undue hardship." },
  { q: "Choosing Between An ESA And A Service Animal", a: "Service animals are trained for specific tasks and protected under the ADA in public spaces. ESAs provide emotional comfort and are protected under the FHA for housing. If you need housing protection and emotional support, an ESA letter is the right choice." },
];

const SAMPLE_IMG = "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/8496bb5f-3256-4901-86f7-84bbb2ec3596_PawTenant-ESA-document-with-callouts.png?v=56e54caa565cc010fb19c7679d66a2b4";

export default function ESALetterCostPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    if (lightboxOpen) {
      document.addEventListener("keydown", handler);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen]);

  return (
    <main>
      <title>Affordable ESA Letter | Legitimate &amp; Fast | PawTenant</title>
      <meta name="description" content="Get an affordable ESA letter without sacrificing legitimacy. Licensed professionals issue your letter within 24 hours. Protect your housing rights at a fair price." />
      <meta name="keywords" content="affordable ESA letter, ESA letter cost, legitimate ESA letter, ESA letter price, cheap ESA letter" />
      <link rel="canonical" href="https://www.pawtenant.com/esa-letter-cost" />
      <meta property="og:title" content="Affordable ESA Letter | Legitimate & Fast | PawTenant" />
      <meta property="og:description" content="Get an affordable ESA letter without sacrificing legitimacy. Licensed professionals issue your letter within 24 hours. Protect your housing rights at a fair price." />
      <meta property="og:url" content="https://www.pawtenant.com/esa-letter-cost" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          { "@type": "Question", "name": "What Types of Housing Are Covered By The Fair Housing Act?", "acceptedAnswer": { "@type": "Answer", "text": "The Fair Housing Act covers a broad range of housing options, including rental apartments, condominiums, houses, and even some types of temporary housing. It applies to both public and private housing providers, with limited exceptions." } },
          { "@type": "Question", "name": "What Documents Are Required For Landlords To Accept An ESA?", "acceptedAnswer": { "@type": "Answer", "text": "A valid ESA letter from a licensed mental health professional (LMHP). The letter should be on official letterhead and include the provider's name, license number, and confirmation that the tenant has a qualifying condition." } },
          { "@type": "Question", "name": "Can A Landlord Deny An ESA Based On Breed Or Size?", "acceptedAnswer": { "@type": "Answer", "text": "No — under the Fair Housing Act, landlords cannot deny an ESA request based on the breed or size of the animal. The only grounds for denial are if the animal poses a direct safety threat or if accommodation would cause undue hardship." } }
        ]
      }) }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-28 pb-20">
        <div className="absolute inset-0">
          <img
            src="https://readdy.ai/api/search-image?query=woman%20sitting%20at%20a%20desk%20reviewing%20documents%20with%20her%20dog%20beside%20her%20warm%20home%20office%20setting%20natural%20light%20cozy%20interior%20beige%20tones%20paperwork%20ESA%20letter%20consultation%20affordable%20telehealth&width=1440&height=600&seq=esacost01&orientation=landscape"
            alt="ESA Letter Cost"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/20"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
              Affordable ESA Letter with Money Back Guarantee
            </h1>
            <p className="text-white/85 text-lg leading-relaxed mb-8">
              Our ESA letters cover all your housing arrangements, from rentals and vacation homes to college dorms. Licensed professionals, no hidden fees, and a 100% money-back guarantee.
            </p>
            <div className="flex items-center gap-4">
              <Link
                to="/assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                <i className="ri-file-text-line"></i>
                Get An ESA Letter Now
              </Link>
              <div className="flex items-center gap-2 text-white/80 text-sm">
                <i className="ri-refresh-line text-orange-400"></i>
                100% refund if your letter doesn't work
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Get Your Official ESA Letter for Just</h2>
            <p className="text-gray-500 text-sm max-w-2xl mx-auto">
              Our ESA letters cover all your housing arrangements, from rentals and vacation homes to college dorms. Our licensed medical professionals ensure compliance, legal enforcement, and authenticity in providing ESA letters.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto items-stretch">
            {pricingPlans.map((plan) => (
              <div
                key={plan.label}
                className={`rounded-2xl p-8 border-2 text-center flex flex-col ${
                  plan.highlight
                    ? "border-orange-500 bg-orange-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                {plan.highlight && (
                  <span className="inline-block bg-orange-500 text-white text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4">
                    Most Popular
                  </span>
                )}
                <p className="text-gray-600 text-sm mb-1">{plan.label}</p>
                <p className="text-orange-500 text-xs font-semibold mb-3">{plan.sublabel}</p>
                <p className="text-5xl font-black text-gray-900 mb-1">{plan.price}</p>
                <p className="text-gray-400 text-xs mb-4">{plan.period}</p>
                <div className="h-px bg-gray-200 my-6"></div>
                <ul className="space-y-3 text-left mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <div className="w-5 h-5 flex items-center justify-center">
                        <i className="ri-checkbox-circle-fill text-orange-500"></i>
                      </div>
                      <span className="text-sm text-gray-700">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/assessment"
                  className={`whitespace-nowrap block w-full py-3.5 font-bold text-sm rounded-md transition-colors cursor-pointer mt-auto ${
                    plan.highlight
                      ? "bg-orange-500 text-white hover:bg-orange-600"
                      : "bg-gray-900 text-white hover:bg-gray-800"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 mt-6 text-sm text-gray-500">
            <i className="ri-refresh-line text-orange-500"></i>
            100% refund if your letter doesn't work
          </div>
        </div>
      </section>

      {/* Included + Letter Visual */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Included with Your ESA Letter from PawTenant:</h2>
              <ul className="space-y-3 mb-8">
                {included.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className="ri-checkbox-circle-fill text-orange-500"></i>
                    </div>
                    <p className="text-gray-700 text-sm">{item}</p>
                  </li>
                ))}
              </ul>
              <Link
                to="/assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
              >
                <i className="ri-file-text-line"></i>
                Get An ESA Letter Now
              </Link>
            </div>

            {/* Letter Preview — real sample image */}
            <div className="relative w-full self-center">

              {/* Card */}
              <div
                className="relative rounded-2xl overflow-hidden cursor-zoom-in group"
                style={{ boxShadow: "0 4px 0 0 #f97316, 0 24px 64px -8px rgba(122,78,45,0.22), 0 8px 24px -4px rgba(0,0,0,0.10)" }}
                onClick={() => setLightboxOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setLightboxOpen(true)}
                aria-label="View annotated sample ESA letter with key sections highlighted"
              >
                {/* Sample badge */}
                <div className="absolute top-4 right-4 z-20 bg-white/95 backdrop-blur-sm border border-orange-200 text-orange-600 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                  Sample
                </div>

                {/* Hover overlay — "View Sample" */}
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-300 pointer-events-none">
                  <div className="flex flex-col items-center gap-2 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                    <div className="w-12 h-12 flex items-center justify-center bg-white rounded-full">
                      <i className="ri-zoom-in-line text-orange-500 text-xl"></i>
                    </div>
                    <span className="text-white text-sm font-semibold tracking-wide">View Sample</span>
                  </div>
                </div>

                <img
                  src={SAMPLE_IMG}
                  alt="PawTenant ESA Letter sample document with callouts highlighting licensed provider signature, NPI number, and patient details"
                  className="w-full h-auto object-top block"
                />
              </div>

              <p className="text-center text-xs text-gray-400 mt-4 tracking-wide">
                Sample ESA letter — your letter will include your name, pet, and licensed provider details
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Why Choose PawTenant</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {whyChoose.map((item) => (
              <div key={item.title} className="bg-[#fafafa] rounded-xl p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-4">
                  <i className={`${item.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-2 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-file-text-line"></i>
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
            <h2 className="text-3xl font-bold text-gray-900">Fair Housing Act Emotional Support Animals FAQ</h2>
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

      {/* CTA */}
      <section className="py-16 bg-white">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Schedule Your ESA Letter Consultation Today</h2>
          <p className="text-gray-500 mb-8">Get peace of mind with a service you can trust</p>
          <Link
            to="/assessment"
            className="whitespace-nowrap inline-flex items-center gap-2 px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            <i className="ri-calendar-line"></i>
            Schedule Your Appointment Today
          </Link>
        </div>
      </section>

      <SharedFooter />

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom,12px))]">
        <Link
          to="/assessment"
          className="whitespace-nowrap flex items-center justify-center gap-2 w-full py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
        >
          <i className="ri-file-text-line"></i>
          Get Your ESA Letter — From $99
        </Link>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-10"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Close button */}
          <button
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors cursor-pointer z-10"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close"
          >
            <i className="ri-close-line text-xl"></i>
          </button>

          {/* Image container */}
          <div
            className="relative max-w-3xl w-full max-h-[90vh] overflow-auto rounded-2xl bg-white"
            style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-3 right-3 z-10 bg-white border border-orange-200 text-orange-600 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              Sample
            </div>
            <img
              src={SAMPLE_IMG}
              alt="PawTenant ESA Letter sample document — full view with annotated callouts showing key sections"
              className="w-full h-auto block rounded-2xl"
            />
          </div>

          {/* Hint */}
          <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/50 text-xs tracking-wide whitespace-nowrap">
            Click anywhere outside to close · Press Esc to dismiss
          </p>
        </div>
      )}
    </main>
  );
}
