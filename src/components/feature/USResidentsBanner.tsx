import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

const PORTAL_ROUTES = [
  "/admin",
  "/provider-portal",
  "/provider-login",
  "/my-orders",
  "/customer-login",
  "/assessment",
  "/psd-assessment",
  "/assessment-thank-you",
  "/psd-assessment-thank-you",
];

const AUTO_HIDE_DELAY_MS = 5000; // 5 seconds

export default function USResidentsBanner() {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem("us_banner_dismissed");
    if (!dismissed) {
      // Small delay so it doesn't flash immediately on load
      const t = setTimeout(() => setVisible(true), 1800);
      return () => clearTimeout(t);
    }
  }, []);

  // Auto-hide after 5 seconds
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setVisible(false);
    }, AUTO_HIDE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  const isPortal = PORTAL_ROUTES.some((route) => pathname.startsWith(route));
  if (isPortal || !visible) return null;

  const handleDismiss = () => {
    sessionStorage.setItem("us_banner_dismissed", "1");
    setVisible(false);
  };

  return (
    <div
      role="banner"
      aria-label="US residents only notice"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#1a1a1a] border-t-2 border-orange-500"
      style={{ animation: "slideUpBanner 0.4s ease-out" }}
    >
      <style>{`
        @keyframes slideUpBanner {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
        {/* Left — icon + message */}
        <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
          {/* US badge */}
          <div className="flex-shrink-0 flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-md px-2.5 py-1.5">
            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              <i className="ri-map-pin-2-line text-orange-400 text-sm"></i>
            </div>
            <span className="text-white text-xs font-bold tracking-wide whitespace-nowrap">USA ONLY</span>
          </div>

          {/* Text */}
          <div className="min-w-0">
            <p className="text-white text-sm font-medium leading-snug">
              PawTenant exclusively serves <strong className="text-orange-400">United States residents.</strong>
            </p>
            <p className="text-gray-400 text-xs leading-snug mt-0.5">
              ESA &amp; PSD letters are valid only under US federal law (Fair Housing Act &amp; ADA). Not available outside the US.
            </p>
          </div>
        </div>

        {/* Right — state selector hint + dismiss */}
        <div className="flex items-center gap-3 flex-shrink-0 self-end sm:self-auto">
          <div className="hidden md:flex items-center gap-2 text-xs text-gray-400">
            <i className="ri-map-pin-2-line text-orange-400 text-sm"></i>
            <span>All 50 US states covered</span>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss notice"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer whitespace-nowrap border border-gray-600 hover:border-gray-400 rounded px-2.5 py-1.5"
          >
            <i className="ri-close-line text-sm"></i>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
