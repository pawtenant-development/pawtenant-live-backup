import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import VerificationPillarsSection from "../../components/feature/VerificationPillarsSection";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";

const heroBadges = [
  { icon: "ri-shield-check-line", label: "HIPAA-secure intake" },
  { icon: "ri-user-star-line", label: "Iowa-licensed providers" },
  { icon: "ri-qr-code-line", label: "Verifiable documentation" },
];

const heroFacts = [
  "Iowa Code § 216.8B (housing)",
  "SF 2268 — effective July 1, 2024",
  "30-day provider relationship certified",
  "Written clinical findings",
];

/**
 * /iowa-esa-letter-housing-rules — Iowa assistance-animal housing rules.
 *
 * Verified from authoritative sources:
 *  - Iowa Code § 216.8B ("Assistance animals and service animals in housing —
 *    penalty"): when a person's disability or disability-related need is not
 *    readily apparent, a landlord may request supporting information that
 *    reasonably supports the need, which may include documentation identified
 *    in § 216.8C(1). An "assistance animal" qualifies as a reasonable
 *    accommodation under the federal Fair Housing Act / Section 504.
 *  - Iowa Senate File 2268 (2024), effective July 1, 2024: a licensee (under
 *    Iowa Code chs. 148, 148C, 152, 154B, 154C, or 154D) who provides
 *    supporting documentation must make written findings — whether the person
 *    has a disability, whether they have a disability-related need for the
 *    animal, and the particular assistance the animal provides — and must
 *    certify whether a provider-patient relationship (in person or via
 *    telehealth) has existed for at least 30 days.
 *
 * Compliance-safe: housing framing only, no guaranteed approval, no public
 * access, informational not legal advice.
 */

const iowaPoints = [
  {
    icon: "ri-home-heart-line",
    title: "Assistance animals in housing",
    desc: "Iowa Code § 216.8B treats an assistance animal as a reasonable accommodation under the federal Fair Housing Act and Section 504 — not as a pet.",
  },
  {
    icon: "ri-file-list-3-line",
    title: "Supporting documentation",
    desc: "When your disability or disability-related need is not readily apparent, a landlord may request information that reasonably supports the need, including documentation described in Iowa Code § 216.8C.",
  },
  {
    icon: "ri-calendar-check-line",
    title: "30-day relationship (SF 2268)",
    desc: "Effective July 1, 2024, a licensed provider issuing supporting documentation must certify whether a provider-patient relationship — in person or by telehealth — has existed for at least 30 days.",
  },
  {
    icon: "ri-clipboard-line",
    title: "Written clinical findings",
    desc: "Under SF 2268, the provider makes written findings about whether you have a disability, a disability-related need for the animal, and the particular assistance the animal provides.",
  },
];

const faqs = [
  {
    q: "What documentation can an Iowa landlord ask for?",
    a: "Under Iowa Code § 216.8B, if your disability or disability-related need for an assistance animal is not readily apparent, the landlord may request information that reasonably supports the need — which may include documentation described in Iowa Code § 216.8C. A landlord should not demand your specific diagnosis or detailed medical records.",
  },
  {
    q: "Does Iowa have a 30-day rule for ESA letters?",
    a: "Effectively, yes. Iowa Senate File 2268 (effective July 1, 2024) requires a licensed provider who issues supporting documentation to certify whether a provider-patient relationship — in person or via telehealth — has existed for at least 30 days. The provider also makes written findings about your disability, your disability-related need, and the assistance the animal provides.",
  },
  {
    q: "Can my Iowa landlord charge a pet fee or deposit for my assistance animal?",
    a: "Because a qualifying assistance animal is treated as a reasonable accommodation rather than a pet, pet fees and pet deposits generally do not apply. You can still be held responsible for any actual damage the animal causes. For your specific lease and situation, confirm with a fair-housing resource or attorney.",
  },
  {
    q: "Does an Iowa ESA letter let my animal go into stores or restaurants?",
    a: "No. Iowa's assistance-animal housing rules and the federal Fair Housing Act focus on housing. Public-access rights to businesses are reserved for trained service dogs under the ADA, not emotional support animals.",
  },
  {
    q: "Will my Iowa landlord have to approve my assistance animal?",
    a: "Not automatically. Housing providers must consider reasonable-accommodation requests, but each is evaluated individually. Proper documentation from a licensed provider supports your request; it does not guarantee approval, and a provider issues a letter only when an ESA is clinically appropriate.",
  },
  {
    q: "Is there a penalty for misrepresentation in Iowa?",
    a: "Yes. Iowa Code § 216.8B includes a penalty for misrepresenting an animal as an assistance animal or service animal. This is one reason a genuine, licensed evaluation matters.",
  },
];

export default function IowaESAHousingRulesPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="Iowa ESA letter, Iowa assistance animal housing, Iowa Code 216.8B, Iowa SF 2268, Iowa ESA housing rules, emotional support animal Iowa"
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
                Iowa · § 216.8B &amp; SF 2268
              </span>
              <h1 className="text-[28px] sm:text-4xl md:text-5xl font-bold text-gray-900 mb-5 leading-[1.12]">
                Iowa ESA Letter &amp; Housing Rules
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed max-w-xl mb-6">
                Iowa protects assistance animals in housing under Iowa Code § 216.8B, and a 2024 law (Senate File 2268) adds clear documentation and provider-relationship standards. Here&rsquo;s what Iowa renters and providers need to know.
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
                  to="/esa-letter/iowa"
                  className="inline-flex items-center justify-center gap-1.5 px-6 py-3 text-sm font-semibold text-gray-700 border border-gray-300 rounded-md hover:border-orange-400 hover:text-orange-600 transition-colors cursor-pointer bg-white/60"
                >
                  Iowa ESA guide
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
                    <p className="text-sm font-bold text-gray-900">Iowa · § 216.8B &amp; SF 2268</p>
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
            Iowa Code § 216.8B governs assistance animals and service animals in housing. It mirrors the federal Fair Housing Act&rsquo;s reasonable-accommodation framework: a qualifying assistance animal is not a &ldquo;pet,&rdquo; and a landlord may request information supporting your need only when your disability or disability-related need is not readily apparent.
          </p>
          <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed">
            Senate File 2268, effective July 1, 2024, adds standards for the licensed providers who write supporting documentation — including written clinical findings and a provider-relationship certification. As with every state, the law sets the process; it does not mean everyone qualifies.
          </p>
        </div>
      </section>

      <section className="py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">Iowa housing &amp; documentation rules</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {iowaPoints.map((p) => (
              <div key={p.title} className="bg-white rounded-2xl p-7 border border-gray-100">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-4">
                  <i className={`${p.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{p.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{p.desc}</p>
              </div>
            ))}
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
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Iowa ESA housing FAQ</h2>
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
              <li>Iowa Code § 216.8B and § 216.8C (assistance animals and service animals in housing)</li>
              <li>Iowa Senate File 2268 (2024), effective July 1, 2024</li>
              <li>Iowa Civil Rights Commission — housing accommodations guidance</li>
              <li>Federal Fair Housing Act — 42 U.S.C. § 3601 et seq.</li>
            </ul>
            <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
              This page is for general information only and is not legal advice. Whether an ESA is clinically appropriate is determined by a licensed provider&rsquo;s evaluation, and approval of a housing accommodation is never guaranteed. For advice about your situation, consult a qualified Iowa attorney or the Iowa Civil Rights Commission.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">Start your Iowa evaluation</h2>
          <p className="text-gray-500 mb-8">Connect with a provider licensed in Iowa.</p>
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
