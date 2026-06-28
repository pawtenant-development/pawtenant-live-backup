import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
import PsdPricingMini from "../../components/feature/PsdPricingMini";
import EsaVsPsdCard from "../../components/feature/EsaVsPsdCard";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import {
  AIAnswerBox,
  TrustBadgeRow,
  SeoFaqSection,
  RelatedResources,
  LastUpdated,
  EducationalDisclaimer,
  LifestyleImageSection,
  JsonLd,
} from "../../components/feature/SeoKit";
import {
  graph,
  organizationSchema,
  serviceSchema,
  articleSchema,
  webPageSchema,
  faqSchema,
  breadcrumbSchema,
  type FaqItem,
} from "@/lib/seoSchema";

const PATH = "/psd-letter-requirements";
const TITLE = "PSD Letter Requirements: What You Need to Know | PawTenant";
const DESC =
  "PSD letter requirements explained: a qualifying psychiatric disability, a task-trained dog, a licensed provider evaluation, and what documentation can and can't do.";
const UPDATED_HUMAN = "June 28, 2026";
const UPDATED_ISO = "2026-06-28";

const heroBadges = [
  { icon: "ri-list-check-2", label: "Clear eligibility" },
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-shield-star-line", label: "Task-trained dog" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

const requirements = [
  {
    icon: "ri-heart-pulse-line",
    title: "A qualifying psychiatric disability",
    desc: "You have a diagnosable mental health condition that substantially limits one or more major life activities — for example PTSD, severe anxiety, major depression, bipolar disorder, OCD, or panic disorder.",
  },
  {
    icon: "ri-shield-star-line",
    title: "A dog trained to perform tasks",
    desc: "Your dog is trained to perform specific tasks directly tied to your disability — interrupting a panic attack, grounding during dissociation, room checks, or medication reminders. Comfort alone makes a dog an ESA, not a PSD.",
  },
  {
    icon: "ri-user-heart-line",
    title: "A licensed provider evaluation",
    desc: "A mental health professional licensed in your state evaluates you and decides whether a psychiatric service dog is clinically appropriate. The PSD letter documents that determination.",
  },
  {
    icon: "ri-quill-pen-line",
    title: "A properly written letter",
    desc: "The letter is signed, on the provider's letterhead, names their license type and number, and states your disability-related need — without disclosing your specific diagnosis.",
  },
];

const taskExamples = [
  { icon: "ri-heart-pulse-line", title: "Panic attack response", desc: "Recognizing early signs and performing trained calming behaviors." },
  { icon: "ri-shield-line", title: "Grounding / deep pressure", desc: "Applying tactile pressure to interrupt dissociation or a flashback." },
  { icon: "ri-alarm-line", title: "Medication reminders", desc: "Alerting the handler to take medication on schedule." },
  { icon: "ri-eye-line", title: "Room checks", desc: "Checking a space before entry for handlers with hypervigilance." },
];

const limits = [
  "A PSD letter does not train, certify, or register your dog — there is no official service-dog registry.",
  "It does not guarantee housing approval, airline access, or entry to any business.",
  "It is not a diagnosis you can buy — a licensed provider decides eligibility after a real evaluation.",
  "A letter alone isn't enough: your dog still has to be trained to perform disability-related tasks.",
];

const faqs: FaqItem[] = [
  {
    q: "What are the requirements for a PSD letter?",
    a: "Three things: a qualifying psychiatric disability that substantially limits a major life activity, a dog trained to perform specific tasks related to that disability, and a licensed mental health provider who evaluates you and determines a psychiatric service dog is appropriate. The letter then documents that clinical determination.",
  },
  {
    q: "How do I qualify for a psychiatric service dog letter?",
    a: "You qualify when a licensed provider confirms you have a qualifying psychiatric disability and your dog is trained (or being trained) to perform tasks that mitigate it. Eligibility is a clinical decision — it can't be self-certified, and no quiz or registry can grant it.",
  },
  {
    q: "What conditions can qualify for a PSD?",
    a: "Any recognized psychiatric condition that substantially limits a major life activity may qualify — common examples include PTSD, generalized or social anxiety, major depression, bipolar disorder, panic disorder, and OCD. The condition alone isn't enough; the dog must also be trained to perform specific tasks for it, and a licensed provider makes the determination.",
  },
  {
    q: "Does my dog need to be professionally trained or certified?",
    a: "No. There is no required certification or professional-training program, and paid registries carry no legal weight. Your dog can be owner-trained. What matters is that the dog reliably performs specific tasks tied to your disability.",
  },
  {
    q: "What's the difference between the task requirement for a PSD and an ESA?",
    a: "This is the core difference. An emotional support animal provides comfort through its presence and needs no task training. A psychiatric service dog must be trained to perform specific tasks that mitigate a disability. If your animal only provides comfort, an ESA letter is the right document.",
  },
  {
    q: "Can a licensed provider issue a PSD letter online?",
    a: "Yes. A provider licensed in your state can evaluate you by telehealth and issue a PSD letter if you meet the requirements. The online format doesn't change the requirements — a real evaluation and a task-trained dog are still needed.",
  },
  {
    q: "What if I don't meet the PSD requirements?",
    a: "If a psychiatric service dog isn't the right fit, you may still qualify for an emotional support animal letter for housing, which has no task-training requirement. A licensed provider can help identify which documentation matches your situation, and you're refunded if you don't qualify.",
  },
];

export default function PsdLetterRequirementsPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema({
      name: "Psychiatric service dog (PSD) letter service",
      description:
        "Connects people with licensed mental health providers who can evaluate them and, when clinically appropriate, issue a psychiatric service dog letter. Requires a qualifying disability and a task-trained dog. No guaranteed approval.",
    }),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "PSD Letter Requirements: What You Need to Know",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "PSD Letter Requirements", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="PSD letter requirements, psychiatric service dog letter requirements, service dog documentation requirements, how to qualify for a PSD letter, psychiatric service dog qualifications"
      />
      <meta property="og:type" content="article" />
      <meta property="og:image" content="https://pawtenant.com/assets/brand/og-default.jpg" />
      <meta name="twitter:card" content="summary_large_image" />
      <JsonLd data={schema} />

      <SharedNavbar />

      {/* HERO */}
      <section className="relative pt-24 sm:pt-28 pb-12 sm:pb-16 bg-gradient-to-br from-[#fdf6ee] via-white to-orange-50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-9 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 bg-white border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
                <i className="ri-list-check-2"></i>
                PSD letter requirements
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                PSD Letter Requirements: What You Need to Know
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                A psychiatric service dog letter has real requirements — a qualifying disability, a
                task-trained dog, and a licensed provider&rsquo;s evaluation. Here&rsquo;s exactly
                what you need and the safe next steps.
              </p>
              <div className="flex justify-center lg:justify-start mb-6">
                <TrustBadgeRow badges={heroBadges} mobileCount={3} />
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
                <Link
                  to={withAttribution("/psd-assessment")}
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
                >
                  <i className="ri-stethoscope-line"></i>
                  Check If You Qualify
                </Link>
                <a
                  href="#requirements"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  See Requirements
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/owner-with-dog-laptop.jpg"
                  alt="A person reviewing psychiatric service dog letter requirements at home with their dog"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-shield-check-line text-[#4A8472]"></i>
                <span className="text-[11px] font-bold text-gray-700">Clinical eligibility</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="What are the requirements for a PSD letter?">
            <p>
              A psychiatric service dog letter requires three things: a{" "}
              <strong>qualifying psychiatric disability</strong> that substantially limits a major
              life activity, a <strong>dog trained to perform specific tasks</strong> related to that
              disability, and a <strong>licensed mental health provider</strong> who evaluates you and
              determines a PSD is appropriate.
            </p>
            <p>
              The letter <strong>documents</strong> that clinical determination — it does{" "}
              <strong>not train, certify, or register</strong> your dog, and eligibility{" "}
              <strong>can&rsquo;t be self-certified</strong> or bought from a registry.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* REQUIREMENTS */}
      <section id="requirements" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              The checklist
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              The four PSD letter requirements
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {requirements.map((item, i) => (
              <div key={item.title} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg">
                    <i className={`${item.icon} text-orange-500 text-xl`}></i>
                  </div>
                  <span className="text-[11px] font-bold text-orange-300">0{i + 1}</span>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TASK EXAMPLES */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              The task requirement
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Examples of trained psychiatric tasks
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              The task doesn&rsquo;t have to be complex — it has to be trained and tied to your
              disability. This is what separates a PSD from an emotional support animal.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {taskExamples.map((t) => (
              <div key={t.title} className="bg-[#fafafa] rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-white rounded-lg mb-3 ring-1 ring-gray-100">
                  <i className={`${t.icon} text-[#4A8472] text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{t.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LIMITS */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-8">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              What it can&rsquo;t do
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              The limits of a PSD letter
            </h2>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <ul className="space-y-3">
              {limits.map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <i className="ri-error-warning-line text-slate-400 mt-0.5 flex-shrink-0"></i>
                  <span className="text-gray-700 text-sm leading-relaxed">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ESA vs PSD card */}
      <EsaVsPsdCard className="bg-white" />

      {/* LIFESTYLE */}
      <LifestyleImageSection
        reverse
        className="bg-[#fdf6ee]"
        image="/assets/lifestyle/woman-telehealth-with-dog.jpg"
        alt="A licensed provider evaluating PSD eligibility by telehealth"
        eyebrow="Eligibility is a clinical decision"
        heading="A licensed provider decides — not a website"
        body="You can't buy your way into a psychiatric service dog letter. A licensed mental health professional evaluates whether you meet the requirements and only issues a letter when a PSD is clinically appropriate. If it isn't, they'll help you understand your options."
        bullets={[
          "Real evaluation by a state-licensed provider.",
          "No diagnosis disclosed in the letter itself.",
          "Refund if you don't qualify.",
        ]}
      />

      {/* PRICING */}
      <PsdPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="PSD letter requirements FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Find out if you meet the requirements
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Start the online assessment. A licensed mental health professional reviews your answers
            and tells you whether a psychiatric service dog letter is the right fit — with a refund if
            you don&rsquo;t qualify.
          </p>
          <Link
            to={withAttribution("/psd-assessment")}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 sm:px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[15px] sm:text-base shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
          >
            <i className="ri-stethoscope-line"></i>
            Check If You Qualify
          </Link>
          <div className="mt-5">
            <LastUpdated date={UPDATED_HUMAN} />
          </div>
        </div>
      </section>

      {/* RELATED */}
      <section className="py-14 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <RelatedResources
            links={[
              { to: "/psychiatric-service-dog-letter-online", title: "Psychiatric service dog letter online", desc: "How the online PSD evaluation and letter work." },
              { to: "/psd-letter-for-apartments", title: "PSD letter for apartments", desc: "Using a PSD letter for a housing request." },
              { to: "/esa-vs-psd-letter", title: "ESA vs PSD letter", desc: "Which document fits your situation." },
              { to: "/do-you-need-a-psd-letter-for-a-service-dog", title: "Do you need a PSD letter?", desc: "When documentation helps for a service dog." },
              { to: "/blog/psd-letter-for-anxiety", title: "Can you get a PSD letter for anxiety?", desc: "When anxiety may meet the disability and task requirements." },
              { to: "/how-to-get-psd-letter", title: "How to get a PSD letter", desc: "The full psychiatric service dog evaluation guide." },
            ]}
          />
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="py-10 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <EducationalDisclaimer />
        </div>
      </section>

      <SharedFooter />
      <MobileStickyApplyCTA
        to="/psd-assessment"
        label="Start PSD Assessment"
        icon="ri-stethoscope-line"
      />
    </main>
  );
}
