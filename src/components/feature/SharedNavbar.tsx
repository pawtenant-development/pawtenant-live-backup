import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";

interface DropdownItem {
  label: string;
  href: string;
  desc?: string;
}

interface NavGroup {
  label: string;
  megaMenu?: boolean;
  columns?: { title: string; items: DropdownItem[] }[];
  items?: DropdownItem[];
  href?: string;
}

const navGroups: NavGroup[] = [
  {
    label: "Emotional Support Animals",
    megaMenu: true,
    columns: [
      {
        title: "ESA Resources",
        items: [
          { label: "What Is an ESA?", href: "/", desc: "Learn about emotional support animals" },
          { label: "How to Get an ESA Letter", href: "/how-to-get-esa-letter", desc: "Step-by-step guide" },
          { label: "Housing Rights & Your ESA", href: "/housing-rights-esa", desc: "Fair Housing Act coverage" },
          { label: "ESA Letter Cost", href: "/esa-letter-cost", desc: "Transparent pricing info" },
          { label: "No Risk Guarantee", href: "/no-risk-guarantee", desc: "100% money-back policy" },
          { label: "Renew ESA Letter", href: "/renew-esa-letter", desc: "Renew an expiring or expired letter" },
        ],
      },
      {
        title: "Find Your State",
        items: [
          { label: "Explore ESA Letters in All States", href: "/explore-esa-letters-all-states" },
          { label: "California ESA Letters", href: "/esa-letter-california" },
          { label: "Texas ESA Letters", href: "/esa-letter-texas" },
          { label: "Florida ESA Letters", href: "/esa-letter-florida" },
          { label: "New York ESA Letters", href: "/esa-letter-new-york" },
          { label: "Arizona ESA Letters", href: "/esa-letter-arizona" },
        ],
      },
    ],
  },
  {
    label: "Service Dogs",
    items: [
      { label: "All About Service Dogs", href: "/all-about-service-dogs", desc: "Service dogs vs ESAs" },
      { label: "How to Get a PSD Letter", href: "/how-to-get-psd-letter", desc: "Psychiatric service dog letter guide" },
      { label: "Service Animal vs ESA", href: "/service-animal-vs-esa", desc: "Know the difference" },
    ],
  },
  {
    label: "Resources",
    megaMenu: true,
    columns: [
      {
        title: "Pet Policies",
        items: [
          { label: "College Pet Policy", href: "/college-pet-policy", desc: "ESA policies for 12+ top universities" },
          { label: "Airline Pet Policy", href: "/airline-pet-policy", desc: "Flying with your ESA in 2026" },
          { label: "Service Animal vs ESA", href: "/service-animal-vs-esa", desc: "Understand the differences" },
        ],
      },
      {
        title: "Learn",
        items: [
          { label: "Blog & Guides", href: "/blog", desc: "Expert articles & ESA resources" },
          { label: "FAQs", href: "/faqs", desc: "All your ESA questions answered" },
          { label: "Sitemap", href: "/sitemap", desc: "Browse all pages" },
        ],
      },
    ],
  },
  {
    label: "About",
    items: [
      { label: "About Us", href: "/about-us", desc: "Our mission & team" },
      { label: "FAQs", href: "/faqs", desc: "Common questions answered" },
      { label: "Contact Us", href: "/contact-us", desc: "Get in touch with us" },
      { label: "No Risk Guarantee", href: "/no-risk-guarantee", desc: "Our money-back promise" },
    ],
  },
];

