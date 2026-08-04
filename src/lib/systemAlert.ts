// systemAlert — typed client for the internal system-health alert endpoint.
//
// SYSTEM-HEALTH-TECHNICAL-ALERT-DELIVERY-REPAIR-001
//
// The old path posted { to, subject, body } at `send-followup-email` with the
// anon key. That function needs an admin session and reads a different payload,
// so it answered 401 and nothing was ever delivered — silently, because the
// caller swallowed the error.
//
// Two things make this client safe to call from the public browser bundle:
//
//   1. There is NO `to` parameter. The recipient is a server-side constant.
//      The type below cannot express a recipient, so a future caller cannot
//      accidentally introduce one.
//   2. There is no subject or HTML. The server composes both from an
//      allowlisted `alert_type`. Callers supply facts, not content.
//
// Never put a service-role key in this file or anything it imports.

const ENDPOINT = "send-system-health-alert";

/** Allowlisted server-side alert types. Adding one is a server change too. */
export type SystemAlertType =
  | "stripe_no_client_secret"
  | "missing_configuration"
  | "edge_function_failure"
  | "integration_failure"
  | "delivery_health"
  | "system_health_test";

export type SystemAlertSeverity = "info" | "warning" | "critical";

export interface SystemAlertInput {
  alert_type: SystemAlertType;
  severity?: SystemAlertSeverity;
  /** One sentence a human can act on. No PII, no secrets, no stack traces. */
  summary?: string;
  /** Component that detected it, e.g. "assessment_flow". */
  source?: string;
  /** Route/screen, e.g. "/assessment". */
  route?: string;
  correlation_id?: string;
  occurred_at?: string;
  /** Flat primitives only. Credential-shaped keys are dropped server-side. */
  metadata?: Record<string, string | number | boolean>;
}

export interface SystemAlertResult {
  ok: boolean;
  sent: boolean;
  suppressed?: boolean;
  reason?: string;
  messageId?: string | null;
  /** "accepted" means Resend took it — NOT that it was delivered. */
  deliveryStatus?: string;
  error?: string;
}

/**
 * Report a technical/configuration failure.
 *
 * Never throws: alerting must not break the flow that detected the problem.
 * But it never swallows silently either — a failure is returned as a typed
 * result AND written to the console, and the server records an audit row for
 * every outcome including its own send failures.
 */
export async function reportSystemAlert(input: SystemAlertInput): Promise<SystemAlertResult> {
  const url = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/${ENDPOINT}`;
  const anonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Anon key is a project-signed JWT, so it satisfies verify_jwt. It is
        // NOT the security boundary — the server treats this caller as
        // untrusted and controls recipient, subject and rate limits itself.
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        alert_type: input.alert_type,
        severity: input.severity,
        summary: input.summary,
        source: input.source,
        route: input.route ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
        correlation_id: input.correlation_id,
        occurred_at: input.occurred_at ?? new Date().toISOString(),
        metadata: input.metadata,
      }),
    });

    const payload = await res.json().catch(() => ({})) as Partial<SystemAlertResult>;

    if (!res.ok) {
      // Visible, not swallowed. The server has already written an audit row
      // for anything it managed to classify.
      console.error(`[systemAlert] ${input.alert_type} failed (HTTP ${res.status})`, payload?.error ?? "");
      return { ok: false, sent: false, error: payload?.error ?? `HTTP ${res.status}` };
    }

    return {
      ok: true,
      sent: Boolean(payload.sent),
      suppressed: payload.suppressed,
      reason: payload.reason,
      messageId: payload.messageId ?? null,
      deliveryStatus: payload.deliveryStatus,
    };
  } catch (err) {
    // Network-level failure. Still surfaced, never silent.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[systemAlert] ${input.alert_type} transport error`, msg);
    return { ok: false, sent: false, error: msg };
  }
}
