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
 * Self-heal (PORTAL-RESET-SELF-HEAL, 2026-07-02):
 *   Some older PAID customers (orders placed before auto-portal-access
 *   shipped on 2026-06-13) never got an auth.users account, so "forgot
 *   password" returned the generic success message but sent nothing — a
 *   silent trap. Now, when there is no auth account BUT a paid order exists
 *   for that email, we delegate to `send-customer-password-reset` (the exact
 *   same helper the stripe-webhook and admin "Send Portal Access" button use)
 *   which safely creates the account, back-links the customer's orders, and
 *   emails an "Access your PawTenant Customer Portal" set-password link.
 *
 * Security notes:
 *   - Always returns the SAME generic ok:true regardless of which branch ran
 *     (existing user / self-heal created / silent), so this endpoint cannot be
 *     used to enumerate customers or learn whether an account exists.
 *   - Accounts are ONLY created for emails that have a real PAID order — never
 *     for unpaid leads or random emails.
 *   - Auth-user lookup uses the service-role-only admin_find_auth_user_by_email
 *     RPC (indexed, no 1000-user cap; not callable from the browser).
 *   - Duplicate accounts are impossible: Supabase enforces email uniqueness on
 *     createUser, and the delegate re-checks existence before creating.
 *   - Soft rate limit per email (60s) using auth.users.recovery_sent_at so
 *     repeated clicks do not blast Resend with duplicate sends.
 *   - No recovery links, tokens, or passwords are ever logged.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Where the recovery (set-password) link lands the customer for the
// existing-user path. Per-environment override via PORTAL_RESET_REDIRECT
// (TEST sets it to the test domain); production falls back to www.pawtenant.com.
const RESET_REDIRECT =
  Deno.env.get("PORTAL_RESET_REDIRECT") ?? "https://www.pawtenant.com/reset-password";
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

/** Mask an email for logs: aslynnlh@gmail.com -> a******@gmail.com */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

interface AuthUserRow {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  deleted_at: string | null;
  recovery_sent_at: string | null;
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

    const masked = maskEmail(targetEmail);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Best-effort internal audit row. Never fatal, never contains tokens/links.
    const audit = async (
      action: string,
      description: string,
      metadata: Record<string, unknown> = {},
    ) => {
      console.info(`[request-customer-password-reset] ${action} email=${masked}`, JSON.stringify(metadata));
      try {
        await adminClient.from("audit_logs").insert({
          actor_name: "system:request-customer-password-reset",
          actor_role: "system",
          object_type: "customer_portal",
          object_id: targetEmail,
          action,
          description,
          metadata: { email_masked: masked, ...metadata },
        });
      } catch {
        // audit is best-effort — never block or leak on failure
      }
    };

    // ── Look up the auth user (service-role-only RPC; indexed, no 1000 cap) ──
    const { data: found, error: lookupErr } = await adminClient.rpc(
      "admin_find_auth_user_by_email",
      { p_email: targetEmail },
    );
    if (lookupErr) {
      console.error("[request-customer-password-reset] lookup RPC failed:", lookupErr.message);
      // Fail closed but silent — never reveal anything to the caller.
      return okResponse();
    }
    const existingUser: AuthUserRow | null =
      Array.isArray(found) && found.length > 0 ? (found[0] as AuthUserRow) : null;

