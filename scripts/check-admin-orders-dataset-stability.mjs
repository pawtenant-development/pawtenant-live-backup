#!/usr/bin/env node
// ADMIN-ORDERS-DATASET-FLICKER-P0-001 — regression guard.
//
// Locks in the dataset-stability contract for the admin Orders list so a future
// edit can't silently reintroduce the flicker (dataset/counts blinking between a
// partial page and the full set) or regress the historical 88bc2d8 pagination.
//
// Two layers:
//   1. STATIC — assert required invariants are present and forbidden regressions
//      are absent in src/pages/admin-orders/page.tsx.
//   2. LOGIC  — a runtime simulation of the snapshot assembler + monotonic-cycle
//      guard, with negative controls, proving the core algorithm dedupes, sorts
//      once, ignores stale cycles/pages, and never lets a partial page replace a
//      completed snapshot.
//
// Usage:
//   node scripts/check-admin-orders-dataset-stability.mjs            # guard TEST source
//   node scripts/check-admin-orders-dataset-stability.mjs --self-test # prove the guard works

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE = join(__dirname, "..", "src", "pages", "admin-orders", "page.tsx");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

// ── STATIC CONTRACT ─────────────────────────────────────────────────────────
// Each REQUIRED entry must be found; each FORBIDDEN entry must be absent.
const REQUIRED = [
  // ── The server-backed list (ADMIN-ORDERS-SERVER-BACKED-LOADING-001) ───────
  { label: "list page size constant", re: /const\s+ORDERS_PAGE_SIZE\s*=\s*\d+/ },
  { label: "snapshot page size is a SEPARATE constant", re: /const\s+SNAPSHOT_PAGE_SIZE\s*=\s*\d+/ },
  { label: "row query runs through the SHARED predicate builder", re: /applyListPredicates\(\s*\n\s*supabase\.from\("orders"\)\.select\(ORDERS_LIST_COLUMNS\),\s*\n\s*listFilters,/ },
  { label: "row query is bounded by the page window", re: /\.range\(from,\s*from\s*\+\s*ORDERS_PAGE_SIZE\s*-\s*1\)/ },
  { label: "deterministic ordering ends on the unique id tie-breaker", re: /\.order\("id",\s*\{\s*ascending:\s*asc\s*\}\)/ },
  { label: "one query key collapses every list input", re: /const listQueryKey = useMemo\(/ },
  { label: "default scope is eligibility-gated, not unconditional", re: /isDefaultScopeEligible\(listFilters, statusFilter\)/ },
  { label: "default scope is dropped for exports", re: /\{ defaultScopeCutoff: null \}/ },
  { label: "only the newest list request may publish", re: /const\s+orderRowsGuard\s*=\s*useRef\(createRequestGuard\(\)\)\.current/ },
  { label: "search is debounced before it reaches the server", re: /setDebouncedSearch\(search\.trim\(\)\)/ },
  { label: "the client predicate reads the DEBOUNCED term", re: /const q = debouncedSearch\.toLowerCase\(\)/ },
  { label: "load-more dedupes by order primary key", re: /rows\.filter\(\(r\) => r && r\.id && !seen\.has\(r\.id\)\)/ },
  { label: "a page that outlived its query is discarded", re: /if \(keyAtRequest !== listQueryKeyRef\.current\) return;/ },
  { label: "every mutation reaches BOTH datasets", re: /const mutateOrders = useCallback\(\(fn: \(prev: Order\[\]\) => Order\[\]\) => \{\s*\n\s*setOrders\(fn\);\s*\n\s*setOrderRows\(fn\);\s*\n\s*setOrderFacts\(fn\);/ },
  { label: "whole-table snapshot is ON DEMAND", re: /if \(!snapshotRequestedRef\.current\) \{/ },
  { label: "snapshot is only requested by tabs that aggregate it", re: /if \(!SNAPSHOT_TABS\.has\(activeTab\)\) return;/ },
  { label: "an unloaded deep-linked order is READ, not abandoned", re: /\.select\(ORDERS_LIST_COLUMNS\)\s*\n\s*\.eq\("id", orderId\)/ },
  { label: "exports page the COMPLETE matching set", re: /const fetchAllMatchingOrders = useCallback/ },

  // ── Preserved from ADMIN-ORDERS-DATASET-FLICKER-P0-001 ────────────────────
  // The whole-table snapshot still exists (Dashboard / Analytics / Comms) and
  // still assembles atomically. These are NOT superseded by the change above.
  { label: "monotonic cycle id ref (loadSeqRef)", re: /const\s+loadSeqRef\s*=\s*useRef\(0\)/ },
  { label: "cycle id incremented once per load", re: /const\s+seq\s*=\s*\+\+loadSeqRef\.current/ },
  { label: "isLatest() staleness guard", re: /const\s+isLatest\s*=\s*\(\)\s*=>\s*seq\s*===\s*loadSeqRef\.current/ },
  { label: "snapshot local accumulator + dedupe Set", re: /const\s+seen\s*=\s*new\s+Set<string>\(\)/ },
  { label: "snapshot dedupe by order primary key", re: /!seen\.has\(o\.id\)/ },
  { label: "snapshot sorted exactly once after assembly", re: /const\s+snapshot\s*=\s*acc\.slice\(\)\.sort\(/ },
  { label: "single atomic snapshot commit", re: /setOrders\(snapshot\)/ },
  { label: "MAX_PAGES runaway backstop", re: /const\s+ORDERS_MAX_PAGES\s*=\s*\d+/ },
];

const FORBIDDEN = [
  { label: "COS-038 capped list constant removed", re: /ORDERS_INITIAL_LIMIT/ },
  { label: "no capped .limit(ORDERS_INITIAL_LIMIT) list read", re: /\.limit\(\s*ORDERS_INITIAL_LIMIT\s*\)/ },
  // THE regression this task removed: a timer that re-walked the whole table
  // every 30 seconds and restarted the list's loading state under the operator.
  { label: "no polling loop reloads the order data", re: /setInterval\([\s\S]{0,240}?loadOrderData/ },
  { label: "no 30-second refresh cadence", re: /\}\s*,\s*30000\s*\)/ },
  // Client-side slice pagination is gone; "more" is a fact about the server.
  { label: "no client slice pagination counter", re: /setVisibleCount|visibleCount\s*\)/ },
  // The old export ceiling: 10k rows, no predicates, filtered in the browser.
  { label: "no fixed 10k export ceiling", re: /\.range\(0,\s*9999\)/ },
];

function findUnboundedListReads(src) {
  const offenders = [];
  const needle = ".select(ORDERS_LIST_COLUMNS)";
  let idx = src.indexOf(needle);
  while (idx !== -1) {
    const end = src.indexOf(";", idx);
    // Look BACK as well as forward: the row/export reads wrap the projection in
    // applyListPredicates(...) on one statement and .range() it on the next, so
    // the wrapper sits BEFORE the needle. Those two sites have their own
    // explicit .range() anchors in REQUIRED, which is what actually bounds them.
    const stmt = src.slice(Math.max(0, idx - 220), end === -1 ? idx + 400 : end);
    const bounded = /\.range\(|\.eq\(|\.ilike\(|\.maybeSingle\(|applyListPredicates\(/.test(stmt);
    if (!bounded) offenders.push(stmt.replace(/\s+/g, " ").slice(0, 120));
    idx = src.indexOf(needle, idx + needle.length);
  }
  return offenders;
}

function runStatic() {
  let src;
  try {
    src = readFileSync(PAGE, "utf8");
  } catch (e) {
    console.error(`${RED}✗ cannot read ${PAGE}: ${e.message}${RESET}`);
    return 1;
  }

  // Strip comments and string literals before the FORBIDDEN scan. A guard that
  // reads raw source cannot tell code from the comment explaining why the code
  // was deleted — and would fail the moment someone documents the regression.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");

  const failures = [];

  for (const { label, re } of REQUIRED) {
    if (!re.test(src)) failures.push(`REQUIRED missing: ${label}  [${re}]`);
  }
  for (const { label, re } of FORBIDDEN) {
    if (re.test(codeOnly)) failures.push(`FORBIDDEN present: ${label}  [${re}]`);
  }
  const unbounded = findUnboundedListReads(codeOnly);
  if (unbounded.length) {
    for (const u of unbounded) failures.push(`UNBOUNDED orders list read: …${u}…`);
  }

  if (failures.length) {
    console.error(`${RED}✗ admin-orders dataset-stability guard FAILED${RESET}`);
    for (const f of failures) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(`${GREEN}✓ admin-orders dataset-stability guard passed${RESET} (${REQUIRED.length} invariants, ${FORBIDDEN.length + 1} negative controls)`);
  return 0;
}

// ── LOGIC SIMULATION (mirrors page.tsx loadOrderData core) ────────────────────
// Pure replica of the snapshot assembler: dedupe by id across pages, sort once
// newest-first with an id tiebreak.
function assembleSnapshot(pages) {
  const acc = [];
  const seen = new Set();
  for (const chunk of pages) {
    for (const o of chunk) {
      if (o && o.id && !seen.has(o.id)) { seen.add(o.id); acc.push(o); }
    }
  }
  return acc.slice().sort((a, b) => {
    const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (tA === tB) return (b.id ?? "").localeCompare(a.id ?? "");
    return tB - tA;
  });
}

// Replica of the monotonic-cycle guard. A "committed" value only lands if the
// cycle that produced it is still the latest one.
function makeCoordinator() {
  let seqCounter = 0;
  let latest = 0;
  let committed = null; // { rows, ready }
  return {
    startCycle() {
      const seq = ++seqCounter;
      latest = seq;
      const isLatest = () => seq === latest;
      return {
        // commit a COMPLETE snapshot (only if still latest)
        commit(rows) { if (isLatest()) committed = { rows, ready: true }; },
        // a stale/background page trying to write partial rows
        writePartial(rows) { if (isLatest()) committed = { rows, ready: false }; },
        isLatest,
      };
    },
    get() { return committed; },
  };
}

function runSelfTest() {
  const results = [];
  const ok = (name, cond) => results.push({ name, pass: !!cond });

  // 1. Dedupe by id across overlapping pages.
  const snap1 = assembleSnapshot([
    [{ id: "a", created_at: "2026-07-01" }, { id: "b", created_at: "2026-07-03" }],
    [{ id: "b", created_at: "2026-07-03" }, { id: "c", created_at: "2026-07-02" }], // b duplicated
  ]);
  ok("dedupe drops duplicate order id", snap1.length === 3);
  ok("dedupe keeps every unique id", new Set(snap1.map((o) => o.id)).size === 3);

  // 2. Sort newest-first.
  ok("sorted newest-first", snap1.map((o) => o.id).join(",") === "b,c,a");

  // 3. Id tiebreak when timestamps equal.
  const snap2 = assembleSnapshot([[
    { id: "x1", created_at: "2026-07-05" },
    { id: "x9", created_at: "2026-07-05" },
  ]]);
  ok("id tiebreak on equal timestamps (desc)", snap2.map((o) => o.id).join(",") === "x9,x1");

  // 4. Empty + malformed rows don't crash and are skipped.
  const snap3 = assembleSnapshot([[null, undefined, { id: "", created_at: "x" }, { id: "z", created_at: "2026-07-04" }]]);
  ok("malformed/empty rows skipped", snap3.length === 1 && snap3[0].id === "z");

  // 5. NEGATIVE CONTROL — the guard must FAIL if dedupe is removed.
  const brokenAssemble = (pages) => pages.flat().filter(Boolean); // no dedupe
  const brokenSnap = brokenAssemble([[{ id: "b" }], [{ id: "b" }]]);
  ok("negative control: no-dedupe assembler DOES duplicate (guard would catch)", brokenSnap.length === 2);

  // 6. Monotonic guard — a superseded (stale) cycle cannot overwrite newer state.
  const coord = makeCoordinator();
  const cycleA = coord.startCycle();      // seq 1 (older)
  const cycleB = coord.startCycle();      // seq 2 (newer) supersedes A
  cycleB.commit([{ id: "new1" }, { id: "new2" }]);        // newer completes first
  cycleA.commit([{ id: "old1" }]);                         // stale — must be ignored
  ok("stale cycle commit ignored", coord.get() && coord.get().rows.length === 2 && coord.get().rows[0].id === "new1");

  // 7. Completed snapshot not replaced by a stale background partial page.
  const coord2 = makeCoordinator();
  const cyc1 = coord2.startCycle();
  cyc1.commit(Array.from({ length: 1500 }, (_, i) => ({ id: `o${i}` }))); // full 1500 snapshot
  coord2.startCycle();                    // a NEW cycle starts (seq bumped)
  cyc1.writePartial([{ id: "p1" }]);      // the OLD cycle's leftover page tries to write 1 row
  ok("completed 1500-row snapshot survives stale partial write", coord2.get().rows.length === 1500 && coord2.get().ready === true);

  // 8. Latest cycle's complete snapshot wins and marks ready.
  const coord3 = makeCoordinator();
  const c = coord3.startCycle();
  c.writePartial([{ id: "page1only" }]);  // first-load fast page-1 paint (not ready)
  ok("page-1 fast paint is marked NOT ready", coord3.get().ready === false);
  c.commit([{ id: "page1only" }, { id: "page2" }]); // full snapshot commits
  ok("full snapshot commit marks ready", coord3.get().ready === true && coord3.get().rows.length === 2);

  // ── STATIC NEGATIVE CONTROLS ────────────────────────────────────────────
  //
  // ADMIN-ORDERS-SERVER-BACKED-LOADING-001. The static contract above only
  // proves something if it FAILS on a real regression. Each control below
  // plants one specific defect into the actual page source and asserts the
  // guard rejects it. A control that stops applying (because the code it edits
  // moved) reports NO-OP rather than passing silently — that is the failure
  // mode these controls exist to avoid.
  let pageSrc = "";
  try { pageSrc = readFileSync(PAGE, "utf8"); } catch { pageSrc = ""; }

  const controls = [
    ["polling loop reintroduced", (s) => s.replace(
      "  // ── The whole-table snapshot loads ON DEMAND ──",
      "  useEffect(() => { const i = setInterval(() => { loadOrderData(); }, 30000); return () => clearInterval(i); }, [loadOrderData]);\n  // ── The whole-table snapshot loads ON DEMAND ──")],
    ["page window unbounded (range removed)", (s) => s.replace(
      ".range(from, from + ORDERS_PAGE_SIZE - 1);", ";")],
    ["unique id tie-breaker dropped from the ordering", (s) => s.replace(
      '.order("id", { ascending: asc })', ".limit(ORDERS_PAGE_SIZE)")],
    ["load-more stops discarding pages from a stale query", (s) => s.replace(
      "if (keyAtRequest !== listQueryKeyRef.current) return;", "")],
    ["load-more stops deduping by order id", (s) => s.replace(
      "rows.filter((r) => r && r.id && !seen.has(r.id))", "rows")],
    ["default scope applied unconditionally", (s) => s.replace(
      "isDefaultScopeEligible(listFilters, statusFilter)", "true")],
    ["export silently inherits the 60-day window", (s) => s.replace(
      "{ defaultScopeCutoff: null }", "{ defaultScopeCutoff: defaultScopeCutoff }")],
    ["mutations stop reaching the visible rows", (s) => s.replace(
      "    setOrders(fn);\n    setOrderRows(fn);\n    setOrderFacts(fn);", "    setOrders(fn);")],
    ["whole-table snapshot loaded unconditionally again", (s) => s.replace(
      "if (!snapshotRequestedRef.current) {", "if (false) {")],
    ["deep-linked order abandoned instead of read", (s) => s.replace(
      '.select(ORDERS_LIST_COLUMNS)\n        .eq("id", orderId)', ".select(ORDERS_LIST_COLUMNS)\n        .limit(1)")],
    ["search reaches the server undebounced", (s) => s.replace(
      "setDebouncedSearch(search.trim())", "setDebouncedSearch(search)")],
  ];

  for (const [name, mutate] of controls) {
    const mutated = mutate(pageSrc);
    if (mutated === pageSrc) {
      results.push({ name: `NEGATIVE CONTROL (no-op — anchor moved): ${name}`, pass: false });
      continue;
    }
    const stillPasses =
      REQUIRED.every(({ re }) => re.test(mutated)) &&
      !FORBIDDEN.some(({ re }) => re.test(
        mutated
          .replace(/\/\*[\s\S]*?\*\//g, " ")
          .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
          .replace(/"(?:[^"\\]|\\.)*"/g, '""')
          .replace(/'(?:[^'\\]|\\.)*'/g, "''"),
      ));
    results.push({ name: `negative control caught: ${name}`, pass: !stillPasses });
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`  ${r.pass ? GREEN + "✓" : RED + "✗"}${RESET} ${r.name}`);
  }
  if (failed.length) {
    console.error(`${RED}✗ self-test FAILED (${failed.length}/${results.length})${RESET}`);
    return 1;
  }
  console.log(`${GREEN}✓ self-test passed (${results.length}/${results.length})${RESET}`);
  return 0;
}

// ── main ──────────────────────────────────────────────────────────────────────
const selfTest = process.argv.includes("--self-test");
let code = 0;
if (selfTest) {
  console.log(`${YELLOW}admin-orders dataset-stability — self-test (logic + negative controls)${RESET}`);
  code = runSelfTest();
} else {
  code = runStatic();
}
process.exit(code);
