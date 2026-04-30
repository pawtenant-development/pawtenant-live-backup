// create-provider — Provider-specific onboarding function.
// NEVER used for team members. Only creates provider accounts.
// Handles both new provider creation AND resend-invite flows.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COMPANY_NAME = "PawTenant";
const COMPANY_DOMAIN = "pawtenant.com";
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;
const PROVIDER_PORTAL_PATH = "/provider-portal";

const HEADER_BG = "#4a9e8a";
const HEADER_BADGE_BG = "rgba(255,255,255,0.22)";
const HEADER_TEXT = "#ffffff";
const HEADER_SUB = "rgba(255,255,255,0.82)";
const ACCENT = "#1a5c4f";
const ORANGE = "#f97316";

// OPS-PROVIDER-WELCOME-EMAIL-COPY: expanded onboarding email. Body content is
// kept identical to supabase/functions/approve-provider-application — the two
// templates should be lifted into a shared module in a future task. Header
// badge here ("Provider Invitation") differs from the approval flow ("Application
// Approved") so the recipient knows whether they are being onboarded vs.
// re-invited from an existing record.
function buildProviderInviteHtml(providerName: string, toEmail: string, setupLink: string): string {
  const firstName = providerName.split(" ")[0];
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">

        <!-- Header -->
        <tr>
          <td style="background:${HEADER_BG};padding:32px;text-align:center;">
            <img src="${LOGO_URL}" alt="${COMPANY_NAME}" width="180" style="display:block;margin:0 auto 18px;max-width:180px;" />
            <div style="display:inline-block;background:${HEADER_BADGE_BG};color:${HEADER_TEXT};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:5px 16px;border-radius:999px;margin-bottom:14px;">Provider Invitation</div>
            <h1 style="margin:0;font-size:22px;font-weight:800;color:${HEADER_TEXT};line-height:1.3;">Welcome to ${COMPANY_NAME}, ${firstName}!</h1>
            <p style="margin:10px 0 0;font-size:14px;color:${HEADER_SUB};line-height:1.5;">Your provider account is ready. Activate your portal to start reviewing cases.</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${providerName}</strong>,</p>
            <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
              You've been added to the <strong>${COMPANY_NAME} Provider Network</strong>. The first step is to activate your provider portal account by setting a password.
            </p>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin:24px auto 8px;">
              <tr>
                <td style="background:${ORANGE};border-radius:10px;">
                  <a href="${setupLink}" style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;">Activate My Provider Account &rarr;</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 24px;font-size:12px;color:#9ca3af;text-align:center;line-height:1.5;">This link expires in <strong>24 hours</strong>. Ask your admin to resend if it expires.</p>

            <!-- Account details -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin:0 0 24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Your Account Details</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:120px;">Name</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#111827;">${providerName}</td></tr>
                    <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Login Email</td><td style="padding:5px 0;font-size:13px;color:#111827;">${toEmail}</td></tr>
                    <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Role</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:${ACCENT};">Licensed Mental Health Professional</td></tr>
                    <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Portal</td><td style="padding:5px 0;font-size:13px;"><a href="https://${COMPANY_DOMAIN}${PROVIDER_PORTAL_PATH}" style="color:${ACCENT};font-weight:700;text-decoration:none;">${COMPANY_DOMAIN}${PROVIDER_PORTAL_PATH}</a></td></tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Inside the portal -->
            <p style="margin:24px 0 10px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Inside Your Provider Portal</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;">
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #f3f4f6;">
                  <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;"><strong style="color:${ACCENT};">Review assigned cases.</strong> See assessment answers, supporting documents, and submit your professional decision.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #f3f4f6;">
                  <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;"><strong style="color:${ACCENT};">View earnings &amp; payouts.</strong> Track completed cases and payout history once payouts are issued.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #f3f4f6;">
                  <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;"><strong style="color:${ACCENT};">Manage your profile.</strong> Update your headshot, bio, contact info, and public-profile preference.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;"><strong style="color:${ACCENT};">Manage licenses &amp; states.</strong> Confirm the states you are currently licensed to practice in. Cases will only be assigned to you in those states.</p>
                </td>
              </tr>
            </table>

            <!-- Profile completion checklist -->
            <p style="margin:28px 0 10px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Complete Your Provider Profile</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbf2;border:1px solid #fde68a;border-radius:12px;">
              <tr>
                <td style="padding:18px 22px;">
                  <p style="margin:0 0 10px;font-size:13px;color:#374151;line-height:1.6;">Once you log in, please review and update:</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr><td style="padding:3px 0;font-size:13px;color:#374151;line-height:1.6;">&#9656; <strong>Headshot</strong> &mdash; a clear, recent professional photo</td></tr>
                    <tr><td style="padding:3px 0;font-size:13px;color:#374151;line-height:1.6;">&#9656; <strong>Bio</strong> &mdash; a short paragraph about your background and approach</td></tr>
                    <tr><td style="padding:3px 0;font-size:13px;color:#374151;line-height:1.6;">&#9656; <strong>License &amp; NPI details</strong> &mdash; license numbers per state and your NPI on file</td></tr>
                    <tr><td style="padding:3px 0;font-size:13px;color:#374151;line-height:1.6;">&#9656; <strong>Public profile preference</strong> &mdash; whether you'd like your profile shown publicly</td></tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Public profile publishing -->
            <p style="margin:24px 0 10px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">About Public Profile Publishing</p>
            <p style="margin:0 0 16px;font-size:13px;color:#374151;line-height:1.7;">
              You can opt to make your profile visible on the ${COMPANY_NAME} website. Published provider profiles can help build trust with prospective customers, may help market your practice, and can lead to more relevant case volume in your licensed states. Final publishing remains subject to admin and profile review &mdash; we'll let you know once your profile is live.
            </p>

            <!-- Payouts -->
            <p style="margin:24px 0 10px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Payouts &amp; Earnings</p>
            <p style="margin:0 0 16px;font-size:13px;color:#374151;line-height:1.7;">
              Your payout details and per-case rate will be visible inside the provider portal once configured, or shared with you separately. We'll notify you when payouts are processed.
            </p>

            <!-- Compliance callout -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:1px solid #fcd34d;border-radius:12px;margin:24px 0 8px;">
              <tr>
                <td style="padding:18px 22px;">
                  <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.08em;">Compliance Reminder</p>
                  <p style="margin:0;font-size:13px;color:#78350f;line-height:1.7;">
                    As a ${COMPANY_NAME} provider, please continue to follow all applicable professional, privacy, ESA / Fair Housing Act, and telehealth rules in the states you serve. Only complete cases you are professionally able and licensed to evaluate. If you are unsure about a case, decline it &mdash; we'd rather you pass than over-extend.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Support -->
            <p style="margin:28px 0 6px;font-size:13px;color:#374151;line-height:1.7;">
              Need help getting started? Reply to this email or contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};font-weight:700;text-decoration:none;">${SUPPORT_EMAIL}</a> &mdash; we're glad to walk you through the portal.
            </p>
            <p style="margin:18px 0 0;font-size:12px;color:#d1d5db;line-height:1.5;">If you did not expect this email, you can safely ignore it.</p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:18px 32px;text-align:center;">
            <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">Questions? Email us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a></p>
            <p style="margin:0;font-size:11px;color:#d1d5db;">${COMPANY_NAME} &mdash; ${COMPANY_DOMAIN}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendProviderInviteEmail(toEmail: string, providerName: string, setupLink: string): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) { console.warn("[create-provider] RESEND_API_KEY not set"); return false; }
  try {
    const subject = `Action Required: Activate Your ${COMPANY_NAME} Provider Account`;
    const html = buildProviderInviteHtml(providerName, toEmail, setupLink);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [toEmail], subject, html, reply_to: SUPPORT_EMAIL }),
    });
    if (res.ok) { console.log(`[create-provider] Invite sent to ${toEmail}`); return true; }
    const t = await res.text();
    console.warn(`[create-provider] Resend failed ${res.status}: ${t}`);
    return false;
  } catch (e) { console.warn("[create-provider] Resend error:", e); return false; }
}

