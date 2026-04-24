import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Public self-serve password reset for the customer portal.
 *
 * Why this exists:
 * The built-in `supabase.auth.resetPasswordForEmail` path was failing with
 * `unexpected_failure` at Supabase's `/recover` endpoint (SMTP layer), so
 * paid customers like the one who retried 16 times could never get a reset
 * email. This function bypasses Supabase's SMTP entirely by generating the
 * recovery link via the admin API and delivering it through Resend — the
 * same channel the admin-side reset tool already uses successfully.
 *
 * Security notes:
 *   - Always returns ok:true regardless of whether the account exists, so
 *     this endpoint cannot be used to enumerate customers.
 *   - Soft rate limit per email (60s) using auth.users.recovery_sent_at so
 *     repeated clicks do not blast Resend with duplicate sends.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESET_REDIRECT = "https://www.pawtenant.com/reset-password";
const MIN_RESEND_INTERVAL_MS = 60_000;

function okResponse() {
  return new Response(
    JSON.stringify({
      ok: true,
      message: "If an account exists for that email, a reset link is on its way.",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const body = await req.json().catch(() => ({})) as { email?: string };
    const targetEmail = (body.email ?? "").trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!targetEmail || !emailRegex.test(targetEmail)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Please enter a valid email address." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Look up the user without leaking existence to the caller.
    const { data: existingUsers } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === targetEmail,
    );

    if (!existingUser) {
      // Silent success — do not reveal that the account is missing.
      return okResponse();
    }

    // Soft per-email rate limit to protect Resend / avoid send floods.
    const lastSent = existingUser.recovery_sent_at
      ? new Date(existingUser.recovery_sent_at).getTime()
      : 0;
    if (lastSent && Date.now() - lastSent < MIN_RESEND_INTERVAL_MS) {
      return okResponse();
    }

    // Get the first name off any existing order so the email feels personal.
    let firstName = "there";
    try {
      const { data: orderRow } = await adminClient
        .from("orders")
        .select("first_name")
        .eq("email", targetEmail)
        .not("first_name", "is", null)
        .limit(1)
        .maybeSingle();
      if (orderRow?.first_name) firstName = String(orderRow.first_name).trim() || "there";
    } catch {
      // Non-fatal — fall back to "there".
    }

    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: targetEmail,
      options: { redirectTo: RESET_REDIRECT },
    });

    if (linkErr || !linkData) {
      console.error("[request-customer-password-reset] generateLink failed:", linkErr?.message);
      // Fail silent — never tell caller anything beyond the generic success.
      return okResponse();
    }

    const actionLink = (linkData as { properties?: { action_link?: string } })?.properties?.action_link ?? null;
    if (!actionLink) {
      console.error("[request-customer-password-reset] No action_link returned from generateLink");
      return okResponse();
    }

    if (!resendApiKey) {
      console.error("[request-customer-password-reset] RESEND_API_KEY missing — cannot deliver reset email");
      return okResponse();
    }

    const subject = "Reset your PawTenant portal password";
    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:560px;width:100%;">
        <tr>
          <td style="background:#1a5c4f;padding:28px 32px;text-align:center;">
            <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png" alt="PawTenant" height="36" style="height:36px;display:block;margin:0 auto;" />
            <p style="color:rgba(255,255,255,0.8);font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:10px 0 0 0;">Customer Portal</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px;">
            <h2 style="color:#111827;font-size:22px;font-weight:800;margin:0 0 8px 0;">Reset your password</h2>
            <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 28px 0;">Hi ${firstName},<br><br>We received a request to reset the password for your PawTenant customer portal account. Click the button below to set a new password and regain access to your orders and ESA letters.</p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${actionLink}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;padding:15px 40px;border-radius:10px;letter-spacing:0.3px;">
                Reset My Password
              </a>
            </div>
            <table cellpadding="0" cellspacing="0" width="100%" style="background:#f8f9fa;border-radius:12px;margin:24px 0;">
              <tr>
                <td style="padding:18px 20px;">
                  <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">In your portal you can:</p>
                  <p style="margin:3px 0;font-size:13px;color:#6b7280;">&#x1F4CB;&nbsp; Track your order status in real time</p>
                  <p style="margin:3px 0;font-size:13px;color:#6b7280;">&#x2B07;&#xFE0F;&nbsp; Download or re-download your ESA letter</p>
                  <p style="margin:3px 0;font-size:13px;color:#6b7280;">&#x1F512;&nbsp; Securely access all past orders</p>
                </td>
              </tr>
            </table>
            <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:20px 0 0 0;padding-top:20px;border-top:1px solid #f3f4f6;">
              This link expires in <strong>1 hour</strong> and can only be used once.<br><br>
              If the button doesn&apos;t work, copy and paste this link:<br/>
              <a href="${actionLink}" style="color:#1a5c4f;word-break:break-all;font-size:11px;">${actionLink}</a><br><br>
              Didn&apos;t request this? You can safely ignore this email &mdash; your password won&apos;t change.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:20px 32px;text-align:center;">
            <p style="color:#9ca3af;font-size:11px;margin:0;">
              PawTenant &mdash; ESA Letter Services &mdash; <a href="https://pawtenant.com" style="color:#1a5c4f;text-decoration:none;">pawtenant.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "PawTenant <hello@pawtenant.com>",
          to: [targetEmail],
          subject,
          html: htmlBody,
        }),
      });
      if (!resendRes.ok) {
        const detail = await resendRes.text();
        console.error("[request-customer-password-reset] Resend failed:", detail);
      }
    } catch (resendEx) {
      console.error("[request-customer-password-reset] Resend exception:", resendEx);
    }

    return okResponse();
  } catch (err) {
    console.error("[request-customer-password-reset] Server error:", err);
    // Still return a generic success — the customer should see a consistent response.
    return okResponse();
  }
});
