#!/usr/bin/env node
// ADMIN-ORDERS-FILTER-COUNT-PARTIAL-REFUND-STRIPE-ACCOUNTING-001 — regression guard.
//
// Locks in the server-side FACETED count contract for the admin Orders KPI row:
//   • KPI counts apply the same NON-STATUS filters as the list, then facet by
//     lifecycle bucket, so every card reconciles with the filtered "X of Y" total.
//   • The buckets mirror the list classifiers (orderClassification.ts); the
//     reconciliation invariant is: universe = lead ⊎ paid_unassigned ⊎ under_review
//     ⊎ (completed ∪ refunded)  (completed and refunded may overlap on a
//     completed-then-fully-refunded order — matching the list's tabs).
//   • Client-only filters (traffic source, package, duplicates) are NEVER counted
//     server-side — they block, so the UI never shows a silently-wrong number.
//   • The loader / pagination / polling is not touched.
//
// Layers: STATIC (source invariants) + LOGIC (partition/reconciliation mirror with
// negative controls) + --self-test.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const F_FACET = join(ROOT, "src", "pages", "admin-orders", "orderFacetCounts.ts");
const F_PAGE = join(ROOT, "src", "pages", "admin-orders", "page.tsx");

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";

// ── LOGIC mirror of the lifecycle classifiers (orderClassification.ts) ─────────
const isLead = (o) => !o.payment_intent_id || o.status === "lead";
const isRefundedBucket = (o) => o.status === "cancelled" || o.status === "refunded" || o.refund_status === "full";
const isCompleted = (o) => o.doctor_status === "patient_notified";
const hasProvider = (o) => !!o.doctor_email || !!o.doctor_user_id;
const isPaidUnassigned = (o, opts = {}) =>
  !isLead(o) && (opts.ignoreRefund ? true : !isRefundedBucket(o)) && !isCompleted(o) && !hasProvider(o);
const isUnderReview = (o) =>
  !isLead(o) && !isRefundedBucket(o) && !isCompleted(o) && hasProvider(o);

// Bucket a NON-archived order the way the faceted count queries do.
function facet(orders, opts = {}) {
  const nonArchived = orders.filter((o) => o.status !== "archived");
  return {
    universe: nonArchived.length,
    lead_unpaid: nonArchived.filter(isLead).length,
    paid_unassigned: nonArchived.filter((o) => isPaidUnassigned(o, opts)).length,
    under_review: nonArchived.filter(isUnderReview).length,
    completed: nonArchived.filter(isCompleted).length,
    refunded: nonArchived.filter(isRefundedBucket).length,
    completedOrRefunded: nonArchived.filter((o) => isCompleted(o) || isRefundedBucket(o)).length,
    archived: orders.filter((o) => o.status === "archived").length,
  };
}

// The reconciliation invariant.
function reconciles(f) {
  return f.universe === f.lead_unpaid + f.paid_unassigned + f.under_review + f.completedOrRefunded;
}

// filteredTotalFor mirror.
function filteredTotalFor(statusFilter, f) {
  if (statusFilter === "all") return f.universe;
  const m = {
    lead_unpaid: "lead_unpaid", paid_unassigned: "paid_unassigned", under_review: "under_review",
    completed: "completed", refunded: "refunded", payment_failed: "payment_failed",
  };
  return f[m[statusFilter]] ?? f.universe;
}

