// partner-user-invite
//
// Sends a branded, scanner-safe PawTenant invitation for an existing
// partner_users membership. The recipient always chooses their own password.

import { requirePartnerPlatformAdmin, partnerJson, PARTNER_ADMIN_CORS } from "../_shared/partnerAdminAuth.ts";
import { evaluateNotificationSuppression, isTestProject } from "../_shared/testNotificationSuppression.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUPPORT_EMAIL = "hello@pawtenant.com";
const FROM_ADDRESS = `PawTenant <${SUPPORT_EMAIL}>`;
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";

function partnerBaseUrl(): string {
  if (isTestProject()) {
    return (Deno.env.get("PARTNER_PORTAL_URL") ?? "https://pawtenant-test.vercel.app").replace(/\/$/, "");
  }
  return (Deno.env.get("PARTNER_PORTAL_URL") ?? Deno.env.get("PUBLIC_SITE_URL") ?? "https://pawtenant.com").replace(/\/$/, "");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function actionLinkFrom(data: unknown): string | null {
  return (data as { properties?: { action_link?: string } } | null)?.properties?.action_link ?? null;
}

// The one-time credential stays in the fragment, which mail scanners do not
// send to PawTenant. The reset page follows it only after a human clicks.
export function buildScannerSafePartnerSetupUrl(actionLink: string, resetUrl: string): string {
  const action = new URL(actionLink);
  const type = action.searchParams.get("type");
  if (action.protocol !== "https:" || action.pathname !== "/auth/v1/verify" || !["invite", "recovery"].includes(type ?? "")) {
    throw new Error("Unexpected partner setup action URL");
  }
  const landing = new URL(resetUrl);
  if (landing.protocol !== "https:" || landing.pathname !== "/reset-password") {
    throw new Error("Unexpected partner setup landing URL");
  }
  const bytes = new TextEncoder().encode(action.toString());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  landing.hash = `recovery_link=${encoded}`;
  return landing.toString();
}

function buildPartnerInviteHtml(email: string, organizationName: string, setupUrl: string, portalUrl: string): string {
  const org = escapeHtml(organizationName || "your organization");
  const login = escapeHtml(email);
  const setup = escapeHtml(setupUrl);
  const portal = escapeHtml(portalUrl);
  return `<!doctype html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f3f4f6;padding:40px 20px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
<tr><td style="background:#4a9e8a;padding:32px;text-align:center">
<img src="${LOGO_URL}" width="180" alt="PawTenant" style="display:block;margin:0 auto 18px;max-width:180px">
<div style="display:inline-block;background:rgba(255,255,255,.22);color:#fff;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:5px 16px;border-radius:999px;margin-bottom:14px">Partner Portal Invitation</div>
<h1 style="margin:0;color:#fff;font-size:23px;line-height:1.3">Welcome to the PawTenant Partner Platform</h1>
<p style="margin:10px 0 0;color:rgba(255,255,255,.84);font-size:14px;line-height:1.5">Your secure workspace for orders, accounts, and profile details.</p>
</td></tr>
<tr><td style="padding:32px">
<p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7">You have been invited to access <strong>${org}</strong> on the <strong>PawTenant Partner Platform</strong>. Set your password to activate your access.</p>
<table cellpadding="0" cellspacing="0" role="presentation" style="margin:24px auto 10px"><tr><td style="background:#f97316;border-radius:10px"><a href="${setup}" style="display:inline-block;padding:15px 36px;color:#fff;text-decoration:none;font-size:15px;font-weight:800">Set My Password &rarr;</a></td></tr></table>
<p style="margin:0 0 24px;color:#9ca3af;text-align:center;font-size:12px;line-height:1.5">This is a secure, one-time link. If it has expired, ask your PawTenant administrator to resend the invitation.</p>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px"><tr><td style="padding:20px 24px">
<p style="margin:0 0 12px;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Your account</p>
<p style="margin:0 0 8px;color:#374151;font-size:13px"><strong>Organization:</strong> ${org}</p>
<p style="margin:0 0 8px;color:#374151;font-size:13px"><strong>Login email:</strong> ${login}</p>
<p style="margin:0;color:#374151;font-size:13px"><strong>Portal:</strong> <a href="${portal}" style="color:#1a5c4f;font-weight:700;text-decoration:none">PawTenant Partner Portal</a></p>
</td></tr></table>
<p style="margin:0 0 10px;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Inside your partner portal</p>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e5e7eb;border-radius:12px">
<tr><td style="padding:14px 18px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;line-height:1.6"><strong style="color:#1a5c4f">Orders.</strong> Submit and track partner orders in one place.</td></tr>
<tr><td style="padding:14px 18px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;line-height:1.6"><strong style="color:#1a5c4f">Accounts.</strong> Review billing and order-level account details.</td></tr>
<tr><td style="padding:14px 18px;color:#374151;font-size:13px;line-height:1.6"><strong style="color:#1a5c4f">Profile.</strong> Keep organization and completion-contact information current.</td></tr>
</table>
<p style="margin:26px 0 4px;color:#374151;font-size:13px;line-height:1.7">Need help? Reply to this email or contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a5c4f;font-weight:700;text-decoration:none">${SUPPORT_EMAIL}</a>.</p>
<p style="margin:14px 0 0;color:#c3c7ce;font-size:12px">If you did not expect this invitation, you can safely ignore it.</p>
</td></tr>
<tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:18px 32px;text-align:center;color:#9ca3af;font-size:11px">PawTenant &mdash; pawtenant.com</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendPartnerInviteEmail(email: string, organizationName: string, setupUrl: string, portalUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return { ok: false, error: "Partner invitation email is not configured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS, to: [email], reply_to: SUPPORT_EMAIL,
        subject: "Activate your PawTenant Partner Portal access",
        html: buildPartnerInviteHtml(email, organizationName, setupUrl, portalUrl),
      }),
    });
    if (response.ok) return { ok: true };
    console.warn(`[partner-user-invite] Resend failed ${response.status}: ${await response.text()}`);
  } catch (error) {
    console.warn("[partner-user-invite] Resend error", error);
  }
  return { ok: false, error: "The invitation was created, but the branded email could not be sent" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: PARTNER_ADMIN_CORS });
  if (req.method !== "POST") return partnerJson(405, { ok: false, error: "POST only" });

  const auth = await requirePartnerPlatformAdmin(req);
  if (!auth.ok) return partnerJson(auth.status, { ok: false, code: auth.code, error: auth.error });
  const { service } = auth;

  let body: { partner_user_id?: string };
  try { body = await req.json(); } catch { return partnerJson(400, { ok: false, error: "Expected JSON" }); }
  const id = (body.partner_user_id ?? "").trim();
  if (!UUID_RE.test(id)) return partnerJson(400, { ok: false, error: "partner_user_id is required" });

  const { data: row, error: rowErr } = await service.from("partner_users")
    .select("id, email, status, partner_id, user_id").eq("id", id).maybeSingle();
  if (rowErr) return partnerJson(500, { ok: false, error: "Could not read the partner user" });
  if (!row) return partnerJson(404, { ok: false, error: "No such partner user" });
  if (row.status === "revoked") return partnerJson(409, { ok: false, error: "This partner user is revoked — restore access before inviting again" });

  const email = String(row.email).toLowerCase();
  const suppression = evaluateNotificationSuppression(email);
  if (suppression.suppressed) {
    return partnerJson(200, { ok: true, suppressed: true, reason: suppression.reason, message: "Invitation recorded; no email was sent (test fixture address)." });
  }

  const { data: organization } = await service.from("partner_organizations")
    .select("display_name").eq("id", row.partner_id).maybeSingle();
  const organizationName = String(organization?.display_name ?? "your organization");
  const baseUrl = partnerBaseUrl();
  const resetUrl = `${baseUrl}/reset-password`;
  const portalUrl = `${baseUrl}/partner-portal`;

  let kind: "invite" | "recovery" = row.user_id ? "recovery" : "invite";
  let linkData: unknown = null;
  let linkError: { message: string } | null = null;

  if (kind === "invite") {
    const result = await service.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: resetUrl } });
    linkData = result.data;
    linkError = result.error;
    if (linkError && /already|registered|exists/i.test(linkError.message)) kind = "recovery";
  }
  if (kind === "recovery") {
    const result = await service.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: resetUrl } });
    linkData = result.data;
    linkError = result.error;
  }

  if (linkError) return partnerJson(502, { ok: false, error: `Could not create the secure setup link: ${linkError.message}` });
  const rawActionLink = actionLinkFrom(linkData);
  if (!rawActionLink) return partnerJson(502, { ok: false, error: "Could not create the secure setup link" });

  let setupUrl: string;
  try {
    setupUrl = buildScannerSafePartnerSetupUrl(rawActionLink, resetUrl);
  } catch (error) {
    console.warn("[partner-user-invite] Refused unexpected Auth action URL", error);
    return partnerJson(502, { ok: false, error: "Could not validate the secure setup link" });
  }

  const sent = await sendPartnerInviteEmail(email, organizationName, setupUrl, portalUrl);
  if (!sent.ok) return partnerJson(502, { ok: false, error: sent.error });
  return partnerJson(200, { ok: true, suppressed: false, kind, branded_email_sent: true });
});
