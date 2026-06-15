import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * FacebookDiscountPopup — warm, on-brand $30-off welcome popup shown ONLY to
 * Facebook / Instagram visitors on PawTenant public content / marketing pages.
 *
 * Scope & safety:
 *   - TEST-only feature. Pure presentation + localStorage flags.
 *   - No checkout / Stripe / assessment / attribution logic is touched. The CTA
 *     simply routes to the normal assessment start using the SAME ?dc=<code>
 *     convention the recovery bridge (/r) already uses; the code is also shown
 *     prominently so the visitor can paste it into the existing discount field
 *     at checkout (Step3Checkout).
 *
 * Coupon: SPRING30 ($30 off) — verified active in DISCOUNT_CODES
 *   (see src/pages/admin-orders/components/RecoveryPerformancePanel.tsx).
 *
 * Detection (any one is enough), persisted so it survives SPA navigation that
 * strips the UTM params:
 *   - utm_source ∈ {facebook, fb, meta, instagram, ig}
 *   - fbclid present
 *   - document.referrer host ∈ Facebook / Instagram hosts
 * utm_medium (paid_social / social / organic_social) is NOT an independent
 * trigger — a bare social medium from a non-FB source (e.g. TikTok) must not
 * open the popup. Medium is only ever supporting context to a Facebook source.
 *
 * Route exclusions are re-checked at show-time, so even with the persisted flag
 * the popup never appears on assessment / checkout / thank-you / auth / admin /
 * provider / customer-portal / company-OS / verify / recovery routes. Public
 * marketing landing pages (incl. /meta-esa-letter, /esa-letter-housing) ARE
 * allowed.
 */

const FB_VISITOR_KEY = "pawtenant_fb_visitor";
const SEEN_KEY = "pawtenant_fb_discount_seen";
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // show at most once per 24h
const SHOW_DELAY_MS = 1500; // let the page settle first (no layout shift)
const COUPON_CODE = "SPRING30";
const CTA_HREF = `/assessment?dc=${COUPON_CODE}`;

// Sensitive routes where the popup must NEVER appear. Matched as path prefixes.
const EXCLUDED_PREFIXES = [
  "/assessment", // /assessment + /assessment-thankyou + /assessment/thank-you
  "/psd-assessment", // /psd-assessment + /psd-assessment-thankyou
  "/account", // /account/checkout (customer checkout / portal)
  "/my-orders", // customer portal
  "/customer-login",
  "/admin", // all /admin* incl. /admin-login
  "/provider", // /provider-login + /provider-portal
  "/reset-password",
  "/go-live",
  "/company", // company / admin OS
  "/verify", // letter-verification utility (not /esa-letter-verification)
  "/r/", // recovery click bridge (transient redirect; has its own coupon flow)
];
// NOTE: paid marketing landing pages (/meta-esa-letter, /esa-letter-housing) are
// intentionally NOT excluded — they are public content pages (CTA links out to
// /assessment; they are not checkout/assessment surfaces), and Facebook visitors
// landing there should see the offer.

function isExcluded(pathname: string): boolean {
  const p = (pathname || "").toLowerCase();
  return EXCLUDED_PREFIXES.some((pre) => p.startsWith(pre));
}

const SOURCE_MATCH = ["facebook", "fb", "meta", "instagram", "ig"];
const REFERRER_HOSTS = [
  "facebook.com",
  "m.facebook.com",
  "l.facebook.com",
  "lm.facebook.com",
  "instagram.com",
  "l.instagram.com",
];

/** Detect a Facebook/Instagram visitor and persist the flag. Never throws. */
function isFacebookVisitor(search: string): boolean {
  try {
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(FB_VISITOR_KEY) === "true"
    ) {
      return true;
    }

    const qs =
      search || (typeof window !== "undefined" ? window.location.search : "");
    const params = new URLSearchParams(qs);
    const src = (params.get("utm_source") || "").toLowerCase();
    const hasFbclid = params.has("fbclid");
    const ref =
      typeof document !== "undefined" ? (document.referrer || "").toLowerCase() : "";

    // utm_medium is intentionally NOT part of this condition: a bare
    // paid_social / social / organic_social medium from a non-Facebook source
    // (e.g. TikTok, Pinterest) must never trigger the Facebook offer.
    const matched =
      SOURCE_MATCH.includes(src) ||
      hasFbclid ||
      REFERRER_HOSTS.some((h) => ref.includes(h));

    if (matched && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(FB_VISITOR_KEY, "true");
      } catch {
        /* ignore */
      }
    }
    return matched;
  } catch {
    return false;
  }
}

function recentlySeen(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const ts = parseInt(localStorage.getItem(SEEN_KEY) || "0", 10);
    return ts > 0 && Date.now() - ts < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SEEN_KEY, String(Date.now()));
    }
  } catch {
    /* ignore */
  }
}

