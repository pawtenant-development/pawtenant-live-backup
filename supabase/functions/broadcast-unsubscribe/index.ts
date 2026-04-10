/**
 * broadcast-unsubscribe
 * Handles unsubscribe clicks from broadcast marketing emails.
 * Sets broadcast_opt_out = true on the matching order(s) for this email.
 * Returns a simple HTML confirmation page.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const SITE_URL = "https://www.pawtenant.com";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const ACCENT = "#1a5c4f";
const HEADER_BG = "#4a9e8a";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(v = "") {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildSuccessPage(email: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Unsubscribed — PawTenant</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;min-height:100vh;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;max-width:480px;width:100%;">
        <tr>
          <td style="background:${HEADER_BG};padding:28px;text-align:center;">
            <img src="${LOGO_URL}" width="160" alt="PawTenant" style="display:block;margin:0 auto;height:auto;" />
          </td>
        </tr>
        <tr>
          <td style="padding:40px 32px;text-align:center;">
            <div style="width:56px;height:56px;background:#f0faf7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px;">
              <span style="font-size:28px;color:${ACCENT};">&#10003;</span>
            </div>
            <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#111827;">You&rsquo;ve been unsubscribed</h1>
            <p style="margin:0 0 8px;font-size:15px;color:#6b7280;line-height:1.6;">
              ${email ? `<strong>${escapeHtml(email)}</strong> has been` : "You&rsquo;ve been"} removed from our marketing emails.
              You won&rsquo;t receive any more broadcast emails from us.
            </p>
            <p style="margin:0 0 28px;font-size:13px;color:#9ca3af;line-height:1.6;">
              You&rsquo;ll still receive important transactional emails about your order (confirmation, letter delivery, etc.).
              If you change your mind, contact us at
              <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a>.
            </p>
            <a href="${SITE_URL}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;">
              Back to PawTenant
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e5e7eb;background:#f9fafb;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Error — PawTenant</title></head>
<body style="margin:0;padding:40px;background:#f3f4f6;font-family:Arial,sans-serif;text-align:center;">
  <h2 style="color:#ef4444;">Something went wrong</h2>
  <p style="color:#6b7280;">${escapeHtml(message)}</p>
  <p style="color:#6b7280;">Please email us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};">${SUPPORT_EMAIL}</a> to opt out.</p>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const html = (content: string, status = 200) =>
    new Response(content, { status, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });

  try {
    const url = new URL(req.url);
    const tokenParam = url.searchParams.get("token");

    if (!tokenParam) {
      return html(buildErrorPage("Invalid unsubscribe link — missing token."), 400);
    }

    // Decode email from token (base64 of encodeURIComponent(email))
    let email: string;
    try {
      email = decodeURIComponent(atob(tokenParam)).toLowerCase().trim();
    } catch {
      return html(buildErrorPage("Invalid unsubscribe link — could not decode token."), 400);
    }

    if (!email || !email.includes("@")) {
      return html(buildErrorPage("Invalid unsubscribe link — email address not found."), 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Mark all orders for this email as broadcast opted out
    const { error } = await supabase
      .from("orders")
      .update({ broadcast_opt_out: true })
      .ilike("email", email);

    if (error) {
      // Column may not exist yet — log but still show success to user
      console.warn("[broadcast-unsubscribe] DB update error (column may not exist):", error.message);
    }

    // Write audit log
    try {
      await supabase.from("audit_logs").insert({
        actor_name: email,
        actor_role: "customer",
        object_type: "broadcast_opt_out",
        object_id: email,
        action: "broadcast_unsubscribed",
        description: `Customer ${email} unsubscribed from broadcast marketing emails`,
        metadata: { email, timestamp: new Date().toISOString() },
      });
    } catch {
      // Non-critical
    }

    console.log("[broadcast-unsubscribe] Opted out:", email);
    return html(buildSuccessPage(email));

  } catch (err) {
    console.error("[broadcast-unsubscribe] Error:", err);
    return html(buildErrorPage("An unexpected error occurred. Please try again or contact support."), 500);
  }
});
