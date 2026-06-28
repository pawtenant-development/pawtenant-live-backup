import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
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

const PATH = "/do-you-need-a-psd-letter-for-a-service-dog";
const TITLE = "Do You Need a PSD Letter for a Psychiatric Service Dog? | PawTenant";
const DESC =
  "Do you need a PSD letter for a psychiatric service dog? Service dogs aren't certified by online registries, but documentation from a licensed provider can help in housing.";
const UPDATED_HUMAN = "June 28, 2026";
const UPDATED_ISO = "2026-06-28";

const heroBadges = [
  { icon: "ri-question-answer-line", label: "Straight answer" },
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-home-heart-line", label: "Helpful for housing" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

const whenItHelps = [
  {
    icon: "ri-home-heart-line",
    title: "A housing accommodation request",
    desc: "When you ask a landlord to keep a service dog in no-pet or pet-restricted housing, a letter documenting your disability-related need makes the reasonable-accommodation request clear.",
  },
  {
    icon: "ri-building-4-line",
    title: "A non-obvious disability",
    desc: "If your disability isn't visually apparent, a housing provider can request documentation that reasonably supports the need — which is exactly what a PSD letter provides.",
  },
  {
    icon: "ri-shield-check-line",
    title: "You want verifiable proof of clinical need",
    desc: "A letter from a licensed provider gives you something credible and verifiable to show, instead of relying on a worthless online \"registration.\"",
  },
];

const notRequired = [
  "No law requires a service dog to be \"certified\" or \"registered\" — paid registries carry no legal weight.",
  "Your dog doesn't need a professional trainer or a certificate; owner-training is allowed.",
  "A vest, ID card, or tag does not create service-dog status.",
  "What actually matters is real task training tied to a qualifying disability.",
];

const faqs: FaqItem[] = [
  {
    q: "Do you need a PSD letter for a psychiatric service dog?",
    a: "No law requires a letter to have a psychiatric service dog — service dogs aren't certified or registered by any official body. But a PSD letter from a licensed provider is genuinely useful: it documents your disability-related need for housing reasonable-accommodation requests, and it's verifiable, unlike paid online registrations. It supports your situation rather than being a required license.",
  },
  {
    q: "Is a psychiatric service dog required to be registered or certified?",
    a: "No. There is no official certification or registration that makes a dog a service dog, and websites that sell \"certificates\" or \"registrations\" provide nothing of legal value. A service dog's status comes from being trained to perform tasks for a disability — not from any registry.",
  },
  {
    q: "When does a PSD letter actually help?",
    a: "It helps most in housing. When you request to keep a service dog in no-pet housing, a landlord can ask for documentation that reasonably supports a non-obvious disability. A PSD letter from a licensed provider meets that need with verifiable, credible documentation. It can also be useful supporting paperwork in other accommodation conversations.",
  },
  {
    q: "Do I need a letter for public access with my service dog?",
    a: "For public access, staff may only ask whether the dog is a service animal required because of a disability and what task it's trained to perform — they cannot require documentation. So a letter isn't a public-access requirement. It's still valuable for housing requests, where documentation can be requested.",
  },
  {
    q: "What's the difference between this and an ESA letter?",
    a: "An ESA (emotional support animal) letter supports a comfort animal for housing, with no task-training requirement. A PSD letter is for a dog trained to perform specific tasks for a psychiatric disability. If your dog only provides comfort, an ESA letter is the right document; if it's task-trained, a PSD letter fits.",
  },
  {
    q: "Can I get a service dog doctor letter online?",
    a: "Yes. A mental health professional licensed in your state can evaluate you by telehealth and, if you qualify, issue a psychiatric service dog letter online. The key is a real evaluation by a licensed provider — not an instant document from a registry with no clinician involved.",
  },
  {
    q: "Does a PSD letter make my dog an official service dog?",
    a: "No. The letter documents your clinical need as determined by a licensed provider. Your dog's status as a service dog comes from its task training, not from the letter. Together, the documentation and the training support your situation — but no paper makes a dog a service dog by itself.",
  },
];

export default function DoYouNeedAPsdLetterForAServiceDogPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema({
      name: "Psychiatric service dog (PSD) letter service",
      description:
        "Connects people with licensed mental health providers who can evaluate them and issue a psychiatric service dog letter when clinically appropriate. A service dog is not certified or registered by any official body; the letter documents clinical need. No guaranteed approval.",
    }),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "Do You Need a PSD Letter for a Psychiatric Service Dog?",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Do You Need a PSD Letter?", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="do you need a PSD letter for a service dog, do I need a letter for psychiatric service dog, psychiatric service dog documentation, service dog doctor letter, is a PSD letter required"
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
                <i className="ri-question-answer-line"></i>
                Service dog documentation
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                Do You Need a PSD Letter for a Psychiatric Service Dog?
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                Service dogs aren&rsquo;t certified or registered by any official body — so no letter
                is technically &ldquo;required.&rdquo; But documentation from a licensed provider can
                genuinely help, especially for housing. Here&rsquo;s when it matters.
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
                  href="#when-it-helps"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-information-line"></i>
                  When It Helps
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/breeds/german-shepherd.jpg"
                  alt="A psychiatric service dog at home with its handler"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-shield-star-line text-[#4A8472]"></i>
                <span className="text-[11px] font-bold text-gray-700">Training, not registration</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="Do you need a PSD letter for a psychiatric service dog?">
            <p>
              <strong>No law requires a letter</strong> to have a psychiatric service dog — service
              dogs aren&rsquo;t certified or registered by any official body, and paid online
              registries carry <strong>no legal weight</strong>.
            </p>
            <p>
              But a <strong>PSD letter from a licensed provider is genuinely useful</strong>: it
              documents your disability-related need for <strong>housing</strong>{" "}
              reasonable-accommodation requests, and it&rsquo;s <strong>verifiable</strong>. What makes
              a dog a service dog is <strong>task training tied to a qualifying disability</strong> —
              not any paperwork.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* WHEN IT HELPS */}
      <section id="when-it-helps" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              When documentation matters
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              When a PSD letter actually helps
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {whenItHelps.map((item) => (
              <div key={item.title} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${item.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[13px] text-gray-500 mt-7 max-w-2xl mx-auto leading-relaxed">
            For the housing details, see{" "}
            <Link to="/psd-letter-for-apartments" className="text-orange-600 font-semibold hover:underline">
              PSD letter for apartments
            </Link>
            .
          </p>
        </div>
      </section>

      {/* NOT REQUIRED / SCAM WARNING */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-8">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Don&rsquo;t pay for these
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What you don&rsquo;t need
            </h2>
          </div>
          <div className="bg-[#fafafa] rounded-2xl border border-gray-200 p-6">
            <ul className="space-y-3">
              {notRequired.map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <i className="ri-close-circle-line text-slate-400 mt-0.5 flex-shrink-0"></i>
                  <span className="text-gray-700 text-sm leading-relaxed">{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-center text-[13px] text-gray-500 mt-6 max-w-2xl mx-auto leading-relaxed">
            Read more in{" "}
            <Link to="/blog/psd-letter-vs-service-dog-certificate" className="text-orange-600 font-semibold hover:underline">
              PSD letter vs service dog certificate
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ESA vs PSD card */}
      <EsaVsPsdCard className="bg-[#fafafa] border-y border-gray-100" />

      {/* LIFESTYLE */}
      <LifestyleImageSection
        reverse
        className="bg-[#fdf6ee]"
        image="/assets/lifestyle/woman-telehealth-with-dog.jpg"
        alt="A handler meeting a licensed provider online about psychiatric service dog documentation"
        eyebrow="Credible beats a certificate"
        heading="Real documentation, from a licensed provider"
        body="Instead of buying a meaningless certificate, a licensed mental health professional can evaluate you and — if appropriate — issue a verifiable PSD letter. It's the documentation that actually carries weight when a housing provider asks."
        bullets={[
          "Verifiable letter with the provider's license details.",
          "Useful for housing accommodation requests.",
          "Refund if you don't qualify.",
        ]}
      />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="Do you need a PSD letter? FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Get documentation that actually helps
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Skip the registries. A licensed mental health professional reviews your situation and, if
            you qualify, issues a verifiable psychiatric service dog letter — with a refund if you
            don&rsquo;t qualify.
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
      <section className="py-14 bg-white border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <RelatedResources
            links={[
              { to: "/psychiatric-service-dog-letter-online", title: "Psychiatric service dog letter online", desc: "How the online PSD evaluation and letter work." },
              { to: "/psd-letter-requirements", title: "PSD letter requirements", desc: "What you need to qualify for a PSD letter." },
              { to: "/psd-letter-for-apartments", title: "PSD letter for apartments", desc: "Using a PSD letter for a housing request." },
              { to: "/esa-vs-psd-letter", title: "ESA vs PSD letter", desc: "Which document fits your situation." },
              { to: "/can-a-landlord-deny-a-psd-letter", title: "Can a landlord deny a PSD letter?", desc: "What a landlord can verify — and when they can't reject." },
              { to: "/all-about-service-dogs", title: "All about service dogs", desc: "Training, ADA rights, and how PSDs work." },
            ]}
          />
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="py-10 bg-[#fafafa] border-t border-gray-100">
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
