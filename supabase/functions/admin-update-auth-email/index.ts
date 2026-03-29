import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COMPANY_NAME = "PawTenant";
const COMPANY_DOMAIN = "pawtenant.com";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;

function buildEmailChangedHtml(opts: {
  providerName: string;
  oldEmail: string;
  newEmail: string;
  isAdmin: boolean;
}): string {
  const portalPath = opts.isAdmin ? "/admin-orders" : "/provider-portal";
  const portalLabel = opts.isAdmin ? "Admin Dashboard" : "Provider Portal";
  const firstName = opts.providerName.split(" ")[0];

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#1a5c4f;padding:32px;text-align:center;">
            <img src="${LOGO_URL}" alt="${COMPANY_NAME}" width="180" style="display:block;margin:0 auto 18px;max-width:180px;" />
            <div style="display:inline-block;background:rgba(255,255,255,0.15);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:5px 16px;border-radius:999px;margin-bottom:14px;">Account Update</div>
            <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;line-height:1.3;">Your login email has been updated</h1>
            <p style="margin:10px 0 0;font-size:14px;color:#a7d5ca;line-height:1.5;">Your ${COMPANY_NAME} account credentials have been changed by an admin.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${firstName}</strong>,</p>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
              An administrator has updated your login email address for your <strong>${COMPANY_NAME} ${portalLabel}</strong> account.
              From now on, use your new email address to sign in.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin:0 0 24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">What Changed</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:7px 0;font-size:13px;color:#6b7280;width:120px;vertical-align:top;">Previous email</td>
                      <td style="padding:7px 0;font-size:13px;color:#6b7280;text-decoration:line-through;">${opts.oldEmail}</td>
                    </tr>
                    <tr>
                      <td style="padding:7px 0;font-size:13px;color:#6b7280;vertical-align:top;">New login email</td>
                      <td style="padding:7px 0;font-size:13px;font-weight:800;color:#1a5c4f;">${opts.newEmail}</td>
                    </tr>
                    <tr>
                      <td style="padding:7px 0;font-size:13px;color:#6b7280;vertical-align:top;">Sign in at</td>
                      <td style="padding:7px 0;font-size:13px;"><a href="https://${COMPANY_DOMAIN}${portalPath}" style="color:#1a5c4f;font-weight:700;text-decoration:none;">${COMPANY_DOMAIN}${portalPath}</a></td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin:0 0 24px;">
              <tr>
                <td style="padding:16px 20px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="vertical-align:top;padding-right:10px;font-size:16px;">&#9888;</td>
                      <td style="font-size:13px;color:#92400e;line-height:1.6;">
                        <strong>Important:</strong> Your password has NOT changed. Use the same password you set previously with your new email address. If you need to reset your password,
                        <a href="https://${COMPANY_DOMAIN}/reset-password" style="color:#92400e;font-weight:700;">click here</a>.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td style="background:#1a5c4f;border-radius:10px;">
                  <a href="https://${COMPANY_DOMAIN}${portalPath}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;letter-spacing:-0.1px;">Go to My ${portalLabel} &rarr;</a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">If you did not expect this change or believe this was made in error, please contact us immediately at <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a5c4f;text-decoration:none;">${SUPPORT_EMAIL}</a>.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:18px 32px;text-align:center;">
            <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a5c4f;text-decoration:none;">${SUPPORT_EMAIL}</a></p>
            <p style="margin:0;font-size:11px;color:#d1d5db;">${COMPANY_NAME} &mdash; ${COMPANY_DOMAIN}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

async function sendEmailChangeNotification(opts: {
  providerName: string;
  oldEmail: string;
  newEmail: string;
  isAdmin: boolean;
}): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("[admin-update-auth-email] RESEND_API_KEY not set — skipping notification");
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [opts.newEmail],
        subject: `Your ${COMPANY_NAME} login email has been updated`,
        html: buildEmailChangedHtml(opts),
        reply_to: SUPPORT_EMAIL,
        tags: [{ name: "email_type", value: "email_address_changed" }],
      }),
    });

    if (res.ok) {
      console.log(`[admin-update-auth-email] Change notification sent to ${opts.newEmail}`);
      return true;
    }

    const errText = await res.text();
    console.error(`[admin-update-auth-email] Resend error (${res.status}): ${errText}`);
    return false;
  } catch (err) {
    console.error("[admin-update-auth-email] Resend fetch error:", err);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is an admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Confirm caller is admin/owner
    const { data: profile } = await supabaseAdmin
      .from("doctor_profiles")
      .select("is_admin, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.is_admin && !["owner", "admin_manager"].includes(profile?.role ?? "")) {
      return new Response(JSON.stringify({ ok: false, error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { current_email, new_email, user_id, provider_name } = await req.json() as {
      current_email: string;
      new_email: string;
      user_id?: string;
      provider_name?: string;
    };

    if (!new_email || !new_email.includes("@")) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedNew = new_email.toLowerCase().trim();

    // Resolve the target user_id — prefer passed user_id, else look up by current_email
    let targetUserId = user_id;
    let actualOldEmail = current_email;

    if (!targetUserId && current_email) {
      const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (listErr) throw new Error(`Could not list users: ${listErr.message}`);
      const match = listData?.users?.find((u) => u.email?.toLowerCase() === current_email.toLowerCase());
      if (!match) {
        return new Response(
          JSON.stringify({ ok: false, error: `No auth account found for ${current_email}. This provider may not have a portal account yet.` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      targetUserId = match.id;
      actualOldEmail = match.email ?? current_email;
    } else if (targetUserId) {
      const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      if (existingUser?.user?.email) {
        actualOldEmail = existingUser.user.email;
      }
    }

    if (!targetUserId) {
      return new Response(JSON.stringify({ ok: false, error: "Could not identify the user to update" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if the new email is the same as the actual auth email
    if (actualOldEmail.toLowerCase() === normalizedNew) {
      return new Response(
        JSON.stringify({ ok: false, error: `Supabase Auth already has ${normalizedNew} as the login email — no change needed.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if the new email is already taken by another account
    const { data: existingList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const alreadyTaken = existingList?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedNew && u.id !== targetUserId
    );
    if (alreadyTaken) {
      return new Response(
        JSON.stringify({ ok: false, error: `${normalizedNew} is already used by another account.` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up provider name from doctor_profiles if not passed
    let resolvedName = provider_name ?? "";
    if (!resolvedName && targetUserId) {
      const { data: dp } = await supabaseAdmin
        .from("doctor_profiles")
        .select("full_name, is_admin")
        .eq("user_id", targetUserId)
        .maybeSingle();
      resolvedName = dp?.full_name ?? "";
    }

    // Look up whether this account is admin so we can set the right portal link in the email
    let targetIsAdmin = false;
    if (targetUserId) {
      const { data: dp } = await supabaseAdmin
        .from("doctor_profiles")
        .select("is_admin")
        .eq("user_id", targetUserId)
        .maybeSingle();
      targetIsAdmin = dp?.is_admin ?? false;
    }

    // Update auth email via Admin API (no confirmation email required)
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
      email: normalizedNew,
      email_confirm: true,
    });

    if (updateError) {
      return new Response(JSON.stringify({ ok: false, error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sync new email everywhere: doctor_profiles, doctor_contacts, AND orders
    const updatePromises: Promise<unknown>[] = [
      supabaseAdmin
        .from("doctor_profiles")
        .update({ email: normalizedNew })
        .eq("user_id", targetUserId),

      supabaseAdmin
        .from("doctor_contacts")
        .update({ email: normalizedNew })
        .ilike("email", actualOldEmail),
    ];

    if (current_email && current_email.toLowerCase() !== actualOldEmail.toLowerCase()) {
      updatePromises.push(
        supabaseAdmin
          .from("doctor_contacts")
          .update({ email: normalizedNew })
          .ilike("email", current_email)
      );
      updatePromises.push(
        supabaseAdmin
          .from("doctor_profiles")
          .update({ email: normalizedNew })
          .ilike("email", current_email)
      );
    }

    updatePromises.push(
      supabaseAdmin
        .from("orders")
        .update({ doctor_email: normalizedNew })
        .ilike("doctor_email", actualOldEmail)
    );

    if (current_email && current_email.toLowerCase() !== actualOldEmail.toLowerCase()) {
      updatePromises.push(
        supabaseAdmin
          .from("orders")
          .update({ doctor_email: normalizedNew })
          .ilike("doctor_email", current_email)
      );
    }

    await Promise.all(updatePromises);

    // ── Send email change notification to the NEW email address ─────────────
    const notificationSent = await sendEmailChangeNotification({
      providerName: resolvedName || normalizedNew,
      oldEmail: actualOldEmail,
      newEmail: normalizedNew,
      isAdmin: targetIsAdmin,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Auth email updated from ${actualOldEmail} → ${normalizedNew}. All existing orders and records have been synced. The provider can log in with their new email immediately.`,
        old_auth_email: actualOldEmail,
        new_email: normalizedNew,
        notification_sent: notificationSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
