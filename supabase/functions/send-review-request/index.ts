// send-review-request — Sends Trustpilot review request via Email (Resend) or SMS (Twilio)
//
// EMAIL RENDERING:
//   The email body MUST match the Settings hub preview. Both use the same
//   pipeline:
//     1. Load DB row from email_templates where slug='review_request' and
//        channel='email'.
//     2. Substitute vars ({name}, {review_url}, {site_url}) in subject, body,
//        cta_label, cta_url.
//     3. Render body as <p> paragraphs (split on \n\n; \n becomes <br/>).
//     4. Append CTA button if cta_label + cta_url are non-empty.
//     5. Wrap in the master layout from comms_settings.email_layout_html.
//        If no master layout is configured, use a clean FALLBACK_LAYOUT
//        (no 5-star block, no marketing chrome — admin's body is the
//        source of truth).
//   Hardcoded body (buildFallbackEmailHTML) runs ONLY when the DB row is
//   missing, and the fallback path is logged with templateSource='hardcoded'.
//
// TRUSTPILOT BCC:
//   Manual-only. Attached only at the email-channel send site below.
//   Reads TRUSTPILOT_BCC_EMAIL secret with hardcoded fallback constant.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logEmailComm } from "../_shared/logEmailComm.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TRUSTPILOT_REVIEW_URL = "https://www.trustpilot.com/review/pawtenant.com";
// Trustpilot invite BCC — required by Trustpilot to verify review invitations.
// Scoped to this function only (review request emails). Do NOT add globally.
const TRUSTPILOT_BCC_FALLBACK = "pawtenant.com+ddb0d00de5@invite.trustpilot.com";

const FROM_EMAIL = "PawTenant <support@pawtenant.com>";
const SITE_URL   = Deno.env.get("SITE_URL") ?? "https://www.pawtenant.com";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function escapeHtml(v = ""): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function substitute(s: string, vars: Record<string, string>): string {
  return String(s ?? "").replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

// Clean fallback layout (used only when comms_settings.email_layout_html
// is not configured). Mirrors the structure used in send-templated-email
// and the Settings hub preview — header, body slot, footer.
const FALLBACK_LAYOUT = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr><td style="background:#3b6ea5;padding:28px 32px;text-align:center;">
        <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png" width="160" alt="PawTenant" style="display:block;margin:0 auto 10px;height:auto;" />
        <span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.75);letter-spacing:0.05em;">ESA &amp; PSD Letter Consultations</span>
      </td></tr>
      <tr><td style="padding:32px 36px;">{{content}}</td></tr>
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
        <p style="margin:0 0 4px 0;font-size:12px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:hello@pawtenant.com" style="color:#3b6ea5;text-decoration:none;">hello@pawtenant.com</a></p>
        <p style="margin:0;font-size:11px;color:#9ca3af;">PawTenant &mdash; ESA &amp; PSD Letter Consultations &nbsp;&middot;&nbsp; <a href="https://pawtenant.com" style="color:#9ca3af;">pawtenant.com</a></p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

async function loadMasterLayout(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const { data } = await supabase
    .from("comms_settings")
    .select("value")
    .eq("key", "email_layout_html")
    .maybeSingle();
  const val = (data?.value as string | null) ?? "";
  if (val && val.includes("{{content}}")) return val;
  return FALLBACK_LAYOUT;
}

// Render body text + CTA the same way Settings preview does.
function renderBodyAsHtml(subject: string, bodyText: string, ctaLabel: string, ctaUrl: string): string {
  const paragraphs = bodyText
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px 0;line-height:1.65;color:#374151;font-size:15px;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  const cta = (ctaLabel && ctaUrl)
    ? `<div style="text-align:center;margin:28px 0 0;">
         <a href="${ctaUrl}" style="display:inline-block;background:#3b6ea5;color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">${ctaLabel}</a>
       </div>`
    : "";

  const heading = subject
    ? `<h1 style="margin:0 0 22px 0;font-size:20px;font-weight:800;color:#111827;line-height:1.3;">${escapeHtml(subject)}</h1>`
    : "";

  return `${heading}${paragraphs}${cta}`;
}