export default function SharedNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const applyRef = useRef<HTMLDivElement>(null);
  const applyCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const isHome = location.pathname === "/";

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setActiveDropdown(null);
  }, [location.pathname]);

  const handleMouseEnter = (label: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setActiveDropdown(label);
  };

  const handleMouseLeave = () => {
    closeTimer.current = setTimeout(() => setActiveDropdown(null), 120);
  };

  const handleApplyEnter = () => {
    if (applyCloseTimer.current) clearTimeout(applyCloseTimer.current);
    setApplyOpen(true);
  };

  const handleApplyLeave = () => {
    applyCloseTimer.current = setTimeout(() => setApplyOpen(false), 120);
  };

  const textColor = scrolled || !isHome ? "text-gray-700" : "text-white";
  const hoverColor = "hover:text-orange-500";

  return (
    <nav
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
        scrolled || !isHome ? "bg-white shadow-sm" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between" ref={dropdownRef}>
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 cursor-pointer flex-shrink-0">
          <img
            src={
              scrolled || !isHome
                ? "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
                : "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/d2641cf9cd0cc381736d2232d3da5f7c.png"
            }
            alt="PawTenant"
            className={`h-14 w-auto object-contain transition-all ${!scrolled && isHome ? "brightness-0 invert" : ""}`}
          />
        </Link>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-1">
          {navGroups.map((group) => (
            <div
              key={group.label}
              className="relative"
              onMouseEnter={() => handleMouseEnter(group.label)}
              onMouseLeave={handleMouseLeave}
            >
              <button
                className={`flex items-center gap-1 px-3 py-2 text-sm font-medium transition-colors ${textColor} ${hoverColor} whitespace-nowrap cursor-pointer rounded-md hover:bg-black/5`}
              >
                {group.label}
                <i className={`ri-arrow-down-s-line text-xs transition-transform duration-200 ${activeDropdown === group.label ? "rotate-180" : ""}`}></i>
              </button>

              {/* Mega Menu */}
              {group.megaMenu && activeDropdown === group.label && (
                <div
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 p-6 min-w-[600px]"
                  onMouseEnter={() => handleMouseEnter(group.label)}
                  onMouseLeave={handleMouseLeave}
                >
                  <div className="grid grid-cols-2 gap-8">
                    {group.columns?.map((col) => (
                      <div key={col.title}>
                        <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">{col.title}</p>
                        <ul className="space-y-1">
                          {col.items.map((item) => (
                            <li key={item.href}>
                              <Link
                                to={item.href}
                                className="group flex flex-col px-3 py-2 rounded-lg hover:bg-orange-50 transition-colors cursor-pointer"
                              >
                                <span className="text-sm font-medium text-gray-800 group-hover:text-orange-600">{item.label}</span>
                                {item.desc && <span className="text-xs text-gray-400 mt-0.5">{item.desc}</span>}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Regular Dropdown */}
              {!group.megaMenu && activeDropdown === group.label && group.items && (
                <div
                  className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-2 min-w-[220px]"
                  onMouseEnter={() => handleMouseEnter(group.label)}
                  onMouseLeave={handleMouseLeave}
                >
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      to={item.href}
                      className="group flex flex-col px-4 py-2.5 hover:bg-orange-50 transition-colors cursor-pointer"
                    >
                      <span className="text-sm font-medium text-gray-800 group-hover:text-orange-600">{item.label}</span>
                      {item.desc && <span className="text-xs text-gray-400">{item.desc}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="w-px h-5 bg-gray-300/50 mx-2"></div>

          <a
            href="tel:+14099655885"
            className={`text-sm font-medium flex items-center gap-1 transition-colors ${hoverColor} ${textColor} whitespace-nowrap px-2`}
          >
            <i className="ri-phone-line text-xs"></i>
            (409) 965-5885
          </a>

          <Link
            to="/join-our-network"
            className={`whitespace-nowrap text-sm font-medium transition-colors px-3 py-2 rounded-md hover:bg-black/5 ${textColor} ${hoverColor}`}
          >
            For Therapists
          </Link>

          {/* Apply Now with ESA/PSD dropdown */}
          <div
            ref={applyRef}
            className="relative ml-1"
            onMouseEnter={handleApplyEnter}
            onMouseLeave={handleApplyLeave}
          >
            <button
              type="button"
              className="whitespace-nowrap flex items-center gap-1.5 px-5 py-2 bg-orange-500 text-white text-sm font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
            >
              Apply Now
              <i className={`ri-arrow-down-s-line text-xs transition-transform duration-200 ${applyOpen ? "rotate-180" : ""}`}></i>
            </button>

            {applyOpen && (
              <div
                className="absolute top-full right-0 mt-1 bg-white rounded-xl border border-gray-100 py-1.5 min-w-[220px] z-50"
                onMouseEnter={handleApplyEnter}
                onMouseLeave={handleApplyLeave}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-4 pt-1.5 pb-1">I&apos;m applying for...</p>
                <Link
                  to="/assessment"
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
                </Link>
                <Link
                  to="/psd-assessment"
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
                </Link>
              </div>
            )}
          </div>

          <Link to="/customer-login" className="whitespace-nowrap flex items-center gap-1.5 text-sm text-gray-600 hover:text-orange-500 transition-colors cursor-pointer">
            <div className="w-5 h-5 flex items-center justify-center">
              <i className="ri-user-line text-orange-400"></i>
            </div>
            My Orders
          </Link>
        </div>

        {/* Mobile Hamburger */}
        <button
          className="lg:hidden cursor-pointer"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <i className={`text-2xl ${scrolled || !isHome ? "text-gray-800" : "text-white"} ${menuOpen ? "ri-close-line" : "ri-menu-line"}`}></i>
        </button>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="lg:hidden bg-white border-t border-gray-100 px-6 py-4 flex flex-col gap-2 max-h-[80vh] overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              <button
                className="w-full flex items-center justify-between py-2.5 text-sm font-semibold text-gray-800 cursor-pointer"
                onClick={() => setMobileExpanded(mobileExpanded === group.label ? null : group.label)}
              >
                {group.label}
                <i className={`ri-arrow-down-s-line transition-transform ${mobileExpanded === group.label ? "rotate-180" : ""}`}></i>
              </button>
              {mobileExpanded === group.label && (
                <div className="pl-3 pb-2 flex flex-col gap-1">
                  {group.megaMenu
                    ? group.columns?.flatMap((col) => col.items).map((item) => (
                        <Link
                          key={item.href}
                          to={item.href}
                          className="py-1.5 text-sm text-gray-600 hover:text-orange-500"
                          onClick={() => setMenuOpen(false)}
                        >
                          {item.label}
                        </Link>
                      ))
                    : group.items?.map((item) => (
                        <Link
                          key={item.href}
                          to={item.href}
                          className="py-1.5 text-sm text-gray-600 hover:text-orange-500"
                          onClick={() => setMenuOpen(false)}
                        >
                          {item.label}
                        </Link>
                      ))}
                </div>
              )}
            </div>
          ))}
          <div className="border-t border-gray-100 pt-3 mt-1 flex flex-col gap-3">
            <a href="tel:+14099655885" className="text-sm font-medium text-gray-700 hover:text-orange-500 flex items-center gap-1">
              <i className="ri-phone-line"></i> (409) 965-5885
            </a>
            <Link
              to="/join-our-network"
              className="whitespace-nowrap text-sm font-medium text-gray-700 hover:text-orange-500"
              onClick={() => setMenuOpen(false)}
            >
              For Therapists
            </Link>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Apply For:</p>
            <Link
              to="/assessment"
              className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-md text-center"
              onClick={() => setMenuOpen(false)}
            >
              <i className="ri-heart-line"></i>ESA Letter
            </Link>
            <Link
              to="/psd-assessment"
              className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-md text-center"
              onClick={() => setMenuOpen(false)}
            >
              <i className="ri-service-line"></i>PSD Letter
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