export default function FacebookDiscountPopup() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false); // drives the open transition
  const [copied, setCopied] = useState(false);

  const shownThisLoad = useRef(false);
  const lastFocused = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const showTimerRef = useRef<number | null>(null);

  const excluded = isExcluded(pathname);

  // Detect + persist on entry and on every route change (covers FB deep links).
  useEffect(() => {
    isFacebookVisitor(search);
  }, [search]);

  // Decide whether to show (after a short settle delay). Re-checks exclusion at
  // fire time so a fast SPA navigation can never surface it on a sensitive page.
  useEffect(() => {
    if (excluded || shownThisLoad.current) return;
    if (recentlySeen()) return;
    if (!isFacebookVisitor(search)) return;

    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null;
      if (isExcluded(window.location.pathname)) return;
      shownThisLoad.current = true;
      lastFocused.current = (document.activeElement as HTMLElement) || null;
      setVisible(true);
      requestAnimationFrame(() => setEntered(true));
    }, SHOW_DELAY_MS);

    return () => {
      if (showTimerRef.current) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };
  }, [excluded, search, pathname]);

  const close = useCallback(() => {
    setEntered(false);
    markSeen();
    window.setTimeout(() => {
      setVisible(false);
      try {
        lastFocused.current?.focus?.();
      } catch {
        /* ignore */
      }
    }, 200);
  }, []);

  // Esc-to-close + initial focus to the close button while open.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      try {
        closeBtnRef.current?.focus();
      } catch {
        /* ignore */
      }
    }, 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [visible, close]);

  // If a navigation lands on an excluded route while the popup is open, close it.
  useEffect(() => {
    if (visible && excluded) close();
  }, [visible, excluded, close]);

  const handleCopy = useCallback(() => {
    try {
      navigator.clipboard
        ?.writeText(COUPON_CODE)
        .then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        })
        .catch(() => {
          /* ignore clipboard errors */
        });
    } catch {
      /* ignore */
    }
  }, []);

  const handleStart = useCallback(() => {
    markSeen();
    setEntered(false);
    setVisible(false);
    navigate(CTA_HREF);
  }, [navigate]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-3 sm:p-4"
      onClick={close}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] transition-opacity duration-200 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fb-discount-title"
        aria-describedby="fb-discount-desc"
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-md sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl ring-1 ring-black/5 overflow-hidden flex flex-col sm:flex-row transition-all duration-200 ${
          entered ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 sm:scale-95"
        }`}
      >
        {/* Close */}
        <button
          ref={closeBtnRef}
          type="button"
          aria-label="Close discount offer"
          onClick={close}
          className="absolute top-3 right-3 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 text-slate-500 hover:text-slate-800 hover:bg-white shadow-sm transition-colors"
        >
          <i className="ri-close-line text-xl" aria-hidden="true"></i>
        </button>

        {/* LEFT — warm image (sm+ only) */}
        <div className="relative hidden sm:block sm:w-[42%] flex-shrink-0 min-h-[380px]">
          <img
            src="/assets/blog/woman-holding-dog-1.jpg"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover object-[72%_center]"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-orange-900/30 via-transparent to-white/10" />
          <div className="absolute top-4 left-4">
            <span className="inline-flex items-center gap-1.5 bg-white/95 text-orange-600 text-[11px] font-extrabold px-3 py-1.5 rounded-full uppercase tracking-wider shadow-sm">
              <i className="ri-heart-3-fill" aria-hidden="true"></i>
              For you &amp; your pet
            </span>
          </div>
        </div>

        {/* RIGHT — content */}
        <div className="flex-1 px-5 pt-6 pb-6 sm:px-8 sm:py-8 flex flex-col justify-center">
          <span className="inline-flex items-center gap-1.5 self-start bg-orange-50 text-orange-600 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider mb-3">
            <i className="ri-facebook-circle-fill" aria-hidden="true"></i>
            Facebook &amp; Instagram offer
          </span>

          <h2
            id="fb-discount-title"
            className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight mb-2 pr-6"
          >
            Because home should feel safe for both of you
          </h2>

          <p id="fb-discount-desc" className="text-sm text-slate-600 leading-relaxed mb-4">
            Facebook visitor offer:{" "}
            <span className="font-semibold text-slate-800">Save $30</span> on your ESA
            evaluation today.
          </p>

          {/* $30 OFF + code */}
          <div className="rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50/70 px-4 py-4 mb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="leading-none">
                <div className="text-3xl sm:text-4xl font-extrabold text-orange-600">
                  $30 <span className="text-lg sm:text-xl align-middle">OFF</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Use code at checkout
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                aria-label={`Copy discount code ${COUPON_CODE}`}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 font-extrabold tracking-[0.15em] text-base transition-colors ${
                  copied
                    ? "bg-emerald-500 text-white"
                    : "bg-white text-orange-700 ring-1 ring-orange-300 hover:bg-orange-100"
                }`}
              >
                <span>{COUPON_CODE}</span>
                <i
                  className={copied ? "ri-check-line" : "ri-file-copy-line"}
                  aria-hidden="true"
                ></i>
              </button>
            </div>
            {copied && (
              <p className="text-[11px] font-semibold text-emerald-600 mt-2">
                Copied — paste it in the discount field at checkout.
              </p>
            )}
          </div>

          <p className="flex items-start gap-2 text-[13px] text-slate-600 leading-relaxed mb-5">
            <i
              className="ri-shield-check-line text-emerald-600 text-base mt-0.5 flex-shrink-0"
              aria-hidden="true"
            ></i>
            <span>
              Start your housing-focused ESA evaluation with a licensed provider. If
              you do not qualify, you are refunded.
            </span>
          </p>

          <button
            type="button"
            onClick={handleStart}
            className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm transition-colors flex items-center justify-center gap-2"
          >
            <i className="ri-heart-add-line text-base" aria-hidden="true"></i>
            Start My ESA Evaluation
          </button>

          <button
            type="button"
            onClick={close}
            className="mt-2.5 w-full text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
