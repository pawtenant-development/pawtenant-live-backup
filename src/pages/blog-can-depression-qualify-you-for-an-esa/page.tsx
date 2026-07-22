// Blog article — /blog/can-depression-qualify-you-for-an-esa
//
// "Can Depression Qualify You for an ESA?"
//
// Converted from the owner's Markdown draft into the established PawTenant
// blog-page structure (SEO-PSD-ESA-CONDITION-ARTICLE-BATCH-001). The source
// already distinguished the May 22, 2026 FHEO enforcement change from the FHA
// statute, private litigation, and state/local law — that distinction is
// preserved. YMYL edits applied:
//   • no promise of nationwide housing acceptance; no "every landlord must accept
//     every ESA letter"; housing framed as case-by-case and individualized.
//   • documentation confirms a QUALIFYING condition; a specific diagnosis need not
//     be disclosed in all contexts.
//   • research reference generalized (no single unverifiable attribution).
//   • ESA has no ADA public access; airlines may treat ESAs as pets since 2021.
//
// Facts verified against the May 22, 2026 HUD/FHEO enforcement guidance, ADA
// (ada.gov), and DOT (transportation.gov).
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + BlogPosting/Breadcrumb/FAQ JSON-LD.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/blog/can-depression-qualify-you-for-an-esa";
const HERO_IMG = "https://pawtenant.com/assets/lifestyle/esa-owner-hugging-dog-home.jpg";

const topicChips = ["Emotional Support Animal", "Depression", "Fair Housing", "2026 HUD Change"];

// ── ESA vs service animal comparison ─────────────────────────────────────────
const comparisonRows = [
  {
    feature: "Legal framework",
    esa: "Fair Housing Act (housing), plus some state laws",
    sa: "Americans with Disabilities Act (ADA)",
  },
  {
    feature: "Training",
    esa: "No task-specific training required",
    sa: "Individually trained to perform a specific task",
  },
  {
    feature: "Species",
    esa: "Any species (dog, cat, and others)",
    sa: "Dogs (and, in some cases, miniature horses)",
  },
  {
    feature: "Public access (stores, restaurants)",
    esa: "Not guaranteed",
    sa: "Guaranteed",
  },
  {
    feature: "Air travel",
    esa: "May be treated as an ordinary pet since 2021",
    sa: "Trained service dogs keep broader travel rights under DOT rules",
  },
  {
    feature: "Housing accommodation",
    esa: "Case-by-case since the May 2026 HUD guidance; varies by state",
    sa: "Broad ADA-style protections apply to trained animals",
  },
  {
    feature: "Documentation",
    esa: "Letter from a licensed mental health professional",
    sa: "No documentation can be legally required for ADA public access",
  },
];

// ── Legitimate ESA letter elements ───────────────────────────────────────────
const letterRows = [
  ["Confirmation of a diagnosed, qualifying condition", "Establishes the legal basis for accommodation (the specific diagnosis need not always be disclosed)"],
  ["A statement that the animal is part of your care", "Connects the animal to a genuine clinical need"],
  ["The clinician's license type, number, and jurisdiction", "Verifies the letter's legitimacy"],
  ["A recent date", "Shows an active, ongoing clinical relationship"],
  ["Clinician contact information (often expected)", "Lets housing providers confirm authenticity"],
];

// ── Before / after May 2026 ──────────────────────────────────────────────────
const beforeAfterRows = [
  ["HUD generally expected landlords to waive pet fees/rules for valid ESAs", "HUD enforcement now centers on trained service animals"],
  ["Untrained-ESA denials were commonly pursued as FHA violations", "Untrained-ESA denials are generally not pursued federally"],
  ["State laws applied on top of strong federal backing", "State laws remain the primary protection in many cases"],
  ["Private lawsuits were an additional option", "Private lawsuits remain available and unaffected"],
];

