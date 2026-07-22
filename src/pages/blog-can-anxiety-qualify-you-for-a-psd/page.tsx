// Blog article — /blog/can-anxiety-qualify-you-for-a-psd
//
// "Can Anxiety Qualify You for a Psychiatric Service Dog (PSD)?"
//
// Converted from the owner's standalone HTML draft into the established
// PawTenant blog-page structure, with YMYL legal/medical corrections
// (SEO-PSD-ESA-CONDITION-ARTICLE-BATCH-001):
//   • task training — NOT a letter/registry/vest — creates ADA service-animal
//     status; a PSD letter does not itself establish service-dog status.
//   • businesses generally cannot require a PSD letter for ADA public access;
//     staff may ask only the two permitted ADA questions when service isn't obvious.
//   • housing framed via the May 22, 2026 HUD/FHEO enforcement guidance
//     (individually-trained standard), NOT the rescinded FHEO-2020-01 notice.
//   • air travel framed via DOT rules: airlines must recognize trained service
//     dogs (incl. PSDs), may require the DOT Service Animal Air Transportation
//     Form; ESAs may be treated as pets; no "every airline uses the same form" claim.
//   • registries/certificates/IDs/vests do not by themselves create federal
//     service-animal rights; no blanket "fraud" labels.
//
// Facts verified against ADA (ada.gov service-animal guidance + FAQ), DOT
// (transportation.gov service animals) and the May 22, 2026 HUD/FHEO guidance.
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + BlogPosting/Breadcrumb/FAQ
// JSON-LD. Styling follows /blog/2026-hud-esa-guidelines (ri-* icons in subset).

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/blog/can-anxiety-qualify-you-for-a-psd";
const HERO_IMG = "https://pawtenant.com/assets/service-dogs/handler-working-with-dog.jpg";

const topicChips = ["Psychiatric Service Dog", "Anxiety", "ADA", "Housing & Travel"];

// ── PSD vs ESA vs therapy-dog comparison ─────────────────────────────────────
const comparisonRows = [
  {
    feature: "Legal basis",
    psd: "Service animal — ADA Titles II & III",
    esa: "Assistance animal — Fair Housing Act (housing only)",
    therapy: "No federal legal status",
  },
  {
    feature: "Training",
    psd: "Individually trained to perform disability-related tasks, plus public-access manners",
    esa: "No task training required",
    therapy: "Obedience/temperament screening for facility visits",
  },
  {
    feature: "Public access (stores, restaurants)",
    psd: "Yes — the trained tasks are what unlock ADA access",
    esa: "No",
    therapy: "Only within approved facilities (hospitals, schools)",
  },
  {
    feature: "Housing",
    psd: "Assistance animal under the FHA — reasonable accommodation, generally no pet fees",
    esa: "Assistance animal under the FHA — but federal enforcement narrowed in 2026",
    therapy: "Subject to the landlord's normal pet policy",
  },
  {
    feature: "Air travel",
    psd: "Recognized as a service dog under DOT rules (airline may require the DOT form)",
    esa: "May be treated as an ordinary pet",
    therapy: "Treated as an ordinary pet",
  },
];

