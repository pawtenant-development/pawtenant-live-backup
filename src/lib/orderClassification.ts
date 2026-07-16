/**
 * Canonical order refund + queue classification — the single source of truth for
 * how an order's refund state maps to operational behaviour anywhere in the app
 * (admin tabs / KPI counts / badges, customer portal lifecycle, provider queue
 * and letter submission, provider earnings, documents, verification, analytics).
 *
 * PARTIAL-REFUND-TERMINAL-STATE-CONSUMER-FIX-001
 * ----------------------------------------------
 * `refunded_at` is stamped for **partial AND full** refunds. It therefore proves
 * only that *some* refund activity occurred — never that the order is finished,
 * cancelled, or that the customer was made whole. Every consumer that treated a
 * bare `!!refunded_at` as "this order is over" was wrong, and on a partial
 * refund it silently broke fulfilment: the order dropped out of the provider
 * queue, Submit Letter disappeared, assignment was blocked, and the customer's
 * lifecycle regressed — for an order they had *paid for and not been refunded*.
 *
 * The contract (do not weaken any of these):
 *
 *  1. `refunded_at` only proves refund ACTIVITY occurred.
 *  2. `refunded_at` alone NEVER proves a full refund.
 *  3. A positive `refund_amount` alone NEVER proves a full refund.
 *  4. Explicit partial evidence (`refund_status='partial'`) OVERRIDES a stale
 *     `status='refunded'`.
 *  5. A full refund requires AUTHORITATIVE evidence — `refund_status='full'`,
 *     or the legacy hard-refund marker `status='refunded'` absent partial
 *     evidence. Nothing else is sufficient.
 *  6. Cancellation is SEPARATE from refund completeness. `status='cancelled'`
 *     is owned by cancel-order / cancel_order_and_void_earnings and is the ONLY
 *     provider-payout exclusion sentinel.
 *  7. Partial refunds stay OPERATIONAL — the provider still delivers the letter.
 *  8. Unknown or conflicting refund data is NEVER treated as terminal.
 *  9. `orders.price` is NOT the originally-charged amount. A partial refund
 *     rewrites `price` to the NET (see LIVE-PARTIAL-REFUND-VERIFICATION-ID-
 *     RECOVERY-001 §1.3). Never derive refund completeness from `price`.
 * 10. This module classifies; it does not define the refund data contract. The
 *     writers (create-refund, stripe-webhook, cancel-order,
 *     cancel_order_and_void_earnings) are canonical and are not changed here.
 *
 * `refund_status` ('none' | 'partial' | 'full') is the canonical financial
 * marker — backfilled 2026-07-10 and always written by create-refund /
 * stripe-webhook. **Any query whose rows reach this module MUST select
 * `refund_status`**, otherwise a partial refund arrives indistinguishable from
 * a legacy row and rule 4 cannot fire.
 */

/** Minimal structural shape needed to classify an order. Both the canonical
 *  `Order` type and any local order row satisfy this. */
export interface ClassifiableOrder {
  status?: string | null;
  refund_status?: string | null;
  refunded_at?: string | null;
  refund_amount?: number | string | null;
  payment_intent_id?: string | null;
  doctor_email?: string | null;
  doctor_user_id?: string | null;
  doctor_status?: string | null;
}

/**
 * Canonical refund disposition.
 *
 * - `none`           — no refund activity at all.
 * - `partial`        — authoritative partial refund. Stays operational.
 * - `full`           — authoritative full refund, order not cancelled.
 * - `full_cancelled` — authoritative full refund AND explicitly cancelled.
 * - `unknown`        — refund activity happened but completeness is NOT
 *                      authoritatively known. Never terminal (rule 8).
 */
export type RefundDisposition = "none" | "partial" | "full" | "full_cancelled" | "unknown";

function norm(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().trim();
}

function amount(v: number | string | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v === "string") return parseFloat(v);
  return NaN;
}

