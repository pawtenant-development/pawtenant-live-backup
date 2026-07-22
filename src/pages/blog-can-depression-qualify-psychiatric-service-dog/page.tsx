// Blog article — /blog/can-depression-qualify-psychiatric-service-dog
//
// "Can Depression Qualify You for a Psychiatric Service Dog (PSD)?"
//
// Converted from the owner's Markdown draft into the established PawTenant
// blog-page structure, with YMYL corrections (SEO-PSD-ESA-CONDITION-ARTICLE-BATCH-001):
//   • source frontmatter placeholders removed (yourdomain.com, "Editorial Team",
//     flat non-/blog canonical, July-21 backdate). Real PawTenant metadata; actual
//     publication date 2026-07-22.
//   • corrected the draft's implication that a "PSD Letter" itself establishes
//     legal service-animal status — task training does; a letter documents clinical
//     need and helps in housing/employment contexts.
//   • air travel corrected to DOT rules (airline MAY require the DOT Service Animal
//     Air Transportation Form; the dog's training, not a letter, creates the right;
//     no "every airline uses the same form" claim).
//   • evaluation wording qualified to professional scope + state licensure +
//     applicable telehealth rules; no "every clinician / async is universally lawful".
//   • the broken source PNG is replaced by <PsdTaskInfographic> (accessible HTML/CSS).
//
// Facts verified against ADA (ada.gov) + DOT (transportation.gov) + the May 22,
// 2026 HUD/FHEO enforcement guidance.
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + BlogPosting/Breadcrumb/FAQ JSON-LD.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import PsdTaskInfographic from "../../components/feature/PsdTaskInfographic";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/blog/can-depression-qualify-psychiatric-service-dog";
const HERO_IMG = "https://pawtenant.com/assets/psd/man-working-holding-dog.jpg";

const topicChips = ["Psychiatric Service Dog", "Depression", "ADA", "Trained Tasks"];

// ── PSD vs ESA comparison ────────────────────────────────────────────────────
const comparisonRows = [
  {
    feature: "Primary function",
    psd: "Performs specific trained tasks tied to a disability",
    esa: "Provides comfort through its presence alone",
  },
  {
    feature: "Training",
    psd: "Individually trained — this is what creates the status",
    esa: "No task training required",
  },
  {
    feature: "Public access (ADA)",
    psd: "Yes — stores, restaurants, other public venues",
    esa: "No — subject to standard pet policies",
  },
  {
    feature: "Housing (FHA)",
    psd: "Assistance animal — reasonable accommodation, generally no pet fees",
    esa: "Assistance animal — but federal enforcement narrowed in 2026",
  },
  {
    feature: "Air travel",
    psd: "Recognized as a service dog under DOT rules (airline may require the DOT form)",
    esa: "May be treated as an ordinary pet",
  },
];

