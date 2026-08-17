/**
 * ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001
 *
 * The single client-side source of truth for order lifecycle DATES and for the
 * PAYMENT-vs-WORKFLOW state split. Pure functions only — no Supabase, no React,
 * no side effects — so the guard script can import and assert against it.
 *
 * ── Date semantics (mirrors the DB contract) ─────────────────────────────────
 *
 *   created_at                    IMMUTABLE  lead/order record created. Never
 *                                            rewritten by payment, reopen,
 *                                            upload or completion. Lead-cohort
 *                                            reporting keys on this.
 *   paid_at                       IMMUTABLE  FIRST successful payment. Unique
 *                                            paid-order reporting keys on this.
 *   last_payment_at               MUTABLE    latest successful payment, incl.
 *                                            add-ons / upgrades / renewals.
 *   first_completed_at            IMMUTABLE  first fulfilment.
 *   last_completed_at             MUTABLE    latest fulfilment (reissue).
 *   last_reopened_at              MUTABLE    latest genuine reopening.
 *   last_meaningful_activity_at   MUTABLE    DEFAULT ADMIN ORDERS SORT KEY.
 *   last_meaningful_activity_type MUTABLE    which business event set it.
 *
 * ── Why not `updated_at` ─────────────────────────────────────────────────────
 *
 * `orders` has no `updated_at`, and none is added. The sort key is written ONLY
 * by a real business transition (see MEANINGFUL_EVENT_TYPES). Attribution
 * enrichment, Google Ads / Meta upload status, GHL sync stamps, email-delivery
 * metadata, follow-up sequence markers, read markers, cron heartbeats and
 * background reconciliation change no column the DB trigger inspects, so they
 * can never move an order to the top of the list.
 *
 * ── Why payment and workflow are separate ────────────────────────────────────
 *
 * An order can validly be `payment=paid` + `workflow=reopened`. Forcing that
 * into one overloaded `status` is what made the list confusing. These two
 * derivations are independent and neither writes anything.
 */

import {
  isFullRefund,
  isPartialRefund,
  isOperationallyCancelled,
  type ClassifiableOrder,
} from "./orderClassification";
import { businessWallClockToUtc } from "./businessTime";

// ═══════════════════════════════════════════════════════════════════════════
// Meaningful business events — the server-controlled vocabulary
// ═══════════════════════════════════════════════════════════════════════════

export const MEANINGFUL_EVENT_TYPES = [
  "lead_created",
  "payment_received",
  "additional_payment_received",
  "order_reopened",
  "document_uploaded",
  "provider_assigned",
  "provider_reassigned",
  "moved_under_review",
  "provider_completed",
  "customer_notified",
  "refund_completed",
  "order_cancelled",
] as const;

export type LifecycleEventType = (typeof MEANINGFUL_EVENT_TYPES)[number];

/**
 * Writes that are explicitly NOT meaningful. Listed so the contract is testable
 * and so a future change that starts stamping activity from one of these is
 * caught by the guard rather than discovered as "everything jumped to the top".
 */
export const NON_MEANINGFUL_WRITE_FIELDS = [
  "ghl_synced_at",
  "ghl_last_attempt_at",
  "ghl_contact_id",
  "ghl_sync_error",
  "google_ads_uploaded_at",
  "google_ads_upload_status",
  "google_ads_last_attempt_at",
  "google_ads_upload_error",
  "microsoft_ads_uploaded_at",
  "microsoft_ads_upload_status",
  "meta_capi_sent_at",
  "meta_capi_status",
  "sent_to_meta",
  "email_log",
  "email_confirmation_sent",
  "sms_confirmation_sent",
  "seq_30min_sent_at",
  "seq_24h_sent_at",
  "seq_3day_sent_at",
  "seq_48h_sent_at",
  "seq_5day_sent_at",
  "sent_followup_at",
  "last_broadcast_sent_at",
  "attribution_json",
  "first_touch_json",
  "last_touch_json",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "email_sha256",
  "phone_sha256",
] as const;

