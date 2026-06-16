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

const PATH = "/florida-esa-letter-for-apartments";
const TITLE = "Florida ESA Letter for Apartments | Renter Housing Guide";
const DESC =
  "ESA letters for Florida apartments and condos: how Statute 760.27, a licensed provider evaluation, and a verifiable letter support your housing accommodation request.";
const UPDATED_HUMAN = "June 17, 2026";
const UPDATED_ISO = "2026-06-17";

const heroBadges = [
  { icon: "ri-map-pin-line", label: "Florida-licensed" },
  { icon: "ri-government-line", label: "§ 760.27 aware" },
  { icon: "ri-home-heart-line", label: "Housing-focused" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

// ── Florida-specific context (the differentiator)
const stateContext = [
  {
    icon: "ri-government-line",
    title: "Florida Statute 760.27",
    desc: "Florida has its own ESA housing law. A housing provider may request supporting information from a licensed health care practitioner — and the practitioner is expected to have actual knowledge of your need, not just sell a generic form.",
  },
  {
    icon: "ri-global-line",
    title: "No relying on internet \"registries\"",
    desc: "Florida's law specifically discourages basing an ESA request on an out-of-state, internet-only \"registration.\" A real evaluation by a provider connected to Florida is the standard that holds up.",
  },
  {
    icon: "ri-building-3-line",
    title: "Condo & HOA communities",
    desc: "Much of Florida's housing is condos, HOAs, and 55+ communities with strict pet rules. Reasonable-accommodation rights still apply, but requests often go through an association board, which reviews documentation carefully.",
  },
  {
    icon: "ri-alert-line",
    title: "Fraud carries penalties",
    desc: "Knowingly giving fraudulent ESA information in Florida can be a misdemeanor. That's a strong reason to use a genuine, verifiable letter from a licensed provider rather than a bought certificate.",
  },
];

const prepare = [
  {
    icon: "ri-file-list-3-line",
    title: "A short accommodation request",
    desc: "A brief written request to your leasing office or association stating you have a disability-related need and are asking for an exception to the pet policy. Keep medical detail out of it.",
  },
  {
    icon: "ri-shield-check-line",
    title: "A verifiable provider letter",
    desc: "Your ESA letter naming the Florida-licensed provider, their license type and number, the issue date, and a way to verify it — aligned with what § 760.27 anticipates.",
  },
  {
    icon: "ri-community-line",
    title: "Know who decides",
    desc: "In a condo or HOA, the request may go to a property manager or board. Find out the right submission channel so it's tracked and answered on time.",
  },
  {
    icon: "ri-folder-line",
    title: "Copies for your records",
    desc: "Keep a copy of what you sent and the date. A clear paper trail helps if a board review is slow or your request stalls.",
  },
];

const landlordReview = [
  "Request supporting information from a licensed practitioner with actual knowledge of the need, consistent with § 760.27.",
  "Confirm the letter is authentic and the provider is licensed — without demanding your full medical records.",
  "Apply the same general lease or community rules (noise, damage, leash) that apply to every resident.",
  "Decline a specific animal only for a documented, individualized safety or damage reason — not a no-pet policy alone.",
];

const faqs: FaqItem[] = [
  {
    q: "What does Florida Statute 760.27 mean for my apartment ESA letter?",
    a: "Florida Statute 760.27 sets the rules for ESA documentation in housing. A housing provider may request supporting information from a licensed health care practitioner, and the practitioner is expected to have actual knowledge of your need — not just issue a generic form. The law also discourages relying on an out-of-state, internet-only registration. A real evaluation by a provider connected to Florida is what meets the standard.",
  },
  {
    q: "Can a Florida apartment or condo charge pet rent or a pet deposit for my ESA?",
    a: "Generally no. An approved assistance animal is not treated as a pet, so a Florida apartment, condo, or HOA usually cannot charge pet rent, a pet deposit, or pet fees for it. You can still be held responsible for any actual damage the animal causes, like any other resident.",
  },
  {
    q: "Do Florida condo associations and HOAs have to accept ESAs?",
    a: "Condos, HOAs, and 55+ communities are generally covered by Fair Housing reasonable-accommodation rules, so a no-pet community rule alone is usually not a valid reason to deny an approved assistance animal. But each request is reviewed individually — often by a board — and acceptance is never automatic or guaranteed.",
  },
  {
    q: "Is an online ESA letter valid for a Florida apartment?",
    a: "It can be — if it comes from a licensed practitioner who actually evaluated you and has knowledge of your need, consistent with Florida Statute 760.27. What is not valid is an instant out-of-state \"registration,\" certificate, or ID card sold without any evaluation. There is no official ESA registry in Florida.",
  },
  {
    q: "Does my provider have to be licensed for Florida?",
    a: "Florida's law focuses on a licensed health care practitioner with actual knowledge of your disability-related need. The safest, smoothest path for a Florida apartment is a letter from a provider licensed to evaluate you for Florida housing. PawTenant connects you with appropriately licensed providers.",
  },
  {
    q: "How long is a Florida apartment ESA letter valid?",
    a: "Housing ESA letters are generally treated as current for about 12 months. Many Florida apartments and associations ask for a recent letter, so renewing each year keeps your documentation up to date for lease renewals and new applications.",
  },
  {
    q: "What if my Florida landlord or HOA denies a valid ESA request?",
    a: "Keep it calm and in writing. You can ask the housing provider or association to reconsider, point to the documentation you provided, and seek landlord denial support. Florida renters also have state fair-housing avenues. A clearly verifiable letter from a licensed provider makes a reconsideration easier.",
  },
  {
    q: "Is a Florida ESA letter the same as a psychiatric service dog letter?",
    a: "No. An emotional support animal is covered for housing under the Fair Housing Act and Florida's housing law and provides comfort. A psychiatric service dog (PSD) is individually trained to perform tasks for a disability and is covered under the ADA in public places. They are different categories with different documentation.",
  },
];

export default function FloridaESALetterForApartmentsPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema({
      name: "Florida ESA letter service",
      description:
        "Connects Florida renters with licensed mental health providers who can evaluate them and, when clinically appropriate, issue an ESA letter for housing consistent with Florida Statute 760.27. No guaranteed approval — eligibility depends on a provider's evaluation.",
    }),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "Florida ESA Letter for Apartments",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "ESA Letter for Apartments", path: "/esa-letter-for-apartments" },
      { name: "Florida", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="Florida ESA letter for apartments, ESA letter Florida apartment, Florida Statute 760.27 ESA, Florida emotional support animal condo, ESA no pet policy Florida, Florida HOA ESA letter"
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
                <i className="ri-map-pin-line"></i>
                Florida apartment &amp; condo renters
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                Florida ESA Letter for Apartments
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                Renting an apartment or condo in Florida with an emotional support animal? Florida
                Statute 760.27 sets specific documentation rules on top of the Fair Housing Act. A
                real ESA letter comes from a licensed provider with actual knowledge of your need and
                supports your housing accommodation request.
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
                  href="#florida-rules"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  Florida Rules
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/senior-with-pet-home.jpg"
                  alt="A Florida condo resident at home with their emotional support pet"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-home-heart-line text-emerald-600"></i>
                <span className="text-[11px] font-bold text-gray-700">Licensed provider letter</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="How does an ESA letter work for a Florida apartment or condo?">
            <p>
              For Florida housing, an ESA letter supports a{" "}
              <strong>reasonable-accommodation request under the Fair Housing Act and Florida
              Statute 760.27</strong>. You send your leasing office or association a short written
              request plus a letter from a <strong>licensed practitioner with actual knowledge of
              your need</strong>, written after a real evaluation.
            </p>
            <p>
              Florida specifically <strong>discourages relying on an internet-only
              registration</strong>. Approved assistance animals are generally{" "}
              <strong>exempt from no-pet policies, pet rent, and pet deposits</strong> — but each
              request is reviewed individually, and{" "}
              <strong>no service can guarantee a landlord's or board's decision</strong>.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* FLORIDA RULES */}
      <section id="florida-rules" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              What's different in Florida
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Florida-specific rules for apartment &amp; condo ESAs
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              Florida regulates ESA documentation directly, and much of its housing runs through
              condo and HOA boards. Here's what shapes a Florida request.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {stateContext.map((item) => (
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
            For a deeper look at the state law, see our{" "}
            <Link to="/florida-esa-letter-housing-rules" className="text-orange-600 font-semibold hover:underline">
              Florida ESA letter &amp; housing rules (§ 760.27) guide
            </Link>
            .
          </p>
        </div>
      </section>

      {/* WHAT TO PREPARE */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              For renters
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What Florida renters should prepare
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {prepare.map((item) => (
              <div key={item.title} className="bg-[#fafafa] rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${item.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{item.title}</h3>
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

      {/* HOW LANDLORDS MAY REVIEW */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              On the landlord's side
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              How a Florida apartment or board may review your documentation
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              General Fair Housing and § 760.27 guidance — not legal advice. Rules can vary by
              community and locality.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-7">
            <ul className="space-y-3.5">
              {landlordReview.map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <i className="ri-check-line text-emerald-500 mt-0.5 flex-shrink-0"></i>
                  <span className="text-gray-700 text-sm leading-relaxed">{t}</span>
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-gray-500 mt-6 leading-relaxed">
              See the full{" "}
              <Link to="/landlord-esa-documentation-checklist" className="text-orange-600 font-semibold hover:underline">
                landlord ESA documentation checklist
              </Link>{" "}
              and how to{" "}
              <Link to="/how-to-verify-esa-letter" className="text-orange-600 font-semibold hover:underline">
                verify an ESA letter
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* LIFESTYLE */}
      <LifestyleImageSection
        reverse
        className="bg-[#fdf6ee]"
        image="/assets/lifestyle/woman-telehealth-with-dog.jpg"
        alt="A Florida renter on a telehealth evaluation at home with their emotional support dog"
        eyebrow="Make the request with confidence"
        heading="A § 760.27-aligned, verifiable letter holds up with Florida boards"
        body="When your letter comes from a licensed provider who actually evaluated you and can be verified, a Florida leasing office or condo board can review your request without you handing over private medical details — and it stands up to the documentation standard the state expects."
        bullets={[
          "Pair the letter with a short written accommodation request.",
          "No pet registration, certificate, or ID card needed.",
          "Landlord denial support if a valid request is pushed back.",
        ]}
      />

      {/* PRICING */}
      <EsaPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="Florida apartment ESA letters: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Ready to request your Florida apartment accommodation?
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider for Florida. If you qualify, you'll receive a verifiable,
            housing-focused ESA letter for your apartment or condo — with a refund if you don't
            qualify.
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
      <section className="py-14 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <RelatedResources
            links={[
              { to: "/esa-letter-for-apartments", title: "ESA letter for apartments", desc: "The national guide to apartment ESA housing requests." },
              { to: "/esa-letter/florida", title: "ESA letter in Florida", desc: "Florida ESA requirements and how to get a letter." },
              { to: "/esa-accommodation-request-letter", title: "Accommodation request letter", desc: "Write the request you send with your ESA letter." },
              { to: "/landlord-esa-documentation-checklist", title: "Landlord documentation checklist", desc: "What a landlord or board can and can't ask to review." },
              { to: "/esa-pet-rent-deposit", title: "ESA pet rent & deposits", desc: "When apartment pet fees and deposits may not apply." },
              { to: "/how-to-verify-esa-letter", title: "How to verify an ESA letter", desc: "Make sure your letter is real and verifiable." },
            ]}
          />
        </div>
      </section>

      {/* PSD CROSS-LINK */}
      <section className="py-10 bg-[#fafafa]">
        <div className="px-5 sm:px-6">
          <PsdCrossLink />
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="py-10 bg-white border-t border-gray-100">
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
