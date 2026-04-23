/**
 * PawTenant pricing — single source of truth for public/marketing copy.
 *
 * These values MUST match Stripe product catalog and checkout logic in
 * src/pages/assessment/page.tsx → getAssessmentBasePrice().
 *
 * ESA Letter:
 *   - One-Time base: $110 (+$25 per extra pet add-on)
 *   - Annual Subscription base: $99/year (+$20/year per extra pet add-on)
 */

export const ESA_PRICING = {
  oneTime: 110,
  oneTimeAddOn: 25,
  subscription: 99,
  subscriptionAddOn: 20,
} as const;

export const ESA_PRICE_LABELS = {
  oneTime: "$110",
  oneTimeAddOn: "$25",
  subscription: "$99",
  subscriptionAddOn: "$20",
  oneTimeSuffix: "one-time",
  subscriptionSuffix: "/year",
  startingFrom: "$99",
} as const;
