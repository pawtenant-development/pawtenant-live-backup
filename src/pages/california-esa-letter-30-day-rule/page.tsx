import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import VerificationPillarsSection from "../../components/feature/VerificationPillarsSection";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";

const heroBadges = [
  { icon: "ri-shield-check-line", label: "HIPAA-secure intake" },
  { icon: "ri-user-star-line", label: "CA-licensed providers" },
  { icon: "ri-qr-code-line", label: "Verifiable documentation" },
];

const heroFacts = [
  "Effective January 1, 2022 (AB 468)",
  "30-day provider-client relationship",
  "Clinical evaluation required",
  "Valid, active provider license",
];

/**
 * /california-esa-letter-30-day-rule — California AB 468 explainer.
 *
 * Verified from authoritative sources:
 *  - California AB 468 (Chapter 168, Statutes of 2021), effective Jan 1, 2022,
 *    added Health & Safety Code Article 4 (§§ 122317–122319).
 *  - § 122318 (provider criteria for ESA documentation) requires the health
 *    care practitioner to: hold a valid, active license and state the license
 *    type, number, jurisdiction, and effective date in the documentation; be
 *    licensed to provide the relevant professional services in the jurisdiction
 *    where the documentation is provided; establish a client-provider
 *    relationship with the individual for at least 30 days before providing
 *    the documentation (exception for individuals experiencing homelessness);
 *    complete a clinical evaluation of the individual regarding the need for
 *    the emotional support dog; and provide notice that fraudulently passing
 *    off a dog as a service dog is a misdemeanor.
 *  - § 122317 requires ESA-product sellers to give written consumer notices.
 *  - § 122319 sets escalating civil penalties ($500 / $1,000 / $2,500).
 *
 * Compliance-safe: no guaranteed approval, no "everyone qualifies", housing
 * accommodation framing only (no public access), informational not legal advice.
 */

const ab468Points = [
  {
    icon: "ri-shield-check-line",
    title: "A valid, active license",
    desc: "The provider must hold a valid, active license, and the documentation must state the license type, license number, jurisdiction, and effective date.",
  },
  {
    icon: "ri-map-pin-line",
    title: "Licensed in the right place",
    desc: "The provider must be licensed to deliver the relevant professional services in the jurisdiction where the documentation is provided.",
  },
  {
    icon: "ri-calendar-check-line",
    title: "A 30-day relationship",
    desc: "Except for individuals experiencing homelessness, the provider must hold a client-provider relationship with you for at least 30 days before issuing ESA documentation.",
  },
  {
    icon: "ri-stethoscope-line",
    title: "A clinical evaluation",
    desc: "The provider must complete a clinical evaluation of your need for an emotional support dog — there is no automatic or guaranteed approval.",
  },
];

const faqs = [
  {
    q: "What is California's 30-day rule for ESA letters?",
    a: "Under AB 468 (in effect since January 1, 2022, codified at California Health & Safety Code § 122318), a health care practitioner must hold a client-provider relationship with you for at least 30 days before issuing emotional support animal documentation. There is a limited exception for individuals experiencing homelessness. The rule is designed to ensure ESA letters follow a genuine clinical relationship rather than a one-click transaction.",
  },
  {
    q: "Does the 30-day rule mean I have to wait a full month?",
    a: "It means a qualifying provider relationship must exist for at least 30 days before the ESA documentation is issued. In practice this typically involves more than one contact with the provider. Because timing depends on your provider and circumstances, we cannot promise a specific date — and we cannot promise that you will qualify, since that is the provider's clinical decision.",
  },
  {
    q: "What information must a California ESA letter include?",
    a: "AB 468 requires the documentation to reflect a valid, active license and to state the provider's license type, license number, jurisdiction, and effective date. The provider must be licensed to provide the relevant services in the jurisdiction where the documentation is issued, and must complete a clinical evaluation of your need.",
  },
  {
    q: "Are there penalties for fake ESA letters in California?",
    a: "Yes. AB 468 added escalating civil penalties (§ 122319) for misrepresentation, and sellers of ESA products must provide specific written consumer notices (§ 122317). Fraudulently representing a dog as a service dog can also be a misdemeanor. This is part of why a real, licensed evaluation matters.",
  },
  {
    q: "Does an ESA letter give my animal access to public places in California?",
    a: "No. California's ESA rules and the federal Fair Housing Act focus on housing. Public-access rights to businesses are reserved for trained service dogs under the ADA. An ESA letter does not grant access to stores, restaurants, or hotels.",
  },
  {
    q: "Will my California landlord have to approve my ESA?",
    a: "Not automatically. The Fair Housing Act requires housing providers to consider reasonable-accommodation requests, but each request is evaluated individually. A valid letter from a properly licensed California provider supports your request; it does not guarantee approval.",
  },
];

