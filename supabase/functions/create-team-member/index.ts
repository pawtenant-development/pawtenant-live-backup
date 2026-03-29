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

function buildInviteHtml(providerName: string, toEmail: string, setupLink: string, isAdmin: boolean): string {
  const portalLabel = isAdmin ? "Admin Dashboard" : "Provider Portal";
  const portalPath = isAdmin ? "/admin-orders" : "/provider-portal";
  const firstName = providerName.split(" ")[0];
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
            <div style="display:inline-block;background:rgba(255,255,255,0.15);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:5px 16px;border-radius:999px;margin-bottom:14px;">Account Invite</div>
            <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">Welcome to ${COMPANY_NAME}${isAdmin ? "" : ", " + firstName}!</h1>
            <p style="margin:10px 0 0;font-size:14px;color:#a7d5ca;line-height:1.5;">Your ${isAdmin ? "admin" : "provider"} account is ready. Click below to set your password and get started.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${providerName}</strong>,</p>
            <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">An account has been created for you on the <strong>${COMPANY_NAME} ${portalLabel}</strong>. Click the button below to set your password.</p>
            <table cellpadding="0" cellspacing="0" style="margin:28px auto;">
              <tr>
                <td style="background:#ff6a00;border-radius:10px;">
                  <a href="${setupLink}" style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;">Set My Password &amp; Activate Account &rarr;</a>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin:24px 0;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Your Account Details</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:120px;">Name</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#111827;">${providerName}</td></tr>
                    <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Login Email</td><td style="padding:5px 0;font-size:13px;color:#111827;">${toEmail}</td></tr>
                    <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Role</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#1a5c4f;">${isAdmin ? "Admin" : "Licensed Provider"}</td></tr>
                    <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Portal</td><td style="padding:5px 0;font-size:13px;color:#111827;"><a href="https://${COMPANY_DOMAIN}${portalPath}" style="color:#1a5c4f;font-weight:700;text-decoration:none;">${COMPANY_DOMAIN}${portalPath}</a></td></tr>
                  </table>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;line-height:1.6;">This link expires in <strong>24 hours</strong>. Contact your admin to resend if it expires.</p>
            <p style="margin:0;font-size:12px;color:#d1d5db;line-height:1.5;">If you did not expect this email, you can safely ignore it.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:18px 32px;text-align:center;">
            <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">Questions? Email us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a5c4f;text-decoration:none;">${SUPPORT_EMAIL}</a></p>
            <p style="margin:0;font-size:11px;color:#d1d5db;">${COMPANY_NAME} &mdash; ${COMPANY_DOMAIN}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendViaResend(toEmail: string, subject: string, html: string): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) { console.warn("[invite] RESEND_API_KEY not set"); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [toEmail], subject, html, reply_to: SUPPORT_EMAIL }),
    });
    if (res.ok) { console.log(`[invite] Sent via Resend to ${toEmail}`); return true; }
    const t = await res.text();
    console.warn(`[invite] Resend failed ${res.status}: ${t}`);
    return false;
  } catch (e) { console.warn("[invite] Resend error:", e); return false; }
}

async function sendInviteEmail(toEmail: string, providerName: string, setupLink: string, isAdmin: boolean): Promise<boolean> {
  const subject = `Action Required: Set Your ${COMPANY_NAME} ${isAdmin ? "Admin" : "Provider"} Password`;
  const html = buildInviteHtml(providerName, toEmail, setupLink, isAdmin);
  return sendViaResend(toEmail, subject, html);
}

