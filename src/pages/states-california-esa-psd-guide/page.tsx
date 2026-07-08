// California ESA & PSD guide — /states/california-esa-psd-guide
//
// Main guide of the California ESA/PSD content cluster (SEO-CA-ESA-PSD-CLUSTER-001).
// Converted from the SEO team's `california-esa-psd-guide.md` with PawTenant
// compliance edits: no "legit/legitimate" in headings/meta (softened to
// "valid"/"recognized"); PSD documentation supports housing AND travel and a
// letter does NOT create service-dog status (task training does); no guaranteed
// approval / government-approved / official-registry / certification claims.
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + Article/Breadcrumb/FAQ
// JSON-LD. Styling mirrors /blog/2026-hud-esa-guidelines.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/states/california-esa-psd-guide";

const topicChips = ["California AB 468", "ESA vs PSD", "FEHA & FHA", "30-Day Rule"];

// ── ESA vs PSD comparison (from the guide's "Key functional differences") ─────
const comparisonRows = [
  {
    feature: "Documentation timeline",
    esa: "Minimum 30-day clinical relationship required (AB 468)",
    psd: "No statutory waiting period — timeline depends on the dog's actual training",
  },
  {
    feature: "Legal framework",
    esa: "Fair Housing Act / California FEHA — housing",
    psd: "ADA / FEHA — housing, and also public access and air travel",
  },
  {
    feature: "Eligible species",
    esa: "Any domesticated animal commonly kept in households",
    psd: "Dogs only (with a narrow allowance for miniature horses under the ADA)",
  },
  {
    feature: "Training requirement",
    esa: "None — the animal provides comfort by its presence",
    psd: "Must be individually trained to perform a specific task related to the handler's disability",
  },
  {
    feature: "Public access rights",
    esa: "Generally none — centered on housing (and, per FEHA, the workplace in some cases)",
    psd: "Broad public access under the ADA",
  },
  {
    feature: "What a landlord can ask",
    esa: "May request a compliant letter",
    psd: "May ask only whether the dog is required for a disability and what task it's trained to perform — not for medical records",
  },
];

// ── FAQs — mirror faq-schema.json → mainGuide (visible + FAQPage JSON-LD) ─────
const faqs = [
  {
    q: "What is the California 30-day ESA rule under AB 468?",
    a: "AB 468 requires a California-licensed health care practitioner to hold an active license, be licensed in the jurisdiction where the client is located, establish a client-provider relationship of at least 30 days, complete a clinical evaluation of the need for an emotional support dog, and provide notice that misrepresenting the animal as a service animal is unlawful, before issuing ESA documentation.",
  },
  {
    q: "Can a California landlord legally reject an instant or same-day online ESA letter?",
    a: "Yes. An ESA letter issued without a genuine 30-day clinical relationship does not meet AB 468's statutory requirements, and California landlords may treat such a letter as invalid.",
  },
  {
    q: "Does the California 30-day waiting period apply to Psychiatric Service Dogs?",
    a: "No. AB 468's 30-day relationship rule applies specifically to emotional support dog documentation. Psychiatric Service Dogs are governed by the ADA and California's Fair Employment and Housing Act, and their status depends on the dog being individually trained to perform a task that mitigates the handler's disability, not on any waiting period.",
  },
  {
    q: "Can a California landlord charge pet rent or an extra deposit for a valid ESA or PSD?",
    a: "No. Under the federal Fair Housing Act and California's Fair Employment and Housing Act, legitimate assistance animals are not classified as pets, so landlords cannot charge pet rent, pet fees, or additional security deposits for a valid ESA or PSD, though tenants remain responsible for actual property damage.",
  },
  {
    q: "What information must a compliant California ESA letter include?",
    a: "A compliant letter should include the practitioner's active California license number, license type, and effective date; confirmation of the required 30-day client-provider relationship; documentation of the clinical evaluation and diagnosed condition; and a notice that misrepresenting the animal as a service animal violates California law.",
  },
  {
    q: "What are the penalties for misrepresenting an ESA as a service animal in California?",
    a: "Existing California law makes fraudulent representation of an animal as a service dog a misdemeanor under Penal Code section 365.7, punishable by up to six months in county jail and a fine. AB 468 adds escalating civil penalties specifically for ESA-related misrepresentation.",
  },
  {
    q: "Can a California HOA deny my ESA or PSD?",
    a: "No. California homeowners associations must comply with the Fair Housing Act and FEHA and cannot deny a reasonable accommodation for a valid ESA or PSD based on no-pet rules, and cannot enforce weight or breed restrictions or charge pet fees for a legitimate PSD.",
  },
];

