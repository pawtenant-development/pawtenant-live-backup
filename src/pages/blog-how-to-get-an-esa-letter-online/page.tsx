// Blog article — /blog/how-to-get-an-esa-letter-online
//
// "How to Get an ESA Letter Online in 2026: Step-by-Step Guide" — converted
// from the owner's DOCX draft with legal-safety edits:
//   • Placeholder byline "[Jane Doe, LCSW]" removed — uses the approved
//     "PawTenant Editorial" convention (no invented clinician identity, no
//     fake clinical-review board). Schema author = Organization.
//   • "FHA Approved?" / "legally binding" reworded to "Recognized under the
//     FHA / housing providers must consider it" (no FHA-approval claim).
//   • Pet-fee + accommodation absolutes softened to "generally / state law
//     varies / decided individually"; no guaranteed approval.
//   • Anonymous clinician pull-quote converted to an editorial callout (no
//     fabricated direct quotation).
//   • Aligned with the 2026 HUD enforcement landscape (links to the HUD-change
//     explainer); raw "remove before publishing" link notes deleted.
// Facts verified: CA AB 468 (Health & Safety §122318) 30-day rule; FL Stat.
// §760.27; DOT 2021 ESA air-travel rule. Pricing matches site (llms.txt):
// ESA letter $115/year or $129 one-time.
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + BlogPosting/Breadcrumb/
// FAQ JSON-LD. Styling follows /blog/2026-hud-esa-guidelines.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/blog/how-to-get-an-esa-letter-online";
const HERO_IMG = "https://pawtenant.com/assets/lifestyle/woman-telehealth-with-dog.jpg";

const topicChips = ["ESA Letter Online", "Step-by-Step", "Fair Housing Act", "Licensed Provider"];

// ── Legitimate letter vs scam registry comparison ────────────────────────────
const comparisonRows = [
  {
    feature: "Document type",
    legit: "Signed letter from a provider licensed in your state",
    scam: "“PDF certificate” or ID card",
  },
  {
    feature: "Recognized under the FHA?",
    legit: "Yes — housing providers must consider it as part of a reasonable-accommodation request",
    scam: "No — carries no legal weight",
  },
  {
    feature: "Evaluation",
    legit: "Real telehealth or clinical session",
    scam: "2-minute automated online quiz",
  },
  {
    feature: "Pet fees & deposits",
    legit: "An approved ESA is generally exempt from pet deposits and breed rules — state law varies",
    scam: "None — a landlord can disregard it",
  },
  {
    feature: "Airline travel",
    legit: "Not applicable — ESA letters are housing-focused (DOT 2021 rule)",
    scam: "Not applicable",
  },
  {
    feature: "Validity period",
    legit: "Typically 12 months from the issue date",
    scam: "Marketed as “indefinite” — but never valid",
  },
];

const qualifyingConditions = [
  "Anxiety disorders — generalized anxiety, social anxiety, and panic disorder",
  "Major depressive disorder",
  "Post-traumatic stress disorder (PTSD)",
  "ADHD, when it significantly impacts daily functioning",
  "Bipolar disorder",
  "Phobias and agoraphobia",
  "Obsessive-compulsive disorder (OCD)",
];

const letterElements = [
  "The clinician's name, license type, license number, and state of licensure",
  "Their professional letterhead and contact information",
  "Your name as the patient",
  "A statement confirming a qualifying mental health condition",
  "Confirmation that your ESA provides emotional support related to that condition",
  "The date of issue — most letters are treated as valid for 12 months",
  "The clinician's signature",
];

