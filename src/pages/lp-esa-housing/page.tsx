import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "@/components/feature/SharedNavbar";
import SharedFooter from "@/components/feature/SharedFooter";
import Hud2026UpdateBanner from "@/components/feature/Hud2026UpdateBanner";
import MobileStickyApplyCTA from "@/components/feature/MobileStickyApplyCTA";
import { useAttributionParams } from "@/hooks/useAttributionParams";
import ResponsiveImage from "@/components/base/ResponsiveImage";
import { trackCtaClick } from "@/lib/trackEvent";
import PlannerMarketingSection from "@/components/feature/PlannerMarketingSection";
// ESA-HOUSING-HOMEPAGE-PRICING-PARITY-001 — the canonical homepage pricing
// block. PlanPricingSection is the ONE card implementation; buildEsaPlanCards +
// ESA_PLAN_COPY are the ONE card set, shared with
// src/pages/home/components/HomePricingSection.tsx and the ESA state pages.
// PlanPricingSection renders the shared PaymentTrustStrip itself, which is why
// this page no longer imports or mounts one directly.
import PlanPricingSection from "@/components/feature/PlanPricingSection";
import { buildEsaPlanCards, ESA_PLAN_COPY } from "@/data/planPricingCards";
import {
  getEsaOneTimeTotal,
  getBundleOneTimeTotal,
  getBundleAnnualTotal,
} from "@/config/pricing";

// PAWTENANT-ESA-HOUSING-CRO-RAW-HTML-LEGAL-001 — page-level funnel analytics.
//
// `cta_click` is an EXISTING canonical event name in src/lib/trackEvent.ts and
// `page_view` already fires for every route from DeferredServices, so this page
// adds NO new event name and NO new conversion action. The placement id says
// WHERE the click happened. Raw click identifiers are never passed here:
// trackEvent's own enrichment attaches attribution server-side, and nothing
// about the ad click is written into the DOM.
const CTA_HERO = "esa_housing_hero";
const CTA_STICKY = "esa_housing_sticky";
const CTA_SECTION = "esa_housing_section";

// ── SEO / indexability contract ─────────────────────────────────────────────
//
// PAWTENANT-ESA-HOUSING-CRO-RAW-HTML-LEGAL-001 (owner, 2026-09-17) REPLACES the
// 2026-07-28 "noindex by policy" decision for this route.
//
// What the old policy actually shipped: the page was absent from CORE_PAGE_META,
// so it had no prerendered file and was served by the Vercel catch-all as
// out/app.html — raw HTML carrying the HOMEPAGE title, the HOMEPAGE canonical
// (https://pawtenant.com/), `robots: index, follow` and zero <h1>. The
// noindex,nofollow meta was applied by JavaScript AFTER hydration, which a
// non-JS crawler never sees. The route was therefore crawlable, indexable and
// self-canonicalising to the homepage — not excluded.
//
// The route is now a first-class member of the prerender contract:
//   - src/config/seoConfig.ts    → CORE_PAGE_META["/esa-letter-housing"]
//   - src/prerender/entry.tsx    → real component SSR into <div id="root">
//   - public/sitemap.xml         → listed exactly once
//   - scripts/data/h1-coverage-routes.json → raw-HTML <h1> coverage
//
// So the page no longer writes a robots meta of its own. index.html already
// ships `index, follow, …` and prerender-seo.mjs writes the self-referencing
// canonical; a second robots tag here would only be able to disagree with it.
// The title/description are owned by seoConfig (one source, head + runtime).
// scripts/check-esa-housing-indexability.mjs fails the build if any part of
// that contract regresses.

