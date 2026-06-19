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

const PATH = "/esa-letter-for-apartments";
const TITLE = "ESA Letter for Apartments | Housing Accommodation Guide";
const DESC =
  "How an ESA letter works for apartment renters: a licensed provider evaluation, what to send your property manager, pet fees, verification, and denial support.";
const UPDATED_HUMAN = "June 17, 2026";
const UPDATED_ISO = "2026-06-17";

const heroBadges = [
  { icon: "ri-building-line", label: "Apartment-ready" },
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-home-heart-line", label: "Housing-focused" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

// ── How it works for apartment renters
const steps = [
  {
    icon: "ri-file-list-3-line",
    title: "Complete a short assessment",
    desc: "Answer a brief, private questionnaire about how an emotional support animal helps you at home. It takes just a few minutes.",
  },
  {
    icon: "ri-stethoscope-line",
    title: "Licensed provider evaluation",
    desc: "A licensed mental health professional reviews your assessment and decides whether an ESA is clinically appropriate for you.",
  },
  {
    icon: "ri-mail-send-line",
    title: "Receive a verifiable letter",
    desc: "If you qualify, you receive a housing-focused ESA letter naming the provider and their license — something a property manager can verify.",
  },
  {
    icon: "ri-building-4-line",
    title: "Submit to your apartment",
    desc: "Send the letter with a short accommodation request to your leasing office. They review it like any reasonable-accommodation request.",
  },
];

// ── What a real apartment ESA letter includes
const includes = [
  {
    icon: "ri-user-star-line",
    title: "Named licensed provider",
    desc: "The mental health professional who evaluated you is named, with their license type and state — not an anonymous \"care team.\"",
  },
  {
    icon: "ri-home-heart-line",
    title: "Housing accommodation language",
    desc: "It frames a reasonable-accommodation request for housing under the Fair Housing Act — the right framing for an apartment.",
  },
  {
    icon: "ri-calendar-check-line",
    title: "Issue date",
    desc: "A clear date. Housing ESA letters are generally treated as current for about 12 months, so apartments look at the date.",
  },
  {
    icon: "ri-qr-code-line",
    title: "A way to verify",
    desc: "Provider details and, on PawTenant letters, a Verification ID so a property manager can confirm the letter is genuine.",
  },
];

// ── What apartments CAN and CANNOT ask (two-column)
const canAsk = [
  "Ask for documentation reasonably supporting the need when a disability isn't obvious.",
  "Confirm the letter comes from a licensed provider and is authentic.",
  "Apply the same general lease rules (noise, damage, leash) to your animal.",
  "Decline a specific animal that would be a direct, documented threat or cause substantial damage.",
];
const cannotAsk = [
  "Require a specific diagnosis or your full medical records.",
  "Charge pet rent, a pet deposit, or pet fees for an approved assistance animal.",
  "Refuse based on breed, size, or weight limits alone.",
  "Demand you \"register\" your ESA or buy a certificate, ID card, or vest.",
];

// ── Apartment scenarios
const scenarios = [
  {
    icon: "ri-home-smile-line",
    title: "\"No-pet\" apartment buildings",
    desc: "A reasonable-accommodation request asks the housing provider to make an exception to a no-pet policy for an approved assistance animal. It is reviewed individually — never automatic.",
  },
  {
    icon: "ri-money-dollar-circle-line",
    title: "Pet rent & pet deposits",
    desc: "Apartments generally cannot charge pet rent, pet deposits, or pet fees for an approved ESA. You may still be responsible for any actual damage your animal causes.",
  },
  {
    icon: "ri-ruler-line",
    title: "Breed, size & weight limits",
    desc: "Blanket breed, size, or weight restrictions generally do not apply to an approved assistance animal, though an apartment can still address a documented, individual safety concern.",
  },
  {
    icon: "ri-team-line",
    title: "Leasing offices & property managers",
    desc: "Larger complexes often route requests through a property manager or corporate office. A clearly verifiable letter makes that review faster and calmer.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "Do I need an ESA letter to keep my pet in an apartment?",
    a: "To request a reasonable accommodation for an emotional support animal in an apartment — such as an exception to a no-pet policy or waived pet fees — you generally need a letter from a mental health professional licensed in your state, written after a real evaluation. The letter supports your request under the Fair Housing Act, but each request is reviewed individually by the housing provider.",
  },
  {
    q: "Can an apartment legally reject my ESA?",
    a: "An apartment can deny a request in limited situations — for example, if the specific animal would be a direct threat to others' safety or cause substantial physical damage that can't be reduced, or if the documentation doesn't reasonably support the need. An apartment generally cannot reject an ESA based only on a no-pet policy, breed, size, or weight. If you're denied, there are calm next steps and landlord denial support.",
  },
  {
    q: "Can my apartment charge pet rent or a pet deposit for an ESA?",
    a: "Generally no. Approved assistance animals are not treated as pets, so apartments usually cannot charge pet rent, pet deposits, or pet fees for them. You can still be held responsible for any actual damage the animal causes, just like any resident.",
  },
  {
    q: "What do I send to my apartment's leasing office?",
    a: "Typically a short written reasonable-accommodation request plus your ESA letter from the licensed provider. The letter should name the provider, their license type and state, and be verifiable. You generally do not need to share your diagnosis or medical records — only documentation that reasonably supports the need.",
  },
  {
    q: "Does my apartment ESA letter need to be from a provider in my state?",
    a: "In most cases, yes — the letter should come from a mental health professional licensed in the state where you live. Some states also have specific rules, such as a provider-relationship period. PawTenant connects you with providers licensed in your state so the letter is appropriate for your apartment.",
  },
  {
    q: "How long is an apartment ESA letter valid?",
    a: "Housing ESA letters are generally treated as current for about 12 months. Many apartments ask for a recent letter, so renewing each year keeps your documentation up to date for lease renewals and new applications.",
  },
  {
    q: "Can my apartment verify my ESA letter?",
    a: "Yes. A property manager can confirm that the provider is licensed and that the letter is authentic — for example by checking the provider's license or NPI, or using a Verification ID on a PawTenant letter. Verification confirms authenticity only; it does not expose your diagnosis or medical records.",
  },
  {
    q: "Is an apartment ESA letter the same as a service dog?",
    a: "No. An emotional support animal is covered for housing under the Fair Housing Act and provides comfort. A psychiatric service dog (PSD) is individually trained to perform tasks for a disability and is covered under the ADA in public places. They are different categories with different documentation.",
  },
];

export default function ESALetterForApartmentsPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "ESA Letter for Apartments",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "ESA Letter for Apartments", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="ESA letter for apartments, emotional support animal apartment, ESA apartment no pet policy, apartment ESA pet rent, ESA letter property manager, apartment reasonable accommodation ESA, ESA letter renters"
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
                <i className="ri-building-line"></i>
                ESA for apartment renters
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                ESA Letter for Apartments
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                Renting an apartment with an emotional support animal? A real ESA letter comes from a
                licensed provider after an evaluation and supports a housing accommodation request —
                so a no-pet policy or pet fees don't have to come between you and your animal.
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
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  How It Works
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/woman-with-dog-new-apartment.jpg"
                  alt="A renter moving into a new apartment with her emotional support dog"
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
                <span className="text-[11px] font-bold text-gray-700">Housing-focused letter</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="How does an ESA letter work for an apartment?">
            <p>
              For an apartment, an ESA letter supports a{" "}
              <strong>reasonable-accommodation request under the Fair Housing Act</strong>. You send
              the leasing office a short written request plus a letter from a{" "}
              <strong>mental health professional licensed in your state</strong>, written after a real
              evaluation.
            </p>
            <p>
              Approved assistance animals are generally <strong>exempt from no-pet policies, pet
              rent, and pet deposits</strong> — but each request is reviewed individually, and{" "}
              <strong>no service can guarantee a landlord's decision</strong>. There is no ESA
              "registry"; a registration or certificate carries no weight.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Step by step
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Getting an apartment ESA letter
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              A calm, four-step process from assessment to a letter you can hand to your leasing
              office.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* WHAT THE LETTER INCLUDES */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              What's in the letter
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What a real apartment ESA letter includes
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              A property manager looks for these details. The more a letter has, the more readily it's
              accepted.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {includes.map((item) => (
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

      {/* CAN / CANNOT ASK */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Apartment rules
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What an apartment can &amp; can't ask
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              General Fair Housing guidance — not legal advice. Rules can vary by state and locality.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-emerald-100 p-6">
              <h3 className="text-sm font-bold text-emerald-700 mb-4 flex items-center gap-2">
                <i className="ri-checkbox-circle-fill"></i>
                An apartment generally CAN
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
                An apartment generally CANNOT
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
            For more on fees, see our{" "}
            <Link to="/esa-pet-rent-deposit" className="text-orange-600 font-semibold hover:underline">
              ESA pet rent &amp; deposit guide
            </Link>
            .
          </p>
        </div>
      </section>

      {/* SCENARIOS */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Common apartment situations
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              ESA scenarios apartment renters ask about
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {scenarios.map((item) => (
              <div key={item.title} className="bg-[#fafafa] rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${item.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pet rent savings teaser → links to the full /pet-rent-savings-calculator */}
      <PetRentSavingsMini
        className="bg-white"
        heading="How much could apartment pet rent cost over time?"
        copy="Apartment pet rent can quietly add up year over year. Estimate the one-year total, then open the full calculator for 1, 2, and 5-year potential savings."
      />

      {/* BY STATE */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-8">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Apartment ESAs by state
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              State-specific apartment ESA guides
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              Some states add their own rules on top of the Fair Housing Act. If you rent in one of
              these, start with the state guide.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { to: "/california-esa-letter-for-apartments", label: "California apartment ESA letters", note: "AB 468 30-day rule" },
              { to: "/texas-esa-letter-for-apartments", label: "Texas apartment ESA letters", note: "Large property managers" },
              { to: "/florida-esa-letter-for-apartments", label: "Florida apartment ESA letters", note: "Statute 760.27 & condos" },
              { to: "/new-york-esa-letter-for-apartments", label: "New York apartment ESA letters", note: "Co-ops & board review" },
            ].map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className="group flex items-center justify-between gap-3 bg-white rounded-xl border border-gray-200 px-5 py-4 hover:border-orange-200 hover:shadow-sm transition cursor-pointer"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900 leading-snug">{s.label}</span>
                  <span className="block text-[12px] text-gray-500">{s.note}</span>
                </span>
                <i className="ri-arrow-right-line text-orange-500 flex-shrink-0 group-hover:translate-x-0.5 transition-transform"></i>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* LIFESTYLE */}
      <LifestyleImageSection
        reverse
        className="bg-[#fdf6ee]"
        image="/assets/lifestyle/person-paperwork-with-dog.jpg"
        alt="A renter preparing an apartment accommodation request at home with their emotional support dog"
        eyebrow="Make the request with confidence"
        heading="A verifiable letter makes your apartment request easier"
        body="When your letter clearly names a licensed provider and offers a way to confirm it, a leasing office can review your request quickly — and you can make your accommodation request without handing over private medical details."
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
            heading="Apartment ESA letters: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Ready to request your apartment accommodation?
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider. If you qualify, you'll receive a verifiable,
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
              { to: "/esa-letter-for-landlord", title: "ESA letter for your landlord", desc: "How housing accommodation works and what to send." },
              { to: "/esa-accommodation-request-letter", title: "Accommodation request letter", desc: "Write the request you send with your ESA letter." },
              { to: "/esa-pet-rent-deposit", title: "ESA pet rent & deposits", desc: "When apartment pet fees and deposits may not apply." },
              { to: "/landlord-denied-esa-letter", title: "Apartment denied your ESA?", desc: "Calm next steps and denial support, by state." },
              { to: "/how-to-verify-esa-letter", title: "How to verify an ESA letter", desc: "Make sure your letter is real and verifiable." },
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
