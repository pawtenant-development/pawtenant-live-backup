#!/usr/bin/env node
// MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001 — Monthly Books paid-media guard.
//
// Locks the defect this task fixed: the Monthly Books Summary computed
//   operatingNet = businessNet − expenses − salary
// with NO paid-media term, while the detailed Estimated P&L deducted Google/Meta
// spend. For LIVE July 2026 that overstated Operating Net by exactly $9,909.17
// ($14,360.56 shown vs $4,451.38 true).
//
// Two layers:
//   1. LOGIC — imports the REAL computeOperatingNet from src/lib/accountsBooks.ts
//      via jiti and runs an arithmetic battery, including the authoritative LIVE
//      July 2026 reconciliation. No mirrored formula to drift.
//   2. STATIC — asserts the wiring that makes the formula correct in practice:
//      ad spend is sourced from the SYNCED marketing source (not company_expenses,
//      so it is deducted exactly once), legacy snapshots are read non-destructively,
//      an unavailable source is never presented as $0, and the drift detector and
//      snapshot writer both carry the new field.
//
// Usage:
//   node scripts/check-monthly-books-paid-media.mjs             # guard source
//   node scripts/check-monthly-books-paid-media.mjs --self-test # prove the battery has power

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
// The canonical formula lives in the PURE financial-flow module (no Supabase
// client import), so the guard can import and exercise the real implementation.
const F_LIB = join(ROOT, "src", "lib", "accountsFinancialFlow.ts");
const F_BOOKS = join(ROOT, "src", "lib", "accountsBooks.ts");
const F_SUM = join(ROOT, "src", "pages", "admin-orders", "components", "MonthlyBooksSummary.tsx");

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";
const jiti = createJiti(import.meta.url);

// Line endings are normalized before every match: the repo runs with
// autocrlf=true, and a guard that matches raw bytes silently passes on CRLF.
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const near = (a, b, eps = 0.005) => Math.abs(a - b) <= eps;

// ── LOGIC ────────────────────────────────────────────────────────────────────
function runLogic(mod) {
  const f = [];
  const ok = (cond, msg) => { if (!cond) f.push(msg); };
  const compute = mod.computeOperatingNet;

  if (typeof compute !== "function") {
    f.push("accountsFinancialFlow.ts must export computeOperatingNet — the single canonical Operating Net formula");
    return f;
  }

  // A. Authoritative LIVE July 2026 reconciliation.
  //    Business Net 15,669.32; company expenses 870.75 (manual marketing 608.93 +
  //    other 261.82); salary 438.02; Google Ads 9,909.17 (PKR 2,774,568.48 @ 280);
  //    Meta 0. The detailed Estimated P&L reported Operating Net 4,451.39.
  const july = compute({ businessNet: 15669.32, expenses: 870.75, salary: 438.02, adSpend: 9909.17 });
  ok(near(july, 4451.38, 0.02),
    `LIVE July 2026 must reconcile to the detailed P&L Operating Net (~4451.38/4451.39), got ${july.toFixed(2)}`);

  // B. The exact defect: omitting paid media must NOT reproduce the old figure.
  const withoutAds = compute({ businessNet: 15669.32, expenses: 870.75, salary: 438.02, adSpend: 0 });
  ok(near(withoutAds, 14360.55, 0.02),
    `sanity: with adSpend=0 the formula must reproduce the old overstated figure (~14360.55), got ${withoutAds.toFixed(2)}`);
  ok(near(withoutAds - july, 9909.17, 0.02),
    `the paid-media term must be worth exactly the Google Ads figure (9909.17), got ${(withoutAds - july).toFixed(2)}`);

  // C. Paid media must actually be subtracted, and subtracted only once.
  const base = { businessNet: 1000, expenses: 100, salary: 50, adSpend: 0 };
  ok(compute(base) === 850, `base case must be 850, got ${compute(base)}`);
  ok(compute({ ...base, adSpend: 200 }) === 650,
    `adSpend must be deducted once: expected 650, got ${compute({ ...base, adSpend: 200 })}`);
  ok(compute({ ...base, adSpend: 100 }) - compute({ ...base, adSpend: 200 }) === 100,
    "Operating Net must move 1:1 with ad spend (deducted exactly once, not twice)");

  // D. A loss must be reportable as a loss — never clamped to zero. Ad spend
  //    routinely exceeds contribution in a bad month and the owner must see it.
  const loss = compute({ businessNet: 100, expenses: 0, salary: 0, adSpend: 5000 });
  ok(loss === -4900, `a loss must be reported honestly: expected -4900, got ${loss}`);
  ok(loss < 0, "Operating Net must be allowed to go negative");

  // E. Numeric safety — no NaN/Infinity leaking into a financial display.
  for (const bad of [NaN, Infinity, -Infinity, undefined, null]) {
    const r = compute({ businessNet: 1000, expenses: 100, salary: 50, adSpend: bad });
    ok(isFinite(r), `adSpend=${String(bad)} must degrade to a finite number, got ${r}`);
    ok(r === 850, `adSpend=${String(bad)} must deduct 0, not corrupt the total; got ${r}`);
  }

  return f;
}

