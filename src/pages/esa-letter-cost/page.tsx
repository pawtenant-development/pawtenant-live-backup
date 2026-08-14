import { useState, useEffect } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import Hud2026UpdateBanner from "../../components/feature/Hud2026UpdateBanner";
import { Link } from "react-router-dom";
import { VeteransSupportSection, RelatedResources } from "../../components/feature/SeoKit";
import PetCostSavingsCalculator from "../../components/feature/PetCostSavingsCalculator";
import PublicPageHero from "../../components/feature/PublicPageHero";
import PlanPricingSection from "../../components/feature/PlanPricingSection";
import EsaLetterVerificationWidget from "../../components/feature/EsaLetterVerificationWidget";
import { buildEsaPlanCards, ESA_PLAN_COPY } from "../../data/planPricingCards";
import { ESA_PRICE_LABELS, BUNDLE_PRICING } from "@/config/pricing";
import { useSitePricing } from "@/hooks/useSitePricing";

import HeroPriceLine from "@/components/feature/HeroPriceLine";
// LIVE-PUBLIC-PAGES-...-001: the former two-card `packages` array was removed.
// This page now renders the CANONICAL homepage three-card block
// (PlanPricingSection + buildEsaPlanCards), so its prices come from the same
// single source as the homepage and checkout and cannot drift. The Reasonable
// Accommodation add-on is described in prose below the cards using
// BUNDLE_PRICING — never as a competing price card.
const included = [
  "Thorough evaluation by licensed mental health professionals",
  "Legally enforced for rentals, vacation homes, and college dorms",
  "Compliant with Fair Housing Act for housing",
  "Affordable pricing with 'no pets' policies",
  "Money Back Guarantee for stress-free experience",
  "Dedicated customer support",
  "Legitimate ESA letter for peace of mind",
];

const whyChoose = [
  {
    title: "Affordable ESA Letters",
    desc: "PawTenant has the solution for you! Our ESA letters cover all housing arrangements, ensuring you can keep your beloved pet with you in rentals, vacation homes, or college dorms. Say goodbye to stressful moves and enjoy the comfort of having your furry companion by your side.",
    icon: "ri-price-tag-3-line",
  },
  {
    title: "Compliant & Legally Enforced",
    desc: "Our ESA letters are legally compliant and enforced for housing. Our licensed mental health professionals are experts in ESA letter requirements, conducting thorough assessments to ensure that only those who genuinely need emotional support animals receive the necessary documentation.",
    icon: "ri-scales-line",
  },
  {
    title: "Optimal Pricing without Compromises",
    // Price is interpolated from the canonical pricing source — never a literal,
    // so this sentence cannot drift away from the cards or from checkout.
    desc: `At PawTenant, we believe everyone should access affordable ESA letters without compromising quality. That's why we offer competitive pricing starting at ${ESA_PRICE_LABELS.subscription}/year. You can now experience the benefits of an ESA letter without breaking the bank. We prioritize professionalism and authenticity to deliver top-notch ESA letters.`,
    icon: "ri-hand-heart-line",
  },
  {
    title: "100% Money Back Guarantee",
    desc: "We stand behind the quality of our service. With our Money-Back Guarantee, you're covered if you don't qualify after your consultation. Approval by a housing provider is never guaranteed and can depend on your state, housing type, and individual facts — see our refund policy for full details.",
    icon: "ri-refund-2-line",
  },
  {
    title: "Customer Support and Satisfaction",
    desc: "Customer satisfaction is our priority, and we address any concerns promptly. PawTenant provides reliable customer support throughout the process, making it hassle-free to secure your ESA letter. Your stress-free experience with your pet is our goal.",
    icon: "ri-customer-service-line",
  },
  {
    title: "PawTenant: Your Trusted Source",
    desc: "Trust PawTenant to provide legitimate ESA letters at an unbeatable price. Our commitment to your well-being and the bond with your pet ensures high-quality ESA letters that meet all legal requirements. Don't miss the opportunity to benefit from an emotional support animal in your life.",
    icon: "ri-shield-star-line",
  },
];

