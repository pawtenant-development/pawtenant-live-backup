// scripts/check-ghl-qa-fixture-suppression.mjs
//
// ADMIN-ORDER-PENDING-DELIVERY-LIVE-DOCUMENT-LIFECYCLE-QA-003 — CRM blast guard.
//
// WHAT THIS PINS. Verifying "Approve & Deliver" on LIVE runs the real
// admin-review-document path, which fires an `order_completed` event into
// ghl-webhook-proxy. That function makes TWO outbound calls to GoHighLevel:
//
//     1. upsertGhlContact()  → POST services.leadconnectorhq.com/contacts/upsert
//     2. fetchWithRetry()    → POST GHL_WEBHOOK_URL   (workflow trigger)
//
// For a synthetic QA fixture both are unacceptable: they create a real contact,
// apply "Letter Sent" / "Completed" tags and enrol the fixture in production
// workflows. A CRM write cannot be undone by database or Storage cleanup, and a
// workflow that fires can reach a real person.
//
// ghl-webhook-proxy therefore suppresses BOTH writes for a RESERVED
// confirmation-id namespace. This guard exists because the danger is not that
// the suppression disappears — it is that it gets WIDENED (keyed on an email
// domain, a price, a client flag) until it starts swallowing genuine orders, or
// NARROWED in placement so that one of the two outbound calls slips through.
//
//   R1  the reserved-namespace pattern is the exact anchored literal.
//   R2  the predicate is type-safe and defaults to false.
//   R3  the suppression is evaluated BEFORE the contact upsert.
//   R4  the suppression is evaluated BEFORE the workflow webhook fire.
//   R5  the suppressed branch returns — no GHL call can follow it.
//   R6  the suppressed response is honest and never fabricates a delivery.
//   R7  the match is not keyed on email, domain, price or any client flag.
//   R8  every suppressed event writes internal audit evidence.
//   R9  no global GHL kill switch is introduced.
//   R10 BEHAVIOURAL: real production confirmation-id formats are NOT suppressed.
//   R11 no TEST project reference or TEST-only suppression is ported here.
//
// Static assertions plus one behavioural test of the extracted pattern — no
// network, no DB.
//
// Usage:
//   node scripts/check-ghl-qa-fixture-suppression.mjs             → guard (exit 1 on fail)
//   node scripts/check-ghl-qa-fixture-suppression.mjs --warn-only → audit (exit 0)
//   node scripts/check-ghl-qa-fixture-suppression.mjs --self-test → prove controls trip

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  proxy: "supabase/functions/ghl-webhook-proxy/index.ts",
  review: "supabase/functions/admin-review-document/index.ts",
};

function read(key, override) {
  if (override && override[key] !== undefined) return override[key];
  const abs = resolve(ROOT, F[key]);
  if (!existsSync(abs)) throw new Error(`missing required file: ${F[key]}`);
  // Normalize CRLF. This repo checks out with autocrlf=true, so a guard that
  // matched raw bytes would behave differently on Windows and on the Linux
  // build box — and the planted controls (which anchor on "\n") would silently
  // become no-ops.
  return readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
}

/** Strip JS/TS comments so PROSE can never satisfy a CODE assertion. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const has = (s, ...n) => n.every((x) => s.includes(x));
const lacks = (s, ...n) => n.every((x) => !s.includes(x));

/**
 * Ordering assertion that FAILS CLOSED.
 *
 * `indexOf(a) < indexOf(b)` is the classic trap: a missing anchor yields -1,
 * and -1 < anything is true, so the check passes precisely when the code it was
 * meant to protect has been deleted. Both anchors must exist AND be ordered.
 */
function orderedBefore(src, a, b) {
  const i = src.indexOf(a);
  const j = src.indexOf(b);
  return i >= 0 && j >= 0 && i < j;
}

/**
 * Slice an exact region between two anchors, FAILING CLOSED.
 *
 * A fixed-width `slice(i, i + N)` window is its own trap: it silently runs past
 * the construct under test into neighbouring code, so the assertion ends up
 * describing whatever happens to sit nearby. Returning null on a missing anchor
 * makes every dependent check fail rather than pass vacuously.
 */
function sliceBetween(src, startAnchor, endAnchor) {
  const i = src.indexOf(startAnchor);
  if (i < 0) return null;
  const j = src.indexOf(endAnchor, i + startAnchor.length);
  if (j < 0) return null;
  return src.slice(i, j);
}

/** The suppressed branch, bounded by the code that follows it. */
const branchOf = (c) =>
  sliceBetween(c, "if (isReservedQaFixture(confirmationId))", "let contactUpsertResult");

/** The predicate body, bounded by the next function declaration. */
const predicateOf = (c) =>
  sliceBetween(c, "function isReservedQaFixture", "function getGhlUrl");

/** Pull the live pattern out of the source so R10 tests what actually ships. */
function extractPattern(src) {
  const m = src.match(/QA_FIXTURE_CONFIRMATION_ID_RE\s*=\s*\/(.+?)\/([gimsuy]*)\s*;/);
  if (!m) return null;
  try { return new RegExp(m[1], m[2]); } catch { return null; }
}

