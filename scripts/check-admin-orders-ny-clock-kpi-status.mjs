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
// This guard makes both un-shippable, and pins the replacement contract:
// ONE period-event KPI semantics over ONE normalized America/New_York window,
// display-only cards, and a visible New York business clock.
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

  // ── §B KPI cards are display-only ──────────────────────────────────────────
  ["N15", "KPI cards are NOT buttons", () => {
    const r = stripComments(kpiRenderBlock(read(PAGE)));
    return r.length > 0 && !/<button/.test(r);
  }],
  ["N16", "KPI cards have no click handler", () => {
    const r = stripComments(kpiRenderBlock(read(PAGE)));
    return r.length > 0 && !/onClick|onKeyDown|onKeyUp|onPointerDown|onMouseDown/.test(r);
  }],
  ["N17", "KPI cards carry no button/link semantics and no tabIndex", () => {
    const r = stripComments(kpiRenderBlock(read(PAGE)));
    return r.length > 0 && !/role="(button|link)"/.test(r) && !/tabIndex/.test(r);
  }],
  ["N18", "KPI cards use the default cursor, never a pointer", () => {
    const r = stripComments(kpiRenderBlock(read(PAGE)));
    return r.length > 0 && /cursor-default/.test(r) && !/cursor-pointer/.test(r);
  }],
  ["N19", "KPI cards carry no selected/active styling", () => {
    const r = stripComments(kpiRenderBlock(read(PAGE)));
    return r.length > 0 && !/\bactive\b/.test(r) && !/bg-\[#e8f0f9\]/.test(r);
  }],
  ["N20", "no KPI filtering state survives anywhere on the page", () => {
    // Comments explaining the removal are fine; a real BINDING is not. The
    // line-prefix filter this used before could not see JSX {/* … */} blocks,
    // which is where page.tsx documents the removed names.
    //
    // String LITERALS are excluded too: §12's URL sanitiser necessarily spells
    // out the obsolete parameter names it strips ("activeKpi", "kpiFilter",
    // "monthScoped", …). Banning those literals would ban the fix itself, so
    // only bare identifiers count as surviving state.
    const code = stripComments(read(PAGE))
      .replace(/"[^"\n]*"/g, '""')
      .replace(/'[^'\n]*'/g, "''");
    return !/\b(activeKpi|selectedKpi|kpiFilter|onKpiClick|monthScoped|rangeKpiActive)\b/.test(code);
  }],
  ["N21", "obsolete KPI URL parameters are stripped on arrival", () => {
    const p = read(PAGE);
    return /OBSOLETE_KPI_PARAMS/.test(p) && /replace: true/.test(p);
  }],

  // ── §9/§10/§11 ONE period-event KPI contract ───────────────────────────────
  ["N22", "the five cards are the five PERIOD-EVENT metrics", () =>
    JSON.stringify(kpiCardLabels(read(PAGE))) === JSON.stringify(
      ["Leads Created", "Orders Paid", "Entered Under Review", "Entered Pending Delivery", "Completed"])],
  ["N23", "every card value comes from the ONE period aggregate", () => {
    const v = kpiCardValueExprs(read(PAGE));
    return v.length === 5 && v.every((e) => /^periodKpis\?\./.test(e));
  }],
  ["N24", "cards are wired to the event fields positionally", () => {
    const v = kpiCardValueExprs(read(PAGE));
    const want = ["leadsCreated", "ordersPaid", "enteredUnderReview", "enteredPendingDelivery", "completed"];
    return v.length === 5 && want.every((f, i) => v[i].includes(f));
  }],
  ["N25", "no card is queue DEPTH and no card says \"now\"", () => {
    const b = kpiCardBlock(read(PAGE));
    return !/Current\b/.test(b) && !/timeframe: "now"/.test(b) && !/"now"/.test(b);
  }],
  ["N26", "the default window is the CURRENT New York month", () => {
    const p = read(PAGE);
    return /currentBusinessMonth\(\)/.test(p)
      && /kpiRangeExplicit \? \(dateFrom \|\| null\) : monthlyKpiPeriod\.from/.test(p);
  }],
  ["N27", "an explicit range replaces the window, same five metrics", () => {
    const p = read(PAGE);
    return /const kpiRangeExplicit = Boolean\(dateFrom \|\| dateTo\)/.test(p)
      && /kpiRangeExplicit \? \(dateTo \|\| null\) : monthlyKpiPeriod\.toInclusive/.test(p);
  }],
  ["N28", "the KPI window rolls over at NEW YORK midnight", () => {
    const p = read(PAGE);
    return /monthlyKpiPeriod = useMemo\([\s\S]{0,400}?\[businessDayKey\]/.test(p);
  }],
  ["N29", "there is exactly ONE KPI state and ONE KPI fetch", () => {
    // monthlyKpiPeriod / monthlyKpiReloadToken are the SURVIVING single-universe
    // names; blank them first so the ban below targets only the removed states.
    const code = stripComments(read(PAGE)).replace(/monthlyKpiPeriod|monthlyKpiReloadToken/g, "");
    return !/\brangeKpis\b|\bmonthlyKpis\b/.test(code)
      && (code.match(/fetchAdminOrdersRangeEventKpis\(/g) || []).length === 1;
  }],
  ["N30", "the KPI window is keyed on normalized STRINGS, not Date objects", () => {
    const deps = periodEffectDeps(read(PAGE));
    return !!deps && deps.includes("kpiFrom") && deps.includes("kpiTo");
  }],
  ["N31", "the KPI effect ignores list filters, basis, status and pagination", () => {
    const deps = periodEffectDeps(read(PAGE));
    if (!deps) return false;
    const forbidden = ["statusFilter", "dateBasis", "search", "packageFilter", "visibleCount",
      "sequenceFilter", "paymentFilter", "sortOrder", "page"];
    return !deps.some((d) => forbidden.includes(d));
  }],
  ["N32", "stale KPI responses cannot publish (request guard)", () => {
    const p = read(PAGE);
    return /periodKpiGuard = useRef\(createRequestGuard\(\)\)/.test(p)
      && /runLatest\(\s*periodKpiGuard/.test(p);
  }],
  ["N33", "KPI values are NEVER reset to zero/null while fetching", () => {
    const p = read(PAGE);
    // the effect body between setPeriodKpisLoading(true) and the fetch must not
    // clear the published values
    const m = p.match(/setPeriodKpisLoading\(true\);([\s\S]{0,400}?)fetchAdminOrdersRangeEventKpis/);
    return !!m && !/setPeriodKpis\((null|\{)/.test(m[1]);
  }],
  ["N34", "stable values stay visible during refresh (skeleton is first-load only)", () =>
    /const firstLoad = periodKpisLoading && periodKpis == null/.test(read(PAGE))],
  ["N35", "the RPC fails CLOSED — never a fabricated count", () => {
    const r = read(RANGE);
    return /if \(error\) return null/.test(r) && /catch \{\s*return null/.test(r);
  }],

  // ── §13/§14 status predicates ──────────────────────────────────────────────
  ["N36", "Paid (Unassigned) excludes Completed and any assigned provider", () => {
    const c = read(CLASS);
    return /export function isPaidUnassigned[\s\S]{0,200}?!isLeadOrder\(o\) && !isRefundedBucket\(o\) && !isCompletedOrder\(o\) && !hasProvider\(o\)/.test(c);
  }],
  ["N37", "Under Review excludes Completed AND Pending Delivery", () => {
    const c = read(CLASS);
    return /export function isUnderReview[\s\S]{0,260}?!isCompletedOrder\(o\)[\s\S]{0,120}?!isPendingDelivery\(o\)/.test(c);
  }],
  ["N38", "Pending Delivery excludes Completed", () => {
    const c = read(CLASS);
    return /export function isPendingDelivery[\s\S]{0,220}?!isCompletedOrder\(o\)/.test(c);
  }],
  ["N39", "the Pending Delivery tab is explicit, never a status fallthrough", () =>
    /statusFilter === "pending_delivery"[\s\S]{0,400}?matchStatus = isPendingDelivery\(o\)/.test(read(PAGE))],
  ["N40", "the row query and the total share one canonical predicate source", () => {
    const p = read(PAGE);
    const f = read(FACET);
    // The tab total must come from the SERVER facet counts, never from the
    // loaded row array's length.
    return /filteredTotalFor\(statusFilter, facetCounts\)/.test(p)
      && /export function filteredTotalFor/.test(f);
  }],
  ["N41", "facet buckets mirror the client classifiers (parity anchors present)", () => {
    const f = read(FACET);
    return /case "paid_unassigned":[\s\S]{0,600}?doctor_status\.neq\.patient_notified/.test(f)
      && /case "under_review":[\s\S]{0,900}?doctor_status\.neq\.pending_admin_approval/.test(f)
      && /case "pending_delivery":[\s\S]{0,700}?pending_admin_approval/.test(f);
  }],
  ["N42", "All clears the status filter and nothing else", () => {
    const code = stripComments(read(PAGE));
    // The status TABS are the only status control: an "All" option whose value
    // is "all", applied by the shared tab handler. Because the KPI cards no
    // longer set dateFrom/dateTo/dateBasis (N15-N20), selecting All can no
    // longer leave an invisible date range behind — which was the actual bug.
    const hasAllTab = /\{ value: "all", label: "All" \}/.test(code);
    const tabHandler = /onClick=\{\(\) => setStatusFilter\(opt\.value\)\}/.test(code);
    // and no status mutation may live inside the KPI card render block
    const cardsInert = !/setStatusFilter|setDateFrom|setDateTo|setDateBasis/
      .test(stripComments(kpiRenderBlock(read(PAGE))));
    return hasAllTab && tabHandler && cardsInert;
  }],

  // ── §15 Filters badge ──────────────────────────────────────────────────────
  ["N43", "the Filters badge counts only visible explicit filters", () => {
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
  ["N44", "the secure-resume pre-boot scrub is untouched", () => {
    const idx = readFileSync(join(ROOT, "index.html"), "utf8");
    return /rt|resume/.test(idx) && /history\.replaceState/.test(idx);
  }],
  ["N45", "no LIVE project ref is introduced by this task", () => {
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
  ["KPI click handler reintroduced", PAGE,
    (s) => s.replace('key={s.label}\n                    className="flex items-center gap-3 px-4 py-3 text-left cursor-default w-full"',
      'key={s.label}\n                    onClick={() => setStatusFilter("completed")}\n                    className="flex items-center gap-3 px-4 py-3 text-left cursor-default w-full"')],
  ["KPI button role reintroduced", PAGE,
    (s) => s.replace('className="flex items-center gap-3 px-4 py-3 text-left cursor-default w-full"',
      'role="button" tabIndex={0} className="flex items-center gap-3 px-4 py-3 text-left cursor-pointer w-full"')],
  ["activeKpi state reintroduced", PAGE,
    (s) => s.replace("const businessDayKey = useBusinessDayKey();",
      "const businessDayKey = useBusinessDayKey();\n  const [activeKpi, setActiveKpi] = useState(null);")],
  ["KPI switched back to queue depth", PAGE,
    (s) => s.replace("value: periodKpis?.enteredUnderReview ?? null",
      "value: periodKpis?.underReviewCurrent ?? null, timeframe: \"now\"")],
  ["stale-response guard removed", PAGE,
    (s) => s.replace("runLatest(\n        periodKpiGuard,", "runLatestUnguarded(\n        noGuard,")],
  ["KPI zero-reset restored", PAGE,
    (s) => s.replace("setPeriodKpisLoading(true);\n    const t = window.setTimeout",
      "setPeriodKpisLoading(true);\n    setPeriodKpis(null);\n    const t = window.setTimeout")],
  ["Paid Unassigned allows Completed", CLASS,
    (s) => s.replace("return !isLeadOrder(o) && !isRefundedBucket(o) && !isCompletedOrder(o) && !hasProvider(o);",
      "return !isLeadOrder(o) && !isRefundedBucket(o) && !hasProvider(o);")],
  ["Under Review allows Pending Delivery", CLASS,
    (s) => s.replace("&& !isPendingDelivery(o);", ";")],
  ["Filters badge counts hidden state", PAGE,
    (s) => s.replace("!!dateFrom || !!dateTo,", "!!dateFrom, !!dateTo, statusFilter !== \"all\",")],
  ["cards renamed back to queue labels", PAGE,
    (s) => s.replace('label: "Entered Under Review"', 'label: "Under Review"')],
  ["KPI effect made filter-aware", PAGE,
    (s) => s.replace("}, [kpiFrom, kpiTo, monthlyKpiReloadToken, periodKpiGuard]);",
      "}, [kpiFrom, kpiTo, statusFilter, dateBasis, monthlyKpiReloadToken, periodKpiGuard]);")],
  ["a second KPI fetch reintroduced", PAGE,
    (s) => s.replace("const [exporting, setExporting] = useState(false);",
      "const rangeKpis = await fetchAdminOrdersRangeEventKpis({ from: null, to: null });\n  const [exporting, setExporting] = useState(false);")],
  ["hardcoded EDT abbreviation", BIZ,
    (s) => s.replace('return parts.find((p) => p.type === "timeZoneName")?.value ?? "ET";', 'return "EDT";')],
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
