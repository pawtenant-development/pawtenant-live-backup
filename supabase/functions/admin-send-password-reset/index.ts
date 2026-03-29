import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerToken = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    // Verify caller identity
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
    });
    const { data: { user: callerUser }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerUser) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is admin or owner
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerProfile } = await adminClient
      .from("doctor_profiles")
      .select("role, is_admin")
      .eq("user_id", callerUser.id)
      .maybeSingle();

    const isAdmin = callerProfile?.is_admin === true ||
      ["owner", "admin_manager", "support"].includes(callerProfile?.role ?? "");

    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "Insufficient permissions" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as { email?: string; user_id?: string };
    let targetEmail = body.email?.trim().toLowerCase() ?? "";
    const userId = body.user_id ?? null;
    let providerName = "Provider";

    // If user_id is provided, look up the ACTUAL auth email from Supabase Auth
    // This handles the case where doctor_profiles.email was updated but Supabase Auth email wasn't synced
    if (userId) {
      const { data: authUser, error: getUserErr } = await adminClient.auth.admin.getUserById(userId);
      if (getUserErr || !authUser?.user) {
        return new Response(
          JSON.stringify({ ok: false, error: `No Supabase Auth account found for this provider (user_id: ${userId}). They may not have a portal account yet. Use the purple "Auth Email" button to set up their login email first.` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const realAuthEmail = authUser.user.email ?? "";
      if (realAuthEmail && realAuthEmail.toLowerCase() !== targetEmail) {
        console.log(`Email mismatch detected: doctor_profiles shows "${targetEmail}", Supabase Auth has "${realAuthEmail}". Using the real auth email.`);
        targetEmail = realAuthEmail;
      }

      // Also fetch provider name for the email
      const { data: providerProfile } = await adminClient
        .from("doctor_profiles")
        .select("full_name")
        .eq("user_id", userId)
        .maybeSingle();
      if (providerProfile?.full_name) {
        providerName = providerProfile.full_name.split(" ")[0]; // first name
      }
    }

    if (!targetEmail) {
      return new Response(JSON.stringify({ ok: false, error: "Email is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate recovery link using service role
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: targetEmail,
      options: {
        redirectTo: "https://pawtenant.com/reset-password",
      },
    });

    if (linkErr) {
      console.error("generateLink error:", linkErr.message);
      const isNotFound = linkErr.message.toLowerCase().includes("not found") || linkErr.message.toLowerCase().includes("user");
      const errMsg = isNotFound
        ? `No Supabase Auth account found for "${targetEmail}". This means the email in the database profile doesn't match what's in Supabase Auth. Use the purple "Auth Email" button to sync the correct email first, then retry.`
        : linkErr.message;
      return new Response(JSON.stringify({ ok: false, error: errMsg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actionLink = (linkData as { properties?: { action_link?: string } })?.properties?.action_link ?? null;

    // Send via Resend for reliable delivery (Supabase's built-in email is unreliable)
    let emailSentViaResend = false;
    if (resendApiKey && actionLink) {
      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password — PawTenant</title>
</head>
<body style="margin:0;padding:0;background:#f8f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7f4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#1a5c4f;padding:28px 32px;text-align:center;">
              <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png" alt="PawTenant" height="36" style="height:36px;display:block;margin:0 auto;" />
              <p style="color:#a7d4c8;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:10px 0 0 0;">Provider Portal</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              <h2 style="color:#111827;font-size:22px;font-weight:800;margin:0 0 8px 0;">Reset your password</h2>
              <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px 0;">
                Hi ${providerName}, your admin has requested a password reset for your PawTenant provider account. Click the button below to choose a new password.
              </p>
              <div style="text-align:center;margin:28px 0;">
                <a href="${actionLink}" style="display:inline-block;background:#1a5c4f;color:#ffffff;font-size:14px;font-weight:800;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.3px;">
                  Set New Password
                </a>
              </div>
              <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:24px 0 0 0;padding-top:20px;border-top:1px solid #f3f4f6;">
                This link expires in <strong>1 hour</strong> and can only be used once. If you didn&apos;t expect this email, you can safely ignore it &mdash; your password won&apos;t change.<br/><br/>
                If the button doesn&apos;t work, copy and paste this link into your browser:<br/>
                <a href="${actionLink}" style="color:#1a5c4f;word-break:break-all;">${actionLink}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:20px 32px;text-align:center;">
              <p style="color:#9ca3af;font-size:11px;margin:0;">
                PawTenant &mdash; ESA Letter Services &mdash; <a href="https://pawtenant.com" style="color:#1a5c4f;text-decoration:none;">pawtenant.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
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
            subject: "Reset your PawTenant provider password",
            html: htmlBody,
          }),
        });
        if (resendRes.ok) {
          emailSentViaResend = true;
          console.log(`Password reset email sent via Resend to ${targetEmail}`);
        } else {
          const resendErr = await resendRes.text();
          console.error("Resend send failed:", resendErr);
        }
      } catch (resendEx) {
        console.error("Resend exception:", resendEx);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: emailSentViaResend
          ? `Reset email sent to ${targetEmail} via Resend. It should arrive within a minute.`
          : `Reset link generated for ${targetEmail}. Resend was unavailable — use the fallback link below to send manually.`,
        action_link: actionLink,
        used_email: targetEmail,
        email_sent: emailSentViaResend,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
