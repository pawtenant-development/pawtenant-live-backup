// send-system-health-alert — internal technical/configuration alert delivery.
//
// SYSTEM-HEALTH-TECHNICAL-ALERT-DELIVERY-REPAIR-001
//
// WHY THIS EXISTS. The previous path was dead. `src/lib/auditLogger.ts` posted
// { to, subject, body } to `send-followup-email` using the anon key. That
// function requires an admin session or the service-role key, so it answered
// 401; and it reads { email, first_name, bulk }, so even an authorised call
// would have 400'd — or worse, sent a PROVIDER APPLICATION FOLLOW-UP template
// and written to `provider_applications`. Both failures were swallowed by an
// empty catch. No alert was ever delivered.
//
// THREAT MODEL. The condition being reported (Stripe client secret missing)
// happens during PUBLIC checkout, before any admin session exists. So this
// endpoint must be callable by an anonymous browser holding only the anon key.
// That makes the caller UNTRUSTED, and the design follows from it:
//
//   • verify_jwt stays TRUE. The anon key is a project-signed JWT, so the
//     platform gate still rejects callers with no key at all. It is a
//     speed bump, not the security boundary.
//   • The recipient is a compile-time constant (SYSTEM_ALERT_RECIPIENT). A
//     caller-supplied `to` is IGNORED — never honoured, never echoed.
//   • `alert_type` must be in a fixed allowlist. Unknown types are rejected.
//   • Every free-text field is stripped of markup, length-capped, and
//     rendered escaped. Metadata accepts only primitives, with key/value caps
//     and redaction of anything that looks like a credential.
//   • The subject line is composed SERVER-SIDE from the allowlisted type.
//     The caller cannot dictate it.
//   • Dedupe + an hourly ceiling bound the blast radius to a handful of
//     emails even under a hostile flood.
//
// NO RECURSION. Nothing in this function reports its own failure through this
// function. Failures are written to `audit_logs` and returned to the caller.
//
// AUDIT ALWAYS. An audit row is written whether the email sends, is
// suppressed, or fails — so the alert is never invisible even if Resend is
// down. That is the whole point of the repair.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailViaResend } from "../_shared/resendClient.ts";
import { SYSTEM_FROM, SYSTEM_ALERT_RECIPIENT } from "../_shared/roleMailboxes.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Fail SAFE to "test": an unset/typo'd value can never mislabel a TEST alert
// as LIVE. Same discriminator the resume-token functions already use.
const ENVIRONMENT = (Deno.env.get("RESUME_TOKEN_ENVIRONMENT") ?? "test").toLowerCase() === "live"
  ? "LIVE"
  : "TEST";

/**
 * Allowlisted alert types. `title` is composed server-side from this table so
 * a caller can never dictate the subject line. To add a type, add it here —
 * that is deliberately a code change, not a runtime input.
 */
const ALERT_TYPES: Record<string, { title: string; defaultSeverity: Severity }> = {
  stripe_no_client_secret: { title: "Missing Stripe Publishable Key / Payment Intent Failure", defaultSeverity: "critical" },
  missing_configuration: { title: "Missing Environment Configuration", defaultSeverity: "critical" },
  edge_function_failure: { title: "Edge Function Configuration Problem", defaultSeverity: "warning" },
  integration_failure: { title: "Third-Party Integration Failure", defaultSeverity: "warning" },
  delivery_health: { title: "Email Delivery Health Problem", defaultSeverity: "warning" },
  system_health_test: { title: "System Health Alert Delivery Test", defaultSeverity: "info" },
};

type Severity = "info" | "warning" | "critical";
const SEVERITIES: readonly Severity[] = ["info", "warning", "critical"];

// One email per identical alert per cooldown. Repeats inside the window are
// recorded as suppressed occurrences rather than dropped silently.
const COOLDOWN_MINUTES = 60;
// Absolute ceiling across ALL alert types. A hostile or looping caller costs
// at most this many emails per hour.
const MAX_EMAILS_PER_HOUR = 6;

const LIMITS = { summary: 1000, source: 120, route: 200, correlationId: 120, metaKeys: 12, metaValue: 200 };

// Anything whose KEY looks credential-shaped is dropped before it can reach
// an inbox, a log line, or the audit table.
const SECRET_KEY_RE = /(key|secret|token|password|passwd|authorization|auth|bearer|cookie|session|signature|credential|apikey)/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Strip markup and control characters, collapse whitespace, hard-cap length. */
/** Replace control characters (incl. NUL/DEL) with spaces. Written as an
 *  explicit codepoint filter rather than a regex literal so the source file
 *  never has to contain raw control bytes. */
function stripControl(v: string): string {
  let out = "";
  for (const ch of v) {
    const cp = ch.codePointAt(0) ?? 0;
    out += (cp < 32 || cp === 127) ? " " : ch;
  }
  return out;
}