function SectionHeading({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-xl md:text-2xl font-extrabold text-gray-900 mt-12 mb-4 scroll-mt-28">
      {children}
    </h2>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base md:text-lg font-bold text-gray-900 mt-8 mb-3">{children}</h3>;
}

function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">{children}</p>;
}

const inlineLink = "text-orange-600 font-semibold hover:text-orange-700 underline decoration-orange-200 underline-offset-2";

export default function CaliforniaEsaPsdGuidePage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="California ESA letter, California PSD letter, AB 468 30-day rule, California emotional support animal law, psychiatric service dog California, ESA vs PSD California, FEHA assistance animal, California ESA housing rights, ESA pet fees California"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="California ESA & PSD Legal Guide: AB 468 and Housing Protections" />
      <meta
        property="og:description"
        content="A plain-English compliance guide to California's AB 468 30-day ESA rule, how ESAs and Psychiatric Service Dogs differ, what landlords and HOAs can and can't do, and what a compliant letter needs."
      />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content="https://pawtenant.com/assets/lifestyle/person-paperwork-with-dog.jpg" />
      <meta property="article:published_time" content="2026-07-08" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content="https://pawtenant.com/assets/lifestyle/person-paperwork-with-dog.jpg" />
      <meta name="twitter:title" content="California ESA & PSD Legal Guide: AB 468 and Housing Protections" />
      <meta
        name="twitter:description"
        content="California's AB 468 30-day rule, ESA vs PSD, landlord and HOA limits, and what a compliant letter needs — explained clearly."
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Article",
                "@id": `${CANONICAL}#article`,
                headline: "California ESA & PSD Legal Guide: Navigating AB 468 and Housing Protections",
                description:
                  "A plain-English compliance guide to California's AB 468 30-day ESA rule, how emotional support animals and Psychiatric Service Dogs differ, what landlords and HOAs can and can't do, and what a compliant ESA or PSD letter must contain.",
                mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
                url: CANONICAL,
                image: ["https://pawtenant.com/assets/lifestyle/person-paperwork-with-dog.jpg"],
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
                  { "@type": "ListItem", position: 2, name: "California ESA & PSD Guide", item: CANONICAL },
                ],
              },
              {
                "@type": "FAQPage",
                mainEntity: faqs.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
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
            <span className="text-gray-500">California ESA &amp; PSD Guide</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span key={chip} className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm">
                {chip}
              </span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[42px] font-extrabold text-gray-900 leading-tight mb-4">
            California ESA &amp; PSD Legal Guide:{" "}
            <span className="text-orange-500">Navigating AB 468 and Housing Protections</span>
          </h1>
          <p className="text-sm md:text-base text-gray-500 italic mb-6">
            A plain-English compliance guide for California tenants seeking valid Emotional Support Animal
            (ESA) or Psychiatric Service Dog (PSD) documentation.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-6">
            <span className="inline-flex items-center gap-1.5"><i className="ri-calendar-line text-orange-400"></i> Updated July 2026</span>
            <span className="inline-flex items-center gap-1.5"><i className="ri-time-line text-orange-400"></i> ~11 min read</span>
            <span className="inline-flex items-center gap-1.5"><i className="ri-user-line text-orange-400"></i> PawTenant Editorial — reviewed for accuracy</span>
          </div>

          <div className="rounded-2xl bg-white border border-orange-200 shadow-[0_18px_45px_-25px_rgba(122,78,45,0.35)] p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-2.5 flex items-center gap-2">
              <i className="ri-flashlight-line"></i> Quick answer
            </p>
            <p className="text-sm md:text-[15px] text-gray-700 leading-relaxed">
              California&apos;s AB 468 sets a real floor — a genuine 30-day clinical relationship — for
              ESA documentation, and no compliant provider can shortcut it. A Psychiatric Service Dog
              (PSD) follows a different track entirely, tied to actual{" "}
              <Link to="/blog/how-to-train-psychiatric-service-dog-tasks" className={inlineLink}>
                task training
              </Link>{" "}
              rather than paperwork timing. This guide walks through what the law requires, how ESAs and
              PSDs differ, what landlords and HOAs can and can&apos;t do, and what a compliant letter needs.
            </p>
          </div>

          <figure className="mt-8">
            <img
              src="/assets/lifestyle/person-paperwork-with-dog.jpg"
              alt="California renter reviewing ESA and PSD housing documents at home with their dog"
              width={1400}
              height={1051}
              fetchPriority="high"
              decoding="async"
              className="w-full h-52 sm:h-80 md:h-[26rem] object-cover rounded-3xl border border-orange-100 shadow-[0_24px_60px_-30px_rgba(122,78,45,0.35)]"
            />
          </figure>

          <p className="text-xs text-gray-400 mt-4 leading-relaxed">
            Nothing here is legal advice — for a dispute with a landlord or HOA, talk to a housing attorney
            or California&apos;s Civil Rights Department. This gives you an accurate map of the rules before
            you start.
          </p>
        </div>
      </section>

      {/* ===== ARTICLE BODY ===== */}
      <article className="bg-white pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">

          <SectionHeading id="ab-468">Understanding the California 30-Day ESA Rule (AB 468)</SectionHeading>
          <SubHeading>What is the California 30-day ESA rule under AB 468?</SubHeading>
          <Para>
            AB 468 was signed into law in September 2021 and took effect January 1, 2022. It added a new
            article to the California Health and Safety Code (beginning around section 122317) specifically
            governing how licensed health care practitioners may issue documentation for emotional support
            dogs.
          </Para>
          <Para>Under the law, a health care practitioner cannot provide ESA documentation unless they:</Para>
          <ol className="list-decimal pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li>Hold a valid, active license and disclose the license number, effective date, jurisdiction, and license type in the letter.</li>
            <li>Are licensed to practice in the jurisdiction where the client is physically located when the documentation is provided.</li>
            <li>Have established a client-provider relationship with the individual for <strong className="text-gray-800">at least 30 days</strong> before issuing the letter.</li>
            <li>Have completed a clinical evaluation of the person&apos;s need for the animal.</li>
            <li>Provide notice — verbal or written — that misrepresenting an ESA as a service animal is against the law.</li>
          </ol>
          <Para>
            The law doesn&apos;t specify a fixed number of sessions, but in practice most providers schedule
            at least two appointments (an intake and a follow-up) across that 30-day window, since a single
            same-day call can&apos;t establish a genuine 30-day relationship. The core point of the law is the
            <em> relationship</em>, not a checklist of visits.
          </Para>

          <SubHeading>Can a California landlord legally reject an instant or same-day online ESA letter?</SubHeading>
          <Para>
            Yes. If an ESA letter was generated by an online service without a genuine 30-day evaluation
            period, it does not meet AB 468&apos;s statutory requirements, and California landlords have grounds
            to treat it as invalid. This is the exact problem AB 468 was written to solve: before 2022, some
            online &quot;letter mill&quot; services would issue ESA documentation within hours of a short
            questionnaire, with no ongoing clinical relationship behind it.
          </Para>
          <Para>
            If you&apos;re applying for housing on a deadline, an ESA letter obtained same-day is not a
            shortcut — it&apos;s documentation a landlord in California is entitled to disregard. A better path
            is a compliant{" "}
            <Link to="/esa-letter/california" className={inlineLink}>
              California ESA letter
            </Link>{" "}
            obtained through a real licensed-provider evaluation, or the deeper walkthrough on the{" "}
            <Link to="/california-esa-letter-30-day-rule" className={inlineLink}>
              AB 468 30-day rule
            </Link>{" "}
            page.
          </Para>

          <SubHeading>Why does the law exist?</SubHeading>
          <Para>
            AB 468 responded to a well-documented problem: online ESA &quot;certification&quot; mills selling
            letters, vests, and ID cards with no clinical basis, which undercut trust in valid ESA
            documentation and made it easier for landlords to push back on all requests, including
            legitimate ones. The law raises the bar for practitioners specifically so that a compliant letter
            actually means something when a landlord receives it.
          </Para>

          <SectionHeading id="esa-vs-psd">ESA vs. PSD in California: What&apos;s the Real Difference?</SectionHeading>
          <Para>
            People often search for a &quot;faster&quot; or &quot;immediate&quot; ESA alternative when they&apos;re
            facing a moving deadline. It&apos;s worth being precise here, because the distinction between an ESA
            and a Psychiatric Service Dog (PSD) isn&apos;t a matter of paperwork speed — it&apos;s a difference in
            what the animal actually does.
          </Para>
          <SubHeading>Does the California 30-day waiting period apply to Psychiatric Service Dogs?</SubHeading>
          <Para>
            No. AB 468&apos;s 30-day relationship requirement applies specifically to documentation for
            <strong className="text-gray-800"> emotional support dogs</strong>. It does not apply to service
            animals, including PSDs, which are governed by the Americans with Disabilities Act (ADA) at the
            federal level and by California&apos;s Fair Employment and Housing Act (FEHA) at the state level.
          </Para>
          <Para>
            But this isn&apos;t a loophole to route around the ESA rule — it reflects a real legal distinction.
            A PSD is a dog that has been <strong className="text-gray-800">individually trained to perform a
            specific task</strong> that mitigates its handler&apos;s disability: for example, interrupting a
            panic attack, providing deep-pressure therapy during a dissociative episode, or retrieving
            medication. Under the ADA, an animal that has not been trained to perform such a task is not a
            service animal, regardless of what any letter says. There is no federal or state registry,
            certification, or letter that can substitute for that training. For a full walkthrough of what
            qualifies and how self-training works, see{" "}
            <Link to="/blog/how-to-train-psychiatric-service-dog-tasks" className={inlineLink}>
              how to train your dog to be a psychiatric service dog
            </Link>
            .
          </Para>
          <Para>
            In practical terms: if your dog has genuinely been trained to perform a disability-mitigating
            task, you may be able to obtain documentation quickly because there&apos;s no mandated waiting
            period for service animals. If your dog hasn&apos;t received that training, a letter describing it as
            a PSD does not make it one — and knowingly misrepresenting a pet as a service animal is a
            misdemeanor in California. If you&apos;re facing a housing deadline and don&apos;t have a task-trained
            dog, the honest path is either to pursue a compliant ESA letter and communicate with your
            landlord about the timeline, or to look into legitimate service-dog training — not to relabel the
            animal. Our{" "}
            <Link to="/esa-vs-psd-letter" className={inlineLink}>
              ESA vs PSD letter
            </Link>{" "}
            comparison breaks the two categories down further.
          </Para>

          <SubHeading>Key functional differences</SubHeading>
          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide w-[26%]">Feature</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[37%]">
                    <span className="inline-flex items-center gap-1.5"><i className="ri-heart-3-line text-orange-400"></i> California ESA</span>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[37%]">
                    <span className="inline-flex items-center gap-1.5"><i className="ri-shield-star-line text-orange-500"></i> Psychiatric Service Dog</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr key={row.feature} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-5 py-3.5 text-xs font-semibold text-gray-700 align-top">{row.feature}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.esa}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.psd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile stacked cards */}
          <div className="md:hidden space-y-3 my-5">
            {comparisonRows.map((row) => (
              <div key={row.feature} className="rounded-xl border border-gray-200 overflow-hidden">
                <p className="bg-[#fdf6ee] border-b border-orange-100 px-4 py-2.5 text-xs font-bold text-gray-800">{row.feature}</p>
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <i className="ri-heart-3-line text-orange-400 mt-0.5 flex-shrink-0"></i>
                    <div>
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">California ESA</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{row.esa}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <i className="ri-shield-star-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                    <div>
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Psychiatric Service Dog</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{row.psd}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Mid-article CTA ── */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2">
              <i className="ri-stethoscope-line text-orange-500"></i> Not sure whether an ESA or PSD fits your situation?
            </p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              A California-licensed mental health professional can review your situation and determine whether
              ESA or PSD documentation is clinically appropriate. No outcome is guaranteed — every housing
              request is decided individually, and you get a refund if you don&apos;t qualify.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to={withAttribution("/assessment")} className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm">
                <i className="ri-clipboard-line"></i> Start your ESA assessment
              </Link>
              <Link to={withAttribution("/psd-assessment")} className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors text-sm">
                <i className="ri-shield-star-line"></i> Start a PSD assessment
              </Link>
            </div>
          </div>

          <SectionHeading id="tenant-protections">California Tenant Protections Under FEHA and FHA</SectionHeading>
          <SubHeading>Can a California landlord charge pet rent or an extra deposit for a valid ESA or PSD?</SubHeading>
          <Para>
            No. Under the federal Fair Housing Act and California&apos;s Fair Employment and Housing Act, a
            legitimate assistance animal is not classified as a pet. Housing providers cannot charge pet rent,
            pet fees, or an additional security deposit for an ESA or PSD, even in buildings with a strict
            no-pets policy. You do remain responsible for any actual damage the animal causes, and a landlord
            can bill you for repairs beyond normal wear and tear — that&apos;s different from a blanket pet
            deposit.
          </Para>
          <Para>
            Note that FEHA and the Fair Housing Act govern <em>housing</em>. Emotional support animals do not
            have guaranteed access to restaurants, retail stores, or other public accommodations in California,
            and as of 2021 federal Department of Transportation rules, airlines are no longer required to
            accommodate ESAs — most now treat them as regular pets subject to standard pet fees. PSDs, by
            contrast, retain ADA public access and air travel protections because they are legally service
            animals.
          </Para>

          <SubHeading>What information must a compliant California ESA letter include?</SubHeading>
          <Para>To hold up to landlord scrutiny, a letter should include:</Para>
          <ul className="list-disc pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li>The practitioner&apos;s active California license number, license type, and effective date.</li>
            <li>Confirmation that the practitioner is licensed to practice in the jurisdiction where you&apos;re located.</li>
            <li>A statement confirming the required 30-day client-provider relationship has been met.</li>
            <li>Confirmation of a clinical evaluation and a diagnosed disability supported by the animal.</li>
            <li>A statement that the letter is part of an ongoing treatment plan.</li>
            <li>Notice that misrepresenting the animal as a service animal violates California law.</li>
          </ul>

          <SubHeading>What are the penalties for misrepresenting an ESA as a service animal?</SubHeading>
          <Para>
            California treats this as a real offense with escalating consequences. Existing state law (Penal
            Code section 365.7) already made it a misdemeanor — punishable by up to six months in county jail
            and/or a fine — to fraudulently represent oneself as the owner or trainer of a service dog. AB 468
            layered civil penalties on top of that specifically for ESA-related misrepresentation, which
            several legal sources describe as starting around $500 for a first violation and escalating for
            repeat offenses. This is one more reason not to treat &quot;PSD&quot; as a faster label for an
            ESA — the mismatch between the letter and the animal&apos;s actual training is exactly what these
            penalties target. Other states draw the same line: Texas, for example, strengthened its own
            misrepresentation penalty in 2023, as covered in the{" "}
            <Link to="/states/texas-esa-psd-guide" className={inlineLink}>Texas ESA &amp; PSD guide</Link>.
          </Para>

          <SubHeading>Can an HOA deny my ESA or PSD?</SubHeading>
          <Para>
            No. California homeowners associations and condo boards must comply with the Fair Housing Act and
            FEHA the same way a landlord does. An HOA cannot deny a reasonable accommodation request for a
            valid ESA or PSD simply because its CC&amp;Rs prohibit pets, and it cannot charge pet fees for
            either. For a PSD specifically, an HOA also cannot enforce weight or breed restrictions, since the
            dog is legally treated as a medical assistive device rather than a pet. If you live in a
            common-interest development — especially in the Bay Area — the{" "}
            <Link to="/states/san-francisco-hoa-psd-guide" className={inlineLink}>
              San Francisco HOA &amp; PSD accommodations guide
            </Link>{" "}
            covers how the Davis-Stirling Act interacts with these protections.
          </Para>
          <Para>
            An HOA board that questions your PSD may only ask: (1) whether the dog is required because of a
            disability, and (2) what task the dog has been trained to perform. It cannot demand medical records,
            a diagnosis, or &quot;certification&quot; paperwork — none of which exists as a legal requirement
            for a service animal in the first place.
          </Para>

          <SectionHeading id="compliant-process">What a Compliant Process Looks Like</SectionHeading>
          <Para>
            Because the 30-day clock is a hard floor under AB 468, there is no way to legally compress it — and
            any service claiming otherwise is not offering you a compliant letter. A realistic, lawful timeline
            looks something like:
          </Para>
          <ol className="space-y-3 my-5">
            {[
              { title: "Day 1 — Clinical intake.", desc: "You complete an initial mental health assessment with a California-licensed practitioner (psychologist, psychiatrist, LMFT, or LCSW), who confirms their license is active and appropriate for a clinical evaluation." },
              { title: "Around the midpoint — Follow-up session.", desc: "A second appointment builds out your treatment record and lets the practitioner assess your ongoing need for the animal, rather than relying on a single intake conversation." },
              { title: "After 30 days have elapsed — Letter issued.", desc: "Once the 30-day relationship requirement is satisfied and the clinical evaluation is complete, the practitioner can issue a letter that includes all the required disclosures." },
            ].map((step, i) => (
              <li key={step.title} className="flex items-start gap-3.5">
                <div className="w-7 h-7 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{step.title}</p>
                  <p className="text-xs md:text-[13px] text-gray-600 leading-relaxed">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
          <Para>
            If you&apos;re facing a moving deadline sooner than that, your realistic options are: start the
            30-day process as early as possible and communicate proactively with your prospective landlord
            about the timeline, or — only if it&apos;s genuinely true — pursue documentation for a dog that has
            actually been trained to perform a disability-related task, which falls outside AB 468&apos;s
            ESA-specific rule.
          </Para>

          <SectionHeading id="qualifying-renewing">Common Questions About Qualifying and Renewing</SectionHeading>
          <SubHeading>What conditions qualify someone for an ESA in California?</SubHeading>
          <Para>
            There&apos;s no statutory list of qualifying diagnoses in AB 468 itself. Instead, eligibility is a
            clinical judgment made by your licensed practitioner during the evaluation — conditions commonly
            supporting an ESA recommendation include anxiety disorders, depression, PTSD, and similar diagnosed
            mental or emotional conditions where the practitioner determines the animal is part of a reasonable
            treatment approach. A diagnosis alone doesn&apos;t automatically qualify you; the practitioner still
            has to document that the animal specifically helps manage the condition.
          </Para>
          <SubHeading>Does an ESA letter expire, or do I need to renew it every year?</SubHeading>
          <Para>
            AB 468 doesn&apos;t set a fixed expiration date, but many practitioners and landlords treat a letter
            as current for about a year, since it&apos;s meant to reflect an active, ongoing treatment
            relationship rather than a one-time approval. Practically, the 30-day rule is really a
            <em> floor</em> for a first-time letter — if you&apos;ve had an ongoing clinical relationship with
            the same provider, a renewal letter doesn&apos;t require you to restart a fresh 30-day clock.
          </Para>
          <SubHeading>Can I use a telehealth provider based outside California?</SubHeading>
          <Para>
            No. AB 468 requires the practitioner to be licensed in the jurisdiction where you, the client, are
            physically located when the documentation is issued. A therapist licensed only in another state
            cannot lawfully issue ESA documentation for someone living in California, even over telehealth.
            Always confirm a provider&apos;s license is active and issued by a California board. If you&apos;re
            planning to meet a provider remotely, the{" "}
            <Link to="/states/san-diego-telehealth-guide" className={inlineLink}>
              San Diego telehealth guide
            </Link>{" "}
            walks through exactly how AB 468 applies to remote evaluations.
          </Para>
          <SubHeading>What should I do if a landlord wrongfully denies my request?</SubHeading>
          <Para>
            If you have a compliant ESA or PSD letter and a landlord still refuses a reasonable accommodation,
            charges you pet fees, or attempts to evict you over the animal, you can file a complaint with
            California&apos;s Civil Rights Department (CRD), the state agency that enforces FEHA. You can also
            pursue a Fair Housing Act complaint with HUD at the federal level — though it&apos;s worth
            understanding{" "}
            <Link to="/blog/2026-hud-esa-guidelines" className={inlineLink}>
              how HUD&apos;s 2026 enforcement change
            </Link>{" "}
            affects federal ESA complaints — or consult a housing attorney about your options. In Los Angeles
            specifically, local rent-stabilization protections add another layer; the{" "}
            <Link to="/states/los-angeles-esa-landlord-guide" className={inlineLink}>
              Los Angeles landlord ESA guide
            </Link>{" "}
            covers how those interact with AB 468.
          </Para>

          <SectionHeading id="regional-notes">California Regional Compliance Notes</SectionHeading>
          <Para>
            The statewide rules above apply everywhere in California, but local ordinances add another layer in
            some cities. See the companion guides for jurisdiction-specific detail:
          </Para>
          <div className="grid gap-3 sm:grid-cols-3 my-5">
            {[
              { to: "/states/los-angeles-esa-landlord-guide", icon: "ri-building-line", title: "Los Angeles", desc: "How the Rent Stabilization Ordinance interacts with ESA accommodation requests." },
              { to: "/states/san-francisco-hoa-psd-guide", icon: "ri-community-line", title: "San Francisco", desc: "HOA and condo limits on Psychiatric Service Dogs under the Davis-Stirling Act." },
              { to: "/states/san-diego-telehealth-guide", icon: "ri-video-chat-line", title: "San Diego", desc: "Telehealth-specific considerations for meeting AB 468's requirements remotely." },
            ].map((c) => (
              <Link key={c.to} to={c.to} className="group bg-white border border-orange-100 rounded-xl p-4 hover:border-orange-300 hover:shadow-sm transition-all">
                <i className={`${c.icon} text-orange-500 text-lg`}></i>
                <p className="text-sm font-bold text-gray-900 mt-2 mb-1 group-hover:text-orange-600 transition-colors">{c.title}</p>
                <p className="text-xs text-gray-600 leading-relaxed">{c.desc}</p>
              </Link>
            ))}
          </div>

          <SectionHeading id="bottom-line">Bottom Line</SectionHeading>
          <Para>
            California&apos;s AB 468 sets a real floor — a genuine 30-day clinical relationship — for ESA
            documentation, and no compliant provider can shortcut it. That&apos;s inconvenient if you&apos;re
            facing a deadline, but it&apos;s also what makes a compliant letter worth something once a landlord
            receives it. PSDs follow a different track entirely, one tied to actual task training rather than
            paperwork timing, and treating the two as interchangeable labels is the mistake AB 468 was
            specifically designed to catch. Whichever path applies to your situation, the documentation only
            protects you if it accurately reflects what your animal is and does.
          </Para>
        </div>
      </article>

      {/* ===== FAQ ===== */}
      <section className="py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-8 text-center">Frequently asked questions</h2>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <div key={f.q} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer hover:bg-gray-50 transition-colors"
                  aria-expanded={openFaq === i}
                >
                  <span className="text-sm font-bold text-gray-900">{f.q}</span>
                  <i className={`ri-arrow-down-s-line text-gray-400 text-lg flex-shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`}></i>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 -mt-1">
                    <p className="text-sm text-gray-600 leading-relaxed">{f.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== BOTTOM CTA ===== */}
      <section className="py-12 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">Need California ESA or PSD documentation?</h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            A California-licensed mental health professional can evaluate your situation and determine whether
            documentation is clinically appropriate. Every housing request is decided individually — no outcome
            is guaranteed, and you get a refund if you don&apos;t qualify.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={withAttribution("/assessment")} className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm">
              <i className="ri-stethoscope-line"></i> Start assessment
            </Link>
            <Link to="/esa-letter/california" className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm">
              <i className="ri-map-pin-2-line"></i> California ESA letter guide
            </Link>
          </div>
        </div>
      </section>

      {/* ===== KEEP READING ===== */}
      <section className="py-12 bg-[#fdf6ee] border-t border-orange-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-5 text-center">Keep reading</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
            {[
              { to: "/states/los-angeles-esa-landlord-guide", icon: "ri-building-line", label: "Los Angeles landlord ESA rules" },
              { to: "/states/san-francisco-hoa-psd-guide", icon: "ri-community-line", label: "San Francisco HOA & PSD accommodations" },
              { to: "/states/san-diego-telehealth-guide", icon: "ri-video-chat-line", label: "San Diego telehealth & AB 468" },
              { to: "/blog/how-to-train-psychiatric-service-dog-tasks", icon: "ri-shield-star-line", label: "How to train a psychiatric service dog" },
              { to: "/blog/2026-hud-esa-guidelines", icon: "ri-government-line", label: "2026 HUD ESA guidelines explained" },
              { to: "/california-esa-letter-30-day-rule", icon: "ri-calendar-check-line", label: "California ESA 30-day rule (AB 468)" },
            ].map((r) => (
              <Link key={r.to} to={r.to} className="flex items-center gap-3 h-full bg-white border border-orange-100 rounded-xl px-4 py-3.5 hover:border-orange-300 hover:shadow-sm transition-all">
                <i className={`${r.icon} text-orange-500 text-lg flex-shrink-0`}></i>
                <span className="text-sm font-semibold text-gray-800">{r.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== LEGAL DISCLAIMER ===== */}
      <section className="py-10 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-gray-400 text-lg mt-0.5"></i>
            <p className="text-xs text-gray-500 leading-relaxed">
              <strong className="text-gray-600">Informational only — not legal advice.</strong>{" "}
              This guide summarizes California and federal housing rules and is not a substitute for advice
              from a licensed attorney. PawTenant connects you with licensed mental health professionals; it
              does not train or certify service animals, claim any government affiliation, sell registrations,
              certificates, ID cards, or vests, or guarantee landlord approval or any legal outcome. Whether an
              ESA or PSD letter is issued is decided by a licensed provider after a real evaluation. For your
              specific circumstances, consult a fair-housing attorney or California&apos;s Civil Rights
              Department.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
