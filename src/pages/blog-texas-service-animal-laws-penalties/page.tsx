// Blog article — /blog/texas-service-animal-laws-penalties
//
// Texas service-animal penalties post in the Texas ESA/PSD cluster
// (SEO-TX-ESA-PSD-CLUSTER-001). Converted from
// `texas-service-animal-laws-penalties.md`. PawTenant compliance: no
// "legit/legitimate" in headings/meta/FAQ questions (source had none); a letter
// does NOT create service-dog status (task training does); no guaranteed
// approval / registry / certification / vest claims (the post educates that
// these confer no status — kept). Texas statutory citations kept as provided
// (H&S §437.023, HRC Ch. 121 / §121.003 / §121.006 + HB 4164, Penal §42.091).
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + BlogPosting/Breadcrumb/FAQ
// JSON-LD. Also has a listing card in src/mocks/blogPostsVerification.ts.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/blog/texas-service-animal-laws-penalties";
const TX_GUIDE = "/states/texas-esa-psd-guide";

const topicChips = ["Texas Service Animals", "HB 4164", "Misrepresentation Penalty", "ADA vs ESA"];

// ── Recognized service-animal task categories (from the post) ────────────────
const taskCategories = [
  "Guiding a handler who is blind or has low vision.",
  "Alerting a handler who is deaf or hard of hearing to sounds.",
  "Pulling a wheelchair or providing mobility support.",
  "Alerting to and assisting during a seizure.",
  "Performing trained tasks for psychiatric disabilities — such as interrupting a panic episode through a specific trained action, or retrieving medication on cue.",
];

// ── FAQs — mirror texas-faq-schema.json → texasServiceAnimalPenaltiesBlog ─────
const faqs = [
  {
    q: "Is an emotional support animal legally considered a service dog in Texas?",
    a: "No. Under Texas Health & Safety Code Section 437.023 and the Texas Human Resources Code, an animal that only provides emotional comfort or companionship does not qualify as a service animal. To have public access rights in Texas, the animal must be a dog individually trained to perform specific tasks mitigating a handler's disability.",
  },
  {
    q: "What is the penalty for misrepresenting a service dog in Texas?",
    a: "Texas Human Resources Code Section 121.006, amended by House Bill 4164 effective September 1, 2023, makes it a misdemeanor to intentionally or knowingly represent an untrained animal as a service or assistance animal, punishable by a fine of up to $1,000 and 30 hours of community service for a disability-focused organization.",
  },
  {
    q: "What can a Texas business or landlord legally ask about a service animal?",
    a: "When it isn't obvious that a dog is a service animal, staff may generally ask only whether the animal is required because of a disability and what task it has been trained to perform. They cannot demand documentation, require a demonstration of the task, or ask about the specific nature of the disability.",
  },
  {
    q: "Does Texas law protect assistance animals from being attacked or harassed?",
    a: "Yes. Texas Penal Code Section 42.091 makes it a separate criminal offense to attack, injure, harass, or interfere with an assistance animal, independent of the misrepresentation penalties under Human Resources Code Section 121.006.",
  },
];

function SectionHeading({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h2 id={id} className="text-xl md:text-2xl font-extrabold text-gray-900 mt-12 mb-4 scroll-mt-28">{children}</h2>;
}
function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">{children}</p>;
}
const inlineLink = "text-orange-600 font-semibold hover:text-orange-700 underline decoration-orange-200 underline-offset-2";

