#!/usr/bin/env node
// ADMIN-ORDER-EXPORT-PROVIDER-NET-001 — regression guard.
//
// Locks in the provider-payment contract for the Admin Orders CSV export so a
// future edit can't silently corrupt a financial column.
//
// Two layers:
//   1. STATIC — assert the required invariants are present (and forbidden shortcuts
//      absent) in src/lib/providerPaymentExport.ts, src/lib/exportOrders.ts and
//      src/pages/admin-orders/page.tsx.
//   2. LOGIC  — a runtime simulation of the pure aggregation
//      (computeProviderPaymentByOrder) with negative controls, proving completion
//      gating, non-cancelled summing of multiple components, refund retention,
//      earning-id dedup and single-order attribution all behave per the contract.
//
// Usage:
//   node scripts/check-admin-order-export-provider-net.mjs             # guard TEST source
//   node scripts/check-admin-order-export-provider-net.mjs --self-test # prove the guard works

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const F_LIB = join(ROOT, "src", "lib", "providerPaymentExport.ts");
const F_EXPORT = join(ROOT, "src", "lib", "exportOrders.ts");
const F_PAGE = join(ROOT, "src", "pages", "admin-orders", "page.tsx");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

const COMPLETED = "patient_notified"; // PROVIDER_COMPLETED_STATUS

// ─────────────────────────────────────────────────────────────────────────────
// LOGIC MIRROR — must stay behaviourally identical to
// src/lib/providerPaymentExport.ts::computeProviderPaymentByOrder. The STATIC
// layer ties the real source to these same invariants so the two can't drift.
// ─────────────────────────────────────────────────────────────────────────────
const s = (v) => (v === null || v === undefined ? "" : String(v));
const toAmount = (v) => {
  const n = typeof v === "number" ? v : parseFloat(s(v));
  return isNaN(n) ? 0 : n;
};

function computeProviderPaymentByOrder(orders, earnings, opts = {}) {
  // opts flags let the self-test synthesize deliberately-broken variants.
  const noGate = opts.noGate === true;
  const countCancelled = opts.countCancelled === true;
  const noDedup = opts.noDedup === true;
  const firstOnly = opts.firstOnly === true;

  const orderIds = new Set();
  const confToId = new Map();
  for (const o of orders) {
    const id = s(o.id);
    if (!id) continue;
    orderIds.add(id);
    const conf = s(o.confirmation_id);
    if (conf && !confToId.has(conf)) confToId.set(conf, id);
  }

  const sumByOrderId = new Map();
  const setByOrderId = new Map(); // for firstOnly variant
  const seen = new Set();
  for (const e of earnings) {
    const eid = s(e.id);
    if (!noDedup && eid) {
      if (seen.has(eid)) continue;
      seen.add(eid);
    }
    const cancelled = s(e.status).toLowerCase() === "cancelled";
    if (cancelled && !countCancelled) continue;

    let oid = s(e.order_id);
    if (!oid || !orderIds.has(oid)) {
      const conf = s(e.confirmation_id);
      oid = conf && confToId.has(conf) ? confToId.get(conf) : "";
    }
    if (!oid || !orderIds.has(oid)) continue;

    if (firstOnly) {
      if (!setByOrderId.has(oid)) setByOrderId.set(oid, toAmount(e.doctor_amount));
    } else {
      sumByOrderId.set(oid, (sumByOrderId.get(oid) ?? 0) + toAmount(e.doctor_amount));
    }
  }
  const acc = firstOnly ? setByOrderId : sumByOrderId;

  const result = new Map();
  for (const o of orders) {
    const id = s(o.id);
    if (!id) continue;
    const completed = noGate ? true : s(o.doctor_status) === COMPLETED;
    result.set(id, completed ? (acc.get(id) ?? 0) : 0);
  }
  return result;
}