// ── STATIC ───────────────────────────────────────────────────────────────────
function runStatic() {
  const f = [];
  const lib = read(F_LIB);
  const books = read(F_BOOKS);
  const sum = read(F_SUM);
  const need = (src, name, re, why) => { if (!re.test(src)) f.push(`${name}: ${why}`); };
  const forbid = (src, name, re, why) => { if (re.test(src)) f.push(`${name}: ${why}`); };

  // The component must USE the canonical formula, not re-derive it inline.
  need(sum, "MonthlyBooksSummary", /computeOperatingNet\(/,
    "Operating Net must come from the canonical computeOperatingNet, not an inline expression");
  forbid(sum, "MonthlyBooksSummary", /operatingNet:\s*[\w.]*businessNet\s*-\s*expenses\s*-\s*salaryUsd\s*(?![\s\S]{0,40}adSpend)/,
    "the old paid-media-free inline formula must not return");

  // Paid media must come from the SYNCED source the detailed P&L uses.
  need(sum, "MonthlyBooksSummary", /fetchMarketingSpendSummary\(/,
    "ad spend must be read from the synced marketing source (same source as the detailed Estimated P&L)");

  // No double count: ad spend must never be written into the manual expense
  // ledger. Comments are stripped first so the guard reacts to CODE, not to the
  // prose that (correctly) explains why this must not happen.
  const sumCode = sum.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  forbid(sumCode, "MonthlyBooksSummary", /addExpense\(|from\(["']company_expenses["']\)/,
    "ad spend must never be written into company_expenses — that would double count it");

  // The field must be carried through drift detection and the snapshot writer,
  // otherwise a closed month silently keeps a paid-media-free Operating Net.
  need(sum, "MonthlyBooksSummary", /keys:\s*\(keyof BooksFigures\)\[\][^;]*"adSpend"/,
    "adSpend must participate in snapshot drift detection");
  need(sum, "MonthlyBooksSummary", /adSpend:\s*f\.adSpend/,
    "buildSnapshot must persist adSpend so closed months store the paid-media basis");
  need(books, "accountsBooks.ts", /adSpend\?:\s*number/,
    "BooksSnapshot must carry an optional adSpend (optional = legacy snapshots predate it)");

  // Legacy closed snapshots must be displayed as stored, never silently restated.
  need(sum, "MonthlyBooksSummary", /s\.adSpend\s*\?\?\s*0/,
    "legacy snapshots without adSpend must read as 0 so stored figures are shown exactly as closed");
  need(sum, "MonthlyBooksSummary", /adSpendComplete:\s*s\.adSpend\s*!=\s*null/,
    "a snapshot predating paid-media accounting must be flagged, not presented as complete");

  // Missing data must never masquerade as $0 spend.
  need(sum, "MonthlyBooksSummary", /adSpendComplete/,
    "an unavailable/partial paid-media source must be distinguishable from a genuine $0 month");
  need(sum, "MonthlyBooksSummary", /isMetaConnected\(/,
    "Meta connectivity must be checked so an unconnected Meta is not reported as $0 spend");
  need(sum, "MonthlyBooksSummary", /upper bound|not connected|not included/i,
    "the incomplete-spend case must carry an explicit caveat");

  // The user-facing formula note must state the paid-media term.
  need(sum, "MonthlyBooksSummary", /Operating Net = Business Net[^<]*paid media/i,
    "the footnote must document that Operating Net deducts paid media");
  need(sum, "MonthlyBooksSummary", /deducted exactly once/i,
    "the footnote must state the no-double-count basis");

  // The canonical contract notes must survive in the pure library.
  need(lib, "accountsFinancialFlow.ts", /ONE FORMULA for Operating Net/i,
    "the single-formula contract note must remain");
  need(lib, "accountsFinancialFlow.ts", /never written into\s*\n?\s*\*?\s*company_expenses/i,
    "the no-double-count note must remain");
  need(lib, "accountsFinancialFlow.ts", /never clamped/i,
    "the honest-loss note must remain");
  // Operating Net must not be reimplemented in a second place.
  forbid(books, "accountsBooks.ts", /export function computeOperatingNet/,
    "Operating Net must have exactly one implementation (accountsFinancialFlow.ts)");

  return f;
}

async function main() {
  const selfTest = process.argv.includes("--self-test");
  const mod = await jiti.import(F_LIB);

  if (selfTest) {
    // Prove the battery has power: plant the exact defect this task fixed
    // (drop the paid-media term) and expect the battery to catch it.
    const sabotaged = {
      ...mod,
      computeOperatingNet: (i) => i.businessNet - i.expenses - i.salary, // the original bug
    };
    const found = runLogic(sabotaged);
    if (found.length === 0) {
      console.error(`${RED}✗ SELF-TEST FAILED: the paid-media-free formula passed the battery${RESET}`);
      process.exit(1);
    }
    // And a clamped-loss variant, which would hide a negative month.
    const clamped = {
      ...mod,
      computeOperatingNet: (i) => Math.max(0, mod.computeOperatingNet(i)),
    };
    const found2 = runLogic(clamped);
    if (found2.length === 0) {
      console.error(`${RED}✗ SELF-TEST FAILED: a loss-clamping formula passed the battery${RESET}`);
      process.exit(1);
    }
    console.log(`${GREEN}✓ self-test: battery detected ${found.length} + ${found2.length} planted defect(s)${RESET}`);
  }

  const failures = [...runLogic(mod), ...runStatic()];
  if (failures.length > 0) {
    console.error(`${RED}✗ check-monthly-books-paid-media: ${failures.length} failure(s)${RESET}`);
    for (const x of failures) console.error(`  ${YELLOW}- ${x}${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ check-monthly-books-paid-media: Operating Net deducts paid media exactly once${RESET}`);
}

main().catch((e) => {
  console.error(`${RED}✗ check-monthly-books-paid-media crashed: ${e?.message ?? e}${RESET}`);
  process.exit(1);
});
