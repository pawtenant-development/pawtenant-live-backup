import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
import EsaVsPsdCard from "../../components/feature/EsaVsPsdCard";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import {
  AIAnswerBox,
  TrustBadgeRow,
  SeoFaqSection,
  RelatedResources,
  LastUpdated,
  EducationalDisclaimer,
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

const PATH = "/esa-psd-registry-vs-letter";
const TITLE = "ESA & PSD Registry vs Letter: What Landlords Actually Need | PawTenant";
const DESC =
  "Learn the difference between ESA or PSD registries, certificates, ID cards, and provider-reviewed housing documentation. PawTenant helps with ESA and PSD letter support.";
const UPDATED_HUMAN = "July 2, 2026";
const UPDATED_ISO = "2026-07-02";

const heroBadges = [
  { icon: "ri-user-star-line", label: "Licensed provider review" },
  { icon: "ri-home-heart-line", label: "Housing-focused" },
  { icon: "ri-shield-check-line", label: "Verifiable letter" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

// ── 3-column comparison: Registry/Certificate/ID vs ESA letter vs PSD documentation
const compareRows: {
  criterion: string;
  registry: string;
  esa: string;
  psd: string;
}[] = [
  {
    criterion: "Who creates it",
    registry: "A website or database — often anyone can pay and self-enter their pet.",
    esa: "A mental health professional licensed in your state, after an evaluation.",
    psd: "A licensed provider, for a qualifying disability, alongside the dog's task training.",
  },
  {
    criterion: "Is it government-issued?",
    registry: "No. There is no official government ESA or service-dog registry.",
    esa: "No — it's a provider letter, but it reflects a real clinical review.",
    psd: "No — but it documents a provider's determination, not a purchased listing.",
  },
  {
    criterion: "Licensed provider review?",
    registry: "Usually none. Payment often replaces any real evaluation.",
    esa: "Yes. Written after a licensed provider reviews your assessment.",
    psd: "Yes. A licensed provider evaluates whether you qualify.",
  },
  {
    criterion: "Does it prove training or disability need?",
    registry: "No. A card or listing proves neither a disability nor task training.",
    esa: "It supports a disability-related need for an emotional support animal — no training required.",
    psd: "The letter reflects the need; the dog becomes a service dog through task training, not paperwork.",
  },
  {
    criterion: "Housing usefulness",
    registry: "Low. Landlords are not required to accept a registry card or certificate.",
    esa: "Housing-focused — frames a Fair Housing Act reasonable-accommodation request.",
    psd: "Housing-focused where appropriate — supports a reasonable-accommodation request.",
  },
  {
    criterion: "What a landlord usually looks for",
    registry: "Not this. Most landlords look past a registry ID to real documentation.",
    esa: "Documentation from a licensed provider that reasonably supports the need.",
    psd: "Reliable documentation of the disability-related need for an assistance animal.",
  },
  {
    criterion: "PawTenant recommendation",
    registry: "Don't rely on it as housing proof, and don't assume it creates any legal right.",
    esa: "Use a provider-reviewed ESA letter for a housing accommodation request.",
    psd: "Use provider-reviewed PSD documentation — and remember a PSD requires task training.",
  },
];

// ── Why registry-style sites are confusing
const confusionPoints = [
  {
    icon: "ri-government-line",
    title: "Official-sounding names",
    desc: "Words like \"national,\" \"registry,\" \"official,\" or \"certified\" can make a paid listing feel like a government program. It usually isn't.",
  },
  {
    icon: "ri-id-card-line",
    title: "Certificates and ID cards",
    desc: "Printed cards, badges, and vests look formal, but on their own they don't carry legal weight for housing or public access.",
  },
  {
    icon: "ri-database-2-line",
    title: "Registry databases",
    desc: "A searchable \"database\" implies verification, yet many simply store whatever a buyer typed in — with no clinical review behind it.",
  },
  {
    icon: "ri-infinity-line",
    title: "\"Lifetime registration\" claims",
    desc: "One-time or lifetime registration sounds convenient, but a housing letter is generally considered current for about 12 months and reflects a real evaluation.",
  },
  {
    icon: "ri-error-warning-line",
    title: "Blurring ESA, PSD, and service dogs",
    desc: "Some listings mix emotional support animals, psychiatric service dogs, and service dogs together — even though they are different categories with different rules.",
  },
  {
    icon: "ri-shield-keyhole-line",
    title: "Why PawTenant avoids it",
    desc: "We don't sell registrations or imply a national registry. We connect you with a licensed provider and give you documentation a landlord can actually verify.",
  },
];

// ── What PawTenant provides instead
const pawtenantProvides = [
  {
    icon: "ri-clipboard-line",
    title: "Online ESA assessment",
    desc: "A short questionnaire reviewed by a licensed mental health professional — not an instant, no-review purchase.",
  },
  {
    icon: "ri-shield-star-line",
    title: "Separate PSD assessment path",
    desc: "A distinct path for psychiatric service dog documentation, because a PSD is a different service with higher requirements.",
  },
  {
    icon: "ri-user-star-line",
    title: "Licensed provider review",
    desc: "A provider licensed in your state decides whether you qualify — eligibility is never automatic.",
  },
  {
    icon: "ri-home-heart-line",
    title: "Landlord-ready documentation",
    desc: "If approved, you receive housing-focused documentation written for a Fair Housing Act accommodation request.",
  },
  {
    icon: "ri-qr-code-line",
    title: "Verification support",
    desc: "PawTenant letters include a Verification ID so a landlord can confirm authenticity without seeing any medical detail.",
  },
  {
    icon: "ri-lock-2-line",
    title: "Secure customer portal",
    desc: "Your documents live in a secure portal you can access, download, and share when a landlord requests them.",
  },
  {
    icon: "ri-git-branch-line",
    title: "Separate ESA and PSD paths",
    desc: "We keep ESA and PSD documentation distinct so the right process matches the right need.",
  },
  {
    icon: "ri-map-pin-line",
    title: "State-aware handling",
    desc: "Provider licensing and some housing rules vary by state, so documentation is handled with your state in mind where relevant.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "Is there an official ESA registry?",
    a: "No. There is no official government registry for emotional support animals. Any website that sells an \"ESA registration,\" certificate, or ID card is not a government program, and the listing itself carries no legal weight. What supports a housing accommodation request is a letter from a mental health professional licensed in your state, written after a real evaluation.",
  },
  {
    q: "Is an ESA certificate the same as an ESA letter?",
    a: "No. A certificate or ID card is usually a purchased document with no clinical review behind it. An ESA letter is written by a licensed provider after evaluating you, names their license and state, and is framed for a housing accommodation request. For housing, the provider letter is what matters — not a certificate.",
  },
  {
    q: "Is there an official PSD registry?",
    a: "No. There is no official registry that makes a dog a psychiatric service dog. Under the ADA, service dogs are not required to be registered or certified. What makes a dog a PSD is disability-related task training — not a database entry, certificate, or ID card.",
  },
  {
    q: "Do service dogs need registration?",
    a: "No. The ADA does not require service dogs to be registered, certified, or to wear an ID or vest. A dog becomes a service dog by being individually trained to perform tasks for a person's disability. Provider documentation can help in housing, but registration is not a legal requirement and does not create service-dog status.",
  },
  {
    q: "Is a PSD certificate the same as a PSD letter?",
    a: "No. A PSD \"certificate\" or ID card sold online does not prove a disability, training, or any legal status. PSD documentation from a licensed provider reflects a real clinical determination for a qualifying individual. Even then, a letter alone does not make a dog a service dog — the dog must be trained to perform specific tasks.",
  },
  {
    q: "Can my landlord require a registry ID?",
    a: "Generally no. For a housing accommodation request, a landlord can ask for documentation that reasonably supports a disability-related need — such as a letter from a licensed provider. A landlord requiring a specific \"registry\" ID or certificate is not the standard, because those documents don't establish the need the way provider documentation does.",
  },
  {
    q: "What should I show my landlord for ESA housing?",
    a: "A housing-focused ESA letter from a mental health professional licensed in your state, written after an evaluation. It should name the provider and their license, be dated, and frame a reasonable-accommodation request under the Fair Housing Act. That is far more useful than a registry card or certificate.",
  },
  {
    q: "What should I show my landlord for PSD housing documentation?",
    a: "For a psychiatric service dog, reliable documentation from a licensed provider that supports the disability-related need for an assistance animal can help with a housing accommodation request. Remember that a PSD's status comes from task training, not from documentation or a registry — the paperwork supports the housing request; the training defines the service dog.",
  },
  {
    q: "Is PawTenant a registry?",
    a: "No. PawTenant is not a registry and does not sell registrations, certificates, ID cards, or vests. We connect you with a licensed provider who evaluates you and, if appropriate, issues housing-focused ESA or PSD documentation — with a Verification ID a landlord can confirm and a refund if you don't qualify.",
  },
  {
    q: "Can PawTenant help if my landlord wants verification?",
    a: "Yes. PawTenant letters include a Verification ID and provider license details, and our support team can help both sides confirm a letter is genuine — without exposing your diagnosis or medical records. Verification confirms authenticity only; it does not require sharing clinical detail. No service can guarantee a landlord's decision.",
  },
];

export default function EsaPsdRegistryVsLetterPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "ESA & PSD Registry vs Letter: What Landlords Actually Need",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "ESA & PSD Registry vs Letter", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="ESA registry vs ESA letter, ESA registration vs ESA letter, emotional support animal registry, emotional support animal certificate, ESA certificate vs letter, service animal registry vs letter, PSD registry vs PSD letter, psychiatric service dog registry, psychiatric service dog certificate, psychiatric service dog letter, service dog registration vs documentation, do I need to register my ESA, do I need to register my service dog, ESA ID card vs ESA letter, PSD ID card vs PSD letter, ESA letter for housing, PSD letter for housing, landlord ready ESA letter, landlord ready PSD letter"
      />
      <meta property="og:type" content="article" />
      <meta property="og:image" content="https://pawtenant.com/assets/brand/og-default.jpg" />
      <meta name="twitter:card" content="summary_large_image" />
      <JsonLd data={schema} />

      <SharedNavbar />

      {/* HERO — text + trust + dual CTA, then a documentation trust visual */}
      <section className="relative pt-24 sm:pt-28 pb-12 sm:pb-16 bg-gradient-to-br from-[#fdf6ee] via-white to-orange-50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-9 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 bg-white border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
                <i className="ri-file-shield-2-line"></i>
                Registry vs provider-reviewed letter
              </span>
              <h1 className="text-[26px] sm:text-4xl md:text-[44px] font-bold text-gray-900 mb-4 leading-[1.13]">
                ESA &amp; PSD Registry vs Letter: What Landlords Actually Need
              </h1>
              <p className="text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                Registries, certificates, and ID cards may look official, but housing requests
                usually depend on proper documentation and provider review — not a registry card.
                Here's the difference, in plain terms.
              </p>
              <div className="flex justify-center lg:justify-start mb-6">
                <TrustBadgeRow badges={heroBadges} mobileCount={3} />
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
                <Link
                  to={withAttribution("/assessment")}
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
                >
                  <i className="ri-clipboard-line"></i>
                  Start Free Assessment
                </Link>
                <Link
                  to={withAttribution("/psd-assessment")}
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-800 font-bold text-sm rounded-md border border-gray-200 hover:border-orange-300 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  <i className="ri-shield-star-line"></i>
                  PSD Assessment
                </Link>
              </div>
            </div>
            <div className="relative max-w-[440px] mx-auto w-full">
              <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)] aspect-[4/3]">
                <img
                  src="/assets/lifestyle/person-paperwork-with-dog.jpg"
                  alt="A person reviewing housing documentation at home with their dog"
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
                <span className="text-[11px] font-bold text-gray-700">Provider-reviewed, verifiable</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* QUICK ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="Is an ESA or PSD registry the same as a real letter?">
            <p>
              No. An ESA or PSD <strong>registry, certificate, or ID card is not the same</strong> as
              a provider-reviewed letter or documentation. A registry is <strong>not a government
              approval</strong>, and there is no official national ESA or service-dog registry.
            </p>
            <p>
              For housing, <strong>landlord-ready documentation matters more than a registry card</strong>.
              ESA and PSD documentation also serve <strong>different needs</strong> and should not be
              mixed up — a PSD involves a service dog trained to perform tasks, while an ESA supports a
              disability-related need through comfort and companionship.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* COMPARISON TABLE — Registry / Certificate / ID vs ESA letter vs PSD documentation */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-8">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Side by side
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Registry / certificate / ID vs ESA letter vs PSD documentation
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              A quick reference. This is general housing information, not legal advice — check your
              local rules or an official fair-housing resource for your situation.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_8px_30px_-22px_rgba(15,23,42,0.25)]">
            {/* Header row (sm+) */}
            <div className="hidden sm:grid grid-cols-[0.9fr_1.1fr_1.1fr_1.1fr] bg-[#fdf6ee] border-b border-gray-100">
              <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                What matters
              </div>
              <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Registry / certificate / ID
              </div>
              <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-orange-600">
                ESA letter
              </div>
              <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[#4A8472]">
                PSD letter / documentation
              </div>
            </div>
            {compareRows.map((r) => (
              <div
                key={r.criterion}
                className="grid grid-cols-1 sm:grid-cols-[0.9fr_1.1fr_1.1fr_1.1fr] border-t border-gray-100 first:border-t-0 sm:first:border-t"
              >
                <div className="px-4 pt-4 pb-1 sm:py-4 bg-[#fafafa] sm:bg-transparent">
                  <span className="text-sm font-semibold text-gray-900">{r.criterion}</span>
                </div>
                <div className="px-4 py-1 sm:py-4">
                  <span className="sm:hidden block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                    Registry / certificate / ID
                  </span>
                  <span className="text-sm text-gray-600 leading-relaxed flex items-start gap-2">
                    <i className="ri-close-circle-line text-slate-400 mt-0.5 flex-shrink-0"></i>
                    <span>{r.registry}</span>
                  </span>
                </div>
                <div className="px-4 py-1 sm:py-4">
                  <span className="sm:hidden block text-[10px] font-bold uppercase tracking-wider text-orange-500 mb-0.5">
                    ESA letter
                  </span>
                  <span className="text-sm text-gray-600 leading-relaxed flex items-start gap-2">
                    <i className="ri-checkbox-circle-fill text-orange-500 mt-0.5 flex-shrink-0"></i>
                    <span>{r.esa}</span>
                  </span>
                </div>
                <div className="px-4 pt-1 pb-4 sm:py-4">
                  <span className="sm:hidden block text-[10px] font-bold uppercase tracking-wider text-[#4A8472] mb-0.5">
                    PSD letter / documentation
                  </span>
                  <span className="text-sm text-gray-600 leading-relaxed flex items-start gap-2">
                    <i className="ri-checkbox-circle-fill text-[#4A8472] mt-0.5 flex-shrink-0"></i>
                    <span>{r.psd}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DO I NEED TO REGISTER MY ESA? */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
            Common question
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-4">
            Do I need to register my ESA?
          </h2>
          <div className="space-y-4 text-gray-700 text-[15px] leading-relaxed">
            <p>
              Usually, no — and registration is not the same as housing documentation. There is no
              official ESA registry, so paying to be listed in a database or to receive a certificate
              does not create any legal right and is not what a landlord needs.
            </p>
            <p>
              For a housing accommodation request, what helps is a{" "}
              <Link to="/esa-letter-for-apartments" className="text-orange-600 font-semibold hover:underline">
                housing-focused ESA letter
              </Link>{" "}
              from a mental health professional licensed in your state, written after an evaluation.
              PawTenant will never tell you a registry is required — because it isn't.
            </p>
          </div>
        </div>
      </section>

      {/* DO I NEED TO REGISTER MY PSD / SERVICE DOG? */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
            Common question
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-4">
            Do I need to register my PSD or service dog?
          </h2>
          <div className="space-y-4 text-gray-700 text-[15px] leading-relaxed">
            <p>
              Service animals and psychiatric service dogs are different from emotional support
              animals. Under the ADA, <strong>service animals are not required to be registered or
              certified</strong>, and they don't have to wear an ID or vest.
            </p>
            <p>
              A psychiatric service dog (PSD) is a service dog <strong>trained to perform tasks</strong>{" "}
              related to a psychiatric disability. What makes a dog a service dog is that task training —
              not a registry entry, certificate, or ID card.
            </p>
            <p>
              PawTenant focuses on <strong>documentation support and provider-reviewed letters</strong>,
              not national registry claims. We do not train or certify service dogs, and we don't sell
              registrations. If you're weighing your options, our{" "}
              <Link to="/how-to-get-psd-letter" className="text-orange-600 font-semibold hover:underline">
                PSD letter guide
              </Link>{" "}
              and{" "}
              <Link to="/psd-letter-requirements" className="text-orange-600 font-semibold hover:underline">
                PSD requirements
              </Link>{" "}
              explain what actually matters.
            </p>
          </div>
        </div>
      </section>

      {/* ESA LETTER vs PSD LETTER — reusable card */}
      <EsaVsPsdCard className="bg-white" />

      <section className="pb-14 sm:pb-16 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="space-y-4 text-gray-700 text-[15px] leading-relaxed">
            <p>
              In short: an <strong>ESA letter</strong> usually supports an emotional support animal
              housing accommodation request. <strong>PSD documentation</strong> may support a
              psychiatric service dog housing request where appropriate. A PSD, though, requires{" "}
              <strong>task training</strong> — an online letter does not, by itself, make a dog a
              service dog. And no one should buy a registry card thinking it creates legal rights.
              Not sure which fits?{" "}
              <Link to="/esa-vs-psd-letter" className="text-orange-600 font-semibold hover:underline">
                Compare ESA vs PSD letters
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* WHY REGISTRY-STYLE WEBSITES ARE CONFUSING */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              Why it gets confusing
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Why registry-style websites are confusing
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              Many sites look official at a glance. Here's what tends to blur the line between a paid
              listing and real housing documentation.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {confusionPoints.map((item) => (
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

      {/* WHAT PAWTENANT PROVIDES INSTEAD */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
              A safer path
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              What PawTenant provides instead
            </h2>
            <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
              Not a registry — provider-reviewed documentation built for housing, with real
              verification behind it.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {pawtenantProvides.map((item) => (
              <div key={item.title} className="bg-[#fafafa] rounded-2xl border border-gray-100 p-5">
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
        image="/assets/lifestyle/owner-with-dog-laptop.jpg"
        alt="A person completing an online ESA assessment at home with their dog nearby"
        eyebrow="Documentation, not a database"
        heading="Provider review beats a registry card"
        body="A landlord can say yes with more confidence when a letter names a licensed provider and can be verified — something a purchased registry ID simply can't offer. That's the difference PawTenant is built around."
        bullets={[
          "Reviewed by a provider licensed in your state.",
          "Housing-focused, with a Verification ID landlords can confirm.",
          "Refund if a provider determines you don't qualify.",
        ]}
      />

      {/* WHEN A CERTIFICATE OR ID MAY STILL BE USEFUL */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-2">
            Being fair about it
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-4">
            When a certificate or ID may still be useful
          </h2>
          <div className="space-y-4 text-gray-700 text-[15px] leading-relaxed">
            <p>
              Some people genuinely like having a printable card or certificate — for personal
              organization, quick reference, or peace of mind when they're out and about with their
              animal. There's nothing wrong with that.
            </p>
            <p>
              Just don't mistake it for the real thing. A card or certificate is{" "}
              <strong>not a replacement for a proper ESA or PSD letter</strong>, it does{" "}
              <strong>not create housing rights</strong>, and a registry entry does{" "}
              <strong>not make a dog a service dog</strong>. For anything involving your landlord or a
              housing accommodation request, lean on provider-reviewed documentation — and keep the
              card as a personal convenience only.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="Registry vs letter: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* FINAL CTA — dual path */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Get provider-reviewed ESA or PSD documentation if approved
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Skip the registry cards. Connect with a licensed provider, and if you qualify, receive
            housing-focused documentation a landlord can verify — with a refund if you don't qualify.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Link
              to={withAttribution("/assessment")}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[15px] shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
            >
              <i className="ri-clipboard-line"></i>
              Start ESA Assessment
            </Link>
            <Link
              to={withAttribution("/psd-assessment")}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#4A8472] text-white font-bold rounded-md hover:bg-[#3d6f60] transition-colors cursor-pointer text-[15px] shadow-[0_4px_12px_rgba(74,132,114,0.30)]"
            >
              <i className="ri-shield-star-line"></i>
              Start PSD Assessment
            </Link>
          </div>
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
              { to: "/how-to-get-esa-letter-online", title: "How to get an ESA letter online", desc: "The step-by-step process from assessment to a provider-reviewed letter." },
              { to: "/esa-letter-for-apartments", title: "ESA letter for apartments", desc: "How an ESA housing accommodation request works for apartment renters." },
              { to: "/esa-letter-for-landlord", title: "ESA letter for your landlord", desc: "What to send your landlord and how they can verify it." },
              { to: "/how-to-verify-esa-letter", title: "How to verify an ESA letter", desc: "What a real, verifiable letter includes — and the registry red flags." },
              { to: "/esa-letter-cost", title: "ESA letter cost", desc: "Transparent pricing and what your fee actually includes." },
              { to: "/esa-vs-psd-letter", title: "ESA vs PSD letter", desc: "The difference between the two, and which one fits your need." },
              { to: "/psychiatric-service-dog-letter-online", title: "PSD letter online", desc: "How an online PSD evaluation works and who qualifies." },
              { to: "/psd-letter-for-apartments", title: "PSD letter for apartments", desc: "Using PSD documentation for a housing accommodation request." },
              { to: "/how-to-get-psd-letter", title: "How to get a PSD letter", desc: "The psychiatric service dog documentation process." },
              { to: "/psd-letter-requirements", title: "PSD letter requirements", desc: "A qualifying disability, task training, and a licensed provider." },
            ]}
          />
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="py-10 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <EducationalDisclaimer />
        </div>
      </section>

      <SharedFooter />
      <MobileStickyApplyCTA label="Start Free Assessment" icon="ri-clipboard-line" />
    </main>
  );
}
