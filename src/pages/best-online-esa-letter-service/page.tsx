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
  ComparisonTable,
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

const PATH = "/best-online-esa-letter-service";
const TITLE = "Best Online ESA Letter Service: How to Choose (2026) | PawTenant";
const DESC =
  "How to choose the best online ESA letter service: licensed provider review, transparent pricing, state compliance, housing focus, and verifiable letters — explained honestly.";
const UPDATED_HUMAN = "June 5, 2026";
const UPDATED_ISO = "2026-06-05";

const heroBadges = [
  { icon: "ri-user-star-line", label: "Licensed providers" },
  { icon: "ri-price-tag-3-line", label: "Transparent pricing" },
  { icon: "ri-qr-code-line", label: "Verifiable letters" },
  { icon: "ri-refund-2-line", label: "Refund if you don't qualify" },
];

const criteria = [
  {
    criterion: "Real licensed provider review",
    good: "A mental health provider who is licensed in your state actually evaluates you. The letter names the provider, their license type, license number, and state — not an anonymous 'instant' document.",
  },
  {
    criterion: "Transparent pricing",
    good: "The full price is shown up front with no surprise upsells. You know what you pay before you start, and what that fee includes.",
  },
  {
    criterion: "State-specific guidance",
    good: "The service understands rules that vary by state (for example, California and Iowa require a 30-day provider relationship) and won't promise something the law in your state doesn't allow.",
  },
  {
    criterion: "Housing-use focus",
    good: "The letter is written for Fair Housing Act accommodation requests. Reputable services don't claim ESA letters grant airline or public-access rights — those are different categories.",
  },
  {
    criterion: "Refund / support policy",
    good: "If you don't qualify after the clinical review, you aren't charged for a letter you can't use. Real human support is available if your landlord asks questions.",
  },
  {
    criterion: "Privacy-conscious process",
    good: "Your information is handled carefully. Landlord verification confirms the letter is authentic without exposing your diagnosis or clinical details.",
  },
  {
    criterion: "No guaranteed approval without evaluation",
    good: "No legitimate service promises 'guaranteed approval' or 'everyone qualifies.' A provider issues a letter only when an ESA is clinically appropriate for you.",
  },
];

const pawtenantPoints = [
  {
    icon: "ri-stethoscope-line",
    title: "Licensed provider evaluation",
    desc: "Every request is reviewed by a Licensed Mental Health Practitioner credentialed in your state. If you don't qualify, no letter is issued.",
  },
  {
    icon: "ri-price-tag-3-line",
    title: "Clear pricing",
    desc: "$109/year subscription or $129 one-time, shown before you start. No hidden 'registration' fees.",
  },
  {
    icon: "ri-shield-check-line",
    title: "Verifiable documentation",
    desc: "Each finalized letter carries a unique Verification ID and the provider's license details so a landlord can confirm it's genuine.",
  },
  {
    icon: "ri-refund-2-line",
    title: "Money-back if you don't qualify",
    desc: "You aren't charged for a letter you can't use. A valid letter supports your housing request — but no service can guarantee a landlord's decision.",
  },
];

const notRightFor = [
  "You want a letter without any evaluation, or a 'guaranteed' result — a provider may decide an ESA isn't clinically appropriate for you.",
  "You need airline or public-access rights. ESA letters are for housing; trained service dogs under the ADA are a different category.",
  "You want an ESA 'registration,' certificate, ID card, or vest — these have no legal weight and PawTenant does not sell them.",
  "You need legal representation in a housing dispute — that's a job for a tenant-rights attorney or HUD, not a documentation service.",
];

