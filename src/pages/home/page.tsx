import { lazy, Suspense, useEffect } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import HeroSection from "./components/HeroSection";
import ReassuranceStrip from "./components/ReassuranceStrip";
import MediaTrustBar from "./components/MediaTrustBar";
import TrustFeatures from "./components/TrustFeatures";
import StepsSection from "./components/StepsSection";
import AffordabilityStrip from "./components/AffordabilityStrip";
import MobileStickyApplyCTA from "../../components/feature/MobileStickyApplyCTA";

/*
 * Performance note (2026-05-18):
 *
 * The homepage previously imported 18+ section components eagerly, so the
 * entire below-fold tree was parsed, evaluated, and committed before the
 * browser could finish the LCP paint. Mobile PageSpeed sat ~48.
 *
 * Above-the-fold sections (Navbar → Hero → MediaTrustBar → TrustFeatures
 * → StepsSection) are still imported eagerly so the first paint matches
 * the previous render and no Suspense fallbacks flash near the hero.
 *
 * Everything below the fold is now React.lazy + Suspense. The Suspense
 * fallback is a fixed-height placeholder so visible layout still settles
 * without CLS while the chunk loads. JS execution for the lower page is
 * pushed off the critical path, freeing the main thread for LCP + TBT.
 *
 * SEO + visual surface preserved:
 *   - All sections still render (in the same order) once their chunks
 *     resolve. The DOM and section IDs are unchanged.
 *   - Title / canonical / meta / schema injection still runs on mount.
 *   - H1 / H2 wording untouched.
 *   - Schema injection is now nudged into requestIdleCallback so the
 *     <head> mutation happens after the LCP paint.
 */
const WhatIsESA = lazy(() => import("./components/WhatIsESA"));
const TrustedLetters = lazy(() => import("./components/TrustedLetters"));
const LetterPreviewSection = lazy(
  () => import("./components/LetterPreviewSection"),
);
const LandlordSupportSection = lazy(
  () => import("./components/LandlordSupportSection"),
);
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
      <SharedNavbar />
      <HeroSection />
      <ReassuranceStrip />
      <MediaTrustBar />
      <TrustFeatures />
      <StepsSection />
      <AffordabilityStrip />

      {/* ── Below the fold — lazy with Suspense fallbacks ───────────── */}
      <Suspense fallback={<SectionFallback />}>
        <DoctorsSection />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <WhatIsESA />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <TrustedLetters />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <LetterPreviewSection />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <LandlordSupportSection />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <PricingSection />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <WhyChooseSection />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <VerificationPillarsSection variant="compact" showCTA showPrivacyNote />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <TopStatesSection />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <TestimonialsSection />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <MediaGallery />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <FAQSection />
      </Suspense>
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
