import { useState, useEffect } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import Hud2026UpdateBanner from "../../components/feature/Hud2026UpdateBanner";
import { Link } from "react-router-dom";
import { VeteransSupportSection, RelatedResources } from "../../components/feature/SeoKit";
import PetRentSavingsMini from "../../components/feature/PetRentSavingsMini";
import { ESA_PRICE_LABELS, BUNDLE_PRICING } from "@/config/pricing";
import { useSitePricing } from "@/hooks/useSitePricing";

import HeroPriceLine from "@/components/feature/HeroPriceLine";
// Two ESA packages (no PSD on this page). Standard prices hydrate from the
// admin-managed site_pricing_settings (via getPrice) with config fallbacks;
// the Reasonable Accommodation bundle is a FLAT total for 1–3 pets ($179
// one-time / $159 per year) sourced from BUNDLE_PRICING — never per-pet.
// The combo CTA preselects the RA package via ?package=esa_ra_bundle; OTP and
// server-side pricing still run — the query param only pre-highlights the card.
const packages = [
  {
    key: "esa_standard",
    label: "ESA Standard Letter",
    sublabel: "Licensed-provider housing letter",
    oneTime: ESA_PRICE_LABELS.oneTime,          // $129 (1 pet)
    oneTimeKey: "esa_single_pet",
    annual: ESA_PRICE_LABELS.subscription,      // $109/yr (1 pet)
    annualKey: "esa_subscription_annual",
    highlight: false,
    cta: "Start ESA Assessment",
    href: "/assessment",
    features: [
      "Full mental health evaluation by a licensed clinician",
      "Signed ESA letter with NPI & license number",
      "Valid for housing nationwide under the Fair Housing Act",
      "Digital delivery — typically within 24 hours",
      "Covers 1 pet · 2–3 pets $149 one-time / $129 per year",
      "100% money-back guarantee if you don't qualify",
    ],
  },
  {
    key: "esa_ra_bundle",
    label: "ESA + Reasonable Accommodation",
    sublabel: "Adds support with a separate landlord / property / HOA form",
    oneTime: `$${BUNDLE_PRICING.oneTime}`,      // $179 flat (1–3 pets)
    oneTimeKey: null,
    annual: `$${BUNDLE_PRICING.annual}`,        // $159/yr flat (1–3 pets)
    annualKey: null,
    highlight: true,
    cta: "Start with RA Document Support",
    href: "/assessment?package=esa_ra_bundle",
    features: [
      "Everything in the Standard ESA Letter",
      "Reasonable Accommodation document support — help completing a separate landlord, property-manager, or HOA form if your housing provider asks for one",
      "Flat price for 1–3 pets — no per-pet add-on",
      "Not every landlord requires a separate form; this is here if yours does",
      "Same licensed-provider review and money-back guarantee",
    ],
  },
];

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
    desc: "At PawTenant, we believe everyone should access affordable ESA letters without compromising quality. That's why we offer competitive pricing starting at just $109/year. You can now experience the benefits of an ESA letter without breaking the bank. We prioritize professionalism and authenticity to deliver top-notch ESA letters.",
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
  { q: "What's included in the price of a PawTenant ESA letter?", a: "Your fee covers the full ESA letter application process: a complete mental health evaluation by a state-licensed provider, a signed letter on professional letterhead with NPI and license details, digital delivery typically within 24 hours, a unique Verification ID your landlord can confirm online, and a 100% refund if you do not qualify after the clinical review." },
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
      <title>Affordable ESA Letter | Legitimate &amp; Fast | PawTenant</title>
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

      {/* Hero — full-cover poster: min-h-[100svh] so the next section
          doesn't peek above the fold on initial load. flex justify-center
          vertically centers the content. Top padding still clears the
          fixed navbar (h-16 mobile / h-20 tablet+). */}
      <section className="relative min-h-[100svh] flex flex-col justify-center pt-24 sm:pt-28 pb-14 sm:pb-20">
        <div className="absolute inset-0">
          <img
            src="/assets/lifestyle/person-paperwork-with-dog.jpg"
            alt="ESA Letter Cost"
            fetchPriority="high"
            loading="eager"
            decoding="async"
            width={1920}
            height={1280}
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/55 to-black/25"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-5 sm:px-6 w-full">
          <div className="max-w-2xl">
            {/* Visible price chip — answers "how much?" without a scroll.
                Added 2026-05-24 pre-LIVE cleanup so cost-page visitors see
                the headline price inside the first viewport. */}
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 backdrop-blur-sm text-white text-[11.5px] sm:text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
              <i className="ri-price-tag-3-line text-orange-400"></i>
              From {getPrice("esa_subscription_annual", ESA_PRICE_LABELS.subscription)}/year · {getPrice("esa_single_pet", ESA_PRICE_LABELS.oneTime)} one-time
            </div>
            <h1 className="text-[28px] sm:text-4xl md:text-5xl text-white mb-4 sm:mb-5 leading-[1.15] pt-hero-display">
              Affordable ESA Letter with Money Back Guarantee
            </h1>
            <p className="text-white/85 text-[15px] sm:text-lg leading-relaxed mb-6 sm:mb-8">
              Licensed mental health professionals · no hidden fees · 100% refund if you don't qualify.
            </p>
            <HeroPriceLine tone="light" className="mb-5" />
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <Link
                to="/assessment"
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 sm:px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-[15px] sm:text-base shadow-[0_4px_12px_rgba(249,115,22,0.30)] sm:shadow-none"
              >
                <i className="ri-file-text-line"></i>
                Get An ESA Letter Now
              </Link>
              <div className="flex items-center gap-2 text-white/85 text-[13px] sm:text-sm">
                <i className="ri-refresh-line text-orange-400"></i>
                Klarna available at checkout
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing — tighter mobile padding inside cards, mobile-first text
          sizing on the price label, single-column on mobile with comfortable
          gap. */}
      <section className="py-14 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">Choose Your ESA Package</h2>
            <p className="text-gray-500 text-[13.5px] sm:text-sm max-w-2xl mx-auto leading-relaxed">
              Our ESA letters cover all your housing arrangements, from rentals and vacation homes to college dorms. Our licensed mental health professionals ensure compliance, legal enforcement, and authenticity in providing ESA letters.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8 max-w-3xl mx-auto items-stretch">
            {packages.map((pkg) => (
              <div
                key={pkg.key}
                className={`relative rounded-2xl p-6 sm:p-8 border-2 text-center flex flex-col ${
                  pkg.highlight
                    ? "border-orange-500 bg-orange-50 shadow-[0_8px_24px_rgba(249,115,22,0.12)]"
                    : "border-gray-200 bg-white"
                }`}
              >
                {pkg.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-block bg-orange-500 text-white text-[10px] sm:text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
                    Includes Document Support
                  </span>
                )}
                <p className="text-gray-900 font-bold text-[15px] sm:text-base mb-1 mt-1">{pkg.label}</p>
                <p className="text-orange-500 text-[11px] sm:text-xs font-semibold mb-3 min-h-[32px] flex items-center justify-center">{pkg.sublabel}</p>
                <div className="mb-1">
                  <span className="text-4xl sm:text-5xl font-black text-gray-900 leading-none">{pkg.oneTimeKey ? getPrice(pkg.oneTimeKey, pkg.oneTime) : pkg.oneTime}</span>
                  <span className="text-gray-500 text-sm font-semibold ml-1.5">one-time</span>
                </div>
                <p className="text-gray-400 text-[12px] sm:text-[13px] mb-4">or {pkg.annualKey ? getPrice(pkg.annualKey, pkg.annual) : pkg.annual}/year (annual)</p>

                {/* Klarna chip — neutral payment-method mention only */}
                <div className="inline-flex self-center items-center gap-1.5 mb-1 px-2.5 py-1 rounded-md bg-[#FFA8CD]/20 border border-[#FFA8CD]/60">
                  <span className="text-[10px] font-extrabold tracking-tight text-[#7A3F5F]">Klarna.</span>
                  <span className="text-[10px] text-slate-700">Available at checkout</span>
                </div>

                <div className="h-px bg-gray-200 my-5 sm:my-6"></div>
                <ul className="space-y-2.5 sm:space-y-3 text-left mb-7 sm:mb-8 flex-1">
                  {pkg.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 sm:gap-3">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-checkbox-circle-fill text-orange-500"></i>
                      </div>
                      <span className="text-[13px] sm:text-sm text-gray-700 leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to={pkg.href}
                  className={`block w-full py-3.5 font-bold text-[14px] sm:text-sm rounded-md transition-colors cursor-pointer mt-auto ${
                    pkg.highlight
                      ? "bg-orange-500 text-white hover:bg-orange-600 shadow-[0_2px_6px_rgba(249,115,22,0.30)]"
                      : "bg-gray-900 text-white hover:bg-gray-800"
                  }`}
                >
                  {pkg.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-[12.5px] sm:text-sm text-gray-500 mt-6 max-w-2xl mx-auto leading-relaxed">
            <strong className="text-gray-700">Not sure if you need the Reasonable Accommodation option?</strong> Most tenants only need the Standard letter. Choose the Reasonable Accommodation package if your landlord, property manager, or HOA asks you to complete a separate accommodation form. Housing decisions remain with your provider and your housing provider — approval is never guaranteed.
          </p>
          <div className="flex items-center justify-center gap-2 mt-6 text-[13px] sm:text-sm text-gray-500 text-center">
            <i className="ri-refresh-line text-orange-500"></i>
            100% refund if your letter doesn't work
          </div>
          <p className="text-center text-[12px] text-gray-400 mt-3 max-w-md mx-auto leading-relaxed">
            Klarna available at checkout. Subject to eligibility and{" "}
            <a
              href="https://www.klarna.com/us/terms-of-use/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-600"
            >
              Klarna payment terms
            </a>
            .
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
      <PetRentSavingsMini
        className="bg-[#fafafa] border-t border-gray-100"
        heading="See how monthly pet rent adds up"
        copy="Enter a typical monthly pet-rent amount and estimate what it could cost over one year — before any approved housing accommodation."
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
          Get Your ESA Letter — From $109
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
