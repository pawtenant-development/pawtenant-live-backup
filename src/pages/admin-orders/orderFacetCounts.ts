// ADMIN-ORDERS-FILTER-COUNT-PARTIAL-REFUND-STRIPE-ACCOUNTING-001 (Workstream A)
//
// Server-side FACETED count contract for the admin Orders KPI row.
//
// Problem it fixes: the KPI cards used to run their own count queries with a
// DIFFERENT scope than the result list (some date-windowed, some all-time), so
// "Completed" etc. never matched the filtered "X of Y" total.
//
// Contract:
//   • Apply the SAME active NON-STATUS filters as the list (date/payment/state/
//     assigned+requested provider/sequence/search/no-GHL), then facet the
//     resulting universe by lifecycle bucket. The selected status tab narrows the
//     visible rows but NEVER contaminates the other status-facet counts.
//   • Narrow, RLS-enforced COUNT(head) queries only — the orders table is never
//     loaded into the browser, and this does NOT touch the loader/pagination.
//   • Same created_at field, timezone and inclusive boundaries as the list
//     (new Date(dateFrom) .. new Date(dateTo+"T23:59:59"), matching page.tsx).
//   • Bucket predicates mirror the list classifiers (orderClassification.ts) and
//     the EXCLUDE_*_OR SQL bridges, so a bucket count always equals the list rows
//     shown when that status tab is selected. Validated vs the DB: total 141 =
//     lead 0 + paid_unassigned 41 + under_review 11 + (completed 80 ∪ refunded 10).
//   • CLIENT-ONLY filters (traffic source, package, duplicates) cannot be
//     represented in SQL faithfully; when one is active it is returned in
//     `blockedClientFilters` and the UI must show the counts as unavailable
//     rather than a silently-wrong number.

import { supabase } from "../../lib/supabaseClient";
import {
  EXCLUDE_FULL_REFUND_OR,
  EXCLUDE_REFUNDED_AT_OR,
} from "../../lib/orderClassification";
// ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 — the date filter is basis-aware.
import { ORDER_DATE_BASIS_COLUMN, type OrderDateBasis } from "../../lib/orderLifecycle";

// Non-status filters, exactly as the list holds them.
export interface FacetFilters {
  // ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001: which date the From/To bounds
  // apply to. Defaults to "created" so an omitted basis keeps the historical
  // behaviour exactly. The list passes the ACTIVE basis, so the cards and the
  // rows are always measured on the same date.
  dateBasis?: OrderDateBasis;
  dateFrom?: string;          // "YYYY-MM-DD" inclusive (on the active basis)
  dateTo?: string;            // "YYYY-MM-DD" inclusive end
  payment?: string;           // "all" | "paid" | "unpaid"
  state?: string;             // "all" | <state>
  referredBy?: string;        // "all" | "none" | <referred_by value> (raw referred_by)
  assignedProvider?: string;  // "all" | "unassigned" | <doctor_email>
  requestedProvider?: string; // "all" | <selected_provider>
  sequence?: string;          // "all" | no_sequence | 30min_sent | 24h_sent | 3day_sent | opted_out
  search?: string;            // free text
  nonGhl?: boolean;           // show only non-GHL-synced
  // client-only (block when active — see header note)
  source?: string;            // "" | <traffic source label>
  packageFilter?: string;     // "all" | <package>
  duplicatesOnly?: boolean;
}

export type FacetBucket =
  | "lead_unpaid" | "paid_unassigned" | "under_review" | "completed"
  | "refunded" | "disputed" | "cancelled" | "payment_failed" | "archived";

export interface FacetCounts {
  // Universe = all rows matching the non-status filters (archived excluded, as the
  // list hides archived off the Archived tab). This is the "X of Y" X when the
  // status tab is "all".
  universeTotal: number | null;
  buckets: Record<FacetBucket, number | null>;
  blockedClientFilters: string[]; // human labels of active client-only filters
  error: boolean;
}

const CLIENT_ONLY_LABELS: Record<string, string> = {
  source: "Traffic source",
  packageFilter: "Package",
  duplicatesOnly: "Duplicates",
};

// Escape a value for safe use inside a PostgREST `ilike.*value*` arm. Commas and
// parentheses are the or()-filter delimiters and MUST NOT reach the parser; a
// double-quoted value neutralises them (PostgREST unquotes it before matching).
function safeIlikeArg(raw: string): string {
  // strip the two structural delimiters entirely, then quote the rest
  const cleaned = raw.replace(/[(),]/g, " ").trim();
  return `"*${cleaned}*"`;
}

