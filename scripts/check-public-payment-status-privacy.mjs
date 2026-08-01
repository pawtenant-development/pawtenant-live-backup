// scripts/check-public-payment-status-privacy.mjs
//
// CHECK-PAYMENT-STATUS-PUBLIC-PII-MINIMISATION-001 — public payment-status
// privacy guard.
//
// ROOT CAUSE THIS GUARD PINS: `check-payment-status` runs with
// `verify_jwt=false`. That is correct and required — the Klarna "I've completed
// payment" button and the ESA/PSD thank-you pages call it with no customer
// session. But its response projection (`toPublicOrder`, added 2026-06-18 by
// THANK-YOU-SOURCE-OF-TRUTH) returned the whole customer record to ANY caller
// who knew a confirmation id, with no credentials at all:
//
//     first_name, last_name, email, price, plan_type, delivery_speed,
//     letter_type, coupon_code, coupon_discount, doctor_name, status, paid_at
//
// `letter_type` additionally disclosed ESA vs PSD — a health-adjacent service
// selection. The endpoint also echoed the Stripe `sessionId` and, on the error
// path, the raw Stripe/Postgres message.
//
//   P1  the function builds its response through an explicit allowlist.
//   P2  the allowlist returns ONLY approved keys.
//   P3  every response goes through the allowlist — no ad-hoc json() bodies.
//   P4  no order row is spread or serialized into a response.
//   P5  no forbidden PII / order-detail / Stripe key appears in any response.
//   P6  the error path returns a generic code, never the raw message.
//   P7  the orders SELECT does not even READ customer PII columns.
//   P8  logs never carry an email, a name, a raw row, or the request body.
//   P9  a full confirmation id is never logged — only a truncated ref.
//   P10 the frontend consumers no longer read PII from this endpoint.
//   P11 identifier binding (cross-order rejection) still exists.
//   P12 the paid-transition idempotency guard still exists.
//   P13 paid_at is still a SERVER timestamp.
//   P14 the declared public-endpoint contract (verify_jwt=false) is intact.
//   P15 no Stripe WRITE method is introduced.
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-public-payment-status-privacy.mjs             → guard (exit 1 on fail)
//   node scripts/check-public-payment-status-privacy.mjs --warn-only → audit (exit 0)
//   node scripts/check-public-payment-status-privacy.mjs --self-test → prove controls trip

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  fn: "supabase/functions/check-payment-status/index.ts",
  esaThankYou: "src/pages/assessment-thankyou/page.tsx",
  psdThankYou: "src/pages/psd-assessment-thankyou/page.tsx",
  klarnaTab: "src/pages/assessment/components/KlarnaPaymentTab.tsx",
};

function read(key, override) {
  if (override && override[key] !== undefined) return override[key];
  const abs = resolve(ROOT, F[key]);
  if (!existsSync(abs)) throw new Error(`missing required file: ${F[key]}`);
  // Normalize CRLF. The repo is checked out with autocrlf=true, so a guard that
  // matched raw bytes would behave differently on Windows and Linux — and the
  // planted negative controls (which anchor on "\n") would silently no-op.
  return readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
}

/** Strip comments so prose can never satisfy a code assertion. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** The body of the allowlist projection function. */
function allowlistBody(src) {
  const c = code(src);
  const i = c.indexOf("function toPublicPaymentStatus");
  if (i < 0) return "";
  const ret = c.indexOf("return {", i);
  if (ret < 0) return "";
  const end = c.indexOf("\n}", ret);
  return end > ret ? c.slice(ret, end) : "";
}

/**
 * Every argument passed to json(...) — i.e. every response body this function
 * can emit. Bounded scan: we take the text between `json(` and the matching
 * close by brace/paren depth, so nothing is missed and nothing runs away.
 */
