/**
 * PawTenant pricing — single source of truth for public/marketing copy AND the
 * client mirror of the server-authoritative charge amounts.
 *
 * These values MUST match Stripe product catalog and checkout logic in
 * src/pages/assessment/page.tsx → getAssessmentBasePrice() and
 * supabase/functions/create-payment-intent (server-side canonical amounts).
 *
 * FINAL structure (owner-approved 2026-07, phased subscriptions):
 *   ESA/PSD one-time:      1 pet/dog $129 · 2–3 pets/dogs $149 fixed total
 *   ESA/PSD subscription:  FIRST YEAR  1 → $115 · 2–3 → $135 fixed total
 *                          RENEWAL yr2+ 1 → $100 · 2–3 → $115 fixed total
 *   ESA/PSD + RA Combo:    one-time $179 · annual $159 FLAT (no year-two drop)
 *   Consultation:          RETIRED (no active $79 purchase path; historical only)
 * No per-pet add-ons anywhere — multi-pet is always a fixed total.
 *
 * The subscription amount charged TODAY is the FIRST-YEAR price; the RENEWAL
 * price is what Stripe bills from year two on (a Subscription Schedule flips the
 * subscription to the renewal Price after the first annual period). Never render
 * the first-year amount as the permanent annual amount.
 */

/* ───────────────────────────────────────────────────────────────────────────
 * CANONICAL MATRIX — the ONE immutable source. Every helper below reads from it.
 * Package identity is NEVER inferred from an amount; it is always looked up by
 * (product, package, plan, tier, phase). Frozen so no caller can mutate it.
 * ─────────────────────────────────────────────────────────────────────────── */

export type Product = "esa" | "psd";
export type Tier = "single" | "multi";
export type PricePhase = "initial" | "renewal";

/** Standard letter matrix, whole dollars. Same numbers for ESA and PSD. */
const STANDARD_MATRIX = Object.freeze({
  oneTime:   Object.freeze({ single: 129, multi: 149 }),
  firstYear: Object.freeze({ single: 115, multi: 135 }),
  renewal:   Object.freeze({ single: 100, multi: 115 }),
});

/** Combo (ESA/PSD + Reasonable Accommodation letter) — flat, no year-two drop. */
const COMBO_MATRIX = Object.freeze({
  oneTime: 179,
  firstYear: 159,
  renewal: 159, // combo does NOT reduce at renewal
});

/** Clamp a raw pet/dog count to the single/multi tier (1 → single, 2–3 → multi). */
export function petTier(petCount: number): Tier {
  const n = Math.max(1, Math.min(3, Math.floor(petCount || 1)));
  return n === 1 ? "single" : "multi";
}

/* ───────────────────────────────────────────────────────────────────────────
 * Legacy constant exports — VALUES updated to the new matrix, NAMES preserved so
 * every existing import keeps working. `subscription`/`annual` now carry the
 * FIRST-YEAR amount (what the customer pays today); renewal amounts are separate.
 * ─────────────────────────────────────────────────────────────────────────── */

export const ESA_PRICING = {
  oneTime: STANDARD_MATRIX.oneTime.single,                 // 129
  oneTimeMultiPetTotal: STANDARD_MATRIX.oneTime.multi,     // 149
  subscription: STANDARD_MATRIX.firstYear.single,          // 115 (first year)
  subscriptionMultiPetTotal: STANDARD_MATRIX.firstYear.multi, // 135 (first year)
  renewal: STANDARD_MATRIX.renewal.single,                 // 100
  renewalMultiPetTotal: STANDARD_MATRIX.renewal.multi,     // 115
} as const;

export const PSD_PRICING = {
  oneTime: STANDARD_MATRIX.oneTime.single,                 // 129
  oneTimeMultiDogTotal: STANDARD_MATRIX.oneTime.multi,     // 149
  annual: STANDARD_MATRIX.firstYear.single,               // 115 (first year)
  annualMultiDogTotal: STANDARD_MATRIX.firstYear.multi,   // 135 (first year)
  renewal: STANDARD_MATRIX.renewal.single,                // 100
  renewalMultiDogTotal: STANDARD_MATRIX.renewal.multi,    // 115
  /** RETIRED 2026-07 — no active $79 consultation purchase path. Kept only so
   *  historical references resolve; never surfaced in any new-purchase flow. */
  consultation: 79,
} as const;

