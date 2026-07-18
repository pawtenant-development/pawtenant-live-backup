import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
import PsdPricingSection from "../../components/feature/PsdPricingSection";
import EsaVsPsdCard from "../../components/feature/EsaVsPsdCard";
import AIAssistantTrustCard from "../../components/feature/AIAssistantTrustCard";
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

const PATH = "/psychiatric-service-dog-letter-online";
const TITLE = "Psychiatric Service Dog Letter Online | Licensed Provider | PawTenant";
const DESC =
  "Get a psychiatric service dog (PSD) letter online through a licensed mental health provider evaluation. Learn who qualifies, how it differs from an ESA, and the secure online process.";
const UPDATED_HUMAN = "June 28, 2026";
const UPDATED_ISO = "2026-06-28";

const heroBadges = [
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-computer-line", label: "Secure online process" },
  { icon: "ri-shield-check-line", label: "Signed PSD letter" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

const steps = [
  {
    icon: "ri-file-text-line",
    title: "Start the online assessment",
    desc: "Answer a short, confidential questionnaire about your mental health and how a trained dog supports you day to day. It takes about five minutes.",
  },
  {
    icon: "ri-stethoscope-line",
    title: "Meet a licensed provider",
    desc: "A licensed mental health professional reviews your answers and evaluates whether you have a qualifying psychiatric disability and trained tasks that fit a service dog.",
  },
  {
    icon: "ri-mail-send-line",
    title: "Receive your PSD letter",
    desc: "If you qualify, your provider issues a signed psychiatric service dog letter on letterhead with their license details — delivered securely by email.",
  },
];

const whoQualifies = [
  {
    icon: "ri-heart-pulse-line",
    title: "A qualifying psychiatric disability",
    desc: "A diagnosable condition — such as PTSD, severe anxiety, depression, bipolar disorder, or panic disorder — that substantially limits a major life activity, confirmed by a licensed provider.",
  },
  {
    icon: "ri-shield-star-line",
    title: "A task-trained dog",
    desc: "Your dog must be trained to perform specific tasks tied to your disability — like interrupting a panic attack, grounding during dissociation, or medication reminders. Comfort alone is an ESA, not a PSD.",
  },
  {
    icon: "ri-user-heart-line",
    title: "A real provider evaluation",
    desc: "Eligibility is decided by a licensed mental health professional after an actual evaluation — not by a website, a quiz, or a paid registration.",
  },
];

const whatItIsNot = [
  "An online \"registration,\" certificate, or ID card — none of these have legal weight or make a dog a service dog.",
  "A vest or tag bought online — gear does not create service-dog status.",
  "A guarantee of housing approval, airline access, or entry to any business.",
  "A substitute for actually training your dog to perform disability-related tasks.",
];

const faqs: FaqItem[] = [
  {
    q: "What is a psychiatric service dog letter?",
    a: "A psychiatric service dog (PSD) letter is a signed document from a licensed mental health professional confirming that you have a qualifying psychiatric disability and that a service dog trained to perform specific tasks supports your condition. It documents the provider's clinical evaluation — it does not train, certify, or register your dog.",
  },
  {
    q: "Can I get a PSD letter online?",
    a: "Yes. A licensed mental health professional can evaluate you by telehealth and, if you qualify, issue a PSD letter online. What makes the letter valid is a real evaluation by a provider licensed in your state — not the fact that it was issued online. Avoid any site that sells an instant \"PSD registration\" with no evaluation.",
  },
  {
    q: "Who qualifies for a psychiatric service dog letter?",
    a: "You may qualify if you have a psychiatric disability that substantially limits a major life activity and a dog that is trained to perform specific tasks related to that disability. A licensed provider decides eligibility after an evaluation. Comfort and companionship alone point to an emotional support animal (ESA), not a PSD.",
  },
  {
    q: "How is a PSD letter different from an ESA letter?",
    a: "An ESA letter supports a housing accommodation for an animal that provides comfort — no task training is required, and protections center on housing under the Fair Housing Act. A PSD letter is for a dog individually trained to perform tasks for a psychiatric disability, which can carry broader access depending on training and behavior. They are two different services with different requirements.",
  },
  {
    q: "Does my dog have to be certified or registered?",
    a: "No. There is no official certification or registration that makes a dog a service dog, and paid \"registries\" carry no legal weight. What matters is that your dog is trained to perform specific tasks for your disability. The PSD letter documents your clinical need; your dog's task training establishes its service-dog role.",
  },
  {
    q: "How much does a PSD letter cost and how long does it take?",
    a: "PawTenant's PSD letter is $129 for 1 dog, or a fixed $149 total covering 2 or 3 dogs — with standard delivery (2–3 business days) or a 24-hour priority option at the same price, plus an annual plan. Every plan includes a licensed provider review, and you're refunded if you don't qualify.",
  },
  {
    q: "Does a PSD letter guarantee housing or travel access?",
    a: "No. A PSD letter is supporting documentation from a licensed provider — it does not guarantee that a landlord, airline, or business will grant access. Housing providers must consider reasonable-accommodation requests, but decisions are made individually, and no service can promise an outcome.",
  },
];

export default function PsychiatricServiceDogLetterOnlinePage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema({
      name: "Psychiatric service dog (PSD) letter service",
      description:
        "Connects people with licensed mental health providers who can evaluate them and, when clinically appropriate, issue a psychiatric service dog (PSD) letter. Requires a qualifying disability and a task-trained dog. No guaranteed approval — eligibility depends on a provider's evaluation.",
    }),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "Psychiatric Service Dog Letter Online",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Psychiatric Service Dog Letter Online", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="psychiatric service dog letter online, PSD letter online, service dog letter for psychiatric disability, online PSD letter from licensed therapist, psychiatric service dog letter"
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
                <i className="ri-shield-star-line"></i>
                Psychiatric service dog letter
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                Psychiatric Service Dog Letter Online
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                A PSD letter is signed by a licensed mental health professional after a real
                evaluation. Here&rsquo;s who qualifies, how a psychiatric service dog letter differs
                from an ESA, and how PawTenant&rsquo;s secure online process works.
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
                  Start PSD Assessment
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  How It Works
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/psd/man-working-holding-dog.jpg"
                  alt="A person at home with their trained psychiatric service dog after an online provider evaluation"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-user-star-line text-[#4A8472]"></i>
                <span className="text-[11px] font-bold text-gray-700">Licensed provider review</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="Can you get a psychiatric service dog letter online?">
            <p>
              Yes. A <strong>licensed mental health professional</strong> can evaluate you online
              and, if you qualify, issue a <strong>psychiatric service dog (PSD) letter</strong>.
              What makes it valid is a real evaluation by a provider licensed in your state — not
              the fact that it was issued online.
            </p>
            <p>
              A PSD is for people with a <strong>qualifying psychiatric disability</strong> whose{" "}
              <strong>dog is trained to perform specific tasks</strong> related to that disability.
              There is <strong>no official registration or certificate</strong> — paid registries
              carry no legal weight, and eligibility depends on the provider&rsquo;s evaluation.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              The process
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              How to get a PSD letter online
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              Three steps, all online, with a licensed mental health professional making the call.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {steps.map((step, i) => (
              <div key={step.title} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg">
                    <i className={`${step.icon} text-orange-500 text-xl`}></i>
                  </div>
                  <span className="text-[11px] font-bold text-orange-300">0{i + 1}</span>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{step.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHO QUALIFIES */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Eligibility
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Who qualifies for a psychiatric service dog letter
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {whoQualifies.map((item) => (
              <div key={item.title} className="bg-[#fafafa] rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-white rounded-lg mb-3 ring-1 ring-gray-100">
                  <i className={`${item.icon} text-[#4A8472] text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[13px] text-gray-500 mt-7 max-w-2xl mx-auto leading-relaxed">
            See the full breakdown in{" "}
            <Link to="/psd-letter-requirements" className="text-orange-600 font-semibold hover:underline">
              PSD letter requirements
            </Link>
            .
          </p>
        </div>
      </section>

      {/* WHAT IT IS NOT */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-8">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Avoid the scams
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What a PSD letter is not
            </h2>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <ul className="space-y-3">
              {whatItIsNot.map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <i className="ri-close-circle-line text-slate-400 mt-0.5 flex-shrink-0"></i>
                  <span className="text-gray-700 text-sm leading-relaxed">{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-center text-[13px] text-gray-500 mt-6 max-w-2xl mx-auto leading-relaxed">
            More on this in{" "}
            <Link to="/blog/psd-letter-vs-service-dog-certificate" className="text-orange-600 font-semibold hover:underline">
              PSD letter vs service dog certificate
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ESA vs PSD card */}
      <EsaVsPsdCard className="bg-white" />

      {/* LIFESTYLE */}
      <LifestyleImageSection
        reverse
        className="bg-[#fdf6ee]"
        image="/assets/lifestyle/woman-telehealth-with-dog.jpg"
        alt="A renter meeting a licensed mental health provider by telehealth about a psychiatric service dog letter"
        eyebrow="Calm, private, online"
        heading="A real evaluation, from home"
        body="The whole process happens online with a licensed mental health professional. They review your situation, confirm whether you have a qualifying disability and trained tasks, and — if a PSD fits — issue a signed letter you can use as supporting documentation."
        bullets={[
          "Eligibility decided by a licensed provider.",
          "Signed letter with the provider's license details.",
          "Refund if you don't qualify.",
        ]}
      />

      {/* PRICING — 3-card PSD plans + payment trust strip */}
      <PsdPricingSection className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="Psychiatric service dog letter FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* AI ASSISTANT TRUST CARD */}
      <AIAssistantTrustCard
        pageUrl="/psychiatric-service-dog-letter-online"
        topic="psychiatric service dog letters"
        serviceType="psd"
        ctaHref={withAttribution("/psd-assessment")}
        ctaLabel="Start PSD Evaluation"
        className="bg-white border-t border-gray-100"
      />

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            See if a PSD letter is right for you
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Start the online assessment. A licensed mental health professional reviews your answers
            and, if you qualify, issues a signed psychiatric service dog letter — with a refund if
            you don&rsquo;t qualify.
          </p>
          <Link
            to={withAttribution("/psd-assessment")}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 sm:px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[15px] sm:text-base shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
          >
            <i className="ri-stethoscope-line"></i>
            Start PSD Assessment
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
              { to: "/psd-letter-requirements", title: "PSD letter requirements", desc: "What you need to qualify — disability, trained tasks, and provider review." },
              { to: "/psd-letter-for-apartments", title: "PSD letter for apartments", desc: "Using a psychiatric service dog letter for a housing request." },
              { to: "/esa-vs-psd-letter", title: "ESA vs PSD letter", desc: "Which document fits your situation — a clear comparison." },
              { to: "/do-you-need-a-psd-letter-for-a-service-dog", title: "Do you need a PSD letter?", desc: "When documentation helps for a psychiatric service dog." },
              { to: "/can-a-landlord-deny-a-psd-letter", title: "Can a landlord deny a PSD letter?", desc: "What landlords can verify — and what they can't simply reject." },
              { to: "/how-to-get-psd-letter", title: "How to get a PSD letter", desc: "The full psychiatric service dog evaluation guide." },
              { to: "/esa-psd-registry-vs-letter", title: "Registry vs letter", desc: "Why a PSD registry, certificate, or ID isn't provider-reviewed documentation." },
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
