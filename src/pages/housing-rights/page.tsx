import { useState } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import VerificationPillarsSection from "../../components/feature/VerificationPillarsSection";
import EsaVsPsdCard from "@/components/feature/EsaVsPsdCard";
import { Link } from "react-router-dom";

const trustBadges = [
  { icon: "ri-shield-check-line", label: "HIPAA Compliant" },
  { icon: "ri-lock-line", label: "SSL Secured" },
  { icon: "ri-refund-2-line", label: "100% Money Back" },
  { icon: "ri-stethoscope-line", label: "Licensed Physician" },
];

const categories = [
  {
    title: "Housing",
    icon: "ri-home-heart-line",
    desc: "This is where ESA protections are strongest. Under the federal Fair Housing Act, most housing providers must consider a reasonable-accommodation request for a qualifying emotional support animal, even in buildings with a \"no pets\" policy, and pet fees or deposits generally do not apply. A landlord may ask for a valid letter from a licensed provider but cannot demand your specific diagnosis or medical records. Each request is reviewed individually — a valid letter supports your request but does not guarantee approval.",
  },
  {
    title: "Employment",
    icon: "ri-briefcase-line",
    desc: "Workplace rules are separate from housing. There is no automatic right to bring an emotional support animal to work. An employee may request an accommodation, and the employer weighs it case by case under applicable disability law and may offer alternatives or decline if it would cause undue hardship. Always check your employer's policy and your state's rules.",
  },
  {
    title: "Public Place",
    icon: "ri-store-line",
    desc: "An ESA letter does not give your animal public-access rights. Access to stores, restaurants, hotels, and other businesses is reserved for trained service dogs under the Americans with Disabilities Act (ADA) — not emotional support animals. Any service claiming an ESA letter grants public access is misleading. ESA protections center on housing.",
  },
];

const fhaPoints = [
  "You must have a valid ESA letter from a licensed mental health professional practicing in your state.",
  "The letter must show that you have a mental or emotional disability and that your ESA helps with your condition.",
  "Our licensed providers do full assessments based on your needs. If you qualify, your ESA letter will meet all state and federal housing laws.",
];

const benefitsList = [
  "Thorough evaluation by licensed mental health professionals",
  "Legally enforced for rentals, vacation homes, and college dorms",
  "Compliant with Fair Housing Act for housing",
  "Affordable pricing at $129 with 'no pets' policies",
  "Money Back Guarantee for stress-free experience",
  "Dedicated customer support",
  "Legitimate ESA letter for peace of mind",
];

const faqs = [
  { q: "What Types Of Housing Are Covered By The Fair Housing Act?", a: "The Fair Housing Act covers a broad range of housing options, including rental apartments, condominiums, houses, and even some types of temporary housing. It applies to both public and private housing providers, except for owner-occupied buildings with four or fewer units, single-family houses sold or rented without the use of a broker, and certain religious organizations." },
  { q: "What Documents Are Required For Landlords To Accept An ESA?", a: "A valid ESA letter from a licensed mental health professional (LMHP). The letter should be on official letterhead and include the provider's name, license number, license type, and state of licensure, as well as confirmation that the tenant has a qualifying condition and that the ESA is part of their treatment plan." },
  { q: "Can A Landlord Deny An ESA Based On Breed Or Size?", a: "Generally no — under the Fair Housing Act, a landlord cannot deny an ESA request based only on the breed or size of the animal. Recognized grounds for a lawful, individualized denial include a genuine direct threat to the health or safety of others, substantial physical damage to property, undue financial or administrative burden, or documentation that cannot be verified. Each request is decided case by case." },
  { q: "Choosing Between An ESA And A Service Animal", a: "Service animals are trained to perform specific tasks related to a person's disability and are protected under the ADA in public spaces. ESAs provide emotional comfort and are protected under the FHA for housing. If your primary need is housing protection and emotional support, an ESA letter may be the right choice." },
  { q: "What can a landlord ask after I submit my ESA letter?", a: "Under Fair Housing principles, a landlord may confirm that the letter is authentic and that the provider is a licensed mental health professional credentialed in your state. They may also ask whether your ESA is part of your treatment plan if that is not already clear from the letter. A landlord should not request your specific diagnosis, your clinical records, or detailed medical history — that information stays between you and your provider." },
  { q: "How do I make a reasonable accommodation request to my landlord?", a: "Submit your reasonable accommodation request in writing alongside your valid ESA letter documentation, and keep a dated copy for your records. Most property managers respond within a reasonable timeframe — the FHA does not specify an exact number of days, but undue delay can itself be a violation. If the request is denied despite a valid ESA letter from a licensed mental health professional, you can escalate to HUD or to a fair-housing advocate in your state." },
];