type Q = ReturnType<ReturnType<typeof supabase.from>["select"]>;

// Apply every SQL-able NON-STATUS filter. Never applies statusFilter and never
// applies the client-only filters.
function applyNonStatusFilters(q: Q, f: FacetFilters): Q {
  // Date — identical instants to the list's Date parsing, applied to the ACTIVE
  // basis column. The `created` arm is the historical default and is written
  // literally so the long-standing created_at contract stays greppable.
  const basis: OrderDateBasis = f.dateBasis ?? "created";
  if (basis === "created") {
    if (f.dateFrom) q = q.gte("created_at", new Date(f.dateFrom).toISOString());
    if (f.dateTo) q = q.lte("created_at", new Date(`${f.dateTo}T23:59:59`).toISOString());
  } else {
    const col = ORDER_DATE_BASIS_COLUMN[basis];
    // A NULL basis value can never satisfy a range, and PostgREST gte/lte already
    // drop NULLs — so "completed in July" cannot leak never-completed orders.
    if (f.dateFrom) q = q.gte(col, new Date(f.dateFrom).toISOString());
    if (f.dateTo) q = q.lte(col, new Date(`${f.dateTo}T23:59:59`).toISOString());
  }

  if (f.payment === "paid") q = q.not("payment_intent_id", "is", null);
  else if (f.payment === "unpaid") q = q.is("payment_intent_id", null);

  if (f.state && f.state !== "all") q = q.eq("state", f.state);

  if (f.referredBy && f.referredBy !== "all") {
    // list: none → !o.referred_by (null OR ""); value → exact match
    if (f.referredBy === "none") q = q.or("referred_by.is.null,referred_by.eq.");
    else q = q.eq("referred_by", f.referredBy);
  }

  if (f.assignedProvider && f.assignedProvider !== "all") {
    if (f.assignedProvider === "unassigned") q = q.is("doctor_email", null).is("doctor_user_id", null);
    else q = q.ilike("doctor_email", f.assignedProvider); // no-wildcard ilike = case-insensitive equality
  }

  if (f.requestedProvider && f.requestedProvider !== "all") q = q.eq("selected_provider", f.requestedProvider);

  if (f.sequence && f.sequence !== "all") {
    // Sequence only applies to leads (unpaid or status=lead).
    q = q.or("payment_intent_id.is.null,status.eq.lead");
    if (f.sequence === "no_sequence") q = q.is("seq_30min_sent_at", null).is("seq_24h_sent_at", null).is("seq_3day_sent_at", null).or("followup_opt_out.is.null,followup_opt_out.eq.false");
    else if (f.sequence === "30min_sent") q = q.not("seq_30min_sent_at", "is", null).is("seq_24h_sent_at", null).is("seq_3day_sent_at", null);
    else if (f.sequence === "24h_sent") q = q.not("seq_24h_sent_at", "is", null).is("seq_3day_sent_at", null);
    else if (f.sequence === "3day_sent") q = q.not("seq_3day_sent_at", "is", null);
    else if (f.sequence === "opted_out") q = q.not("followup_opt_out", "is", null).eq("followup_opt_out", true);
  }

  if (f.nonGhl) q = q.is("ghl_synced_at", null);

  const term = (f.search ?? "").trim();
  if (term) {
    const a = safeIlikeArg(term);
    q = q.or(
      `confirmation_id.ilike.${a},email.ilike.${a},first_name.ilike.${a},last_name.ilike.${a},state.ilike.${a},doctor_name.ilike.${a},phone.ilike.${a},ghl_contact_id.ilike.${a}`,
    );
  }
  return q;
}

// The "not fully-refunded / not cancelled" (operationally active, financial view)
// SQL bridge — mirrors !isRefundedBucket via the canonical EXCLUDE_*_OR arms.
function excludeRefundedBucket(q: Q): Q {
  return q.neq("status", "cancelled").neq("status", "refunded").or(EXCLUDE_FULL_REFUND_OR).or(EXCLUDE_REFUNDED_AT_OR);
}