export default function CaliforniaESA30DayRulePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="California ESA letter, California 30 day rule, AB 468 emotional support animal, California ESA law, Health and Safety Code 122318, California ESA letter requirements"
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
                California · AB 468
              </span>
              <h1 className="text-[28px] sm:text-4xl md:text-5xl font-bold text-gray-900 mb-5 leading-[1.12]">
                California ESA Letters &amp; the 30-Day Rule
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed max-w-xl mb-6">
                Since January 1, 2022, California law (AB 468) sets specific standards for emotional support animal documentation — including a required provider-client relationship of at least 30 days. Here&rsquo;s what that means for you.
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
                  to="/esa-letter/california"
                  className="inline-flex items-center justify-center gap-1.5 px-6 py-3 text-sm font-semibold text-gray-700 border border-gray-300 rounded-md hover:border-orange-400 hover:text-orange-600 transition-colors cursor-pointer bg-white/60"
                >
                  California ESA guide
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
                    <p className="text-sm font-bold text-gray-900">California · AB 468</p>
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

      {/* Intro */}
      <section className="py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed mb-4">
            Assembly Bill 468 took effect on January 1, 2022 and added Article 4 to the California Health &amp; Safety Code (§§ 122317–122319). It was written to curb fraudulent &ldquo;instant&rdquo; ESA documentation by requiring that letters come from a properly licensed provider following a genuine clinical relationship.
          </p>
          <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed">
            Importantly, the law sets standards for <strong>how</strong> a letter is issued. It does not mean everyone qualifies — whether an emotional support animal is clinically appropriate remains the licensed provider&rsquo;s decision.
          </p>
        </div>
      </section>

      {/* AB468 requirements */}
      <section className="py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
              What AB 468 requires of the provider
            </h2>
            <p className="text-gray-500 text-sm max-w-2xl mx-auto">
              California Health &amp; Safety Code § 122318 sets the criteria below.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {ab468Points.map((p) => (
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
              <strong>Consumer protection:</strong> AB 468 also requires sellers of ESA products to provide written notices to buyers (§ 122317) and adds escalating civil penalties for misrepresentation (§ 122319). These provisions exist to protect Californians from fake ESA &ldquo;registrations&rdquo; and certificates.
            </p>
          </div>
        </div>
      </section>

      <VerificationPillarsSection variant="compact" showCTA showPrivacyNote className="bg-white" />

      {/* FAQ */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
              Common Questions
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">California ESA &amp; 30-day rule FAQ</h2>
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

      {/* Sources + disclaimer */}
      <section className="py-12 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="rounded-2xl border border-gray-100 bg-[#fafafa] p-6">
            <h2 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Sources &amp; references</h2>
            <ul className="space-y-2 text-xs text-gray-500 leading-relaxed">
              <li>California Assembly Bill 468 (Chapter 168, Statutes of 2021), effective January 1, 2022</li>
              <li>California Health &amp; Safety Code §§ 122317, 122318, 122319</li>
              <li>California Board of Behavioral Sciences (BBS) — AB 468 information for licensees</li>
              <li>Federal Fair Housing Act — 42 U.S.C. § 3601 et seq.</li>
            </ul>
            <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
              This page is for general information only and is not legal advice. Statutory details and timing depend on your provider and circumstances. Whether an ESA is clinically appropriate is determined by a licensed provider&rsquo;s evaluation, and approval of a housing accommodation is never guaranteed. For advice about your situation, consult a qualified California attorney.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">Start your California evaluation</h2>
          <p className="text-gray-500 mb-8">Connect with a provider licensed in California who follows AB 468.</p>
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
