/**
 * deliveryPromise (Deno / Edge) — server-side twin of src/lib/deliveryPromise.ts.
 *
 * CUSTOMER-DELIVERY-24-HOUR-PROMISE-PARITY-001 (owner, 2026-09-04)
 * -----------------------------------------------------------------
 * The SERVER owns the canonical delivery value for every newly created order.
 * A client may still post a legacy `deliverySpeed` ("", "priority", "2-3days",
 * "standard") — the assessment pages did exactly that — and it is discarded:
 * `canonicalDeliverySpeed()` always returns "24h".
 *
 * Every customer-facing email renders the SAME promise, read through
 * `deliveryPromiseLabel()`, never a branch on the stored value.
 *
 * NEVER describe approval or delivery as guaranteed.
 */

/** The one value stamped on every newly created order. */
export const CANONICAL_DELIVERY_SPEED = "24h";

/**
 * Server-owned normalizer. Deliberately ignores its input: no client-supplied
 * legacy option may reintroduce a slower promise.
 */
export function canonicalDeliverySpeed(_clientSupplied?: unknown): string {
  return CANONICAL_DELIVERY_SPEED;
}

/** Approved SHORT wording. */
export const DELIVERY_PROMISE_SHORT = "Typically within 24 hours after provider review";

/** Approved LONG wording. */
export const DELIVERY_PROMISE_LONG =
  "If you qualify after clinical review, your letter is typically delivered within 24 hours.";

/** Order-detail row value used by confirmation / resend / resume emails. */
export const DELIVERY_PROMISE_LABEL = "Within 24 Hours";

/** HTML-entity variant for the emails that hand-render `&mdash;` rows. */
export const DELIVERY_PROMISE_LABEL_HTML = "Within 24 Hours";

/** Turnaround clause used mid-sentence ("your letter is ready …"). */
export const DELIVERY_TURNAROUND_CLAUSE = "typically within 24 hours after provider review";

/**
 * Delivery row for an order, whatever is stored on it. The stored value is
 * accepted for call-site readability only — it can never change the answer.
 */
export function deliveryPromiseLabel(_storedSpeed?: string | null): string {
  return DELIVERY_PROMISE_LABEL;
}

/** Customer-visible Stripe / Klarna line-item suffix for the PSD one-time letter. */
export function psdOneTimeDeliveryDescriptor(): string {
  return "letter delivered digitally, typically within 24 hours after provider review";
}
