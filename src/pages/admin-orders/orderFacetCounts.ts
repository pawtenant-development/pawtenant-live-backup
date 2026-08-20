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
//     (America/New_York business-day bounds, matching page.tsx exactly).
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
// MONTH-END-...-001 §D — range bounds are America/New_York business days.
import {
  ORDER_DATE_BASIS_COLUMN,
  businessDayStartUtcIso,
  businessDayEndExclusiveUtcIso,
  type OrderDateBasis,
} from "../../lib/orderLifecycle";

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
  | "lead_unpaid" | "paid_unassigned" | "under_review" | "pending_delivery" | "completed"
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

/**
 * The active filters the SERVER cannot faithfully represent. Collected in ONE
 * place so every count surface (lifecycle facets, KPI cards, sequence chips)
 * blocks on exactly the same conditions — three copies of this list is how one
 * surface ends up publishing a number the others refuse to.
 */
function collectBlockedClientFilters(f: FacetFilters): string[] {
  const blocked: string[] = [];
  if (f.source) blocked.push(CLIENT_ONLY_LABELS.source);
  if (f.packageFilter && f.packageFilter !== "all") blocked.push(CLIENT_ONLY_LABELS.packageFilter);
  if (f.duplicatesOnly) blocked.push(CLIENT_ONLY_LABELS.duplicatesOnly);
  return blocked;
}

// Escape a value for safe use inside a PostgREST `ilike.*value*` arm. Commas and
// parentheses are the or()-filter delimiters and MUST NOT reach the parser; a
// double-quoted value neutralises them (PostgREST unquotes it before matching).
function safeIlikeArg(raw: string): string {
  // strip the two structural delimiters entirely, then quote the rest
  const cleaned = raw.replace(/[(),]/g, " ").trim();
  return `"*${cleaned}*"`;
}

type Q = ReturnType<ReturnType<typeof supabase.from>["select"]>;

// ─── SEQUENCE: ONE PREDICATE, SHARED BY THE LIST AND THE CHIP COUNTS ─────────
//
// ADMIN-ORDERS-SEQUENCE-FILTER-AUTHORITATIVE-COUNTS-001.
//
// The Sequence Status control used to be TWO controls: an external "Sequence
// Stage" chip strip whose counts were `orders.filter(...)` over the ~100 loaded
// rows, and a count-less <select> inside Filters. Once the list became
// server-paged those chip numbers described the current PAGE, not the dataset —
// small, confident and wrong.
//
// The fix is not "count the loaded rows better", it is to route the counts
// through the SAME predicate the rows are selected with. `applySequenceFilter`
// is that one predicate: `applyNonStatusFilters` calls it for the ACTIVE
// selection (rows), and `fetchSequenceFacetCounts` calls it once per bucket
// (numbers). A chip count and the list it produces cannot drift apart, because
// there is nothing to drift.
//
// LEAD TRUNK — sequence outreach only ever applies to leads (never paid, or
// explicitly status='lead'). Every bucket, INCLUDING "All Leads", carries it.
const LEAD_TRUNK_OR = "payment_intent_id.is.null,status.eq.lead";

/**
 * The sequence-stage predicate. `sequence` is one of the canonical values kept
 * in `orders` (unchanged by this task — `30min_sent` still keys on
 * `seq_30min_sent_at`; only its FRIENDLY LABEL reads "5min Sent"):
 *   all | no_sequence | 30min_sent | 24h_sent | 3day_sent | opted_out
 *
 * "all" applies the lead trunk ALONE — that is what makes it the honest
 * denominator for the other five buckets rather than the whole orders table.
 */
function applySequenceFilter(q: Q, sequence: string): Q {
  q = q.or(LEAD_TRUNK_OR);
  if (sequence === "no_sequence") return q.is("seq_30min_sent_at", null).is("seq_24h_sent_at", null).is("seq_3day_sent_at", null).or("followup_opt_out.is.null,followup_opt_out.eq.false");
  if (sequence === "30min_sent") return q.not("seq_30min_sent_at", "is", null).is("seq_24h_sent_at", null).is("seq_3day_sent_at", null);
  if (sequence === "24h_sent") return q.not("seq_24h_sent_at", "is", null).is("seq_3day_sent_at", null);
  if (sequence === "3day_sent") return q.not("seq_3day_sent_at", "is", null);
  if (sequence === "opted_out") return q.not("followup_opt_out", "is", null).eq("followup_opt_out", true);
  return q; // "all" (and any unrecognised value) → the lead universe
}