/** Strip markup and control characters, collapse whitespace, hard-cap length. */
function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return stripControl(v.replace(/<[^>]*>/g, " "))   // drop tag-shaped input outright
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Primitives only, capped count/length, credential-shaped keys removed. */
function sanitizeMetadata(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= LIMITS.metaKeys) break;
    const key = clean(k, 60);
    if (!key || SECRET_KEY_RE.test(key)) continue;
    if (v === null || v === undefined) continue;
    if (typeof v === "object") continue;                 // no nested objects/arrays
    out[key] = clean(String(v), LIMITS.metaValue);
    n++;
  }
  return out;
}

/** Show the mailbox without writing the full address into every audit row. */
function maskEmail(addr: string): string {
  const [local, domain] = addr.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

function nyTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", dateStyle: "medium", timeStyle: "medium",
    }).format(new Date(iso)) + " (America/New_York)";
  } catch {
    return iso;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = SUPABASE_URL && SERVICE_ROLE ? createClient(SUPABASE_URL, SERVICE_ROLE) : null;

  // Audit writer. Never throws — a logging outage must not turn into a 500
  // that breaks the caller's primary flow.
  const audit = async (action: string, description: string, metadata: Record<string, unknown>) => {
    if (!admin) return;
    try {
      await admin.from("audit_logs").insert({
        actor_name: "system_health_alert",
        actor_role: "system",
        object_type: "system",
        action,
        description: description.slice(0, 500),
        category: "system_health",
        source: "send-system-health-alert",
        metadata,
      });
    } catch (e) {
      // Deliberately terminal: do NOT re-enter this function. Console only.
      console.error("[send-system-health-alert] audit insert failed", e);
    }
  };

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    // ── Validate the alert type (allowlist) ──────────────────────────────
    const alertType = clean(body.alert_type, 60);
    const spec = ALERT_TYPES[alertType];
    if (!spec) {
      await audit("system_health_alert_rejected", `Unknown alert_type: ${alertType || "(empty)"}`, {
        environment: ENVIRONMENT, reason: "unknown_alert_type", alert_type: alertType || null,
      });
      return json({ ok: false, error: "Unknown alert_type", sent: false }, 400);
    }

    // ── Caller-supplied recipient is IGNORED, and the attempt is recorded ──
    const callerSuppliedRecipient = typeof body.to === "string" && body.to.trim().length > 0;

    const severity: Severity = SEVERITIES.includes(body.severity as Severity)
      ? body.severity as Severity
      : spec.defaultSeverity;

    const summary = clean(body.summary, LIMITS.summary);
    const source = clean(body.source, LIMITS.source) || "unknown";
    const route = clean(body.route, LIMITS.route);
    const correlationId = clean(body.correlation_id, LIMITS.correlationId);
    const metadata = sanitizeMetadata(body.metadata);

    const occurredAtRaw = clean(body.occurred_at, 40);
    const occurredAt = occurredAtRaw && !Number.isNaN(Date.parse(occurredAtRaw))
      ? new Date(occurredAtRaw).toISOString()
      : new Date().toISOString();

    // Server-derived. Never from the caller.
    const dedupeKey = `${ENVIRONMENT}:${alertType}:${source}:${route}`.toLowerCase();

    // ── Dedupe + hourly ceiling ──────────────────────────────────────────
    let suppression: "deduped" | "rate_limited" | null = null;
    if (admin) {
      const cooldownSince = new Date(Date.now() - COOLDOWN_MINUTES * 60_000).toISOString();
      const hourSince = new Date(Date.now() - 60 * 60_000).toISOString();

      const { data: recentSame } = await admin
        .from("audit_logs")
        .select("id")
        .eq("action", "system_health_alert_sent")
        .eq("metadata->>dedupe_key", dedupeKey)
        .gte("created_at", cooldownSince)
        .limit(1);
      if (recentSame && recentSame.length > 0) suppression = "deduped";

      if (!suppression) {
        const { count } = await admin
          .from("audit_logs")
          .select("*", { count: "exact", head: true })
          .eq("action", "system_health_alert_sent")
          .gte("created_at", hourSince);
        if ((count ?? 0) >= MAX_EMAILS_PER_HOUR) suppression = "rate_limited";
      }
    }

    if (suppression) {
      await audit(
        "system_health_alert_suppressed",
        `${spec.title} suppressed (${suppression}) — ${alertType}`,
        {
          environment: ENVIRONMENT, alert_type: alertType, severity, source, route: route || null,
          correlation_id: correlationId || null, dedupe_key: dedupeKey, reason: suppression,
          occurred_at: occurredAt, caller_supplied_recipient_ignored: callerSuppliedRecipient,
        },
      );
      return json({ ok: true, sent: false, suppressed: true, reason: suppression, dedupeKey });
    }

    // ── Compose (server-side subject; escaped body) ───────────────────────
    const subject = `[PawTenant ${ENVIRONMENT}] System Health Alert — ${spec.title}`;
    const metaRows = Object.entries(metadata)
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">${escapeHtml(k)}</td><td style="padding:4px 0;color:#111827;font-size:12px;">${escapeHtml(v)}</td></tr>`)
      .join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;max-width:600px;width:100%;">
  <tr><td style="padding:20px 28px;background:${severity === "critical" ? "#991b1b" : severity === "warning" ? "#b45309" : "#1f2937"};border-radius:12px 12px 0 0;">
    <div style="color:#fff;font-size:12px;font-weight:700;letter-spacing:.08em;">PAWTENANT ${escapeHtml(ENVIRONMENT)} &middot; ${escapeHtml(severity.toUpperCase())}</div>
    <div style="color:#fff;font-size:18px;font-weight:800;margin-top:6px;">${escapeHtml(spec.title)}</div>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    ${summary ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#374151;">${escapeHtml(summary)}</p>` : ""}
    <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e5e7eb;padding-top:12px;">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Environment</td><td style="padding:4px 0;color:#111827;font-size:12px;font-weight:700;">${escapeHtml(ENVIRONMENT)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Alert type</td><td style="padding:4px 0;color:#111827;font-size:12px;">${escapeHtml(alertType)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Source</td><td style="padding:4px 0;color:#111827;font-size:12px;">${escapeHtml(source)}</td></tr>
      ${route ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Route</td><td style="padding:4px 0;color:#111827;font-size:12px;">${escapeHtml(route)}</td></tr>` : ""}
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Occurred</td><td style="padding:4px 0;color:#111827;font-size:12px;">${escapeHtml(nyTimestamp(occurredAt))}</td></tr>
      ${correlationId ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">Correlation</td><td style="padding:4px 0;color:#111827;font-size:12px;">${escapeHtml(correlationId)}</td></tr>` : ""}
      ${metaRows}
    </table>
    <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#374151;">
      <strong>Recommended action:</strong> open Admin &rarr; System Health and review the recent failure log for this alert type.
    </p>
    <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;line-height:1.6;">
      Automated PawTenant system-health alert. Repeats of this exact alert are suppressed for
      ${COOLDOWN_MINUTES} minutes and still recorded in the audit log. No customer or provider
      data is included in these messages.
    </p>
  </td></tr>
</table></body></html>`;

    const text = [
      `PawTenant ${ENVIRONMENT} — System Health Alert`,
      `${spec.title} [${severity}]`,
      "",
      summary,
      "",
      `Alert type:  ${alertType}`,
      `Source:      ${source}`,
      route ? `Route:       ${route}` : "",
      `Occurred:    ${nyTimestamp(occurredAt)}`,
      correlationId ? `Correlation: ${correlationId}` : "",
      ...Object.entries(metadata).map(([k, v]) => `${k}: ${v}`),
      "",
      "Recommended action: open Admin > System Health and review the recent failure log.",
    ].filter(Boolean).join("\n");

    // ── Send. Recipient is the constant — never the caller's `to`. ────────
    // No reply_to: this is machine-to-operator, nobody replies to it.
    const result = await sendEmailViaResend({
      from: SYSTEM_FROM,
      to: SYSTEM_ALERT_RECIPIENT,
      subject,
      html,
      text,
      tags: [
        { name: "type", value: "system_health_alert" },
        { name: "alert_type", value: alertType },
        { name: "environment", value: ENVIRONMENT.toLowerCase() },
      ],
    });

    const baseMeta = {
      environment: ENVIRONMENT, alert_type: alertType, severity, source, route: route || null,
      correlation_id: correlationId || null, dedupe_key: dedupeKey, occurred_at: occurredAt,
      recipient_role: "INFO", recipient_masked: maskEmail(SYSTEM_ALERT_RECIPIENT),
      caller_supplied_recipient_ignored: callerSuppliedRecipient,
      subject,
    };

    if (!result.ok) {
      // Loud, recorded failure. The old code swallowed exactly this case.
      await audit("system_health_alert_failed", `${spec.title} — send failed: ${result.error}`, {
        ...baseMeta, delivery_status: "failed", failure_reason: result.error, resend_status: result.status,
      });
      console.error(`[send-system-health-alert] Resend failed (${result.status}): ${result.error}`);
      return json({ ok: false, sent: false, error: "Alert email send failed", reason: result.error }, 502);
    }

    await audit("system_health_alert_sent", `${spec.title} — alert emailed to ${maskEmail(SYSTEM_ALERT_RECIPIENT)}`, {
      ...baseMeta,
      resend_message_id: result.messageId,
      // Resend accepted it. That is NOT proof of delivery — the resend-webhook
      // carries the terminal state. Never render this as "delivered".
      delivery_status: "accepted",
      resend_status: result.status,
    });

    return json({
      ok: true, sent: true, dedupeKey,
      messageId: result.messageId,
      deliveryStatus: "accepted",
      recipientRole: "INFO",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-system-health-alert] unexpected error", msg);
    await audit("system_health_alert_failed", `Unexpected error: ${msg}`, {
      environment: ENVIRONMENT, delivery_status: "failed", failure_reason: msg,
    });
    return json({ ok: false, sent: false, error: "Internal error" }, 500);
  }
});