// Real, production-shaped confirmation ids. NONE of these may ever be
// suppressed — each corresponds to a genuine paying customer whose CRM sync
// must continue to work. Formats taken from the live generators:
//   `PT-${Date.now().toString(36).toUpperCase()}`        → PT-MR1HX27H
//   `PT-PSD${rand}`                                      → PT-PSDS4IZWGO8
//   `PT-${ts}-R${n}`  (create-returning-order)           → PT-MS2L71J8-RLP
const MUST_NOT_SUPPRESS = [
  "PT-MR1HX27H", "PT-MPNI2THL", "PT-MQ2OB1KJ", "PT-MRGR9PZC",
  "PT-PSDS4IZWGO8", "PT-PSDAEUFNWO1", "PT-PSD6CQGBK9A",
  "PT-MS2L71J8-RLP",
  // near-miss probes around the reserved namespace
  "PT-LIVE-PENDINGQA-", "PT-LIVE-PENDINGQA-ABC", "PT-LIVE-PENDINGQA-03X",
  "XPT-LIVE-PENDINGQA-03", "PT-LIVE-PENDINGQA-03 ", "",
];

const MUST_SUPPRESS = ["PT-LIVE-PENDINGQA-03", "PT-LIVE-PENDINGQA-02"];

const CHECKS = [
  ["R1", "the reserved-namespace pattern is the exact anchored literal", (S) => {
    const c = code(S.proxy);
    return has(c, "const QA_FIXTURE_CONFIRMATION_ID_RE = /^PT-LIVE-PENDINGQA-\\d{2,4}$/;");
  }],

  ["R2", "the predicate is type-safe and defaults to false", (S) => {
    const fn = predicateOf(code(S.proxy));
    if (!fn) return false;
    return has(fn, 'if (typeof confirmationId !== "string") return false;',
      "QA_FIXTURE_CONFIRMATION_ID_RE.test(confirmationId.trim())");
  }],

  ["R3", "the suppression is evaluated BEFORE the contact upsert", (S) =>
    orderedBefore(code(S.proxy), "if (isReservedQaFixture(confirmationId))", "await upsertGhlContact(")],

  ["R4", "the suppression is evaluated BEFORE the workflow webhook fire", (S) =>
    orderedBefore(code(S.proxy), "if (isReservedQaFixture(confirmationId))", "await fetchWithRetry(")],

  ["R5", "the suppressed branch returns before any GHL call", (S) => {
    const branch = branchOf(code(S.proxy));
    if (!branch) return false;
    // Nothing inside the branch may reach GoHighLevel, and it must terminate
    // the request rather than fall through to the normal path.
    return lacks(branch, "upsertGhlContact", "fetchWithRetry", "leadconnectorhq", "ghlUrl")
      && branch.includes("return new Response(");
  }],

  ["R6", "the suppressed response is honest and fabricates no delivery", (S) => {
    const branch = branchOf(code(S.proxy));
    if (!branch) return false;
    return has(branch, "suppressed: true", "forwardedToGhl: false", "contactUpserted: false",
      'reason: "reserved_qa_fixture_confirmation_id"')
      // never claim a GHL status or a synced contact for a suppressed event
      && lacks(branch, "ghlStatus:", "contactId:", "tagsSent:");
  }],

  ["R7", "the match is not keyed on email, domain, price or a client flag", (S) => {
    const c = code(S.proxy);
    const fn = predicateOf(c);
    if (!fn) return false;
    // The predicate takes ONE argument and consults nothing else.
    return lacks(fn, "email", "@", ".invalid", "price", "amount",
      "Deno.env", "payload", "body", "orderStatus")
      // and the call site passes only the confirmation id
      && has(c, "isReservedQaFixture(confirmationId)")
      && !/isReservedQaFixture\([^)]*,/.test(c);
  }],

  ["R8", "every suppressed event writes internal audit evidence", (S) => {
    const c = code(S.proxy);
    const branch = branchOf(c);
    if (!branch) return false;
    // The audit write must happen inside the branch, before it returns.
    return orderedBefore(branch, "await logSuppressedQaFixture(", "return new Response(")
      && has(c, 'action: "ghl_event_suppressed_qa_fixture"',
        'source: "ghl_webhook_proxy"',
        'actor_name: "PawTenant System"',
        "forwarded_to_ghl: false")
      // audit_logs.actor_name is NOT NULL — an omitted actor silently drops the row
      && orderedBefore(c, 'from("audit_logs")', 'action: "ghl_event_suppressed_qa_fixture"');
  }],

  ["R9", "no global GHL kill switch is introduced", (S) => {
    const c = code(S.proxy);
    // The webhook URL is still required and still resolved per event type; no
    // env flag, settings row or blanket short-circuit may disable GHL wholesale.
    return has(c, 'Deno.env.get("GHL_WEBHOOK_URL")', "if (!ghlUrl) {")
      && lacks(c, "GHL_DISABLED", "GHL_ENABLED", "DISABLE_GHL", "GHL_DRY_RUN",
        "SUPPRESS_ALL", "workflow_settings", "ghl_outbound_enabled");
  }],

  ["R10", "real production confirmation-id formats are NOT suppressed", (S) => {
    const re = extractPattern(S.proxy);
    if (!re) return false;
    const test = (v) => { re.lastIndex = 0; return re.test(v); };
    return MUST_SUPPRESS.every(test) && MUST_NOT_SUPPRESS.every((v) => !test(v));
  }],

  ["R11", "no TEST project reference or TEST-only suppression is ported here", (S) =>
    Object.values(S).every((src) =>
      !src.includes("opudhofjbydrljgleofq") &&
      !src.includes("TEST_SUPPRESS_EXTERNAL_NOTIFICATIONS"))],
];

