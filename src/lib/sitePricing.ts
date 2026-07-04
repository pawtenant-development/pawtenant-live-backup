/**
 * sitePricing — central source of truth for prices shown as PUBLIC website TEXT.
 *
 * Admins edit these values in Admin → Settings → Website Pricing. Public pages
 * read them at runtime via useSitePricing() and hydrate the displayed numbers.
 *
 * DISPLAY ONLY — this never affects Stripe checkout amounts, price IDs, order
 * totals, refunds, or payouts. Real selling prices are controlled by Stripe +
 * checkout logic (src/pages/assessment/page.tsx getAssessmentBasePrice).
 *
 * Build / prerender safety: FALLBACK_PRICING_MAP holds the current known values
 * in code so the bundle, prerender, and any failed network fetch always render
 * a sensible price. ESA fallbacks derive from src/config/pricing.ts (the prior
 * single source of truth) so the two stay in lock-step.
 */
import { supabase } from "./supabaseClient";
import { ESA_PRICING, PSD_PRICING, RENEWAL_PRICING } from "../config/pricing";

export type ServiceType = "esa" | "psd" | "addon" | "subscription" | "general";

export interface SitePricingRow {
  key: string;
  label: string;
  service_type: ServiceType | string;
  amount_cents: number;
  currency: string;
  display_text: string | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  updated_at?: string | null;
}

export type SitePricingMap = Record<string, SitePricingRow>;

/** Pricing keys used across the public site. Keep in sync with the DB seed. */
export const PRICING_KEYS = {
  esaSinglePet: "esa_single_pet",
  esaMultiPet: "esa_multi_pet",
  esaSubscriptionAnnual: "esa_subscription_annual",
  esaSubscriptionMulti: "esa_subscription_multi",
  psdStandard: "psd_standard",
  psdPriority: "psd_priority",
  psdMultiDog: "psd_multi_dog",
  psdAnnual: "psd_annual",
  psdAnnualMulti: "psd_annual_multi",
  psdConsultation: "psd_consultation",
  renewalAnnual: "renewal_annual",
  additionalDocumentation: "additional_documentation",
} as const;

/**
 * Format integer cents to a clean USD string.
 *   11000 -> "$110"   9950 -> "$99.50"
 */
export function formatPriceFromCents(cents: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : "";
  const dollars = cents / 100;
  const str = Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
  return `${symbol}${str}`;
}

// ── Fallback constants (build / prerender / offline safety) ─────────────────
function fb(
  key: string,
  label: string,
  service_type: ServiceType,
  amount_cents: number,
  sort_order: number,
): SitePricingRow {
  return {
    key,
    label,
    service_type,
    amount_cents,
    currency: "USD",
    display_text: null,
    description: null,
    is_active: true,
    sort_order,
  };
}

export const PRICING_FALLBACKS: SitePricingRow[] = [
  fb(PRICING_KEYS.esaSinglePet, "ESA Letter — One-Time (single pet)", "esa", ESA_PRICING.oneTime * 100, 10),
  fb(PRICING_KEYS.esaMultiPet, "ESA Letter — 2 or 3 Pets (fixed total)", "esa", ESA_PRICING.oneTimeMultiPetTotal * 100, 11),
  fb(PRICING_KEYS.esaSubscriptionAnnual, "ESA Annual Subscription (single pet)", "subscription", ESA_PRICING.subscription * 100, 12),
  fb(PRICING_KEYS.esaSubscriptionMulti, "ESA Annual — 2 or 3 Pets (fixed total/yr)", "subscription", ESA_PRICING.subscriptionMultiPetTotal * 100, 13),
  fb(PRICING_KEYS.psdStandard, "PSD Letter — Standard (1 dog)", "psd", PSD_PRICING.oneTime * 100, 20),
  fb(PRICING_KEYS.psdPriority, "PSD Letter — Priority 24h (1 dog)", "psd", PSD_PRICING.oneTime * 100, 21),
  fb(PRICING_KEYS.psdMultiDog, "PSD Letter — 2 or 3 Dogs (fixed total)", "psd", PSD_PRICING.oneTimeMultiDogTotal * 100, 22),
  fb(PRICING_KEYS.psdAnnual, "PSD Annual Subscription (1 dog)", "psd", PSD_PRICING.annual * 100, 23),
  fb(PRICING_KEYS.psdAnnualMulti, "PSD Annual — 2 or 3 Dogs (fixed total/yr)", "psd", PSD_PRICING.annualMultiDogTotal * 100, 24),
  fb(PRICING_KEYS.psdConsultation, "Consultation — 15-Minute Call", "psd", PSD_PRICING.consultation * 100, 25),
  fb(PRICING_KEYS.renewalAnnual, "Renewal — Annual Subscription", "subscription", RENEWAL_PRICING.annual * 100, 26),
  fb(PRICING_KEYS.additionalDocumentation, "Additional Documentation (add-on)", "addon", 4000, 30),
];

export const FALLBACK_PRICING_MAP: SitePricingMap = Object.fromEntries(
  PRICING_FALLBACKS.map((r) => [r.key, r]),
);

/** Display string for a key — prefers DB display_text override, then amount, then fallback. */
export function displayPrice(map: SitePricingMap, key: string, fallback?: string): string {
  const row = map[key];
  if (row) {
    const override = row.display_text?.trim();
    if (override) return override;
    return formatPriceFromCents(row.amount_cents, row.currency);
  }
  if (fallback) return fallback;
  const fbRow = FALLBACK_PRICING_MAP[key];
  return fbRow ? formatPriceFromCents(fbRow.amount_cents, fbRow.currency) : "";
}

/** Numeric dollars for a key (e.g. for calculators). */
export function dollarsForKey(map: SitePricingMap, key: string): number {
  const row = map[key] ?? FALLBACK_PRICING_MAP[key];
  return row ? Math.round(row.amount_cents) / 100 : 0;
}

// ── Runtime fetch with a shared module-level cache ──────────────────────────
// One fetch per session is shared across every component/page that reads
// pricing, avoiding refetch-per-mount and layout thrash.
let cache: SitePricingMap | null = null;
let inFlight: Promise<SitePricingMap> | null = null;

export function getCachedPricing(): SitePricingMap | null {
  return cache;
}

/** Invalidate the shared cache (e.g. after an admin edit in the same tab). */
export function clearSitePricingCache(): void {
  cache = null;
  inFlight = null;
}

export async function fetchSitePricing(force = false): Promise<SitePricingMap> {
  if (cache && !force) return cache;
  if (inFlight && !force) return inFlight;

  inFlight = (async () => {
    try {
      const { data, error } = await supabase
        .from("site_pricing_settings")
        .select("key,label,service_type,amount_cents,currency,display_text,description,is_active,sort_order,updated_at")
        .eq("is_active", true);

      if (error || !data) {
        cache = cache ?? { ...FALLBACK_PRICING_MAP };
        return cache;
      }

      // Merge over fallbacks so a key missing from the DB still resolves.
      const merged: SitePricingMap = { ...FALLBACK_PRICING_MAP };
      for (const row of data as SitePricingRow[]) {
        merged[row.key] = row;
      }
      cache = merged;
      return cache;
    } catch {
      cache = cache ?? { ...FALLBACK_PRICING_MAP };
      return cache;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