/**
 * Some refund activity occurred — partial OR full. This is the ONLY thing
 * `refunded_at` is allowed to prove (rule 1). Use it to decide whether to SHOW
 * refund information; never to decide whether an order is finished.
 */
export function hasAnyRefund(o: ClassifiableOrder): boolean {
  if (o.refunded_at) return true;
  const rs = norm(o.refund_status);
  if (rs === "partial" || rs === "full") return true;
  const amt = amount(o.refund_amount);
  if (Number.isFinite(amt) && amt > 0) return true;
  if (norm(o.status) === "refunded") return true;
  return false;
}

/** Authoritative partial refund. The order remains operational (rule 7). */
export function isPartialRefund(o: ClassifiableOrder): boolean {
  return norm(o.refund_status) === "partial";
}

/**
 * Authoritative FULL refund — the customer has been made financially whole.
 *
 * Requires authoritative evidence (rule 5). Explicit partial evidence wins over
 * a stale `status='refunded'` (rule 4). A bare `refunded_at` or a positive
 * `refund_amount` is NEVER sufficient (rules 2, 3) — such a row is `unknown`
 * and stays operational (rule 8).
 */
export function isFullRefund(o: ClassifiableOrder): boolean {
  if (isPartialRefund(o)) return false;              // rule 4 — partial wins over stale status
  if (norm(o.refund_status) === "full") return true; // rule 5 — canonical marker
  if (norm(o.status) === "refunded") return true;    // rule 5 — legacy hard-refund marker
  return false;                                      // rules 2, 3, 8
}

/**
 * The refund itself ends the order. TRUE only for an authoritative full refund.
 * A partial refund is NEVER refund-terminal.
 */
export function isRefundTerminal(o: ClassifiableOrder): boolean {
  return isFullRefund(o);
}

/**
 * Explicit operational cancellation — owned by cancel-order /
 * cancel_order_and_void_earnings. Independent of refund completeness (rule 6),
 * and the ONLY provider-payout exclusion sentinel.
 */
export function isOperationallyCancelled(o: ClassifiableOrder): boolean {
  return norm(o.status) === "cancelled";
}

/** The canonical refund disposition for display, analytics and gating. */
export function refundDisposition(o: ClassifiableOrder): RefundDisposition {
  if (!hasAnyRefund(o)) return "none";
  if (isPartialRefund(o)) return "partial";
  if (isFullRefund(o)) return isOperationallyCancelled(o) ? "full_cancelled" : "full";
  return "unknown"; // refund activity, no authoritative completeness — rule 8
}

/** Human label for the disposition. Safe for admin/provider-facing UI. */
export function refundDispositionLabel(d: RefundDisposition): string {
  switch (d) {
    case "none": return "No refund";
    case "partial": return "Partial refund";
    case "full": return "Full refund";
    case "full_cancelled": return "Full refund + cancelled";
    case "unknown": return "Refund activity — completeness unknown";
  }
}

/**
 * Back-compat alias for the original REFUNDED-ORDER-QUEUE-CLASSIFICATION-001
 * helper, now expressed in terms of the canonical contract.
 *
 * Behaviour is IDENTICAL to the pre-fix implementation on every row that exists
 * in TEST or LIVE. The only divergence is the `unknown` shape — `refunded_at`
 * set, `refund_status='none'`, `status` not 'refunded' — which the old code
 * treated as a full refund and which rule 8 now keeps operational.
 *
 * `orders.refund_status` is `NOT NULL DEFAULT 'none'` in BOTH databases
 * (verified 2026-07-17), so a true NULL is structurally impossible; the shape
 * can only ever be 'none'. A census on 2026-07-17 found 0 such rows in TEST and
 * 0 in LIVE, so this change cannot move any existing order between queues.
 */
export function isFullyRefunded(o: ClassifiableOrder): boolean {
  return isFullRefund(o);
}

/** Refund + Cancel sets the lifecycle status to 'cancelled'. */
export function isCancelled(o: ClassifiableOrder): boolean {
  return isOperationallyCancelled(o);
}

