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
//   • there are EXACTLY four cards and none of them is Payment Failed
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
const MIG    = "supabase/migrations/20260727100000_admin_orders_monthly_kpis.sql";

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
  const grid = page.indexOf("lg:grid-cols-4");
  if (grid < 0) return null;
  const end = page.indexOf("].map((s)", grid);
  if (end < 0) return null;
  const block = page.slice(grid, end);
  return [...block.matchAll(/label:\s*"([^"]+)"/g)].map((x) => x[1]);
}

/** The value expression of each KPI banner card, in order. */
export function bannerCardValues(page) {
  const grid = page.indexOf("lg:grid-cols-4");
  if (grid < 0) return null;
  const end = page.indexOf("].map((s)", grid);
  if (end < 0) return null;
  return [...page.slice(grid, end).matchAll(/value:\s*([^,\n]+)/g)].map((x) => x[1].trim());
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
  { name: "banner reads the monthly aggregate", file: PAGE,
    run: (s) => /fetchAdminOrdersMonthlyKpis/.test(s) ? null : "page does not load the monthly aggregate" },
  { name: "EXACTLY four KPI cards", file: PAGE,
    run: (s) => { const l = bannerCardLabels(s); return l && l.length === 4 ? null : `expected 4 banner cards, found ${l ? l.length : "none"}`; } },
  { name: "the four cards are the approved four", file: PAGE,
    run: (s) => { const l = bannerCardLabels(s) ?? [];
      const want = ["Lead (Unpaid)", "Paid (Unassigned)", "Under Review", "Completed"];
      return JSON.stringify(l) === JSON.stringify(want) ? null : `card set changed: ${JSON.stringify(l)}`; } },
  { name: "Payment Failed is NOT a KPI card", file: PAGE,
    run: (s) => (bannerCardLabels(s) ?? []).some((l) => /payment failed/i.test(l)) ? "Payment Failed re-added as a KPI card" : null },
  { name: "Payment Failed remains a status FILTER", file: PAGE,
    run: (s) => /value:\s*"payment_failed"/.test(s) ? null : "Payment Failed status-filter tab was removed" },
  { name: "every card value comes from the monthly aggregate", file: PAGE,
    run: (s) => { const v = bannerCardValues(s) ?? [];
      const bad = v.filter((x) => !/monthlyKpis\?\./.test(x));
      return bad.length === 0 ? null : `card value(s) not monthly: ${bad.join(" | ")}`; } },
  { name: "banner never reads list facet buckets", file: PAGE,
    run: (s) => (bannerCardValues(s) ?? []).some((x) => /facetCounts/.test(x)) ? "a KPI card reads facetCounts — that is the LIST universe" : null },
  { name: "banner states the active period", file: PAGE,
    run: (s) => /This month/.test(s) && /formatMonthlyPeriodLabel/.test(s) ? null : "period label missing — the operator must not have to infer the window" },
  { name: "banner shows a skeleton, never stale numbers", file: PAGE,
    run: (s) => /monthlyKpisLoading\s*\?/.test(s) ? null : "no contained loading state for the banner" },

  // ---- independence (the core of the correction) ----
  { name: "monthly effect has a dependency array", file: PAGE,
    run: (s) => monthlyEffectDeps(s) ? null : "could not locate the monthly effect's dependency array" },
  { name: "banner does NOT depend on list filters / Date Basis / pagination", file: PAGE,
    run: (s) => {
      const deps = monthlyEffectDeps(s);
      if (!deps) return "dependency array not found";
      const FORBIDDEN = ["statusFilter", "packageFilter", "dateBasis", "dateFrom", "dateTo", "search",
        "sequenceFilter", "stateFilterAdv", "doctorFilter", "selectedProviderFilter", "sourceFilter",
        "visibleCount", "orders", "filtered", "showDuplicatesOnly", "showNonGhlOnly", "hideRecentFollowup",
        "facetCounts", "sortOrder"];
      const hit = deps.filter((d) => FORBIDDEN.includes(d));
      return hit.length === 0 ? null : `banner would recompute on: ${hit.join(", ")}`;
    } },

  // ---- the list keeps its own, filter-aware counts ----
  { name: "list facet counts remain filter-aware", file: FACETS,
    run: (s) => /dateBasis\?: OrderDateBasis/.test(s) && /applyNonStatusFilters/.test(s) ? null : "list facet counts lost their filter awareness" },
  { name: "list still uses the facet total for X of Y", file: PAGE,
    run: (s) => /filteredTotalFor\(/.test(s) && /filteredTotalDisplay/.test(s) ? null : "list total no longer uses the facet universe" },
  { name: "monthly and facet state are distinct objects", file: PAGE,
    run: (s) => /const \[monthlyKpis,/.test(s) && /const \[facetCounts,/.test(s) ? null : "monthly and facet state must not be merged into one object" },
];

// ── Negative controls — each planted defect MUST be rejected ─────────────────

const NEGATIVE_CONTROLS = [
  { name: "all-time orders instead of the month window",
    file: MIG, mutate: (s) => s.replace(/and o\.created_at >= v_ps\s*\n\s*and o\.created_at <\s*v_pe/, "and true") },
  { name: "KPI counts wired to statusFilter",
    file: PAGE, mutate: (s) => s.replace(/\}, \[monthlyKpiReloadToken\]\)/, "}, [monthlyKpiReloadToken, statusFilter])") },
  { name: "KPI counts wired to packageFilter",
    file: PAGE, mutate: (s) => s.replace(/\}, \[monthlyKpiReloadToken\]\)/, "}, [monthlyKpiReloadToken, packageFilter])") },
  { name: "KPI counts wired to dateBasis",
    file: PAGE, mutate: (s) => s.replace(/\}, \[monthlyKpiReloadToken\]\)/, "}, [monthlyKpiReloadToken, dateBasis])") },
  { name: "Completed counted using created_at",
    file: MIG, mutate: (s) => s.replace(/into v_done([\s\S]{0,400}?)o\.last_completed_at >= v_ps/, "into v_done$1o.created_at >= v_ps") },
  { name: "Paid counted using last_payment_at",
    file: MIG, mutate: (s) => s.replace(/into v_paid([\s\S]{0,500}?)o\.paid_at >= v_ps/, "into v_paid$1o.last_payment_at >= v_ps") },
  { name: "Payment Failed re-added as a fifth card",
    file: PAGE, mutate: (s) => s.replace(/(\{\s*label: "Completed",[\s\S]*?\},)/,
      '$1\n{ label: "Payment Failed", value: monthlyKpis?.completed ?? null, icon: "x", color: "y", filter: "payment_failed" },') },
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

console.log(`${YELLOW}admin-orders monthly-KPI banner — guard${RESET}`);

const failures = runChecks(sources);
if (failures.length > 0) {
  console.log(`${RED}✗ monthly-KPI guard FAILED${RESET}`);
  for (const f of failures) console.log(`  ${RED}•${RESET} ${f}`);
  process.exit(1);
}
console.log(`${GREEN}✓ monthly-KPI banner guard passed${RESET} (${CHECKS.length} invariants — month-only, Eastern bounds, 4 cards, filter/basis/pagination independence, distinct universes)`);

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

console.log(`${DIM}  banner contract: current Eastern month · server-authoritative · independent of every list filter, Date Basis and pagination${RESET}`);
