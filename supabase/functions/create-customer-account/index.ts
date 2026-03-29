import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Creates a customer account using admin API with email_confirm:true so NO
 * Supabase confirmation email is ever sent. Instead, a branded welcome email
 * is sent via Resend immediately after account creation.
 *
 * Customers have already proven email ownership by receiving their ESA letter/
 * receipt at that address, so a Supabase confirmation is redundant.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json() as { email?: string; password?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    // ── Basic validation ──────────────────────────────────────────────────
    if (!email || !password) {
      return new Response(
        JSON.stringify({ ok: false, error: "Email and password are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Please enter a valid email address." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ ok: false, error: "Password must be at least 6 characters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Check if user already exists ─────────────────────────────────────
    const { data: existingUsers } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email,
    );

    if (existingUser) {
      return new Response(
        JSON.stringify({ ok: false, error: "already_exists" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Create user — email_confirm: true skips Supabase confirmation email ──
    const { data: userData, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr || !userData?.user) {
      return new Response(
        JSON.stringify({ ok: false, error: createErr?.message ?? "Failed to create account." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const newUserId = userData.user.id;

    // ── Link any existing orders with this email to the new account ───────
    const { count: linkedOrders } = await adminClient
      .from("orders")
      .update({ user_id: newUserId })
      .eq("email", email)
      .is("user_id", null)
      .select("id", { count: "exact", head: true });

    console.log(
      `[create-customer-account] Created user ${newUserId} for ${email}. Linked ${linkedOrders ?? 0} existing order(s).`,
    );

    // ── Send branded welcome email via Resend (fire-and-forget) ──────────
    if (resendApiKey) {
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "PawTenant <hello@pawtenant.com>",
          to: [email],
          subject: "Your PawTenant account is ready \u2013 track your order anytime",
          html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #f0f0f0;">
        <!-- Header -->
        <tr>
          <td style="background:#1a5c4f;padding:28px 32px;">
            <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png" alt="PawTenant" height="36" style="display:block;">
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <div style="width:52px;height:52px;background:#e8f5f1;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:20px;">
              <span style="font-size:24px;">&#x2705;</span>
            </div>
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#111827;">Your account is ready!</h1>
            <p style="margin:0 0 20px;font-size:15px;color:#6b7280;line-height:1.6;">
              Hi there,<br><br>
              Your PawTenant account has been created and linked to your order. You can now track your order status, re-download your ESA or PSD letter, and manage your account at any time &mdash; no need to contact support.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#1a5c4f;border-radius:10px;padding:0;">
                  <a href="https://pawtenant.com/my-orders" style="display:block;padding:14px 28px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;">
                    View My Orders &rarr;
                  </a>
                </td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0" width="100%" style="background:#f8f9fa;border-radius:12px;margin-bottom:24px;">
              <tr>
                <td style="padding:20px;">
                  <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">What you can do in My Orders</p>
                  <table cellpadding="0" cellspacing="0">
                    <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">&#x1F4CB;&nbsp; Track your order status in real time</td></tr>
                    <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">&#x2B07;&#xFE0F;&nbsp; Download or re-download your letter anytime</td></tr>
                    <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">&#x1F512;&nbsp; Securely access past orders</td></tr>
                    <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">&#x1F4DE;&nbsp; Message support directly from your account</td></tr>
                  </table>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
              Need help? Reply to this email or call us at <strong style="color:#374151;">(409) 965-5885</strong>.<br>
              <a href="https://pawtenant.com" style="color:#1a5c4f;text-decoration:none;">pawtenant.com</a>
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #f0f0f0;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              &copy; 2025 PawTenant &bull; <a href="https://pawtenant.com/privacy-policy" style="color:#9ca3af;">Privacy Policy</a> &bull; <a href="https://pawtenant.com/terms-of-use" style="color:#9ca3af;">Terms of Use</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
        }),
      }).catch((err) => {
        // Fire-and-forget — log but never block account creation on email failure
        console.warn("[create-customer-account] Resend welcome email failed:", err);
      });
    } else {
      console.warn("[create-customer-account] RESEND_API_KEY not set — welcome email skipped.");
    }

    return new Response(
      JSON.stringify({
        ok: true,
        userId: newUserId,
        linkedOrders: linkedOrders ?? 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