/**
 * Membership of the "Refunded" tab: fully refunded OR cancelled. An active
 * partial Refund Only is intentionally excluded — it stays in its active
 * operational queue.
 */
export function isRefundedBucket(o: ClassifiableOrder): boolean {
  return isFullRefund(o) || isOperationallyCancelled(o);
}

/** No confirmed payment yet (lead / unpaid). */
export function isLeadOrder(o: ClassifiableOrder): boolean {
  return !o.payment_intent_id || norm(o.status) === "lead";
}

/** Letter delivered to the customer. */
export function isCompletedOrder(o: ClassifiableOrder): boolean {
  return o.doctor_status === "patient_notified";
}

function hasProvider(o: ClassifiableOrder): boolean {
  return !!o.doctor_email || !!o.doctor_user_id;
}

/**
 * The order is still live work: paid, not fully refunded, not cancelled. A
 * partial refund is operational (rule 7), so this stays TRUE for it.
 */
export function isOperationallyActive(o: ClassifiableOrder): boolean {
  return !isLeadOrder(o) && !isRefundTerminal(o) && !isOperationallyCancelled(o);
}

/**
 * PROVIDER / OPERATIONAL work lock — "REFUND-ONLY-OPERATIONAL", the LIVE
 * canonical doctrine (LIVE `014f96c` + `1d3fe0c`, and the comment on LIVE
 * `provider-portal/page.tsx`: *"operational workflow is controlled by the
 * order's cancellation state, NOT by any refund field … Never key on
 * refund_status / refunded_at / refund_amount"*).
 *
 * A **Refund Only — partial OR full** keeps the order operational, because a
 * refund can be an over-charge/coupon correction or a goodwill gesture and the
 * customer is still owed their letter. Only an explicit cancellation
 * (`status='cancelled'`, owned by cancel-order) or the legacy hard-refund
 * marker (`status='refunded'`) stops the work.
 *
 * This is DELIBERATELY narrower than `isRefundedBucket()`:
 *
 *   • `isWorkStopped`     — OPERATIONAL view (provider queue, Submit Letter,
 *                            provider earnings visibility). Ignores refund_status.
 *   • `isRefundedBucket`  — FINANCIAL view (admin Orders "Refunded" tab, KPI
 *                            counts, analytics). Counts refund_status='full'.
 *
 * The two therefore disagree on a FULL Refund Only: admin files it under
 * Refunded while the provider still delivers. That split is pre-existing and
 * intentional in LIVE, and is preserved here rather than redesigned.
 *
 * One deliberate hardening over LIVE's literal `status==='cancelled' ||
 * status==='refunded'`: rule 4 is applied first, so a PARTIAL refund carrying a
 * STALE `status='refunded'` (the PT-MR1HX27H shape) can never stop the work.
 * Cancellation still wins over everything (rule 6). No such stale row exists in
 * TEST or LIVE today (census 2026-07-17), so this is behaviourally identical to
 * LIVE on all real data — it just cannot regress if one is ever written again.
 */
export function isWorkStopped(o: ClassifiableOrder): boolean {
  if (isOperationallyCancelled(o)) return true; // rule 6 — cancel-order always wins
  if (isPartialRefund(o)) return false;         // rule 4 — partial beats stale 'refunded'
  return norm(o.status) === "refunded";         // legacy hard-refund marker
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
 *
 * Deliberately UNCHANGED by PARTIAL-REFUND-TERMINAL-STATE-CONSUMER-FIX-001 —
 * these are LIVE-canonical and byte-identical across TEST/LIVE. They are
 * marginally stricter than the client classifier on the `unknown` shape only,
 * which has 0 rows in both databases, so the list and the counts cannot
 * disagree on any real order. Relaxing them would change admin KPI SQL for no
 * data benefit.
 */
export const EXCLUDE_FULL_REFUND_OR = "refund_status.is.null,refund_status.neq.full";
export const EXCLUDE_REFUNDED_AT_OR = "refunded_at.is.null,refund_status.eq.partial";
