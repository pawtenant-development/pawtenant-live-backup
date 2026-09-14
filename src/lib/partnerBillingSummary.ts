// partnerBillingSummary — PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002.
//
// The row shape of `partner_admin_billing_summary()` and the pure "All
// partners" aggregate over it. Frozen per-order figures are ADDED, never
// recomputed; money is summed only within one currency and a mixed set is
// refused (null) rather than added together. Pure — no React, no client —
// so the build guard can execute it.

export interface BillingSummary {
  partner_id: string;
  partner_name: string;
  currency: string;
  orders_awaiting_invoice: number;
  awaiting_invoice_cents: number;
  open_invoice_count: number;
  open_invoice_cents: number;
  paid_invoice_count: number;
  paid_invoice_cents: number;
  orders_unreconciled: number;
  unreconciled_cents: number;
  orders_paid: number;
  paid_order_cents: number;
  partner_charges_cents: number;
  provider_cost_cents: number;
  adjustments_cents: number;
  net_contribution_cents: number;
  // PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001: the pending pipeline and
  // the orders whose numbers cannot be trusted yet.
  orders_in_progress: number;
  in_progress_charges_cents: number;
  in_progress_provider_cost_cents: number;
  orders_needing_reconciliation: number;
}

const SUMMED_KEYS: (keyof BillingSummary)[] = [
  "orders_awaiting_invoice", "awaiting_invoice_cents", "open_invoice_count", "open_invoice_cents",
  "paid_invoice_count", "paid_invoice_cents", "orders_unreconciled", "unreconciled_cents",
  "orders_paid", "paid_order_cents", "partner_charges_cents", "provider_cost_cents",
  "adjustments_cents", "net_contribution_cents", "orders_in_progress", "in_progress_charges_cents",
  "in_progress_provider_cost_cents", "orders_needing_reconciliation",
];

export const ALL_PARTNERS_SUMMARY_NAME = "All partners";

/** Sum per-partner summaries into one "All partners" row. */
export function aggregateBillingSummaries(rows: BillingSummary[]): BillingSummary | null {
  if (rows.length === 0) return null;
  const currencies = new Set(rows.map((r) => r.currency || "USD"));
  if (currencies.size > 1) return null;
  const out = { ...rows[0], partner_id: "", partner_name: ALL_PARTNERS_SUMMARY_NAME } as BillingSummary;
  for (const k of SUMMED_KEYS) (out as unknown as Record<string, number>)[k] = rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  return out;
}