const faqs = [
  {
    q: "Can depression qualify you for an emotional support animal?",
    a: "Yes. Depression can qualify someone for an ESA when it is diagnosed by a licensed mental health professional and substantially limits a major life activity — such as sleeping, concentrating, working, or maintaining relationships — and the clinician determines an ESA is an appropriate part of managing those symptoms. It is not automatic: qualification depends on a genuine clinical evaluation, not a diagnosis label or an online quiz.",
  },
  {
    q: "Do I need a formal diagnosis to get an ESA letter for depression?",
    a: "Yes. A licensed mental health professional must evaluate you and confirm a diagnosed mental or emotional impairment before writing a legitimate ESA letter. A self-reported feeling of stress or sadness alone is not sufficient.",
  },
  {
    q: "Can my regular therapist write my ESA letter?",
    a: "Usually yes, provided they are a licensed mental health professional with an existing treatment relationship who can honestly attest to your condition and the need for the animal.",
  },
  {
    q: "Did HUD change ESA housing protections in 2026?",
    a: "Yes. On May 22, 2026, HUD's Office of Fair Housing and Equal Opportunity issued enforcement guidance stating it will generally find reasonable cause and recommend charges only where an animal is individually trained to perform disability-related work or tasks, aligning with the ADA's service-animal standard. The guidance reconfirmed rescission of the 2013 and 2020 assistance-animal notices. This changes HUD's federal enforcement approach — it does not repeal the Fair Housing Act. Private lawsuits under the FHA and state or local ESA protections are not affected.",
  },
  {
    q: "Can a landlord deny my ESA request even with a valid letter?",
    a: "Yes — and, at the federal level, more readily than before May 2026. A housing provider may also deny a request where the specific animal poses a direct threat, would cause substantial property damage, or represents an undue financial or administrative burden. Every request is decided individually; a valid letter supports a request but does not force approval.",
  },
  {
    q: "Do emotional support animals have public access or free flights?",
    a: "No. Only service animals individually trained to perform a task under the ADA have guaranteed access to places like restaurants and stores. And since a 2021 U.S. Department of Transportation rule change, airlines may treat emotional support animals as ordinary pets, subject to standard pet fees and carrier requirements.",
  },
];

function SectionHeading({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-xl md:text-2xl font-extrabold text-gray-900 mt-12 mb-4 scroll-mt-28">
      {children}
    </h2>
  );
}
function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">{children}</p>;
}
const inlineLink = "text-orange-600 font-semibold hover:text-orange-700 underline decoration-orange-200 underline-offset-2";

