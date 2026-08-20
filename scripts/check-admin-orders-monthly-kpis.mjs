#!/usr/bin/env node
// ADMIN-ORDERS-MONTHLY-KPI-BANNER-CORRECTION-001 — monthly KPI banner guard.
//
// The upper Admin Orders banner is a CURRENT-MONTH operational summary. It
// regressed once already, to all-time / filter-faceted totals, because the banner
// and the list were served by ONE ambiguous count object. This guard makes that
// regression un-shippable.
//
// It proves, statically:
//   • the banner reads a server-authoritative MONTHLY aggregate, not facet counts
//   • month boundaries are America/New_York with an EXCLUSIVE upper bound
//   • each card uses its canonical timestamp (and not the wrong one)
//   • the banner consumes NO list filter, NO Date Basis, NO pagination
//   • there are EXACTLY five cards and none of them is Payment Failed
//     (ADMIN-ORDER-PENDING-DELIVERY-...-001 §5 amended the four-card contract:
//      Pending Delivery is a real mutually-exclusive workflow state, unlike the
//      secondary metrics this guard was written to keep out of the banner)
//   • Payment Failed survives as a status FILTER
//   • the list keeps its own filter-aware facet counts, in a DISTINCT module
//
// Run:  node scripts/check-admin-orders-monthly-kpis.mjs [--self-test]

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", DIM = "\x1b[2m", RESET = "\x1b[0m";

const PAGE   = "src/pages/admin-orders/page.tsx";
const LIB    = "src/lib/adminOrdersMonthlyKpis.ts";
const FACETS = "src/pages/admin-orders/orderFacetCounts.ts";
// The CANONICAL (latest, deployed) definition of the aggregate. The original
// 20260727100000 migration still exists in the ledger but has been superseded by
// the current-workload rewrite; guarding the superseded file would let the
// deployed function drift freely.
const MIG    = "supabase/migrations/20260801180000_admin_orders_monthly_lead_excludes_archived.sql";
// MONTH-END-...-001 §D — the custom-range PERIOD-EVENT additions.
const RANGE_LIB = "src/lib/adminOrdersRangeKpis.ts";
const LIFECYCLE = "src/lib/orderLifecycle.ts";
const MIG2   = "supabase/migrations/20260801170000_order_lifecycle_event_timestamps.sql";

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

// ── Extractors ────────────────────────────────────────────────────────────────

/** The dependency array of the effect that loads the monthly aggregate. */
export function monthlyEffectDeps(page) {
  const m = page.match(/fetchAdminOrdersMonthlyKpis\(\)[\s\S]{0,600}?\}\s*,\s*\[([^\]]*)\]\s*\)/);
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

/** The labels of the KPI banner cards, in order. */
export function bannerCardLabels(page) {
  const grid = page.indexOf("lg:grid-cols-5");
  if (grid < 0) return null;
  const end = page.indexOf("].map((s)", grid);
  if (end < 0) return null;
  const block = page.slice(grid, end);
  return [...block.matchAll(/label:\s*"([^"]+)"/g)].map((x) => x[1]);
}

/** The value expression of each KPI banner card, in order. */
export function bannerCardValues(page) {
  const grid = page.indexOf("lg:grid-cols-5");
  if (grid < 0) return null;
  const end = page.indexOf("].map((s)", grid);
  if (end < 0) return null;
  return [...page.slice(grid, end).matchAll(/value:\s*([^,\n]+)/g)].map((x) => x[1].trim());
}

/** §D — the range-mode (period-event) labels of the cards, in order. */
export function bannerCardRangeLabels(page) {
  const grid = page.indexOf("lg:grid-cols-5");
  if (grid < 0) return null;
  const end = page.indexOf("].map((s)", grid);
  if (end < 0) return null;
  return [...page.slice(grid, end).matchAll(/rangeLabel:\s*"([^"]+)"/g)].map((x) => x[1]);
}

/** §D — the range-mode value expression of each card, in order. */
export function bannerCardRangeValues(page) {
  const grid = page.indexOf("lg:grid-cols-5");
  if (grid < 0) return null;
  const end = page.indexOf("].map((s)", grid);
  if (end < 0) return null;
  return [...page.slice(grid, end).matchAll(/rangeValue:\s*([^,\n]+)/g)].map((x) => x[1].trim());
}

/** §D — the dependency array of the RANGE effect (separate from the banner's). */
export function rangeEffectDeps(page) {
  const m = page.match(/fetchAdminOrdersRangeEventKpis\(\{[\s\S]{0,700}?\}\s*,\s*\[([^\]]*)\]\s*\)/);
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

