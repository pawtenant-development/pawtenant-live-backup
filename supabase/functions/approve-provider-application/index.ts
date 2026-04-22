// approve-provider-application — Phase 2 Step 4 + Step 5 (validation fix)
// Converts a pending provider_applications row into a real provider account.
//
// Flow:
//   1. Validate admin caller (auth token → doctor_profiles.is_admin / role).
//   2. Load provider_applications row by applicationId.
//   3. Normalize email (trim + lowercase).
//   4. If a doctor_profiles row already exists for that email → regenerate
//      setup link, resend invite email, mark application approved + link
//      approved_provider_id, return { already_existed: true }.
//   5. Otherwise → invite auth user, insert doctor_profiles with lifecycle
//      defaults + initial license info, link application, send invite.
//
// Reuses the same invite email template/helpers inlined in create-provider so
// onboarding email stays consistent. No Stripe / orders / tracking touched.
// approved_providers and doctor_contacts are intentionally NOT modified here.
//
// Step 5 note: handled business-level errors return HTTP 200 with
// { ok: false, success: false, error } so supabase.functions.invoke surfaces
// the actual error message in `data` instead of a generic "non-2xx" string.
// HTTP 500 is reserved for unhandled / config-level failures.
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

const STATE_NAME_TO_CODE: Record<string, string> = {
  "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA",
  "Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA",
  "Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS",
  "Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA",
  "Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT",
  "Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM",
  "New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK",
  "Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC",
  "South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT",
  "Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY",
  "Washington DC":"DC","District of Columbia":"DC",
};

function parseStatesToCodes(licenseState: string | null, additionalStates: string | null): string[] {
  const codes = new Set<string>();
  const addName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const code = STATE_NAME_TO_CODE[trimmed] ?? (trimmed.length === 2 ? trimmed.toUpperCase() : null);
    if (code) codes.add(code);
  };
  if (licenseState) addName(licenseState);
  if (additionalStates) additionalStates.split(",").forEach(addName);
  return Array.from(codes);
}

function deriveTitle(licenseTypes: string | null): string | null {
  if (!licenseTypes) return null;
  const first = licenseTypes.split(",")[0]?.trim() ?? "";
  const m = first.match(/\(([^)]+)\)/);
  if (m) return m[1];
  return first || null;
}

function buildProviderInviteHtml(providerName: string, toEmail: string, setupLink: string): string {
  const firstName = providerName.split(" ")[0];
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:${HEADER_BG};padding:32px;text-align:center;">
            <img src="${LOGO_URL}" alt="${COMPANY_NAME}" width="180" style="display:block;margin:0 auto 18px;max-width:180px;" />
            <div style="display:inline-block;background:${HEADER_BADGE_BG};color:${HEADER_TEXT};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:5px 16px;border-radius:999px;margin-bottom:14px;">Application Approved</div>
            <h1 style="margin:0;font-size:22px;font-weight:800;color:${HEADER_TEXT};line-height:1.3;">Welcome to ${COMPANY_NAME}, ${firstName}!</h1>
            <p style="margin:10px 0 0;font-size:14px;color:${HEADER_SUB};line-height:1.5;">Your application has been approved. Set your password to activate your provider portal.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${providerName}</strong>,</p>
            <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
              Your application has been reviewed and approved. You've been added to the <strong>${COMPANY_NAME} Provider Network</strong>. Click the button below to set your password and activate your provider portal account.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:28px auto;">
              <tr>
                <td style="background:${ORANGE};border-radius:10px;">
                  <a href="${setupLink}" style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;">Activate My Provider Account &rarr;</a>
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
                    <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Role</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:${ACCENT};">Licensed Provider</td></tr>
                    <tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Portal</td><td style="padding:5px 0;font-size:13px;"><a href="https://${COMPANY_DOMAIN}${PROVIDER_PORTAL_PATH}" style="color:${ACCENT};font-weight:700;text-decoration:none;">${COMPANY_DOMAIN}${PROVIDER_PORTAL_PATH}</a></td></tr>
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
  if (!resendKey) { console.warn("[approve-provider-application] RESEND_API_KEY not set"); return false; }
  try {
    const subject = `Action Required: Activate Your ${COMPANY_NAME} Provider Account`;
    const html = buildProviderInviteHtml(providerName, toEmail, setupLink);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [toEmail], subject, html, reply_to: SUPPORT_EMAIL }),
    });
    if (res.ok) { console.log(`[approve-provider-application] Invite sent to ${toEmail}`); return true; }
    const t = await res.text();
    console.warn(`[approve-provider-application] Resend failed ${res.status}: ${t}`);
    return false;
  } catch (e) { console.warn("[approve-provider-application] Resend error:", e); return false; }
}

