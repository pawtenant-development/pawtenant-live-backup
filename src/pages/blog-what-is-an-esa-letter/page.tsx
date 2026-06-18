// Blog article — /blog/what-is-an-esa-letter
//
// "What Is an ESA Letter? 2026 Legal Requirements & Guide" — converted from the
// owner's DOCX draft with legal-safety edits:
//   • Placeholder byline "[Jane Doe, LCSW]" + "Clinical Review Board" badge
//     removed — uses the approved "PawTenant Editorial" convention (no invented
//     clinician identity, no fake reviewer). Schema author = Organization.
//   • Draft's editor-only notes ("Meta Description:", "Primary Keyword:",
//     "Add FAQ Schema markup…", "Internal Linking Map — remove before
//     publishing") deleted; raw URL notes converted to real internal links.
//   • Accommodation language kept as "must consider / decided individually"
//     (no guaranteed approval, no FHA-approval claim).
// Facts verified against coverage of HUD's Sept 17 2025 withdrawal of
// FHEO-2020-01/2013-01 and the May 22 2026 FHEO enforcement memo (training-based
// ADA-style standard; FHA statute unchanged; state laws + private right of
// action preserved), plus CA AB 468 and FL Stat. §760.27.
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + BlogPosting/Breadcrumb/
// FAQ JSON-LD. Styling follows /blog/2026-hud-esa-guidelines.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/blog/what-is-an-esa-letter";
const HERO_IMG = "https://pawtenant.com/assets/lifestyle/woman-with-dog-new-apartment.jpg";

const topicChips = ["ESA Letter Explained", "2026 Legal Update", "Fair Housing Act", "State Laws"];

// ── Four layers of legal protection ──────────────────────────────────────────
const layerRows = [
  {
    layer: "Federal HUD enforcement",
    status: "Changed — training now required for HUD to pursue enforcement",
    protects: "No (as of May 22, 2026)",
  },
  {
    layer: "Fair Housing Act (statute)",
    status: "Unchanged — the law itself has not been amended",
    protects: "Yes — private lawsuits remain viable",
  },
  {
    layer: "State fair housing laws",
    status: "Unchanged & often stronger (CA, FL, MN, NY, and others)",
    protects: "Yes — explicitly in most major states",
  },
  {
    layer: "Private right of action",
    status: "Fully preserved — you can sue under the FHA without HUD",
    protects: "Yes — an attorney can still file suit",
  },
];

// ── Required elements of a valid ESA letter ──────────────────────────────────
const elementRows = [
  { element: "Clinician's full name & license type", why: "Proves the author is a credentialed LMHP — essential for state enforcement claims" },
  { element: "License number & state of licensure", why: "Lets landlords, state agencies, and courts verify the professional's active license" },
  { element: "Professional letterhead", why: "Establishes the document as an official clinical communication, not a printout" },
  { element: "Patient's full name", why: "Ties the letter to you specifically — it cannot be transferred to another person" },
  { element: "Statement of the qualifying condition", why: "Confirms a condition that meets the FHA's disability standard (no diagnosis label required)" },
  { element: "ESA therapeutic-benefit statement", why: "Documents why the animal is clinically necessary — critical for any legal challenge" },
  { element: "Date of issue", why: "Establishes the ~12-month validity window; outdated letters weaken your position" },
  { element: "Clinician's signature", why: "Makes the document attributable to a licensed professional" },
];