const faqs = [
  { q: "What Types of Housing Are Covered By The Fair Housing Act?", a: "The Fair Housing Act covers a broad range of housing options, including rental apartments, condominiums, houses, and even some types of temporary housing. It applies to both public and private housing providers, with limited exceptions." },
  { q: "What Documents Are Required For Landlords To Accept An ESA?", a: "A valid ESA letter from a licensed mental health professional (LMHP). The letter should be on official letterhead and include the provider's name, license number, and confirmation that the tenant has a qualifying condition." },
  { q: "Can A Landlord Deny An ESA Based On Breed Or Size?", a: "No — under the Fair Housing Act, landlords cannot deny an ESA request based on the breed or size of the animal. The only grounds for denial are if the animal poses a direct threat to safety or if accommodation would cause undue hardship." },
  { q: "Choosing Between An ESA And A Service Animal", a: "Service animals are trained for specific tasks and protected under the ADA in public spaces. ESAs provide emotional comfort and are protected under the FHA for housing. If you need housing protection and emotional support, an ESA letter is the right choice." },
  { q: "What affects the cost of an ESA letter?", a: "ESA letter pricing reflects the clinical work behind it — a real evaluation by a licensed mental health professional credentialed in your state, the time the provider spends reviewing your assessment, the issuance of a properly formatted letter with license information, and ongoing support if a landlord requests verification. Letters tied to a one-time consultation are typically priced differently from annual subscriptions that include renewal." },
  { q: "Why are some online ESA letters suspiciously cheap?", a: "Listings well below the standard rate are often a sign that the service is skipping the clinical evaluation entirely — which makes the letter invalid and is one of the most common ESA letter scams. A landlord who suspects an unverified or template letter can deny the accommodation request. Choosing a service with a real licensed mental health professional ESA letter review protects your housing application and avoids having to start over." },
  { q: "What's included in the price of a PawTenant ESA letter?", a: "Your fee covers the full ESA letter application process: a complete mental health evaluation by a state-licensed provider, a signed letter on professional letterhead with NPI and license details, digital delivery typically within 24 hours, a discreet verification QR code your landlord can confirm online, and a 100% refund if you do not qualify after the clinical review." },
];

const SAMPLE_IMG = "/images/checkout/esa-sample-letter.svg";