export const RENEWAL_PRICING = {
  /** Single-tier annual renewal (back-compat alias). */
  annual: STANDARD_MATRIX.renewal.single,   // 100
  single: STANDARD_MATRIX.renewal.single,   // 100
  multi: STANDARD_MATRIX.renewal.multi,     // 115
} as const;

/**
 * Additional Documentation add-on (optional, purchased AFTER the original letter
 * for a separate landlord / property / HOA form on a STANDARD order). DISPLAY
 * price for the pre-purchase CTA only; the authoritative charge is computed
 * server-side in create-additional-doc-invoice. Out of scope for the phased
 * subscription change.
 */
export const ADDITIONAL_DOC_PRICING = {
  addon: 50,
} as const;

export const BUNDLE_PRICING = {
  /** Flat one-time total for the RA bundle (1–3 pets/dogs). */
  oneTime: COMBO_MATRIX.oneTime,   // 179
  /** Flat annual total for the RA bundle (1–3 pets/dogs) — first year AND renewal. */
  annual: COMBO_MATRIX.firstYear,  // 159
} as const;

export const ESA_PRICE_LABELS = {
  oneTime: `$${STANDARD_MATRIX.oneTime.single}`,             // $129
  oneTimeMultiPetTotal: `$${STANDARD_MATRIX.oneTime.multi}`, // $149
  subscription: `$${STANDARD_MATRIX.firstYear.single}`,      // $115 (first year)
  subscriptionMultiPetTotal: `$${STANDARD_MATRIX.firstYear.multi}`, // $135
  renewal: `$${STANDARD_MATRIX.renewal.single}`,             // $100
  oneTimeSuffix: "one-time",
  subscriptionSuffix: "/year",
  startingFrom: `$${STANDARD_MATRIX.firstYear.single}`,      // $115
} as const;

/* ───────────────────────────────────────────────────────────────────────────
 * Package identity + display names.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Canonical package identifiers used across UI, checkout body, Stripe metadata,
 *  and the orders.package_key column. */
export type PackageKey =
  | "esa_standard"
  | "esa_ra_bundle"
  | "psd_standard"
  | "psd_ra_bundle";

/** Billing plan identifiers stored in orders.billing_plan (distinct from the
 *  legacy display string orders.plan_type). */
export type BillingPlan = "one_time" | "annual";

export const PACKAGE_DISPLAY_NAMES: Record<PackageKey, string> = {
  esa_standard: "ESA Letter",
  esa_ra_bundle: "ESA + Reasonable Accommodation Letter",
  psd_standard: "PSD Documentation",
  psd_ra_bundle: "PSD + Reasonable Accommodation Letter",
};

/** True when a package includes the Reasonable Accommodation letter add-on. */
export function isRaBundle(packageKey: string | null | undefined): boolean {
  return packageKey === "esa_ra_bundle" || packageKey === "psd_ra_bundle";
}

/** Product ("esa" | "psd") for a package key. */
export function packageProduct(packageKey: PackageKey): Product {
  return packageKey === "psd_standard" || packageKey === "psd_ra_bundle" ? "psd" : "esa";
}

/* ───────────────────────────────────────────────────────────────────────────
 * One-time totals (unchanged $129 / $149).
 * ─────────────────────────────────────────────────────────────────────────── */

export function getEsaOneTimeTotal(petCount: number): number {
  return STANDARD_MATRIX.oneTime[petTier(petCount)];
}
export function getPsdOneTimeTotal(dogCount: number): number {
  return STANDARD_MATRIX.oneTime[petTier(dogCount)];
}

/* ───────────────────────────────────────────────────────────────────────────
 * Subscription FIRST-YEAR totals (what the customer pays today: $115 / $135).
 * Legacy names getEsaAnnualTotal / getPsdAnnualTotal are preserved but now
 * return the FIRST-YEAR amount.
 * ─────────────────────────────────────────────────────────────────────────── */

export function getEsaAnnualTotal(petCount: number): number {
  return STANDARD_MATRIX.firstYear[petTier(petCount)];
}
export function getPsdAnnualTotal(dogCount: number): number {
  return STANDARD_MATRIX.firstYear[petTier(dogCount)];
}

/* ───────────────────────────────────────────────────────────────────────────
 * Subscription RENEWAL totals (year two onward: $100 / $115).
 * ─────────────────────────────────────────────────────────────────────────── */

export function getEsaRenewalTotal(petCount: number): number {
  return STANDARD_MATRIX.renewal[petTier(petCount)];
}
export function getPsdRenewalTotal(dogCount: number): number {
  return STANDARD_MATRIX.renewal[petTier(dogCount)];
}

