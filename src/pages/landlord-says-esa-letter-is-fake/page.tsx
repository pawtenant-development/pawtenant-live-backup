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

const PATH = "/landlord-says-esa-letter-is-fake";
const TITLE = "Landlord Says My ESA Letter Is Fake — What to Do";
const DESC =
  "Landlord says your ESA letter is fake? How to prove it's genuine, the warning signs of an actually-fake letter, and how to respond with verification and support.";
const UPDATED_HUMAN = "June 17, 2026";
const UPDATED_ISO = "2026-06-17";

const heroBadges = [
  { icon: "ri-shield-check-line", label: "Prove it's genuine" },
  { icon: "ri-qr-code-line", label: "Verification ID" },
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

// ── Steps to prove a genuine letter
const proveSteps = [
  {
    icon: "ri-chat-3-line",
    title: "Ask what specifically concerns them",
    desc: "Politely ask the landlord, in writing, why they doubt the letter. Often it's a single thing — a missing license number, an unfamiliar provider, or just an online source.",
  },
  {
    icon: "ri-qr-code-line",
    title: "Offer the verification path",
    desc: "Share the provider's license number or the Verification ID on a PawTenant letter so they can confirm it's authentic — without seeing your medical records.",
  },
  {
    icon: "ri-search-eye-line",
    title: "Point to the public license",
    desc: "A landlord can confirm the provider is real and licensed on the public NPI registry or the state licensing board. A genuine letter names a verifiable provider.",
  },
  {
    icon: "ri-mail-send-line",
    title: "Re-send with an accommodation request",
    desc: "Send the letter again alongside a short written reasonable-accommodation request, which the landlord is required to consider.",
  },
  {
    icon: "ri-lifebuoy-line",
    title: "Use landlord denial support",
    desc: "If a genuine, valid request is still refused, PawTenant offers landlord denial support to help you respond calmly and correctly.",
  },
];

// ── Warning signs of an actually fake letter (helpful for tenants AND landlords)
const fakeSigns = [
  "No named provider, or no license type, number, or state listed.",
  "Issued instantly with no evaluation, questionnaire, or provider contact.",
  "Sold as a \"registration,\" certificate, ID card, or vest — none of which are valid documentation.",
  "Claims to guarantee landlord approval or to make an animal an \"official\" ESA.",
  "No way to verify it — no license number, no Verification ID, no contactable provider.",
  "Generic template language with no signature or letterhead.",
];

const faqs: FaqItem[] = [
  {
    q: "My landlord says my ESA letter is fake — what should I do?",
    a: "Stay calm and ask, in writing, what specifically concerns them. Then prove it's genuine: share the provider's license number or the Verification ID on your letter so they can confirm authenticity, point them to the public NPI registry or state licensing board, and re-send the letter with a short reasonable-accommodation request. If a genuine, valid request is still refused, use landlord denial support and, where appropriate, fair-housing avenues.",
  },
  {
    q: "How do I prove my ESA letter is real?",
    a: "A genuine ESA letter names a mental health professional with their license type, number, and state, is dated recently, and offers a way to verify it. You can prove it by sharing the license number (which a landlord can check on the public NPI registry or state board) and, on a PawTenant letter, the Verification ID. Verification confirms the letter is authentic without revealing your diagnosis.",
  },
  {
    q: "Can a landlord reject an ESA letter from an online provider?",
    a: "Not simply because it's online. A letter from a provider licensed in your state who evaluated you via telehealth is valid for housing, and a landlord must consider the reasonable-accommodation request. They can deny in limited, individualized situations — such as a documented direct threat or substantial damage — but \"online\" alone is not a valid reason. No service can guarantee a landlord's decision.",
  },
  {
    q: "What are the warning signs of a fake ESA letter?",
    a: "Red flags include: no named, licensed provider or license number; a letter issued instantly with no evaluation; anything sold as a \"registration,\" certificate, ID card, or vest; claims of guaranteed approval; and no way to verify it. A genuine letter comes from a licensed provider after a real evaluation and can be verified.",
  },
  {
    q: "Can my landlord call the provider to verify my ESA letter?",
    a: "A landlord may seek to confirm that the letter is authentic and the provider is licensed, but they are not entitled to discuss your diagnosis or clinical care. The purpose of verification is to confirm the letter is genuine — for example via a license number, the public NPI registry, or a Verification ID — not to access your medical information.",
  },
  {
    q: "What if my ESA letter actually was issued without an evaluation?",
    a: "If your letter was bought as a \"registration\" or issued instantly without any evaluation, it may not hold up as valid housing documentation. The fix is a proper licensed provider evaluation — if you qualify, you receive a verifiable, housing-valid letter, with a refund if you don't qualify.",
  },
  {
    q: "Does a landlord have to accept my ESA after I prove it's real?",
    a: "A landlord must consider a reasonable-accommodation request supported by valid documentation, but \"must consider\" is not the same as \"must accept.\" Once authenticity is confirmed, a no-pet policy, breed, or size alone is generally not a valid reason to deny — but they can still deny in limited, individualized situations. No legitimate service can guarantee landlord acceptance.",
  },
  {
    q: "Should I get a new ESA letter if my landlord doubts mine?",
    a: "Only if your current letter isn't actually valid — for example, if it has no named licensed provider, no license number, or was issued without an evaluation. If your letter is genuine, you usually don't need a new one; you need to verify it. If it isn't genuine, a real licensed provider evaluation gives you a letter that holds up.",
  },
];

export default function LandlordSaysESALetterIsFakePage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "Landlord Says My ESA Letter Is Fake — What to Do",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Landlord Says My ESA Letter Is Fake", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="landlord says my ESA letter is fake, how to prove ESA letter is real, fake ESA letter warning signs, can landlord reject ESA letter from online provider, can my landlord call the provider to verify my ESA letter, prove ESA letter genuine"
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
                <i className="ri-shield-check-line"></i>
                Prove it's genuine
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                Landlord Says My ESA Letter Is Fake — What to Do
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                A landlord doubting your letter is usually a verification problem, not a dead end. If
                your letter is genuine, you can prove it quickly. Here's how to demonstrate
                authenticity, the warning signs of an actually-fake letter, and how to respond.
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
                  href="#prove-steps"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  How to Prove It
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/person-paperwork-with-dog.jpg"
                  alt="A renter gathering proof that their ESA letter is genuine, at home with their dog"
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
                <span className="text-[11px] font-bold text-gray-700">Verifiable, not exposed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="My landlord says my ESA letter is fake — what should I do?">
            <p>
              Stay calm and <strong>ask, in writing, what specifically concerns them</strong>. Then{" "}
              <strong>prove it's genuine</strong>: share the provider's{" "}
              <strong>license number</strong> or the <strong>Verification ID</strong> on your letter,
              and point them to the <strong>public NPI registry</strong> or state licensing board.
            </p>
            <p>
              Re-send the letter with a short <strong>reasonable-accommodation request</strong>, which
              the landlord <strong>must consider</strong>. Being from an{" "}
              <strong>online (telehealth) provider is not a valid reason</strong> to call a letter
              fake. If a genuine, valid request is still refused, use{" "}
              <strong>landlord denial support</strong> — though no service can guarantee a landlord's
              decision.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* PROVE STEPS */}
      <section id="prove-steps" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Step by step
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              How to prove your ESA letter is genuine
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              If your letter is real, these steps usually resolve a landlord's doubt quickly.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {proveSteps.map((item, i) => (
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

      {/* WARNING SIGNS */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              For tenants &amp; landlords
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Warning signs of an actually-fake ESA letter
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              If your "letter" shows any of these, a landlord's doubt may be fair — and a real
              evaluation is the fix.
            </p>
          </div>
          <div className="bg-[#fafafa] rounded-2xl border border-gray-200 p-6 sm:p-7">
            <ul className="space-y-3.5">
              {fakeSigns.map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <i className="ri-alert-line text-amber-500 mt-0.5 flex-shrink-0"></i>
                  <span className="text-gray-700 text-sm leading-relaxed">{t}</span>
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-gray-500 mt-6 leading-relaxed">
              Compare against{" "}
              <Link to="/what-makes-esa-letter-valid" className="text-orange-600 font-semibold hover:underline">
                what makes an ESA letter valid
              </Link>
              .
            </p>
          </div>
          <div className="max-w-[220px] mx-auto mt-10">
            <SampleLetterCard size="compact" />
            <p className="text-center text-[11px] text-gray-400 mt-3 leading-relaxed">
              A genuine letter looks like this — from a licensed provider, with verification details.
              Sample.
            </p>
          </div>
        </div>
      </section>

      {/* LIFESTYLE */}
      <LifestyleImageSection
        reverse
        className="bg-[#fdf6ee]"
        image="/assets/lifestyle/woman-telehealth-with-dog.jpg"
        alt="A renter on a telehealth evaluation at home with their emotional support dog"
        eyebrow="Doubt, meet proof"
        heading="A verifiable letter answers 'is this fake?' instantly"
        body="The reason a genuine PawTenant letter holds up is simple: it names a provider licensed in your state, it's dated, and it carries a Verification ID a landlord can confirm. That turns a vague accusation into a quick, factual check — with your private details kept private."
        bullets={[
          "Provider license number a landlord can confirm publicly.",
          "A Verification ID that proves authenticity, not your diagnosis.",
          "Landlord denial support if a valid request is refused.",
        ]}
      />

      {/* PRICING */}
      <EsaPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="Landlord says it's fake: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Get a verifiable letter that holds up
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider. If you qualify, you'll receive a genuine, verifiable
            ESA letter with a Verification ID a landlord can confirm — with a refund if you don't
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
              { to: "/how-to-verify-esa-letter", title: "How to verify an ESA letter", desc: "Step-by-step verification for tenants and landlords." },
              { to: "/esa-letter-verification-id", title: "ESA letter verification ID", desc: "What it is and how a landlord uses it." },
              { to: "/what-makes-esa-letter-valid", title: "What makes an ESA letter valid?", desc: "The elements a housing letter must include." },
              { to: "/how-to-respond-to-esa-letter-denial", title: "How to respond to a denial", desc: "Calm steps for any landlord pushback." },
              { to: "/landlord-denied-esa-letter", title: "Landlord denied your ESA?", desc: "Your rights and denial support, by state." },
              { to: "/can-landlord-reject-esa-letter", title: "Can a landlord reject an ESA letter?", desc: "When a request can be denied — and when it can't." },
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
