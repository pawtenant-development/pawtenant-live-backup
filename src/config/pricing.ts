/**
 * PawTenant pricing — single source of truth for public/marketing copy.
 *
 * These values MUST match Stripe product catalog and checkout logic in
 * src/pages/assessment/page.tsx → getAssessmentBasePrice() and
 * supabase/functions/create-payment-intent (server-side canonical amounts).
 *
 * FINAL structure (2026-07):
 *   ESA one-time:  1 pet $129 · 2 or 3 pets $149 fixed total
 *   PSD one-time:  1 dog $129 · 2 or 3 dogs $149 fixed total (both speeds)
 *   ESA annual:    1 pet $109/yr · 2 or 3 pets $129/yr fixed total
 *   PSD annual:    1 dog $109/yr · 2 or 3 dogs $129/yr fixed total
 *   Renewal:       $100/yr subscription renewal (create-renewal-checkout)
 *   Consultation:  $79 — 15-minute ESA/PSD requirements call
 * No per-pet add-ons anywhere — multi-pet is always a fixed total.
 */

export const ESA_PRICING = {
  oneTime: 129,
  /** Fixed TOTAL for 2 or 3 pets on the one-time letter (not an add-on). */
  oneTimeMultiPetTotal: 149,
  subscription: 109,
  /** Fixed TOTAL per year for 2 or 3 pets on the annual subscription. */
  subscriptionMultiPetTotal: 129,
} as const;

export const PSD_PRICING = {
  oneTime: 129,
  /** Fixed TOTAL for 2 or 3 dogs on the one-time letter (both speeds). */
  oneTimeMultiDogTotal: 149,
  annual: 109,
  /** Fixed TOTAL per year for 2 or 3 dogs on the annual subscription. */
  annualMultiDogTotal: 129,
  consultation: 79,
} as const;

export const RENEWAL_PRICING = {
  annual: 100,
} as const;

/**
 * One-time ESA letter total by pet count. 1 pet = $129; 2 or 3 pets = $149
 * fixed total. This is the ONLY client-side formula — Step 3 checkout and the
 * assessment page import it so the number can never drift between surfaces.
 * The server-side canonical copy lives in create-payment-intent/index.ts.
 */
export function getEsaOneTimeTotal(petCount: number): number {
  const n = Math.max(1, Math.min(3, petCount));
  return n === 1 ? ESA_PRICING.oneTime : ESA_PRICING.oneTimeMultiPetTotal;
}

/** Annual ESA subscription total by pet count (fixed multi-pet total, no add-on). */
export function getEsaAnnualTotal(petCount: number): number {
  const n = Math.max(1, Math.min(3, petCount));
  return n === 1 ? ESA_PRICING.subscription : ESA_PRICING.subscriptionMultiPetTotal;
}

/** One-time PSD letter total by dog count (both delivery speeds). */
export function getPsdOneTimeTotal(dogCount: number): number {
  const n = Math.max(1, Math.min(3, dogCount));
  return n === 1 ? PSD_PRICING.oneTime : PSD_PRICING.oneTimeMultiDogTotal;
}

/** Annual PSD subscription total by dog count. */
export function getPsdAnnualTotal(dogCount: number): number {
  const n = Math.max(1, Math.min(3, dogCount));
  return n === 1 ? PSD_PRICING.annual : PSD_PRICING.annualMultiDogTotal;
}

export const ESA_PRICE_LABELS = {
  oneTime: "$129",
  oneTimeMultiPetTotal: "$149",
  subscription: "$109",
  subscriptionMultiPetTotal: "$129",
  oneTimeSuffix: "one-time",
  subscriptionSuffix: "/year",
  startingFrom: "$109",
} as const;
