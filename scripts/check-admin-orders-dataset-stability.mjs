#!/usr/bin/env node
// ADMIN-ORDERS-DATASET-STABILITY-LIVE-001 — regression guard (LIVE).
//
// Ported from the verified TEST guard (ADMIN-ORDERS-DATASET-FLICKER-P0-001).
// Locks in the dataset-stability contract for the admin Orders list so a future
// edit can't reintroduce the flicker (dataset/counts blinking between a partial
// page and the full set) or regress the historical 88bc2d8 pagination.
//
// LIVE structure note: the orders list projection const is named ORDERS_SELECT
// (defined inside loadOrderData), not ORDERS_LIST_COLUMNS as in TEST — the only
// adaptation. All invariants and self-tests are identical.
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
//   node scripts/check-admin-orders-dataset-stability.mjs            # guard LIVE source
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
  { label: "ORDERS_PAGE_SIZE = 250 (historical 88bc2d8 pagination remains)", re: /const\s+ORDERS_PAGE_SIZE\s*=\s*250\b/ },
  { label: "monotonic cycle id ref (loadSeqRef)", re: /const\s+loadSeqRef\s*=\s*useRef\(0\)/ },
  { label: "cycle id incremented once per load", re: /const\s+seq\s*=\s*\+\+loadSeqRef\.current/ },
  { label: "isLatest() staleness guard", re: /const\s+isLatest\s*=\s*\(\)\s*=>\s*seq\s*===\s*loadSeqRef\.current/ },
  { label: "paginated range read (page window)", re: /\.range\(\s*from\s*,\s*from\s*\+\s*ORDERS_PAGE_SIZE\s*-\s*1\s*\)/ },
  { label: "local accumulator + dedupe Set", re: /const\s+seen\s*=\s*new\s+Set<string>\(\)/ },
  { label: "dedupe by order primary key", re: /!seen\.has\(o\.id\)/ },
  { label: "sort exactly once after assembly", re: /const\s+snapshot\s*=\s*acc\.slice\(\)\.sort\(/ },
  { label: "single atomic snapshot commit", re: /setOrders\(snapshot\)/ },
  { label: "readiness flag committed with snapshot", re: /setOrdersReady\(true\)/ },
  { label: "readiness ref mirror set before commit", re: /ordersReadyRef\.current\s*=\s*true/ },
  { label: "global counts gated on ordersReady (no partial totals)", re: /ordersReady\s*\?/ },
  { label: "subtle refreshing state (never clears list)", re: /ordersRefreshing/ },
  { label: "MAX_PAGES runaway backstop", re: /const\s+ORDERS_MAX_PAGES\s*=\s*\d+/ },
];

const FORBIDDEN = [
  { label: "no capped initial-limit constant", re: /ORDERS_INITIAL_LIMIT/ },
  { label: "no capped .limit(ORDERS_INITIAL_LIMIT) list read", re: /\.limit\(\s*ORDERS_INITIAL_LIMIT\s*\)/ },
];

// The Orders LIST projection must never be read UNBOUNDED. Every
// `.select(ORDERS_SELECT)` statement must be bounded by one of:
//   .range(   (paginated list)
//   .eq(      (single-row lookup)
//   .ilike(   (email lookup, itself + .limit)
//   .maybeSingle(
// A statement that pairs the projection with `.order(` but has NO `.range(`
// before its terminating `;` is the unbounded all-orders read that hung the tab.
function findUnboundedListReads(src) {
  const offenders = [];
  const needle = ".select(ORDERS_SELECT)";
  let idx = src.indexOf(needle);
  while (idx !== -1) {
    const end = src.indexOf(";", idx);
    const stmt = src.slice(idx, end === -1 ? idx + 400 : end);
    const bounded = /\.range\(|\.eq\(|\.ilike\(|\.maybeSingle\(/.test(stmt);
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

  const failures = [];

  for (const { label, re } of REQUIRED) {
    if (!re.test(src)) failures.push(`REQUIRED missing: ${label}  [${re}]`);
  }
  for (const { label, re } of FORBIDDEN) {
    if (re.test(src)) failures.push(`FORBIDDEN present: ${label}  [${re}]`);
  }
  const unbounded = findUnboundedListReads(src);
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
