// send-review-request — Sends Trustpilot review request via Email (Resend) or SMS (Twilio)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TRUSTPILOT_REVIEW_URL = "https://www.trustpilot.com/review/pawtenant.com";
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

    const { confirmationId, email, phone, firstName, channel, smsBody } = body;
    const name = firstName || "there";

    console.log(`[send-review-request] channel=${channel} confirmationId=${confirmationId} email=${email}`);

    if (channel === "email") {
      if (!email) return json({ ok: false, error: "email is required" }, 400);

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (!RESEND_API_KEY) {
        return json({ ok: false, error: "RESEND_API_KEY not configured in Supabase secrets" }, 500);
      }

      const html = buildEmailHTML(name);
      const subject = name !== "there"
        ? `${name}, share your PawTenant experience ⭐`
        : "Share your PawTenant experience ⭐";

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "PawTenant <support@pawtenant.com>",
          to: [email],
          subject,
          html,
          tags: [
            { name: "type", value: "trustpilot_review_request" },
            { name: "confirmation_id", value: confirmationId },
          ],
        }),
      });

      const resendText = await resendRes.text();
      if (!resendRes.ok) {
        return json({ ok: false, error: `Email send failed (${resendRes.status}): ${resendText}` }, 500);
      }

      return json({ ok: true, channel: "email", to: email });
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

      const messageBody = smsBody
        || `Hi ${name}! Your ESA letter from PawTenant is complete. If you had a great experience, we'd love a quick Trustpilot review! ⭐ ${TRUSTPILOT_REVIEW_URL}`;

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

      return json({ ok: true, channel: "sms", to: phone });
    }

    return json({ ok: false, error: "Invalid channel — must be 'email' or 'sms'" }, 400);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: `Internal error: ${msg}` }, 500);
  }
});