export default function HousingRightsPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <title>ESA Letter for Housing | Fair Housing Act Protections | PawTenant</title>
      <meta name="keywords" content="ESA letter for housing, Fair Housing Act ESA letter, ESA housing rights, valid ESA letter documentation, reasonable accommodation request, emotional support animal letter benefits, avoiding ESA letter scams, ESA landlord laws, pet fee exemption, emotional support animal housing" />
      <meta property="og:type" content="article" />
      <meta property="og:image" content="https://pawtenant.com/assets/backgrounds/telehealth-woman-doctor-videocall.jpg" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="ESA Housing Rights 2026: Fair Housing Act Protections | PawTenant" />
      <meta name="twitter:description" content="Your ESA housing rights under the Fair Housing Act explained. A valid ESA letter supports a reasonable-accommodation request — reviewed individually, with rules that can depend on your state and housing type. Get your ESA letter with PawTenant." />
      <meta name="twitter:image" content="https://pawtenant.com/assets/backgrounds/telehealth-woman-doctor-videocall.jpg" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "FAQPage",
            "mainEntity": faqs.map((f) => ({
              "@type": "Question",
              "name": f.q,
              "acceptedAnswer": { "@type": "Answer", "text": f.a }
            }))
          },
          {
            "@type": "ImageObject",
            "name": "Licensed Mental Health Professionals — ESA Housing Rights",
            "description": "Board-licensed mental health professionals provide ESA letters that protect housing rights under the Fair Housing Act for emotional support animal owners across the USA.",
            "url": "https://pawtenant.com/assets/backgrounds/telehealth-woman-doctor-videocall.jpg",
            "contentUrl": "https://pawtenant.com/assets/backgrounds/telehealth-woman-doctor-videocall.jpg",
            "representativeOfPage": true
          },
          {
            "@type": "ImageObject",
            "name": "ESA Housing Protection Support — Fair Housing Act",
            "description": "ESA housing protection and Fair Housing Act tenant rights for emotional support animal owners — reasonable-accommodation requests reviewed individually under applicable law.",
            "url": "https://pawtenant.com/assets/housing/home-together.jpg",
            "contentUrl": "https://pawtenant.com/assets/housing/home-together.jpg"
          }
        ]
      }) }} />

      <SharedNavbar />

      {/* Hero — full cover (min-h-[100svh]) so the next section doesn't
          peek at the fold on initial load. Consolidated 2 hero paragraphs
          into 1 short subtitle; the longer legal context now lives in the
          FHA Section + Landlord Obligations cards directly below. */}
      <section className="relative min-h-[100svh] flex flex-col justify-center pt-24 sm:pt-28 pb-14 sm:pb-20">
        <div className="absolute inset-0">
          <img
            src="/assets/backgrounds/telehealth-woman-doctor-videocall.jpg"
            alt="Licensed mental health professionals issuing ESA letters for housing rights under the Fair Housing Act"
            title="Licensed Mental Health Professionals — ESA Housing Rights"
            fetchPriority="high"
            loading="eager"
            decoding="async"
            width={1920}
            height={1280}
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/55 to-black/25"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-5 sm:px-6 w-full">
          <div className="max-w-2xl">
            <h1 className="text-[28px] sm:text-4xl md:text-5xl font-bold text-white mb-4 leading-[1.15]">
              ESA Letter for Housing &amp; Your Fair Housing Act Rights
            </h1>
            {/* Single short subtitle — was 2 paragraphs pre-cleanup. The
                longer legal explanation moved to the FHA + Landlord
                Obligations sections directly below. */}
            <p className="text-white/90 text-[14.5px] sm:text-base leading-relaxed mb-6 sm:mb-8 max-w-xl">
              Valid ESA documentation supports a reasonable accommodation request under federal law.
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4">
              <Link
                to="/assessment"
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 sm:px-8 py-3.5 bg-orange-500 text-white font-bold text-[14px] sm:text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.30)] sm:shadow-none"
              >
                <i className="ri-file-text-line"></i>
                Get an ESA Letter Now
              </Link>
              {/* Internal anchor → /how-to-get-esa-letter with natural keyword
                  anchor for "getting an ESA letter online". Strengthens
                  internal-linking topical authority. */}
              <Link
                to="/how-to-get-esa-letter"
                className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto text-white/90 hover:text-white text-[13.5px] sm:text-sm font-semibold border border-white/30 hover:border-white/60 px-5 py-3 rounded-md transition-colors cursor-pointer"
              >
                Getting an ESA letter online
                <i className="ri-arrow-right-line text-xs"></i>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="py-6 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {trustBadges.map((b) => (
              <div key={b.label} className="flex items-center justify-center gap-3">
                <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg">
                  <i className={`${b.icon} text-orange-500 text-lg`}></i>
                </div>
                <span className="text-sm font-semibold text-gray-800">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Emotional Support Animals</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-5">What Do I Need to Know About Emotional Support Animals</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {categories.map((cat) => (
              <div key={cat.title} className="bg-white rounded-2xl p-7 border border-gray-100">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-4">
                  <i className={`${cat.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{cat.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{cat.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
            >
              <i className="ri-search-line"></i>
              Find Out If You Qualify
            </Link>
          </div>
        </div>
      </section>

      {/* FHA Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <div className="inline-block bg-orange-500 text-white text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-5">
                Fair Housing Act (FHA)
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">What The Fair Housing Act Protects</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                The Fair Housing Act was initially established to protect people from housing discrimination. It later extended to include people with disabilities — including those who use emotional or mental health support animals. In addition to the common rental support animal, other animals are also eligible under the Fair Housing Act, including those with emotional conditions.
              </p>
              <h3 className="text-base font-bold text-gray-900 mb-3">Fair Housing Act and Service Animals</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                Service animals are used by people with physical or mental disabilities. These animals typically dogs, are trained to perform specific tasks for an individual with a disability. For example: a dog that guides a blind person, one that alerts a deaf person, or an animal that goes with a person suffering from a condition that can result in sudden incapacitation in case of an attack such as epilepsy or cardiac arrest.
              </p>
              <div className="bg-[#fdf6ee] rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-3">To Be Protected under the FHA:</h3>
                <ul className="space-y-3">
                  {fhaPoints.map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-checkbox-circle-fill text-orange-500"></i>
                      </div>
                      <p className="text-gray-700 text-sm leading-relaxed">{p}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div>
              <div className="rounded-2xl overflow-hidden min-h-64 mb-8">
                <img
                  src="/assets/housing/home-together.jpg"
                  alt="ESA housing protection support — Fair Housing Act tenant rights for emotional support animal owners"
                  loading="lazy"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div className="bg-[#fdf6ee] rounded-2xl p-7">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Benefits of Having an ESA Letter from PawTenant</h3>
                <ul className="space-y-2.5">
                  {benefitsList.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-check-line text-orange-500 font-bold"></i>
                      </div>
                      <p className="text-gray-700 text-sm">{item}</p>
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <Link
                    to="/assessment"
                    className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
                  >
                    <i className="ri-file-text-line"></i>
                    Get An ESA Letter Now
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Scam-awareness callout — captures the "avoiding ESA letter scams"
          and "valid ESA letter documentation" keyword cluster naturally,
          and routes intent traffic to the how-to-get-esa-letter explainer
          where the full scam-prevention checklist lives. Compact banner,
          not a full section — preserves page rhythm. */}
      <section className="py-8 md:py-10 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-[#fdf6ee] border border-orange-200 rounded-2xl p-6 md:p-7 flex flex-col md:flex-row items-start md:items-center gap-5">
            <div className="w-12 h-12 flex items-center justify-center bg-orange-500 rounded-xl flex-shrink-0">
              <i className="ri-shield-check-line text-white text-xl"></i>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-1.5">
                Avoiding ESA letter scams
              </h2>
              <p className="text-gray-700 text-sm leading-relaxed">
                Valid ESA letter documentation must be reviewed and signed by a licensed mental health professional credentialed in your state, with their license number and signature on the letter. Services that promise instant approval, guaranteed letters, or skip the clinical evaluation are not legitimate — and many landlords reject those documents on sight.
              </p>
            </div>
            <Link
              to="/how-to-get-esa-letter"
              className="whitespace-nowrap inline-flex items-center gap-1.5 text-sm font-bold text-orange-600 border border-orange-400 px-5 py-2.5 rounded-lg hover:bg-orange-500 hover:text-white transition-colors cursor-pointer flex-shrink-0"
            >
              How to get your ESA letter
              <i className="ri-arrow-right-line text-xs"></i>
            </Link>
          </div>
        </div>
      </section>

      {/* Landlord Obligations */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Fair Housing Act and Emotional Support Animals (ESA)</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-8 max-w-4xl">
            Emotional support animals (ESAs) provide comfort and help individuals with mental health conditions, as they increase their symptoms and improve their overall well-being. However, to legally have an ESA in housing, you need a valid ESA letter from a licensed mental health professional.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-7 border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Landlord Obligations and ESA Accommodation</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                Emotional support animals (ESAs) provide comfort and assistance to individuals with mental health conditions. As a result, they need to be allowed where their owners live as part of the Fair Housing Act (FHA), which provides a way for people with disabilities to have equal access to housing.
              </p>
              <p className="text-gray-600 text-sm leading-relaxed">
                Under the FHA, housing providers are generally expected to consider ESAs as a reasonable accommodation for an individual with a disability, and cannot apply a blanket no-pets denial without an individualized review. Landlords can ask for documentation such as an ESA letter from a licensed mental health professional. They generally cannot demand detailed medical records, require a specific letter format, or charge pet fees that apply only to ordinary pets. Each request is decided individually, and state law and housing type may still matter.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-7 border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Dealing with Landlord Refusals</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                Options for Denial Accommodation: In some cases, despite presenting the necessary documentation and complying with the FHA, some landlords may deny or delay an ESA accommodation request. Should this happen, there are legal options available to individuals with disabilities who are facing housing discrimination, including those related to ESA accommodations requiring reasonable accommodation under the FHA.
              </p>
              <p className="text-gray-600 text-sm leading-relaxed">
                If a housing provider refuses or delays your ESA accommodation request, ask for the reason in writing and keep copies of every communication. You can provide valid ESA documentation from a licensed mental health professional and ask the provider to review it under Fair Housing reasonable-accommodation rules. If the issue remains unresolved, you may contact HUD or your state or local fair housing agency for guidance on next steps.
              </p>
            </div>
          </div>
          <div className="text-center mt-10">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
            >
              <i className="ri-search-line"></i>
              Find Out If You Qualify
            </Link>
          </div>
        </div>
      </section>

      {/* State-specific ESA housing guidance — light contextual section
          that connects the federal FHA framing above to state-level
          guides without becoming a 50-state link wall. Six curated
          high-traffic states plus the all-states hub. Educational anchor
          phrasing, no exact-match repetition. */}
      <section className="py-16 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
                State-Specific ESA Housing Guidance
              </span>
              <h2 className="text-3xl font-bold text-gray-900 mb-4 leading-tight">
                How Fair Housing Act protections apply in your state
              </h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                The Fair Housing Act applies nationwide, but several states layer in additional accommodations — California's AB 468 30-day clinical relationship, New York's anti-discrimination provisions, Florida's fraud statute, Texas Property Code Chapter 92, and Pennsylvania's PHRA all shape how a landlord may handle an ESA accommodation request.
              </p>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                Our per-state guides cover the federal FHA baseline plus the state-specific rules a landlord or property manager in your area actually references.
              </p>
              <Link
                to="/explore-esa-letters-all-states"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer"
              >
                Browse ESA housing guides for all 50 states
                <i className="ri-arrow-right-line text-xs"></i>
              </Link>
            </div>
            <div className="lg:col-span-7">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { slug: "california", name: "California", note: "FHA + AB 468 30-day rule" },
                  { slug: "texas", name: "Texas", note: "FHA + Texas Property Code Ch. 92" },
                  { slug: "florida", name: "Florida", note: "FHA + FL Statute 760.27" },
                  { slug: "new-york", name: "New York", note: "FHA + NY Human Rights Law" },
                  { slug: "pennsylvania", name: "Pennsylvania", note: "FHA + PA Human Relations Act" },
                  { slug: "georgia", name: "Georgia", note: "FHA + Georgia Fair Housing Act" },
                ].map((s) => (
                  <Link
                    key={s.slug}
                    to={`/esa-letter/${s.slug}`}
                    className="flex items-start gap-3 p-4 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/40 transition-colors cursor-pointer group"
                  >
                    <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0 group-hover:bg-orange-100 transition-colors">
                      <i className="ri-map-pin-2-line text-orange-500"></i>
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-gray-900 text-sm leading-tight mb-1 group-hover:text-orange-600 transition-colors">
                        ESA housing guide for {s.name}
                      </div>
                      <div className="text-gray-500 text-xs leading-snug">{s.note}</div>
                    </div>
                  </Link>
                ))}
              </div>
              <p className="text-gray-400 text-xs mt-4 leading-relaxed">
                This is general information, not legal advice. Specific statutes, exemptions, and procedures vary by state and by housing type.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PSD awareness — ESA vs PSD comparison so visitors who came
          for ESA housing rights also see PawTenant's PSD support for
          qualifying individuals. Added in mobile-cleanup pass. */}
      <EsaVsPsdCard className="bg-[#fafbfb]" />

      {/* Trust pillars — reusable section, compact variant */}
      <VerificationPillarsSection variant="compact" showCTA showPrivacyNote className="bg-white" />

      {/* FAQ */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Popular Questions</span>
            <h2 className="text-3xl font-bold text-gray-900">Fair Housing Act Emotional Support Animals FAQ</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-[#fafafa] rounded-xl border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className={`text-sm font-semibold ${openFaq === i ? "text-orange-500" : "text-gray-900"}`}>
                    {faq.q}
                  </span>
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
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Schedule Your ESA Letter Consultation Today</h2>
          <p className="text-gray-500 mb-8">Get peace of mind with a service you can trust</p>
          <Link
            to="/assessment"
            className="inline-flex items-center justify-center gap-2 px-6 sm:px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-center w-full sm:w-auto"
          >
            <i className="ri-calendar-line"></i>
            Schedule Your Appointment Today
          </Link>
        </div>
      </section>

      {/* Related Resources — internal links to continue the ESA research
          journey. Bottom-of-page placement keeps the FHA content focused
          while still providing natural next-step links. */}
      <section className="py-12 sm:py-16 bg-slate-50 border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-8 sm:mb-10">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 leading-tight">
              Related Resources
            </h2>
            <p className="text-[14px] text-slate-600 leading-relaxed">
              More guides for ESA housing, pricing, and verification.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <Link
              to="/esa-laws"
              className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-orange-200 hover:shadow-sm transition cursor-pointer"
            >
              <div className="text-[14.5px] font-semibold text-slate-900 mb-1.5 leading-snug">
                ESA Laws &amp; Requirements
              </div>
              <p className="text-[12.5px] text-slate-600 leading-relaxed">
                What the Fair Housing Act requires, what a valid ESA letter needs, and what it can and cannot do.
              </p>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 mt-3 group-hover:gap-1.5 transition-all">
                Read more <i className="ri-arrow-right-line" />
              </span>
            </Link>
            <Link
              to="/how-to-get-esa-letter"
              className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-orange-200 hover:shadow-sm transition cursor-pointer"
            >
              <div className="text-[14.5px] font-semibold text-slate-900 mb-1.5 leading-snug">
                How to Get an ESA Letter
              </div>
              <p className="text-[12.5px] text-slate-600 leading-relaxed">
                A step-by-step guide to getting a clinically reviewed ESA letter from a licensed mental health professional.
              </p>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 mt-3 group-hover:gap-1.5 transition-all">
                Read more <i className="ri-arrow-right-line" />
              </span>
            </Link>
            <Link
              to="/esa-letter-cost"
              className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-orange-200 hover:shadow-sm transition cursor-pointer"
            >
              <div className="text-[14.5px] font-semibold text-slate-900 mb-1.5 leading-snug">
                ESA Letter Pricing
              </div>
              <p className="text-[12.5px] text-slate-600 leading-relaxed">
                Transparent pricing for a clinically reviewed ESA letter, with a refund if you don&rsquo;t qualify after review.
              </p>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 mt-3 group-hover:gap-1.5 transition-all">
                Read more <i className="ri-arrow-right-line" />
              </span>
            </Link>
            <Link
              to="/esa-letter-verification"
              className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-orange-200 hover:shadow-sm transition cursor-pointer"
            >
              <div className="text-[14.5px] font-semibold text-slate-900 mb-1.5 leading-snug">
                Landlord Verification
              </div>
              <p className="text-[12.5px] text-slate-600 leading-relaxed">
                How landlords confirm an ESA letter&rsquo;s authenticity using its unique verification ID.
              </p>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 mt-3 group-hover:gap-1.5 transition-all">
                Read more <i className="ri-arrow-right-line" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
