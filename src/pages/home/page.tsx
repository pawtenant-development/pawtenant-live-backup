import { lazy, Suspense, useEffect, useState } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import HeroSection from "./components/HeroSection";
import StepsSection from "./components/StepsSection";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";
import { useAttributionParams } from "@/hooks/useAttributionParams";

/*
 * Section order (2026-07-11): CRO redesign (HOMEPAGE-CRO-REDESIGN-TEST-IMPLEMENT-001).
 *
 *   Hero                one integrated section (content over bg image) — promise + $32.25 + CTA
 *   StepsSection        "3 Simple Steps" — 3-minute assessment, big icons
 *   ── below the fold (lazy) ──
 *   LetterProofSection  sample letter + external annotations + verify band + landlord objections
 *   GuaranteeSection    deep-teal money-back band + Klarna note + cost-page link
 *   DoctorsSection      licensed providers (swipeable carousel, dynamic Supabase data)
 *   QualifySection      condition checklist + registry myth-bust + ESA definition (SEO H2 kept)
 *   PsdSection          task-trained PSD letter path (secondary CTA)
 *   TestimonialsSection reviews + one consistent stat set
 *   TopStatesSection    ESA/PSD state links (SEO link equity preserved)
 *   ResourcesSection    "Trusted ESA & PSD Resources" photo guide cards (SEO H2 kept)
 *   FAQSection          HUD-2026 strip + pruned FAQ (FAQPage schema preserved)
 *   CTASection          final close band
 *   SharedFooter        footer (all link columns preserved)
 *
 * Removed vs previous 30-block page (approved redesign): ReassuranceStrip,
 * MediaTrustBar, JourneyConnector ×4, WhatIsESA (folded into Qualify),
 * TrustFeatures, LandlordSupportSection (objections folded into LetterProof),
 * HudUpdateSection (calm strip inside FAQSection), VerificationPillarsSection,
 * WhyChooseSection, LetterPreviewSection (replaced by LetterProofSection),
 * AIAssistantTrustCard, TrustedLetters, AffordabilityStrip, PricingSection
 * (pricing lives on /esa-letter-cost — owner decision), MediaGallery,
 * ResourceLinksSection (merged into ResourcesSection), ContactSection.
 *
 * Performance architecture preserved from the previous revision:
 *   - Only HeroSection mounts in the first React commit (LCP = skeleton match).
 *   - Everything else (incl. navbar) mounts post-paint via showBelow.
 *   - Below-fold sections are lazy() with stable-height Suspense fallbacks.
 *   - SEO head mutations deferred past LCP (scheduleSeoWork).
 *   - Anchor IDs (#how-it-works, #faq, #state-guides) live inside their child
 *     components, so in-page links keep working.
 */
const LetterProofSection = lazy(() => import("./components/LetterProofSection"));
const GuaranteeSection = lazy(() => import("./components/GuaranteeSection"));
const DoctorsSection = lazy(() => import("./components/DoctorsSection"));
const QualifySection = lazy(() => import("./components/QualifySection"));
const PsdSection = lazy(() => import("./components/PsdSection"));
const TestimonialsSection = lazy(
  () => import("./components/TestimonialsSection"),
);
const TopStatesSection = lazy(() => import("./components/TopStatesSection"));
const ResourcesSection = lazy(() => import("./components/ResourcesSection"));
const HomePricingSection = lazy(() => import("./components/HomePricingSection"));
const FAQSection = lazy(() => import("./components/FAQSection"));
const CTASection = lazy(() => import("./components/CTASection"));
const SharedFooter = lazy(
  () => import("../../components/feature/SharedFooter"),
);

/**
 * Suspense fallback — minimum-height block that holds layout while the
 * lazy chunk streams in. Avoids CLS by giving the browser a stable
 * vertical slot.
 */
function SectionFallback() {
  return <div aria-hidden className="min-h-[280px]" />;
}

