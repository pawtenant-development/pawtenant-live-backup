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

const PATH = "/esa-pet-rent-deposit";
const TITLE = "ESA Pet Rent & Deposit Guide: What Landlords Can Charge";
const DESC =
  "Learn when ESA pet rent, deposits, and fees may be removed, what landlords can still ask, and how PawTenant supports housing ESA documentation.";
const UPDATED_HUMAN = "June 15, 2026";
const UPDATED_ISO = "2026-06-15";

const heroBadges = [
  { icon: "ri-home-heart-line", label: "Housing-focused" },
  { icon: "ri-scales-3-line", label: "Fair Housing Act" },
  { icon: "ri-user-star-line", label: "Licensed providers" },
  { icon: "ri-qr-code-line", label: "Verifiable letters" },
];

type FeeStatus = "no" | "yes" | "sometimes";
const feeRows: { fee: string; status: FeeStatus; note: string }[] = [
  {
    fee: "Monthly pet rent",
    status: "no",
    note: "Recurring pet rent generally does not apply to a valid assistance-animal accommodation.",
  },
  {
    fee: "One-time pet fee",
    status: "no",
    note: "A one-time, non-refundable pet fee is generally not charged for an ESA accommodation.",
  },
  {
    fee: "Pet deposit",
    status: "no",
    note: "A separate pet deposit generally does not apply to assistance animals.",
  },
  {
    fee: "Regular security deposit",
    status: "yes",
    note: "A standard refundable security deposit charged to every tenant still applies — it is not a pet charge.",
  },
  {
    fee: "Actual damage charges",
    status: "yes",
    note: "You remain responsible for real damage your animal causes, beyond normal wear and tear.",
  },
  {
    fee: "Cleaning / damage after move-out",
    status: "sometimes",
    note: "Charges for actual damage or excess cleaning the animal caused may apply; routine turnover cleaning billed to everyone is separate.",
  },
  {
    fee: "Breed / weight fee",
    status: "no",
    note: "Breed, size, or weight restrictions and related fees generally do not apply to assistance animals.",
  },
  {
    fee: "Application / administrative fees",
    status: "yes",
    note: "Standard application or admin fees charged to every applicant still apply — they just cannot be pet-specific.",
  },
];

const STATUS_META: Record<FeeStatus, { label: string; cls: string; icon: string }> = {
  no: { label: "Usually no", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: "ri-shield-check-line" },
  yes: { label: "Usually yes", cls: "bg-amber-50 text-amber-700 ring-amber-200", icon: "ri-information-line" },
  sometimes: { label: "Sometimes", cls: "bg-slate-100 text-slate-600 ring-slate-200", icon: "ri-equalizer-line" },
};

const landlordCanRequire = [
  {
    icon: "ri-file-shield-2-line",
    title: "Reliable documentation when the need isn't obvious",
    desc: "If your disability-related need isn't apparent, a landlord may ask for documentation that reasonably supports it — like an ESA letter from a licensed provider. They cannot demand your diagnosis or full medical records.",
  },
  {
    icon: "ri-shake-hands-line",
    title: "Reasonable animal-behavior rules",
    desc: "Your animal must be under control and cannot pose a direct threat to others or the property. Normal conduct expectations still apply.",
  },
  {
    icon: "ri-hammer-line",
    title: "Responsibility for actual damage",
    desc: "You stay responsible for any real damage the animal causes — that's separate from a pet fee and is allowed.",
  },
  {
    icon: "ri-volume-mute-line",
    title: "No nuisance or safety risk",
    desc: "Excessive disturbance or a genuine, fact-based safety concern can be addressed like it would be for any tenant.",
  },
  {
    icon: "ri-contract-line",
    title: "Normal lease rules that apply to everyone",
    desc: "Standard, non-pet lease terms and fees charged to every resident still apply — they just can't be re-labeled as pet charges for your ESA.",
  },
];

