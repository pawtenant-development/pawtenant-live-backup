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

  // ── CURRENT QUEUE DEPTHS (no month window) — what the four workflow cards
  // display. A queue is sized by what is IN it, not by when each item arrived,
  // so nothing vanishes from a card at month rollover while its tab still lists
  // it. Each equals its corresponding status tab.
  /** Open unpaid leads right now. Not restricted by creation month. */
  leadUnpaidCurrent: number;
  /** Paid and awaiting provider assignment right now. Not restricted by payment month. */
  paidUnassignedCurrent: number;
  /** The review queue right now. EXCLUDES pendingDelivery. */
  underReviewCurrent: number;
  /** The employee approval queue right now. EMPLOYEE-ONLY — never customer-facing. */
  pendingDeliveryCurrent: number;

  // ── MONTHLY metrics ────────────────────────────────────────────────────────
  /**
   * Fulfilled THIS Eastern month. Keyed on last_completed_at, so an order paid
   * in July but delivered in August counts as an AUGUST completion and never a
   * July one. EXCLUDES pendingDelivery. This is the only monthly card.
   */
  completed: number;

  // Preserved monthly transition metrics. No card reads these any more; they are
  // kept so the historical question ("how many ENTERED this state this month")
  // stays answerable and no consumer silently changed meaning.
  /** Created this month, still an unpaid lead. Keyed on created_at. */
  leadUnpaid: number;
  /** FIRST payment this month, still unassigned. Keyed on paid_at (never last_payment_at). */
  paidUnassigned: number;
  /** Entered review this month, still under review. Keyed on the proven transition. */
  underReview: number;
  /** Entered pending_admin_approval this month, still awaiting approval. */
  pendingDelivery: number;
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
    // Gate on a CURRENT field: these drive four of the five cards, so an older
    // RPC that predates them must fail the banner closed (skeleton → "—") rather
    // than silently rendering month-gated numbers under "now" labels.
    if (!d || typeof d.leadUnpaidCurrent !== "number") return null;
    return {
      timezone: d.timezone ?? "America/New_York",
      periodStart: String(d.periodStart ?? ""),
      periodEndExclusive: String(d.periodEndExclusive ?? ""),
      leadUnpaidCurrent: d.leadUnpaidCurrent ?? 0,
      paidUnassignedCurrent: d.paidUnassignedCurrent ?? 0,
      underReviewCurrent: d.underReviewCurrent ?? 0,
      pendingDeliveryCurrent: d.pendingDeliveryCurrent ?? 0,
      completed: d.completed ?? 0,
      leadUnpaid: d.leadUnpaid ?? 0,
      paidUnassigned: d.paidUnassigned ?? 0,
      underReview: d.underReview ?? 0,
      pendingDelivery: d.pendingDelivery ?? 0,
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