// FAQ list — the SINGLE source for both the visible accordion and the FAQPage
// JSON-LD below it, so the two can never disagree. Wording is compliance-safe:
// a licensed professional decides qualification after an individual evaluation,
// approval is never automatic, and no housing outcome is promised.
const FAQ_ITEMS = [
  {
    q: "Who may qualify for an ESA housing letter?",
    a: "You may qualify if you have a mental or emotional health condition and a licensed professional determines, after reviewing your individual assessment, that an emotional support animal supports your wellbeing. Qualification is a clinical decision made by the reviewing professional — it is never automatic and never decided by an algorithm. If you do not qualify, your payment is refunded.",
  },
  {
    q: "Does a landlord have to accept every accommodation request?",
    a: "No. Housing providers covered by the federal Fair Housing Act generally must consider a reasonable accommodation request individually rather than apply a blanket no-pet rule, but they may deny a request in certain circumstances, and some housing is not covered at all. Documentation supports a request; it does not decide the outcome. The decision remains with the housing provider, and PawTenant cannot guarantee acceptance, a fee waiver, or any other result.",
  },
  {
    q: "What does the documentation contain?",
    a: "Housing-focused ESA documentation naming you and your animal, written for a reasonable accommodation request. It carries the reviewing professional's full name and credential, their state license number and NPI, their signature, the issue and expiration dates, and a verification ID in the format ESA-XX-XXXXXXX that a landlord can confirm at pawtenant.com/verify. It does not disclose your diagnosis or clinical notes.",
  },
  {
    q: "How long does it take?",
    a: "The online assessment takes about five minutes. A licensed professional then reviews it, and documentation is typically delivered within 24 hours after provider review, if approved. Review timing depends on the reviewing professional, and approval is never guaranteed.",
  },
  {
    q: "What happens if I do not qualify?",
    a: "If the reviewing professional does not find an emotional support animal clinically appropriate for you, no letter is issued and your payment is refunded. There is no charge retained for an evaluation that does not lead to documentation.",
  },
  {
    q: "Can one letter cover more than one animal?",
    a: "Yes, where it is clinically appropriate. The one-time package covers up to 2 pets on a single document, and three pets are covered at a fixed total. Whether multiple animals are supported is part of the professional's clinical judgement, not an automatic add-on.",
  },
  {
    q: "Do I need to renew each year?",
    a: "Many housing providers ask for current documentation, so most people renew annually. You can buy a one-time letter and return later, or choose the annual plan, which renews automatically at the renewal price shown and can be cancelled at any time from your account portal.",
  },
  {
    q: "What is the difference between an ESA letter and a psychiatric service dog letter?",
    a: "An emotional support animal provides comfort through companionship and is relevant to housing accommodation requests only. A psychiatric service dog is a dog individually trained to perform tasks related to a person's disability; comfort alone is not a trained task. PawTenant offers documentation for both, but neither document certifies an animal or creates public-access rights.",
  },
  {
    q: "Does an ESA letter give my animal access to stores, restaurants or flights?",
    a: "No. Under the Americans with Disabilities Act, emotional support animals are not service animals, so ESA documentation does not create public-access rights and businesses are not required to admit an emotional support animal. Air travel follows the airline's own rules and current U.S. Department of Transportation forms. This documentation is for housing accommodation requests.",
  },
];

// Prices come from src/config/pricing.ts — the ONE source of truth, the same
// module the checkout quote and the Stripe amounts are mirrored from. Nothing
// on this page hardcodes a dollar amount, so a price change lands here without
// an edit and this page can never quote an amount the checkout will not honour.
// The hero offer line and the RA note are the only figures this page states
// outside the shared cards; the cards derive their own from the same module.
const ESA_ONE_TIME = `$${getEsaOneTimeTotal(1)}`;
const RA_ONE_TIME = `$${getBundleOneTimeTotal()}`;
const RA_ANNUAL = `$${getBundleAnnualTotal()}`;

