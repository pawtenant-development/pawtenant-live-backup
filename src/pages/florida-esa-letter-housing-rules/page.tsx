import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import VerificationPillarsSection from "../../components/feature/VerificationPillarsSection";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";

const heroBadges = [
  { icon: "ri-shield-check-line", label: "HIPAA-secure intake" },
  { icon: "ri-user-star-line", label: "FL-qualified providers" },
  { icon: "ri-qr-code-line", label: "Verifiable documentation" },
];

const heroFacts = [
  "Florida Statute § 760.27",
  "Effective July 1, 2020",
  "Qualified practitioner, personal knowledge",
  "No diagnosis/records requests by landlords",
];

/**
 * /florida-esa-letter-housing-rules — Florida ESA housing rules.
 *
 * Verified from authoritative sources:
 *  - Florida Statute § 760.27 ("Prohibited discrimination in housing provided
 *    to a person with a disability who has an emotional support animal"),
 *    effective July 1, 2020. Where a disability is not readily apparent, a
 *    housing provider may request reliable information that reasonably supports
 *    that the person has a disability and a disability-related need for the
 *    specific ESA. Supporting information may include documentation from a
 *    health care practitioner (as defined in Florida law), a telehealth
 *    provider, or another similarly licensed/certified practitioner in good
 *    standing who has personal knowledge of the person's disability. An
 *    out-of-state practitioner must have seen the person in person at least
 *    once. The provider may not request the diagnosis/severity or medical
 *    records, and may require proof of licensing/vaccination for the animal.
 *  - Florida Statute § 817.265 makes falsifying ESA information a second-degree
 *    misdemeanor (plus 30 hours of community service for an organization that
 *    serves persons with disabilities).
 *
 * Compliance-safe: housing framing only, no guaranteed approval, no public
 * access, informational not legal advice.
 */

const flPoints = [
  {
    icon: "ri-file-shield-2-line",
    title: "Reliable supporting information",
    desc: "If your disability is not readily apparent, a housing provider may request reliable information that reasonably supports your disability and your disability-related need for the specific emotional support animal.",
  },
  {
    icon: "ri-user-heart-line",
    title: "From a qualified practitioner",
    desc: "Documentation should come from a health care practitioner, telehealth provider, or similarly licensed professional in good standing who has personal knowledge of your disability and acts within the scope of their practice.",
  },
  {
    icon: "ri-map-pin-line",
    title: "Out-of-state providers",
    desc: "Florida accepts documentation from an out-of-state practitioner only if they have personally examined you at least once. This discourages anonymous \"instant\" letters.",
  },
  {
    icon: "ri-lock-2-line",
    title: "Your privacy is protected",
    desc: "A housing provider may not request the diagnosis or severity of your disability, or your medical records. They may require proof of the animal's licensing and vaccination where applicable.",
  },
];

const faqs = [
  {
    q: "What does Florida Statute 760.27 require for an ESA in housing?",
    a: "Florida Statute § 760.27 (effective July 1, 2020) lets a housing provider request reliable information supporting your disability and your disability-related need for the specific emotional support animal when the disability is not readily apparent. That documentation should come from a qualified, licensed practitioner who has personal knowledge of your disability and is acting within the scope of their practice.",
  },
  {
    q: "Can I use an out-of-state or online provider for a Florida ESA letter?",
    a: "Florida accepts documentation from a telehealth provider, and from an out-of-state practitioner only if they have examined you in person at least once. The practitioner must be licensed and in good standing and must have personal knowledge of your disability. This is one reason \"instant\" letters with no real provider relationship are commonly rejected.",
  },
  {
    q: "What can a Florida landlord NOT ask for?",
    a: "Under § 760.27, a housing provider may not request information disclosing the diagnosis or severity of your disability, or your medical records. You may choose to share such information at your own discretion, but it cannot be required. A provider may require proof that the animal is licensed and vaccinated where local rules apply.",
  },
  {
    q: "Are there penalties for fake ESA documentation in Florida?",
    a: "Yes. Florida Statute § 817.265 makes it a second-degree misdemeanor to knowingly provide false information or documentation to obtain an ESA housing accommodation, and can include 30 hours of community service for an organization serving persons with disabilities. A genuine, licensed evaluation protects you.",
  },
  {
    q: "Does a Florida ESA letter give my animal public access?",
    a: "No. Florida Statute § 760.27 and the federal Fair Housing Act focus on housing. Public-access rights to stores, restaurants, and hotels are reserved for trained service dogs under the ADA — not emotional support animals.",
  },
  {
    q: "Will my Florida landlord have to approve my ESA?",
    a: "Not automatically. Housing providers must consider reasonable-accommodation requests, but each is evaluated individually. Proper documentation from a qualified, licensed provider supports your request; it does not guarantee approval, and a provider issues a letter only when an ESA is clinically appropriate for you.",
  },
];

export default function FloridaESAHousingRulesPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="Florida ESA letter, Florida Statute 760.27, Florida ESA housing rules, emotional support animal Florida, Florida ESA documentation, Florida assistance animal housing"
      />
      <meta property="og:type" content="article" />
      <meta name="twitter:card" content="summary_large_image" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />

      <SharedNavbar />

      <section className="relative pt-28 sm:pt-32 pb-14 sm:pb-20 bg-gradient-to-br from-[#fdf6ee] via-white to-orange-50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-2 bg-white border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
                <i className="ri-map-pin-2-line"></i>
                Florida · Statute § 760.27
              </span>
              <h1 className="text-[28px] sm:text-4xl md:text-5xl font-bold text-gray-900 mb-5 leading-[1.12]">
                Florida ESA Letter &amp; Housing Rules
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed max-w-xl mb-6">
                Florida Statute § 760.27 (effective July 1, 2020) sets clear rules for emotional support animal documentation in housing — including who can write it and what a landlord can and cannot ask. Here&rsquo;s what Florida renters should know.
              </p>
              <div className="flex flex-wrap gap-2 mb-7">
                {heroBadges.map((b) => (
                  <span key={b.label} className="inline-flex items-center gap-1.5 bg-white/70 border border-gray-200 rounded-full px-3 py-1.5 text-xs font-semibold text-gray-700">
                    <i className={`${b.icon} text-orange-500`}></i>
                    {b.label}
                  </span>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/assessment"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
                >
                  <i className="ri-file-text-line"></i>
                  Start ESA Assessment
                </Link>
                <Link
                  to="/esa-letter/florida"
                  className="inline-flex items-center justify-center gap-1.5 px-6 py-3 text-sm font-semibold text-gray-700 border border-gray-300 rounded-md hover:border-orange-400 hover:text-orange-600 transition-colors cursor-pointer bg-white/60"
                >
                  Florida ESA guide
                  <i className="ri-arrow-right-line text-xs"></i>
                </Link>
              </div>
              <p className="text-xs text-gray-400 mt-4 max-w-md leading-relaxed">
                A licensed provider decides whether an ESA is clinically appropriate — approval is never guaranteed.
              </p>
            </div>
            <div className="lg:col-span-5">
              <div className="bg-white rounded-2xl border border-orange-100 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.18)] p-6 max-w-sm mx-auto lg:ml-auto">
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="w-9 h-9 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center flex-shrink-0">
                    <i className="ri-scales-3-line text-lg"></i>
                  </span>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Key facts</p>
                    <p className="text-sm font-bold text-gray-900">Florida · § 760.27</p>
                  </div>
                </div>
                <ul className="space-y-2.5">
                  {heroFacts.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                      <i className="ri-checkbox-circle-fill text-orange-500 mt-0.5 flex-shrink-0"></i>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">Informational only, not legal advice.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed mb-4">
            Florida Statute § 760.27 builds on the federal Fair Housing Act and spells out what supporting information a housing provider may request for an emotional support animal, and who is qualified to provide it. It was written to protect legitimate ESA owners while curbing fraudulent online documents.
          </p>
          <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed">
            As with every state, the statute sets standards for documentation and process. It does not mean everyone qualifies — whether an emotional support animal is clinically appropriate is the licensed provider&rsquo;s decision.
          </p>
        </div>
      </section>

      <section className="py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">Florida documentation rules</h2>
            <p className="text-gray-500 text-sm max-w-2xl mx-auto">Key points from Florida Statute § 760.27.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {flPoints.map((p) => (
              <div key={p.title} className="bg-white rounded-2xl p-7 border border-gray-100">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-4">
                  <i className={`${p.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{p.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl border border-orange-100 bg-[#fdf6ee] p-6 max-w-3xl mx-auto">
            <p className="text-gray-700 text-sm leading-relaxed">
              <strong>Fraud penalty:</strong> Florida Statute § 817.265 makes it a second-degree misdemeanor to knowingly provide false ESA information or documentation for a housing accommodation. This is why a real, licensed evaluation matters.
            </p>
          </div>
        </div>
      </section>

      <VerificationPillarsSection variant="compact" showCTA showPrivacyNote className="bg-white" />

      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
              Common Questions
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Florida ESA housing FAQ</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className={`text-sm font-semibold ${openFaq === i ? "text-orange-500" : "text-gray-900"}`}>
                    {faq.q}
                  </span>
                  <i className={`${openFaq === i ? "ri-subtract-line" : "ri-add-line"} text-orange-500 ml-4 flex-shrink-0`}></i>
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

      <section className="py-12 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="rounded-2xl border border-gray-100 bg-[#fafafa] p-6">
            <h2 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Sources &amp; references</h2>
            <ul className="space-y-2 text-xs text-gray-500 leading-relaxed">
              <li>Florida Statute § 760.27 (emotional support animals in housing), effective July 1, 2020</li>
              <li>Florida Statute § 817.265 (penalty for false ESA information)</li>
              <li>Florida Commission on Human Relations — fair housing information</li>
              <li>Federal Fair Housing Act — 42 U.S.C. § 3601 et seq.</li>
            </ul>
            <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
              This page is for general information only and is not legal advice. Whether an ESA is clinically appropriate is determined by a licensed provider&rsquo;s evaluation, and approval of a housing accommodation is never guaranteed. For advice about your situation, consult a qualified Florida attorney or the Florida Commission on Human Relations.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">Start your Florida evaluation</h2>
          <p className="text-gray-500 mb-8">Connect with a provider qualified to issue documentation for Florida housing.</p>
          <Link
            to="/assessment"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer w-full sm:w-auto"
          >
            <i className="ri-file-text-line"></i>
            Begin Your ESA Assessment
          </Link>
        </div>
      </section>

      {/* Related guides */}
      <section className="py-14 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Related guides</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link to="/esa-laws" className="group bg-[#fafafa] rounded-xl border border-gray-100 p-5 hover:border-orange-200 transition-colors cursor-pointer">
              <div className="text-sm font-semibold text-gray-900 mb-1.5">ESA laws &amp; requirements</div>
              <p className="text-xs text-gray-600 leading-relaxed">What a valid ESA letter requires, and what it can and cannot do.</p>
            </Link>
            <Link to="/are-online-esa-letters-legit" className="group bg-[#fafafa] rounded-xl border border-gray-100 p-5 hover:border-orange-200 transition-colors cursor-pointer">
              <div className="text-sm font-semibold text-gray-900 mb-1.5">Are online ESA letters legit?</div>
              <p className="text-xs text-gray-600 leading-relaxed">How to tell a legitimate online ESA letter from a fake one.</p>
            </Link>
            <Link to="/housing-rights-esa" className="group bg-[#fafafa] rounded-xl border border-gray-100 p-5 hover:border-orange-200 transition-colors cursor-pointer">
              <div className="text-sm font-semibold text-gray-900 mb-1.5">ESA housing rights</div>
              <p className="text-xs text-gray-600 leading-relaxed">How the Fair Housing Act protects ESA owners in housing.</p>
            </Link>
          </div>
        </div>
      </section>

      <SharedFooter />
      <MobileStickyApplyCTA label="Start ESA Assessment" />
    </main>
  );
}
