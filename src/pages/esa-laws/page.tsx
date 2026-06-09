import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import Hud2026UpdateBanner from "../../components/feature/Hud2026UpdateBanner";
import VerificationPillarsSection from "../../components/feature/VerificationPillarsSection";
import SampleLetterCard from "../../components/feature/SampleLetterCard";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
import EsaPricingMini from "../../components/feature/EsaPricingMini";
import { LifestyleImageSection } from "../../components/feature/SeoKit";

const heroBadges = [
  { icon: "ri-shield-check-line", label: "HIPAA-secure intake" },
  { icon: "ri-user-star-line", label: "Licensed providers" },
  { icon: "ri-qr-code-line", label: "Verifiable documentation" },
  { icon: "ri-refund-2-line", label: "Money-back if you don't qualify" },
];

/**
 * /esa-laws — General ESA laws & letter requirements (informational).
 *
 * Compliance-safe content guidelines applied here:
 *  - ESA protections are framed as HOUSING accommodation under the federal
 *    Fair Housing Act (42 U.S.C. § 3601 et seq.). We do NOT imply public
 *    access to stores, restaurants, hotels, or airplanes (that is service-dog
 *    / PSD territory, and even PSD public access is task-specific).
 *  - No "guaranteed approval", "instant approval", "certified/registered ESA",
 *    or "everyone qualifies" language. Eligibility depends on a licensed
 *    provider's clinical evaluation and applicable law.
 *  - Informational only, not legal advice (see disclaimer block).
 *
 * Source notes (authoritative):
 *  - Fair Housing Act: 42 U.S.C. § 3601 et seq. (assistance animals are a
 *    reasonable accommodation, not "pets").
 *  - HUD, "Assistance Animals" program page (hud.gov). NOTE: HUD withdrew
 *    several FHEO guidance documents in September 2025, and a Federal Register
 *    notice was published in April 2026. Do NOT cite FHEO-2020-01 as current
 *    guidance. The Fair Housing Act itself remains federal law, so the
 *    underlying reasonable-accommodation duty still applies.
 *  - Air travel: U.S. DOT Air Carrier Access Act final rule (eff. Jan 2021) —
 *    airlines are no longer required to treat ESAs as service animals.
 */

const requirements = [
  {
    icon: "ri-user-heart-line",
    title: "A licensed provider",
    desc: "The letter must be written and signed by a licensed mental health provider (such as an LMHP, LCSW, LPC, psychologist, or therapist) who is credentialed in the state where you live.",
  },
  {
    icon: "ri-stethoscope-line",
    title: "A real evaluation",
    desc: "The provider reviews your situation and uses clinical judgment to decide whether an emotional support animal is clinically appropriate for you. There is no automatic or guaranteed approval.",
  },
  {
    icon: "ri-file-list-3-line",
    title: "Proper documentation",
    desc: "A valid letter is on the provider's letterhead and typically lists their name, license type, license number, the state of licensure, and the signature and date.",
  },
  {
    icon: "ri-home-heart-line",
    title: "A housing purpose",
    desc: "An ESA letter supports a reasonable accommodation request for housing. It is not a license, a registry entry, an ID card, or a certificate.",
  },
];

const canDo = [
  "Support a reasonable accommodation request so a housing provider considers your emotional support animal even under a \"no pets\" policy.",
  "Help you ask a landlord to waive pet fees or pet deposits for a qualifying assistance animal (many jurisdictions prohibit these for assistance animals).",
  "Document, in writing from a licensed provider, that the animal is part of your support plan for a qualifying condition.",
];

const cannotDo = [
  "Guarantee that a housing provider will approve your request — accommodations are evaluated case by case under the law.",
  "Give your animal public-access rights to restaurants, stores, hotels, or other businesses. That is the domain of trained service dogs under the ADA, not ESAs.",
  "Require an airline to allow your ESA in the cabin for free. Since the 2021 DOT rule change, airlines generally treat ESAs as regular pets.",
  "Replace a clinical evaluation. No website can \"register\" or \"certify\" an ESA in a way that carries legal weight.",
];

