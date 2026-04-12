import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANY_NAME = "PawTenant";
const COMPANY_DOMAIN = "pawtenant.com";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;
const PORTAL_URL = `https://${COMPANY_DOMAIN}/my-orders`;
const SITE_URL = `https://www.${COMPANY_DOMAIN}`;
const ACCENT = "#1a5c4f";

const LEAD_RECOVERY_AUDIENCES = new Set(["all_leads", "all_everyone"]);

function isAssessmentUrl(url: string): boolean {
  return url.includes("assessment") || url.includes("resume=");
}

interface Recipient {
  email: string;
  name: string;
  confirmation_id?: string;
  letter_type?: string;
}

function escapeHtml(v = "") {
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function sanitizeTagValue(v: string): string {
  return (v ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50)
    || "unknown";
}

function buildResumeUrl(confirmationId: string, letterType?: string): string {
  const isPsd = letterType === "psd" || (confirmationId ?? "").includes("-PSD");
  const path = isPsd ? "psd-assessment" : "assessment";
  return `${SITE_URL}/${path}?resume=${encodeURIComponent(confirmationId)}`;
}

function buildUnsubscribeUrl(supabaseUrl: string, email: string): string {
  const token = btoa(encodeURIComponent(email));
  return `${supabaseUrl}/functions/v1/broadcast-unsubscribe?token=${token}`;
}

function buildBroadcastHtml(opts: {
  recipientName: string;
  subject: string;
  bodyText: string;
  includePortalCta: boolean;
  ctaLabel: string;
  ctaUrl: string;
  isTest?: boolean;
  unsubscribeUrl?: string;
  sentBy?: string;
}): string {
  const name = escapeHtml(opts.recipientName || "there");
  const bodyHtml = escapeHtml(opts.bodyText)
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => `<p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">${line}</p>`)
    .join("");

  const ctaBlock = opts.includePortalCta ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px;">
      <tr><td align="center">
        <a href="${escapeHtml(opts.ctaUrl)}"
           style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">
          ${escapeHtml(opts.ctaLabel)} &rarr;
        </a>
      </td></tr>
    </table>` : "";

  const testBanner = opts.isTest ? `
    <div style="background:#fef3c7;border:2px dashed #d97706;border-radius:8px;padding:12px 16px;margin-bottom:20px;text-align:center;">
      <p style="margin:0;font-size:13px;font-weight:700;color:#92400e;">
        &#9888; TEST EMAIL — This is a preview. Not sent to real customers.
      </p>
    </div>` : "";

  const unsubscribeBlock = opts.unsubscribeUrl ? `
    <tr>
      <td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #e5e7eb;background:#f9fafb;">
        <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">
          You received this message because you have an active order with PawTenant.
        </p>
        <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;">
          ${COMPANY_NAME} &mdash; ESA &amp; PSD Consultation &nbsp;&middot;&nbsp;
          <a href="https://${COMPANY_DOMAIN}" style="color:${ACCENT};text-decoration:none;">${COMPANY_DOMAIN}</a>
        </p>
        <p style="margin:0;font-size:11px;color:#d1d5db;">
          Don&rsquo;t want to receive marketing emails from us?
          <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td>
    </tr>` : `
    <tr>
      <td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;background:#f9fafb;">
        <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;">
          You received this message because you have an active order with PawTenant.
        </p>
        <p style="margin:0;font-size:12px;color:#9ca3af;">
          ${COMPANY_NAME} &mdash; ESA &amp; PSD Consultation &nbsp;&middot;&nbsp;
          <a href="https://${COMPANY_DOMAIN}" style="color:${ACCENT};text-decoration:none;">${COMPANY_DOMAIN}</a>
        </p>
      </td>
    </tr>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0"
      style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr>
        <td style="background:${ACCENT};padding:32px;text-align:center;">
          <img src="${LOGO_URL}" width="160" alt="PawTenant" style="display:block;margin:0 auto 20px;height:auto;" />
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">
            ${escapeHtml(opts.subject)}
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          ${testBanner}
          <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>${name}</strong>,</p>
          ${bodyHtml}
          ${ctaBlock}
          <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
            If you have any questions, reply to this email or contact us at
            <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a>.
          </p>
        </td>
      </tr>
      ${unsubscribeBlock}
    </table>
  </td></tr>
</table>
</body></html>`;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Auth helper: resolves admin identity from service key OR Supabase Auth JWT ──
async function resolveAdminCaller(
  req: Request,
  adminClient: ReturnType<typeof createClient>,
  serviceKey: string,
): Promise<{ authorized: boolean; userId: string | null; callerName: string; callerId: string }> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { authorized: false, userId: null, callerName: "Unknown", callerId: "unknown" };
  }

  // Service role key = internal/trusted call
  if (token === serviceKey) {
    return { authorized: true, userId: null, callerName: "Internal Service", callerId: "service" };
  }

  // Try Supabase Auth session JWT
  const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !user) {
    return { authorized: false, userId: null, callerName: "Unknown", callerId: "unknown" };
  }

  const { data: profile } = await adminClient
    .from("doctor_profiles")
    .select("is_admin, role, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = profile?.is_admin === true ||
    ["owner", "admin_manager", "support"].includes(profile?.role ?? "");

  return {
    authorized: isAdmin,
    userId: user.id,
    callerName: profile?.full_name ?? user.email ?? "Admin",
    callerId: user.id,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "RESEND_API_KEY is not configured in Supabase secrets." }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // ── Auth ──────────────────────────────────────────────────────────────
    const { authorized, userId, callerName } = await resolveAdminCaller(req, adminClient, serviceKey);

    if (!authorized) {
      return new Response(
        JSON.stringify({ ok: false, error: "Authentication failed or insufficient permissions. Please refresh the page and log in again." }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json() as {
      recipients: Recipient[];
      subject: string;
      bodyText: string;
      includePortalCta?: boolean;
      ctaLabel?: string;
      ctaUrl?: string;
      sentBy?: string;
      audienceKey?: string;
      excludedCount?: number;
      isTest?: boolean;
      testEmail?: string;
    };

    const { subject, bodyText } = body;
    const includePortalCta = body.includePortalCta ?? true;
    const ctaLabel = body.ctaLabel ?? "View My Orders";
    const ctaUrl = body.ctaUrl ?? PORTAL_URL;
    const isTest = body.isTest ?? false;
    const testEmail = body.testEmail ?? "";
    const audienceKey = body.audienceKey ?? "";

    const isLeadRecovery = LEAD_RECOVERY_AUDIENCES.has(audienceKey) && isAssessmentUrl(ctaUrl);

    // ── Test mode ──────────────────────────────────────────────────────────
    if (isTest) {
      if (!testEmail) {
        return new Response(
          JSON.stringify({ ok: false, error: "testEmail is required for test sends" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
      if (!subject?.trim() || !bodyText?.trim()) {
        return new Response(
          JSON.stringify({ ok: false, error: "subject and bodyText are required" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const testCtaUrl = isLeadRecovery
        ? `${SITE_URL}/assessment?resume=SAMPLE-ORDER-ID`
        : ctaUrl;

      const html = buildBroadcastHtml({
        recipientName: callerName,
        subject: `[TEST] ${subject.trim()}`,
        bodyText: bodyText.trim(),
        includePortalCta,
        ctaLabel,
        ctaUrl: testCtaUrl,
        isTest: true,
        sentBy: body.sentBy,
      });

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [testEmail],
          subject: `[TEST] ${subject.trim()}`,
          html,
          tags: [{ name: "type", value: "broadcast_test" }],
        }),
      });

      if (res.ok) {
        try {
          await adminClient.from("broadcast_logs").insert({
            sent_by: body.sentBy ?? callerName,
            sent_by_user_id: userId,
            channel: "email",
            audience_key: audienceKey || "test",
            subject: subject.trim(),
            message_preview: bodyText.trim().slice(0, 200),
            recipients_count: 1,
            success_count: 1,
            fail_count: 0,
            excluded_count: 0,
            is_test: true,
            test_email: testEmail,
          });
        } catch (logErr) {
          console.warn("[broadcast-email] Failed to log test send:", logErr);
        }
        return new Response(
          JSON.stringify({ ok: true, successCount: 1, failCount: 0, isTest: true, testEmail }),
          { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      } else {
        const errBody = await res.text();
        return new Response(
          JSON.stringify({ ok: false, error: `Test send failed: ${errBody.slice(0, 120)}` }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Bulk send ──────────────────────────────────────────────────────────
    const recipients = body.recipients;
    if (!recipients?.length || !subject?.trim() || !bodyText?.trim()) {
      return new Response(
        JSON.stringify({ ok: false, error: "recipients, subject, and bodyText are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];
    const successfulConfirmationIds: string[] = [];

    const sentByTag = sanitizeTagValue(body.sentBy ?? "admin");
    const nowIso = new Date().toISOString();

    const BATCH_SIZE = 5;
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (recipient) => {
          const firstName = recipient.name?.split(" ")[0] || "there";
          const personalizedBody = bodyText.replace(/\{name\}/gi, firstName);

          let recipientCtaUrl = ctaUrl;
          if (isLeadRecovery && recipient.confirmation_id) {
            recipientCtaUrl = buildResumeUrl(recipient.confirmation_id, recipient.letter_type);
          }

          const unsubscribeUrl = buildUnsubscribeUrl(supabaseUrl, recipient.email);

          const html = buildBroadcastHtml({
            recipientName: firstName,
            subject,
            bodyText: personalizedBody,
            includePortalCta,
            ctaLabel,
            ctaUrl: recipientCtaUrl,
            isTest: false,
            unsubscribeUrl,
            sentBy: body.sentBy,
          });

          try {
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: FROM_ADDRESS,
                to: [recipient.email],
                subject,
                html,
                tags: [
                  { name: "type", value: "broadcast" },
                  { name: "sent_by", value: sentByTag },
                ],
              }),
            });

            if (res.ok) {
              successCount++;
              if (recipient.confirmation_id) {
                successfulConfirmationIds.push(recipient.confirmation_id);
              }
            } else {
              const errBody = await res.text();
              errors.push(`${recipient.email}: ${errBody.slice(0, 80)}`);
              failCount++;
            }
          } catch (err) {
            errors.push(`${recipient.email}: network error`);
            failCount++;
          }
        })
      );

      if (i + BATCH_SIZE < recipients.length) {
        await sleep(250);
      }
    }

    // ── Stamp last_broadcast_sent_at ───────────────────────────────────────
    if (successfulConfirmationIds.length > 0) {
      const STAMP_BATCH = 50;
      for (let i = 0; i < successfulConfirmationIds.length; i += STAMP_BATCH) {
        const chunk = successfulConfirmationIds.slice(i, i + STAMP_BATCH);
        try {
          await adminClient
            .from("orders")
            .update({ last_broadcast_sent_at: nowIso })
            .in("confirmation_id", chunk);
        } catch (stampErr) {
          console.warn("[broadcast-email] Failed to stamp last_broadcast_sent_at:", stampErr);
        }
      }
    }

    // ── Log the broadcast ──────────────────────────────────────────────────
    try {
      await adminClient.from("broadcast_logs").insert({
        sent_by: body.sentBy ?? callerName,
        sent_by_user_id: userId,
        channel: "email",
        audience_key: audienceKey || "unknown",
        subject: subject.trim(),
        message_preview: bodyText.trim().slice(0, 200),
        recipients_count: recipients.length,
        success_count: successCount,
        fail_count: failCount,
        excluded_count: body.excludedCount ?? 0,
        is_test: false,
        test_email: null,
      });
    } catch (logErr) {
      console.warn("[broadcast-email] Failed to log broadcast:", logErr);
    }

    return new Response(
      JSON.stringify({ ok: true, successCount, failCount, errors: errors.slice(0, 10) }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("broadcast-email error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
