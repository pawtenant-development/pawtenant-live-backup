#!/usr/bin/env node
// ORDER-PAID-STALE-FAILURE-SUPPRESSION-001 — build guard + logic tests.
//
// An order that failed a checkout attempt and THEN paid is in good standing, but
// Order Details kept showing the big red "Payment Failed" panel (plus the compact
// Overview field and the Payments-tab alert dot) forever. Observed on production
// PT-MSTCOG0E: paid 12:57 AM, Klarna cancellation stamped 1:00 AM, order Paid $129.
//
// This guard locks BOTH halves of the fix:
//
//   • the SUPPRESSION — a superseded attempt stops shouting, and
//   • the SAFETY — a dispute, a refund, an unpaid failure, or an admin
//     "mark as unpaid" (which CLEARS paid_at) must all keep warning.
//
// It must be impossible for a later refactor to widen the suppression into
// "hide every payment failure", or to key it on clock order (which is wrong —
// see scenario 3) or on payment_intent_id (which is wrong — see scenario 2).
//
//   node scripts/check-order-paid-stale-failure-suppression.mjs              → static + logic
//   node scripts/check-order-paid-stale-failure-suppression.mjs --self-test  → + negative controls

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RED = "\x1b[31m", GREEN = "\x1b[32m", DIM = "\x1b[2m", RESET = "\x1b[0m";

const LIB   = resolve(ROOT, "src/lib/orderLifecycle.ts");
const MODAL = resolve(ROOT, "src/pages/admin-orders/components/OrderDetailModal.tsx");

function read(p) {
  try { return readFileSync(p, "utf8"); }
  catch (e) { throw new Error(`cannot read ${p}: ${e.message}`); }
}

// Strip line + block comments but KEEP string/template literals, so a guard
// asserting on a JSX condition cannot be satisfied by prose in a doc comment.
// (Learned the hard way — see the Command Center guard notes.)
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

// ── STATIC INVARIANTS ────────────────────────────────────────────────────────

