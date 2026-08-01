// scripts/check-resume-payment-authority.mjs
//
// ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001 — payment-authority guard.
//
// ROOT CAUSE THIS GUARD PINS: `get-resume-order` is reachable with the PUBLIC
// anon key, so its request body is attacker-controlled. It nevertheless wrote
// three client-supplied values straight onto the order row:
//
//     upsertPayload.paid_at          = body.paidAt;          // BROWSER CLOCK
//     upsertPayload.payment_intent_id = body.paymentIntentId; // unverified
//     upsertPayload.status            = body.status;          // "processing"
//
// Because trigger `orders_entitlement_snapshot_on_paid` fires on
// (old.paid_at IS NULL AND new.paid_at IS NOT NULL) and mints an IMMUTABLE
// entitlement snapshot whose FIRST classification wins permanently, a forged
// `paidAt` could mark an unpaid order paid, freeze the wrong package
// entitlement forever, and diverge order state from Stripe. A forged
// `paymentIntentId` additionally made isAlreadyPaid() true, which let an
// attacker BLOCK a customer's real checkout (create-payment-intent refuses an
// already-paid order).
//
//   R1  get-resume-order never writes orders.paid_at.
//   R2  get-resume-order never writes any other payment-evidence column.
//   R3  get-resume-order never reads, parses or date-coerces body.paidAt.
//   R4  a client may only set a NON-paid status (allowlist), and client paid
//       flags are never treated as evidence.
//   R5  a fail-closed assertion runs BEFORE the orders upsert.
//   R6  get-resume-order owns no payment verification of its own — it holds no
//       Stripe client and delegates to the authoritative reconciler.
//   R7  get-resume-order cannot assign a provider or unlock documents.
//   R8  get-resume-order cannot set package entitlement / billing plan.
//   R9  check-payment-status REFUSES a client identifier that contradicts the
//       identifier already stored on the order.
//   R10 check-payment-status reconciles only on proven binding — stored id, or
//       server-stamped Stripe metadata.confirmation_id for THIS order.
//   R11 paid_at is always a SERVER timestamp, never client- or Stripe-echoed.
//   R12 the PaymentIntent branch accepts ONLY status === "succeeded".
//   R13 the paid transition is idempotent — guarded by .is("paid_at", null),
//       so the immutable snapshot trigger can fire at most once.
//   R14 no Stripe WRITE method is introduced in either function.
//   R15 the frontend resume payloads no longer send paidAt or a paid status.
//   R16 no LIVE project reference, and no Pending Delivery / portal / frozen
//       file is claimed by this task.
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-resume-payment-authority.mjs             → guard (exit 1 on fail)
//   node scripts/check-resume-payment-authority.mjs --warn-only → audit (exit 0)
//   node scripts/check-resume-payment-authority.mjs --self-test → prove controls trip

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  resume: "supabase/functions/get-resume-order/index.ts",
  reconciler: "supabase/functions/check-payment-status/index.ts",
  esaCheckout: "src/pages/assessment/page.tsx",
  psdCheckout: "src/pages/psd-assessment/components/PSDStep3Checkout.tsx",
  frozenModal: "src/pages/admin-orders/components/OrderDetailModal.tsx",
  frozenAnalytics: "src/pages/admin-orders/components/AnalyticsTab.tsx",
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

/** Strip `//` line comments and block comments so prose can never satisfy a
 *  code assertion (this guard's whole job is to read CODE, not intent). */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** The upsert-payload construction region of get-resume-order. */
function upsertRegion(src) {
  const c = code(src);
  const start = c.indexOf("const upsertPayload");
  const end = c.indexOf('.upsert(upsertPayload');
  return start >= 0 && end > start ? c.slice(start, end) : "";
}

/** The body of saveOrderToSupabase / handlePaymentSuccess request payloads. */
function paymentPayload(src, marker) {
  const c = code(src);
  const i = c.indexOf(marker);
  if (i < 0) return "";
  return c.slice(i, i + 3500);
}

