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

const PATH = "/what-makes-esa-letter-valid";
const TITLE = "What Makes an ESA Letter Valid for Housing?";
const DESC =
  "What makes an ESA letter valid for housing: a licensed provider evaluation, what must be included, whether online letters count, and how a landlord checks it.";
const UPDATED_HUMAN = "June 17, 2026";
const UPDATED_ISO = "2026-06-17";

const heroBadges = [
  { icon: "ri-verified-badge-line", label: "What's required" },
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-shield-check-line", label: "Verifiable letter" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

// ── What a valid housing ESA letter must include
const mustInclude = [
  {
    icon: "ri-user-star-line",
    title: "A named, licensed provider",
    desc: "The mental health professional who evaluated you, named with their license type, number, and the state they're licensed in — not an anonymous \"care team.\"",
  },
  {
    icon: "ri-heart-pulse-line",
    title: "A disability-related need statement",
    desc: "A clear statement that you have a disability-related need for the emotional support animal. It does not need to name your diagnosis.",
  },
  {
    icon: "ri-home-heart-line",
    title: "Housing accommodation language",
    desc: "It frames a reasonable-accommodation request for housing under the Fair Housing Act — the right context for a landlord to act on.",
  },
  {
    icon: "ri-calendar-check-line",
    title: "A recent issue date",
    desc: "Housing ESA letters are generally treated as current for about 12 months, so a recent date carries more weight.",
  },
  {
    icon: "ri-qr-code-line",
    title: "A way to verify",
    desc: "Provider license details and, on PawTenant letters, a Verification ID so a landlord can confirm the letter is genuine.",
  },
  {
    icon: "ri-quill-pen-line",
    title: "The provider's signature",
    desc: "A signed letter on the provider's letterhead reads as professional documentation, not a template anyone could print.",
  },
];

// ── Valid vs not valid
const isValid = [
  "Issued by a mental health professional licensed in your state, after a real evaluation.",
  "States a disability-related need for the animal and frames a housing accommodation request.",
  "Names the provider with verifiable license details and a recent date.",
  "Delivered as a proper letter you can hand to a landlord and they can confirm.",
];
const notValid = [
  "A \"registration,\" certificate, ID card, or vest bought online with no evaluation.",
  "An instant letter issued in minutes by someone who never evaluated you.",
  "A generic template with no named, licensed provider or license number.",
  "Anything that claims to guarantee landlord approval — no service can promise that.",
];

// ── How to check your own letter
const selfCheck = [
  {
    icon: "ri-search-line",
    title: "Find the provider's license",
    desc: "Confirm the letter names a real provider with a license type, number, and state. You can cross-check on the public NPI registry.",
  },
  {
    icon: "ri-calendar-line",
    title: "Check the date",
    desc: "Make sure the letter is recent — within about the last 12 months — so it reads as current to a landlord.",
  },
  {
    icon: "ri-qr-code-line",
    title: "Look for a verification path",
    desc: "A verifiable letter offers a way to confirm it — a license number or a Verification ID. If there's no way to verify, that's a red flag.",
  },
  {
    icon: "ri-home-heart-line",
    title: "Confirm housing framing",
    desc: "It should speak to a housing accommodation, not airline or public access — ESA protections center on housing.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "What makes an ESA letter valid for housing?",
    a: "A housing-valid ESA letter comes from a mental health professional licensed in your state, written after a real evaluation, and states that you have a disability-related need for the animal. It should name the provider with their license details, be recent, frame a reasonable-accommodation request for housing, and be verifiable. There is no official ESA \"registry\" — a registration, certificate, or ID card has no legal weight on its own.",
  },
  {
    q: "How do I know if my ESA letter is valid?",
    a: "Check that it names a provider licensed in your state with a license number, is dated within about the last 12 months, states a disability-related need, and offers a way to verify it (a license number or Verification ID). If it was issued instantly with no evaluation, or it's just a \"registration\" or certificate, it likely won't hold up for housing.",
  },
  {
    q: "Are online ESA letters valid if they come from a licensed provider?",
    a: "Yes. An online ESA letter is valid for housing when it comes from a provider licensed in your state who evaluated you and determined an ESA is appropriate. The delivery method (online telehealth) doesn't make it invalid — what matters is a real licensed provider evaluation. What is not valid is an instant \"registration\" sold without any evaluation.",
  },
  {
    q: "What should be included in an ESA letter?",
    a: "A housing ESA letter should include the licensed provider's name, license type, number, and state; a statement that you have a disability-related need for the emotional support animal; housing accommodation language; the issue date; the provider's signature; and a way to verify it. It does not need to disclose your specific diagnosis.",
  },
  {
    q: "Does an ESA letter need to name my diagnosis to be valid?",
    a: "No. A valid ESA letter confirms a disability-related need for the animal but does not need to state your specific diagnosis. A landlord may request documentation that reasonably supports the need, but generally cannot require your diagnosis or full medical records.",
  },
  {
    q: "Is a one-time ESA letter still valid, or do I need a subscription?",
    a: "A one-time letter from a licensed provider is valid for housing. Because housing letters are generally treated as current for about 12 months, many people renew each year so their documentation stays recent for lease renewals and new applications — but a subscription isn't required for validity.",
  },
  {
    q: "Can a landlord reject a valid ESA letter from an online provider?",
    a: "A landlord must consider a reasonable-accommodation request supported by a valid letter, and generally cannot reject it simply because it came from an online (telehealth) provider. They can deny in limited, individualized situations — such as a documented direct threat or substantial damage. \"Must consider\" is not the same as \"must accept,\" and no service can guarantee a landlord's decision.",
  },
  {
    q: "How long is an ESA letter valid for housing?",
    a: "Housing ESA letters are generally treated as current for about 12 months. Many landlords ask for a recent letter, so renewing each year keeps your documentation valid and up to date.",
  },
];

export default function WhatMakesESALetterValidPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "What Makes an ESA Letter Valid for Housing?",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "What Makes an ESA Letter Valid?", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="what makes an ESA letter valid, how do I know if my ESA letter is valid, valid ESA letter for housing, what should be included in an ESA letter, are online ESA letters valid, online ESA letter valid for housing"
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
                <i className="ri-verified-badge-line"></i>
                ESA letter validity
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                What Makes an ESA Letter Valid for Housing?
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                Not every "ESA letter" holds up. A valid housing ESA letter comes from a licensed
                provider after a real evaluation — and includes specific details a landlord can
                confirm. Here's exactly what makes a letter valid, what to look for, and whether
                online letters count.
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
                  href="#must-include"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  What's Required
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/woman-laptop-clean.jpg"
                  alt="A renter reviewing whether their ESA letter is valid for housing"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-verified-badge-line text-emerald-600"></i>
                <span className="text-[11px] font-bold text-gray-700">Licensed &amp; verifiable</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="What makes an ESA letter valid for housing?">
            <p>
              A housing ESA letter is valid when it comes from a{" "}
              <strong>mental health professional licensed in your state</strong>, written{" "}
              <strong>after a real evaluation</strong>, and states that you have a{" "}
              <strong>disability-related need</strong> for the animal.
            </p>
            <p>
              It should <strong>name the provider with their license details</strong>, be{" "}
              <strong>recent</strong>, frame a <strong>reasonable-accommodation request for
              housing</strong>, and be <strong>verifiable</strong>. There is{" "}
              <strong>no official ESA "registry"</strong> — a registration, certificate, or ID card
              carries no legal weight, and eligibility depends on the provider's evaluation.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* MUST INCLUDE */}
      <section id="must-include" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              The checklist
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What a valid ESA letter must include
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              A landlord looks for these details. The more a letter has, the more readily it's
              accepted.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mustInclude.map((item) => (
              <div key={item.title} className="bg-white rounded-2xl border border-gray-100 p-6">
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
              A valid letter looks like this — from a licensed provider, with verification details.
              Sample.
            </p>
          </div>
        </div>
      </section>

      {/* VALID VS NOT VALID */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Tell them apart
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Valid letter vs a worthless "registration"
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#fafafa] rounded-2xl border border-emerald-100 p-6">
              <h3 className="text-sm font-bold text-emerald-700 mb-4 flex items-center gap-2">
                <i className="ri-checkbox-circle-fill"></i>
                Valid for housing
              </h3>
              <ul className="space-y-3">
                {isValid.map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <i className="ri-check-line text-emerald-500 mt-0.5 flex-shrink-0"></i>
                    <span className="text-gray-700 text-sm leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[#fafafa] rounded-2xl border border-gray-200 p-6">
              <h3 className="text-sm font-bold text-slate-600 mb-4 flex items-center gap-2">
                <i className="ri-close-circle-fill text-slate-400"></i>
                Not valid / red flags
              </h3>
              <ul className="space-y-3">
                {notValid.map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <i className="ri-close-line text-slate-400 mt-0.5 flex-shrink-0"></i>
                    <span className="text-gray-700 text-sm leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-center text-[13px] text-gray-500 mt-7 max-w-2xl mx-auto leading-relaxed">
            If a landlord questions a genuine letter, see{" "}
            <Link to="/landlord-says-esa-letter-is-fake" className="text-orange-600 font-semibold hover:underline">
              what to do if a landlord says your ESA letter is fake
            </Link>
            .
          </p>
        </div>
      </section>

      {/* SELF CHECK */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Check your own letter
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              How to know if your ESA letter is valid
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {selfCheck.map((item, i) => (
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
          <p className="text-center text-[13px] text-gray-500 mt-7 max-w-2xl mx-auto leading-relaxed">
            Step-by-step in{" "}
            <Link to="/how-to-verify-esa-letter" className="text-orange-600 font-semibold hover:underline">
              how to verify an ESA letter
            </Link>
            .
          </p>
        </div>
      </section>

      {/* LIFESTYLE */}
      <LifestyleImageSection
        reverse
        className="bg-[#fdf6ee]"
        image="/assets/lifestyle/person-paperwork-with-dog.jpg"
        alt="A renter checking their ESA documentation at home with their emotional support dog"
        eyebrow="Start valid, stay valid"
        heading="A real evaluation is what makes a letter hold up"
        body="The single thing that makes an ESA letter valid is a genuine evaluation by a provider licensed in your state. When that's in place — with the provider named, the letter dated, and a way to verify it — a landlord has everything they need to consider your request."
        bullets={[
          "Eligibility depends on a licensed provider evaluation.",
          "No registration, certificate, or ID card needed.",
          "Landlord denial support if a valid request is pushed back.",
        ]}
      />

      {/* PRICING */}
      <EsaPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="What makes an ESA letter valid? FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Get a valid, verifiable ESA letter
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider. If you qualify, you'll receive a housing-valid,
            verifiable ESA letter with everything a landlord can reasonably check — and a refund if
            you don't qualify.
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
              { to: "/esa-letter-verification-id", title: "ESA letter verification ID", desc: "What it is and how a landlord uses it to confirm a letter." },
              { to: "/landlord-says-esa-letter-is-fake", title: "Landlord says it's fake?", desc: "How to prove a genuine letter and spot real fakes." },
              { to: "/how-to-verify-esa-letter", title: "How to verify an ESA letter", desc: "Step-by-step verification for tenants and landlords." },
              { to: "/what-documents-can-landlord-ask-for-esa", title: "What documents can a landlord ask for?", desc: "What a landlord can reasonably request — and can't." },
              { to: "/can-landlord-reject-esa-letter", title: "Can a landlord reject an ESA letter?", desc: "When a request can be denied — and when it can't." },
              { to: "/how-to-get-esa-letter-online", title: "How to get an ESA letter online", desc: "The full process from assessment to a valid letter." },
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