const REQUIRED = [
  // The predicate is canonical, exported, and lives OUTSIDE the frozen modal.
  { file: LIB, label: "stale-failure predicate exported from the lifecycle module",
    re: /export function isStalePaymentFailure\(o: LifecycleOrder\): boolean/ },
  { file: LIB, label: "requires an actual failure marker to do anything",
    re: /const hasFailureMarker = !!o\.payment_failed_at \|\| !!o\.payment_failure_reason;[\s\S]{0,80}if \(!hasFailureMarker\) return false;/ },
  { file: LIB, label: "keys on paid_at (a bare PaymentIntent is the UNPAID signature)",
    re: /return !!o\.paid_at && orderPaymentState\(o\) === "paid";/ },

  // All three display surfaces consume it.
  { file: MODAL, label: "modal imports the canonical predicate",
    re: /import \{ isStalePaymentFailure, type LifecycleOrder \} from "\.\.\/\.\.\/\.\.\/lib\/orderLifecycle";/ },
  { file: MODAL, label: "red Payment Failed banner is suppression-guarded",
    re: /\{order\.payment_failed_at && !isStalePaymentFailure\(order as LifecycleOrder\) && \(/ },
  { file: MODAL, label: "compact Overview failure field is suppression-guarded",
    re: /\{order\.payment_failure_reason && !isStalePaymentFailure\(order as LifecycleOrder\) && \(/ },
  { file: MODAL, label: "Payments tab alert dot is suppression-guarded",
    re: /alert: !order\.payment_intent_id && !!order\.payment_failure_reason && !isStalePaymentFailure\(order as LifecycleOrder\)/ },
];

// Things that must NOT reappear. Asserted against comment-stripped source so a
// design note explaining why we rejected them cannot trip the guard.
const FORBIDDEN = [
  { file: LIB, label: "timestamp-ordering rule (breaks the Klarna-after-payment case)",
    re: /paid_at\s*>=?\s*[\w.]*payment_failed_at|payment_failed_at\s*<=?\s*[\w.]*paid_at/ },
  { file: LIB, label: "suppression on a bare PaymentIntent",
    re: /isStalePaymentFailure[\s\S]{0,400}?o\.payment_intent_id/ },
];

function runStatic() {
  const fails = [];
  for (const { file, label, re } of REQUIRED) {
    if (!re.test(read(file))) fails.push(`missing: ${label}`);
  }
  for (const { file, label, re } of FORBIDDEN) {
    if (re.test(stripComments(read(file)))) fails.push(`forbidden pattern present: ${label}`);
  }
  // The historical record must survive: suppression is presentation-only.
  const modal = stripComments(read(MODAL));
  if (/isStalePaymentFailure[\s\S]{0,200}?\.update\(|\.delete\(\)[\s\S]{0,120}payment_fail/.test(modal)) {
    fails.push("suppression must never write or delete payment history");
  }
  // The admin "mark as unpaid" writer is what makes a genuine later failure
  // re-surface. If it stops clearing paid_at, the suppression becomes unsafe.
  if (!/paid_at: null,\s*\n\s*payment_failed_at: ts,/.test(read(MODAL))) {
    fails.push("mark-as-unpaid writer no longer clears paid_at — suppression would hide a real failure");
  }

  if (fails.length) {
    console.error(`${RED}✗ stale-failure suppression STATIC FAILED${RESET}`);
    for (const f of fails) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(`${GREEN}✓ stale-failure suppression static passed${RESET} (${REQUIRED.length} required, ${FORBIDDEN.length} forbidden, 2 integrity)`);
  return 0;
}

// ── LOGIC (JS twin of the TS predicate) ──────────────────────────────────────

function orderPaymentState(o) {
  if (o.dispute_id || o.status === "disputed") return "disputed";
  if (o.refund_status === "partial") return "partially_refunded";
  if (o.refund_status === "full" || o.status === "refunded") return "fully_refunded";
  if (o.payment_intent_id || o.paid_at) return "paid";
  if (o.payment_failure_reason || o.payment_failed_at) return "failed";
  return "unpaid";
}

function isStalePaymentFailure(o) {
  const hasFailureMarker = !!o.payment_failed_at || !!o.payment_failure_reason;
  if (!hasFailureMarker) return false;
  return !!o.paid_at && orderPaymentState(o) === "paid";
}

function runLogic() {
  const fails = [];
  let n = 0;
  const t = (label, actual, expected) => {
    n++;
    if (actual !== expected) fails.push(`${label}: expected ${expected}, got ${actual}`);
  };

  // 1 — clean order, nothing to suppress.
  t("1 no failure ever", isStalePaymentFailure(
    { paid_at: "2026-08-15T04:57:00Z", payment_intent_id: "pi_1" }), false);

  // 2 — THE UNPAID FAILURE. A cancelled checkout mints a PI and never pays it,
  //     so a bare PI must NOT be read as proof of payment.
  t("2 unpaid failed (PI minted, never paid)", isStalePaymentFailure(
    { paid_at: null, payment_intent_id: "pi_2", status: "lead",
      payment_failed_at: "2026-08-15T05:00:23Z",
      payment_failure_reason: "Customer cancelled checkout on Klarna" }), false);

  // 3 — THE SCREENSHOT CASE (PT-MSTCOG0E). Failure is stamped AFTER the payment.
  //     A timestamp-ordering rule would call this "a later failure" and keep
  //     shouting; the order is Paid $129 and needs nothing.
  t("3 failed-then-paid, failure stamped LATER", isStalePaymentFailure(
    { paid_at: "2026-08-15T04:57:00Z", payment_intent_id: "pi_3", status: "processing",
      payment_failed_at: "2026-08-15T05:00:23Z",
      payment_failure_reason: "Customer cancelled checkout on Klarna" }), true);

  // 4 — ordinary failed-then-paid, failure first.
  t("4 failed-then-paid, failure EARLIER", isStalePaymentFailure(
    { paid_at: "2026-08-15T06:00:00Z", payment_intent_id: "pi_4", status: "processing",
      payment_failed_at: "2026-08-15T05:00:00Z",
      payment_failure_reason: "Card declined" }), true);

  // 5/6 — refunds still need an operator. Partial stays operational but the
  //       order is no longer plain "paid", so the warning stays visible.
  t("5 paid-then-fully-refunded", isStalePaymentFailure(
    { paid_at: "2026-08-01T00:00:00Z", payment_intent_id: "pi_5", refund_status: "full",
      refunded_at: "2026-08-10T00:00:00Z", payment_failed_at: "2026-07-31T00:00:00Z",
      payment_failure_reason: "Card declined" }), false);
  t("6 paid-then-partially-refunded", isStalePaymentFailure(
    { paid_at: "2026-08-01T00:00:00Z", payment_intent_id: "pi_6", refund_status: "partial",
      refunded_at: "2026-08-10T00:00:00Z", payment_failed_at: "2026-07-31T00:00:00Z",
      payment_failure_reason: "Card declined" }), false);

  // 7/8 — disputes always need an operator.
  t("7 paid-then-disputed (dispute_id)", isStalePaymentFailure(
    { paid_at: "2026-08-01T00:00:00Z", payment_intent_id: "pi_7", dispute_id: "dp_1",
      payment_failed_at: "2026-07-31T00:00:00Z", payment_failure_reason: "Card declined" }), false);
  t("8 paid-then-disputed (status)", isStalePaymentFailure(
    { paid_at: "2026-08-01T00:00:00Z", payment_intent_id: "pi_8", status: "disputed",
      payment_failed_at: "2026-07-31T00:00:00Z", payment_failure_reason: "Card declined" }), false);

  // 9 — THE REVERSAL PATH. Admin "mark as unpaid/failed" clears paid_at, so a
  //     genuine later failure drops straight back to warning.
  t("9 admin marked unpaid after paying", isStalePaymentFailure(
    { paid_at: null, payment_intent_id: null, status: "lead",
      payment_failed_at: "2026-08-16T00:00:00Z",
      payment_failure_reason: "Manually marked as unpaid/failed by admin (Hamza Farid)" }), false);

  // 10 — multiple failed attempts then success: still one stale marker.
  t("10 multiple attempts then paid", isStalePaymentFailure(
    { paid_at: "2026-08-15T08:00:00Z", payment_intent_id: "pi_10", status: "processing",
      payment_failed_at: "2026-08-15T07:30:00Z",
      payment_failure_reason: "Card declined (attempt 3 of 3)" }), true);

  // 11 — multiple attempts, never paid.
  t("11 multiple attempts, never paid", isStalePaymentFailure(
    { paid_at: null, status: "lead", payment_failed_at: "2026-08-15T07:30:00Z",
      payment_failure_reason: "Card declined (attempt 3 of 3)" }), false);

  // 12 — reason present with no timestamp (older rows) still suppresses once paid.
  t("12 reason only, paid", isStalePaymentFailure(
    { paid_at: "2026-08-15T08:00:00Z", payment_intent_id: "pi_12",
      payment_failure_reason: "Card declined" }), true);

  // 13 — timestamp only, no reason.
  t("13 timestamp only, paid", isStalePaymentFailure(
    { paid_at: "2026-08-15T08:00:00Z", payment_intent_id: "pi_13",
      payment_failed_at: "2026-08-15T07:00:00Z" }), true);

  // 14 — cancelled order that had failed: not "paid", keep showing.
  t("14 cancelled with failure", isStalePaymentFailure(
    { paid_at: null, status: "cancelled", payment_failed_at: "2026-08-15T07:00:00Z",
      payment_failure_reason: "Card declined" }), false);

  if (fails.length) {
    console.error(`${RED}✗ stale-failure suppression LOGIC FAILED${RESET} (${fails.length}/${n})`);
    for (const f of fails) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(`${GREEN}✓ stale-failure suppression logic passed${RESET} (${n} scenarios)`);
  return 0;
}

// ── NEGATIVE CONTROLS ────────────────────────────────────────────────────────

function runSelfTest() {
  const fails = [];

  // NC1 — the PRE-FIX behaviour (show whenever a marker exists) MUST fail the
  //       screenshot case. If it does not, the logic suite proves nothing.
  const preFix = (o) => !!o.payment_failed_at;
  const screenshot = {
    paid_at: "2026-08-15T04:57:00Z", payment_intent_id: "pi_3", status: "processing",
    payment_failed_at: "2026-08-15T05:00:23Z",
    payment_failure_reason: "Customer cancelled checkout on Klarna",
  };
  if (preFix(screenshot) === !isStalePaymentFailure(screenshot)) {
    fails.push("NC1: pre-fix behaviour agrees with the fix — suppression control is vacuous");
  }

  // NC2 — a timestamp-ordering implementation MUST get the screenshot case wrong.
  //       This is the whole reason the predicate ignores clock order.
  const byOrdering = (o) =>
    !!o.paid_at && !!o.payment_failed_at && Date.parse(o.paid_at) >= Date.parse(o.payment_failed_at);
  if (byOrdering(screenshot) === true) {
    fails.push("NC2: timestamp-ordering control is vacuous (it should MISS the Klarna case)");
  }

  // NC3 — a payment_intent_id-based implementation MUST wrongly suppress the
  //       unpaid cancelled-checkout case.
  const byPi = (o) => (!!o.payment_failed_at || !!o.payment_failure_reason) && !!o.payment_intent_id;
  const unpaidCancelled = {
    paid_at: null, payment_intent_id: "pi_2", status: "lead",
    payment_failed_at: "2026-08-15T05:00:23Z",
    payment_failure_reason: "Customer cancelled checkout on Klarna",
  };
  if (byPi(unpaidCancelled) === false) {
    fails.push("NC3: payment_intent_id control is vacuous (it should WRONGLY suppress an unpaid failure)");
  }
  if (isStalePaymentFailure(unpaidCancelled) === true) {
    fails.push("NC3b: the real predicate suppressed an UNPAID failure");
  }

  // NC4 — dispute/refund screening must be load-bearing, not incidental.
  const noScreening = (o) => (!!o.payment_failed_at || !!o.payment_failure_reason) && !!o.paid_at;
  const disputed = {
    paid_at: "2026-08-01T00:00:00Z", payment_intent_id: "pi_7", dispute_id: "dp_1",
    payment_failed_at: "2026-07-31T00:00:00Z", payment_failure_reason: "Card declined",
  };
  if (noScreening(disputed) === false) {
    fails.push("NC4: dispute-screening control is vacuous (it should WRONGLY suppress a dispute)");
  }
  if (isStalePaymentFailure(disputed) === true) {
    fails.push("NC4b: the real predicate suppressed a DISPUTED order");
  }

  // NC5 — the static REQUIRED patterns must actually match the shipped source.
  //       A guard whose anchor drifted reports a silent NO-OP.
  for (const { file, label, re } of REQUIRED) {
    if (!re.test(read(file))) fails.push(`NC5: required anchor "${label}" does not match shipped source`);
  }

  // NC6 — the FORBIDDEN patterns must match the bad code they are meant to
  //       reject, otherwise they can never fire.
  const BAD_SAMPLES = [
    ["timestamp ordering", "return o.paid_at >= o.payment_failed_at;", FORBIDDEN[0].re],
    ["bare PI suppression",
     "export function isStalePaymentFailure(o) { return !!o.payment_intent_id; }", FORBIDDEN[1].re],
  ];
  for (const [name, sample, re] of BAD_SAMPLES) {
    if (!re.test(sample)) fails.push(`NC6: forbidden control for "${name}" no longer matches the code it must reject`);
  }

  // NC7 — stripComments must remove a doc comment but keep a JSX condition,
  //       so FORBIDDEN cannot be tripped by prose (or defeated by it).
  const sample = "/* we do NOT use o.paid_at >= o.payment_failed_at */\nconst x = 1;";
  if (/paid_at\s*>=/.test(stripComments(sample))) fails.push("NC7: stripComments left comment prose behind");
  if (!/const x = 1;/.test(stripComments(sample))) fails.push("NC7b: stripComments ate real code");

  if (fails.length) {
    console.error(`${RED}✗ stale-failure suppression SELF-TEST FAILED${RESET}`);
    for (const f of fails) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(`${GREEN}✓ stale-failure suppression self-test passed${RESET} (7 negative controls)`);
  return 0;
}

const selfTest = process.argv.includes("--self-test");
let code = 0;
try {
  code |= runStatic();
  code |= runLogic();
  if (selfTest) code |= runSelfTest();
  if (code === 0) console.log(`${DIM}  contract: a failure marker is STALE iff paid_at is set AND payment state is plain "paid" — never by clock order, never by a bare PaymentIntent${RESET}`);
} catch (e) {
  console.error(`${RED}✗ stale-failure suppression guard error: ${e.message}${RESET}`);
  code = 1;
}
process.exit(code);