const ifChargedSteps = [
  {
    title: "Ask for the charge in writing",
    desc: "Request a written explanation of any pet rent, pet deposit, or pet fee on your ledger so you have a clear record of what's being charged and why.",
  },
  {
    title: "Submit a written accommodation request",
    desc: "Send a short, calm reasonable-accommodation request asking to keep your assistance animal in your home — separate from any standard pet policy.",
  },
  {
    title: "Provide your verifiable ESA letter",
    desc: "Include a housing-focused ESA letter from a provider licensed in your state. A landlord can confirm it's genuine without seeing any clinical detail.",
  },
  {
    title: "Ask for pet charges to be removed",
    desc: "Politely ask that pet rent, pet deposit, and pet fees be removed from your ledger for the assistance-animal accommodation going forward.",
  },
  {
    title: "Keep all communication records",
    desc: "Save emails, letters, and ledger statements. A written trail helps if there's a disagreement later.",
  },
  {
    title: "Escalate if denied or ignored",
    desc: "If a valid request is denied or ignored, review your options and local rules. Our landlord-denial guide walks through calm next steps.",
  },
];

const pawtenantSupport = [
  {
    icon: "ri-stethoscope-line",
    title: "Licensed provider evaluation",
    desc: "A telehealth assessment reviewed by a licensed mental health professional in your state — no waiting rooms.",
  },
  {
    icon: "ri-qr-code-line",
    title: "Verifiable ESA letter",
    desc: "Every finalized letter carries a Verification ID and the provider's license details a landlord can confirm.",
  },
  {
    icon: "ri-home-heart-line",
    title: "Landlord-ready housing documentation",
    desc: "Housing-focused ESA documentation written for a reasonable-accommodation request — not a pet registration.",
  },
  {
    icon: "ri-refund-2-line",
    title: "Refund if you do not qualify",
    desc: "If a provider determines you don't qualify after review, you're refunded. No pressure, no risk.",
  },
  {
    icon: "ri-shield-cross-line",
    title: "Support if your request is denied",
    desc: "Landlord denial protection: if your housing request is pushed back, we help you understand calm, practical next steps.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "Can my apartment charge monthly pet rent for an ESA?",
    a: "In most housing situations, no. An emotional support animal is treated as an assistance animal under the Fair Housing Act, not an ordinary pet, so recurring pet rent generally doesn't apply to a valid accommodation. You still pay your normal rent and standard deposits, and you remain responsible for any real damage.",
  },
  {
    q: "Can a landlord charge a pet deposit for an ESA?",
    a: "Generally no. A separate pet deposit or one-time pet fee typically doesn't apply to assistance animals. A standard refundable security deposit that every tenant pays is different — that still applies because it isn't a pet charge.",
  },
  {
    q: "Can a landlord charge for damage caused by an ESA?",
    a: "Yes. You stay responsible for actual damage your animal causes, beyond normal wear and tear. That's separate from a pet fee and is allowed. Routine turnover cleaning charged to everyone is also separate from a pet-specific charge.",
  },
  {
    q: "Can my landlord deny my ESA because of breed or weight?",
    a: "Breed, size, and weight restrictions generally don't apply to assistance animals, and related fees generally can't be charged. Each request is still reviewed individually, and in limited cases a landlord may raise a genuine, fact-based safety concern about a specific animal.",
  },
  {
    q: "Can a landlord ask for proof of my ESA?",
    a: "When your disability-related need isn't obvious, a landlord may ask for reliable documentation that reasonably supports it — such as an ESA letter from a licensed provider. They cannot require your diagnosis, full medical records, or a purchased \"registration\" or ID card.",
  },
  {
    q: "Does an ESA letter remove all housing responsibilities?",
    a: "No. A valid letter supports a reasonable-accommodation request, but you still follow normal lease rules, keep your animal under control, avoid nuisance, and pay for any actual damage. An ESA letter is for housing only — it does not grant airline or public-access rights.",
  },
  {
    q: "What if I already paid pet rent before getting my ESA letter?",
    a: "Once you have a valid ESA accommodation in place, you can ask your landlord, in writing, to stop charging pet rent or pet fees going forward and to remove them from your ledger. Whether past charges can be adjusted depends on your lease and local rules, so keep your records and ask for the change in writing.",
  },
  {
    q: "Is an ESA the same as a service dog?",
    a: "No. An emotional support animal provides comfort and is covered for housing under the Fair Housing Act. A psychiatric service dog (PSD) is individually trained to perform tasks for a disability and is covered under the ADA in public places. They are different categories with different rules — see our service-dog resources to compare.",
  },
];

