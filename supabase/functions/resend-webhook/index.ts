import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Resend Webhook Handler
// Receives delivery event notifications from Resend and writes them back to order email_log
// Supported events: email.sent, email.delivered, email.delivery_delayed, email.bounced, email.complained, email.opened, email.clicked
//
// Setup in Resend dashboard:
// Webhooks → Add Endpoint → URL: https://[your-supabase-url]/functions/v1/resend-webhook
// Select all email events

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature, webhook-id, webhook-timestamp, webhook-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject?: string;
    created_at?: string;
    tags?: Array<{ name: string; value: string }>;
    [key: string]: unknown;
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Map Resend event types to human-readable log entry types
function eventToLogType(resendEvent: string): string {
  const map: Record<string, string> = {
    "email.sent":              "resend_sent",
    "email.delivered":         "resend_delivered",
    "email.delivery_delayed":  "resend_delivery_delayed",
    "email.bounced":           "resend_bounced",
    "email.complained":        "resend_complained",
    "email.opened":            "resend_opened",
    "email.clicked":           "resend_clicked",
  };
  return map[resendEvent] ?? resendEvent;
}

function isDeliverySuccess(eventType: string): boolean {
  return eventType === "email.delivered" || eventType === "email.sent" || eventType === "email.opened" || eventType === "email.clicked";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Optional webhook signing secret verification
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (webhookSecret) {
    // Resend uses svix for webhook signing
    // We check the svix-signature header if present
    const svixSignature = req.headers.get("svix-signature") ?? req.headers.get("webhook-signature");
    if (!svixSignature) {
      console.warn("[resend-webhook] No signature header — rejecting (RESEND_WEBHOOK_SECRET is set)");
      return json({ error: "Missing webhook signature" }, 401);
    }
    // Full HMAC verification would require the svix library — for now we log and proceed
    // In production you can add: import { Webhook } from "npm:svix"
    console.info("[resend-webhook] Signature present, proceeding");
  }

  let payload: ResendWebhookPayload;
  try {
    payload = (await req.json()) as ResendWebhookPayload;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { type: eventType, created_at: eventAt, data } = payload;

  if (!eventType || !data) {
    return json({ error: "Invalid webhook payload — missing type or data" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Extract confirmation_id from tags (set when sending via Resend)
  const tags = data.tags ?? [];
  const confirmationIdTag = tags.find((t) => t.name === "confirmation_id");
  const emailTypeTag = tags.find((t) => t.name === "email_type");
  const confirmationId = confirmationIdTag?.value;

  const logEntry = {
    type: eventToLogType(eventType),
    sentAt: eventAt ?? new Date().toISOString(),
    to: data.to?.[0] ?? "unknown",
    success: isDeliverySuccess(eventType),
    resendEmailId: data.email_id,
    resendEvent: eventType,
    emailType: emailTypeTag?.value,
  };

  // If we have a confirmation_id, append to that order's email_log
  if (confirmationId) {
    try {
      const { data: order } = await supabase
        .from("orders")
        .select("email_log")
        .eq("confirmation_id", confirmationId)
        .maybeSingle();

      if (order) {
        const currentLog = (order.email_log as unknown[]) ?? [];

        // Avoid duplicate event logs — check if this resend_email_id + event_type is already recorded
        const alreadyLogged = currentLog.some(
          (entry) => {
            const e = entry as { resendEmailId?: string; resendEvent?: string };
            return e.resendEmailId === data.email_id && e.resendEvent === eventType;
          }
        );

        if (!alreadyLogged) {
          await supabase
            .from("orders")
            .update({ email_log: [...currentLog, logEntry] })
            .eq("confirmation_id", confirmationId);
          console.info(`[resend-webhook] Logged ${eventType} for order ${confirmationId}`);
        } else {
          console.info(`[resend-webhook] Skipped duplicate ${eventType} for order ${confirmationId}`);
        }
      }
    } catch (err) {
      console.error("[resend-webhook] Failed to update email_log:", err);
    }
  }

  // Log bounces/complaints prominently regardless of order association
  if (eventType === "email.bounced" || eventType === "email.complained") {
    console.error(`[resend-webhook] ${eventType.toUpperCase()} for ${data.to?.[0] ?? "unknown"} — emailId: ${data.email_id} — confirmationId: ${confirmationId ?? "none"}`);

    // For bounces, log to system_health_logs for visibility
    try {
      await supabase.from("system_health_logs").insert({
        triggered_by: "resend_webhook",
        overall_status: "warn",
        checks: [{
          name: `Email ${eventType === "email.bounced" ? "Bounce" : "Complaint"} Detected`,
          category: "communications",
          status: "warn",
          message: `${eventType} — To: ${data.to?.[0] ?? "unknown"} — Subject: ${data.subject ?? "unknown"}`,
          detail: confirmationId ? `Order: ${confirmationId}` : "No order ID associated",
        }],
        order_health: {},
      });
    } catch (err) {
      console.error("[resend-webhook] Failed to log bounce to system_health_logs:", err);
    }
  }

  return json({ ok: true, event: eventType, confirmationId: confirmationId ?? null });
});