const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://pawtenant.com/#organization",
      "name": "PawTenant",
      "alternateName": "PawTenant ESA Letters",
      "url": "https://pawtenant.com",
      "logo": {
        "@type": "ImageObject",
        "@id": "https://pawtenant.com/#logo",
        "url": "https://pawtenant.com/logo.png",
        "contentUrl": "https://pawtenant.com/logo.png",
        "width": 400,
        "height": 80,
        "caption": "PawTenant"
      },
      "image": { "@id": "https://pawtenant.com/#logo" },
      "description": "PawTenant connects people with licensed mental health professionals for fast, legitimate ESA letters and psychiatric service dog letters. Serving all 50 states with same-day delivery and a 100% money-back guarantee.",
      "foundingDate": "2021",
      "areaServed": {
        "@type": "Country",
        "name": "United States"
      },
      "knowsAbout": [
        "Emotional Support Animal Letters",
        "Psychiatric Service Dog Letters",
        "Fair Housing Act Accommodations",
        "Mental Health Telehealth",
        "ESA Housing Rights"
      ],
      "serviceType": [
        "Emotional Support Animal Letter",
        "Psychiatric Service Dog Letter",
        "ESA Letter Renewal"
      ],
      "contactPoint": [
        {
          "@type": "ContactPoint",
          "contactType": "customer service",
          "url": "https://pawtenant.com/contact-us",
          "areaServed": "US",
          "availableLanguage": "English"
        }
      ],
      "sameAs": [
        "https://www.facebook.com/pawtenant",
        "https://www.instagram.com/pawtenant",
        "https://twitter.com/pawtenant",
        "https://www.linkedin.com/company/pawtenant"
      ],
      "hasOfferCatalog": {
        "@type": "OfferCatalog",
        "name": "ESA & PSD Letter Services",
        "itemListElement": [
          {
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service",
              "name": "ESA Letter — 1 Pet",
              "description": "Legitimate ESA letter from a licensed mental health professional with telehealth consultation. Valid for housing accommodation under the Fair Housing Act.",
              "url": "https://pawtenant.com/assessment"
            },
            "price": "129.00",
            "priceCurrency": "USD"
          },
          {
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service",
              "name": "Psychiatric Service Dog Letter",
              "description": "PSD letter from a licensed mental health professional confirming psychiatric disability and task training. Includes DOT form co-signature for airline travel.",
              "url": "https://pawtenant.com/assessment"
            },
            "price": "129.00",
            "priceCurrency": "USD"
          }
        ]
      }
    },
    {
      "@type": "WebSite",
      "@id": "https://pawtenant.com/#website",
      "url": "https://pawtenant.com",
      "name": "PawTenant",
      "publisher": { "@id": "https://pawtenant.com/#organization" },
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://pawtenant.com/blog?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    }
  ]
};

/**
 * Schedule the SEO head-mutation work for after the LCP paint:
 *   - requestIdleCallback when available (Chromium / Firefox).
 *   - setTimeout(120ms) fallback for Safari and older engines.
 * Returns the handle so the caller can cancel on unmount.
 */
function scheduleSeoWork(fn: () => void): () => void {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(fn);
    return () => {
      try {
        if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(id);
      } catch {
        /* ignore */
      }
    };
  }
  const id = window.setTimeout(fn, 120);
  return () => window.clearTimeout(id);
}

