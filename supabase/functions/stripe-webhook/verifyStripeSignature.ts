// ─────────────────────────────────────────────────────────────────────────────
// verifyStripeSignature.ts — pure, injectable Stripe-webhook authentication
// (STRIPE-WEBHOOK-SIGNATURE-FAIL-CLOSED-001).
//
// FAIL CLOSED. A request is authenticated ONLY when ALL of the following hold:
//   1. STRIPE_WEBHOOK_SECRET is configured;
//   2. the Stripe-Signature header is present;
//   3. Stripe's OFFICIAL verification succeeds against the UNTOUCHED raw body.
//
// There is deliberately NO `JSON.parse(rawBody)` fallback, no unsigned-event
// bypass, no query-parameter bypass, and no acceptance based on event shape. An
// unsigned or unverified request is NEVER parsed or dispatched.
//
// This module is network-free and Deno-free so it can be unit-tested under Node
// (`node --test --experimental-strip-types`). index.ts injects the real verifier
// (`stripe.webhooks.constructEventAsync`); tests inject a stub.
// ─────────────────────────────────────────────────────────────────────────────

export type WebhookAuthResult =
  | { ok: true; event: unknown }
  | { ok: false; status: number; error: string; reason: "missing_secret" | "missing_signature" | "invalid_signature" };

export interface WebhookAuthInput {
  rawBody: string;
  sigHeader: string | null | undefined;
  webhookSecret: string | null | undefined;
  // Injected Stripe verifier. MUST throw on any missing/invalid/mismatched
  // signature. Receives the raw body UNCHANGED — never a re-serialized object.
  verify: (rawBody: string, sigHeader: string, secret: string) => Promise<unknown>;
}

export async function authenticateStripeWebhook(input: WebhookAuthInput): Promise<WebhookAuthResult> {
  // 1) Secret must be configured — otherwise refuse everything (fail closed).
  const secret = input.webhookSecret;
  if (!secret) {
    return { ok: false, status: 500, error: "Server configuration error", reason: "missing_secret" };
  }
  // 2) Stripe-Signature header is mandatory. No signature → no processing.
  const sig = input.sigHeader;
  if (!sig) {
    return { ok: false, status: 400, error: "Webhook signature required", reason: "missing_signature" };
  }
  // 3) Verify against the untouched raw body via Stripe's official method. Any
  //    failure → reject; we never fall back to parsing the body ourselves.
  let event: unknown;
  try {
    event = await input.verify(input.rawBody, sig, secret);
  } catch {
    return { ok: false, status: 400, error: "Webhook signature mismatch", reason: "invalid_signature" };
  }
  // Only the verified event returned by Stripe is ever used.
  return { ok: true, event };
}
