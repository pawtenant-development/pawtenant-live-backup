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
 * Additional Documentation add-on (optional, purchased AFTER the original letter
 * for a separate landlord / property / HOA form on a STANDARD order).
 * RA-DOCUMENT-WORKFLOW-PORTALS-CONSISTENCY-001 (2026-07-10): owner-approved price
 * raised $40 → $70.
 * TEST-CUSTOMER-PORTAL-ADDON-PRICE-50-001 (2026-07-14): owner-approved price
 * lowered $70 → $50. This is the DISPLAY price for the pre-purchase CTA only; the
 * authoritative charge is computed server-side in create-additional-doc-invoice
 * (ADDON_AMOUNT_CENTS). Historical paid requests keep their own amount_cents and
 * are shown from that value, never relabelled to the current price.
 */
export const ADDITIONAL_DOC_PRICING = {
  addon: 50,
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

/* ───────────────────────────────────────────────────────────────────────────
 * Reasonable Accommodation (RA) letter bundles — PACKAGE-RA-LETTER-BUNDLE-001
 *
 * ESA + Reasonable Accommodation Letter  and  PSD + Reasonable Accommodation
 * Letter are sold as a single combined package on top of the standard letter.
 *
 * FLAT pricing for 1–3 pets/dogs (NOT per-pet, NOT tiered) — owner instruction:
 *   Bundle one-time: $179   ·   Bundle annual: $159/yr
 *
 * The server-side canonical copies live in create-payment-intent/index.ts and
 * create-checkout-session/index.ts — keep all three in sync.
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

export const BUNDLE_PRICING = {
  /** Flat one-time total for the RA bundle (1–3 pets/dogs). */
  oneTime: 179,
  /** Flat annual total for the RA bundle (1–3 pets/dogs). */
  annual: 159,
} as const;

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

/** Flat one-time RA bundle total (1–3 pets/dogs). */
export function getBundleOneTimeTotal(): number {
  return BUNDLE_PRICING.oneTime;
}

/** Flat annual RA bundle total (1–3 pets/dogs). */
export function getBundleAnnualTotal(): number {
  return BUNDLE_PRICING.annual;
}

/**
 * Resolve the displayed total for any package + plan + pet/dog count.
 * Standard packages keep the existing tiered pricing; RA bundles are flat.
 * Mirrors the server-side amount logic (create-payment-intent) exactly.
 */
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
