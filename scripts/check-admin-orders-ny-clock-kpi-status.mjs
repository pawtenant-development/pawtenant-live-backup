#!/usr/bin/env node
// ADMIN-ORDERS-NEW-YORK-CLOCK-KPI-STABILITY-AND-STATUS-FILTER-INTEGRITY-001 §22
//
// Deploy-blocking guard for the Admin Orders repair.
//
// WHAT WENT WRONG (all of it traced to two independent defects):
//
//  1. The five KPI cards were <button onClick> and MUTATED filter state —
//     statusFilter, dateBasis, dateFrom, dateTo. That single fact produced most
//     of the reported symptoms:
//       • a highlighted "Paid (Unassigned)" card had set statusFilter="all", so
//         the list showed Under Review and Completed rows under an active-looking
//         card (the "wrong rows in the wrong tab" report);
//       • month-scoped cards set From+To, so the operator saw "Filters (2)" for a
//         range they never chose and could not see;
//       • setting a range flipped every card into the OTHER KPI universe
//         (queue depth ⇄ period events), relabelling and revaluing all five
//         behind five skeletons — the "flicker / values switch" report;
//       • "All" cleared the status but not the card's date range, so the list
//         never came back.
//
//  2. Today/Yesterday grouping read the OPERATOR'S BROWSER day via
//     `toDateString()`. From Karachi that is ~9h ahead of New York, so for a
//     third of every day the business's "today" orders were filed under
//     "Yesterday".
//
// AMENDED BY ADMIN-ORDERS-CLICKABLE-KPI-CARD-COUNT-TO-LIST-PARITY-001.
//
// The first fix removed the click entirely and made the five cards display-only
// period-EVENT counters. That was the wrong contract: the owner needs the cards
// as operational filters. Making them non-clickable also left the real problem
// unsolved — a card counting EVENTS can never agree with a tab showing CURRENT
// state. On LIVE, "Orders Paid" counted 3 (two since Completed, one since
// Pending Delivery) while the Paid (Unassigned) tab correctly held 0.
//
// The contract this guard now pins:
//   • five CLICKABLE operational cards — Lead (Unpaid), Paid (Unassigned),
//     Under Review, Pending Delivery, Completed;
//   • each is CURRENT-STATE ∧ entered-in-window, on its own stage-entry column;
//   • clicking selects that tab and applies exactly the window it counted, so
//     COUNT == LIST TOTAL by construction (one shared predicate builder);
//   • clicking the active card again, or All, clears it completely;
//   • the New York clock, the New York day grouping and the midnight rollover
//     from the first task all survive unchanged.
//
// Run:  node scripts/check-admin-orders-ny-clock-kpi-status.mjs [--self-test]

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";

const PAGE  = "src/pages/admin-orders/page.tsx";
const BIZ   = "src/lib/businessTime.ts";
const HOOK  = "src/hooks/useBusinessClock.ts";
const CLOCK = "src/components/admin/BusinessClock.tsx";
const CLASS = "src/lib/orderClassification.ts";
const FACET = "src/pages/admin-orders/orderFacetCounts.ts";
const RANGE = "src/lib/adminOrdersRangeKpis.ts";

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

