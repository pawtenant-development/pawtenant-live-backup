// San Diego telehealth ESA guide — /states/san-diego-telehealth-guide
//
// Regional guide in the California ESA/PSD cluster (SEO-CA-ESA-PSD-CLUSTER-001).
// Converted from `san-diego-telehealth-guide.md`. Compliance: no
// "legit/legitimate" in headings/meta; no guaranteed approval / same-day
// promises. Links back to /states/california-esa-psd-guide near the AB 468
// telehealth requirements.
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + Article/Breadcrumb/FAQ JSON-LD.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/states/san-diego-telehealth-guide";
const PARENT = "/states/california-esa-psd-guide";

const topicChips = ["San Diego", "Telehealth", "AB 468", "California License"];

// ── FAQs — mirror faq-schema.json → sanDiegoGuide (visible + FAQPage JSON-LD) ──
const faqs = [
  {
    q: "Can a remote telehealth therapist write a valid ESA letter for a San Diego resident?",
    a: "Yes, but only if the practitioner complies fully with AB 468: holding an active California license, being licensed for the jurisdiction where the client is located, establishing a 30-day client relationship, and completing a clinical evaluation.",
  },
  {
    q: "What mandatory disclosures must a San Diego ESA letter contain to be legal?",
    a: "The letter must state the clinician's license number, license type, effective date, and jurisdiction, confirm the 30-day relationship requirement was met, and include a notice that misrepresenting the animal as a service animal violates California law.",
  },
];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg md:text-xl font-extrabold text-gray-900 mt-10 mb-3 scroll-mt-28">{children}</h2>;
}
function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">{children}</p>;
}
const inlineLink = "text-orange-600 font-semibold hover:text-orange-700 underline decoration-orange-200 underline-offset-2";

