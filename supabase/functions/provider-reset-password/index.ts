import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const body = await req.json() as { email?: string };
    const email = (body.email ?? "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ ok: false, error: "Please enter a valid email address." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if this email belongs to a provider (not admin, not customer)
    // We look up by email in auth users first
    const { data: { users }, error: listErr } = await adminClient.auth.admin.listUsers();
    if (listErr) {
      console.error("listUsers error:", listErr.message);
      // Don't reveal error — just proceed silently to avoid email enumeration
    }

    const authUser = users?.find((u) => u.email?.toLowerCase() === email);

    if (!authUser) {
      // Return success anyway to prevent email enumeration
      return new Response(JSON.stringify({
        ok: true,
        message: "If an account exists with that email, a reset link has been sent.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check it's a provider profile
    const { data: profile } = await adminClient
      .from("doctor_profiles")
      .select("full_name, is_admin")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (!profile) {
      // Not a provider — return generic success (don't reveal)
      return new Response(JSON.stringify({
        ok: true,
        message: "If an account exists with that email, a reset link has been sent.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const providerName = profile.full_name ? profile.full_name.split(" ")[0] : "Provider";

    // Generate recovery link using service role
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: "https://pawtenant.com/reset-password",
      },
    });

    if (linkErr || !linkData) {
      console.error("generateLink error:", linkErr?.message);
      return new Response(JSON.stringify({ ok: false, error: "Failed to generate reset link. Please try again or contact support." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actionLink = (linkData as { properties?: { action_link?: string } })?.properties?.action_link ?? null;

    if (!actionLink) {
      return new Response(JSON.stringify({ ok: false, error: "Reset link could not be generated. Please contact support." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send via Resend
    if (!resendApiKey) {
      return new Response(JSON.stringify({ ok: false, error: "Email service not configured. Please contact support." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const htmlBody = `<!DOCTYPE html>
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
          <tr>
            <td style="background:#1a5c4f;padding:28px 32px;text-align:center;">
              <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png" alt="PawTenant" height="36" style="height:36px;display:block;margin:0 auto;" />
              <p style="color:#a7d4c8;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:10px 0 0 0;">Provider Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              <h2 style="color:#111827;font-size:22px;font-weight:800;margin:0 0 8px 0;">Reset your password</h2>
              <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px 0;">
                Hi ${providerName}, we received a request to reset your PawTenant provider account password. Click the button below to choose a new password.
              </p>
              <div style="text-align:center;margin:28px 0;">
                <a href="${actionLink}" style="display:inline-block;background:#1a5c4f;color:#ffffff;font-size:14px;font-weight:800;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.3px;">
                  Reset My Password
                </a>
              </div>
              <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:24px 0 0 0;padding-top:20px;border-top:1px solid #f3f4f6;">
                This link expires in <strong>1 hour</strong> and can only be used once. If you did not request a password reset, you can safely ignore this email — your password will not change.<br/><br/>
                If the button does not work, copy and paste this link into your browser:<br/>
                <a href="${actionLink}" style="color:#1a5c4f;word-break:break-all;">${actionLink}</a>
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
      </td>
    </tr>
  </table>
</body>
</html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "PawTenant <hello@pawtenant.com>",
        to: [email],
        subject: "Reset your PawTenant provider password",
        html: htmlBody,
      }),
    });

    if (!resendRes.ok) {
      const resendErr = await resendRes.text();
      console.error("Resend send failed:", resendErr);
      return new Response(JSON.stringify({ ok: false, error: "Failed to send email. Please try again or contact support@pawtenant.com." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Provider password reset email sent to ${email}`);

    return new Response(JSON.stringify({
      ok: true,
      message: `Reset link sent to ${email}. Please check your inbox (and spam folder).`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ ok: false, error: `Server error: ${String(err)}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
