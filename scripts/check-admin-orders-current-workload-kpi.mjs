#!/usr/bin/env node
// ADMIN-ORDERS-UNDER-REVIEW-KPI-CURRENT-WORKLOAD-FIX-001 — current-workload guard.
//
// THE DEFECT THIS MAKES UN-SHIPPABLE
// ----------------------------------
// Under Review and Pending Delivery are QUEUES. Both were counted as "entered
// this state during the current Eastern month", keyed on an order_status_logs
// transition — so an order that entered earlier and is STILL OPEN vanished from
// the card while the status tab kept listing it. On LIVE that meant the 2026-08-01
// rollover would have emptied a 6-deep Under Review card overnight.
//
// A second, independent bug produced the symptom actually reported (card 3 vs tab
// 6, Pending Delivery 0 with one order waiting): the aggregates were invalidated
// only by mutations made in the SAME browser tab, so a provider submitting from
// the provider portal moved the rows and left the banner frozen.
//
// This guard proves, statically:
//   • both queue cards read the CURRENT-workload fields, not the monthly ones
//   • the current counts have NO month window and NO status-log join
//   • they use the canonical order_workflow_state() classifier, not a
//     re-derived client-side status predicate
//   • Pending Delivery and Completed are excluded from Under Review
//   • correction-requested and manually reopened orders are INCLUDED
//   • card and tab use equivalent semantics (refund/archived exclusions)
//   • the monthly metrics still exist, so no consumer silently changed meaning
//   • EXTERNAL change (realtime + the 30s safety net) invalidates BOTH aggregates
//   • a stale response cannot overwrite a newer count
//
// Run:  node scripts/check-admin-orders-current-workload-kpi.mjs [--self-test]

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", DIM = "\x1b[2m", RESET = "\x1b[0m";

const PAGE   = "src/pages/admin-orders/page.tsx";
const LIB    = "src/lib/adminOrdersMonthlyKpis.ts";
const FACETS = "src/pages/admin-orders/orderFacetCounts.ts";
const MIG    = "supabase/migrations/20260731130000_admin_orders_current_workload_kpi.sql";

// CRLF/LF normalised on read. A guard that matches raw bytes silently degrades
// on a Windows checkout with core.autocrlf=true — planted mutations become
// no-ops and the self-test passes while proving nothing.
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

// ── Extractors ────────────────────────────────────────────────────────────────

/**
 * The SQL of a single `select count(*) into <var> ... ;` block.
 *
 * Returns null when the block is absent, and every check below treats null as a
 * FAILURE. Anchor-ordering tricks (indexOf(a) < indexOf(b)) are deliberately
 * avoided: they pass when BOTH anchors are missing, which is fail-open.
 */
export function sqlBlock(sql, varName) {
  const start = sql.indexOf(`into ${varName}\n`);
  if (start < 0) return null;
  const end = sql.indexOf(";", start);
  if (end < 0) return null;
  return sql.slice(start, end + 1);
}

/** The value expression of each KPI banner card, keyed by label. */
export function bannerCardValueByLabel(page) {
  const grid = page.indexOf("lg:grid-cols-5");
  if (grid < 0) return null;
  const end = page.indexOf("].map((s)", grid);
  if (end < 0) return null;
  const block = page.slice(grid, end);
  const out = {};
  for (const m of block.matchAll(/label:\s*"([^"]+)",\s*\n\s*value:\s*([^,\n]+)/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

// ── Checks ────────────────────────────────────────────────────────────────────
// Each returns null when it passes, or a failure string.

export const CHECKS = [
  // ---- the cards read CURRENT workload ----
  { name: "Under Review card reads the CURRENT workload field", file: PAGE,
    run: (s) => {
      const v = bannerCardValueByLabel(s);
      if (!v) return "could not parse the banner cards";
      if (!v["Under Review"]) return "Under Review card not found";
      return /monthlyKpis\?\.underReviewCurrent/.test(v["Under Review"])
        ? null : `Under Review card reads ${v["Under Review"]} — must be underReviewCurrent`;
    } },
  { name: "Under Review card does NOT read the monthly transition metric", file: PAGE,
    run: (s) => {
      const v = bannerCardValueByLabel(s);
      if (!v || !v["Under Review"]) return "Under Review card not found";
      return /monthlyKpis\?\.underReview\b/.test(v["Under Review"])
        ? "Under Review card reverted to the month-gated metric" : null;
    } },
  { name: "Pending Delivery card reads the CURRENT workload field", file: PAGE,
    run: (s) => {
      const v = bannerCardValueByLabel(s);
      if (!v || !v["Pending Delivery"]) return "Pending Delivery card not found";
      return /monthlyKpis\?\.pendingDeliveryCurrent/.test(v["Pending Delivery"])
        ? null : `Pending Delivery card reads ${v["Pending Delivery"]} — must be pendingDeliveryCurrent`;
    } },
  { name: "Lead / Paid / Completed stay MONTHLY", file: PAGE,
    run: (s) => {
      const v = bannerCardValueByLabel(s) ?? {};
      const want = { "Lead (Unpaid)": "leadUnpaid", "Paid (Unassigned)": "paidUnassigned", "Completed": "completed" };
      const bad = Object.entries(want)
        .filter(([label, field]) => !new RegExp(`monthlyKpis\\?\\.${field}\\b`).test(v[label] ?? ""))
        .map(([label]) => label);
      return bad.length === 0 ? null : `monthly card(s) changed source: ${bad.join(", ")}`;
    } },

  // ---- the RPC exposes the current-workload fields ----
  { name: "RPC returns underReviewCurrent and pendingDeliveryCurrent", file: MIG,
    run: (s) => /'underReviewCurrent',\s*v_ur_now/.test(s) && /'pendingDeliveryCurrent',\s*v_pd_now/.test(s)
      ? null : "current-workload keys missing from the RPC payload" },
  { name: "monthly metrics are PRESERVED (no silent redefinition)", file: MIG,
    run: (s) => /'underReview',\s*v_ur\b/.test(s) && /'pendingDelivery',\s*v_pd\b/.test(s)
      ? null : "a monthly field was dropped or repointed — every consumer of it would change meaning silently" },

  // ---- the current counts are genuinely CURRENT ----
  { name: "current Under Review has NO month window", file: MIG,
    run: (s) => { const b = sqlBlock(s, "v_ur_now");
      if (!b) return "v_ur_now block not found";
      return /v_ps|v_pe/.test(b) ? "current Under Review is gated on the month window" : null; } },
  { name: "current Under Review has NO status-log requirement", file: MIG,
    run: (s) => { const b = sqlBlock(s, "v_ur_now");
      if (!b) return "v_ur_now block not found";
      return /order_status_logs/.test(b) ? "current Under Review requires a transition log — fail-closed on a missing row" : null; } },
  { name: "current Pending Delivery has NO month window", file: MIG,
    run: (s) => { const b = sqlBlock(s, "v_pd_now");
      if (!b) return "v_pd_now block not found";
      return /v_ps|v_pe/.test(b) ? "current Pending Delivery is gated on the month window" : null; } },
  { name: "current Pending Delivery has NO status-log requirement", file: MIG,
    run: (s) => { const b = sqlBlock(s, "v_pd_now");
      if (!b) return "v_pd_now block not found";
      return /order_status_logs/.test(b) ? "current Pending Delivery requires a transition log" : null; } },

  // ---- canonical classifier, not a parallel status predicate ----
  { name: "current Under Review uses the canonical workflow classifier", file: MIG,
    run: (s) => { const b = sqlBlock(s, "v_ur_now");
      if (!b) return "v_ur_now block not found";
      return /public\.order_workflow_state\(o\)\s*=\s*'under_review'/.test(b)
        ? null : "current Under Review does not classify via order_workflow_state()"; } },
  { name: "current Pending Delivery uses the canonical workflow classifier", file: MIG,
    run: (s) => { const b = sqlBlock(s, "v_pd_now");
      if (!b) return "v_pd_now block not found";
      return /public\.order_workflow_state\(o\)\s*=\s*'pending_delivery'/.test(b)
        ? null : "current Pending Delivery does not classify via order_workflow_state()"; } },

  // ---- workflow exclusivity ----
  { name: "Pending Delivery is EXCLUDED from current Under Review", file: MIG,
    run: (s) => { const b = sqlBlock(s, "v_ur_now");
      if (!b) return "v_ur_now block not found";
      return /'pending_delivery'/.test(b)
        ? "current Under Review admits pending_delivery — the two cards would double-count one order" : null; } },
  { name: "Completed is EXCLUDED from current Under Review", file: MIG,
    run: (s) => { const b = sqlBlock(s, "v_ur_now");
      if (!b) return "v_ur_now block not found";
      return /'completed'|patient_notified/.test(b) ? "current Under Review admits a completed order" : null; } },
  { name: "the classifier still orders pending_delivery ahead of under_review", file: FACETS,
    run: (s) => /doctor_status\.neq\.pending_admin_approval/.test(s)
      ? null : "the Under Review TAB stopped excluding Pending Delivery — card and tab would diverge" },

  // ---- actionable states that MUST be counted ----
  { name: "manually reopened orders are INCLUDED in current Under Review", file: MIG,
    run: (s) => { const b = sqlBlock(s, "v_ur_now");
      if (!b) return "v_ur_now block not found";
      return /'reopened'/.test(b)
        ? null : "a reopened order shows in the Under Review tab but would not be counted"; } },
  { name: "the reopened arm still requires an assigned provider", file: MIG,
    run: (s) => { const b = sqlBlock(s, "v_ur_now");
      if (!b) return "v_ur_now block not found";
      return /'reopened'[\s\S]{0,200}?doctor_user_id is not null or o\.doctor_email is not null/.test(b)
        ? null : "a reopened order with no provider belongs to Paid (Unassigned) in the tab"; } },
  { name: "correction-requested / in-review orders are not filtered out by payment state", file: MIG,
    run: (s) => { const b = sqlBlock(s, "v_ur_now");
      if (!b) return "v_ur_now block not found";
      // The old whitelist in ('paid','partially_refunded') silently dropped a
      // disputed order that the tab still lists. Must be an EXCLUSION list.
      return /not in \('fully_refunded', 'unpaid', 'failed'\)/.test(b)
        ? null : "payment-state filter is not the tab-equivalent exclusion list"; } },

  // ---- card and tab share semantics ----
  { name: "current counts exclude archived, exactly as the tab does", file: MIG,
    run: (s) => {
      const ur = sqlBlock(s, "v_ur_now"), pd = sqlBlock(s, "v_pd_now");
      if (!ur || !pd) return "current-workload block(s) not found";
      return /status <> 'archived'/.test(ur) && /status <> 'archived'/.test(pd)
        ? null : "archived rows would be counted by a card but hidden from the tab"; } },
  { name: "the helper does not invent 0 for a missing current field", file: LIB,
    run: (s) => /underReviewCurrent:\s*typeof d\.underReviewCurrent === "number"/.test(s)
      ? null : "a missing current-workload field defaults to a number — an invented 0 looks exactly like the bug being fixed" },

  // ---- EXTERNAL change invalidation (the reported symptom) ----
  { name: "realtime order changes invalidate the aggregates", file: PAGE,
    run: (s) => {
      const ch = s.indexOf('.channel("admin-orders-live")');
      if (ch < 0) return "admin-orders-live realtime channel not found";
      const block = s.slice(ch, s.indexOf(".subscribe()", ch));
      const hits = [...block.matchAll(/scheduleAggregateInvalidation\(\)/g)].length;
      return hits >= 2 ? null : `only ${hits} of the 2 realtime handlers invalidate the aggregates — the banner goes stale on external work`;
    } },
  { name: "the 30s background refresh also invalidates the aggregates", file: PAGE,
    run: (s) => /loadOrderData\(\);[\s\S]{0,600}?invalidateOrderAggregates\(\);[\s\S]{0,200}?\},\s*30000\)/.test(s)
      ? null : "the safety-net refresh reloads rows but not the counts" },
  { name: "external invalidation is COALESCED (no per-row refresh storm)", file: PAGE,
    run: (s) => /const scheduleAggregateInvalidation = useCallback\(\(\) => \{\s*\n\s*if \(externalInvalidateTimerRef\.current !== null\) return;/.test(s)
      ? null : "external invalidation is not coalesced — a realtime burst would fire one refresh per row" },
  { name: "one invalidation refreshes BOTH the banner and the facet counts", file: PAGE,
    run: (s) => /invalidateOrderAggregates = useCallback\(\(\) => \{\s*\n\s*setMonthlyKpiReloadToken[\s\S]{0,160}?setAggregateReloadToken/.test(s)
      ? null : "the two aggregates can be refreshed independently — they would drift apart" },
  { name: "a background refetch does not flash the banner skeleton", file: PAGE,
    run: (s) => /if \(!monthlyKpiLoadedRef\.current\) setMonthlyKpisLoading\(true\)/.test(s)
      ? null : "every 30s refetch drops the cards to the loading skeleton (visible flicker)" },

  // ---- stale-response protection ----
  { name: "the banner commits through a monotonic request guard", file: PAGE,
    run: (s) => /runLatest\(\s*\n?\s*monthlyKpiGuard/.test(s)
      ? null : "banner does not use runLatest — a slow earlier response could restore an older count" },
  { name: "the facet counts commit through a monotonic request guard", file: PAGE,
    run: (s) => /runLatest\(facetGuard/.test(s)
      ? null : "facet counts do not use runLatest — the list total could revert to an older value" },
];

// ── Negative controls — each planted defect MUST be rejected ─────────────────

const NEGATIVE_CONTROLS = [
  { name: "the monthly transition requirement is reintroduced",
    file: MIG, mutate: (s) => s.replace(
      /(into v_ur_now\n)/,
      "$1    -- planted\n     join public.order_status_logs l on l.order_id = o.id and l.changed_at >= v_ps\n") },
  { name: "current Under Review re-gated on the month window",
    file: MIG, mutate: (s) => s.replace(
      /(into v_ur_now[\s\S]*?)and o\.status <> 'archived';/,
      "$1and o.status <> 'archived' and o.paid_at >= v_ps and o.paid_at < v_pe;") },
  { name: "Pending Delivery counted inside Under Review",
    file: MIG, mutate: (s) => s.replace(
      /(into v_ur_now[\s\S]*?)public\.order_workflow_state\(o\) = 'under_review'/,
      "$1public.order_workflow_state(o) in ('under_review', 'pending_delivery')") },
  { name: "prior-month current orders omitted by dropping the reopened arm",
    file: MIG, mutate: (s) => s.replace(
      /or \(public\.order_workflow_state\(o\) = 'reopened'[\s\S]*?doctor_email is not null\)\)/,
      "") },
  { name: "the disputed-inclusive payment filter reverted to the old whitelist",
    file: MIG, mutate: (s) => s.replace(
      /(into v_ur_now[\s\S]*?)not in \('fully_refunded', 'unpaid', 'failed'\)/,
      "$1in ('paid', 'partially_refunded')") },
  { name: "the card points back at the month-gated metric",
    file: PAGE, mutate: (s) => s.replace("monthlyKpis?.underReviewCurrent ?? null", "monthlyKpis?.underReview ?? null") },
  { name: "Pending Delivery card points back at the month-gated metric",
    file: PAGE, mutate: (s) => s.replace("monthlyKpis?.pendingDeliveryCurrent ?? null", "monthlyKpis?.pendingDelivery ?? null") },
  { name: "realtime no longer invalidates the aggregates (the stale-banner bug)",
    file: PAGE, mutate: (s) => s.replace(/scheduleAggregateInvalidation\(\);/g, "/* removed */;") },
  { name: "the 30s safety net stops refreshing the counts",
    file: PAGE, mutate: (s) => s.replace(
      /loadOrderData\(\);(\s*\/\/[^\n]*\n)*\s*invalidateOrderAggregates\(\);/,
      "loadOrderData();") },
  { name: "stale responses may overwrite a newer count",
    file: PAGE, mutate: (s) => s.replace(/runLatest\(\s*\n\s*monthlyKpiGuard/, "await Promise.resolve(\n      null") },
  { name: "a missing current field silently becomes 0",
    file: LIB, mutate: (s) => s.replace(
      /underReviewCurrent:\s*typeof d\.underReviewCurrent === "number" \? d\.underReviewCurrent : null/,
      "underReviewCurrent: d.underReviewCurrent ?? 0") },
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

const loadSources = () => ({ [PAGE]: read(PAGE), [LIB]: read(LIB), [FACETS]: read(FACETS), [MIG]: read(MIG) });

const selfTest = process.argv.includes("--self-test");
const sources = loadSources();

console.log(`${YELLOW}admin-orders current-workload KPI — guard${RESET}`);

const failures = runChecks(sources);
if (failures.length > 0) {
  console.log(`${RED}✗ current-workload KPI guard FAILED${RESET}`);
  for (const f of failures) console.log(`  ${RED}•${RESET} ${f}`);
  process.exit(1);
}
console.log(`${GREEN}✓ current-workload KPI guard passed${RESET} (${CHECKS.length} invariants — queue depth not month window, canonical classifier, card=tab, external invalidation, stale-response safety)`);

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

console.log(`${DIM}  contract: Under Review / Pending Delivery = CURRENT queue depth, equal to their status tabs; Lead / Paid / Completed stay monthly${RESET}`);