const faqs = [
  {
    q: "Can depression qualify you for a psychiatric service dog?",
    a: "It can, but not automatically. The depression must rise to the level of a disabling impairment that substantially limits a major life activity — such as sleeping, working, concentrating, or self-care — and a dog must be individually trained to perform specific tasks that help with those symptoms. A diagnosis alone is not enough; the trained tasks are what create service-animal status under the ADA, and a licensed professional decides whether an animal-related recommendation is appropriate.",
  },
  {
    q: "How does depression qualify under the ADA?",
    a: "The ADA uses a functional test: depression qualifies when severe symptoms significantly impair your ability to work, sleep, concentrate, or handle daily self-care. Clinical presentations such as major depressive disorder, bipolar depression, or treatment-resistant depression can meet that threshold when a licensed provider confirms the level of impairment. What matters is the degree of functional limitation, not the diagnosis label by itself.",
  },
  {
    q: "Does a PSD letter make my dog a service dog?",
    a: "No. What makes a dog a psychiatric service dog is individual task training tied to your disability — not a letter, registry, certificate, ID card, or vest. Clinical documentation from a licensed professional can help support a housing or employment accommodation request, but the letter itself does not create ADA service-dog status or public-access rights.",
  },
  {
    q: "Do I need a PSD travel letter to fly?",
    a: "There is no single federal 'PSD travel letter' that creates air-travel rights. Under U.S. Department of Transportation rules, airlines must recognize qualifying trained service dogs, including psychiatric service dogs, and may require the DOT Service Animal Air Transportation Form attesting to the dog's training, health, and behavior. Carriers handle submission within DOT's rules, so confirm the details directly with your airline before you fly.",
  },
  {
    q: "Can I get PSD documentation online?",
    a: "It is possible where you complete a genuine, individualized evaluation with a mental health professional licensed in your state and where telehealth is appropriate for that clinician and situation. Websites offering instant downloads, registrations, or certificates with no real evaluation do not create any federal service-animal rights and carry little weight with landlords.",
  },
  {
    q: "What two questions can a business ask about my PSD?",
    a: "Under the ADA, when it is not obvious what service the dog provides, staff may ask only two questions: is the dog a service animal required because of a disability, and what work or task has it been trained to perform. A business cannot demand to see a PSD letter, require medical proof, or make the dog demonstrate its task.",
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

export default function BlogCanDepressionQualifyPsdPage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="can depression qualify you for a psychiatric service dog, psychiatric service dog for depression, PSD for depression, PSD trained tasks depression, PSD vs ESA depression, ADA service dog depression, psychiatric service dog housing, PSD air travel"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="Can Depression Qualify You for a Psychiatric Service Dog?" />
      <meta
        property="og:description"
        content="Depression can qualify you for a psychiatric service dog — but only if it rises to a disability and a dog is individually trained to perform tasks. Trained-task examples, the ADA standard, documentation, housing, and travel."
      />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content={HERO_IMG} />
      <meta property="article:published_time" content="2026-07-22" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={HERO_IMG} />
      <meta name="twitter:title" content="Can Depression Qualify You for a Psychiatric Service Dog?" />
      <meta
        name="twitter:description"
        content="What actually qualifies depression for a PSD — the disability threshold, trained tasks, documentation, and your ADA, housing, and travel rights."
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
                headline: "Can Depression Qualify You for a Psychiatric Service Dog (PSD)?",
                description:
                  "Depression can qualify you for a psychiatric service dog when it rises to a disability and a dog is individually trained to perform disability-related tasks. Trained-task examples, the ADA standard, documentation, and the housing and air-travel rules that apply.",
                mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
                url: CANONICAL,
                image: [HERO_IMG],
                datePublished: "2026-07-22",
                dateModified: "2026-07-22",
                author: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                publisher: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                articleSection: "Psychiatric Service Dogs",
                keywords: topicChips.join(", "),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: "https://pawtenant.com/" },
                  { "@type": "ListItem", position: 2, name: "Blog", item: "https://pawtenant.com/blog" },
                  { "@type": "ListItem", position: 3, name: "Depression & Psychiatric Service Dogs", item: CANONICAL },
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
            <span className="text-gray-500">Depression & Psychiatric Service Dogs</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span key={chip} className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm">
                {chip}
              </span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[42px] text-gray-900 leading-tight mb-4 pt-hero-display">
            Can Depression Qualify You for a{" "}
            <span className="text-orange-500">Psychiatric Service Dog?</span>
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
              Yes — depression can qualify you for a psychiatric service dog (PSD), but only when it
              is a disabling impairment that substantially limits a major life activity <em>and</em> a
              dog is <strong>individually trained</strong> to perform specific tasks related to your
              disability. Task training — not a purchased letter, registry, vest, or certificate — is
              what creates service-animal status under the ADA. If comfort by presence is what fits
              your situation, an{" "}
              <Link to="/blog/can-depression-qualify-you-for-an-esa" className={inlineLink}>
                emotional support animal
              </Link>{" "}
              may be the better path.
            </p>
          </div>

          <figure className="mt-8">
            <img
              src="/assets/psd/man-working-holding-dog.jpg"
              alt="A person at home with their trained psychiatric service dog"
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

          <SectionHeading id="psd-vs-esa">Psychiatric service dog vs. emotional support animal</SectionHeading>
          <Para>
            A common source of confusion is the difference between a psychiatric service dog and an
            emotional support animal (ESA). Both assist people with mental health conditions, but
            federal law treats them very differently. A PSD is a service animal under the ADA — a dog
            individually trained to perform specific tasks that mitigate a disability. An ESA provides
            therapeutic comfort simply through its presence and needs no task training. Training is
            the legal dividing line.
          </Para>

          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide w-[26%]">Feature</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[37%]">Psychiatric service dog</th>
                  <th className="px-5 py-3.5 text-xs font-bold text-gray-900 w-[37%]">Emotional support animal</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr key={row.feature} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-5 py-3.5 text-xs font-semibold text-gray-700 align-top">{row.feature}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.psd}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.esa}</td>
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
                  <div><p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Psychiatric service dog</p><p className="text-xs text-gray-600 leading-relaxed">{row.psd}</p></div>
                  <div><p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Emotional support animal</p><p className="text-xs text-gray-600 leading-relaxed">{row.esa}</p></div>
                </div>
              </div>
            ))}
          </div>

          <SectionHeading id="how-depression-qualifies">How depression qualifies under the ADA</SectionHeading>
          <Para>
            Not every instance of depression qualifies a person for a service animal. Under the ADA,
            depression must rise to the level of a disability — meaning severe symptoms significantly
            impair your ability to work, sleep, concentrate, or handle daily self-care. Clinical
            presentations such as major depressive disorder, bipolar depression, or treatment-resistant
            depression can meet that threshold when a licensed provider confirms the level of
            impairment. As with{" "}
            <Link to="/blog/can-anxiety-qualify-you-for-a-psd" className={inlineLink}>
              anxiety and psychiatric service dogs
            </Link>
            , the diagnosis label alone is not the deciding factor — the degree of functional
            limitation is.
          </Para>

          {/* Trained-task examples — accessible HTML/CSS replacement for the broken source PNG */}
          <PsdTaskInfographic id="trained-tasks" />

          <SectionHeading id="what-a-psd-letter-is">What a PSD letter is — and what it does not do</SectionHeading>
          <Para>
            A PSD letter is a signed document from a licensed mental health professional confirming
            that you are being treated for a qualifying condition and that an animal-related
            recommendation is part of your care. It is useful documentation — but it is important to
            be precise about what it does. A PSD letter does <strong>not</strong> by itself establish
            legal service-animal status, and it does not grant public-access rights. What makes a dog
            a psychiatric service dog is the individual task training tied to your disability. The
            letter&apos;s value is in context-specific requests — most often a{" "}
            <Link to="/blog/psychiatric-service-dog-housing-rights" className={inlineLink}>
              housing reasonable accommodation
            </Link>{" "}
            — where a landlord may ask for reliable documentation of a non-obvious disability-related
            need.
          </Para>
          <SubHeading>What a useful letter contains</SubHeading>
          <Para>
            When documentation is used to support a housing or employment request, it typically comes
            on the clinician&apos;s letterhead and includes their license type, license number, and
            jurisdiction; confirmation that you have a condition that qualifies as a disability; and a
            statement that an animal-related recommendation is part of your care. A clinician is not
            required to disclose your private diagnostic details to a landlord.
          </Para>

          <SectionHeading id="evaluation">How a lawful evaluation works</SectionHeading>
          <Para>
            If you believe a psychiatric service dog would help, documentation follows a genuine
            clinical process — not a one-click purchase. The first step is an individualized evaluation
            with a mental health professional licensed in your state. Whether that professional can
            provide the documentation depends on their professional scope and licensure, and whether a
            telehealth evaluation is appropriate depends on the clinician&apos;s judgment and the
            telehealth rules that apply where you live. What carries weight is a real, individualized
            assessment and an honest recommendation — not an instant letter generated without an
            evaluation.
          </Para>
          <Para>
            Avoid instant &quot;registration&quot; or &quot;certification&quot; websites.
            Registrations, certificates, ID cards, or vests do not by themselves create federal
            service-animal rights, and landlords give them little weight next to a genuine,
            verifiable clinical evaluation.
          </Para>

          {/* Mid CTA */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2">
              <i className="ri-stethoscope-line text-orange-500"></i> Not sure whether depression meets the bar?
            </p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              A licensed mental health professional can evaluate whether your symptoms reach the
              disability threshold and whether an animal-related recommendation is clinically
              appropriate. No outcome is guaranteed.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to={withAttribution("/psd-assessment")} className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm">
                <i className="ri-clipboard-line"></i> Start a PSD assessment
              </Link>
              <Link to="/how-to-get-psd-letter" className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors text-sm">
                <i className="ri-book-open-line"></i> How PSD documentation works
              </Link>
            </div>
          </div>

          <SectionHeading id="training">Training: self-training vs. professional training</SectionHeading>
          <Para>
            Under the ADA you may train your own dog — there is no requirement to hire a professional
            trainer or complete a board-and-train program. Whichever route you choose, the dog needs
            to reliably perform its disability-related tasks and to pass basic public-access behavioral
            standards: calm heeling in crowds, composure under distractions, and no aggression. Task
            training is the harder half of the work, and it is what the ADA actually cares about.
          </Para>

          <SectionHeading id="housing">Housing and the 2026 HUD change</SectionHeading>
          <Para>
            For housing, a psychiatric service dog is treated as an assistance animal under the Fair
            Housing Act. A landlord is generally expected to consider a reasonable-accommodation
            request even in no-pet housing and not to charge pet deposits or fees for a legitimate
            assistance animal. The 2026 landscape reinforces the value of task training: on May 22,
            2026, HUD&apos;s Office of Fair Housing and Equal Opportunity issued enforcement guidance
            stating it will generally find reasonable cause and recommend charges only where an animal
            is individually trained to perform disability-related work or tasks. A task-trained PSD sits
            squarely within that standard. The Fair Housing Act statute was not repealed, private
            lawsuits remain available, and state or local protections may still apply. Our{" "}
            <Link to="/blog/2026-hud-esa-guidelines" className={inlineLink}>
              2026 HUD ESA guidelines explainer
            </Link>{" "}
            covers what changed — and &quot;must consider&quot; is still not &quot;must accept.&quot;
          </Para>

          <SectionHeading id="air-travel">Air travel</SectionHeading>
          <Para>
            Air travel is governed by U.S. Department of Transportation rules. Airlines must recognize
            qualifying trained service dogs, including psychiatric service dogs, and treat them the
            same as other service animals — in the cabin, at no extra charge. What creates that right
            is the dog&apos;s training, not a &quot;PSD travel letter.&quot; Airlines may require the
            DOT Service Animal Air Transportation Form, and may require it in advance — up to 48 hours
            before departure when you booked earlier than that, or at the gate if you booked within 48
            hours. Each carrier sets its own process within DOT&apos;s rules, so confirm with your
            airline first. Emotional support animals, by contrast, may be treated as ordinary pets;
            our guide to{" "}
            <Link to="/blog/emotional-support-animal-travel-anxiety" className={inlineLink}>
              emotional support animals and travel anxiety
            </Link>{" "}
            covers those limits.
          </Para>

          {/* Sources */}
          <div className="mt-10 rounded-xl bg-[#fafafa] border border-gray-100 p-5">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2.5">Sources & further reading</p>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li className="flex items-start gap-2"><i className="ri-external-link-line text-gray-400 mt-0.5"></i><span>ADA service animal guidance — <a href="https://www.ada.gov/topics/service-animals/" target="_blank" rel="noopener noreferrer" className={inlineLink}>ada.gov/topics/service-animals</a></span></li>
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
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">See whether a PSD is right for you</h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            A licensed mental health professional reviews your assessment and decides whether an
            animal-related recommendation is clinically appropriate. You&apos;re only charged if you
            qualify — approval is never guaranteed.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={withAttribution("/psd-assessment")} className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm">
              <i className="ri-file-text-line"></i> Start PSD assessment
            </Link>
            <Link to="/how-to-get-psd-letter" className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm">
              <i className="ri-book-open-line"></i> PSD documentation guide
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
              { to: "/blog/can-anxiety-qualify-you-for-a-psd", icon: "ri-shield-star-line", label: "Can anxiety qualify you for a PSD?" },
              { to: "/blog/can-depression-qualify-you-for-an-esa", icon: "ri-home-heart-line", label: "Can depression qualify you for an ESA?" },
              { to: "/blog/2026-hud-esa-guidelines", icon: "ri-government-line", label: "2026 HUD ESA guidelines" },
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
              PawTenant connects you with licensed mental health professionals; whether an
              animal-related recommendation is appropriate is decided by a licensed provider after a
              real evaluation. PawTenant does not train, certify, or register service animals, claims
              no government affiliation, and does not guarantee public access, housing approval, or any
              legal outcome. Disability and reasonable-accommodation determinations vary by
              jurisdiction and individual circumstance — for a specific situation, consult a licensed
              professional and, where housing or employment disputes are involved, a qualified attorney.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
