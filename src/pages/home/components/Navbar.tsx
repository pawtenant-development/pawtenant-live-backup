import { useState, useEffect, useRef } from "react";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const applyCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleApplyEnter = () => {
    if (applyCloseTimer.current) clearTimeout(applyCloseTimer.current);
    setApplyOpen(true);
  };

  const handleApplyLeave = () => {
    applyCloseTimer.current = setTimeout(() => setApplyOpen(false), 120);
  };

  return (
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
                ? "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
                : "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/d2641cf9cd0cc381736d2232d3da5f7c.png"
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
                  href="/assessment"
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
                  href="/psd-assessment"
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
              </div>
            )}
          </div>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden cursor-pointer"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <i className={`text-2xl ${scrolled ? "text-gray-800" : "text-white"} ${menuOpen ? "ri-close-line" : "ri-menu-line"}`}></i>
        </button>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 flex flex-col gap-4">
          <a href="#states" className="text-sm font-medium text-gray-700 hover:text-orange-500" onClick={() => setMenuOpen(false)}>ESA Letters by State</a>
          <a href="#faq" className="text-sm font-medium text-gray-700 hover:text-orange-500" onClick={() => setMenuOpen(false)}>FAQ</a>
          <a href="#contact" className="text-sm font-medium text-gray-700 hover:text-orange-500" onClick={() => setMenuOpen(false)}>Contact Us</a>
          <a href="tel:+14099655885" className="text-sm font-medium text-gray-700 hover:text-orange-500 flex items-center gap-1">
            <i className="ri-phone-line"></i>(409) 965-5885
          </a>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Apply For:</p>
          <a
            href="/assessment"
            className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-md"
            onClick={() => setMenuOpen(false)}
          >
            <i className="ri-heart-line"></i>ESA Letter
          </a>
          <a
            href="/psd-assessment"
            className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-md"
            onClick={() => setMenuOpen(false)}
          >
            <i className="ri-service-line"></i>PSD Letter
          </a>
        </div>
      )}
    </nav>
  );
}