export default function BlogTexasServiceAnimalPenaltiesPage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="Texas service animal laws, penalty misrepresenting service dog Texas, HB 4164, Texas Human Resources Code 121.006, ESA vs service dog Texas, Texas Health Safety Code 437.023, fake service dog Texas, Texas Penal Code 42.091"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="Texas Service Animal Laws: Public Access Rights & Penalties for Misrepresentation" />
      <meta property="og:description" content="What Texas law actually says about service animals vs emotional support animals — the ADA-style task standard, the strengthened HB 4164 misrepresentation penalty, and what a business or landlord may ask." />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content="https://pawtenant.com/assets/lifestyle/woman-with-dog-office.jpg" />
      <meta property="article:published_time" content="2026-07-08" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content="https://pawtenant.com/assets/lifestyle/woman-with-dog-office.jpg" />
      <meta name="twitter:title" content="Texas Service Animal Laws & Penalties for Misrepresentation" />
      <meta name="twitter:description" content="ESA vs service dog under Texas law, the HB 4164 penalty for misrepresentation, and the two questions a business may ask." />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "BlogPosting",
                "@id": `${CANONICAL}#article`,
                headline: "Texas Service Animal Laws: Public Access Rights and Penalties for Misrepresentation",
                description: "What Texas law says about service animals, emotional support animals, and the real consequences of misrepresenting one as the other — including the strengthened 2023 HB 4164 penalty.",
                mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
                url: CANONICAL,
                image: ["https://pawtenant.com/assets/lifestyle/woman-with-dog-office.jpg"],
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
                  { "@type": "ListItem", position: 2, name: "Blog", item: "https://pawtenant.com/blog" },
                  { "@type": "ListItem", position: 3, name: "Texas Service Animal Laws & Penalties", item: CANONICAL },
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
            <Link to="/blog" className="hover:text-orange-600">Blog</Link>
            <span className="mx-1.5">/</span>
            <span className="text-gray-500">Texas Service Animal Laws &amp; Penalties</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span key={chip} className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm">{chip}</span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[42px] font-extrabold text-gray-900 leading-tight mb-4">
            Texas Service Animal Laws:{" "}
            <span className="text-orange-500">Public Access Rights and Penalties for Misrepresentation</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-6">
            <span className="inline-flex items-center gap-1.5"><i className="ri-calendar-line text-orange-400"></i> Published July 2026</span>
            <span className="inline-flex items-center gap-1.5"><i className="ri-time-line text-orange-400"></i> ~8 min read</span>
            <span className="inline-flex items-center gap-1.5"><i className="ri-user-line text-orange-400"></i> PawTenant Editorial — reviewed for accuracy</span>
          </div>

          <div className="rounded-2xl bg-white border border-orange-200 shadow-[0_18px_45px_-25px_rgba(122,78,45,0.35)] p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-2.5 flex items-center gap-2"><i className="ri-flashlight-line"></i> Quick answer</p>
            <p className="text-sm md:text-[15px] text-gray-700 leading-relaxed">
              Texas has some of the more direct statutory language in the country distinguishing a service
              animal from an emotional support animal — and, since a 2023 update, some of the more clearly
              enforced penalties for blurring that line. For the full housing picture, see the{" "}
              <Link to={TX_GUIDE} className={inlineLink}>Texas ESA &amp; PSD housing guide</Link>; this post
              focuses on public access and the misrepresentation penalty.
            </p>
          </div>
        </div>
      </section>

      {/* ===== ARTICLE BODY ===== */}
      <article className="bg-white pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <p className="text-base text-gray-600 leading-relaxed mb-8 font-medium border-l-4 border-orange-400 pl-5">
            What Texas law actually says about service animals, emotional support animals, and the real
            consequences of misrepresenting one as the other.
          </p>

          <SectionHeading id="esa-not-service-dog">Is an emotional support animal legally considered a service dog in Texas?</SectionHeading>
          <Para>
            No. Under Texas Health &amp; Safety Code § 437.023, an animal that provides only comfort or emotional
            support to a person is explicitly <em>not</em> a service animal under Texas law. The Texas Human
            Resources Code reinforces this: Chapter 121 defines &quot;assistance animal&quot; and &quot;service
            animal&quot; as a canine that is specially trained or equipped to help a person with a disability. An
            ESA, by definition, hasn&apos;t received that training — it provides support through presence and
            companionship, which is a real and valid form of support, but a legally distinct one from task-based
            service work.
          </Para>
          <Para>
            To have public access rights in Texas — the ability to accompany a handler into restaurants, stores,
            and other places open to the public — an animal must be a dog individually trained to perform
            specific tasks that mitigate a handler&apos;s disability. This mirrors the federal ADA standard
            almost exactly, and Texas has built its own state statute around the same core distinction.
          </Para>

          <SectionHeading id="penalty">What is the penalty for misrepresenting a service dog in Texas?</SectionHeading>
          <Para>
            Texas Human Resources Code Section 121.006 makes it a criminal offense to intentionally or knowingly
            represent that an animal is an assistance animal or service animal when it hasn&apos;t actually been
            specially trained or equipped to help a person with a disability.
          </Para>
          <Para>
            In 2023, Texas House Bill 4164 amended this section, both clarifying the statutory language around
            what counts as a service animal and substantially increasing the penalty. Effective September 1,
            2023, a violation is a misdemeanor punishable by:
          </Para>
          <ul className="list-disc pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li>A fine of up to <strong className="text-gray-800">$1,000</strong> (up from $300 under the prior version of the law), and</li>
            <li><strong className="text-gray-800">30 hours of community service</strong>, to be performed for a governmental entity or a nonprofit organization that primarily serves people with visual impairments or other disabilities, to be completed within one year.</li>
          </ul>
          <Para>
            Lawmakers passed HB 4164 in direct response to a documented rise in people misrepresenting untrained
            pets as service animals to access public spaces, which — beyond the legal issue — created real safety
            problems: untrained pets in public settings have led to documented incidents of aggression toward
            genuine working service animals, undermining public trust and making things harder for real handlers.
            Separately, Texas Penal Code § 42.091 makes it a distinct criminal offense to attack, injure, harass,
            or interfere with an assistance animal — a different provision aimed at protecting working service
            animals and their handlers, not at documentation issues.
          </Para>

          <SectionHeading id="specially-trained">What does &quot;specially trained or equipped&quot; actually require?</SectionHeading>
          <Para>
            Texas law doesn&apos;t provide a fixed checklist of tasks the way a training manual might, but it
            tracks the same substantive standard as the ADA: the animal must be trained to perform specific,
            identifiable actions that address the handler&apos;s disability, not simply keep the handler company.
            Under both Texas and federal law, common recognized categories include:
          </Para>
          <ul className="list-disc pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            {taskCategories.map((t) => (<li key={t}>{t}</li>))}
          </ul>
          <Para>
            The common thread is training tied to a specific, repeatable response — not comfort provided simply
            by being present, which is the legal marker that keeps an animal in ESA territory rather than
            service-animal territory. For a deeper walkthrough of what psychiatric task training actually
            involves and how legal self-training works, see our companion guide,{" "}
            <Link to="/blog/how-to-train-psychiatric-service-dog-tasks" className={inlineLink}>
              how to train your dog to be a psychiatric service dog
            </Link>
            .
          </Para>

          <SectionHeading id="what-can-be-asked">What can a Texas business or landlord ask?</SectionHeading>
          <Para>
            Texas Human Resources Code § 121.003 protects people with disabilities from being denied access to
            public facilities because of a genuine service animal, and the practical inquiry standard mirrors the
            ADA&apos;s approach: when it&apos;s not obvious that a dog is a service animal, staff may generally ask
            only whether the animal is required because of a disability and what task it has been trained to
            perform. They&apos;re not entitled to demand documentation, require a demonstration of the task, or
            ask about the specific nature of the disability. This applies to service animals in public
            accommodations; housing situations, including those involving ESAs, are governed separately by the
            Fair Housing Act and the Texas Fair Housing Act (Property Code Chapter 301), which allow a landlord to
            request reliable documentation of a disability-related need when it isn&apos;t obvious — as covered in
            the <Link to={TX_GUIDE} className={inlineLink}>Texas ESA &amp; PSD housing guide</Link>.
          </Para>

          <SectionHeading id="why-it-matters">Why this distinction matters beyond the penalty</SectionHeading>
          <Para>
            Beyond the legal exposure, the ESA/service-animal line matters because it protects something real:
            public trust in service animal teams, and the practical reliability that working dogs need to
            function safely in public settings. A dog that hasn&apos;t been trained to ignore distractions, remain
            calm under pressure, or execute a task on cue isn&apos;t just legally mismatched to the &quot;service
            animal&quot; label — it may also struggle in the environments that label is meant to guarantee access
            to. Texas&apos;s statute reflects that reality by tying legal status directly to actual training, not
            to a letter, a vest, or a claim made at the door.
          </Para>

          <SectionHeading id="getting-it-right">Getting It Right</SectionHeading>
          <Para>
            If you&apos;re navigating this distinction for your own situation — whether you have an ESA and want
            to understand your actual rights, or you&apos;re working toward genuine service-dog task training —
            the safest path is documentation and training that accurately reflect what your animal is and does.
            For handlers pursuing task training, working with a{" "}
            <Link to={withAttribution("/assessment")} className={inlineLink}>licensed mental health professional</Link>{" "}
            to document the underlying disability can be part of that process; it doesn&apos;t substitute for the
            training itself, but it supports the parts of the legal framework — like housing accommodation
            requests — that do call for professional documentation of a disability.
          </Para>

          {/* ── CTA ── */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2"><i className="ri-stethoscope-line text-orange-500"></i> Documenting a disability for housing in Texas?</p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              A Texas-licensed mental health professional can evaluate whether ESA or PSD documentation is
              clinically appropriate for your situation. Documentation supports the disability side — task
              training is what makes a dog a service animal. No outcome is guaranteed, and you get a refund if you
              don&apos;t qualify.
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
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">Understand your Texas ESA &amp; PSD rights</h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            The housing side has its own rules — no state waiting period, the May 2026 HUD shift, and fee
            exemptions. Get the full picture in our Texas housing guide, or start an evaluation with a licensed
            professional. No outcome is guaranteed; refund if you don&apos;t qualify.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={TX_GUIDE} className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm">
              <i className="ri-map-pin-2-line"></i> Texas ESA & PSD housing guide
            </Link>
            <Link to={withAttribution("/assessment")} className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm">
              <i className="ri-stethoscope-line"></i> Start assessment
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
              { to: TX_GUIDE, icon: "ri-map-pin-2-line", label: "Texas ESA & PSD housing guide" },
              { to: "/blog/how-to-train-psychiatric-service-dog-tasks", icon: "ri-shield-star-line", label: "How to train a psychiatric service dog" },
              { to: "/blog/2026-hud-esa-guidelines", icon: "ri-government-line", label: "2026 HUD ESA guidelines explained" },
              { to: "/states/california-esa-psd-guide", icon: "ri-scales-3-line", label: "California ESA & PSD guide (compare states)" },
              { to: "/esa-vs-psd-letter", icon: "ri-file-list-3-line", label: "ESA vs PSD letter" },
              { to: "/all-about-service-dogs", icon: "ri-service-line", label: "Psychiatric service dog overview" },
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
              <strong className="text-gray-600">Educational information, not legal advice.</strong>{" "}
              A service animal&apos;s legal status in Texas comes from individual task training, not from a letter,
              a vest, an ID card, or any registration or certification — none of which is required or recognized
              under Texas or federal law. PawTenant connects you with licensed mental health professionals who can
              document a disability where clinically appropriate; it does not train, certify, or register service
              animals, and it does not guarantee any landlord, HOA, airline, or business decision. For your
              specific situation, consult a Texas attorney or the Texas Workforce Commission&apos;s Civil Rights
              Division.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
