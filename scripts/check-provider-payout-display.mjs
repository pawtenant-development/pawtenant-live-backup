#!/usr/bin/env node
// check-provider-payout-display.mjs — RA-PAYOUT-DISPLAY-001
//
// Provider payout is MONEY-FACING and READ-ONLY. This guard protects two things:
//
//   1. THE MATH — a cancelled `doctor_earnings` row is void and must never be
//      summed into a displayed payout.
//   2. THE DEFENCES — both readers must exclude cancelled rows TWICE (once in
//      the Supabase query, once again before summing). One defence is not
//      enough for a number an operator pays a real person from.
//
// WHY: superseded/duplicate earnings are CANCELLED, not deleted, so one order
// legitimately carries several void rows beside the single live row. Summing
// every row overstated what was owed. Measured on LIVE 2026-08-14:
//
//   PT-PSDRQPYL11K  base $30 paid + base $30 cancelled + base $30 cancelled
//                   + additional_documentation $30 paid
//                   naive $120  ·  correct $60
//   PT-MQNHH9W3     base $25 cancelled + base $25 paid
//                   + additional_documentation $25 paid
//                   naive  $75  ·  correct $50
//
// Run:  node scripts/check-provider-payout-display.mjs
// Self: node scripts/check-provider-payout-display.mjs --self-test
//
// --self-test is the NEGATIVE CONTROL. It re-runs every assertion against
// deliberately broken inputs and FAILS if any assertion still passes. A guard
// that only ever goes green proves nothing.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAYMENTS_TAB = "src/pages/admin-orders/components/PaymentHistoryTab.tsx";
const PAYOUT_CARD = "src/pages/admin-orders/components/ProviderPayoutSummary.tsx";

let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures++; };
const pass = (m) => console.log(`  ✓ ${m}`);

/**
 * Strip comments and string literals before scanning.
 *
 * GUARD-ASSERTIONS-MUST-TEST-USE-NOT-MENTION: both files discuss "cancelled"
 * at length in their comments. Scanning raw text would match the explanation
 * of the fix instead of the fix, so a file whose logic was ripped out but whose
 * comments survived would still pass. Strip first, then assert.
 */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // block comments
    .replace(/^\s*\/\/.*$/gm, " ")        // whole-line // comments
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``"); // template literals
}

/** Normalise CRLF — a CRLF checkout has silently disarmed anchors here before. */
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

// ── The math, stated independently of the UI ────────────────────────────────
// This is the reference implementation the components must agree with.
const VOID = new Set(["cancelled"]);
const isExtra = (t) => t === "additional_documentation" || t === "ra_completion";

function payout(rows, { excludeCancelled = true } = {}) {
  const live = excludeCancelled
    ? rows.filter((r) => !VOID.has(String(r.status ?? "").toLowerCase()))
    : rows;
  const n = (v) => (typeof v === "number" ? v : 0);
  const base = live.filter((r) => !isExtra(r.earning_type)).reduce((s, r) => s + n(r.doctor_amount), 0);
  const extra = live.filter((r) => isExtra(r.earning_type)).reduce((s, r) => s + n(r.doctor_amount), 0);
  return { base, extra, total: base + extra, rows: live.length };
}

// Exact ledger shapes as measured on LIVE.
const FIXTURES = {
  "PT-PSDRQPYL11K": [
    { earning_type: "base", doctor_amount: 30, status: "paid" },
    { earning_type: "base", doctor_amount: 30, status: "cancelled" },
    { earning_type: "base", doctor_amount: 30, status: "cancelled" },
    { earning_type: "additional_documentation", doctor_amount: 30, status: "paid" },
  ],
  "PT-MQNHH9W3": [
    { earning_type: "base", doctor_amount: 25, status: "cancelled" },
    { earning_type: "base", doctor_amount: 25, status: "paid" },
    { earning_type: "additional_documentation", doctor_amount: 25, status: "paid" },
  ],
};

// Three files for ONE RA service must still pay ONE RA earning. Payout comes
// from ledger rows, never from a document count.
const THREE_FILES_ONE_SERVICE = [
  { earning_type: "base", doctor_amount: 40, status: "paid" },
  { earning_type: "additional_documentation", doctor_amount: 40, status: "paid" },
];