// ── Fixtures — one order per bucket, plus the completed∩refunded overlap ───────
const FIXTURES = [
  { id: "L1", payment_intent_id: null, status: "lead" },                                   // lead
  { id: "L2", payment_intent_id: null, status: "processing" },                             // lead (no PI)
  { id: "PU", payment_intent_id: "pi", status: "processing", doctor_status: "in_review" }, // paid unassigned
  { id: "UR", payment_intent_id: "pi", status: "processing", doctor_status: "in_review", doctor_email: "d@x.co" }, // under review
  { id: "C1", payment_intent_id: "pi", status: "completed", doctor_status: "patient_notified", doctor_email: "d@x.co" }, // completed
  { id: "R1", payment_intent_id: "pi", status: "processing", refund_status: "full" },      // refunded (full refund only)
  { id: "X1", payment_intent_id: "pi", status: "cancelled" },                              // refunded (cancelled)
  { id: "CR", payment_intent_id: "pi", status: "refunded", doctor_status: "patient_notified", doctor_email: "d@x.co" }, // completed ∩ refunded overlap
  { id: "A1", payment_intent_id: "pi", status: "archived" },                               // archived (excluded from universe)
];

function runLogic(collect) {
  const f = facet(FIXTURES);
  // Expected: universe = 8 (9 - 1 archived). lead 2, paid_unassigned 1, under_review 1,
  // completed 2 (C1, CR), refunded 3 (R1, X1, CR), completedOrRefunded = 2+3-1 = 4.
  collect("universe excludes archived", f.universe === 8, `got ${f.universe}`);
  collect("lead bucket", f.lead_unpaid === 2, `got ${f.lead_unpaid}`);
  collect("paid_unassigned bucket", f.paid_unassigned === 1, `got ${f.paid_unassigned}`);
  collect("under_review bucket", f.under_review === 1, `got ${f.under_review}`);
  collect("completed bucket (list defn, includes overlap)", f.completed === 2, `got ${f.completed}`);
  collect("refunded bucket", f.refunded === 3, `got ${f.refunded}`);
  collect("completed∩refunded overlap counted once in union", f.completedOrRefunded === 4, `got ${f.completedOrRefunded}`);
  collect("RECONCILES: universe = lead+paidUn+underRev+(comp∪ref)", reconciles(f), JSON.stringify(f));
  collect("archived counted separately", f.archived === 1, `got ${f.archived}`);
  collect("filteredTotalFor(all)=universe", filteredTotalFor("all", f) === 8, "");
  collect("filteredTotalFor(completed)=completed bucket", filteredTotalFor("completed", f) === 2, "");
  collect("paid_unassigned & under_review are mutually exclusive",
    FIXTURES.every((o) => !(isPaidUnassigned(o) && isUnderReview(o))), "");

  // Negative control: a broken paid_unassigned that ignores refunded status would
  // pull R1 in and break reconciliation.
  const broken = facet(FIXTURES, { ignoreRefund: true });
  collect("NEG-CONTROL: refund-ignoring paid_unassigned breaks reconciliation", !reconciles(broken), JSON.stringify(broken));
}

