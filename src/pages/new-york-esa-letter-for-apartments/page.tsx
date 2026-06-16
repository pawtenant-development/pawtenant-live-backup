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

const PATH = "/new-york-esa-letter-for-apartments";
const TITLE = "New York ESA Letter for Apartments | Renter Housing Guide";
const DESC =
  "ESA letters for New York apartments, co-ops, and condos: how a licensed provider evaluation and a verifiable letter support your reasonable-accommodation request.";
const UPDATED_HUMAN = "June 17, 2026";
const UPDATED_ISO = "2026-06-17";

const heroBadges = [
  { icon: "ri-map-pin-line", label: "New York-licensed" },
  { icon: "ri-building-4-line", label: "Co-op & board ready" },
  { icon: "ri-home-heart-line", label: "Housing-focused" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

// ── New York-specific context (the differentiator)
const stateContext = [
  {
    icon: "ri-shield-check-line",
    title: "Layered housing protections",
    desc: "New York renters are covered by the federal Fair Housing Act plus the New York State Human Rights Law — and, in the five boroughs, the NYC Human Rights Law. Together they protect assistance animals in most housing.",
  },
  {
    icon: "ri-building-2-line",
    title: "Co-ops, condos & rent-stabilized",
    desc: "NYC housing is full of co-ops, condos, and rent-stabilized buildings with strict no-pet clauses. A reasonable-accommodation request asks the building to make an exception — reviewed individually, often by a board or managing agent.",
  },
  {
    icon: "ri-team-line",
    title: "Building management & boards",
    desc: "Many requests go through a managing agent or co-op/condo board rather than an individual owner. A clear, verifiable letter helps that review move along calmly.",
  },
  {
    icon: "ri-search-eye-line",
    title: "Providers expected to be verifiable",
    desc: "New York landlords and boards are encouraged to confirm a provider's license. A letter naming a New York-licensed provider, with a license number and a verification path, is far less likely to be questioned.",
  },
];

const prepare = [
  {
    icon: "ri-file-list-3-line",
    title: "A short accommodation request",
    desc: "A brief written request to your managing agent or board stating you have a disability-related need and are asking for an exception to the no-pet policy. Keep medical detail out of it.",
  },
  {
    icon: "ri-shield-check-line",
    title: "A verifiable provider letter",
    desc: "Your ESA letter naming the New York-licensed provider, their license type and number, the issue date, and a way to verify it.",
  },
  {
    icon: "ri-team-line",
    title: "Know who reviews it",
    desc: "Find out whether your building routes requests to a managing agent, a co-op/condo board, or the owner, and submit it through the channel they actually track.",
  },
  {
    icon: "ri-folder-line",
    title: "Copies for your records",
    desc: "Keep a copy of what you sent and the date. A clear paper trail helps if a board review is slow or your request stalls.",
  },
];

const landlordReview = [
  "Confirm the letter comes from a provider licensed in New York and that it is authentic.",
  "Ask for documentation reasonably supporting the need when a disability isn't obvious.",
  "Apply the same general building rules (noise, damage, leash) that apply to every resident.",
  "Decline a specific animal only for a documented, individualized safety or damage reason — not a no-pet policy alone.",
];

const faqs: FaqItem[] = [
  {
    q: "Can a New York co-op or rent-stabilized building deny my ESA?",
    a: "A no-pet clause alone is generally not a valid reason to deny an approved assistance animal. New York renters are protected by the Fair Housing Act, the New York State Human Rights Law, and — in NYC — the NYC Human Rights Law. A building can deny a request in limited situations, such as a documented direct threat to safety or substantial damage that can't be reduced, but each request is reviewed individually and acceptance is never automatic or guaranteed.",
  },
  {
    q: "Can a New York apartment charge pet rent or a pet deposit for my ESA?",
    a: "Generally no. An approved assistance animal is not treated as a pet, so a New York apartment, co-op, or condo usually cannot charge pet rent, a pet deposit, or pet fees for it. You can still be held responsible for any actual damage the animal causes, like any other resident.",
  },
  {
    q: "How do co-op and condo boards review an ESA request in New York?",
    a: "In many NYC buildings the request goes to a managing agent or a co-op/condo board rather than an individual owner. They review the reasonable-accommodation request and the supporting letter, may confirm the provider is licensed, and decide individually. A clear, verifiable letter from a New York-licensed provider helps that review move along.",
  },
  {
    q: "Does my provider have to be licensed in New York?",
    a: "In most cases, yes. The letter should come from a mental health professional licensed in New York. New York landlords and boards are encouraged to verify license status, so a New York-licensed, verifiable provider is what they look for. PawTenant connects you with New York-licensed providers.",
  },
  {
    q: "Is an online ESA letter valid for a New York apartment?",
    a: "It can be — if it comes from a New York-licensed provider after a real evaluation. What is not valid is an instant \"registration,\" certificate, or ID card sold without any evaluation. There is no official ESA registry in New York or anywhere in the U.S.",
  },
  {
    q: "How long is a New York apartment ESA letter valid?",
    a: "Housing ESA letters are generally treated as current for about 12 months. Many New York buildings ask for a recent letter, so renewing each year keeps your documentation up to date for lease renewals, board reviews, and new applications.",
  },
  {
    q: "What if my New York building denies a valid ESA request?",
    a: "Keep it calm and in writing. You can ask the managing agent or board to reconsider, point to the documentation you provided, and seek landlord denial support. New York renters also have state and city human-rights avenues. A clearly verifiable letter from a New York-licensed provider makes a reconsideration easier.",
  },
  {
    q: "Is a New York ESA letter the same as a psychiatric service dog letter?",
    a: "No. An emotional support animal is covered for housing under the Fair Housing Act and New York's human-rights laws and provides comfort. A psychiatric service dog (PSD) is individually trained to perform tasks for a disability and is covered under the ADA in public places. They are different categories with different documentation.",
  },
];

export default function NewYorkESALetterForApartmentsPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema({
      name: "New York ESA letter service",
      description:
        "Connects New York renters with mental health providers licensed in New York who can evaluate them and, when clinically appropriate, issue an ESA letter for housing. No guaranteed approval — eligibility depends on a provider's evaluation, and each building reviews requests individually.",
    }),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "New York ESA Letter for Apartments",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "ESA Letter for Apartments", path: "/esa-letter-for-apartments" },
      { name: "New York", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="New York ESA letter for apartments, ESA letter NYC apartment, New York emotional support animal co-op, ESA no pet policy New York, NYC apartment ESA pet rent, ESA letter rent stabilized New York"
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
                New York apartment renters
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                New York ESA Letter for Apartments
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                Renting an apartment, co-op, or condo in New York with an emotional support animal?
                New York layers state and city human-rights protections on top of the Fair Housing
                Act, and many buildings review requests through a board or managing agent. A real ESA
                letter comes from a New York-licensed provider after an evaluation.
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
                  href="#new-york-rules"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  New York Specifics
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/woman-with-dog-office.jpg"
                  alt="A New York renter with their emotional support dog in a city apartment"
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
                <span className="text-[11px] font-bold text-gray-700">New York-licensed provider</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="How does an ESA letter work for a New York apartment?">
            <p>
              For a New York apartment, an ESA letter supports a{" "}
              <strong>reasonable-accommodation request</strong> under the{" "}
              <strong>Fair Housing Act, the New York State Human Rights Law</strong>, and — in NYC —
              the NYC Human Rights Law. You send your managing agent or board a short written request
              plus a letter from a <strong>provider licensed in New York</strong>, written after a
              real evaluation.
            </p>
            <p>
              Approved assistance animals are generally <strong>exempt from no-pet policies, pet
              rent, and pet deposits</strong> — even in co-ops and rent-stabilized buildings — but
              each request is reviewed individually, often by a board, and{" "}
              <strong>no service can guarantee a building's decision</strong>.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* NEW YORK RULES */}
      <section id="new-york-rules" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              What's different in New York
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              New York-specific factors for apartment ESAs
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              New York adds extra tenant protections, but its co-op and board culture means
              documentation gets a close read. Here's what shapes a New York request.
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
            See the broader state overview on our{" "}
            <Link to="/esa-letter/new-york" className="text-orange-600 font-semibold hover:underline">
              ESA letter in New York page
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
              What New York renters should prepare
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
              On the building's side
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              How a New York building or board may review your documentation
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              General Fair Housing and New York human-rights guidance — not legal advice. Rules can
              vary by building and locality.
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
        image="/assets/lifestyle/woman-laptop-home.jpg"
        alt="A New York renter preparing a board accommodation request at home with their emotional support dog"
        eyebrow="Make the request with confidence"
        heading="A New York-licensed, verifiable letter reads cleanly to a board"
        body="When your letter clearly names a New York-licensed provider with a license number and offers a way to confirm it, a managing agent or co-op board can review your request without you handing over private medical details — and it's far less likely to be questioned."
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
            heading="New York apartment ESA letters: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Ready to request your New York apartment accommodation?
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a New York-licensed provider. If you qualify, you'll receive a verifiable,
            housing-focused ESA letter for your apartment, co-op, or condo — with a refund if you
            don't qualify.
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
              { to: "/esa-letter/new-york", title: "ESA letter in New York", desc: "New York ESA requirements and how to get a letter." },
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