const EVENT_LABEL: Record<LifecycleEventType, string> = {
  lead_created: "Lead created",
  payment_received: "Payment received",
  additional_payment_received: "Additional payment received",
  order_reopened: "Reopened",
  document_uploaded: "Document uploaded",
  provider_assigned: "Provider assigned",
  provider_reassigned: "Provider reassigned",
  moved_under_review: "Moved under review",
  provider_completed: "Provider completed",
  customer_notified: "Customer notified",
  refund_completed: "Refund completed",
  order_cancelled: "Cancelled",
};

const EVENT_ICON: Record<LifecycleEventType, string> = {
  lead_created: "ri-user-add-line",
  payment_received: "ri-bank-card-line",
  additional_payment_received: "ri-add-circle-line",
  order_reopened: "ri-refresh-line",
  document_uploaded: "ri-upload-cloud-2-line",
  provider_assigned: "ri-user-follow-line",
  provider_reassigned: "ri-user-shared-line",
  moved_under_review: "ri-search-eye-line",
  provider_completed: "ri-draft-line",
  customer_notified: "ri-mail-check-line",
  refund_completed: "ri-refund-2-line",
  order_cancelled: "ri-close-circle-line",
};

export function isLifecycleEventType(v: unknown): v is LifecycleEventType {
  return typeof v === "string" && (MEANINGFUL_EVENT_TYPES as readonly string[]).includes(v);
}

export function lifecycleEventLabel(v: string | null | undefined): string {
  return isLifecycleEventType(v) ? EVENT_LABEL[v] : "Activity";
}

export function lifecycleEventIcon(v: string | null | undefined): string {
  return isLifecycleEventType(v) ? EVENT_ICON[v] : "ri-time-line";
}

// ═══════════════════════════════════════════════════════════════════════════
// The sort key
// ═══════════════════════════════════════════════════════════════════════════

/** Structural shape needed for lifecycle date reasoning. */
export interface LifecycleOrder extends ClassifiableOrder {
  created_at?: string | null;
  paid_at?: string | null;
  last_payment_at?: string | null;
  first_completed_at?: string | null;
  last_completed_at?: string | null;
  last_reopened_at?: string | null;
  last_meaningful_activity_at?: string | null;
  last_meaningful_activity_type?: string | null;
  patient_notification_sent_at?: string | null;
  official_letter_reopened_at?: string | null;
  official_letter_final_completed_at?: string | null;
  payment_failed_at?: string | null;
  payment_failure_reason?: string | null;
  dispute_id?: string | null;
  id?: string | null;
  // MONTH-END-...-001 §D/§E — trigger-maintained lifecycle ENTRY timestamps
  // (backfilled from order_status_logs on TEST; NULL = event never observed).
  last_under_review_entered_at?: string | null;
  last_pending_delivery_entered_at?: string | null;
  last_cancelled_at?: string | null;
}