// ── FAQs (rendered + FAQPage JSON-LD) ────────────────────────────────────────
const faqs = [
  {
    q: "Does the May 2026 HUD change mean I can't keep my ESA?",
    a: "Not necessarily. The HUD change affects federal agency enforcement only — it does not amend the Fair Housing Act statute. You can still pursue private litigation under the FHA, and state fair housing laws (California, Florida, New York, Minnesota, and others) continue to protect untrained ESAs. A valid ESA letter from a licensed clinician documents your case for those protections. No accommodation is ever automatic — each request is decided individually.",
  },
  {
    q: "What is an ESA letter used for in 2026?",
    a: "An ESA letter is primarily used to establish your record for state-level fair housing protections and private FHA accommodation requests. While federal HUD enforcement has narrowed, the letter remains your most important documentation — especially in states with their own strong ESA statutes. Without it, you have no formal record of your clinical need.",
  },
  {
    q: "Is an ESA letter the same as a prescription?",
    a: "No. An ESA letter is a clinical recommendation, not a medical prescription. It documents that a licensed mental health professional evaluated you, confirmed a qualifying condition, and determined that an emotional support animal provides therapeutic benefit. It is issued under clinical judgment, not pharmaceutical authority.",
  },
  {
    q: "Can I write my own ESA letter?",
    a: "No. An ESA letter must be signed by a licensed mental health professional (LCSW, LMFT, LPC, psychologist, or psychiatrist). A self-written letter carries no legal weight under any housing law and will be rejected by any informed landlord.",
  },
  {
    q: "Does an ESA letter need to name my specific diagnosis?",
    a: "No. A valid ESA letter confirms you have a qualifying mental health condition that meets the FHA's disability standard, but it does not need to name the specific diagnosis. Your landlord is not entitled to your detailed medical history. The letter must state that the condition substantially limits a major life activity and that the ESA provides a related therapeutic benefit.",
  },
  {
    q: "How is an ESA letter different from service animal documentation?",
    a: "After HUD's 2026 enforcement shift, the gap between ESAs and service animals widened at the federal level. Service animals — individually trained to perform disability-related tasks — remain protected under both the ADA (public access) and HUD's enforcement priorities. Untrained ESAs retain housing protections through state laws and private FHA claims, documented with an ESA letter. If you need broad public-access rights, a psychiatric service dog (PSD) letter may be the more appropriate route.",
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

export default function BlogWhatIsAnEsaLetterPage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="what is an ESA letter, ESA letter 2026, emotional support animal letter explained, ESA letter definition, FHA ESA letter, HUD ESA letter, ESA letter legal requirements, ESA letter vs registration"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="What Is an ESA Letter? 2026 Legal Requirements & Guide" />
      <meta
        property="og:description"
        content="What an ESA letter is in 2026, what a valid letter must contain, how recent HUD enforcement changes affect your rights, and how state laws still protect you."
      />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content={HERO_IMG} />
      <meta property="article:published_time" content="2026-06-18" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={HERO_IMG} />
      <meta name="twitter:title" content="What Is an ESA Letter? 2026 Legal Requirements & Guide" />
      <meta
        name="twitter:description"
        content="What an ESA letter is, what it must contain, and what legal protections it still gives you after HUD's 2026 enforcement change."
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
                headline: "What Is an ESA Letter? 2026 Legal Requirements & Guide",
                description:
                  "What an ESA letter is in 2026, what a valid letter must contain, who can write one, and what legal protections it still supports after HUD's 2026 enforcement change.",
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
                  { "@type": "ListItem", position: 3, name: "What Is an ESA Letter?", item: CANONICAL },
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
            <span className="text-gray-500">What Is an ESA Letter?</span>
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
            What Is an ESA Letter?{" "}
            <span className="text-orange-500">2026 Legal Requirements &amp; Guide</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-6">
            <span className="inline-flex items-center gap-1.5">
              <i className="ri-calendar-line text-orange-400"></i> Published June 2026
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="ri-time-line text-orange-400"></i> ~10 min read
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="ri-user-line text-orange-400"></i> PawTenant Editorial — reviewed for accuracy
            </span>
          </div>

          {/* 2026 legal-update callout */}
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700 mb-2 flex items-center gap-2">
              <i className="ri-alert-line"></i> 2026 legal update: HUD enforcement has changed
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              On May 22, 2026, HUD&apos;s Office of Fair Housing and Equal Opportunity (FHEO) rescinded
              its earlier guidance and announced it will pursue federal enforcement mainly for animals
              individually trained to perform disability-related tasks — aligning with the ADA&apos;s
              standard. Federal HUD enforcement no longer presumptively protects untrained ESAs.{" "}
              <strong className="text-gray-900">But the Fair Housing Act statute has not changed</strong>,
              private litigation rights are preserved, and state fair housing laws — often stronger —
              remain unaffected.
            </p>
          </div>

          {/* Hero image — eager (LCP) */}
          <figure className="mt-8">
            <img
              src="/assets/lifestyle/woman-with-dog-new-apartment.jpg"
              alt="Renter with her emotional support dog settling into a new apartment"
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
            If you&apos;ve been told you need an ESA letter to keep your animal in your apartment, you
            may be wondering what exactly you&apos;re being asked to produce. The term gets thrown
            around a lot — and so do a lot of fakes. Registries, certificates, digital ID cards, vests
            with patches: none of these are ESA letters, and none carry legal weight.
          </Para>
          <Para>
            In 2026, getting the right document matters more than ever. After a major federal
            enforcement shift in May 2026, the legal landscape for emotional support animals changed in
            ways most renters don&apos;t yet know about. This guide explains exactly what an ESA letter
            is, what it must contain, who can write one, and — critically — what protections it still
            gives you today.
          </Para>

          {/* Quick summary */}
          <div className="my-6 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-3 flex items-center gap-2">
              <i className="ri-flashlight-line"></i> Quick summary
            </p>
            <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
              <li><strong className="text-gray-900">What it is:</strong> a signed letter from a state-licensed mental health professional (LMHP)</li>
              <li><strong className="text-gray-900">What it proves:</strong> you have a qualifying condition <em>and</em> your animal provides therapeutic benefit</li>
              <li><strong className="text-gray-900">What it is not:</strong> a registration, certificate, vest, ID card, or quiz result</li>
              <li><strong className="text-gray-900">2026 shift:</strong> federal enforcement now centers on trained animals — but state laws &amp; private FHA rights still protect untrained ESAs</li>
              <li><strong className="text-gray-900">Who can write it:</strong> LCSW, LMFT, LPC, psychologist, or psychiatrist licensed in your state</li>
              <li><strong className="text-gray-900">Valid for:</strong> typically 12 months from the date of issue</li>
            </ul>
          </div>

          <SectionHeading id="definition">The shifting legal definition of an ESA letter</SectionHeading>
          <Para>
            An ESA letter — formally a reasonable-accommodation letter — is a written statement from a
            licensed mental health professional (LMHP) confirming three things:
          </Para>
          <CheckList
            items={[
              "You have a diagnosed mental health condition that meets the Fair Housing Act's definition of a disability",
              "Your emotional support animal provides therapeutic benefit directly related to that condition",
              "You require the animal as part of managing or treating your disability",
            ]}
          />
          <Para>
            Historically, federal HUD guidance gave these letters significant presumptive power — a
            valid letter was widely understood to create an automatic landlord obligation to
            accommodate, waive pet fees, and ignore breed restrictions. That presumption no longer
            holds at the federal enforcement level. Following HUD&apos;s May 2026 reversal, federal
            administrative enforcement is now reserved for animals individually trained to perform
            disability-related tasks — the same standard the ADA applies to service animals.
          </Para>
          <Para>
            However — and this is critical — the Fair Housing Act statute itself has not been amended
            by Congress. The law still protects people with disabilities from housing discrimination.
            What changed is how HUD&apos;s enforcement office prioritizes its cases. That distinction
            leaves three other layers of protection that a properly issued ESA letter still supports:
            private FHA litigation, state fair housing laws, and the policies of landlords who continue
            to honor valid letters. For the full breakdown, see our explainer on{" "}
            <Link to="/are-esa-letters-still-valid-after-hud-change" className={inlineLink}>whether ESA letters are still valid after the HUD change</Link>.
          </Para>

          {/* Related-guide callout */}
          <div className="my-6 rounded-xl bg-[#f1f8e9] border-l-4 border-green-600 p-5">
            <p className="text-sm text-gray-700 leading-relaxed">
              <i className="ri-book-open-line text-green-700 mr-1.5"></i>
              <strong className="text-gray-900">Related guide:</strong>{" "}
              <Link to="/blog/how-to-get-an-esa-letter-online" className={inlineLink}>How to get a valid ESA letter online in 2026</Link>{" "}
              — the step-by-step process, and how to submit it correctly to your landlord.
            </p>
          </div>

          <SectionHeading id="four-layers">Your four layers of legal protection in 2026</SectionHeading>
          <Para>
            Understanding where your protection actually comes from — and what the May 2026 change did
            and did not affect — is essential before you submit any accommodation request.
          </Para>

          {/* Desktop layers table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[26%]">Legal layer</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[48%]">Status after May 2026</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[26%]">Protects untrained ESAs?</th>
                </tr>
              </thead>
              <tbody>
                {layerRows.map((row, i) => (
                  <tr key={row.layer} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-5 py-3.5 text-xs font-semibold text-gray-700 align-top">{row.layer}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.status}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.protects}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile layers cards */}
          <div className="md:hidden space-y-3 my-5">
            {layerRows.map((row) => (
              <div key={row.layer} className="rounded-xl border border-gray-200 overflow-hidden">
                <p className="bg-[#fdf6ee] border-b border-orange-100 px-4 py-2.5 text-xs font-bold text-gray-800">{row.layer}</p>
                <div className="p-4 space-y-2">
                  <p className="text-xs text-gray-600 leading-relaxed"><span className="font-bold text-gray-500">After May 2026:</span> {row.status}</p>
                  <p className="text-xs text-gray-600 leading-relaxed"><span className="font-bold text-gray-500">Protects untrained ESAs?</span> {row.protects}</p>
                </div>
              </div>
            ))}
          </div>

          <Para>
            The practical takeaway: a well-documented ESA letter from a state-licensed clinician remains
            your strongest legal instrument. It creates a contemporaneous clinical record that supports
            all three surviving layers at once. A letter issued without a genuine evaluation does not —
            and in a litigation or state-enforcement context, that gap will matter.
          </Para>

          {/* State-laws callout */}
          <div className="my-6 rounded-2xl bg-white border border-orange-200 p-5 sm:p-6 shadow-[0_18px_45px_-30px_rgba(122,78,45,0.35)]">
            <p className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
              <i className="ri-map-pin-line text-orange-500"></i> State laws often give you stronger protection
            </p>
            <ul className="space-y-1.5 text-xs text-gray-600 leading-relaxed">
              <li><strong className="text-gray-800"><Link to="/esa-letter/california" className={inlineLink}>California (AB 468)</Link>:</strong> requires a licensed-clinician relationship and protects ESAs at the state level</li>
              <li><strong className="text-gray-800"><Link to="/florida-esa-letter-housing-rules" className={inlineLink}>Florida (Statute 760.27)</Link>:</strong> requires a bona fide evaluation by a Florida-licensed provider; protections remain for valid letters</li>
              <li><strong className="text-gray-800">Minnesota:</strong> the State Human Rights Act covers emotional support animals independently of federal enforcement</li>
              <li><strong className="text-gray-800"><Link to="/esa-letter/new-york" className={inlineLink}>New York</Link>:</strong> NYS and NYC human-rights law provide robust ESA tenant protections beyond the federal minimum</li>
            </ul>
          </div>

          <SectionHeading id="what-its-not">What an ESA letter is NOT</SectionHeading>
          <Para>
            The internet is still flooded with services selling worthless documents. In the current
            legal environment, being caught with a fraudulent letter is worse than having no letter at
            all.
          </Para>
          <CheckList
            items={[
              <><strong className="text-gray-800">An ESA registration</strong> — no government or legal body registers emotional support animals. Any site selling registrations is selling something with zero legal standing under any law.</>,
              <><strong className="text-gray-800">A certification or ID card</strong> — no such certification exists under US federal or state law. Landlords who know the rules are under no obligation to honor them.</>,
              <><strong className="text-gray-800">An instant online approval</strong> — a legitimate letter requires a real clinical evaluation. Any service that &ldquo;approves&rdquo; you in two minutes with no clinician consultation is selling a document a savvy landlord or state agency can reject.</>,
              <><strong className="text-gray-800">An automatic fee waiver or policy override</strong> — even a valid letter now requires case-by-case engagement. It opens the door; it does not automatically walk through it for you.</>,
            ]}
          />
          <Para>
            Using a fake ESA document doesn&apos;t just fail to protect you — it can undermine a later
            legitimate request, and in some states submitting fraudulent documentation carries civil
            liability. If you&apos;re vetting a service, our guide on{" "}
            <Link to="/are-online-esa-letters-legit" className={inlineLink}>spotting a fake ESA letter</Link>{" "}
            covers the red flags.
          </Para>

          <SectionHeading id="required">What must be in a valid ESA letter in 2026</SectionHeading>
          <Para>
            The requirements haven&apos;t changed — but the stakes attached to each element have
            increased. In a state-enforcement or private-litigation context, a letter missing any of
            these components is a letter that cannot be relied upon.
          </Para>

          {/* Desktop elements table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[38%]">Required element</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[62%]">Why it matters in 2026</th>
                </tr>
              </thead>
              <tbody>
                {elementRows.map((row, i) => (
                  <tr key={row.element} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-5 py-3.5 text-xs font-semibold text-gray-700 align-top">{row.element}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile elements cards */}
          <div className="md:hidden space-y-3 my-5">
            {elementRows.map((row) => (
              <div key={row.element} className="rounded-xl border border-gray-200 overflow-hidden">
                <p className="bg-[#fdf6ee] border-b border-orange-100 px-4 py-2.5 text-xs font-bold text-gray-800">{row.element}</p>
                <p className="px-4 py-3 text-xs text-gray-600 leading-relaxed">{row.why}</p>
              </div>
            ))}
          </div>

          <Para>
            One point worth emphasizing for 2026: the therapeutic-benefit statement matters more than
            ever. With landlords more likely to push back and state bodies more likely to scrutinize
            letters, your clinician&apos;s documentation of <em>why</em> the animal helps manage your
            condition is what makes a letter defensible. Our deep-dive on{" "}
            <Link to="/blog/esa-letter-requirements" className={inlineLink}>ESA letter requirements</Link>{" "}
            covers each element in detail.
          </Para>

          {/* ── Mid-article CTA ── */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2">
              <i className="ri-stethoscope-line text-orange-500"></i> Know what you need? Get it from a licensed provider.
            </p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              PawTenant connects you with licensed mental health professionals who evaluate your
              situation and issue verifiable ESA letters built to hold up under state law and private
              FHA claims. No outcome is guaranteed — there&apos;s a refund if you don&apos;t qualify.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to={withAttribution("/assessment")}
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm"
              >
                <i className="ri-clipboard-line"></i> Start your ESA assessment
              </Link>
              <Link
                to="/blog/how-to-get-an-esa-letter-online"
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors text-sm"
              >
                <i className="ri-route-line"></i> See the full process
              </Link>
            </div>
          </div>

          <SectionHeading id="who-can-write">Who can write an ESA letter?</SectionHeading>
          <Para>
            Only a licensed mental health professional (LMHP) can issue a valid ESA letter recognized
            under any housing law. The following credentials qualify:
          </Para>
          <CheckList
            items={[
              "Licensed Clinical Social Worker (LCSW)",
              "Licensed Marriage and Family Therapist (LMFT)",
              "Licensed Professional Counselor (LPC)",
              "Psychologist (PhD or PsyD)",
              "Psychiatrist (MD or DO with psychiatric practice)",
            ]}
          />
          <Para>
            The clinician must hold an active license in the state where you live. California&apos;s
            AB 468 requires a 30-day established relationship before a letter can be issued, and
            Florida&apos;s Statute 760.27 requires a bona fide prior relationship. These are not
            optional — letters issued without meeting state-specific requirements may be invalid in
            those states. General practitioners can write ESA letters in some states, but in the
            post-2026 environment, letters from licensed mental health professionals carry significantly
            more weight in any dispute.
          </Para>

          <SectionHeading id="conditions">What conditions qualify for an ESA letter?</SectionHeading>
          <Para>
            The Fair Housing Act does not publish a fixed diagnostic list. The standard is functional:
            your mental health condition must &ldquo;substantially limit&rdquo; one or more major life
            activities. This standard did not change after the May 2026 HUD update. Commonly documented
            conditions include anxiety disorders, major depressive disorder, PTSD, ADHD (when it
            significantly impacts daily functioning), bipolar disorder, OCD, and phobias including
            agoraphobia.
          </Para>
          <Para>
            You do not need a prior formal diagnosis before applying — a licensed clinician can
            establish one during the evaluation if the evidence supports it. What matters is the
            professional&apos;s clinical judgment, and in 2026 the documentation of that judgment
            carries more weight than it did before.
          </Para>

          <figure className="my-6">
            <img
              src="/assets/lifestyle/person-paperwork-with-dog.jpg"
              alt="Renter reviewing ESA accommodation paperwork at home with a dog beside her"
              width={1600}
              height={1067}
              loading="lazy"
              decoding="async"
              className="w-full h-48 sm:h-72 object-cover object-center rounded-2xl border border-gray-100"
            />
            <figcaption className="text-xs text-gray-400 mt-2 text-center">
              A valid letter creates a clinical record that supports state-law protections and private
              FHA claims — the layers that survived the 2026 change.
            </figcaption>
          </figure>

          <SectionHeading id="what-it-protects">What an ESA letter does — and doesn&apos;t — protect in 2026</SectionHeading>
          <SubHeading>What a valid ESA letter still supports</SubHeading>
          <CheckList
            items={[
              "State fair housing accommodation requests — in most states a valid letter remains the primary documentation",
              "Private FHA litigation — the Act's private right of action is intact; a valid letter is your evidentiary foundation",
              "Landlord-policy accommodation — many providers continue to honor valid letters as a matter of internal policy",
              "No pet fees in state-protected jurisdictions — where state law protects ESAs, the prohibition on pet deposits and breed fees remains enforceable",
            ]}
          />
          <SubHeading>What has changed at the federal level</SubHeading>
          <CheckList
            items={[
              "Federal HUD enforcement — FHEO will no longer pursue enforcement on behalf of untrained ESA owners at the administrative level",
              "Automatic presumption of accommodation — the idea that a letter alone triggers an ironclad federal obligation is no longer accurate",
            ]}
          />
          <Para>
            The practical reality: in states with strong independent statutes — California, Florida,
            New York, Minnesota, and others — the day-to-day experience for most renters with valid
            letters hasn&apos;t dramatically changed. Where your location, landlord, and state law
            intersect determines your actual protection. And note what an ESA letter does{" "}
            <strong className="text-gray-800">not</strong> do: it does not grant public-access rights
            (stores, restaurants, transit) — those apply only to trained service animals under the ADA
            — and it does not cover air travel after the 2021 DOT rule change. Our overview of{" "}
            <Link to="/service-animal-vs-esa" className={inlineLink}>service animal vs. ESA</Link>{" "}
            explains the difference.
          </Para>

          <SectionHeading id="validity">How long is an ESA letter valid?</SectionHeading>
          <Para>
            ESA letters are typically treated as valid for 12 months from the date of issue. In the
            current environment, an up-to-date letter matters more than ever — an expired letter
            can&apos;t serve as valid documentation in a state claim or private litigation, and
            landlords increasingly check issue dates. Renew proactively, before expiry; renewal through
            a licensed telehealth provider typically takes 24 to 48 hours. See{" "}
            <Link to="/renew-esa-letter" className={inlineLink}>how to renew your ESA letter</Link>.
          </Para>

          <SectionHeading id="esa-vs-service">ESA letter vs. service animal documentation — the 2026 gap</SectionHeading>
          <Para>
            The May 2026 HUD change widened the gap between ESAs and service animals at the federal
            level. <strong className="text-gray-800">Service animals</strong> are trained to perform
            specific tasks for a person with a disability and are protected under the ADA (public
            access) and HUD&apos;s current housing-enforcement priorities; no letter or certification is
            required under the ADA. <strong className="text-gray-800">Emotional support animals</strong>{" "}
            provide therapeutic comfort by their presence and require no task training. Under HUD&apos;s
            revised standard, federal protection no longer extends to untrained ESAs at the
            administrative level — but state laws and private FHA claims preserve meaningful housing
            protections for properly documented ESAs.
          </Para>
          <Para>
            If you need both housing accommodation and broader certainty — particularly if you travel
            frequently or live in a state with weaker independent protections — a{" "}
            <Link to="/how-to-get-psd-letter" className={inlineLink}>psychiatric service dog (PSD) letter</Link>{" "}
            from a licensed clinician may offer stronger coverage.
          </Para>
        </div>
      </article>

      {/* ===== FAQ ===== */}
      <section className="py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-8 text-center">
            Frequently asked questions — 2026 edition
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
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">Know what you need. Now get it.</h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            With HUD enforcement tightening at the federal level, a documented ESA letter from a
            state-licensed clinician is your strongest tool. PawTenant connects you with licensed
            professionals who issue letters built to hold up under state law and private FHA claims.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to={withAttribution("/assessment")}
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm"
            >
              <i className="ri-stethoscope-line"></i> Start assessment
            </Link>
            <Link
              to="/blog/esa-letter-requirements"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm"
            >
              <i className="ri-list-check-2"></i> What a valid letter must include
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
              { to: "/blog/how-to-get-an-esa-letter-online", icon: "ri-computer-line", label: "How to get an ESA letter online" },
              { to: "/blog/esa-letter-requirements", icon: "ri-list-check-2", label: "ESA letter requirements" },
              { to: "/are-esa-letters-still-valid-after-hud-change", icon: "ri-government-line", label: "ESA letters & the 2026 HUD change" },
              { to: "/housing-rights-esa", icon: "ri-home-heart-line", label: "ESA housing rights (FHA)" },
              { to: "/service-animal-vs-esa", icon: "ri-guide-line", label: "Service animal vs ESA" },
              { to: "/how-to-get-psd-letter", icon: "ri-shield-star-line", label: "How to get a PSD letter" },
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
              This guide from the PawTenant Editorial Team reflects HUD&apos;s enforcement posture as of
              May 2026 and is not a substitute for advice from a licensed attorney. Laws change and
              vary by state, and state or local law may provide protections beyond the federal floor
              described here. PawTenant connects you with licensed mental health professionals who
              decide whether a letter is appropriate; it does not sell ESA registrations, claim any
              government affiliation, or guarantee landlord approval, fee waivers, or any legal outcome.
              For your specific situation, consult a fair-housing attorney or your state fair-housing
              agency.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
