// Los Angeles ESA landlord guide — /states/los-angeles-esa-landlord-guide
//
// Regional guide in the California ESA/PSD cluster (SEO-CA-ESA-PSD-CLUSTER-001).
// Converted from `los-angeles-esa-landlord-guide.md`. Compliance edits: no
// "legit/legitimate" in headings/meta; no guaranteed approval; links back to the
// parent /states/california-esa-psd-guide near the AB 468 / FHA / FEHA discussion.
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + Article/Breadcrumb/FAQ JSON-LD.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/states/los-angeles-esa-landlord-guide";
const PARENT = "/states/california-esa-psd-guide";

const topicChips = ["Los Angeles", "Rent Stabilization", "AB 468", "ESA Housing"];

// ── FAQs — mirror faq-schema.json → losAngelesGuide (visible + FAQPage JSON-LD) ─
const faqs = [
  {
    q: "Can a landlord in Los Angeles reject my ESA letter if the building has a 'No Pets' policy?",
    a: "No, provided the letter is AB 468-compliant. Under the Fair Housing Act and California's FEHA, a legitimate ESA is not classified as a pet, so landlords in Los Angeles, including those covered by the Rent Stabilization Ordinance, must grant a reasonable accommodation for a compliant ESA letter.",
  },
  {
    q: "Does the Los Angeles Rent Stabilization Ordinance protect me from eviction if I get an ESA?",
    a: "Yes, for RSO-covered units. Under the LA Rent Stabilization Ordinance and Just Cause Ordinance, a landlord cannot evict a tenant for adding a legitimate, AB 468-compliant ESA to the household, since that is not an enumerated just cause for eviction.",
  },
];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg md:text-xl font-extrabold text-gray-900 mt-10 mb-3 scroll-mt-28">{children}</h2>;
}
function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">{children}</p>;
}
const inlineLink = "text-orange-600 font-semibold hover:text-orange-700 underline decoration-orange-200 underline-offset-2";