export default function ESAPetRentDepositPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "Can Apartments Charge Pet Rent or Deposits for an ESA?",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "ESA Pet Rent & Deposit Guide", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="ESA pet rent, ESA pet deposit, can apartment charge pet rent for ESA, ESA pet fee, emotional support animal pet deposit, ESA housing fees, no pet fee ESA"
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
                <i className="ri-price-tag-3-line"></i>
                Housing Fees Guide
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                Can Apartments Charge Pet Rent or Deposits for an ESA?
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                Under fair housing rules, emotional support animals are generally treated as
                assistance animals — not ordinary pets — so pet rent, pet deposits, and pet fees
                usually don't apply. You still need valid documentation and must follow reasonable
                housing rules.
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
                  href="#what-landlords-can-ask"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-list-check-2"></i>
                  See What Landlords Can Ask
                </a>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/person-paperwork-with-dog.jpg"
                  alt="A tenant reviewing a lease and housing paperwork at home with their emotional support dog"
                  width={1000}
                  height={750}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="absolute -bottom-3 left-4 bg-white rounded-xl shadow-md ring-1 ring-gray-100 px-3 py-2 flex items-center gap-2">
                <i className="ri-money-dollar-circle-line text-emerald-600"></i>
                <span className="text-[11px] font-bold text-gray-700">No pet fees, usually</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="Can a landlord charge pet rent or a pet deposit for an ESA?">
            <p>
              In most housing situations, landlords generally <strong>cannot charge pet rent, pet
              deposits, or pet fees</strong> for a valid ESA accommodation. An emotional support
              animal is treated as an assistance animal under the Fair Housing Act, not an ordinary
              pet.
            </p>
            <p>
              They may still charge for <strong>actual damage</strong> the animal causes, and may
              request <strong>reliable documentation</strong> — like an ESA letter from a licensed
              provider — when the disability-related need is not obvious. Each request is reviewed
              individually, and rules can vary by state and locality.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* FEE BREAKDOWN TABLE */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-8">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Fee breakdown
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What can and can't be charged for an ESA
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              A quick reference. This is general housing information, not legal advice — check your
              local rules or an official fair-housing resource for your situation.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_8px_30px_-22px_rgba(15,23,42,0.25)]">
            {/* Header row (sm+) */}
            <div className="hidden sm:grid grid-cols-[1.2fr_0.9fr_1.7fr] bg-[#fdf6ee] border-b border-gray-100">
              <div className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Fee / charge</div>
              <div className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Usually allowed?</div>
              <div className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Notes</div>
            </div>
            {feeRows.map((r) => {
              const s = STATUS_META[r.status];
              return (
                <div
                  key={r.fee}
                  className="grid grid-cols-1 sm:grid-cols-[1.2fr_0.9fr_1.7fr] border-t border-gray-100 first:border-t-0 sm:first:border-t"
                >
                  <div className="px-5 pt-4 pb-1 sm:py-4">
                    <span className="sm:hidden block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Fee / charge</span>
                    <span className="text-sm font-semibold text-gray-900">{r.fee}</span>
                  </div>
                  <div className="px-5 py-1 sm:py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${s.cls}`}>
                      <i className={s.icon}></i>
                      {s.label}
                    </span>
                  </div>
                  <div className="px-5 pt-1 pb-4 sm:py-4">
                    <span className="sm:hidden block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Notes</span>
                    <span className="text-sm text-gray-600 leading-relaxed">{r.note}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[12px] text-gray-400 mt-4 text-center">
            "Usually no" means the charge generally does not apply to a valid assistance-animal
            accommodation. Standard deposits and real damage are not pet charges.
          </p>
        </div>
      </section>

      {/* WHAT LANDLORDS CAN STILL REQUIRE */}
      <section id="what-landlords-can-ask" className="scroll-mt-24 py-14 sm:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 text-center leading-tight">
            What a landlord can still require
          </h2>
          <p className="text-gray-500 text-sm text-center mb-9 max-w-xl mx-auto">
            An ESA accommodation removes pet fees — not every housing responsibility. Here's what a
            landlord can reasonably ask for.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {landlordCanRequire.map((item) => (
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

      {/* Emotional lifestyle visual */}
      <LifestyleImageSection
        reverse
        className="bg-[#fdf6ee]"
        image="/assets/housing/home-together.jpg"
        alt="A tenant relaxed at home with their emotional support dog after pet fees were removed"
        eyebrow="Home, without the extra fees"
        heading="A valid accommodation can take pet rent off the table"
        body="When an emotional support animal is approved as a reasonable accommodation, pet rent, pet deposits, and breed or weight fees generally don't apply. You keep your standard lease terms and stay responsible for any real damage — that's it."
        bullets={[
          "Pet rent and pet deposits generally don't apply to a valid ESA.",
          "Breed, size, and weight fees generally don't apply.",
          "Standard deposits and actual-damage charges still stand.",
        ]}
      />

      {/* WHAT TO DO IF CHARGED */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 text-center leading-tight">
            What to do if your landlord charges ESA pet rent
          </h2>
          <p className="text-gray-500 text-sm text-center mb-9 max-w-xl mx-auto">
            Calm, practical steps. Keep everything in writing.
          </p>
          <ol className="space-y-4">
            {ifChargedSteps.map((step, i) => (
              <li key={step.title} className="flex items-start gap-4 bg-[#fafafa] rounded-2xl border border-gray-100 p-5">
                <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-orange-500 text-white text-sm font-extrabold">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">{step.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-center text-sm text-gray-600 mt-7">
            Denied or ignored?{" "}
            <Link to="/landlord-denied-esa-letter" className="text-orange-600 font-semibold hover:underline">
              See your housing rights if a landlord denied your ESA →
            </Link>
          </p>
        </div>
      </section>

      {/* PAWTENANT SUPPORT */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 text-center leading-tight">
            How PawTenant helps with your housing ESA
          </h2>
          <p className="text-gray-500 text-sm text-center mb-9 max-w-xl mx-auto">
            We connect you with a licensed provider and give you documentation built for housing —
            never a pet registration.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pawtenantSupport.map((item) => (
              <div key={item.title} className="bg-white rounded-2xl border border-gray-100 p-6">
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

      {/* PRICING / KLARNA */}
      <EsaPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa]">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="ESA pet rent & deposits: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Ready to remove the pet fees?
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Connect with a licensed provider. If you qualify, you'll receive a verifiable,
            housing-focused ESA letter for your reasonable-accommodation request.
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
              { to: "/landlord-denied-esa-letter", title: "Landlord denied your ESA?", desc: "Your housing rights and calm next steps, by state." },
              { to: "/how-to-get-esa-letter-online", title: "How to get an ESA letter online", desc: "The step-by-step process from assessment to letter." },
              { to: "/are-online-esa-letters-legit", title: "Are online ESA letters real?", desc: "Green flags, red flags, and how to verify a letter." },
              { to: "/esa-letter-cost", title: "ESA letter cost", desc: "Transparent pricing and what your fee includes." },
              { to: "/explore-esa-letters-all-states", title: "ESA letter by state", desc: "State-specific ESA housing rules." },
            ]}
          />
        </div>
      </section>

      {/* PSD CROSS-LINK — ESA stays the focus */}
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
