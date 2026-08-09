import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

type ConsentState = "accepted" | "necessary" | null;

// View state for THIS component only (not consent):
//   "hidden" — nothing rendered (consent already saved, or not decided yet)
//   "banner" — full compact consent banner
//   "pill"   — small "Cookie settings" control after auto-collapse
type View = "hidden" | "banner" | "pill";

// sessionStorage flag: the expanded banner has already auto-collapsed this
// browser session, so subsequent mounts / SPA route changes show the pill
// (not the expanded banner) until the visitor makes a real choice or opens a
// new browser session. This is TEMPORARY UI state only — it is NOT consent and
// never replaces the persistent localStorage consent keys.
const SESSION_COLLAPSED_KEY = "cookie_banner_collapsed";
const SHOW_DELAY_MS = 800; // delay before the banner first appears
const AUTO_COLLAPSE_MS = 8000; // 8s of no interaction → collapse to pill

// Consent categories shown in the "Manage choices" disclosure. These are
// informational only — they mirror the two save actions (Accept all /
// Reject non-essential). The categories themselves are UNCHANGED.
const CATEGORIES = [
  {
    icon: "ri-checkbox-circle-fill",
    color: "text-green-500",
    title: "Strictly necessary",
    desc: "Session, page routing, form submissions.",
    always: true,
  },
  {
    icon: "ri-bar-chart-line",
    color: "text-orange-400",
    title: "Analytics",
    desc: "UTM source, referrer, landing page.",
    always: false,
  },
  {
    icon: "ri-user-heart-line",
    color: "text-orange-400",
    title: "Preferences",
    desc: "Remembers your choices during this visit.",
    always: false,
  },
] as const;

// Shared focus-visible ring so every control has a clear keyboard focus state.
const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded";

// Subtle pop-in, disabled under prefers-reduced-motion. Scoped by class name so
// nothing global changes.
const ANIM_CSS = `
@keyframes ptCookiePop{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}
.pt-cookie-animate{animation:ptCookiePop .22s ease-out both}
@media (prefers-reduced-motion: reduce){.pt-cookie-animate{animation:none}}
`;

/**
 * CookieBanner — compact, non-modal consent notice that auto-collapses.
 *
 * Behavior:
 *   - First visit with no saved choice: after a short delay the compact banner
 *     appears and an 8s auto-collapse timer starts.
 *   - After 8s with NO interaction the banner collapses to a small
 *     "Cookie settings" pill. No consent is written on collapse.
 *   - The timer is paused whenever the visitor hovers, focuses/tabs into the
 *     banner, or opens "Manage choices" — it never collapses while focus is
 *     inside.
 *   - Clicking the pill reopens the full banner and does NOT re-arm the timer
 *     (so it will not flash open/closed while being used).
 *   - Accept / Reject save consent exactly as before and hide everything.
 *
 * Consent STORAGE is unchanged:
 *   - localStorage `cookie_consent` = "accepted" | "necessary"
 *   - localStorage `cookie_consent_date` = ISO timestamp
 * The only new key is a sessionStorage UI flag (`cookie_banner_collapsed`).
 *
 * The container is pointer-events-none and only the card / pill re-enable
 * pointer events, so the rest of the page stays interactive. Non-modal
 * `region` landmark — no focus trap.
 */