const CHECKS = [
  ["R1", "get-resume-order never writes orders.paid_at", (s) => {
    const c = code(s.resume);
    // Every shape a write could take: object literal key, dot assignment, and
    // computed-key assignment. Reads (`order?.paid_at`, `!order.paid_at`) and
    // the type annotation (`paid_at?: string`) are untouched by these.
    return !/\bpaid_at\s*:/.test(c)
      && !/\.paid_at\s*=[^=]/.test(c)
      && !/\[\s*["']paid_at["']\s*\]\s*=[^=]/.test(c);
  }],

  ["R2", "get-resume-order never writes another payment-evidence column", (s) => {
    const r = upsertRegion(s.resume);
    if (!r) return false;
    const forbidden = [
      /payment_intent_id\s*=/,
      /payment_intent_id\s*:/,
      /checkout_session_id\s*[:=]/,
      /subscription_id\s*[:=]/,
    ];
    return !forbidden.some((re) => re.test(r));
  }],

  ["R3", "get-resume-order never reads, parses or date-coerces body.paidAt", (s) => {
    // Testing whether the field is PRESENT (shape detection, used to route the
    // request and to log that the claim was ignored) is legitimate. Touching its
    // VALUE is not. Strip the two legal presence tests; any surviving reference
    // to body.paidAt means the value itself is being consumed.
    const c = code(s.resume)
      .replace(/!!\s*body\.paidAt\b/g, "")
      .replace(/body\.paidAt\s*!==\s*undefined/g, "")
      .replace(/body\.paidAt\s*===\s*undefined/g, "");
    return !/body\.paidAt/.test(c);
  }],

  ["R4", "a client may only set a NON-paid status, via an allowlist", (s) => {
    const c = code(s.resume);
    const hasAllowlist = /CLIENT_SETTABLE_STATUSES\s*=\s*new\s+Set\s*\(/.test(c);
    // The allowlist must not contain a paid workflow status.
    const setLiteral = (c.match(/CLIENT_SETTABLE_STATUSES\s*=\s*new\s+Set\s*\(\[([^\]]*)\]/) || [])[1] || "";
    const leaksPaid = /processing|completed|paid/i.test(setLiteral);
    // status must be written only through the allowlist gate.
    const gated = /CLIENT_SETTABLE_STATUSES\.has\s*\(\s*body\.status\s*\)[\s\S]{0,160}upsertPayload\.status\s*=\s*body\.status/.test(c);
    const ungated = /(^|[^.\w])upsertPayload\.status\s*=\s*body\.status/.test(
      c.replace(/CLIENT_SETTABLE_STATUSES\.has\s*\(\s*body\.status\s*\)[\s\S]{0,160}?upsertPayload\.status\s*=\s*body\.status/, ""),
    );
    return hasAllowlist && !leaksPaid && gated && !ungated;
  }],

  ["R5", "a fail-closed assertion runs BEFORE the orders upsert", (s) => {
    const c = code(s.resume);
    const declared = /function\s+assertNoClientPaymentColumns/.test(c)
      && /throw\s+new\s+Error/.test(c.slice(c.indexOf("function assertNoClientPaymentColumns")));
    const call = c.indexOf("assertNoClientPaymentColumns(upsertPayload)");
    const upsert = c.indexOf(".upsert(upsertPayload");
    return declared && call > 0 && upsert > call;
  }],

  ["R6", "get-resume-order holds no Stripe client and delegates reconciliation", (s) => {
    const c = code(s.resume);
    const noStripe = !/from\s+["']https:\/\/esm\.sh\/stripe/.test(c) && !/new\s+Stripe\s*\(/.test(c);
    const delegates = /functions\/v1\/check-payment-status/.test(c)
      && /delegatePaymentReconciliation/.test(c);
    return noStripe && delegates;
  }],

  ["R7", "get-resume-order cannot assign a provider or unlock documents", (s) => {
    const r = upsertRegion(s.resume);
    if (!r) return false;
    return !/letter_url\s*[:=]/.test(r)
      && !/customer_visible\s*[:=]/.test(r)
      && !/doctor_id\s*[:=]/.test(r)
      && !/assigned_at\s*[:=]/.test(r);
  }],

  ["R8", "get-resume-order cannot set package entitlement / billing plan", (s) => {
    const r = upsertRegion(s.resume);
    if (!r) return false;
    return !/package_key\s*[:=]/.test(r)
      && !/billing_plan\s*[:=]/.test(r)
      && !/purchased_pet_(?:tier|limit)\s*[:=]/.test(r);
  }],

  ["R9", "check-payment-status refuses a client identifier that contradicts the stored one", (s) => {
    const c = code(s.reconciler);
    const sessionRefusal = /requestedSessionId\s*!==\s*storedSessionId[\s\S]{0,200}refuseMismatch/.test(c);
    const piRefusal = /requestedPiId\s*!==\s*storedPiId[\s\S]{0,200}refuseMismatch/.test(c);
    // The old client-wins resolution must be gone.
    const clientWins = /sessionIdToProbe\s*=\s*requestedSessionId\s*\|\|/.test(c);
    return sessionRefusal && piRefusal && !clientWins;
  }],

  ["R10", "reconciliation requires proven binding (stored id or Stripe metadata)", (s) => {
    const c = code(s.reconciler);
    const bindsOnMetadata = /metaConfirmationId\s*===\s*order\.confirmation_id/.test(c)
      || /evidenceBound\s*=\s*[\s\S]{0,160}order\.confirmation_id/.test(c);
    const gatesWrite = /if\s*\(\s*stripePaid\s*&&\s*evidenceBound\s*&&\s*order\s*&&\s*!order\.paid_at/.test(c);
    const refusesUnbound = /stripePaid\s*&&\s*!evidenceBound[\s\S]{0,240}refuseMismatch/.test(c);
    return bindsOnMetadata && gatesWrite && refusesUnbound;
  }],

  ["R11", "paid_at is always a SERVER timestamp", (s) => {
    const c = code(s.reconciler);
    const serverStamped = /paid_at:\s*new\s+Date\(\)\.toISOString\(\)/.test(c);
    // Never echo a client value or a Stripe-reported epoch into paid_at.
    const echoed = /paid_at:\s*(?:body\.|[a-zA-Z_$]*\.metadata|session\.|pi\.|.*created)/.test(c);
    return serverStamped && !echoed;
  }],

  ["R12", "the PaymentIntent branch accepts ONLY status === succeeded", (s) => {
    const c = code(s.reconciler);
    const i = c.indexOf("paymentIntents.retrieve");
    if (i < 0) return false;
    const branch = c.slice(i, i + 1400);
    const strict = /stripePaid\s*=\s*pi\.status\s*===\s*["']succeeded["']/.test(branch);
    const loose = /pi\.status\s*!==\s*["']canceled["']/.test(branch)
      || /["']processing["']\s*[,)]?\s*\.includes/.test(branch);
    return strict && !loose;
  }],

  ["R13", "the paid transition is idempotent — guarded by .is(paid_at, null)", (s) => {
    const c = code(s.reconciler);
    return /\.update\(patch\)[\s\S]{0,220}\.is\(\s*["']paid_at["']\s*,\s*null\s*\)/.test(c);
  }],

  ["R14", "no Stripe WRITE method is introduced in either function", (s) => {
    const both = code(s.resume) + "\n" + code(s.reconciler);
    const writes = /stripe\.(?:paymentIntents|checkout\.sessions|refunds|charges|subscriptions|invoices|customers|prices)\.(?:create|update|cancel|del|capture|confirm)\s*\(/;
    return !writes.test(both);
  }],

  ["R15", "the frontend resume payloads no longer send paidAt or a paid status", (s) => {
    const esa = paymentPayload(s.esaCheckout, "const saveOrderToSupabase");
    const psd = paymentPayload(s.psdCheckout, "const handlePaymentSuccess");
    if (!esa || !psd) return false;
    const sendsPaidAt = /(^|[^\w.])paidAt\s*[,:]/m;
    const sendsPaidStatus = /status:\s*["'](?:processing|completed|paid)["']/;
    return !sendsPaidAt.test(esa) && !sendsPaidAt.test(psd)
      && !sendsPaidStatus.test(esa) && !sendsPaidStatus.test(psd);
  }],

  ["R16", "no LIVE project reference, and no frozen mega-file is claimed by this task", (s) => {
    const owned = code(s.resume) + code(s.reconciler) + code(s.esaCheckout) + code(s.psdCheckout);
    const liveRef = /cvwbozlbbmrjxznknouq/.test(owned);
    const TASK = "ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001";
    const frozenClaimed = s.frozenModal.includes(TASK) || s.frozenAnalytics.includes(TASK);
    return !liveRef && !frozenClaimed;
  }],
];

// ── Planted negative controls — each MUST trip its own check ────────────────
const CONTROLS = [
  ["R1", "the client paid_at write is reintroduced", (b) => ({
    resume: b.resume.replace(
      "assertNoClientPaymentColumns(upsertPayload);",
      "upsertPayload.paid_at = body.paidAt;\n      assertNoClientPaymentColumns(upsertPayload);",
    ),
  })],
  ["R2", "the client payment_intent_id write is reintroduced", (b) => ({
    resume: b.resume.replace(
      "const upsertPayload",
      "const _x = 0;\n      const upsertPayload",
    ).replace(
      "if (body.email !== undefined) upsertPayload.email = body.email;",
      "upsertPayload.payment_intent_id = body.paymentIntentId;\n      if (body.email !== undefined) upsertPayload.email = body.email;",
    ),
  })],
  ["R3", "body.paidAt is parsed into a Date", (b) => ({
    resume: b.resume.replace(
      "const clientClaimedPaid =",
      "const _parsed = new Date(body.paidAt ?? 0);\n      const clientClaimedPaid =",
    ),
  })],
  ["R4", "the client status allowlist is widened to the paid workflow status", (b) => ({
    resume: b.resume.replace(
      'new Set(["lead"])',
      'new Set(["lead", "processing"])',
    ),
  })],
  ["R4", "the status allowlist gate is bypassed", (b) => ({
    resume: b.resume.replace(
      /if \(body\.status !== undefined\) \{[\s\S]*?\n      \}/,
      "if (body.status !== undefined) upsertPayload.status = body.status;",
    ),
  })],
  ["R5", "the fail-closed assertion is removed", (b) => ({
    resume: b.resume.replace("assertNoClientPaymentColumns(upsertPayload);", ""),
  })],
  ["R6", "get-resume-order stops delegating and queries Stripe itself", (b) => ({
    resume: b.resume.replace(
      "functions/v1/check-payment-status",
      "v1/not-the-reconciler",
    ),
  })],
  ["R7", "the resume upsert starts unlocking documents", (b) => ({
    resume: b.resume.replace(
      "if (body.email !== undefined) upsertPayload.email = body.email;",
      "upsertPayload.customer_visible = true;\n      if (body.email !== undefined) upsertPayload.email = body.email;",
    ),
  })],
  ["R8", "the resume upsert starts setting package entitlement", (b) => ({
    resume: b.resume.replace(
      "if (body.email !== undefined) upsertPayload.email = body.email;",
      "upsertPayload.package_key = body.packageKey;\n      if (body.email !== undefined) upsertPayload.email = body.email;",
    ),
  })],
  ["R9", "the client session id wins over the stored one again", (b) => ({
    reconciler: b.reconciler
      .replace(/if \(order && storedSessionId && requestedSessionId[\s\S]*?\n    \}/, "")
      .replace(
        /const sessionIdToProbe = order\n      \? \(storedSessionId \|\| requestedSessionId\)\n      : requestedSessionId;/,
        "const sessionIdToProbe = requestedSessionId || (order?.checkout_session_id ?? \"\");",
      ),
  })],
  ["R10", "reconciliation no longer requires the evidence to be bound", (b) => ({
    reconciler: b.reconciler.replace(
      "if (stripePaid && evidenceBound && order && !order.paid_at && supabase) {",
      "if (stripePaid && order && !order.paid_at && supabase) {",
    ),
  })],
  ["R11", "paid_at echoes a Stripe-reported value", (b) => ({
    reconciler: b.reconciler.replace(
      "paid_at: new Date().toISOString(),",
      "paid_at: session.created,",
    ),
  })],
  ["R12", "the PaymentIntent branch accepts a non-succeeded status", (b) => ({
    reconciler: b.reconciler.replace(
      'stripePaid = pi.status === "succeeded";',
      'stripePaid = pi.status !== "canceled";',
    ),
  })],
  ["R13", "the idempotency guard on the paid transition is dropped", (b) => ({
    reconciler: b.reconciler.replace(/\n\s*\.is\("paid_at", null\)/, ""),
  })],
  ["R14", "a Stripe write method is introduced", (b) => ({
    reconciler: b.reconciler.replace(
      "const pi = await stripe.paymentIntents.retrieve(piIdToProbe);",
      "const pi = await stripe.paymentIntents.create({ amount: 1 });",
    ),
  })],
  ["R15", "the ESA checkout sends a browser paidAt again", (b) => ({
    esaCheckout: b.esaCheckout.replace(
      "          price,\n          paymentIntentId:",
      "          paidAt: new Date().toISOString(),\n          price,\n          paymentIntentId:",
    ),
  })],
  ["R15", "the PSD checkout sends a paid status again", (b) => ({
    // Anchor inside handlePaymentSuccess's resume payload specifically — an
    // earlier payload in this file also carries `letterType: "psd"`.
    psdCheckout: b.psdCheckout.replace(
      '          paymentMethod: "card",',
      '          paymentMethod: "card",\n          status: "processing",',
    ),
  })],
  ["R16", "a LIVE project reference is introduced", (b) => ({
    reconciler: b.reconciler.replace(
      "const SUPABASE_URL = Deno.env.get(\"SUPABASE_URL\") ?? \"\";",
      "const SUPABASE_URL = \"https://cvwbozlbbmrjxznknouq.supabase.co\";",
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

const NAME = "check-resume-payment-authority";

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
