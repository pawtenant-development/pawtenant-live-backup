/**
 * deliveryPromise — THE single source of the customer-facing letter-delivery
 * promise, and the compatibility reader for the legacy `orders.delivery_speed`
 * column.
 *
 * CUSTOMER-DELIVERY-24-HOUR-PROMISE-PARITY-001 (owner, 2026-09-04)
 * -----------------------------------------------------------------
 * PawTenant no longer sells a 2–3-day delivery option. Every ESA and PSD
 * customer-facing surface states the SAME promise, regardless of what is stored
 * on the order.
 *
 * WHY A READER AND NOT A BACKFILL: 373 ESA orders carry NULL, 88 carry "", 58
 * carry "2-3days"; 15 PSD orders carry "priority" and 2 carry "standard".
 * Historical rows are business records — they are not rewritten for display.
 * Every legacy value therefore normalizes to the one canonical value HERE, at
 * read time, and the server stamps the canonical value on every NEW order.
 *
 * NEVER describe approval or delivery as guaranteed. The promise is "typically",
 * and it is conditioned on provider review.
 */

/** The one value the server stamps on every newly created order. */
export const CANONICAL_DELIVERY_SPEED = "24h";

/**
 * Every legacy `delivery_speed` value that has ever been written to an order.
 * Kept explicit so the guard and the tests can enumerate them.
 */
export const LEGACY_DELIVERY_SPEEDS = [
  "",
  "2-3days",
  "standard",
  "priority",
  "24h",
  "24hours",
] as const;

/**
 * Compatibility reader. NULL, blank, "2-3days", "standard", "priority",
 * "24h", "24hours" — and anything unrecognised — all resolve to the canonical
 * value. There is deliberately no branch that can return a slower speed.
 */
export function normalizeDeliverySpeed(_raw?: string | null): typeof CANONICAL_DELIVERY_SPEED {
  return CANONICAL_DELIVERY_SPEED;
}

/** Approved SHORT wording. Inline sentences, table cells, feature bullets. */
export const DELIVERY_PROMISE_SHORT = "Typically within 24 hours after provider review";

/** Approved LONG wording. Hero copy, confirmations, "what happens next". */
export const DELIVERY_PROMISE_LONG =
  "If you qualify after clinical review, your letter is typically delivered within 24 hours.";

/** Compact form for tight data grids. Still hedged — never a guarantee. */
export const DELIVERY_PROMISE_COMPACT = "Typically within 24 hrs";

/** Label for the order's delivery row in emails and the portal overview. */
export const DELIVERY_PROMISE_LABEL = "Within 24 Hours";

/**
 * The customer-facing promise for an order. The stored speed is accepted only
 * so call sites read naturally — it can never change the answer.
 */
export function deliveryPromiseShort(_storedSpeed?: string | null): string {
  return DELIVERY_PROMISE_SHORT;
}

export function deliveryPromiseLong(_storedSpeed?: string | null): string {
  return DELIVERY_PROMISE_LONG;
}
