import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import Hud2026UpdateBanner from "../../components/feature/Hud2026UpdateBanner";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
import SampleLetterCard from "../../components/feature/SampleLetterCard";
import EsaPricingMini from "../../components/feature/EsaPricingMini";
import PetRentSavingsMini from "../../components/feature/PetRentSavingsMini";
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

const PATH = "/esa-letter-for-landlord";
const TITLE = "ESA Letter for Your Landlord: Housing Guide (2026) | PawTenant";
const DESC =
  "How to use an ESA letter with your landlord: how housing accommodation works under the Fair Housing Act, what to send, what not to say, and common landlord questions.";
const UPDATED_HUMAN = "June 5, 2026";
const UPDATED_ISO = "2026-06-05";

const heroBadges = [
  { icon: "ri-home-heart-line", label: "Housing-focused" },
  { icon: "ri-scales-3-line", label: "Fair Housing Act" },
  { icon: "ri-user-star-line", label: "Licensed providers" },
  { icon: "ri-qr-code-line", label: "Verifiable letters" },
];

const howItWorks = [
  {
    icon: "ri-file-text-line",
    title: "You make a reasonable-accommodation request",
    desc: "You ask your landlord, in writing, to keep your assistance animal in your home as a reasonable accommodation — and include your ESA letter from a licensed provider.",
  },
  {
    icon: "ri-search-eye-line",
    title: "The landlord reviews it individually",
    desc: "Under the Fair Housing Act, the housing provider considers your request on its own facts. An assistance animal is treated differently from a pet.",
  },
  {
    icon: "ri-shield-check-line",
    title: "They may verify the letter",
    desc: "A landlord can confirm the letter is genuine and the provider is licensed — for example, with a PawTenant Verification ID — without seeing your diagnosis.",
  },
  {
    icon: "ri-home-smile-line",
    title: "Accommodation is granted when appropriate",
    desc: "When the request is valid, the landlord generally allows the animal without pet fees. Each request is decided case by case — approval is never automatic.",
  },
];

const whatToSend = [
  "A short written reasonable-accommodation request asking to keep your assistance animal.",
  "Your ESA letter from a provider licensed in your state, with their name, license number, and signature.",
  "If asked, basic confirmation of the disability-related need — not your full medical records or diagnosis.",
];

const whatNotToDo = [
  "Don't buy an ESA \"registration,\" certificate, ID card, or vest — they carry no legal weight and can make your request look less credible.",
  "Don't claim the letter grants airline or public-access rights. ESA letters are for housing; those are different categories.",
  "Don't use threatening or demanding language. Keep your request calm, factual, and in writing.",
  "Don't submit an \"instant\" letter issued with no evaluation — landlords have learned to spot them.",
];

const landlordQuestions = [
  {
    q: "\"We have a no-pets policy.\"",
    a: "An assistance animal is not an ordinary pet. A no-pets policy alone is generally not enough to deny a valid reasonable-accommodation request under the Fair Housing Act.",
  },
  {
    q: "\"You'll need to pay pet rent or a deposit.\"",
    a: "Pet fees, deposits, and pet rent generally don't apply to assistance animals. You do remain responsible for any actual damage the animal causes.",
  },
  {
    q: "\"How do we know this letter is real?\"",
    a: "A PawTenant letter includes a Verification ID and the provider's license details so the landlord can confirm authenticity — without exposing any clinical information.",
  },
  {
    q: "\"We only accept service animals.\"",
    a: "For housing, ESAs are covered as assistance animals under the Fair Housing Act. A property generally cannot limit housing accommodations to ADA service animals only.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "What is an ESA letter for a landlord?",
    a: "It's a letter from a mental health provider, licensed in your state, that supports a reasonable-accommodation request to keep an emotional support animal in your home. You give it to your landlord with a written request; under the Fair Housing Act, an assistance animal is treated differently from a pet.",
  },
  {
    q: "Can a landlord refuse an ESA letter?",
    a: "A landlord reviews each request individually. They generally cannot deny a valid request based only on a no-pets policy, breed, size, or weight. They can ask for reliable documentation when the need isn't obvious, and in limited cases can deny a request for a genuine, fact-based safety or undue-burden reason. If you believe a valid request was wrongly denied, see our landlord-denial guide.",
  },
  {
    q: "Do I have to pay a pet deposit for an ESA?",
    a: "Generally no. Pet fees, deposits, and pet rent typically don't apply to assistance animals. You remain responsible for any actual damage your animal causes to the property.",
  },
  {
    q: "What should I send my landlord?",
    a: "A short written reasonable-accommodation request plus your ESA letter from a licensed provider. If your need isn't obvious, the landlord may ask for documentation that reasonably supports it — but not your diagnosis or full medical records.",
  },
  {
    q: "How can my landlord verify my ESA letter?",
    a: "Every finalized PawTenant letter includes a unique Verification ID along with the provider's name, license number, and NPI. A landlord can confirm authenticity at pawtenant.com/verify or check the provider on the public NPI registry. Verification confirms authenticity only — no clinical detail is exposed.",
  },
  {
    q: "Does an ESA letter guarantee my landlord will say yes?",
    a: "No. No service can guarantee approval. A valid letter from a licensed provider strengthens your request, but each reasonable-accommodation request is decided individually by the housing provider under the Fair Housing Act.",
  },
];

