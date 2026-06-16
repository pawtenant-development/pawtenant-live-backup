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

const PATH = "/texas-esa-letter-for-apartments";
const TITLE = "Texas ESA Letter for Apartments | Renter Housing Guide";
const DESC =
  "ESA letters for Texas apartments: how a licensed provider evaluation and a verifiable letter support a reasonable-accommodation request with large property managers.";
const UPDATED_HUMAN = "June 17, 2026";
const UPDATED_ISO = "2026-06-17";

const heroBadges = [
  { icon: "ri-map-pin-line", label: "Texas-licensed" },
  { icon: "ri-building-4-line", label: "Property-manager ready" },
  { icon: "ri-home-heart-line", label: "Housing-focused" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

// ── Texas-specific context (the differentiator)
const stateContext = [
  {
    icon: "ri-flashlight-line",
    title: "No state waiting period",
    desc: "Unlike California or Arkansas, Texas has no statewide 30-day provider-relationship rule. Once a Texas-licensed provider completes a real evaluation and finds an ESA appropriate, your housing letter can be issued without a mandated wait.",
  },
  {
    icon: "ri-building-2-line",
    title: "Big corporate property management",
    desc: "Houston, Dallas–Fort Worth, Austin, and San Antonio are dominated by large management companies. Requests are often routed to a corporate or regional office, so a clean, verifiable letter speeds the review.",
  },
  {
    icon: "ri-shield-keyhole-line",
    title: "Texas penalizes misrepresentation",
    desc: "Texas law makes it an offense to knowingly misrepresent an animal as an assistance animal. That is exactly why a letter from a real Texas-licensed provider — not a bought \"registration\" — matters here.",
  },
  {
    icon: "ri-search-eye-line",
    title: "Verification is common",
    desc: "Larger Texas landlords frequently verify the provider's license before approving. A letter with the provider's license number and a verification path is reviewed faster and questioned less.",
  },
];

const prepare = [
  {
    icon: "ri-file-list-3-line",
    title: "A short accommodation request",
    desc: "A brief written request to the leasing office stating you have a disability-related need and are asking for an exception to the pet policy. Keep medical detail out of it.",
  },
  {
    icon: "ri-shield-check-line",
    title: "A verifiable provider letter",
    desc: "Your ESA letter naming the Texas-licensed provider, their license type and number, the issue date, and a way to verify it.",
  },
  {
    icon: "ri-mail-line",
    title: "The right contact",
    desc: "For a managed community, find out whether the request goes to the on-site office or a corporate portal, and submit it where they actually track it.",
  },
  {
    icon: "ri-folder-line",
    title: "Copies for your records",
    desc: "Keep a copy of what you sent and the date. A clear paper trail helps if a corporate review is slow or your request stalls.",
  },
];

const landlordReview = [
  "Confirm the letter comes from a provider licensed in Texas and that it is authentic.",
  "Ask for documentation reasonably supporting the need when a disability isn't obvious.",
  "Apply the same general lease rules (noise, damage, leash) that apply to every resident.",
  "Decline a specific animal only for a documented, individualized safety or damage reason — not a no-pet policy alone.",
];

const faqs: FaqItem[] = [
  {
    q: "Is there a waiting period for a Texas apartment ESA letter?",
    a: "No. Texas does not have a statewide 30-day provider-relationship rule like California's AB 468. Once a Texas-licensed mental health provider completes a real evaluation and finds an emotional support animal clinically appropriate, your housing letter can be issued without a mandated wait.",
  },
  {
    q: "Can a Texas apartment charge pet rent or a pet deposit for my ESA?",
    a: "Generally no. An approved assistance animal is not treated as a pet, so a Texas apartment usually cannot charge pet rent, a pet deposit, or pet fees for it. You can still be held responsible for any actual damage the animal causes, like any other resident.",
  },
  {
    q: "Do big Texas property management companies accept ESA letters?",
    a: "Large Texas management companies review reasonable-accommodation requests under the Fair Housing Act, but each request is decided individually — acceptance is never automatic or guaranteed. A clear letter from a Texas-licensed provider, with a license number and a way to verify it, is reviewed faster and questioned less.",
  },
  {
    q: "Does my provider have to be licensed in Texas?",
    a: "In most cases, yes. The letter should come from a mental health professional licensed in Texas. A Texas-licensed, verifiable provider is what a property manager looks for, and it matters even more because Texas law penalizes knowingly misrepresenting an assistance animal.",
  },
  {
    q: "Can a Texas apartment deny my ESA request?",
    a: "An apartment can deny a request in limited situations — for example, if the specific animal would be a direct threat to others' safety or cause substantial damage that can't be reduced, or if the documentation doesn't reasonably support the need. A no-pet policy, breed, size, or weight limit alone generally is not a valid reason, and each request is reviewed individually.",
  },
  {
    q: "How long is a Texas apartment ESA letter valid?",
    a: "Housing ESA letters are generally treated as current for about 12 months. Many Texas apartments ask for a recent letter, so renewing each year keeps your documentation up to date for lease renewals and new applications.",
  },
  {
    q: "What if my Texas landlord denies a valid ESA request?",
    a: "Keep it calm and in writing. You can ask the housing provider or its corporate office to reconsider, point to the documentation you provided, and seek landlord denial support. A clearly verifiable letter from a Texas-licensed provider makes a reconsideration easier.",
  },
  {
    q: "Is a Texas ESA letter the same as a psychiatric service dog letter?",
    a: "No. An emotional support animal is covered for housing under the Fair Housing Act and provides comfort. A psychiatric service dog (PSD) is individually trained to perform tasks for a disability and is covered under the ADA in public places. They are different categories with different documentation.",
  },
];

export default function TexasESALetterForApartmentsPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema({
      name: "Texas ESA letter service",
      description:
        "Connects Texas renters with mental health providers licensed in Texas who can evaluate them and, when clinically appropriate, issue an ESA letter for housing. No guaranteed approval — eligibility depends on a provider's evaluation. Texas has no statewide waiting period.",
    }),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "Texas ESA Letter for Apartments",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "ESA Letter for Apartments", path: "/esa-letter-for-apartments" },
      { name: "Texas", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="Texas ESA letter for apartments, ESA letter Texas apartment, Texas emotional support animal apartment, ESA no pet policy Texas, Texas apartment ESA pet rent, ESA letter property manager Texas"
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
                Texas apartment renters
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                Texas ESA Letter for Apartments
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                Renting an apartment in Texas with an emotional support animal? Texas has no waiting
                period, but its huge market is full of large property managers who verify
                documentation. A real ESA letter comes from a Texas-licensed provider after an
                evaluation and supports your housing accommodation request.
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
                  href="#texas-rules"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  Texas Specifics
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/owner-with-dog-laptop.jpg"
                  alt="A Texas renter submitting an apartment accommodation request online with their emotional support dog"
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
                <span className="text-[11px] font-bold text-gray-700">Texas-licensed provider</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="How does an ESA letter work for a Texas apartment?">
            <p>
              For a Texas apartment, an ESA letter supports a{" "}
              <strong>reasonable-accommodation request under the Fair Housing Act</strong>. You send
              the leasing office (or its corporate portal) a short written request plus a letter from
              a <strong>provider licensed in Texas</strong>, written after a real evaluation.
            </p>
            <p>
              Texas has <strong>no statewide waiting period</strong>, but its large management
              companies often <strong>verify the provider's license</strong>. Approved assistance
              animals are generally <strong>exempt from no-pet policies, pet rent, and pet
              deposits</strong> — but each request is reviewed individually, and{" "}
              <strong>no service can guarantee a landlord's decision</strong>.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* TEXAS RULES */}
      <section id="texas-rules" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              What's different in Texas
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Texas-specific factors for apartment ESAs
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              Texas keeps the process light on waiting periods but heavy on large-landlord
              verification. Here's what shapes an apartment request in Texas.
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
            <Link to="/esa-letter/texas" className="text-orange-600 font-semibold hover:underline">
              ESA letter in Texas page
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
              What Texas renters should prepare
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
              How a Texas apartment may review your documentation
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              General Fair Housing guidance — not legal advice. Rules can vary by city and locality.
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
        image="/assets/lifestyle/freelancer-with-dog-laptop.jpg"
        alt="A Texas renter preparing an apartment accommodation request at home with their emotional support dog"
        eyebrow="Make the request with confidence"
        heading="A Texas-licensed, verifiable letter clears corporate review faster"
        body="When your letter clearly names a Texas-licensed provider with a license number and offers a way to confirm it, a leasing office — or a corporate review desk — can process your request quickly, without you handing over private medical details."
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
            heading="Texas apartment ESA letters: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Ready to request your Texas apartment accommodation?
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a Texas-licensed provider. If you qualify, you'll receive a verifiable,
            housing-focused ESA letter for your apartment — with a refund if you don't qualify.
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
              { to: "/esa-letter/texas", title: "ESA letter in Texas", desc: "Texas ESA requirements and how to get a letter." },
              { to: "/esa-accommodation-request-letter", title: "Accommodation request letter", desc: "Write the request you send with your ESA letter." },
              { to: "/landlord-esa-documentation-checklist", title: "Landlord documentation checklist", desc: "What a landlord can and can't ask to review." },
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
