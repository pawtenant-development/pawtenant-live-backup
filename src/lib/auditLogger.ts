import { supabase } from "./supabaseClient";

const ALERT_EMAIL = "admin@pawtenant.com";
const STRIPE_CLIENT_SECRET_THRESHOLD = 3;
const STRIPE_CLIENT_SECRET_WINDOW_MINUTES = 60;

export interface AuditEventParams {
  actor_id?: string | null;
  actor_name: string;
  actor_role?: string | null;
  object_type: "order" | "payment" | "refund" | "doctor" | "staff" | "ghl_sync" | "customer" | "letter" | "system";
  object_id?: string | null;
  action: string;
  description?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Check if stripe_no_client_secret has fired more than threshold times in the last window.
 * If so, trigger an email alert to admin.
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
      await fetch(`${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/send-followup-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: ALERT_EMAIL,
          subject: `🚨 Stripe Config Alert: ${count} client secret failures in last hour`,
          body: `Stripe client secret failures have exceeded the threshold.

Count: ${count} failures
Window: Last ${STRIPE_CLIENT_SECRET_WINDOW_MINUTES} minutes
Time: ${new Date().toISOString()}

This usually indicates:
- Missing or invalid Stripe publishable key
- Edge function configuration issue
- Stripe account connectivity problem

Check the System Health tab for details.`,
        }),
      });
    }
  } catch {
    // Silent fail — don't break flow if alert fails
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
  } catch {
    // Never break UI for logging failures
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
    try { body = await response.clone().json(); } catch { /* ignore */ }
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
