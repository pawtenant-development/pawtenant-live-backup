import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import Hud2026UpdateBanner from "../../components/feature/Hud2026UpdateBanner";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
import SampleLetterCard from "../../components/feature/SampleLetterCard";
import EsaPricingMini from "../../components/feature/EsaPricingMini";
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

const PATH = "/how-to-verify-esa-letter";
const TITLE = "How to Verify an ESA Letter Online | Real ESA Letter Guide";
const DESC =
  "Learn how to verify an ESA letter, check licensed provider details, avoid fake ESA registrations, and use PawTenant's housing documentation support.";
const UPDATED_HUMAN = "June 16, 2026";
const UPDATED_ISO = "2026-06-16";

const heroBadges = [
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-qr-code-line", label: "Verifiable letter" },
  { icon: "ri-shield-check-line", label: "License verification" },
  { icon: "ri-home-heart-line", label: "Housing-focused" },
];

// ── Verification checklist — what a real, verifiable ESA letter should include
const checklist = [
  {
    icon: "ri-user-star-line",
    title: "Licensed provider name",
    desc: "The letter names the mental health professional who evaluated you — not just a company logo or an anonymous \"care team.\"",
  },
  {
    icon: "ri-award-line",
    title: "License type and state",
    desc: "It lists the provider's license type (LMHP, LCSW, LPC, psychologist, etc.) and the state they're licensed in.",
  },
  {
    icon: "ri-customer-service-2-line",
    title: "Provider contact or verification process",
    desc: "There's a real way to confirm the provider — a phone number, NPI, or a verification process the landlord can use.",
  },
  {
    icon: "ri-calendar-check-line",
    title: "Date issued",
    desc: "A clear issue date. Housing letters are generally considered current for about 12 months, so the date matters.",
  },
  {
    icon: "ri-id-card-line",
    title: "Client / patient name",
    desc: "Your name appears on the letter, tying the documentation to the person making the housing request.",
  },
  {
    icon: "ri-home-heart-line",
    title: "Housing accommodation language",
    desc: "It frames a reasonable-accommodation request for housing under the Fair Housing Act — not airline or public-access wording.",
  },
  {
    icon: "ri-heart-pulse-line",
    title: "Animal-related support need",
    desc: "It explains, in general terms, that an emotional support animal supports a disability-related need — without exposing your full diagnosis.",
  },
  {
    icon: "ri-close-circle-line",
    title: "No fake registry or certification claims",
    desc: "A real letter does not rely on a \"registration number,\" certificate, or ID card. Those carry no legal weight.",
  },
  {
    icon: "ri-flight-takeoff-line",
    title: "No public-access or airline-access promises",
    desc: "An ESA letter is for housing. It should not promise airline, stadium, restaurant, or other public-access rights.",
  },
  {
    icon: "ri-qr-code-line",
    title: "PawTenant Verification ID (if applicable)",
    desc: "PawTenant letters include a Verification ID so a landlord can confirm authenticity without seeing any clinical detail.",
  },
];

// ── Red flags
const redFlags = [
  {
    title: "\"Registered ESA\" certificate only",
    desc: "A registration, certificate, or ID card with no provider letter behind it. There is no official ESA registry.",
  },
  {
    title: "Instant approval without an evaluation",
    desc: "A letter issued in seconds with no questionnaire and no licensed provider review.",
  },
  {
    title: "No provider name or license",
    desc: "You can't see who wrote it, their license type, or the state they're licensed in.",
  },
  {
    title: "Fake-looking template",
    desc: "Generic, unsigned, or clearly copied wording with no real provider details.",
  },
  {
    title: "No way to verify the provider",
    desc: "No contact, NPI, or verification process a landlord could actually use.",
  },
  {
    title: "Public-access or airline-access claims",
    desc: "Promises that the letter lets your animal go \"anywhere\" — flights, stores, restaurants, hotels.",
  },
  {
    title: "Fake review or rating claims",
    desc: "Invented star ratings, review counts, or testimonials used to look trustworthy.",
  },
  {
    title: "Guaranteed landlord acceptance",
    desc: "No service can guarantee a landlord will say yes. Each request is reviewed individually.",
  },
  {
    title: "\"Bring your pet anywhere\" wording",
    desc: "Suspiciously broad language. A housing ESA letter supports a housing accommodation — nothing more.",
  },
];

