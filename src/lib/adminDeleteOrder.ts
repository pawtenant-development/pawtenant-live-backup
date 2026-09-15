// src/lib/adminDeleteOrder.ts
//
// ADMIN-ORDER-DELETE-REPAIR-002 — 2026-09-16
//
// THE single client-side implementation of "permanently delete this order".
//
// Why this file exists
// --------------------
// ADMIN-ORDER-DELETE-REPAIR-001 replaced the browser-side child-delete cascade
// with the admin-gated `admin_delete_order` SECURITY DEFINER RPC — but only
// inside OrderDetailModal. Three other admin controls kept shipping the old
// cascade, and a crawl of the deployed LIVE bundle confirmed all four were
// live side by side (one `admin_delete_order` call, three hand-rolled
// cascades):
//
//     src/pages/admin-orders/page.tsx          handleBulkDelete
//     src/pages/admin-orders/page.tsx          handleApproveAction('bulk_delete')
//     src/pages/admin-orders/components/PaymentsTab.tsx
//                                              handleBulkDeletePayments
//
// Each of them:
//   * issued DELETEs for five child tables and missed every NO ACTION /
//     RESTRICT child added since (shared_order_notes, partner_billable_events,
//     partner_intake_drafts, partner_order_drafts,
//     partner_order_reconciliations, google_ads_conversion_*), so a blocked
//     order surfaced a raw Postgres 23503 constraint string — or, in
//     PaymentsTab, no error at all because the result was never inspected; and
//   * removed the row from the on-screen list REGARDLESS of the outcome, so a
//     failed delete looked like a success until the next refresh brought the
//     order back. That is the "deleting an order does not work" report.
//
// Everything now funnels through `adminDeleteOrder` below, so there is exactly
// one place where the RPC contract, the audit-log cleanup and the
// error-to-sentence mapping live.

import { supabase } from "./supabaseClient";

/** Shape of the RPC's jsonb return. Mirrors the migration's documented contract. */
interface AdminDeleteOrderRpcResult {
  ok?: boolean;
  error?: string;
  child_count?: number;
  confirmation_id?: string;
  blocking?: Record<string, number>;
  blocking_tables?: string[];
  detail?: string;
  /** Legacy code from the pre-002 LIVE function; still mapped so a rollout in
   *  progress (new bundle, old function) never shows a raw token. */
  adjustments?: number;
  uploads?: number;
}

export interface AdminDeleteOrderOutcome {
  ok: boolean;
  /** Always populated. On failure this is the sentence to show the operator. */
  message: string;
  /** Machine code, for callers that want to branch (e.g. skip vs. retry). */
  code?: string;
}

/**
 * Human labels for the tables that can block a hard delete. Anything not
 * listed falls back to the raw table name, which is still far more useful than
 * a constraint name — and the RPC reads its blocker list from pg_constraint, so
 * a newly added table shows up here on day one without a code change.
 */
const BLOCKER_LABELS: Record<string, string> = {
  partner_billable_events: "partner billing events",
  partner_intake_drafts: "partner intake drafts",
  partner_order_drafts: "partner order drafts",
  partner_order_reconciliations: "partner reconciliation records",
  google_ads_conversion_adjustments: "Google Ads conversion adjustments",
  google_ads_conversion_uploads: "Google Ads conversion uploads",
  doctor_earnings: "provider earnings",
  shared_order_notes: "shared order notes",
};

function labelFor(table: string): string {
  return BLOCKER_LABELS[table] ?? table.replace(/_/g, " ");
}

