// bookingProgress — the single shared "where is this order in booking?" resolver
// (UNPAID-CUSTOMER-PORTAL-AND-RESUME-CONTINUITY-001).
//
// One authoritative helper used by: the customer portal (lifecycle + booking CTA),
// the assessment/PSD resume routing, and the post-OTP assurance screen. Keeps
// routing deterministic and identical across surfaces. Presentation + routing only
// — no side effects, no data fetch.
//
// Paid-vs-unpaid is derived from the authoritative `status` field ('lead' is the
// only unpaid state; every 'lead' row in TEST has no payment_intent_id / paid_at /
// provider). NEVER inferred from price, package name, or amount.
//
// PARTIAL-REFUND-TERMINAL-STATE-CONSUMER-FIX-001: refund terminality is delegated
// to the canonical classifier. A PARTIAL refund is NOT terminal — the customer
// paid, the letter is still owed, and every lifecycle step must keep its state.

import { isRefundTerminal, isOperationallyCancelled } from "@/lib/orderClassification";

export interface BookingOrderLike {
  confirmation_id: string;
  letter_type?: string | null;
  status?: string | null;
  doctor_status?: string | null;
  doctor_user_id?: string | null;
  doctor_name?: string | null;
  payment_intent_id?: string | null;
  checkout_session_id?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  // Required for canonical refund classification — a query feeding this resolver
  // MUST select refund_status, else a partial refund cannot be distinguished.
  refund_status?: string | null;
  refund_amount?: number | string | null;
  package_key?: string | null;
  billing_plan?: string | null;
  letter_id?: string | null;
  additional_documentation_status?: string | null;
  includes_reasonable_accommodation_letter?: boolean | null;
}

// Archived is a customer-portal-only terminal state with no refund meaning.
// Cancellation and full-refund terminality come from the canonical classifier.
const TERMINAL_NON_REFUND = new Set(["archived"]);

export function isPsdOrder(o: BookingOrderLike): boolean {
  return o.letter_type === "psd" || (o.confirmation_id?.includes("-PSD") ?? false);
}

/** The only unpaid state. All 'lead' rows have no payment/provider. */
export function isUnpaidLead(o: BookingOrderLike): boolean {
  return (o.status ?? "") === "lead";
}

/**
 * The order is over for the customer: archived, explicitly cancelled, or made
 * financially whole by a FULL refund.
 *
 * A partial refund is deliberately NOT terminal (rule 7) — the customer still
 * paid for and is still owed the letter, so the lifecycle must not regress.
 */
export function isTerminalOrder(o: BookingOrderLike): boolean {
  return TERMINAL_NON_REFUND.has(o.status ?? "")
    || isOperationallyCancelled(o)
    || isRefundTerminal(o);
}

/** Authoritative "customer has paid" — status has moved past 'lead' and it is not
 *  a terminal (cancelled/refunded) row. */
export function isPaidOrder(o: BookingOrderLike): boolean {
  return !isUnpaidLead(o) && !isTerminalOrder(o);
}

function hasProvider(o: BookingOrderLike): boolean {
  return !!o.doctor_user_id || !!o.doctor_name;
}

function isDelivered(o: BookingOrderLike): boolean {
  // Authoritative on the LETTER fields. Once a letter_id is minted (or the base
  // letter was marked delivered), the customer's "Letter Delivered" step stays
  // DONE even if the internal order later reopens (status='under-review',
  // doctor_status='in_review') for a late Housing Accommodation follow-up. This
  // is what keeps the customer lifecycle from regressing on a housing reopen
  // (RA-LATE-UPLOAD-...). Housing follow-up is surfaced separately, not here.
  return (o.status ?? "") === "completed" || o.doctor_status === "patient_notified" || !!o.letter_id;
}

/** True when the base letter is delivered but a Housing Accommodation follow-up is
 *  still active (customer uploaded a form after delivery, provider hasn't returned
 *  the completed form yet). Drives a SEPARATE "Housing follow-up" card — never
 *  regresses the 4-step base lifecycle. */
export function isHousingFollowUpActive(o: BookingOrderLike): boolean {
  const entitled = o.includes_reasonable_accommodation_letter === true;
  const ads = o.additional_documentation_status ?? "";
  return isDelivered(o) && entitled && (ads === "uploaded" || ads === "in_review");
}

function isUnderEvaluation(o: BookingOrderLike): boolean {
  const ds = o.doctor_status ?? "";
  return ds === "in_review" || ds === "approved" || ds === "letter_sent" ||
    ds === "thirty_day_reissue" || (o.status ?? "") === "under-review";
}

export type StepState = "done" | "active" | "locked";
export interface LifecycleStep {
  key: "book" | "assign" | "evaluate" | "deliver";
  label: string;
  icon: string;
  state: StepState;
  /** Customer-safe one-line hint for the current/locked step. */
  hint: string;
}

/** The prominent 4-step customer lifecycle. Customer-safe wording only — never
 *  exposes provider rejection, reassignment, queue/automation names, or payouts. */
export function resolveLifecycle(o: BookingOrderLike): LifecycleStep[] {
  const paid = isPaidOrder(o);
  const assigned = paid && hasProvider(o);
  const evaluating = assigned && isUnderEvaluation(o);
  const delivered = paid && isDelivered(o);

  const bookState: StepState = paid ? "done" : "active";
  const assignState: StepState = !paid ? "locked" : assigned ? "done" : "active";
  const evalState: StepState = !assigned ? "locked" : delivered ? "done" : evaluating ? "active" : "locked";
  const deliverState: StepState = delivered ? "done" : "locked";

  return [
    { key: "book", label: "Book & Pay for Your Consultation", icon: "ri-bank-card-line", state: bookState,
      hint: paid ? "Your consultation is booked." : "Complete your booking to begin your licensed provider review." },
    { key: "assign", label: "Provider Assignment", icon: "ri-user-received-line", state: assignState,
      hint: assigned ? "A licensed provider is assigned to your case." :
        paid ? "We're matching you with a licensed provider in your state." :
        "A licensed provider is matched after booking." },
    { key: "evaluate", label: "Evaluation Started", icon: "ri-stethoscope-line", state: evalState,
      hint: evaluating ? "Your provider is reviewing your case." :
        delivered ? "Your evaluation is complete." :
        "Your provider begins your review after assignment." },
    { key: "deliver", label: "Letter Delivered", icon: "ri-mail-check-line", state: deliverState,
      hint: delivered ? "Your documents are ready in your portal." :
        "Your completed letter will appear here when it's ready." },
  ];
}

/** For an unpaid lead: the next unfinished booking gate. Package chosen already →
 *  straight to checkout; otherwise the package step. */
export function nextBookingGate(o: BookingOrderLike): "package" | "pay" {
  return o.package_key ? "pay" : "package";
}

function hasCheckoutSession(o: BookingOrderLike): boolean {
  return !!o.payment_intent_id || !!o.checkout_session_id;
}

/** Progress-dependent primary CTA label for the unpaid booking card. */
export function bookingCtaLabel(o: BookingOrderLike): string {
  if (!o.package_key) return "Choose Your Package";
  if (hasCheckoutSession(o)) return "Resume Checkout";
  return "Complete Booking";
}

/** The deterministic resume URL — the single route the portal CTA + recovery links
 *  should use. The assessment page then routes to the correct unfinished step. */
export function resumeHref(o: BookingOrderLike): string {
  const base = isPsdOrder(o) ? "/psd-assessment" : "/assessment";
  return `${base}?resume=${encodeURIComponent(o.confirmation_id)}`;
}
