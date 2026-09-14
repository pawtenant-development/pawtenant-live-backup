// partner-webhook-dispatch
//
// PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 8 · Part B
//
// Drives the partner webhook outbox: claims due deliveries, signs each stored
// payload with the endpoint's HMAC-SHA256 secret, POSTs it, and records the
// attempt. All state transitions live in the database RPCs
// (partner_webhook_claim_deliveries / partner_webhook_record_attempt); this
// function is a stateless pump and can be run repeatedly without harm.
//
// DELIVERY DISCIPLINE (the order is the crash-safety model):
//   build payload (already frozen in the outbox) → CLAIM → send → record.
//   A failure or crash after claiming can never fabricate a "sent" state:
//   the claim expires after 10 minutes and the delivery is re-driven. A
//   success is final — the record RPC refuses a second success outright.
//
// ENDPOINT SAFETY (re-checked at send time, not only at registration):
//   * HTTPS only. * No loopback/private/link-local hosts. * A sandbox
//   endpoint may ONLY be the controlled sandbox receiver on our own Supabase
//   project host — TEST traffic can never reach a real partner system.
//
// AUTH (verify_jwt=false — callers present their own credential):
//   * x-dispatch-secret header, verified INSIDE the database against the
//     vault (verify_partner_webhook_cron_secret — the payout-cron pattern).
//     This is the production cron path.
//   * OR an admin user JWT (Authorization: Bearer), proven by a user-context
//     is_chat_admin() capability probe — never by comparing the bearer to a
//     service key.
//
// WHAT THIS FUNCTION WILL NOT DO
//   * It never invents an event or a delivery — it only drives rows the
//     database created.
//   * It never logs a payload body, a secret or a signature.
//   * It never follows redirects (a redirect could smuggle a signed clinical
//     status payload to an unvetted host).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const SEND_TIMEOUT_MS = 10_000;
const CLAIM_BATCH = 20;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dispatch-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface ClaimedDelivery {
  delivery_id: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  endpoint_id: string;
  url: string;
  environment: string;
  secret: string;
  attempt_count: number;
}

/** hex(HMAC-SHA256(secret, `${timestamp}.${body}`)) — the documented scheme. */
export async function signWebhookBody(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[::1\]|::1$|172\.(1[6-9]|2\d|3[01])\.)/i;

/**
 * Send-time endpoint safety. Registration already vets the URL, but the rule
 * that matters is enforced where the bytes leave the building.
 */
export function endpointRefusalReason(rawUrl: string, environment: string, supabaseUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return "unparseable url";
  }
  if (u.protocol !== "https:") return "non-https endpoint";
  if (PRIVATE_HOST_RE.test(u.hostname)) return "private or loopback host";
  if (environment === "sandbox") {
    // TEST discipline: sandbox traffic goes ONLY to the controlled receiver
    // on this project's own functions host.
    let own = "";
    try { own = new URL(supabaseUrl).hostname; } catch { /* fall through */ }
    if (!own || u.hostname !== own) return "sandbox endpoint must be the controlled sandbox receiver";
  }
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(500, { ok: false, error: "Server not configured" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── Authorize the caller ──────────────────────────────────────────────────
  let authorized = false;
  const dispatchSecret = req.headers.get("x-dispatch-secret")?.trim();
  if (dispatchSecret) {
    const { data: ok } = await admin.rpc("verify_partner_webhook_cron_secret", { p_secret: dispatchSecret });
    authorized = ok === true;
  }
  if (!authorized) {
    const auth = req.headers.get("authorization") ?? "";
    const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (bearer && ANON_KEY) {
      // Capability probe: the caller's own JWT must satisfy is_chat_admin()
      // under RLS. Never a comparison against a service key.
      const asUser = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: isAdmin } = await asUser.rpc("is_chat_admin");
      authorized = isAdmin === true;
    }
  }
  if (!authorized) return json(401, { ok: false, error: "Unauthorized" });

  // ── Claim → send → record ─────────────────────────────────────────────────
  const { data: claimedRows, error: claimErr } = await admin.rpc("partner_webhook_claim_deliveries", {
    p_limit: CLAIM_BATCH,
  });
  if (claimErr) return json(500, { ok: false, error: "claim failed" });

  const claimed = (claimedRows ?? []) as ClaimedDelivery[];
  let delivered = 0;
  let failed = 0;
  let refused = 0;

  for (const d of claimed) {
    const refusal = endpointRefusalReason(d.url, d.environment, SUPABASE_URL);
    if (refusal) {
      refused++;
      await admin.rpc("partner_webhook_record_attempt", {
        p_delivery_id: d.delivery_id, p_ok: false, p_status_code: null,
        p_error: `endpoint refused: ${refusal}`, p_duration_ms: 0,
      }).then(() => {}, () => {});
      continue;
    }

    const body = JSON.stringify(d.payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await signWebhookBody(d.secret, timestamp, body);

    const started = Date.now();
    let ok = false;
    let statusCode: number | null = null;
    let errText: string | null = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
      const res = await fetch(d.url, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "PawTenant-Webhooks/1",
          "X-PawTenant-Event-Id": String(d.payload["event_id"] ?? d.event_id),
          "X-PawTenant-Event-Type": d.event_type,
          "X-PawTenant-Timestamp": timestamp,
          "X-PawTenant-Signature": `v1=${signature}`,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      statusCode = res.status;
      // Drain the body so the connection can be reused; the content is not
      // trusted or interpreted.
      await res.text().then(() => {}, () => {});
      ok = res.status >= 200 && res.status < 300;
      if (!ok) errText = `endpoint returned ${res.status}`;
    } catch (e) {
      errText = e instanceof Error ? e.message.slice(0, 200) : "network error";
    }

    if (ok) delivered++; else failed++;
    await admin.rpc("partner_webhook_record_attempt", {
      p_delivery_id: d.delivery_id, p_ok: ok, p_status_code: statusCode,
      p_error: errText, p_duration_ms: Date.now() - started,
    }).then(() => {}, () => {});
  }

  return json(200, { ok: true, claimed: claimed.length, delivered, failed, refused });
});