const faqs: FaqItem[] = [
  {
    q: "What is the best online ESA letter service?",
    a: "The best online ESA letter service is the one that uses a real evaluation by a provider licensed in your state, shows transparent pricing, focuses on housing use, follows your state's rules, and issues a letter you can independently verify. Rather than trusting a 'best' label, check any service — including PawTenant and alternatives like Pettable or Wellness Wag — against those criteria.",
  },
  {
    q: "How do I know if an online ESA letter service is legitimate?",
    a: "Look for a named, state-licensed provider, a genuine clinical evaluation, transparent pricing, and a letter that can be verified. Avoid services that promise instant or guaranteed approval, sell 'registrations' or certificates, or have no licensed provider behind the document.",
  },
  {
    q: "Is PawTenant a good alternative to other ESA letter services?",
    a: "PawTenant is built around the criteria most people use to judge a service: a licensed provider evaluation in your state, transparent pricing, housing-focused letters, verifiable documentation, and a refund if you don't qualify. We can't speak for other companies' current practices, so we encourage you to compare each service against the same checklist.",
  },
  {
    q: "How much should a legitimate ESA letter cost?",
    a: "Prices vary, but a legitimate letter reflects real clinical work by a licensed provider. PawTenant's ESA letter is $109/year or $129 one-time. Be cautious of letters priced far below the norm — that can signal the evaluation is being skipped, which makes the letter invalid.",
  },
  {
    q: "Can any service guarantee my landlord will accept the letter?",
    a: "No. Any service that 'guarantees' landlord approval is making a claim it cannot back up. Each reasonable-accommodation request is reviewed individually by the housing provider under the Fair Housing Act. A valid letter from a licensed provider strengthens your request, but the outcome is decided case by case.",
  },
  {
    q: "Do online ESA letters work in every state?",
    a: "The federal Fair Housing Act applies nationwide, but some states add their own documentation rules. A good service tailors the process to your state — for example, California and Iowa require a 30-day provider relationship before a letter can be issued.",
  },
];

