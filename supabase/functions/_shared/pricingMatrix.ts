// CHECKOUT-PRICING-PHASED-SUBSCRIPTION-003 · Phase 2/5
// SERVER-authoritative canonical pricing matrix + the provisioned TEST Stripe
// subscription Price IDs. This is the ONE server source of truth: every charge
// path (create-payment-intent, create-checkout-session, stripe-webhook schedule
// attach) reads amounts + Price IDs from here, so they can never drift apart.
//
// Mirrors src/config/pricing.ts exactly — scripts/check-pricing-parity.mjs fails
// the build if the two disagree, so keep them in lock-step.
//
// Whole-dollar amounts (helpers below expose cents). Standard: same numbers for
// ESA and PSD. Combo (RA bundle) is flat with NO year-two drop and uses inline
// price_data (no Price ID).
//
// Pure module — NO imports — so both Deno edge functions AND the node parity
// script can read it.

export type Product = "esa" | "psd";
export type Tier = "single" | "multi";
export type Phase = "first_year" | "renewal";

export const STANDARD_MATRIX = {
  oneTime:   { single: 129, multi: 149 },
  firstYear: { single: 115, multi: 135 },
  renewal:   { single: 100, multi: 115 },
} as const;

export const COMBO_MATRIX = {
  oneTime: 179,
  firstYear: 159,
  renewal: 159, // no year-two reduction
} as const;

export function petTier(petCount: number): Tier {
  const n = Math.max(1, Math.min(3, Math.floor(Number(petCount) || 1)));
  return n === 1 ? "single" : "multi";
}

// ── Amount getters (cents) ──────────────────────────────────────────────────
export function oneTimeCents(petCount: number): number {
  return STANDARD_MATRIX.oneTime[petTier(petCount)] * 100;
}
export function firstYearCents(petCount: number): number {
  return STANDARD_MATRIX.firstYear[petTier(petCount)] * 100;
}
export function renewalCents(petCount: number): number {
  return STANDARD_MATRIX.renewal[petTier(petCount)] * 100;
}
export const COMBO_ONE_TIME_CENTS = COMBO_MATRIX.oneTime * 100;   // 17900
export const COMBO_ANNUAL_CENTS = COMBO_MATRIX.firstYear * 100;   // 15900 (first year AND renewal)

// ── Provisioned TEST Stripe Price IDs (livemode=false) ──────────────────────
// Created + verified by provision-subscription-prices (pricing_stripe_map).
// lookup_key → price_id. LIVE will provision its own set (Phase 18) and swap
// these behind the same lookup_keys.
export const SUBSCRIPTION_LOOKUP_KEYS = {
  esa: {
    single: { first_year: "pawtenant_esa_single_first_year_v1", renewal: "pawtenant_esa_single_renewal_v1" },
    multi:  { first_year: "pawtenant_esa_multi_first_year_v1",  renewal: "pawtenant_esa_multi_renewal_v1" },
  },
  psd: {
    single: { first_year: "pawtenant_psd_single_first_year_v1", renewal: "pawtenant_psd_single_renewal_v1" },
    multi:  { first_year: "pawtenant_psd_multi_first_year_v1",  renewal: "pawtenant_psd_multi_renewal_v1" },
  },
} as const;

export const SUBSCRIPTION_PRICE_IDS: Record<Product, Record<Tier, Record<Phase, string>>> = {
  esa: {
    single: { first_year: "price_1TubftGwm9wIWlgihMaXmYGZ", renewal: "price_1TubfuGwm9wIWlgidAJtAE2o" },
    multi:  { first_year: "price_1TubfxGwm9wIWlgiFi7NAeat", renewal: "price_1TubfyGwm9wIWlgighSd3lZZ" },
  },
  psd: {
    single: { first_year: "price_1TubfzGwm9wIWlgiuuTxz8jS", renewal: "price_1Tubg1Gwm9wIWlgi4f1jlgP2" },
    multi:  { first_year: "price_1Tubg2Gwm9wIWlgi3oHvpal4", renewal: "price_1Tubg4Gwm9wIWlgiSvem8rOS" },
  },
};

/** First-year subscription Price ID (what the customer is billed today). */
export function firstYearPriceId(product: Product, petCount: number): string {
  return SUBSCRIPTION_PRICE_IDS[product][petTier(petCount)].first_year;
}
/** Renewal Price ID (year two onward — phase 2 of the subscription schedule). */
export function renewalPriceId(product: Product, petCount: number): string {
  return SUBSCRIPTION_PRICE_IDS[product][petTier(petCount)].renewal;
}
/** The renewal Price ID that corresponds to a given first-year Price ID. Used by
 *  the webhook to build phase 2 of the schedule from the subscription's price. */
export function renewalPriceIdForFirstYear(firstYearId: string): string | null {
  for (const product of ["esa", "psd"] as Product[]) {
    for (const tier of ["single", "multi"] as Tier[]) {
      if (SUBSCRIPTION_PRICE_IDS[product][tier].first_year === firstYearId) {
        return SUBSCRIPTION_PRICE_IDS[product][tier].renewal;
      }
    }
  }
  return null;
}
/** True when a Price ID is one of our provisioned first-year standard prices
 *  (i.e. eligible for a phased renewal schedule). Combo/legacy prices → false. */
export function isProvisionedFirstYearPrice(priceId: string): boolean {
  for (const product of ["esa", "psd"] as Product[]) {
    for (const tier of ["single", "multi"] as Tier[]) {
      if (SUBSCRIPTION_PRICE_IDS[product][tier].first_year === priceId) return true;
    }
  }
  return false;
}
