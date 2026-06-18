// Blog article — /blog/esa-letter-requirements
//
// "ESA Letter Requirements: What Must Be Included to Be Valid in 2026" —
// converted from the owner's DOCX draft with legal-safety + accuracy edits:
//   • Placeholder byline "[Jane Doe, LCSW]" + "Clinical Review Board" badge
//     removed — approved "PawTenant Editorial" convention. Schema author = Org.
//   • Editor-only notes ("Meta Description:", "Primary Keyword:", "Add FAQ
//     Schema markup…", "Internal Linking Map — remove before publishing")
//     deleted; raw URL notes converted to real internal links.
//   • ACCURACY FIX 1: Florida REMOVED from the "30-day relationship" group.
//     FL Stat. §760.27 requires a bona fide provider relationship + valid
//     in-person/telehealth assessment, NOT a fixed 30-day wait (that applies
//     to CA, MT, IA, AR, and LA). Verified via state-law coverage.
//   • ACCURACY FIX 2: Henderson v. Five Properties LLC framed accurately as a
//     fee-waiver-necessity ruling (E.D. La., Judge Vance, July 2025; HUD
//     attached it to its 2026 memo), not a disability-nexus denial.
//   • Anonymous clinician quotes converted to editorial callouts (no fabricated
//     direct quotation).
// Facts verified against: 42 U.S.C. §3604(f); HUD's Sept 17 2025 withdrawal of
// FHEO-2020-01/2013-01; the May 22 2026 FHEO enforcement memo; CA AB 468; FL
// Stat. §760.27; Henderson v. Five Props. LLC.
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + BlogPosting/Breadcrumb/
// FAQ JSON-LD. Styling follows /blog/2026-hud-esa-guidelines.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/blog/esa-letter-requirements";
const HERO_IMG = "https://pawtenant.com/assets/lifestyle/person-paperwork-with-dog.jpg";

const topicChips = ["ESA Letter Requirements", "10 Required Elements", "2026 Update", "Fair Housing Act"];

// ── 10 required elements ─────────────────────────────────────────────────────
const elementRows = [
  { n: 1, element: "Professional letterhead", why: "Establishes the document as a clinical communication. Plain-paper letters give landlords immediate grounds to question authenticity — especially since scrutiny increased after the 2025 guidance withdrawal." },
  { n: 2, element: "Clinician's full name", why: "Identifies the issuing professional so landlords and state agencies can verify their existence and credentials." },
  { n: 3, element: "License type & number", why: "The single most commonly missing element. Without a verifiable license number, a landlord cannot confirm the author is actually licensed — and a rejection is legally defensible." },
  { n: 4, element: "State of licensure", why: "The clinician must be licensed in your state of residence. A CA-licensed therapist cannot issue a valid letter for a Florida tenant under FL Stat. §760.27." },
  { n: 5, element: "Practice contact information", why: "Enables verification — phone, email, and address let a housing provider confirm authenticity without demanding your medical records." },
  { n: 6, element: "Provider relationship / evaluation date", why: "An established relationship is specifically required by California, Montana, Iowa, Arkansas, and Louisiana statutes; Florida requires a bona fide relationship and a valid assessment. Establishes a real clinical relationship before the letter issued." },
  { n: 7, element: "Patient's full legal name", why: "Ties the letter to you specifically. ESA letters are non-transferable." },
  { n: 8, element: "Statement of qualifying disability", why: "Must confirm a mental or physical impairment that substantially limits a major life activity. It does not need to name the diagnosis — but must establish a disability exists." },
  { n: 9, element: "Disability-animal nexus statement", why: "The element that became most critical after 2025. It must document why this specific animal provides therapeutic benefit for your specific condition. Generic language fails here." },
  { n: 10, element: "Clinician's signature & issue date", why: "Makes the letter legally attributable. The issue date sets the practical validity window — most landlords expect documentation from within the past 12 months." },
];

