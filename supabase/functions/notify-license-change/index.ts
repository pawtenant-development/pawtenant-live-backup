import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANY_NAME = "PawTenant";
const COMPANY_DOMAIN = "pawtenant.com";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const ADMIN_PORTAL_URL = `https://${COMPANY_DOMAIN}/admin-orders`;
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;
const HEADER_BG = "#1a5c4f";
const ACCENT = "#1a5c4f";

async function sendViaResend(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.error("[notify-license-change] RESEND_API_KEY not set"); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) { const err = await res.text(); console.error(`[notify-license-change] Resend error ${res.status}: ${err}`); return false; }
    return true;
  } catch (err) { console.error("[notify-license-change] fetch error:", err); return false; }
}

function escapeHtml(v = "") {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildEmail(opts: { providerName: string; providerEmail: string; changeType: string; details: string; timestamp: string }): string {
  const changeColor = opts.changeType.toLowerCase().includes("removed") ? "#dc2626" :
    opts.changeType.toLowerCase().includes("added") ? "#059669" : "#d97706";

  const changeBg = opts.changeType.toLowerCase().includes("removed") ? "#fef2f2" :
    opts.changeType.toLowerCase().includes("added") ? "#f0fdf4" : "#fffbeb";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr>
        <td style="background:${HEADER_BG};padding:28px 32px;text-align:center;">
          <img src="${LOGO_URL}" width="160" alt="${COMPANY_NAME}" style="display:block;margin:0 auto 14px;height:auto;" />
          <div style="display:inline-block;background:rgba(255,255,255,0.2);color:#fff;padding:4px 14px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:12px;">License Change Alert</div>
          <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#ffffff;">Provider License Update</h1>
          <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.8);">A provider has modified their license information</p>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.7;">
            A provider has made changes to their license information in the provider portal. Please review the details below.
          </p>

          <!-- Provider Info -->
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin-bottom:18px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Provider</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#9ca3af;width:40%;">Name</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;text-align:right;">${escapeHtml(opts.providerName)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Email</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;text-align:right;">${escapeHtml(opts.providerEmail)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#9ca3af;">Timestamp</td>
                <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;text-align:right;">${escapeHtml(opts.timestamp)}</td>
              </tr>
            </table>
          </div>

          <!-- Change Details -->
          <div style="background:${changeBg};border:1px solid ${changeColor}33;border-radius:12px;padding:18px;margin-bottom:24px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${changeColor};text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(opts.changeType)}</p>
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(opts.details)}</p>
          </div>

          <!-- CTA -->
          <div style="text-align:center;margin:24px 0;">
            <a href="${ADMIN_PORTAL_URL}" style="background:${ACCENT};color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">
              Review in Admin Portal →
            </a>
          </div>

          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
            This is an automated notification. No action is required unless the change needs to be reviewed or reversed.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">${COMPANY_NAME} Admin Notification</p>
          <p style="margin:0;font-size:11px;color:#9ca3af;">${SUPPORT_EMAIL}</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

interface Payload {
  providerName: string;
  providerEmail: string;
  changeType: string;
  details: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Payload;
  try { body = (await req.json()) as Payload; }
  catch { return json({ error: "Invalid JSON" }, 400); }

  if (!body.providerName || !body.changeType) return json({ error: "providerName and changeType are required" }, 400);

  const adminEmail = Deno.env.get("ADMIN_EMAIL") ?? SUPPORT_EMAIL;
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET";

  const sent = await sendViaResend({
    to: adminEmail,
    subject: `[License Change] ${body.providerName} — ${body.changeType}`,
    html: buildEmail({
      providerName: body.providerName,
      providerEmail: body.providerEmail ?? "",
      changeType: body.changeType,
      details: body.details ?? "",
      timestamp,
    }),
  });

  return json({ ok: true, emailSent: sent });
});
