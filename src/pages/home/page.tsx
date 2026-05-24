import { lazy, Suspense, useEffect } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import HeroSection from "./components/HeroSection";
import ReassuranceStrip from "./components/ReassuranceStrip";
import MediaTrustBar from "./components/MediaTrustBar";
import StepsSection from "./components/StepsSection";
import JourneyConnector from "./components/JourneyConnector";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";

/*
 * Section order (2026-05-24): decision-journey reorder.
 *
 *   Hero               creates interest
 *   ReassuranceStrip   quick what-you-get reassurance under hero
 *   MediaTrustBar      small trust badges
 *   StepsSection       "How does this work?" — explains simplicity
 *   ── below the fold ──
 *   WhatIsESA          definition + why this matters
 *   TrustFeatures      key benefits cards
 *   LandlordSupportSection   housing context + objection framing
 *   VerificationPillars      why PawTenant is trustworthy (verification)
 *   WhyChooseSection         why PawTenant is trustworthy
 *   DoctorsSection           Provider / Licensed Professional section
 *   LetterPreviewSection     sample letter + verification visual
 *   TrustedLetters           additional letter trust
 *   AffordabilityStrip       affordability bridge into pricing
 *   PricingSection           Cost / pricing clarity
 *   TopStatesSection         coverage / availability proof
 *   TestimonialsSection      Reviews / social proof
 *   MediaGallery             media coverage
 *   FAQSection               FAQs / objection removal
 *   CTASection               final, confident CTA
 *   ContactSection           contact options
 *   SharedFooter             footer
 *
 * Performance: eager block trimmed to 5 sections (was 7) — TrustFeatures
 * and AffordabilityStrip moved to lazy. This reduces JS parsed before
 * LCP. SectionFallback keeps stable vertical slots so CLS stays low while
 * the below-fold chunks stream in.
 *
 * SEO + visual surface preserved:
 *   - Title / canonical / meta / schema injection still runs on mount.
 *   - H1 / H2 wording untouched.
 *   - Anchor IDs (#how-it-works, #pricing, #faq) live inside their child
 *     components, so reordering the parent does not break in-page links.
 *   - Schema injection still nudged into requestIdleCallback so the
 *     <head> mutation happens after the LCP paint.
 */
const WhatIsESA = lazy(() => import("./components/WhatIsESA"));
const TrustFeatures = lazy(() => import("./components/TrustFeatures"));
const TrustedLetters = lazy(() => import("./components/TrustedLetters"));
const LetterPreviewSection = lazy(
  () => import("./components/LetterPreviewSection"),
);
const LandlordSupportSection = lazy(
  () => import("./components/LandlordSupportSection"),
);
const AffordabilityStrip = lazy(() => import("./components/AffordabilityStrip"));
const PricingSection = lazy(() => import("./components/PricingSection"));
const WhyChooseSection = lazy(() => import("./components/WhyChooseSection"));
const VerificationPillarsSection = lazy(
  () => import("../../components/feature/VerificationPillarsSection"),
);
const TopStatesSection = lazy(() => import("./components/TopStatesSection"));
const DoctorsSection = lazy(() => import("./components/DoctorsSection"));
const TestimonialsSection = lazy(
  () => import("./components/TestimonialsSection"),
);
const MediaGallery = lazy(() => import("./components/MediaGallery"));
const FAQSection = lazy(() => import("./components/FAQSection"));
const CTASection = lazy(() => import("./components/CTASection"));
const ContactSection = lazy(() => import("./components/ContactSection"));
const SharedFooter = lazy(
  () => import("../../components/feature/SharedFooter"),
);

