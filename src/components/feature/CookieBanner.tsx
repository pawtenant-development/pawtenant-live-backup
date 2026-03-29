import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

type ConsentState = "accepted" | "necessary" | null;

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cookie_consent");
    if (!stored) {
      // Small delay so it doesn't flash instantly on page load
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const saveConsent = (choice: ConsentState) => {
    if (!choice) return;
    localStorage.setItem("cookie_consent", choice);
    localStorage.setItem("cookie_consent_date", new Date().toISOString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] px-4 pb-4 pointer-events-none">
      <div
        className="max-w-4xl mx-auto bg-white rounded-2xl border border-gray-200 pointer-events-auto"
        style={{ boxShadow: "0 -2px 24px rgba(0,0,0,0.10)" }}
      >
        <div className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            {/* Icon */}
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-orange-50 flex-shrink-0">
              <i className="ri-shield-check-line text-orange-500 text-lg"></i>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-gray-900 mb-1">
                We use cookies &amp; tracking
              </h3>
              <p className="text-gray-500 text-xs leading-relaxed">
                We use session storage and analytics to understand how visitors use our site (UTM source, referral data, landing pages) and to improve our services. We do{" "}
                <strong className="text-gray-700">not</strong> sell your personal data.{" "}
                {!showDetails && (
                  <button
                    type="button"
                    onClick={() => setShowDetails(true)}
                    className="text-orange-500 hover:underline cursor-pointer font-medium"
                  >
                    Learn more
                  </button>
                )}
              </p>

              {showDetails && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    {
                      icon: "ri-checkbox-circle-fill",
                      color: "text-green-500",
                      title: "Strictly Necessary",
                      desc: "Session data, page routing, form submissions. Always active.",
                      always: true,
                    },
                    {
                      icon: "ri-bar-chart-line",
                      color: "text-orange-400",
                      title: "Analytics",
                      desc: "UTM parameters, referrer, landing page — helps us improve the site.",
                      always: false,
                    },
                    {
                      icon: "ri-user-heart-line",
                      color: "text-orange-400",
                      title: "Preferences",
                      desc: "Remembers your choices and settings during your visit.",
                      always: false,
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="bg-gray-50 rounded-xl p-3 border border-gray-100"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-4 h-4 flex items-center justify-center">
                          <i className={`${item.icon} ${item.color} text-sm`}></i>
                        </div>
                        <span className="text-xs font-bold text-gray-800">{item.title}</span>
                        {item.always && (
                          <span className="text-xs text-green-600 font-semibold ml-auto">Always on</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-gray-400 text-xs mt-2">
                By using this site you agree to our{" "}
                <Link to="/privacy-policy" className="text-orange-500 hover:underline cursor-pointer">
                  Privacy Policy
                </Link>
                . California residents:{" "}
                <Link to="/privacy-policy" className="text-orange-500 hover:underline cursor-pointer">
                  Do Not Sell My Personal Information
                </Link>
                .
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-row sm:flex-col gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => saveConsent("accepted")}
                className="whitespace-nowrap px-5 py-2.5 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition-colors cursor-pointer"
              >
                Accept All
              </button>
              <button
                type="button"
                onClick={() => saveConsent("necessary")}
                className="whitespace-nowrap px-5 py-2.5 bg-white border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Necessary Only
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
