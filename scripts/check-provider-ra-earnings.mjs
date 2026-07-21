// scripts/check-provider-ra-earnings.mjs
//
// PROVIDER-EARNINGS-RA-DOUBLE-PAYOUT-001 — provider RA-completion payout guard.
//
// Contract pinned here so it cannot silently regress:
//   • A combo order (includes_reasonable_accommodation_letter OR esa_ra_bundle /
//     psd_ra_bundle) whose RA work is COMPLETED earns the assigned provider a
//     SECOND payout equal to their STANDARD per-order rate — never the customer
//     price / coupon / $159 / $179.
//   • Standard-only order = 1× ; combo RA not completed = 1× ; combo RA completed
//     = 2× (base + ra_completion).
//   • The RA payout is gated on ACTUAL completion (additional_documentation_status
//     ='completed'), base paid, and a provider assigned.
//   • Idempotent: keyed by order_id, partial unique index, pre-check + 23505 —
//     rerun/concurrent never doubles or triples.
//
// Part A exercises the REAL shipped pure module (esbuild-transpiled, no DB / no
// network / no Stripe). Part B statically asserts the wiring across the migration,
// the reconciler, the completion event, and the three UI surfaces.
//
// Usage:
//   node scripts/check-provider-ra-earnings.mjs             → guard (exit 1 on fail)
//   node scripts/check-provider-ra-earnings.mjs --warn-only → audit (always exit 0)
//   node scripts/check-provider-ra-earnings.mjs --self-test → prove negative controls trip

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const warnOnly = process.argv.includes("--warn-only");
const selfTest = process.argv.includes("--self-test");
const TAG = "[check-provider-ra-earnings]";

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const fail = (n, m) => { failed++; console.error(`  ✗ ${n}${m ? `\n      ${m}` : ""}`); };
const eq = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(name);
  else fail(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const truthy = (name, cond, m) => { cond ? ok(name) : fail(name, m); };

async function loadTs(relPath) {
  const src = readFileSync(join(ROOT, relPath), "utf8");
  const { code } = await esbuild.transform(src, { loader: "ts", format: "esm" });
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

console.log(`\n${TAG}`);

// ── Part A: pure logic matrix (REAL shipped module) ─────────────────────────
const mod = await loadTs("supabase/functions/_shared/raCompletionEarning.ts");
const { isRaCompletionEligible, raCompletionAmount, isRaCombo } = mod;

console.log("\n  eligibility matrix:");

// A. Standard (non-combo) order, RA completed field irrelevant → NOT combo → 1×.
eq("A. standard order → not eligible (base only)",
  isRaCompletionEligible({ includes_reasonable_accommodation_letter: false, package_key: "esa_standard", additional_documentation_status: "completed", doctor_user_id: "d1", payment_intent_id: "pi" }),
  { eligible: false, reason: "not_combo" });

// B. Combo purchased but RA NOT completed → 1× (NEGATIVE CONTROL: must not pay
//    merely because the combo was bought).
for (const st of ["uploaded", "in_review", "not_uploaded", null, undefined]) {
  eq(`B. combo, RA status=${String(st)} → not eligible`,
    isRaCompletionEligible({ includes_reasonable_accommodation_letter: true, additional_documentation_status: st, doctor_user_id: "d1", payment_intent_id: "pi" }),
    { eligible: false, reason: "ra_not_completed" });
}

// C. Combo (via flag), RA completed, base paid, provider → 2× (eligible).
eq("C. combo(flag) RA completed + base paid + provider → eligible",
  isRaCompletionEligible({ includes_reasonable_accommodation_letter: true, additional_documentation_status: "completed", doctor_user_id: "d1", payment_intent_id: "pi" }),
  { eligible: true, reason: "eligible" });

// C2. Combo via package_key (flag false) still eligible.
for (const key of ["esa_ra_bundle", "psd_ra_bundle"]) {
  eq(`C2. combo(${key}) RA completed + paid_at + provider → eligible`,
    isRaCompletionEligible({ package_key: key, additional_documentation_status: "completed", doctor_user_id: "d1", paid_at: "2026-07-21" }),
    { eligible: true, reason: "eligible" });
}

// Base unpaid combo completed → not eligible.
eq("combo RA completed but base UNPAID → not eligible",
  isRaCompletionEligible({ includes_reasonable_accommodation_letter: true, additional_documentation_status: "completed", doctor_user_id: "d1" }),
  { eligible: false, reason: "base_unpaid" });

// No provider assigned → not eligible.
eq("combo RA completed, base paid, NO provider → not eligible",
  isRaCompletionEligible({ includes_reasonable_accommodation_letter: true, additional_documentation_status: "completed", payment_intent_id: "pi" }),
  { eligible: false, reason: "no_provider" });

console.log("\n  amount (standard rate, NEVER customer price):");

// PT-MRUT8CHL-type: standard rate $30 → RA payout $30 → base(30)+ra(30)=60.
eq("PT-MRUT8CHL-type rate 30 → RA payout 30", raCompletionAmount(30), 30);
eq("base(30) + ra(30) = 60 total", 30 + raCompletionAmount(30), 60);
// Different provider rate → 2× their own rate, not a fixed $60.
eq("rate 45 → RA payout 45 (not fixed $60)", raCompletionAmount(45), 45);
eq("rate 45 total = 90", 45 + raCompletionAmount(45), 90);
// Rate unset → null (row created, panel prompts to set) — never guessed from price.
eq("rate null → null (never inferred)", raCompletionAmount(null), null);
// Idempotent/pure: same input → same output, no multiplication/accumulation.
eq("amount is pure — repeated calls stable", [raCompletionAmount(30), raCompletionAmount(30), raCompletionAmount(30)], [30, 30, 30]);
// Customer price must NOT influence eligibility (function has no price param).
truthy("eligibility ignores customer price entirely",
  JSON.stringify(isRaCompletionEligible({ includes_reasonable_accommodation_letter: true, additional_documentation_status: "completed", doctor_user_id: "d1", payment_intent_id: "pi", price: 159, order_amount: 179 }))
    === JSON.stringify({ eligible: true, reason: "eligible" }),
  "price fields leaked into eligibility");

truthy("isRaCombo true for flag", isRaCombo({ includes_reasonable_accommodation_letter: true }) === true);
truthy("isRaCombo false for standard", isRaCombo({ package_key: "esa_standard" }) === false);

// ── Part B: static wiring assertions ────────────────────────────────────────
console.log("\n  wiring (source):");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const has = (name, src, re, m) => truthy(name, (re instanceof RegExp ? re.test(src) : src.includes(re)), m);

const migration = read("supabase/migrations/20260721140000_ra_completion_provider_earning.sql");
has("migration: partial unique index on order_id", migration, /doctor_earnings_ra_completion_order_uniq/);
has("migration: predicate earning_type='ra_completion'", migration, /earning_type\s*=\s*'ra_completion'/);
has("migration: excludes cancelled", migration, /COALESCE\(status,\s*''\)\s*<>\s*'cancelled'/i);

const helper = read("supabase/functions/_shared/raCompletionEarning.ts");
has("reconciler: keys by order_id", helper, /\.eq\("order_id",\s*orderId\)/);
has("reconciler: pre-checks ra_completion", helper, /\.eq\("earning_type",\s*"ra_completion"\)/);
has("reconciler: inserts earning_type ra_completion", helper, /earning_type:\s*"ra_completion"/);
has("reconciler: payout = per-order rate (raCompletionAmount)", helper, /raCompletionAmount\(/);
has("reconciler: reads per_order_rate", helper, /per_order_rate/);
has("reconciler: NOT customer price for payout", helper, /doctor_amount:\s*rate/);
has("reconciler: 23505 race-dedup handled", helper, /23505/);
has("reconciler: base-paid gate", helper, /payment_intent_id|paid_at/);

const submit = read("supabase/functions/provider-submit-letter/index.ts");
has("completion event: imports reconciler", submit, /ensureRaCompletionEarning/);
has("completion event: called in housing_completed path", submit, /await ensureRaCompletionEarning\(supabase,\s*order\.id/);

const paymentsTab = read("src/pages/admin-orders/components/PaymentHistoryTab.tsx");
has("order Payments tab: distinct ra_completion line", paymentsTab, /earning_type === "ra_completion"/);
has("order Payments tab: RA total added to grand total", paymentsTab, /baseTotal \+ raTotal \+ addonTotal/);

const earningsPanel = read("src/pages/admin-orders/components/EarningsPanel.tsx");
has("earnings panel: ra_completion component label", earningsPanel, /ra_completion:\s*\{\s*label:\s*"RA completion"/);
has("earnings panel: distinct-case count (no row inflation)", earningsPanel, /function distinctCaseCount/);
has("earnings panel: Total Cases uses distinct count", earningsPanel, /Total Cases",\s*value:\s*distinctCaseCount/);

const providerEarnings = read("src/pages/provider-portal/components/ProviderEarnings.tsx");
has("provider view: RA badge", providerEarnings, /earning_type === "ra_completion"/);

// ── Self-test: prove negative controls actually trip ────────────────────────
if (selfTest) {
  console.log("\n  self-test (negative controls must be rejected):");
  const negatives = [
    ["combo purchased, NOT completed", { includes_reasonable_accommodation_letter: true, additional_documentation_status: "uploaded", doctor_user_id: "d", payment_intent_id: "pi" }],
    ["standard order", { package_key: "esa_standard", additional_documentation_status: "completed", doctor_user_id: "d", payment_intent_id: "pi" }],
    ["base unpaid", { includes_reasonable_accommodation_letter: true, additional_documentation_status: "completed", doctor_user_id: "d" }],
    ["no provider", { includes_reasonable_accommodation_letter: true, additional_documentation_status: "completed", payment_intent_id: "pi" }],
  ];
  for (const [name, o] of negatives) {
    truthy(`rejects: ${name}`, isRaCompletionEligible(o).eligible === false, "negative control was (wrongly) eligible");
  }
  // A fixed $60 would be a bug — the payout must track the provider's own rate.
  truthy("payout is per-rate, not hardcoded $60", raCompletionAmount(45) === 45 && raCompletionAmount(30) === 30);
}

// ── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${TAG} ${passed} passed, ${failed} failed`);
if (failed > 0 && !warnOnly) process.exit(1);