export default function ESALetterForLandlordPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "ESA Letter for Your Landlord: Housing Guide",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "ESA Letter for Landlord", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="ESA letter for landlord, ESA letter for apartment, emotional support animal letter for housing, no pet policy ESA letter, ESA reasonable accommodation, ESA letter for renting"
      />
      <meta property="og:type" content="article" />
      <meta property="og:image" content="https://pawtenant.com/assets/brand/og-default.jpg" />
      <meta name="twitter:card" content="summary_large_image" />
      <JsonLd data={schema} />

      <SharedNavbar />

      {/* HERO — mobile-first: text + trust + CTA, then a housing visual
          (tenant settling in with their ESA) near the fold. Single eager image. */}
      <section className="relative pt-24 sm:pt-28 pb-12 sm:pb-16 bg-gradient-to-br from-[#fdf6ee] via-white to-orange-50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-9 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 bg-white border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
                <i className="ri-home-heart-line"></i>
                Housing Guide
              </span>
              <h1 className="text-[27px] sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-[1.12]">
                ESA Letter for Your Landlord
              </h1>
              <p className="hidden sm:block text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                How to use an ESA letter for an apartment or rental: how housing accommodation works
                under the Fair Housing Act, what to send your landlord, and how to handle common
                questions.
              </p>
              <div className="flex justify-center lg:justify-start mb-6">
                <TrustBadgeRow badges={heroBadges} mobileCount={3} />
              </div>
              <Link
                to={withAttribution("/assessment")}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
              >
                <i className="ri-stethoscope-line"></i>
                Start ESA Assessment
              </Link>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/woman-with-dog-new-apartment.jpg"
                  alt="Tenant settling into a new apartment with her emotional support dog"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-scales-3-line text-emerald-600"></i>
                <span className="text-[11px] font-bold text-gray-700">Fair Housing Act</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="How do I use an ESA letter with my landlord?">
            <p>
              Give your landlord a short <strong>written reasonable-accommodation request</strong> to
              keep your assistance animal, along with your <strong>ESA letter from a provider licensed
              in your state</strong>. Under the Fair Housing Act, an assistance animal is treated
              differently from a pet, so a no-pets policy, pet fees, and breed or size limits
              generally do not apply.
            </p>
            <p>
              The landlord reviews each request individually and may verify the letter is genuine —
              without seeing your diagnosis. A valid letter supports your request, but no service can
              guarantee a landlord's decision.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8 text-center leading-tight">
            How ESA housing accommodation works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {howItWorks.map((s) => (
              <div key={s.title} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${s.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{s.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Emotional lifestyle visual — settled in a home with the family pet */}
      <LifestyleImageSection
        reverse
        className="bg-white"
        image="/assets/housing/family-with-dog-home.jpg"
        alt="A household relaxed at home with their emotional support dog after an approved accommodation"
        eyebrow="Home, together"
        heading="A valid request helps your animal stay where you live"
        body="Under the Fair Housing Act, an assistance animal is treated differently from a pet. A clear, written request backed by a letter from a licensed provider gives your landlord a lawful basis to say yes — though each request is still decided individually."
        bullets={[
          "No-pets policies generally can't block a valid ESA request on their own.",
          "Pet fees and deposits typically don't apply to assistance animals.",
          "Breed, size, and weight limits generally don't apply.",
        ]}
      />

      {/* WHAT TO SEND / WHAT NOT TO DO */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="max-w-[220px] mx-auto mb-9">
            <SampleLetterCard size="compact" />
            <p className="text-center text-[11px] text-gray-400 mt-3 leading-relaxed">
              Send a letter like this — verifiable, from a licensed provider. Sample.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#fafafa] rounded-2xl p-7 border border-gray-100">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <i className="ri-checkbox-circle-fill text-orange-500"></i>
                What to send your landlord
              </h2>
              <ul className="space-y-3">
                {whatToSend.map((item) => (
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
                What not to say or do
              </h2>
              <ul className="space-y-3">
                {whatNotToDo.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <i className="ri-close-line text-slate-400 font-bold mt-0.5"></i>
                    <p className="text-gray-600 text-sm leading-relaxed">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* COMMON LANDLORD QUESTIONS */}
      <section className="py-14 sm:py-16 bg-[#fdf6ee]">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8 text-center leading-tight">
            Common landlord questions — explained
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {landlordQuestions.map((r) => (
              <div key={r.q} className="bg-white border border-orange-100 rounded-2xl p-5">
                <p className="text-sm font-bold text-gray-900 mb-2 flex items-start gap-2">
                  <i className="ri-chat-quote-line text-orange-400 mt-0.5"></i>
                  {r.q}
                </p>
                <p className="text-sm text-gray-600 leading-relaxed pl-6">{r.a}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-600 mt-7">
            Denied anyway?{" "}
            <Link to="/landlord-denied-esa-letter" className="text-orange-600 font-semibold hover:underline">
              See your rights if a landlord denied your ESA →
            </Link>
          </p>
        </div>
      </section>

      {/* Pet rent savings teaser → links to the full /pet-rent-savings-calculator (compact, no assessment CTA) */}
      <PetRentSavingsMini
        className="bg-white border-t border-gray-100"
        heading="Paying monthly pet rent?"
        copy="See how monthly pet rent can add up over a year, and estimate your possible pet-rent costs over time with the full calculator."
        showAssessmentCta={false}
      />

      {/* PRICING / KLARNA — reusable cost section */}
      <EsaPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa]">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="ESA letter for landlord: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Need an ESA letter for your housing?
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider. If you qualify, you'll receive a verifiable letter for
            your reasonable-accommodation request.
          </p>
          <Link
            to={withAttribution("/assessment")}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 sm:px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[15px] sm:text-base shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
          >
            <i className="ri-stethoscope-line"></i>
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
              { to: "/landlord-denied-esa-letter", title: "Landlord denied your ESA?", desc: "Your housing rights and calm next steps, by state." },
              { to: "/esa-letter-for-apartments", title: "ESA letter for apartments", desc: "How ESA housing requests work for apartment renters." },
              { to: "/esa-accommodation-request-letter", title: "Accommodation request letter", desc: "Write the request you send with your ESA letter." },
              { to: "/housing-rights-esa", title: "ESA housing rights", desc: "How the Fair Housing Act protects ESA owners." },
              { to: "/how-to-get-esa-letter-online", title: "How to get an ESA letter online", desc: "The step-by-step process from assessment to letter." },
              { to: "/esa-letter-verification", title: "Landlord verification", desc: "How a landlord confirms a letter is authentic." },
              { to: "/explore-esa-letters-all-states", title: "ESA letter by state", desc: "State-specific ESA housing rules." },
              { to: "/esa-letter-cost", title: "ESA letter cost", desc: "Transparent pricing and what your fee includes." },
              { to: "/psd-letter-for-apartments", title: "PSD letter for apartments", desc: "Housing requests for a task-trained psychiatric service dog." },
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
      <MobileStickyApplyCTA label="Start ESA Assessment" icon="ri-stethoscope-line" />
    </main>
  );
}
