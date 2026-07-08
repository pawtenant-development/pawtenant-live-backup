// Blog article — /blog/how-to-train-psychiatric-service-dog-tasks
//
// PSD-training post in the California ESA/PSD cluster (SEO-CA-ESA-PSD-CLUSTER-001).
// Converted from `how-to-train-psychiatric-service-dog-tasks.md` with PawTenant
// compliance edits: "legit/legitimate" removed from H1/H2/H3 + meta + FAQ
// questions (softened to "recognized"/"legally recognized"); a letter does NOT
// create service-dog status (task training does) — preserved from the source;
// PSD documentation supports housing; no guaranteed approval / registry /
// certification / vest / ID claims (the article educates that these confer no
// status). Texas-penalties link DEFERRED (route not published) — the
// misrepresentation reference points to the California guide instead.
//
// SEO title/description/canonical come from CORE_PAGE_META via SEOManager +
// prerender. This file adds keyword/OG/Twitter meta + BlogPosting/Breadcrumb/FAQ
// JSON-LD. Also has a listing card in src/mocks/blogPostsVerification.ts.

import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { useAttributionParams } from "@/hooks/useAttributionParams";

const CANONICAL = "https://pawtenant.com/blog/how-to-train-psychiatric-service-dog-tasks";

const topicChips = ["Psychiatric Service Dog", "PSD Task Training", "ADA", "Self-Training"];

// ── Recognized PSD task categories ───────────────────────────────────────────
const taskCategories = [
  {
    title: "Panic and anxiety mitigation",
    desc: "Deep Pressure Therapy (DPT): the dog is trained to lie across or lean its body weight onto the handler's chest or lap on cue, which can help lower physiological arousal during a panic attack — a trainable, observable behavior with a clear cue-response structure.",
  },
  {
    title: "PTSD and hypervigilance",
    desc: "A trained \"room check\" — entering a space ahead of the handler and signaling it's clear — or turning on a light switch, both of which can reduce hypervigilance triggers. A dog can also create physical space in crowds by positioning itself as a buffer.",
  },
  {
    title: "Dissociative episodes and repetitive behaviors",
    desc: "The dog physically interrupts a behavior pattern — nudging, pawing, or licking a handler's hand on cue — to bring attention back during a dissociative episode, or to interrupt repetitive self-harming behaviors like skin picking.",
  },
  {
    title: "Medication and medical response",
    desc: "Some handlers train their dogs to retrieve a specific medication bag, or to wake a handler who has been sedated by psychiatric medication, on a specific cue or in response to a specific physical state the dog has been trained to recognize.",
  },
];

// ── FAQs — mirror psd-training-faq-schema.json, "legitimate" softened in the
//    two question titles (kept identical in the visible accordion + JSON-LD). ──
const faqs = [
  {
    q: "What makes a dog a legally recognized Psychiatric Service Dog under the law?",
    a: "Under the ADA, a Psychiatric Service Dog is a dog that has been individually trained to perform specific tasks directly related to a handler's disability. A dog that only provides comfort by its presence is not a service animal under the ADA, regardless of documentation; it must be trained to take a specific action in response to a specific need.",
  },
  {
    q: "What tasks qualify as recognized psychiatric service dog work?",
    a: "Recognized task categories include Deep Pressure Therapy to help mitigate panic attacks, room checks or light-switch activation for PTSD hypervigilance, physically interrupting dissociative episodes or repetitive self-harming behaviors, and retrieving medication or waking a sedated handler. Each must be a specific, trainable, repeatable action tied to a specific trigger and directly related to the handler's disability.",
  },
  {
    q: "Do you need a professional trainer to qualify for a PSD?",
    a: "No. Under U.S. Department of Justice ADA guidance, handlers have the legal right to train their own service dogs. Professional training or formal certification is not a legal prerequisite for public access or housing protections, though the dog must still reach a reliable task-trained and public-access standard.",
  },
  {
    q: "What two questions can businesses or landlords legally ask about a service dog?",
    a: "If a disability isn't obvious, staff may ask only two questions: is the dog a service animal required because of a disability, and what work or task has the dog been trained to perform. They cannot ask about the specific disability, request medical documentation, require a demonstration of the task, or demand a vest, ID, or certification.",
  },
  {
    q: "Does a psychiatric service dog need to wear a vest or carry identification?",
    a: "No. The ADA does not require service animals to wear a vest, ID tag, or special harness, and there is no legally recognized national certification or registry for service dogs.",
  },
  {
    q: "Is there a waiting period to get a Psychiatric Service Dog letter, similar to California's ESA rule?",
    a: "California's AB 468 30-day waiting period applies specifically to emotional support dog documentation, not to service animals. There is no equivalent statutory waiting period for PSDs, but the dog must still be individually trained to perform a qualifying task before it legally qualifies as a service animal, regardless of any documentation timeline.",
  },
];

