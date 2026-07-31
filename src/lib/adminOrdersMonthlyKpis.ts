// ADMIN-ORDERS-MONTHLY-KPI-BANNER-CORRECTION-001
//
// The upper Admin Orders KPI banner — CURRENT CALENDAR MONTH, Eastern time.
//
// WHY THIS IS A SEPARATE MODULE FROM orderFacetCounts.ts
// ------------------------------------------------------
// The banner and the order list answer different questions and therefore have
// DIFFERENT UNIVERSES:
//
//   banner (here)          -> "what happened this month?"
//                             current Eastern calendar month, server-authoritative,
//                             aggregate-only. NEVER narrowed by search, status /
//                             package / sequence filters, Date Basis, pagination or
//                             the rows currently loaded in the browser.
//
//   list (orderFacetCounts) -> "what matches my current filters?"
//                             filter-aware and Date-Basis-aware. Still owns the
//                             "X of Y" total and the status-tab facet counts.
//
// They are intentionally NOT reconcilable with each other, so they must never be
// served by one ambiguous count object. Overloading a single helper for both is
// exactly the regression this module exists to prevent.
//
// Every value here comes from ONE admin-gated aggregate RPC. Nothing is derived
// client-side from loaded rows.

import { supabase } from "./supabaseClient";

export interface AdminOrdersMonthlyKpis {
  /** IANA zone the period was computed in — always "America/New_York". */
  timezone: string;
  /** First instant of the current Eastern calendar month (ISO). */
  periodStart: string;
  /** First instant of the NEXT month (ISO) — EXCLUSIVE upper bound. */
  periodEndExclusive: string;
  /** Created this month, still an unpaid lead. Keyed on created_at. */
  leadUnpaid: number;
  /** FIRST payment this month, still unassigned. Keyed on paid_at (never last_payment_at). */
  paidUnassigned: number;
  /**
   * HISTORICAL, MONTHLY: entered review this month and still under review.
   * Keyed on the proven order_status_logs transition.
   *
   * ADMIN-ORDERS-UNDER-REVIEW-KPI-CURRENT-WORKLOAD-FIX-001 — this is NO LONGER
   * what the Under Review card shows; use `underReviewCurrent`. Preserved so the
   * monthly metric keeps its meaning for any future consumer.
   */
  underReview: number;
  /**
   * HISTORICAL, MONTHLY: provider submitted this month and the letter is still
   * awaiting employee approval. Superseded on the card by
   * `pendingDeliveryCurrent`, and preserved for the same reason as `underReview`.
   */
  pendingDelivery: number;
  /**
   * CURRENT WORKLOAD: every order sitting in Under Review right now, regardless
   * of WHEN it entered. This is what the Under Review card displays, and it is
   * defined to equal the Under Review status tab exactly — a queue is sized by
   * what is in it, not by when each item arrived.
   */
  underReviewCurrent: number | null;
  /**
   * CURRENT WORKLOAD: every order awaiting employee approval right now. Equals
   * the Pending Delivery tab. EMPLOYEE-ONLY — never a customer-facing status.
   */
  pendingDeliveryCurrent: number | null;
  /** Fulfilled this month. Keyed on last_completed_at. EXCLUDES pendingDelivery. */
  completed: number;
}

/**
 * Fetch the four current-month banner metrics.
 *
 * Takes NO filter arguments — by design. If a caller ever needs to narrow these
 * by a list filter, that caller wants orderFacetCounts.ts instead.
 *
 * Returns null on error (not authorized, offline, RPC missing) so the banner can
 * show a contained skeleton rather than stale or invented numbers.
 */
export async function fetchAdminOrdersMonthlyKpis(): Promise<AdminOrdersMonthlyKpis | null> {
  try {
    const { data, error } = await supabase.rpc("get_admin_orders_monthly_kpis");
    if (error) {
      console.error("[adminOrdersMonthlyKpis] rpc failed", error);
      return null;
    }
    const d = data as Partial<AdminOrdersMonthlyKpis> | null;
    if (!d || typeof d.leadUnpaid !== "number") return null;
    return {
      timezone: d.timezone ?? "America/New_York",
      periodStart: String(d.periodStart ?? ""),
      periodEndExclusive: String(d.periodEndExclusive ?? ""),
      leadUnpaid: d.leadUnpaid ?? 0,
      paidUnassigned: d.paidUnassigned ?? 0,
      underReview: d.underReview ?? 0,
      pendingDelivery: d.pendingDelivery ?? 0,
      // ADMIN-ORDERS-UNDER-REVIEW-KPI-CURRENT-WORKLOAD-FIX-001 — deliberately
      // NOT `?? 0`. If this bundle ever runs against a database that predates the
      // current-workload fields, an invented 0 would look exactly like the empty
      // queue this fix exists to stop reporting. null renders "—" instead, which
      // is the honest answer.
      underReviewCurrent: typeof d.underReviewCurrent === "number" ? d.underReviewCurrent : null,
      pendingDeliveryCurrent: typeof d.pendingDeliveryCurrent === "number" ? d.pendingDeliveryCurrent : null,
      completed: d.completed ?? 0,
    };
  } catch (e) {
    console.error("[adminOrdersMonthlyKpis] rpc threw", e);
    return null;
  }
}

/**
 * Human label for the active period, e.g. "Jul 1 – Jul 31, 2026".
 *
 * Formatted in the RPC's OWN timezone, never the viewer's: an operator in
 * Karachi must see the same Eastern month the numbers were counted in, or the
 * label would quietly contradict the values it sits next to.
 *
 * The upper bound is exclusive, so the displayed end date is one day earlier.
 */
export function formatMonthlyPeriodLabel(k: AdminOrdersMonthlyKpis): string {
  const start = new Date(k.periodStart);
  const endExcl = new Date(k.periodEndExclusive);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endExcl.getTime())) return "";
  const lastDay = new Date(endExcl.getTime() - 24 * 60 * 60 * 1000);
  const md = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: k.timezone });
  const y = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: k.timezone });
  return `${md.format(start)} – ${md.format(lastDay)}, ${y.format(lastDay)}`;
}