const faqs = [
  {
    q: "Is there an official ESA registry or certificate?",
    a: "No. There is no official emotional support animal registry in the United States, and no certificate, ID card, or vest carries legal weight on its own. What matters for a housing accommodation request is a letter from a licensed mental health provider based on a real evaluation. Be cautious of any site selling instant \"registration\" or \"certification.\"",
  },
  {
    q: "Does an ESA letter guarantee my landlord has to say yes?",
    a: "No. The Fair Housing Act requires housing providers to consider reasonable-accommodation requests, but each request is evaluated individually. A valid letter from a licensed provider strengthens your request; it does not guarantee approval, and a provider will only issue a letter when an ESA is clinically appropriate for you.",
  },
  {
    q: "Can I take my emotional support animal into stores or restaurants?",
    a: "Generally no. ESA protections are focused on housing. Public-access rights to businesses are reserved for trained service dogs under the Americans with Disabilities Act (ADA). Any service implying an ESA letter gives you access to restaurants, stores, or hotels is misleading.",
  },
  {
    q: "Can my landlord charge a pet fee for my ESA?",
    a: "Under the Fair Housing Act, a qualifying assistance animal is not treated as a \"pet,\" so pet fees and pet deposits generally do not apply. A housing provider may still hold you responsible for any actual damage the animal causes. Some states (such as Iowa) restate this protection explicitly.",
  },
  {
    q: "What can a landlord ask for after I submit my letter?",
    a: "A housing provider may confirm the letter is authentic and that the provider is licensed in your state, and may ask whether the animal is part of your treatment plan if that is not already clear. They should not ask for your specific diagnosis or detailed medical records — that information stays between you and your provider.",
  },
  {
    q: "Do ESA rules differ by state?",
    a: "Yes. The federal Fair Housing Act applies nationwide, but several states add their own rules. For example, California (AB 468) and Iowa (Senate File 2268) require a provider-client relationship of at least 30 days before an ESA letter is issued, and Florida (Statute 760.27) sets specific documentation standards. See our state guides for details.",
  },
];