export default function BlogCanDepressionQualifyEsaPage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="can depression qualify you for an esa, emotional support animal for depression, esa letter depression, does depression qualify for an esa, esa vs service animal, fair housing act esa 2026, esa letter requirements depression"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="Can Depression Qualify You for an ESA?" />
      <meta
        property="og:description"
        content="Depression can qualify you for an emotional support animal when a licensed professional confirms it substantially limits a major life activity. Qualifying symptoms, ESA letter requirements, the ESA vs service animal difference, and HUD's May 2026 change."
      />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content={HERO_IMG} />
      <meta property="article:published_time" content="2026-07-22" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={HERO_IMG} />
      <meta name="twitter:title" content="Can Depression Qualify You for an ESA?" />
      <meta
        name="twitter:description"
        content="When depression qualifies for an ESA, what a valid letter needs, and how HUD's May 2026 change reshaped federal housing enforcement — explained without hype."
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
                headline: "Can Depression Qualify You for an ESA?",
                description:
                  "Depression can qualify you for an emotional support animal when a licensed mental health professional confirms it substantially limits a major life activity and an ESA is clinically appropriate. Qualifying symptoms, ESA letter requirements, the ESA vs service animal distinction, and HUD's May 2026 enforcement change.",
                mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
                url: CANONICAL,
                image: [HERO_IMG],
                datePublished: "2026-07-22",
                dateModified: "2026-07-22",
                author: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                publisher: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                articleSection: "Mental Health",
                keywords: topicChips.join(", "),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: "https://pawtenant.com/" },
                  { "@type": "ListItem", position: 2, name: "Blog", item: "https://pawtenant.com/blog" },
                  { "@type": "ListItem", position: 3, name: "Depression & Emotional Support Animals", item: CANONICAL },
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
            <span className="text-gray-500">Depression & Emotional Support Animals</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span key={chip} className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm">
                {chip}
              </span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[42px] text-gray-900 leading-tight mb-4 pt-hero-display">
            Can Depression Qualify You for an{" "}
            <span className="text-orange-500">ESA?</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-6">
            <span className="inline-flex items-center gap-1.5"><i className="ri-calendar-line text-orange-400"></i> Published July 2026</span>
            <span className="inline-flex items-center gap-1.5"><i className="ri-time-line text-orange-400"></i> ~9 min read</span>
            <span className="inline-flex items-center gap-1.5"><i className="ri-user-line text-orange-400"></i> PawTenant Editorial — reviewed for accuracy</span>
          </div>

          <div className="rounded-2xl bg-white border border-orange-200 shadow-[0_18px_45px_-25px_rgba(122,78,45,0.35)] p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-2.5 flex items-center gap-2">
              <i className="ri-flashlight-line"></i> Quick answer
            </p>
            <p className="text-sm md:text-[15px] text-gray-700 leading-relaxed">
              Yes — depression can qualify you for an emotional support animal (ESA) if it is diagnosed
              by a licensed mental health professional and substantially limits a major life activity,
              such as sleeping, concentrating, working, or maintaining relationships, and the
              professional determines an ESA is an appropriate part of your care. Qualification depends
              on a genuine clinical evaluation and a valid{" "}
              <Link to="/blog/what-is-an-esa-letter" className={inlineLink}>ESA letter</Link> — not a
              diagnosis label alone or an online quiz.
            </p>
          </div>

          <figure className="mt-8">
            <img
              src="/assets/lifestyle/esa-owner-hugging-dog-home.jpg"
              alt="A person at home finding comfort with their emotional support dog"
              width={1400}
              height={1051}
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

          <SectionHeading id="what-is-an-esa">What is an emotional support animal?</SectionHeading>
          <Para>
            An emotional support animal is a companion animal that provides comfort and therapeutic
            benefit to a person with a diagnosed mental health or emotional condition, simply through
            its presence and companionship. It does not need specialized training to perform a task —
            that is what separates it from a service animal.
          </Para>

          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide w-[26%]">Feature</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[37%]">Emotional support animal</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[37%]">Service animal</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr key={row.feature} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-5 py-3.5 text-xs font-semibold text-gray-700 align-top">{row.feature}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.esa}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.sa}</td>
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
                <div className="p-4 space-y-2.5">
                  <div><p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Emotional support animal</p><p className="text-xs text-gray-600 leading-relaxed">{row.esa}</p></div>
                  <div><p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Service animal</p><p className="text-xs text-gray-600 leading-relaxed">{row.sa}</p></div>
                </div>
              </div>
            ))}
          </div>

          <SectionHeading id="qualifying-standard">Does depression meet the qualifying standard?</SectionHeading>
          <Para>
            Depression qualifies for an ESA when it meets the same basic disability standard used for
            any accommodation request: a recognized mental or emotional impairment that substantially
            limits one or more major life activities. Common depression-related symptoms clinicians
            cite when recommending an ESA include:
          </Para>
          <ul className="space-y-2.5 my-5">
            {[
              "Persistent low mood or loss of interest in daily activities",
              "Disrupted sleep patterns (oversleeping or insomnia)",
              "Difficulty concentrating or completing tasks",
              "Social withdrawal and isolation",
              "Low motivation affecting daily routines and self-care",
              "Co-occurring anxiety, PTSD, or other conditions alongside depression",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <i className="ri-checkbox-circle-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                <span className="text-sm text-gray-600 leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>
          <Para>
            What makes qualification legitimate is not the word &quot;depression&quot; on its own — it
            is a licensed clinician&apos;s professional judgment, formed through a real assessment,
            that an ESA is a reasonable, clinically appropriate part of managing your specific
            symptoms.
          </Para>

          <SectionHeading id="letter-elements">What a legitimate ESA letter must include</SectionHeading>
          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[46%]">Element</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[54%]">Why it matters</th>
                </tr>
              </thead>
              <tbody>
                {letterRows.map(([el, why], i) => (
                  <tr key={el} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-5 py-3.5 text-xs font-semibold text-gray-700 align-top">{el}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-3 my-5">
            {letterRows.map(([el, why]) => (
              <div key={el} className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-800 mb-1">{el}</p>
                <p className="text-xs text-gray-600 leading-relaxed">{why}</p>
              </div>
            ))}
          </div>
          <Para>
            There is no single mandated letter format. What undermines a letter is the opposite of
            legitimacy: letters purchased from high-volume websites after a brief questionnaire, with
            no real clinical evaluation behind them, are increasingly scrutinized and often rejected by
            housing providers.
          </Para>

          <SectionHeading id="who-can-write">Who can write an ESA letter for depression?</SectionHeading>
          <Para>
            An ESA letter must come from a licensed mental health professional. That typically includes
            licensed psychologists, licensed clinical social workers, licensed professional counselors
            or therapists, psychiatrists, and psychiatric nurse practitioners. A single brief
            consultation is generally not enough for an honest recommendation — most legitimate ESA
            letters come from an existing treatment relationship or a genuine, individualized
            evaluation.
          </Para>

          {/* Mid CTA */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2">
              <i className="ri-stethoscope-line text-orange-500"></i> Wondering whether an ESA is right for you?
            </p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              A licensed mental health professional can evaluate your situation and decide whether an
              emotional support animal is clinically appropriate. You&apos;re only charged if you
              qualify — approval is never guaranteed.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to={withAttribution("/assessment")} className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm">
                <i className="ri-clipboard-line"></i> Start an ESA assessment
              </Link>
              <Link to="/housing-rights-esa" className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors text-sm">
                <i className="ri-home-heart-line"></i> ESA housing rights guide
              </Link>
            </div>
          </div>

          <SectionHeading id="the-2026-change">The 2026 legal change you need to know about</SectionHeading>
          <Para>
            For years, the Fair Housing Act led most landlords to waive &quot;no pet&quot; rules and
            fees for tenants with a valid ESA letter. The federal enforcement picture shifted in 2026.
            On <strong className="text-gray-800">May 22, 2026</strong>, HUD&apos;s Office of Fair
            Housing and Equal Opportunity (FHEO) issued enforcement guidance stating it will generally
            find reasonable cause and recommend charges only where an animal is individually trained to
            perform disability-related work or tasks — the ADA&apos;s service-animal standard — rather
            than automatically covering untrained emotional support animals. The guidance reconfirmed
            rescission of the 2013 and 2020 assistance-animal notices.
          </Para>
          <Para>
            It is important to be precise about what this is and isn&apos;t. It changes HUD&apos;s
            federal <em>enforcement</em> approach; it does <strong>not</strong> repeal the Fair Housing
            Act, and it does not prevent private litigation. Individuals can still file private lawsuits
            under the FHA, and state and local ESA protections are unaffected — several states maintain
            independent housing protections that may still require accommodation. Housing providers can
            also still choose to accommodate ESAs, and many continue to do so. Our{" "}
            <Link to="/blog/2026-hud-esa-guidelines" className={inlineLink}>
              2026 HUD ESA guidelines explainer
            </Link>{" "}
            covers the change in depth.
          </Para>

          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[50%]">Before May 2026</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[50%]">After May 2026</th>
                </tr>
              </thead>
              <tbody>
                {beforeAfterRows.map(([before, after], i) => (
                  <tr key={before} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{before}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-3 my-5">
            {beforeAfterRows.map(([before, after]) => (
              <div key={before} className="rounded-xl border border-gray-200 p-4 space-y-2">
                <div><p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Before May 2026</p><p className="text-xs text-gray-600 leading-relaxed">{before}</p></div>
                <div><p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">After May 2026</p><p className="text-xs text-gray-600 leading-relaxed">{after}</p></div>
              </div>
            ))}
          </div>

          <SectionHeading id="where-allowed">Where ESAs are (and aren&apos;t) allowed</SectionHeading>
          <ul className="space-y-2.5 my-5">
            {[
              ["Housing", "Now handled case-by-case; check your state and local laws in addition to federal guidance."],
              ["Public places (restaurants, stores)", "Not guaranteed access — only ADA service animals have this right."],
              ["Air travel", "Since a 2021 DOT rule change, airlines may treat ESAs as ordinary pets, subject to standard pet fees and carrier requirements."],
              ["Workplaces", "Not covered by the ADA as an ESA; any accommodation is at the employer's discretion or governed by separate state/local rules."],
            ].map(([label, desc]) => (
              <li key={label} className="flex items-start gap-3">
                <i className="ri-checkbox-circle-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                <span className="text-sm text-gray-600 leading-relaxed"><strong className="text-gray-800">{label}:</strong> {desc}</span>
              </li>
            ))}
          </ul>
          <Para>
            If travel is the concern, our guide to{" "}
            <Link to="/blog/emotional-support-animal-travel-anxiety" className={inlineLink}>
              emotional support animals and travel anxiety
            </Link>{" "}
            explains what an ESA can and cannot do on a plane.
          </Para>

          <SectionHeading id="esa-vs-psd">ESA or a task-trained service dog?</SectionHeading>
          <Para>
            If your depression is severe enough that you would benefit from a dog trained to take
            specific actions — not just comfort by presence — a psychiatric service dog (PSD) is a
            different path with broader rights, because it is individually task-trained. That
            distinction matters more under the 2026 federal enforcement standard. If you are weighing
            the two, see whether{" "}
            <Link to="/blog/can-depression-qualify-psychiatric-service-dog" className={inlineLink}>
              depression can qualify you for a psychiatric service dog
            </Link>
            , and, for a related condition, whether{" "}
            <Link to="/blog/can-anxiety-qualify-you-for-a-psd" className={inlineLink}>
              anxiety can qualify you for a PSD
            </Link>
            . A licensed provider can help you understand which path may fit.
          </Para>

          <SectionHeading id="still-worth-it">Is an ESA still worth pursuing for depression?</SectionHeading>
          <Para>
            Even with a narrower federal housing landscape, an ESA can still be meaningful. Many
            landlords, HOAs, and property managers continue to accommodate legitimate ESAs voluntarily,
            and state law may still require accommodation where federal enforcement has stepped back. A
            growing body of research has found associations between companion-animal ownership and
            reduced depression, anxiety, and loneliness, particularly among people managing serious
            mental health conditions. And a steady daily routine of animal care can support structure,
            motivation, and reduced isolation — common depression-management goals.
          </Para>

          <SectionHeading id="next-steps">Practical next steps</SectionHeading>
          <ol className="space-y-3 my-5">
            {[
              ["Schedule an evaluation", "with a licensed mental health professional — a therapist, psychologist, licensed clinical social worker, or psychiatrist."],
              ["Discuss your symptoms honestly", "including how they affect sleep, concentration, motivation, and relationships."],
              ["Ask whether an ESA is clinically appropriate", "for your specific situation — this is a professional judgment call, not a guarantee."],
              ["Receive a legitimate letter", "that confirms a qualifying condition, treatment relevance, and the license details described above."],
              ["Check your state and local laws", "in addition to federal guidance, since protections now vary more by location than before 2026."],
              ["Keep the letter current", "renewing it periodically to reflect an ongoing clinical relationship."],
            ].map(([title, desc], i) => (
              <li key={title as string} className="flex items-start gap-3.5">
                <div className="w-7 h-7 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
                <p className="text-sm text-gray-600 leading-relaxed"><strong className="text-gray-900">{title}</strong> {desc}</p>
              </li>
            ))}
          </ol>
          <Para>
            Avoid shortcuts like instant online certificates or national ESA &quot;registries,&quot;
            which carry no legal weight, and letters from providers who never actually evaluated you —
            these can undermine your case and, in some jurisdictions, carry penalties for
            misrepresentation.
          </Para>

          {/* Sources */}
          <div className="mt-10 rounded-xl bg-[#fafafa] border border-gray-100 p-5">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2.5">Sources & further reading</p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li className="flex items-start gap-2"><i className="ri-external-link-line text-gray-400 mt-0.5"></i><span>HUD assistance animals under the Fair Housing Act — <a href="https://www.hud.gov/helping-americans/assistance-animals" target="_blank" rel="noopener noreferrer" className={inlineLink}>hud.gov assistance animals</a></span></li>
              <li className="flex items-start gap-2"><i className="ri-external-link-line text-gray-400 mt-0.5"></i><span>DOT air travel with service animals — <a href="https://www.transportation.gov/individuals/aviation-consumer-protection/service-animals" target="_blank" rel="noopener noreferrer" className={inlineLink}>transportation.gov service animals</a></span></li>
              <li className="flex items-start gap-2"><i className="ri-external-link-line text-gray-400 mt-0.5"></i><span>PawTenant explainer: <Link to="/blog/2026-hud-esa-guidelines" className={inlineLink}>the 2026 HUD ESA guidelines</Link></span></li>
            </ul>
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
                {openFaq === i && (
                  <div className="px-5 pb-4 -mt-1"><p className="text-sm text-gray-600 leading-relaxed">{f.a}</p></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== BOTTOM CTA ===== */}
      <section className="py-12 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">See whether an ESA is right for you</h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            A licensed mental health professional reviews your assessment and decides whether an
            emotional support animal is clinically appropriate. You&apos;re only charged if you
            qualify — approval is never guaranteed.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={withAttribution("/assessment")} className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm">
              <i className="ri-file-text-line"></i> Start assessment
            </Link>
            <Link to="/housing-rights-esa" className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm">
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
              { to: "/blog/can-depression-qualify-psychiatric-service-dog", icon: "ri-shield-star-line", label: "Can depression qualify you for a PSD?" },
              { to: "/blog/2026-hud-esa-guidelines", icon: "ri-government-line", label: "2026 HUD ESA guidelines" },
              { to: "/blog/emotional-support-animal-travel-anxiety", icon: "ri-plane-line", label: "ESAs and travel anxiety" },
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
              <strong className="text-gray-600">Educational information, not legal or medical advice.</strong>{" "}
              Laws and HUD enforcement guidance can change. PawTenant connects you with licensed mental
              health professionals; whether an ESA is appropriate is decided by a licensed provider
              after a real evaluation. An ESA letter supports — but does not guarantee — a housing
              provider&apos;s decision, and it does not grant public-access or airline rights. For your
              specific situation, consult a licensed professional or attorney and check your state and
              local regulations before making housing or travel decisions based on an ESA.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