export default function CookieBanner() {
  const [view, setView] = useState<View>("hidden");
  const [showDetails, setShowDetails] = useState(false);
  // Whether the auto-collapse timer is allowed to run. True only for the
  // initial auto-shown banner; cleared once the visitor reopens via the pill.
  const [autoArmed, setAutoArmed] = useState(false);
  // Pause signals for the timer.
  const [hovered, setHovered] = useState(false);
  const [focusInside, setFocusInside] = useState(false);

  const cardRef = useRef<HTMLDivElement | null>(null);

  // Decide the initial view once, on mount.
  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");
    if (consent) return; // already decided → stay hidden

    // Already collapsed earlier this session → show the small pill, not the
    // expanded banner (prevents auto re-expand on SPA route changes).
    let collapsed = false;
    try {
      collapsed = sessionStorage.getItem(SESSION_COLLAPSED_KEY) === "1";
    } catch {
      collapsed = false;
    }
    if (collapsed) {
      setView("pill");
      return;
    }

    const t = setTimeout(() => {
      setView("banner");
      setAutoArmed(true);
    }, SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Auto-collapse timer. Runs only while the initial banner is showing and the
  // visitor is not interacting with it. Any pause signal clears the timer;
  // when the signal clears the timer restarts (so it collapses after a full
  // idle period, never mid-interaction and without flashing).
  useEffect(() => {
    if (view !== "banner" || !autoArmed) return;
    if (hovered || focusInside || showDetails) return; // paused
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(SESSION_COLLAPSED_KEY, "1");
      } catch {
        /* ignore storage failures */
      }
      setView("pill");
    }, AUTO_COLLAPSE_MS);
    return () => clearTimeout(t);
  }, [view, autoArmed, hovered, focusInside, showDetails]);

  const saveConsent = (choice: ConsentState) => {
    if (!choice) return;
    localStorage.setItem("cookie_consent", choice);
    localStorage.setItem("cookie_consent_date", new Date().toISOString());
    setView("hidden");
  };

  const reopenFromPill = () => {
    setView("banner");
    setAutoArmed(false); // reopened by the visitor → do not auto-collapse again
  };

  // Track focus entering/leaving the banner so the timer pauses while focus is
  // inside (keyboard / screen-reader interaction).
  const handleFocus = () => setFocusInside(true);
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (!cardRef.current || !next || !cardRef.current.contains(next)) {
      setFocusInside(false);
    }
  };

  if (view === "hidden") return null;

  if (view === "pill") {
    return (
      <div className="fixed z-[9998] left-3 bottom-[calc(88px_+_env(safe-area-inset-bottom,0px))] sm:left-6 sm:bottom-6 pointer-events-none">
        <style>{ANIM_CSS}</style>
        <button
          type="button"
          onClick={reopenFromPill}
          aria-label="Open cookie settings"
          className={`pt-cookie-animate pointer-events-auto inline-flex items-center gap-1.5 h-10 px-3.5 bg-white border border-gray-200 rounded-full text-gray-700 text-xs font-semibold shadow-md hover:bg-gray-50 transition-colors cursor-pointer ${FOCUS_RING}`}
          style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}
        >
          <i className="ri-shield-check-line text-orange-500 text-sm" aria-hidden="true"></i>
          Cookie settings
        </button>
      </div>
    );
  }

  // view === "banner"
  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed z-[9999] bottom-3 left-3 right-3 sm:left-6 sm:right-auto sm:bottom-6 sm:w-[400px] pointer-events-none"
    >
      <style>{ANIM_CSS}</style>
      <div
        ref={cardRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="pt-cookie-animate pointer-events-auto bg-white rounded-2xl border border-gray-200 p-4"
        style={{ boxShadow: "0 8px 28px rgba(0,0,0,0.12)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-50 flex-shrink-0">
            <i className="ri-shield-check-line text-orange-500 text-base" aria-hidden="true"></i>
          </div>
          <h2 id="cookie-consent-title" className="text-sm font-bold text-gray-900">
            We use cookies
          </h2>
        </div>

        {/* Message — concise, same privacy meaning as before */}
        <p className="text-xs leading-relaxed text-gray-600">
          We use essential cookies to run PawTenant and optional analytics cookies to
          improve your experience. You can accept, reject, or manage your choices.
        </p>

        {/* Links row: Privacy Policy + Manage choices (preferences disclosure) */}
        <p className="text-xs text-gray-500 mt-1.5">
          <Link
            to="/privacy-policy"
            className={`text-orange-500 hover:underline font-medium ${FOCUS_RING}`}
          >
            Privacy Policy
          </Link>
          <span className="mx-1.5 text-gray-300" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            aria-controls="cookie-consent-details"
            className={`text-orange-500 hover:underline font-medium cursor-pointer ${FOCUS_RING}`}
          >
            {showDetails ? "Hide details" : "Manage choices"}
          </button>
        </p>

        {/* Preferences disclosure (categories are unchanged) */}
        {showDetails && (
          <div id="cookie-consent-details" className="mt-2.5 space-y-1.5">
            {CATEGORIES.map((item) => (
              <div key={item.title} className="flex items-start gap-1.5 text-[11px] leading-snug">
                <i
                  className={`${item.icon} ${item.color} text-sm flex-shrink-0 mt-px`}
                  aria-hidden="true"
                ></i>
                <p className="text-gray-500">
                  <span className="font-semibold text-gray-800">{item.title}</span>
                  {item.always && (
                    <span className="ml-1 text-green-600 font-semibold">(always on)</span>
                  )}{" "}
                  — {item.desc}
                </p>
              </div>
            ))}
            <p className="text-[11px] text-gray-500 pt-0.5">
              California residents:{" "}
              <Link
                to="/privacy-policy"
                className={`text-orange-500 hover:underline ${FOCUS_RING}`}
              >
                Do Not Sell My Personal Information
              </Link>
              .
            </p>
          </div>
        )}

        {/* Actions — equal-width, Reject fully visible alongside Accept */}
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => saveConsent("necessary")}
            className={`flex-1 px-3 py-2 bg-white border border-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer ${FOCUS_RING}`}
          >
            Reject non-essential
          </button>
          <button
            type="button"
            onClick={() => saveConsent("accepted")}
            aria-label="Accept all cookies"
            className={`flex-1 px-3 py-2 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition-colors cursor-pointer ${FOCUS_RING}`}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
