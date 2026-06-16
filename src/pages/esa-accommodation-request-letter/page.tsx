import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import Hud2026UpdateBanner from "../../components/feature/Hud2026UpdateBanner";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
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

const PATH = "/esa-accommodation-request-letter";
const TITLE = "ESA Accommodation Request Letter | What to Send Your Landlord";
const DESC =
  "Write a clear ESA reasonable-accommodation request letter for housing: what to include, a simple template, and how it pairs with your licensed provider's ESA letter.";
const UPDATED_HUMAN = "June 17, 2026";
const UPDATED_ISO = "2026-06-17";

const heroBadges = [
  { icon: "ri-mail-line", label: "Request letter" },
  { icon: "ri-home-heart-line", label: "Fair Housing request" },
  { icon: "ri-user-star-line", label: "Pairs with provider letter" },
  { icon: "ri-lock-2-line", label: "Privacy-safe" },
];

// ── Two documents — clarify the difference
const twoDocs = [
  {
    icon: "ri-edit-2-line",
    title: "Your accommodation request",
    desc: "A short letter YOU write to your landlord or property manager, asking for a reasonable accommodation for your emotional support animal. It's a polite, plain request — not a clinical document.",
  },
  {
    icon: "ri-stethoscope-line",
    title: "The provider's ESA letter",
    desc: "The supporting documentation from a mental health professional licensed in your state, written after a real evaluation. It confirms there's a disability-related need an ESA helps with.",
  },
];

// ── What to include in the request letter
const includes = [
  {
    icon: "ri-user-line",
    title: "Your name & unit",
    desc: "Your name, the property address, and your unit or application reference so the request is easy to match to your file.",
  },
  {
    icon: "ri-home-heart-line",
    title: "A clear accommodation request",
    desc: "State plainly that you are requesting a reasonable accommodation for an emotional support animal under the Fair Housing Act.",
  },
  {
    icon: "ri-file-text-line",
    title: "Reference your ESA letter",
    desc: "Note that a letter from your licensed provider is attached, supporting the need — without restating any diagnosis.",
  },
  {
    icon: "ri-list-check-2",
    title: "What you're asking for",
    desc: "Be specific: an exception to a no-pet policy, waived pet rent or pet deposit, or both — whatever applies to your housing.",
  },
  {
    icon: "ri-shake-hands-line",
    title: "A cooperative tone",
    desc: "Offer to provide reasonable documentation and to discuss next steps. A calm, respectful tone keeps the review smooth.",
  },
  {
    icon: "ri-mail-send-line",
    title: "How to reach you",
    desc: "Your phone or email and the date, so the leasing office can follow up and log the request promptly.",
  },
];

// ── Do / Don't
const dos = [
  "Keep it short, polite, and specific to housing.",
  "Attach the provider's ESA letter as supporting documentation.",
  "Say you're happy to provide reasonable documentation.",
  "Keep a dated copy of everything you send.",
];
const donts = [
  "Don't share your full diagnosis or medical records.",
  "Don't claim public-access, airline, or \"go anywhere\" rights.",
  "Don't rely on a \"registration,\" certificate, or ID card.",
  "Don't demand guaranteed approval — requests are reviewed individually.",
];

// ── Simple structure (template outline)
const templateBlocks = [
  {
    label: "Greeting",
    text: "Dear [Landlord / Property Manager name],",
  },
  {
    label: "The request",
    text: "I am writing to request a reasonable accommodation for my emotional support animal under the Fair Housing Act. I have a disability-related need that my emotional support animal helps with.",
  },
  {
    label: "Supporting documentation",
    text: "Attached is a letter from my licensed mental health provider supporting this need. I'm glad to provide additional reasonable documentation if helpful.",
  },
  {
    label: "What you're asking for",
    text: "I respectfully request an exception to the no-pet policy and that pet fees/deposits not be applied to my assistance animal. I will, of course, remain responsible for any damage.",
  },
  {
    label: "Close",
    text: "Thank you for considering my request. Please let me know if you need anything further. Sincerely, [Your name, unit, date, contact].",
  },
];

const faqs: FaqItem[] = [
  {
    q: "What is an ESA accommodation request letter?",
    a: "It's the short letter you write to your landlord or property manager asking for a reasonable accommodation for your emotional support animal — for example, an exception to a no-pet policy or waived pet fees. It's separate from the clinical ESA letter your licensed provider writes; the request is your plain-language ask, and the provider's letter is the supporting documentation.",
  },
  {
    q: "Do I write the accommodation request, or does the provider?",
    a: "You write the accommodation request to your landlord. A mental health professional licensed in your state writes the supporting ESA letter after evaluating you. You send the two together: your request plus the provider's letter as documentation.",
  },
  {
    q: "What should the request letter include?",
    a: "Your name, address, and unit; a clear statement that you're requesting a reasonable accommodation for an emotional support animal under the Fair Housing Act; a reference to the attached provider letter; exactly what you're asking for (no-pet exception, waived pet fees, or both); a cooperative offer to provide reasonable documentation; and your contact details and the date. You do not need to disclose your diagnosis.",
  },
  {
    q: "Do I have to share my diagnosis in the request?",
    a: "Generally no. A landlord can ask for documentation that reasonably supports the need, but usually cannot require a specific diagnosis or your full medical records. Your provider's letter confirms there is a disability-related need without exposing clinical detail, so your request can stay privacy-safe.",
  },
  {
    q: "Does sending a request letter guarantee approval?",
    a: "No. A reasonable-accommodation request is reviewed individually by the housing provider, and no service can guarantee approval or that a landlord will say yes. A clear request paired with a verifiable provider letter gives your request the strongest, most professional footing — and if a valid request is denied, there are calm next steps and landlord denial support.",
  },
  {
    q: "How should I send the accommodation request?",
    a: "In writing — email or a dated letter — so there's a clear record. Keep a copy of your request and the provider's letter, plus the date you sent them. A written trail helps if you ever need to follow up on the request.",
  },
  {
    q: "Do I need a new request letter each year?",
    a: "Your written request is usually a one-time ask for your current housing, but housing ESA letters are generally treated as current for about 12 months. Many landlords ask for a recent provider letter at lease renewal, so renewing the provider letter each year keeps your documentation up to date.",
  },
];

export default function ESAAccommodationRequestLetterPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "ESA Accommodation Request Letter",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "ESA Accommodation Request Letter", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="ESA accommodation request letter, reasonable accommodation request ESA, ESA request letter to landlord, emotional support animal request letter, ESA housing request template, how to ask landlord for ESA"
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
                <i className="ri-mail-line"></i>
                Housing accommodation request
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                ESA Accommodation Request Letter
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                The request letter is the short, plain note you send your landlord — and it pairs with
                the ESA letter from your licensed provider. Here's exactly what to include, plus a
                simple structure you can follow.
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
                  href="#template"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-file-text-line"></i>
                  See the Template
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/person-paperwork-with-dog.jpg"
                  alt="A tenant preparing a written ESA accommodation request at home with their emotional support dog"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-mail-check-line text-emerald-600"></i>
                <span className="text-[11px] font-bold text-gray-700">Clear written request</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="What is an ESA accommodation request letter, and how do I write one?">
            <p>
              An ESA accommodation request letter is a <strong>short letter you write to your
              landlord</strong> asking for a reasonable accommodation for your emotional support
              animal under the <strong>Fair Housing Act</strong> — such as an exception to a no-pet
              policy or waived pet fees.
            </p>
            <p>
              You send it with the <strong>ESA letter from your licensed provider</strong> as
              supporting documentation. Keep it polite and specific, reference the attached letter,
              and you <strong>do not need to share your diagnosis</strong>. The request is reviewed
              individually — approval is never guaranteed.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* TWO DOCUMENTS */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Two documents, one request
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Your request vs the provider's letter
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              These are different — and they work together. Knowing the difference keeps your request
              clean and credible.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {twoDocs.map((item) => (
              <div key={item.title} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="w-11 h-11 flex items-center justify-center bg-orange-50 rounded-xl mb-4">
                  <i className={`${item.icon} text-orange-500 text-2xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-2 text-base">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT TO INCLUDE */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              What to include
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Six things every request letter should have
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        </div>
      </section>

      {/* TEMPLATE OUTLINE */}
      <section id="template" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Simple structure
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              A sample request letter outline
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              A general template you can adapt — not legal advice. Replace the brackets with your
              details.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-[0_8px_30px_-22px_rgba(15,23,42,0.25)]">
            {templateBlocks.map((b, i) => (
              <div
                key={b.label}
                className={`px-6 py-5 ${i !== 0 ? "border-t border-gray-100" : ""}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-orange-500 mb-1.5">
                  {b.label}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">{b.text}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[12px] text-gray-400 mt-4 leading-relaxed">
            Sample wording for illustration only. Adapt it to your housing and check your state and
            local rules.
          </p>
        </div>
      </section>

      {/* DO / DON'T */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Keep it clean
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Do &amp; don't for your request
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#fafafa] rounded-2xl border border-emerald-100 p-6">
              <h3 className="text-sm font-bold text-emerald-700 mb-4 flex items-center gap-2">
                <i className="ri-checkbox-circle-fill"></i>
                Do
              </h3>
              <ul className="space-y-3">
                {dos.map((t) => (
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
                Don't
              </h3>
              <ul className="space-y-3">
                {donts.map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <i className="ri-close-line text-slate-400 mt-0.5 flex-shrink-0"></i>
                    <span className="text-gray-700 text-sm leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* LIFESTYLE */}
      <LifestyleImageSection
        className="bg-[#fdf6ee]"
        image="/assets/lifestyle/owner-with-dog-laptop.jpg"
        alt="A renter emailing a written ESA accommodation request to their landlord with their dog nearby"
        eyebrow="Send it in writing"
        heading="Pair your request with a verifiable provider letter"
        body="Your request letter is only as strong as the documentation behind it. A letter from a licensed provider — naming the provider and offering a way to verify — gives your accommodation request a credible, professional footing."
        bullets={[
          "Write the request; your provider writes the supporting letter.",
          "Keep a dated copy of everything you send.",
          "Landlord denial support if a valid request is questioned.",
        ]}
      />

      {/* PRICING */}
      <EsaPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="Accommodation request letters: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Need the provider letter to go with your request?
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider. If you qualify, you'll receive a verifiable,
            housing-focused ESA letter to attach to your request — with a refund if you don't qualify.
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
              { to: "/esa-letter-for-apartments", title: "ESA letter for apartments", desc: "How ESA housing requests work for apartment renters." },
              { to: "/landlord-esa-documentation-checklist", title: "Landlord documentation checklist", desc: "What a landlord can review — and what they can't ask." },
              { to: "/landlord-denied-esa-letter", title: "Landlord denied your ESA?", desc: "Calm next steps and denial support, by state." },
              { to: "/how-to-verify-esa-letter", title: "How to verify an ESA letter", desc: "Make sure your provider letter is real and verifiable." },
              { to: "/esa-pet-rent-deposit", title: "ESA pet rent & deposits", desc: "When pet fees and deposits may not apply." },
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
