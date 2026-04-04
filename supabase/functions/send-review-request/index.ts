// send-review-request — Sends Trustpilot review request via Email (Resend) or SMS (Twilio)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TRUSTPILOT_REVIEW_URL = "https://www.trustpilot.com/review/pawtenant.com";
const PAWTENANT_GREEN = "#1a5c4f";
const PAWTENANT_LIGHT = "#f0faf7";
const PAWTENANT_BORDER = "#b8ddd5";

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

      <!-- Header -->
      <tr>
        <td style="background:${PAWTENANT_GREEN};padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.3px;">Your ESA Letter is Ready!</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Thank you for choosing PawTenant</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:40px 40px 32px;">
          <p style="margin:0 0 16px;color:#1a1a1a;font-size:16px;line-height:1.6;">Hi <strong>${name}</strong>,</p>
          <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.7;">
            We hope your ESA letter is everything you needed. It was a pleasure supporting you and your pet through this process.
          </p>
          <p style="margin:0 0 28px;color:#444;font-size:15px;line-height:1.7;">
            If you had a positive experience, we'd love to hear about it! Your review helps other pet owners find the support they need — and it means the world to our small team.
          </p>

          <!-- Star graphic -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td align="center" style="background:${PAWTENANT_LIGHT};border:1px solid ${PAWTENANT_BORDER};border-radius:12px;padding:24px 20px;">
                <p style="margin:0 0 8px;font-size:28px;letter-spacing:4px;">&#9733;&#9733;&#9733;&#9733;&#9733;</p>
                <p style="margin:0 0 4px;color:${PAWTENANT_GREEN};font-size:15px;font-weight:700;">Leave us a 5-star review on Trustpilot</p>
                <p style="margin:0;color:#666;font-size:13px;">Takes less than 60 seconds</p>
              </td>
            </tr>
          </table>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td align="center">
                <a href="${TRUSTPILOT_REVIEW_URL}"
                   style="display:inline-block;background:${PAWTENANT_GREEN};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.2px;">
                  &#9733; Write My Review
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 8px;color:#888;font-size:13px;line-height:1.6;">
            Or copy this link into your browser:<br/>
            <a href="${TRUSTPILOT_REVIEW_URL}" style="color:${PAWTENANT_GREEN};word-break:break-all;">${TRUSTPILOT_REVIEW_URL}</a>
          </p>
        </td>
      </tr>

      <!-- Divider -->
      <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #f0f0f0;margin:0;"/></td></tr>

      <!-- Footer -->
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

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

    const { confirmationId, email, phone, firstName, channel, smsBody } = body;
    const name = firstName || "there";

    if (channel === "email") {
      if (!email) return new Response(JSON.stringify({ ok: false, error: "email is required" }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 400 });

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (!RESEND_API_KEY) return new Response(JSON.stringify({ ok: false, error: "RESEND_API_KEY not configured" }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 });

      const html = buildEmailHTML(name);

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "PawTenant <support@pawtenant.com>",
          to: [email],
          subject: `${name !== "there" ? name + ", share" : "Share"} your PawTenant experience ⭐`,
          html,
          tags: [{ name: "type", value: "trustpilot_review_request" }, { name: "confirmation_id", value: confirmationId }],
        }),
      });

      if (!resendRes.ok) {
        const err = await resendRes.text();
        console.error("[send-review-request] Resend error:", err);
        return new Response(JSON.stringify({ ok: false, error: `Email delivery failed: ${err}` }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 });
      }

      return new Response(JSON.stringify({ ok: true, channel: "email", to: email }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (channel === "sms") {
      if (!phone) return new Response(JSON.stringify({ ok: false, error: "phone is required for SMS" }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 400 });

      const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
      const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
      const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER");

      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
        return new Response(JSON.stringify({ ok: false, error: "Twilio credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)" }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 });
      }

      const messageBody = smsBody || `Hi ${name}! Your ESA letter from PawTenant is complete. If you had a great experience, we'd love a quick Trustpilot review! ⭐ ${TRUSTPILOT_REVIEW_URL}`;

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

      if (!twilioRes.ok) {
        const err = await twilioRes.text();
        console.error("[send-review-request] Twilio error:", err);
        return new Response(JSON.stringify({ ok: false, error: `SMS delivery failed: ${err}` }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 });
      }

      return new Response(JSON.stringify({ ok: true, channel: "sms", to: phone }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: false, error: "Invalid channel — must be 'email' or 'sms'" }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 400 });

  } catch (err) {
    console.error("[send-review-request] Unexpected error:", err);
    return new Response(JSON.stringify({ ok: false, error: "Internal server error" }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 });
  }
});