async function getSetupLink(adminClient: ReturnType<typeof createClient>, email: string, redirectTo: string): Promise<string> {
  for (const linkType of ["magiclink", "recovery"] as const) {
    try {
      const { data, error } = await adminClient.auth.admin.generateLink({ type: linkType, email, options: { redirectTo } });
      if (!error && data) {
        const raw = data as unknown as Record<string, unknown>;
        const props = raw["properties"] as Record<string, string> | undefined;
        const link = props?.["action_link"];
        if (link) { console.log(`[approve-provider-application] Setup link via ${linkType}`); return link; }
      }
      console.warn(`[approve-provider-application] ${linkType} failed: ${error?.message}`);
    } catch (e) { console.warn(`[approve-provider-application] ${linkType} threw:`, e); }
  }
  return `https://${COMPANY_DOMAIN}/reset-password`;
}

// Always 200 unless `status` is explicitly provided. Business errors use 200
// with { ok:false } so the frontend can read the real error from the JSON body
// (supabase.functions.invoke hides non-2xx bodies behind a generic message).
function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      // Config-level failure — real 500.
      return jsonResponse({ ok: false, success: false, error: "Server misconfigured: missing Supabase env vars." }, 500);
    }

    // ── Auth: require an admin caller ────────────────────────────────────────
    const callerToken = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!callerToken) {
      return jsonResponse({ ok: false, success: false, error: "Unauthorized — no token provided" });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user: callerUser }, error: callerErr } = await adminClient.auth.getUser(callerToken);
    if (callerErr || !callerUser) {
      return jsonResponse({ ok: false, success: false, error: "Unauthorized — session expired, please refresh and try again" });
    }

    const { data: callerProfile } = await adminClient
      .from("doctor_profiles")
      .select("is_admin, role")
      .eq("user_id", callerUser.id)
      .maybeSingle();
    const isCallerAdmin = callerProfile?.is_admin === true || ["owner", "admin_manager", "support"].includes(callerProfile?.role ?? "");
    if (!isCallerAdmin) {
      return jsonResponse({ ok: false, success: false, error: "Access denied. Admin only." });
    }

    // ── Parse body (accept camelCase + snake_case) ───────────────────────────
    let body: Record<string, unknown> = {};
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return jsonResponse({ ok: false, success: false, error: "Invalid JSON body." });
    }

    const applicationId = (body.applicationId ?? body.application_id) as string | undefined;
    if (!applicationId || typeof applicationId !== "string") {
      return jsonResponse({ ok: false, success: false, error: "applicationId is required." });
    }

    // ── Load application ─────────────────────────────────────────────────────
    const { data: application, error: appErr } = await adminClient
      .from("provider_applications")
      .select("*")
      .eq("id", applicationId)
      .maybeSingle();

    if (appErr) {
      return jsonResponse({ ok: false, success: false, error: `Failed to load application: ${appErr.message}` });
    }
    if (!application) {
      return jsonResponse({ ok: false, success: false, error: "Application not found." });
    }

    const appRow = application as Record<string, unknown>;
    const rawEmail = String(appRow.email ?? "");
    const appEmail = rawEmail.trim().toLowerCase();
    if (!appEmail) {
      return jsonResponse({ ok: false, success: false, error: "Application has no email on file." });
    }

    const firstName = String(appRow.first_name ?? "").trim();
    const lastName = String(appRow.last_name ?? "").trim();
    const fullName = `${firstName} ${lastName}`.trim() || appEmail;
    const phone = appRow.phone ? String(appRow.phone) : null;
    const licenseNumber = appRow.license_number ? String(appRow.license_number) : null;
    const licenseTypes = appRow.license_types ? String(appRow.license_types) : null;
    const primaryStateName = appRow.license_state ? String(appRow.license_state).trim() : null;
    const additionalStates = appRow.additional_states ? String(appRow.additional_states) : null;
    const bio = appRow.bio ? String(appRow.bio) : null;
    const headshotUrl = appRow.headshot_url ? String(appRow.headshot_url) : null;

    const licensedStateCodes = parseStatesToCodes(primaryStateName, additionalStates);
    const title = deriveTitle(licenseTypes);

    const stateLicenseNumbers: Record<string, string> = {};
    if (primaryStateName && licenseNumber) {
      stateLicenseNumbers[primaryStateName] = licenseNumber;
    }

    const siteUrl = Deno.env.get("SITE_URL") ?? `https://${COMPANY_DOMAIN}`;
    const redirectTo = `${siteUrl}/reset-password`;
    const nowIso = new Date().toISOString();

    // ── Duplicate check: existing provider by email (case-insensitive) ───────
    const { data: existingProfile, error: existingErr } = await adminClient
      .from("doctor_profiles")
      .select("id, user_id, full_name")
      .ilike("email", appEmail)
      .maybeSingle();

    if (existingErr) {
      return jsonResponse({ ok: false, success: false, error: `Duplicate check failed: ${existingErr.message}` });
    }

    // ── Path A: provider already exists → resend invite, link application ───
    if (existingProfile) {
      const setupLink = await getSetupLink(adminClient, appEmail, redirectTo);
      const providerName = (existingProfile.full_name as string) ?? fullName;
      const emailSent = await sendProviderInviteEmail(appEmail, providerName, setupLink);

      const { error: linkAppErr } = await adminClient
        .from("provider_applications")
        .update({
          status: "approved",
          approved_provider_id: existingProfile.id,
          reviewed_at: nowIso,
          reviewed_by: callerUser.email ?? callerUser.id,
        })
        .eq("id", applicationId);

      if (linkAppErr) {
        return jsonResponse({
          ok: false,
          success: false,
          error: `Provider exists but application link failed: ${linkAppErr.message}`,
          welcome_email_sent: emailSent,
        });
      }

      return jsonResponse({
        ok: true,
        success: true,
        already_existed: true,
        provider_id: existingProfile.id,
        email: appEmail,
        full_name: providerName,
        invite_sent: true,
        welcome_email_sent: emailSent,
        note: "Existing provider — invite email resent, application linked.",
      });
    }

    // ── Path B: brand new provider ───────────────────────────────────────────
    let authUserId: string | null = null;
    let setupLink = `${siteUrl}/reset-password`;

    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email: appEmail,
      options: { data: { full_name: fullName, is_admin: false, role: "provider" }, redirectTo },
    });

    if (!linkErr && linkData?.user) {
      authUserId = linkData.user.id;
      const raw = linkData as unknown as Record<string, unknown>;
      const props = raw["properties"] as Record<string, string> | undefined;
      if (props?.["action_link"]) {
        setupLink = props["action_link"];
      } else {
        setupLink = await getSetupLink(adminClient, appEmail, redirectTo);
      }
    } else {
      // Fallback: auth user may already exist (orphaned from a prior attempt).
      const { data: listRes } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const existingAuthUser = listRes?.users?.find((u) => (u.email ?? "").toLowerCase() === appEmail);
      if (existingAuthUser) {
        authUserId = existingAuthUser.id;
      } else {
        const { data: createdUser, error: createErr } = await adminClient.auth.admin.createUser({ email: appEmail, email_confirm: true });
        if (createErr || !createdUser?.user) {
          return jsonResponse({
            ok: false,
            success: false,
            error: createErr?.message ?? "Failed to create auth account.",
          });
        }
        authUserId = createdUser.user.id;
      }
      setupLink = await getSetupLink(adminClient, appEmail, redirectTo);
    }

    if (!authUserId) {
      return jsonResponse({
        ok: false,
        success: false,
        error: "Could not create or locate auth account for this email.",
      });
    }

    // Insert doctor_profiles with Step 1 lifecycle columns + initial license info.
    const { data: insertedProfile, error: profileErr } = await adminClient
      .from("doctor_profiles")
      .insert({
        user_id: authUserId,
        full_name: fullName,
        email: appEmail,
        phone,
        title,
        license_number: licenseNumber,
        licensed_states: licensedStateCodes,
        state_license_numbers: Object.keys(stateLicenseNumbers).length > 0 ? stateLicenseNumbers : null,
        bio,
        photo_url: headshotUrl,
        is_admin: false,
        role: "provider",
        is_active: true,
        lifecycle_status: "approved",
        is_published: false,
        application_id: applicationId,
      })
      .select("id")
      .maybeSingle();

    if (profileErr || !insertedProfile) {
      // Fail safely: do not link the application, do not send invite email —
      // admin can retry. On retry, Path A will handle the orphan auth user.
      return jsonResponse({
        ok: false,
        success: false,
        error: profileErr?.message ?? "Failed to insert doctor_profiles row.",
      });
    }

    // Link application → new provider, mark approved.
    const { error: linkAppErr } = await adminClient
      .from("provider_applications")
      .update({
        status: "approved",
        approved_provider_id: insertedProfile.id,
        reviewed_at: nowIso,
        reviewed_by: callerUser.email ?? callerUser.id,
      })
      .eq("id", applicationId);

    if (linkAppErr) {
      // Profile exists but application link failed. Still send invite so the
      // provider isn't blocked; admin can retry to relink the application.
      const emailSent = await sendProviderInviteEmail(appEmail, fullName, setupLink);
      return jsonResponse({
        ok: false,
        success: false,
        error: `Provider created but application link failed: ${linkAppErr.message}`,
        provider_id: insertedProfile.id,
        welcome_email_sent: emailSent,
      });
    }

    // Send invite email (non-fatal if Resend is down — provider row is already
    // created and linked, admin can resend manually).
    const emailSent = await sendProviderInviteEmail(appEmail, fullName, setupLink);

    return jsonResponse({
      ok: true,
      success: true,
      already_existed: false,
      provider_id: insertedProfile.id,
      email: appEmail,
      full_name: fullName,
      invite_sent: true,
      welcome_email_sent: emailSent,
    });

  } catch (err) {
    // Unhandled — real 500 so it shows up in monitoring.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[approve-provider-application] unhandled error:", msg);
    return jsonResponse({ ok: false, success: false, error: `Server error: ${msg}` }, 500);
  }
});