// ── "Looks real but invalid" table ───────────────────────────────────────────
const invalidRows = [
  { has: "Professional letterhead + name", missing: "License number & state", result: "Landlord can legally request clarification or deny — they cannot verify the clinician is real" },
  { has: "All elements present", missing: "A genuine clinical evaluation", result: "Still invalid — the letter is fraudulent if no real assessment occurred; courts and state agencies scrutinize this post-2025" },
  { has: "Licensed clinician, but out of state", missing: "State-specific relationship requirement", result: "Invalid in that state under local statute, regardless of federal compliance" },
  { has: "All 10 elements", missing: "An issue date within ~12 months", result: "Landlord can request updated documentation; an outdated letter weakens your position" },
  { has: "Real evaluation + valid letter", missing: "Disability-animal nexus specificity", result: "Vague therapeutic-benefit language is increasingly challenged after the guidance withdrawal" },
];

// ── FAQs (rendered + FAQPage JSON-LD) ────────────────────────────────────────
const faqs = [
  {
    q: "What must an ESA letter include to be valid in 2026?",
    a: "A valid ESA letter generally includes 10 elements: professional letterhead, the clinician's full name, license type and number, state of licensure, practice contact information, the date of the provider relationship/evaluation, the patient's full name, a statement confirming a qualifying disability, a disability-animal nexus statement explaining how the animal helps, and the clinician's signature with issue date. Missing the license number or the nexus statement are the two most common causes of rejection since HUD withdrew its guidance in September 2025.",
  },
  {
    q: "Can any doctor write an ESA letter?",
    a: "Generally no. A valid ESA letter should come from a licensed mental health professional (LMHP) — an LCSW, LMFT, LPC, psychologist, or psychiatrist — who holds an active license in your state of residence. General practitioners without mental health licensure typically carry less weight. In California, Montana, Iowa, Arkansas, and Louisiana the clinician must also have an established relationship (often 30 days) before issuing the letter; Florida requires a bona fide relationship and a valid in-person or telehealth assessment.",
  },
  {
    q: "Is a telehealth ESA letter legally valid?",
    a: "Yes, provided it results from a genuine clinical evaluation — not a questionnaire. HUD recognized telehealth as an appropriate evaluation method before withdrawing its guidance in September 2025, and courts have continued to treat telehealth-based letters as valid when the clinician is licensed in the patient's state and conducted a real assessment. Florida's Stat. §760.27 requires a valid assessment and prohibits letters issued without any live evaluation.",
  },
  {
    q: "How long is an ESA letter valid?",
    a: "The Fair Housing Act does not set a statutory expiration date. However, most housing providers request documentation dated within the past 12 months to verify an ongoing need. After HUD's guidance withdrawal in September 2025, some landlords have become more aggressive about requesting updated letters. Renewing annually — particularly before a lease renewal or a move — protects your accommodation from being challenged on currency grounds.",
  },
  {
    q: "What happens if my ESA letter is rejected?",
    a: "First, determine the reason. If the landlord claims a missing element, ask for clarification in writing and give them the chance to specify what they need. If the letter is complete and the denial appears discriminatory, then — because HUD's federal enforcement office shifted toward trained assistance animals in May 2026 — an effective first step is often a complaint with your state human-rights or fair-housing agency (for example, the California Civil Rights Department or the Florida Commission on Human Relations), which enforce laws that still protect untrained ESAs independently of HUD. Your private litigation rights under 42 U.S.C. §3604(f) also remain intact; a fair-housing attorney can advise. Document everything from the start.",
  },
  {
    q: "Can a landlord charge a pet deposit for an ESA even with a valid letter?",
    a: "This area is now legally contested. Historically, a valid ESA letter waived pet-related fees. However, the July 2025 Henderson v. Five Properties LLC ruling found that a Louisiana landlord could apply a generally applicable animal fee to an ESA owner because the tenant could not prove that waiving the fee was necessary for equal use and enjoyment of the housing. That ruling is jurisdiction-specific and does not change the law nationally, but it signals the automatic fee-waiver assumption is under challenge. State laws in California, New York, and others still offer stronger fee protections.",
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

function CheckList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2.5 my-5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm md:text-[15px] text-gray-600 leading-relaxed">
          <i className="ri-checkbox-circle-line text-orange-500 mt-0.5 flex-shrink-0"></i>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

const inlineLink =
  "text-orange-600 font-semibold hover:text-orange-700 underline decoration-orange-200 underline-offset-2";

export default function BlogEsaLetterRequirementsPage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="ESA letter requirements, valid ESA letter requirements, what must an ESA letter include, FHA ESA letter, ESA letter 2026, ESA letter elements, ESA letter for housing, emotional support animal letter requirements"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="ESA Letter Requirements: What Must Be Included to Be Valid in 2026" />
      <meta
        property="og:description"
        content="A valid ESA letter must meet specific requirements. The 10 elements your letter needs to be accepted by landlords — and what changed in 2026."
      />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content={HERO_IMG} />
      <meta property="article:published_time" content="2026-06-18" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={HERO_IMG} />
      <meta name="twitter:title" content="ESA Letter Requirements: What Must Be Included in 2026" />
      <meta
        name="twitter:description"
        content="The 10 elements a valid ESA letter must contain to hold up with landlords — and what changed after HUD's 2025–2026 policy shifts."
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
                headline: "ESA Letter Requirements: What Must Be Included to Be Valid in 2026",
                description:
                  "The 10 required elements of a valid ESA letter, what makes a letter invalid even when it looks real, state-specific rules, and what changed after HUD's 2025–2026 policy shifts.",
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
                  { "@type": "ListItem", position: 3, name: "ESA Letter Requirements", item: CANONICAL },
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
            <span className="text-gray-500">ESA Letter Requirements</span>
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
            ESA Letter Requirements:{" "}
            <span className="text-orange-500">What Must Be Included to Be Valid in 2026</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-6">
            <span className="inline-flex items-center gap-1.5">
              <i className="ri-calendar-line text-orange-400"></i> Published June 2026
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="ri-time-line text-orange-400"></i> ~11 min read
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="ri-user-line text-orange-400"></i> PawTenant Editorial — reviewed for accuracy
            </span>
          </div>

          {/* Quick reference callout */}
          <div className="rounded-2xl bg-white border border-orange-200 shadow-[0_18px_45px_-25px_rgba(122,78,45,0.35)] p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-3 flex items-center gap-2">
              <i className="ri-flashlight-line"></i> Quick reference: ESA letter requirements in 2026
            </p>
            <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
              <li><strong className="text-gray-900">Required elements:</strong> 10 components — all expected (full table below)</li>
              <li><strong className="text-gray-900">Who can write it:</strong> a state-licensed LMHP — LCSW, LMFT, LPC, psychologist, or psychiatrist</li>
              <li><strong className="text-gray-900">Licensed in your state:</strong> the clinician must hold an active license where you live</li>
              <li><strong className="text-gray-900">CA, MT, IA, AR, LA:</strong> an established (often 30-day) relationship before the letter can be issued. FL: a bona fide relationship + valid assessment</li>
              <li><strong className="text-gray-900">Evaluation type:</strong> a genuine clinical assessment — telehealth is valid; questionnaire-only is not</li>
              <li><strong className="text-gray-900">Expiration:</strong> no statutory expiration, but most landlords expect an annual update</li>
              <li><strong className="text-gray-900">Common rejection causes:</strong> missing license number, no letterhead, internet registry, no real evaluation</li>
            </ul>
          </div>

          {/* Hero image — eager (LCP) */}
          <figure className="mt-8">
            <img
              src="/assets/lifestyle/person-paperwork-with-dog.jpg"
              alt="Person reviewing the required elements of an ESA letter document at home with a dog beside her"
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
            Your landlord receives your ESA accommodation request. They pull out your letter, scan it
            for thirty seconds, and hand it back. Request denied. It happens more than you&apos;d think
            — and usually not because the person didn&apos;t have a qualifying condition. It&apos;s
            because the letter was missing one or two specific elements a housing provider is permitted
            to require: a missing license number, a vague therapeutic-benefit statement, plain paper
            instead of letterhead. Any of these can be enough.
          </Para>
          <Para>
            In 2026, getting your ESA letter right matters more than ever. When HUD withdrew its
            guidance documents in September 2025, it removed the procedural framework landlords and
            tenants had both relied on to evaluate ESA documentation. The result: more scrutiny, more
            variation in how providers handle requests, and a higher burden on the quality of your
            paperwork. (New to ESA letters? Start with{" "}
            <Link to="/blog/what-is-an-esa-letter" className={inlineLink}>what an ESA letter is</Link>.)
          </Para>

          {/* 2025–2026 timeline callout */}
          <div className="my-6 rounded-2xl bg-amber-50 border border-amber-200 p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700 mb-3 flex items-center gap-2">
              <i className="ri-alert-line"></i> 2025–2026 federal ESA policy timeline
            </p>
            <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
              <li><strong className="text-gray-900">September 17, 2025:</strong> HUD withdrew guidance documents FHEO-2020-01 and FHEO-2013-01, removing the documentation framework landlords and tenants had relied on for a decade.</li>
              <li><strong className="text-gray-900">May 22, 2026:</strong> HUD announced its enforcement office will align with the ADA training standard — pursuing federal enforcement mainly for animals trained to perform disability-related tasks.</li>
              <li><strong className="text-gray-900">What did NOT change:</strong> the Fair Housing Act statute (42 U.S.C. §3604(f)) remains intact, state fair housing laws are unaffected, and private FHA litigation rights are preserved.</li>
            </ul>
          </div>

          <SectionHeading id="why-matters">Why ESA letter requirements matter more in 2026</SectionHeading>
          <Para>
            For over a decade, HUD&apos;s FHEO Notice 2020-01 told both landlords and tenants what an
            ESA letter needed to contain and what housing providers were permitted to verify. That
            framework was withdrawn on September 17, 2025. The withdrawal did not change the Fair
            Housing Act itself — 42 U.S.C. §3604(f) still prohibits disability-based housing
            discrimination, and ESAs still qualify as assistance animals. What it changed is the
            operating environment: without standardized HUD guidance, landlords now have more
            discretion to question and challenge letters that fall short, and courts — not HUD
            administrators — are increasingly the arbiters of what counts as adequate documentation.
          </Para>
          <Para>
            Then on May 22, 2026, HUD announced its enforcement office would align with the ADA&apos;s
            training standard. This raised the stakes for documentation quality further: if federal
            enforcement is no longer your backstop, your letter&apos;s ability to support a state-level
            claim or private FHA lawsuit becomes your primary protection. A complete, clinician-backed,
            verifiable letter is now the difference between a smooth accommodation and a protracted
            dispute.
          </Para>

          <SectionHeading id="ten-elements">The 10 required elements of a valid ESA letter</SectionHeading>
          <Para>
            There is no single federal statute that lists these in a numbered list — the standard has
            been built from HUD guidance, court decisions, and state laws. The elements below reflect
            what courts and housing providers consistently require and what clinical practice standards
            define as necessary for a defensible letter.
          </Para>

          {/* Desktop 10-element table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-4 py-3.5 text-xs font-bold text-gray-900 w-[7%]">#</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-gray-900 w-[30%]">Required element</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-gray-900 w-[63%]">Why it can&apos;t be missing in 2026</th>
                </tr>
              </thead>
              <tbody>
                {elementRows.map((row, i) => (
                  <tr key={row.n} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-4 py-3.5 text-xs font-bold text-orange-500 align-top">{row.n}</td>
                    <td className="px-4 py-3.5 text-xs font-semibold text-gray-700 align-top">{row.element}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile 10-element cards */}
          <div className="md:hidden space-y-3 my-5">
            {elementRows.map((row) => (
              <div key={row.n} className="rounded-xl border border-gray-200 overflow-hidden">
                <p className="bg-[#fdf6ee] border-b border-orange-100 px-4 py-2.5 text-xs font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{row.n}</span>
                  {row.element}
                </p>
                <p className="px-4 py-3 text-xs text-gray-600 leading-relaxed">{row.why}</p>
              </div>
            ))}
          </div>

          {/* Editorial callout (replaces draft's anonymous LPC quote) */}
          <div className="my-6 rounded-2xl bg-[#f1f8e9] border-l-4 border-green-600 p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-green-800 mb-2 flex items-center gap-2">
              <i className="ri-error-warning-line"></i> The most common reason letters get rejected
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              It is rarely a bad diagnosis — it&apos;s a missing license number, or a letter on plain
              paper with no letterhead. Landlords have grown more sophisticated about verification,
              especially after the HUD guidance withdrawal. Every element needs to be present, and it
              needs to be verifiable.
            </p>
          </div>

          <SectionHeading id="nexus">The most critical element: the disability-animal nexus</SectionHeading>
          <Para>
            Element 9 — the disability-animal nexus statement — deserves its own section. It is the
            element that changed most in importance since 2025, and the one most often written poorly
            even by legitimate clinicians.
          </Para>
          <Para>
            A generic nexus statement looks like this: &ldquo;The patient&apos;s emotional support
            animal provides comfort and support for their mental health condition.&rdquo; That used to
            be enough. It no longer is. A defensible nexus statement in 2026 does three things:
          </Para>
          <CheckList
            items={[
              "Names the specific symptoms or functional limitations of your condition (e.g., “difficulty maintaining sleep, persistent hypervigilance, and social withdrawal associated with PTSD”)",
              "Connects the animal specifically to alleviating those symptoms (e.g., “the presence of their dog during nighttime hours significantly reduces hypervigilance episodes and improves sleep continuity”)",
              "Is grounded in clinical observation, not boilerplate — meaning the clinician actually evaluated you and is documenting findings, not copying a template",
            ]}
          />
          <Para>
            Why this matters now: without HUD guidance actively enforcing documentation standards,
            courts and state bodies decide whether a nexus statement is adequate. The July 2025{" "}
            <em>Henderson v. Five Properties LLC</em> ruling in the Eastern District of Louisiana —
            where the court held that a tenant seeking a waiver of a generally applicable animal fee
            had to prove the waiver was <em>necessary</em> for equal use and enjoyment of her home — is
            an early signal that documentation and necessity are being scrutinized more closely. (HUD
            later attached that decision to its 2026 enforcement memo.)
          </Para>

          {/* Editorial clinical-insight callout */}
          <div className="my-6 rounded-2xl bg-white border border-orange-200 p-5 sm:p-6 shadow-[0_18px_45px_-30px_rgba(122,78,45,0.35)]">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-2 flex items-center gap-2">
              <i className="ri-mental-health-line"></i> Specificity is safety
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              A strong evaluation doesn&apos;t just say an animal &ldquo;reduces stress.&rdquo; It
              documents the exact functional intersection — for instance, how an animal&apos;s tactile,
              deep-pressure stimulation helps ground a person during a panic episode. In the 2026 legal
              climate, that specificity is what makes a letter defensible. When PawTenant&apos;s
              licensed providers issue a letter, the nexus statement is one of the components reviewed
              for specificity and clinical detail.
            </p>
          </div>

          <SectionHeading id="invalid">What makes an ESA letter invalid — even if it looks real</SectionHeading>
          <Para>
            The most dangerous ESA letters are not the obviously fake ones. They&apos;re the ones that
            look legitimate — on letterhead, signed by someone with credentials — but have a flaw that
            makes them unenforceable. Here is what to watch for, and the legal consequence of each.
          </Para>

          {/* Desktop invalid table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-4 py-3.5 text-xs font-bold text-gray-900 w-[28%]">What the letter has</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-gray-900 w-[28%]">What&apos;s missing</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-gray-900 w-[44%]">Legal result</th>
                </tr>
              </thead>
              <tbody>
                {invalidRows.map((row, i) => (
                  <tr key={i} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-4 py-3.5 text-xs font-semibold text-gray-700 align-top">{row.has}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.missing}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile invalid cards */}
          <div className="md:hidden space-y-3 my-5">
            {invalidRows.map((row, i) => (
              <div key={i} className="rounded-xl border border-gray-200 overflow-hidden">
                <p className="bg-[#fdf6ee] border-b border-orange-100 px-4 py-2.5 text-xs font-bold text-gray-800">{row.has}</p>
                <div className="p-4 space-y-2">
                  <p className="text-xs text-gray-600 leading-relaxed"><span className="font-bold text-gray-500">Missing:</span> {row.missing}</p>
                  <p className="text-xs text-gray-600 leading-relaxed"><span className="font-bold text-gray-500">Legal result:</span> {row.result}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Registry warning callout */}
          <div className="my-6 rounded-xl bg-red-50 border-l-4 border-red-400 p-5">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2">
              <i className="ri-spam-2-line text-red-500"></i> The ESA registry problem will get you rejected
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">
              ESA registries, online certificates, ID cards, and vests remain the most common source of
              fraudulent documentation. A registry document is not an ESA letter — it was never legally
              valid, it still isn&apos;t, and in several states submitting one as an accommodation
              request may constitute fraud. Don&apos;t use them. See{" "}
              <Link to="/are-online-esa-letters-legit" className={inlineLink}>are online ESA letters legit?</Link>{" "}
              for how to tell the difference.
            </p>
          </div>

          {/* ── Mid-article CTA ── */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2">
              <i className="ri-stethoscope-line text-orange-500"></i> Want every element done right?
            </p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              PawTenant connects you with state-licensed mental health professionals who issue letters
              containing all 10 elements — built to withstand landlord scrutiny. No outcome is
              guaranteed, and there&apos;s a refund if you don&apos;t qualify.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to={withAttribution("/assessment")}
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm"
              >
                <i className="ri-clipboard-line"></i> Start your ESA assessment
              </Link>
              <Link
                to="/what-makes-esa-letter-valid"
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors text-sm"
              >
                <i className="ri-shield-check-line"></i> What makes a letter valid
              </Link>
            </div>
          </div>

          <SectionHeading id="who-can-write">Who can write a valid ESA letter</SectionHeading>
          <Para>
            The clinician requirements are not negotiable. Under both federal law and state-specific
            statutes, a valid ESA letter should come from a licensed mental health professional (LMHP)
            who:
          </Para>
          <CheckList
            items={[
              "Holds an active, current license — not expired, not suspended, verifiable through your state's licensing board",
              "Is licensed in the state where you reside — not just nationally certified; state licensure is the operative standard",
              "Has conducted a genuine clinical evaluation — reviewed your history, assessed your symptoms, made a clinical judgment",
              "Has an established relationship where required — specifically in CA, MT, IA, AR, and LA before a letter can be issued (FL requires a bona fide relationship and valid assessment)",
            ]}
          />
          <Para>Qualifying professional types include:</Para>
          <CheckList
            items={[
              "Licensed Clinical Social Worker (LCSW)",
              "Licensed Marriage and Family Therapist (LMFT)",
              "Licensed Professional Counselor (LPC)",
              "Psychologist (PhD or PsyD)",
              "Psychiatrist (MD or DO)",
              "Psychiatric Mental Health Nurse Practitioner (PMHNP) — accepted in many states",
            ]}
          />
          <Para>
            Primary care physicians and general practitioners do not typically qualify unless they hold
            specific mental health licensure in your state, and a letter from a GP carries less weight
            in a dispute than one from a credentialed LMHP. For the full process, see{" "}
            <Link to="/how-to-get-esa-letter" className={inlineLink}>how an ESA evaluation works</Link>.
          </Para>

          <SectionHeading id="state-rules">State-specific ESA letter requirements in 2026</SectionHeading>
          <Para>
            Federal law sets the floor. Several states built requirements that go higher — and if your
            letter doesn&apos;t meet your state&apos;s standard, it may be invalid locally even if it
            meets every federal element.
          </Para>
          <CheckList
            items={[
              <><strong className="text-gray-800"><Link to="/esa-letter/california" className={inlineLink}>California (Health &amp; Safety Code §122318 / AB 468)</Link>:</strong> a 30-day established clinician-patient relationship is required before a letter can be issued; the clinician must be licensed in CA.</>,
              <><strong className="text-gray-800"><Link to="/florida-esa-letter-housing-rules" className={inlineLink}>Florida (Fla. Stat. §760.27)</Link>:</strong> requires a bona fide relationship and a valid assessment, and bars reliance on online-only providers that skip a real evaluation; the clinician must be FL-licensed. (Florida does not impose a fixed 30-day wait.)</>,
              <><strong className="text-gray-800">Montana, Iowa &amp; Arkansas:</strong> require an established therapeutic relationship (commonly 30 days) before an ESA letter can be issued.</>,
              <><strong className="text-gray-800">Louisiana:</strong> also requires an established relationship; the <em>Henderson</em> ruling above arose here.</>,
              <><strong className="text-gray-800"><Link to="/esa-letter/new-york" className={inlineLink}>New York</Link>:</strong> NYS and NYC human-rights law provide tenant protections beyond the federal minimum; valid letters are strongly enforceable at the city level.</>,
              <><strong className="text-gray-800">Minnesota:</strong> the State Human Rights Act protects ESAs independently of federal HUD enforcement.</>,
            ]}
          />
          <Para>
            Not sure about your state? PawTenant matches you with clinicians licensed in your specific
            state — browse the{" "}
            <Link to="/esa-letter/texas" className={inlineLink}>state ESA guides</Link> (California,
            Texas, Florida, New York, and more).
          </Para>

          <SectionHeading id="telehealth">Is a telehealth ESA letter legally valid?</SectionHeading>
          <Para>
            Yes — with an important qualifier. A telehealth ESA letter is valid when it results from a
            genuine clinical evaluation by a licensed clinician. The evaluation must involve real
            clinical interaction — not a questionnaire that auto-generates a letter, and not a
            five-minute screening call with a sales rep. Florida&apos;s Statute §760.27 is the clearest
            example of a state codifying this: it prohibits reliance on letters from online providers
            who did not conduct proper assessments. California&apos;s AB 468 similarly requires a
            genuine prior relationship.
          </Para>
          <Para>
            The practical test: did a licensed clinician actually speak with you, review your history,
            ask about your symptoms, and make a professional judgment? If yes, the resulting letter has
            the same standing as one from an in-person session. At PawTenant, every evaluation is
            conducted by a state-licensed mental health professional — no questionnaire-only approvals,
            no auto-generated letters. See{" "}
            <Link to="/blog/how-to-get-an-esa-letter-online" className={inlineLink}>how the process works</Link>.
          </Para>

          <SectionHeading id="submit">After you receive your letter: how to submit it correctly</SectionHeading>
          <Para>A complete, valid letter is only effective if it reaches your landlord the right way:</Para>
          <CheckList
            items={[
              "Submit in writing — email your accommodation request with the letter attached, creating a timestamped paper trail. If your landlord is an individual, follow up with a physical copy.",
              "State the legal basis explicitly — reference the Fair Housing Act and request a reasonable accommodation to keep your emotional support animal.",
              "Allow up to ~10 business days — the response window under the withdrawn HUD guidance, which courts still treat as a reasonable benchmark. If your landlord exceeds it with no response, document that.",
              "Know what landlords CAN ask — they can verify the clinician's license, confirm the letter is authentic, and ask whether your disability-related need is genuine. They cannot demand your medical records, specific diagnosis, or treatment history.",
              "Know what landlords CANNOT do — deny based on breed or size alone, or ignore your request entirely. (Pet-fee rules are now nuanced after Henderson — see the FAQ.)",
              "Document everything — save every communication. This is your evidence package if you pursue a state claim or private FHA lawsuit.",
            ]}
          />
          <Para>
            Our{" "}
            <Link to="/landlord-esa-documentation-checklist" className={inlineLink}>landlord ESA documentation checklist</Link>{" "}
            covers what a housing provider can reasonably request, and{" "}
            <Link to="/how-to-respond-to-esa-letter-denial" className={inlineLink}>how to respond to an ESA letter denial</Link>{" "}
            walks through next steps if your request is refused.
          </Para>

          <SectionHeading id="renewal">ESA letter validity &amp; renewal in 2026</SectionHeading>
          <Para>
            The Fair Housing Act does not set a statutory expiration date for ESA letters — but that
            matters less than it sounds. Since the September 2025 guidance withdrawal, some providers
            have become more aggressive about requesting updated documentation, particularly at lease
            renewals. Treating your letter as annually renewable is the practical standard that protects
            you. The renewal process through a licensed telehealth provider typically takes 24 to
            48 hours — don&apos;t let expiry become the issue in an otherwise straightforward
            accommodation. See{" "}
            <Link to="/renew-esa-letter" className={inlineLink}>how to renew your ESA letter</Link>.
          </Para>

          {/* ── Sources ── */}
          <div className="mt-10 rounded-xl bg-[#fafafa] border border-gray-100 p-5">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2.5">Sources &amp; further reading</p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>Fair Housing Act, 42 U.S.C. §3604(f) — disability provisions (unchanged by the 2025–2026 HUD actions)</span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>HUD FHEO — September 17, 2025 withdrawal of Notices FHEO-2020-01 and FHEO-2013-01, and the May 22, 2026 enforcement memorandum on assistance animals</span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span><em>Henderson v. Five Properties LLC</em> (E.D. La., 2025) — generally-applicable animal fee &amp; reasonable-accommodation necessity</span>
              </li>
              <li className="flex items-start gap-2">
                <i className="ri-external-link-line text-gray-400 mt-0.5"></i>
                <span>California AB 468 (Health &amp; Safety Code §122318); Florida Statute §760.27 — state ESA documentation standards</span>
              </li>
            </ul>
          </div>
        </div>
      </article>

      {/* ===== FAQ ===== */}
      <section className="py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-8 text-center">
            Frequently asked questions — ESA letter requirements 2026
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
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">
            Don&apos;t risk a rejection. Get every element right.
          </h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            With HUD guidance withdrawn and enforcement tightening, the quality of your documentation
            matters more than ever. PawTenant connects you with state-licensed mental health
            professionals who issue letters containing all 10 required elements.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to={withAttribution("/assessment")}
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm"
            >
              <i className="ri-stethoscope-line"></i> Start assessment
            </Link>
            <Link
              to="/blog/what-is-an-esa-letter"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm"
            >
              <i className="ri-file-text-line"></i> What is an ESA letter?
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
              { to: "/blog/how-to-get-an-esa-letter-online", icon: "ri-computer-line", label: "How to get an ESA letter online" },
              { to: "/what-makes-esa-letter-valid", icon: "ri-shield-check-line", label: "What makes an ESA letter valid" },
              { to: "/landlord-esa-documentation-checklist", icon: "ri-list-check-2", label: "Landlord documentation checklist" },
              { to: "/how-to-respond-to-esa-letter-denial", icon: "ri-chat-check-line", label: "Responding to an ESA denial" },
              { to: "/renew-esa-letter", icon: "ri-refresh-line", label: "How to renew your ESA letter" },
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
              <strong className="text-gray-600">Informational only — not legal advice.</strong>{" "}
              This guide from the PawTenant Editorial Team references 42 U.S.C. §3604(f), HUD&apos;s
              September 2025 guidance withdrawal, HUD&apos;s May 2026 enforcement announcement, and{" "}
              <em>Henderson v. Five Properties LLC</em>, and is not a substitute for advice from a
              licensed attorney. Laws and enforcement policies change and vary by state. PawTenant
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