function SectionHeading({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h2 id={id} className="text-xl md:text-2xl font-extrabold text-gray-900 mt-12 mb-4 scroll-mt-28">{children}</h2>;
}
function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base md:text-lg font-bold text-gray-900 mt-8 mb-3">{children}</h3>;
}
function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">{children}</p>;
}
const inlineLink = "text-orange-600 font-semibold hover:text-orange-700 underline decoration-orange-200 underline-offset-2";
const extLink = "text-orange-600 font-semibold hover:text-orange-700 underline decoration-orange-200 underline-offset-2";

export default function BlogHowToTrainPsdTasksPage() {
  const { withAttribution } = useAttributionParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="how to train a psychiatric service dog, PSD task training, psychiatric service dog tasks, deep pressure therapy training, self-train service dog, PSD public access, ADA service dog training, PSD vs ESA"
      />
      <meta property="og:type" content="article" />
      <meta property="og:title" content="How to Train Your Dog to Be a Psychiatric Service Dog: Recognized Tasks & Requirements" />
      <meta property="og:description" content="A step-by-step legal and training guide to Psychiatric Service Dogs under the ADA — what tasks qualify, how self-training works, and what documentation can and can't do." />
      <meta property="og:url" content={CANONICAL} />
      <meta property="og:image" content="https://pawtenant.com/assets/lifestyle/woman-telehealth-with-dog.jpg" />
      <meta property="article:published_time" content="2026-07-08" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content="https://pawtenant.com/assets/lifestyle/woman-telehealth-with-dog.jpg" />
      <meta name="twitter:title" content="How to Train a Psychiatric Service Dog: Recognized Tasks & Requirements" />
      <meta name="twitter:description" content="What makes a dog a recognized PSD under the ADA, the tasks that qualify, and how self-training legally works." />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "BlogPosting",
                "@id": `${CANONICAL}#article`,
                headline: "How to Train Your Dog to Be a Psychiatric Service Dog: Recognized Tasks & Requirements",
                description: "A step-by-step legal and training guide for handlers working toward a Psychiatric Service Dog under federal law — recognized tasks, how self-training works, and what documentation can and can't do.",
                mainEntityOfPage: { "@type": "WebPage", "@id": CANONICAL },
                url: CANONICAL,
                image: ["https://pawtenant.com/assets/lifestyle/woman-telehealth-with-dog.jpg"],
                datePublished: "2026-07-08",
                dateModified: "2026-07-08",
                author: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                publisher: { "@type": "Organization", name: "PawTenant", url: "https://pawtenant.com" },
                articleSection: "PSD",
                keywords: topicChips.join(", "),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: "https://pawtenant.com/" },
                  { "@type": "ListItem", position: 2, name: "Blog", item: "https://pawtenant.com/blog" },
                  { "@type": "ListItem", position: 3, name: "How to Train a Psychiatric Service Dog", item: CANONICAL },
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
            <span className="text-gray-500">How to Train a Psychiatric Service Dog</span>
          </nav>
          <div className="flex flex-wrap gap-2 mb-5">
            {topicChips.map((chip) => (
              <span key={chip} className="text-[11px] font-semibold text-orange-600 bg-white border border-orange-200 rounded-full px-3 py-1 shadow-sm">{chip}</span>
            ))}
          </div>
          <h1 className="text-3xl md:text-[42px] font-extrabold text-gray-900 leading-tight mb-4">
            How to Train Your Dog to Be a Psychiatric Service Dog:{" "}
            <span className="text-orange-500">Recognized Tasks &amp; Requirements</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-6">
            <span className="inline-flex items-center gap-1.5"><i className="ri-calendar-line text-orange-400"></i> Published July 2026</span>
            <span className="inline-flex items-center gap-1.5"><i className="ri-time-line text-orange-400"></i> ~11 min read</span>
            <span className="inline-flex items-center gap-1.5"><i className="ri-user-line text-orange-400"></i> PawTenant Editorial — reviewed for accuracy</span>
          </div>

          <div className="rounded-2xl bg-white border border-orange-200 shadow-[0_18px_45px_-25px_rgba(122,78,45,0.35)] p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600 mb-2.5 flex items-center gap-2"><i className="ri-flashlight-line"></i> Quick answer</p>
            <p className="text-sm md:text-[15px] text-gray-700 leading-relaxed">
              A Psychiatric Service Dog earns its legal status through real, specific, trained tasks — not through
              paperwork speed, a vest, or a certificate. PSDs aren&apos;t subject to California&apos;s{" "}
              <Link to="/states/california-esa-psd-guide" className={inlineLink}>AB 468 30-day rule</Link>, but
              that&apos;s because a PSD is a different legal category defined by what the dog can actually
              <em> do</em> — not because a PSD letter is a quicker ESA letter.
            </p>
          </div>

          <figure className="mt-8">
            <img
              src="/assets/lifestyle/woman-telehealth-with-dog.jpg"
              alt="Handler working with their dog on a trained psychiatric service task at home"
              width={1400}
              height={1051}
              fetchPriority="high"
              decoding="async"
              className="w-full h-52 sm:h-80 md:h-[26rem] object-cover rounded-3xl border border-orange-100 shadow-[0_24px_60px_-30px_rgba(122,78,45,0.35)]"
            />
          </figure>

          <p className="text-xs text-gray-400 mt-4 leading-relaxed">
            This guide walks through what makes a dog a recognized PSD under the{" "}
            <a href="https://www.ada.gov/resources/service-animals-2010-requirements/" target="_blank" rel="noopener noreferrer" className={extLink}>
              Americans with Disabilities Act (ADA)
            </a>
            , the kinds of tasks that qualify, how self-training works, and what documentation can and can&apos;t do.
          </p>
        </div>
      </section>

      {/* ===== ARTICLE BODY ===== */}
      <article className="bg-white pb-4">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">

          <SectionHeading id="what-makes-a-psd">What Makes a Dog a Legally Recognized Psychiatric Service Dog?</SectionHeading>
          <Para>
            Under the ADA, a service animal is a dog that has been <strong className="text-gray-800">individually
            trained to perform specific tasks</strong> directly related to a person&apos;s disability. The task
            requirement is the entire legal foundation — not a vest, not a badge, not a letter. The U.S.
            Department of Justice, which enforces the ADA, is explicit that dogs whose sole function is to
            provide comfort by their presence don&apos;t qualify as service animals, no matter how much that
            comfort genuinely helps someone.
          </Para>
          <Para>This is the real dividing line between an ESA and a PSD:</Para>
          <ul className="list-disc pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li>An <strong className="text-gray-800">ESA</strong> provides support through companionship and presence. No training or specific task is required, and it&apos;s protected primarily under housing law (the Fair Housing Act and, in California, FEHA).</li>
            <li>A <strong className="text-gray-800">PSD</strong> is trained to take a specific, learned action in response to a specific trigger or need — grounding a handler during a panic attack, retrieving medication, or interrupting a harmful behavior pattern. Because it performs trained tasks, it&apos;s a service animal under the ADA, with the broader protections that come with that status, including housing, public access, and air travel.</li>
          </ul>
          <Para>
            That distinction matters practically, too. If a dog hasn&apos;t been trained to perform a task,
            calling it a PSD doesn&apos;t change what it legally is, and doing so risks running into state
            penalties for misrepresenting an animal as a service dog — California&apos;s are covered in the{" "}
            <Link to="/states/california-esa-psd-guide" className={inlineLink}>California ESA &amp; PSD guide</Link>,
            and Texas strengthened its own penalty in 2023 (see{" "}
            <Link to="/blog/texas-service-animal-laws-penalties" className={inlineLink}>Texas service animal laws &amp; penalties</Link>).
            The good news is that the training bar is genuinely achievable for a lot of handlers and a lot of
            dogs — it just takes real, deliberate work. If you&apos;re comparing the two documents, our{" "}
            <Link to="/esa-vs-psd-letter" className={inlineLink}>ESA vs PSD letter</Link> page lays them side by side.
          </Para>

          <SectionHeading id="qualifying-tasks">What Qualifies as a Recognized Psychiatric Service Dog Task?</SectionHeading>
          <Para>
            The ADA&apos;s test is simple to state and specific in practice: the dog must be trained to take a
            <strong className="text-gray-800"> specific action</strong> in response to a
            <strong className="text-gray-800"> specific cue or trigger</strong>, and that action must directly
            help manage the handler&apos;s disability. Here are some of the task categories most commonly trained
            for psychiatric disabilities:
          </Para>
          <div className="grid gap-3 sm:grid-cols-2 my-5">
            {taskCategories.map((t) => (
              <div key={t.title} className="bg-[#fafafa] border border-gray-100 rounded-xl p-4">
                <p className="text-[13px] font-bold text-gray-900 mb-1 flex items-start gap-2"><i className="ri-shield-star-line text-orange-500 mt-0.5"></i>{t.title}</p>
                <p className="text-xs text-gray-600 leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
          <Para>
            The throughline across all of these: each is a <strong className="text-gray-800">specific,
            trainable, repeatable behavior</strong>, tied to a <strong className="text-gray-800">specific
            trigger</strong>, that <strong className="text-gray-800">directly addresses</strong> an aspect of the
            handler&apos;s disability. If you&apos;re evaluating whether something your dog does qualifies, that
            three-part test is the one to apply.
          </Para>

          <SectionHeading id="training-pathway">The Step-by-Step Training Pathway</SectionHeading>
          <SubHeading>Self-training is legal</SubHeading>
          <Para>
            Under federal law, you are fully permitted to train your own service dog. The DOJ has been explicit
            that no professional certification or formal training program is legally required for public access
            or housing protections — requiring certification would raise costs and create barriers to access
            without a corresponding benefit. That said, self-training is a real, sustained undertaking. It
            typically involves:
          </Para>
          <ol className="list-decimal pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li><strong className="text-gray-800">Foundational obedience</strong> — rock-solid basics (sit, stay, down, loose-leash walking, reliable recall) before task training can be layered on top. Most trainers recommend this phase take several months minimum.</li>
            <li><strong className="text-gray-800">Task selection and shaping</strong> — identifying the one or two specific tasks that would genuinely help your disability, then breaking each into small trainable steps and building them up gradually, usually with positive reinforcement.</li>
            <li><strong className="text-gray-800">Proofing the task under real conditions</strong> — a task trained in a quiet living room needs to be reliable in the actual environments and states where you&apos;ll need it.</li>
            <li><strong className="text-gray-800">Public access training</strong> — layered in alongside or after task training.</li>
          </ol>
          <Para>
            Many handlers work with a professional trainer for part of this process, particularly for
            task-shaping, even while doing much of the day-to-day work themselves — and that&apos;s a valid
            hybrid approach, not just an all-or-nothing choice between full self-training and a $20,000+ program.
          </Para>

          <SubHeading>The public access standard</SubHeading>
          <Para>
            Task training is necessary but not sufficient. A service dog also needs to reliably meet a public
            access standard — the practical, observable behavior that lets it accompany you anywhere the public
            can go without disrupting the business or other patrons. That generally means the dog:
          </Para>
          <ul className="list-disc pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li>Is fully housebroken and won&apos;t eliminate indoors or in public without a signal.</li>
            <li>Remains under control at all times, whether on leash, harness, or through voice/signal commands.</li>
            <li>Doesn&apos;t solicit attention, sniff merchandise, or wander from your side.</li>
            <li>Can lie quietly under a table or chair for extended periods without disruption.</li>
            <li>Doesn&apos;t react to loud noises, other animals, food on the ground, or crowds.</li>
          </ul>
          <Para>
            This is where a lot of self-training washes out: task training and public manners are two separate
            skill sets, and both need real, tested reliability before a dog is ready to work in public. A dog
            that performs its task perfectly at home but barks at strangers in a grocery store isn&apos;t yet
            functioning as a reliable public-access service animal.
          </Para>

          <SubHeading>California-specific considerations</SubHeading>
          <Para>
            While the ADA governs public access nationwide, California residents should also be aware that the
            state&apos;s Civil Rights Department enforces the Fair Employment and Housing Act (FEHA), which
            extends comparable protections to housing and, in some cases, the workplace. California also carries
            specific civil and criminal penalties for misrepresenting an untrained pet as a service animal,
            layered on top of the federal framework — one more reason the task-training bar isn&apos;t optional
            or something to shortcut. The{" "}
            <Link to="/states/california-esa-psd-guide" className={inlineLink}>California ESA &amp; PSD guide</Link>{" "}
            covers those state rules, including AB 468, in detail.
          </Para>

          {/* ── Mid-article CTA ── */}
          <div className="my-10 rounded-2xl bg-[#fdf6ee] border border-orange-200 p-6 sm:p-7">
            <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2"><i className="ri-stethoscope-line text-orange-500"></i> Documenting the disability side of a PSD?</p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-4">
              A licensed mental health professional can evaluate whether PSD documentation is clinically
              appropriate for your situation. Documentation supports the <em>disability</em> side of the
              equation — the task training is separate, and it&apos;s the training that makes a dog a service
              animal. No outcome is guaranteed, and you get a refund if you don&apos;t qualify.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to={withAttribution("/psd-assessment")} className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm">
                <i className="ri-shield-star-line"></i> Start a PSD assessment
              </Link>
              <Link to="/how-to-get-psd-letter" className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors text-sm">
                <i className="ri-book-open-line"></i> PSD documentation guide
              </Link>
            </div>
          </div>

          <SectionHeading id="professional-trainer">Do You Need a Professional Trainer to Qualify for a PSD?</SectionHeading>
          <Para>
            No. As covered above, self-training is fully legal, and no professional certification is a
            prerequisite for ADA protections. What <em>is</em> required, regardless of who does the training, is
            that the dog actually reaches the standard: specific tasks, reliably performed, plus solid public
            access manners. There&apos;s no legal shortcut around that requirement, whether you train the dog
            yourself or hire help.
          </Para>

          <SectionHeading id="two-questions">The Two Questions Businesses and Landlords Can Ask</SectionHeading>
          <Para>
            When you bring a PSD into a public space, a rental unit, or onto an airline, staff may ask only two
            questions if your disability isn&apos;t obvious:
          </Para>
          <ol className="list-decimal pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li>Is the dog a service animal required because of a disability?</li>
            <li>What work or task has the dog been trained to perform?</li>
          </ol>
          <Para>
            They cannot ask about the nature of your disability, request medical documentation, require the dog
            to demonstrate the task on demand, or insist on a vest, ID card, or &quot;certification.&quot;
            Certification of service animals isn&apos;t a real legal category in the first place — no such
            national registry or certificate exists under the ADA. If a business or landlord is asking for more
            than these two questions, they&apos;re generally overstepping what federal law allows.
          </Para>

          <SectionHeading id="official-letter">Does an Official Letter Still Matter If Your Dog Is Self-Trained?</SectionHeading>
          <Para>
            This is worth being precise about, because it&apos;s easy to conflate two different things a letter
            can do. A letter from a licensed clinician <strong className="text-gray-800">cannot</strong> and does
            not need to certify your dog&apos;s training — no such certification exists, and no business or
            landlord can lawfully demand one. What a clinical letter <em>can</em> do is document that you have a
            diagnosed disability and that you&apos;re under a clinician&apos;s care — which is relevant in
            <strong className="text-gray-800"> housing</strong> contexts under the Fair Housing Act and FEHA,
            where landlords are permitted to request reliable documentation of a disability-related need for a
            reasonable accommodation.
          </Para>
          <Para>
            In other words: a clinical letter supports the <em>disability</em> side of the equation. It cannot
            substitute for the <em>task-training</em> side, and it shouldn&apos;t be sought as a way to fast-track
            calling an untrained or partially-trained dog a PSD. If your dog is still in training, the accurate
            and legally sound position is that you have a service-dog-in-training — a status the ADA also
            recognizes in many jurisdictions, including California — rather than treating documentation as the
            finish line. For how federal housing enforcement is evolving, our explainer on the{" "}
            <Link to="/blog/2026-hud-esa-guidelines" className={inlineLink}>2026 HUD ESA guidelines</Link>{" "}
            covers what changed and what didn&apos;t.
          </Para>

          <SectionHeading id="timeline">A Realistic Training Timeline</SectionHeading>
          <Para>
            There&apos;s no legally mandated timeline for training a PSD, unlike AB 468&apos;s fixed 30-day rule
            for ESA letters — but &quot;no waiting period&quot; doesn&apos;t mean &quot;fast.&quot; Most
            experienced trainers and handlers describe a realistic self-training arc along these lines:
          </Para>
          <ul className="list-disc pl-5 space-y-2 text-sm md:text-[15px] text-gray-600 leading-relaxed mb-4">
            <li><strong className="text-gray-800">Months 1–3: Foundational obedience.</strong> Reliable sit, stay, down, loose-leash walking, and recall, practiced in increasingly distracting environments.</li>
            <li><strong className="text-gray-800">Months 2–6 (overlapping): Task identification and shaping.</strong> Breaking a chosen task — say, Deep Pressure Therapy — into small steps: first rewarding any weight-shift toward the handler, then a partial lean, then a full, sustained lean on cue.</li>
            <li><strong className="text-gray-800">Months 4–9: Proofing under real conditions.</strong> Practicing the task in the actual settings and states where it will be needed, sometimes with a therapist or trusted person to safely simulate the state the dog needs to respond to.</li>
            <li><strong className="text-gray-800">Ongoing: Public access conditioning.</strong> Gradually exposing the dog to more complex public environments while maintaining obedience and task reliability.</li>
          </ul>
          <Para>
            The point isn&apos;t to hit a specific number of months — it&apos;s that a dog reaching genuine task
            and public-access reliability, whatever that takes, is what makes it a PSD. There&apos;s no version
            of this where documentation compresses that timeline.
          </Para>

          <SubHeading>A few quick questions handlers ask</SubHeading>
          <Para>
            <strong className="text-gray-800">Can any breed become a PSD?</strong> Yes. The ADA does not restrict
            service dog status by breed. Temperament, trainability, and size relative to the tasks needed matter
            more than breed for most psychiatric tasks. And a landlord cannot apply pet-related breed or weight
            restrictions to a genuinely task-trained service animal, the same way an HOA or landlord can&apos;t
            apply them to a wheelchair.
          </Para>
          <Para>
            <strong className="text-gray-800">What if my dog is still in training?</strong> Some jurisdictions,
            including California, extend certain protections to service dogs in training, though the scope is
            narrower than for a fully trained service animal — it&apos;s worth checking your state&apos;s specific
            statute. And if a business asks the two permitted questions and your honest answer is that the dog
            hasn&apos;t yet been trained to perform a specific task, that dog does not meet the ADA definition of
            a service animal at that point, regardless of any documentation you carry.
          </Para>

          <SectionHeading id="registration-mills">Avoiding Registration Mills and Fake Certificates</SectionHeading>
          <Para>
            One genuinely useful thing to know: any website selling an official-looking &quot;PSD
            certification,&quot; ID card, or registry entry as if it confers legal status is selling something
            with no legal weight. The ADA doesn&apos;t recognize registration or certification as a requirement,
            and landlords and businesses increasingly know to disregard these products. The only things that
            matter under federal law are (1) whether your dog has been individually trained to perform a specific
            task tied to your disability, and (2) for housing specifically, appropriate documentation of the
            disability itself from a licensed provider. Spending money on a certificate or vest doesn&apos;t
            advance either of those — consistent, real training does.
          </Para>

          <SectionHeading id="bottom-line">Bottom Line</SectionHeading>
          <Para>
            A Psychiatric Service Dog earns its legal status through real, specific, trained tasks — not through
            paperwork speed, a vest, or a certificate. If you&apos;re working toward a PSD, the honest and
            legally solid path is to invest in genuine task training and public access manners, whether you do
            that training yourself or with professional help, and to treat any clinical documentation as support
            for the disability side of your situation rather than a substitute for the dog&apos;s actual
            capability. That&apos;s also what protects you if your status is ever challenged — a dog that can
            actually do the job holds up.
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
          <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">Working toward a Psychiatric Service Dog?</h2>
          <p className="text-orange-50 text-sm md:text-base mb-6 max-w-2xl mx-auto">
            The training is the part that makes a dog a PSD. When you also need documentation of the underlying
            disability for housing, a licensed mental health professional can evaluate whether it&apos;s
            clinically appropriate — no outcome is guaranteed, and you get a refund if you don&apos;t qualify.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={withAttribution("/psd-assessment")} className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm shadow-sm">
              <i className="ri-shield-star-line"></i> Start a PSD assessment
            </Link>
            <Link to="/states/california-esa-psd-guide" className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3.5 bg-orange-400/30 text-white font-bold rounded-xl border border-white/40 hover:bg-orange-400/50 transition-colors text-sm">
              <i className="ri-map-pin-2-line"></i> California ESA & PSD guide
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
              { to: "/states/california-esa-psd-guide", icon: "ri-map-pin-2-line", label: "California ESA & PSD legal guide (AB 468)" },
              { to: "/states/san-francisco-hoa-psd-guide", icon: "ri-community-line", label: "San Francisco HOA & PSD accommodations" },
              { to: "/blog/2026-hud-esa-guidelines", icon: "ri-government-line", label: "2026 HUD ESA guidelines explained" },
              { to: "/esa-vs-psd-letter", icon: "ri-scales-3-line", label: "ESA vs PSD letter" },
              { to: "/how-to-get-psd-letter", icon: "ri-book-open-line", label: "How to get a PSD letter" },
              { to: "/all-about-service-dogs", icon: "ri-shield-star-line", label: "Psychiatric service dog overview" },
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
              A service dog&apos;s legal status comes from individual task training, not from a letter, a vest, an
              ID card, or any registration or certification — none of which is required or recognized under the
              ADA. PawTenant connects you with licensed mental health professionals who can document a disability
              where clinically appropriate; it does not train, certify, or register service animals, and it does
              not guarantee any landlord, HOA, airline, or business decision. For your specific situation, consult
              a qualified professional or your state agency.
            </p>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
