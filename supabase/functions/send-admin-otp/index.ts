import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COMPANY_NAME = "PawTenant";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function buildOTPEmail(name: string, otp: string, expiresMinutes: number, isChallenge: boolean): string {
  const subject = isChallenge ? "New Device Verification" : "Your Sign-In Code";
  const subtitle = isChallenge
    ? `Hi ${name}, a new browser or device is trying to access the admin portal. Enter this code to verify and trust it.`
    : `Hi ${name}, use the code below to sign in`;
  const note = isChallenge
    ? "If you didn't just sign in from a new device, your account may be compromised — change your password immediately."
    : "If you didn't request this, you can safely ignore this email.";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#0f1e1a;padding:28px 32px;text-align:center;">
            <img src="${LOGO_URL}" alt="${COMPANY_NAME}" width="160" style="display:block;margin:0 auto 16px;max-width:160px;" />
            <div style="display:inline-block;background:rgba(255,255,255,0.12);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:5px 16px;border-radius:999px;margin-bottom:12px;">Admin Portal${isChallenge ? " — Security Alert" : ""}</div>
            <h1 style="margin:0;font-size:20px;font-weight:800;color:#ffffff;line-height:1.3;">${subject}</h1>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.55);">${subtitle}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px;text-align:center;">
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">Enter this one-time code in the admin portal to complete verification:</p>
            <div style="display:inline-block;background:#f0faf7;border:2px solid #1a5c4f;border-radius:16px;padding:20px 40px;margin-bottom:24px;">
              <span style="font-size:42px;font-weight:900;letter-spacing:0.18em;color:#1a5c4f;font-family:monospace;">${otp}</span>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">This code expires in <strong style="color:#374151;">${expiresMinutes} minutes</strong>.</p>
            <p style="margin:0;font-size:12px;color:#d1d5db;">${note}</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">${COMPANY_NAME} Admin Portal &mdash; Secured Access</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json() as { email: string; challenge?: boolean };
    const { email, challenge = false } = body;
    if (!email) return json({ ok: false, error: "Email is required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if this email belongs to an active admin/team member
    const { data: profile, error: profileErr } = await adminClient
      .from("doctor_profiles")
      .select("id, full_name, is_admin, is_active, role")
      .ilike("email", email.trim())
      .maybeSingle();

    console.log("[send-admin-otp] Profile lookup:", { email: email.trim(), found: !!profile, profileErr });

    if (!profile || !profile.is_admin || !profile.is_active) {
      // Return generic message to prevent email enumeration
      return json({ ok: true, message: "If this email is registered, a code has been sent." });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const expiresMinutes = 10;

    const otpKey = `otp_${profile.id}`;

    // Upsert OTP record — use correct column name "enabled" (not "is_enabled")
    const { error: upsertErr } = await adminClient
      .from("admin_notification_prefs")
      .upsert({
        user_id: profile.id,
        notification_key: otpKey,
        email_override: otp,
        per_notif_emails: [expiresAt],
        enabled: true,
      }, { onConflict: "user_id,notification_key" });

    if (upsertErr) {
      console.error("[send-admin-otp] OTP upsert failed:", upsertErr);
      return json({ ok: false, error: "Failed to store OTP. Please try again." }, 500);
    }

    console.log("[send-admin-otp] OTP stored successfully for profile.id:", profile.id, "key:", otpKey);

    if (!resendKey) {
      console.warn("[send-admin-otp] RESEND_API_KEY not set");
      return json({ ok: false, error: "Email service not configured" }, 500);
    }

    const firstName = (profile.full_name ?? "Admin").split(" ")[0];
    const html = buildOTPEmail(firstName, otp, expiresMinutes, challenge);

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [email.trim()],
        subject: challenge
          ? `${otp} — New Device Verification — ${COMPANY_NAME} Admin`
          : `${otp} — Your ${COMPANY_NAME} Admin Sign-In Code`,
        html,
        reply_to: SUPPORT_EMAIL,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("[send-admin-otp] Resend error:", errText);
      return json({ ok: false, error: "Failed to send OTP email" }, 500);
    }

    console.log("[send-admin-otp] OTP email sent successfully to:", email.trim());
    return json({ ok: true, message: "OTP sent successfully", expires_minutes: expiresMinutes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-admin-otp] Unexpected error:", msg);
    return json({ ok: false, error: `Server error: ${msg}` }, 500);
  }
});