// Apply every SQL-able NON-STATUS filter. Never applies statusFilter and never
// applies the client-only filters.
function applyNonStatusFilters(q: Q, f: FacetFilters): Q {
  // Date — identical instants to the list's client predicate, applied to the
  // ACTIVE basis column. MONTH-END-...-001 §D: bounds are BUSINESS-timezone
  // calendar days (America/New_York, inclusive start, EXCLUSIVE next-day end),
  // computed by the same helpers matchesBasisDateRange uses — never the
  // browser's clock, never UTC midnight. The `created` arm is the historical
  // default and is written literally so the created_at contract stays greppable.
  const basis: OrderDateBasis = f.dateBasis ?? "created";
  if (basis === "created") {
    if (f.dateFrom) q = q.gte("created_at", businessDayStartUtcIso(f.dateFrom));
    if (f.dateTo) q = q.lt("created_at", businessDayEndExclusiveUtcIso(f.dateTo));
  } else {
    const col = ORDER_DATE_BASIS_COLUMN[basis];
    // A NULL basis value can never satisfy a range, and PostgREST gte/lt already
    // drop NULLs — so "completed in July" cannot leak never-completed orders.
    if (f.dateFrom) q = q.gte(col, businessDayStartUtcIso(f.dateFrom));
    if (f.dateTo) q = q.lt(col, businessDayEndExclusiveUtcIso(f.dateTo));
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

  if (f.sequence && f.sequence !== "all") q = applySequenceFilter(q, f.sequence);

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
      ).or("doctor_status.is.null,doctor_status.neq.patient_notified")
        // ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001: Under Review must
        // EXCLUDE Pending Delivery, or the two tabs would double-count the same
        // order. Mirrors order_workflow_state(), where pending_delivery is tested
        // before under_review.
        .or("doctor_status.is.null,doctor_status.neq.pending_admin_approval")
        .or("doctor_email.not.is.null,doctor_user_id.not.is.null");
    case "pending_delivery":
      // Provider submitted the final letter; awaiting employee approval. Keyed on
      // the same row-level fact the SQL classifier uses. Refunded/cancelled orders
      // are excluded so the queue only shows actionable work.
      return excludeRefundedBucket(
        q.not("payment_intent_id", "is", null).neq("status", "lead"),
      ).eq("doctor_status", "pending_admin_approval");
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

// ─── ADMIN-ORDERS-SERVER-BACKED-LOADING-001 ─────────────────────────────────
//
// The Orders LIST is server-paged through the SAME predicate pair the counts
// above use (applyNonStatusFilters + applyBucket). That is the whole point:
// there is ONE predicate builder, so a row the server returns for a tab and the
// number that tab shows cannot drift apart. Re-implementing these buckets in
// SQL would have made parity something we assert instead of something that is
// true by construction — the exact failure this module was written to end.
//
// Two things live here rather than in page.tsx so the row read and the count
// read cannot diverge:
//   • the DEFAULT SCOPE window (below), and
//   • applyListStatus / applyListPredicates, the single row-read entry point.

/**
 * Default scope: the operator opens Orders and gets the recent working set plus
 * everything still operationally open — NOT the whole table.
 *
 * Measured on TEST at 609 orders: 120 rows instead of 609, and 35 of those 120
 * are older than the window but still actionable (they would otherwise have
 * vanished — the regression §17 forbids).
 *
 * Deliberately NOT "every non-terminal row": unpaid leads never terminate, so
 * that definition returned 511 of 609 and defeated the purpose. "Actionable"
 * here is the PAID operational queue — Paid/Unassigned ∪ Under Review ∪ Pending
 * Delivery — which is what an operator actually has to work. Recent leads still
 * arrive through the date arms.
 */
export const DEFAULT_SCOPE_DAYS = 60;

export function defaultScopeCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - DEFAULT_SCOPE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * The paid operational queue, as ONE PostgREST and() arm. Mirrors the
 * paid_unassigned / under_review / pending_delivery buckets' shared trunk:
 * paid, not a lead, not refunded/cancelled, not already delivered.
 */
function paidOpenQueueArm(): string {
  return [
    "and(payment_intent_id.not.is.null",
    "status.neq.lead",
    "status.neq.cancelled",
    "status.neq.refunded",
    "doctor_status.neq.patient_notified",
    "refunded_at.is.null",
    "or(refund_status.is.null,refund_status.neq.full))",
  ].join(",");
}

/**
 * Recent-by-creation OR recent-by-activity OR still in the paid open queue.
 *
 * The activity arm matters: an old order touched last week is part of the
 * working set even when it is already completed, and would otherwise be
 * reachable only by search.
 */
export function applyDefaultScope(q: Q, cutoffIso: string): Q {
  return q.or(
    `created_at.gte."${cutoffIso}",last_meaningful_activity_at.gte."${cutoffIso}",${paidOpenQueueArm()}`,
  );
}

const FACET_BUCKET_SET = new Set<string>([
  "lead_unpaid", "paid_unassigned", "under_review", "pending_delivery", "completed",
  "refunded", "disputed", "cancelled", "payment_failed", "archived",
]);

/**
 * The status TAB, server-side. Mirrors the list's client predicate exactly,
 * including its two structural rules: archived rows are hidden on every tab
 * except Archived, and an unrecognised tab falls back to matching the raw
 * status / doctor_status value.
 *
 * `orders.status` and `orders.doctor_status` are NOT NULL on both projects
 * (verified: 0 nulls in 609 rows), so .neq() cannot silently drop rows here.
 */
export function applyListStatus(q: Q, statusFilter: string): Q {
  if (statusFilter === "archived") return applyBucket(q, "archived");
  q = q.neq("status", "archived");
  if (statusFilter === "all") return q;
  if (FACET_BUCKET_SET.has(statusFilter)) return applyBucket(q, statusFilter as FacetBucket);
  return q.or(`status.eq.${statusFilter},doctor_status.eq.${statusFilter}`);
}

/**
 * Whether the 60-day default scope may narrow the list.
 *
 * It applies ONLY to the untouched default view. The moment the operator
 * searches, picks a tab, opens a filter, sets a date range or clicks a KPI
 * card, the window is dropped and the query runs against the COMPLETE dataset
 * (§3 and §4). That is also what keeps the tab counts honest: a tab count is a
 * full-dataset number, and selecting that tab shows a full-dataset list.
 */
export function isDefaultScopeEligible(f: FacetFilters, statusFilter: string): boolean {
  if (statusFilter !== "all") return false;
  if ((f.search ?? "").trim()) return false;
  if (f.dateFrom || f.dateTo) return false;
  if (f.payment && f.payment !== "all") return false;
  if (f.state && f.state !== "all") return false;
  if (f.referredBy && f.referredBy !== "all") return false;
  if (f.assignedProvider && f.assignedProvider !== "all") return false;
  if (f.requestedProvider && f.requestedProvider !== "all") return false;
  if (f.sequence && f.sequence !== "all") return false;
  if (f.nonGhl) return false;
  if (f.source) return false;
  if (f.packageFilter && f.packageFilter !== "all") return false;
  if (f.duplicatesOnly) return false;
  return true;
}

/**
 * THE row-read predicate entry point. page.tsx supplies the projection + the
 * ordering + the page window; every WHERE clause comes from here.
 */
// Generic in the builder type: the COUNT query (`select("id",{head})`) and the
// ROW query (`select(ORDERS_LIST_COLUMNS)`) are different PostgREST generics but
// identical filter surfaces. Keeping one implementation is the whole point, so
// the cast lives here once instead of at every call site.
export function applyListPredicates<T>(
  q: T,
  f: FacetFilters,
  statusFilter: string,
  opts: { defaultScopeCutoff?: string | null } = {},
): T {
  let out = applyListStatus(q as unknown as Q, statusFilter);
  out = applyNonStatusFilters(out, f);
  if (opts.defaultScopeCutoff) out = applyDefaultScope(out, opts.defaultScopeCutoff);
  return out as unknown as T;
}

/**
 * Total rows the CURRENT list query matches, server-side. This is the "Y" the
 * list shows while the default scope is narrowing it — a full-dataset count
 * would claim 609 while 120 rows were on screen.
 *
 * The KPI cards and status-tab facets deliberately do NOT use this: they stay
 * full-dataset (§15).
 */
export async function fetchListScopeTotal(
  f: FacetFilters,
  statusFilter: string,
  opts: { defaultScopeCutoff?: string | null } = {},
): Promise<number | null> {
  try {
    return await runCount(applyListPredicates(newCountQuery(), f, statusFilter, opts));
  } catch (e) {
    console.error("[orderFacetCounts] list scope total failed", e);
    return null;
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
  "lead_unpaid", "paid_unassigned", "under_review", "pending_delivery", "completed",
  "refunded", "disputed", "cancelled", "payment_failed",
];

// Fetch the universe total + every lifecycle bucket for the given non-status
// filters, in one parallel batch of narrow COUNT queries.
export async function fetchOrderFacetCounts(f: FacetFilters): Promise<FacetCounts> {
  const blockedClientFilters = collectBlockedClientFilters(f);

  const empty: FacetCounts = {
    universeTotal: null,
    buckets: {
      lead_unpaid: null, paid_unassigned: null, under_review: null, pending_delivery: null, completed: null,
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

// ─── ADMIN-ORDERS-CLICKABLE-KPI-CARD-COUNT-TO-LIST-PARITY-001 ────────────────
//
// The five OPERATIONAL KPI cards. Each is a CURRENT-STATE bucket measured on its
// own stage-entry date column — a hybrid, and deliberately so:
//
//   count = (order is IN this state right now) AND (it ENTERED that state
//           inside the active America/New_York range)
//
// This is what makes count-to-list parity possible at all. The previous contract
// counted period EVENTS ("entered Under Review in August") while the tabs showed
// CURRENT state, so an order that entered review in August and has since been
// completed was counted by the card but absent from the tab. On LIVE that
// produced Paid=3 against 0 actual Paid (Unassigned) rows, and Entered Pending
// Delivery=4 against 1 actual row.
//
// PARITY IS STRUCTURAL, NOT ASSERTED: fetchKpiCardCounts() below reuses the very
// same applyNonStatusFilters() + applyBucket() pair that fetchOrderFacetCounts()
// uses for the list total. There is one predicate builder, so the card count and
// the clicked list cannot drift apart by construction.
export type KpiCardKey =
  | "lead_unpaid" | "paid_unassigned" | "under_review" | "pending_delivery" | "completed";

export const KPI_CARD_KEYS: KpiCardKey[] = [
  "lead_unpaid", "paid_unassigned", "under_review", "pending_delivery", "completed",
];

/**
 * The stage-entry date column each card measures its range against. These are
 * the AUTHORITATIVE lifecycle timestamps (see ORDER_DATE_BASIS_COLUMN):
 *   lead_unpaid      → created_at
 *   paid_unassigned  → paid_at                          (immutable first payment)
 *   under_review     → last_under_review_entered_at
 *   pending_delivery → last_pending_delivery_entered_at
 *   completed        → last_completed_at
 * Clicking a card applies its basis to the list, so the rows are windowed on the
 * same column the count used.
 */
export const KPI_CARD_BASIS: Record<KpiCardKey, OrderDateBasis> = {
  lead_unpaid: "created",
  paid_unassigned: "first_paid",
  under_review: "under_review_entered",
  pending_delivery: "pending_delivery_entered",
  completed: "completed",
};

// ─── ADMIN-ORDERS-KPI-TO-LIST-CONSISTENCY-001 ────────────────────────────────
//
// WHAT A CARD MEANS. Two kinds, and conflating them is the defect this fixes.
//
//   "operational" — a WORK QUEUE. It answers "how much is on my desk right
//                   now?". Its population is CURRENT INVENTORY across ALL
//                   DATES. Lead (Unpaid), Paid (Unassigned), Under Review and
//                   Pending Delivery are queues.
//
//   "event"       — a lifecycle EVENT that happened inside the selected
//                   business period. Completed is the only one: an order paid
//                   in July but completed in August belongs to August.
//
// THE BUG THIS REPLACES. Every card, queues included, was gated on
// "entered this stage inside the active New York window". That is a hybrid
// (in the queue now AND entered it this month), and it silently deletes real
// work: an order that entered Pending Delivery on July 30 and is still waiting
// on August 1 counted as ZERO while it sat in the queue. Observed on LIVE:
// Pending Delivery showed 0 with one order genuinely waiting. A queue is sized
// by WHAT IS IN IT, never by when each item arrived.
//
// A second, quieter consequence: `gte`/`lt` drop NULLs, so a queued order whose
// stage-entry timestamp was never recorded was invisible on its card in EVERY
// month. Dropping the range for queues fixes that too.
export type KpiCardKind = "operational" | "event";

export const KPI_CARD_KIND: Record<KpiCardKey, KpiCardKind> = {
  lead_unpaid: "operational",
  paid_unassigned: "operational",
  under_review: "operational",
  pending_delivery: "operational",
  completed: "event",
};

/**
 * THE window a card is measured over — used by BOTH the card's count and the
 * list the card opens.
 *
 * This function existing is the whole parity mechanism. The count and the list
 * previously each built their own (basis, from, to) triple from the same inputs;
 * that is parity by coincidence, and it survives exactly until someone edits one
 * of them. Now there is one function, so the clicked list cannot be windowed
 * differently from the number that was clicked.
 *
 * Operational cards keep their stage-entry BASIS — it still drives the sort, the
 * day ribbons and the CSV order, which is genuinely useful ("oldest in the queue
 * first") — but carry NO range, so current workload never expires at a month
 * rollover.
 */
export function kpiCardWindow(
  key: KpiCardKey,
  range: { from?: string; to?: string },
): { dateBasis: OrderDateBasis; dateFrom?: string; dateTo?: string } {
  const dateBasis = KPI_CARD_BASIS[key];
  if (KPI_CARD_KIND[key] === "operational") {
    return { dateBasis, dateFrom: undefined, dateTo: undefined };
  }
  return { dateBasis, dateFrom: range.from, dateTo: range.to };
}

export const KPI_CARD_LABEL: Record<KpiCardKey, string> = {
  lead_unpaid: "Lead (Unpaid)",
  paid_unassigned: "Paid (Unassigned)",
  under_review: "Under Review",
  pending_delivery: "Pending Delivery",
  completed: "Completed",
};

export interface KpiCardCounts {
  counts: Record<KpiCardKey, number | null>;
  blockedClientFilters: string[];
  error: boolean;
}

/**
 * One narrow COUNT(head) per card, each with that card's OWN date basis, run in
 * parallel. Server-side and RLS-enforced — never derived from the browser's
 * loaded rows.
 *
 * `f` carries the active NON-STATUS filters (search / package / provider / …)
 * minus the date range, which is supplied separately as the ACTIVE New York
 * window so every card measures the same period on its own column.
 */
export async function fetchKpiCardCounts(
  f: Omit<FacetFilters, "dateBasis" | "dateFrom" | "dateTo">,
  range: { from?: string; to?: string },
): Promise<KpiCardCounts> {
  const blockedClientFilters = collectBlockedClientFilters(f as FacetFilters);

  const empty: Record<KpiCardKey, number | null> = {
    lead_unpaid: null, paid_unassigned: null, under_review: null, pending_delivery: null, completed: null,
  };
  // Same owner contract as the facet counts: refuse to publish a silently-wrong
  // number rather than show one that the list cannot reproduce.
  if (blockedClientFilters.length > 0) return { counts: empty, blockedClientFilters, error: false };

  try {
    const results = await Promise.all(
      KPI_CARD_KEYS.map((k) =>
        runCount(
          applyBucket(
            applyNonStatusFilters(newCountQuery().neq("status", "archived"), {
              ...f,
              // ADMIN-ORDERS-KPI-TO-LIST-CONSISTENCY-001: the SAME helper the
              // list uses to build its effective window (page.tsx). Operational
              // queues come back with no range — current inventory, all dates.
              ...kpiCardWindow(k, range),
            }),
            k,
          ),
        ),
      ),
    );
    const counts = { ...empty };
    KPI_CARD_KEYS.forEach((k, i) => { counts[k] = results[i]; });
    return { counts, blockedClientFilters, error: false };
  } catch (e) {
    console.error("[orderFacetCounts] KPI card count query failed", e);
    return { counts: empty, blockedClientFilters, error: true };
  }
}

// ─── ADMIN-ORDERS-SEQUENCE-FILTER-AUTHORITATIVE-COUNTS-001 ───────────────────
//
// THE SEQUENCE CHIP COUNTS.
//
// COUNT UNIVERSE (documented from the behaviour the external strip had before
// server-backed paging made it wrong):
//
//   • LEAD-SCOPED, NOT TAB-SCOPED. Sequence outreach exists only for unpaid
//     leads, and the old strip counted `orders.filter(isLead)` regardless of
//     which lifecycle tab was selected. That is preserved: `statusFilter` is
//     NOT applied, so opening the Completed tab does not zero every chip.
//   • FACETED ON EVERYTHING ELSE. Search, date basis/range, payment, state,
//     assigned/requested provider, referred-by and no-GHL ARE applied — the
//     chips describe the operator's current selection, not the whole table.
//   • THE SEQUENCE FILTER ITSELF IS EXCLUDED. Standard faceted-search
//     semantics: selecting "24h Sent" must not collapse the other five chips to
//     zero, because their whole purpose is to say where you could go next.
//   • Archived rows are excluded, exactly as the list hides them.
//
// One narrow COUNT(head) per chip, all six in parallel — no N+1 over rows, no
// row download, and no second definition of "what a sequence stage is".
export type SequenceFacetKey =
  | "all" | "no_sequence" | "30min_sent" | "24h_sent" | "3day_sent" | "opted_out";

export const SEQUENCE_FACET_KEYS: SequenceFacetKey[] = [
  "all", "no_sequence", "30min_sent", "24h_sent", "3day_sent", "opted_out",
];

/**
 * Friendly chip labels. `30min_sent` reads "5min Sent" because the first
 * follow-up now goes out at ~5 minutes; the STORED VALUE and the
 * `seq_30min_sent_at` column are deliberately untouched (renaming them would be
 * a data migration for a caption).
 */
export const SEQUENCE_FACET_LABEL: Record<SequenceFacetKey, string> = {
  all: "All Leads",
  no_sequence: "Not Started",
  "30min_sent": "5min Sent",
  "24h_sent": "24h Sent",
  "3day_sent": "3-Day Sent",
  opted_out: "Opted Out",
};

export interface SequenceFacetCounts {
  counts: Record<SequenceFacetKey, number | null>;
  blockedClientFilters: string[];
  error: boolean;
}

const EMPTY_SEQUENCE_COUNTS: Record<SequenceFacetKey, number | null> = {
  all: null, no_sequence: null, "30min_sent": null, "24h_sent": null, "3day_sent": null, opted_out: null,
};

export function emptySequenceFacetCounts(): SequenceFacetCounts {
  return { counts: { ...EMPTY_SEQUENCE_COUNTS }, blockedClientFilters: [], error: false };
}

/**
 * `extraBlockedLabels` carries client-only narrowings that live in page state
 * rather than in FacetFilters (today: "Hide sent within 7 days"). They block the
 * same way a client-only filter does — the contract is that an unavailable count
 * renders as unavailable, never as a confident number the list cannot reproduce.
 */
export async function fetchSequenceFacetCounts(
  f: FacetFilters,
  extraBlockedLabels: string[] = [],
): Promise<SequenceFacetCounts> {
  const blockedClientFilters = [...collectBlockedClientFilters(f), ...extraBlockedLabels];
  if (blockedClientFilters.length > 0) {
    return { counts: { ...EMPTY_SEQUENCE_COUNTS }, blockedClientFilters, error: false };
  }

  try {
    const results = await Promise.all(
      SEQUENCE_FACET_KEYS.map((k) =>
        runCount(
          applySequenceFilter(
            // `sequence: "all"` is the faceting step: every other active filter
            // is applied, the sequence selection is not.
            applyNonStatusFilters(newCountQuery().neq("status", "archived"), { ...f, sequence: "all" }),
            k,
          ),
        ),
      ),
    );
    const counts = { ...EMPTY_SEQUENCE_COUNTS };
    SEQUENCE_FACET_KEYS.forEach((k, i) => { counts[k] = results[i]; });
    return { counts, blockedClientFilters, error: false };
  } catch (e) {
    console.error("[orderFacetCounts] sequence facet count query failed", e);
    return { counts: { ...EMPTY_SEQUENCE_COUNTS }, blockedClientFilters, error: true };
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
    pending_delivery: "pending_delivery", completed: "completed", refunded: "refunded", disputed: "disputed", cancelled: "cancelled",
    payment_failed: "payment_failed", archived: "archived",
  };
  const b = map[statusFilter];
  return b ? fc.buckets[b] : fc.universeTotal;
}