// ── Planted negative controls. Each MUST trip exactly its check. ──────────
const CONTROLS = [
  ["R1", "the pattern is loosened to a bare prefix", (b) => ({
    proxy: b.proxy.replace(
      "const QA_FIXTURE_CONFIRMATION_ID_RE = /^PT-LIVE-PENDINGQA-\\d{2,4}$/;",
      "const QA_FIXTURE_CONFIRMATION_ID_RE = /PT-LIVE/;"),
  })],
  ["R2", "the predicate loses its type guard", (b) => ({
    proxy: b.proxy.replace(
      '  if (typeof confirmationId !== "string") return false;\n', ""),
  })],
  ["R3", "the suppression is moved below the contact upsert", (b) => ({
    proxy: b.proxy.replace(
      "if (isReservedQaFixture(confirmationId))", "if (false && isReservedQaFixtureMoved(confirmationId))"),
  })],
  ["R4", "the webhook fire is hoisted above the suppression", (b) => ({
    // Remove the guard entirely: fetchWithRetry then precedes nothing.
    proxy: b.proxy.replace("if (isReservedQaFixture(confirmationId)) {", "if (false) {"),
  })],
  ["R5", "a GHL contact upsert is smuggled into the suppressed branch", (b) => ({
    proxy: b.proxy.replace(
      "    await logSuppressedQaFixture({",
      "    await upsertGhlContact({ confirmationId, firstName: \"\", lastName: \"\", email: rawEmail, phone: \"\" });\n    await logSuppressedQaFixture({"),
  })],
  ["R6", "the suppressed response fakes a successful sync", (b) => ({
    proxy: b.proxy.replace(
      "        forwardedToGhl: false,", "        forwardedToGhl: true,\n        ghlStatus: 200,"),
  })],
  ["R7", "the predicate is widened to a fixture email domain", (b) => ({
    proxy: b.proxy.replace(
      "  return QA_FIXTURE_CONFIRMATION_ID_RE.test(confirmationId.trim());",
      '  if (confirmationId.includes("@") && confirmationId.endsWith(".test")) return true;\n  return QA_FIXTURE_CONFIRMATION_ID_RE.test(confirmationId.trim());'),
  })],
  ["R8", "the audit evidence write is removed", (b) => ({
    proxy: b.proxy.replace("    await logSuppressedQaFixture({", "    const _skip = ({"),
  })],
  ["R9", "a global GHL kill switch is added", (b) => ({
    proxy: b.proxy.replace(
      "  if (!ghlUrl) {",
      '  if (Deno.env.get("GHL_DISABLED") === "true") return new Response("{}");\n  if (!ghlUrl) {'),
  })],
  ["R10", "the pattern is widened to swallow every PT- order", (b) => ({
    proxy: b.proxy.replace(
      "const QA_FIXTURE_CONFIRMATION_ID_RE = /^PT-LIVE-PENDINGQA-\\d{2,4}$/;",
      "const QA_FIXTURE_CONFIRMATION_ID_RE = /^PT-.*$/;"),
  })],
  ["R11", "a TEST project reference is introduced", (b) => ({
    proxy: b.proxy + '\n// see opudhofjbydrljgleofq\n',
  })],
];

function loadAll(override) {
  const out = {};
  for (const k of Object.keys(F)) out[k] = read(k, override);
  return out;
}

function runChecks(src) {
  return CHECKS.map(([id, desc, fn]) => {
    let ok;
    try { ok = !!fn(src); } catch { ok = false; }
    return { id, desc, ok };
  });
}

const NAME = "check-ghl-qa-fixture-suppression";

try {
  const base = loadAll();

  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST trip its check\n`);
    let bad = 0;
    for (const [target, label, mutate] of CONTROLS) {
      const patch = mutate(base);
      // A control that fails to modify the source proves nothing.
      const changed = Object.keys(patch).some((k) => patch[k] !== base[k]);
      const results = runChecks({ ...base, ...patch });
      const hit = results.find((r) => r.id === target);
      const tripped = changed && hit && !hit.ok;
      if (!tripped) bad++;
      console.log(
        `  ${tripped ? "CAUGHT " : changed ? "MISSED " : "NO-OP  "} ${target.padEnd(4)} ${label}`,
      );
    }
    console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const results = runChecks(base);
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(4)} ${r.desc}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length && !WARN) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