async function getSetupLink(adminClient: ReturnType<typeof createClient>, email: string, redirectTo: string): Promise<string> {
  for (const linkType of ["magiclink", "recovery"] as const) {
    try {
      const { data, error } = await adminClient.auth.admin.generateLink({ type: linkType, email, options: { redirectTo } });
      if (!error && data) {
        const raw = data as unknown as Record<string, unknown>;
        const props = raw["properties"] as Record<string, string> | undefined;
        const link = props?.["action_link"];
        if (link) { console.log(`[create-provider] Setup link via ${linkType}`); return link; }
      }
      console.warn(`[create-provider] ${linkType} failed: ${error?.message}`);
    } catch (e) { console.warn(`[create-provider] ${linkType} threw:`, e); }
  }
  return `https://${COMPANY_DOMAIN}/reset-password`;
}

// Looks up an auth user by email and returns true if their email is already
// confirmed. Used to suppress the "Action Required: Activate Your PawTenant
// Provider Account" email for providers who have already activated. Fail-open
// (returns false) on lookup errors so transient issues don't block real
// invites for unconfirmed providers.
async function isAuthUserAlreadyConfirmed(
  adminClient: ReturnType<typeof createClient>,
  email: string,
): Promise<boolean> {
  try {
    const target = email.trim().toLowerCase();
    let page = 1;
    while (true) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users?.length) return false;
      const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
      if (match) {
        return !!(match as { email_confirmed_at?: string | null }).email_confirmed_at;
      }
      if (data.users.length < 1000) return false;
      page++;
    }
  } catch (e) {
    console.warn("[create-provider] isAuthUserAlreadyConfirmed threw:", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerToken = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!callerToken) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized — no token provided" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user: callerUser }, error: callerErr } = await adminClient.auth.getUser(callerToken);
    if (callerErr || !callerUser) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized — session expired, please refresh and try again" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await adminClient.from("doctor_profiles").select("is_admin, role").eq("user_id", callerUser.id).maybeSingle();
    const isCallerAdmin = callerProfile?.is_admin === true || ["owner", "admin_manager", "support"].includes(callerProfile?.role ?? "");
    if (!isCallerAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "Access denied. Admin only." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as {
      email: string; full_name: string; title?: string | null; phone?: string | null;
      licensed_states?: string[]; bio?: string | null; per_order_rate?: number | null; license_number?: string | null;
    };

    if (!body.email || !body.full_name) {
      return new Response(JSON.stringify({ ok: false, error: "email and full_name are required." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = body.email.trim().toLowerCase();
    const licensedStates = body.licensed_states ?? [];
    const siteUrl = Deno.env.get("SITE_URL") ?? `https://${COMPANY_DOMAIN}`;
    const redirectTo = `${siteUrl}/reset-password`;

    const { data: existingProfile } = await adminClient.from("doctor_profiles").select("id, user_id, full_name, is_admin").ilike("email", normalizedEmail).maybeSingle();

    if (existingProfile) {
      const alreadyActivated = await isAuthUserAlreadyConfirmed(adminClient, normalizedEmail);
      const setupLink = await getSetupLink(adminClient, normalizedEmail, redirectTo);
      let emailSent = false;
      if (alreadyActivated) {
        console.log(`[create-provider] Skipped activation email for ${normalizedEmail} — auth user already confirmed (email_confirmed_at present).`);
      } else {
        emailSent = await sendProviderInviteEmail(normalizedEmail, existingProfile.full_name ?? body.full_name, setupLink);
      }
      return new Response(JSON.stringify({
        ok: true,
        email: normalizedEmail,
        full_name: existingProfile.full_name ?? body.full_name,
        invite_sent: !alreadyActivated,
        welcome_email_sent: emailSent,
        already_activated: alreadyActivated,
        activation_email_skipped: alreadyActivated,
        note: alreadyActivated
          ? "Provider account is already activated; activation email was not resent."
          : "Existing provider — resent invite email.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let authUserId: string | null = null;
    let setupLink = `${siteUrl}/reset-password`;

    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email: normalizedEmail,
      options: { data: { full_name: body.full_name, is_admin: false, role: "provider" }, redirectTo },
    });

    if (!linkErr && linkData?.user) {
      authUserId = linkData.user.id;
      const raw = linkData as unknown as Record<string, unknown>;
      const props = raw["properties"] as Record<string, string> | undefined;
      if (props?.["action_link"]) {
        setupLink = props["action_link"];
      } else {
        setupLink = await getSetupLink(adminClient, normalizedEmail, redirectTo);
      }
    } else {
      const alreadyExists = linkErr?.message?.includes("already been registered") || (linkErr as unknown as { status?: number })?.status === 422;
      const { data: listRes } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const existingAuthUser = listRes?.users?.find((u) => u.email?.toLowerCase() === normalizedEmail);

      if (existingAuthUser) {
        authUserId = existingAuthUser.id;
      } else {
        const { data: createdUser, error: createErr } = await adminClient.auth.admin.createUser({ email: normalizedEmail, email_confirm: true });
        if (createErr || !createdUser?.user) {
          return new Response(JSON.stringify({ ok: false, error: createErr?.message ?? "Failed to create auth account." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        authUserId = createdUser.user.id;
      }

      if (!authUserId) {
        return new Response(JSON.stringify({ ok: false, error: "Could not create or locate auth account for this email." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      setupLink = await getSetupLink(adminClient, normalizedEmail, redirectTo);
    }

    const { error: profileErr } = await adminClient.from("doctor_profiles").insert({
      user_id: authUserId, full_name: body.full_name, email: normalizedEmail,
      title: body.title ?? null, phone: body.phone ?? null, license_number: body.license_number ?? null,
      bio: body.bio ?? null, is_admin: false, role: "provider", is_active: true,
      licensed_states: licensedStates,
      per_order_rate: (body.per_order_rate != null && body.per_order_rate >= 0) ? body.per_order_rate : null,
    });

    if (profileErr) {
      const alreadyActivated = await isAuthUserAlreadyConfirmed(adminClient, normalizedEmail);
      let emailSent = false;
      if (alreadyActivated) {
        console.log(`[create-provider] Skipped activation email for ${normalizedEmail} — auth user already confirmed (email_confirmed_at present).`);
      } else {
        emailSent = await sendProviderInviteEmail(normalizedEmail, body.full_name, setupLink);
      }
      return new Response(JSON.stringify({ ok: false, error: profileErr.message, emailSent, already_activated: alreadyActivated, activation_email_skipped: alreadyActivated }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: ec } = await adminClient.from("doctor_contacts").select("id").eq("email", normalizedEmail).maybeSingle();
    if (ec) {
      await adminClient.from("doctor_contacts").update({ full_name: body.full_name, phone: body.phone ?? null, licensed_states: licensedStates, notes: body.bio ?? null, per_order_rate: body.per_order_rate ?? null, is_active: true }).eq("id", ec.id);
    } else {
      await adminClient.from("doctor_contacts").insert({ full_name: body.full_name, email: normalizedEmail, phone: body.phone ?? null, licensed_states: licensedStates, notes: body.bio ?? null, per_order_rate: body.per_order_rate ?? null, is_active: true });
    }

    const alreadyActivated = await isAuthUserAlreadyConfirmed(adminClient, normalizedEmail);
    let emailSent = false;
    if (alreadyActivated) {
      console.log(`[create-provider] Skipped activation email for ${normalizedEmail} — auth user already confirmed (email_confirmed_at present).`);
    } else {
      emailSent = await sendProviderInviteEmail(normalizedEmail, body.full_name, setupLink);
    }
    return new Response(JSON.stringify({
      ok: true,
      email: normalizedEmail,
      full_name: body.full_name,
      invite_sent: !alreadyActivated,
      welcome_email_sent: emailSent,
      already_activated: alreadyActivated,
      activation_email_skipped: alreadyActivated,
      note: alreadyActivated ? "Provider account is already activated; activation email was not resent." : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: `Server error: ${msg}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
