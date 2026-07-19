// Unit tests for the fail-closed Stripe webhook authentication
// (STRIPE-WEBHOOK-SIGNATURE-FAIL-CLOSED-001).
// Runnable with:  node --test --experimental-strip-types verifyStripeSignature_test.ts  (Node >= 22.6)
//
// Proves the ONLY way to authenticate is: secret configured + Stripe-Signature
// present + Stripe's official verification succeeds against the untouched raw
// body. No unsigned-JSON fallback; verify is never bypassed; dispatch is only
// reachable on a verified event (auth.ok === true).

import { test } from "node:test";
import assert from "node:assert/strict";
import { authenticateStripeWebhook } from "./verifyStripeSignature.ts";

const SECRET = "whsec_test_dummy";
const RAW = '{"id":"evt_1","type":"payment_intent.succeeded","data":{"object":{"id":"pi_1"}}}';

// A verify spy: records the exact args it was called with; resolves to `event`
// or throws depending on config. Lets us prove verify-was/was-not-called and
// that the raw body reaches it unchanged.
function spyVerify(opts: { resolveTo?: unknown; throwErr?: boolean } = {}) {
  const calls: Array<{ body: string; sig: string; secret: string }> = [];
  const fn = (body: string, sig: string, secret: string): Promise<unknown> => {
    calls.push({ body, sig, secret });
    if (opts.throwErr) return Promise.reject(new Error("Stripe: no signatures found matching the expected signature"));
    return Promise.resolve(opts.resolveTo ?? { verified: true, type: "payment_intent.succeeded" });
  };
  return { fn, calls };
}

// 1) Missing webhook secret → BLOCK (500), verify never called.
test("sig 1 — missing STRIPE_WEBHOOK_SECRET blocks with 500 and never verifies", async () => {
  const v = spyVerify();
  const r = await authenticateStripeWebhook({ rawBody: RAW, sigHeader: "t=1,v1=abc", webhookSecret: undefined, verify: v.fn });
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 500);
  assert.equal((r as { reason: string }).reason, "missing_secret");
  assert.equal(v.calls.length, 0, "verify must not run without a secret");
});

// 2) Missing signature header → BLOCK (400), verify never called.
test("sig 2 — missing Stripe-Signature blocks with 400 and never verifies", async () => {
  for (const missing of [null, undefined, ""]) {
    const v = spyVerify();
    const r = await authenticateStripeWebhook({ rawBody: RAW, sigHeader: missing, webhookSecret: SECRET, verify: v.fn });
    assert.equal(r.ok, false);
    assert.equal((r as { status: number }).status, 400);
    assert.equal((r as { reason: string }).reason, "missing_signature");
    assert.equal(v.calls.length, 0, `verify must not run when signature is ${JSON.stringify(missing)}`);
  }
});

// 3) Invalid signature (verify throws) → BLOCK (400).
test("sig 3 — invalid signature (verify throws) blocks with 400 signature mismatch", async () => {
  const v = spyVerify({ throwErr: true });
  const r = await authenticateStripeWebhook({ rawBody: RAW, sigHeader: "t=1,v1=deadbeef", webhookSecret: SECRET, verify: v.fn });
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 400);
  assert.equal((r as { reason: string }).reason, "invalid_signature");
  assert.equal((r as { error: string }).error, "Webhook signature mismatch");
});

// 4) Valid signature → SUCCEEDS, returns the verified event.
test("sig 4 — valid signature returns the Stripe-verified event", async () => {
  const verifiedEvent = { id: "evt_1", type: "payment_intent.succeeded", data: { object: { id: "pi_1" } } };
  const v = spyVerify({ resolveTo: verifiedEvent });
  const r = await authenticateStripeWebhook({ rawBody: RAW, sigHeader: "t=1,v1=goodsig", webhookSecret: SECRET, verify: v.fn });
  assert.equal(r.ok, true);
  assert.deepEqual((r as { event: unknown }).event, verifiedEvent, "only the verified event is returned");
  assert.equal(v.calls.length, 1);
});

// 5) Valid JSON WITHOUT signature → BLOCK. Proves there is no JSON.parse fallback:
//    a perfectly-parseable body is still rejected because it isn't signed.
test("sig 5 — valid JSON without signature is BLOCKED (no unsigned JSON fallback)", async () => {
  const v = spyVerify();
  const r = await authenticateStripeWebhook({ rawBody: RAW, sigHeader: null, webhookSecret: SECRET, verify: v.fn });
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "missing_signature");
  assert.equal(v.calls.length, 0);
});

// 6) Malformed JSON without signature → BLOCK at signature enforcement, NOT a parse step.
test("sig 6 — malformed body without signature blocks at signature check, not parsing", async () => {
  const v = spyVerify();
  const r = await authenticateStripeWebhook({ rawBody: "not-json-at-all", sigHeader: null, webhookSecret: SECRET, verify: v.fn });
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "missing_signature", "rejected for missing signature, never parsed");
  assert.equal((r as { status: number }).status, 400);
  assert.equal(v.calls.length, 0);
});

// 7) Dispatch is never reachable on an unsigned request (auth.ok stays false → handler won't dispatch).
test("sig 7 — unsigned request can never reach dispatch (ok=false)", async () => {
  const v = spyVerify();
  const r = await authenticateStripeWebhook({ rawBody: RAW, sigHeader: "", webhookSecret: SECRET, verify: v.fn });
  assert.equal(r.ok, false);
});

// 8) Dispatch is never reachable on an invalid signature (ok=false after verify throws).
test("sig 8 — invalid-signature request can never reach dispatch (ok=false)", async () => {
  const v = spyVerify({ throwErr: true });
  const r = await authenticateStripeWebhook({ rawBody: RAW, sigHeader: "t=1,v1=bad", webhookSecret: SECRET, verify: v.fn });
  assert.equal(r.ok, false);
});

// 9) Raw body is passed UNCHANGED to Stripe verification (byte-for-byte).
test("sig 9 — raw body reaches verify unchanged", async () => {
  const tricky = '{"id":"evt","raw":"  spaces & \\n newlines \\t preserved ","n":1.0}';
  const v = spyVerify({ resolveTo: { ok: true } });
  await authenticateStripeWebhook({ rawBody: tricky, sigHeader: "t=1,v1=x", webhookSecret: SECRET, verify: v.fn });
  assert.equal(v.calls.length, 1);
  assert.equal(v.calls[0].body, tricky, "verify must receive the exact raw body, never re-serialized");
  assert.equal(v.calls[0].sig, "t=1,v1=x");
  assert.equal(v.calls[0].secret, SECRET);
});

// 10) Existing valid-event behavior unchanged — a signed event still flows through as before.
test("sig 10 — valid signed event still succeeds (no behavior regression)", async () => {
  const ev = { id: "evt_2", type: "charge.refunded" };
  const v = spyVerify({ resolveTo: ev });
  const r = await authenticateStripeWebhook({ rawBody: RAW, sigHeader: "t=1,v1=ok", webhookSecret: SECRET, verify: v.fn });
  assert.equal(r.ok, true);
  assert.deepEqual((r as { event: unknown }).event, ev);
});