// ── STATIC ────────────────────────────────────────────────────────────────────
function runStatic(fail) {
  const facetSrc = readFileSync(F_FACET, "utf8");
  const page = readFileSync(F_PAGE, "utf8");

  // orderFacetCounts.ts — filters + facets + blocking + narrow queries
  const need = [
    [/EXCLUDE_FULL_REFUND_OR/, "reuse the canonical EXCLUDE_FULL_REFUND_OR SQL bridge"],
    [/EXCLUDE_REFUNDED_AT_OR/, "reuse the canonical EXCLUDE_REFUNDED_AT_OR SQL bridge"],
    [/count: "exact", head: true/, "use narrow COUNT(head) queries (never load the orders table)"],
    [/gte\("created_at"/, "apply the date filter on created_at like the list"],
    [/blockedClientFilters/, "surface client-only filters as blocked"],
    [/patient_notified/, "completed bucket = doctor_status patient_notified"],
    [/payment_intent_id/, "apply the payment filter"],
  ];
  for (const [re, msg] of need) if (!re.test(facetSrc)) fail(`[facet] missing: ${msg}`);
  // client-only filters must be blocked, never SQL'd
  if (!/if \(f\.source\)/.test(facetSrc) || !/if \(f\.duplicatesOnly\)/.test(facetSrc))
    fail("[facet] must block traffic-source and duplicates client-only filters");

  // page.tsx wiring
  if (!/fetchOrderFacetCounts\(/.test(page)) fail("[page] must call fetchOrderFacetCounts");
  // ADMIN-ORDERS-MONTHLY-KPI-BANNER-CORRECTION-001 — this guard previously
  // required the KPI cards to READ facetCounts.buckets. That was the regression:
  // the upper banner is a CURRENT-MONTH universe and must never be narrowed by
  // the active list filters. Facet counts now serve the LIST only. The banner's
  // own contract is enforced by check-admin-orders-monthly-kpis.mjs; here we
  // assert the inverse, so the two universes can never be re-merged.
  if (/value:\s*facetCounts\.buckets\./.test(page))
    fail("[page] a KPI card reads facetCounts.buckets — the banner is monthly, not filter-faceted");
  if (/kpiCounts\./.test(page)) fail("[page] old kpiCounts must be fully removed");
  if (/value: .*orders\.filter\(isPaidUnassigned\)/.test(page)) fail("[page] KPI values must NOT fall back to loaded-row counts");
  if (!/filteredTotalDisplay/.test(page)) fail("[page] 'X of Y' total must use the server-authoritative filteredTotalDisplay");
  // statusFilter must NOT be in the facet effect deps (facets must not self-contaminate)
  const eff = page.match(/fetchOrderFacetCounts\([\s\S]*?\}, \[([^\]]*)\]\)/);
  if (eff && /statusFilter/.test(eff[1])) fail("[page] facet effect deps must NOT include statusFilter (would contaminate facets)");
  // Loader must be untouched — these markers must still exist.
  // LIVE ARCHITECTURE NOTE (ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001-LIVE-ROLLOUT):
  // TEST also asserts `ordersReady`, a marker of the atomic-snapshot loader that
  // was REVERTED on LIVE (admin-orders-dataset-stability-live-rollout-001 — the
  // atomic backfill could not complete inside the LIVE refresh window). LIVE keeps
  // its progressive-paging loader, whose preservation markers are the monotonic
  // sequence guard plus the bounded page window. Same intent — prove the facet
  // work did not touch the loader — anchored on the loader LIVE actually runs.
  for (const m of ["loadSeqRef", "fetchOrdersPage", "ORDERS_PAGE_SIZE"]) if (!page.includes(m)) fail(`[page] loader marker '${m}' missing — loader must be preserved`);
}

// ── run ────────────────────────────────────────────────────────────────────────
const selfTest = process.argv.includes("--self-test");
const results = [];
const collect = (name, pass, detail) => results.push({ name, pass, detail: pass ? "" : detail });

if (selfTest) {
  console.log(`${YELLOW}admin-orders facet-counts — self-test (partition + reconciliation + negative control)${RESET}`);
  runLogic(collect);
  results.forEach((r) => console.log(`  ${r.pass ? GREEN + "✓" : RED + "✗"} ${r.name}${RESET}${r.detail ? " — " + r.detail : ""}`));
  const failed = results.filter((r) => !r.pass);
  if (failed.length) { console.error(`${RED}✗ self-test FAILED (${failed.length}/${results.length})${RESET}`); process.exit(1); }
  console.log(`${GREEN}✓ self-test passed (${results.length}/${results.length})${RESET}`);
} else {
  console.log(`${YELLOW}admin-orders facet-counts — guard (static + logic)${RESET}`);
  const failures = [];
  runLogic((name, pass, detail) => { if (!pass) failures.push(`[logic] ${name}: ${detail}`); });
  runStatic((m) => failures.push(m));
  if (failures.length) {
    console.error(`${RED}✗ facet-counts guard FAILED${RESET}`);
    failures.forEach((f) => console.error(`  ${RED}✗${RESET} ${f}`));
    process.exit(1);
  }
  console.log(`${GREEN}✓ partition/reconciliation logic + all static invariants passed${RESET}`);
}
