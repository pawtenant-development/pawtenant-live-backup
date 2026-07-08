// Texas ESA & PSD housing guide — /states/texas-esa-psd-guide
//
// Main guide of the Texas ESA/PSD content cluster (SEO-TX-ESA-PSD-CLUSTER-001).
// Converted from the SEO team's `texas-esa-psd-guide.md`. PawTenant compliance:
// no "legit/legitimate" in headings/meta/FAQ questions (source had none); PSD
// documentation supports housing AND travel and a letter does NOT create
// service-dog status (task training does); no guaranteed approval / registry /
// certification / vest claims. Texas statutory citations kept as provided
// (Property Code Ch. 301, HRC §121.003/§121.006 + HB 4164, H&S §437.023).
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + Article/Breadcrumb/FAQ
// JSON-LD. Styling mirrors /states/california-esa-psd-guide.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/states/texas-esa-psd-guide";

const topicChips = ["Texas Fair Housing", "2026 HUD Shift", "ESA vs PSD", "HB 4164"];

// ── ESA vs PSD in Texas (from the guide's comparison table) ──────────────────
const comparisonRows = [
  {
    feature: "Legal basis",
    esa: "Fair Housing Act / Texas Property Code Ch. 301 — housing",
    psd: "ADA / Texas Human Resources Code Ch. 121 — housing, public access, and more",
  },
  {
    feature: "Training requirement",
    esa: "None — support through presence",
    psd: "Individually trained to perform a specific disability-related task",
  },
  {
    feature: "Public access rights",
    esa: "None in Texas",
    psd: "Broad public access under the ADA",
  },
  {
    feature: "Federal housing enforcement (post-May 2026)",
    esa: "HUD deprioritizes ESA-specific federal complaints; state-law and private suits still available",
    psd: "Fully protected — HUD's training-based standard was already the ADA's standard",
  },
  {
    feature: "Fraud exposure if misrepresented",
    esa: "N/A if accurately described as an ESA",
    psd: "Texas HRC § 121.006 penalizes misrepresenting an untrained animal as a service animal",
  },
];