/**
 * Suspense fallback — minimum-height block that holds layout while the
 * lazy chunk streams in. Avoids CLS by giving the browser a stable
 * vertical slot. Tuned to be tall enough that on mobile the page does
 * not contract dramatically when chunks resolve.
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
            "price": "99.00",
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
            "price": "149.00",
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
  useEffect(() => {
    // SEO surface mutations: title / description / keywords / canonical /
    // org schema. All deferred past LCP. Identical content to the
    // pre-Phase-1 version — no SEO regression.
    const cancel = scheduleSeoWork(() => {
      document.title = "Legitimate ESA Letter Online | Licensed Professionals";
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) { metaDesc = document.createElement("meta"); (metaDesc as HTMLMetaElement).name = "description"; document.head.appendChild(metaDesc); }
      (metaDesc as HTMLMetaElement).content = "Get a legitimate ESA letter from licensed mental health professionals. Valid in all US states. HIPAA-secure, same-day delivery, 100% money-back guarantee.";
      let metaKw = document.querySelector('meta[name="keywords"]');
      if (!metaKw) { metaKw = document.createElement("meta"); (metaKw as HTMLMetaElement).name = "keywords"; document.head.appendChild(metaKw); }
      (metaKw as HTMLMetaElement).content = "legitimate ESA letter, legit ESA letter, ESA letter online, ESA letter for housing, emotional support animal letter USA, licensed LMHP";
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
      {/* ── Above the fold — eager ──────────────────────────────────── */}
      {/* 1. Hero — interest. */}
      <SharedNavbar />
      <HeroSection />

      {/* 2. Quick reassurance + trust badges under the hero. */}
      <ReassuranceStrip />
      <MediaTrustBar />

      {/* 3. How does this work? — process explains simplicity. */}
      <StepsSection />

      {/* Connector: Steps → Benefits */}
      <JourneyConnector to="Why get an ESA letter" number={2} total={6} bg="bg-slate-100" />

      {/* ── Below the fold — lazy with Suspense fallbacks ───────────── */}

      {/* 4. Why get an ESA letter / key benefits. */}
      <Suspense fallback={<SectionFallback />}>
        <WhatIsESA />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <TrustFeatures />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <LandlordSupportSection />
      </Suspense>

      {/* Connector: Benefits → Trust */}
      <JourneyConnector to="Why PawTenant is trustworthy" number={3} total={6} bg="bg-white" />

      {/* 5. Why PawTenant is trustworthy. */}
      <Suspense fallback={<SectionFallback />}>
        <VerificationPillarsSection variant="compact" showCTA showPrivacyNote />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <WhyChooseSection />
      </Suspense>

      {/* Connector: Trust → Provider */}
      <JourneyConnector to="Meet your provider" number={4} total={6} bg="bg-white" />

      {/* 6. Provider / Licensed Professional section. */}
      <Suspense fallback={<SectionFallback />}>
        <DoctorsSection />
      </Suspense>

      {/* Connector: Provider → Sample letter */}
      <JourneyConnector to="See a sample letter" number={5} total={6} bg="bg-[#f8f7f4]" />

      {/* 7. Sample letter + verification visual — strong proof. */}
      <Suspense fallback={<SectionFallback />}>
        <LetterPreviewSection />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <TrustedLetters />
      </Suspense>

      {/* Connector: Sample → Pricing */}
      <JourneyConnector to="Simple pricing" number={6} total={6} bg="bg-white" />

      {/* 8. Cost / pricing clarity — affordability bridge then prices.
          2026-05-24 pre-LIVE reorder: TopStatesSection moved DOWN into the
          Reviews/States/FAQ cluster so Pricing visually appears earlier in
          the scroll (user feedback: pricing was too low). */}
      <Suspense fallback={<SectionFallback />}>
        <AffordabilityStrip />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <PricingSection />
      </Suspense>

      {/* 9. Reviews / customer trust / states / FAQs. */}
      <Suspense fallback={<SectionFallback />}>
        <TestimonialsSection />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <MediaGallery />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <TopStatesSection />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <FAQSection />
      </Suspense>

      {/* 10. Final CTA + contact + footer. */}
      <Suspense fallback={<SectionFallback />}>
        <CTASection />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <ContactSection />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <SharedFooter />
      </Suspense>

      {/* Mobile sticky CTA — appears only after the user scrolls past the
          hero (default 500px). Keeps the first viewport calm so the hero
          CTA is the only orange surface above the fold. */}
      <MobileStickyApplyCTA showAfterPx={500} />
    </main>
  );
}
