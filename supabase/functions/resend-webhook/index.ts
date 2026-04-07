// supabase/functions/resend-webhook/index.ts
// Handles inbound Resend email webhook events (email.delivered, email.bounced, etc.)
// Signature verification via Svix (used by Resend internally)
// Returns 200 OK for all non-critical outcomes — never 400 for unhandled event types

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok(body: unknown = { received: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function err(body: unknown, status = 500): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ─── Svix HMAC-SHA256 signature verification ────────────────────────────────
// Resend uses Svix for webhook signing. The signed content is:
//   `${svix-id}.${svix-timestamp}.${rawBody}`
// The secret is base64-encoded after stripping the "whsec_" prefix.
async function verifyResendSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
): Promise<boolean> {
  const svixId        = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error("[resend-webhook] Missing Svix headers:", { svixId, svixTimestamp, svixSignature });
    return false;
  }

  // Replay protection — reject if timestamp is older than 5 minutes
  const ts = parseInt(svixTimestamp, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > 300) {
    console.error(`[resend-webhook] Timestamp too old or too far in future: ${svixTimestamp} (now: ${nowSec})`);
    return false;
  }

  // Strip "whsec_" prefix and decode base64 secret
  const secretBase64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let secretBytes: Uint8Array;
  try {
    secretBytes = Uint8Array.from(atob(secretBase64), (c) => c.charCodeAt(0));
  } catch {
    console.error("[resend-webhook] Failed to decode webhook secret — check RESEND_WEBHOOK_SECRET format");
    return false;
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signedContent));
  const computedSig = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  // svix-signature header may contain multiple sigs: "v1,<sig1> v1,<sig2>"
  const incomingSigs = svixSignature.split(" ").map((s) => s.replace(/^v1,/, ""));
  const match = incomingSigs.some((sig) => sig === computedSig);

  if (!match) {
    console.error("[resend-webhook] Signature mismatch", {
      computed: computedSig,
      received: incomingSigs,
      svixId,
      svixTimestamp,
    });
  }

  return match;
}

// ─── Event handlers ──────────────────────────────────────────────────────────

async function handleEmailBounced(
  supabase: ReturnType<typeof createClient>,
  data: Record<string, unknown>,
): Promise<void> {
  const emailId  = data.email_id  as string | undefined;
  const toEmail  = (data.to as string[] | undefined)?.[0];
  const bounceType = data.bounce?.type as string | undefined;

  console.warn("[resend-webhook] email.bounced", { emailId, toEmail, bounceType });

  // Log to audit_logs for visibility
  try {
    await supabase.from("audit_logs").insert({
      action: "email_bounced",
      object_type: "email",
      object_id: emailId ?? toEmail ?? "unknown",
      details: { email_id: emailId, to: toEmail, bounce_type: bounceType, raw: data },
    });
  } catch (e) {
    console.warn("[resend-webhook] Could not write bounce audit log:", e);
  }
}

async function handleEmailComplained(
  supabase: ReturnType<typeof createClient>,
  data: Record<string, unknown>,
): Promise<void> {
  const emailId = data.email_id as string | undefined;
  const toEmail = (data.to as string[] | undefined)?.[0];

  console.warn("[resend-webhook] email.complained (spam report)", { emailId, toEmail });

  try {
    await supabase.from("audit_logs").insert({
      action: "email_spam_complaint",
      object_type: "email",
      object_id: emailId ?? toEmail ?? "unknown",
      details: { email_id: emailId, to: toEmail, raw: data },
    });
  } catch (e) {
    console.warn("[resend-webhook] Could not write complaint audit log:", e);
  }
}

function handleEmailDelivered(data: Record<string, unknown>): void {
  const emailId = data.email_id as string | undefined;
  const toEmail = (data.to as string[] | undefined)?.[0];
  console.info("[resend-webhook] email.delivered ✓", { emailId, toEmail });
}

function handleEmailOpened(data: Record<string, unknown>): void {
  const emailId = data.email_id as string | undefined;
  console.info("[resend-webhook] email.opened", { emailId });
}

function handleEmailClicked(data: Record<string, unknown>): void {
  const emailId = data.email_id as string | undefined;
  const link    = data.click?.link as string | undefined;
  console.info("[resend-webhook] email.clicked", { emailId, link });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return err({ error: "Method not allowed" }, 405);

  // 1. Read raw body FIRST (before any parsing — required for signature verification)
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    console.error("[resend-webhook] Failed to read request body");
    return err({ error: "Failed to read body" }, 500);
  }

  // 2. Log incoming payload immediately (before any validation)
  console.info("[resend-webhook] Incoming payload:", rawBody.slice(0, 1000));

  // 3. Parse JSON
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    console.error("[resend-webhook] Invalid JSON body:", rawBody.slice(0, 200));
    // Return 200 even for bad JSON — Resend should not retry indefinitely
    return ok({ received: false, reason: "invalid_json" });
  }

  const eventType = payload.type as string | undefined;
  console.info("[resend-webhook] Event type:", eventType ?? "(none)");

  // 4. Verify signature if secret is configured
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (webhookSecret) {
    const valid = await verifyResendSignature(rawBody, req.headers, webhookSecret);
    if (!valid) {
      console.error("[resend-webhook] ❌ Signature verification FAILED — rejecting event:", eventType);
      // Return 400 ONLY for signature failures (security boundary — must reject forged requests)
      return err({ error: "Invalid webhook signature" }, 400);
    }
    console.info("[resend-webhook] ✓ Signature verified");
  } else {
    console.warn("[resend-webhook] RESEND_WEBHOOK_SECRET not set — skipping signature verification (set it in Supabase secrets)");
  }

  // 5. Initialize Supabase client (only for events that need DB writes)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const data = (payload.data ?? {}) as Record<string, unknown>;

  // 6. Route to event handler — always return 200 for unhandled types
  try {
    switch (eventType) {
      case "email.delivered":
        handleEmailDelivered(data);
        break;

      case "email.bounced":
        await handleEmailBounced(supabase, data);
        break;

      case "email.complained":
        await handleEmailComplained(supabase, data);
        break;

      case "email.opened":
        handleEmailOpened(data);
        break;

      case "email.clicked":
        handleEmailClicked(data);
        break;

      case "email.delivery_delayed":
        console.warn("[resend-webhook] email.delivery_delayed", { email_id: data.email_id });
        break;

      default:
        // ✅ Fallback: always 200 for unhandled event types — never 400
        console.info(`[resend-webhook] Unhandled event type "${eventType}" — acknowledged and ignored`);
        return ok({ received: true, handled: false, event_type: eventType });
    }
  } catch (handlerErr) {
    // Handler errors are non-critical — still return 200 to prevent Resend retries
    console.error(`[resend-webhook] Handler error for "${eventType}":`, handlerErr);
    return ok({ received: true, handled: false, handler_error: true, event_type: eventType });
  }

  return ok({ received: true, handled: true, event_type: eventType });
});
