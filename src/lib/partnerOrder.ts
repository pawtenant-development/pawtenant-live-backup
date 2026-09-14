/**
 * PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 — the ONE client-side answer
 * to "is this a partner order?" and "does this order have confirmed payment?".
 *
 * Three copies of these rules existed before this task (the order detail
 * modal, the provider portal and the assessment renderer) and they did not
 * agree: one used OR, two used AND. Every list surface then went on to read
 * `payment_intent_id` alone as the definition of "paid", which is exactly how a
 * partner-funded order (no Stripe PaymentIntent by design) was classified as
 * an unpaid lead — the defect the owner reported in the main Orders view.
 *
 * The rules here mirror the database classifier `order_workflow_state()`:
 *   partner  = order_origin = 'partner' AND partner_id IS NOT NULL   (fail closed)
 *   paid     = payment_intent_id IS NOT NULL
 *              OR (order_origin = 'partner' AND paid_at IS NOT NULL)
 */

export interface PartnerOriginFields {
  order_origin?: string | null;
  partner_id?: string | null;
}

export interface ConfirmedPaymentFields extends PartnerOriginFields {
  payment_intent_id?: string | null;
  paid_at?: string | null;
}

/** A partner-funded order. Both facts are required — an order with only one is
 *  ambiguous and is NOT treated as a partner order (it keeps the retail rules,
 *  which are the more restrictive ones for a customer-facing action). */
export function isPartnerOrder(o: PartnerOriginFields | null | undefined): boolean {
  return !!o && o.order_origin === "partner" && Boolean(o.partner_id);
}

/** Confirmed payment as the workflow classifier defines it. A partner order is
 *  paid by the PARTNER at acceptance (`paid_at` is stamped by
 *  partner_accept_order); it never has a customer PaymentIntent. */
export function hasConfirmedPayment(o: ConfirmedPaymentFields | null | undefined): boolean {
  if (!o) return false;
  if (o.payment_intent_id) return true;
  return o.order_origin === "partner" && Boolean(o.paid_at);
}

/** The label the admin list shows beside a partner order. Admin-only surfaces
 *  import this; provider, customer and partner-portal code must never do so. */
export const PARTNER_ORDER_INDICATOR = "Partner Order";

/** Human label for the intake method stored on a partner order. Every
 *  accepted value MUST have a label — an unmapped value renders as "unknown",
 *  never as a silent fallback to "api" (a previous defect). */
export const PARTNER_INTAKE_METHOD_LABELS: Record<string, string> = {
  api: "API",
  manual: "Legacy PDF",
  partner_portal_manual: "Structured intake",
};

export function partnerIntakeMethodLabel(method: string | null | undefined): string {
  if (!method) return "API";
  return PARTNER_INTAKE_METHOD_LABELS[method] ?? "unknown";
}