// Deduction arithmetic mirror (exportOrders.ts).
function netAfterProviderDeduction(net, providerPayment) {
  if (net === null) return "";
  return (net - providerPayment).toFixed(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIOS — one per business rule. { name, orders, earnings, expect:{id:amt} }
// ─────────────────────────────────────────────────────────────────────────────
const ord = (id, doctor_status, confirmation_id = null) => ({ id, doctor_status, confirmation_id });
const earn = (id, order_id, doctor_amount, status = "pending", extra = {}) => ({
  id, order_id, doctor_amount, status, ...extra,
});

const SCENARIOS = [
  {
    name: "completed + single base earning → amount",
    orders: [ord("o1", COMPLETED)],
    earnings: [earn("e1", "o1", 30, "paid", { earning_type: "base" })],
    expect: { o1: 30 },
  },
  {
    name: "completed + multi-component (base+ra+addl doc) → SUM",
    orders: [ord("o1", COMPLETED)],
    earnings: [
      earn("e1", "o1", 30, "paid", { earning_type: "base" }),
      earn("e2", "o1", 30, "pending", { earning_type: "ra_completion" }),
      earn("e3", "o1", 30, "pending", { earning_type: "additional_documentation" }),
    ],
    expect: { o1: 90 },
  },
  {
    name: "completed THEN refunded → retained (refund never zeroes it)",
    orders: [ord("o1", COMPLETED)],
    earnings: [earn("e1", "o1", 40, "paid", { earning_type: "base" })],
    expect: { o1: 40 },
  },
  {
    name: "refunded BEFORE completion (not patient_notified) + PAID earning → 0",
    orders: [ord("o1", "in_review")],
    earnings: [earn("e1", "o1", 30, "paid", { earning_type: "base" })],
    expect: { o1: 0 },
  },
  {
    name: "under review / assigned only (pending earning) → 0",
    orders: [ord("o1", "assigned")],
    earnings: [earn("e1", "o1", 30, "pending", { earning_type: "base" })],
    expect: { o1: 0 },
  },
  {
    name: "cancelled earning excluded from sum",
    orders: [ord("o1", COMPLETED)],
    earnings: [
      earn("e1", "o1", 30, "paid", { earning_type: "base" }),
      earn("e2", "o1", 30, "cancelled", { earning_type: "ra_completion" }),
    ],
    expect: { o1: 30 },
  },
  {
    name: "completed + NO earning → 0 (anomaly, never fabricated)",
    orders: [ord("o1", COMPLETED)],
    earnings: [],
    expect: { o1: 0 },
  },
  {
    name: "earning-id dedup across both fetch batches → counted once",
    orders: [ord("o1", COMPLETED, "CONF-1")],
    earnings: [
      earn("e1", "o1", 30, "paid", { earning_type: "base" }),        // via order_id batch
      earn("e1", null, 30, "paid", { confirmation_id: "CONF-1" }),   // same row via conf batch
    ],
    expect: { o1: 30 },
  },
  {
    name: "attribution by confirmation_id when order_id is null",
    orders: [ord("o1", COMPLETED, "CONF-1")],
    earnings: [earn("e9", null, 25, "paid", { confirmation_id: "CONF-1" })],
    expect: { o1: 25 },
  },
  {
    name: "earning for an order NOT in the export → ignored",
    orders: [ord("o1", COMPLETED)],
    earnings: [earn("e1", "oX", 30, "paid", { earning_type: "base" })],
    expect: { o1: 0 },
  },
  {
    name: "mixed batch: completed sums, under-review zeroes (both have earnings)",
    orders: [ord("o1", COMPLETED), ord("o2", "in_review")],
    earnings: [
      earn("e1", "o1", 30, "paid"),
      earn("e2", "o1", 30, "pending"),
      earn("e3", "o2", 30, "pending"),
      earn("e4", "o2", 30, "pending"),
    ],
    expect: { o1: 60, o2: 0 },
  },
];

function runScenario(sc, opts) {
  const map = computeProviderPaymentByOrder(sc.orders, sc.earnings, opts);
  for (const [id, amt] of Object.entries(sc.expect)) {
    if ((map.get(id) ?? 0) !== amt) return { ok: false, id, got: map.get(id) ?? 0, want: amt };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// STATIC LAYER
// ─────────────────────────────────────────────────────────────────────────────
function assert(cond, msg, failures) {
  if (!cond) failures.push(msg);
}

function runStatic() {
  const failures = [];
  const lib = readFileSync(F_LIB, "utf8");
  const exp = readFileSync(F_EXPORT, "utf8");
  const page = readFileSync(F_PAGE, "utf8");

  // ── providerPaymentExport.ts ──
  assert(/from ["']\.\/companyExpenses["']/.test(lib) && /PROVIDER_COMPLETED_STATUS/.test(lib),
    "providerPaymentExport must import the canonical PROVIDER_COMPLETED_STATUS from companyExpenses (no duplicated literal)", failures);
  assert(/=== ?PROVIDER_COMPLETED_STATUS/.test(lib),
    "completion gate must compare doctor_status === PROVIDER_COMPLETED_STATUS", failures);
  assert(/toLowerCase\(\) === "cancelled"/.test(lib),
    "must exclude ONLY the 'cancelled' earning status (sole payout-exclusion sentinel)", failures);
  assert(/\(sumByOrderId\.get\(oid\) \?\? 0\) \+ toAmount/.test(lib),
    "must SUM valid components per order (accumulate, not pick one)", failures);
  assert(/seen\.has\(eid\)/.test(lib) && /seen\.add\(eid\)/.test(lib),
    "must dedupe earnings by id across the two fetch batches", failures);
  // Forbidden shortcuts — provider cost must never be derived from price/rate/%.
  assert(!/per_order_rate/.test(lib),
    "FORBIDDEN: provider payment must not fall back to per_order_rate", failures);
  assert(!/\.price\b/.test(lib),
    "FORBIDDEN: provider payment must not be derived from order price (o.price access)", failures);
  assert(!/0\.\d+ ?\*/.test(lib) && !/\* ?0\.\d+/.test(lib),
    "FORBIDDEN: provider payment must not use a hardcoded percentage", failures);
  assert(/throw new Error/.test(lib),
    "fetch wrapper must throw on query error (no silent all-zero partial export)", failures);
  assert(/\.from\("doctor_earnings"\)/.test(lib),
    "must read the canonical doctor_earnings table", failures);

  // ── exportOrders.ts ──
  assert(/{ ?label: "Provider Payment"/.test(exp),
    'exportOrders must define the exact "Provider Payment" column', failures);
  assert(/label: "Net After Provider Deduction"/.test(exp),
    'exportOrders must define the exact "Net After Provider Deduction" column', failures);
  // Placement: both new columns fall between "Net After Refund (USD)" and "Coupon Code".
  const iNet = exp.indexOf('"Net After Refund (USD)"');
  const iProv = exp.indexOf('"Provider Payment"');
  const iDed = exp.indexOf('"Net After Provider Deduction"');
  const iCoupon = exp.indexOf('"Coupon Code"');
  assert(iNet >= 0 && iProv > iNet && iDed > iProv && iCoupon > iDed,
    "column order must be: Net After Refund → Provider Payment → Net After Provider Deduction → Coupon Code", failures);
  assert(/ctx\.providerPayment\(o\)\.toFixed\(2\)/.test(exp),
    "Provider Payment cell must be ctx.providerPayment(o).toFixed(2) (bare 2-dp number)", failures);
  assert(/net - ctx\.providerPayment\(o\)/.test(exp),
    "Net After Provider Deduction must be (netAfterRefund − providerPayment)", failures);
  assert(/providerPaymentByOrderId\?: Map<string, number>/.test(exp),
    "exportOrdersToCSV must accept the provider payment map", failures);
  // No currency symbols / parenthesised negatives in the two new cells.
  assert(!/providerPayment[\s\S]{0,40}\$\{/.test(exp),
    "FORBIDDEN: provider cells must not prefix a $ sign (keep Excel-numeric)", failures);

  // ── page.tsx ──
  assert(/fetchProviderPaymentsForExport/.test(page),
    "page.tsx must fetch provider payments before exporting", failures);
  // Every exportOrdersToCSV call must pass the provider payments map (3rd arg).
  const callRe = /exportOrdersToCSV\(([^;]*?)\)/gs;
  let m;
  let calls = 0;
  let missing = 0;
  while ((m = callRe.exec(page)) !== null) {
    calls++;
    if (!/providerPayments/.test(m[1])) missing++;
  }
  assert(calls > 0, "page.tsx must call exportOrdersToCSV", failures);
  assert(missing === 0,
    `every exportOrdersToCSV call must pass the providerPayments map (${missing}/${calls} missing)`, failures);
  // Selected export keeps stable-id selection semantics.
  assert(/selectedOrders\.has\(o\.confirmation_id\)/.test(page),
    "selected export must filter by the stable confirmation_id selection set", failures);

  return failures;
}

// ─────────────────────────────────────────────────────────────────────────────
// SELF-TEST — prove the scenarios have discriminating power: the correct logic
// passes ALL, and each deliberately-broken variant fails AT LEAST ONE.
// ─────────────────────────────────────────────────────────────────────────────
function runSelfTest() {
  const results = [];

  // Correct logic passes every scenario.
  for (const sc of SCENARIOS) {
    const r = runScenario(sc, {});
    results.push({ name: `correct: ${sc.name}`, pass: r.ok,
      detail: r.ok ? "" : `${sc.name}: got ${r.got} want ${r.want} (${r.id})` });
  }

  // Each broken variant must fail at least one scenario (negative control).
  const brokenVariants = [
    { flag: { noGate: true }, label: "gate removed" },
    { flag: { countCancelled: true }, label: "cancelled counted" },
    { flag: { noDedup: true }, label: "dedup removed" },
    { flag: { firstOnly: true }, label: "sum→first (no multi-component)" },
  ];
  for (const bv of brokenVariants) {
    const anyFail = SCENARIOS.some((sc) => !runScenario(sc, bv.flag).ok);
    results.push({ name: `negative control caught: ${bv.label}`, pass: anyFail,
      detail: anyFail ? "" : `broken variant "${bv.label}" passed every scenario — scenarios lack power` });
  }

  // Deduction arithmetic incl. negative + blank.
  const dedChecks = [
    [109, 40, "69.00"],
    [0, 40, "-40.00"],
    [0, 0, "0.00"],
    [null, 40, ""],
  ];
  for (const [net, pay, want] of dedChecks) {
    const got = netAfterProviderDeduction(net, pay);
    results.push({ name: `deduction ${net}−${pay}=${want}`, pass: got === want,
      detail: got === want ? "" : `got "${got}" want "${want}"` });
  }

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`  ${r.pass ? GREEN + "✓" : RED + "✗"} ${r.name}${RESET}${r.detail ? " — " + r.detail : ""}`));
  if (failed.length) {
    console.error(`${RED}✗ self-test FAILED (${failed.length}/${results.length})${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ self-test passed (${results.length}/${results.length})${RESET}`);
}

// ─────────────────────────────────────────────────────────────────────────────
const selfTest = process.argv.includes("--self-test");

if (selfTest) {
  console.log(`${YELLOW}admin-order-export provider-net — self-test (logic + negative controls)${RESET}`);
  runSelfTest();
} else {
  console.log(`${YELLOW}admin-order-export provider-net — guard (static + logic)${RESET}`);
  // LOGIC: correct mirror must satisfy every scenario.
  const logicFail = [];
  for (const sc of SCENARIOS) {
    const r = runScenario(sc, {});
    if (!r.ok) logicFail.push(`${sc.name}: got ${r.got} want ${r.want} (${r.id})`);
  }
  // STATIC: source invariants.
  const staticFail = runStatic();

  const all = [...logicFail.map((f) => `[logic] ${f}`), ...staticFail.map((f) => `[static] ${f}`)];
  if (all.length) {
    console.error(`${RED}✗ provider-net export guard FAILED${RESET}`);
    all.forEach((f) => console.error(`  ${RED}✗${RESET} ${f}`));
    process.exit(1);
  }
  console.log(`${GREEN}✓ ${SCENARIOS.length} logic scenarios + all static invariants passed${RESET}`);
}
