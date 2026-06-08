// analyticsMetrics — ONE canonical set of order-metric definitions for the
// admin Analytics dashboard, so the SAME label means the SAME thing in
// Overview / Owner Dashboard, Business Snapshot, and Conversion Analytics.
//
// Definitions (agreed in PAWTENANT-TEST-ANALYTICS-METRIC-DEFINITION-ALIGNMENT):
//   • Total Orders   — every order/lead created in the selected range.
//   • Paid Orders    — a successful payment happened (payment_intent_id OR
//                      paid_at present). INCLUDES orders later refunded.
//   • Net Paid Orders— Paid Orders excluding refunded / cancelled / voided.
//   • Unpaid Leads   — Total − Paid.
//   • Completed      — fulfilled (doctor_status = patient_notified). NOT "paid".
//   • Revenue (gross)— Σ price of Paid Orders (includes later-refunded).
//   • Net Revenue    — Σ price of Net Paid Orders (refunds removed).
//   • Refunds        — Paid Orders that were refunded/cancelled/voided.
//   • Paid Rate      — Paid / Total.
//   • Net Paid Rate  — Net Paid / Total.
//   • AOV            — Revenue (gross) / Paid.   Net AOV — Net Revenue / Net Paid.
//
// DISPLAY/REPORT ONLY. Pure, null-safe. No IO, no React.

export interface MetricOrder {
  payment_intent_id?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  status?: string | null;
  price?: number | null;
  doctor_status?: string | null;
}

/** A successful payment happened — the canonical "Paid Order" test. */
export function isPaidOrder(o: MetricOrder): boolean {
  return !!o.payment_intent_id || !!o.paid_at;
}

/** Refunded / cancelled / voided — removed from "Net Paid" + Net Revenue. */
export function isRefundedOrder(o: MetricOrder): boolean {
  if (o.refunded_at) return true;
  const s = (o.status ?? "").toLowerCase().trim();
  return s === "refunded" || s === "cancelled" || s === "canceled" || s === "voided";
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
  netPaid: number;     // paid excl. refunded/cancelled
  leads: number;       // total − paid
  refunds: number;     // paid & refunded
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
  let paid = 0, netPaid = 0, refunds = 0, completed = 0, grossRevenue = 0, netRevenue = 0;
  const total = orders.length;
  for (const o of orders) {
    if (isCompletedOrder(o)) completed += 1;
    if (!isPaidOrder(o)) continue;
    paid += 1;
    grossRevenue += price(o);
    if (isRefundedOrder(o)) {
      refunds += 1;
    } else {
      netPaid += 1;
      netRevenue += price(o);
    }
  }
  const leads = total - paid;
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  return {
    total, paid, netPaid, leads, refunds, completed,
    grossRevenue, netRevenue,
    paidRate: pct(paid, total),
    netPaidRate: pct(netPaid, total),
    refundRate: pct(refunds, paid),
    aov: paid > 0 ? grossRevenue / paid : 0,
    netAov: netPaid > 0 ? netRevenue / netPaid : 0,
  };
}
