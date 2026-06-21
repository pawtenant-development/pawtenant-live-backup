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

const PATH = "/how-to-respond-to-esa-letter-denial";
const TITLE = "How to Respond if Your Landlord Denies Your ESA Letter";
const DESC =
  "How to respond if a landlord denies your ESA letter or says it's fake: calm steps, what to send, verification, and landlord denial support. Refund if you don't qualify.";
const UPDATED_HUMAN = "June 17, 2026";
const UPDATED_ISO = "2026-06-17";

const heroBadges = [
  { icon: "ri-lifebuoy-line", label: "Denial support" },
  { icon: "ri-shield-check-line", label: "Verifiable letter" },
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

// ── Step-by-step response
const steps = [
  {
    icon: "ri-chat-3-line",
    title: "Ask for the reason in writing",
    desc: "Politely ask the housing provider to put the specific reason for the denial in writing. A written record protects you and clarifies what to address.",
  },
  {
    icon: "ri-file-search-line",
    title: "Check your letter is solid",
    desc: "Confirm your ESA letter is recent, names a provider licensed in your state, supports a disability-related need, and is verifiable. Fix anything missing.",
  },
  {
    icon: "ri-qr-code-line",
    title: "Offer a way to verify",
    desc: "Share the provider's license details or a PawTenant Verification ID so the landlord can confirm the letter is genuine — without seeing your records.",
  },
  {
    icon: "ri-mail-send-line",
    title: "Re-send with a clear request",
    desc: "Send a short written reasonable-accommodation request alongside the letter, so the landlord has a request they're required to consider.",
  },
  {
    icon: "ri-lifebuoy-line",
    title: "Use landlord denial support",
    desc: "If a valid request is still refused, PawTenant offers landlord denial support to help you respond calmly and correctly.",
  },
  {
    icon: "ri-government-line",
    title: "Know your escalation options",
    desc: "Where a valid request is unlawfully denied, you may have state or federal fair-housing avenues. This page is educational, not legal advice.",
  },
];

// ── Why landlords push back (and the fix)
const reasons = [
  {
    icon: "ri-error-warning-line",
    title: "\"Your letter looks fake\"",
    desc: "Offer verification. A genuine letter names a licensed provider with a license number, and a PawTenant letter has a Verification ID a landlord can confirm.",
  },
  {
    icon: "ri-calendar-close-line",
    title: "\"This letter is too old\"",
    desc: "Housing ESA letters are generally treated as current for about 12 months. Renew so your documentation is recent.",
  },
  {
    icon: "ri-bank-card-line",
    title: "\"You have to pay a pet deposit\"",
    desc: "Pet rent, deposits, and fees generally don't apply to an approved assistance animal. Point to the accommodation framing, not the pet policy.",
  },
  {
    icon: "ri-forbid-line",
    title: "\"Our building has a no-pet rule\"",
    desc: "A no-pet policy alone is generally not a valid reason to deny an approved ESA. The landlord must consider the accommodation request.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "What should I do if my landlord says my ESA letter is not valid?",
    a: "Stay calm and ask, in writing, for the specific reason. Then make sure your letter is recent, from a provider licensed in your state, supports a disability-related need, and is verifiable — and offer a way to confirm it (license details or a Verification ID). Re-send it with a short written reasonable-accommodation request. If a valid request is still refused, use landlord denial support and, where appropriate, state or federal fair-housing avenues.",
  },
  {
    q: "How do I respond if my landlord denies my emotional support animal?",
    a: "Respond in writing, keep records, and address the specific reason given. Re-send a verifiable letter from a licensed provider with an accommodation request the landlord must consider. A no-pet policy, breed, size, or weight alone is generally not a valid reason to deny an approved ESA. Landlord denial support can help you craft the response.",
  },
  {
    q: "My landlord says my ESA letter is fake — how do I prove it's real?",
    a: "Offer verification. A genuine ESA letter names a mental health professional with their license type and number, and a PawTenant letter includes a Verification ID a landlord can confirm. Verification proves the letter is authentic without revealing your diagnosis or medical records.",
  },
  {
    q: "Can my landlord contact PawTenant to verify my ESA letter?",
    a: "A landlord can confirm a PawTenant letter is genuine using the Verification ID on the letter, and can confirm the provider is licensed via their license number or the public NPI registry. Verification confirms authenticity only — it does not disclose your diagnosis or clinical detail.",
  },
  {
    q: "Does my landlord have to accept my ESA after I respond?",
    a: "A landlord must consider a reasonable-accommodation request supported by valid documentation, but \"must consider\" is not \"must accept.\" They can deny in limited, individualized situations — such as a documented direct threat or substantial damage. No legitimate service can guarantee landlord acceptance.",
  },
  {
    q: "What if my ESA letter really was issued without an evaluation?",
    a: "A housing-valid ESA letter must come from a licensed provider after a real evaluation. If your letter was issued without one, it may not hold up. The fix is a proper licensed provider evaluation — if you qualify, you receive a verifiable letter, with a refund if you don't qualify.",
  },
  {
    q: "How long do I have to respond to an ESA denial?",
    a: "There's no single deadline, but respond promptly and in writing to keep momentum and a clear record. The sooner you re-send a verifiable letter with a clear accommodation request, the sooner the landlord must reconsider.",
  },
  {
    q: "Should I move out if my landlord denies my ESA?",
    a: "Not necessarily. A denial — especially one based only on a no-pet policy, breed, or size — is often not the end of the conversation. Re-send a verifiable letter with an accommodation request, use landlord denial support, and consider fair-housing avenues before making housing decisions. This is educational information, not legal advice.",
  },
];

export default function HowToRespondToESALetterDenialPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "How to Respond to an ESA Letter Denial",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "How to Respond to an ESA Letter Denial", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="how to respond if landlord denies ESA, landlord says ESA letter is fake, landlord denied my emotional support animal, can my landlord contact PawTenant to verify my ESA letter, ESA denial next steps, landlord denial support ESA"
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
                <i className="ri-lifebuoy-line"></i>
                ESA denial support
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                How to Respond to an ESA Letter Denial
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                Landlord said no, or claimed your letter isn't valid? Don't panic — a denial is often
                not the end of the conversation. Here's a calm, step-by-step way to respond with a
                verifiable letter and a clear accommodation request the landlord must consider.
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
                  href="#steps"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  See the Steps
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/senior-with-pet-home.jpg"
                  alt="A renter at home with their emotional support pet after a housing accommodation request"
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
                <span className="text-[11px] font-bold text-gray-700">Calm next steps</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="What should I do if my landlord says my ESA letter is not valid?">
            <p>
              Stay calm and <strong>ask for the reason in writing</strong>. Then make sure your
              letter is <strong>recent</strong>, from a <strong>provider licensed in your
              state</strong>, supports a disability-related need, and is <strong>verifiable</strong> —
              and offer a way to confirm it (license details or a Verification ID).
            </p>
            <p>
              <strong>Re-send it with a short written reasonable-accommodation request</strong>, which
              the landlord <strong>must consider</strong>. A no-pet policy, breed, or size alone is
              generally not a valid reason to deny an approved ESA. If a valid request is still
              refused, use <strong>landlord denial support</strong> and, where appropriate, state or
              federal fair-housing avenues.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* STEPS */}
      <section id="steps" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Step by step
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              How to respond to an ESA denial
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              A calm, documented response gives a housing provider a request they're required to
              reconsider.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {steps.map((item, i) => (
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
        </div>
      </section>

      {/* COMMON REASONS */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Common pushback
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What landlords say — and how to answer
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {reasons.map((item) => (
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

      {/* LIFESTYLE */}
      <LifestyleImageSection
        reverse
        className="bg-[#fdf6ee]"
        image="/assets/lifestyle/woman-laptop-home.jpg"
        alt="A renter writing a written accommodation response at home with their emotional support dog"
        eyebrow="Respond, don't retreat"
        heading="A calm, verifiable response often turns a no around"
        body="Most denials are based on misunderstandings — a no-pet rule, a doubt about the letter, or a request for a pet deposit. A recent, verifiable letter plus a short written accommodation request answers those directly and puts a request in front of the landlord they're required to consider."
        bullets={[
          "Letter from a provider licensed in your state, after a real evaluation.",
          "A Verification ID a landlord can confirm — no medical details exposed.",
          "Landlord denial support if a valid request is refused.",
        ]}
      />

      {/* PRICING */}
      <EsaPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="Responding to an ESA denial: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Get a verifiable letter to back your response
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider. If you qualify, you'll receive a verifiable,
            housing-focused ESA letter — with landlord denial support and a refund if you don't
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
              { to: "/landlord-says-esa-letter-is-fake", title: "Landlord says it's fake?", desc: "Prove a genuine letter and spot real fake-letter warning signs." },
              { to: "/landlord-denied-esa-letter", title: "Landlord denied your ESA?", desc: "Your rights and denial support, by state." },
              { to: "/can-landlord-reject-esa-letter", title: "Can a landlord reject an ESA letter?", desc: "When a request can be denied — and when it can't." },
              { to: "/how-to-verify-esa-letter", title: "How to verify an ESA letter", desc: "Prove your letter is real and verifiable." },
              { to: "/esa-accommodation-request-letter", title: "Accommodation request letter", desc: "Write the request you re-send with your letter." },
              { to: "/what-documents-can-landlord-ask-for-esa", title: "What documents can a landlord ask for?", desc: "What a landlord can reasonably request." },
              { to: "/blog/2026-hud-esa-guidelines", title: "2026 HUD ESA guidelines", desc: "What the 2026 HUD update means for housing ESAs." },
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
