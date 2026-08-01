/**
 * MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001 §D
 *
 * Event-based Admin Orders KPI counts for a CUSTOM date range.
 *
 * This is deliberately a SEPARATE module from adminOrdersMonthlyKpis.ts:
 *   • fetchAdminOrdersMonthlyKpis() is zero-arg by guarded contract — the
 *     monthly banner never reacts to filters.
 *   • This fetch exists ONLY while the operator has a From/To date filter
 *     active. It answers "what HAPPENED during the range?" (period events),
 *     not "what is in the queue right now?" (current state).
 *
 * Each count keys on the authoritative lifecycle event timestamp column and
 * reconciles with the Admin Orders list filtered to the matching Date Basis
 * with status = All:
 *
 *   leadsCreated            orders.created_at                    basis "created"
 *   ordersPaid              orders.paid_at                       basis "first_paid"
 *   enteredUnderReview      orders.last_under_review_entered_at  basis "under_review_entered"
 *   enteredPendingDelivery  orders.last_pending_delivery_entered_at  basis "pending_delivery_entered"
 *   completed               orders.last_completed_at             basis "completed"
 *
 * The RPC interprets the From/To dates in America/New_York (DST-safe,
 * make_timestamptz) — the same instants the list filter and facet counts use.
 */
import { supabase } from "./supabaseClient";

export interface AdminOrdersRangeEventKpis {
  timezone: string;
  periodStart: string | null;
  periodEndExclusive: string | null;
  from: string | null;
  to: string | null;
  leadsCreated: number;
  ordersPaid: number;
  enteredUnderReview: number;
  enteredPendingDelivery: number;
  completed: number;
}

/**
 * Fails CLOSED: any error or unexpected shape returns null and the cards show
 * "—" — never a stale or fabricated count.
 */
export async function fetchAdminOrdersRangeEventKpis(args: {
  from: string | null;
  to: string | null;
}): Promise<AdminOrdersRangeEventKpis | null> {
  try {
    const { data, error } = await supabase.rpc("get_admin_orders_range_event_kpis", {
      p_from: args.from || null,
      p_to: args.to || null,
    });
    if (error) return null;
    const d = data as Partial<AdminOrdersRangeEventKpis> | null;
    if (!d || typeof d.leadsCreated !== "number" || typeof d.enteredPendingDelivery !== "number") {
      return null;
    }
    return d as AdminOrdersRangeEventKpis;
  } catch {
    return null;
  }
}
