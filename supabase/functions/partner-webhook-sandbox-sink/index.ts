// partner-webhook-sandbox-sink
//
// PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 8 · Part B
//
// THE controlled sandbox webhook receiver for TEST. Sandbox endpoints are
// restricted (dispatcher-enforced) to this project's own functions host, so
// every webhook a TEST dispatch run emits lands here and nowhere else.
//
// It records exactly what arrived — the raw body plus the signature headers —
// into partner_webhook_sandbox_receipts, so signature generation can be
// verified INDEPENDENTLY: the verification harness recomputes
// HMAC-SHA256(secret, `${timestamp}.${body}`) from the stored receipt with
// its own crypto, never by calling the dispatcher's signing code.
//
// `?mode=fail` makes the sink answer 500 AFTER recording the receipt — the
// lever for exercising retry/backoff and duplicate-delivery protection
// against a real failing endpoint.
//
// TEST-ONLY: this function is never part of production activation. It stores
// nothing but what the dispatcher sent (which is already PHI-free by outbox
// discipline) and answers 200/500.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405 });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "Server not configured" }), { status: 500 });
  }

  const body = await req.text();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  await admin.from("partner_webhook_sandbox_receipts").insert({
    event_id_header: req.headers.get("x-pawtenant-event-id"),
    event_type_header: req.headers.get("x-pawtenant-event-type"),
    timestamp_header: req.headers.get("x-pawtenant-timestamp"),
    signature_header: req.headers.get("x-pawtenant-signature"),
    body,
  }).then(() => {}, () => {});

  const mode = new URL(req.url).searchParams.get("mode");
  if (mode === "fail") {
    return new Response(JSON.stringify({ ok: false, simulated: "failure" }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