const faqs = [
  {
    q: "Can anxiety qualify you for a psychiatric service dog?",
    a: "It can, but not automatically. Two things have to be true: your anxiety must rise to the level of a disability that substantially limits a major life activity — such as sleeping, working, or leaving home — and a dog must be individually trained to perform specific tasks that help with your symptoms. A diagnosis on its own is not enough; the trained tasks are what create service-animal status under the ADA. A licensed mental health professional decides whether an animal-related recommendation is clinically appropriate.",
  },
  {
    q: "What is the difference between an ESA and a PSD for anxiety?",
    a: "An emotional support animal (ESA) helps through its comforting presence and needs no task training; an ESA is centered on housing and does not have ADA public-access rights. A psychiatric service dog (PSD) is individually trained to take a specific action — such as deep pressure therapy or interrupting a panic response — and it is that trained work, not any letter, that gives it public-access rights under the ADA.",
  },
  {
    q: "Do I have to show a PSD letter in stores or restaurants?",
    a: "No. Under the ADA, businesses generally cannot require documentation, certification, registration, or a PSD letter for public access. When it is not obvious that a dog is a service animal, staff may ask only two questions: is the dog a service animal required because of a disability, and what work or task has it been trained to perform. They may not ask about your diagnosis or require the dog to demonstrate the task.",
  },
  {
    q: "Did the 2026 HUD change affect psychiatric service dogs in housing?",
    a: "The May 22, 2026 HUD enforcement guidance centers federal enforcement on animals individually trained to perform disability-related work or tasks — which is exactly what a psychiatric service dog is. So task-trained service dogs remain well positioned in housing. The Fair Housing Act statute itself is unchanged, private lawsuits remain available, and some state and local laws add further protection. Individual housing outcomes are still decided case by case.",
  },
  {
    q: "Can any dog breed become a psychiatric service dog for anxiety?",
    a: "Any breed or size can, as long as the individual dog has the temperament and physical ability to reliably perform the required trained tasks and to behave calmly in public. Suitability is judged dog by dog, not by breed.",
  },
  {
    q: "Do I need professional training or certification for a PSD?",
    a: "No. The ADA allows handlers to train their own dogs, and there is no official government service-dog registry. Registrations, certificates, ID cards, or vests do not by themselves create federal service-animal rights. What matters is that the dog is genuinely trained to perform a disability-related task and behaves appropriately in public.",
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

export default function BlogCanAnxietyQualifyPsdPage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="can anxiety qualify you for a psychiatric service dog, psychiatric service dog for anxiety, PSD for anxiety, anxiety service dog tasks, ADA psychiatric service dog, PSD vs ESA anxiety, psychiatric service dog housing, psychiatric service dog air travel"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="Can Anxiety Qualify You for a Psychiatric Service Dog?" />
      <meta
        property="og:description"
        content="Anxiety can qualify you for a psychiatric service dog — but only if it rises to a disability and a dog is individually trained to perform tasks. How PSDs differ from ESAs, plus ADA, housing, and air-travel rules."
      />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content={HERO_IMG} />
      <meta property="article:published_time" content="2026-07-22" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={HERO_IMG} />
      <meta name="twitter:title" content="Can Anxiety Qualify You for a Psychiatric Service Dog?" />
      <meta
        name="twitter:description"
        content="What actually qualifies anxiety for a PSD — the disability threshold, trained tasks, and your ADA, housing, and travel rights. Explained without hype."
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
                headline: "Can Anxiety Qualify You for a Psychiatric Service Dog (PSD)?",
                description:
                  "Anxiety can qualify you for a psychiatric service dog when it rises to a disability and a dog is individually trained to perform disability-related tasks. How PSDs differ from ESAs and therapy dogs, and the ADA, housing, and air-travel rules that apply.",
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
                  { "@type": "ListItem", position: 3, name: "Anxiety & Psychiatric Service Dogs", item: CANONICAL },
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
            <span className="text-gray-500">Anxiety & Psychiatric Service Dogs</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span key={chip} className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm">
                {chip}
              </span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[42px] text-gray-900 leading-tight mb-4 pt-hero-display">
            Can Anxiety Qualify You for a{" "}
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
              Yes — severe anxiety can qualify you for a psychiatric service dog (PSD), but only when
              two things come together: your anxiety rises to a disability that substantially limits a
              major life activity, and a dog is <strong>individually trained</strong> to perform
              specific tasks that help with your symptoms. Task training — not a letter, registry,
              vest, or certificate — is what creates service-animal status under the ADA. A diagnosis
              alone gets you an{" "}
              <Link to="/service-animal-vs-esa" className={inlineLink}>emotional support animal</Link>,
              not a service dog.
            </p>
          </div>

          <figure className="mt-8">
            <img
              src="/assets/service-dogs/handler-working-with-dog.jpg"
              alt="A handler working with a calm, attentive psychiatric service dog"
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

          <SectionHeading id="anxiety-as-disability">Understanding anxiety as an ADA-recognized disability</SectionHeading>
          <Para>
            Federal disability law does not treat &quot;anxiety&quot; as a checkbox — it uses a
            functional test. Under the Americans with Disabilities Act, a disability is a physical or
            mental impairment that substantially limits one or more major life activities. That is a
            meaningfully higher bar than everyday nerves before a big meeting. The question is not
            whether you feel anxious; it is whether your anxiety measurably interferes with things
            like sleeping through the night, leaving your home, holding a conversation in public, or
            completing basic tasks at work.
          </Para>
          <Para>
            Several diagnosable anxiety-spectrum conditions commonly meet that threshold when they
            are severe enough:
          </Para>
          <ul className="space-y-2.5 my-5">
            {[
              ["Generalized Anxiety Disorder (GAD)", "chronic, hard-to-control worry that disrupts sleep, concentration, and daily functioning."],
              ["Panic Disorder", "recurrent, unprovoked panic attacks that can be physically incapacitating in the moment."],
              ["Social Anxiety Disorder", "severe fear of social or performance situations that prevents working or participating in community life."],
              ["PTSD / C-PTSD", "trauma-driven anxiety, intrusive memories, hypervigilance, and dissociation."],
              ["OCD", "high-anxiety compulsion cycles that can restrict independent routines and mobility."],
            ].map(([term, desc]) => (
              <li key={term} className="flex items-start gap-3">
                <i className="ri-checkbox-circle-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                <span className="text-sm text-gray-600 leading-relaxed">
                  <strong className="text-gray-800">{term}:</strong> {desc}
                </span>
              </li>
            ))}
          </ul>
          <Para>
            A diagnosis on paper is not the same as a qualifying disability — what matters legally is
            the degree of functional limitation, which is why the clinical evaluation described later
            is the real starting point, not a formality. Anxiety is also only one of several
            conditions that can support a PSD; depression is another common one, covered in our guide
            to whether{" "}
            <Link to="/blog/can-depression-qualify-psychiatric-service-dog" className={inlineLink}>
              depression can qualify you for a psychiatric service dog
            </Link>
            .
          </Para>

          <SectionHeading id="psd-vs-esa">PSD vs. ESA vs. therapy dog: what actually differs</SectionHeading>
          <Para>
            These three terms get used interchangeably online, but they carry very different legal
            weight. The distinction that matters most: an ESA helps simply by being present, while a
            PSD is trained to actively intervene when a symptom occurs — and that trained action is
            what unlocks public-access rights under the ADA. If comfort-by-presence is what fits your
            situation, an emotional support animal may be the better path; our companion guide asks
            whether{" "}
            <Link to="/blog/can-depression-qualify-you-for-an-esa" className={inlineLink}>
              depression can qualify you for an ESA
            </Link>{" "}
            and walks through how ESA qualification works.
          </Para>

          {/* Desktop comparison table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 my-5">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdf6ee] border-b border-orange-100">
                  <th className="px-4 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide w-[22%]">Feature</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-gray-900 w-[30%]">Psychiatric service dog</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-gray-900 w-[26%]">Emotional support animal</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-gray-900 w-[22%]">Therapy dog</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr key={row.feature} className={i % 2 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-4 py-3.5 text-xs font-semibold text-gray-700 align-top">{row.feature}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.psd}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.esa}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-600 leading-relaxed align-top">{row.therapy}</td>
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
                  <div><p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Therapy dog</p><p className="text-xs text-gray-600 leading-relaxed">{row.therapy}</p></div>
                </div>
              </div>
            ))}
          </div>

          <SectionHeading id="tasks">The specific tasks a PSD performs for anxiety</SectionHeading>
          <Para>
            The ADA is specific about what counts as a &quot;task.&quot; It has to be an active,
            trained behavior that directly addresses a symptom — not just comforting companionship.
            Passive comfort, however genuine, does not meet the legal definition. Some of the most
            common trained tasks for anxiety and panic include:
          </Para>
          <ol className="space-y-2.5 my-5">
            {[
              ["Deep pressure therapy (DPT)", "the dog applies its body weight to the chest or lap to help settle the nervous system during a panic episode."],
              ["Tactile grounding", "nudging, pawing, or licking to interrupt dissociation or anxious repetitive behaviors."],
              ["Crowd buffering", "positioning in front of or behind the handler to create space and ease social anxiety."],
              ["Interrupting compulsions", "intervening when the handler engages in skin picking, hand wringing, or similar anxious behaviors."],
              ["Room checks", "entering an unfamiliar room first to signal that a space is clear — useful for trauma-related hypervigilance."],
              ["Medication reminders", "alerting the handler at set times to take prescribed medication."],
              ["Escorting from stressful environments", "guiding an overwhelmed handler toward an exit or a calmer space during a panic attack."],
            ].map(([title, desc], i) => (
              <li key={title as string} className="flex items-start gap-3.5">
                <div className="w-7 h-7 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
                <p className="text-sm text-gray-600 leading-relaxed"><strong className="text-gray-900">{title}:</strong> {desc}</p>
              </li>
            ))}
          </ol>
          <Para>
            The training discipline that matters is consistency: each task has to be reliably paired
            with a recognizable warning sign, like early hyperventilation or leg shaking, so the dog
            intervenes before an episode fully escalates. These are examples only — a dog must be
            individually trained, and each task must relate directly to the handler&apos;s own
            disability.
          </Para>

          {/* Mid CTA */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2">
              <i className="ri-stethoscope-line text-orange-500"></i> Wondering whether a PSD fits your situation?
            </p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              A licensed mental health professional can evaluate whether your anxiety meets the
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

          <SectionHeading id="public-access">ADA public access and the two questions</SectionHeading>
          <Para>
            Once a dog meets the service-animal definition, ADA Titles II and III give the handler the
            right to bring it into essentially any public space — retail stores, restaurants, hotels,
            offices, and schools. Businesses are tightly restricted in how they can respond. Staff
            cannot ask about the nature of a disability, demand documentation or a PSD letter, require
            registration or an ID card, or ask for a demonstration of the trained task. When the
            disability is not obvious, they are limited to exactly two questions:
          </Para>
          <ol className="space-y-2 my-5">
            <li className="flex items-start gap-3"><i className="ri-question-line text-orange-500 mt-0.5"></i><span className="text-sm text-gray-600 leading-relaxed">Is the dog a service animal required because of a disability?</span></li>
            <li className="flex items-start gap-3"><i className="ri-question-line text-orange-500 mt-0.5"></i><span className="text-sm text-gray-600 leading-relaxed">What work or task has the dog been trained to perform?</span></li>
          </ol>
          <Para>
            A business can lawfully exclude a service dog only in narrow situations: the dog is out of
            control and the handler is not managing it, the dog is not housebroken, or it poses a
            direct threat to others&apos; safety. Because public access flows from the trained tasks,
            you are never required to carry a PSD letter in public — the letter matters in other
            contexts, described below.
          </Para>

          <SectionHeading id="housing">Housing: the Fair Housing Act and the 2026 HUD change</SectionHeading>
          <Para>
            Housing works differently from public access. Under the Fair Housing Act, psychiatric
            service dogs are treated as &quot;assistance animals,&quot; which means a landlord is
            generally expected to consider a reasonable-accommodation request even in no-pet housing,
            and not to charge pet deposits, pet fees, or monthly pet rent for a legitimate assistance
            animal. Where the disability is not obvious, a landlord may request reliable documentation
            that supports the disability-related need — this is the setting where clinical
            documentation is genuinely useful, unlike public access.
          </Para>
          <Para>
            The 2026 landscape is important here. On May 22, 2026, HUD&apos;s Office of Fair Housing
            and Equal Opportunity issued enforcement guidance stating that it will generally find
            reasonable cause and recommend charges only where an animal is individually trained to
            perform disability-related work or tasks — the same standard the ADA uses for service
            animals. Because a psychiatric service dog <em>is</em> individually task-trained, it sits
            squarely within that standard, while untrained emotional support animals lost some federal
            enforcement backing. The Fair Housing Act statute itself was not repealed, private lawsuits
            remain available, and state or local protections may still apply. We walk through exactly
            what changed in our{" "}
            <Link to="/blog/2026-hud-esa-guidelines" className={inlineLink}>
              2026 HUD ESA guidelines explainer
            </Link>
            , and &quot;must consider&quot; still is not &quot;must accept&quot; — every request is
            decided individually.
          </Para>

          <SectionHeading id="air-travel">Air travel: DOT rules and the Air Transportation Form</SectionHeading>
          <Para>
            Air travel is governed separately, under the Air Carrier Access Act and U.S. Department of
            Transportation rules. Airlines must recognize qualifying trained service dogs, including
            psychiatric service dogs, and treat them the same as other service animals — they travel
            in the cabin at the handler&apos;s feet at no additional charge. What creates that right is
            the dog&apos;s training, not a &quot;PSD travel letter.&quot;
          </Para>
          <Para>
            Airlines may require the DOT Service Animal Air Transportation Form, on which the handler
            attests to the dog&apos;s training, health, and behavior, and they may require it to be
            submitted in advance — up to 48 hours before departure when the reservation was booked
            earlier than that, or at the gate if you booked within 48 hours. Individual carriers set
            their own submission process within DOT&apos;s rules, so check directly with your airline
            before you fly. Emotional support animals, by contrast, may be treated as ordinary pets.
            If flying itself is a major source of anxiety, our guide to{" "}
            <Link to="/blog/emotional-support-animal-travel-anxiety" className={inlineLink}>
              emotional support animals and travel anxiety
            </Link>{" "}
            covers airport-specific strategies and the limits of an ESA on a plane.
          </Para>

          <SectionHeading id="lmhp">The role of a licensed mental health professional</SectionHeading>
          <Para>
            Clinical documentation does not create service-dog status — training does — but it is
            useful in context-specific requests such as housing or employment accommodations. Whether
            a particular clinician can provide that documentation depends on their professional scope
            and on being licensed in your state. Qualifying professionals commonly include licensed
            clinical social workers, licensed professional counselors, marriage and family
            therapists, clinical psychologists, psychiatrists, and psychiatric nurse practitioners.
          </Para>
          <Para>
            Two things matter. First, the clinician must hold an active license where you live.
            Second, whether a telehealth evaluation is appropriate depends on the clinician&apos;s
            professional judgment and the telehealth rules that apply in your state — what carries
            weight is a genuine, individualized evaluation, not a one-off call whose only purpose is
            to generate a letter. A clinician is not required to disclose your private diagnostic
            details to a landlord to support a housing request.
          </Para>

          <SectionHeading id="training">Training: self-training vs. professional training</SectionHeading>
          <Para>
            One of the more overlooked provisions of the ADA is that it explicitly allows
            owner-training. You are not required to hire a professional trainer or enroll your dog in
            a board-and-train program. Whichever route you choose, your dog needs to reliably meet
            public-access standards — heeling calmly through crowds, staying composed under sudden
            distractions, ignoring food on the ground, and showing no aggression. Beyond manners, task
            training is the harder half: consistently linking your specific anxiety warning signs to a
            trained physical response.
          </Para>

          <SectionHeading id="scams">Registries, certificates, and scams</SectionHeading>
          <Para>
            There is no official government registry, certification program, or ID-card system for
            service dogs in the United States. Registrations, certificates, ID cards, or vests do not
            by themselves create federal service-animal rights — a dog becomes a service animal
            through training tied to a disability, not through a purchase. Landlords and businesses
            have grown familiar with instant &quot;certified service dog&quot; products and tend to
            give them little weight, especially next to a genuine, verifiable clinical evaluation. Many
            states also make it unlawful to misrepresent a pet as a service animal, so the shortcut
            carries real exposure on top of not actually working.
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
              { to: "/blog/can-depression-qualify-psychiatric-service-dog", icon: "ri-shield-star-line", label: "Can depression qualify you for a PSD?" },
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