export default function SanDiegoTelehealthGuidePage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="San Diego telehealth ESA letter, AB 468 telehealth, California license ESA letter San Diego, remote ESA evaluation California, 30-day rule telehealth, San Diego ESA landlord"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="San Diego Telehealth Mental Health Guidelines Under AB 468 | PawTenant" />
      <meta property="og:description" content="How California's AB 468 applies to remote ESA evaluations for San Diego residents — California licensure, the 30-day relationship rule, and mandatory letter disclosures." />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content="https://pawtenant.com/assets/lifestyle/woman-telehealth-with-dog.jpg" />
      <meta property="article:published_time" content="2026-07-08" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content="https://pawtenant.com/assets/lifestyle/woman-telehealth-with-dog.jpg" />
      <meta name="twitter:title" content="San Diego Telehealth Mental Health Guidelines Under AB 468 | PawTenant" />
      <meta name="twitter:description" content="AB 468 applies to remote ESA evaluations too — California licensure, the 30-day rule, and required disclosures for San Diego renters." />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Article",
                "@id": `${CANONICAL}#article`,
                headline: "San Diego Telehealth Mental Health Guidelines Under AB 468",
                description: "How California's AB 468 applies just as fully to remote ESA evaluations as to in-person ones for San Diego residents — licensure, the 30-day rule, and mandatory disclosures.",
                mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
                url: CANONICAL,
                image: ["https://pawtenant.com/assets/lifestyle/woman-telehealth-with-dog.jpg"],
                datePublished: "2026-07-08",
                dateModified: "2026-07-08",
                author: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                publisher: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                articleSection: "Legal & Rights",
                keywords: topicChips.join(", "),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: "https://pawtenant.com/" },
                  { "@type": "ListItem", position: 2, name: "California ESA & PSD Guide", item: `https://pawtenant.com${PARENT}` },
                  { "@type": "ListItem", position: 3, name: "San Diego Telehealth & AB 468", item: CANONICAL },
                ],
              },
              {
                "@type": "FAQPage",
                mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
              },
            ],
          }),
        }}
      />

      <SharedNavbar />

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden bg-gradient-to-b from-orange-50 via-[#fffaf4] to-white pt-28 pb-12 sm:pt-32 sm:pb-14">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <nav className="text-xs text-gray-400 mb-5" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-orange-600">Home</Link>
            <span className="mx-1.5">/</span>
            <Link to={PARENT} className="hover:text-orange-600">California ESA &amp; PSD Guide</Link>
            <span className="mx-1.5">/</span>
            <span className="text-gray-500">San Diego Telehealth &amp; AB 468</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span key={chip} className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm">{chip}</span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[40px] font-extrabold text-gray-900 leading-tight mb-4">
            San Diego Telehealth Mental Health Guidelines <span className="text-orange-500">Under AB 468</span>
          </h1>
          <div className="rounded-2xl bg-white border border-orange-200 shadow-[0_18px_45px_-25px_rgba(122,78,45,0.35)] p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-2.5 flex items-center gap-2"><i className="ri-flashlight-line"></i> Quick answer</p>
            <p className="text-sm md:text-[15px] text-gray-700 leading-relaxed">
              Getting an ESA letter through a telehealth provider while living in San Diego is common — but{" "}
              <Link to={PARENT} className={inlineLink}>AB 468</Link> applies just as fully to remote evaluations
              as it does to in-person ones. The delivery method changes; the statutory floor — a California
              license and a genuine 30-day relationship — does not.
            </p>
          </div>
        </div>
      </section>

      {/* ===== BODY ===== */}
      <article className="bg-white pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <SectionHeading>Can a remote telehealth therapist write a valid ESA letter for a San Diego resident?</SectionHeading>
          <Para>Yes, provided the practitioner complies fully with AB 468. That means the provider must:</Para>
          <ul className="list-disc pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li>Hold an active, valid license issued by a California medical or mental health board.</li>
            <li>Be licensed to practice in the jurisdiction where you&apos;re physically located — which, for a San Diego resident, means a California license, not a license from another state, even if the telehealth platform is based elsewhere.</li>
            <li>Establish a client-provider relationship with you for at least 30 days before issuing the letter.</li>
            <li>Conduct a genuine clinical evaluation, typically across at least two sessions, assessing your need for the animal.</li>
          </ul>
          <Para>
            A telehealth format doesn&apos;t relax any of these requirements. The 30-day relationship rule
            applies exactly the same way it would for an in-person psychologist&apos;s office in downtown San
            Diego — the delivery method changes, but the statutory floor doesn&apos;t.
          </Para>

          <SectionHeading>What mandatory disclosures must a San Diego ESA letter contain to be legal?</SectionHeading>
          <Para>To meet California&apos;s requirements, the letter should include:</Para>
          <ul className="list-disc pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li>The clinician&apos;s full name, license number, license type, and effective date.</li>
            <li>The jurisdiction in which the license was issued and where the documentation was provided.</li>
            <li>Confirmation that the required 30-day client-provider relationship has been met.</li>
            <li>A statement covering the individual&apos;s diagnosed condition and how the animal supports treatment.</li>
            <li>A formal notice that misrepresenting an ESA as a service animal is a violation of California law — existing state law already makes fraudulent service-animal misrepresentation a misdemeanor, and AB 468 layers additional civil penalties specifically for ESA documentation fraud.</li>
          </ul>
          <Para>
            If a telehealth letter is missing any of these elements, a San Diego landlord has grounds to treat it
            as non-compliant, regardless of how professional the service otherwise appears. The{" "}
            <Link to={PARENT} className={inlineLink}>main California ESA &amp; PSD guide</Link> lists the full set
            of AB 468 disclosures a compliant letter needs.
          </Para>

          <SectionHeading>Does the practitioner need to be located in San Diego specifically?</SectionHeading>
          <Para>
            No — but they do need to be licensed in California and to confirm that the evaluation maps to where
            you, the client, are physically located during your sessions. In practice, a therapist practicing
            telehealth from Sacramento or Los Angeles can validly treat a San Diego-based client, as long as
            their California license is active and the sessions genuinely occurred while you were in California.
            What doesn&apos;t work is a practitioner licensed only in another state treating a California resident
            remotely — AB 468&apos;s jurisdiction requirement exists specifically to close that gap.
          </Para>

          <SectionHeading>How can I verify a telehealth provider&apos;s license before starting?</SectionHeading>
          <Para>
            California&apos;s Department of Consumer Affairs maintains searchable license-verification tools
            covering the state&apos;s health boards, including the Board of Psychology and the Board of
            Behavioral Sciences (which oversees licensed clinical social workers, marriage and family therapists,
            and professional clinical counselors). Before committing to a 30-day telehealth relationship, it&apos;s
            worth confirming the practitioner&apos;s license is active and in good standing — this is also the
            same tool a skeptical landlord may use to check your letter, so it&apos;s worth doing yourself first.
          </Para>

          <SectionHeading>What telehealth safeguards protect San Diego consumers?</SectionHeading>
          <Para>
            Beyond license verification, the main safeguard is simply the 30-day rule itself: any telehealth
            service offering an ESA letter in a single session, or within a few days, isn&apos;t operating within
            AB 468 regardless of how it&apos;s marketed. Compliant telehealth mental health providers serving San
            Diego residents will be upfront that the process takes at least a month and typically involves more
            than one appointment — if a service promises same-day or 24-hour turnaround for a first-time ESA
            letter, that&apos;s a signal the documentation won&apos;t hold up if challenged.
          </Para>

          <SectionHeading>What if my San Diego landlord rejects a letter I believe is compliant?</SectionHeading>
          <Para>
            Ask the landlord to specify which element they believe is missing — often it&apos;s simply that the
            letter didn&apos;t clearly state the 30-day relationship or the practitioner&apos;s license details.
            If the letter genuinely meets AB 468&apos;s requirements and the landlord still won&apos;t accommodate
            it, California&apos;s Civil Rights Department (CRD) accepts complaints related to housing
            discrimination, and a local fair housing attorney can advise on next steps specific to San Diego
            County housing.
          </Para>

          {/* ── CTA ── */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2"><i className="ri-video-chat-line text-orange-500"></i> Considering a telehealth evaluation in San Diego?</p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              PawTenant connects San Diego residents with California-licensed mental health professionals who
              follow AB 468 — including the 30-day relationship and required disclosures. No outcome is
              guaranteed, and you get a refund if you don&apos;t qualify.
            </p>
            <Link to={withAttribution("/assessment")} className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm">
              <i className="ri-clipboard-line"></i> Start your ESA assessment
            </Link>
          </div>
        </div>
      </article>

      {/* ===== FAQ ===== */}
      <section className="py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-8 text-center">Frequently asked questions</h2>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <div key={f.q} className="border border-gray-200 rounded-xl overflow-hidden">
                <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer hover:bg-gray-50 transition-colors" aria-expanded={openFaq === i}>
                  <span className="text-sm font-bold text-gray-900">{f.q}</span>
                  <i className={`ri-arrow-down-s-line text-gray-400 text-lg flex-shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`}></i>
                </button>
                {openFaq === i && (<div className="px-5 pb-4 -mt-1"><p className="text-sm text-gray-600 leading-relaxed">{f.a}</p></div>)}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== KEEP READING ===== */}
      <section className="py-12 bg-[#fdf6ee] border-t border-orange-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-5 text-center">Keep reading</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
            {[
              { to: PARENT, icon: "ri-map-pin-2-line", label: "California ESA & PSD legal guide (AB 468)" },
              { to: "/states/los-angeles-esa-landlord-guide", icon: "ri-building-line", label: "Los Angeles landlord ESA rules" },
              { to: "/states/san-francisco-hoa-psd-guide", icon: "ri-community-line", label: "San Francisco HOA & PSD accommodations" },
              { to: "/california-esa-letter-30-day-rule", icon: "ri-calendar-check-line", label: "California ESA 30-day rule (AB 468)" },
              { to: "/how-to-get-esa-letter-online", icon: "ri-computer-line", label: "How to get an ESA letter online" },
              { to: "/esa-letter/california", icon: "ri-file-text-line", label: "California ESA letter guide" },
            ].map((r) => (
              <Link key={r.to} to={r.to} className="flex items-center gap-3 h-full bg-white border border-orange-100 rounded-xl px-4 py-3.5 hover:border-orange-300 hover:shadow-sm transition-all">
                <i className={`${r.icon} text-orange-500 text-lg flex-shrink-0`}></i>
                <span className="text-sm font-semibold text-gray-800">{r.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== DISCLAIMER ===== */}
      <section className="py-10 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-gray-400 text-lg mt-0.5"></i>
            <p className="text-xs text-gray-500 leading-relaxed">
              <strong className="text-gray-600">Informational only — not legal advice.</strong>{" "}
              This guide summarizes California&apos;s AB 468 telehealth rules and is not a substitute for advice
              from a licensed attorney. PawTenant connects you with licensed mental health professionals; it does
              not sell registrations, certificates, ID cards, or vests, and does not guarantee landlord approval
              or same-day letters. A compliant ESA letter requires a genuine 30-day California-licensed provider
              relationship. For your specific situation, consult a fair-housing attorney or California&apos;s
              Civil Rights Department.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
