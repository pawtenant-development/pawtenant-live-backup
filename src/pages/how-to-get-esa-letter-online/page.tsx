import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import Hud2026UpdateBanner from "../../components/feature/Hud2026UpdateBanner";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
import SampleLetterCard from "../../components/feature/SampleLetterCard";
import EsaPricingMini from "../../components/feature/EsaPricingMini";
import AIAssistantTrustCard from "../../components/feature/AIAssistantTrustCard";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import {
  AIAnswerBox,
  TrustBadgeRow,
  SeoFaqSection,
  RelatedResources,
  LastUpdated,
  EducationalDisclaimer,
  PsdCrossLink,
  LifestyleImageSection,
  VeteransSupportSection,
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

const PATH = "/how-to-get-esa-letter-online";
const TITLE = "How to Get an ESA Letter Online (2026 Step-by-Step) | PawTenant";
const DESC =
  "How to get an ESA letter online in 4 steps: complete a short assessment, get reviewed by a licensed provider, receive your letter if appropriate, and use it for housing.";
const UPDATED_HUMAN = "June 5, 2026";
const UPDATED_ISO = "2026-06-05";

const heroBadges = [
  { icon: "ri-time-line", label: "Assessment in ~5 minutes" },
  { icon: "ri-user-star-line", label: "Licensed provider review" },
  { icon: "ri-shield-check-line", label: "HIPAA-secure intake" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

const steps = [
  {
    icon: "ri-edit-line",
    title: "Step 1 — Complete the assessment",
    desc: "Answer a short, private questionnaire about your situation. It takes about five minutes on your phone and helps a provider understand whether an emotional support animal may be appropriate for you.",
  },
  {
    icon: "ri-stethoscope-line",
    title: "Step 2 — Licensed provider review",
    desc: "A mental health provider licensed in your state reviews your assessment and applies clinical judgment. This is a real evaluation — not an automatic approval. If the provider needs more information, they may follow up.",
  },
  {
    icon: "ri-mail-check-line",
    title: "Step 3 — Receive your letter (if appropriate)",
    desc: "If the provider determines an ESA is clinically appropriate, you receive a letter on official letterhead with the provider's name, license number, and signature — typically delivered digitally. If you don't qualify, you're refunded.",
  },
  {
    icon: "ri-home-heart-line",
    title: "Step 4 — Use it for a housing accommodation",
    desc: "Submit your letter with a reasonable-accommodation request to your landlord or property manager. Keep a dated copy. A PawTenant letter also includes a Verification ID a landlord can confirm online.",
  },
];

const landlordsLookFor = [
  "A letter from a provider licensed in your state, with their license number and signature.",
  "Confirmation that you have a disability-related need the animal helps with — without requiring your full medical records.",
  "A current letter (most landlords expect documentation issued within the past 12 months).",
  "A way to confirm the letter is authentic, such as a verification ID or the provider's license on a public registry.",
];

const invalidSigns = [
  "\"Instant\" or \"guaranteed\" letters issued with no evaluation.",
  "An ESA \"registration,\" certificate, ID card, or vest sold as if it were legally required.",
  "No named, state-licensed provider on the document.",
  "Claims that the letter grants airline or public-access rights (it does not — that's a trained service dog under the ADA).",
];

const faqs: FaqItem[] = [
  {
    q: "How do I get an ESA letter online?",
    a: "Complete a short assessment, get reviewed by a mental health provider licensed in your state, and — if the provider determines an ESA is clinically appropriate — receive your letter, usually digitally. You then submit it to your landlord with a reasonable-accommodation request. With PawTenant, you're only charged if you qualify.",
  },
  {
    q: "How long does it take to get an ESA letter online?",
    a: "The assessment itself takes about five minutes. A licensed provider typically reviews each case within 24 hours, and if you qualify you usually receive your letter the same day. Some states (such as California and Iowa) require a 30-day provider relationship before a letter can be issued.",
  },
  {
    q: "Is an online ESA letter valid?",
    a: "Yes, when a provider licensed in your state completes a genuine evaluation. Telehealth is a recognized way to deliver care. What makes a letter valid is the licensed provider and the real clinical process — not whether the visit happened online or in an office.",
  },
  {
    q: "What information do I need to get an ESA letter?",
    a: "You answer questions about your mental health and how an emotional support animal helps you. You do not need a prior diagnosis to start — the provider's evaluation determines whether an ESA is appropriate. Your information is handled through a HIPAA-secure intake.",
  },
  {
    q: "What if I don't qualify for an ESA letter?",
    a: "If the provider determines an ESA isn't clinically appropriate, no letter is issued and you're refunded — you aren't charged for a letter you can't use. A reputable service never guarantees approval.",
  },
  {
    q: "Will my landlord accept an online ESA letter?",
    a: "Many housing providers accept a valid letter from a licensed provider, but each reasonable-accommodation request is reviewed individually under the Fair Housing Act. A letter that names a licensed provider and can be verified is far more likely to be accepted than an anonymous 'instant' document. No service can guarantee a landlord's decision.",
  },
];

export default function HowToGetESALetterOnlinePage() {
  const { withAttribution } = useAttributionParams();

  const howToSchema = {
    "@type": "HowTo",
    name: "How to get an ESA letter online",
    description: DESC,
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title.replace(/^Step \d+ — /, ""),
      text: s.desc,
    })),
  };

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "How to Get an ESA Letter Online",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    howToSchema,
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "How to Get an ESA Letter Online", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="how to get ESA letter online, how to get emotional support animal letter, fast ESA letter online, valid ESA letter online, ESA letter online process, get ESA letter for housing"
      />
      <meta property="og:type" content="article" />
      <meta property="og:image" content="https://pawtenant.com/assets/brand/og-default.jpg" />
      <meta name="twitter:card" content="summary_large_image" />
      <JsonLd data={schema} />

      <SharedNavbar />

      {/* HERO — mobile-first: text + trust + CTA, then a telehealth visual
          (the online evaluation) near the fold. Single eager hero image. */}
      <section className="relative pt-24 sm:pt-28 pb-12 sm:pb-16 bg-gradient-to-br from-[#fdf6ee] via-white to-orange-50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-9 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 bg-white border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
                <i className="ri-guide-line"></i>
                Step-by-Step Guide
              </span>
              <h1 className="text-[27px] sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-[1.12]">
                How to Get an ESA Letter Online
              </h1>
              <p className="hidden sm:block text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                Getting a legitimate ESA letter online is simple when a real licensed provider is
                involved. Here are the four steps — and the warning signs to avoid.
              </p>
              <div className="flex justify-center lg:justify-start mb-6">
                <TrustBadgeRow badges={heroBadges} mobileCount={3} />
              </div>
              <Link
                to={withAttribution("/assessment")}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
              >
                <i className="ri-file-text-line"></i>
                Start ESA Assessment
              </Link>
            </div>
            <div className="relative max-w-[420px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/woman-telehealth-with-dog.jpg"
                  alt="Person completing an online ESA telehealth evaluation on a laptop with their dog nearby"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-time-line text-orange-500"></i>
                <span className="text-[11px] font-bold text-gray-700">~5 min · reviewed in 24h</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="How do you get an ESA letter online?">
            <p>
              To get an ESA letter online: <strong>(1)</strong> complete a short mental-health
              assessment, <strong>(2)</strong> a provider licensed in your state reviews it,
              <strong> (3)</strong> if an ESA is clinically appropriate you receive your letter
              (usually the same day), and <strong>(4)</strong> you submit it to your landlord with a
              reasonable-accommodation request.
            </p>
            <p>
              With PawTenant the assessment takes about five minutes and you're only charged if you
              qualify. No legitimate service guarantees approval — a licensed provider must decide an
              ESA is appropriate for you.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* STEPS */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8 text-center leading-tight">
            The 4 steps to an ESA letter online
          </h2>
          <div className="space-y-4">
            {steps.map((s, i) => (
              <div key={s.title} className="bg-white rounded-2xl border border-gray-100 p-6 flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center relative">
                    <i className={`${s.icon} text-orange-500 text-xl`}></i>
                  </div>
                  <div className="text-center text-[11px] font-bold text-orange-300 mt-1">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1.5 text-sm sm:text-base">{s.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              to={withAttribution("/assessment")}
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
            >
              <i className="ri-file-text-line"></i>
              Start Step 1 — ESA Assessment
            </Link>
          </div>
        </div>
      </section>

      {/* Emotional lifestyle visual — the goal: settled at home with your ESA */}
      <LifestyleImageSection
        className="bg-white"
        image="/assets/housing/home-together.jpg"
        alt="A renter settled at home with their emotional support animal after getting their ESA letter"
        eyebrow="What it's for"
        heading="The end goal: your companion stays with you at home"
        body="Once you have a valid letter, you submit it with a reasonable-accommodation request so your emotional support animal can stay with you — even in no-pet housing. That's what the whole process is really about."
        bullets={[
          "Use the letter for a Fair Housing Act accommodation request.",
          "Keep a dated copy for your records.",
          "Your PawTenant letter includes a Verification ID landlords can confirm.",
        ]}
      />

      {/* WHAT LANDLORDS LOOK FOR — sample letter (left) + two stacked boxes (right) */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-start">
            {/* Left — larger sample letter */}
            <div className="order-1">
              <div className="max-w-[420px] mx-auto lg:sticky lg:top-24">
                <SampleLetterCard size="default" />
                <p className="text-center text-[11px] text-gray-400 mt-3 leading-relaxed">
                  What a valid, verifiable ESA letter looks like — sample.
                </p>
              </div>
            </div>

            {/* Right — two boxes stacked */}
            <div className="order-2 space-y-6">
              <div className="bg-[#fafafa] rounded-2xl p-7 border border-gray-100">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <i className="ri-checkbox-circle-fill text-orange-500"></i>
                  What landlords usually look for
                </h2>
                <ul className="space-y-3">
                  {landlordsLookFor.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <i className="ri-check-line text-orange-500 font-bold mt-0.5"></i>
                      <p className="text-gray-700 text-sm leading-relaxed">{item}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-[#fafafa] rounded-2xl p-7 border border-gray-100">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <i className="ri-error-warning-fill text-slate-400"></i>
                  What makes a letter invalid or risky
                </h2>
                <ul className="space-y-3">
                  {invalidSigns.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <i className="ri-close-line text-slate-400 font-bold mt-0.5"></i>
                      <p className="text-gray-600 text-sm leading-relaxed">{item}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATE NOTE */}
      <section className="py-12 sm:py-14 bg-[#fdf6ee]">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="rounded-2xl border border-orange-100 bg-white p-6 sm:p-7">
            <h2 className="text-lg font-bold text-gray-900 mb-2.5 flex items-center gap-2">
              <i className="ri-map-pin-line text-orange-500"></i>
              A note on your state
            </h2>
            <p className="text-gray-700 text-sm sm:text-[15px] leading-relaxed">
              The federal Fair Housing Act applies everywhere, but some states add their own rules.
              For example, <strong>California</strong> and <strong>Iowa</strong> require a 30-day
              relationship with the provider before an ESA letter can be issued. See your{" "}
              <Link to="/explore-esa-letters-all-states" className="text-orange-600 font-semibold hover:underline">
                state ESA guide
              </Link>{" "}
              for specifics.
            </p>
          </div>
        </div>
      </section>

      {/* Veterans support — emotional-first, savings secondary (SeoKit) */}
      <VeteransSupportSection
        className="bg-[#f7f6f3] border-t border-gray-100"
        image="/assets/veterans/senior-with-pets.jpg"
        alt="An older veteran at home spending a quiet moment with their pets"
        assessmentHref={withAttribution("/assessment")}
        reverse
      />

      {/* PRICING / KLARNA — reusable cost section */}
      <EsaPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa]">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="How to get an ESA letter online: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* AI ASSISTANT TRUST CARD */}
      <AIAssistantTrustCard
        pageUrl="/how-to-get-esa-letter-online"
        topic="how to get an ESA letter online"
        serviceType="esa"
        ctaHref={withAttribution("/assessment")}
        ctaLabel="Start ESA Evaluation"
        className="bg-[#fafafa] border-t border-gray-100"
      />

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Start your ESA assessment
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            About five minutes. Reviewed by a licensed provider. Only charged if you qualify.
          </p>
          <Link
            to={withAttribution("/assessment")}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 sm:px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[15px] sm:text-base shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
          >
            <i className="ri-file-text-line"></i>
            Start ESA Assessment
          </Link>
          <div className="mt-5">
            <LastUpdated date={UPDATED_HUMAN} />
          </div>
        </div>
      </section>

      {/* RELATED */}
      <section className="py-14 bg-white border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <RelatedResources
            links={[
              { to: "/how-to-get-esa-letter", title: "How to get an ESA letter (overview)", desc: "The full clinical process — what qualifies and how the letter is issued." },
              { to: "/esa-letter-for-landlord", title: "ESA letter for your landlord", desc: "How housing accommodation works and what to send." },
              { to: "/are-online-esa-letters-legit", title: "Are online ESA letters legit?", desc: "How to tell a real letter from a worthless one." },
              { to: "/esa-letter-cost", title: "ESA letter cost", desc: "Transparent pricing and what your fee includes." },
              { to: "/landlord-denied-esa-letter", title: "Landlord denied your ESA?", desc: "Your housing rights and calm next steps." },
              { to: "/best-online-esa-letter-service", title: "Best online ESA letter service", desc: "How to choose a legitimate service." },
              { to: "/is-pawtenant-legit", title: "Is PawTenant legit?", desc: "What PawTenant does and does not promise." },
            ]}
          />
        </div>
      </section>

      {/* PSD CROSS-LINK — small, ESA stays the focus */}
      <section className="py-10 bg-white border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <PsdCrossLink />
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="py-10 bg-[#fafafa] border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <EducationalDisclaimer />
        </div>
      </section>

      <Hud2026UpdateBanner className="border-t border-gray-100" />

      <SharedFooter />
      <MobileStickyApplyCTA label="Start ESA Assessment" icon="ri-file-text-line" />
    </main>
  );
}
