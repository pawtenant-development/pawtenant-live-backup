// ADMIN-ORDER-EXPORT-PROVIDER-NET-001
// Canonical provider-payment figure per order for the Admin Orders CSV export.
//
// Contract — mirrors companyExpenses.classifyPayout().deducted, EXTENDED to sum
// multiple valid earning components for one order:
//
//   Provider Payment = order completed ? SUM(valid non-cancelled doctor_earnings) : 0
//
// where "completed" == orders.doctor_status === 'patient_notified'
//   (PROVIDER_COMPLETED_STATUS — the same completion signal EarningsPanel and the
//    resolve_charge_payouts RPC use).
//
// Business rules honoured:
//   - completed + NOT refunded       → sum of valid earnings for the order
//   - completed + LATER refunded     → RETAINED (a customer refund never zeroes a
//                                       payout for work the provider already completed)
//   - refunded BEFORE completion     → 0 (order is not patient_notified)
//   - under review / assigned only   → 0 (an earning row alone is never retained)
//   - multiple legitimate components → SUM (base + ra_completion +
//                                       additional_documentation + any future type)
//   - earning status 'cancelled'     → EXCLUDED. 'cancelled' is the ONLY payout-
//                                       exclusion sentinel in the earning model
//                                       (matches the edge functions'
//                                       .neq('status','cancelled') and the monthly
//                                       business report's "non-cancelled" definition).
//                                       Reversed/voided/replaced are not statuses here;
//                                       deleted rows are physically absent. A CUSTOMER
//                                       refund is NOT an earning reversal.
//   - never derived from price, provider name, a percentage, or a hardcoded rate.
//
// Data anomalies are REPORTED, never silently corrected or mutated here:
//   - a completed order with no valid earning row  → 0 (payout_missing_completed)
//   - a paid earning on a not-completed order      → not counted (0)

import { supabase } from "./supabaseClient";
import { PROVIDER_COMPLETED_STATUS } from "./companyExpenses";

// A single doctor_earnings row, as needed for the export figure.
export interface ExportEarningRow {
  id?: string | null;
  order_id?: string | null;
  confirmation_id?: string | null;
  doctor_amount?: number | string | null; // whole USD (integer column)
  status?: string | null;
  earning_type?: string | null;
}

// Only the order fields the calculation needs; kept loose so it accepts the rich
// order rows the export already carries.
export interface ProviderPaymentOrder {
  id?: unknown;
  confirmation_id?: unknown;
  doctor_status?: unknown;
  [key: string]: unknown;
}

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : String(v);
}

function toAmount(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(s(v));
  return isNaN(n) ? 0 : n;
}

// 'cancelled' is the sole payout-exclusion sentinel (see header note).
export function isEarningExcluded(e: ExportEarningRow): boolean {
  return s(e.status).toLowerCase() === "cancelled";
}

// The order-level completion gate. Provider cost is only retained/owed once the
// provider's work has been delivered to the patient.
export function isProviderWorkCompleted(o: ProviderPaymentOrder): boolean {
  return s(o.doctor_status) === PROVIDER_COMPLETED_STATUS;
}

// PURE (no I/O): resolve every earning to exactly one exported order, sum the
// valid (non-cancelled) components, then apply the completion gate. Returns a map
// keyed by order.id → final Provider Payment (already gated; 0 when not retained).
//
// Attribution is single-owner to avoid double counting: an earning is matched to
// an exported order by order_id first, else by confirmation_id, and each earning
// row is counted at most once (deduped by earning id across the two fetch batches).
export function computeProviderPaymentByOrder(
  orders: ProviderPaymentOrder[],
  earnings: ExportEarningRow[],
): Map<string, number> {
  const orderIds = new Set<string>();
  const confToId = new Map<string, string>();
  for (const o of orders) {
    const id = s(o.id);
    if (!id) continue;
    orderIds.add(id);
    const conf = s(o.confirmation_id);
    if (conf && !confToId.has(conf)) confToId.set(conf, id);
  }

  const sumByOrderId = new Map<string, number>();
  const seen = new Set<string>();
  for (const e of earnings) {
    const eid = s(e.id);
    if (eid) {
      if (seen.has(eid)) continue; // same row from both batches → count once
      seen.add(eid);
    }
    if (isEarningExcluded(e)) continue;

    let oid = s(e.order_id);
    if (!oid || !orderIds.has(oid)) {
      const conf = s(e.confirmation_id);
      oid = conf && confToId.has(conf) ? (confToId.get(conf) as string) : "";
    }
    if (!oid || !orderIds.has(oid)) continue; // not attributable to any exported order

    sumByOrderId.set(oid, (sumByOrderId.get(oid) ?? 0) + toAmount(e.doctor_amount));
  }

  const result = new Map<string, number>();
  for (const o of orders) {
    const id = s(o.id);
    if (!id) continue;
    result.set(id, isProviderWorkCompleted(o) ? (sumByOrderId.get(id) ?? 0) : 0);
  }
  return result;
}

// I/O wrapper: batch-fetch the earnings for the exported orders (RLS-enforced
// admin session — same SELECT access EarningsPanel/companyExpenses already rely on)
// and reduce to the gated Provider Payment map. Fetches by BOTH keys so an earning
// whose order_id is null/mismatched is still caught via confirmation_id.
//
// Throws on a hard query error so the caller can CANCEL the export instead of
// emitting a misleading all-zero provider column (no silent partial export).
export async function fetchProviderPaymentsForExport(
  orders: ProviderPaymentOrder[],
): Promise<Map<string, number>> {
  const cols = "id, order_id, confirmation_id, doctor_amount, status, earning_type";
  const orderIds = Array.from(new Set(orders.map((o) => s(o.id)).filter(Boolean)));
  const confIds = Array.from(new Set(orders.map((o) => s(o.confirmation_id)).filter(Boolean)));
  const earnings: ExportEarningRow[] = [];

  for (let i = 0; i < orderIds.length; i += 200) {
    const { data, error } = await supabase
      .from("doctor_earnings")
      .select(cols)
      .in("order_id", orderIds.slice(i, i + 200));
    if (error) throw new Error(`provider earnings (order_id) query failed: ${error.message}`);
    if (data) earnings.push(...(data as ExportEarningRow[]));
  }
  for (let i = 0; i < confIds.length; i += 200) {
    const { data, error } = await supabase
      .from("doctor_earnings")
      .select(cols)
      .in("confirmation_id", confIds.slice(i, i + 200));
    if (error) throw new Error(`provider earnings (confirmation_id) query failed: ${error.message}`);
    if (data) earnings.push(...(data as ExportEarningRow[]));
  }

  return computeProviderPaymentByOrder(orders, earnings);
}
