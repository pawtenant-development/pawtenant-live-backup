import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
import SampleLetterCard from "../../components/feature/SampleLetterCard";
import VerificationPillarsSection from "../../components/feature/VerificationPillarsSection";
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

const PATH = "/is-pawtenant-legit";
const TITLE = "Is PawTenant Legit? How the ESA Letter Service Works | PawTenant";
const DESC =
  "Is PawTenant legit? PawTenant connects you with licensed mental health providers for ESA and PSD letters, with transparent pricing, verifiable letters, and a refund if you don't qualify.";
const UPDATED_HUMAN = "June 5, 2026";
const UPDATED_ISO = "2026-06-05";

const heroBadges = [
  { icon: "ri-user-star-line", label: "Licensed providers" },
  { icon: "ri-lock-line", label: "HIPAA-conscious process" },
  { icon: "ri-qr-code-line", label: "Verifiable letters" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

// Real provider network members (verbatim from the canonical PROVIDERS list
// used on the Google Ads landing page — no fabricated names or credentials).
const providers = [
  {
    name: "Stephanie White",
    credential: "Licensed Mental Health Professional",
    photo: "/assets/providers/provider-stephanie-white.jpg",
    bio: "Outpatient mental health practice. Anxiety, mood, and life-transition care.",
  },
  {
    name: "Robert Staaf",
    credential: "Licensed Mental Health Professional",
    photo: "/assets/providers/provider-robert-staaf.jpg",
    bio: "Years of clinical experience supporting tenants with documented housing needs.",
  },
  {
    name: "Lytara Garcia",
    credential: "Licensed Mental Health Professional",
    photo: "/assets/providers/provider-lytara-garcia.jpg",
    bio: "Clinical evaluations focused on emotional support animal accommodation context.",
  },
];

const whatWeDo = [
  {
    icon: "ri-stethoscope-line",
    title: "Connect you with a licensed provider",
    desc: "Your assessment is reviewed by a Licensed Mental Health Practitioner credentialed in your state. They apply real clinical judgment to decide whether an ESA or PSD letter is appropriate.",
  },
  {
    icon: "ri-file-text-line",
    title: "Issue a proper letter — when appropriate",
    desc: "If you qualify, you receive a letter on official letterhead with the provider's name, license type, license number, and signature, prepared for housing accommodation requests.",
  },
  {
    icon: "ri-qr-code-line",
    title: "Make letters verifiable",
    desc: "Each finalized letter carries a unique Verification ID. A landlord can confirm it's genuine — without ever seeing your diagnosis or clinical details.",
  },
  {
    icon: "ri-customer-service-2-line",
    title: "Provide real support",
    desc: "You can reach a real person by phone or email if your landlord has questions or you need help with your letter.",
  },
];

const whatWeDont = [
  "We don't promise \"guaranteed approval\" — a provider may decide an ESA or PSD isn't clinically appropriate for you.",
  "We don't guarantee that a landlord will accept your letter; each accommodation is decided individually.",
  "We don't sell ESA \"registrations,\" certificates, ID cards, or vests — these have no legal weight.",
  "We don't claim ESA letters grant airline or public-access rights — those are different categories.",
  "We don't provide legal advice or legal representation.",
];

const trustBlocks = [
  {
    icon: "ri-user-star-line",
    title: "Licensed provider review",
    desc: "Every letter is issued by a mental health provider holding an active license in your state, with their license number and NPI on the document — details a landlord can verify on the public NPI registry.",
  },
  {
    icon: "ri-lock-line",
    title: "Privacy & security",
    desc: "Your intake is handled through a HIPAA-conscious process. Landlord verification confirms authenticity only — your diagnosis and clinical history are never exposed.",
  },
  {
    icon: "ri-price-tag-3-line",
    title: "Transparent pricing & refund",
    desc: "ESA letters are $109/year or $129 one-time, shown before you start. If you don't qualify after the clinical review, you're refunded — no charge for a letter you can't use.",
  },
  {
    icon: "ri-shield-check-line",
    title: "Verification ID for landlords",
    desc: "Each finalized letter includes a unique Verification ID landlords can confirm at pawtenant.com/verify, so your documentation stands up to scrutiny.",
  },
];

const faqs: FaqItem[] = [
  {
    q: "Is PawTenant legit?",
    a: "Yes. PawTenant is an online service that connects you with mental health providers licensed in your state who evaluate you and, when clinically appropriate, issue an ESA or PSD letter for housing. Letters name the licensed provider and carry a unique Verification ID landlords can confirm. PawTenant does not guarantee approval and does not sell 'registrations' or certificates.",
  },
  {
    q: "Is PawTenant a scam?",
    a: "No. The warning signs of an ESA scam are instant or guaranteed letters with no evaluation, selling 'registrations' as if required, and no named licensed provider. PawTenant works the opposite way: a real evaluation by a state-licensed provider, transparent pricing, verifiable letters, and a refund if you don't qualify.",
  },
  {
    q: "Are PawTenant's providers actually licensed?",
    a: "Yes. Each letter is issued by a Licensed Mental Health Practitioner who holds an active license in the state where you live. The provider's name, license number, and NPI appear on the letter, and a landlord can independently confirm the license on the public NPPES NPI registry.",
  },
  {
    q: "How much does PawTenant cost?",
    a: "A PawTenant ESA letter is $109/year (annual subscription) or $129 one-time. The price is shown up front, and if you don't qualify after the clinical review you're refunded.",
  },
  {
    q: "Will my landlord accept a PawTenant letter?",
    a: "Many housing providers accept a valid letter from a licensed provider, and a PawTenant letter is built to be verifiable. Still, each reasonable-accommodation request is reviewed individually under the Fair Housing Act, so no service can guarantee a landlord's decision.",
  },
  {
    q: "How do I contact PawTenant?",
    a: "You can reach PawTenant by phone at (409) 965-5885 or by email at hello@pawtenant.com. Support can help with your letter and with landlord verification questions.",
  },
];

export default function IsPawTenantLegitPage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "Is PawTenant Legit? How the ESA Letter Service Works",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Is PawTenant Legit?", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="is PawTenant legit, PawTenant reviews, PawTenant ESA letter, PawTenant licensed provider, PawTenant scam or legit, is PawTenant real, PawTenant trustworthy"
      />
      <meta property="og:type" content="article" />
      <meta property="og:image" content="https://pawtenant.com/assets/brand/og-default.jpg" />
      <meta name="twitter:card" content="summary_large_image" />
      <JsonLd data={schema} />

      <SharedNavbar />

      {/* HERO — mobile-first: text + trust + CTA, then a real sample-letter
          visual near the fold. Single eager image. */}
      <section className="relative pt-24 sm:pt-28 pb-12 sm:pb-16 bg-gradient-to-br from-[#fdf6ee] via-white to-orange-50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-9 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 bg-white border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
                <i className="ri-verified-badge-line"></i>
                Trust &amp; Transparency
              </span>
              <h1 className="text-[27px] sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-[1.12]">
                Is PawTenant Legit?
              </h1>

              {/* Mobile-only hero visual — right after the H1 so the sample
                  letter is visible early on phones. Desktop uses the right
                  column instead. */}
              <div className="lg:hidden mt-6 mb-5 relative max-w-[250px] mx-auto">
                <div aria-hidden="true" className="absolute -inset-4 bg-orange-100/50 rounded-[2rem] blur-2xl"></div>
                <div className="relative">
                  <SampleLetterCard size="default" eager />
                </div>
              </div>

              {/* Long paragraph hidden on phones to keep the hero compact */}
              <p className="hidden sm:block text-gray-600 text-[15px] sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
                A straight answer about how PawTenant works — what we do, what we don't promise, and
                how our letters are verified — so you can decide for yourself.
              </p>
              <div className="flex justify-center lg:justify-start mb-6">
                <TrustBadgeRow badges={heroBadges} mobileCount={3} />
              </div>
              <Link
                to={withAttribution("/assessment")}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
              >
                <i className="ri-shield-check-line"></i>
                Start ESA Assessment
              </Link>
            </div>
            {/* Desktop visual (right column) */}
            <div className="hidden lg:block relative max-w-[460px] mx-auto w-full">
              <div aria-hidden="true" className="absolute -inset-6 bg-orange-100/50 rounded-[2.5rem] blur-2xl"></div>
              <div className="relative">
                <SampleLetterCard size="default" eager />
                <p className="text-center text-[11px] text-gray-400 mt-3 leading-relaxed">
                  Every letter carries a Verification ID — names &amp; details are placeholders.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="Is PawTenant legit?">
            <p>
              Yes. PawTenant is an online service that connects you with <strong>mental health
              providers licensed in your state</strong> who evaluate you and, when clinically
              appropriate, issue an <strong>ESA or PSD letter for housing</strong>. Every letter names
              the licensed provider and carries a <strong>unique Verification ID</strong> a landlord
              can confirm.
            </p>
            <p>
              PawTenant does <strong>not</strong> guarantee approval, does not sell "registrations" or
              certificates, and refunds you if you don't qualify. Pricing is transparent: $109/year or
              $129 one-time.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* Emotional lifestyle visual — real people, real pets */}
      <LifestyleImageSection
        reverse
        className="bg-[#fafafa] border-y border-gray-100"
        image="/assets/testimonials/man-with-dog-home.jpg"
        alt="A relaxed pet owner at home with their emotional support dog"
        eyebrow="Real people, real support"
        heading="A straightforward service for people who genuinely need it"
        body="PawTenant connects you with a licensed mental health provider, gives you a verifiable letter when an ESA is appropriate, and is upfront about what it can and can't promise. No registries, no certificates, no guarantees of approval."
        bullets={[
          "Licensed provider review credentialed in your state.",
          "HIPAA-conscious process; landlord verification never exposes your diagnosis.",
          "Money-back if you don't qualify.",
        ]}
      />

      {/* WHAT PAWTENANT DOES */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8 text-center leading-tight">
            What PawTenant does
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {whatWeDo.map((s) => (
              <div key={s.title} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${s.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{s.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT PAWTENANT DOES NOT PROMISE */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-tight">
            What PawTenant does not promise
          </h2>
          <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed mb-5">
            Being clear about our limits is part of being legitimate. PawTenant does not:
          </p>
          <ul className="space-y-3">
            {whatWeDont.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <i className="ri-close-circle-line text-slate-400 mt-0.5 flex-shrink-0"></i>
                <p className="text-gray-600 text-sm leading-relaxed">{item}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* TRUST BLOCKS */}
      <section className="py-14 sm:py-16 bg-[#fdf6ee]">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-3">
              Why you can trust the process
            </h2>
            <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed max-w-2xl mx-auto">
              The things that make documentation credible — a licensed provider, privacy, transparent
              pricing, and verification.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {trustBlocks.map((b) => (
              <div key={b.title} className="bg-white rounded-2xl border border-orange-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${b.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{b.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              to="/esa-letter-verification"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:text-orange-700"
            >
              See how landlord verification works
              <i className="ri-arrow-right-line"></i>
            </Link>
          </div>
        </div>
      </section>

      {/* PROVIDER CREDIBILITY BLOCK — real network members, no fabricated data */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-9">
            <span className="inline-block text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
              Real licensed providers
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-3">
              Letters come from our licensed provider network
            </h2>
            <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed max-w-2xl mx-auto">
              Every PawTenant letter is reviewed and signed by a state-licensed mental health provider —
              their name, license number, and NPI appear on the document.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            {providers.map((p) => (
              <div key={p.name} className="bg-[#fafafa] rounded-2xl border border-gray-100 p-5 text-center">
                <div className="w-20 h-20 mx-auto mb-3 rounded-full overflow-hidden ring-2 ring-white shadow-[0_6px_16px_-8px_rgba(15,23,42,0.3)]">
                  <img
                    src={p.photo}
                    alt={`${p.name}, ${p.credential} in the PawTenant provider network`}
                    width={160}
                    height={160}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover object-center"
                  />
                </div>
                <h3 className="font-bold text-gray-900 text-sm leading-snug">{p.name}</h3>
                <p className="text-[11px] font-semibold text-orange-600 mb-2">{p.credential}</p>
                <p className="text-[12.5px] text-gray-600 leading-relaxed">{p.bio}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-5 max-w-xl mx-auto leading-relaxed">
            Provider availability varies by state. You're matched with a provider licensed where you live.
          </p>
        </div>
      </section>

      {/* TRUST PILLARS — reusable verification trust section (visual cards) */}
      <VerificationPillarsSection variant="compact" showCTA showPrivacyNote className="bg-[#fafafa] border-t border-gray-100" />

      {/* PRICING / KLARNA — reusable cost section */}
      <EsaPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa]">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="Is PawTenant legit? FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            See for yourself
          </h2>
          <p className="text-gray-500 text-sm sm:text-base mb-7">
            Take the short assessment. A licensed provider reviews your case — and you're only charged
            if you qualify.
          </p>
          <Link
            to={withAttribution("/assessment")}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 sm:px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[15px] sm:text-base shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
          >
            <i className="ri-shield-check-line"></i>
            Start ESA Assessment
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
              { to: "/are-online-esa-letters-legit", title: "Are online ESA letters legit?", desc: "How to tell a real letter from a worthless one." },
              { to: "/best-online-esa-letter-service", title: "Best online ESA letter service", desc: "How to choose a legitimate service." },
              { to: "/esa-letter-verification", title: "Landlord verification", desc: "How a landlord confirms a letter is authentic." },
              { to: "/esa-letter-cost", title: "ESA letter cost", desc: "Transparent pricing and what your fee includes." },
              { to: "/no-risk-guarantee", title: "Money-back guarantee", desc: "What's covered if you don't qualify." },
              { to: "/about-us", title: "About PawTenant", desc: "Our network of licensed providers." },
            ]}
          />
        </div>
      </section>

      {/* PSD CROSS-LINK — small, ESA stays the focus */}
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

      <SharedFooter />
      <MobileStickyApplyCTA label="Start ESA Assessment" icon="ri-shield-check-line" />
    </main>
  );
}
