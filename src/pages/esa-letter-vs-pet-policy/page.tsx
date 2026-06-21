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

const PATH = "/esa-letter-vs-pet-policy";
const TITLE = "ESA Letter vs Pet Policy: Does a No-Pet Rule Apply?";
const DESC =
  "ESA letter vs pet policy: does a no-pet policy apply to an emotional support animal, can apartments charge pet rent for an ESA, and how accommodation requests work.";
const UPDATED_HUMAN = "June 17, 2026";
const UPDATED_ISO = "2026-06-17";

const heroBadges = [
  { icon: "ri-scales-3-line", label: "Pet rule vs ESA" },
  { icon: "ri-home-heart-line", label: "Housing-focused" },
  { icon: "ri-user-star-line", label: "Licensed provider" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

// ── Comparison rows: ordinary pet vs approved assistance animal
const comparison = [
  {
    label: "No-pet policy",
    pet: "A pet is subject to the building's no-pet policy and can be refused.",
    esa: "A no-pet policy alone is generally not a valid reason to deny an approved assistance animal — the landlord must consider the accommodation request.",
  },
  {
    label: "Pet rent & deposits",
    pet: "Pet rent, pet deposits, and pet fees can be charged for a pet.",
    esa: "Pet rent, pet deposits, and pet fees generally cannot be charged for an approved ESA.",
  },
  {
    label: "Breed / size / weight limits",
    pet: "Breed, size, and weight limits can apply to a pet.",
    esa: "Blanket breed, size, or weight limits generally do not apply to an approved assistance animal.",
  },
  {
    label: "Documentation",
    pet: "No medical documentation is needed to keep a pet.",
    esa: "A letter from a licensed provider supporting a disability-related need is what makes it an accommodation, not a pet.",
  },
  {
    label: "Responsibility for damage",
    pet: "The resident is responsible for any damage the pet causes.",
    esa: "The resident is still responsible for any actual damage the animal causes — that does not change.",
  },
];

// ── Tenant checklist: turning a pet into an accommodation
const checklist = [
  {
    icon: "ri-stethoscope-line",
    title: "Get a licensed provider evaluation",
    desc: "Eligibility depends on a licensed mental health professional deciding an ESA is clinically appropriate for you.",
  },
  {
    icon: "ri-file-text-line",
    title: "Receive a verifiable letter",
    desc: "If you qualify, you get a housing-focused ESA letter naming the provider, with a way to verify it.",
  },
  {
    icon: "ri-mail-send-line",
    title: "Submit an accommodation request",
    desc: "Send a short written reasonable-accommodation request with the letter — that's what moves your animal out of the pet policy.",
  },
  {
    icon: "ri-chat-check-line",
    title: "Keep records",
    desc: "Save what you sent and the date. If the request is pushed back, you'll have a clear paper trail and denial support.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "Does a no-pet policy apply to an emotional support animal?",
    a: "Generally no. An approved emotional support animal is treated as an assistance animal, not an ordinary pet, so a blanket no-pet policy alone is usually not a valid reason to deny it. Under the Fair Housing Act, the landlord must consider a reasonable-accommodation request — though that is not the same as being required to accept every request.",
  },
  {
    q: "What is the difference between an ESA letter and a pet policy?",
    a: "A pet policy governs ordinary pets — it can include no-pet rules, pet rent, deposits, and breed or size limits. An ESA letter from a licensed provider supports a reasonable-accommodation request, which asks the housing provider to make an exception to the pet policy for an approved assistance animal. The letter is what changes how the animal is treated.",
  },
  {
    q: "Can apartments charge pet rent for an ESA?",
    a: "Generally no. Because an approved assistance animal is not treated as a pet, apartments usually cannot charge pet rent, a pet deposit, or pet fees for it. You can still be held responsible for any actual damage the animal causes, like any resident. See our ESA pet rent and deposit guide for details.",
  },
  {
    q: "Do breed, size, or weight limits apply to an ESA?",
    a: "Blanket breed, size, or weight restrictions generally do not apply to an approved assistance animal. A landlord can still address a documented, individual safety concern about a specific animal, but not apply a general pet restriction to deny an ESA.",
  },
  {
    q: "Does an ESA letter override the lease pet clause automatically?",
    a: "Not automatically. The letter supports a reasonable-accommodation request, which the landlord must consider individually. It is the request plus a valid letter — not the letter alone — that asks the landlord to make an exception to the pet clause. Approval is never automatic or guaranteed.",
  },
  {
    q: "Is an ESA considered a pet under my lease?",
    a: "An approved emotional support animal is generally treated as an assistance animal for housing purposes, not a pet — which is why pet rent, deposits, and no-pet rules usually don't apply. The distinction comes from a valid letter supporting a disability-related need, reviewed as a reasonable accommodation.",
  },
  {
    q: "What if my building allows pets but charges fees — do I still need an ESA letter?",
    a: "If you want the animal treated as an assistance animal (so pet fees and deposits generally don't apply, and limits don't restrict it), you generally need a letter from a licensed provider supporting a disability-related need. Without that, the animal is treated as a pet under the building's pet policy.",
  },
  {
    q: "Does an ESA letter help with airlines or public places?",
    a: "No. ESA protections center on housing under the Fair Housing Act. An ESA letter does not grant airline, stadium, hotel, or other public-access rights. A psychiatric service dog (PSD) is a separate, task-trained category covered under the ADA in public places.",
  },
];

export default function ESALetterVsPetPolicyPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "ESA Letter vs Pet Policy",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "ESA Letter vs Pet Policy", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="ESA letter vs pet policy, does a no-pet policy apply to emotional support animals, can apartments charge pet rent for ESA, is an ESA a pet under my lease, ESA vs pet, emotional support animal pet policy exception"
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
                ESA vs the pet policy
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                ESA Letter vs Pet Policy: Does a No-Pet Policy Apply to an ESA?
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                A pet policy and an emotional support animal are treated very differently. An approved
                ESA is an assistance animal — not an ordinary pet — so no-pet rules, pet rent, and
                breed limits generally don't apply. Here's how the two compare and what makes the
                difference.
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
                  href="#comparison"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  See the Comparison
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/woman-with-dog-new-apartment.jpg"
                  alt="A renter with her emotional support dog in a new apartment"
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
                <span className="text-[11px] font-bold text-gray-700">Not treated as a pet</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="Does my apartment's pet policy apply to my emotional support animal?">
            <p>
              Generally <strong>no</strong>. An approved emotional support animal is treated as an{" "}
              <strong>assistance animal, not an ordinary pet</strong>, so a building's{" "}
              <strong>no-pet policy, pet rent, pet deposits, and breed or size limits</strong>{" "}
              usually don't apply to it.
            </p>
            <p>
              The difference comes from a <strong>letter from a licensed provider</strong> supporting
              a disability-related need, submitted as a{" "}
              <strong>reasonable-accommodation request</strong>. The landlord{" "}
              <strong>must consider</strong> that request — though it's reviewed individually and{" "}
              <strong>approval is never guaranteed</strong>. You remain responsible for any actual
              damage the animal causes.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* COMPARISON */}
      <section id="comparison" className="scroll-mt-24 py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Side by side
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              ESA letter vs pet policy, point by point
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              General Fair Housing guidance — not legal advice. Rules can vary by state and locality.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="hidden sm:grid sm:grid-cols-[160px_1fr_1fr] bg-[#fafafa] border-b border-gray-200 text-[11px] font-bold uppercase tracking-wide text-gray-500">
              <div className="px-4 py-3">Topic</div>
              <div className="px-4 py-3 border-l border-gray-100">Ordinary pet (pet policy)</div>
              <div className="px-4 py-3 border-l border-gray-100 text-emerald-700">Approved ESA (accommodation)</div>
            </div>
            <div className="divide-y divide-gray-100">
              {comparison.map((r) => (
                <div key={r.label} className="sm:grid sm:grid-cols-[160px_1fr_1fr] px-4 py-4">
                  <div className="text-sm font-bold text-gray-900 mb-2 sm:mb-0 sm:pr-3">{r.label}</div>
                  <div className="text-sm text-gray-600 leading-relaxed mb-2 sm:mb-0 sm:px-4 sm:border-l sm:border-gray-100">
                    <span className="sm:hidden font-semibold text-gray-500 text-[12px] block mb-0.5">Pet policy:</span>
                    {r.pet}
                  </div>
                  <div className="text-sm text-gray-700 leading-relaxed sm:px-4 sm:border-l sm:border-gray-100">
                    <span className="sm:hidden font-semibold text-emerald-700 text-[12px] block mb-0.5">Approved ESA:</span>
                    {r.esa}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-center text-[13px] text-gray-500 mt-7 max-w-2xl mx-auto leading-relaxed">
            More on fees in the{" "}
            <Link to="/esa-pet-rent-deposit" className="text-orange-600 font-semibold hover:underline">
              ESA pet rent &amp; deposit guide
            </Link>
            , and the apartment-specific picture in{" "}
            <Link to="/esa-letter-for-apartments" className="text-orange-600 font-semibold hover:underline">
              ESA letter for apartments
            </Link>
            .
          </p>
        </div>
      </section>

      {/* CHECKLIST */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Tenant checklist
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              How an ESA becomes an accommodation, not a pet
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {checklist.map((item, i) => (
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
        image="/assets/lifestyle/freelancer-with-dog-laptop.jpg"
        alt="A renter completing an ESA accommodation request at home with their emotional support dog"
        eyebrow="Out of the pet policy"
        heading="A valid letter is what changes the rules"
        body="On its own, your animal falls under the building's pet policy. A letter from a licensed provider — submitted with a reasonable-accommodation request — is what asks the landlord to treat it as an assistance animal instead, so pet rent and no-pet rules generally don't apply."
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
            heading="ESA letter vs pet policy: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Move your animal out of the pet policy
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider. If you qualify, you'll receive a verifiable,
            housing-focused ESA letter to support your accommodation request — with a refund if you
            don't qualify.
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
              { to: "/esa-pet-rent-deposit", title: "ESA pet rent & deposits", desc: "When apartment pet fees and deposits may not apply." },
              { to: "/esa-letter-for-apartments", title: "ESA letter for apartments", desc: "The full apartment ESA housing guide." },
              { to: "/can-landlord-reject-esa-letter", title: "Can a landlord reject an ESA letter?", desc: "When a request can be denied — and when it can't." },
              { to: "/what-documents-can-landlord-ask-for-esa", title: "What documents can a landlord ask for?", desc: "What a landlord can reasonably request." },
              { to: "/esa-accommodation-request-letter", title: "Accommodation request letter", desc: "Write the request that asks for an exception." },
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