/** Turn the RPC's `blocking` map into "2 partner billing events and 1 partner order draft". */
function describeBlockers(result: AdminDeleteOrderRpcResult): string {
  const blocking = result.blocking ?? {};
  const parts = Object.entries(blocking).map(([key, count]) => {
    const table = key.split(".")[0];
    const label = labelFor(table);
    return `${count} ${label}`;
  });
  if (!parts.length) {
    const tables = result.blocking_tables ?? [];
    if (tables.length) return tables.map(labelFor).join(", ");
    return "related records";
  }
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Map an RPC refusal to the sentence an administrator can act on. */
function messageForFailure(
  result: AdminDeleteOrderRpcResult,
  confirmationId: string,
): string {
  switch (result.error) {
    case "order_not_found":
      return `${confirmationId} no longer exists — it may already have been deleted.`;

    case "has_child_orders":
      return (
        `${confirmationId} has ${result.child_count ?? 1} linked Additional-Pet order(s). ` +
        "Delete those first — removing this one would orphan them."
      );

    case "blocked_by_related_records":
      return (
        `${confirmationId} cannot be hard-deleted: it still has ${describeBlockers(result)}. ` +
        "Those are billing and audit records, so they are kept rather than destroyed — " +
        "archive the order instead, or remove those records first."
      );

    // Pre-002 LIVE function. Kept so a partially rolled-out deploy still reads well.
    case "has_ad_conversion_records": {
      const n = (result.adjustments ?? 0) + (result.uploads ?? 0);
      return (
        `${confirmationId} cannot be hard-deleted: it still has ${n} Google Ads conversion ` +
        "record(s). Those are kept rather than destroyed — archive the order instead."
      );
    }

    default:
      return `${confirmationId} — delete failed: ${result.error ?? "unknown error"}`;
  }
}

/**
 * Permanently delete one order.
 *
 * Authorisation is enforced server-side by admin_delete_order's check_is_admin()
 * gate; any role gate in the UI is presentation only. Returns a result object
 * rather than throwing so bulk callers can report per-order outcomes.
 */
export async function adminDeleteOrder(order: {
  id: string;
  confirmation_id: string;
}): Promise<AdminDeleteOrderOutcome> {
  const confirmationId = order.confirmation_id;

  // audit_logs is keyed by confirmation_id with no FK, so it never blocks the
  // delete and the RPC has no reason to touch it. Clearing it here preserves
  // exactly what a purge has always removed. A failure is logged, not fatal.
  try {
    const auditRes = await supabase
      .from("audit_logs")
      .delete()
      .eq("object_id", confirmationId);
    if (auditRes?.error) {
      console.warn("[adminDeleteOrder] audit_logs cleanup failed:", auditRes.error);
    }
  } catch (err) {
    console.warn("[adminDeleteOrder] audit_logs cleanup threw:", err);
  }

  let data: unknown;
  let error: { message?: string } | null = null;
  try {
    const res = await supabase.rpc("admin_delete_order", { p_order_id: order.id });
    data = res.data;
    error = res.error;
  } catch (err) {
    return {
      ok: false,
      code: "network_error",
      message:
        `${confirmationId} — could not reach the server. Check your connection and try again. ` +
        (err instanceof Error ? `(${err.message})` : ""),
    };
  }

  if (error) {
    if (/admin access required/i.test(error.message ?? "")) {
      return {
        ok: false,
        code: "not_admin",
        message: "Admin access required to permanently delete orders.",
      };
    }
    return {
      ok: false,
      code: "rpc_error",
      message: `${confirmationId} — delete failed: ${error.message ?? "unknown error"}`,
    };
  }

  const result = (data ?? null) as AdminDeleteOrderRpcResult | null;

  if (!result?.ok) {
    return {
      ok: false,
      code: result?.error ?? "unknown",
      message: messageForFailure(result ?? {}, confirmationId),
    };
  }

  return { ok: true, message: `${confirmationId} permanently deleted.` };
}

/**
 * Delete many orders, one RPC per order, and report precisely what happened.
 *
 * `deleted` contains ONLY the orders the database actually removed — callers
 * must filter their on-screen list by this set and never by the selection, or
 * a failed delete looks like a success until the next refresh.
 */
export interface AdminBulkDeleteOutcome {
  deleted: string[];
  failures: { confirmationId: string; message: string }[];
  message: string;
}

export async function adminDeleteOrders(
  orders: { id: string; confirmation_id: string }[],
): Promise<AdminBulkDeleteOutcome> {
  const deleted: string[] = [];
  const failures: { confirmationId: string; message: string }[] = [];

  for (const order of orders) {
    const outcome = await adminDeleteOrder(order);
    if (outcome.ok) deleted.push(order.confirmation_id);
    else failures.push({ confirmationId: order.confirmation_id, message: outcome.message });
  }

  return { deleted, failures, message: summarise(deleted, failures) };
}

function summarise(
  deleted: string[],
  failures: { confirmationId: string; message: string }[],
): string {
  const n = deleted.length;
  const plural = n === 1 ? "" : "s";
  if (!failures.length) {
    return n
      ? `${n} order${plural} permanently deleted.`
      : "Nothing was deleted.";
  }
  const head = n
    ? `${n} order${plural} deleted, ${failures.length} could not be deleted:`
    : `No orders were deleted — ${failures.length} could not be deleted:`;
  // Surface each real reason. Bulk operators need to know WHICH order and WHY,
  // not a bare count.
  return [head, ...failures.map((f) => `• ${f.message}`)].join(" ");
}
