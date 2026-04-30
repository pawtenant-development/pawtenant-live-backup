// approve-provider-application — Phase 2 Step 4 + Step 5 (validation fix)
// + Phase 4 Provider Pipeline fix: also insert into approved_providers so
// homepage + profile routing can resolve new providers by slug.
//
// Converts a pending provider_applications row into a real provider account.
//
// Flow:
//   1. Validate admin caller (auth token → doctor_profiles.is_admin / role).
//   2. Load provider_applications row by applicationId.
//   3. Normalize email (trim + lowercase).
//   4. If a doctor_profiles row already exists for that email → regenerate
//      setup link, resend invite email, mark application approved + link
//      approved_provider_id.
//   5. Otherwise → invite auth user, insert doctor_profiles with lifecycle
//      defaults + initial license info, link application, send invite.
//   6. In BOTH paths → ensure an approved_providers row exists (keyed by
//      email, case-insensitive). Missing row is created with a safe unique
//      slug. Existing row is left untouched (non-destructive).
//
// Reuses the same invite email template/helpers inlined in create-provider so
// onboarding email stays consistent. No Stripe / orders / tracking touched.
// doctor_contacts is intentionally NOT modified here.
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

// Turn any human string into a URL-safe slug fragment.
function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Generate a slug that isn't already taken in approved_providers.
// Tries: name-based → email-prefix → name-based + short suffix.
async function generateUniqueSlug(
  adminClient: ReturnType<typeof createClient>,
  fullName: string,
  email: string,
): Promise<string> {
  const nameSlug = slugify(fullName);
  const emailSlug = slugify(email.split("@")[0] ?? "");
  const base = nameSlug || emailSlug || "provider";

  const isTaken = async (s: string): Promise<boolean> => {
    const { data } = await adminClient
      .from("approved_providers")
      .select("id")
      .eq("slug", s)
      .maybeSingle();
    return !!data;
  };

  if (!(await isTaken(base))) return base;
  if (emailSlug && emailSlug !== base && !(await isTaken(emailSlug))) return emailSlug;

  // Last resort — append a short random suffix until free.
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 7)}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Extremely unlikely — fall through with a timestamp suffix.
  return `${base}-${Date.now().toString(36)}`;
}

// Ensure an approved_providers row exists for this provider.
// Keyed by email (case-insensitive). Existing rows are NOT overwritten.
// Returns { created, slug, error } — failures are non-fatal to the caller.
async function ensureApprovedProvider(
  adminClient: ReturnType<typeof createClient>,
  params: {
    email: string;
    fullName: string;
    title: string | null;
    bio: string | null;
    states: string[];
    photoUrl: string | null;
    phone: string | null;
    applicationId: string | null;
  },
): Promise<{ created: boolean; slug: string | null; error?: string }> {
  try {
    const { data: existing, error: checkErr } = await adminClient
      .from("approved_providers")
      .select("id, slug")
      .ilike("email", params.email)
      .maybeSingle();

    if (checkErr) {
      console.warn("[approve-provider-application] approved_providers check failed:", checkErr.message);
      return { created: false, slug: null, error: checkErr.message };
    }

    if (existing) {
      // Row already present — leave untouched.
      return { created: false, slug: (existing.slug as string) ?? null };
    }

    const slug = await generateUniqueSlug(adminClient, params.fullName, params.email);

    const { data: inserted, error: insertErr } = await adminClient
      .from("approved_providers")
      .insert({
        application_id: params.applicationId,
        slug,
        full_name: params.fullName,
        email: params.email,
        title: params.title,
        bio: params.bio,
        states: params.states,
        photo_url: params.photoUrl,
        phone: params.phone,
        is_active: true,
      })
      .select("slug")
      .maybeSingle();

    if (insertErr || !inserted) {
      console.warn("[approve-provider-application] approved_providers insert failed:", insertErr?.message);
      return { created: false, slug: null, error: insertErr?.message ?? "insert failed" };
    }

    console.log(`[approve-provider-application] approved_providers row created for ${params.email} (slug=${slug})`);
    return { created: true, slug: (inserted.slug as string) ?? slug };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[approve-provider-application] ensureApprovedProvider threw:", msg);
    return { created: false, slug: null, error: msg };
  }
}

