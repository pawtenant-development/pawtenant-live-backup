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

const PATH = "/landlord-esa-documentation-checklist";
const TITLE = "Landlord ESA Documentation Checklist | What to Review";
const DESC =
  "A clear checklist for landlords reviewing ESA documentation: what you can reasonably request, what you can't ask, and how to verify a letter without seeing medical details.";
const UPDATED_HUMAN = "June 17, 2026";
const UPDATED_ISO = "2026-06-17";

const heroBadges = [
  { icon: "ri-list-check-2", label: "Review checklist" },
  { icon: "ri-shield-check-line", label: "Verify authenticity" },
  { icon: "ri-lock-2-line", label: "Privacy-respecting" },
  { icon: "ri-scales-3-line", label: "Fair Housing aligned" },
];

// ── The checklist — what a landlord should confirm
const checklist = [
  {
    icon: "ri-user-star-line",
    title: "Named licensed provider",
    desc: "The letter names the mental health professional who evaluated the resident — not an anonymous company or \"care team.\"",
  },
  {
    icon: "ri-award-line",
    title: "License type and state",
    desc: "It lists the provider's license type (LMHP, LCSW, LPC, psychologist, etc.) and the state they're licensed in.",
  },
  {
    icon: "ri-home-heart-line",
    title: "Housing accommodation framing",
    desc: "It supports a reasonable-accommodation request for housing under the Fair Housing Act — not airline or public-access wording.",
  },
  {
    icon: "ri-calendar-check-line",
    title: "A current issue date",
    desc: "A clear date. Housing letters are generally treated as current for about 12 months, so a recent date matters.",
  },
  {
    icon: "ri-id-card-line",
    title: "Resident's name",
    desc: "The resident or applicant named on the letter matches the person making the housing request.",
  },
  {
    icon: "ri-qr-code-line",
    title: "A way to verify",
    desc: "A real way to confirm the provider — an NPI, license lookup, or a Verification ID on a PawTenant letter.",
  },
];

// ── What a landlord CAN request
const canRequest = [
  "Documentation that reasonably supports the need when a disability isn't obvious.",
  "Confirmation that the provider is licensed and the letter is authentic.",
  "A reasonably current letter (housing letters are generally treated as current for ~12 months).",
  "That the resident follow general lease rules — leash, noise, and responsibility for actual damage.",
];

// ── What a landlord CANNOT ask
const cannotAsk = [
  "A specific diagnosis or the resident's full medical records.",
  "A pet deposit, pet rent, or pet fee for an approved assistance animal.",
  "Proof of training, certification, or \"registration\" — none is required for an ESA.",
  "Denial based on breed, size, or weight limits alone.",
];

// ── How to verify (steps)
const verifySteps = [
  {
    icon: "ri-search-eye-line",
    title: "Confirm the provider is real",
    desc: "Check that the letter names a provider with a license type and state. You can confirm a provider on the public NPPES NPI registry.",
  },
  {
    icon: "ri-qr-code-line",
    title: "Use the Verification ID if present",
    desc: "If the letter is from PawTenant, the Verification ID lets you confirm authenticity in minutes — no medical detail exposed.",
  },
  {
    icon: "ri-customer-service-2-line",
    title: "Contact support to confirm",
    desc: "Both sides can contact PawTenant support to confirm a genuine letter, without the resident revealing private clinical information.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "What documentation can a landlord ask for with an ESA?",
    a: "When a disability or the need for an assistance animal isn't obvious, a landlord may request documentation that reasonably supports the need — typically a letter from a mental health professional licensed in the resident's state. The landlord can confirm the provider is licensed and that the letter is authentic, but generally cannot require a specific diagnosis or full medical records.",
  },
  {
    q: "Can a landlord ask for the tenant's diagnosis?",
    a: "Generally no. A landlord can ask for documentation that reasonably supports the disability-related need, but usually cannot require a specific diagnosis, medical records, or details of the resident's treatment. Verification is about confirming the letter is genuine and the provider is licensed — not about clinical information.",
  },
  {
    q: "Is an ESA registration or certificate valid documentation?",
    a: "No. There is no official ESA registry, and a registration number, certificate, ID card, or vest carries no legal weight on its own. What supports a housing accommodation is a letter from a licensed mental health professional written after a real evaluation — not a purchased registration.",
  },
  {
    q: "How can a landlord verify an ESA letter?",
    a: "Confirm the letter names a provider with a license type and state, and use a real verification path — for example, checking the provider on the public NPPES NPI registry or using a Verification ID on a PawTenant letter. Verification confirms authenticity only; it does not require the resident to disclose medical details.",
  },
  {
    q: "Can a landlord charge a pet deposit for an ESA?",
    a: "Generally no. An approved assistance animal is not treated as a pet, so a landlord usually cannot charge pet rent, a pet deposit, or pet fees for it. The resident can still be held responsible for any actual damage the animal causes, like any other resident.",
  },
  {
    q: "Can a landlord deny an ESA request?",
    a: "In limited situations — for example, if the specific animal would be a direct threat to the safety of others or cause substantial physical damage that can't be reduced, or if the documentation doesn't reasonably support the need. A landlord generally cannot deny based only on a no-pet policy, breed, size, or weight. Each request is evaluated individually.",
  },
  {
    q: "Does the ESA letter need to be from a provider in the tenant's state?",
    a: "In most cases the letter should come from a mental health professional licensed in the state where the resident lives, and some states have additional rules. A letter naming a state-licensed provider with a way to verify is the strongest documentation a landlord can review.",
  },
];

export default function LandlordESADocumentationChecklistPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "Landlord ESA Documentation Checklist",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Landlord ESA Documentation Checklist", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="landlord ESA documentation checklist, what documentation can a landlord ask for ESA, landlord verify ESA letter, ESA letter requirements landlord, property manager ESA documentation, reasonable accommodation ESA landlord"
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
                <i className="ri-building-2-line"></i>
                For landlords &amp; residents
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                Landlord ESA Documentation Checklist
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                A calm, fair way to review an emotional support animal request: what documentation you
                can reasonably request, what you can't ask for, and how to confirm a letter is genuine
                without ever seeing a diagnosis.
              </p>
              <div className="flex justify-center lg:justify-start mb-6">
                <TrustBadgeRow badges={heroBadges} mobileCount={3} />
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
                <a
                  href="#checklist"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
                >
                  <i className="ri-list-check-2"></i>
                  See the Checklist
                </a>
                <Link
                  to="/esa-letter-verification"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-shield-check-line"></i>
                  Verify a Letter
                </Link>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/woman-laptop-clean.jpg"
                  alt="A property manager reviewing ESA documentation on a laptop"
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
                <span className="text-[11px] font-bold text-gray-700">Verify, don't pry</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="What ESA documentation can a landlord review?">
            <p>
              A landlord can review a letter from a <strong>mental health professional licensed in
              the resident's state</strong>, written after a real evaluation, that supports a{" "}
              <strong>reasonable-accommodation request under the Fair Housing Act</strong>. They can
              confirm the provider is licensed and the letter is authentic.
            </p>
            <p>
              A landlord generally <strong>cannot require a diagnosis or medical records</strong>,
              cannot charge pet fees for an approved assistance animal, and cannot demand a
              "registration" or certificate. Verification confirms authenticity — not clinical detail.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* THE CHECKLIST */}
      <section id="checklist" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              The review checklist
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Six things to confirm on an ESA letter
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              Run the documentation through this checklist. The more boxes it ticks, the more likely
              it's genuine and ready to accept.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {checklist.map((item) => (
              <div key={item.title} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${item.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm flex items-start gap-2">
                  <i className="ri-checkbox-circle-fill text-orange-500 mt-0.5 flex-shrink-0"></i>
                  <span>{item.title}</span>
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CAN REQUEST / CANNOT ASK */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              The boundaries
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What you can request &amp; what you can't ask
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              General Fair Housing guidance — not legal advice. Rules can vary by state and locality.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#fafafa] rounded-2xl border border-emerald-100 p-6">
              <h3 className="text-sm font-bold text-emerald-700 mb-4 flex items-center gap-2">
                <i className="ri-checkbox-circle-fill"></i>
                You generally CAN request
              </h3>
              <ul className="space-y-3">
                {canRequest.map((t) => (
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
                You generally CANNOT ask for
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
            For official guidance on assistance animals in housing, see HUD's{" "}
            <a
              href="https://www.hud.gov/program_offices/fair_housing_equal_opp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-600 font-semibold hover:underline"
            >
              Fair Housing &amp; Equal Opportunity
            </a>{" "}
            resources.
          </p>
        </div>
      </section>

      {/* HOW TO VERIFY */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Verify, don't pry
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              How to confirm a letter is genuine
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              Confirm authenticity while respecting the resident's privacy — no medical detail needed.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {verifySteps.map((item) => (
              <div key={item.title} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${item.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-600 mt-8">
            Reviewing a PawTenant letter?{" "}
            <Link to="/esa-letter-verification" className="text-orange-600 font-semibold hover:underline">
              See how landlord verification works →
            </Link>
          </p>
        </div>
      </section>

      {/* LIFESTYLE */}
      <LifestyleImageSection
        reverse
        className="bg-white"
        image="/assets/lifestyle/woman-with-dog-new-apartment.jpg"
        alt="A resident moving in after an approved ESA accommodation, with their emotional support dog"
        eyebrow="A calmer process for both sides"
        heading="Clear documentation makes approval simpler"
        body="When a letter names a licensed provider and offers a way to confirm it, you can approve a reasonable-accommodation request with confidence — and the resident keeps their private medical details private."
        bullets={[
          "Confirm the provider is licensed and the letter is authentic.",
          "Keep the review privacy-respecting and Fair-Housing aligned.",
          "A Verification ID confirms authenticity in minutes.",
        ]}
      />

      {/* PRICING (for residents) */}
      <EsaPricingMini className="bg-[#fafafa] border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="Landlord ESA documentation: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA (resident-facing) */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            A resident who needs a verifiable letter?
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider. If you qualify, you'll receive a verifiable,
            housing-focused ESA letter your landlord can confirm — with a refund if you don't qualify.
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
      <section className="py-14 bg-white border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <RelatedResources
            links={[
              { to: "/how-to-verify-esa-letter", title: "How to verify an ESA letter", desc: "The full verification checklist and red flags." },
              { to: "/esa-letter-verification", title: "Landlord verification", desc: "Confirm a PawTenant letter's authenticity in seconds." },
              { to: "/esa-letter-for-landlord", title: "ESA letter for landlords", desc: "How housing accommodation works and what to send." },
              { to: "/esa-letter-for-apartments", title: "ESA letter for apartments", desc: "How ESA housing requests work for apartment renters." },
              { to: "/esa-pet-rent-deposit", title: "ESA pet rent & deposits", desc: "When pet fees and deposits may not apply." },
              { to: "/landlord-denied-esa-letter", title: "Denied an ESA request?", desc: "Calm next steps and denial support, by state." },
            ]}
          />
        </div>
      </section>

      {/* PSD CROSS-LINK */}
      <section className="py-10 bg-white border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <PsdCrossLink />
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="py-10 bg-[#fafafa] border-t border-gray-100">
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
