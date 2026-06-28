/**
 * seasonalPromo — single source of truth for the temporary, removable
 * Independence Day website "skin" (like a Christmas snow/Santa-hat theme:
 * easy on, easy off — NOT a popup).
 *
 * ── HOW TO DISABLE / REMOVE ──────────────────────────────────────────────────
 *   1. Fastest kill switch: set `enabled: false` below. The whole skin (logo
 *      flag + promo ticker + star sparkle) never renders, regardless of date.
 *   2. Full removal after the event: delete this file +
 *      src/components/feature/SeasonalPromoSkin.tsx, then remove the single
 *      <SeasonalPromoSkin /> mount in src/App.tsx and the single gated
 *      <SeasonalLogoFlag /> line in src/components/feature/SharedNavbar.tsx.
 *
 * Scope & safety:
 *   - Pure presentation. No Stripe / checkout / assessment / attribution logic
 *     is touched. The CTA routes to the normal assessment start using the SAME
 *     ?dc=<code> convention the recovery bridge (/r) and FacebookDiscountPopup
 *     already use; the code is shown so the visitor can paste it into the
 *     existing discount field at checkout (Step3Checkout).
 *
 * NOTE (checkout): the discount code must exist as a Stripe coupon / promotion
 * code for it to actually reduce the price. The LIVE Stripe coupon already
 * exists per the owner — Stripe is intentionally NOT touched here.
 */

export interface SeasonalPromoConfig {
  /** Master kill switch. false = nothing renders, regardless of date. */
  enabled: boolean;
  /** Discount code shown + copied. Must match the Stripe coupon to actually apply. */
  code: string;
  /** Headline savings label, e.g. "$40 off". */
  offerLabel: string;
  /** Short event name used in copy. */
  eventName: string;
  /**
   * Promo window as absolute instants. The "-04:00" offset is America/New_York
   * EDT (summer), so the window is correct no matter the visitor's local clock.
   * Window: Jul 1 00:00 EDT  →  Jul 5 23:59:59 EDT (a real 5-day window).
   */
  startISO: string;
  endISO: string;
  /**
   * How many days BEFORE the start the festive skin + "unlocks soon" countdown
   * appears. After endISO everything hides automatically.
   */
  tickerLeadDays: number;
  /** Where the primary CTA routes (uses the existing ?dc= convention). */
  ctaHref: string;
}

export const SEASONAL_PROMO: SeasonalPromoConfig = {
  enabled: true,
  code: "JULY40",
  offerLabel: "$40 off",
  eventName: "Independence Day",
  startISO: "2026-07-01T00:00:00-04:00",
  endISO: "2026-07-05T23:59:59-04:00",
  tickerLeadDays: 21,
  ctaHref: "/assessment?dc=JULY40",
};

/** "off" = render nothing. "before" = lead-up. "during" = live promo window. */
export type SeasonalPhase = "off" | "before" | "during";

/**
 * Preview override (for QA before/around the window). Reads ?promo_preview=
 *   1 | during  → force the "during" (live) state
 *   before      → force the "before" (lead-up) state
 * The chosen value is stored in localStorage so it survives SPA navigation.
 * Only bypasses the DATE check — `enabled` + route exclusions still apply.
 * Harmless in production: real visitors never pass this flag.
 */
const PREVIEW_KEY = "seasonal_promo_preview";

function readPreviewPhase(): SeasonalPhase | null {
  try {
    let raw: string | null = null;
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("promo_preview");
      if (p) {
        raw = p;
        try {
          localStorage.setItem(PREVIEW_KEY, p);
        } catch {
          /* ignore */
        }
      }
    }
    if (!raw && typeof localStorage !== "undefined") {
      raw = localStorage.getItem(PREVIEW_KEY);
    }
    if (!raw) return null;
    if (raw === "before") return "before";
    if (raw === "1" || raw === "during") return "during";
    return null;
  } catch {
    return null;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Current skin phase. Never throws. */
export function getSeasonalPhase(now: Date = new Date()): SeasonalPhase {
  try {
    if (!SEASONAL_PROMO.enabled) return "off";

    const preview = readPreviewPhase();
    if (preview) return preview;

    const start = new Date(SEASONAL_PROMO.startISO).getTime();
    const end = new Date(SEASONAL_PROMO.endISO).getTime();
    const lead = start - SEASONAL_PROMO.tickerLeadDays * DAY_MS;
    const t = now.getTime();

    if (t > end) return "off"; // after July 5 → hide everything
    if (t >= start) return "during"; // July 1–5
    if (t >= lead) return "before"; // lead-up window
    return "off";
  } catch {
    return "off";
  }
}

/** The instant the active countdown is ticking toward, for the given phase. */
export function getCountdownTargetMs(phase: SeasonalPhase): number {
  return new Date(
    phase === "during" ? SEASONAL_PROMO.endISO : SEASONAL_PROMO.startISO,
  ).getTime();
}

/** Back-compat helper: true only during the live window. */
export function isSeasonalPromoActive(now: Date = new Date()): boolean {
  return getSeasonalPhase(now) === "during";
}
