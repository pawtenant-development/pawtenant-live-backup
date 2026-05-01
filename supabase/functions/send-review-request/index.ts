// send-review-request — Sends Trustpilot review request via Email (Resend) or SMS (Twilio)
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
const ACCENT = "#4a7fb5";
const ACCENT_LIGHT = "#eef2f9";
const ACCENT_BORDER = "#b8cce4";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function buildEmailHTML(firstName: string): string {
  const name = firstName || "there";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Share Your Experience — PawTenant</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e0e0e0;">
      <tr>
        <td style="background:${ACCENT};padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.3px;">Your ESA Letter is Ready!</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Thank you for choosing PawTenant</p>
        </td>
      </tr>
      <tr>
        <td style="padding:40px 40px 32px;">
          <p style="margin:0 0 16px;color:#1a1a1a;font-size:16px;line-height:1.6;">Hi <strong>${name}</strong>,</p>
          <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
            We hope your ESA letter is everything you needed. It was a pleasure supporting you and your pet through this process.
          </p>
          <p style="margin:0 0 28px;color:#444;font-size:15px;line-height:1.7;">
            If you had a positive experience, we'd love to hear about it! Your review helps other pet owners find the support they need — and it means the world to our small team.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td align="center" style="background:${ACCENT_LIGHT};border:1px solid ${ACCENT_BORDER};border-radius:12px;padding:24px 20px;">
                <p style="margin:0 0 8px;font-size:28px;letter-spacing:4px;">&#9733;&#9733;&#9733;&#9733;&#9733;</p>
                <p style="margin:0 0 4px;color:${ACCENT};font-size:15px;font-weight:700;">Leave us a 5-star review on Trustpilot</p>
                <p style="margin:0;color:#666;font-size:13px;">Takes less than 60 seconds</p>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td align="center">
                <a href="${TRUSTPILOT_REVIEW_URL}"
                   style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.2px;">
                  &#9733; Write My Review
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 8px;color:#888;font-size:13px;line-height:1.6;">
            Or copy this link into your browser:<br/>
            <a href="${TRUSTPILOT_REVIEW_URL}" style="color:${ACCENT};word-break:break-all;">${TRUSTPILOT_REVIEW_URL}</a>
          </p>
        </td>
      </tr>
      <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #f0f0f0;margin:0;"/></td></tr>
      <tr>
        <td style="padding:24px 40px;text-align:center;">
          <p style="margin:0 0 4px;color:#aaa;font-size:12px;">PawTenant &bull; Secure ESA Consultation Support</p>
          <p style="margin:0;color:#ccc;font-size:11px;">
            <a href="https://pawtenant.com" style="color:#aaa;text-decoration:none;">pawtenant.com</a>
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

async function loadMasterLayout(
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  const { data } = await supabase
    .from("comms_settings")
    .select("value")
    .eq("key", "email_layout_html")
    .maybeSingle();
  const val = (data?.value as string | null) ?? null;
  if (val && val.includes("{{content}}")) return val;
  return null;
}

function buildEmailFromDbTemplate(
  tmplBody: string,
  ctaLabel: string,
  ctaUrl: string,
  vars: Record<string, string>,
  masterLayout?: string | null,
): string {
  const sub = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

  const bodyHtml = sub(tmplBody)
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((line) => `<p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">${line}</p>`)
    .join("");

  const reviewUrl = sub(ctaUrl) || TRUSTPILOT_REVIEW_URL;
  const ctaText = sub(ctaLabel) || "&#9733; Write My Review";

  if (masterLayout) {
    const cta = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td align="center">
        <a href="${reviewUrl}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">${ctaText}</a>
      </td></tr>
    </table>`;
    return masterLayout.replace("{{content}}", `${bodyHtml}${cta}`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Share Your Experience — PawTenant</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e0e0e0;">
      <tr>
        <td style="background:${ACCENT};padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;">Your ESA Letter is Ready!</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Thank you for choosing PawTenant</p>
        </td>
      </tr>
      <tr>
        <td style="padding:40px 40px 32px;">
          ${bodyHtml}
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td align="center" style="background:${ACCENT_LIGHT};border:1px solid ${ACCENT_BORDER};border-radius:12px;padding:24px 20px;">
                <p style="margin:0 0 8px;font-size:28px;letter-spacing:4px;">&#9733;&#9733;&#9733;&#9733;&#9733;</p>
                <p style="margin:0 0 4px;color:${ACCENT};font-size:15px;font-weight:700;">Leave us a 5-star review on Trustpilot</p>
                <p style="margin:0;color:#666;font-size:13px;">Takes less than 60 seconds</p>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td align="center">
                <a href="${reviewUrl}"
                   style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">
                  ${ctaText}
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0;color:#888;font-size:13px;line-height:1.6;">
            Or copy this link: <a href="${reviewUrl}" style="color:${ACCENT};word-break:break-all;">${reviewUrl}</a>
          </p>
        </td>
      </tr>
      <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #f0f0f0;margin:0;"/></td></tr>
      <tr>
        <td style="padding:24px 40px;text-align:center;">
          <p style="margin:0 0 4px;color:#aaa;font-size:12px;">PawTenant &bull; Secure ESA Consultation Support</p>
          <p style="margin:0;color:#ccc;font-size:11px;">
            <a href="https://pawtenant.com" style="color:#aaa;text-decoration:none;">pawtenant.com</a>
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
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

    console.log(`[send-review-request] channel=${channel} confirmationId=${confirmationId} email=${email}`);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;

    if (channel === "email") {
      if (!email) return json({ ok: false, error: "email is required" }, 400);

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (!RESEND_API_KEY) {
        return json({ ok: false, error: "RESEND_API_KEY not configured in Supabase secrets" }, 500);
      }

      let html: string;
      let subject: string;
      let templateSource = "hardcoded";

      // DB-first template lookup
      if (supabase) {
        const { data: tmpl } = await supabase
          .from("email_templates")
          .select("subject, body, cta_label, cta_url")
          .eq("slug", "review_request")
          .eq("channel", "email")
          .maybeSingle();

        if (tmpl) {
          const vars: Record<string, string> = { name, review_url: reviewUrl };
          subject = (tmpl.subject as string).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
          const masterLayout = await loadMasterLayout(supabase);
          html = buildEmailFromDbTemplate(
            tmpl.body as string,
            tmpl.cta_label as string,
            tmpl.cta_url as string,
            vars,
            masterLayout,
          );
          templateSource = "db";
        } else {
          subject = name !== "there"
            ? `${name}, share your PawTenant experience ⭐`
            : "Share your PawTenant experience ⭐";
          html = buildEmailHTML(name);
        }
      } else {
        subject = name !== "there"
          ? `${name}, share your PawTenant experience ⭐`
          : "Share your PawTenant experience ⭐";
        html = buildEmailHTML(name);
      }

      // Trustpilot invite BCC — only attached for review request emails.
      // Customer does not see BCC. Empty/undefined values are not sent.
      const trustpilotBcc = (Deno.env.get("TRUSTPILOT_BCC_EMAIL") || TRUSTPILOT_BCC_FALLBACK).trim();
      const resendPayload: Record<string, unknown> = {
        from: "PawTenant <support@pawtenant.com>",
        to: [email],
        subject,
        html,
        tags: [
          { name: "type", value: "trustpilot_review_request" },
          { name: "confirmation_id", value: confirmationId },
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
          from: "PawTenant <support@pawtenant.com>",
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
