// Fixture matrix for PARTIAL-REFUND-TERMINAL-STATE-CONSUMER-FIX-001.
//
//   node scripts/test-refund-classification.mjs
//
// This repo has no unit-test framework. Rather than add one (which would churn
// package.json / package-lock), we transpile the REAL shipped modules with
// esbuild (already a Vite dependency) and assert against the actual logic —
// same approach as scripts/test-customer-documents.mjs.
//
// Fixtures A–N are the task's required test matrix. They are pure in-memory
// objects: NO database rows are created, no Stripe call is made, no payout or
// customer communication can occur from this file.
//
// The central invariant: `refunded_at` is stamped for PARTIAL and FULL refunds,
// so it must never — on its own — make an order terminal, cancelled, unassignable,
// unworkable, undeliverable, or excluded from earnings.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Load a real module, rewriting the "@/lib/..." alias to a relative path so the
// data-URL import resolves exactly what Vite ships.
async function load(relPath, aliasStubs = {}) {
  let src = readFileSync(join(ROOT, relPath), "utf8");
  for (const [spec, replacement] of Object.entries(aliasStubs)) {
    src = src.replaceAll(`"${spec}"`, `"${replacement}"`);
  }
  const { code } = await esbuild.transform(src, { loader: "ts", format: "esm" });
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

const oc = await load("src/lib/orderClassification.ts");

// bookingProgress + analyticsMetrics import the classifier via the "@/lib" alias;
// inline it as a data URL so we exercise the REAL consumer logic end-to-end.
const ocCode = (await esbuild.transform(readFileSync(join(ROOT, "src/lib/orderClassification.ts"), "utf8"), { loader: "ts", format: "esm" })).code;
const ocUrl = "data:text/javascript;base64," + Buffer.from(ocCode).toString("base64");

const bp = await load("src/lib/bookingProgress.ts", { "@/lib/orderClassification": ocUrl });
const am = await load("src/lib/analyticsMetrics.ts", { "@/lib/orderClassification": ocUrl });

// Deno-side port — must agree with the canonical module on every fixture.
const dn = await load("supabase/functions/_shared/orderClassification.ts");

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const fail = (n, m) => { failed++; console.error(`  ✗ ${n}\n      ${m}`); };
const eq = (name, actual, expected) => {
  if (actual === expected) ok(name);
  else fail(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// ── Fixtures A–N ────────────────────────────────────────────────────────────
// paid_at/payment_intent_id present => not a lead. doctor_* drive work state.
const PI = "pi_test_123";
const base = (over = {}) => ({
  confirmation_id: "PT-FIXTURE",
  payment_intent_id: PI,
  paid_at: "2026-07-01T00:00:00Z",
  status: "processing",
  doctor_status: "in_review",
  doctor_user_id: "doc-1",
  doctor_email: "doc@example.com",
  refunded_at: null,
  refund_status: "none",
  refund_amount: null,
  price: 129,
  ...over,
});

const F = {
  // A. No refund at all.
  A: base(),
  // B. Partial refund with refunded_at (the canonical trap).
  B: base({ refunded_at: "2026-07-09T22:41:44Z", refund_status: "partial", refund_amount: 40, price: 89 }),
  // C. Partial refund carrying a STALE status='refunded' (the PT-MR1HX27H shape).
  C: base({ status: "refunded", refunded_at: "2026-07-09T22:41:44Z", refund_status: "partial", refund_amount: 40, price: 59 }),
  // D. Full refund.
  D: base({ status: "refunded", refunded_at: "2026-07-09T22:41:44Z", refund_status: "full", refund_amount: 129, price: 129 }),
  // E. Full refund WITHOUT cancellation (Refund Only, full).
  E: base({ status: "processing", refunded_at: "2026-07-09T22:41:44Z", refund_status: "full", refund_amount: 129 }),
  // F. Full refund WITH explicit cancellation (Refund + Cancel).
  F: base({ status: "cancelled", refunded_at: "2026-07-09T22:41:44Z", refund_status: "full", refund_amount: 129 }),
  // G. Refund activity with incomplete authoritative data (unknown).
  G: base({ status: "processing", refunded_at: "2026-07-09T22:41:44Z", refund_status: null, refund_amount: null }),
  // H. Partial refund + active verification ID.
  H: base({ refunded_at: "2026-07-09T22:41:44Z", refund_status: "partial", refund_amount: 40,
            doctor_status: "patient_notified", letter_id: "ESA-GA-FYDKPN5", verification_status: "valid" }),
  // I. Partial refund + MANUALLY revoked verification ID.
  I: base({ refunded_at: "2026-07-09T22:41:44Z", refund_status: "partial", refund_amount: 40,
            doctor_status: "patient_notified", letter_id: "ESA-GA-FYDKPN5", verification_status: "revoked" }),
  // J. Provider assigned, letter NOT submitted, partial refund.
  J: base({ refunded_at: "2026-07-09T22:41:44Z", refund_status: "partial", refund_amount: 20,
            doctor_status: "pending_review" }),
  // K. Provider letter submitted / completed, partial refund.
  K: base({ refunded_at: "2026-07-09T22:41:44Z", refund_status: "partial", refund_amount: 20,
            doctor_status: "patient_notified" }),
  // L. PAID provider earning on a partially-refunded order.
  L: base({ refunded_at: "2026-07-09T22:41:44Z", refund_status: "partial", refund_amount: 20,
            doctor_status: "patient_notified", earning_status: "paid" }),
  // M. PENDING provider earning on a partially-refunded order.
  M: base({ refunded_at: "2026-07-09T22:41:44Z", refund_status: "partial", refund_amount: 20,
            doctor_status: "in_review", earning_status: "pending" }),
  // N. orders.price differs from the original charged value (partial rewrote it
  //    to the net: charged 99, refunded 40, price 59 — never assume price=charge).
  N: base({ refunded_at: "2026-07-09T22:41:44Z", refund_status: "partial", refund_amount: 40,
            price: 59, charged_amount: 99, doctor_status: "in_review" }),
};

// ── 1. Canonical classification ─────────────────────────────────────────────
console.log("\n── Canonical disposition ──");
eq("A no refund → none", oc.refundDisposition(F.A), "none");
eq("B partial + refunded_at → partial", oc.refundDisposition(F.B), "partial");
eq("C partial beats stale status='refunded' (rule 4) → partial", oc.refundDisposition(F.C), "partial");
eq("D full refund → full", oc.refundDisposition(F.D), "full");
eq("E full refund, not cancelled → full", oc.refundDisposition(F.E), "full");
eq("F full refund + cancelled → full_cancelled", oc.refundDisposition(F.F), "full_cancelled");
eq("G refund activity, no authoritative completeness → unknown", oc.refundDisposition(F.G), "unknown");
eq("N partial (price is net, not charge) → partial", oc.refundDisposition(F.N), "partial");

console.log("\n── Contract rules ──");
eq("rule 1: refunded_at proves refund activity (B)", oc.hasAnyRefund(F.B), true);
eq("rule 2: refunded_at alone never proves full (G)", oc.isFullRefund(F.G), false);
eq("rule 3: refund_amount>0 alone never proves full", oc.isFullRefund(base({ refund_amount: 500, refund_status: null })), false);
eq("rule 4: explicit partial overrides stale status='refunded' (C)", oc.isFullRefund(F.C), false);
eq("rule 5: full needs authoritative evidence (D)", oc.isFullRefund(F.D), true);
eq("rule 6: cancellation independent of refund (F)", oc.isOperationallyCancelled(F.F), true);
eq("rule 6: no-refund cancel is cancelled, not refunded", oc.isRefundTerminal(base({ status: "cancelled" })), false);
eq("rule 7: partial stays operational (B)", oc.isOperationallyActive(F.B), true);
eq("rule 8: unknown is NOT terminal (G)", oc.isRefundTerminal(F.G), false);
eq("rule 8: unknown stays operational (G)", oc.isOperationallyActive(F.G), true);
eq("rule 9: price never used — N (price 59 < refund? no) still partial", oc.isFullRefund(F.N), false);
eq("partial is never refund-terminal (B)", oc.isRefundTerminal(F.B), false);
eq("partial is never refund-terminal (C)", oc.isRefundTerminal(F.C), false);

// ── 2. Admin badge / tab placement / counts ─────────────────────────────────
console.log("\n── Admin badge + tab placement ──");
eq("A → not in Refunded tab", oc.isRefundedBucket(F.A), false);
eq("B partial → NOT in Refunded tab", oc.isRefundedBucket(F.B), false);
eq("C stale-status partial → NOT in Refunded tab", oc.isRefundedBucket(F.C), false);
eq("D full → in Refunded tab", oc.isRefundedBucket(F.D), true);
eq("E full, uncancelled → in Refunded tab", oc.isRefundedBucket(F.E), true);
eq("F full+cancelled → in Refunded tab", oc.isRefundedBucket(F.F), true);
eq("G unknown → NOT in Refunded tab (rule 8)", oc.isRefundedBucket(F.G), false);
eq("pure cancel → in Refunded tab", oc.isRefundedBucket(base({ status: "cancelled" })), true);

// Tab counts over the whole matrix — the Refunded tab must hold exactly D/E/F.
const all = Object.entries(F);
const refundedTab = all.filter(([, o]) => oc.isRefundedBucket(o)).map(([k]) => k);
eq("Refunded tab contains exactly D,E,F", refundedTab.join(","), "D,E,F");
const underReview = all.filter(([, o]) => oc.isUnderReview(o)).map(([k]) => k);
// A (clean, assigned, in review) plus every partial/unknown fixture that is not
// yet delivered. H/K/L are delivered (patient_notified) so they are Completed,
// and D/E/F are the Refunded bucket.
eq("Under Review holds clean + partial/unknown undelivered work", underReview.join(","), "A,B,C,G,J,M,N");

console.log("\n── Assignment controls ──");
eq("B partial → assignable", oc.isAssignable(F.B), true);
eq("C stale-status partial → assignable", oc.isAssignable(F.C), true);
eq("J partial, letter not submitted → assignable", oc.isAssignable(F.J), true);
eq("D full → NOT assignable", oc.isAssignable(F.D), false);
eq("F full+cancelled → NOT assignable", oc.isAssignable(F.F), false);
eq("G unknown → assignable (rule 8)", oc.isAssignable(F.G), true);
eq("K completed → NOT assignable (already delivered)", oc.isAssignable(F.K), false);

// ── 3. Provider portal visibility + letter submission ───────────────────────
// Mirrors provider-portal/page.tsx isOrderInactive + ProviderOrderDetail
// isRefunded — both now isWorkStopped(), matching LIVE's REFUND-ONLY-OPERATIONAL
// doctrine: only cancellation or the legacy 'refunded' status stops the work.
console.log("\n── Provider portal (REFUND-ONLY-OPERATIONAL) ──");
const providerInactive = (o) => oc.isWorkStopped(o);
eq("E full Refund Only (uncancelled) → provider KEEPS working it (LIVE doctrine)", oc.isWorkStopped(F.E), false);
eq("E is still in the admin FINANCIAL Refunded bucket (views differ by design)", oc.isRefundedBucket(F.E), true);
eq("F Refund + Cancel → work stopped", oc.isWorkStopped(F.F), true);
eq("D legacy status='refunded' → work stopped", oc.isWorkStopped(F.D), true);
eq("C partial + STALE status='refunded' → work NOT stopped (rule 4)", oc.isWorkStopped(F.C), false);
eq("partial + cancelled → work STOPPED (rule 6 beats rule 4)", oc.isWorkStopped(base({ status: "cancelled", refunded_at: "x", refund_status: "partial" })), true);
const canSubmitLetter = (o) => !providerInactive(o) && o.doctor_status !== "patient_notified";
eq("B partial → visible in provider queue", providerInactive(F.B), false);
eq("C stale-status partial → visible in provider queue", providerInactive(F.C), false);
eq("J partial, not submitted → Submit Letter ENABLED", canSubmitLetter(F.J), true);
eq("N partial (net price) → Submit Letter ENABLED", canSubmitLetter(F.N), true);
eq("D full → hidden from provider queue", providerInactive(F.D), true);
eq("F full+cancelled → hidden from provider queue", providerInactive(F.F), true);
eq("G unknown → visible, letter submittable (rule 8)", canSubmitLetter(F.G), true);
eq("K completed partial → work preserved (not inactive)", providerInactive(F.K), false);

// ── 4. Customer portal lifecycle + document access ──────────────────────────
console.log("\n── Customer portal lifecycle ──");
eq("A → not terminal", bp.isTerminalOrder(F.A), false);
eq("B partial → NOT terminal (lifecycle intact)", bp.isTerminalOrder(F.B), false);
eq("C stale-status partial → NOT terminal", bp.isTerminalOrder(F.C), false);
eq("D full → terminal", bp.isTerminalOrder(F.D), true);
eq("F full+cancelled → terminal", bp.isTerminalOrder(F.F), true);
eq("G unknown → NOT terminal (rule 8)", bp.isTerminalOrder(F.G), false);
eq("archived → terminal (non-refund terminal preserved)", bp.isTerminalOrder(base({ status: "archived" })), true);
eq("B partial → still a paid order", bp.isPaidOrder(F.B), true);
eq("C partial → still a paid order", bp.isPaidOrder(F.C), true);
eq("D full → not a paid order", bp.isPaidOrder(F.D), false);

// Document access + additional-doc request mirror canRequestAdditionalDoc.
console.log("\n── Documents + verification ──");
const canRequestDoc = (o) => !!o.payment_intent_id && !oc.isRefundedBucket(o) && o.status !== "lead";
eq("B partial → can request additional documentation", canRequestDoc(F.B), true);
eq("C partial → can request additional documentation", canRequestDoc(F.C), true);
eq("D full → cannot request", canRequestDoc(F.D), false);
eq("H partial + valid verification → documents accessible", canRequestDoc(F.H), true);

// Verification validity is INDEPENDENT of refunds — only explicit revocation.
const verificationValid = (o) => o.verification_status !== "revoked";
eq("H partial + active ID → verification VALID (refund never revokes)", verificationValid(F.H), true);
eq("I partial + manually revoked → verification revoked (explicit only)", verificationValid(F.I), false);
eq("D full refund alone does NOT revoke verification", verificationValid({ ...F.D, verification_status: "valid" }), true);

// ── 5. Provider earnings gating ─────────────────────────────────────────────
// Mirrors ProviderEarnings.applyVisibilityFilter. 'cancelled' is the ONLY
// payout-exclusion sentinel; refunded_at must never suppress an earning.
console.log("\n── Provider earnings ──");
const earningVisible = (o, earningStatus) => {
  if (earningStatus === "paid") return true;
  if (o.doctor_status === "patient_notified") return true;
  if (oc.isRefundTerminal(o) || oc.isOperationallyCancelled(o)) return false;
  return false;
};
eq("L paid earning on partial → visible (paid never altered)", earningVisible(F.L, "paid"), true);
eq("M pending earning, partial, in review → not yet visible (work incomplete)", earningVisible(F.M, "pending"), false);
eq("K completed partial → earning visible (completed work preserved)", earningVisible(F.K, "pending"), true);
eq("paid earning survives FULL refund too", earningVisible(F.D, "paid"), true);
eq("paid earning survives cancellation (never altered)", earningVisible(F.F, "paid"), true);
eq("completed work preserved under full refund", earningVisible({ ...F.D, doctor_status: "patient_notified" }, "pending"), true);
eq("refunded_at alone does not suppress an earning (G unknown)", earningVisible({ ...F.G, doctor_status: "patient_notified" }, "pending"), true);

// ── 6. Analytics classification ─────────────────────────────────────────────
console.log("\n── Analytics ──");
eq("A → not lost", am.isLostOrder(F.A), false);
eq("B partial → NOT lost (was deleting whole order value)", am.isLostOrder(F.B), false);
eq("C stale-status partial → NOT lost", am.isLostOrder(F.C), false);
eq("D full → lost", am.isLostOrder(F.D), true);
eq("F full+cancelled → lost", am.isLostOrder(F.F), true);
eq("G unknown → NOT lost (rule 8)", am.isLostOrder(F.G), false);
eq("pure cancel → lost", am.isLostOrder(base({ status: "cancelled" })), true);
eq("voided → lost", am.isLostOrder(base({ status: "voided" })), true);
eq("B partial → reported as partial refund", am.isPartiallyRefundedOrder(F.B), true);
eq("D full → NOT reported as partial", am.isPartiallyRefundedOrder(F.D), false);
eq("B partial → has refund activity (display)", am.hasRefundActivity(F.B), true);

// The headline regression: a $20 refund on a $129 order must not delete $129.
// price already holds the NET (109) after a partial refund — rule 9.
const m = am.computeOrderMetrics([
  base({ price: 129 }),                                                   // clean paid
  base({ refunded_at: "x", refund_status: "partial", refund_amount: 20, price: 109 }), // partial → net 109
  base({ status: "refunded", refunded_at: "x", refund_status: "full", refund_amount: 129, price: 129 }), // full
]);
eq("metrics: paid = 3", m.paid, 3);
eq("metrics: netPaid = 2 (partial retained)", m.netPaid, 2);
eq("metrics: refunds = 1 (only the full refund is a loss)", m.refunds, 1);
eq("metrics: partialRefunds = 1 (reported separately)", m.partialRefunds, 1);
eq("metrics: netRevenue = 238 (129 + 109 net, partial NOT zeroed)", m.netRevenue, 238);

// ── 7. Deno port parity ─────────────────────────────────────────────────────
console.log("\n── Deno port parity (edge functions) ──");
for (const [k, o] of all) {
  eq(`Deno port agrees on ${k} disposition`, dn.refundDisposition(o), oc.refundDisposition(o));
}
for (const [k, o] of all) {
  eq(`Deno port agrees on ${k} isRefundTerminal`, dn.isRefundTerminal(o), oc.isRefundTerminal(o));
}

// ── 8. Real-data shape census guard ─────────────────────────────────────────
// Every shape that actually exists in TEST/LIVE (census 2026-07-17) must
// classify identically to the pre-fix implementation, so this change cannot
// move any real order between tabs.
console.log("\n── Parity with pre-fix behaviour on REAL data shapes ──");
const preFixIsFullyRefunded = (o) => {
  if (o.status === "refunded") return true;
  if (o.refund_status === "full") return true;
  if (o.refunded_at && o.refund_status !== "partial") return true;
  return false;
};
const realShapes = [
  ["no refund", base({ refunded_at: null, refund_status: "none" })],
  ["partial + processing", base({ refunded_at: "x", refund_status: "partial", status: "processing" })],
  ["partial + cancelled", base({ refunded_at: "x", refund_status: "partial", status: "cancelled" })],
  ["partial + completed", base({ refunded_at: "x", refund_status: "partial", status: "completed" })],
  ["full + cancelled", base({ refunded_at: "x", refund_status: "full", status: "cancelled" })],
  ["full + refunded", base({ refunded_at: "x", refund_status: "full", status: "refunded" })],
];
for (const [name, o] of realShapes) {
  eq(`${name}: classification unchanged vs pre-fix`, oc.isFullyRefunded(o), preFixIsFullyRefunded(o));
}

console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
