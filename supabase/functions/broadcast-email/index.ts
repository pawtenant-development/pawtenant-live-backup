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

interface Recipient {
  email: string;
  name: string;
  confirmation_id?: string;
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

function buildBroadcastHtml(opts: {
  recipientName: string;
  subject: string;
  bodyText: string;
  includePortalCta: boolean;
  ctaLabel: string;
  ctaUrl: string;
  isTest?: boolean;
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

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0"
      style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <!-- Header -->
      <tr>
        <td style="background:#1a5c4f;padding:32px;text-align:center;">
          <img src="${LOGO_URL}" width="160" alt="PawTenant" style="display:block;margin:0 auto 20px;height:auto;" />
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">
            ${escapeHtml(opts.subject)}
          </h1>
        </td>
      </tr>
      <!-- Body -->
      <tr>
        <td style="padding:32px;">
          ${testBanner}
          <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>${name}</strong>,</p>
          ${bodyHtml}
          ${ctaBlock}
          <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
            If you have any questions, reply to this email or contact us at
            <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a5c4f;text-decoration:none;">${SUPPORT_EMAIL}</a>.
          </p>
        </td>
      </tr>
      <!-- Footer -->
      <tr>
        <td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;background:#f9fafb;">
          <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;">
            You received this message because you have an active order with PawTenant.
          </p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            ${COMPANY_NAME} &mdash; ESA &amp; PSD Consultation &nbsp;&middot;&nbsp;
            <a href="https://${COMPANY_DOMAIN}" style="color:#1a5c4f;text-decoration:none;">${COMPANY_DOMAIN}</a>
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "RESEND_API_KEY is not configured in Supabase secrets." }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Auth check — support both Authorization header and apikey header
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "Missing Authorization header — please log in again." }), {
        status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();

    if (authErr || !caller) {
      const errMsg = authErr?.message ?? "Token invalid or session expired";
      console.error("[broadcast-email] Auth error:", errMsg, "| Token prefix:", token.slice(0, 20));
      return new Response(JSON.stringify({ ok: false, error: `Authentication failed: ${errMsg}. Please refresh the page and log in again.` }), {
        status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: callerProfile } = await adminClient
      .from("doctor_profiles")
      .select("is_admin, role, full_name")
      .eq("user_id", caller.id)
      .maybeSingle();

    const isAdmin = callerProfile?.is_admin === true ||
      ["owner", "admin_manager", "support"].includes(callerProfile?.role ?? "");
    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "Admin access required" }), {
        status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
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
      // Test mode
      isTest?: boolean;
      testEmail?: string;
    };

    const { subject, bodyText } = body;
    const includePortalCta = body.includePortalCta ?? true;
    const ctaLabel = body.ctaLabel ?? "View My Orders";
    const ctaUrl = body.ctaUrl ?? PORTAL_URL;
    const isTest = body.isTest ?? false;
    const testEmail = body.testEmail ?? "";

    // Test mode — send single email to admin's own address
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

      const html = buildBroadcastHtml({
        recipientName: callerProfile?.full_name ?? "Admin",
        subject: `[TEST] ${subject.trim()}`,
        bodyText: bodyText.trim(),
        includePortalCta,
        ctaLabel,
        ctaUrl,
        isTest: true,
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
        // Log test send
        try {
          await adminClient.from("broadcast_logs").insert({
            sent_by: body.sentBy ?? callerProfile?.full_name ?? "Admin",
            sent_by_user_id: caller.id,
            channel: "email",
            audience_key: body.audienceKey ?? "test",
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
        console.error("[broadcast-email] Test send failed:", errBody);
        return new Response(
          JSON.stringify({ ok: false, error: `Test send failed: ${errBody.slice(0, 120)}` }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
    }

    // Normal bulk send
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

    const sentByTag = sanitizeTagValue(body.sentBy ?? "admin");

    // Send in batches of 5 with a 250ms delay between batches
    const BATCH_SIZE = 5;
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (recipient) => {
          const firstName = recipient.name?.split(" ")[0] || "there";
          const personalizedBody = bodyText.replace(/\{name\}/gi, firstName);
          const html = buildBroadcastHtml({
            recipientName: firstName,
            subject,
            bodyText: personalizedBody,
            includePortalCta,
            ctaLabel,
            ctaUrl,
            isTest: false,
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
            } else {
              const errBody = await res.text();
              console.error(`Failed to send to ${recipient.email}: ${errBody}`);
              errors.push(`${recipient.email}: ${errBody.slice(0, 80)}`);
              failCount++;
            }
          } catch (err) {
            console.error(`Exception sending to ${recipient.email}:`, err);
            errors.push(`${recipient.email}: network error`);
            failCount++;
          }
        })
      );

      if (i + BATCH_SIZE < recipients.length) {
        await sleep(250);
      }
    }

    // Log the broadcast
    try {
      await adminClient.from("broadcast_logs").insert({
        sent_by: body.sentBy ?? callerProfile?.full_name ?? "Admin",
        sent_by_user_id: caller.id,
        channel: "email",
        audience_key: body.audienceKey ?? "unknown",
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