function ms(ts: string | null | undefined): number {
  if (!ts) return 0;
  const t = new Date(ts).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * The instant the Admin Orders list sorts on. Falls back to `created_at` so an
 * order can never fall out of the list, and so a row written before this feature
 * existed still sorts sensibly.
 *
 * NEVER falls back to a generic modification timestamp — that is the whole point.
 */
export function orderActivityAt(o: LifecycleOrder): number {
  return ms(o.last_meaningful_activity_at) || ms(o.created_at);
}

/** ISO string form of {@link orderActivityAt}, or null when nothing is known. */
export function orderActivityIso(o: LifecycleOrder): string | null {
  return o.last_meaningful_activity_at ?? o.created_at ?? null;
}

export function orderActivityType(o: LifecycleOrder): LifecycleEventType {
  return isLifecycleEventType(o.last_meaningful_activity_type)
    ? o.last_meaningful_activity_type
    : "lead_created";
}

// ═══════════════════════════════════════════════════════════════════════════
// Date basis — ONE selector drives the list sort, the day ribbons, the From/To
// date filter and the KPI cards.
// ═══════════════════════════════════════════════════════════════════════════
//
// Sorting by latest activity while silently filtering by `created_at` is exactly
// the ambiguity this task exists to remove, so the two are deliberately the SAME
// control. Default is `activity`, so a June lead that pays in July appears in
// July operational activity while its acquisition history stays reachable via
// the `created` basis.

export type OrderDateBasis =
  | "activity" | "created" | "first_paid" | "completed"
  | "under_review_entered" | "pending_delivery_entered";

export const ORDER_DATE_BASES: readonly OrderDateBasis[] = [
  "activity", "created", "first_paid", "completed",
  "under_review_entered", "pending_delivery_entered",
] as const;

export const ORDER_DATE_BASIS_LABEL: Record<OrderDateBasis, string> = {
  activity: "Latest activity",
  created: "Created date",
  first_paid: "First paid date",
  completed: "Completed date",
  under_review_entered: "Entered review date",
  pending_delivery_entered: "Entered delivery date",
};

export const ORDER_DATE_BASIS_HINT: Record<OrderDateBasis, string> = {
  activity:
    "Newest business activity first — payment, reopen, assignment, completion, refund. " +
    "Background syncs and marketing/email metadata never move an order.",
  created: "Original lead/order creation date. Acquisition-cohort work.",
  first_paid: "FIRST successful payment. Immutable — an add-on or renewal never moves it.",
  completed: "Most recent fulfilment. Advances on a reissue after a reopen.",
  under_review_entered:
    "Most recent entry into the under-review workflow (provider assigned or moved to review). " +
    "Rows predating entry tracking have no value and are excluded from a bounded range.",
  pending_delivery_entered:
    "Most recent entry into Pending Delivery (provider submitted, awaiting employee approval). " +
    "The workflow is new; older orders have no value.",
};

/** The DB column each basis reads. Used by the server sort AND the date filter. */
export const ORDER_DATE_BASIS_COLUMN: Record<OrderDateBasis, string> = {
  activity: "last_meaningful_activity_at",
  created: "created_at",
  first_paid: "paid_at",
  completed: "last_completed_at",
  under_review_entered: "last_under_review_entered_at",
  pending_delivery_entered: "last_pending_delivery_entered_at",
};

export function isOrderDateBasis(v: unknown): v is OrderDateBasis {
  return typeof v === "string" && (ORDER_DATE_BASES as readonly string[]).includes(v);
}

/**
 * The instant an order carries for the given basis. `activity` falls back to
 * `created_at` so no order can drop out of the list; the other three are
 * deliberately NULLABLE — an unpaid order genuinely has no first-paid date and
 * must be excluded from a first-paid date range rather than coerced to epoch.
 */
export function orderBasisIso(o: LifecycleOrder, basis: OrderDateBasis): string | null {
  switch (basis) {
    case "created": return o.created_at ?? null;
    case "first_paid": return firstPaidIso(o);
    case "completed": return lastCompletedIso(o);
    case "under_review_entered": return o.last_under_review_entered_at ?? null;
    case "pending_delivery_entered": return o.last_pending_delivery_entered_at ?? null;
    case "activity": default: return orderActivityIso(o);
  }
}

/**
 * Deterministic ordering for a basis: basis DESC, then created_at DESC, then
 * id DESC. The two tie-breakers are what keep pagination stable — without them
 * two orders sharing a timestamp can swap between pages and produce a duplicate
 * row on one page and a missing row on the next.
 *
 * Rows with a NULL basis value sort LAST (they are excluded by a date filter,
 * but with no filter active they must still render somewhere deterministic).
 */
export function orderComparator(basis: OrderDateBasis) {
  return (a: LifecycleOrder, b: LifecycleOrder): number => {
    const tA = ms(orderBasisIso(a, basis));
    const tB = ms(orderBasisIso(b, basis));
    if (tA !== tB) return tB - tA;
    const cA = ms(a.created_at);
    const cB = ms(b.created_at);
    if (cA !== cB) return cB - cA;
    return (b.id ?? "").localeCompare(a.id ?? "");
  };
}

/** Default Admin Orders ordering — latest meaningful activity first. */
export const compareByActivityDesc = orderComparator("activity");

/** The historical ordering, kept selectable so lead-cohort work is still possible. */
export const compareByCreatedDesc = orderComparator("created");

/** The date the day ribbons group by — always the ACTIVE basis. */
export function orderGroupingIso(o: LifecycleOrder, basis: OrderDateBasis): string | null {
  return orderBasisIso(o, basis) ?? o.created_at ?? null;
}

/**
 * MONTH-END-...-001 §D — the From/To dates are BUSINESS-timezone calendar days.
 *
 * "2026-07-31" means the America/New_York day [Jul 31 00:00 ET, Aug 1 00:00 ET),
 * i.e. [Jul 31 04:00Z, Aug 1 04:00Z) in summer. The previous implementation
 * parsed the bounds with the BROWSER's clock (a bare date at UTC midnight, an
 * end-of-day sentinel in operator-local time), so a Karachi operator and a New
 * York operator filtering "July" saw different rows — the exact class of bug
 * this task removed from the month-end report. DST-safe via businessTime.
 */
export function businessDayStartUtcIso(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return businessWallClockToUtc(y, m - 1, d, 0, 0).toISOString();
}

/** First instant AFTER the business day — exclusive upper bound. */
export function businessDayEndExclusiveUtcIso(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  // Date.UTC normalises day overflow, so "the 32nd" rolls into the next month.
  return businessWallClockToUtc(y, m - 1, d + 1, 0, 0).toISOString();
}

/**
 * Client-side date-range predicate for the active basis. Mirrors the server
 * arms in orderFacetCounts.ts exactly (inclusive business-day start, EXCLUSIVE
 * next-business-day end), so the list rows, the facet counts and the
 * range-event KPI cards can never disagree.
 *
 * A row with no value on the active basis is EXCLUDED whenever a bound is set —
 * "orders completed in July" must not silently include never-completed orders.
 */
export function matchesBasisDateRange(
  o: LifecycleOrder,
  basis: OrderDateBasis,
  dateFrom: string,
  dateTo: string,
): boolean {
  if (!dateFrom && !dateTo) return true;
  const iso = orderBasisIso(o, basis);
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  if (dateFrom && t < new Date(businessDayStartUtcIso(dateFrom)).getTime()) return false;
  if (dateTo && t >= new Date(businessDayEndExclusiveUtcIso(dateTo)).getTime()) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Payment state — INDEPENDENT of workflow state
// ═══════════════════════════════════════════════════════════════════════════

export type PaymentState =
  | "unpaid" | "paid" | "partially_refunded" | "fully_refunded" | "failed" | "disputed";

const PAYMENT_LABEL: Record<PaymentState, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  partially_refunded: "Partially refunded",
  fully_refunded: "Fully refunded",
  failed: "Payment failed",
  disputed: "Disputed",
};

/**
 * Mirrors public.order_payment_state(). Refund completeness follows the canonical
 * classifier in orderClassification.ts — a bare `refunded_at` never proves a full
 * refund, and a partial refund stays PAID + operational.
 */
export function orderPaymentState(o: LifecycleOrder): PaymentState {
  if (o.dispute_id || o.status === "disputed") return "disputed";
  if (isPartialRefund(o)) return "partially_refunded";
  if (isFullRefund(o)) return "fully_refunded";
  if (o.payment_intent_id || o.paid_at) return "paid";
  if (o.payment_failure_reason || o.payment_failed_at) return "failed";
  return "unpaid";
}

export function paymentStateLabel(s: PaymentState): string {
  return PAYMENT_LABEL[s];
}

/**
 * ORDER-PAID-STALE-FAILURE-SUPPRESSION-001
 *
 * True when `payment_failed_at` / `payment_failure_reason` describe an attempt
 * that has since been SUPERSEDED by a real payment, so the order needs no
 * action and the red "Payment Failed" warning is stale presentation.
 *
 * ── Why not compare timestamps ───────────────────────────────────────────────
 *
 * The obvious rule — "failure is stale if paid_at >= payment_failed_at" — is
 * WRONG on the most common real case. An abandoned Klarna tab stamps its
 * cancellation when the session finally dies, which is AFTER the customer has
 * already paid by card: observed PT-MSTCOG0E paid 12:57 AM, failure 1:00 AM.
 * Ordering says "later failure"; the truth is "stale marker". So this keys on
 * the order's CURRENT authoritative state, never on clock order.
 *
 * ── Why `paid_at` and not `payment_intent_id` ────────────────────────────────
 *
 * A cancelled checkout MINTS a PaymentIntent and never pays it, so a bare PI is
 * exactly the unpaid-failure signature we must keep warning about. `paid_at` is
 * the immutable stamp of the FIRST successful payment and is the authoritative
 * proof a charge landed. (See the `paid_at` contract at the top of this file.)
 *
 * ── Why this cannot hide something that needs action ─────────────────────────
 *
 * `orderPaymentState()` resolves `disputed` and both refund states BEFORE
 * `paid`, so a dispute, a partial refund or a full refund all fail this
 * predicate and keep their warning. And the admin "mark as unpaid/failed"
 * writer CLEARS `paid_at` while stamping `payment_failed_at` — so a genuine
 * later failure that requires action drops straight back to showing.
 *
 * Presentation only: no historical row is altered, and the failed attempt stays
 * in the Payments tab / audit history regardless of what this returns.
 */
export function isStalePaymentFailure(o: LifecycleOrder): boolean {
  const hasFailureMarker = !!o.payment_failed_at || !!o.payment_failure_reason;
  if (!hasFailureMarker) return false;
  // `paid_at` alone proves a charge landed; orderPaymentState() screens out
  // dispute/refund, which must keep warning even though they are "paid".
  return !!o.paid_at && orderPaymentState(o) === "paid";
}

// ═══════════════════════════════════════════════════════════════════════════
// Workflow state — INDEPENDENT of payment state
// ═══════════════════════════════════════════════════════════════════════════

// ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001 — `pending_delivery` is
// EMPLOYEE-ONLY. It means the provider submitted the final letter and it is
// waiting on employee approval. It is never shown to a customer (who sees Under
// Review) or to a provider (who sees Completed); those projections live in
// my-orders/page.tsx and provider-portal/page.tsx respectively.
export type WorkflowState =
  | "lead" | "paid_unassigned" | "under_review" | "pending_delivery" | "reopened" | "completed" | "cancelled";

const WORKFLOW_LABEL: Record<WorkflowState, string> = {
  lead: "Lead",
  paid_unassigned: "Paid · Unassigned",
  under_review: "Under Review",
  pending_delivery: "Pending Delivery",
  reopened: "Reopened",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Mirrors public.order_workflow_state().
 *
 * Branch order is load-bearing and must stay identical to the SQL: the
 * pending_delivery test sits BEHIND `completed` (so a delivered order is never
 * pulled back into the approval queue) and AHEAD of `reopened` (a 30-day reopen
 * only reaches pending_admin_approval once the provider resubmits, which is
 * strictly later, so it is the more current fact).
 */
export function orderWorkflowState(o: LifecycleOrder): WorkflowState {
  if (isOperationallyCancelled(o)) return "cancelled";
  if (!o.payment_intent_id || o.status === "lead") return "lead";
  if (o.doctor_status === "patient_notified") return "completed";
  if (o.doctor_status === "pending_admin_approval") return "pending_delivery";
  if (o.official_letter_reopened_at && !o.official_letter_final_completed_at) return "reopened";
  if (o.doctor_user_id || o.doctor_email) return "under_review";
  return "paid_unassigned";
}

export function workflowStateLabel(s: WorkflowState): string {
  return WORKFLOW_LABEL[s];
}

// ═══════════════════════════════════════════════════════════════════════════
// Compact list presentation — ADMIN-ORDERS-LIFECYCLE-UI-SIMPLIFICATION-001
// ═══════════════════════════════════════════════════════════════════════════
//
// The Orders list shows ONE primary workflow badge. Payment state is only
// surfaced as a SECOND chip when it is exceptional AND the primary badge does
// not already say it — an ordinary paid order never gets a redundant "Paid"
// chip, and a fully-refunded order whose primary badge already reads "Refunded"
// does not get a duplicate.
//
// Everything else (created / first paid / last payment / completion / reopen /
// latest activity) lives in the Order Details modal, not in the row.

/** Payment states that are operationally exceptional and worth a row-level chip. */
const EXCEPTIONAL_PAYMENT_STATES: readonly PaymentState[] = [
  "partially_refunded", "fully_refunded", "failed", "disputed",
] as const;

export interface ExceptionalPaymentChip {
  label: string;
  /** Tailwind classes — red family for money problems, amber for a partial. */
  className: string;
  /** Only set when it adds information the badge does not already convey. */
  title?: string;
}

/**
 * The optional second chip for a row, or null when the primary badge is enough.
 *
 * `primaryBadgeLabel` is the text already rendered in the row so we can suppress
 * a chip that would merely repeat it.
 */
export function exceptionalPaymentChip(
  o: LifecycleOrder,
  primaryBadgeLabel: string,
): ExceptionalPaymentChip | null {
  const pay = orderPaymentState(o);
  if (!EXCEPTIONAL_PAYMENT_STATES.includes(pay)) return null;

  const primary = primaryBadgeLabel.toLowerCase();
  switch (pay) {
    case "partially_refunded":
      if (primary.includes("partially refunded")) return null;
      return {
        label: "Partially Refunded",
        className: "bg-amber-100 text-amber-700",
        title: "Partially refunded — the order stays operational and the provider still delivers",
      };
    case "fully_refunded":
      // The primary badge already reads "Refunded" for this bucket.
      if (primary.includes("refunded")) return null;
      return { label: "Fully Refunded", className: "bg-red-100 text-red-700" };
    case "failed":
      if (primary.includes("payment failed")) return null;
      return { label: "Payment Failed", className: "bg-red-100 text-red-700" };
    case "disputed":
      if (primary.includes("disputed")) return null;
      return {
        label: "Disputed",
        className: "bg-red-100 text-red-700",
        title: "Payment disputed with the card issuer",
      };
    default:
      return null;
  }
}

/**
 * A tooltip for the PRIMARY badge — returned only when it explains something the
 * badge text does not already show (currently: why a completed order is back in
 * the queue). Never duplicates the visible label.
 */
export function primaryBadgeTitle(o: LifecycleOrder): string | undefined {
  return workflowReason(o) ?? undefined;
}

/**
 * Why an otherwise-completed, fully-paid order is back in the queue. Returned
 * only when the reason is not already obvious from the workflow label, so the
 * UI can render "Paid · Under Review — reopened for state-rule review" without
 * inventing a new status value.
 */
export function workflowReason(o: LifecycleOrder): string | null {
  const w = orderWorkflowState(o);
  if (w === "reopened") return "Reopened for the 30-day official letter";
  // A reopened order whose provider has already resubmitted now classifies as
  // pending_delivery, so the 30-day context would otherwise be lost from the
  // label. Keep surfacing it — the employee still needs to know WHY this letter
  // exists while they approve it.
  if (w === "pending_delivery" && o.official_letter_reopened_at && !o.official_letter_final_completed_at) {
    return "Official 30-day letter submitted — awaiting approval";
  }
  if (w === "under_review" && o.last_reopened_at) return "Reopened for review";
  if (w === "completed" && o.last_reopened_at) return "Reissued after reopening";
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Reporting-basis helpers — keep money on transactions, work on workflow
// ═══════════════════════════════════════════════════════════════════════════

/** A unique PAID order counts once, on its FIRST payment date. */
export function firstPaidIso(o: LifecycleOrder): string | null {
  return o.paid_at ?? null;
}

/** Latest money movement on the order — add-ons, upgrades, renewals included. */
export function lastPaymentIso(o: LifecycleOrder): string | null {
  return o.last_payment_at ?? o.paid_at ?? null;
}

/** Original fulfilment — preserved across reopen cycles. */
export function firstCompletedIso(o: LifecycleOrder): string | null {
  return o.first_completed_at ?? o.patient_notification_sent_at ?? null;
}

/** Latest fulfilment — advances on a reissue. */
export function lastCompletedIso(o: LifecycleOrder): string | null {
  return o.last_completed_at ?? o.patient_notification_sent_at ?? null;
}

/** A reopen is a WORKLOAD event, never a sale. */
export function isReopenedOrder(o: LifecycleOrder): boolean {
  return !!(o.last_reopened_at ?? o.official_letter_reopened_at);
}

/** Relative "3h ago" style label for any lifecycle instant. */
export function relativeActivityLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}