    // ══════════════════════════════════════════════════════════════════════
    // Branch 1 — account exists
    // ══════════════════════════════════════════════════════════════════════
    if (existingUser) {
      const now = Date.now();
      const isBanned = existingUser.banned_until
        ? new Date(existingUser.banned_until).getTime() > now
        : false;
      const isDeleted = existingUser.deleted_at != null;

      if (isBanned || isDeleted) {
        // Do not send access to a banned/deleted account. Stay silent so the
        // caller cannot distinguish this from a normal success.
        await audit(
          "reset_requested_banned_or_deleted_silent",
          "Reset requested for a banned or deleted account — no email sent.",
          { banned: isBanned, deleted: isDeleted },
        );
        return okResponse();
      }

      // Soft per-email rate limit to protect Resend / avoid send floods.
      const lastSent = existingUser.recovery_sent_at
        ? new Date(existingUser.recovery_sent_at).getTime()
        : 0;
      if (lastSent && now - lastSent < MIN_RESEND_INTERVAL_MS) {
        await audit(
          "reset_requested_existing_user",
          "Reset requested for existing user within rate-limit window — send skipped.",
          { rate_limited: true },
        );
        return okResponse();
      }

      // Personalize from any existing order.
      let firstName = "there";
      try {
        const { data: orderRow } = await adminClient
          .from("orders")
          .select("first_name")
          .ilike("email", targetEmail)
          .not("first_name", "is", null)
          .limit(1)
          .maybeSingle();
        if (orderRow?.first_name) firstName = String(orderRow.first_name).trim() || "there";
      } catch { /* non-fatal */ }

      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail,
        options: { redirectTo: RESET_REDIRECT },
      });
      if (linkErr || !linkData) {
        console.error("[request-customer-password-reset] generateLink failed:", linkErr?.message);
        await audit("reset_requested_email_send_failed", "generateLink failed for existing user.", { stage: "generate_link" });
        return okResponse();
      }
      const actionLink = (linkData as { properties?: { action_link?: string } })?.properties?.action_link ?? null;
      if (!actionLink) {
        await audit("reset_requested_email_send_failed", "No action_link returned for existing user.", { stage: "generate_link" });
        return okResponse();
      }
      if (!resendApiKey) {
        console.error("[request-customer-password-reset] RESEND_API_KEY missing — cannot deliver reset email");
        await audit("reset_requested_email_send_failed", "RESEND_API_KEY missing.", { stage: "resend_config" });
        return okResponse();
      }

      const subject = "Reset your PawTenant portal password";
      const htmlBody = buildResetEmailHtml(subject, firstName, actionLink);

      let sent = false;
      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "PawTenant <hello@pawtenant.com>", to: [targetEmail], subject, html: htmlBody }),
        });
        sent = resendRes.ok;
        if (!resendRes.ok) console.error("[request-customer-password-reset] Resend failed:", await resendRes.text());
      } catch (resendEx) {
        console.error("[request-customer-password-reset] Resend exception:", resendEx);
      }

      await audit(
        sent ? "reset_requested_existing_user" : "reset_requested_email_send_failed",
        sent ? "Reset link emailed to existing user." : "Reset link generated for existing user but Resend delivery failed.",
        { email_sent: sent },
      );
      return okResponse();
    }

    // ══════════════════════════════════════════════════════════════════════
    // Branch 2 — no account. Self-heal ONLY if a real PAID order exists.
    // ══════════════════════════════════════════════════════════════════════
    let paidOrder: { id: string; first_name: string | null } | null = null;
    try {
      const { data: orderRow } = await adminClient
        .from("orders")
        .select("id, first_name")
        .ilike("email", targetEmail)
        .not("paid_at", "is", null)
        .order("paid_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      paidOrder = (orderRow as { id: string; first_name: string | null } | null) ?? null;
    } catch { /* non-fatal — treated as no paid order */ }

    if (!paidOrder) {
      // No account and no paid order — send nothing, but respond identically.
      await audit(
        "reset_requested_no_paid_customer_silent",
        "Reset requested for an email with no auth account and no paid order — no email sent.",
        {},
      );
      return okResponse();
    }

    // Self-heal: delegate to send-customer-password-reset, which creates the
    // auth user (email_confirm=true), back-links unlinked orders, and emails
    // the portal-access set-password link. Same helper used by stripe-webhook
    // and the admin "Send Portal Access" button — no logic duplicated here.
    let delegateOk = false;
    let accountCreated = false;
    let emailSent = false;
    try {
      const delegateRes = await fetch(`${supabaseUrl}/functions/v1/send-customer-password-reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
          "x-internal-secret": serviceRoleKey,
        },
        body: JSON.stringify({
          email: targetEmail,
          first_name: (paidOrder.first_name ?? "").toString(),
          action: "welcome",
        }),
      });
      // NOTE: the delegate returns an action_link — deliberately NOT read/logged.
      const delegateData = await delegateRes.json().catch(() => ({})) as {
        ok?: boolean; account_created?: boolean; email_sent?: boolean; error?: string;
      };
      delegateOk = delegateRes.ok && delegateData.ok === true;
      accountCreated = delegateData.account_created === true;
      emailSent = delegateData.email_sent === true;
      if (!delegateOk) {
        console.error("[request-customer-password-reset] self-heal delegate failed:", delegateData.error ?? `http ${delegateRes.status}`);
      }
    } catch (delegateEx) {
      console.error("[request-customer-password-reset] self-heal delegate exception:", delegateEx);
    }

    if (delegateOk && emailSent) {
      await audit(
        "reset_requested_self_heal_created_user",
        "Paid customer had no portal account — account created/linked and portal access link emailed.",
        { order_id: paidOrder.id, account_created: accountCreated, email_sent: emailSent },
      );
    } else {
      await audit(
        "reset_requested_email_send_failed",
        "Self-heal path ran for a paid customer but account creation or email delivery failed.",
        { order_id: paidOrder.id, delegate_ok: delegateOk, account_created: accountCreated, email_sent: emailSent },
      );
    }
    return okResponse();
  } catch (err) {
    console.error("[request-customer-password-reset] Server error:", err);
    // Still return a generic success — the customer should see a consistent response.
    return okResponse();
  }
});

/** Branded reset email (existing-user path). Kept identical to the prior copy. */
function buildResetEmailHtml(subject: string, firstName: string, actionLink: string): string {
  return `<!DOCTYPE html>
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
}
