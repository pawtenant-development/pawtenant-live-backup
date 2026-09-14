// partnerOrderScope — PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002.
//
// THE predicate for "a partner order", shared by the Partner Platform Orders
// list and the Overview cards, so a card's count IS the list's count.
//
// Before this module the Overview read `partner_admin_onboarding_state`
// (one partner only, no all-partners path) while the Orders list read the
// `orders` table through `applyListPredicates`; two implementations, two
// numbers. Every count here goes through the same builder the list uses —
// including the partner scope, which `FacetFilters.partnerId` already carries
// inside that funnel. "All partners" is `partnerId = null`.

import { supabase } from "../../lib/supabaseClient";
import { applyListPredicates, type FacetFilters } from "./orderFacetCounts";

/** The base filter set for every partner-order surface. */
export function partnerOrdersFilters(
  partnerId: string | null,
  overrides: Partial<FacetFilters> = {},
): FacetFilters {
  return {
    orderOrigin: "partner",
    dateBasis: "created",
    state: "all",
    assignedProvider: "all",
    ...(partnerId ? { partnerId } : {}),
    ...overrides,
  };
}

type Builder = ReturnType<ReturnType<typeof supabase.from>["select"]>;

/** Narrow a NON-orders query (releases, events, aging) to one partner; `null` = every partner. */
export function applyPartnerScope<T>(q: T, partnerId: string | null): T {
  if (!partnerId) return q;
  return (q as unknown as Builder).eq("partner_id", partnerId) as unknown as T;
}

/** A COUNT query over partner orders, through the list's own predicate builder. */
export function partnerOrdersCountQuery(partnerId: string | null) {
  return applyListPredicates(
    supabase.from("orders").select("id", { count: "exact", head: true }),
    partnerOrdersFilters(partnerId),
    "all",
  );
}

/** Predicates the workspace vocabulary is built from (same rules as the list chip). */
export const PARTNER_WORKFLOW_PREDICATES = {
  /** Clinical work completed: the completion definition the billable trigger uses. */
  completed: <T>(q: T): T =>
    (q as unknown as Builder).eq("doctor_status", "patient_notified").neq("status", "cancelled") as unknown as T,
  /** Needs an admin: paid but unassigned, or a document awaiting review.
   *  "Unassigned" keys on the assignment columns themselves — a partner order
   *  is created with doctor_status = 'pending_review' BEFORE any provider is
   *  assigned, so keying on a null doctor_status (the old Overview rule)
   *  silently under-counted every unassigned partner order. */
  needsAction: <T>(q: T): T =>
    (q as unknown as Builder)
      .neq("status", "cancelled")
      .or("and(paid_at.not.is.null,doctor_email.is.null,doctor_user_id.is.null),doctor_status.eq.pending_admin_approval") as unknown as T,
};

export async function countPartnerOrders(
  partnerId: string | null,
  refine?: <T>(q: T) => T,
): Promise<number | null> {
  try {
    let q = partnerOrdersCountQuery(partnerId);
    if (refine) q = refine(q);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  } catch (e) {
    console.error("[partnerOrderScope] count failed", e);
    return null;
  }
}