function jsonCallArgs(src) {
  const c = code(src);
  const out = [];
  const re = /\bjson\(/g;
  let m;
  while ((m = re.exec(c)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < c.length && depth > 0) {
      const ch = c[i];
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") depth--;
      i++;
    }
    // Skip the json() helper's own definition (`function json(body, ...)`) and
    // any METHOD call such as `req.json()` — neither is a response body.
    const before = c.slice(Math.max(0, m.index - 12), m.index);
    if (/function\s+$/.test(before)) continue;
    if (/\.\s*$/.test(before)) continue;
    const arg = c.slice(start, i - 1);
    if (arg.trim() === "") continue;
    out.push(arg);
  }
  return out;
}

/** The console.* argument text in the function. */
function logCalls(src) {
  const c = code(src);
  return (c.match(/console\.(?:log|info|warn|error|debug)\([\s\S]{0,400}?\);/g) || []).join("\n");
}

const APPROVED_KEYS = ["paid", "paymentStatus", "reconciled", "nextStep", "code", "confirmationId"];

const FORBIDDEN_RESPONSE = [
  "first_name", "last_name", "firstName", "lastName", "full_name", "fullName",
  "email", "phone", "address", "city", "zip", "postal",
  "pet_name", "petName", "doctor_name", "doctorName", "provider_name", "doctor_id", "doctor_email",
  "letter_type", "letterType", "plan_type", "planType", "delivery_speed", "deliverySpeed",
  "price", "amount", "coupon_code", "coupon_discount", "discount",
  "payment_intent_id", "paymentIntentId", "checkout_session_id", "sessionId", "session_id",
  "subscription_id", "stripe_customer", "customer_id",
  "assessment_answers", "notes", "letter_url", "verification_id", "package_key",
  "paid_at", "refunded_at", "order_id", "orderId",
];

const CHECKS = [
  ["P1", "the response is built through an explicit allowlist function", (s) => {
    const c = code(s.fn);
    return /function\s+toPublicPaymentStatus\s*\(/.test(c) && allowlistBody(s.fn).length > 0;
  }],

  ["P2", "the allowlist returns ONLY approved keys", (s) => {
    const body = allowlistBody(s.fn);
    if (!body) return false;
    const keys = [...body.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]);
    if (keys.length === 0) return false;
    return keys.every((k) => APPROVED_KEYS.includes(k));
  }],

  ["P3", "every response body goes through the allowlist", (s) => {
    const args = jsonCallArgs(s.fn);
    if (args.length === 0) return false;
    return args.every((a) => a.trim().startsWith("toPublicPaymentStatus("));
  }],

  ["P4", "no order row is spread or serialized into a response", (s) => {
    const c = code(s.fn);
    if (/\.\.\.\s*(?:order|data|row)\b/.test(c)) return false;
    if (/\border\s*:\s*(?:order|data|toPublicOrder)/.test(c)) return false;
    return !/toPublicOrder/.test(c);
  }],

  ["P5", "no forbidden PII / order-detail / Stripe key appears in any response", (s) => {
    // Inspect the KEYS each response body emits. A property ACCESS used as a
    // server-side condition (`order?.paid_at ? ... : ...`) discloses nothing and
    // is preceded by a dot, so the leading-delimiter class excludes it.
    const emitted = new Set();
    for (const arg of jsonCallArgs(s.fn)) {
      for (const m of arg.matchAll(/(?:^|[{,\s])([A-Za-z_$][\w$]*)\s*:/g)) {
        emitted.add(m[1]);
      }
    }
    return !FORBIDDEN_RESPONSE.some((k) => emitted.has(k));
  }],

  ["P6", "the error path returns a generic code, never the raw message", (s) => {
    const c = code(s.fn);
    // The caught message may be logged, but must never be returned.
    const args = jsonCallArgs(s.fn).join("\n");
    const leaksMessage = /\b(?:error|message)\s*:\s*(?:message|err|error)\b/.test(args)
      || /\bmessage\b/.test(args);
    const hasGenericErrorCode = /code:\s*["']error["']/.test(c);
    return !leaksMessage && hasGenericErrorCode;
  }],

  ["P7", "the orders SELECT does not read customer PII columns", (s) => {
    const c = code(s.fn);
    const m = c.match(/\.select\(\s*["'`]([^"'`]*)["'`]/);
    if (!m) return false;
    const cols = m[1].split(",").map((x) => x.trim());
    const banned = ["first_name", "last_name", "email", "phone", "price", "plan_type",
      "delivery_speed", "letter_type", "coupon_code", "coupon_discount", "doctor_name"];
    return !cols.some((col) => banned.includes(col));
  }],

  ["P8", "logs never carry an email, a name, a raw row, or the request body", (s) => {
    const logs = logCalls(s.fn);
    return !/\b(?:email|first_name|last_name|phone|body|order\s*\)|JSON\.stringify)\b/.test(logs)
      && !/\$\{\s*(?:order|body|data)\s*\}/.test(logs);
  }],

  ["P9", "a full confirmation id is never logged — only a truncated ref", (s) => {
    const logs = logCalls(s.fn);
    // Any interpolation of a confirmation id must go through logRef().
    const raw = /\$\{[^}]*\bconfirmation_?[Ii]d\b[^}]*\}/g;
    const hits = logs.match(raw) || [];
    return /function\s+logRef\s*\(/.test(code(s.fn))
      && hits.every((h) => h.includes("logRef("));
  }],

  ["P10", "the frontend consumers no longer read PII from this endpoint", (s) => {
    const esa = code(s.esaThankYou);
    const psd = code(s.psdThankYou);
    const klarna = code(s.klarnaTab);
    const readsPii = /dbOrder\s*\?\.\s*(?:first_name|last_name|email|price|doctor_name|plan_type|delivery_speed|letter_type)/;
    const declaresOrderShape = /\bj\.order\b|order\?\s*:\s*PublicOrder|interface\s+PublicOrder\b/;
    return !readsPii.test(esa) && !readsPii.test(psd)
      && !declaresOrderShape.test(esa) && !declaresOrderShape.test(psd)
      && !declaresOrderShape.test(klarna);
  }],

  ["P11", "identifier binding (cross-order rejection) still exists", (s) => {
    const c = code(s.fn);
    const sessionRefusal = /requestedSessionId\s*!==\s*storedSessionId[\s\S]{0,200}refuseMismatch/.test(c);
    const piRefusal = /requestedPiId\s*!==\s*storedPiId[\s\S]{0,200}refuseMismatch/.test(c);
    const boundGate = /if\s*\(\s*stripePaid\s*&&\s*evidenceBound\s*&&\s*order\s*&&\s*!order\.paid_at/.test(c);
    return sessionRefusal && piRefusal && boundGate;
  }],

  ["P12", "the paid-transition idempotency guard still exists", (s) =>
    /\.update\(patch\)[\s\S]{0,220}\.is\(\s*["']paid_at["']\s*,\s*null\s*\)/.test(code(s.fn))],

  ["P13", "paid_at is still a SERVER timestamp", (s) => {
    const c = code(s.fn);
    return /paid_at:\s*new\s+Date\(\)\.toISOString\(\)/.test(c)
      && !/paid_at:\s*(?:body\.|session\.|pi\.)/.test(c);
  }],

  ["P14", "the declared public-endpoint contract (verify_jwt=false) is intact", (s) =>
    /verify_jwt\s*=\s*false/.test(s.fn)],

  ["P15", "no Stripe WRITE method is introduced", (s) =>
    !/stripe\.(?:paymentIntents|checkout\.sessions|refunds|charges|subscriptions|customers)\.(?:create|update|cancel|del|capture|confirm)\s*\(/.test(code(s.fn))],
];

// ── Planted negative controls — each MUST trip its own check ────────────────
const CONTROLS = [
  ["P2", "email is added to the allowlist", (b) => ({
    fn: b.fn.replace("    code: opts.code,", "    email: opts.email,\n    code: opts.code,"),
  })],
  ["P2", "first_name is added to the allowlist", (b) => ({
    fn: b.fn.replace("    code: opts.code,", "    first_name: opts.firstName,\n    code: opts.code,"),
  })],
  ["P2", "last_name is added to the allowlist", (b) => ({
    fn: b.fn.replace("    code: opts.code,", "    last_name: opts.lastName,\n    code: opts.code,"),
  })],
  ["P2", "price is added to the allowlist", (b) => ({
    fn: b.fn.replace("    code: opts.code,", "    price: opts.price,\n    code: opts.code,"),
  })],
  ["P5", "payment_intent_id is added to a response body", (b) => ({
    fn: b.fn.replace(
      '        toPublicPaymentStatus({ paid: true, code: "paid", echoConfirmationId: confirmationId }),',
      '        { ...toPublicPaymentStatus({ paid: true, code: "paid", echoConfirmationId: confirmationId }), payment_intent_id: order.payment_intent_id },',
    ),
  })],
  ["P4", "the order row is spread into a response", (b) => ({
    fn: b.fn.replace(
      '        toPublicPaymentStatus({ paid: true, code: "paid", echoConfirmationId: confirmationId }),',
      '        { ...order, paid: true },',
    ),
  })],
  ["P8", "the raw order row is logged", (b) => ({
    fn: b.fn.replace(
      "        console.warn(`[check-payment-status] orders lookup failed for ${logRef(confirmationId)}`);",
      "        console.warn(`[check-payment-status] lookup`, JSON.stringify(order));",
    ),
  })],
  ["P9", "a full confirmation id is logged", (b) => ({
    fn: b.fn.replace(
      "        console.warn(`[check-payment-status] orders lookup failed for ${logRef(confirmationId)}`);",
      "        console.warn(`[check-payment-status] orders lookup failed for ${confirmationId}`);",
    ),
  })],
  ["P10", "the ESA thank-you page reintroduces name personalization from the endpoint", (b) => ({
    esaThankYou: b.esaThankYou.replace(
      '  const firstName = resolvedState.firstName || "there";',
      '  const firstName = dbOrder?.first_name || resolvedState.firstName || "there";',
    ),
  })],
  ["P10", "the PSD thank-you page reintroduces the PublicOrder shape", (b) => ({
    psdThankYou: b.psdThankYou.replace(
      "declare global {",
      "interface PublicOrder { email?: string | null }\ndeclare global {",
    ),
  })],
  ["P11", "the cross-order identifier binding is removed", (b) => ({
    fn: b.fn.replace(
      "if (order && storedSessionId && requestedSessionId && requestedSessionId !== storedSessionId) {",
      "if (false) {",
    ),
  })],
  ["P12", "the idempotency guard on the paid transition is dropped", (b) => ({
    fn: b.fn.replace(/\n\s*\.is\("paid_at", null\)/, ""),
  })],
  ["P14", "the public-endpoint contract is flipped to verify_jwt=true", (b) => ({
    fn: b.fn.replace(/verify_jwt=false/g, "verify_jwt=true"),
  })],
  ["P6", "the raw error message is returned to the caller", (b) => ({
    fn: b.fn.replace(
      '      toPublicPaymentStatus({ paid: false, code: "error", echoConfirmationId: "" }),',
      '      { error: message, paid: false },',
    ),
  })],
  ["P7", "the orders SELECT starts reading PII again", (b) => ({
    fn: b.fn.replace(
      '.select("id, confirmation_id, checkout_session_id, payment_intent_id, paid_at, status")',
      '.select("id, confirmation_id, checkout_session_id, payment_intent_id, paid_at, status, first_name, email")',
    ),
  })],
  ["P3", "an ad-hoc response body bypasses the allowlist", (b) => ({
    fn: b.fn.replace(
      '        toPublicPaymentStatus({ paid: true, code: "paid", echoConfirmationId: confirmationId }),',
      '        { paid: true, status: order.status },',
    ),
  })],
  ["P15", "a Stripe write method is introduced", (b) => ({
    fn: b.fn.replace(
      "const pi = await stripe.paymentIntents.retrieve(piIdToProbe);",
      "const pi = await stripe.paymentIntents.create({ amount: 1 });",
    ),
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

const NAME = "check-public-payment-status-privacy";

try {
  const base = loadAll();

  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST trip its check\n`);
    let bad = 0;
    for (const [target, label, mutate] of CONTROLS) {
      const patch = mutate(base);
      // A control that fails to actually modify the source proves nothing.
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