// ── FAQs (rendered + FAQPage JSON-LD) ────────────────────────────────────────
const faqs = [
  {
    q: "Can a landlord refuse an ESA letter issued online?",
    a: "A housing provider generally cannot refuse a genuine ESA letter from a state-licensed mental health professional simply because it was issued through telehealth. They can question letters bought from “registration” websites where no real evaluation took place. Under the Fair Housing Act a landlord must consider a valid reasonable-accommodation request — though every request is reviewed individually, and federal HUD enforcement narrowed in 2026, so state and local laws increasingly matter. Approval is never guaranteed.",
  },
  {
    q: "Do online ESA letters expire?",
    a: "Most housing providers want to see an ESA letter dated within the last 12 months to confirm an ongoing need. Once it is older than that, a landlord can reasonably ask for updated documentation before continuing your accommodation. Renew before the 12-month mark to avoid a gap in your paperwork.",
  },
  {
    q: "What is the difference between an ESA letter and an ESA registration?",
    a: "An ESA letter is a signed document from a licensed mental health professional — the documentation recognized under the Fair Housing Act. An ESA “registration,” certificate, or ID card has no legal standing. There is no official government ESA registry in the United States, and a landlord is under no obligation to honor a registration.",
  },
  {
    q: "Can my own therapist write my ESA letter?",
    a: "Yes, if they hold a valid license in your state (LCSW, LMFT, LPC, psychologist, or psychiatrist) and are willing to document the need. If your current therapist declines or is not licensed in your state, you can be evaluated by a licensed provider through a telehealth service such as PawTenant, where the clinician conducts the evaluation and issues the letter only when it is clinically appropriate.",
  },
  {
    q: "How much does a legitimate ESA letter cost?",
    a: "Across the industry, a one-year ESA letter from a licensed provider typically runs from about $99 to $199. At PawTenant the ESA letter is $115 per year (annual subscription) or $129 one-time. Letters priced below $50 almost always skip a real evaluation — a red flag. Higher price alone does not mean stronger protection; what matters is that a licensed clinician conducted a genuine assessment.",
  },
  {
    q: "Is an ESA letter valid in all 50 states?",
    a: "The Fair Housing Act applies nationwide, but several states add their own requirements. California (AB 468) requires a 30-day established clinician-patient relationship before a letter can be issued, and Florida (Statute 760.27) requires a bona fide evaluation by a Florida-licensed provider rather than a questionnaire-only site. Always use a provider whose clinicians are licensed in the state where you live.",
  },
];

