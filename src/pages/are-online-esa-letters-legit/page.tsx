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
 * /are-online-esa-letters-legit — Are online ESA letters legitimate?
 *
 * Compliance-safe content guidelines applied here:
 *  - A genuine, balanced answer: online ESA letters CAN be legitimate when a
 *    real licensed provider performs a real evaluation and complies with state
 *    law. We explicitly warn against fake registries, certificates, and
 *    "instant"/"guaranteed" letters.
 *  - No "guaranteed approval", "instant approval", "everyone qualifies".
 *  - No public-access claims. ESA = housing accommodation only.
 *  - Informational only, not legal advice.
 *
 * Source notes:
 *  - Fair Housing Act, 42 U.S.C. § 3601 et seq.
 *  - HUD has long cautioned that internet "registrations"/"certificates" do
 *    not, by themselves, establish a disability-related need for an assistance
 *    animal. NOTE: HUD withdrew several FHEO guidance documents in September
 *    2025, and a Federal Register notice was published in April 2026. Do NOT
 *    cite FHEO-2020-01 as current guidance. The Fair Housing Act itself remains
 *    federal law, so the duty to consider reasonable accommodations still applies.
 *  - State provider-relationship rules: CA AB 468 (Health & Safety Code
 *    § 122318), Iowa SF 2268 (2024) — both require a 30-day relationship.
 */

const greenFlags = [
  "You connect with a mental health provider who is actually licensed in the state where you live.",
  "There is a real evaluation — the provider reviews your situation and applies clinical judgment.",
  "The letter is on official letterhead with the provider's name, license type, license number, state, signature, and date.",
  "The service complies with your state's rules (for example, a required provider-client relationship period).",
  "If you do not qualify, the provider will not issue a letter — and a reputable service refunds you.",
  "The letter can be independently verified (for example, by confirming the provider's license on a public registry).",
];

const redFlags = [
  "\"Instant\" or \"same-day guaranteed\" letters with no evaluation.",
  "Claims that everyone qualifies or that approval is guaranteed.",
  "Selling an ESA \"registration,\" \"certificate,\" ID card, or vest as if it had legal weight.",
  "No named provider, license number, or state of licensure on the document.",
  "Promises of public access to stores, restaurants, hotels, or free airline travel.",
  "No clinical questions at all — just a payment form.",
];

const faqs = [
  {
    q: "Are online ESA letters legitimate?",
    a: "They can be — when the letter comes from a mental health provider who is genuinely licensed in your state and who completes a real evaluation in line with applicable law. Telehealth is a recognized way to deliver care. What makes a letter legitimate is the licensed provider and the real clinical process behind it, not whether the visit happened online or in an office.",
  },
  {
    q: "What makes an online ESA letter NOT legitimate?",
    a: "Red flags include instant or guaranteed approval, no evaluation, no named licensed provider, and selling \"registration\" or \"certification\" as if it carried legal weight. There is no official ESA registry in the United States, and an ID card or certificate alone does not establish a disability-related need for an assistance animal.",
  },
  {
    q: "Will a landlord accept an online ESA letter?",
    a: "Many housing providers accept a valid letter from a licensed provider, but each reasonable-accommodation request is evaluated individually under the Fair Housing Act. A landlord may confirm the provider is licensed and that the letter is authentic. A letter that names the licensed provider and can be verified is far more likely to be accepted than an anonymous \"instant\" document.",
  },
  {
    q: "Is an ESA \"registration\" the same as an ESA letter?",
    a: "No. A registration, certificate, ID card, or vest has no legal standing on its own. The document that matters for a housing accommodation request is a letter from a licensed mental health provider based on a real evaluation. Be cautious of any site that charges for \"registration\" and implies it is required.",
  },
  {
    q: "Does an online ESA letter guarantee I'll be approved for housing?",
    a: "No. No legitimate provider or service can guarantee a housing provider's approval, and a provider will only issue a letter when an ESA is clinically appropriate for you. A valid letter strengthens your request under the Fair Housing Act, but the outcome is decided case by case.",
  },
  {
    q: "Do online ESA letters work for travel or public places?",
    a: "Generally no. ESA protections center on housing. Since the 2021 U.S. DOT rule change, airlines typically treat ESAs as regular pets, and ESAs do not have public-access rights to stores or restaurants — that is reserved for trained service dogs under the ADA.",
  },
];

export default function AreOnlineESALettersLegitPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <meta
        name="keywords"
        content="are online ESA letters legit, legitimate online ESA letter, real ESA letter, fake ESA registration, ESA letter scams, licensed provider ESA letter, valid ESA letter online"
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

      <section className="relative pt-28 sm:pt-32 pb-14 sm:pb-20 bg-gradient-to-br from-[#fdf6ee] via-white to-orange-50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-2 bg-white border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
                <i className="ri-verified-badge-line"></i>
                Verification Guide
              </span>
              <h1 className="text-[28px] sm:text-4xl md:text-5xl font-bold text-gray-900 mb-5 leading-[1.12]">
                Are Online ESA Letters Real? How to Verify One
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
                The honest answer: an online ESA letter can be completely legitimate — or completely worthless. The difference comes down to whether a real, licensed provider performed a real evaluation. Here&rsquo;s how to tell them apart.
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
                  <i className="ri-shield-check-line"></i>
                  Start ESA Assessment
                </Link>
                <Link
                  to="/esa-laws"
                  className="inline-flex items-center justify-center gap-1.5 px-6 py-3 text-sm font-semibold text-gray-700 border border-gray-300 rounded-md hover:border-orange-400 hover:text-orange-600 transition-colors cursor-pointer bg-white/60"
                >
                  ESA laws &amp; requirements
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

      {/* Short answer */}
      <section className="py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="rounded-2xl border border-orange-100 bg-[#fdf6ee] p-6 sm:p-7">
            <h2 className="text-lg font-bold text-gray-900 mb-3">The short answer</h2>
            <p className="text-gray-700 text-sm sm:text-[15px] leading-relaxed">
              Yes — an online ESA letter is legitimate <strong>when it is written and signed by a mental health provider who is licensed in your state and who completes a genuine clinical evaluation</strong>, in line with the law where you live. Telehealth is a recognized way to deliver care. What is <strong>not</strong> legitimate is an &ldquo;instant,&rdquo; &ldquo;guaranteed,&rdquo; or &ldquo;registration&rdquo;-based document with no real provider or evaluation behind it.
            </p>
          </div>
        </div>
      </section>

      {/* Emotional/trust lifestyle visual — licensed provider telehealth review */}
      <LifestyleImageSection
        reverse
        className="bg-white"
        image="/assets/therapists/clinician-tablet-with-pet.jpg"
        alt="A licensed mental health provider reviewing a case during a telehealth visit, with a pet nearby"
        eyebrow="A real review, not a download"
        heading="What makes it legitimate: a licensed provider who actually evaluates you"
        body="A genuine online ESA letter comes from a mental health provider licensed in your state who reviews your situation over telehealth — a recognized way to deliver care. The letter names the provider and can be verified. That's the difference between a real letter and a worthless “instant” one."
        bullets={[
          "Reviewed by a Licensed Mental Health Practitioner credentialed in your state.",
          "Provider's name, license number, and NPI printed on the letter.",
          "A unique Verification ID your landlord can confirm.",
        ]}
      />

      {/* Green / red flags */}
      <section className="py-16 bg-[#fafafa] border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-7 border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <i className="ri-checkbox-circle-fill text-orange-500"></i>
                Signs a letter is legitimate
              </h3>
              <ul className="space-y-3">
                {greenFlags.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <i className="ri-check-line text-orange-500 font-bold mt-0.5"></i>
                    <p className="text-gray-700 text-sm leading-relaxed">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl p-7 border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <i className="ri-error-warning-fill text-slate-400"></i>
                Warning signs to avoid
              </h3>
              <ul className="space-y-3">
                {redFlags.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <i className="ri-close-line text-slate-400 font-bold mt-0.5"></i>
                    <p className="text-gray-600 text-sm leading-relaxed">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <VerificationPillarsSection variant="compact" showCTA showPrivacyNote className="bg-white" />

      {/* PRICING / KLARNA — reusable cost section */}
      <EsaPricingMini className="bg-[#fafafa] border-y border-gray-100" />

      {/* FAQ */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
              Common Questions
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Online ESA letter legitimacy FAQ</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
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

      {/* Related */}
      <section className="py-14 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Keep reading</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link to="/esa-laws" className="group bg-[#fafafa] rounded-xl border border-gray-100 p-5 hover:border-orange-200 transition-colors cursor-pointer">
              <div className="text-sm font-semibold text-gray-900 mb-1.5">ESA laws &amp; requirements</div>
              <p className="text-xs text-gray-600 leading-relaxed">What a valid ESA letter requires, and what it can and cannot do.</p>
            </Link>
            <Link to="/how-to-get-esa-letter" className="group bg-[#fafafa] rounded-xl border border-gray-100 p-5 hover:border-orange-200 transition-colors cursor-pointer">
              <div className="text-sm font-semibold text-gray-900 mb-1.5">How to get an ESA letter</div>
              <p className="text-xs text-gray-600 leading-relaxed">The step-by-step clinical process from assessment to letter.</p>
            </Link>
            <Link to="/esa-letter-verification" className="group bg-[#fafafa] rounded-xl border border-gray-100 p-5 hover:border-orange-200 transition-colors cursor-pointer">
              <div className="text-sm font-semibold text-gray-900 mb-1.5">Landlord verification</div>
              <p className="text-xs text-gray-600 leading-relaxed">How a landlord confirms a letter&rsquo;s authenticity.</p>
            </Link>
          </div>
        </div>
      </section>

      {/* Sources + disclaimer */}
      <section className="py-12 bg-[#fafafa] border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6">
            <h2 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Sources &amp; references</h2>
            <ul className="space-y-2 text-xs text-gray-500 leading-relaxed">
              <li>Fair Housing Act — 42 U.S.C. § 3601 et seq.</li>
              <li>U.S. Department of Housing and Urban Development (HUD), Assistance Animals program information — hud.gov</li>
              <li>State provider-relationship rules — California Health &amp; Safety Code § 122318 (AB 468); Iowa Senate File 2268 (2024)</li>
            </ul>
            <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
              This page is for general information only and is not legal advice. Eligibility for an ESA depends on a licensed provider&rsquo;s evaluation and applicable law. Approval of a housing accommodation is never guaranteed.
            </p>
          </div>
        </div>
      </section>

      <Hud2026UpdateBanner className="border-t border-gray-100" />

      <SharedFooter />
      <MobileStickyApplyCTA label="Start ESA Assessment" />
    </main>
  );
}