// Hardcoded fallback used ONLY when DB template row is missing.
// Logged with templateSource='hardcoded'.
function buildFallbackEmailHTML(firstName: string, reviewUrl: string): string {
  const name = escapeHtml(firstName || "there");
  const safeUrl = escapeHtml(reviewUrl);
  const subject = "Share your PawTenant experience";
  const body = `Hi ${name},\n\nThank you for choosing PawTenant. If you have a moment, we'd really appreciate an honest review of your experience — it helps other pet owners and helps us keep improving.`;
  const content = renderBodyAsHtml(subject, body, "Write My Review", safeUrl);
  return FALLBACK_LAYOUT.replace("{{content}}", content);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as {
      confirmationId: string;
      email?: string;
      phone?: string;
      firstName?: string;
      channel: "email" | "sms";
      reviewUrl?: string;
      smsBody?: string;
    };

    const { confirmationId, email, phone, firstName, channel } = body;
    const name = firstName || "there";
    const reviewUrl = body.reviewUrl || TRUSTPILOT_REVIEW_URL;

    console.log(`[send-review-request] channel=${channel} confirmationId=${confirmationId} email=${email ?? "(none)"}`);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;

    // ───────────────────────────── EMAIL ─────────────────────────────────
    if (channel === "email") {
      if (!email) return json({ ok: false, error: "email is required" }, 400);

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (!RESEND_API_KEY) {
        return json({ ok: false, error: "RESEND_API_KEY not configured in Supabase secrets" }, 500);
      }

      let html: string;
      let subject: string;
      let templateSource: "db" | "hardcoded" = "hardcoded";

      // DB-first template lookup. Body, subject, CTA all come from the row
      // so the email matches the Settings hub preview exactly.
      if (supabase) {
        const { data: tmpl } = await supabase
          .from("email_templates")
          .select("subject, body, cta_label, cta_url")
          .eq("slug", "review_request")
          .eq("channel", "email")
          .maybeSingle();

        if (tmpl) {
          const vars: Record<string, string> = {
            name,
            review_url: reviewUrl,
            site_url: SITE_URL,
          };

          subject = substitute(tmpl.subject as string, vars) ||
            (name !== "there" ? `${name}, share your PawTenant experience` : "Share your PawTenant experience");
          const bodyText  = substitute((tmpl.body as string)      ?? "", vars);
          const ctaLabel  = substitute((tmpl.cta_label as string) ?? "", vars);
          const ctaUrl    = substitute((tmpl.cta_url as string)   ?? "", vars) || reviewUrl;

          const content = renderBodyAsHtml(subject, bodyText, ctaLabel || "Write My Review", ctaUrl);
          const layout  = await loadMasterLayout(supabase);
          html = layout.replace("{{content}}", content);
          templateSource = "db";
        } else {
          console.warn("[send-review-request] DB template review_request/email NOT FOUND — using hardcoded fallback");
          subject = name !== "there"
            ? `${name}, share your PawTenant experience`
            : "Share your PawTenant experience";
          html = buildFallbackEmailHTML(name, reviewUrl);
        }
      } else {
        console.warn("[send-review-request] Supabase client unavailable — using hardcoded fallback");
        subject = name !== "there"
          ? `${name}, share your PawTenant experience`
          : "Share your PawTenant experience";
        html = buildFallbackEmailHTML(name, reviewUrl);
      }

      // Trustpilot invite BCC — only attached for review request emails.
      // Customer does not see BCC. Empty/undefined values are not sent.
      const trustpilotBcc = (Deno.env.get("TRUSTPILOT_BCC_EMAIL") || TRUSTPILOT_BCC_FALLBACK).trim();
      const resendPayload: Record<string, unknown> = {
        from: FROM_EMAIL,
        to: [email],
        subject,
        html,
        tags: [
          { name: "type", value: "trustpilot_review_request" },
          { name: "confirmation_id", value: confirmationId },
          { name: "template_source", value: templateSource },
        ],
      };
      if (trustpilotBcc) {
        resendPayload.bcc = [trustpilotBcc];
      }

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify(resendPayload),
      });

      const resendText = await resendRes.text();
      if (!resendRes.ok) {
        return json({ ok: false, error: `Email send failed (${resendRes.status}): ${resendText}` }, 500);
      }

      // Primary log → communications (single source of truth)
      if (supabase) {
        await logEmailComm({
          supabase,
          confirmationId: confirmationId ?? null,
          to: email,
          from: FROM_EMAIL,
          subject,
          body: null,
          slug: "review_request",
          templateSource,
          sentBy: "admin_review_request",
        });

        // Backup log → orders.email_log (legacy)
        if (confirmationId) {
          try {
            const { data: order } = await supabase
              .from("orders")
              .select("email_log")
              .eq("confirmation_id", confirmationId)
              .maybeSingle();
            const existingLog = (order?.email_log as unknown[]) ?? [];
            await supabase.from("orders").update({
              email_log: [...existingLog, {
                type: "review_request",
                sentAt: new Date().toISOString(),
                to: email,
                success: true,
                slug: "review_request",
                templateSource,
              }],
            }).eq("confirmation_id", confirmationId);
          } catch (logErr) {
            console.error("[send-review-request] email_log write failed", logErr);
          }
        }
      }

      return json({ ok: true, channel: "email", to: email, templateSource });
    }

    // ─────────────────────────────── SMS ─────────────────────────────────
    if (channel === "sms") {
      if (!phone) return json({ ok: false, error: "phone is required for SMS" }, 400);

      const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
      const TWILIO_AUTH_TOKEN  = Deno.env.get("TWILIO_AUTH_TOKEN");
      const TWILIO_FROM        = Deno.env.get("TWILIO_FROM_NUMBER");

      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
        return json({
          ok: false,
          error: `Twilio credentials missing — SID:${!!TWILIO_ACCOUNT_SID} TOKEN:${!!TWILIO_AUTH_TOKEN} FROM:${!!TWILIO_FROM}`,
        }, 500);
      }

      let messageBody = body.smsBody || "";
      let templateSource = "hardcoded";

      // DB-first SMS template lookup
      if (!messageBody && supabase) {
        const { data: tmpl } = await supabase
          .from("email_templates")
          .select("body")
          .eq("slug", "review_request_sms")
          .eq("channel", "sms")
          .maybeSingle();

        if (tmpl) {
          messageBody = (tmpl.body as string)
            .replace(/\{name\}/g, name)
            .replace(/\{review_url\}/g, reviewUrl);
          templateSource = "db";
        }
      }

      if (!messageBody) {
        messageBody = `Hi ${name}! Your ESA letter from PawTenant is complete. If you had a great experience, we'd love a quick Trustpilot review! ⭐ ${reviewUrl}`;
      }

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          },
          body: new URLSearchParams({ From: TWILIO_FROM, To: phone, Body: messageBody }).toString(),
        }
      );

      const twilioText = await twilioRes.text();
      if (!twilioRes.ok) {
        return json({ ok: false, error: `SMS send failed (${twilioRes.status}): ${twilioText}` }, 500);
      }

      // Log to communications so it surfaces in the unified Comms timeline
      if (supabase && confirmationId) {
        try {
          let twilioSid: string | null = null;
          try {
            const parsed = JSON.parse(twilioText) as { sid?: string };
            twilioSid = parsed.sid ?? null;
          } catch (_) { /* non-JSON response — ignore */ }

          const { data: order } = await supabase
            .from("orders")
            .select("id")
            .eq("confirmation_id", confirmationId)
            .maybeSingle();

          await supabase.from("communications").insert({
            order_id: (order as { id?: string } | null)?.id ?? null,
            confirmation_id: confirmationId,
            type: "sms",
            direction: "outbound",
            body: messageBody,
            phone_from: TWILIO_FROM,
            phone_to: phone,
            status: "sent",
            sent_by: "review_request",
            twilio_sid: twilioSid,
          });
        } catch (logErr) {
          console.error("[send-review-request] sms log write failed", logErr);
        }
      }

      return json({ ok: true, channel: "sms", to: phone, templateSource });
    }

    return json({ ok: false, error: "Invalid channel — must be 'email' or 'sms'" }, 400);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: `Internal error: ${msg}` }, 500);
  }
});
