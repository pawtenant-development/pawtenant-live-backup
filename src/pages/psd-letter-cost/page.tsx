import { useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { RelatedResources } from "../../components/feature/SeoKit";
import HeroPriceLine from "@/components/feature/HeroPriceLine";
import {
  getPsdOneTimeTotal,
  getPsdAnnualTotal,
  BUNDLE_PRICING,
} from "@/config/pricing";

// Dedicated PSD pricing / cost page. ESA pricing is intentionally NOT shown here
// (the ESA cost page owns that). Two PSD packages only:
//   • PSD Standard Documentation  — 1 dog $129 one-time / $109 per year
//                                    (2–3 dogs $149 one-time / $129 per year)
//   • PSD + Reasonable Accommodation — FLAT $179 one-time / $159 per year (1–3)
// Prices are read from the pricing helpers so they can never drift from the
// server-authoritative amounts (create-payment-intent / create-checkout-session).
// The combo CTA preselects the RA package via ?package=psd_ra_bundle — OTP and
// server-side pricing still run; the query param only pre-highlights the card.
//
// Compliance: a PSD letter documents a licensed provider's evaluation; it does
// NOT create service-dog status and does not register or certify a dog. PSD
// documentation can support housing AND travel contexts where applicable.
// Approval is never guaranteed. No "official registry" / "certification".

const TEAL = "#4A8472";
const TEAL_DARK = "#2f5d50";

const packages = [
  {
    key: "psd_standard",
    label: "PSD Standard Documentation",
    sublabel: "Licensed-provider psychiatric service dog documentation",
    oneTime: `$${getPsdOneTimeTotal(1)}`, // $129 (1 dog)
    annual: `$${getPsdAnnualTotal(1)}`, // $109/yr (1 dog)
    highlight: false,
    cta: "Start PSD Assessment",
    href: "/psd-assessment",
    features: [
      "Provider evaluation focused on psychiatric service dog needs",
      "Documentation of a qualifying disability-related need, if appropriate",
      "Supports housing and travel contexts where applicable",
      "Digital delivery — typically within 24 hours",
      "Covers 1 dog · 2–3 dogs $149 one-time / $129 per year",
      "100% money-back guarantee if you don't qualify",
    ],
  },
  {
    key: "psd_ra_bundle",
    label: "PSD + Reasonable Accommodation",
    sublabel: "Adds support with a separate landlord / property / HOA form",
    oneTime: `$${BUNDLE_PRICING.oneTime}`, // $179 flat (1–3 dogs)
    annual: `$${BUNDLE_PRICING.annual}`, // $159/yr flat (1–3 dogs)
    highlight: true,
    cta: "Start with RA Document Support",
    href: "/psd-assessment?package=psd_ra_bundle",
    features: [
      "Everything in Standard PSD Documentation",
      "Reasonable Accommodation document support — help completing a separate landlord, property-manager, or HOA form if your housing provider asks for one",
      "Flat price for 1–3 dogs — no per-dog add-on",
      "Not every landlord requires a separate form; this is here if yours does",
      "Same licensed-provider review and money-back guarantee",
    ],
  },
];

const included = [
  "Evaluation by a licensed mental health professional",
  "Documentation of a qualifying psychiatric disability-related need, when clinically appropriate",
  "Support for Fair Housing Act reasonable-accommodation requests",
  "Clear, PSD-specific documentation (distinct from an ESA letter)",
  "Digital delivery, typically within 24 hours",
  "Money-back guarantee if you don't qualify",
];

const faqs = [
  {
    q: "What does a PSD letter cost?",
    a: "Standard PSD documentation starts at $129 one-time for one dog (or $109 per year on the annual plan). Two or three dogs are a fixed total of $149 one-time / $129 per year — there is no per-dog add-on. The Reasonable Accommodation package, which adds support completing a separate landlord or HOA form, is a flat $179 one-time or $159 per year for 1–3 dogs.",
  },
  {
    q: "What is the difference between a PSD letter and an ESA letter?",
    a: "A psychiatric service dog is individually trained to perform specific tasks for a person with a psychiatric disability. An emotional support animal provides comfort through its presence and is not task-trained. A PSD letter documents a licensed provider's evaluation of a disability-related need; it does not train, register, or certify a dog. Task training — not paperwork — is what makes a dog a service dog.",
  },
  {
    q: "Does a PSD letter guarantee my landlord or airline will approve my request?",
    a: "No. A PSD letter documents a licensed provider's clinical evaluation. Housing providers must consider a valid reasonable-accommodation request and can verify documentation, but approval is never guaranteed and the final decision rests with the housing provider. We never claim guaranteed acceptance.",
  },
  {
    q: "When would I choose the Reasonable Accommodation package?",
    a: "Most people only need the Standard PSD documentation. Choose the Reasonable Accommodation package if your landlord, property manager, or HOA asks you to complete a separate accommodation form. It adds document support for that separate form. Not every housing provider requires one.",
  },
  {
    q: "Can psychiatric anxiety or PTSD qualify for a PSD?",
    a: "A psychiatric condition may qualify only if it rises to a disability that substantially limits a major life activity and your dog is trained to perform specific tasks related to that disability. A licensed provider reviews your situation and determines eligibility. If a service dog isn't the right fit, an emotional support animal may be an option.",
  },
];

export default function PSDLetterCostPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main className="pb-24 md:pb-0">
      <title>PSD Letter Cost: Psychiatric Service Dog Documentation Pricing | PawTenant</title>
      <meta
        name="description"
        content="Psychiatric service dog (PSD) letter cost explained: transparent pricing for a licensed provider evaluation, a Reasonable Accommodation option, and a refund if you don't qualify."
      />
      <meta name="keywords" content="PSD letter cost, psychiatric service dog letter price, PSD documentation cost, psychiatric service dog evaluation pricing" />
      <link rel="canonical" href="https://pawtenant.com/psd-letter-cost" />
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

      {/* Hero — teal gradient (PSD brand), no external image dependency */}
      <section
        className="relative pt-28 sm:pt-32 pb-16 sm:pb-20"
        style={{ background: `linear-gradient(135deg, ${TEAL_DARK} 0%, ${TEAL} 100%)` }}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 backdrop-blur-sm text-white text-[11.5px] sm:text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
              <i className="ri-price-tag-3-line text-white/80"></i>
              From ${getPsdAnnualTotal(1)}/year · ${getPsdOneTimeTotal(1)} one-time
            </div>
            <h1 className="text-[28px] sm:text-4xl md:text-5xl text-white mb-4 sm:mb-5 leading-[1.15] pt-hero-display">
              Psychiatric Service Dog Letter Cost
            </h1>
            <p className="text-white/85 text-[15px] sm:text-lg leading-relaxed mb-6 sm:mb-8">
              Transparent pricing for a licensed-provider evaluation. Choose standard PSD documentation, or add
              Reasonable Accommodation support if your housing provider requires a separate form.
            </p>
            <HeroPriceLine tone="light" className="mb-5" />
            <Link
              to="/psd-assessment"
              className="whitespace-nowrap inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 sm:px-8 py-3.5 bg-white font-semibold rounded-md hover:bg-white/90 transition-colors cursor-pointer text-[15px] sm:text-base"
              style={{ color: TEAL_DARK }}
            >
              <i className="ri-file-text-line"></i>
              Start Your PSD Assessment
            </Link>
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="py-14 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">Choose Your PSD Package</h2>
            <p className="text-gray-500 text-[13.5px] sm:text-sm max-w-2xl mx-auto leading-relaxed">
              A psychiatric service dog letter documents a licensed provider's evaluation. It does not register or
              certify your dog — task training does that. Approval is never guaranteed.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8 max-w-3xl mx-auto items-stretch">
            {packages.map((pkg) => (
              <div
                key={pkg.key}
                className="relative rounded-2xl p-6 sm:p-8 border-2 text-center flex flex-col"
                style={
                  pkg.highlight
                    ? { borderColor: TEAL, background: "#F1F7F5", boxShadow: "0 8px 24px rgba(74,132,114,0.12)" }
                    : { borderColor: "#e5e7eb", background: "#fff" }
                }
              >
                {pkg.highlight && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 inline-block text-white text-[10px] sm:text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-sm whitespace-nowrap"
                    style={{ background: TEAL }}
                  >
                    Includes Document Support
                  </span>
                )}
                <p className="text-gray-900 font-bold text-[15px] sm:text-base mb-1 mt-1">{pkg.label}</p>
                <p className="text-[11px] sm:text-xs font-semibold mb-3 min-h-[32px] flex items-center justify-center" style={{ color: TEAL }}>
                  {pkg.sublabel}
                </p>
                <div className="mb-1">
                  <span className="text-4xl sm:text-5xl font-black text-gray-900 leading-none">{pkg.oneTime}</span>
                  <span className="text-gray-500 text-sm font-semibold ml-1.5">one-time</span>
                </div>
                <p className="text-gray-400 text-[12px] sm:text-[13px] mb-4">or {pkg.annual}/year (annual)</p>

                <div className="inline-flex self-center items-center gap-1.5 mb-1 px-2.5 py-1 rounded-md bg-[#FFA8CD]/20 border border-[#FFA8CD]/60">
                  <span className="text-[10px] font-extrabold tracking-tight text-[#7A3F5F]">Klarna.</span>
                  <span className="text-[10px] text-slate-700">Available at checkout</span>
                </div>

                <div className="h-px bg-gray-200 my-5 sm:my-6"></div>
                <ul className="space-y-2.5 sm:space-y-3 text-left mb-7 sm:mb-8 flex-1">
                  {pkg.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 sm:gap-3">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-checkbox-circle-fill" style={{ color: TEAL }}></i>
                      </div>
                      <span className="text-[13px] sm:text-sm text-gray-700 leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to={pkg.href}
                  className="block w-full py-3.5 font-bold text-[14px] sm:text-sm rounded-md transition-colors cursor-pointer mt-auto text-white"
                  style={{ background: pkg.highlight ? TEAL : "#111827" }}
                >
                  {pkg.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-[12.5px] sm:text-sm text-gray-500 mt-6 max-w-2xl mx-auto leading-relaxed">
            <strong className="text-gray-700">Not sure if you need the Reasonable Accommodation option?</strong> Most
            people only need the Standard PSD documentation. Choose the Reasonable Accommodation package if your
            landlord, property manager, or HOA asks you to complete a separate accommodation form. Housing decisions
            remain with your provider and your housing provider — approval is never guaranteed.
          </p>
          <div className="flex items-center justify-center gap-2 mt-6 text-[13px] sm:text-sm text-gray-500 text-center">
            <i className="ri-refresh-line" style={{ color: TEAL }}></i>
            100% refund if you don't qualify after your provider review
          </div>
        </div>
      </section>

      {/* Included */}
      <section className="py-12 sm:py-16 bg-[#fafafa]">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-5 sm:mb-6 leading-tight text-center">
            What's Included
          </h2>
          <ul className="grid sm:grid-cols-2 gap-2.5 sm:gap-3">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-2.5 sm:gap-3 bg-white rounded-xl border border-gray-100 p-4">
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <i className="ri-checkbox-circle-fill" style={{ color: TEAL }}></i>
                </div>
                <p className="text-gray-700 text-[13.5px] sm:text-sm leading-relaxed">{item}</p>
              </li>
            ))}
          </ul>
          <div className="text-center mt-8">
            <Link
              to="/psd-assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 sm:px-8 py-3.5 text-white font-semibold rounded-md transition-colors cursor-pointer text-[14px] sm:text-base"
              style={{ background: TEAL }}
            >
              <i className="ri-file-text-line"></i>
              Start Your PSD Assessment
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-8 sm:mb-10">
            <span className="inline-block text-[11px] sm:text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: TEAL }}>
              Popular Questions
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">PSD Letter Cost FAQ</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between gap-3 px-5 sm:px-6 py-4 text-left cursor-pointer"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span className="text-[13.5px] sm:text-sm font-semibold leading-snug" style={{ color: openFaq === i ? TEAL : "#111827" }}>
                    {faq.q}
                  </span>
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    <i className={openFaq === i ? "ri-subtract-line" : "ri-add-line"} style={{ color: TEAL }}></i>
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

      {/* Related resources */}
      <section className="py-14 bg-[#fafafa] border-t border-gray-100">
        <div className="px-5 sm:px-6">
          <RelatedResources
            heading="Learn more about PSD letters"
            links={[
              { to: "/how-to-get-psd-letter", title: "How to get a PSD letter", desc: "The psychiatric service dog evaluation process, step by step." },
              { to: "/psd-letter-requirements", title: "PSD letter requirements", desc: "A qualifying disability, a task-trained dog, and a licensed provider evaluation." },
              { to: "/esa-vs-psd-letter", title: "ESA vs PSD letter", desc: "Task training is the deciding line — which one fits your situation." },
              { to: "/psd-letter-for-apartments", title: "PSD letter for apartments", desc: "Using a PSD letter for a Fair Housing Act reasonable-accommodation request." },
              { to: "/can-a-landlord-deny-a-psd-letter", title: "Can a landlord deny a PSD letter?", desc: "What a landlord can ask and the limited grounds for denial." },
              { to: "/esa-letter-cost", title: "ESA letter cost", desc: "Considering an emotional support animal instead? See ESA pricing." },
            ]}
          />
        </div>
      </section>

      <SharedFooter />

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom,12px))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <Link
          to="/psd-assessment"
          className="whitespace-nowrap flex items-center justify-center gap-2 w-full py-3.5 text-white font-bold text-sm rounded-md transition-colors cursor-pointer"
          style={{ background: TEAL }}
        >
          <i className="ri-file-text-line"></i>
          Start PSD Assessment — From ${getPsdAnnualTotal(1)}
        </Link>
      </div>
    </main>
  );
}