export default function ESALawsPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="ESA laws, ESA letter requirements, emotional support animal laws, Fair Housing Act ESA, reasonable accommodation ESA, ESA housing rights, valid ESA letter, licensed provider ESA letter"
      />
      <meta property="og:type" content="article" />
      <meta name="twitter:card" content="summary_large_image" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />

      <SharedNavbar />

      {/* Hero — two-column, gradient (no remote image dependency) */}
      <section className="relative pt-28 sm:pt-32 pb-14 sm:pb-20 bg-gradient-to-br from-[#fdf6ee] via-white to-orange-50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-2 bg-white border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
                <i className="ri-scales-3-line"></i>
                ESA Laws &amp; Letter Requirements
              </span>
              <h1 className="text-[28px] sm:text-4xl md:text-5xl font-bold text-gray-900 mb-5 leading-[1.12]">
                ESA Laws &amp; What a Valid ESA Letter Actually Requires
              </h1>

              {/* Mobile-only hero visual — right after the H1 so the sample
                  letter is visible early on phones. Desktop uses the right
                  column instead. */}
              <div className="lg:hidden mt-6 mb-5 relative max-w-[250px] mx-auto">
                <div aria-hidden="true" className="absolute -inset-4 bg-orange-100/50 rounded-[2rem] blur-2xl"></div>
                <div className="relative">
                  <SampleLetterCard eager />
                </div>
              </div>

              {/* Long paragraph hidden on phones to keep the hero compact */}
              <p className="hidden sm:block text-gray-600 text-[15px] sm:text-lg leading-relaxed max-w-xl mb-6">
                A clear, honest explanation of how emotional support animals are protected under the federal Fair Housing Act — what a legitimate ESA letter needs, what it can do, and what it cannot do.
              </p>
              <div className="flex flex-wrap gap-2 mb-7">
                {heroBadges.map((b, i) => (
                  <span key={b.label} className={`${i >= 3 ? "hidden sm:inline-flex" : "inline-flex"} items-center gap-1.5 bg-white/70 border border-gray-200 rounded-full px-3 py-1.5 text-xs font-semibold text-gray-700`}>
                    <i className={`${b.icon} text-orange-500`}></i>
                    {b.label}
                  </span>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/assessment"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_4px_12px_rgba(249,115,22,0.25)]"
                >
                  <i className="ri-file-text-line"></i>
                  Start ESA Assessment
                </Link>
                <Link
                  to="/housing-rights-esa"
                  className="inline-flex items-center justify-center gap-1.5 px-6 py-3 text-sm font-semibold text-gray-700 border border-gray-300 rounded-md hover:border-orange-400 hover:text-orange-600 transition-colors cursor-pointer bg-white/60"
                >
                  ESA housing rights
                  <i className="ri-arrow-right-line text-xs"></i>
                </Link>
              </div>
              <p className="text-xs text-gray-400 mt-4 max-w-md leading-relaxed">
                A licensed provider decides whether an ESA is clinically appropriate — approval is never guaranteed.
              </p>
            </div>
            {/* Desktop sample letter (right column). Mobile uses the in-flow
                copy after the H1 above. */}
            <div className="hidden lg:block lg:col-span-5">
              <div className="relative max-w-[440px] mx-auto w-full">
                <div aria-hidden="true" className="absolute -inset-6 bg-orange-100/50 rounded-[2.5rem] blur-2xl"></div>
                <div className="relative">
                  <SampleLetterCard eager />
                  <p className="text-center text-[11px] text-gray-400 mt-3 leading-relaxed">
                    Sample ESA letter — names &amp; details are placeholders.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Emotional lifestyle visual — right after hero, before the legal text */}
      <LifestyleImageSection
        className="bg-[#fafafa] border-y border-gray-100"
        image="/assets/testimonials/home-together-with-pet.jpg"
        alt="A tenant relaxing at home with their emotional support animal"
        eyebrow="Why it matters"
        heading="ESA law is really about keeping you and your animal at home together"
        body="Behind the statutes is a simple goal: letting people who rely on an emotional support animal keep that companion where they live. Here's what the law actually requires — in plain language."
        bullets={[
          "An ESA is treated as an assistance animal for housing, not an ordinary pet.",
          "A qualifying request can be honored even under a “no pets” policy.",
          "Pet fees and deposits generally don't apply to assistance animals.",
        ]}
      />

      {/* What the law protects */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-5">
            How the Fair Housing Act protects ESA owners
          </h2>
          <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed mb-4 max-w-3xl">
            The federal Fair Housing Act (42 U.S.C. § 3601 et seq.) requires most housing providers to make reasonable accommodations for people with disabilities. An emotional support animal is treated as an <strong>assistance animal</strong> — not a pet — when it helps alleviate one or more effects of a person&rsquo;s disability.
          </p>
          <p className="text-gray-600 text-sm sm:text-[15px] leading-relaxed max-w-3xl">
            That means a qualifying ESA may be allowed even where a building has a &ldquo;no pets&rdquo; policy, and pet fees or deposits generally should not apply. The accommodation is requested with documentation from a licensed provider, and each request is evaluated individually under the law.
          </p>
        </div>
      </section>

      {/* Requirements grid */}
      <section className="py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
              What a legitimate ESA letter requires
            </h2>
            <p className="text-gray-500 text-sm max-w-2xl mx-auto">
              A valid letter is the product of a real clinical process — not a quick download.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {requirements.map((r) => (
              <div key={r.title} className="bg-white rounded-2xl p-7 border border-gray-100">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-4">
                  <i className={`${r.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{r.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Can / cannot */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#fdf6ee] rounded-2xl p-7 border border-orange-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <i className="ri-checkbox-circle-fill text-orange-500"></i>
                What an ESA letter can do
              </h3>
              <ul className="space-y-3">
                {canDo.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <i className="ri-check-line text-orange-500 font-bold mt-0.5"></i>
                    <p className="text-gray-700 text-sm leading-relaxed">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-slate-50 rounded-2xl p-7 border border-slate-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <i className="ri-close-circle-fill text-slate-400"></i>
                What an ESA letter cannot do
              </h3>
              <ul className="space-y-3">
                {cannotDo.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <i className="ri-subtract-line text-slate-400 font-bold mt-0.5"></i>
                    <p className="text-gray-600 text-sm leading-relaxed">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <VerificationPillarsSection variant="compact" showCTA showPrivacyNote className="bg-[#fafbfb]" />

      {/* PRICING / KLARNA — reusable cost section */}
      <EsaPricingMini className="bg-white border-t border-gray-100" />

      {/* FAQ */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
              Common Questions
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">ESA laws &amp; requirements FAQ</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-[#fafafa] rounded-xl border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className={`text-sm font-semibold ${openFaq === i ? "text-orange-500" : "text-gray-900"}`}>
                    {faq.q}
                  </span>
                  <i className={`${openFaq === i ? "ri-subtract-line" : "ri-add-line"} text-orange-500 ml-4 flex-shrink-0`}></i>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4">
                    <p className="text-gray-600 text-sm leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* State guides */}
      <section className="py-14 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">State-specific ESA rules</h2>
          <p className="text-gray-600 text-sm mb-6 max-w-2xl">
            Several states layer extra rules on top of the federal baseline. Read the guide for your state:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link to="/california-esa-letter-30-day-rule" className="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-100 hover:border-orange-200 transition-colors cursor-pointer">
              <i className="ri-map-pin-2-line text-orange-500"></i>
              <span className="text-sm font-semibold text-gray-900">California 30-day rule</span>
            </Link>
            <Link to="/iowa-esa-letter-housing-rules" className="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-100 hover:border-orange-200 transition-colors cursor-pointer">
              <i className="ri-map-pin-2-line text-orange-500"></i>
              <span className="text-sm font-semibold text-gray-900">Iowa housing rules</span>
            </Link>
            <Link to="/florida-esa-letter-housing-rules" className="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-100 hover:border-orange-200 transition-colors cursor-pointer">
              <i className="ri-map-pin-2-line text-orange-500"></i>
              <span className="text-sm font-semibold text-gray-900">Florida housing rules</span>
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <Link to="/explore-esa-letters-all-states" className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer">
              Browse all 50 state guides
              <i className="ri-arrow-right-line text-xs"></i>
            </Link>
            <Link to="/are-online-esa-letters-legit" className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-600 cursor-pointer">
              Are online ESA letters legit?
              <i className="ri-arrow-right-line text-xs"></i>
            </Link>
          </div>
        </div>
      </section>

      {/* Sources + disclaimer */}
      <section className="py-12 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="rounded-2xl border border-gray-100 bg-[#fafafa] p-6">
            <h2 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Sources &amp; references</h2>
            <ul className="space-y-2 text-xs text-gray-500 leading-relaxed">
              <li>Fair Housing Act — 42 U.S.C. § 3601 et seq.</li>
              <li>U.S. Department of Housing and Urban Development (HUD), Assistance Animals program information — hud.gov</li>
              <li>U.S. Department of Transportation, Air Carrier Access Act final rule on traveling by air with service animals (effective 2021)</li>
              <li>California Health &amp; Safety Code § 122318 (AB 468); Florida Statute § 760.27; Iowa Code § 216.8B and Senate File 2268 (2024)</li>
            </ul>
            <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
              This page is for general information only and is not legal advice. Laws change and vary by state and housing type. Whether an ESA is clinically appropriate is determined by a licensed provider&rsquo;s evaluation. For advice about your situation, consult a qualified attorney or your local fair-housing agency.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">Ready to start your evaluation?</h2>
          <p className="text-gray-500 mb-8">Connect with a licensed provider who will review your needs honestly.</p>
          <Link
            to="/assessment"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer w-full sm:w-auto"
          >
            <i className="ri-file-text-line"></i>
            Begin Your ESA Assessment
          </Link>
        </div>
      </section>

      <Hud2026UpdateBanner className="border-t border-gray-100" />

      <SharedFooter />
      <MobileStickyApplyCTA label="Start ESA Assessment" />
    </main>
  );
}
