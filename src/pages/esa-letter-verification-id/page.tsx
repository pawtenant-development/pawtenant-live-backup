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

const PATH = "/esa-letter-verification-id";
const TITLE = "ESA Letter Verification ID: What It Is & Why It Helps";
const DESC =
  "What an ESA letter verification ID is, whether ESA letters need one, and how a landlord uses it to confirm a letter is genuine without seeing your medical details.";
const UPDATED_HUMAN = "June 17, 2026";
const UPDATED_ISO = "2026-06-17";

const heroBadges = [
  { icon: "ri-qr-code-line", label: "Verification ID" },
  { icon: "ri-lock-2-line", label: "Privacy-safe" },
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

// ── What a verification ID is / does
const whatItIs = [
  {
    icon: "ri-fingerprint-line",
    title: "A unique code on the letter",
    desc: "A Verification ID is a unique reference printed on a PawTenant ESA letter that ties the document to a real, provider-issued record.",
  },
  {
    icon: "ri-shield-check-line",
    title: "A way to confirm authenticity",
    desc: "A landlord can use it to confirm the letter is genuine and was actually issued — not edited, copied, or invented.",
  },
  {
    icon: "ri-lock-2-line",
    title: "Privacy by design",
    desc: "It confirms the letter is real and the provider is licensed. It does not reveal your diagnosis, treatment, or any clinical detail.",
  },
  {
    icon: "ri-links-line",
    title: "Pairs with the provider license",
    desc: "Alongside the provider's license number and the public NPI registry, a Verification ID gives a landlord a fast, reliable check.",
  },
];

// ── How a landlord uses it
const landlordSteps = [
  {
    icon: "ri-file-text-line",
    title: "Find the ID on the letter",
    desc: "The Verification ID appears on the PawTenant ESA letter itself, usually near the footer with the provider's details.",
  },
  {
    icon: "ri-global-line",
    title: "Confirm it's genuine",
    desc: "The landlord uses the ID to confirm the letter is authentic — proof it was issued, not fabricated or altered.",
  },
  {
    icon: "ri-user-star-line",
    title: "Check the provider license",
    desc: "They can also confirm the named provider is licensed via the license number or the public NPI registry.",
  },
  {
    icon: "ri-eye-off-line",
    title: "See authenticity, not records",
    desc: "Verification returns only that the letter is genuine. Your medical information is never disclosed in the process.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "Do ESA letters need a verification ID?",
    a: "A verification ID isn't legally required for an ESA letter to be valid — validity comes from a licensed provider evaluation. But a Verification ID is very helpful: it lets a landlord confirm the letter is genuine quickly, which reduces back-and-forth and doubt. PawTenant includes a unique Verification ID on its letters for exactly this reason.",
  },
  {
    q: "What is an ESA letter verification ID?",
    a: "It's a unique reference code printed on a PawTenant ESA letter that ties the document to a real, provider-issued record. A landlord can use it to confirm the letter is authentic — that it was actually issued and hasn't been edited or copied — without ever seeing your diagnosis or medical records.",
  },
  {
    q: "How do I verify a PawTenant ESA letter?",
    a: "Use the Verification ID printed on the letter to confirm it's genuine, and confirm the named provider is licensed via their license number or the public NPI registry. Verification proves the letter is authentic; it does not expose your clinical details. See our how-to-verify-an-ESA-letter guide for the full steps.",
  },
  {
    q: "Can my landlord call the provider to verify my ESA letter?",
    a: "A landlord may seek to confirm a letter is authentic and the provider is licensed, but they are not entitled to discuss your diagnosis or care. A Verification ID and the provider's license number let them confirm authenticity without contacting your provider about clinical matters.",
  },
  {
    q: "Does a verification ID reveal my diagnosis or medical records?",
    a: "No. A Verification ID confirms only that the letter is genuine and provider-issued. It does not reveal your diagnosis, treatment, or any clinical detail — verification is about authenticity, not access to your health information.",
  },
  {
    q: "Is an ESA letter without a verification ID still valid?",
    a: "It can be. Validity comes from a licensed provider evaluation, a disability-related need statement, and verifiable provider license details — not specifically from a Verification ID. A Verification ID simply makes confirming authenticity faster and easier, which can help a landlord accept the letter with less friction.",
  },
  {
    q: "Where is the verification ID on my ESA letter?",
    a: "On a PawTenant letter, the Verification ID is printed on the document itself, typically near the provider's signature and license details in the footer. If you can't find it, contact support and we can help you locate or confirm it.",
  },
  {
    q: "Can a landlord trust a verification ID over an online registration?",
    a: "Yes — they're very different. An online \"registration\" or certificate has no legal weight and proves nothing. A Verification ID, paired with a licensed provider's name and license number, lets a landlord confirm the letter is a genuine, provider-issued document. Real verification beats a bought registration every time.",
  },
];

export default function ESALetterVerificationIdPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "ESA Letter Verification ID: What It Is and How It Works",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "ESA Letter Verification ID", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="ESA letter verification ID, do ESA letters need a verification ID, how to verify PawTenant ESA letter, can my landlord call the provider to verify my ESA letter, ESA letter verification, verify ESA letter authenticity"
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
                <i className="ri-qr-code-line"></i>
                ESA verification
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                ESA Letter Verification ID: What It Is and How It Works
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                A Verification ID is what turns "is this letter real?" into a quick, factual check. It
                lets a landlord confirm your ESA letter is genuine — without ever seeing your medical
                details. Here's what it is, whether you need one, and how it's used.
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
                  href="#what-it-is"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  What It Is
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/owner-with-dog-laptop.jpg"
                  alt="A renter locating the verification ID on their ESA letter with their dog nearby"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-lock-2-line text-emerald-600"></i>
                <span className="text-[11px] font-bold text-gray-700">Authenticity, not records</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="Do ESA letters need a verification ID?">
            <p>
              A Verification ID <strong>isn't legally required</strong> for an ESA letter to be valid —
              validity comes from a <strong>licensed provider evaluation</strong>. But it's very
              helpful: it lets a landlord <strong>confirm the letter is genuine</strong> quickly,
              which cuts down doubt and back-and-forth.
            </p>
            <p>
              A Verification ID is a <strong>unique code on the letter</strong> that confirms it was
              actually issued by the provider. It proves <strong>authenticity only</strong> — it does{" "}
              <strong>not reveal your diagnosis or medical records</strong>. PawTenant includes one on
              every letter, alongside the provider's verifiable license details.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* WHAT IT IS */}
      <section id="what-it-is" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              The basics
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What an ESA letter verification ID is
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {whatItIs.map((item) => (
              <div key={item.title} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${item.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 max-w-3xl mx-auto">
            <div className="grid sm:grid-cols-2 gap-6 sm:gap-8 items-center rounded-2xl border border-gray-100 bg-white p-6 sm:p-8 shadow-[0_10px_34px_-20px_rgba(15,23,42,0.22)]">
              <div className="w-full max-w-[300px] mx-auto">
                <SampleLetterCard />
              </div>
              <div className="text-center sm:text-left">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 leading-snug">
                  Where your Verification ID appears
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                  On a PawTenant ESA letter, the Verification ID sits alongside the licensed
                  provider's name, license number, and signature — so a landlord can confirm it at a
                  glance.
                </p>
                <ul className="space-y-2.5 text-left">
                  <li className="flex items-start gap-2.5">
                    <i className="ri-fingerprint-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                    <span className="text-gray-700 text-sm leading-relaxed">Unique to your provider-issued letter.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <i className="ri-shield-check-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                    <span className="text-gray-700 text-sm leading-relaxed">Lets a landlord confirm the letter is genuine.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <i className="ri-lock-2-line text-orange-500 mt-0.5 flex-shrink-0"></i>
                    <span className="text-gray-700 text-sm leading-relaxed">Never reveals your diagnosis or medical records.</span>
                  </li>
                </ul>
                <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
                  Sample letter — names and details are placeholders.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW LANDLORD USES IT */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              In practice
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              How a landlord uses your verification ID
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {landlordSteps.map((item, i) => (
              <div key={item.title} className="bg-[#fafafa] rounded-2xl border border-gray-100 p-6">
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
          <p className="text-center text-[13px] text-gray-500 mt-8 max-w-2xl mx-auto leading-relaxed">
            For the full walkthrough, see{" "}
            <Link to="/how-to-verify-esa-letter" className="text-orange-600 font-semibold hover:underline">
              how to verify an ESA letter
            </Link>{" "}
            and the landlord-facing{" "}
            <Link to="/esa-letter-verification" className="text-orange-600 font-semibold hover:underline">
              ESA letter verification page
            </Link>
            .
          </p>
        </div>
      </section>

      {/* LIFESTYLE */}
      <LifestyleImageSection
        reverse
        className="bg-[#fdf6ee]"
        image="/assets/lifestyle/woman-laptop-home.jpg"
        alt="A renter confirming the verification details on their ESA letter at home with their dog"
        eyebrow="Trust, verified"
        heading="A Verification ID makes a landlord's check effortless"
        body="When a landlord can confirm your letter with a single reference code, you skip the suspicion and the document requests. A Verification ID — paired with a licensed provider's name and license number — proves the letter is real while keeping your health information completely private."
        bullets={[
          "Confirms the letter is genuine and provider-issued.",
          "Never reveals your diagnosis, treatment, or records.",
          "Landlord denial support if a valid request is pushed back.",
        ]}
      />

      {/* PRICING */}
      <EsaPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="ESA letter verification ID: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Get a letter with a Verification ID
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider. If you qualify, your housing-focused ESA letter includes
            a Verification ID a landlord can confirm — with a refund if you don't qualify.
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
              { to: "/landlord-says-esa-letter-is-fake", title: "Landlord says it's fake?", desc: "Use your Verification ID to prove it's genuine." },
              { to: "/what-makes-esa-letter-valid", title: "What makes an ESA letter valid?", desc: "The elements a housing letter must include." },
              { to: "/what-documents-can-landlord-ask-for-esa", title: "What documents can a landlord ask for?", desc: "What a landlord can reasonably request — and can't." },
              { to: "/landlord-esa-documentation-checklist", title: "Landlord documentation checklist", desc: "The landlord's side: what to review and verify." },
              { to: "/esa-letter-for-apartments", title: "ESA letter for apartments", desc: "The full apartment ESA housing guide." },
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