export default function ESALetterCostPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Admin-managed display prices (hydrates at runtime; falls back to config).
  const { price: getPrice } = useSitePricing();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    if (lightboxOpen) {
      document.addEventListener("keydown", handler);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen]);

  return (
    <main className="pb-24 md:pb-0">
      {/* The page title is owned by seoConfig["/esa-letter-cost"] + SEOManager
          (single source) so the prerendered raw title and the runtime title
          agree. Do not reintroduce a hardcoded title element here — it caused
          raw/rendered title drift (AI-SEO-MACHINE-FACTS-SCHEMA-HYGIENE-001). */}
      <meta name="keywords" content="affordable ESA letter, ESA letter cost, legitimate ESA letter, ESA letter price, cheap ESA letter" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs.map((f) => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a }
        }))
      }) }} />

      <SharedNavbar />

      {/* Hero — centered, homepage typography, full-bleed image + controlled
          overlay (LIVE-PUBLIC-PAGES-...-001). The previous left-aligned
          max-w-2xl block left a large empty right half at 1440/1920. The price
          chip stays: it answers "how much?" inside the first viewport, and its
          amounts come from the canonical pricing source, never a literal. */}
      <PublicPageHero
        variant="image"
        backgroundImage="/assets/lifestyle/person-paperwork-with-dog.jpg"
        eyebrow="ESA Letter Cost"
        // H1 text is intentionally UNCHANGED. check-full-body-prerender pins the
        // "Money Back Guarantee" phrase for this route, and seoConfig is built
        // around it — the brief asked for a centered hero, not new H1 copy.
        heading="Affordable ESA Letter with Money Back Guarantee"
        subheading="Licensed mental health professionals · no hidden fees · full refund if you don't qualify."
        ctas={[
          { label: "Check If You Qualify", href: "/assessment", primary: true, icon: "ri-file-text-line" },
          { label: "See what's included", href: "#pricing", icon: "ri-price-tag-3-line" },
        ]}
        trustPoints={[
          "Transparent, all-in pricing",
          "Klarna available at checkout",
          "Full refund if you don't qualify",
        ]}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 backdrop-blur-sm text-white text-[11.5px] sm:text-xs font-semibold px-3 py-1.5 rounded-full">
            <i className="ri-price-tag-3-line text-orange-400" aria-hidden="true"></i>
            From {getPrice("esa_subscription_annual", ESA_PRICE_LABELS.subscription)}/year · {getPrice("esa_single_pet", ESA_PRICE_LABELS.oneTime)} one-time
          </div>
          <HeroPriceLine tone="light" />
        </div>
      </PublicPageHero>

      {/* Canonical pricing — the EXACT homepage three-card block, same component
          and same single pricing source, so this page can never drift from the
          homepage or from checkout. */}
      <PlanPricingSection
        theme="esa"
        id="pricing"
        className="bg-[#fdf8f3] border-t border-orange-100"
        eyebrow={ESA_PLAN_COPY.eyebrow}
        heading={ESA_PLAN_COPY.heading}
        subheading={ESA_PLAN_COPY.subheading}
        cards={buildEsaPlanCards("/assessment?ref=esa-letter-cost")}
        footnote={ESA_PLAN_COPY.footnote}
      />

      {/* Optional Reasonable Accommodation add-on — described in prose, NOT as a
          competing price card. planPricingCards.ts is explicit that the RA bundle
          belongs in the assessment package step, never in an informational
          pricing section, so the canonical three cards above stay the only
          price cards on this page. Amounts come from BUNDLE_PRICING. */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
              What you are paying for
            </h2>
            <p className="text-gray-500 text-sm max-w-2xl mx-auto leading-relaxed">
              One price covers the clinical work end to end. There is no separate consultation fee,
              no per-page document charge and no renewal surprise.
            </p>
          </div>

          <dl className="grid sm:grid-cols-2 gap-4 mb-9">
            {[
              { t: "The evaluation", d: "A licensed mental health professional reviews your assessment individually." },
              { t: "Provider review & decision", d: "The provider decides whether documentation is clinically appropriate for you." },
              { t: "The signed letter", d: "If you qualify, your letter is issued with the provider's credentials and a unique verification ID." },
              { t: "Landlord verification", d: "Your housing provider can confirm the letter is genuine without seeing your health information." },
            ].map((r) => (
              <div key={r.t} className="rounded-xl border border-gray-200 bg-[#FAFAF9] p-5">
                <dt className="text-[14px] font-bold text-gray-900 mb-1.5">{r.t}</dt>
                <dd className="text-[13px] text-gray-600 leading-relaxed">{r.d}</dd>
              </div>
            ))}
          </dl>

          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-base font-bold text-gray-900 mb-2">
              Optional: Reasonable Accommodation document support
            </h3>
            <p className="text-[13.5px] text-gray-600 leading-relaxed">
              Most tenants only need the standard letter. If your landlord, property manager or HOA
              asks you to complete a <strong>separate</strong> accommodation form, PawTenant offers
              document support as a flat add-on for 1&ndash;3 pets &mdash; ${BUNDLE_PRICING.oneTime} one-time or $
              {BUNDLE_PRICING.annual} per year &mdash; selectable during the assessment. It is not
              included by default, and a housing provider&rsquo;s approval is never guaranteed.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <i className="ri-refresh-line text-orange-500" aria-hidden="true"></i>
                Full refund if you don&rsquo;t qualify after clinical review
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[10px] font-extrabold tracking-tight text-[#7A3F5F] bg-[#FFA8CD]/25 border border-[#FFA8CD]/60 rounded px-1.5 py-0.5">
                  Klarna.
                </span>
                Available at checkout &mdash; subject to eligibility and{" "}
                <a
                  href="https://www.klarna.com/us/terms-of-use/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-gray-700"
                >
                  Klarna terms
                </a>
                .
              </span>
            </div>
          </div>

          <p className="text-center text-[12px] text-gray-400 mt-6 leading-relaxed">
            Qualification is never guaranteed. A licensed provider determines clinical eligibility
            after an individual evaluation.
          </p>
        </div>
      </section>

      {/* Included + Letter Visual — mobile: image first if you read top-down,
          but to keep desktop intent we keep order. Reduce gap on mobile,
          reduce sample card shadow strength. */}
      <section className="py-12 sm:py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-5 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-5 sm:mb-6 leading-tight">Included with Your ESA Letter from PawTenant:</h2>
              <ul className="space-y-2.5 sm:space-y-3 mb-7 sm:mb-8">
                {included.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 sm:gap-3">
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className="ri-checkbox-circle-fill text-orange-500"></i>
                    </div>
                    <p className="text-gray-700 text-[13.5px] sm:text-sm leading-relaxed">{item}</p>
                  </li>
                ))}
              </ul>
              <Link
                to="/assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-6 sm:px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[13.5px] sm:text-sm shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
              >
                <i className="ri-file-text-line"></i>
                Get An ESA Letter Now
              </Link>
            </div>

            {/* Letter Preview — real sample image. Reduced shadow strength
                on mobile so it doesn't feel like it's floating awkwardly. */}
            <div className="relative w-full self-center">
              <div
                className="relative rounded-2xl overflow-hidden cursor-zoom-in group shadow-[0_4px_0_0_#f97316,0_12px_28px_-8px_rgba(122,78,45,0.18),0_4px_12px_-4px_rgba(0,0,0,0.08)] sm:shadow-[0_4px_0_0_#f97316,0_24px_64px_-8px_rgba(122,78,45,0.22),0_8px_24px_-4px_rgba(0,0,0,0.10)]"
                onClick={() => setLightboxOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setLightboxOpen(true)}
                aria-label="View annotated sample ESA letter with key sections highlighted"
              >
                <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 bg-white/95 backdrop-blur-sm border border-orange-200 text-orange-600 text-[10px] sm:text-xs font-bold uppercase tracking-widest px-2.5 sm:px-3 py-1 rounded-full">
                  Sample
                </div>

                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-300 pointer-events-none">
                  <div className="flex flex-col items-center gap-2 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                    <div className="w-12 h-12 flex items-center justify-center bg-white rounded-full">
                      <i className="ri-zoom-in-line text-orange-500 text-xl"></i>
                    </div>
                    <span className="text-white text-sm font-semibold tracking-wide">View Sample</span>
                  </div>
                </div>

                <img
                  src={SAMPLE_IMG}
                  alt="PawTenant ESA Letter sample document with callouts highlighting licensed provider signature, NPI number, and patient details"
                  width={800}
                  height={1035}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto object-top block"
                />
              </div>

              <p className="text-center text-[11px] sm:text-xs text-gray-400 mt-3 sm:mt-4 tracking-wide leading-relaxed">
                Sample ESA letter — your letter will include your name, pet, and licensed provider details
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose — tighter mobile padding inside cards. */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">Why Choose PawTenant</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {whyChoose.map((item) => (
              <div key={item.title} className="bg-[#fafafa] rounded-xl p-5 sm:p-6">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-3 sm:mb-4">
                  <i className={`${item.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-2 text-[14px] sm:text-sm leading-snug">{item.title}</h3>
                <p className="text-gray-600 text-[13px] sm:text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8 sm:mt-10">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 sm:px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[14px] sm:text-base shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
            >
              <i className="ri-file-text-line"></i>
              Get An ESA Letter Now
            </Link>
          </div>
        </div>
      </section>

      {/* Veterans support — emotional-first, savings secondary (SeoKit) */}
      <VeteransSupportSection
        className="bg-[#f7f6f3] border-t border-gray-100"
        image="/assets/veterans/man-on-porch-with-dog.jpg"
        alt="A veteran on his porch with his dog on a calm afternoon"
      />

      {/* Pet rent savings teaser → links to the full /pet-rent-savings-calculator */}
      {/* Complete three-variable calculator (pets × monthly rent × deposit).
          Replaces the two-variable teaser, which ignored deposits entirely. */}
      <PetCostSavingsCalculator
        className="bg-[#fafafa] border-t border-gray-100"
        heading="See what pet rent and pet fees add up to"
        copy="Set the number of pets, the monthly pet rent per pet, and the one-time deposit or fee per pet. Amounts vary by building — use the figures on your own lease or listing."
        ctaHref="/assessment?ref=esa-letter-cost-calculator"
      />

      {/* Verification — the real /verify tool, reachable from the cost page. */}
      <EsaLetterVerificationWidget
        className="bg-white border-t border-gray-100"
        heading="Already have a letter? Verify it"
        copy="Scan the discreet QR code on a PawTenant letter to confirm it is genuine — this form is a fallback for a supplied Verification ID. Verification never reveals health information."
      />

      {/* CTA — mobile: full-width button + clearer hierarchy. */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 leading-tight">Schedule Your ESA Letter Consultation Today</h2>
          <p className="text-gray-500 text-[14px] sm:text-base mb-7 sm:mb-8">Get peace of mind with a service you can trust</p>
          <Link
            to="/assessment"
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 sm:px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[15px] sm:text-base shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
          >
            <i className="ri-calendar-line"></i>
            Schedule Your Appointment Today
          </Link>
        </div>
      </section>

      {/* FAQ — moved near the bottom so it sits below the closing CTA and
          ahead of Related Resources + the HUD update section. */}
      <section className="py-12 sm:py-16 bg-[#fdf6ee]">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-8 sm:mb-10">
            <span className="inline-block text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Popular Questions</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">Fair Housing Act Emotional Support Animals FAQ</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between gap-3 px-5 sm:px-6 py-4 text-left cursor-pointer"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span className={`text-[13.5px] sm:text-sm font-semibold leading-snug ${openFaq === i ? "text-orange-500" : "text-gray-900"}`}>{faq.q}</span>
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    <i className={`${openFaq === i ? "ri-subtract-line" : "ri-add-line"} text-orange-500`}></i>
                  </div>
                </button>
                {openFaq === i && (
                  <div className="px-5 sm:px-6 pb-4">
                    <p className="text-gray-600 text-[13px] sm:text-sm leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Related Resources — 6 even cards (3×2 on desktop, 2-up on tablet) so
          the grid is symmetric with no lonely card; equal-height via flex. */}
      <section className="py-12 sm:py-16 bg-slate-50 border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-8 sm:mb-10">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 leading-tight">
              Related Resources
            </h2>
            <p className="text-[14px] text-slate-600 leading-relaxed">
              Helpful guides for the rest of your ESA letter process.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 items-stretch">
            {[
              {
                to: "/how-to-get-esa-letter",
                title: "How to Get an ESA Letter",
                desc: "A step-by-step guide to getting a clinically reviewed ESA letter from a licensed mental health professional.",
              },
              {
                to: "/esa-laws",
                title: "ESA Laws Explained",
                desc: "What a valid ESA letter requires and what the Fair Housing Act can and cannot do for housing.",
              },
              {
                to: "/housing-rights-esa",
                title: "Fair Housing Act Rights",
                desc: "How federal Fair Housing law supports reasonable accommodation requests for tenants with a qualifying ESA.",
              },
              {
                to: "/landlord-denied-esa-letter",
                title: "Landlord Denial Help",
                desc: "Calm, practical next steps and state-by-state guidance if your landlord challenged or denied your ESA.",
              },
              {
                to: "/are-esa-letters-still-valid-after-hud-change",
                title: "2026 HUD Update",
                desc: "What the 2026 HUD enforcement change means for ESAs — what changed, what didn't, and your options.",
              },
              {
                to: "/faqs",
                title: "ESA Letter FAQs",
                desc: "Common questions about ESA letters, housing rights, eligibility, and the clinical review process.",
              },
            ].map((r) => (
              <Link
                key={r.to}
                to={r.to}
                className="group flex flex-col h-full bg-white rounded-xl border border-slate-200 p-5 hover:border-orange-200 hover:shadow-sm transition cursor-pointer"
              >
                <div className="text-[14.5px] font-semibold text-slate-900 mb-1.5 leading-snug">
                  {r.title}
                </div>
                <p className="text-[12.5px] text-slate-600 leading-relaxed">
                  {r.desc}
                </p>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange-600 mt-3 group-hover:gap-1.5 transition-all">
                  Read more <i className="ri-arrow-right-line" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* RELATED RESOURCES — crawlable internal links to key ESA guides */}
      <section className="py-14 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <RelatedResources
            heading="Before you decide"
            links={[
              { to: "/best-online-esa-letter-service", title: "How to choose a real online ESA provider", desc: "What to check before you pay: licensed provider review, transparent pricing, and verifiable letters." },
              { to: "/how-to-get-esa-letter-online", title: "How the online ESA letter process works", desc: "The 4 steps from a short assessment to a provider-issued letter." },
              { to: "/esa-letter-for-landlord", title: "ESA letter for your landlord", desc: "How housing accommodation works and what to send." },
              { to: "/landlord-denied-esa-letter", title: "Landlord denied your ESA?", desc: "Your housing rights and calm, practical next steps." },
              { to: "/housing-rights-esa", title: "ESA housing rights (FHA)", desc: "How the Fair Housing Act protects ESA owners." },
              { to: "/renew-esa-letter", title: "Renew your ESA letter", desc: "ESA letters are typically valid for 12 months." },
              { to: "/pet-rent-savings-calculator", title: "Pet rent savings calculator", desc: "Estimate what pet rent and fees could cost — and what you may save if approved." },
            ]}
          />
        </div>
      </section>

      <Hud2026UpdateBanner className="border-t border-gray-100 bg-white" />

      <SharedFooter />

      {/* Mobile sticky CTA — kept above safe-area inset on iOS notches. */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom,12px))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <Link
          to="/assessment"
          className="whitespace-nowrap flex items-center justify-center gap-2 w-full py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer shadow-[0_2px_6px_rgba(249,115,22,0.25)]"
        >
          <i className="ri-file-text-line"></i>
          Get Your ESA Letter — From $115
        </Link>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-10"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors cursor-pointer z-10"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close"
          >
            <i className="ri-close-line text-xl"></i>
          </button>

          <div
            className="relative max-w-3xl w-full max-h-[90vh] overflow-auto rounded-2xl bg-white"
            style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-3 right-3 z-10 bg-white border border-orange-200 text-orange-600 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              Sample
            </div>
            <img
              src={SAMPLE_IMG}
              alt="PawTenant ESA Letter sample document — full view with annotated callouts showing key sections"
              className="w-full h-auto block rounded-2xl"
            />
          </div>

          <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/50 text-xs tracking-wide whitespace-nowrap">
            Click anywhere outside to close · Press Esc to dismiss
          </p>
        </div>
      )}
    </main>
  );
}