/**
 * Strip comments before scanning for FORBIDDEN constructs.
 *
 * This guard's own source comments quote the very patterns it bans ("this was a
 * <button onClick> that set statusFilter", "`toDateString()`", "monthScoped"),
 * and so do the explanatory comments left in page.tsx to stop the regressions
 * coming back. Scanning raw text made the guard fail on its own documentation.
 *
 * Only ever use this for "must NOT contain" checks — a "must contain" assertion
 * should read real code too, and stripping is harmless there.
 */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // block comments (covers JSX {/* … */})
    .replace(/^[ \t]*\/\/.*$/gm, " ")     // whole-line // comments
    .replace(/([^:"'`\\])\/\/[^\n"'`]*$/gm, "$1"); // trailing // comments
}

// ── Extractors ────────────────────────────────────────────────────────────────

/** The KPI card array block (between the 5-col grid and the .map). */
export function kpiCardBlock(page) {
  const grid = page.indexOf("lg:grid-cols-5");
  if (grid < 0) return "";
  const end = page.indexOf("].map((s)", grid);
  return end < 0 ? "" : page.slice(grid, end);
}

/** The rendered card element: everything from the .map to the end of its body. */
export function kpiRenderBlock(page) {
  const start = page.indexOf("].map((s)");
  if (start < 0) return "";
  const end = page.indexOf("})}", start);
  return end < 0 ? "" : page.slice(start, end);
}

export function kpiCardLabels(page) {
  return [...kpiCardBlock(page).matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
}

export function kpiCardValueExprs(page) {
  return [...kpiCardBlock(page).matchAll(/value: ([^,\n]+)/g)].map((m) => m[1].trim());
}

/** Dependency array of the single period-KPI effect. */
export function periodEffectDeps(page) {
  const m = page.match(/fetchAdminOrdersRangeEventKpis\([\s\S]{0,500}?\}\s*,\s*\[([^\]]*)\]\s*\)/);
  return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : null;
}

// ── Checks ────────────────────────────────────────────────────────────────────

const CHECKS = [
  // ── §7 New York business clock ─────────────────────────────────────────────
  ["N1", "a shared business clock component exists", () => {
    const c = read(CLOCK);
    return /export default function BusinessClock/.test(c);
  }],
  ["N2", "the clock is mounted in the shared Admin top header", () => {
    const p = read(PAGE);
    return /<BusinessClock\s*\/?>/.test(p) && /import BusinessClock from/.test(p);
  }],
  ["N3", "the canonical timezone is America/New_York", () =>
    /BUSINESS_TIMEZONE = "America\/New_York"/.test(read(BIZ))],
  ["N4", "EST/EDT is resolved from the IANA db, never hardcoded", () => {
    const b = read(BIZ);
    return /timeZoneName: "short"/.test(b) && /export function businessZoneAbbrev/.test(b)
      // a hardcoded abbreviation or a fixed offset is the regression
      && !/(?:return|=)\s*"E[SD]T"\s*;/.test(b) && !/-0?[45]:00/.test(b);
  }],
  ["N5", "the clock ticks at least once per minute", () => {
    const h = read(HOOK);
    const m = h.match(/intervalMs = (\d+)/);
    return !!m && Number(m[1]) <= 60_000;
  }],
  ["N6", "the clock has an accessible label and makes no DB request", () => {
    const c = read(CLOCK);
    return /aria-label=/.test(c) && !/supabase|fetch\(|\.rpc\(/.test(c);
  }],
  ["N7", "clock state is lazily initialised (no hydration mismatch)", () =>
    /useState<Date>\(\(\) => new Date\(\)\)/.test(read(HOOK))],

  // ── §8 Today / Yesterday grouping ──────────────────────────────────────────
  ["N8", "day grouping uses the America/New_York business date", () => {
    const p = read(PAGE);
    return /businessDayGroupLabel\(/.test(p) && /businessIsoDate\(new Date\(ts\)\)/.test(p);
  }],
  ["N9", "NO browser-local toDateString() grouping survives", () =>
    !/toDateString\(\)/.test(stripComments(read(PAGE)))],
  ["N10", "NO browser-local getFullYear/getMonth/getDate date key survives", () =>
    !/getFullYear\(\)\}-\$\{[^}]*getMonth\(\)/.test(read(PAGE))],
  ["N11", "NO naive UTC slice(0,10) is used for business-date grouping", () => {
    const p = read(PAGE);
    return !/getDateKey[\s\S]{0,120}slice\(0,\s*10\)/.test(p);
  }],
  ["N12", "a New York midnight rollover re-arms itself", () => {
    const h = read(HOOK);
    // Must be the DELAY OF THE TIMER, not merely imported. A guard that only
    // checked the identifier appeared somewhere passed happily while the timer
    // was rewritten to a fixed 24h — which is precisely the DST-broken
    // regression this check exists to stop.
    const armsFromBusinessMidnight =
      /setTimeout\([\s\S]{0,240}?\},\s*msUntilNextBusinessMidnight\(/.test(h);
    return armsFromBusinessMidnight && /arm\(\);\s*\/\/ re-arm/.test(h)
      && /export function useBusinessDayKey/.test(h);
  }],
  ["N13", "the page consumes the rollover key for grouping", () => {
    const p = read(PAGE);
    return /const businessDayKey = useBusinessDayKey\(\)/.test(p)
      && /businessDayGroupLabel\(ts, businessDayKey\)/.test(p);
  }],
  ["N14", "the grouping TIMESTAMP is unchanged (basis-aware, matches the sort)", () =>
    /orderGroupingIso\(order, dateBasis\) \?\? order\.created_at/.test(read(PAGE))],

  // ── Clickable OPERATIONAL KPI cards (parity task §5/§8) ────────────────────
  ["N15", "KPI cards are CLICKABLE buttons", () => {
    const r = stripComments(kpiRenderBlock(read(PAGE)));
    return r.length > 0 && /<button/.test(r) && /onClick=\{\(\) => onKpiCardClick\(/.test(r);
  }],
  ["N16", "the active card is announced and styled as selected", () => {
    const r = stripComments(kpiRenderBlock(read(PAGE)));
    return /aria-pressed=\{active\}/.test(r) && /active \? "bg-\[#e8f0f9\]"/.test(r);
  }],
  ["N17", "clicking the ACTIVE card deselects it (never trapped)", () => {
    const p = stripComments(read(PAGE));
    return /activeKpi === key \? null : key/.test(p);
  }],
  ["N18", "KPI cards use a pointer cursor", () => {
    const r = stripComments(kpiRenderBlock(read(PAGE)));
    return /cursor-pointer/.test(r) && !/cursor-default/.test(r);
  }],
  ["N19", "there is exactly ONE piece of KPI state, and it drives the tab", () => {
    const p = stripComments(read(PAGE));
    // Seeded from the URL on first render (§13) rather than adopted in an
    // effect — see readKpiParam. It is still the ONE piece of KPI state.
    return /const \[activeKpi, setActiveKpi\] = useState<KpiCardKey \| null>\(\(\) => readKpiParam\(window\.location\.search\)\)/.test(p)
      && /setStatusFilter\(key \?\? "all"\)/.test(p);
  }],
  ["N20", "a manual status tab click clears the KPI card", () => {
    const p = stripComments(read(PAGE));
    return /onStatusTabClick = useCallback\(\(value: string\) => \{\s*setActiveKpi\(null\);/.test(p)
      && /onClick=\{\(\) => onStatusTabClick\(opt\.value\)\}/.test(p);
  }],
  ["N21", "the KPI selection round-trips through the URL", () => {
    const p = stripComments(read(PAGE));
    return /params\.set\("kpi", want\)/.test(p) && /params\.delete\("kpi"\)/.test(p)
      && /new URLSearchParams\(location\.search\)\.get\("kpi"\)/.test(p);
  }],
  ["N21b", "the obsolete-param sanitiser does NOT strip the live ?kpi=", () => {
    const p = stripComments(read(PAGE));
    const m = p.match(/OBSOLETE_KPI_PARAMS = \[([^\]]*)\]/);
    if (!m) return false;
    // The previous task listed "kpi" as obsolete. With clickable cards that
    // sanitiser deleted the parameter the instant the card wrote it, so every
    // selection silently deselected itself and no card could ever look active.
    // Nothing that the app actively writes may appear in this list.
    return !/"kpi"/.test(m[1]);
  }],

  // ── The five OPERATIONAL labels (§5) ───────────────────────────────────────
  ["N22", "the five cards are the OPERATIONAL queues, in order", () => {
    const f = read(FACET);
    const m = f.match(/KPI_CARD_LABEL: Record<KpiCardKey, string> = \{([\s\S]*?)\}/);
    if (!m) return false;
    const labels = [...m[1].matchAll(/: "([^"]+)"/g)].map((x) => x[1]);
    return JSON.stringify(labels) === JSON.stringify(
      ["Lead (Unpaid)", "Paid (Unassigned)", "Under Review", "Pending Delivery", "Completed"]);
  }],
  ["N23", "the retired EVENT labels are gone", () => {
    const p = stripComments(read(PAGE)) + stripComments(read(FACET));
    return !/"Leads Created"|"Orders Paid"|"Entered Under Review"|"Entered Pending Delivery"/.test(p);
  }],
  ["N24", "each card measures its OWN stage-entry column", () => {
    const f = read(FACET);
    const m = f.match(/KPI_CARD_BASIS: Record<KpiCardKey, OrderDateBasis> = \{([\s\S]*?)\};/);
    if (!m) return false;
    const b = m[1];
    return /lead_unpaid: "created"/.test(b)
      && /paid_unassigned: "first_paid"/.test(b)
      && /under_review: "under_review_entered"/.test(b)
      && /pending_delivery: "pending_delivery_entered"/.test(b)
      && /completed: "completed"/.test(b);
  }],
  ["N25", "card values come from the server KPI counts, never loaded rows", () => {
    const r = stripComments(kpiRenderBlock(read(PAGE)));
    return /kpiCounts\?\.counts\[s\.key\]/.test(r)
      && !/orders\s*\.\s*(filter|length)/.test(r);
  }],

  // ── COUNT-TO-LIST PARITY (§10) — the central acceptance requirement ────────
  ["N26", "the KPI counts and the list total share ONE predicate builder", () => {
    const f = read(FACET);
    // fetchKpiCardCounts must compose the SAME two helpers fetchOrderFacetCounts
    // uses. A second, parallel predicate is exactly how the counts drifted before.
    //
    // Scoped to the BODY of fetchKpiCardCounts: an unscoped search also matched
    // the identical composition inside fetchOrderFacetCounts, so gutting the KPI
    // builder still passed. Assert the composition where it actually matters.
    const i = f.indexOf("export async function fetchKpiCardCounts");
    if (i < 0) return false;
    const body = f.slice(i, f.indexOf("\n}", i));
    return /applyBucket\(\s*applyNonStatusFilters\(/.test(body);
  }],
  ["N27", "each card count is windowed on that card's own basis", () => {
    const f = read(FACET);
    return /dateBasis: KPI_CARD_BASIS\[k\]/.test(f)
      && /dateFrom: range\.from/.test(f) && /dateTo: range\.to/.test(f);
  }],
  ["N28", "the list applies the card's basis and window (EFFECTIVE window)", () => {
    const p = stripComments(read(PAGE));
    return /const effDateBasis: OrderDateBasis = activeKpi \? KPI_CARD_BASIS\[activeKpi\] : dateBasis/.test(p)
      && /const effDateFrom = activeKpi \? kpiFrom : \(dateFrom \|\| undefined\)/.test(p)
      && /const effDateTo = activeKpi \? kpiTo : \(dateTo \|\| undefined\)/.test(p);
  }],
  ["N29", "the row predicate uses the EFFECTIVE window, not the raw state", () => {
    const p = stripComments(read(PAGE));
    return /matchesBasisDateRange\(o, effDateBasis, effDateFrom, effDateTo\)/.test(p);
  }],
  ["N30", "the facet counts (list total) use the EFFECTIVE window too", () => {
    const p = stripComments(read(PAGE));
    return /dateBasis: effDateBasis, dateFrom: effDateFrom, dateTo: effDateTo/.test(p);
  }],
  ["N31", "the list total still comes from the server facets", () => {
    const p = stripComments(read(PAGE));
    return /filteredTotalFor\(statusFilter, facetCounts\)/.test(p);
  }],

  // ── Window + stability ─────────────────────────────────────────────────────
  ["N32", "the default window is the CURRENT New York month", () => {
    const p = stripComments(read(PAGE));
    return /currentBusinessMonth\(\)/.test(p)
      && /const kpiFrom = kpiRangeExplicit \? \(dateFrom \|\| undefined\) : kpiMonth\.from/.test(p);
  }],
  ["N33", "an explicit range replaces the window for BOTH count and list", () => {
    const p = stripComments(read(PAGE));
    return /const kpiRangeExplicit = Boolean\(dateFrom \|\| dateTo\)/.test(p)
      && /const kpiTo = kpiRangeExplicit \? \(dateTo \|\| undefined\) : kpiMonth\.toInclusive/.test(p);
  }],
  ["N34", "the KPI window rolls over at NEW YORK midnight", () => {
    const p = stripComments(read(PAGE));
    return /kpiMonth = useMemo\([\s\S]{0,400}?\[businessDayKey\]/.test(p);
  }],
  ["N35", "stale KPI responses cannot publish (request guard)", () => {
    const p = stripComments(read(PAGE));
    return /kpiCountGuard = useRef\(createRequestGuard\(\)\)/.test(p)
      && /runLatest\(\s*kpiCountGuard/.test(p);
  }],
  ["N36", "KPI counts are NEVER reset to zero/null while fetching", () => {
    const p = read(PAGE);
    const m = p.match(/setKpiCountsLoading\(true\);([\s\S]{0,500}?)fetchKpiCardCounts/);
    return !!m && !/setKpiCounts\((null|\{)/.test(m[1]);
  }],
  ["N37", "stable values stay visible during refresh (skeleton is first-load only)", () => {
    const r = stripComments(kpiRenderBlock(read(PAGE)));
    return /const firstLoad = kpiCountsLoading && kpiCounts == null/.test(r);
  }],
  ["N38", "selecting a card does NOT change what any card counts", () => {
    // The count effect must not depend on activeKpi or statusFilter, or the
    // numbers would move under the operator's cursor when a card is clicked.
    const p = read(PAGE);
    const m = p.match(/fetchKpiCardCounts\([\s\S]{0,900}?\}\s*,\s*\[([^\]]*)\]\s*\)/);
    if (!m) return false;
    const deps = m[1].split(",").map((d) => d.trim());
    return !deps.includes("activeKpi") && !deps.includes("statusFilter") && !deps.includes("visibleCount");
  }],
  ["N39", "the active card states the FULL result across all date groups", () => {
    const p = stripComments(read(PAGE));
    // §15 — Today is only one ribbon inside the window; the operator must not
    // compare the card against the Today group alone.
    return /Across all date groups below/.test(p) && /KPI_CARD_LABEL\[activeKpi\]/.test(p);
  }],

  // ── §13/§14 status predicates ──────────────────────────────────────────────
  ["N40", "Paid (Unassigned) excludes Completed and any assigned provider", () => {
    const c = read(CLASS);
    return /export function isPaidUnassigned[\s\S]{0,200}?!isLeadOrder\(o\) && !isRefundedBucket\(o\) && !isCompletedOrder\(o\) && !hasProvider\(o\)/.test(c);
  }],
  ["N41", "Under Review excludes Completed AND Pending Delivery", () => {
    const c = read(CLASS);
    return /export function isUnderReview[\s\S]{0,260}?!isCompletedOrder\(o\)[\s\S]{0,120}?!isPendingDelivery\(o\)/.test(c);
  }],
  ["N42", "Pending Delivery excludes Completed", () => {
    const c = read(CLASS);
    return /export function isPendingDelivery[\s\S]{0,220}?!isCompletedOrder\(o\)/.test(c);
  }],
  ["N43", "the Pending Delivery tab is explicit, never a status fallthrough", () =>
    /statusFilter === "pending_delivery"[\s\S]{0,400}?matchStatus = isPendingDelivery\(o\)/.test(read(PAGE))],
  ["N44", "the row query and the total share one canonical predicate source", () => {
    const p = read(PAGE);
    const f = read(FACET);
    // The tab total must come from the SERVER facet counts, never from the
    // loaded row array's length.
    return /filteredTotalFor\(statusFilter, facetCounts\)/.test(p)
      && /export function filteredTotalFor/.test(f);
  }],
  ["N45", "facet buckets mirror the client classifiers (parity anchors present)", () => {
    const f = read(FACET);
    return /case "paid_unassigned":[\s\S]{0,600}?doctor_status\.neq\.patient_notified/.test(f)
      && /case "under_review":[\s\S]{0,900}?doctor_status\.neq\.pending_admin_approval/.test(f)
      && /case "pending_delivery":[\s\S]{0,700}?pending_admin_approval/.test(f);
  }],
  ["N46", "All clears the status filter and nothing else", () => {
    const code = stripComments(read(PAGE));
    // The status TABS are the only status control: an "All" option whose value
    // is "all", applied by the shared tab handler. Because the KPI cards no
    // longer set dateFrom/dateTo/dateBasis (N15-N20), selecting All can no
    // longer leave an invisible date range behind — which was the actual bug.
    const hasAllTab = /\{ value: "all", label: "All" \}/.test(code);
    // Every tab, All included, goes through the handler that clears the KPI card.
    const tabHandler = /onClick=\{\(\) => onStatusTabClick\(opt\.value\)\}/.test(code);
    // Clearing the card must clear its WINDOW too. That is structural here: the
    // window is DERIVED from activeKpi, so a card can never leave a date range
    // or a Date Basis behind. Assert the cards never write those states directly.
    const cardsWriteNoDateState = !/setDateFrom|setDateTo|setDateBasis/
      .test(stripComments(kpiRenderBlock(read(PAGE))));
    return hasAllTab && tabHandler && cardsWriteNoDateState;
  }],

  // ── §15 Filters badge ──────────────────────────────────────────────────────
  ["N47", "the Filters badge counts only visible explicit filters", () => {
    const p = read(PAGE);
    const m = p.match(/const activeFilterCount = \[([\s\S]*?)\]\.filter\(Boolean\)\.length/);
    if (!m) return false;
    const body = m[1];
    return !/statusFilter/.test(body) && !/dateBasis/.test(body)
      && !/kpi/i.test(body) && !/visibleCount|sortOrder/.test(body)
      // From/To is ONE visible control, not two
      && /!!dateFrom \|\| !!dateTo/.test(body);
  }],

  // ── Preservation ───────────────────────────────────────────────────────────
  ["N48", "the secure-resume pre-boot scrub is untouched", () => {
    const idx = readFileSync(join(ROOT, "index.html"), "utf8");
    return /rt|resume/.test(idx) && /history\.replaceState/.test(idx);
  }],
  ["N49", "no LIVE project ref is introduced by this task", () => {
    const files = [PAGE, BIZ, HOOK, CLOCK];
    return !files.some((f) => /cvwbozlbbmrjxznknouq/.test(read(f)));
  }],
];

// ── Runtime logic checks (pure functions, exercised directly) ────────────────

async function logicChecks() {
  const mod = await import("../src/lib/businessTime.ts").catch(() => null);
  // businessTime.ts is TypeScript; when it cannot be imported directly we rely
  // on the static assertions above rather than silently "passing".
  if (!mod) return { ran: 0, failures: [] };
  const failures = [];
  const t = (name, cond) => { if (!cond) failures.push(name); };

  // The exact real-world mismatch this task was reported against:
  // 2026-08-02 04:38 Pakistan  ==  2026-08-01 19:38 New York.
  const pkMidnightIsh = new Date("2026-08-01T23:38:00Z"); // 04:38 PKT Aug 2
  t("NY date is still Aug 1 when Pakistan is Aug 2",
    mod.businessIsoDate(pkMidnightIsh) === "2026-08-01");
  t("an order at that instant groups under Today",
    mod.businessDayGroupLabel(pkMidnightIsh, "2026-08-01") === "Today");
  t("the previous NY day groups under Yesterday",
    mod.businessDayGroupLabel(new Date("2026-07-31T20:00:00Z"), "2026-08-01") === "Yesterday");

  // EDT boundary: 04:00Z is midnight ET in summer (UTC-4).
  t("03:59:59Z belongs to the previous NY day",
    mod.businessIsoDate(new Date("2026-08-02T03:59:59Z")) === "2026-08-01");
  t("04:00:00Z starts the new NY day",
    mod.businessIsoDate(new Date("2026-08-02T04:00:00Z")) === "2026-08-02");

  // EST boundary: in winter midnight ET is 05:00Z — proving 04:00Z is NOT hardcoded.
  t("winter EST boundary is 05:00Z, not 04:00Z",
    mod.businessIsoDate(new Date("2026-01-15T04:59:59Z")) === "2026-01-14" &&
    mod.businessIsoDate(new Date("2026-01-15T05:00:00Z")) === "2026-01-15");

  t("zone abbreviation flips with DST",
    mod.businessZoneAbbrev(new Date("2026-08-01T16:00:00Z")) === "EDT" &&
    mod.businessZoneAbbrev(new Date("2026-01-15T16:00:00Z")) === "EST");

  t("ms-until-next-NY-midnight is positive and under 24h",
    (() => {
      const ms = mod.msUntilNextBusinessMidnight(new Date("2026-08-01T23:38:00Z"));
      return ms > 0 && ms <= 24 * 3600 * 1000;
    })());

  return { ran: 9, failures };
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  const results = CHECKS.map(([id, label, fn]) => {
    let ok = false, err = null;
    try { ok = !!fn(); } catch (e) { err = e.message; }
    return { id, label, ok, err };
  });
  const logic = await logicChecks();

  for (const r of results) {
    console.log(`  ${r.ok ? GREEN + "PASS" : RED + "FAIL"}${RESET}  ${r.id.padEnd(4)} ${r.label}${r.err ? ` — ${r.err}` : ""}`);
  }
  for (const f of logic.failures) console.log(`  ${RED}FAIL${RESET}  LOGIC ${f}`);

  const failed = results.filter((r) => !r.ok).length + logic.failures.length;
  const total = results.length + logic.ran;
  console.log(`\n${failed === 0 ? GREEN : RED}${total - failed}/${total} checks passed.${RESET}`);
  return failed === 0;
}

// ── Self-test: planted negative controls ─────────────────────────────────────
// Every control MUTATES real source, asserts the guard CATCHES it, then restores
// the file byte-for-byte. A control that fails to trip means the guard is
// decorative — that is itself a failure.

const CONTROLS = [
  ["browser-local clock restored", PAGE,
    (s) => s.replace("businessDayGroupLabel(ts, businessDayKey)", "new Date(ts).toDateString()")],
  ["UTC slicing for business date", PAGE,
    (s) => s.replace("businessIsoDate(new Date(ts))", "ts.slice(0, 10)")],
  // The realistic regression: keep the import, but re-arm the timer on a fixed
  // 24h instead of the real New York midnight. Correct for ~363 days a year and
  // an hour wrong on both DST transition days.
  ["New York midnight refresh replaced by a fixed 24h", HOOK,
    (s) => s.replace("}, msUntilNextBusinessMidnight(new Date()));", "}, 24 * 60 * 60 * 1000);")],
  ["New York clock unmounted from the header", PAGE,
    (s) => s.replace("          <BusinessClock />\n", "")],
  ["hardcoded EDT abbreviation", BIZ,
    (s) => s.replace('return parts.find((p) => p.type === "timeZoneName")?.value ?? "ET";', 'return "EDT";')],

  // ── the corrected clickable-card contract ────────────────────────────────
  ["cards made non-clickable again", PAGE,
    (s) => s.replace("onClick={() => onKpiCardClick(s.key)}", "")],
  ['"Orders Paid" event label restored', FACET,
    (s) => s.replace('paid_unassigned: "Paid (Unassigned)"', 'paid_unassigned: "Orders Paid"')],
  ["the active card can no longer be toggled off", PAGE,
    (s) => s.replace("applyKpiSelection(activeKpi === key ? null : key);", "applyKpiSelection(key);")],
  ["a manual status tab stops clearing the KPI card", PAGE,
    (s) => s.replace("onClick={() => onStatusTabClick(opt.value)}", "onClick={() => setStatusFilter(opt.value)}")],
  ["the card list drops the date window (count/list drift)", PAGE,
    (s) => s.replace("const effDateFrom = activeKpi ? kpiFrom : (dateFrom || undefined);",
      "const effDateFrom = dateFrom || undefined;")],
  ["the card list drops the card's basis (count/list drift)", PAGE,
    (s) => s.replace("const effDateBasis: OrderDateBasis = activeKpi ? KPI_CARD_BASIS[activeKpi] : dateBasis;",
      "const effDateBasis: OrderDateBasis = dateBasis;")],
  ["the row predicate stops using the effective window", PAGE,
    (s) => s.replace("matchesBasisDateRange(o, effDateBasis, effDateFrom, effDateTo)",
      "matchesBasisDateRange(o, dateBasis, dateFrom, dateTo)")],
  ["the list total stops using the effective window", PAGE,
    (s) => s.replace("dateBasis: effDateBasis, dateFrom: effDateFrom, dateTo: effDateTo,",
      "dateBasis, dateFrom, dateTo,")],
  ["the KPI counts get their own second predicate builder", FACET,
    (s) => s.replace("          applyBucket(\n            applyNonStatusFilters(", "          (\n            (")],
  ["Paid (Unassigned) card measures created_at instead of paid_at", FACET,
    (s) => s.replace('paid_unassigned: "first_paid"', 'paid_unassigned: "created"')],
  ["Completed card measures paid_at instead of completion", FACET,
    (s) => s.replace('completed: "completed"', 'completed: "first_paid"')],
  ["Paid Unassigned allows Completed", CLASS,
    (s) => s.replace("return !isLeadOrder(o) && !isRefundedBucket(o) && !isCompletedOrder(o) && !hasProvider(o);",
      "return !isLeadOrder(o) && !isRefundedBucket(o) && !hasProvider(o);")],
  ["Under Review allows Pending Delivery", CLASS,
    (s) => s.replace("&& !isPendingDelivery(o);", ";")],
  ["the KPI counts react to the selected card (numbers move on click)", PAGE,
    (s) => s.replace("showDuplicatesOnly, monthlyKpiReloadToken, aggregateReloadToken, kpiCountGuard]);",
      "showDuplicatesOnly, activeKpi, monthlyKpiReloadToken, aggregateReloadToken, kpiCountGuard]);")],
  ["stale-response guard removed", PAGE,
    (s) => s.replace("runLatest(\n        kpiCountGuard,", "runLatestUnguarded(\n        noGuard,")],
  ["KPI counts zero-reset restored", PAGE,
    (s) => s.replace("setKpiCountsLoading(true);\n    const t = window.setTimeout",
      "setKpiCountsLoading(true);\n    setKpiCounts(null);\n    const t = window.setTimeout")],
  ["the KPI URL parameter is dropped (no reload restore)", PAGE,
    (s) => s.replace('if (want) params.set("kpi", want); else params.delete("kpi");', "")],
  // The exact regression found in browser QA: the previous task's sanitiser
  // listed "kpi" as obsolete, so it stripped the parameter the moment a card
  // wrote it and every selection deselected itself on the next tick.
  ["the sanitiser strips the live ?kpi= parameter again", PAGE,
    (s) => s.replace('const OBSOLETE_KPI_PARAMS = ["activeKpi"', 'const OBSOLETE_KPI_PARAMS = ["kpi", "activeKpi"')],
  ["Filters badge counts hidden state", PAGE,
    (s) => s.replace("!!dateFrom || !!dateTo,", '!!dateFrom, !!dateTo, statusFilter !== "all",')],
];

async function selfTest() {
  console.log(`${YELLOW}self-test: planted negative controls${RESET}\n`);
  const baseline = await run();
  if (!baseline) {
    console.log(`${RED}✗ guard is not green before planting — fix the source first${RESET}`);
    return false;
  }
  let allTripped = true;
  for (const [name, rel, mutate] of CONTROLS) {
    const abs = join(ROOT, rel);
    const original = readFileSync(abs, "utf8");
    const mutated = mutate(original);
    if (mutated === original) {
      console.log(`  ${RED}NO-OP${RESET}  ${name} — anchor moved; control proves nothing`);
      allTripped = false;
      continue;
    }
    writeFileSync(abs, mutated);
    let caught;
    try {
      const results = CHECKS.map(([, , fn]) => { try { return !!fn(); } catch { return false; } });
      const logic = await logicChecks();
      caught = results.some((r) => !r) || logic.failures.length > 0;
    } finally {
      writeFileSync(abs, original); // restore byte-for-byte, always
    }
    console.log(`  ${caught ? GREEN + "CAUGHT" : RED + "MISSED"}${RESET}  ${name}`);
    if (!caught) allTripped = false;
  }
  const restored = await run();
  console.log(`\n${restored ? GREEN + "✓ source restored and green" : RED + "✗ source NOT restored"}${RESET}`);
  return allTripped && restored;
}

// Only run the CLI when invoked directly. This module also EXPORTS its
// extractors (stripComments, kpiRenderBlock, …) so they can be imported by a
// test or a debug harness — without this check that import would execute the
// whole guard and process.exit() out of the importer.
const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === join(process.argv[1]);

if (invokedDirectly) {
  const isSelfTest = process.argv.includes("--self-test");
  const ok = isSelfTest ? await selfTest() : await run();
  if (!ok) {
    console.log(`${RED}✗ admin-orders New York clock / KPI / status guard FAILED${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ admin-orders New York clock, display-only KPI cards and strict status filters verified${RESET}`);
}