export default function LosAngelesEsaLandlordGuidePage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="Los Angeles ESA landlord rules, LA Rent Stabilization Ordinance ESA, ESA no pets policy Los Angeles, AB 468 Los Angeles, ESA eviction protection LA, LA landlord pet rent ESA"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="Navigating Los Angeles Landlord ESA Rules | PawTenant" />
      <meta property="og:description" content="How Los Angeles tenant protections — the Rent Stabilization Ordinance and Just Cause Ordinance — layer on top of California's AB 468 ESA requirements." />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content="https://pawtenant.com/assets/lifestyle/woman-with-dog-new-apartment.jpg" />
      <meta property="article:published_time" content="2026-07-08" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content="https://pawtenant.com/assets/lifestyle/woman-with-dog-new-apartment.jpg" />
      <meta name="twitter:title" content="Navigating Los Angeles Landlord ESA Rules | PawTenant" />
      <meta name="twitter:description" content="LA's RSO and Just Cause Ordinance meet California AB 468 — what LA renters with an ESA should know." />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Article",
                "@id": `${CANONICAL}#article`,
                headline: "Navigating Los Angeles Landlord ESA Rules",
                description: "How Los Angeles tenant protections — the Rent Stabilization Ordinance and Just Cause Ordinance — layer on top of California's statewide AB 468 ESA requirements.",
                mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
                url: CANONICAL,
                image: ["https://pawtenant.com/assets/lifestyle/woman-with-dog-new-apartment.jpg"],
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
                  { "@type": "ListItem", position: 3, name: "Los Angeles Landlord ESA Rules", item: CANONICAL },
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
            <span className="text-gray-500">Los Angeles Landlord ESA Rules</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span key={chip} className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm">{chip}</span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[40px] font-extrabold text-gray-900 leading-tight mb-4">
            Navigating <span className="text-orange-500">Los Angeles Landlord ESA Rules</span>
          </h1>
          <div className="rounded-2xl bg-white border border-orange-200 shadow-[0_18px_45px_-25px_rgba(122,78,45,0.35)] p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-2.5 flex items-center gap-2"><i className="ri-flashlight-line"></i> Quick answer</p>
            <p className="text-sm md:text-[15px] text-gray-700 leading-relaxed">
              Renting in Los Angeles with an Emotional Support Animal means layering city-specific tenant
              protections on top of California&apos;s statewide{" "}
              <Link to={PARENT} className={inlineLink}>AB 468 requirements</Link>. The Rent Stabilization
              Ordinance adds real eviction protection for covered units — but it doesn&apos;t change the
              underlying AB 468 rule for how a compliant letter must be obtained.
            </p>
          </div>
        </div>
      </section>

      {/* ===== BODY ===== */}
      <article className="bg-white pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <SectionHeading>Can a landlord in Los Angeles reject my ESA letter if the building has a &quot;No Pets&quot; policy?</SectionHeading>
          <Para>
            No — but only if your documentation is compliant in the first place. Under the federal Fair Housing
            Act and California&apos;s Fair Employment and Housing Act (FEHA), a valid ESA is not classified as a
            pet, so a &quot;no pets&quot; clause cannot be used to deny a reasonable accommodation request. This
            applies to buildings governed by the Los Angeles Rent Stabilization Ordinance (RSO) just as much as
            it does to market-rate housing.
          </Para>
          <Para>
            That said, the protection only applies to a letter that actually satisfies AB 468 — meaning it comes
            from a California-licensed practitioner who has maintained a genuine 30-day client relationship with
            you and completed a clinical evaluation. A same-day or &quot;instant&quot; letter from an online mill
            doesn&apos;t carry this protection. The{" "}
            <Link to={PARENT} className={inlineLink}>California ESA &amp; PSD guide</Link> explains exactly what a
            compliant AB 468 letter must include.
          </Para>

          <SectionHeading>Does the Rent Stabilization Ordinance protect me from eviction if I get an ESA?</SectionHeading>
          <Para>
            Yes, for units the RSO covers. Under the LA Rent Stabilization Ordinance and the related Just Cause
            Ordinance (JCO), a landlord can&apos;t evict a tenant simply for adding a valid ESA to the household.
            Eviction under these ordinances requires a specifically enumerated &quot;just cause,&quot; and
            bringing in a properly documented assistance animal isn&apos;t one of them. The landlord still has
            the right to verify that your documentation meets AB 468&apos;s requirements, but once it does, the
            animal&apos;s presence isn&apos;t grounds for termination of tenancy.
          </Para>

          <SectionHeading>Which buildings does the RSO actually cover?</SectionHeading>
          <Para>
            The RSO generally applies to residential rental units built on or before October 1, 1978, in the
            City of Los Angeles specifically — it does not automatically extend to newer construction,
            single-family homes, or units outside city limits. If you&apos;re not sure whether your building
            qualifies, the Los Angeles Housing Department (LAHD) maintains lookup tools and can confirm RSO
            status by address. Regardless of RSO coverage, the Fair Housing Act and FEHA reasonable-accommodation
            protections for ESAs apply statewide and aren&apos;t contingent on rent control status.
          </Para>

          <SectionHeading>Can my landlord charge pet rent or a bigger deposit because of my ESA?</SectionHeading>
          <Para>
            No. This is a countywide rule, not something unique to RSO units: under the Fair Housing Act,
            landlords anywhere in LA County are prohibited from charging pet rent, pet fees, or an increased
            security deposit for a valid ESA or PSD. You remain liable for actual property damage the animal
            causes beyond normal wear and tear, but a landlord can&apos;t impose a blanket surcharge just for
            having the animal.
          </Para>

          <SectionHeading>What if my LA landlord asks for more than a compliant letter?</SectionHeading>
          <Para>
            A landlord can ask for documentation that meets AB 468&apos;s requirements — the practitioner&apos;s
            license details, confirmation of the 30-day relationship, and the clinical evaluation. What they
            generally can&apos;t do is demand your full medical records, insist on a specific form of their own
            design, or require registration through a third-party ESA &quot;certification&quot; service (no such
            registry is legally required or recognized in California). If an LA landlord is pushing back on a
            compliant letter, it&apos;s worth documenting the exchange in writing and, if needed, raising it with
            the Los Angeles Housing Department or California&apos;s Civil Rights Department (CRD).
          </Para>

          <SectionHeading>Practical steps for LA renters</SectionHeading>
          <ol className="list-decimal pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li>Confirm your building&apos;s RSO status through LAHD if eviction protections matter to your situation.</li>
            <li>Make sure your ESA letter includes your practitioner&apos;s active California license number, the 30-day relationship confirmation, and the required fraud-notice language.</li>
            <li>Submit your accommodation request in writing, and keep a copy along with the letter.</li>
            <li>If a landlord improperly denies the request or attempts to charge pet fees, file a complaint with LAHD or the CRD rather than assuming there&apos;s no recourse.</li>
          </ol>
          <Para>
            Los Angeles&apos;s local ordinances add real, additional protection against eviction for RSO tenants —
            but they don&apos;t change the underlying AB 468 requirement for how the letter itself must be
            obtained. Getting that part right, as covered in the{" "}
            <Link to={PARENT} className={inlineLink}>main California ESA &amp; PSD guide</Link>, is still the
            foundation everything else depends on.
          </Para>

          {/* ── CTA ── */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2"><i className="ri-stethoscope-line text-orange-500"></i> Starting your AB 468 process in Los Angeles?</p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              A California-licensed mental health professional can begin your 30-day evaluation and, when
              clinically appropriate, issue a compliant ESA letter. No outcome is guaranteed, and you get a
              refund if you don&apos;t qualify.
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
              { to: "/states/san-francisco-hoa-psd-guide", icon: "ri-community-line", label: "San Francisco HOA & PSD accommodations" },
              { to: "/states/san-diego-telehealth-guide", icon: "ri-video-chat-line", label: "San Diego telehealth & AB 468" },
              { to: "/esa-letter/california", icon: "ri-file-text-line", label: "California ESA letter guide" },
              { to: "/blog/2026-hud-esa-guidelines", icon: "ri-government-line", label: "2026 HUD ESA guidelines explained" },
              { to: "/housing-rights-esa", icon: "ri-home-heart-line", label: "ESA housing rights explained" },
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
              This guide summarizes Los Angeles and California housing rules and is not a substitute for advice
              from a licensed attorney. PawTenant connects you with licensed mental health professionals; it does
              not sell registrations, certificates, ID cards, or vests, and does not guarantee landlord approval
              or any legal outcome. Whether an ESA or PSD letter is issued is decided by a licensed provider after
              a real evaluation. For your specific situation, consult a fair-housing attorney, the Los Angeles
              Housing Department, or California&apos;s Civil Rights Department.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
