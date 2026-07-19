/**
 * Package-card OFFER PRESENTATION helper.
 * ASSESSMENT-PACKAGE-CARD-OFFER-PRESENTATION-001.
 *
 * PRESENTATION-ONLY. Given the ALREADY-canonical payable one-time price (which
 * MUST come from src/config/pricing.ts → getPackageTotal(..., "one_time", ...)),
 * this derives three display-only values for the pre-checkout package cards:
 *
 *   - compareAtPrice  = payablePrice + $30   (the crossed-out "regular" rate)
 *   - savings         = $30                  (the "$30 OFF" badge)
 *   - klarnaInstallment = payablePrice / 4   (2-decimal string, e.g. "32.25")
 *
 * These values are NEVER the amount charged. They must never become orders.price,
 * a Stripe / PaymentIntent / Checkout Session / subscription amount, a package
 * base price, the Google Ads conversion value, a refund basis, a provider payout,
 * or a structured-data payable price. Checkout and Google Ads always read the real
 * payable price from src/config/pricing.ts and the server-authoritative amount.
 *
 * The +$30 comparison is generated ONLY here, for the card display. Do NOT add $30
 * to prices anywhere else in the app.
 */

/** Fixed savings shown on every package card. Presentation-only. */
export const PACKAGE_CARD_SAVINGS = 30;

export interface PackageOffer {
  /** Canonical one-time total from pricing.ts ($129 / $149 / $179). */
  payablePrice: number;
  /** Crossed-out comparison price = payablePrice + $30 (display only). */
  compareAtPrice: number;
  /** Savings amount shown in the "$XX OFF" badge (always $30). */
  savings: number;
  /** Klarna 4-payment installment, 2-decimal string derived from payablePrice. */
  klarnaInstallment: string;
}

/**
 * Build the card offer presentation from the canonical payable one-time price.
 * The installment is ALWAYS payablePrice / 4 (never the compare-at price).
 */
export function packageOffer(payablePrice: number): PackageOffer {
  const savings = PACKAGE_CARD_SAVINGS;
  return {
    payablePrice,
    compareAtPrice: payablePrice + savings,
    savings,
    klarnaInstallment: (payablePrice / 4).toFixed(2),
  };
}
