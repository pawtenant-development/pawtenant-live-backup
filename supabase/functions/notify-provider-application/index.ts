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

// ── Resend helper ──────────────────────────────────────────────────────────

async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[notify-provider-application] RESEND_API_KEY secret is not set");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.tags ? { tags: opts.tags } : {}),
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[notify-provider-application] Resend error ${res.status}: ${errBody}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notify-provider-application] Resend fetch error:", err);
    return false;
  }
}

// ── Template helpers ───────────────────────────────────────────────────────

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function baseEmailLayout({ badge, heading, subheading, content, footerTagline = `${COMPANY_NAME} • Secure ESA Consultation Support` }: {
  badge: string; heading: string; subheading: string; content: string; footerTagline?: string;
}) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;background:#F3F4F6;font-family:Arial;">
<table width="100%" style="padding:24px;">
<tr><td align="center">
<table width="680" style="background:#fff;border-radius:20px;border:1px solid #E5E7EB;overflow:hidden;">
<tr>
<td style="padding:30px;background:#F7F7F8;text-align:center;border-bottom:1px solid #E5E7EB;">
<img src="${LOGO_URL}" width="220" style="margin-bottom:16px;" alt="${COMPANY_NAME}" />
<div style="background:#FFF1E8;color:#FF6A00;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:bold;display:inline-block;">${badge}</div>
<h2 style="margin:16px 0 6px;color:#111827;">${heading}</h2>
<p style="color:#6B7280;margin:0;">${subheading}</p>
</td>
</tr>
<tr><td style="padding:30px;">${content}</td></tr>
<tr>
<td style="padding:20px;background:#F9FAFB;text-align:center;border-top:1px solid #E5E7EB;">
<p style="font-size:13px;color:#6B7280;margin:0 0 4px;">${footerTagline}</p>
<p style="font-size:12px;color:#9CA3AF;margin:0;">${SUPPORT_EMAIL}</p>
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
    <a href="${escapeHtml(url)}" style="background:#FF6A00;color:#fff;padding:14px 26px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;">${text}</a>
  </div>`;
}

function card(title: string, body: string) {
  return `<div style="background:#FAFAFA;border:1px solid #E5E7EB;border-radius:14px;padding:20px;margin-top:20px;">
    <p style="color:#FF6A00;font-size:12px;font-weight:bold;margin:0 0 14px;">${title}</p>
    ${body}
  </div>`;
}

function row(label: string, value: string) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #F3F4F6;">
    <tr>
      <td style="padding:7px 0;font-size:13px;color:#9CA3AF;width:45%;">${escapeHtml(label)}</td>
      <td style="padding:7px 0;font-size:13px;font-weight:600;color:#111827;text-align:right;">${escapeHtml(value)}</td>
    </tr>
  </table>`;
}

function step(num: string, title: string, desc: string) {
  return `<div style="display:flex;align-items:flex-start;padding:10px 0;border-bottom:1px solid #F3F4F6;">
    <div style="min-width:28px;height:28px;background:#FF6A00;border-radius:50%;text-align:center;line-height:28px;font-size:12px;font-weight:bold;color:#fff;margin-right:14px;">${num}</div>
    <div>
      <p style="margin:0 0 3px;font-size:13px;font-weight:600;color:#111827;">${escapeHtml(title)}</p>
      <p style="margin:0;font-size:12px;color:#6B7280;">${escapeHtml(desc)}</p>
    </div>
  </div>`;
}

interface ApplicationPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  licenseTypes?: string;
  licenseNumber?: string;
  licenseState?: string;
  additionalStates?: string;
  yearsExperience?: string;
  practiceName?: string;
  practiceType?: string;
  specializations?: string;
  monthlyCapacity?: string;
  esaExperience?: string;
  telehealthReady?: string;
  bio?: string;
  profileUrl?: string;
  headshotUrl?: string;
  documentsCount?: number;
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
    <p style="margin:0 0 24px;font-size:14px;color:#4B5563;line-height:1.7;">
      We&apos;ve received your application to join our network of licensed mental health professionals. Our clinical team will carefully review your credentials and reach out within <strong>48 hours</strong> to schedule your onboarding call.
    </p>
    ${card("Your Application Summary", summaryRows)}
    ${card("What Happens Next", stepsHtml)}
    <p style="margin:24px 0 6px;font-size:14px;color:#4B5563;">Have questions in the meantime?</p>
    <p style="margin:0;font-size:14px;color:#4B5563;">
      Reach out at <a href="mailto:${SUPPORT_EMAIL}" style="color:#FF6A00;font-weight:600;text-decoration:none;">${SUPPORT_EMAIL}</a> and we&apos;ll be happy to help.
    </p>
  `;

  return baseEmailLayout({
    badge: "Application Received",
    heading: "Application Received!",
    subheading: `Therapist Network &mdash; ${COMPANY_NAME}`,
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
    <div style="margin-top:14px;padding:12px 16px;background:#fff;border:1px solid #E5E7EB;border-radius:10px;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:bold;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;">Bio</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">${escapeHtml(opts.bio)}</p>
    </div>` : "";

  const content = `
    <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.7;">
      A new therapist has submitted a provider application and is awaiting review.
    </p>
    ${card("Applicant Details", allRows + bioSection)}
    ${button(ADMIN_PORTAL_URL, "Review in Admin Portal →")}
    <p style="margin:0;font-size:13px;color:#9CA3AF;text-align:center;">
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

  if (!body.firstName || !body.email) {
    return json({ error: "firstName and email are required" }, 400);
  }

  const adminEmail = Deno.env.get("ADMIN_EMAIL") ?? SUPPORT_EMAIL;

  const [providerResult, adminResult] = await Promise.allSettled([
    sendViaResend({
      to: body.email,
      subject: `Application Received — Welcome to ${COMPANY_NAME}, ${body.firstName}!`,
      html: buildProviderConfirmationEmail(body),
      tags: [{ name: "email_type", value: "provider_application_confirmation" }],
    }),
    sendViaResend({
      to: adminEmail,
      subject: `New Provider Application — ${body.firstName} ${body.lastName} (${body.licenseState ?? "Unknown State"})`,
      html: buildAdminNotificationEmail(body),
      tags: [{ name: "email_type", value: "provider_application_admin_notification" }],
    }),
  ]);

  const providerSent = providerResult.status === "fulfilled" && providerResult.value;
  const adminSent = adminResult.status === "fulfilled" && adminResult.value;

  return json({ ok: true, providerEmailSent: providerSent, adminEmailSent: adminSent });
});
