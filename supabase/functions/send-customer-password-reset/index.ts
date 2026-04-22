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
    const callerToken = authHeader.replace("Bearer ", "").trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!callerToken) {
      return new Response(JSON.stringify({ ok: false, error: "No auth token provided" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller token
    const { data: { user: callerUser }, error: callerErr } = await adminClient.auth.getUser(callerToken);
    if (callerErr || !callerUser) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized: Invalid token — please refresh and try again" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin status — same logic as check-admin-status function
    const { data: callerProfile } = await adminClient
      .from("doctor_profiles")
      .select("role, is_admin, is_active")
      .eq("user_id", callerUser.id)
      .maybeSingle();

    // Accept: is_admin=true (any active admin), OR owner/admin_manager/support roles
    // Also accept if profile is null but user exists — could be owner account without profile
    const isAdmin = callerProfile
      ? (callerProfile.is_admin === true || ["owner", "admin_manager", "support"].includes(callerProfile.role ?? ""))
      : false;

    // Fallback: check if user email matches known admin patterns (owner accounts)
    // This handles edge cases where the admin profile record is missing
    const isOwnerEmail = callerUser.email?.endsWith("@pawtenant.com") ?? false;

    if (!isAdmin && !isOwnerEmail) {
      return new Response(JSON.stringify({ ok: false, error: "Insufficient permissions." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as { email?: string; first_name?: string; action?: string };
    const targetEmail = (body.email ?? "").trim().toLowerCase();
    const firstName = (body.first_name ?? "").trim() || "there";
    // action: "reset" (default) | "welcome" (resend original welcome/portal access email)
    const action = (body.action ?? "reset") as "reset" | "welcome";

    if (!targetEmail) {
      return new Response(JSON.stringify({ ok: false, error: "Email address is required." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if this customer has a Supabase Auth account
    const { data: existingUsers } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existingUser = existingUsers?.users?.find((u) => u.email?.toLowerCase() === targetEmail);

    let actionLink: string | null = null;
    let accountCreated = false;

    if (!existingUser) {
      // No account exists — create one with a temporary password and send a set-password link
      const tempPassword = crypto.randomUUID();
      const { data: newUserData, error: createErr } = await adminClient.auth.admin.createUser({
        email: targetEmail,
        password: tempPassword,
        email_confirm: true,
      });

      if (createErr || !newUserData?.user) {
        return new Response(JSON.stringify({ ok: false, error: `Could not create account: ${createErr?.message ?? "Unknown error"}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Link existing orders to the new account
      await adminClient.from("orders").update({ user_id: newUserData.user.id }).eq("email", targetEmail).is("user_id", null);
      accountCreated = true;

      // Generate a recovery link so they can set their own password
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail,
        options: { redirectTo: "https://pawtenant.com/reset-password" },
      });

      if (linkErr || !linkData) {
        return new Response(JSON.stringify({ ok: false, error: `Account created but failed to generate reset link: ${linkErr?.message}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      actionLink = (linkData as { properties?: { action_link?: string } })?.properties?.action_link ?? null;
    } else {
      // Account exists — generate a password reset link
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail,
        options: { redirectTo: "https://pawtenant.com/reset-password" },
      });

      if (linkErr || !linkData) {
        const isNotFound = linkErr?.message?.toLowerCase().includes("not found") || linkErr?.message?.toLowerCase().includes("no user");
        const errMsg = isNotFound
          ? `No Supabase Auth account found for "${targetEmail}".`
          : `Failed to generate reset link: ${linkErr?.message}`;
        return new Response(JSON.stringify({ ok: false, error: errMsg }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      actionLink = (linkData as { properties?: { action_link?: string } })?.properties?.action_link ?? null;
    }

    if (!actionLink) {
      return new Response(JSON.stringify({ ok: false, error: "Reset link was not generated. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine email content based on action + account state
    const isWelcomeEmail = action === "welcome" || accountCreated;

    // Send branded customer email via Resend
    let emailSent = false;
    if (resendApiKey) {
      const subject = isWelcomeEmail
        ? "Access your PawTenant Customer Portal"
        : "Reset your PawTenant portal password";

      const bodyIntro = isWelcomeEmail
        ? `Hi ${firstName},<br><br>Your PawTenant customer portal is ready! Click the button below to set your password and access your orders, ESA letters, and documents — all in one place.`
        : `Hi ${firstName},<br><br>A password reset was requested for your PawTenant customer portal account. Click the button below to set a new password and regain access to your orders and ESA letters.`;

      const buttonLabel = isWelcomeEmail ? "Access My Portal" : "Reset My Password";
      const headingText = isWelcomeEmail ? "Welcome to your portal!" : "Reset your password";

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
            <h2 style="color:#111827;font-size:22px;font-weight:800;margin:0 0 8px 0;">${headingText}</h2>
            <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 28px 0;">${bodyIntro}</p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${actionLink}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;padding:15px 40px;border-radius:10px;letter-spacing:0.3px;">
                ${buttonLabel}
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
              <a href="${actionLink}" style="color:#1a5c4f;word-break:break-all;font-size:11px;">${actionLink}</a>
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
          headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "PawTenant <hello@pawtenant.com>",
            to: [targetEmail],
            subject,
            html: htmlBody,
          }),
        });
        if (resendRes.ok) {
          emailSent = true;
        } else {
          const resendErr = await resendRes.text();
          console.error("Resend send failed:", resendErr);
        }
      } catch (resendEx) {
        console.error("Resend exception:", resendEx);
      }
    }

    const actionLabel = isWelcomeEmail ? "Portal welcome" : "Password reset";
    return new Response(JSON.stringify({
      ok: true,
      message: emailSent
        ? `${actionLabel} email sent to ${targetEmail}.`
        : `Link generated for ${targetEmail} but email delivery failed. Copy the fallback link.`,
      action_link: actionLink,
      account_created: accountCreated,
      email_sent: emailSent,
      is_welcome: isWelcomeEmail,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: `Server error: ${String(err)}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