// ── Checks ────────────────────────────────────────────────────────────────────
// Each returns null when it passes, or a failure string.

export const CHECKS = [
  // ---- server-authoritative monthly aggregate (SQL) ----
  { name: "aggregate is a dedicated monthly RPC", file: MIG,
    run: (s) => /create or replace function public\.get_admin_orders_monthly_kpis\(\s*\)/.test(s) ? null : "RPC not defined with an empty signature" },
  { name: "month boundaries are America/New_York", file: MIG,
    run: (s) => /America\/New_York/.test(s) && /date_trunc\('month'/.test(s) ? null : "Eastern month boundary missing" },
  { name: "timezone is a constant, never a caller parameter", file: MIG,
    run: (s) => /get_admin_orders_monthly_kpis\(\s*p_/.test(s) ? "RPC accepts a parameter — a caller could shift the reporting month" : null },
  { name: "upper bound is EXCLUSIVE (next month)", file: MIG,
    run: (s) => /\+\s*interval '1 month'/.test(s) && /<\s*v_pe/.test(s) ? null : "exclusive next-month upper bound missing" },
  { name: "Lead counts on created_at", file: MIG,
    run: (s) => /into v_lead[\s\S]{0,400}?o\.created_at >= v_ps/.test(s) ? null : "Lead card is not keyed on created_at" },
  { name: "Paid/Unassigned counts on paid_at", file: MIG,
    run: (s) => /into v_paid[\s\S]{0,500}?o\.paid_at >= v_ps/.test(s) ? null : "Paid card is not keyed on paid_at" },
  { name: "Paid/Unassigned NEVER uses last_payment_at", file: MIG,
    run: (s) => /into v_paid[\s\S]{0,500}?last_payment_at/.test(s) ? "Paid card uses last_payment_at — a renewal would drag an old order into this month" : null },
  { name: "Completed counts on last_completed_at", file: MIG,
    run: (s) => /into v_done[\s\S]{0,400}?o\.last_completed_at >= v_ps/.test(s) ? null : "Completed card is not keyed on last_completed_at" },
  { name: "Completed NEVER uses created_at or paid_at", file: MIG,
    run: (s) => /into v_done[\s\S]{0,400}?o\.(created_at|paid_at) >= v_ps/.test(s) ? "Completed card is keyed on the wrong timestamp" : null },
  { name: "Under Review uses a PROVEN review transition", file: MIG,
    run: (s) => /into v_ur[\s\S]{0,900}?order_status_logs[\s\S]{0,300}?(pending_review|in_review)/.test(s) ? null : "Under Review is not backed by an order_status_logs transition" },
  { name: "Under Review does not fall back to last_meaningful_activity_at", file: MIG,
    run: (s) => /into v_ur[\s\S]{0,900}?last_meaningful_activity_at/.test(s) ? "Under Review uses last_meaningful_activity_at, which carries payment/refund events rather than review work" : null },
  { name: "RPC is admin-gated and fails closed", file: MIG,
    run: (s) => /if not public\.check_is_admin\(\)[\s\S]{0,120}?raise exception/.test(s) ? null : "admin gate / fail-closed raise missing" },
  { name: "RPC is SECURITY DEFINER with pinned search_path", file: MIG,
    run: (s) => /security definer/i.test(s) && /set search_path to 'public'/i.test(s) ? null : "SECURITY DEFINER + pinned search_path required" },
  { name: "RPC EXECUTE revoked from public and anon", file: MIG,
    run: (s) => /revoke all on function public\.get_admin_orders_monthly_kpis\(\) from public, anon/.test(s) ? null : "anon not revoked BY NAME (Supabase default-grants it)" },
  { name: "RPC returns aggregates only (no PII columns)", file: MIG,
    run: (s) => /\b(email|first_name|last_name|phone|confirmation_id)\b/.test(s.replace(/--[^\n]*/g, "")) ? "a PII column appears in the aggregate RPC" : null },

  // ---- the client helper ----
  { name: "helper calls the monthly RPC", file: LIB,
    run: (s) => /supabase\.rpc\("get_admin_orders_monthly_kpis"\)/.test(s) ? null : "helper does not call the monthly RPC" },
  { name: "helper takes NO filter arguments", file: LIB,
    run: (s) => /export async function fetchAdminOrdersMonthlyKpis\(\s*\)/.test(s) ? null : "helper accepts arguments — the banner must not be narrowable" },
  // Matches a real import only — the header comment deliberately NAMES
  // orderFacetCounts to explain why the two universes stay separate.
  { name: "helper never imports the list facet counts", file: LIB,
    run: (s) => /from\s+["'][^"']*orderFacetCounts["']/.test(s) ? "monthly helper imports orderFacetCounts — the two universes must stay distinct" : null },
  { name: "period label is formatted in the RPC timezone", file: LIB,
    run: (s) => /timeZone:\s*k\.timezone/.test(s) ? null : "period label not formatted in the aggregate's own timezone" },

  // ---- the banner ----
  { name: "the RPC exposes the current-workload fields", file: MIG,
    run: (s) => ["leadUnpaidCurrent", "paidUnassignedCurrent", "underReviewCurrent", "pendingDeliveryCurrent"]
      .every((k) => new RegExp(`'${k}'`).test(s)) ? null : "a current-workload field is missing from the RPC payload" },
  { name: "current-workload counts carry NO month window", file: MIG,
    run: (s) => {
      // Each current block must reach its closing semicolon without a period bound.
      for (const v of ["v_lead_now", "v_paid_now", "v_ur_now", "v_pd_now"]) {
        const m = s.match(new RegExp(`into ${v}\\b[\\s\\S]*?;`));
        if (!m) return `${v} block not found`;
        if (/v_ps|v_pe/.test(m[0])) return `${v} is month-gated — a queue must be sized by what is in it`;
      }
      return null;
    } },
  { name: "current-workload counts never join order_status_logs", file: MIG,
    run: (s) => {
      for (const v of ["v_ur_now", "v_pd_now"]) {
        const m = s.match(new RegExp(`into ${v}\\b[\\s\\S]*?;`));
        if (m && /order_status_logs/.test(m[0])) return `${v} joins order_status_logs — an order with no transition row becomes uncountable`;
      }
      return null;
    } },
  { name: "monthly transition metrics are PRESERVED", file: MIG,
    run: (s) => ["'leadUnpaid'", "'paidUnassigned'", "'underReview'", "'pendingDelivery'"]
      .every((k) => s.includes(k)) ? null : "a monthly field was removed — consumers must not silently change meaning" },
  { name: "the client fails closed on an RPC without current fields", file: LIB,
    run: (s) => /typeof d\.\w*Current !== "number"\) return null/.test(s) ? null
      : "helper must gate on a CURRENT field, or an older RPC renders month-gated numbers under 'now' labels" },

  // ---- §D: per-card timeframes, no shared heading ----
  { name: "list facet counts remain filter-aware", file: FACETS,
    run: (s) => /dateBasis\?: OrderDateBasis/.test(s) && /applyNonStatusFilters/.test(s) ? null : "list facet counts lost their filter awareness" },
  { name: "list still uses the facet total for X of Y", file: PAGE,
    run: (s) => /filteredTotalFor\(/.test(s) && /filteredTotalDisplay/.test(s) ? null : "list total no longer uses the facet universe" },
  { name: "range helper fails closed", file: RANGE_LIB,
    run: (s) => /typeof d\.leadsCreated !== "number"/.test(s) && /get_admin_orders_range_event_kpis/.test(s) ? null
      : "range helper must call the range RPC and return null on an unexpected shape" },
  { name: "range RPC keys every count on its authoritative event column", file: MIG2,
    run: (s) => {
      const pairs = [["v_leads", "created_at"], ["v_paid", "paid_at"], ["v_ur", "last_under_review_entered_at"],
        ["v_pd", "last_pending_delivery_entered_at"], ["v_done", "last_completed_at"]];
      for (const [v, col] of pairs) {
        const m = s.match(new RegExp(`into ${v} from public\\.orders o[\\s\\S]{0,400}?;`));
        if (!m) return `${v} block not found in the range RPC`;
        if (!m[0].includes(col)) return `${v} is not keyed on ${col}`;
      }
      return null;
    } },
  { name: "range counts exclude archived rows (they are hidden from the list)", file: MIG2,
    run: (s) => {
      for (const v of ["v_leads", "v_paid", "v_ur", "v_pd", "v_done"]) {
        const m = s.match(new RegExp(`into ${v} from public\\.orders o[\\s\\S]{0,420}?;`));
        if (!m) return `${v} block not found`;
        if (!m[0].includes("o.status <> 'archived'")) return `${v} does not exclude archived rows — the card could not reconcile with its list view`;
      }
      return null;
    } },
  { name: "range RPC interprets the range in America/New_York, DST-safe", file: MIG2,
    run: (s) => /get_admin_orders_range_event_kpis/.test(s) && /make_timestamptz\(/.test(s) && /America\/New_York/.test(s)
      ? null : "range RPC must derive both bounds with make_timestamptz(..., America/New_York)" },
  { name: "range RPC is admin-gated with anon revoked by name", file: MIG2,
    run: (s) => /if not public\.check_is_admin\(\)[\s\S]{0,120}?raise exception/.test(s)
      && /revoke all on function public\.get_admin_orders_range_event_kpis\(text, text\) from public, anon/.test(s)
      ? null : "range RPC must be admin-gated and revoke anon EXECUTE by name" },
  { name: "monthly RPC stays zero-arg — the range RPC is a SEPARATE function", file: MIG2,
    run: (s) => /get_admin_orders_monthly_kpis\(\s*p_/.test(s)
      ? "the zero-arg monthly RPC grew a parameter — the range belongs to get_admin_orders_range_event_kpis" : null },
  { name: "list range bounds are business days, never the browser clock", file: LIFECYCLE,
    run: (s) => /businessDayStartUtcIso/.test(s) && /businessDayEndExclusiveUtcIso/.test(s) && !/T23:59:59/.test(s)
      ? null : "matchesBasisDateRange must use the America/New_York day helpers (no T23:59:59 browser-local end)" },
  { name: "facet range bounds are business days, never the browser clock", file: FACETS,
    run: (s) => /businessDayStartUtcIso/.test(s) && /businessDayEndExclusiveUtcIso/.test(s) && !/T23:59:59/.test(s)
      ? null : "facet SQL arms must use the America/New_York day helpers (no T23:59:59 browser-local end)" },
  { name: "the new event bases exist and map to the new columns", file: LIFECYCLE,
    run: (s) => /under_review_entered: "last_under_review_entered_at"/.test(s)
      && /pending_delivery_entered: "last_pending_delivery_entered_at"/.test(s)
      ? null : "under_review_entered / pending_delivery_entered bases must map to the trigger-maintained columns" },

  // ── PAGE contract (ADMIN-ORDERS-NEW-YORK-CLOCK-...-001 §9) ─────────────────
  // The PAGE invariants that used to live here described the DUAL-MODE banner:
  // which card read which queue-DEPTH field, the per-card "now"/"this month"
  // timeframe labels, the range-mode relabelling, and what each card did ON
  // CLICK. All of that was removed — the five cards are now display-only,
  // single-semantics PERIOD-EVENT counts over one America/New_York window.
  //
  // That contract, and its 16 planted negative controls, is owned by
  // scripts/check-admin-orders-ny-clock-kpi-status.mjs (N15-N34). Only the page
  // invariants that are still TRUE are kept here, so the two guards can never
  // assert opposite things about the same file.
  // The card value is bound as `const value = …` inside the map now, not as a
  // `value:` object property, so both of these must match either form — a regex
  // pinned to the old shape let a planted "derive it from loaded rows" mutation
  // slip straight through.
  { name: "banner is served by ONE aggregate, never the list facet buckets", file: PAGE,
    run: (s) => /(?:value:|const value =)\s*facetCounts/.test(s)
      ? "a KPI card is reading a list facet bucket — the card count must come from the server KPI aggregate" : null },
  { name: "banner never derives a card value from the loaded rows", file: PAGE,
    run: (s) => /(?:value:|const value =)\s*orders\s*\.\s*(filter|length)/.test(s)
      ? "a KPI card value is computed from the browser's loaded rows" : null },
  // ADMIN-ORDERS-CLICKABLE-KPI-CARD-COUNT-TO-LIST-PARITY-001 re-scopes this.
  //
  // The old banner was required to be filter-BLIND ("stay perfectly still while
  // the operator searches"). Under count-to-list parity that is now WRONG: if a
  // search is active and the cards ignored it, clicking a card would show fewer
  // rows than the number on it. The cards must facet the same universe the list
  // does, so non-status filters are legitimate dependencies.
  //
  // What must STILL be excluded is anything that would make the numbers move
  // under the operator's cursor when they select a card, or make them depend on
  // how far the list has been paged.
  { name: "the KPI effect ignores card/status/pagination state", file: PAGE,
    run: (raw) => {
      // ADMIN-ORDERS-KPI-TO-LIST-CONSISTENCY-001 — assert the CALL ARGUMENTS as
      // well as the dependency array, and strip COMMENTS first.
      //
      // The guarantee that matters is that the INPUTS to fetchKpiCardCounts
      // carry no trace of the selection: identical inputs return identical
      // numbers, so the values cannot move under the operator's cursor. The
      // dependency array is only a refetch TRIGGER, and it now includes
      // listQueryKey on purpose so the cards and the rows are read at the same
      // moment — without that, clicking a card refreshed the list and left the
      // numbers describing an older world.
      //
      // Stripping comments matters: the first literal "fetchKpiCardCounts(" in
      // raw source is a MENTION inside a comment. The old fixed-width regex
      // over the deps also broke the moment a comment was added above it.
      const s = raw
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
        .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
      const i = s.indexOf("fetchKpiCardCounts(");
      if (i < 0) return "could not locate the fetchKpiCardCounts call";
      const end = "to: kpiTo }";
      const j = s.indexOf(end, i);
      if (j < 0) return "could not locate the fetchKpiCardCounts arguments";
      const args = s.slice(i, j + end.length);
      const FORBIDDEN = ["statusFilter", "activeKpi", "visibleCount", "sortOrder",
        "effDateBasis", "effDateFrom", "effDateTo"];
      const badArgs = FORBIDDEN.filter((d) => new RegExp(`\b${d}\b`).test(args));
      if (badArgs.length) {
        return `KPI counts depend on selection/pagination state: ${badArgs.join(", ")}`;
      }
      const dm = s.match(/\}, \[listQueryKey,([^\]]*)\]\);/);
      if (!dm) return "could not locate the KPI card-count effect dependency array";
      const badDeps = dm[1].split(",").map((d) => d.trim()).filter((d) => FORBIDDEN.includes(d));
      return badDeps.length
        ? `KPI counts refetch on selection/pagination state: ${badDeps.join(", ")}`
        : null;
    } },
  { name: "KPI card state is distinct from facet state", file: PAGE,
    run: (s) => /const \[kpiCounts,/.test(s) && /const \[facetCounts,/.test(s)
      ? null : "KPI card and facet state must not be merged into one object" },
];

// ── Negative controls — each planted defect MUST be rejected ─────────────────

// NOTE: the banner effect's dep array gained monthlyKpiGuard in
// ADMIN-ORDER-PENDING-DELIVERY-...-001 §9. These plants target the CURRENT array
// on purpose -- a plant that no longer matches its anchor stops planting anything
// and the self-test reports it stale rather than passing quietly.
const NEGATIVE_CONTROLS = [
  { name: "all-time orders instead of the month window",
    file: MIG, mutate: (s) => s.replace(/and o\.created_at >= v_ps\s*\n\s*and o\.created_at <\s*v_pe/, "and true") },
  { name: "Completed counted using created_at",
    file: MIG, mutate: (s) => s.replace(/into v_done([\s\S]{0,400}?)o\.last_completed_at >= v_ps/, "into v_done$1o.created_at >= v_ps") },
  { name: "Paid counted using last_payment_at",
    file: MIG, mutate: (s) => s.replace(/into v_paid([\s\S]{0,500}?)o\.paid_at >= v_ps/, "into v_paid$1o.last_payment_at >= v_ps") },
  { name: "a current-workload count given a month window",
    file: MIG, mutate: (s) => s.replace(
      /(select count\(\*\) into v_ur_now[\s\S]*?)and o\.status <> 'archived';/,
      "$1and o.status <> 'archived' and o.created_at >= v_ps and o.created_at < v_pe;") },
  { name: "current Under Review re-joined to order_status_logs",
    file: MIG, mutate: (s) => s.replace(
      /(select count\(\*\) into v_ur_now\s*\n\s*from public\.orders o)/,
      "$1 join public.order_status_logs l on l.order_id = o.id") },
  { name: "a monthly transition metric dropped from the payload",
    file: MIG, mutate: (s) => s.replace(/'underReview',\s*v_ur,/, "") },
  { name: "helper accepts an RPC with no current fields",
    file: LIB, mutate: (s) => s.replace(/typeof d\.leadUnpaidCurrent !== "number"/, 'typeof d.leadUnpaid !== "number"') },

  // ---- MONTH-END-...-001 §D plants: range semantics must stay un-shippable ----
  { name: "range RPC keyed Entered Under Review on created_at",
    file: MIG2, mutate: (s) => s.replace(/last_under_review_entered_at/g, "created_at") },
  { name: "range RPC bounds computed at UTC midnight",
    file: MIG2, mutate: (s) => s.replace(/make_timestamptz\(/g, "to_timestamp(") },
  { name: "browser-local end-of-day restored in the client predicate",
    file: LIFECYCLE, mutate: (s) => s.replace(/businessDayEndExclusiveUtcIso\(dateTo\)/, "`${dateTo}T23:59:59`") },
  { name: "browser-local end-of-day restored in the facet SQL",
    file: FACETS, mutate: (s) => s.replace(/businessDayEndExclusiveUtcIso\(f\.dateTo\)/g, "new Date(`${f.dateTo}T23:59:59`).toISOString()") },
  // PAGE-targeting controls for the removed DUAL-MODE banner were retired with
  // the checks they exercised (see the PAGE contract note above). These three
  // exercise the PAGE invariants this guard still owns.
  { name: "a KPI card value derived from the loaded browser rows",
    file: PAGE, mutate: (s) => s.replace("const value = kpiCounts?.counts[s.key] ?? null;", "const value = orders.filter(o => !o.paid_at).length;") },
  { name: "a KPI card wired to a list facet bucket",
    file: PAGE, mutate: (s) => s.replace("const value = kpiCounts?.counts[s.key] ?? null;", "const value = facetCounts.buckets.completed;") },
  { name: "the KPI effect wired to statusFilter",
    file: PAGE, mutate: (s) => s.replace("showDuplicatesOnly, monthlyKpiReloadToken, aggregateReloadToken, kpiCountGuard]);", "showDuplicatesOnly, statusFilter, monthlyKpiReloadToken, aggregateReloadToken, kpiCountGuard]);") },
];

// ── Runner ────────────────────────────────────────────────────────────────────

function runChecks(sources) {
  const failures = [];
  for (const c of CHECKS) {
    let res;
    try { res = c.run(sources[c.file]); }
    catch (e) { res = `check threw: ${e.message}`; }
    if (res) failures.push(`${c.name} — ${res}`);
  }
  return failures;
}

const loadSources = () => ({
  [PAGE]: read(PAGE), [LIB]: read(LIB), [FACETS]: read(FACETS), [MIG]: read(MIG),
  [RANGE_LIB]: read(RANGE_LIB), [LIFECYCLE]: read(LIFECYCLE), [MIG2]: read(MIG2),
});

const selfTest = process.argv.includes("--self-test");
const sources = loadSources();

console.log(`${YELLOW}admin-orders monthly-KPI banner — guard${RESET}`);

const failures = runChecks(sources);
if (failures.length > 0) {
  console.log(`${RED}✗ monthly-KPI guard FAILED${RESET}`);
  for (const f of failures) console.log(`  ${RED}•${RESET} ${f}`);
  process.exit(1);
}
console.log(`${GREEN}✓ Admin Orders KPI banner guard passed${RESET} (${CHECKS.length} invariants — get_admin_orders_monthly_kpis SQL contract, Eastern month bounds, per-metric authoritative timestamps, grant posture, and banner/list universe separation)`);

if (selfTest) {
  let bad = 0;
  console.log(`${YELLOW}self-test — every planted defect must be rejected${RESET}`);
  for (const nc of NEGATIVE_CONTROLS) {
    const mutated = { ...sources, [nc.file]: nc.mutate(sources[nc.file]) };
    if (mutated[nc.file] === sources[nc.file]) {
      console.log(`  ${RED}✗${RESET} NEG-CONTROL "${nc.name}" did not change the source — the control is stale`);
      bad++; continue;
    }
    const caught = runChecks(mutated).length > 0;
    console.log(`  ${caught ? GREEN + "✓" : RED + "✗"}${RESET} NEG-CONTROL rejected: ${nc.name}`);
    if (!caught) bad++;
  }
  if (bad > 0) { console.log(`${RED}✗ self-test FAILED (${bad} planted defect(s) slipped through)${RESET}`); process.exit(1); }
  console.log(`${GREEN}✓ self-test passed${RESET} (${NEGATIVE_CONTROLS.length}/${NEGATIVE_CONTROLS.length} planted defects rejected)`);
}

console.log(`${DIM}  SQL contract guarded here · the PAGE banner contract (clickable operational cards, count-to-list parity, one America/New_York window) is owned by check-admin-orders-ny-clock-kpi-status.mjs${RESET}`);