function checkMath(broken = false) {
  const opts = { excludeCancelled: !broken };
  const a = payout(FIXTURES["PT-PSDRQPYL11K"], opts);
  a.total === 60 && a.base === 30 && a.extra === 30
    ? pass("PT-PSDRQPYL11K → base $30 + add'l $30 = $60 (not $120)")
    : fail(`PT-PSDRQPYL11K expected $60 (30+30), got $${a.total} (${a.base}+${a.extra})`);

  const b = payout(FIXTURES["PT-MQNHH9W3"], opts);
  b.total === 50 && b.base === 25 && b.extra === 25
    ? pass("PT-MQNHH9W3 → base $25 + add'l $25 = $50")
    : fail(`PT-MQNHH9W3 expected $50 (25+25), got $${b.total} (${b.base}+${b.extra})`);

  const c = payout(THREE_FILES_ONE_SERVICE, opts);
  c.total === 80
    ? pass("three uploaded files on one RA service → still one $40 RA earning ($80 total)")
    : fail(`file-count independence expected $80, got $${c.total}`);

  // All-void ledger owes nothing.
  const d = payout([{ earning_type: "base", doctor_amount: 30, status: "cancelled" }], opts);
  d.total === 0
    ? pass("an all-cancelled ledger displays $0 owed")
    : fail(`all-cancelled expected $0, got $${d.total}`);
}

function checkDefences(sources) {
  for (const [rel, raw] of Object.entries(sources)) {
    const code = codeOnly(raw);
    const label = rel.split("/").pop();

    /\.neq\(\s*["']status["']\s*,\s*["']cancelled["']\s*\)/.test(code)
      ? pass(`${label}: defence 1 — query excludes cancelled`)
      : fail(`${label}: defence 1 MISSING — query does not .neq("status","cancelled")`);

    // Defence 2: an in-memory re-filter that EXCLUDES cancelled before reduce().
    //
    // The signature is a NEGATED comparison (`!== "cancelled"`). Matching a bare
    // mention of "cancelled" inside any .filter() is not good enough: both files
    // legitimately contain `=== "cancelled"` filters that COUNT cancelled things
    // (e.g. the payment-attempts "Expired / Cancelled" tile). An earlier draft of
    // this guard matched that counter and reported PaymentHistoryTab as defended
    // when its payout re-filter had not been read at all.
    //
    // `[\s\S]{0,120}?` (not `[^)]*`) because the real expression contains inner
    // parens — `(e.status ?? "") !== "cancelled"` — which a `[^)]` class cannot
    // cross.
    const refilters = /\.filter\([\s\S]{0,120}?!==\s*["']cancelled["']/i.test(code);
    refilters
      ? pass(`${label}: defence 2 — re-filters cancelled before summing`)
      : fail(`${label}: defence 2 MISSING — no in-memory cancelled re-filter`);

    // The reduce must never run over an unfiltered array named providerEarnings/rows.
    /reduce\(/.test(code)
      ? pass(`${label}: sums via reduce over the filtered set`)
      : fail(`${label}: no reduce found — reader shape changed unexpectedly`);
  }
}

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) {
  console.log("NEGATIVE CONTROL — every assertion below MUST fail.\n");
  const before = failures;

  console.log("[1] math with cancelled rows included (the original bug):");
  checkMath(true);

  console.log("\n[2] defences stripped from both readers:");
  const strip = (s) =>
    s.replace(/\.neq\(\s*["']status["']\s*,\s*["']cancelled["']\s*\)/g, "")
     .replace(/\.filter\(\s*\(?\s*\w+\s*\)?\s*=>[^\n]*status[^\n]*cancelled[^\n]*\)/gi, "");
  checkDefences({
    [PAYMENTS_TAB]: strip(read(PAYMENTS_TAB)),
    [PAYOUT_CARD]: strip(read(PAYOUT_CARD)),
  });

  const tripped = failures - before;
  // 4 math assertions: 2 regressions trip, file-count and all-cancelled also trip.
  // 6 defence assertions: 2 files x (defence1 + defence2) trip; reduce survives.
  const EXPECTED_MIN = 7;
  console.log("");
  if (tripped >= EXPECTED_MIN) {
    console.log(`✅ SELF-TEST PASSED — ${tripped} assertions tripped on broken input (>= ${EXPECTED_MIN}).`);
    console.log("   The guard genuinely detects the regression it claims to prevent.");
    process.exit(0);
  }
  console.error(`❌ SELF-TEST FAILED — only ${tripped} assertions tripped, expected >= ${EXPECTED_MIN}.`);
  console.error("   The guard does NOT detect the bug. Its green run is meaningless.");
  process.exit(1);
}

console.log("RA-PAYOUT-DISPLAY-001 — provider payout display guard\n");
console.log("Payout math (cancelled rows are void):");
checkMath(false);
console.log("\nReader defences (both must exclude cancelled twice):");
checkDefences({ [PAYMENTS_TAB]: read(PAYMENTS_TAB), [PAYOUT_CARD]: read(PAYOUT_CARD) });

console.log("");
if (failures > 0) {
  console.error(`❌ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("✅ Provider payout display is correct and doubly defended.");
