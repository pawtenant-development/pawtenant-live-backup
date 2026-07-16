// analyticsMetrics — ONE canonical set of order-metric definitions for the
// admin Analytics dashboard, so the SAME label means the SAME thing in
// Overview / Owner Dashboard, Business Snapshot, and Conversion Analytics.
//
// Definitions (agreed in PAWTENANT-TEST-ANALYTICS-METRIC-DEFINITION-ALIGNMENT):
//   • Total Orders   — every order/lead created in the selected range.
//   • Paid Orders    — a successful payment happened (payment_intent_id OR
//                      paid_at present). INCLUDES orders later refunded.
//   • Net Paid Orders— Paid Orders excluding FULLY refunded / cancelled / voided.
//   • Unpaid Leads   — Total − Paid.
//   • Completed      — fulfilled (doctor_status = patient_notified). NOT "paid".
//   • Revenue (gross)— Σ price of Paid Orders (includes later-refunded).
//   • Net Revenue    — Σ price of Net Paid Orders (full refunds removed).
//   • Refunds        — Paid Orders lost to a FULL refund / cancellation / void.
//   • Partial Refunds— Paid Orders that kept a partial refund and stayed live.
//   • Paid Rate      — Paid / Total.
//   • Net Paid Rate  — Net Paid / Total.
//   • AOV            — Revenue (gross) / Paid.   Net AOV — Net Revenue / Net Paid.
//
// PARTIAL-REFUND-TERMINAL-STATE-CONSUMER-FIX-001: a PARTIAL refund is NOT a lost
// order. It previously deleted the entire order value from Net Revenue — a $20
// refund on a $129 order removed all $129. Partial refunds now stay in Net Paid
// and Net Revenue, and are reported separately via `partialRefunds`.
//
// `price` on a partially-refunded order already holds the NET (a partial refund
// rewrites it — see LIVE-PARTIAL-REFUND-VERIFICATION-ID-RECOVERY-001 §1.3), so
// Net Revenue lands on the correct net without subtracting the refund again.
// Gross Revenue consequently understates a partially-refunded order by the
// refunded amount; that is the pre-existing `orders.price` semantics question
// (Category C) and is deliberately NOT redefined here.
//
// DISPLAY/REPORT ONLY. Pure, null-safe. No IO, no React.

import { isPartialRefund, isRefundTerminal, hasAnyRefund } from "@/lib/orderClassification";

export interface MetricOrder {
  payment_intent_id?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  // Required for canonical refund classification — any query feeding these
  // metrics MUST select refund_status, else partial refunds read as full.
  refund_status?: string | null;
  refund_amount?: number | string | null;
  status?: string | null;
  price?: number | null;
  doctor_status?: string | null;
}

/** A successful payment happened — the canonical "Paid Order" test. */
export function isPaidOrder(o: MetricOrder): boolean {
  return !!o.payment_intent_id || !!o.paid_at;
}

/**
 * The order was LOST — a full refund, a cancellation, or a void. Removed from
 * "Net Paid" + Net Revenue.
 *
 * A partial refund is NOT lost: the customer kept the product and we kept the
 * net revenue, so it stays in Net Paid. Use `isPartiallyRefundedOrder` to report
 * partials separately.
 */
export function isLostOrder(o: MetricOrder): boolean {
  if (isPartialRefund(o)) return false;          // rule 4/7 — partial is not a loss
  if (isRefundTerminal(o)) return true;          // authoritative full refund
  const s = (o.status ?? "").toLowerCase().trim();
  return s === "cancelled" || s === "canceled" || s === "voided";
}

/** Paid order carrying an authoritative partial refund — still live, still ours. */
export function isPartiallyRefundedOrder(o: MetricOrder): boolean {
  return isPartialRefund(o);
}

/** Any refund activity at all — partial or full. Display/aggregate only. */
export function hasRefundActivity(o: MetricOrder): boolean {
  return hasAnyRefund(o);
}

/**
 * @deprecated Ambiguous — it conflated "some refund happened" with "order lost".
 * Use `isLostOrder` for exclusion gates, `isPartiallyRefundedOrder` for partials,
 * or `hasRefundActivity` for display. Retained as a thin alias so no caller
 * silently changes meaning; new code must not use it.
 */
export function isRefundedOrder(o: MetricOrder): boolean {
  return isLostOrder(o);
}

/** Fulfilled order — distinct from "paid". */
export function isCompletedOrder(o: MetricOrder): boolean {
  return o.doctor_status === "patient_notified";
}

function price(o: MetricOrder): number {
  return typeof o.price === "number" && Number.isFinite(o.price) ? o.price : 0;
}

export interface OrderMetrics {
  total: number;
  paid: number;        // gross paid (incl. refunded)
  netPaid: number;     // paid excl. FULL refund / cancelled / voided
  leads: number;       // total − paid
  refunds: number;     // paid & lost to a FULL refund / cancellation / void
  partialRefunds: number; // paid, partially refunded, still live (not a loss)
  completed: number;
  grossRevenue: number; // Σ price of paid
  netRevenue: number;   // Σ price of net-paid
  paidRate: number;     // 0–100
  netPaidRate: number;  // 0–100
  refundRate: number;   // 0–100, refunds / paid
  aov: number;          // grossRevenue / paid
  netAov: number;       // netRevenue / netPaid
}

/** Compute the canonical metric set for a set of orders already filtered to
 *  the selected reporting range. */
export function computeOrderMetrics(orders: MetricOrder[]): OrderMetrics {
  let paid = 0, netPaid = 0, refunds = 0, partialRefunds = 0, completed = 0, grossRevenue = 0, netRevenue = 0;
  const total = orders.length;
  for (const o of orders) {
    if (isCompletedOrder(o)) completed += 1;
    if (!isPaidOrder(o)) continue;
    paid += 1;
    grossRevenue += price(o);
    if (isLostOrder(o)) {
      refunds += 1;
    } else {
      // Includes partially-refunded orders: still live, still net revenue.
      if (isPartiallyRefundedOrder(o)) partialRefunds += 1;
      netPaid += 1;
      netRevenue += price(o);
    }
  }
  const leads = total - paid;
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  return {
    total, paid, netPaid, leads, refunds, partialRefunds, completed,
    grossRevenue, netRevenue,
    paidRate: pct(paid, total),
    netPaidRate: pct(netPaid, total),
    refundRate: pct(refunds, paid),
    aov: paid > 0 ? grossRevenue / paid : 0,
    netAov: netPaid > 0 ? netRevenue / netPaid : 0,
  };
}