/* ───────────────────────────────────────────────────────────────────────────
 * Combo (RA bundle) totals — flat, no renewal drop.
 * ─────────────────────────────────────────────────────────────────────────── */

export function getBundleOneTimeTotal(): number { return COMBO_MATRIX.oneTime; }   // 179
export function getBundleAnnualTotal(): number { return COMBO_MATRIX.firstYear; }  // 159
export function getBundleRenewalTotal(): number { return COMBO_MATRIX.renewal; }   // 159

/* ───────────────────────────────────────────────────────────────────────────
 * Package resolvers — the amount DUE TODAY (one-time, or subscription first year)
 * and the RENEWAL amount, keyed purely by identity. Mirrors the server exactly.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Amount due today for a package + plan + count (one-time total, or first-year
 *  subscription total). Signature preserved for existing callers. */
export function getPackageTotal(
  packageKey: PackageKey,
  plan: BillingPlan,
  petCount: number,
): number {
  switch (packageKey) {
    case "esa_ra_bundle":
    case "psd_ra_bundle":
      return plan === "annual" ? getBundleAnnualTotal() : getBundleOneTimeTotal();
    case "psd_standard":
      return plan === "annual" ? getPsdAnnualTotal(petCount) : getPsdOneTimeTotal(petCount);
    case "esa_standard":
    default:
      return plan === "annual" ? getEsaAnnualTotal(petCount) : getEsaOneTimeTotal(petCount);
  }
}

/** Renewal amount (year two onward) for a subscription package + count.
 *  Combo stays flat at $159. */
export function getPackageRenewal(packageKey: PackageKey, petCount: number): number {
  switch (packageKey) {
    case "esa_ra_bundle":
    case "psd_ra_bundle":
      return getBundleRenewalTotal();
    case "psd_standard":
      return getPsdRenewalTotal(petCount);
    case "esa_standard":
    default:
      return getEsaRenewalTotal(petCount);
  }
}

/* ───────────────────────────────────────────────────────────────────────────
 * Full price quote — the deterministic contract the checkout disclosure and the
 * server parity test both read. Coupons apply to ONE-TIME purchases only.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface PriceQuote {
  packageKey: PackageKey;
  plan: BillingPlan;
  tier: Tier;
  isCombo: boolean;
  oneTimePrice: number;
  firstYearPrice: number;
  renewalPrice: number;
  /** What Stripe charges today: one-time total, or first-year subscription total. */
  amountDueToday: number;
  discountAmount: number;
  /** amountDueToday − discountAmount (subscriptions never take a public coupon). */
  finalAmount: number;
}

export function quotePackage(
  packageKey: PackageKey,
  plan: BillingPlan,
  petCount: number,
  couponDiscount = 0,
): PriceQuote {
  const isCombo = isRaBundle(packageKey);
  const oneTimePrice = getPackageTotal(packageKey, "one_time", petCount);
  const firstYearPrice = getPackageTotal(packageKey, "annual", petCount);
  const renewalPrice = getPackageRenewal(packageKey, petCount);
  const amountDueToday = plan === "annual" ? firstYearPrice : oneTimePrice;
  // Public coupons apply to one-time purchases only.
  const discountAmount = plan === "one_time" ? Math.max(0, Math.min(couponDiscount, amountDueToday)) : 0;
  return {
    packageKey,
    plan,
    tier: petTier(petCount),
    isCombo,
    oneTimePrice,
    firstYearPrice,
    renewalPrice,
    amountDueToday,
    discountAmount,
    finalAmount: Math.max(0, amountDueToday - discountAmount),
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Stripe subscription lookup_keys — the canonical keys the server resolves to
 * provisioned Price IDs (pricing_stripe_map). Combo has no phased Price (flat
 * inline price_data), so returns null. Used by the frontend↔server parity test.
 * ─────────────────────────────────────────────────────────────────────────── */

export function subscriptionLookupKeys(
  packageKey: PackageKey,
  petCount: number,
): { firstYear: string; renewal: string } | null {
  if (isRaBundle(packageKey)) return null; // combo = inline flat price, no schedule
  const product = packageProduct(packageKey);
  const tier = petTier(petCount);
  return {
    firstYear: `pawtenant_${product}_${tier}_first_year_v1`,
    renewal: `pawtenant_${product}_${tier}_renewal_v1`,
  };
}
