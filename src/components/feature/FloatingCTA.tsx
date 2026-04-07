import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

const AUTO_HIDE_DELAY_MS = 5000; // 5 seconds

export default function FloatingCTA() {
  const { pathname } = useLocation();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [visible, setVisible] = useState(true);

  const isAssessmentPage = pathname.startsWith("/assessment") || pathname.startsWith("/psd-assessment");
  const isPortalPage = ["/admin", "/provider-portal", "/provider-login", "/my-orders", "/customer-login", "/reset-password", "/admin-login"].some((r) => pathname.startsWith(r));

  // Auto-hide after 5 seconds
  useEffect(() => {
    if (bannerDismissed) return;
    const timer = setTimeout(() => {
      setVisible(false);
    }, AUTO_HIDE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [bannerDismissed]);

  if (isPortalPage) return null;

  return (
    <>
      {/* ── Desktop: Left Vertical Crisis Line Banner (xl+) ────────── */}
      {!bannerDismissed && visible && (
        <div className="fixed left-0 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-row items-center group pointer-events-none animate-fade-in"
          style={{ animation: "slideInLeft 0.4s ease-out" }}
        >
          <style>{`
            @keyframes slideInLeft {
              from { transform: translateY(-50%) translateX(-100%); opacity: 0; }
              to { transform: translateY(-50%) translateX(0); opacity: 1; }
            }
          `}</style>
          <div className="relative bg-gradient-to-b from-teal-500 to-teal-600 rounded-r-2xl w-14 flex flex-col items-center gap-3 py-6 px-2 pointer-events-auto"
            style={{ boxShadow: "2px 0 12px rgba(20,184,166,0.25)" }}
          >
            <button
              onClick={() => { setBannerDismissed(true); setVisible(false); }}
              className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center bg-white rounded-full text-gray-500 hover:text-gray-800 cursor-pointer shadow-md"
              aria-label="Dismiss banner"
            >
              <i className="ri-close-line text-xs"></i>
            </button>
            <div className="w-8 h-8 flex items-center justify-center bg-white rounded-full">
              <i className="ri-heart-pulse-fill text-red-500 text-base"></i>
            </div>
            <div className="w-7 h-px bg-white/40"></div>
            {/* Larger, clearer text */}
            <p
              className="font-extrabold text-white select-none tracking-wide"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
            >
              988 Crisis
            </p>
            <div className="w-7 h-px bg-white/40"></div>
            <a
              href="tel:988"
              className="w-9 h-9 flex items-center justify-center bg-white rounded-xl cursor-pointer hover:bg-teal-50 transition-colors shadow-md"
              aria-label="Call 988 — Suicide &amp; Crisis Lifeline"
            >
              <span className="text-teal-600 font-extrabold" style={{ fontSize: "12px" }}>988</span>
            </a>
            <p
              className="font-bold text-white/90 select-none"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}
            >
              Help Line
            </p>
          </div>
          <div
            className="ml-2 bg-white border border-teal-100 rounded-xl px-4 py-3 w-56 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-200 translate-x-1 group-hover:translate-x-0"
            style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.10)" }}
          >
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 flex items-center justify-center mt-0.5 shrink-0">
                <i className="ri-heart-pulse-fill text-red-500 text-sm"></i>
              </div>
              <div>
                <p className="font-extrabold text-black text-xs leading-snug">988 Suicide &amp; Crisis Lifeline</p>
                <p className="text-gray-600 text-xs mt-1 leading-relaxed">Free, confidential, 24/7 support for people in distress.</p>
                <a
                  href="tel:988"
                  className="whitespace-nowrap inline-flex items-center gap-1 mt-2 px-3 py-1.5 bg-teal-500 text-white text-xs font-bold rounded-lg hover:bg-teal-600 transition-colors cursor-pointer"
                >
                  <i className="ri-phone-fill text-xs"></i>
                  Call 988 Now
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile: Compact Crisis Pill (below xl) ─────────────────────────── */}
      {!bannerDismissed && visible && !isAssessmentPage && (
        <div className="xl:hidden fixed bottom-36 left-3 z-40 flex items-center gap-0 animate-fade-in"
          style={{ animation: "slideInLeft 0.4s ease-out" }}
        >
          <a
            href="tel:988"
            className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white rounded-l-full pl-2.5 pr-3 py-2.5 transition-colors cursor-pointer shadow-lg"
            aria-label="Call 988 Crisis Lifeline"
          >
            <div className="w-5 h-5 flex items-center justify-center">
              <i className="ri-heart-pulse-fill text-red-200 text-sm"></i>
            </div>
            <span className="text-xs font-extrabold">988 Crisis Line</span>
          </a>
          <button
            onClick={() => { setBannerDismissed(true); setVisible(false); }}
            className="bg-teal-600 hover:bg-teal-700 text-white rounded-r-full px-2 py-2.5 h-full flex items-center cursor-pointer transition-colors"
            aria-label="Dismiss"
          >
            <i className="ri-close-line text-xs"></i>
          </button>
        </div>
      )}
    </>
  );
}