// ── Small reusable bits ──────────────────────────────────────────────────────
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

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5 my-5">
      {items.map((it) => (
        <li key={it} className="flex items-start gap-2.5 text-sm md:text-[15px] text-gray-600 leading-relaxed">
          <i className="ri-checkbox-circle-line text-orange-500 mt-0.5 flex-shrink-0"></i>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

const inlineLink =
  "text-orange-600 font-semibold hover:text-orange-700 underline decoration-orange-200 underline-offset-2";

export default function BlogHowToGetEsaLetterOnlinePage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="how to get an ESA letter online, ESA letter online 2026, get ESA letter, emotional support animal letter, online ESA evaluation, licensed ESA provider, ESA letter for housing, ESA letter cost, ESA letter process"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="How to Get an ESA Letter Online in 2026: Step-by-Step Guide" />
      <meta
        property="og:description"
        content="A clear, step-by-step guide to getting a legitimate ESA letter online in 2026 — who qualifies, the evaluation, cost, timing, and how to avoid scam registries."
      />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content={HERO_IMG} />
      <meta property="article:published_time" content="2026-06-18" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={HERO_IMG} />
      <meta name="twitter:title" content="How to Get an ESA Letter Online in 2026: Step-by-Step Guide" />
      <meta
        name="twitter:description"
        content="What it takes to get a real ESA letter online in 2026 — the evaluation, cost, timing, and the red flags to avoid."
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "BlogPosting",
                "@id": `${CANONICAL}#article`,
                headline: "How to Get an ESA Letter Online in 2026: Step-by-Step Guide",
                description:
                  "A step-by-step guide to getting a legitimate ESA letter online in 2026 — who qualifies, the licensed-provider evaluation, cost, timing, your housing rights, and how to avoid scam registries.",
                mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
                url: CANONICAL,
                image: [HERO_IMG],
                datePublished: "2026-06-18",
                dateModified: "2026-06-18",
                author: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                publisher: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                articleSection: "ESA Letters",
                keywords: topicChips.join(", "),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: "https://pawtenant.com/" },
                  { "@type": "ListItem", position: 2, name: "Blog", item: "https://pawtenant.com/blog" },
                  { "@type": "ListItem", position: 3, name: "How to Get an ESA Letter Online", item: CANONICAL },
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
            <Link to="/blog" className="hover:text-orange-600">Blog</Link>
            <span className="mx-1.5">/</span>
            <span className="text-gray-500">How to Get an ESA Letter Online</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span
                key={chip}
                className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm"
              >
                {chip}
              </span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[42px] font-extrabold text-gray-900 leading-tight mb-4">
            How to Get an ESA Letter Online in 2026:{" "}
            <span className="text-orange-500">Step-by-Step Guide</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-6">
            <span className="inline-flex items-center gap-1.5">
              <i className="ri-calendar-line text-orange-400"></i> Published June 2026
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="ri-time-line text-orange-400"></i> ~9 min read
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="ri-user-line text-orange-400"></i> PawTenant Editorial — reviewed for accuracy
            </span>
          </div>

          {/* Quick summary callout */}
          <div className="rounded-2xl bg-white border border-orange-200 shadow-[0_18px_45px_-25px_rgba(122,78,45,0.35)] p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-3 flex items-center gap-2">
              <i className="ri-flashlight-line"></i> Quick summary
            </p>
            <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
              <li><strong className="text-gray-900">Who qualifies:</strong> anxiety, depression, PTSD, ADHD, bipolar, phobias, OCD and similar conditions that substantially limit daily life</li>
              <li><strong className="text-gray-900">The process:</strong> intake form &rarr; licensed-provider evaluation &rarr; letter, often within 24&ndash;72 hours</li>
              <li><strong className="text-gray-900">Cost:</strong> $115/year or $129 one-time at PawTenant ($99&ndash;$199 is the typical industry range)</li>
              <li><strong className="text-gray-900">What protects you:</strong> a signed letter from a state-licensed provider — never a registry, certificate, or ID card</li>
              <li><strong className="text-gray-900">Housing:</strong> under the FHA a landlord must <em>consider</em> a valid accommodation request; an approved ESA is generally exempt from pet fees (state law varies)</li>
              <li><strong className="text-gray-900">Airlines:</strong> ESA letters no longer cover air travel (DOT 2021 rule) — that is the PSD route</li>
            </ul>
          </div>

          {/* Hero image — explicit width/height + fixed heights prevent layout shift; eager (LCP) */}
          <figure className="mt-8">
            <img
              src="/assets/lifestyle/woman-telehealth-with-dog.jpg"
              alt="Person at home with her emotional support dog during an online telehealth evaluation on a laptop"
              width={1600}
              height={1067}
              fetchPriority="high"
              decoding="async"
              className="w-full h-52 sm:h-80 md:h-[26rem] object-cover object-center rounded-3xl border border-orange-100 shadow-[0_24px_60px_-30px_rgba(122,78,45,0.35)]"
            />
          </figure>
        </div>
      </section>

      {/* ===== ARTICLE BODY ===== */}
      <article className="bg-white pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <Para>
            If your building has a no-pets policy but your mental health depends on your animal
            companion, an ESA letter is the document that supports your housing request. Under the{" "}
            <Link to="/housing-rights-esa" className={inlineLink}>Fair Housing Act</Link> (FHA), a
            valid ESA letter requires most housing providers to consider a reasonable accommodation
            — even where a pet policy would otherwise say no.
          </Para>
          <Para>
            The trouble is that most people either don&apos;t know how the process actually works, or
            they end up with a worthless document from a scam registry. This guide walks through every
            step of getting a legitimate ESA letter online in 2026 — what it takes, what it costs,
            how long it takes, and what to avoid.
          </Para>

          <SectionHeading id="what-is-an-esa-letter">What is an ESA letter, and why do you need one?</SectionHeading>
          <Para>
            An emotional support animal (ESA) letter is a document written by a licensed mental health
            professional (LMHP) that confirms two things: you have a qualifying mental health
            condition, and your animal provides therapeutic support that helps you manage it. If you
            want the full background first, see our explainer on{" "}
            <Link to="/blog/what-is-an-esa-letter" className={inlineLink}>what an ESA letter is</Link>.
          </Para>
          <Para>
            An ESA letter is <strong className="text-gray-800">not</strong> a certificate, a tag, a
            vest, or a registration. Those items carry no legal weight and are sold by scam sites to
            people who don&apos;t know the difference. The only document that supports your housing
            rights is a signed letter from a licensed professional on their official letterhead.
          </Para>

          <SubHeading>Legitimate ESA letter vs. scam registry — at a glance</SubHeading>

          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide w-[24%]">Feature</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[38%]">
                    <span className="inline-flex items-center gap-1.5">
                      <i className="ri-checkbox-circle-line text-orange-500"></i> Legitimate ESA letter
                    </span>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[38%]">
                    <span className="inline-flex items-center gap-1.5">
                      <i className="ri-close-circle-line text-gray-400"></i> Scam registry / certificate
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr key={row.feature} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-5 py-3.5 text-xs font-semibold text-gray-700 align-top">{row.feature}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.legit}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.scam}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="md:hidden space-y-3 my-5">
            {comparisonRows.map((row) => (
              <div key={row.feature} className="rounded-xl border border-gray-200 overflow-hidden">
                <p className="bg-[#fdf6ee] border-b border-orange-100 px-4 py-2.5 text-xs font-bold text-gray-800">
                  {row.feature}
                </p>
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <i className="ri-checkbox-circle-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                    <div>
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Legitimate ESA letter</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{row.legit}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <i className="ri-close-circle-line text-gray-400 mt-0.5 flex-shrink-0"></i>
                    <div>
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Scam registry / certificate</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{row.scam}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <SectionHeading id="who-qualifies">Who qualifies for an ESA letter in 2026?</SectionHeading>
          <Para>
            You do not need a severe or visible disability. If your mental health condition
            substantially limits one or more major life activities, you may qualify. Conditions a
            clinician commonly documents include:
          </Para>
          <CheckList items={qualifyingConditions} />
          <Para>
            The key phrase is &ldquo;substantially limits.&rdquo; A licensed clinician evaluates this
            during your consultation. You don&apos;t need a prior diagnosis before applying — the
            evaluation itself can establish one where the evidence supports it.
          </Para>

          <SectionHeading id="steps">Step-by-step: how to get an ESA letter online</SectionHeading>

          <SubHeading>Step 1: Choose a legitimate ESA letter provider</SubHeading>
          <Para>This is where most people make costly mistakes. A legitimate online provider will:</Para>
          <CheckList
            items={[
              "Use state-licensed mental health professionals — LCSWs, LMFTs, LPCs, psychologists, or psychiatrists",
              "Conduct a real clinical evaluation, not a quiz that auto-approves everyone",
              "Comply with state-specific rules — California's AB 468 requires a 30-day clinician-patient relationship before a letter can be issued",
              "Never guarantee approval before your consultation",
            ]}
          />
          <Para>
            <strong className="text-gray-800">What to avoid:</strong> any site that promises instant
            letters, sells ESA &ldquo;registrations,&rdquo; or offers approval without a live
            consultation. Those letters won&apos;t hold up with a landlord who does any verification.
            For more red flags, see{" "}
            <Link to="/are-online-esa-letters-legit" className={inlineLink}>are online ESA letters legit?</Link>{" "}
            At PawTenant, every ESA letter is issued by a licensed mental health professional after a
            proper clinical evaluation — and only when it is clinically appropriate.
          </Para>

          <SubHeading>Step 2: Complete your online intake assessment</SubHeading>
          <Para>Once you choose a provider, you fill out a short intake form covering:</Para>
          <CheckList
            items={[
              "Your current mental health symptoms and how they affect daily life",
              "Any existing diagnoses or prior treatment history",
              "Information about your emotional support animal — species and name",
              "Your housing situation",
            ]}
          />
          <Para>
            This form is not the evaluation itself — it&apos;s background your clinician reviews
            beforehand. Be honest and thorough; the more context your clinician has, the smoother the
            evaluation.
          </Para>

          <SubHeading>Step 3: Meet with a licensed mental health professional</SubHeading>
          <Para>
            The evaluation is the most important part of the process, and any legitimate provider will
            require it. Depending on your state, it takes one of two forms:
          </Para>
          <CheckList
            items={[
              "Live video consultation — a real-time telehealth session with a licensed clinician, typically 15 to 30 minutes",
              "Asynchronous review — permitted in some states, where the clinician reviews your intake and follows up via secure message",
            ]}
          />
          <Para>
            During this session, the clinician assesses whether your condition qualifies, whether an
            ESA provides meaningful therapeutic benefit, and whether they can ethically issue the
            letter. In California, a 30-day established relationship is required before the letter is
            signed — see our{" "}
            <Link to="/esa-letter/california" className={inlineLink}>California ESA letter</Link> guide.
          </Para>

          {/* Editorial callout (replaces the draft's anonymous clinician quote) */}
          <div className="my-6 rounded-2xl bg-[#f1f8e9] border-l-4 border-green-600 p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-green-800 mb-2 flex items-center gap-2">
              <i className="ri-stethoscope-line"></i> Why the evaluation matters
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              A genuine evaluation is a real clinical conversation — not a rubber stamp. A clinician
              looks at how your symptoms affect daily life at home (sleep, concentration, social
              withdrawal) and whether an animal provides a stabilizing presence they can document
              honestly. A letter generated from a three-minute quiz, with no clinician contact, is
              exactly the kind of document a landlord can challenge.
            </p>
          </div>

          <SubHeading>Step 4: Receive your ESA letter</SubHeading>
          <Para>
            If approved, your letter is typically delivered within 24 to 48 hours as a PDF; some
            providers also mail a physical copy on letterhead. A valid ESA letter should include:
          </Para>
          <CheckList items={letterElements} />
          <Para>
            If your letter is missing any of these elements, a landlord has grounds to question it.
            Our guide on{" "}
            <Link to="/blog/esa-letter-requirements" className={inlineLink}>ESA letter requirements</Link>{" "}
            breaks down every element and why each one matters.
          </Para>

          {/* ── Mid-article CTA ── */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2">
              <i className="ri-stethoscope-line text-orange-500"></i> Ready to start your evaluation?
            </p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              A licensed mental health professional reviews your situation and, if you qualify, issues
              a verifiable ESA letter for housing. No outcome is guaranteed — every request is
              decided individually, and there&apos;s a refund if you don&apos;t qualify.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to={withAttribution("/assessment")}
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm"
              >
                <i className="ri-clipboard-line"></i> Start your ESA assessment
              </Link>
              <Link
                to="/esa-letter-cost"
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors text-sm"
              >
                <i className="ri-price-tag-3-line"></i> See ESA letter pricing
              </Link>
            </div>
          </div>

          <SubHeading>Step 5: Submit your ESA letter to your housing provider</SubHeading>
          <Para>Submit your letter as a formal accommodation request, and do it carefully:</Para>
          <CheckList
            items={[
              "Submit in writing — email creates a paper trail; follow up with a hard copy if requested",
              "State your request clearly — note that you are requesting a reasonable accommodation under the Fair Housing Act",
              "Keep copies of everything — your letter, your submission email, and all landlord responses",
            ]}
          />
          <Para>
            A landlord generally has a reasonable period (often around 10 days) to respond. They may
            request supporting information but cannot demand your full medical records or diagnosis
            details, and an approved ESA is generally exempt from pet deposits, pet rent, and
            breed/weight restrictions — though state law varies and each request is decided
            individually. Our guide to{" "}
            <Link to="/esa-letter-for-landlord" className={inlineLink}>sending an ESA letter to your landlord</Link>{" "}
            walks through the wording.
          </Para>

          <SectionHeading id="how-long">How long does getting an ESA letter take?</SectionHeading>
          <Para>
            For most people in most states, the full process — intake to letter — takes 24 to
            72 hours through an online provider. The main variables:
          </Para>
          <CheckList
            items={[
              "State law — California's 30-day requirement extends the timeline",
              "Clinician availability — video consultations may need scheduling a day or two out",
              "Intake completeness — gaps in your assessment form can create delays",
            ]}
          />

          <SectionHeading id="cost">How much does an ESA letter cost in 2026?</SectionHeading>
          <Para>
            Legitimate ESA letters from licensed providers typically range from about $99 to $199 for a
            standard one-year letter; some providers offer lower renewal pricing. At PawTenant, an ESA
            letter is $115 per year or $129 one-time — see{" "}
            <Link to="/esa-letter-cost" className={inlineLink}>ESA letter cost</Link> for what&apos;s
            included.
          </Para>
          <Para>
            Be wary of both extremes: letters below $50 almost always skip a real evaluation, and
            paying $300+ does not improve your legal standing. What matters is that a licensed clinician
            conducted a genuine assessment — price alone tells you nothing.
          </Para>

          <SectionHeading id="mistakes">Common mistakes to avoid</SectionHeading>
          <Para>
            <strong className="text-gray-800">Buying from an ESA registry.</strong> Registries, ID
            cards, and vests carry no legal standing under the FHA. Landlords have no obligation to
            honor them.
          </Para>
          <Para>
            <strong className="text-gray-800">Using a provider not licensed in your state.</strong>{" "}
            Clinicians must hold a valid license where you reside. States like California and Florida
            have explicit licensing requirements tied to ESA letter validity.
          </Para>
          <Para>
            <strong className="text-gray-800">Not renewing on time.</strong> ESA letters are generally
            treated as valid for about 12 months. An outdated letter gives a landlord grounds to
            request updated documentation — renew before it lapses. See{" "}
            <Link to="/renew-esa-letter" className={inlineLink}>how to renew your ESA letter</Link>.
          </Para>
          <Para>
            <strong className="text-gray-800">Expecting airlines to honor it.</strong> Following the
            2021 DOT rule change, airlines are no longer required to accommodate ESAs in the cabin. ESA
            letters apply to housing. For air travel, look at{" "}
            <Link to="/how-to-get-psd-letter" className={inlineLink}>psychiatric service dog (PSD) documentation</Link>.
          </Para>

          <figure className="my-6">
            <img
              src="/assets/lifestyle/freelancer-with-dog-laptop.jpg"
              alt="Renter completing an ESA intake assessment on a laptop at home with a dog beside her"
              width={1600}
              height={1067}
              loading="lazy"
              decoding="async"
              className="w-full h-48 sm:h-72 object-cover object-center rounded-2xl border border-gray-100"
            />
            <figcaption className="text-xs text-gray-400 mt-2 text-center">
              The online intake is background information — the licensed-provider evaluation is the
              step that produces a defensible letter.
            </figcaption>
          </figure>

          <SectionHeading id="rights">Your rights once you have an ESA letter</SectionHeading>
          <Para>
            Under the Fair Housing Act, a valid ESA letter generally supports your ability to:
          </Para>
          <CheckList
            items={[
              "Request to live with your ESA in no-pet housing — a landlord cannot refuse based solely on a no-pets policy",
              "Be exempt from pet deposits, pet rent, or breed-specific fees for an approved emotional support animal (state law varies)",
              "Seek accommodations in most housing types — apartments, condos, and many HOA communities (some exclusions apply, such as owner-occupied buildings with four or fewer units)",
            ]}
          />
          <Para>
            A landlord generally cannot retaliate against you or refuse to renew your lease because you
            have an ESA. One important 2026 note: federal HUD enforcement has narrowed for untrained
            emotional support animals, so state and local laws and private legal action matter more
            than before. Our explainer on{" "}
            <Link to="/are-esa-letters-still-valid-after-hud-change" className={inlineLink}>whether ESA letters are still valid after the HUD change</Link>{" "}
            covers what did and did not change. If you face a denial, see{" "}
            <Link to="/landlord-denied-esa-letter" className={inlineLink}>what to do when a landlord denies your ESA letter</Link>.
          </Para>
        </div>
      </article>

      {/* ===== FAQ ===== */}
      <section className="py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-8 text-center">
            Frequently asked questions about getting an ESA letter online
          </h2>
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
                  <i
                    className={`ri-arrow-down-s-line text-gray-400 text-lg flex-shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`}
                  ></i>
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
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">Ready to get your ESA letter?</h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            A licensed clinician evaluates your situation and, if you qualify, issues a verifiable ESA
            letter for housing. Every request is decided individually — no outcome is guaranteed,
            and there&apos;s a refund if you don&apos;t qualify.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to={withAttribution("/assessment")}
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm"
            >
              <i className="ri-stethoscope-line"></i> Start assessment
            </Link>
            <Link
              to="/housing-rights-esa"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm"
            >
              <i className="ri-home-heart-line"></i> ESA housing rights guide
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
              { to: "/blog/what-is-an-esa-letter", icon: "ri-file-text-line", label: "What is an ESA letter? 2026 guide" },
              { to: "/blog/esa-letter-requirements", icon: "ri-list-check-2", label: "ESA letter requirements explained" },
              { to: "/housing-rights-esa", icon: "ri-home-heart-line", label: "ESA housing rights (FHA)" },
              { to: "/are-online-esa-letters-legit", icon: "ri-shield-check-line", label: "Are online ESA letters legit?" },
              { to: "/renew-esa-letter", icon: "ri-refresh-line", label: "How to renew your ESA letter" },
              { to: "/are-esa-letters-still-valid-after-hud-change", icon: "ri-government-line", label: "ESA letters & the 2026 HUD change" },
            ].map((r) => (
              <Link
                key={r.to}
                to={r.to}
                className="flex items-center gap-3 h-full bg-white border border-orange-100 rounded-xl px-4 py-3.5 hover:border-orange-300 hover:shadow-sm transition-all"
              >
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
              <strong className="text-gray-600">Informational only — not legal or medical advice.</strong>{" "}
              This guide from the PawTenant Editorial Team explains a developing area of housing policy
              and is not a substitute for advice from a licensed attorney or clinician. State and local
              law vary and may provide protections beyond the federal floor described here. PawTenant
              connects you with licensed mental health professionals who decide whether a letter is
              appropriate; it does not sell ESA registrations, claim any government affiliation, or
              guarantee landlord approval, fee waivers, or any legal outcome. For your specific
              situation, consult a fair-housing attorney or your state fair-housing agency.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
