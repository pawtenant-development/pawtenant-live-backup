/**
 * Canonical order-queue classification — single source of truth for how an
 * order maps to the admin Orders tabs / KPI counts / OrderCard badge.
 *
 * REFUNDED-ORDER-QUEUE-CLASSIFICATION-001
 * --------------------------------------
 * Refund state takes precedence over lifecycle status. A financially
 * fully-refunded order (full Stripe refund) OR a Refund + Cancel (status
 * 'cancelled') OR a legacy hard-refund (status 'refunded') must drop out of
 * every ACTIVE fulfilment queue — Paid (Unassigned) and Under Review — and be
 * counted only under Refunded.
 *
 * The Refund-Only operational unlock is preserved: a *partial* Refund Only on
 * an otherwise-active order (refund_status = 'partial') keeps its active status
 * so the provider still delivers the letter. Partial-active orders therefore
 * stay in their active queue and are intentionally NOT forced into Refunded.
 *
 * `refund_status` ('none' | 'partial' | 'full') is the canonical financial
 * marker (backfilled 2026-07-10, always written by create-refund /
 * stripe-webhook). `refunded_at` is set on any refund; `status` carries legacy
 * 'refunded' and Refund + Cancel 'cancelled'. This helper reconciles all three
 * so the list, the KPI counts, the banner and the badge can never disagree.
 */

/** Minimal structural shape needed to classify an order. Both the canonical
 *  `Order` type and any local order row satisfy this. */
export interface ClassifiableOrder {
  status?: string | null;
  refund_status?: string | null;
  refunded_at?: string | null;
  payment_intent_id?: string | null;
  doctor_email?: string | null;
  doctor_user_id?: string | null;
  doctor_status?: string | null;
}

/**
 * True when the customer has been made financially whole (full refund) or the
 * order carries a legacy/hard refund marker. Such an order must never sit in an
 * active fulfilment queue. A partial Refund Only is deliberately NOT fully
 * refunded — it stays operational.
 */
export function isFullyRefunded(o: ClassifiableOrder): boolean {
  if (o.status === "refunded") return true;        // legacy hard-refund / explicit refunded status
  if (o.refund_status === "full") return true;     // full Stripe refund (Refund Only or Refund + Cancel)
  // Any other refund marker that is NOT an active partial → treat as fully
  // refunded. Covers legacy rows where refund_status was never written and
  // honours the owner directive that pre-refactor refunds count as terminal.
  if (o.refunded_at && o.refund_status !== "partial") return true;
  return false;
}

/** Refund + Cancel sets the lifecycle status to 'cancelled'. */
export function isCancelled(o: ClassifiableOrder): boolean {
  return o.status === "cancelled";
}

/**
 * Membership of the "Refunded" tab: fully refunded OR Refund + Cancel. An
 * active partial Refund Only is intentionally excluded here — it stays in its
 * active operational queue.
 */
export function isRefundedBucket(o: ClassifiableOrder): boolean {
  return isFullyRefunded(o) || isCancelled(o);
}

/** No confirmed payment yet (lead / unpaid). */
export function isLeadOrder(o: ClassifiableOrder): boolean {
  return !o.payment_intent_id || o.status === "lead";
}

/** Letter delivered to the customer. */
export function isCompletedOrder(o: ClassifiableOrder): boolean {
  return o.doctor_status === "patient_notified";
}

function hasProvider(o: ClassifiableOrder): boolean {
  return !!o.doctor_email || !!o.doctor_user_id;
}

/** Financially active, paid, awaiting first provider assignment. */
export function isPaidUnassigned(o: ClassifiableOrder): boolean {
  return !isLeadOrder(o) && !isRefundedBucket(o) && !isCompletedOrder(o) && !hasProvider(o);
}

/** Financially active, paid, provider assigned and working (not yet delivered). */
export function isUnderReview(o: ClassifiableOrder): boolean {
  return !isLeadOrder(o) && !isRefundedBucket(o) && !isCompletedOrder(o) && hasProvider(o);
}

/**
 * Eligible to receive / keep a provider assignment. Blocked once fully refunded
 * or cancelled or completed; an active partial Refund Only stays assignable so
 * the provider can still deliver.
 */
export function isAssignable(o: ClassifiableOrder): boolean {
  return !isLeadOrder(o) && !isRefundedBucket(o) && !isCompletedOrder(o);
}

/**
 * PostgREST `.or()` arms that mirror isFullyRefunded() on the server so KPI
 * count queries can never disagree with the client-side list. Apply BOTH, in
 * addition to `.neq('status','cancelled').neq('status','refunded')`, to exclude
 * every refunded/cancelled order while keeping active partials.
 */
export const EXCLUDE_FULL_REFUND_OR = "refund_status.is.null,refund_status.neq.full";
export const EXCLUDE_REFUNDED_AT_OR = "refunded_at.is.null,refund_status.eq.partial";
