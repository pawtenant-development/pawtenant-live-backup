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
import { Link } from "react-router-dom";

export default function Home() {
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
      <TopStatesSection />
      <div className="hidden md:block"><DoctorsSection /></div>
      <TestimonialsSection />
      <MediaGallery />
      <FAQSection />
      <CTASection />
      <ContactSection />
      <SharedFooter />

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom,12px))]">
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