const PROVIDERS = [
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

export default function LpEsaHousingPage() {
  // Attribution-safe CTA destinations. appendAttribution() merges into an
  // existing query string, so the subscription link keeps `plan=subscription`
  // AND the ad params (gclid / gbraid / wbraid / UTM).
  const { withAttribution } = useAttributionParams();
  const ASSESSMENT_HREF = withAttribution("/assessment");
  const PSD_ASSESSMENT_HREF = withAttribution("/psd-assessment");
  // ESA-HOUSING-HOMEPAGE-PRICING-PARITY-001 — there is no longer a page-local
  // `?plan=subscription` CTA. The annual plan is now chosen from the shared
  // homepage card, whose CTA routes to the plain /assessment exactly as it does
  // on the homepage; the plan is picked inside the assessment. Reintroducing a
  // page-local subscription deep link here would make this page's CTAs behave
  // differently from the same card on the homepage.

  // Mobile-only: show the first four FAQs initially, the rest behind a toggle.
  // Every item stays in the DOM regardless (display:none only), so the raw
  // prerendered HTML and the JSON-LD always carry the full list.
  const [showAllMobile, setShowAllMobile] = useState(false);

  // The <head> title/description/canonical for this route are owned by
  // seoConfig + prerender-seo.mjs + the runtime SEOManager. This effect adds
  // ONLY the FAQPage schema, built from the same FAQ_ITEMS the accordion
  // renders, and removes it on unmount so it can never leak onto another route.
  useEffect(() => {
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.setAttribute("data-pt-faq", "esa-letter-housing");
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);

  return (
    <main className="bg-[#FAFAFA] text-slate-900 antialiased">
      {/* ─────────── 0. Site-wide navbar ─────────── */}
      <SharedNavbar />

      {/* ─────────── 1. HERO ───────────
          No lifestyle photograph. The one meaningful visual above the fold is
          the sample document itself, which is what a housing-documentation
          buyer is actually trying to evaluate. Removing the two decorative
          background crops also removes the mobile LCP background image. */}
      <section className="relative bg-white border-b border-slate-200">
        <div className="relative max-w-6xl mx-auto px-5 pt-24 md:pt-28 pb-12 md:pb-20 grid md:grid-cols-12 gap-10 md:gap-14 items-start md:items-center">
          <div className="md:col-span-7">
            <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-full mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Housing-related ESA documentation
            </span>

            <h1 className="text-[28px] sm:text-[32px] md:text-[40px] lg:text-[44px] leading-[1.12] font-bold tracking-tight text-slate-900 mb-4">
              ESA Letter for Housing From a Licensed Professional
            </h1>

            <p className="text-[16px] md:text-[17px] leading-relaxed text-slate-600 mb-5 max-w-[62ch]">
              Complete a confidential online assessment. A professional licensed
              in your state reviews it individually and issues housing-focused
              documentation only when an emotional support animal is clinically
              appropriate. Approval is never automatic, and a housing provider's
              decision is never guaranteed.
            </p>

            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[14px] md:text-[15px] leading-snug text-slate-700 mb-6 max-w-xl list-none p-0 m-0" aria-label="Offer summary">
              <li className="inline-flex items-center gap-1.5">
                <OfferTick />
                <span className="font-semibold text-slate-900">Online assessment</span>
              </li>
              <li className="inline-flex items-center gap-1.5">
                <OfferTick />
                <span>about 5 minutes</span>
              </li>
              <li className="inline-flex items-center gap-1.5">
                <OfferTick />
                <span>
                  <span className="font-semibold text-slate-900">{ESA_ONE_TIME}</span> one-time, up to 2 pets
                </span>
              </li>
            </ul>

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <Link
                to={ASSESSMENT_HREF}
                onClick={() => trackCtaClick(CTA_HERO)}
                className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[15px] md:text-[16px] px-7 py-4 rounded-md transition shadow-[0_4px_16px_rgba(249,115,22,0.30)]"
              >
                Start Free Assessment
                <span aria-hidden>→</span>
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-[15px] md:text-[16px] px-7 py-4 rounded-md transition"
              >
                See How It Works
              </a>
            </div>

            {/* "Free" describes the ASSESSMENT ONLY. This line exists so the
                CTA above can never be read as a free letter: the customer pays
                at checkout, before clinical review, and is refunded when the
                reviewing professional does not approve documentation. */}
            <p className="text-[13px] text-slate-500 leading-relaxed mb-7 max-w-[62ch]">
              Starting the assessment is free. You pay when you choose a package
              at checkout, and you are refunded if you do not qualify. The
              assessment fee covers the review — it does not buy a letter.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
              <TrustChip
                label="Licensed provider review"
                detail="Reviewed by a professional licensed in your state"
                icon="badge"
              />
              <TrustChip
                label="Typically within 24 hours after provider review"
                detail="Delivered as a secure PDF, if approved"
                tone="green"
                icon="shield"
              />
              <TrustChip
                label="Refund if you do not qualify"
                detail="No letter issued, payment returned"
                icon="refund"
              />
              <TrustChip
                label="Secure and confidential"
                detail="Your clinical answers are never shown to a landlord"
                tone="green"
                icon="shield"
              />
            </div>
          </div>

          <div className="md:col-span-5">
            <LetterPreviewCard />
          </div>
        </div>
      </section>

      {/* ─────────── 2. QUICK ANSWER ─────────── */}
      <section id="quick-answer" className="scroll-mt-24 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-5 py-14 md:py-16">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-4 leading-[1.18]">
            What an ESA housing letter is
          </h2>
          <p className="text-[15px] md:text-[16px] text-slate-600 leading-relaxed max-w-[68ch] mb-8">
            An emotional support animal letter is documentation from a licensed
            mental health professional stating that an animal supports a
            mental or emotional health condition. Tenants use it to ask a
            housing provider for a reasonable accommodation to a pet rule under
            the Fair Housing Act. It is a clinical document that supports a
            request — nothing more, and nothing less.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-5">
              <div className="text-[14px] font-semibold text-emerald-900 mb-2">What it may support</div>
              <ul className="space-y-2 list-none p-0 m-0">
                <PlainPoint tone="green">A reasonable accommodation request to a covered housing provider</PlainPoint>
                <PlainPoint tone="green">A request that a no-pet rule, breed rule or weight rule be reconsidered for your animal</PlainPoint>
                <PlainPoint tone="green">A landlord's request for documentation from a licensed professional</PlainPoint>
              </ul>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
              <div className="text-[14px] font-semibold text-slate-900 mb-2">What it does not do</div>
              <ul className="space-y-2 list-none p-0 m-0">
                <PlainPoint>It does not decide or guarantee a landlord's answer</PlainPoint>
                <PlainPoint>It does not create public-access rights in stores, restaurants, hotels or workplaces</PlainPoint>
                <PlainPoint>It does not certify, register or license an animal</PlainPoint>
                <PlainPoint>It does not remove every pet fee, and it does not apply to every property</PlainPoint>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── 3. HOW IT WORKS ─────────── */}
      <section id="how-it-works" className="scroll-mt-24 bg-[#FAFAFA] border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-5 py-14 md:py-16">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-8 leading-[1.18]">
            How it works
          </h2>
          <ol className="grid md:grid-cols-3 gap-6 list-none p-0 m-0">
            <Step n={1} title="Complete the assessment">
              A confidential online questionnaire about your situation and your
              animal. It takes about five minutes and starting it is free.
            </Step>
            <Step n={2} title="A licensed professional reviews it">
              A professional licensed in your state reviews your assessment
              individually and may follow up for more detail. Qualification is
              their clinical decision.
            </Step>
            <Step n={3} title="Receive documentation if appropriate">
              If an emotional support animal is clinically appropriate, your
              documentation arrives as a secure PDF, typically within 24 hours
              after provider review. If not, you are refunded.
            </Step>
          </ol>
        </div>
      </section>

      {/* ─────────── 4. WHAT THE LETTER INCLUDES ─────────── */}
      <section id="whats-included" className="scroll-mt-24 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-5 py-14 md:py-16">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-4 leading-[1.18]">
            What the documentation includes
          </h2>
          <p className="text-[15px] text-slate-600 leading-relaxed max-w-[68ch] mb-8">
            Every document is written for a housing accommodation request and
            carries the details a housing provider needs to confirm it came from
            a real, actively licensed professional.
          </p>
          <div className="grid md:grid-cols-2 gap-x-10 gap-y-3">
            <ul className="space-y-3 list-none p-0 m-0">
              <PlainPoint tone="green">The reviewing professional's full name and credential</PlainPoint>
              <PlainPoint tone="green">Their state license number and NPI</PlainPoint>
              <PlainPoint tone="green">Their signature</PlainPoint>
              <PlainPoint tone="green">Issue date and expiration date</PlainPoint>
            </ul>
            <ul className="space-y-3 list-none p-0 m-0">
              <PlainPoint tone="green">Your name and the animal the document covers</PlainPoint>
              <PlainPoint tone="green">Housing-accommodation language, not public-access language</PlainPoint>
              <PlainPoint tone="green">
                A verification ID in the format <span className="font-mono text-slate-900">ESA-XX-XXXXXXX</span>
              </PlainPoint>
              <PlainPoint tone="green">A verification link a landlord can check at pawtenant.com/verify</PlainPoint>
            </ul>
          </div>

          <div className="mt-10">
            <h3 className="text-[15px] font-semibold text-slate-900 mb-4">
              Reviewed by licensed professionals
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {PROVIDERS.map((p) => (
                <ProviderCard key={p.name} {...p} />
              ))}
            </div>
            <p className="text-[12px] text-slate-500 leading-relaxed mt-4 max-w-[68ch]">
              Your assessment is matched to a professional licensed in your own
              state, who may or may not be one of the professionals shown here.
              Every license and NPI can be confirmed independently on the public
              NPPES registry.
            </p>
          </div>
        </div>
      </section>

      {/* ─────────── 5. HOUSING USE ─────────── */}
      <section id="housing-use" className="scroll-mt-24 bg-[#FAFAFA] border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-5 py-14 md:py-16">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-4 leading-[1.18]">
            Using the documentation for a housing request
          </h2>
          <p className="text-[15px] text-slate-600 leading-relaxed max-w-[68ch] mb-6">
            Under the Fair Housing Act, a covered housing provider is generally
            expected to consider a reasonable accommodation request
            individually, rather than apply a blanket pet rule without looking
            at the request. Your documentation is what you attach to that
            request. What happens next is the housing provider's decision.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-[14px] font-semibold text-slate-900 mb-2">How people usually use it</div>
              <ul className="space-y-2 list-none p-0 m-0">
                <PlainPoint>Send it with a written accommodation request to the landlord, property manager or HOA</PlainPoint>
                <PlainPoint>Provide it when a housing provider asks for documentation from a licensed professional</PlainPoint>
                <PlainPoint>Keep the verification ID handy so the housing provider can confirm the document themselves</PlainPoint>
              </ul>
            </div>
            <div className="bg-white border border-amber-200 rounded-xl p-5">
              <div className="text-[14px] font-semibold text-slate-900 mb-2">What we do not claim</div>
              <ul className="space-y-2 list-none p-0 m-0">
                <PlainPoint>Not every property is covered by the Fair Housing Act</PlainPoint>
                <PlainPoint>Not every landlord must approve a request, and a request can be denied</PlainPoint>
                <PlainPoint>Pet fees and pet rent are not always removed</PlainPoint>
                <PlainPoint>Short-term and vacation rentals are treated differently and are often not covered</PlainPoint>
              </ul>
            </div>
          </div>
          <p className="text-[12px] text-slate-500 leading-relaxed mt-5 max-w-[68ch]">
            PawTenant is not a law firm and does not provide legal advice. Whether
            a particular property is covered, and how a request is handled,
            depends on the property type, applicable state law, and the
            individual facts.
          </p>
        </div>
      </section>

      {/* ─────────── 6. TRANSPARENT PRICING ─────────── */}
      {/* ─────────── 6. TRANSPARENT PRICING ───────────
          ESA-HOUSING-HOMEPAGE-PRICING-PARITY-001 (owner, 2026-09-19).

          This used to be a bespoke two-card grid built only for this page. It
          is now the CANONICAL homepage pricing block: the same
          <PlanPricingSection> component, fed by the same buildEsaPlanCards() +
          ESA_PLAN_COPY from src/data/planPricingCards.ts that
          src/pages/home/components/HomePricingSection.tsx passes it, with the
          homepage's own eyebrow, heading, subheading, footnote and background.

          There is therefore ONE card implementation for both pages — a card,
          a price, a feature line or a CTA cannot change on one and not the
          other. Amounts still come from src/config/pricing.ts via
          planPricingCards; nothing here hardcodes a figure. PlanPricingSection
          also renders the shared PaymentTrustStrip below the cards, so this
          page no longer mounts its own (that would have been a second strip).

          `id`/`scroll-mt-24` are passed through so the #pricing anchor still
          clears the fixed navbar. CTA hrefs are the plain paths the homepage
          uses; PlanPricingSection appends attribution itself via
          withAttribution(), exactly as it does on the homepage. */}
      <PlanPricingSection
        theme="esa"
        id="pricing"
        className="scroll-mt-24 bg-[#fdf8f3] border-t border-orange-100"
        eyebrow={ESA_PLAN_COPY.eyebrow}
        heading={ESA_PLAN_COPY.heading}
        subheading={ESA_PLAN_COPY.subheading}
        cards={buildEsaPlanCards("/assessment")}
        footnote={ESA_PLAN_COPY.footnote}
      />

      {/* Pricing notes that sit BESIDE the cards rather than repeating them.
          The retired "Three pets" box was removed because the third homepage
          card already states that tier; what is left adds information the
          cards deliberately do not carry (the RA add-on is intentionally not a
          public pricing card) and the Klarna and PSD disclosures. */}
      <section className="bg-[#fdf8f3] border-b border-orange-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 pb-14 sm:pb-16">
          <div className="bg-white border border-orange-100 rounded-xl p-4 max-w-3xl mx-auto">
            <div className="text-[13px] font-semibold text-slate-900 mb-1">Optional accommodation-document support</div>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              If your landlord, property manager or HOA asks you to complete a
              separate accommodation form, that support is available at{" "}
              {RA_ONE_TIME} one-time or {RA_ANNUAL} per year. Most tenants only
              need the standard documentation.
            </p>
          </div>

          <p className="text-[12px] text-slate-500 leading-relaxed mt-5 max-w-3xl mx-auto">
            Klarna is available at checkout, subject to eligibility and Klarna's
            own payment terms. An instalment is a way of paying the price above —
            it is not a lower price.
          </p>

          <p className="text-[12px] text-slate-500 leading-relaxed mt-4 max-w-3xl mx-auto">
            Looking for a psychiatric service dog instead? A psychiatric service
            dog is a dog individually trained to perform tasks related to a
            disability, which is a different assessment.{" "}
            <Link to={PSD_ASSESSMENT_HREF} className="text-orange-600 font-medium hover:underline">
              Start the PSD assessment
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ─────────── 7. WHY PAWTENANT ─────────── */}
      <section id="why-pawtenant" className="scroll-mt-24 bg-[#FAFAFA] border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-5 py-14 md:py-16">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-8 leading-[1.18]">
            Why tenants choose PawTenant
          </h2>
          <div className="grid sm:grid-cols-2 gap-5">
            <ReasonCard title="A real clinical review, every time">
              Every assessment is read by a professional licensed in your state.
              There is no instant approval path and no algorithm that decides
              qualification.
            </ReasonCard>
            <ReasonCard title="Documentation a landlord can check">
              Each document carries the professional's name, license number and
              NPI, plus a verification ID a housing provider can confirm
              directly — without seeing any clinical detail.
            </ReasonCard>
            <ReasonCard title="Refund if you do not qualify">
              If the reviewing professional does not approve documentation, no
              letter is issued and your payment is refunded.
            </ReasonCard>
            <ReasonCard title="Honest about what a letter can do">
              We do not promise landlord approval, waived pet fees, or access to
              places an emotional support animal has no right to enter.
            </ReasonCard>
          </div>
        </div>
      </section>

      {/* ─────────── 8. WHAT A LANDLORD CAN VERIFY ─────────── */}
      <section id="verify" className="scroll-mt-24 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-5 py-14 md:py-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3 leading-[1.18]">
              What a landlord can verify
            </h2>
            <p className="text-[15px] text-slate-600 leading-relaxed max-w-[62ch] mb-6">
              Your landlord can verify the documentation without ever seeing your
              diagnosis, your answers, or any clinical note. The verification page
              confirms authenticity only.
            </p>
            <ol className="list-none p-0 m-0">
              <VerifyStep n={1} title="They open the verification link">
                Printed on the document, alongside the{" "}
                <span className="font-mono">ESA-XX-XXXXXXX</span> verification ID.
              </VerifyStep>
              <VerifyStep n={2} title="The page confirms the document is genuine" tone="green">
                Document type, state, issue and expiration dates, and the issuing
                professional's credentials.
              </VerifyStep>
              <VerifyStep n={3} title="Nothing clinical is shown" tone="green" last>
                No diagnosis, no assessment answers, no medical record — only
                whether the document is authentic and the licence is active.
              </VerifyStep>
            </ol>
          </div>
          <VerifyMock />
        </div>
      </section>

      {/* ─────────── 9. FAQ ─────────── */}
      <section id="faq" className="scroll-mt-24 bg-[#FAFAFA] border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 py-14 md:py-16">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-6 leading-[1.18] text-center">
            Frequently asked questions
          </h2>
          <div className="space-y-2.5">
            {FAQ_ITEMS.map((item, i) => (
              <div key={item.q} className={!showAllMobile && i >= 4 ? "hidden md:block" : ""}>
                <FAQItem q={item.q} a={item.a} defaultOpen={i === 0} />
              </div>
            ))}
          </div>
          {!showAllMobile && (
            <button
              type="button"
              onClick={() => setShowAllMobile(true)}
              className="md:hidden mt-4 w-full min-h-[44px] border border-slate-300 bg-white text-slate-800 text-[14px] font-medium rounded-md"
            >
              Show more questions
            </button>
          )}
        </div>
      </section>

      {/* ─────────── 10. FINAL CTA ─────────── */}
      <section className="relative bg-gradient-to-b from-[#0E2A47] to-[#091B30] text-white overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ background: "radial-gradient(circle at 50% 0%, #ffffff 0%, transparent 60%)" }}
        />
        <div className="relative max-w-3xl mx-auto px-5 py-14 md:py-24 text-center">
          <h2 className="text-2xl md:text-[28px] font-bold tracking-tight leading-tight mb-3">
            See whether you qualify — it takes about five minutes
          </h2>
          <p className="text-[14px] text-slate-300 leading-relaxed mb-7 max-w-[60ch] mx-auto">
            A professional licensed in your state reviews your assessment
            individually. Documentation is issued only when it is clinically
            appropriate, and you are refunded if you do not qualify.
          </p>
          <Link
            to={ASSESSMENT_HREF}
            onClick={() => trackCtaClick(CTA_SECTION)}
            className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[15px] md:text-[16px] px-8 py-4 rounded-md transition w-full sm:w-auto shadow-[0_4px_16px_rgba(249,115,22,0.35)]"
          >
            Start Free Assessment
            <span aria-hidden>→</span>
          </Link>
          <div className="mt-9 grid sm:grid-cols-3 gap-4 text-left max-w-xl mx-auto">
            <FinalTrust>Refund if you do not qualify after review</FinalTrust>
            <FinalTrust>Verification ID on every document</FinalTrust>
            <FinalTrust>Licence number and NPI on every document</FinalTrust>
          </div>
        </div>
      </section>

      <PlannerMarketingSection family="esa" />

      <Hud2026UpdateBanner className="border-t border-gray-100" />

      <SharedFooter />

      {/* Persistent mobile conversion path — the same shared bar many other
          PawTenant pages use.
            to        — the ATTRIBUTED href, never the component's bare
                        "/assessment" default, so the bar carries UTM / gclid
                        exactly like every other CTA on this page.
            label     — the page's single primary CTA label. The component's own
                        default ("…From $115") is NOT used: anchoring on a lower
                        figure than the real one-time price is the documented
                        cause of the 2026-07-23 conversion collapse.
            consentSafe — sits BELOW the cookie banner and stays hidden until
                        consent is settled, so it can never cover the controls.
            hideNearBottomPx — retires the bar over the final CTA and footer. */}
      <MobileStickyApplyCTA
        to={ASSESSMENT_HREF}
        label="Start Free Assessment"
        icon="ri-shield-check-line"
        showAfterPx={500}
        consentSafe
        hideNearBottomPx={900}
        onClick={() => trackCtaClick(CTA_STICKY)}
      />
    </main>
  );
}
/* ────────────────────────── Sub-components (file-local) ────────────────────────── */

function LetterPreviewCard() {
  // The one document visual: the PawTenant ESA sample (SVG) inside a document
  // chrome card. Eager + high priority because it is the measured LCP element
  // on mobile; explicit width/height keep the reserved box stable (CLS 0).
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-[0_2px_8px_rgba(15,23,42,0.05)] overflow-hidden">
      <div className="flex items-center justify-between bg-slate-50 px-3 py-2 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="w-2 h-2 rounded-full bg-slate-300" />
        </div>
        <div className="font-mono text-[10px] text-slate-500">esa-letter-sample.pdf</div>
        <div className="w-8" />
      </div>

      <div className="bg-white p-3 md:p-4">
        <img
          src="/images/checkout/esa-sample-letter.svg"
          alt="Sample PawTenant ESA letter showing provider credentials, and housing-accommodation language. Names and details are placeholders."
          width={800}
          height={1035}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="w-full h-auto block"
        />
      </div>

      <div className="bg-emerald-50 border-t border-emerald-200 px-4 py-3 flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-emerald-900 leading-tight">Every document carries a verification ID</div>
          <div className="text-[11px] text-emerald-800/80 leading-snug font-mono">pawtenant.com/verify · landlords confirm in seconds</div>
        </div>
      </div>

      <div className="text-center text-[10px] text-slate-400 py-2 px-3 bg-white border-t border-slate-100">
        Sample template · placeholder names · housing-accommodation language only.
      </div>
    </div>
  );
}