// OPS-PROVIDER-WELCOME-EMAIL-COPY: expanded onboarding email. Body content
// is identical to the equivalent function in supabase/functions/create-provider
// — a future task should lift this into a shared module. Header badge and
// sub-header line differ per entry point so the recipient knows whether they
// were just approved (this fn) vs. invited as an existing provider account.
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
            <div style="display:inline-block;background:${HEADER_BADGE_BG};color:${HEADER_TEXT};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:5px 16px;border-radius:999px;margin-bottom:14px;">Application Approved</div>
            <h1 style="margin:0;font-size:22px;font-weight:800;color:${HEADER_TEXT};line-height:1.3;">Welcome to ${COMPANY_NAME}, ${firstName}!</h1>
            <p style="margin:10px 0 0;font-size:14px;color:${HEADER_SUB};line-height:1.5;">Your application has been approved. Activate your provider portal to start reviewing cases.</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${providerName}</strong>,</p>
            <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
              Congratulations &mdash; your application has been reviewed and approved, and you've been added to the <strong>${COMPANY_NAME} Provider Network</strong>. The first step is to activate your provider portal account by setting a password.
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
    console.warn("[approve-provider-application] isAuthUserAlreadyConfirmed threw:", e);
    return false;
  }
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
    // OPS-PROVIDER-APPLICATION-PHASE1-SAFE-FIXES: NPI is captured on the
    // application form. Sync it into doctor_profiles.npi_number so the provider
    // does not have to re-enter it from the portal. Only fill when missing on
    // the existing profile (Path A) — never overwrite a provider self-edit.
    const applicationNpi = appRow.npi
      ? String(appRow.npi).trim().replace(/\D/g, "")
      : "";
    const applicationNpiOrNull = applicationNpi.length > 0 ? applicationNpi : null;

    // OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2: structured licenses are the
    // preferred source for provider sync when present. Falls back to the
    // legacy single-state path for old applications that have no `licenses`
    // jsonb. licensed_states is built from the unique state_code values;
    // state_license_numbers is keyed by code; legacy doctor_profiles columns
    // (license_number, title) are derived for backward compatibility.
    type StructuredLicense = { state_code: string; credential: string; license_number: string };
    const rawLicenses = (appRow as Record<string, unknown>).licenses;
    const structuredLicenses: StructuredLicense[] = Array.isArray(rawLicenses)
      ? (rawLicenses as Array<Record<string, unknown>>)
          .map((l) => ({
            state_code: String(l.state_code ?? "").trim().toUpperCase(),
            credential: String(l.credential ?? "").trim(),
            license_number: String(l.license_number ?? "").trim(),
          }))
          .filter((l) => l.state_code && l.credential && l.license_number)
      : [];

    let licensedStateCodes: string[];
    let stateLicenseNumbers: Record<string, string> = {};
    let title: string | null;
    let licenseNumberForProfile: string | null;

    if (structuredLicenses.length > 0) {
      // Build canonical licensed_states from unique state codes.
      licensedStateCodes = Array.from(new Set(structuredLicenses.map((l) => l.state_code)));
      // Group by state code; collapse same-value rows; on conflict, keep the
      // first non-empty value but log a warning so admin can review.
      const byState = new Map<string, Set<string>>();
      for (const l of structuredLicenses) {
        const set = byState.get(l.state_code) ?? new Set<string>();
        set.add(l.license_number);
        byState.set(l.state_code, set);
      }
      for (const [code, values] of byState.entries()) {
        const uniq = Array.from(values);
        if (uniq.length === 1) {
          stateLicenseNumbers[code] = uniq[0];
        } else {
          console.warn(
            `[approve-provider-application] structured license conflict for ${appEmail} state=${code}: ${uniq.join(" / ")} — keeping first value, please review`,
          );
          stateLicenseNumbers[code] = uniq[0];
        }
      }
      title = deriveTitle(structuredLicenses[0].credential) ?? structuredLicenses[0].credential ?? null;
      licenseNumberForProfile = structuredLicenses[0].license_number;
    } else {
      // ── Legacy fallback path (pre-V2 applications) ────────────────────────
      licensedStateCodes = parseStatesToCodes(primaryStateName, additionalStates);
      title = deriveTitle(licenseTypes);
      licenseNumberForProfile = licenseNumber;

      // OPS-PROVIDER-LICENSE-STATE-NORMALIZATION-PHASE-B: state_license_numbers
      // must be keyed by canonical 2-letter state CODE (e.g. "VA"), not the
      // full state NAME ("Virginia").
      const primaryStateCode: string | null = (() => {
        if (!primaryStateName) return null;
        const trimmed = primaryStateName.trim();
        if (!trimmed) return null;
        if (STATE_NAME_TO_CODE[trimmed]) return STATE_NAME_TO_CODE[trimmed];
        if (trimmed.length === 2) return trimmed.toUpperCase();
        return licensedStateCodes[0] ?? null;
      })();

      if (primaryStateCode && licenseNumber) {
        stateLicenseNumbers[primaryStateCode] = licenseNumber;
      } else if (primaryStateName && licenseNumber) {
        stateLicenseNumbers[primaryStateName] = licenseNumber;
      }
    }

    const siteUrl = Deno.env.get("SITE_URL") ?? `https://${COMPANY_DOMAIN}`;
    const redirectTo = `${siteUrl}/reset-password`;
    const nowIso = new Date().toISOString();

    // ── Duplicate check: existing provider by email (case-insensitive) ───────
    // OPS-PROVIDER-APPLICATION-PHASE1-SAFE-FIXES: also read npi_number so we
    // can backfill it from the application without overwriting a self-edit.
    const { data: existingProfile, error: existingErr } = await adminClient
      .from("doctor_profiles")
      .select("id, user_id, full_name, npi_number")
      .ilike("email", appEmail)
      .maybeSingle();

    if (existingErr) {
      return jsonResponse({ ok: false, success: false, error: `Duplicate check failed: ${existingErr.message}` });
    }

    // ── Path A: provider already exists → resend invite, link application ───
    if (existingProfile) {
      const alreadyActivated = await isAuthUserAlreadyConfirmed(adminClient, appEmail);
      const setupLink = await getSetupLink(adminClient, appEmail, redirectTo);
      const providerName = (existingProfile.full_name as string) ?? fullName;
      let emailSent = false;
      if (alreadyActivated) {
        console.log(`[approve-provider-application] Skipped activation email for ${appEmail} — auth user already confirmed (email_confirmed_at present).`);
      } else {
        emailSent = await sendProviderInviteEmail(appEmail, providerName, setupLink);
      }

      // OPS-PROVIDER-APPLICATION-PHASE1-SAFE-FIXES: backfill NPI on the
      // existing doctor_profiles row only when it is null/empty. Best-effort —
      // failure must NOT block the application link below.
      const existingNpiRaw = (existingProfile as { npi_number?: string | null }).npi_number;
      const existingNpi = existingNpiRaw ? String(existingNpiRaw).trim() : "";
      if (applicationNpiOrNull && existingNpi.length === 0) {
        try {
          await adminClient
            .from("doctor_profiles")
            .update({ npi_number: applicationNpiOrNull })
            .eq("id", existingProfile.id);
        } catch (npiErr) {
          console.warn("[approve-provider-application] NPI backfill failed (non-fatal):", npiErr);
        }
      }

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
          already_activated: alreadyActivated,
          activation_email_skipped: alreadyActivated,
        });
      }

      // Phase 4 pipeline fix — backfill approved_providers for legacy profiles
      // that were approved before the pipeline included this table.
      const approvedRes = await ensureApprovedProvider(adminClient, {
        email: appEmail,
        fullName: providerName,
        title,
        bio,
        states: licensedStateCodes,
        photoUrl: headshotUrl,
        phone,
        applicationId,
      });

      return jsonResponse({
        ok: true,
        success: true,
        already_existed: true,
        provider_id: existingProfile.id,
        email: appEmail,
        full_name: providerName,
        invite_sent: !alreadyActivated,
        welcome_email_sent: emailSent,
        already_activated: alreadyActivated,
        activation_email_skipped: alreadyActivated,
        approved_providers_created: approvedRes.created,
        approved_providers_slug: approvedRes.slug,
        approved_providers_error: approvedRes.error ?? null,
        note: alreadyActivated
          ? "Provider account is already activated; activation email was not resent. Application linked, approved_providers ensured."
          : "Existing provider — invite email resent, application linked, approved_providers ensured.",
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
    // OPS-PROVIDER-APPLICATION-PHASE1-SAFE-FIXES: seed npi_number from the
    // application so the provider doesn't have to re-enter it in the portal.
    const { data: insertedProfile, error: profileErr } = await adminClient
      .from("doctor_profiles")
      .insert({
        user_id: authUserId,
        full_name: fullName,
        email: appEmail,
        phone,
        title,
        // OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2: derived from the first
        // structured row when present, falls back to legacy license_number.
        license_number: licenseNumberForProfile,
        licensed_states: licensedStateCodes,
        state_license_numbers: Object.keys(stateLicenseNumbers).length > 0 ? stateLicenseNumbers : null,
        npi_number: applicationNpiOrNull,
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
      const alreadyActivated = await isAuthUserAlreadyConfirmed(adminClient, appEmail);
      let emailSent = false;
      if (alreadyActivated) {
        console.log(`[approve-provider-application] Skipped activation email for ${appEmail} — auth user already confirmed (email_confirmed_at present).`);
      } else {
        emailSent = await sendProviderInviteEmail(appEmail, fullName, setupLink);
      }
      return jsonResponse({
        ok: false,
        success: false,
        error: `Provider created but application link failed: ${linkAppErr.message}`,
        provider_id: insertedProfile.id,
        welcome_email_sent: emailSent,
        already_activated: alreadyActivated,
        activation_email_skipped: alreadyActivated,
      });
    }

    // Phase 4 pipeline fix — create approved_providers row so homepage +
    // profile routing can resolve this provider by slug. Non-fatal: if this
    // fails, the provider still exists in doctor_profiles and admin can rerun
    // approval or run the backfill SQL.
    const approvedRes = await ensureApprovedProvider(adminClient, {
      email: appEmail,
      fullName,
      title,
      bio,
      states: licensedStateCodes,
      photoUrl: headshotUrl,
      phone,
      applicationId,
    });

    // Send invite email (non-fatal if Resend is down — provider row is already
    // created and linked, admin can resend manually). Skip if the auth user is
    // already confirmed (e.g. fallback path used createUser({ email_confirm: true })
    // or an orphaned-but-activated auth user was reused).
    const alreadyActivated = await isAuthUserAlreadyConfirmed(adminClient, appEmail);
    let emailSent = false;
    if (alreadyActivated) {
      console.log(`[approve-provider-application] Skipped activation email for ${appEmail} — auth user already confirmed (email_confirmed_at present).`);
    } else {
      emailSent = await sendProviderInviteEmail(appEmail, fullName, setupLink);
    }

    return jsonResponse({
      ok: true,
      success: true,
      already_existed: false,
      provider_id: insertedProfile.id,
      email: appEmail,
      full_name: fullName,
      invite_sent: !alreadyActivated,
      welcome_email_sent: emailSent,
      already_activated: alreadyActivated,
      activation_email_skipped: alreadyActivated,
      approved_providers_created: approvedRes.created,
      approved_providers_slug: approvedRes.slug,
      approved_providers_error: approvedRes.error ?? null,
      note: alreadyActivated ? "Provider account is already activated; activation email was not resent." : undefined,
    });

  } catch (err) {
    // Unhandled — real 500 so it shows up in monitoring.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[approve-provider-application] unhandled error:", msg);
    return jsonResponse({ ok: false, success: false, error: `Server error: ${msg}` }, 500);
  }
});