// ── Get a reliable setup link — tries magiclink then recovery (works for confirmed users) ──
async function getSetupLink(adminClient: ReturnType<typeof createClient>, email: string, redirectTo: string): Promise<string> {
  for (const linkType of ["magiclink", "recovery"] as const) {
    try {
      const { data, error } = await adminClient.auth.admin.generateLink({ type: linkType, email, options: { redirectTo } });
      if (!error && data) {
        const raw = data as unknown as Record<string, unknown>;
        const props = raw["properties"] as Record<string, string> | undefined;
        const link = props?.["action_link"];
        if (link) { console.log(`[invite] Got setup link via ${linkType}`); return link; }
      }
      console.warn(`[invite] ${linkType} failed: ${error?.message}`);
    } catch (e) { console.warn(`[invite] ${linkType} threw:`, e); }
  }
  console.warn("[invite] All link types failed — using fallback URL");
  return `https://${COMPANY_DOMAIN}/reset-password`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // ── Verify caller is a logged-in admin ─────────────────────────────────
    const callerToken = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
    });
    const { data: { user: callerUser }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerUser) {
      console.warn("[invite] Auth failed:", callerErr?.message ?? "no user");
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized — please refresh the page and try again" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await adminClient
      .from("doctor_profiles")
      .select("is_admin, role")
      .eq("user_id", callerUser.id)
      .maybeSingle();

    const isCallerAdmin = callerProfile?.is_admin === true ||
      ["owner", "admin_manager", "support"].includes(callerProfile?.role ?? "");

    if (!isCallerAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "Access denied. Admin only." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as {
      email: string; full_name: string; title?: string | null; is_admin: boolean;
      role?: string; phone?: string | null; licensed_states?: string[];
      bio?: string | null; per_order_rate?: number | null; license_number?: string | null;
    };

    if (!body.email || !body.full_name) {
      return new Response(JSON.stringify({ ok: false, error: "email and full_name are required." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isProvider = !body.is_admin || body.role === "provider";
    const siteUrl = Deno.env.get("SITE_URL") ?? `https://${COMPANY_DOMAIN}`;
    const redirectTo = `${siteUrl}/reset-password`;
    const licensedStates = body.licensed_states ?? [];

    // ── CHECK: Does a doctor_profiles row exist for this email? ─────────────
    const { data: existingProfile } = await adminClient
      .from("doctor_profiles")
      .select("id, user_id, full_name, is_admin, email")
      .ilike("email", body.email)
      .maybeSingle();

    if (existingProfile) {
      // RESEND CASE — provider already has a profile, just send a fresh link
      console.log(`[invite] Existing profile found for ${body.email} — resending invite`);
      const setupLink = await getSetupLink(adminClient, body.email, redirectTo);
      const emailSent = await sendInviteEmail(body.email, existingProfile.full_name ?? body.full_name, setupLink, existingProfile.is_admin ?? body.is_admin);
      return new Response(
        JSON.stringify({ ok: true, email: body.email, full_name: existingProfile.full_name ?? body.full_name, invite_sent: true, welcome_email_sent: emailSent, note: "Existing provider — resent invite." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── NEW PROVIDER ─────────────────────────────────────────────────────────
    // Step 1: Ensure auth user exists (try invite generateLink, fallback to createUser)
    let authUserId: string | null = null;
    let setupLink = `${siteUrl}/reset-password`;

    // Try generateLink type "invite" first — creates user + provides action_link
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email: body.email,
      options: { data: { full_name: body.full_name, is_admin: body.is_admin }, redirectTo },
    });

    if (!linkErr && linkData?.user) {
      authUserId = linkData.user.id;
      // Try to extract action_link from the invite response
      const raw = linkData as unknown as Record<string, unknown>;
      const props = raw["properties"] as Record<string, string> | undefined;
      if (props?.["action_link"]) {
        setupLink = props["action_link"];
        console.log(`[invite] Got action_link from generateLink invite for ${body.email}`);
      } else {
        // action_link missing — fall back to getSetupLink
        console.warn(`[invite] action_link missing from invite response for ${body.email}, using getSetupLink`);
        setupLink = await getSetupLink(adminClient, body.email, redirectTo);
      }
    } else {
      // generateLink failed — check if user already exists in auth
      const alreadyExists = linkErr?.message?.includes("already been registered") ||
        (linkErr as unknown as { status?: number })?.status === 422;

      console.warn(`[invite] generateLink invite failed for ${body.email}: ${linkErr?.message ?? "unknown"}. alreadyExists=${alreadyExists}`);

      // Find or create auth user
      const { data: listRes } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const existingAuthUser = listRes?.users?.find((u) => u.email?.toLowerCase() === body.email.toLowerCase());

      if (existingAuthUser) {
        authUserId = existingAuthUser.id;
        console.log(`[invite] Found existing auth user ${authUserId} for ${body.email}`);
      } else if (!alreadyExists) {
        // Truly new user — create directly with email_confirm:true (they'll set pw via recovery link)
        const { data: createdUser, error: createErr } = await adminClient.auth.admin.createUser({
          email: body.email,
          email_confirm: true,
        });
        if (createErr || !createdUser?.user) {
          console.error(`[invite] createUser fallback failed for ${body.email}:`, createErr?.message);
          return new Response(JSON.stringify({ ok: false, error: createErr?.message ?? "Failed to create auth account." }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        authUserId = createdUser.user.id;
        console.log(`[invite] Created auth user via createUser fallback: ${authUserId}`);
      }

      if (!authUserId) {
        return new Response(JSON.stringify({ ok: false, error: "Could not create or locate auth account for this email." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get setup link using the reliable magiclink/recovery approach
      setupLink = await getSetupLink(adminClient, body.email, redirectTo);
    }

    // Step 2: Insert doctor_profiles
    const { error: profileErr } = await adminClient.from("doctor_profiles").insert({
      user_id: authUserId, full_name: body.full_name, email: body.email,
      title: body.title ?? null, is_admin: body.is_admin, is_active: true, licensed_states: licensedStates,
    });
    if (profileErr) {
      // Profile insert failed — might be a duplicate — return soft error
      console.error(`[invite] doctor_profiles insert failed for ${body.email}:`, profileErr.message);
      // Still try to send the email so the user can access their (existing) account
      const emailSent = await sendInviteEmail(body.email, body.full_name, setupLink, body.is_admin);
      return new Response(JSON.stringify({ ok: false, error: profileErr.message, emailSent }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Insert/update doctor_contacts (for provider users)
    if (isProvider) {
      const { data: ec } = await adminClient.from("doctor_contacts").select("id").eq("email", body.email.toLowerCase()).maybeSingle();
      if (ec) {
        await adminClient.from("doctor_contacts").update({
          full_name: body.full_name, phone: body.phone ?? null, licensed_states: licensedStates,
          notes: body.bio ?? null, per_order_rate: body.per_order_rate ?? null, is_active: true,
        }).eq("id", ec.id);
      } else {
        await adminClient.from("doctor_contacts").insert({
          full_name: body.full_name, email: body.email.toLowerCase(), phone: body.phone ?? null,
          licensed_states: licensedStates, notes: body.bio ?? null,
          per_order_rate: body.per_order_rate ?? null, is_active: true,
        });
      }
    }

    // Step 4: Send invite email — always, regardless of link quality
    const emailSent = await sendInviteEmail(body.email, body.full_name, setupLink, body.is_admin);
    console.log(`[invite] Invite email sent=${emailSent} for ${body.email} (userId=${authUserId})`);

    return new Response(
      JSON.stringify({ ok: true, email: body.email, full_name: body.full_name, invite_sent: true, welcome_email_sent: emailSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[invite] Unhandled error:", msg);
    return new Response(JSON.stringify({ ok: false, error: `Server error: ${msg}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
