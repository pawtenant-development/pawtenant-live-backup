import { useState, useEffect, useRef } from "react";
import { useAttributionParams } from "@/hooks/useAttributionParams";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const applyCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { withAttribution } = useAttributionParams();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on scroll
  useEffect(() => {
    if (menuOpen) {
      const handleScroll = () => setMenuOpen(false);
      window.addEventListener("scroll", handleScroll, { passive: true });
      return () => window.removeEventListener("scroll", handleScroll);
    }
  }, [menuOpen]);

  const handleApplyEnter = () => {
    if (applyCloseTimer.current) clearTimeout(applyCloseTimer.current);
    setApplyOpen(true);
  };

  const handleApplyLeave = () => {
    applyCloseTimer.current = setTimeout(() => setApplyOpen(false), 120);
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
          scrolled ? "bg-white shadow-sm" : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2 cursor-pointer">
            <img
              src={
                scrolled
                  ? "/assets/brand/pawtenant-logo-black-02.png"
                  : "/assets/brand/pawtenant-logo-white-02.png"
              }
              alt="PawTenant"
              className={`h-14 w-auto object-contain transition-all ${!scrolled ? "brightness-0 invert" : ""}`}
            />
          </a>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            <a
              href="#states"
              className={`text-sm font-medium transition-colors hover:text-orange-500 ${
                scrolled ? "text-gray-700" : "text-white"
              }`}
            >
              ESA Letters by State
            </a>
            <a
              href="#faq"
              className={`text-sm font-medium transition-colors hover:text-orange-500 ${
                scrolled ? "text-gray-700" : "text-white"
              }`}
            >
              FAQ
            </a>
            <a
              href="#contact"
              className={`text-sm font-medium transition-colors hover:text-orange-500 ${
                scrolled ? "text-gray-700" : "text-white"
              }`}
            >
              Contact Us
            </a>
            <a
              href="tel:+14099655885"
              className={`text-sm font-medium flex items-center gap-1 transition-colors hover:text-orange-500 ${
                scrolled ? "text-gray-700" : "text-white"
              }`}
            >
              <i className="ri-phone-line"></i>
              (409) 965-5885
            </a>

            {/* Apply Now dropdown */}
            <div
              className="relative"
              onMouseEnter={handleApplyEnter}
              onMouseLeave={handleApplyLeave}
            >
              <button
                type="button"
                className="whitespace-nowrap flex items-center gap-1.5 px-5 py-2 bg-orange-500 text-white text-sm font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                Start Now
                <i className={`ri-arrow-down-s-line text-xs transition-transform duration-200 ${applyOpen ? "rotate-180" : ""}`}></i>
              </button>

              {applyOpen && (
                <div
                  className="absolute top-full right-0 mt-1 bg-white rounded-xl border border-gray-100 py-1.5 min-w-[220px] z-50"
                  onMouseEnter={handleApplyEnter}
                  onMouseLeave={handleApplyLeave}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-4 pt-1.5 pb-1">I&apos;m applying for...</p>
                  <a
                    href={withAttribution("/assessment")}
                    className="flex items-start gap-3 px-4 py-2.5 hover:bg-orange-50 transition-colors cursor-pointer group"
                    onClick={() => setApplyOpen(false)}
                  >
                    <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0 mt-0.5">
                      <i className="ri-heart-line text-orange-500 text-sm"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 group-hover:text-orange-600">ESA Letter</p>
                      <p className="text-xs text-gray-400 leading-tight">Emotional Support Animal — housing rights</p>
                    </div>
                  </a>
                  <a
                    href={withAttribution("/psd-assessment")}
                    className="flex items-start gap-3 px-4 py-2.5 hover:bg-amber-50 transition-colors cursor-pointer group"
                    onClick={() => setApplyOpen(false)}
                  >
                    <div className="w-8 h-8 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0 mt-0.5">
                      <i className="ri-service-line text-amber-600 text-sm"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 group-hover:text-amber-700">PSD Letter</p>
                      <p className="text-xs text-gray-400 leading-tight">Psychiatric Service Dog — full ADA access</p>
                    </div>
                  </a>
                  <div className="mx-4 my-1 border-t border-gray-100" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-4 pb-1">Features</p>
                  <a
                    href="/esa-letter-verification"
                    className="flex items-start gap-3 px-4 py-2.5 hover:bg-orange-50 transition-colors cursor-pointer group"
                    onClick={() => setApplyOpen(false)}
                  >
                    <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0 mt-0.5">
                      <i className="ri-shield-check-line text-orange-500 text-sm"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 group-hover:text-orange-600">Landlord Verification</p>
                      <p className="text-xs text-gray-400 leading-tight">QR code — landlords verify instantly</p>
                    </div>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden w-10 h-10 flex items-center justify-center cursor-pointer rounded-lg transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <i className={`text-2xl transition-all duration-200 ${scrolled ? "text-gray-800" : "text-white"} ${menuOpen ? "ri-close-line" : "ri-menu-line"}`}></i>
          </button>
        </div>

        {/* Mobile Menu — slide down panel */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
            menuOpen ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="bg-white border-t border-gray-100">
            {/* Nav links */}
            <div className="px-5 pt-4 pb-2 space-y-1">
              <a
                href="#states"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors cursor-pointer"
                onClick={() => setMenuOpen(false)}
              >
                <div className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded-lg flex-shrink-0">
                  <i className="ri-map-pin-line text-gray-500 text-sm"></i>
                </div>
                ESA Letters by State
              </a>
              <a
                href="#faq"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors cursor-pointer"
                onClick={() => setMenuOpen(false)}
              >
                <div className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded-lg flex-shrink-0">
                  <i className="ri-question-line text-gray-500 text-sm"></i>
                </div>
                FAQ
              </a>
              <a
                href="#contact"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors cursor-pointer"
                onClick={() => setMenuOpen(false)}
              >
                <div className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded-lg flex-shrink-0">
                  <i className="ri-mail-line text-gray-500 text-sm"></i>
                </div>
                Contact Us
              </a>
              <a
                href="tel:+14099655885"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded-lg flex-shrink-0">
                  <i className="ri-phone-line text-gray-500 text-sm"></i>
                </div>
                (409) 965-5885
              </a>
            </div>

            {/* Divider */}
            <div className="mx-5 my-2 border-t border-gray-100" />

            {/* CTA section */}
            <div className="px-5 pb-5 space-y-2.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-1">Apply For:</p>
              <a
                href={withAttribution("/assessment")}
                className="whitespace-nowrap flex items-center gap-3 px-4 py-3 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors cursor-pointer"
                onClick={() => setMenuOpen(false)}
              >
                <div className="w-7 h-7 flex items-center justify-center bg-white/20 rounded-lg flex-shrink-0">
                  <i className="ri-heart-line text-white text-sm"></i>
                </div>
                <div>
                  <p className="font-extrabold leading-tight">ESA Letter</p>
                  <p className="text-xs text-white/70 font-normal">Emotional Support Animal</p>
                </div>
              </a>
              <a
                href={withAttribution("/psd-assessment")}
                className="whitespace-nowrap flex items-center gap-3 px-4 py-3 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 transition-colors cursor-pointer"
                onClick={() => setMenuOpen(false)}
              >
                <div className="w-7 h-7 flex items-center justify-center bg-white/20 rounded-lg flex-shrink-0">
                  <i className="ri-service-line text-white text-sm"></i>
                </div>
                <div>
                  <p className="font-extrabold leading-tight">PSD Letter</p>
                  <p className="text-xs text-white/70 font-normal">Psychiatric Service Dog</p>
                </div>
              </a>
              <a
                href="/esa-letter-verification"
                className="whitespace-nowrap flex items-center gap-3 px-4 py-3 bg-[#FFF7ED] border border-orange-200 text-orange-700 text-sm font-bold rounded-xl hover:bg-orange-50 transition-colors cursor-pointer"
                onClick={() => setMenuOpen(false)}
              >
                <div className="w-7 h-7 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0">
                  <i className="ri-shield-check-line text-orange-500 text-sm"></i>
                </div>
                <div>
                  <p className="font-extrabold leading-tight">Landlord Verification</p>
                  <p className="text-xs text-orange-500/70 font-normal">QR code on every letter</p>
                </div>
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Backdrop overlay for mobile menu */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </>
  );
}
