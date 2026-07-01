import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
import AIAssistantTrustCard from "../../components/feature/AIAssistantTrustCard";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import {
  AIAnswerBox,
  TrustBadgeRow,
  SeoFaqSection,
  RelatedResources,
  LastUpdated,
  EducationalDisclaimer,
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

const PATH = "/esa-vs-psd-letter";
const TITLE = "ESA Letter vs PSD Letter: What's the Difference? | PawTenant";
const DESC =
  "ESA letter vs PSD letter compared: emotional support animal vs psychiatric service dog, what each covers for housing, the task-training rule, and how to choose.";
const UPDATED_HUMAN = "June 28, 2026";
const UPDATED_ISO = "2026-06-28";

const heroBadges = [
  { icon: "ri-scales-3-line", label: "Side-by-side" },
  { icon: "ri-home-heart-line", label: "Housing covered" },
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

const compareRows = [
  { criterion: "What it is", esa: "An emotional support animal that provides comfort through its presence.", psd: "A dog individually trained to perform tasks for a psychiatric disability." },
  { criterion: "Task training", esa: "Not required — comfort and companionship are the role.", psd: "Required — the dog must perform specific disability-related tasks." },
  { criterion: "Main legal framing", esa: "Fair Housing Act (housing accommodation).", psd: "ADA (service animal) plus Fair Housing Act for housing." },
  { criterion: "Housing", esa: "Supports a reasonable-accommodation request in no-pet housing.", psd: "Also supports a housing accommodation request." },
  { criterion: "Public access", esa: "No general public-access right.", psd: "Broader access potential where trained and well-behaved — not guaranteed." },
  { criterion: "Eligible animals", esa: "Most domesticated animals (commonly dogs and cats).", psd: "Dogs only." },
  { criterion: "Who decides", esa: "A licensed mental health provider after an evaluation.", psd: "A licensed mental health provider after an evaluation." },
];

const chooseEsa = [
  "Your animal helps mainly through comfort and companionship.",
  "Your goal is keeping your animal in no-pet or pet-restricted housing.",
  "Your animal isn't trained to perform specific disability-related tasks.",
  "You'd like the simpler housing-focused document.",
];
const choosePsd = [
  "You have a qualifying psychiatric disability that limits a major life activity.",
  "Your dog is trained (or being trained) to perform specific tasks for it.",
  "You want documentation that reflects a service dog, not a comfort animal.",
  "You may need access beyond housing in some settings.",
];

const faqs: FaqItem[] = [
  {
    q: "What is the difference between an ESA letter and a PSD letter?",
    a: "An ESA (emotional support animal) letter supports an animal that provides comfort through its presence — no task training is required, and its protections center on housing under the Fair Housing Act. A PSD (psychiatric service dog) letter is for a dog individually trained to perform specific tasks for a psychiatric disability, which can carry broader access under the ADA. The deciding line is task training.",
  },
  {
    q: "Is a psychiatric service dog the same as an emotional support animal?",
    a: "No. An emotional support animal helps simply by being present and needs no special training. A psychiatric service dog is trained to perform specific tasks that mitigate a disability — like interrupting a panic attack or grounding during dissociation. They are two different categories with different rights and requirements.",
  },
  {
    q: "Do I need an ESA letter or a PSD letter for housing?",
    a: "For housing alone, an ESA letter is often the simpler fit because it has no task-training requirement. A PSD letter also supports a housing accommodation, and it's the right choice when you have a qualifying disability and a task-trained dog. Both are reasonable-accommodation documents under the Fair Housing Act; a licensed provider can help you choose.",
  },
  {
    q: "Which is better, an ESA or a PSD?",
    a: "Neither is \"better\" — they fit different situations. If your animal helps through comfort, an ESA is appropriate. If you have a psychiatric disability and a dog trained to perform tasks for it, a PSD fits and offers broader access potential. The right choice depends on your needs and is confirmed during a licensed provider's evaluation.",
  },
  {
    q: "Can I switch from an ESA to a PSD?",
    a: "If your situation changes — for example, your dog is trained to perform disability-related tasks and you have a qualifying disability — a licensed provider can evaluate you for a PSD. It isn't an automatic upgrade; it requires meeting the PSD requirements, including the task-training element.",
  },
  {
    q: "Does either letter guarantee my landlord will say yes?",
    a: "No. A landlord must consider a reasonable-accommodation request supported by valid documentation, whether ESA or PSD, but no service can guarantee approval. Requests can be denied in limited, individualized circumstances. Decisions are always made case by case.",
  },
  {
    q: "Can the same condition qualify for either an ESA or a PSD?",
    a: "Yes. The same underlying condition can support an ESA or a PSD — the difference is the animal's role. If the animal provides comfort, it's an ESA. If the dog is trained to perform specific tasks for the disability, it can be a PSD. A licensed provider determines which is clinically appropriate.",
  },
];

export default function EsaVsPsdLetterPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "ESA Letter vs PSD Letter: What's the Difference?",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "ESA Letter vs PSD Letter", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="ESA vs PSD letter, emotional support animal vs psychiatric service dog, ESA letter vs service dog letter, PSD vs ESA for housing, difference between ESA and PSD"
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
                <i className="ri-scales-3-line"></i>
                ESA vs PSD
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                ESA Letter vs PSD Letter: What&rsquo;s the Difference?
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                Both come from a licensed provider, but they cover different things. An ESA is a
                comfort animal for housing; a PSD is a task-trained service dog for a psychiatric
                disability. Here&rsquo;s a clear side-by-side so you can choose.
              </p>
              <div className="flex justify-center lg:justify-start mb-6">
                <TrustBadgeRow badges={heroBadges} mobileCount={3} />
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
                <a
                  href="#compare"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
                >
                  <i className="ri-table-line"></i>
                  See the Comparison
                </a>
                <a
                  href="#choose"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-guide-line"></i>
                  Which One Fits Me?
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/esa-owner-dog-apartment.jpg"
                  alt="A renter comparing an ESA letter and a PSD letter with their dog at home"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-scales-3-line text-[#4A8472]"></i>
                <span className="text-[11px] font-bold text-gray-700">Two different documents</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="What's the difference between an ESA letter and a PSD letter?">
            <p>
              An <strong>ESA (emotional support animal) letter</strong> supports an animal that helps
              through <strong>comfort and companionship</strong> — no task training is required, and
              its protections center on <strong>housing</strong> under the Fair Housing Act.
            </p>
            <p>
              A <strong>PSD (psychiatric service dog) letter</strong> is for a dog{" "}
              <strong>individually trained to perform specific tasks</strong> for a psychiatric
              disability, which can carry <strong>broader access</strong> under the ADA. The deciding
              line is <strong>task training</strong> — comfort points to an ESA, trained tasks point
              to a PSD. A licensed provider confirms which fits.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* COMPARISON TABLE */}
      <section id="compare" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Side by side
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              ESA letter vs PSD letter, compared
            </h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-wide text-gray-500"> </th>
                  <th className="px-5 py-4 text-sm font-bold text-orange-600">
                    <span className="inline-flex items-center gap-1.5"><i className="ri-home-heart-line"></i> ESA letter</span>
                  </th>
                  <th className="px-5 py-4 text-sm font-bold text-[#4A8472]">
                    <span className="inline-flex items-center gap-1.5"><i className="ri-shield-star-line"></i> PSD letter</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {compareRows.map((row) => (
                  <tr key={row.criterion} className="align-top">
                    <td className="px-5 py-4 text-sm font-bold text-gray-900 w-40">{row.criterion}</td>
                    <td className="px-5 py-4 text-[13px] text-gray-600 leading-relaxed">{row.esa}</td>
                    <td className="px-5 py-4 text-[13px] text-gray-600 leading-relaxed">{row.psd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-center text-[12px] text-gray-400 mt-4">
            General information — access and outcomes depend on training, behavior, and individual
            review. No outcome is guaranteed.
          </p>
        </div>
      </section>

      {/* WHICH ONE — ROUTING */}
      <section id="choose" className="scroll-mt-24 py-14 sm:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Which one fits you?
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              How to choose between an ESA and a PSD
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ESA */}
            <div className="bg-[#fafafa] rounded-2xl border border-orange-100 p-6 flex flex-col">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-9 h-9 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center flex-shrink-0">
                  <i className="ri-home-heart-line text-lg"></i>
                </span>
                <h3 className="text-base font-bold text-gray-900">Choose an ESA letter if…</h3>
              </div>
              <ul className="space-y-2.5 flex-1">
                {chooseEsa.map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <i className="ri-check-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                    <span className="text-gray-700 text-sm leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
              <Link
                to={withAttribution("/assessment")}
                className="mt-5 whitespace-nowrap inline-flex items-center justify-center gap-2 w-full py-3 bg-orange-500 text-white text-sm font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                <i className="ri-file-text-line"></i> Start ESA Assessment
              </Link>
            </div>
            {/* PSD */}
            <div className="bg-[#fafafa] rounded-2xl border border-[#4A8472]/30 p-6 flex flex-col">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-9 h-9 rounded-lg bg-[#4A8472]/15 text-[#4A8472] flex items-center justify-center flex-shrink-0">
                  <i className="ri-shield-star-line text-lg"></i>
                </span>
                <h3 className="text-base font-bold text-gray-900">Choose a PSD letter if…</h3>
              </div>
              <ul className="space-y-2.5 flex-1">
                {choosePsd.map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <i className="ri-check-line text-[#4A8472] mt-0.5 flex-shrink-0"></i>
                    <span className="text-gray-700 text-sm leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
              <Link
                to={withAttribution("/psd-assessment")}
                className="mt-5 whitespace-nowrap inline-flex items-center justify-center gap-2 w-full py-3 bg-[#4A8472] text-white text-sm font-bold rounded-md hover:bg-[#3F7061] transition-colors cursor-pointer"
              >
                <i className="ri-stethoscope-line"></i> Start PSD Assessment
              </Link>
            </div>
          </div>
          <p className="text-center text-[13px] text-gray-500 mt-7 max-w-2xl mx-auto leading-relaxed">
            Still unsure? A licensed provider confirms which fits during your evaluation — and
            you&rsquo;re refunded if you don&rsquo;t qualify for either.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="ESA vs PSD letter FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* AI ASSISTANT TRUST CARD */}
      <AIAssistantTrustCard
        pageUrl="/esa-vs-psd-letter"
        topic="the difference between an ESA letter and a PSD letter"
        serviceType="comparison"
        ctaHref={withAttribution("/assessment")}
        ctaLabel="Start ESA Evaluation"
        secondaryCtaHref={withAttribution("/psd-assessment")}
        secondaryCtaLabel="Start PSD Evaluation"
        className="bg-white border-t border-gray-100"
      />

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Not sure which one you need?
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Start with the path that sounds closest. A licensed mental health professional reviews
            your situation and confirms whether an ESA or a PSD fits — with a refund if you
            don&rsquo;t qualify.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to={withAttribution("/assessment")}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[15px]"
            >
              <i className="ri-file-text-line"></i> ESA Assessment
            </Link>
            <Link
              to={withAttribution("/psd-assessment")}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 bg-[#4A8472] text-white font-bold rounded-md hover:bg-[#3F7061] transition-colors cursor-pointer text-[15px]"
            >
              <i className="ri-stethoscope-line"></i> PSD Assessment
            </Link>
          </div>
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
              { to: "/psd-letter-requirements", title: "PSD letter requirements", desc: "What you need to qualify for a PSD letter." },
              { to: "/psd-letter-for-apartments", title: "PSD letter for apartments", desc: "Using a PSD letter for a housing request." },
              { to: "/esa-letter-for-apartments", title: "ESA letter for apartments", desc: "The housing route for a comfort animal." },
              { to: "/do-you-need-a-psd-letter-for-a-service-dog", title: "Do you need a PSD letter?", desc: "When documentation helps for a service dog." },
              { to: "/how-to-get-psd-letter", title: "How to get a PSD letter", desc: "The full psychiatric service dog evaluation guide." },
              { to: "/esa-psd-registry-vs-letter", title: "Registry vs letter", desc: "Why a registry, certificate, or ID isn't a provider-reviewed letter." },
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
