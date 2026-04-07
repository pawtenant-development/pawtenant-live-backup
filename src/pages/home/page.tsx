import { useEffect } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import DiscountPopup from "../../components/feature/DiscountPopup";
import HeroSection from "./components/HeroSection";
import MediaTrustBar from "./components/MediaTrustBar";
import TrustFeatures from "./components/TrustFeatures";
import StepsSection from "./components/StepsSection";
import WhatIsESA from "./components/WhatIsESA";
import TrustedLetters from "./components/TrustedLetters";
import ESALetterSection from "./components/ESALetterSection";
import PricingSection from "./components/PricingSection";
import WhyChooseSection from "./components/WhyChooseSection";
import DoctorsSection from "./components/DoctorsSection";
import TestimonialsSection from "./components/TestimonialsSection";
import FAQSection from "./components/FAQSection";
import CTASection from "./components/CTASection";
import ContactSection from "./components/ContactSection";
import TopStatesSection from "./components/TopStatesSection";
import MediaGallery from "./components/MediaGallery";
import VerificationTrustCard from "../../components/feature/VerificationTrustCard";
import { Link } from "react-router-dom";

const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.pawtenant.com/#organization",
      "name": "PawTenant",
      "alternateName": "PawTenant ESA Letters",
      "url": "https://www.pawtenant.com",
      "logo": {
        "@type": "ImageObject",
        "@id": "https://www.pawtenant.com/#logo",
        "url": "https://www.pawtenant.com/logo.png",
        "contentUrl": "https://www.pawtenant.com/logo.png",
        "width": 400,
        "height": 80,
        "caption": "PawTenant"
      },
      "image": { "@id": "https://www.pawtenant.com/#logo" },
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
          "url": "https://www.pawtenant.com/contact-us",
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
              "url": "https://www.pawtenant.com/assessment"
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
              "url": "https://www.pawtenant.com/assessment"
            },
            "price": "149.00",
            "priceCurrency": "USD"
          }
        ]
      }
    },
    {
      "@type": "WebSite",
      "@id": "https://www.pawtenant.com/#website",
      "url": "https://www.pawtenant.com",
      "name": "PawTenant",
      "publisher": { "@id": "https://www.pawtenant.com/#organization" },
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://www.pawtenant.com/blog?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    }
  ]
};

export default function Home() {
  useEffect(() => {
    const existingScript = document.getElementById("org-schema");
    if (!existingScript) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = "org-schema";
      script.text = JSON.stringify(ORGANIZATION_SCHEMA);
      document.head.appendChild(script);
    }
    return () => {
      const s = document.getElementById("org-schema");
      if (s) s.remove();
    };
  }, []);

  return (
    <main>
      <DiscountPopup delayMs={8000} />
      <SharedNavbar />
      <HeroSection />
      <MediaTrustBar />
      <TrustFeatures />
      <StepsSection />
      <WhatIsESA />
      <TrustedLetters />
      <ESALetterSection />
      <PricingSection />
      <WhyChooseSection />
      <VerificationTrustCard variant="section" />
      <TopStatesSection />
      <div className="hidden md:block"><DoctorsSection /></div>
      <TestimonialsSection />
      <MediaGallery />
      <FAQSection />
      <CTASection />
      <ContactSection />
      <SharedFooter />

      {/* Mobile sticky CTA — z-[9999] ensures it sits above chat bubbles, floating buttons, etc. */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-[9999] bg-white border-t border-gray-200 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom,16px))]">
        <Link
          to="/assessment"
          className="whitespace-nowrap flex items-center justify-center gap-2 w-full py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
        >
          <i className="ri-file-text-line"></i>
          Get Your ESA Letter — From $99
        </Link>
      </div>
    </main>
  );
}
