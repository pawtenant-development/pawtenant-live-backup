import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANY_NAME = "PawTenant";
const COMPANY_DOMAIN = "pawtenant.com";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const ADMIN_PORTAL_URL = `https://${COMPANY_DOMAIN}/admin-orders`;
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;
const FALLBACK_ADMIN_EMAIL = "eservices.dm@gmail.com";

const HEADER_BG = "#4a9e8a";
const HEADER_BADGE_BG = "rgba(255,255,255,0.22)";
const HEADER_TEXT = "#ffffff";
const HEADER_SUB = "rgba(255,255,255,0.82)";
const ACCENT = "#1a5c4f";
const ORANGE = "#f97316";

// ── Resolve admin notification recipients ─────────────────────────────────────
async function getAdminNotifRecipients(notificationKey: string): Promise<{ enabled: boolean; recipients: string[] }> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${supabaseUrl}/functions/v1/get-admin-notif-recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ notificationKey }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { enabled: boolean; recipients: string[]; source: string };
    console.info(`[notify-provider-application] recipients for "${notificationKey}": ${data.recipients.join(", ")} (source: ${data.source})`);
    return { enabled: data.enabled, recipients: data.recipients };
  } catch (err) {
    console.warn(`[notify-provider-application] getAdminNotifRecipients failed:`, err instanceof Error ? err.message : String(err));
    return { enabled: true, recipients: [FALLBACK_ADMIN_EMAIL] };
  }
}

async function sendViaResend(opts: {
  to: string; subject: string; html: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.error("[notify-provider-application] RESEND_API_KEY secret is not set"); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [opts.to], subject: opts.subject, html: opts.html, ...(opts.tags ? { tags: opts.tags } : {}) }),
    });
    if (!res.ok) { const errBody = await res.text(); console.error(`[notify-provider-application] Resend error ${res.status}: ${errBody}`); return false; }
    return true;
  } catch (err) { console.error("[notify-provider-application] Resend fetch error:", err); return false; }
}

function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function baseEmailLayout({ badge, heading, subheading, content, footerTagline = `${COMPANY_NAME} • Secure ESA Consultation Support` }: {
  badge: string; heading: string; subheading: string; content: string; footerTagline?: string;
}) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr>
        <td style="background:${HEADER_BG};padding:32px;text-align:center;">
          <img src="${LOGO_URL}" width="180" alt="${COMPANY_NAME}" style="display:block;margin:0 auto 16px;height:auto;" />
          <div style="display:inline-block;background:${HEADER_BADGE_BG};color:${HEADER_TEXT};padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px;">${badge}</div>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${HEADER_TEXT};line-height:1.3;">${heading}</h1>
          <p style="margin:0;font-size:14px;color:${HEADER_SUB};">${subheading}</p>
        </td>
      </tr>
      <tr><td style="padding:32px;">${content}</td></tr>
      <tr>
        <td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">${footerTagline}</p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">${SUPPORT_EMAIL}</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function button(url: string, text: string) {
  return `<div style="text-align:center;margin:25px 0;">
    <a href="${escapeHtml(url)}" style="background:${ORANGE};color:#fff;padding:14px 26px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">${text}</a>
  </div>`;
}

function card(title: string, body: string) {
  return `<div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:14px;padding:20px;margin-top:20px;">
    <p style="color:${ORANGE};font-size:12px;font-weight:bold;margin:0 0 14px;">${title}</p>
    ${body}
  </div>`;
}