function TrustChip({
  label,
  detail,
  tone = "navy",
  icon = "shield",
}: {
  label: string;
  detail: string;
  tone?: "navy" | "green";
  icon?: "shield" | "badge" | "refund";
}) {
  const fillClasses =
    tone === "green"
      ? "bg-emerald-600 text-white shadow-[0_2px_6px_rgba(16,185,129,0.30)]"
      : "bg-[#0E2A47] text-white shadow-[0_2px_6px_rgba(14,42,71,0.30)]";

  return (
    <div className="flex items-start gap-3">
      <span className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${fillClasses}`}>
        {icon === "shield" && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        )}
        {icon === "badge" && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="8" r="6" />
            <path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5" />
          </svg>
        )}
        {icon === "refund" && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
        )}
      </span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-slate-900 leading-snug">{label}</div>
        <div className="text-[12px] text-slate-500 leading-snug">{detail}</div>
      </div>
    </div>
  );
}

/** A single bullet with a tick (green) or a neutral dash marker. */
function PlainPoint({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" }) {
  return (
    <li className="flex gap-2.5 items-start text-[13px] leading-relaxed text-slate-700">
      <span
        aria-hidden
        className={`mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${tone === "green" ? "bg-emerald-600" : "bg-slate-400"}`}
      />
      <span>{children}</span>
    </li>
  );
}

function ReasonCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="text-[14.5px] font-semibold text-slate-900 mb-1.5">{title}</div>
      <div className="text-[13px] text-slate-600 leading-relaxed">{children}</div>
    </div>
  );
}

function OfferTick() {
  return (
    <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0" aria-hidden>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

function VerifyStep({
  n,
  title,
  children,
  tone = "navy",
  last = false,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  tone?: "navy" | "green";
  last?: boolean;
}) {
  const bubble = tone === "green" ? "bg-emerald-600" : "bg-[#0E2A47]";
  return (
    <li className={`relative flex gap-3.5 items-start ${last ? "" : "pb-4"}`}>
      {!last && <span aria-hidden className="absolute left-[13px] top-8 bottom-0 w-px bg-slate-200" />}
      <span className={`relative w-7 h-7 rounded-full ${bubble} text-white flex items-center justify-center text-[12.5px] font-semibold flex-shrink-0`}>{n}</span>
      <div className="min-w-0 pt-0.5">
        <div className="text-[14.5px] font-semibold text-slate-900 leading-snug">{title}</div>
        <div className="text-[13px] text-slate-600 leading-snug mt-0.5">{children}</div>
      </div>
    </li>
  );
}

function VerifyMock() {
  // Cropped real /verify result screen. Privacy-safe: no diagnosis or clinical
  // information is shown.
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="w-2 h-2 rounded-full bg-slate-300" />
        </div>
        <div className="font-mono text-[10px] text-slate-500">pawtenant.com/verify</div>
        <div className="w-6" />
      </div>

      {/* ESA-HOUSING-HYBRID-TEST-001 — this is the owner-created verification
          snapshot and it must be served byte-exact, matching LIVE. Never route
          it through ResponsiveImage: its AVIF/WebP variants are lossy
          re-encodes of the screenshot, which counts as altering the owner's
          image. The bytes here outrank the Lighthouse score. */}
      <img
        src="/assets/ui/verification-cropped.png"
        alt="PawTenant verification result confirming a letter is authentic. Shows letter type, state, issue and expiration dates, issuing provider, NPI, and license. No patient health information is displayed."
        width={820}
        height={1110}
        loading="lazy"
        decoding="async"
        className="w-full h-auto block"
      />

      <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center flex-shrink-0">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <div className="text-[11px] text-slate-600 leading-snug">
          Confirms <span className="text-slate-900 font-medium">authenticity only</span> — no patient health information is displayed.
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ name, credential, photo, bio }: { name: string; credential: string; photo: string; bio: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        {imgFailed ? (
          <div className="w-14 h-14 rounded-full bg-slate-100 text-[#0E2A47] flex items-center justify-center text-[15px] font-medium tracking-wide flex-shrink-0">
            {initials}
          </div>
        ) : (
          // These render at 56 CSS px. `sizes="56px"` lets the browser take the
          // 128-wide variant, which still covers a 2x screen (56 x 2 = 112).
          // `pictureClassName` carries flex-shrink-0 because <picture> becomes
          // the flex item, so the class has to sit there rather than on the
          // <img> to keep the avatar from being squashed.
          <ResponsiveImage
            src={photo}
            alt={`${name}, ${credential}`}
            width={56}
            height={56}
            sizes="56px"
            onError={() => setImgFailed(true)}
            pictureClassName="flex-shrink-0"
            className="w-14 h-14 rounded-full object-cover bg-slate-100"
          />
        )}
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-slate-900 leading-tight">{name}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{credential}</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-slate-300 bg-white rounded-full text-[10px] text-[#0E2A47] font-medium">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0E2A47" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          NPI verifiable
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-full text-[10px] text-emerald-800 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          Active license
        </span>
      </div>

      <div className="text-[12px] text-slate-600 leading-relaxed border-t border-slate-100 pt-3">{bio}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <div className="w-9 h-9 rounded-full bg-[#0E2A47] text-white flex items-center justify-center text-[14px] font-medium flex-shrink-0">{n}</div>
      <div>
        <div className="text-[14.5px] font-semibold text-slate-900 mb-1">{title}</div>
        <div className="text-[13px] text-slate-600 leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

function FAQItem({ q, a, defaultOpen }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const accent = defaultOpen
    ? open
      ? "bg-[#0E2A47]/[0.03] border-[#0E2A47]/30"
      : "bg-white border-[#0E2A47]/30"
    : "bg-white border-slate-200";
  const iconColor = open ? "text-emerald-600" : "text-[#0E2A47]";

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className={`group rounded-lg px-4 py-1 border transition-colors ${accent}`}
    >
      {/* min-h-[44px] makes the whole collapsed row the tap target without
          changing how it looks. */}
      <summary className="flex min-h-[44px] items-center justify-between gap-3 py-2 cursor-pointer list-none">
        <span className="text-[13.5px] font-medium text-slate-900 leading-snug">{q}</span>
        <span
          aria-hidden
          className={`text-[18px] leading-none flex-shrink-0 transition-transform duration-200 ${iconColor} ${open ? "rotate-45" : ""}`}
        >
          +
        </span>
      </summary>
      <div className="text-[13px] text-slate-600 leading-relaxed mt-3 pt-3 border-t border-slate-100">{a}</div>
    </details>
  );
}

function FinalTrust({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-[12.5px] text-slate-300 leading-relaxed">
      <span className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span>{children}</span>
    </div>
  );
}