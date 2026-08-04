import { supabase } from "./supabaseClient";
import { reportSystemAlert } from "./systemAlert";

// SYSTEM-HEALTH-TECHNICAL-ALERT-DELIVERY-REPAIR-001
//
// This used to POST { to, subject, body } at `send-followup-email` with the
// anon key. That function requires an admin session and reads a different
// payload, so it answered 401 — and an authorised call would have sent a
// PROVIDER APPLICATION FOLLOW-UP template instead. An empty catch hid both,
// so the alert never fired once. Repointing the recipient did not fix it,
// because the recipient was never the problem.
//
// It now calls the dedicated `send-system-health-alert` endpoint, which owns
// the recipient (info@), the subject, dedupe, rate limiting and audit
// evidence. No recipient is passed from here — by design there is no
// parameter for one.
const STRIPE_CLIENT_SECRET_THRESHOLD = 3;
const STRIPE_CLIENT_SECRET_WINDOW_MINUTES = 60;

export interface AuditEventParams {
  actor_id?: string | null;
  actor_name: string;
  actor_role?: string | null;
  object_type:
    | "order" | "payment" | "refund" | "doctor" | "staff" | "ghl_sync"
    | "customer" | "letter" | "system"
    // Company OS admin operations (chats/emails bulk actions, HR approvals,
    // provider internal records). audit_logs.object_type is free text in DB.
    | "chat" | "contact" | "provider" | "template" | "approval" | "leave" | "attendance";
  object_id?: string | null;
  action: string;
  description?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Escalate when stripe_no_client_secret has fired more than the threshold in
 * the last window. Delivery, dedupe and audit evidence are the server's job.
 *
 * Returns nothing, but never fails silently: a failed alert is logged to the
 * console here and recorded in audit_logs by the endpoint.
 */
async function checkAndAlertStripeClientSecret(): Promise<void> {
  try {
    const since = new Date(Date.now() - STRIPE_CLIENT_SECRET_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("audit_logs")
      .select("*", { count: "exact", head: true })
      .eq("action", "stripe_no_client_secret")
      .gte("created_at", since);

    if (count && count >= STRIPE_CLIENT_SECRET_THRESHOLD) {
      const result = await reportSystemAlert({
        alert_type: "stripe_no_client_secret",
        severity: "critical",
        summary:
          `create-payment-intent returned no client secret ${count} times in the last ` +
          `${STRIPE_CLIENT_SECRET_WINDOW_MINUTES} minutes. Customers cannot pay. ` +
          `Usual causes: missing/invalid Stripe publishable key, edge function ` +
          `configuration, or Stripe connectivity.`,
        source: "assessment_flow",
        metadata: {
          failure_count: count,
          window_minutes: STRIPE_CLIENT_SECRET_WINDOW_MINUTES,
          threshold: STRIPE_CLIENT_SECRET_THRESHOLD,
        },
      });
      if (!result.ok) {
        console.error("[auditLogger] system health alert did not send:", result.error);
      }
    }
  } catch (err) {
    // The alert path must never break checkout — but it must not vanish either.
    console.error("[auditLogger] stripe alert check failed:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Log an audit event. Silent-fails so it never breaks UI.
 * Also triggers alerts for critical error patterns.
 */
export async function logAudit(params: AuditEventParams): Promise<void> {
  try {
    await supabase.from("audit_logs").insert(params);

    // Trigger alert check for stripe_no_client_secret errors
    if (params.action === "stripe_no_client_secret") {
      void checkAndAlertStripeClientSecret();
    }
  } catch (err) {
    // Never break the UI for a logging failure — but leave a trace. A fully
    // silent catch here is what hid the dead alert path for so long.
    console.error("[auditLogger] audit insert failed:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Categorised network error logger for the assessment flow.
 * Classifies failures into: stripe | supabase_db | supabase_storage |
 * edge_function | ghl | unknown — so you can filter by category in audit_logs.
 *
 * Usage:
 *   const result = await loggedFetch("create-payment-intent", url, options, confirmationId);
 */
export async function loggedFetch(
  endpointLabel: string,
  url: string,
  options: Parameters<typeof fetch>[1],
  confirmationId?: string,
): Promise<Response> {
  const category = classifyEndpoint(url);
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (networkErr) {
    // Hard network failure (offline, DNS, CORS, timeout)
    void logAudit({
      actor_name: "assessment_flow",
      actor_role: "client",
      object_type: "system",
      object_id: confirmationId ?? null,
      action: `network_error_${category}`,
      description: `[${endpointLabel}] Network error — could not reach endpoint`,
      metadata: {
        endpoint: endpointLabel,
        url,
        category,
        error: networkErr instanceof Error ? networkErr.message : String(networkErr),
        confirmation_id: confirmationId ?? null,
        timestamp: new Date().toISOString(),
      },
    });
    throw networkErr;
  }

  // Log non-2xx HTTP responses
  if (!response.ok) {
    let body: unknown = null;
    // Error bodies are often not JSON. Absence is expected, not a failure —
    // the HTTP status and endpoint are recorded either way, just below.
    try { body = await response.clone().json(); } catch { body = null; }
    void logAudit({
      actor_name: "assessment_flow",
      actor_role: "client",
      object_type: "system",
      object_id: confirmationId ?? null,
      action: `http_error_${category}`,
      description: `[${endpointLabel}] HTTP ${response.status} ${response.statusText}`,
      metadata: {
        endpoint: endpointLabel,
        url,
        category,
        http_status: response.status,
        response_body: body,
        confirmation_id: confirmationId ?? null,
        timestamp: new Date().toISOString(),
      },
    });
  }

  return response;
}

function classifyEndpoint(url: string): string {
  if (url.includes("create-payment-intent") || url.includes("create-checkout-session")) return "stripe";
  if (url.includes("ghl-webhook-proxy") || url.includes("ghl-")) return "ghl";
  if (url.includes("sync-to-sheets")) return "sheets_sync";
  if (url.includes("storage")) return "supabase_storage";
  if (url.includes("functions/v1/")) return "edge_function";
  if (url.includes("supabase")) return "supabase_db";
  return "unknown";
}