export default function BestOnlineESALetterServicePage() {
  const { withAttribution } = useAttributionParams();

  const schema = graph(
    { ...organizationSchema(), "@id": "https://pawtenant.com/#organization" },
    serviceSchema(),
    webPageSchema({ url: PATH, name: TITLE, description: DESC, dateModified: UPDATED_ISO }),
    articleSchema({
      url: PATH,
      headline: "Best Online ESA Letter Service: How to Choose",
      description: DESC,
      datePublished: UPDATED_ISO,
    }),
    faqSchema(faqs),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Best Online ESA Letter Service", path: PATH },
    ]),
  );

  return (
    <main>
      <meta
        name="keywords"
        content="best online ESA letter service, best ESA letter online, legitimate ESA letter online, Pettable alternative, Wellness Wag alternative, how to choose ESA letter service, online ESA letter comparison"
      />
      <meta property="og:type" content="article" />
      <meta property="og:image" content="https://pawtenant.com/assets/brand/og-default.jpg" />
      <meta name="twitter:card" content="summary_large_image" />
      <JsonLd data={schema} />

      <SharedNavbar />

      {/* HERO — mobile-first: text + trust + CTA, then a real sample-letter
          visual near the fold. Single eager image; everything else lazy. */}
      <section className="relative pt-24 sm:pt-28 pb-12 sm:pb-16 bg-gradient-to-br from-[#fdf6ee] via-white to-orange-50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-9 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 bg-white border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
                <i className="ri-scales-3-line"></i>
                Buyer's Guide
              </span>
              <h1 className="text-[27px] sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-[1.12]">
                Best Online ESA Letter Service: How to Choose
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
                There's no single "best" service for everyone — there are clear criteria that separate
                a legitimate ESA letter from a worthless one. Here's how to judge any service, and how
                PawTenant measures up honestly.
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
                  Sample PawTenant letter — names &amp; details are placeholders.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIRECT ANSWER */}
      <section className="py-12 sm:py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <AIAnswerBox question="What is the best online ESA letter service?">
            <p>
              The best online ESA letter service is one that uses a <strong>real evaluation by a
              provider licensed in your state</strong>, shows <strong>transparent pricing</strong>,
              focuses on <strong>housing use</strong>, follows your state's rules, and issues a letter
              you can <strong>independently verify</strong>. Instead of trusting a "best" label, check
              any service — including PawTenant and alternatives like Pettable or Wellness Wag —
              against those criteria.
            </p>
            <p>
              PawTenant is built around that checklist: a licensed provider evaluation in your state,
              clear $109/year or $129 one-time pricing, verifiable letters, and a refund if you don't
              qualify. No service can guarantee landlord approval.
            </p>
          </AIAnswerBox>
        </div>
      </section>

      {/* Emotional lifestyle visual — the benefit of ESA support */}
      <LifestyleImageSection
        className="bg-[#fafafa] border-y border-gray-100"
        image="/assets/blog/hug-close-1.jpg"
        alt="A pet owner hugging their emotional support dog at home"
        eyebrow="More than paperwork"
        heading="The right service protects the bond that actually helps you"
        body="An ESA letter is a means to an end — keeping the companion who supports your mental health where you live. A legitimate service treats that seriously: a real evaluation, an honest answer, and documentation your landlord can trust."
        bullets={[
          "Licensed provider decides if an ESA is clinically appropriate for you.",
          "Housing-focused letter built for Fair Housing Act requests.",
          "Refund if you don't qualify — no charge for a letter you can't use.",
        ]}
      />

      {/* WHAT MAKES A LETTER VALID */}
      <section className="py-14 sm:py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-tight">
            What makes an ESA letter valid for housing?
          </h2>
          <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed mb-5">
            For a housing accommodation request under the Fair Housing Act, what matters is the
            licensed provider and the real clinical process behind the letter — not the website it
            came from. A valid letter generally:
          </p>
          <ul className="space-y-3">
            {[
              "Is written and signed by a mental health provider licensed in the state where you live.",
              "Follows a genuine evaluation — the provider applies clinical judgment to your situation.",
              "Is on official letterhead with the provider's name, license type, license number, and state.",
              "Complies with any state-specific rules (such as a required provider-relationship period).",
              "Can be independently verified, so a landlord can confirm it is authentic.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <i className="ri-checkbox-circle-fill text-orange-500 mt-0.5 flex-shrink-0"></i>
                <p className="text-gray-700 text-sm leading-relaxed">{item}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* COMPARISON CRITERIA TABLE */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-3">
              How to compare ESA letter services
            </h2>
            <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed max-w-2xl mx-auto">
              Use these criteria to evaluate any online ESA letter service. A responsible service
              should clearly meet each one.
            </p>
          </div>
          <ComparisonTable caption="What to look for" rows={criteria} />
        </div>
      </section>

      {/* HOW PAWTENANT COMPARES */}
      <section className="py-14 sm:py-16 bg-[#fdf6ee]">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-3">
              How PawTenant measures up
            </h2>
            <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed max-w-2xl mx-auto">
              We can't speak for other companies' current practices, so compare each service against
              the same checklist. Here's where PawTenant stands.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pawtenantPoints.map((p) => (
              <div key={p.title} className="bg-white rounded-2xl border border-orange-100 p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${p.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{p.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST PILLARS — reusable verification trust section (visual cards) */}
      <VerificationPillarsSection variant="compact" showPrivacyNote className="bg-white border-t border-gray-100" />

      {/* WHEN PAWTENANT MAY NOT BE RIGHT */}
      <section className="py-14 sm:py-16 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-tight">
            When PawTenant may not be the right fit
          </h2>
          <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed mb-5">
            Being honest matters more than winning every visitor. PawTenant probably isn't right for
            you if:
          </p>
          <ul className="space-y-3">
            {notRightFor.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <i className="ri-information-line text-slate-400 mt-0.5 flex-shrink-0"></i>
                <p className="text-gray-600 text-sm leading-relaxed">{item}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* PRICING / KLARNA — reusable cost section (single source of truth) */}
      <EsaPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-14 sm:py-16 bg-[#fafafa]">
        <div className="px-5 sm:px-6">
          <SeoFaqSection
            heading="Best online ESA letter service: FAQ"
            eyebrow="Common questions"
            faqs={faqs}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            Ready to start with a licensed provider?
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
      <section className="py-14 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <RelatedResources
            links={[
              { to: "/are-online-esa-letters-legit", title: "Are online ESA letters legit?", desc: "How to tell a real letter from a worthless one." },
              { to: "/how-to-get-esa-letter-online", title: "How to get an ESA letter online", desc: "The step-by-step process from assessment to letter." },
              { to: "/esa-letter-cost", title: "ESA letter cost", desc: "Transparent pricing and what your fee includes." },
              { to: "/is-pawtenant-legit", title: "Is PawTenant legit?", desc: "What PawTenant does — and what it does not promise." },
              { to: "/esa-letter-for-landlord", title: "ESA letter for your landlord", desc: "How housing accommodation works and what to send." },
              { to: "/esa-letter-verification", title: "Landlord verification", desc: "How a landlord confirms a letter is authentic." },
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
