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

const PATH = "/can-landlord-reject-esa-letter";
const TITLE = "Can a Landlord Reject an ESA Letter? Your Housing Rights";
const DESC =
  "Can a landlord reject an ESA letter? When a housing provider may deny a reasonable-accommodation request, when they generally can't, and how to respond.";
const UPDATED_HUMAN = "June 17, 2026";
const UPDATED_ISO = "2026-06-17";

const heroBadges = [
  { icon: "ri-scales-3-line", label: "Fair Housing basics" },
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-shield-check-line", label: "Verifiable letter" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

// ── When a landlord generally CAN vs CANNOT deny
const canDeny = [
  "The specific animal would be a direct threat to others' health or safety that can't be reduced by another reasonable measure.",
  "The specific animal would cause substantial physical damage to property that can't be reduced.",
  "The documentation doesn't reasonably support a disability-related need, or the request is unreasonable for that property.",
  "Granting the request would impose an undue financial and administrative burden, or fundamentally alter the housing.",
];
const cannotDeny = [
  "A blanket no-pet policy — an approved assistance animal is not treated as an ordinary pet.",
  "Breed, size, or weight limits applied on their own.",
  "Refusing because you won't pay pet rent, a pet deposit, or pet fees for an approved ESA.",
  "Demanding you \"register\" or \"certify\" the ESA, or buy an ID card or vest.",
];

// ── What makes a letter hard to reject
const strongLetter = [
  {
    icon: "ri-user-star-line",
    title: "A named, licensed provider",
    desc: "The letter names the mental health professional who evaluated you, with their license type, number, and state — not an anonymous \"care team.\"",
  },
  {
    icon: "ri-home-heart-line",
    title: "Housing accommodation language",
    desc: "It frames a reasonable-accommodation request for housing under the Fair Housing Act — the right framing for a landlord to act on.",
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
];

// ── What to do if your landlord pushes back
const ifRejected = [
  {
    icon: "ri-chat-check-line",
    title: "Keep it calm and in writing",
    desc: "Ask the housing provider, in writing, for the specific reason for the denial. A written record helps if you need to follow up.",
  },
  {
    icon: "ri-file-shield-2-line",
    title: "Re-send a verifiable letter",
    desc: "Make sure your letter names a licensed provider, is recent, and is verifiable. Offer the verification path so they can confirm authenticity.",
  },
  {
    icon: "ri-mail-send-line",
    title: "Pair it with a clear request",
    desc: "Send a short written reasonable-accommodation request alongside the letter, so the landlord has a request they're required to consider.",
  },
  {
    icon: "ri-lifebuoy-line",
    title: "Use landlord denial support",
    desc: "If a valid request is pushed back, PawTenant offers landlord denial support to help you respond — there are calm next steps.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "Can a landlord reject an ESA letter?",
    a: "A landlord can deny a reasonable-accommodation request in limited situations — for example, if the specific animal would be a direct threat to others' safety or cause substantial property damage that can't be reduced, or if the documentation doesn't reasonably support a disability-related need. A landlord generally cannot reject an ESA based only on a no-pet policy, breed, size, or weight. Each request is reviewed individually, and no service can guarantee a landlord's decision.",
  },
  {
    q: "Can my landlord deny my emotional support animal just because of a no-pet policy?",
    a: "Generally no. Under the Fair Housing Act, a housing provider must consider a reasonable-accommodation request for an approved assistance animal, and a blanket no-pet policy alone is usually not a valid reason to deny it. The landlord must consider the request — that is not the same as being required to accept every request.",
  },
  {
    q: "My landlord says my ESA letter is fake — what now?",
    a: "Stay calm and offer a way to verify it. A genuine ESA letter names a licensed mental health professional with their license type and number, and a PawTenant letter includes a Verification ID a landlord can confirm. Ask, in writing, what specifically concerns them, then re-send a verifiable letter. If a valid request is still refused, landlord denial support can help you respond.",
  },
  {
    q: "What makes an ESA letter valid for housing?",
    a: "A housing-valid ESA letter comes from a mental health professional licensed in your state, written after a real evaluation, and states that you have a disability-related need for the animal. It should be recent, name the provider with their license details, and be verifiable. There is no official ESA \"registry\" — a registration, certificate, or ID card has no legal weight on its own.",
  },
  {
    q: "Can a landlord ask why I need an emotional support animal?",
    a: "A landlord can ask for documentation that reasonably supports a disability-related need when the disability isn't obvious, but they generally cannot require your specific diagnosis or full medical records. A letter from a licensed provider stating that you have a need is usually enough.",
  },
  {
    q: "Does my landlord have to accept my ESA letter?",
    a: "A landlord must consider a reasonable-accommodation request supported by valid documentation — but \"must consider\" is not the same as \"must accept.\" They can deny in limited, individualized situations, such as a documented direct threat or substantial damage. No legitimate service can guarantee landlord acceptance.",
  },
  {
    q: "Can a landlord charge a pet deposit or pet rent if they accept my ESA?",
    a: "Generally no. An approved assistance animal is not treated as a pet, so a landlord usually cannot charge pet rent, a pet deposit, or pet fees for it. You can still be held responsible for any actual damage the animal causes, like any resident.",
  },
  {
    q: "What if my landlord ignores my ESA request?",
    a: "Follow up in writing and keep a record of what you sent and when. Re-send a verifiable letter with a short written accommodation request. If a valid request continues to be ignored or denied, you can seek landlord denial support and, where appropriate, state or federal fair-housing avenues.",
  },
];

export default function CanLandlordRejectESALetterPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "Can a Landlord Reject an ESA Letter?",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Can a Landlord Reject an ESA Letter?", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="can a landlord reject an ESA letter, can my landlord deny my emotional support animal, landlord says ESA letter is fake, what makes an ESA letter valid for housing, does my landlord have to accept my ESA letter, ESA reasonable accommodation"
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
                <i className="ri-scales-3-line"></i>
                ESA housing rights
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                Can a Landlord Reject an ESA Letter?
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                Worried your landlord can say no? A landlord can deny an emotional support animal in
                only limited, individualized situations — not because of a no-pet policy, breed, or
                size. Here's when a request can be refused, when it generally can't, and how to
                respond with a verifiable letter.
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
                  href="#when-can-deny"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  When Can They Deny?
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/person-paperwork-with-dog.jpg"
                  alt="A renter reviewing an ESA accommodation request at home with their emotional support dog"
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
                <span className="text-[11px] font-bold text-gray-700">Reviewed case by case</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="Can a landlord reject an ESA letter?">
            <p>
              A landlord can <strong>deny a reasonable-accommodation request in limited
              situations</strong> — for example, if the specific animal would be a{" "}
              <strong>direct threat to safety</strong> or cause <strong>substantial property
              damage</strong> that can't be reduced, or if the documentation doesn't reasonably
              support a disability-related need.
            </p>
            <p>
              A landlord generally <strong>cannot</strong> reject an ESA based only on a{" "}
              <strong>no-pet policy, breed, size, or weight</strong>. Under the Fair Housing Act a
              housing provider <strong>must consider</strong> the request — that is not the same as
              being required to accept every request, and <strong>no service can guarantee a
              landlord's decision</strong>.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* WHEN CAN / CANNOT DENY */}
      <section id="when-can-deny" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Valid vs invalid reasons
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              When a landlord can &amp; can't deny an ESA
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              General Fair Housing guidance — not legal advice. Rules can vary by state and locality.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h3 className="text-sm font-bold text-slate-600 mb-4 flex items-center gap-2">
                <i className="ri-error-warning-line text-slate-400"></i>
                A landlord generally CAN deny if…
              </h3>
              <ul className="space-y-3">
                {canDeny.map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <i className="ri-arrow-right-s-line text-slate-400 mt-0.5 flex-shrink-0"></i>
                    <span className="text-gray-700 text-sm leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl border border-emerald-100 p-6">
              <h3 className="text-sm font-bold text-emerald-700 mb-4 flex items-center gap-2">
                <i className="ri-shield-check-fill"></i>
                A landlord generally CANNOT deny for…
              </h3>
              <ul className="space-y-3">
                {cannotDeny.map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <i className="ri-close-line text-emerald-500 mt-0.5 flex-shrink-0"></i>
                    <span className="text-gray-700 text-sm leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-center text-[13px] text-gray-500 mt-7 max-w-2xl mx-auto leading-relaxed">
            Already been told no? See{" "}
            <Link to="/how-to-respond-to-esa-letter-denial" className="text-orange-600 font-semibold hover:underline">
              how to respond to an ESA letter denial
            </Link>{" "}
            and{" "}
            <Link to="/landlord-denied-esa-letter" className="text-orange-600 font-semibold hover:underline">
              landlord denial support
            </Link>
            .
          </p>
        </div>
      </section>

      {/* WHAT MAKES A LETTER HARD TO REJECT */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              What landlords look for
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What makes an ESA letter hard to reject
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              A verifiable letter from a licensed provider gives a landlord far less room to push
              back.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {strongLetter.map((item) => (
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

      {/* IF REJECTED — CHECKLIST */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Tenant checklist
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              If your landlord pushes back
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ifRejected.map((item, i) => (
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

      {/* LIFESTYLE */}
      <LifestyleImageSection
        reverse
        className="bg-[#fdf6ee]"
        image="/assets/lifestyle/woman-telehealth-with-dog.jpg"
        alt="A renter on a telehealth evaluation at home with their emotional support dog"
        eyebrow="Start from a strong position"
        heading="A verifiable letter is your best answer to a no"
        body="The strongest response to a landlord's pushback is a recent letter from a licensed provider that names them, supports a disability-related need, and can be verified — paired with a short written accommodation request. That gives a housing provider a request they're required to consider."
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
            heading="Can a landlord reject an ESA letter? FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Get a verifiable, housing-focused ESA letter
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider. If you qualify, you'll receive a verifiable ESA letter
            built for housing accommodation requests — with a refund if you don't qualify.
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
              { to: "/what-makes-esa-letter-valid", title: "What makes an ESA letter valid?", desc: "The elements that make a housing letter hard to reject." },
              { to: "/what-documents-can-landlord-ask-for-esa", title: "What documents can a landlord ask for?", desc: "What a landlord can reasonably request — and can't." },
              { to: "/esa-letter-vs-pet-policy", title: "ESA letter vs pet policy", desc: "Does a no-pet policy apply to an emotional support animal?" },
              { to: "/how-to-respond-to-esa-letter-denial", title: "How to respond to a denial", desc: "Calm steps if a landlord says your letter isn't valid." },
              { to: "/how-to-verify-esa-letter", title: "How to verify an ESA letter", desc: "Make sure your letter is real and verifiable." },
              { to: "/landlord-esa-documentation-checklist", title: "Landlord documentation checklist", desc: "What a landlord can and can't ask to review." },
              { to: "/landlord-denied-esa-letter", title: "Landlord denied your ESA?", desc: "Your rights and denial support, by state." },
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