function row(label: string, value: string) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #f3f4f6;">
    <tr>
      <td style="padding:7px 0;font-size:13px;color:#9ca3af;width:45%;">${escapeHtml(label)}</td>
      <td style="padding:7px 0;font-size:13px;font-weight:600;color:#111827;text-align:right;">${escapeHtml(value)}</td>
    </tr>
  </table>`;
}

function step(num: string, title: string, desc: string) {
  return `<div style="display:flex;align-items:flex-start;padding:10px 0;border-bottom:1px solid #f3f4f6;">
    <div style="min-width:28px;height:28px;background:${ACCENT};border-radius:50%;text-align:center;line-height:28px;font-size:12px;font-weight:bold;color:#fff;margin-right:14px;">${num}</div>
    <div>
      <p style="margin:0 0 3px;font-size:13px;font-weight:600;color:#111827;">${escapeHtml(title)}</p>
      <p style="margin:0;font-size:12px;color:#6b7280;">${escapeHtml(desc)}</p>
    </div>
  </div>`;
}

interface ApplicationPayload {
  firstName: string; lastName: string; email: string; phone?: string;
  licenseTypes?: string; licenseNumber?: string; licenseState?: string;
  additionalStates?: string; yearsExperience?: string; practiceName?: string;
  practiceType?: string; specializations?: string; monthlyCapacity?: string;
  esaExperience?: string; telehealthReady?: string; bio?: string;
  profileUrl?: string; headshotUrl?: string; documentsCount?: number;
}

function buildProviderConfirmationEmail(opts: ApplicationPayload): string {
  const summaryRows = [
    row("Full Name", `${opts.firstName} ${opts.lastName}`),
    row("Email", opts.email),
    ...(opts.licenseTypes ? [row("License Type(s)", opts.licenseTypes)] : []),
    ...(opts.licenseState ? [row("Primary State", opts.licenseState)] : []),
    ...(opts.monthlyCapacity ? [row("Monthly Capacity", opts.monthlyCapacity)] : []),
  ].join("");

  const stepsHtml = `
    ${step("1", "Credential Verification", "Our clinical team verifies your license. Usually within 48 hours.")}
    ${step("2", "Onboarding Call", "A short orientation covering platform use and ESA documentation standards.")}
    ${step("3", "Go Live & Start Accepting Cases", "Your profile goes live and you begin receiving matched ESA evaluation requests.")}
  `;

  const content = `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${escapeHtml(opts.firstName)}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#4b5563;line-height:1.7;">
      We&apos;ve received your application to join our network of licensed mental health professionals. Our clinical team will carefully review your credentials and reach out within <strong>48 hours</strong> to schedule your onboarding call.
    </p>
    ${card("Your Application Summary", summaryRows)}
    ${card("What Happens Next", stepsHtml)}
    <p style="margin:24px 0 6px;font-size:14px;color:#4b5563;">Have questions in the meantime?</p>
    <p style="margin:0;font-size:14px;color:#4b5563;">
      Reach out at <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};font-weight:600;text-decoration:none;">${SUPPORT_EMAIL}</a> and we&apos;ll be happy to help.
    </p>
  `;

  return baseEmailLayout({
    badge: "Application Received",
    heading: "Application Received!",
    subheading: `Therapist Network — ${COMPANY_NAME}`,
    content,
    footerTagline: `${COMPANY_NAME} • Therapist Network`,
  });
}

function buildAdminNotificationEmail(opts: ApplicationPayload): string {
  const allRows = [
    ["Name", `${opts.firstName} ${opts.lastName}`],
    ["Email", opts.email],
    ["Phone", opts.phone ?? "—"],
    ["License Type(s)", opts.licenseTypes ?? "—"],
    ["License #", opts.licenseNumber ?? "—"],
    ["Primary State", opts.licenseState ?? "—"],
    ["Additional States", opts.additionalStates ?? "—"],
    ["Experience", opts.yearsExperience ?? "—"],
    ["Practice", opts.practiceName ?? "—"],
    ["Practice Type", opts.practiceType ?? "—"],
    ["Specializations", opts.specializations ?? "—"],
    ["Monthly Capacity", opts.monthlyCapacity ?? "—"],
    ["ESA Experience", opts.esaExperience ?? "—"],
    ["Telehealth Ready", opts.telehealthReady ?? "—"],
    ["Headshot Uploaded", opts.headshotUrl ? "Yes" : "No"],
    ["Documents Uploaded", opts.documentsCount ? `${opts.documentsCount} file(s)` : "None"],
  ].map(([label, value]) => row(label, value)).join("");

  const bioSection = opts.bio ? `
    <div style="margin-top:14px;padding:12px 16px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:bold;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Bio</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">${escapeHtml(opts.bio)}</p>
    </div>` : "";

  const content = `
    <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.7;">
      A new therapist has submitted a provider application and is awaiting review.
    </p>
    ${card("Applicant Details", allRows + bioSection)}
    ${button(ADMIN_PORTAL_URL, "Review in Admin Portal →")}
    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
      Log in to the admin portal to approve or reject this application.
    </p>
  `;

  return baseEmailLayout({
    badge: "New Application",
    heading: "New Provider Application",
    subheading: "Action required — Review and approve in the admin portal",
    content,
    footerTagline: `${COMPANY_NAME} Admin Notification`,
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: ApplicationPayload;
  try { body = (await req.json()) as ApplicationPayload; }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  if (!body.firstName || !body.email) return json({ error: "firstName and email are required" }, 400);

  // ── Resolve admin recipients for "provider_application" notification ───────
  const { enabled: notifEnabled, recipients: adminRecipients } = await getAdminNotifRecipients("provider_application");

  // Always send confirmation to the provider applicant
  const providerResult = await sendViaResend({
    to: body.email,
    subject: `Application Received — Welcome to ${COMPANY_NAME}, ${body.firstName}!`,
    html: buildProviderConfirmationEmail(body),
    tags: [{ name: "email_type", value: "provider_application_confirmation" }],
  });

  // Send admin notification to all configured recipients (if enabled)
  let adminSentCount = 0;
  if (notifEnabled && adminRecipients.length > 0) {
    const adminHtml = buildAdminNotificationEmail(body);
    const adminSubject = `New Provider Application — ${body.firstName} ${body.lastName} (${body.licenseState ?? "Unknown State"})`;
    const adminResults = await Promise.allSettled(
      adminRecipients.map((recipient) =>
        sendViaResend({
          to: recipient,
          subject: adminSubject,
          html: adminHtml,
          tags: [{ name: "email_type", value: "provider_application_admin_notification" }],
        })
      )
    );
    adminSentCount = adminResults.filter((r) => r.status === "fulfilled" && r.value).length;
    console.info(`[notify-provider-application] Admin notifications sent: ${adminSentCount}/${adminRecipients.length} to [${adminRecipients.join(", ")}]`);
  } else if (!notifEnabled) {
    console.info(`[notify-provider-application] provider_application notification is disabled — skipping admin emails`);
  }

  return json({
    ok: true,
    providerEmailSent: providerResult,
    adminEmailSent: adminSentCount > 0,
    adminSentCount,
    adminRecipients: notifEnabled ? adminRecipients : [],
  });
});