// ── FAQs — mirror texas-faq-schema.json → texasMainGuide (visible + JSON-LD) ──
const faqs = [
  {
    q: "Is there a waiting period for an ESA letter in Texas?",
    a: "No. Texas has not enacted a state statute imposing a mandatory clinical waiting period for ESA documentation, unlike California's AB 468. ESA housing rights in Texas rest on the federal Fair Housing Act and the Texas Fair Housing Act (Property Code Chapter 301), neither of which sets a fixed waiting period, though documentation still needs to reflect a genuine clinical evaluation.",
  },
  {
    q: "Can Texas landlords reject an online ESA letter?",
    a: "Yes, if it lacks credibility. Housing providers may request reliable documentation of a disability and disability-related need when it isn't obvious, and documentation from an online letter mill without a genuine clinical relationship can be challenged.",
  },
  {
    q: "What did HUD change about Emotional Support Animals in 2026?",
    a: "On May 22, 2026, HUD's Office of Fair Housing and Equal Opportunity permanently rescinded its 2013 and 2020 guidance on assistance animals and adopted the ADA's training-based standard for federal enforcement, meaning it will generally pursue Fair Housing Act charges only for animals individually trained to perform a disability-related task. The underlying Fair Housing Act was not amended, private lawsuits remain available, and state fair housing laws are unaffected.",
  },
  {
    q: "Does the 2026 HUD enforcement shift eliminate ESA protections in Texas?",
    a: "No. The Texas Fair Housing Act (Property Code Chapter 301) is enforced independently by the Texas Workforce Commission's Civil Rights Division under state authority, separate from HUD's federal enforcement discretion, so Texas ESA owners may still have a viable state-law path regardless of HUD's federal enforcement priorities.",
  },
  {
    q: "What is the penalty for misrepresenting a service dog in Texas?",
    a: "Under Texas Human Resources Code Section 121.006, as amended by House Bill 4164 effective September 1, 2023, intentionally or knowingly representing an untrained animal as a service or assistance animal is a misdemeanor punishable by a fine of up to $1,000 and 30 hours of community service.",
  },
  {
    q: "Can a landlord charge pet rent for an ESA or PSD in Texas?",
    a: "For a trained assistance or service animal, Texas Human Resources Code Section 121.003 prohibits fees or deposits. For ESAs, the no-fee protection comes from the federal Fair Housing Act and the Texas Fair Housing Act (Property Code Chapter 301), which treat a legitimate assistance animal as distinct from an ordinary pet.",
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

export default function TexasEsaPsdGuidePage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="Texas ESA letter, Texas PSD letter, Texas Fair Housing Act, Texas Property Code 301, HB 4164 service animal, Texas HUD 2026, ESA vs PSD Texas, Texas assistance animal law, Texas ESA pet rent, misrepresenting service dog Texas"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="Texas ESA & PSD Housing Laws: Fair Housing Act & the 2026 HUD Shift" />
      <meta
        property="og:description"
        content="A complete legal guide to Emotional Support Animals and Psychiatric Service Dogs under Texas and federal law — no state waiting period, the May 2026 HUD enforcement shift, Texas fee exemptions, and misrepresentation penalties."
      />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content="https://pawtenant.com/assets/lifestyle/person-paperwork-with-dog.jpg" />
      <meta property="article:published_time" content="2026-07-08" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content="https://pawtenant.com/assets/lifestyle/person-paperwork-with-dog.jpg" />
      <meta name="twitter:title" content="Texas ESA & PSD Housing Laws: Fair Housing Act & the 2026 HUD Shift" />
      <meta
        name="twitter:description"
        content="Texas ESA/PSD housing rights, the May 2026 HUD enforcement shift, fee exemptions, and misrepresentation penalties — explained clearly."
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
                headline: "Texas ESA & PSD Housing Laws: Navigating the Fair Housing Act and the 2026 HUD Enforcement Shift",
                description:
                  "A complete legal guide to Emotional Support Animals (ESAs) and Psychiatric Service Dogs (PSDs) under Texas and federal law — no state waiting period, the May 2026 HUD enforcement shift, Texas tenant fee exemptions, and misrepresentation penalties.",
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
                  { "@type": "ListItem", position: 2, name: "Texas ESA & PSD Guide", item: CANONICAL },
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
            <span className="text-gray-500">Texas ESA &amp; PSD Guide</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span key={chip} className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm">{chip}</span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[42px] font-extrabold text-gray-900 leading-tight mb-4">
            Texas ESA &amp; PSD Housing Laws:{" "}
            <span className="text-orange-500">The Fair Housing Act and the 2026 HUD Enforcement Shift</span>
          </h1>
          <p className="text-sm md:text-base text-gray-500 italic mb-6">
            A complete guide to Emotional Support Animals (ESAs) and Psychiatric Service Dogs (PSDs) under
            Texas and federal law.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-6">
            <span className="inline-flex items-center gap-1.5"><i className="ri-calendar-line text-orange-400"></i> Updated July 2026</span>
            <span className="inline-flex items-center gap-1.5"><i className="ri-time-line text-orange-400"></i> ~11 min read</span>
            <span className="inline-flex items-center gap-1.5"><i className="ri-user-line text-orange-400"></i> PawTenant Editorial — reviewed for accuracy</span>
          </div>

          <div className="rounded-2xl bg-white border border-orange-200 shadow-[0_18px_45px_-25px_rgba(122,78,45,0.35)] p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-2.5 flex items-center gap-2"><i className="ri-flashlight-line"></i> Quick answer</p>
            <p className="text-sm md:text-[15px] text-gray-700 leading-relaxed">
              Texas handles assistance animals differently than states like{" "}
              <Link to="/states/california-esa-psd-guide" className={inlineLink}>California</Link>: there&apos;s
              no state-mandated waiting period and no anti-letter-mill statute like AB 468. But Texas isn&apos;t
              unregulated — it has its own fair housing statute, recently strengthened fraud penalties for
              misrepresenting a service animal, and, as of May 2026, a meaningfully changed federal enforcement
              landscape to navigate.
            </p>
          </div>

          <figure className="mt-8">
            <img
              src="/assets/lifestyle/person-paperwork-with-dog.jpg"
              alt="Texas renter reviewing ESA and PSD housing documents at home with their dog"
              width={1400}
              height={1051}
              fetchPriority="high"
              decoding="async"
              className="w-full h-52 sm:h-80 md:h-[26rem] object-cover rounded-3xl border border-orange-100 shadow-[0_24px_60px_-30px_rgba(122,78,45,0.35)]"
            />
          </figure>

          <p className="text-xs text-gray-400 mt-4 leading-relaxed">
            As always, this is general information, not legal advice. For a specific dispute, the Texas
            Workforce Commission (TWC) Civil Rights Division or a Texas fair-housing attorney can advise on your
            situation directly.
          </p>
        </div>
      </section>

      {/* ===== ARTICLE BODY ===== */}
      <article className="bg-white pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">

          <SectionHeading id="waiting-period">Is There a Waiting Period for an ESA Letter in Texas?</SectionHeading>
          <Para>
            No. Texas is sometimes described as a &quot;federal-only&quot; ESA state, and that&apos;s a fair
            summary: unlike California&apos;s AB 468, Texas has not enacted a state statute imposing a minimum
            clinical relationship period, a mandatory number of sessions, or specific anti-fraud disclosure
            requirements tied to ESA documentation itself. Your ESA housing rights in Texas rest on two
            overlapping legal sources:
          </Para>
          <ul className="list-disc pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li>The <strong className="text-gray-800">federal Fair Housing Act</strong> (42 U.S.C. §§ 3601–3619), and</li>
            <li>The <strong className="text-gray-800">Texas Fair Housing Act</strong> (Texas Property Code, Chapter 301), which largely mirrors the federal statute and is enforced independently by the Texas Workforce Commission&apos;s Civil Rights Division.</li>
          </ul>
          <Para>
            That means there&apos;s no statutory clock you have to run out before a Texas-licensed practitioner
            can issue you a letter. But &quot;no waiting period&quot; doesn&apos;t mean &quot;no standard.&quot; A
            letter still needs to reflect a genuine clinical relationship and an actual evaluation to hold up —
            Texas just doesn&apos;t spell out the minimum timeline in statute the way California does.
          </Para>

          <SubHeading>Can Texas landlords reject an online ESA letter?</SubHeading>
          <Para>
            Yes, if it&apos;s not credible. Under the Texas Fair Housing Act, a housing provider can request
            reliable documentation of a disability and the disability-related need for the animal when that need
            isn&apos;t obvious. HUD&apos;s longstanding guidance on this point has made clear that documentation
            from an online &quot;instant letter&quot; operation with no real clinical relationship behind it
            doesn&apos;t carry the same weight as documentation from an actual, licensed provider who evaluated
            you. Texas landlords increasingly know to look for the difference, and a letter that can&apos;t
            demonstrate a real evaluation is one they have grounds to question.
          </Para>

          <SectionHeading id="hud-2026">The May 2026 HUD Enforcement Shift and What It Means for Texas Renters</SectionHeading>
          <Para>
            This is the most significant recent development in this space, and it&apos;s worth understanding
            precisely — because a lot of the commentary around it overstates what changed. Our dedicated
            explainer on the{" "}
            <Link to="/blog/2026-hud-esa-guidelines" className={inlineLink}>2026 HUD ESA guidelines</Link>{" "}
            walks through the memo in detail; here is what it means specifically for Texas.
          </Para>
          <SubHeading>What did HUD change about Emotional Support Animals in 2026?</SubHeading>
          <Para>
            On May 22, 2026, HUD&apos;s Office of Fair Housing and Equal Opportunity (FHEO) issued a memorandum
            permanently rescinding its 2013 and 2020 guidance documents on assistance animals. Going forward,
            when FHEO investigates a federal Fair Housing Act complaint involving an animal-related
            accommodation, it will apply the ADA&apos;s training-based standard: it will generally pursue
            enforcement action only where the animal has been individually trained to perform a task directly
            related to the person&apos;s disability. Untrained ESAs — animals that provide support through
            presence and companionship rather than a trained task — are no longer a category HUD&apos;s
            enforcement division will prioritize the same way it did under prior guidance.
          </Para>
          <SubHeading>What this change does <em>not</em> do</SubHeading>
          <Para>It&apos;s easy to read that summary and assume ESAs lost their legal protection outright. They didn&apos;t, for a few important reasons:</Para>
          <ul className="list-disc pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li><strong className="text-gray-800">The Fair Housing Act itself wasn&apos;t amended.</strong> HUD&apos;s memo is enforcement guidance, not a new regulation and not an act of Congress. The underlying statute — and decades of court precedent — is unchanged.</li>
            <li><strong className="text-gray-800">Private lawsuits remain available.</strong> The memo explicitly preserves the right of individuals to file civil Fair Housing Act claims in federal or state court, independent of whether HUD pursues an administrative complaint.</li>
            <li><strong className="text-gray-800">State law is unaffected.</strong> HUD&apos;s memo governs federal enforcement discretion only. States with their own fair housing statutes — Texas among them — are not bound by HUD&apos;s enforcement priorities.</li>
            <li><strong className="text-gray-800">HUD intends formal rulemaking.</strong> The agency has signaled it wants to eventually align its regulations with the ADA&apos;s standard through notice-and-comment rulemaking, a public process that hasn&apos;t happened yet.</li>
          </ul>
          <SubHeading>Does this affect Texas specifically?</SubHeading>
          <Para>
            Here&apos;s the nuance that matters for Texas renters: the Texas Fair Housing Act (Property Code
            Chapter 301) is enforced by the Texas Workforce Commission&apos;s Civil Rights Division under its own
            state authority — not by HUD. A shift in HUD&apos;s federal enforcement priorities doesn&apos;t
            automatically change how the TWC evaluates a state-law housing discrimination complaint. Because the
            Texas statute closely mirrors the language of the federal FHA rather than any HUD guidance document,
            a Texas ESA owner denied a reasonable accommodation may still have a viable path through the TWC,
            separate from the federal enforcement question. That said, this is a genuinely unsettled area
            following a very recent federal policy change, and how state agencies and Texas courts ultimately
            treat these complaints going forward is worth watching rather than assuming either direction.
          </Para>

          <SectionHeading id="esa-vs-psd">ESA vs. PSD in Texas: What Actually Changes With Task Training</SectionHeading>
          <Para>
            Given the enforcement landscape above, a dog that is genuinely trained to perform a
            disability-related task sits on considerably more stable legal ground than one that isn&apos;t — not
            because a &quot;PSD letter&quot; is a workaround, but because a task-trained dog is a service animal
            under the ADA regardless of which way federal housing enforcement discretion moves. That status
            doesn&apos;t depend on HUD guidance at all; it comes directly from the ADA&apos;s statutory
            definition. A PSD retains its housing protections and, because it is a trained service animal, adds
            public-access and air-travel access an ESA doesn&apos;t have.
          </Para>
          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide w-[26%]">Feature</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[37%]">
                    <span className="inline-flex items-center gap-1.5"><i className="ri-heart-3-line text-orange-400"></i> Texas ESA</span>
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
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Texas ESA</p>
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
          <Para>
            If your dog has genuinely been trained to perform a qualifying task, documenting that accurately
            gives you protection that doesn&apos;t hinge on HUD&apos;s shifting enforcement priorities. If your
            dog hasn&apos;t received that training, the honest and legally sound path is to continue relying on
            your ESA&apos;s housing protections under the FHA and Texas Property Code Chapter 301 — not to
            relabel the animal. For a full breakdown of what qualifies as a recognized psychiatric service dog
            task and how self-training legally works, see our guide,{" "}
            <Link to="/blog/how-to-train-psychiatric-service-dog-tasks" className={inlineLink}>
              how to train your dog to be a psychiatric service dog
            </Link>
            .
          </Para>

          <SubHeading>What is the penalty for misrepresenting a service dog in Texas?</SubHeading>
          <Para>
            Texas takes this seriously. Under{" "}
            <Link to="/blog/texas-service-animal-laws-penalties" className={inlineLink}>
              Texas Human Resources Code Section 121.006
            </Link>
            , intentionally or knowingly representing an animal as an assistance animal or service animal when it
            hasn&apos;t actually been specially trained or equipped to help with a disability is a misdemeanor.
            Following a 2023 amendment (House Bill 4164), the penalty was strengthened to a fine of up to $1,000
            (up from $300 under the prior law) plus a mandatory 30 hours of community service for an
            organization serving people with disabilities. Separately, Texas Health &amp; Safety Code § 437.023
            makes explicit that an animal providing only comfort or emotional support does not meet the legal
            definition of a service animal — reinforcing that the ESA/PSD line is a real one, not a formality.
          </Para>

          {/* ── Mid-article CTA ── */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2"><i className="ri-stethoscope-line text-orange-500"></i> Not sure whether an ESA or PSD fits your Texas situation?</p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              A Texas-licensed mental health professional can review your situation and determine whether ESA or
              PSD documentation is clinically appropriate. No outcome is guaranteed — every housing request is
              decided individually, and you get a refund if you don&apos;t qualify.
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

          <SectionHeading id="tenant-rights">Texas Tenant Rights and Fee Exemptions</SectionHeading>
          <SubHeading>Can a landlord charge pet rent for an ESA or PSD in Texas?</SubHeading>
          <Para>
            For a genuinely trained assistance or service animal, no — Texas Human Resources Code Section 121.003
            prohibits charging fees or deposits for such an animal in housing (though the handler remains liable
            for any damage the animal causes beyond normal wear and tear). Chapter 121&apos;s definition of
            &quot;assistance animal&quot; and &quot;service animal&quot; specifically means a trained canine, so
            this particular statute is written around trained animals.
          </Para>
          <Para>
            For ESAs specifically, the no-fee protection comes from the federal Fair Housing Act and the Texas
            Fair Housing Act (Property Code Chapter 301) rather than Chapter 121: under both, a legitimate
            assistance animal — including an ESA supported by reliable documentation — is treated as distinct
            from an ordinary pet, and a housing provider generally cannot impose pet rent, pet deposits, or
            similar fees as a condition of the accommodation. As discussed above, the practical strength of this
            protection at the federal enforcement level has shifted somewhat since May 2026, but the underlying
            statutory right, and the state-level TWC enforcement path, remain in place.
          </Para>
          <SubHeading>What can a Texas landlord ask for?</SubHeading>
          <Para>
            A landlord may request reliable documentation of your disability and disability-related need for the
            animal if the need isn&apos;t obvious — typically a letter from a licensed healthcare provider. What
            a landlord generally cannot do is demand a specific diagnosis, require you to use a designated form,
            or insist on registration through a third-party &quot;certification&quot; service, since no such
            registry is legally required or recognized under Texas or federal law.
          </Para>
          <SubHeading>When can a Texas landlord legally deny an accommodation request?</SubHeading>
          <Para>Fair housing law recognizes a handful of narrow exceptions:</Para>
          <ul className="list-disc pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li>The specific animal poses a direct threat to health or safety that can&apos;t be reduced through other reasonable accommodations.</li>
            <li>The animal would cause substantial property damage beyond what reasonable accommodations could address.</li>
            <li>The accommodation would impose an undue financial or administrative burden on the housing provider.</li>
            <li>Granting the request would fundamentally alter the nature of the housing operation.</li>
          </ul>
          <Para>
            These exceptions require an individualized, fact-specific assessment — a landlord can&apos;t rely on
            blanket assumptions about a breed, species, or animal size to deny a request.
          </Para>

          <SectionHeading id="more-questions">Additional Questions Texas Renters Ask</SectionHeading>
          <SubHeading>Do Texas employers have to allow an ESA at work?</SubHeading>
          <Para>
            No. Federal ADA employment provisions cover trained service animals, not ESAs, and Texas has no state
            law requiring employers to accommodate emotional support animals in the workplace. Some employers may
            choose to allow it voluntarily, but that&apos;s discretionary rather than a guaranteed right — worth
            raising directly with HR if it&apos;s relevant.
          </Para>
          <SubHeading>Can I fly with my ESA in Texas?</SubHeading>
          <Para>
            Not under any special protection specific to ESAs. Since a 2021 Department of Transportation rule
            change, airlines are no longer required to treat ESAs differently from ordinary pets, and most now
            charge standard pet fees. A genuine PSD, because it&apos;s a trained service animal, retains
            protection under the Air Carrier Access Act and generally flies in the cabin without a pet fee.
          </Para>
          <SubHeading>Can a Texas HOA deny my ESA or PSD?</SubHeading>
          <Para>
            HOAs in Texas are generally subject to the same fair housing framework as landlords — the Texas Fair
            Housing Act and federal FHA apply to homeowners associations&apos; rules just as they do to rental
            housing, meaning an HOA generally cannot deny a reasonable accommodation for a valid ESA or PSD based
            on pet restrictions in its governing documents. As with landlords, an HOA can ask for reliable
            documentation if the disability-related need isn&apos;t obvious, but it can&apos;t demand a diagnosis
            or third-party certification.
          </Para>
          <SubHeading>Does an ESA letter expire in Texas? How do I verify a provider?</SubHeading>
          <Para>
            Texas doesn&apos;t set a statutory expiration date, but because the letter is meant to reflect a
            genuine, current clinical relationship, many landlords and practitioners treat documentation as
            current for roughly a year. Before starting, it&apos;s worth checking a provider&apos;s license
            status through the relevant Texas licensing boards — including the Texas State Board of Examiners of
            Psychologists and the Texas Behavioral Health Executive Council — both to protect yourself and
            because a landlord scrutinizing your letter may do the same. Texas Human Resources Code Chapter 121
            also extends some protections to animals actively being trained as service animals, though the scope
            is narrower than for a fully trained one.
          </Para>

          <SectionHeading id="denied">If a Texas Landlord Denies a Valid Request</SectionHeading>
          <Para>
            If you have credible documentation and a landlord still refuses a reasonable accommodation or
            improperly charges fees, you have a few options: file a housing discrimination complaint with the
            Texas Workforce Commission&apos;s Civil Rights Division (generally within one year of the alleged
            discrimination), file a complaint with HUD at the federal level, or pursue a private lawsuit in
            federal or state court. Keep your documentation, written correspondence with the landlord, and a
            timeline of events — that record matters if the situation escalates.
          </Para>

          <SectionHeading id="bottom-line">Bottom Line</SectionHeading>
          <Para>
            Texas doesn&apos;t impose a waiting period on ESA letters, but it does impose real, and recently
            strengthened, penalties for misrepresenting an untrained animal as a service dog, and its fair
            housing protections run through both federal law and an independently enforced state statute. The
            May 2026 HUD enforcement shift changed how the federal government prioritizes ESA-related housing
            complaints — it didn&apos;t eliminate ESA protections in Texas, and it isn&apos;t a reason to relabel
            an untrained companion animal as something it legally isn&apos;t. If your dog has genuinely been
            trained to perform a disability-related task, that status offers protection that doesn&apos;t depend
            on which way federal enforcement priorities move next; if it hasn&apos;t, your ESA&apos;s rights under
            the Fair Housing Act and Texas Property Code Chapter 301 are still real, still enforceable, and still
            worth understanding precisely.
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

      {/* ===== BOTTOM CTA ===== */}
      <section className="py-12 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">Need Texas ESA or PSD documentation?</h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            A Texas-licensed mental health professional can evaluate your situation and determine whether
            documentation is clinically appropriate. Every housing request is decided individually — no outcome
            is guaranteed, and you get a refund if you don&apos;t qualify.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={withAttribution("/assessment")} className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm">
              <i className="ri-stethoscope-line"></i> Start assessment
            </Link>
            <Link to="/esa-letter/texas" className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm">
              <i className="ri-map-pin-2-line"></i> Texas ESA letter guide
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
              { to: "/blog/texas-service-animal-laws-penalties", icon: "ri-scales-3-line", label: "Texas service animal laws & penalties" },
              { to: "/blog/how-to-train-psychiatric-service-dog-tasks", icon: "ri-shield-star-line", label: "How to train a psychiatric service dog" },
              { to: "/blog/2026-hud-esa-guidelines", icon: "ri-government-line", label: "2026 HUD ESA guidelines explained" },
              { to: "/states/california-esa-psd-guide", icon: "ri-map-pin-2-line", label: "California ESA & PSD guide (compare states)" },
              { to: "/esa-vs-psd-letter", icon: "ri-file-list-3-line", label: "ESA vs PSD letter" },
              { to: "/esa-letter/texas", icon: "ri-file-text-line", label: "Texas ESA letter guide" },
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
              This guide summarizes Texas and federal housing rules and is not a substitute for advice from a
              licensed attorney. PawTenant connects you with licensed mental health professionals; it does not
              train or certify service animals, claim any government affiliation, sell registrations,
              certificates, ID cards, or vests, or guarantee landlord approval or any legal outcome. Whether an
              ESA or PSD letter is issued is decided by a licensed provider after a real evaluation. For your
              specific circumstances, consult a Texas fair-housing attorney or the Texas Workforce Commission&apos;s
              Civil Rights Division.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
