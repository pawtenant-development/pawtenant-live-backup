import { Link, useLocation } from "react-router-dom";
import SharedNavbar from "../components/feature/SharedNavbar";
import SharedFooter from "../components/feature/SharedFooter";

const SUGGESTED_LINKS = [
  { to: "/", icon: "ri-home-4-line", label: "Homepage" },
  { to: "/assessment", icon: "ri-file-text-line", label: "Get ESA Letter" },
  { to: "/how-to-get-esa-letter", icon: "ri-map-pin-line", label: "How to Get an ESA Letter" },
  { to: "/housing-rights-esa", icon: "ri-home-heart-line", label: "Housing Rights" },
  { to: "/faqs", icon: "ri-question-answer-line", label: "FAQs" },
  { to: "/contact-us", icon: "ri-customer-service-line", label: "Contact Us" },
];

export default function NotFound() {
  const location = useLocation();

  return (
    <main className="min-h-screen flex flex-col bg-[#fdf8f3]">
      <SharedNavbar />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        {/* Big decorative 404 */}
        <div className="relative mb-6">
          <p className="text-[10rem] md:text-[14rem] font-black text-orange-100 leading-none select-none pointer-events-none">
            404
          </p>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-16 h-16 flex items-center justify-center bg-orange-500 rounded-2xl mb-4">
              <i className="ri-search-line text-white text-3xl"></i>
            </div>
          </div>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
          Page Not Found
        </h1>
        <p className="text-gray-500 text-sm md:text-base max-w-md mb-2">
          The page <code className="bg-orange-50 text-orange-600 px-2 py-0.5 rounded font-mono text-xs">{location.pathname}</code> doesn&apos;t exist yet.
        </p>
        <p className="text-gray-400 text-sm mb-10">
          It may have moved, been renamed, or not been built yet.
        </p>

        {/* Suggested links */}
        <div className="w-full max-w-2xl mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Try one of these pages</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SUGGESTED_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-orange-300 hover:bg-orange-50 transition-colors cursor-pointer group"
              >
                <div className="w-8 h-8 flex items-center justify-center bg-orange-50 rounded-lg group-hover:bg-orange-100 transition-colors flex-shrink-0">
                  <i className={`${link.icon} text-orange-500 text-sm`}></i>
                </div>
                <span className="text-sm font-semibold text-gray-700 group-hover:text-orange-600 transition-colors">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Primary CTA */}
        <Link
          to="/"
          className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
        >
          <i className="ri-home-4-line"></i>
          Back to Homepage
        </Link>
      </div>

      <SharedFooter />
    </main>
  );
}
