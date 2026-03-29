import { useState } from "react";
import { Link } from "react-router-dom";

const footerCols = [
  {
    title: "ESA Services",
    links: [
      { label: "How to Get an ESA Letter", href: "/how-to-get-esa-letter" },
      { label: "Renew Your ESA Letter", href: "/renew-esa-letter" },
      { label: "ESA Letter Cost", href: "/esa-letter-cost" },
      { label: "Housing Rights & Your ESA", href: "/housing-rights-esa" },
      { label: "All About Service Dogs", href: "/all-about-service-dogs" },
      { label: "How to Get a PSD Letter", href: "/how-to-get-psd-letter" },
      { label: "No Risk Guarantee", href: "/no-risk-guarantee" },
    ],
  },
  {
    title: "Discover",
    links: [
      { label: "ESA & PSD Resource Center", href: "/resource-center" },
      { label: "Explore ESA by State", href: "/explore-esa-letters-all-states" },
      { label: "Airline Pet Policy", href: "/airline-pet-policy" },
      { label: "College Pet Policy", href: "/college-pet-policy" },
      { label: "Service Animal vs ESA", href: "/service-animal-vs-esa" },
      { label: "Blog", href: "/blog" },
      { label: "Sitemap", href: "/sitemap" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", href: "/about-us" },
      { label: "Join Our Network", href: "/join-our-network" },
      { label: "FAQs", href: "/faqs" },
      { label: "Contact Us", href: "/contact-us" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms of Use", href: "/terms-of-use" },
    ],
  },
];

const socialLinks = [
  { icon: "ri-facebook-fill", href: "https://www.facebook.com/PawTenant/", label: "Facebook" },
  { icon: "ri-instagram-line", href: "https://www.instagram.com/pawtenant/", label: "Instagram" },
  { icon: "ri-youtube-line", href: "#", label: "YouTube" },
  { icon: "ri-pinterest-line", href: "#", label: "Pinterest" },
  { icon: "ri-twitter-x-line", href: "#", label: "X / Twitter" },
];

export default function SharedFooter() {
  const [openSection, setOpenSection] = useState<string | null>(null);

  const toggleSection = (title: string) => {
    setOpenSection((prev) => (prev === title ? null : title));
  };

  return (
    <footer className="bg-[#f0ece4]">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-5 pt-12 pb-8 lg:pt-16 lg:pb-10">
        {/* Brand — always full width on mobile, then in grid on desktop */}
        <div className="mb-8 lg:hidden">
          <Link to="/" className="inline-block mb-4 cursor-pointer">
            <img
              src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
              alt="PawTenant Logo"
              className="h-12 w-auto object-contain object-left"
            />
          </Link>
          <p className="text-gray-600 text-sm leading-relaxed max-w-xs">
            Your trusted partner in fast, legitimate ESA Letter consultations — empowering lives through emotional support animals.
          </p>
        </div>

        {/* Desktop Grid */}
        <div className="hidden lg:grid grid-cols-4 gap-10">
          {/* Brand Col */}
          <div>
            <Link to="/" className="inline-block mb-4 cursor-pointer">
              <img
                src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
                alt="PawTenant Logo"
                className="h-14 w-auto object-contain object-left"
              />
            </Link>
            <p className="text-gray-600 text-sm leading-relaxed max-w-[220px]">
              Your trusted partner in providing fast, legitimate Emotional Support Animal Letter consultations, empowering lives through the transformative power of emotional support animals.
            </p>
          </div>
          {footerCols.map((col) => (
            <div key={col.title}>
              <h4 className="text-gray-800 font-bold text-sm mb-5">{col.title}</h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-sm text-gray-600 hover:text-orange-500 transition-colors cursor-pointer"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Mobile Accordion */}
        <div className="lg:hidden divide-y divide-gray-300/40">
          {footerCols.map((col) => (
            <div key={col.title}>
              <button
                className="w-full flex items-center justify-between py-3.5 text-sm font-bold text-gray-800 cursor-pointer"
                onClick={() => toggleSection(col.title)}
              >
                {col.title}
                <i
                  className={`ri-arrow-down-s-line text-gray-500 transition-transform ${
                    openSection === col.title ? "rotate-180" : ""
                  }`}
                ></i>
              </button>
              {openSection === col.title && (
                <ul className="pb-4 space-y-2.5 pl-1">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.href}
                        className="text-sm text-gray-600 hover:text-orange-500 transition-colors cursor-pointer"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Social + Contact Bar */}
      <div className="border-t border-gray-300/60">
        <div className="max-w-7xl mx-auto px-5 py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Social Icons */}
          <div className="flex items-center gap-2.5">
            {socialLinks.map((s) => (
              <a
                key={s.label}
                href={s.href}
                rel="nofollow"
                aria-label={s.label}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-600 hover:text-orange-500 hover:border-orange-300 transition-colors cursor-pointer"
              >
                <i className={`${s.icon} text-base`}></i>
              </a>
            ))}
          </div>

          {/* Contact + Badge */}
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="tel:+14099655885"
              className="text-sm text-gray-700 hover:text-orange-500 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <i className="ri-phone-line text-orange-500 text-sm"></i>
              (409) 965-5885
            </a>
            <div className="w-px h-4 bg-gray-300 hidden sm:block"></div>
            <a
              href="mailto:hello@pawtenant.com"
              className="text-sm text-gray-700 hover:text-orange-500 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <i className="ri-mail-line text-orange-500 text-sm"></i>
              hello@pawtenant.com
            </a>
            <div className="w-px h-4 bg-gray-300 hidden sm:block"></div>
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <i className="ri-time-line text-orange-500 text-sm"></i>
              <span>Mon–Fri 7am–6pm CT &middot; Sat 9am–4pm CT</span>
            </div>
            <div className="w-px h-4 bg-gray-300 hidden sm:block"></div>
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
              <div className="w-4 h-4 flex items-center justify-center">
                <i className="ri-shield-check-fill text-orange-500 text-sm"></i>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-700 leading-none">HIPAA</p>
                <p className="text-xs text-gray-400 leading-none">COMPLIANT</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright Bar */}
      <div className="border-t border-gray-300/60">
        <div className="max-w-7xl mx-auto px-5 py-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <span className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} PawTenant. All rights reserved.
          </span>
          <span className="text-gray-300 hidden sm:inline">|</span>
          <Link to="/privacy-policy" className="text-xs text-gray-500 hover:text-orange-500 transition-colors cursor-pointer">
            Privacy Policy
          </Link>
          <span className="text-gray-300 hidden sm:inline">|</span>
          <Link to="/terms-of-use" className="text-xs text-gray-500 hover:text-orange-500 transition-colors cursor-pointer">
            Terms &amp; Conditions
          </Link>
          <span className="text-gray-300 hidden sm:inline">|</span>
          <Link to="/sitemap" className="text-xs text-gray-500 hover:text-orange-500 transition-colors cursor-pointer">
            Sitemap
          </Link>
          <span className="text-gray-300 hidden sm:inline">|</span>
          {/* US-only permanent notice */}
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <span role="img" aria-label="US flag">🇺🇸</span>
            <span>Serving US residents only &mdash; All 50 states</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
