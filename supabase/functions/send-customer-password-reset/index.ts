import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reserveEmailSend, finalizeEmailSend } from "../_shared/logEmailComm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

// Where the recovery (set-password) link lands the customer. Per-repo default
// is the environment differentiator: LIVE → pawtenant.com, TEST → test domain.
// Can be overridden by the PORTAL_RESET_REDIRECT env var if ever needed.
const RESET_REDIRECT =
  Deno.env.get("PORTAL_RESET_REDIRECT") ?? "https://pawtenant.com/reset-password";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerToken = authHeader.replace("Bearer ", "").trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Internal service-to-service call (e.g. stripe-webhook sending portal
    // access automatically after a paid order). Authenticated by the
    // service-role key passed in a private header — this header is only ever
    // set server-side and is never exposed to the browser. When present and
    // valid, we skip the admin-user check below. The admin UI path is
    // unchanged: no header → full token + admin verification still required.
    const internalSecret = req.headers.get("x-internal-secret") ?? "";
    const isInternalCall = internalSecret.length > 0 && internalSecret === serviceRoleKey;

    // callerUser is only resolved on the admin path; null for internal calls.
    let callerUser: { id: string; email?: string } | null = null;

    if (!isInternalCall) {
      if (!callerToken) {
        return new Response(JSON.stringify({ ok: false, error: "No auth token provided" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify caller token
      const { data: { user: verifiedUser }, error: callerErr } = await adminClient.auth.getUser(callerToken);
      if (callerErr || !verifiedUser) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized: Invalid token — please refresh and try again" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerUser = verifiedUser;

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
    }

    const body = await req.json() as { email?: string; first_name?: string; action?: string; order_id?: string; confirmation_id?: string };
    const targetEmail = (body.email ?? "").trim().toLowerCase();
    const firstName = (body.first_name ?? "").trim() || "there";
    // action: "reset" (default) | "welcome" (resend original welcome/portal access email)
    const action = (body.action ?? "reset") as "reset" | "welcome";

    if (!targetEmail) {
      return new Response(JSON.stringify({ ok: false, error: "Email address is required." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Comms-timeline anchor: prefer the order the caller passed; fall back to
    // the customer's most recent order so sends from the Customers tab (which
    // has no order context) still land in a Comms timeline.
    let commOrderId = (body.order_id ?? "").trim() || null;
    let commConfirmationId = (body.confirmation_id ?? "").trim() || null;
    if (!commOrderId && !commConfirmationId) {
      const { data: latestOrder } = await adminClient
        .from("orders")
        .select("id, confirmation_id")
        .ilike("email", targetEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      commOrderId = (latestOrder as { id?: string } | null)?.id ?? null;
      commConfirmationId = (latestOrder as { confirmation_id?: string } | null)?.confirmation_id ?? null;
    }

    // Check if this customer has a Supabase Auth account.
    // Uses the service-role-only admin_find_auth_user_by_email RPC (indexed,
    // no 1000-user cap) instead of scanning listUsers({ perPage: 1000 }), which
    // silently missed users past the first 1000. Same lookup the customer-facing
    // request-customer-password-reset uses. Returns 0 or 1 row; only existence
    // is used below, so downstream create/reset behavior is unchanged.
    const { data: foundUsers, error: lookupErr } = await adminClient.rpc(
      "admin_find_auth_user_by_email",
      { p_email: targetEmail },
    );
    if (lookupErr) {
      return new Response(JSON.stringify({ ok: false, error: `Auth lookup failed: ${lookupErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const existingUser = Array.isArray(foundUsers) && foundUsers.length > 0 ? foundUsers[0] : null;

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
        options: { redirectTo: RESET_REDIRECT },
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
        options: { redirectTo: RESET_REDIRECT },
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
    let commRowId: string | null = null;
    let resendId: string | null = null;
    let resendFailReason: string | null = null;
    const commSlug = isWelcomeEmail ? "portal_welcome" : "portal_reset";
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

      // Log into the unified Comms timeline (communications table) so admins
      // can see this send inside the order modal. The dedupe key is unique per
      // invocation on purpose: portal reset/access emails are legitimately
      // re-sendable, so the key must never block a send — it only guarantees
      // exactly one comms row per actual send. NEVER store the action link.
      //
      // For INTERNAL (stripe-webhook) calls we deliberately skip this logging:
      // the webhook reserves/owns the single deduped portal_welcome row itself,
      // so logging here too would create a duplicate Comms row per order.
      const commAnchor = commConfirmationId ?? commOrderId;
      if (!isInternalCall) {
        const reserve = await reserveEmailSend({
          supabase: adminClient,
          orderId: commOrderId,
          confirmationId: commConfirmationId,
          to: targetEmail,
          from: "PawTenant <hello@pawtenant.com>",
          subject,
          slug: commSlug,
          dedupeKey: commAnchor ? `${commAnchor}:${commSlug}:${crypto.randomUUID()}` : null,
          templateSource: "hardcoded",
          sentBy: callerUser?.email ? `admin:${callerUser.email}` : "admin",
        });
        commRowId = reserve.rowId ?? null;
      }

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
          try {
            resendId = ((await resendRes.json()) as { id?: string })?.id ?? null;
          } catch { /* response body is informational only */ }
        } else {
          const resendErr = await resendRes.text();
          resendFailReason = resendErr;
          console.error("Resend send failed:", resendErr);
        }
      } catch (resendEx) {
        resendFailReason = String(resendEx);
        console.error("Resend exception:", resendEx);
      }

      // Safe metadata only — short snippet, recipient, status, Resend id.
      // The raw reset/access link is intentionally never stored.
      // Skipped for internal calls (the webhook owns/finalizes the row).
      if (!isInternalCall) {
        await finalizeEmailSend(adminClient, commRowId, {
          success: emailSent,
          body: `${isWelcomeEmail ? "Portal access" : "Portal password reset"} email sent to customer.`,
          resendId,
          errorMessage: emailSent ? null : (resendFailReason ?? "Resend send failed"),
        });
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
      comm_logged: commRowId !== null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: `Server error: ${String(err)}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