// ── For landlords / property managers
const landlordSteps = [
  {
    icon: "ri-user-search-line",
    title: "Check the provider's identity and license",
    desc: "Confirm the letter names a licensed mental health professional, lists their license type and state, and offers a way to verify them — such as an NPI or a verification process.",
  },
  {
    icon: "ri-home-heart-line",
    title: "Confirm the letter is housing-focused",
    desc: "A valid ESA letter supports a reasonable-accommodation request for housing under the Fair Housing Act. Be cautious of letters promising airline or public-access rights.",
  },
  {
    icon: "ri-file-shield-2-line",
    title: "Request reliable documentation when the need isn't obvious",
    desc: "When a disability-related need is not apparent, you may ask for documentation that reasonably supports it — like a letter from a licensed provider.",
  },
  {
    icon: "ri-lock-2-line",
    title: "Avoid asking for a diagnosis or invasive records",
    desc: "You generally cannot require a specific diagnosis, medical records, or access to the resident's treatment details. Verification confirms authenticity, not clinical detail.",
  },
  {
    icon: "ri-qr-code-line",
    title: "Use PawTenant verification where available",
    desc: "If the letter is from PawTenant, the Verification ID and provider license details let you confirm authenticity in minutes — no medical information exposed.",
  },
];

// ── PawTenant Verification ID / approach
const verificationApproach = [
  {
    icon: "ri-qr-code-line",
    title: "Verification details on every letter",
    desc: "Where applicable, finalized PawTenant letters carry a Verification ID and the provider's license details so authenticity can be confirmed.",
  },
  {
    icon: "ri-customer-service-2-line",
    title: "Support can help both sides verify",
    desc: "Customers and landlords can contact PawTenant support to confirm a letter is genuine — without exposing private clinical information.",
  },
  {
    icon: "ri-stethoscope-line",
    title: "Prepared after a licensed provider evaluation",
    desc: "Documentation is written after a licensed mental health professional reviews your assessment — never an instant, no-evaluation document.",
  },
  {
    icon: "ri-refund-2-line",
    title: "Refund if you do not qualify",
    desc: "If a provider determines you don't qualify after review, you're refunded. No pressure, no risk.",
  },
  {
    icon: "ri-shield-cross-line",
    title: "Support if your housing request is denied",
    desc: "Landlord denial protection: if your housing request is pushed back, we help you understand calm, practical next steps.",
  },
];

