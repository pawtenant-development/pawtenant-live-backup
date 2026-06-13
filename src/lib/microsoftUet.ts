/**
 * microsoftUet.ts — Microsoft Advertising Universal Event Tracking (UET).
 *
 * UET Tag ID: 187256974  (PawTenant Microsoft Ads account)
 *
 * ── HOW THIS MIRRORS THE EXISTING GOOGLE / META STACK ─────────────────────
 * The bat.js script is loaded ONCE by the shared deferred loader in
 * index.html (loadAll()) on the exact same triggers as gtag.js + fbevents.js:
 *   1. hard-load on a conversion-critical route (/assessment/thank-you …),
 *   2. SPA navigation into a conversion-critical route (App.tsx
 *      __ptLoadMarketing()),
 *   3. first user interaction, or
 *   4. window.load + 8s idle fallback.
 * The base tag is created with `enableAutoSpaTracking: true`, so a UET
 * pageLoad fires automatically on every SPA route change once bat.js
 * attaches — that is what a Microsoft "Destination URL" conversion goal
 * counts on the thank-you page. A `window.uetq` queue stub is created
 * synchronously in index.html so pushes never NPE before bat.js loads
 * (identical pattern to the gtag()/fbq() stubs).
 *
 * ── CONSENT ────────────────────────────────────────────────────────────────
 * PawTenant has a CookieBanner (localStorage `cookie_consent`) but the
 * existing Google Ads (gtag) and Meta Pixel (fbq) loaders do NOT gate on it
 * — those tags load under implied consent ("by using this site you agree").
 * To stay consistent with that established behavior and to avoid silently
 * blocking all Microsoft tracking (Microsoft Consent Mode default-denied
 * with no real update path would zero out UET), UET is loaded the same way
 * and does NOT set Consent Mode default-denied. No new banner is added. See
 * the task notes / final report for the documented rationale.
 *
 * ── ENV GUARDS (TEST must NOT pollute Microsoft Ads conversion data) ──────
 *   VITE_MICROSOFT_UET_ID       tag id (default "187256974")
 *   VITE_MICROSOFT_UET_ENABLED  "true" → index.html loads bat.js. Set on
 *                               LIVE only. Unset/false on TEST → bat.js
 *                               never loads, so no pageLoad / conversion
 *                               ever reaches Microsoft from TEST.
 *   VITE_MICROSOFT_UET_DEBUG    "true" (or URL `?uetdebug=1`) → console
 *                               debug logs + allows the conversion to fire
 *                               on a non-prod host for verification.
 *
 * The purchase conversion fires ONLY when ALL hold:
 *   • host is the LIVE domain (pawtenant.com) OR debug is enabled, AND
 *   • a confirmationId + positive value exist, AND
 *   • the UET tag is actually loaded (bat.js attached), AND
 *   • it was not already fired for this confirmationId (sessionStorage dedup).
 *
 * ── ENHANCED CONVERSIONS ──────────────────────────────────────────────────
 * When a customer email / phone is available on the paid success route, the
 * NORMALIZED PLAINTEXT email/phone are pushed via
 *   uetq.push('set', { pid: { em, ph } })
 * BEFORE the revenue event. The UET tag SHA-256-hashes them client-side
 * before transmission — same trust model as Google Enhanced Conversions
 * (gtag('set','user_data',...)). Raw PII is NEVER logged; debug logs only
 * emit booleans for presence.
 *
 * ── VARIABLE REVENUE ──────────────────────────────────────────────────────
 * Revenue is attached to the auto-SPA pageLoad (which the Destination URL
 * goal counts) using Microsoft's official destination-URL-goal syntax:
 *   uetq.push('event', '', { revenue_value, currency: 'USD' })
 * If the Microsoft goal is later reconfigured as an Event goal, change the
 * empty event action below to the goal's action (e.g. 'purchase').
 */

declare global {
  interface Window {
    uetq?: unknown[] | { push: (...args: unknown[]) => void };
    UET?: unknown;
  }
}

const UET_ID =
  (import.meta.env.VITE_MICROSOFT_UET_ID as string | undefined) || "187256974";

/** True on the production host only — TEST/preview hosts return false. */
function isProdHost(): boolean {
  try {
    const h = (window.location.hostname || "").toLowerCase();
    return h === "pawtenant.com" || h === "www.pawtenant.com";
  } catch {
    return false;
  }
}

/** Debug from env, Vite dev, or a sticky `?uetdebug=1` URL flag. */
export function isUetDebug(): boolean {
  try {
    if (import.meta.env.VITE_MICROSOFT_UET_DEBUG === "true") return true;
    if (import.meta.env.DEV) return true;
    const p = new URLSearchParams(window.location.search);
    if (p.get("uetdebug") === "1") {
      try { sessionStorage.setItem("ms_uet_debug", "1"); } catch { /* ignore */ }
      return true;
    }
    return sessionStorage.getItem("ms_uet_debug") === "1";
  } catch {
    return false;
  }
}

