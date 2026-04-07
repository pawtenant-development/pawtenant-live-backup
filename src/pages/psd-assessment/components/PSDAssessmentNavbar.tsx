import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const quickLinks = [
  { label: "How to Get a PSD Letter", href: "/how-to-get-psd-letter", icon: "ri-question-line" },
  { label: "Service Animal vs ESA", href: "/service-animal-vs-esa", icon: "ri-information-line" },
  { label: "No Risk Guarantee", href: "/no-risk-guarantee", icon: "ri-shield-check-line" },
  { label: "FAQs", href: "/faqs", icon: "ri-chat-3-line" },
  { label: "My Orders", href: "/customer-login", icon: "ri-user-line" },
  { label: "Contact Us", href: "/contact-us", icon: "ri-customer-service-2-line" },
];

export default function PSDAssessmentNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <>
      <nav className="bg-white border-b border-gray-100 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-50">
        <Link to="/" className="cursor-pointer flex-shrink-0">
          <img
            src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
            alt="PawTenant"
            className="h-9 sm:h-10 w-auto object-contain"
          />
        </Link>

        {/* Desktop */}
        <div className="hidden sm:flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs font-bold text-amber-700">
            <i className="ri-shield-star-line"></i>Psychiatric Service Dog Letter
          </span>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <i className="ri-lock-2-line text-green-500"></i>
            <span>HIPAA Secured</span>
          </div>
        </div>

        {/* Mobile */}
        <div className="flex sm:hidden items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-bold text-amber-700">
            <i className="ri-shield-star-line text-xs"></i>PSD
          </span>
          <button
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <i className={`text-xl ${menuOpen ? "ri-close-line" : "ri-menu-line"}`}></i>
          </button>
        </div>
      </nav>

      {/* Backdrop */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 sm:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-in panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[80vw] max-w-[300px] bg-white z-50 sm:hidden flex flex-col transition-transform duration-300 ease-in-out ${
          menuOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ boxShadow: menuOpen ? "-4px 0 24px rgba(0,0,0,0.12)" : "none" }}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <img
            src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
            alt="PawTenant"
            className="h-8 w-auto object-contain"
          />
          <button
            onClick={() => setMenuOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 mb-2">Quick Links</p>
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors cursor-pointer"
              onClick={() => setMenuOpen(false)}
            >
              <div className="w-8 h-8 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0">
                <i className={`${link.icon} text-amber-600 text-sm`}></i>
              </div>
              {link.label}
            </Link>
          ))}
          <div className="border-t border-gray-100 my-3"></div>
          <a
            href="tel:+14099655885"
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0">
              <i className="ri-phone-line text-amber-600 text-sm"></i>
            </div>
            <div>
              <p className="font-semibold text-sm">Call Us</p>
              <p className="text-xs text-gray-400">(409) 965-5885</p>
            </div>
          </a>
        </div>

        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-100 bg-amber-50">
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: "ri-shield-check-line", label: "HIPAA", color: "text-amber-600" },
              { icon: "ri-award-line", label: "ADA", color: "text-amber-600" },
              { icon: "ri-refund-2-line", label: "Guaranteed", color: "text-amber-600" },
            ].map((b) => (
              <div key={b.label} className="flex flex-col items-center gap-1 text-center">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className={`${b.icon} ${b.color} text-base`}></i>
                </div>
                <span className="text-[10px] font-bold text-gray-600">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