// Add a single bucket's status predicate to an already-non-status-filtered query.
function applyBucket(q: Q, bucket: FacetBucket): Q {
  switch (bucket) {
    case "lead_unpaid": // isLeadOrder
      return q.or("payment_intent_id.is.null,status.eq.lead");
    case "paid_unassigned": // isPaidUnassigned
      return excludeRefundedBucket(
        q.not("payment_intent_id", "is", null).neq("status", "lead"),
      ).or("doctor_status.is.null,doctor_status.neq.patient_notified").is("doctor_email", null).is("doctor_user_id", null);
    case "under_review": // isUnderReview
      return excludeRefundedBucket(
        q.not("payment_intent_id", "is", null).neq("status", "lead"),
      ).or("doctor_status.is.null,doctor_status.neq.patient_notified").or("doctor_email.not.is.null,doctor_user_id.not.is.null");
    case "completed": // list defn: doctor_status = patient_notified (does not exclude refunded)
      return q.eq("doctor_status", "patient_notified");
    case "refunded": // isRefundedBucket: full refund OR cancelled
      return q.or("status.eq.cancelled,status.eq.refunded,refund_status.eq.full");
    case "disputed":
      return q.or("status.eq.disputed,dispute_id.not.is.null");
    case "cancelled":
      return q.eq("status", "cancelled");
    case "payment_failed":
      return q.not("payment_failure_reason", "is", null).or("status.eq.lead,payment_intent_id.is.null");
    case "archived":
      return q.eq("status", "archived");
  }
}

function newCountQuery(): Q {
  return supabase.from("orders").select("id", { count: "exact", head: true });
}

async function runCount(q: Q): Promise<number | null> {
  const { count, error } = await q;
  if (error) throw error;
  return count ?? null;
}

const NON_ARCHIVED_BUCKETS: FacetBucket[] = [
  "lead_unpaid", "paid_unassigned", "under_review", "completed",
  "refunded", "disputed", "cancelled", "payment_failed",
];

// Fetch the universe total + every lifecycle bucket for the given non-status
// filters, in one parallel batch of narrow COUNT queries.
export async function fetchOrderFacetCounts(f: FacetFilters): Promise<FacetCounts> {
  const blockedClientFilters: string[] = [];
  if (f.source) blockedClientFilters.push(CLIENT_ONLY_LABELS.source);
  if (f.packageFilter && f.packageFilter !== "all") blockedClientFilters.push(CLIENT_ONLY_LABELS.packageFilter);
  if (f.duplicatesOnly) blockedClientFilters.push(CLIENT_ONLY_LABELS.duplicatesOnly);

  const empty: FacetCounts = {
    universeTotal: null,
    buckets: {
      lead_unpaid: null, paid_unassigned: null, under_review: null, completed: null,
      refunded: null, disputed: null, cancelled: null, payment_failed: null, archived: null,
    },
    blockedClientFilters,
    error: false,
  };

  // When a client-only filter is active we cannot represent it server-side, so we
  // refuse to publish a silently-wrong number (owner contract). Counts stay null;
  // the UI shows an "unavailable for this filter" state.
  if (blockedClientFilters.length > 0) return empty;

  try {
    // Universe (all non-status, archived excluded — the list hides archived).
    const universeQ = applyNonStatusFilters(newCountQuery().neq("status", "archived"), f);

    // Non-archived buckets: non-status filters + exclude archived + bucket predicate.
    const bucketQs = NON_ARCHIVED_BUCKETS.map((b) =>
      applyBucket(applyNonStatusFilters(newCountQuery().neq("status", "archived"), f), b),
    );
    // Archived bucket: non-status filters (no archived exclusion) + status=archived.
    const archivedQ = applyBucket(applyNonStatusFilters(newCountQuery(), f), "archived");

    const [universe, ...rest] = await Promise.all([
      runCount(universeQ),
      ...bucketQs.map(runCount),
      runCount(archivedQ),
    ]);

    const buckets = { ...empty.buckets };
    NON_ARCHIVED_BUCKETS.forEach((b, i) => { buckets[b] = rest[i]; });
    buckets.archived = rest[rest.length - 1];

    return { universeTotal: universe, buckets, blockedClientFilters, error: false };
  } catch (e) {
    console.error("[orderFacetCounts] count query failed", e);
    return { ...empty, error: true };
  }
}

// The "X of Y" filtered-result X, reconciled to the SAME server universe: when the
// status tab is "all" it is the universe total; otherwise it is that bucket's
// count. Returns null when unavailable (blocked client filter / error / loading).
export function filteredTotalFor(statusFilter: string, fc: FacetCounts): number | null {
  if (fc.error || fc.blockedClientFilters.length > 0) return null;
  if (statusFilter === "all") return fc.universeTotal;
  const map: Record<string, FacetBucket> = {
    lead_unpaid: "lead_unpaid", paid_unassigned: "paid_unassigned", under_review: "under_review",
    completed: "completed", refunded: "refunded", disputed: "disputed", cancelled: "cancelled",
    payment_failed: "payment_failed", archived: "archived",
  };
  const b = map[statusFilter];
  return b ? fc.buckets[b] : fc.universeTotal;
}