// ── Comparison table: Real / verifiable ESA letter vs Red-flag document
const comparisonRows: { item: string; real: string; redFlag: string }[] = [
  {
    item: "Provider evaluation",
    real: "Issued after a licensed provider reviews your assessment.",
    redFlag: "Instant document with no evaluation.",
  },
  {
    item: "License details",
    real: "Names the provider, license type, and state.",
    redFlag: "No provider name or license shown.",
  },
  {
    item: "Registry / certificate",
    real: "No registry needed — it's a provider letter.",
    redFlag: "Sold as a \"registration\" or certificate.",
  },
  {
    item: "Housing language",
    real: "Frames a Fair Housing accommodation request.",
    redFlag: "Vague \"bring your pet anywhere\" wording.",
  },
  {
    item: "Verification support",
    real: "Verification ID and a way to confirm the provider.",
    redFlag: "No way to verify anything.",
  },
  {
    item: "Public-access claims",
    real: "Housing only — no airline or public-access promises.",
    redFlag: "Promises flights, stores, and venues.",
  },
  {
    item: "Landlord support",
    real: "Support if a valid request is questioned or denied.",
    redFlag: "No support after purchase.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "How can I verify an ESA letter?",
    a: "Check that the letter was written after a licensed provider evaluation and that it includes the provider's name, license type, and state, an issue date, your name, and housing-focused accommodation language. A real letter also offers a way to confirm the provider — such as an NPI or, for PawTenant letters, a Verification ID. Treat \"registration\" certificates, ID cards, and instant no-evaluation documents as red flags.",
  },
  {
    q: "Can a landlord verify my ESA letter?",
    a: "Yes. A landlord can confirm that the provider is licensed and that the letter is genuine — for example, by checking the provider's NPI or using a Verification ID on a PawTenant letter. Verification confirms authenticity only; it does not expose your diagnosis or medical records.",
  },
  {
    q: "Is an ESA registration certificate valid?",
    a: "No. There is no official ESA registry, and a registration number, certificate, or ID card carries no legal weight on its own. What supports a housing accommodation is a letter from a mental health professional licensed in your state, written after an evaluation — not a purchased registration.",
  },
  {
    q: "Does an ESA letter need a licensed provider?",
    a: "Yes. A valid ESA letter comes from a licensed mental health professional after a real evaluation. A document issued with no provider and no evaluation is a common red flag and is unlikely to be accepted for a housing accommodation request.",
  },
  {
    q: "Should an ESA letter include a diagnosis?",
    a: "Not necessarily. A housing ESA letter generally explains that there is a disability-related need an emotional support animal helps with — without listing a specific diagnosis. Landlords can ask for documentation that reasonably supports the need, but generally cannot require your diagnosis or full medical records.",
  },
  {
    q: "Can a landlord call the provider?",
    a: "A landlord may take reasonable steps to confirm that the provider is licensed and that the letter is authentic. That can include checking license or NPI details or using a Verification ID. The goal is confirming the letter is genuine — not obtaining private clinical information.",
  },
  {
    q: "What makes an online ESA letter suspicious?",
    a: "Warning signs include instant approval with no evaluation, no provider name or license, a \"registration\" or certificate instead of a provider letter, promises of airline or public-access rights, guaranteed landlord acceptance, fake reviews or ratings, and no way to verify the provider. A trustworthy letter is housing-focused, names a licensed provider, and can be verified.",
  },
  {
    q: "Is an ESA the same as a service dog?",
    a: "No. An emotional support animal provides comfort and is covered for housing under the Fair Housing Act. A psychiatric service dog (PSD) is individually trained to perform tasks for a disability and is covered under the ADA in public places. They are different categories with different documentation and different rules.",
  },
  {
    q: "Can PawTenant help if my landlord questions my letter?",
    a: "Yes. PawTenant letters include verification details so a landlord can confirm authenticity, and our support team can help both sides verify a genuine letter. If a valid housing request is questioned or denied, we help you understand calm, practical next steps — though no service can guarantee a landlord's decision.",
  },
];