/**
 * Whether bat.js is allowed to load at all. The actual <script> injection
 * happens in index.html (gated on %VITE_MICROSOFT_UET_ENABLED%); this helper
 * mirrors that decision for any TS caller that wants to branch on it.
 */
export function isUetEnabled(): boolean {
  return import.meta.env.VITE_MICROSOFT_UET_ENABLED === "true" || isUetDebug();
}

/** UET tag fully attached: bat.js replaced the array stub with a UET object. */
function uetReady(): boolean {
  try {
    return (
      typeof window.UET === "function" &&
      !!window.uetq &&
      !Array.isArray(window.uetq)
    );
  } catch {
    return false;
  }
}

// ── PII normalization (plaintext only — UET hashes client-side) ────────────
function normalizeEmail(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const v = String(raw).trim().toLowerCase();
  return v.includes("@") ? v : undefined;
}

// E.164 (+[country][digits]). Mirrors googleEnhancedConversions normalizePhone.
function normalizePhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = String(raw).replace(/[^\d+]/g, "");
  if (!cleaned) return undefined;
  if (cleaned.startsWith("+")) {
    const digitsOnly = cleaned.slice(1);
    return digitsOnly.length >= 8 ? `+${digitsOnly}` : undefined;
  }
  const digits = cleaned.replace(/^0+/, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8) return `+${digits}`;
  return undefined;
}

function pushQueue(...args: unknown[]): void {
  try {
    const q = window.uetq as { push: (...a: unknown[]) => void } | undefined;
    if (q && typeof q.push === "function") q.push(...args);
  } catch {
    /* never throw */
  }
}

/**
 * Fire the Microsoft Ads purchase conversion on the paid success/thank-you
 * route. Safe to call from any thank-you path — guarded, deduped, and a
 * no-op on TEST (unless debug). Never throws, never blocks render.
 *
 * Call it next to fireMetaPurchase(): the sessionStorage dedup (keyed by
 * confirmationId) makes duplicate calls across the inline + redirect effects
 * harmless.
 */
export function fireMicrosoftPurchase(opts: {
  value: number;
  confirmationId: string;
  email?: string | null;
  phone?: string | null;
}): void {
  try {
    if (typeof window === "undefined") return;

    const { value, confirmationId } = opts;
    if (!confirmationId || !value || value <= 0) {
      if (isUetDebug()) {
        // eslint-disable-next-line no-console
        console.warn("[UET] purchase skipped — missing confirmationId or value", {
          hasConfirmationId: Boolean(confirmationId),
          value,
        });
      }
      return;
    }

    // ── TEST-pollution guard: never send a conversion to Microsoft from a
    //    non-prod host unless debug is explicitly enabled. ──────────────────
    if (!isProdHost() && !isUetDebug()) return;

    const dedupKey = `ms_uet_purchase_fired_${confirmationId}`;
    try {
      if (sessionStorage.getItem(dedupKey)) {
        if (isUetDebug()) {
          // eslint-disable-next-line no-console
          console.log("[UET] purchase deduped — already fired for", confirmationId);
        }
        return;
      }
    } catch {
      /* sessionStorage unavailable — proceed without dedup */
    }

    const em = normalizeEmail(opts.email);
    const ph = normalizePhone(opts.phone);

    const doPush = () => {
      // Enhanced conversions — plaintext identifiers; UET hashes client-side.
      if (em || ph) {
        const pid: Record<string, string> = {};
        if (em) pid.em = em;
        if (ph) pid.ph = ph;
        pushQueue("set", { pid });
      }
      // Variable revenue attached to the auto-SPA pageLoad (Destination URL
      // goal). Empty event action => applies to the page-level conversion.
      pushQueue("event", "", { revenue_value: value, currency: "USD" });

      try { sessionStorage.setItem(dedupKey, "1"); } catch { /* ignore */ }

      if (isUetDebug()) {
        // PII-safe: presence booleans only, never raw email/phone.
        // eslint-disable-next-line no-console
        console.log("[UET] purchase fired ✓", {
          tagId: UET_ID,
          confirmationId,
          revenue_value: value,
          currency: "USD",
          has_email: Boolean(em),
          has_phone: Boolean(ph),
          host: window.location.hostname,
        });
      }
    };

    // The UET tag loads asynchronously (hard-loaded on the thank-you route in
    // index.html). Push as soon as it is ready; otherwise poll briefly — the
    // same readiness pattern the gtag conversion uses on this page.
    if (uetReady()) {
      doPush();
      return;
    }
    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      if (uetReady()) {
        doPush();
        window.clearInterval(interval);
      } else if (attempts >= 100) {
        window.clearInterval(interval); // ~10s — give up silently
      }
    }, 100);
  } catch {
    /* never block the thank-you render */
  }
}
