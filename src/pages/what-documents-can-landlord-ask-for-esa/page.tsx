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

const PATH = "/what-documents-can-landlord-ask-for-esa";
const TITLE = "What Documents Can a Landlord Ask For an ESA?";
const DESC =
  "What documents can a landlord ask for an ESA letter? What a housing provider can reasonably request, what they can't ask, and how to keep medical details private.";
const UPDATED_HUMAN = "June 17, 2026";
const UPDATED_ISO = "2026-06-17";

const heroBadges = [
  { icon: "ri-file-list-3-line", label: "What to send" },
  { icon: "ri-lock-2-line", label: "Privacy-safe" },
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

// ── Can ask vs cannot ask
const canAsk = [
  "A letter from a licensed provider confirming you have a disability-related need for the animal — when the disability isn't obvious.",
  "Reliable documentation that reasonably supports the need for a reasonable accommodation.",
  "Confirmation that the letter is authentic and the provider is licensed (for example, license number or a Verification ID).",
  "Basic, non-medical details to process the request — like the animal and your contact information.",
];
const cannotAsk = [
  "Your specific diagnosis, medical records, or detailed clinical history.",
  "Access to your healthcare providers beyond confirming the letter is genuine.",
  "A specific brand of \"registration,\" certificate, ID card, or vest — these have no legal weight.",
  "Pet rent, a pet deposit, or pet fees for an approved assistance animal.",
];

// ── What to prepare / send
const prepare = [
  {
    icon: "ri-file-text-line",
    title: "A verifiable ESA letter",
    desc: "From a mental health professional licensed in your state, written after a real evaluation, naming the provider with their license type and number.",
  },
  {
    icon: "ri-mail-send-line",
    title: "A short accommodation request",
    desc: "A brief written reasonable-accommodation request stating you have a disability-related need and are asking for an exception to the pet policy. Keep medical detail out of it.",
  },
  {
    icon: "ri-qr-code-line",
    title: "A verification path",
    desc: "Offer the provider's license details or, on a PawTenant letter, a Verification ID so the landlord can confirm authenticity without seeing your records.",
  },
  {
    icon: "ri-folder-line",
    title: "Copies for your records",
    desc: "Keep a copy of what you sent and the date. A clear paper trail helps if the landlord follows up or the request stalls.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "What documents can a landlord ask for an ESA?",
    a: "A landlord can ask for documentation that reasonably supports a disability-related need when the disability isn't obvious — typically a letter from a mental health professional licensed in your state confirming you have a need for the emotional support animal. They can also confirm the letter is authentic and the provider is licensed. They generally cannot demand your specific diagnosis, medical records, or a paid \"registration.\"",
  },
  {
    q: "Can a landlord ask for proof of disability for an ESA?",
    a: "A landlord can ask for documentation that reasonably supports a disability-related need, but not for proof of the disability itself in the form of medical records or a specific diagnosis. A letter from a licensed provider stating that you have a disability-related need for the animal is generally sufficient — the underlying clinical details stay private.",
  },
  {
    q: "Can a landlord ask for my diagnosis or medical records?",
    a: "Generally no. Under the Fair Housing Act, a housing provider may request documentation that reasonably supports the need for an accommodation, but not your specific diagnosis or full medical records. A provider's letter confirming the need protects your privacy while still meeting the documentation standard.",
  },
  {
    q: "Do ESA letters need a verification ID?",
    a: "A verification ID isn't legally required, but it helps. A landlord may want to confirm a letter is genuine, and a clear way to verify — such as a provider's license number or a PawTenant Verification ID — makes that fast. Verification confirms authenticity only; it does not expose your diagnosis or clinical detail.",
  },
  {
    q: "Can a landlord contact my therapist or provider?",
    a: "A landlord may seek to confirm that the letter is authentic and the provider is licensed, but they are not entitled to discuss your clinical care or diagnosis. The point of verification is to confirm the letter is genuine — not to access your medical information.",
  },
  {
    q: "Can a landlord require a specific ESA registration or certificate?",
    a: "No. There is no official ESA \"registry\" in the United States, and a registration, certificate, ID card, or vest has no legal weight on its own. What matters is a letter from a licensed provider, written after a real evaluation, that supports a disability-related need.",
  },
  {
    q: "How recent does my ESA documentation need to be?",
    a: "Housing ESA letters are generally treated as current for about 12 months. Many landlords ask for a recent letter, so renewing each year keeps your documentation up to date for lease renewals and new applications.",
  },
  {
    q: "Can a landlord charge a fee to review my ESA documents?",
    a: "A landlord generally cannot charge pet rent, a pet deposit, or pet fees for an approved assistance animal, including for reviewing the documentation. You can still be held responsible for any actual damage the animal causes, like any resident.",
  },
];

export default function WhatDocumentsCanLandlordAskForESAPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "What Documents Can a Landlord Ask For an ESA?",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "What Documents Can a Landlord Ask For an ESA?", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="what documents can a landlord ask for an ESA, can a landlord ask for proof of disability for ESA, can a landlord ask for my diagnosis ESA, do ESA letters need verification ID, landlord wants to verify my ESA letter, ESA documentation for housing"
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
                <i className="ri-file-list-3-line"></i>
                ESA documentation
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                What Documents Can a Landlord Ask For an ESA?
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                When you request an emotional support animal, a landlord can ask for documentation
                that reasonably supports a disability-related need — but not your diagnosis or medical
                records. Here's exactly what a housing provider can and can't ask for, and how to keep
                your private details private.
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
                  href="#can-ask"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  Can &amp; Can't Ask
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/owner-with-dog-laptop.jpg"
                  alt="A renter preparing ESA documentation on a laptop with their emotional support dog"
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
                <span className="text-[11px] font-bold text-gray-700">Your records stay private</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="What can a landlord legally ask for when I submit an ESA letter?">
            <p>
              A landlord can ask for <strong>documentation that reasonably supports a
              disability-related need</strong> when the disability isn't obvious — typically a{" "}
              <strong>letter from a mental health professional licensed in your state</strong>. They
              can also confirm the letter is <strong>authentic</strong> and the provider is licensed.
            </p>
            <p>
              A landlord generally <strong>cannot</strong> demand your{" "}
              <strong>specific diagnosis, medical records</strong>, or a paid{" "}
              <strong>"registration" or certificate</strong> — those have no legal weight. A
              provider's letter confirming the need is usually enough, and your clinical details stay
              private.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* CAN / CANNOT ASK */}
      <section id="can-ask" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              The documentation line
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What a landlord can &amp; can't ask for
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              General Fair Housing guidance — not legal advice. Rules can vary by state and locality.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-emerald-100 p-6">
              <h3 className="text-sm font-bold text-emerald-700 mb-4 flex items-center gap-2">
                <i className="ri-checkbox-circle-fill"></i>
                A landlord generally CAN ask for
              </h3>
              <ul className="space-y-3">
                {canAsk.map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <i className="ri-check-line text-emerald-500 mt-0.5 flex-shrink-0"></i>
                    <span className="text-gray-700 text-sm leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h3 className="text-sm font-bold text-slate-600 mb-4 flex items-center gap-2">
                <i className="ri-close-circle-fill text-slate-400"></i>
                A landlord generally CANNOT ask for
              </h3>
              <ul className="space-y-3">
                {cannotAsk.map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <i className="ri-close-line text-slate-400 mt-0.5 flex-shrink-0"></i>
                    <span className="text-gray-700 text-sm leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-center text-[13px] text-gray-500 mt-7 max-w-2xl mx-auto leading-relaxed">
            For the landlord's side of this, see the{" "}
            <Link to="/landlord-esa-documentation-checklist" className="text-orange-600 font-semibold hover:underline">
              landlord ESA documentation checklist
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
              Tenant checklist
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What to prepare and send
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

      {/* VERIFICATION */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Verification, not exposure
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              How a landlord verifies without seeing your records
            </h2>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-7">
            <ul className="space-y-3.5">
              <li className="flex items-start gap-3">
                <i className="ri-check-line text-emerald-500 mt-0.5 flex-shrink-0"></i>
                <span className="text-gray-700 text-sm leading-relaxed">A landlord can confirm the provider is licensed — for example via the provider's license number or the public NPI registry.</span>
              </li>
              <li className="flex items-start gap-3">
                <i className="ri-check-line text-emerald-500 mt-0.5 flex-shrink-0"></i>
                <span className="text-gray-700 text-sm leading-relaxed">A PawTenant letter includes a unique Verification ID a landlord can confirm — it proves the letter is genuine, nothing more.</span>
              </li>
              <li className="flex items-start gap-3">
                <i className="ri-check-line text-emerald-500 mt-0.5 flex-shrink-0"></i>
                <span className="text-gray-700 text-sm leading-relaxed">Verification confirms authenticity only. It does not reveal your diagnosis, treatment, or any clinical detail.</span>
              </li>
            </ul>
            <p className="text-[13px] text-gray-500 mt-6 leading-relaxed">
              Learn the steps in{" "}
              <Link to="/how-to-verify-esa-letter" className="text-orange-600 font-semibold hover:underline">
                how to verify an ESA letter
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
        image="/assets/lifestyle/person-paperwork-with-dog.jpg"
        alt="A renter organizing ESA accommodation paperwork at home with their emotional support dog"
        eyebrow="Send the right thing once"
        heading="The right documents make the request simple"
        body="When you send a verifiable letter from a licensed provider plus a short written accommodation request, a landlord has exactly what they need to consider your request — and no reason to ask for your private medical details."
        bullets={[
          "Letter from a provider licensed in your state, after a real evaluation.",
          "No diagnosis, medical records, registration, or certificate required.",
          "Landlord denial support if a valid request is pushed back.",
        ]}
      />

      {/* PRICING */}
      <EsaPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="ESA documentation: landlord questions FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Get housing-focused ESA documentation
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider. If you qualify, you'll receive a verifiable ESA letter
            with the details a landlord can reasonably ask for — with a refund if you don't qualify.
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
              { to: "/can-landlord-reject-esa-letter", title: "Can a landlord reject an ESA letter?", desc: "When a request can be denied — and when it can't." },
              { to: "/esa-letter-vs-pet-policy", title: "ESA letter vs pet policy", desc: "Does a no-pet policy apply to an emotional support animal?" },
              { to: "/landlord-esa-documentation-checklist", title: "Landlord documentation checklist", desc: "The landlord's side: what to review and verify." },
              { to: "/esa-accommodation-request-letter", title: "Accommodation request letter", desc: "Write the request you send with your ESA letter." },
              { to: "/how-to-verify-esa-letter", title: "How to verify an ESA letter", desc: "Confirm a letter is real without exposing records." },
              { to: "/how-to-get-esa-letter-online", title: "How to get an ESA letter online", desc: "The full process from assessment to letter." },
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