export default function HowToVerifyESALetterPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "How to Verify an ESA Letter Online",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "How to Verify an ESA Letter", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="how to verify ESA letter, verify ESA letter online, real ESA letter, fake ESA letter, ESA letter verification, is my ESA letter legit, ESA registration scam, ESA Verification ID, licensed provider ESA letter"
      />
      <meta property="og:type" content="article" />
      <meta property="og:image" content="https://pawtenant.com/assets/brand/og-default.jpg" />
      <meta name="twitter:card" content="summary_large_image" />
      <JsonLd data={schema} />

      <SharedNavbar />

      {/* HERO — mobile-first: text + trust + CTAs, then a trust visual
          (provider telehealth evaluation) near the fold. Single eager image. */}
      <section className="relative pt-24 sm:pt-28 pb-12 sm:pb-16 bg-gradient-to-br from-[#fdf6ee] via-white to-orange-50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-9 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 bg-white border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
                <i className="ri-verified-badge-line"></i>
                ESA Verification Center
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                How to Verify an ESA Letter Online
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                A real ESA letter should come from a licensed mental health professional after an
                evaluation, name the provider and their license, and be verifiable — without relying
                on fake registrations, certificates, or ID cards. Here's exactly what to check.
              </p>
              <div className="flex justify-center lg:justify-start mb-6">
                <TrustBadgeRow badges={heroBadges} mobileCount={3} />
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
                <Link
                  to={withAttribution("/assessment")}
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
                >
                  <i className="ri-stethoscope-line"></i>
                  Start ESA Evaluation
                </Link>
                <a
                  href="#verification-checklist"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  See Verification Checklist
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/woman-telehealth-with-dog.jpg"
                  alt="A woman in a telehealth evaluation with a licensed provider, her emotional support dog beside her"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-shield-check-line text-emerald-600"></i>
                <span className="text-[11px] font-bold text-gray-700">Verifiable letters</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="How do I verify whether an ESA letter is real?">
            <p>
              A real ESA letter should be written <strong>after a licensed provider evaluation</strong>{" "}
              and include the <strong>provider's details, license information, date, your name,
              housing-related recommendation language</strong>, and a way for landlords to verify the
              letter.
            </p>
            <p>
              ESA <strong>registration certificates, ID cards, and instant approval documents are red
              flags</strong> — there is no official ESA registry. Verification confirms that the
              provider is licensed and the letter is genuine; it does not require exposing your
              diagnosis or medical records.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* VERIFICATION CHECKLIST */}
      <section id="verification-checklist" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Verification checklist
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What a verifiable ESA letter should include
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              Run any online ESA letter through this checklist. The more boxes it ticks, the more
              likely it is genuine and landlord-ready.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {checklist.map((item) => (
              <div key={item.title} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${item.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm flex items-start gap-2">
                  <i className="ri-checkbox-circle-fill text-orange-500 mt-0.5 flex-shrink-0"></i>
                  <span>{item.title}</span>
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="max-w-[220px] mx-auto mt-10">
            <SampleLetterCard size="compact" />
            <p className="text-center text-[11px] text-gray-400 mt-3 leading-relaxed">
              A verifiable letter looks like this — from a licensed provider, with verification
              details. Sample.
            </p>
          </div>
        </div>
      </section>

      {/* RED FLAGS */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Red flags
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Warning signs of a fake or weak ESA letter
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              If you spot any of these, be cautious. They make a letter look untrustworthy to
              landlords — and many won't accept them.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {redFlags.map((item) => (
              <div key={item.title} className="bg-[#fafafa] rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-bold text-gray-900 mb-1.5 flex items-start gap-2">
                  <i className="ri-error-warning-fill text-slate-400 mt-0.5 flex-shrink-0"></i>
                  <span>{item.title}</span>
                </p>
                <p className="text-gray-600 text-sm leading-relaxed pl-6">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARISON TABLE — Real / verifiable vs Red-flag */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-8">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Side by side
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Real ESA letter vs red-flag document
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              A quick reference. This is general housing information, not legal advice — check your
              local rules or an official fair-housing resource for your situation.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_8px_30px_-22px_rgba(15,23,42,0.25)]">
            {/* Header row (sm+) */}
            <div className="hidden sm:grid grid-cols-[0.9fr_1.3fr_1.3fr] bg-[#fdf6ee] border-b border-gray-100">
              <div className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Item</div>
              <div className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-emerald-700">Real / verifiable letter</div>
              <div className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Red-flag document</div>
            </div>
            {comparisonRows.map((r) => (
              <div
                key={r.item}
                className="grid grid-cols-1 sm:grid-cols-[0.9fr_1.3fr_1.3fr] border-t border-gray-100 first:border-t-0 sm:first:border-t"
              >
                <div className="px-5 pt-4 pb-1 sm:py-4">
                  <span className="text-sm font-semibold text-gray-900">{r.item}</span>
                </div>
                <div className="px-5 py-1 sm:py-4">
                  <span className="sm:hidden block text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-0.5">Real / verifiable</span>
                  <span className="text-sm text-gray-600 leading-relaxed flex items-start gap-2">
                    <i className="ri-checkbox-circle-fill text-emerald-500 mt-0.5 flex-shrink-0"></i>
                    <span>{r.real}</span>
                  </span>
                </div>
                <div className="px-5 pt-1 pb-4 sm:py-4">
                  <span className="sm:hidden block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Red-flag</span>
                  <span className="text-sm text-gray-600 leading-relaxed flex items-start gap-2">
                    <i className="ri-close-circle-line text-slate-400 mt-0.5 flex-shrink-0"></i>
                    <span>{r.redFlag}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOR LANDLORDS / PROPERTY MANAGERS */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              For landlords & property managers
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              How to review ESA documentation
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              A calm, fair way to confirm a letter is genuine while respecting a resident's privacy.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {landlordSteps.map((item) => (
              <div key={item.title} className="bg-[#fafafa] rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${item.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[13px] text-gray-500 mt-7 max-w-2xl mx-auto leading-relaxed">
            For official guidance on assistance animals in housing, see HUD's{" "}
            <a
              href="https://www.hud.gov/program_offices/fair_housing_equal_opp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-600 font-semibold hover:underline"
            >
              Fair Housing &amp; Equal Opportunity
            </a>{" "}
            resources. Rules can vary by state and locality.
          </p>
        </div>
      </section>

      {/* Emotional lifestyle visual — landlord/tenant reviewing documentation */}
      <LifestyleImageSection
        reverse
        className="bg-[#fdf6ee]"
        image="/assets/lifestyle/person-paperwork-with-dog.jpg"
        alt="A tenant reviewing housing documentation at home with their emotional support dog"
        eyebrow="Confidence on both sides"
        heading="A verifiable letter makes the housing conversation easier"
        body="When a letter clearly names a licensed provider and offers a way to confirm it, a landlord can say yes with confidence — and you can make your reasonable-accommodation request without handing over private medical details."
        bullets={[
          "Names a licensed provider and their state license.",
          "Offers a real way to verify — no fake registry needed.",
          "Confirms authenticity without exposing a diagnosis.",
        ]}
      />

      {/* PAWTENANT VERIFICATION ID / APPROACH */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              PawTenant Verification ID
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              How PawTenant makes letters verifiable
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              We connect you with a licensed provider and give you housing documentation a landlord
              can actually confirm — never a pet registration.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {verificationApproach.map((item) => (
              <div key={item.title} className="bg-[#fafafa] rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${item.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-600 mt-8">
            Landlord checking a PawTenant letter?{" "}
            <Link to="/esa-letter-verification" className="text-orange-600 font-semibold hover:underline">
              See how landlord verification works →
            </Link>
          </p>
        </div>
      </section>

      {/* PRICING / KLARNA — reusable cost section */}
      <EsaPricingMini className="bg-[#fafafa] border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="Verifying an ESA letter: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Want a letter you can actually verify?
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider. If you qualify, you'll receive a verifiable,
            housing-focused ESA letter — with a refund if you don't qualify.
          </p>
          <Link
            to={withAttribution("/assessment")}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 sm:px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[15px] sm:text-base shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
          >
            <i className="ri-stethoscope-line"></i>
            Start ESA Evaluation
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
              { to: "/esa-letter-for-landlord", title: "ESA letter for your landlord", desc: "How housing accommodation works and what to send." },
              { to: "/landlord-denied-esa-letter", title: "Landlord denied your ESA?", desc: "Your housing rights and calm next steps, by state." },
              { to: "/how-to-get-esa-letter-online", title: "How to get an ESA letter online", desc: "The step-by-step process from assessment to letter." },
              { to: "/esa-letter-cost", title: "ESA letter cost", desc: "Transparent pricing and what your fee includes." },
              { to: "/esa-pet-rent-deposit", title: "ESA pet rent & deposits", desc: "When pet fees and deposits may not apply." },
              { to: "/are-online-esa-letters-legit", title: "Are online ESA letters real?", desc: "Green flags, red flags, and how to spot a fake." },
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
      <MobileStickyApplyCTA label="Start ESA Evaluation" icon="ri-stethoscope-line" />
    </main>
  );
}