export default function Home() {
  // Defer the ENTIRE below-the-fold tree until AFTER the first paint so the
  // first React commit mounts ONLY the hero (matches the prerendered skeleton
  // exactly → no CLS, minimal TBT). See PageSpeed Phase 2 notes (2026-06-08).
  const { withAttribution } = useAttributionParams();
  const [showBelow, setShowBelow] = useState(false);
  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    const timer = window.setTimeout(() => setShowBelow(true), 250);
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShowBelow(true));
    });
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  useEffect(() => {
    // SEO surface mutations: title / description / keywords / canonical /
    // org schema. All deferred past LCP. Identical content to the previous
    // revision — no SEO regression.
    const cancel = scheduleSeoWork(() => {
      document.title = "ESA Letter Online | Licensed Provider Evaluation | PawTenant";
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) { metaDesc = document.createElement("meta"); (metaDesc as HTMLMetaElement).name = "description"; document.head.appendChild(metaDesc); }
      (metaDesc as HTMLMetaElement).content = "Get a real, housing-focused ESA letter through a licensed provider evaluation — verifiable letter, transparent pricing, and a refund if you don't qualify.";
      let metaKw = document.querySelector('meta[name="keywords"]');
      if (!metaKw) { metaKw = document.createElement("meta"); (metaKw as HTMLMetaElement).name = "keywords"; document.head.appendChild(metaKw); }
      (metaKw as HTMLMetaElement).content = "ESA letter online, real ESA letter, ESA letter for housing, ESA letter cost, emotional support animal letter, licensed provider ESA letter, verifiable ESA letter";
      let canonical = document.querySelector('link[rel="canonical"]');
      if (!canonical) { canonical = document.createElement("link"); (canonical as HTMLLinkElement).rel = "canonical"; document.head.appendChild(canonical); }
      (canonical as HTMLLinkElement).href = "https://pawtenant.com/";

      const existingScript = document.getElementById("org-schema");
      if (!existingScript) {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.id = "org-schema";
        script.text = JSON.stringify(ORGANIZATION_SCHEMA);
        document.head.appendChild(script);
      }
    });
    return () => {
      cancel();
      const s = document.getElementById("org-schema");
      if (s) s.remove();
    };
  }, []);

  return (
    <main>
      {/* ── Above the fold — eager. ONLY the hero (matches prerender skeleton). ── */}
      <HeroSection />

      {/* ── Below the fold + navbar — deferred to a post-paint commit. ── */}
      {!showBelow && <div aria-hidden className="min-h-[60vh]" />}
      {showBelow && (
        <>
          <SharedNavbar />

          {/* How it works — effort perception, honest review language. */}
          <StepsSection />

          {/* The letter itself — proof + landlord objections (one verification pitch). */}
          <Suspense fallback={<SectionFallback />}>
            <LetterProofSection />
          </Suspense>

          {/* Risk reversal — money-back guarantee + Klarna note + cost-page link. */}
          <Suspense fallback={<SectionFallback />}>
            <GuaranteeSection />
          </Suspense>

          {/* Licensed providers — swipeable carousel, dynamic data. */}
          <Suspense fallback={<SectionFallback />}>
            <DoctorsSection />
          </Suspense>

          {/* Self-identification + registry myth-bust + ESA definition. */}
          <Suspense fallback={<SectionFallback />}>
            <QualifySection />
          </Suspense>

          {/* PSD path — secondary CTA. */}
          <Suspense fallback={<SectionFallback />}>
            <PsdSection />
          </Suspense>

          {/* Social proof. */}
          <Suspense fallback={<SectionFallback />}>
            <TestimonialsSection />
          </Suspense>

          {/* State coverage — SEO link equity. */}
          <Suspense fallback={<SectionFallback />}>
            <TopStatesSection />
          </Suspense>

          {/* Guide cards — SEO internal links + imagery. */}
          <Suspense fallback={<SectionFallback />}>
            <ResourcesSection />
          </Suspense>

          {/* Transparent 3-card ESA pricing + payment trust strip. */}
          <Suspense fallback={<SectionFallback />}>
            <HomePricingSection />
          </Suspense>

          {/* HUD strip + FAQ (FAQPage schema). */}
          <Suspense fallback={<SectionFallback />}>
            <FAQSection />
          </Suspense>

          {/* Final CTA + footer. */}
          <Suspense fallback={<SectionFallback />}>
            <CTASection />
          </Suspense>
          <Suspense fallback={<SectionFallback />}>
            <SharedFooter />
          </Suspense>

          {/* Mobile sticky CTA — approved label (no price), attribution restored.
              variant="bold" = homepage Apply-Now orange-500 (opt-in; other pages
              keep the shared orange-400 default → no cross-route change). */}
          <MobileStickyApplyCTA
            showAfterPx={500}
            to={withAttribution("/assessment")}
            label="Check If You Qualify"
            icon="ri-checkbox-circle-line"
            variant="bold"
          />
        </>
      )}
    </main>
  );
}
