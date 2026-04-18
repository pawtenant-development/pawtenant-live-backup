import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANY_NAME = "PawTenant";
const COMPANY_DOMAIN = "pawtenant.com";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const PORTAL_URL = `https://${COMPANY_DOMAIN}/my-orders`;
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;

const HEADER_BG = "#4a9e8a";
const HEADER_BADGE_BG = "rgba(255,255,255,0.22)";
const HEADER_TEXT = "#ffffff";
const HEADER_SUB = "rgba(255,255,255,0.82)";
const ACCENT = "#4a7fb5";

// ── Recipient routing ────────────────────────────────────────────────────────
async function getAdminRecipients(notificationKey: string): Promise<{ enabled: boolean; recipients: string[] }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/get-admin-notif-recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ notificationKey }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { enabled: boolean; recipients: string[] };
    return data;
  } catch (err) {
    console.warn("[notify-order-status] Could not resolve admin recipients:", err);
    const fallback = Deno.env.get("ADMIN_EMAIL") ?? "eservices.dm@gmail.com";
    return { enabled: true, recipients: [fallback] };
  }
}

async function sendViaResend(opts: {
  to: string; subject: string; html: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.error("[notify-order-status] RESEND_API_KEY secret is not set"); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [opts.to], subject: opts.subject, html: opts.html, ...(opts.tags ? { tags: opts.tags } : {}) }),
    });
    if (!res.ok) { const errBody = await res.text(); console.error(`[notify-order-status] Resend error ${res.status}: ${errBody}`); return false; }
    return true;
  } catch (err) { console.error("[notify-order-status] Resend fetch error:", err); return false; }
}

function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function baseLayout(badge: string, heading: string, subheading: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr>
        <td style="background:${HEADER_BG};padding:32px;text-align:center;">
          <img src="${LOGO_URL}" width="180" alt="PawTenant" style="display:block;margin:0 auto 16px;height:auto;" />
          <div style="display:inline-block;background:${HEADER_BADGE_BG};color:${HEADER_TEXT};padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px;">${badge}</div>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${HEADER_TEXT};line-height:1.3;">${heading}</h1>
          <p style="margin:0;font-size:14px;color:${HEADER_SUB};">${subheading}</p>
        </td>
      </tr>
      <tr><td style="padding:32px;">${body}</td></tr>
      <tr>
        <td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Questions? Contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a></p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">${COMPANY_NAME} &mdash; ESA Consultation &nbsp;&middot;&nbsp; <a href="https://${COMPANY_DOMAIN}" style="color:${ACCENT};text-decoration:none;">${COMPANY_DOMAIN}</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function detailCard(title: string, rows: Array<[string, string, string?]>): string {
  const rowsHtml = rows.map(([label, value, vc]) => `
    <tr>
      <td style="padding:7px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">${label}</td>
      <td style="padding:7px 0;font-size:13px;font-weight:600;color:${vc ?? "#111827"};">${value}</td>
    </tr>`).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f9;border:1px solid #b8cce4;border-radius:12px;margin-bottom:24px;">
    <tr><td style="padding:20px 24px;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">${title}</p>
      <table width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
    </td></tr>
  </table>`;
}

function stepsCard(title: string, steps: string[]): string {
  const stepsHtml = steps.map((step, i) => `
    <tr>
      <td style="padding:7px 0;vertical-align:top;width:30px;">
        <div style="width:22px;height:22px;background:${ACCENT};border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#fff;">${i + 1}</div>
      </td>
      <td style="padding:7px 0 7px 10px;font-size:13px;color:#374151;line-height:1.5;">${step}</td>
    </tr>`).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px;">
    <tr><td style="padding:20px 24px;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">${title}</p>
      <table width="100%" cellpadding="0" cellspacing="0">${stepsHtml}</table>
    </td></tr>
  </table>`;
}

function ctaButton(url: string, text: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
    <tr><td align="center">
      <a href="${escapeHtml(url)}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">${text} &rarr;</a>
    </td></tr>
  </table>`;
}

function buildAdminNotifEmail(opts: { confirmationId: string; customerEmail: string; customerName: string; newStatus: string; doctorName?: string | null }): string {
  const statusLabel = opts.newStatus === "completed" ? "Order Completed" : opts.newStatus === "cancelled" ? "Order Cancelled" : opts.newStatus;
  const statusColor = opts.newStatus === "completed" ? "#059669" : opts.newStatus === "cancelled" ? "#dc2626" : "#d97706";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr>
        <td style="background:${ACCENT};padding:24px 32px;text-align:center;">
          <img src="${LOGO_URL}" width="140" alt="PawTenant" style="display:block;margin:0 auto 12px;height:auto;" />
          <div style="display:inline-block;background:rgba(255,255,255,0.2);color:#fff;padding:4px 14px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Admin Notification</div>
          <h1 style="margin:12px 0 0;font-size:20px;font-weight:800;color:#ffffff;">Order Status Changed</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:20px;">
            <tr><td style="padding:18px 20px;">
              <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Order Details</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:5px 0;font-size:13px;color:#9ca3af;width:140px;">Order ID</td><td style="font-size:13px;font-weight:700;color:#111827;font-family:monospace;">${escapeHtml(opts.confirmationId)}</td></tr>
                <tr><td style="padding:5px 0;font-size:13px;color:#9ca3af;">Customer</td><td style="font-size:13px;font-weight:600;color:#111827;">${escapeHtml(opts.customerName)} &lt;${escapeHtml(opts.customerEmail)}&gt;</td></tr>
                <tr><td style="padding:5px 0;font-size:13px;color:#9ca3af;">New Status</td><td style="font-size:13px;font-weight:700;color:${statusColor};">${statusLabel}</td></tr>
                ${opts.doctorName ? `<tr><td style="padding:5px 0;font-size:13px;color:#9ca3af;">Provider</td><td style="font-size:13px;font-weight:600;color:${ACCENT};">${escapeHtml(opts.doctorName)}</td></tr>` : ""}
              </table>
            </td></tr>
          </table>
          <div style="text-align:center;">
            <a href="https://${COMPANY_DOMAIN}/admin-orders" style="background:${ACCENT};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px;display:inline-block;">View in Admin Portal &rarr;</a>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function buildUnderReviewEmail(opts: { firstName: string; confirmationId: string; doctorName: string | null }): string {
  const name = escapeHtml(opts.firstName || "there");
  const providerName = escapeHtml(opts.doctorName ?? "A licensed provider");
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
      Great news &mdash; a licensed mental health professional has been assigned to your ESA case and is actively reviewing your information.
    </p>
    ${detailCard("Your Case Status", [
      ["Order ID", escapeHtml(opts.confirmationId), ACCENT],
      ["Assigned Provider", providerName, ACCENT],
      ["Status", '<span style="color:#d97706;font-weight:700;">Under Review</span>'],
      ["Expected Delivery", "within 2&ndash;3 business days"],
    ])}
    ${stepsCard("What Happens Next", [
      "Your provider reviews your assessment answers and pet information",
      "They prepare and sign your official ESA letter",
      "You receive your completed documents by email and in your portal",
    ])}
    ${ctaButton(PORTAL_URL, "Track My Order")}
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      You don&rsquo;t need to do anything right now. We&rsquo;ll send you another email the moment your documents are ready.
    </p>`;
  return baseLayout("Case Update", "Your provider has been assigned", "Your ESA evaluation is now actively in progress", body);
}

function buildCompletedEmail(opts: { firstName: string; confirmationId: string; doctorName: string | null }): string {
  const name = escapeHtml(opts.firstName || "there");
  const providerName = escapeHtml(opts.doctorName ?? "Your Provider");
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
      Excellent news! Your ESA order has been completed. Your signed ESA letter and any supporting documents are now available in your portal.
    </p>
    ${detailCard("Your Order Summary", [
      ["Order ID", escapeHtml(opts.confirmationId), ACCENT],
      ["Completed By", providerName, ACCENT],
      ["Status", '<span style="color:#059669;font-weight:700;">Completed</span>'],
    ])}
    ${stepsCard("What You Should Do Next", [
      "Download your signed ESA letter from your portal",
      "Keep a digital and physical copy for your records",
      "Present the letter to your landlord or housing provider as needed",
    ])}
    ${ctaButton(PORTAL_URL, "Access My Documents")}
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      Your ESA letter is legally recognized under the Fair Housing Act. Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>`;
  return baseLayout("Order Complete", "Your ESA documents are ready!", "Your signed letter and documents are now available", body);
}

function buildCancelledEmail(opts: { firstName: string; confirmationId: string; refunded: boolean; refundAmount?: number; cancelNote?: string }): string {
  const name = escapeHtml(opts.firstName || "there");
  const refundInfo = opts.refunded && opts.refundAmount
    ? `<span style="color:#059669;font-weight:700;">$${opts.refundAmount.toFixed(2)} refund issued</span>`
    : opts.refunded
    ? `<span style="color:#059669;font-weight:700;">Full refund issued</span>`
    : `<span style="color:#6b7280;">No refund processed</span>`;

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
      We&rsquo;re writing to confirm that your ESA order has been cancelled as requested.
      ${opts.refunded ? " A refund has been issued and should appear on your statement within 5-10 business days." : ""}
    </p>
    ${detailCard("Cancellation Summary", [
      ["Order ID", escapeHtml(opts.confirmationId), ACCENT],
      ["Status", '<span style="color:#dc2626;font-weight:700;">Cancelled</span>'],
      ["Refund", refundInfo],
      ...(opts.cancelNote ? [["Note", escapeHtml(opts.cancelNote)] as [string, string]] : []),
    ])}
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
      If you have any questions about your cancellation or refund, please don&rsquo;t hesitate to contact our support team.
    </p>
    ${ctaButton(`mailto:${SUPPORT_EMAIL}`, "Contact Support")}
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      Thank you for considering PawTenant. We hope to assist you again in the future.
    </p>`;
  return baseLayout("Order Cancelled", "Your order has been cancelled", "Cancellation confirmation for your records", body);
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

type EmailLogEntry = { type: string; sentAt: string; to: string; success: boolean };

async function appendEmailLog(supabase: ReturnType<typeof createClient>, confirmationId: string, entry: EmailLogEntry): Promise<void> {
  try {
    const { data } = await supabase.from("orders").select("email_log").eq("confirmation_id", confirmationId).maybeSingle();
    const currentLog: EmailLogEntry[] = (data?.email_log as EmailLogEntry[]) ?? [];
    await supabase.from("orders").update({ email_log: [...currentLog, entry] }).eq("confirmation_id", confirmationId);
  } catch (err) { console.warn("[notify-order-status] email_log update failed:", err); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResp({ error: "Method not allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResp({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return jsonResp({ error: "Invalid JSON body" }, 400); }

  const confirmationId = body.confirmationId as string | undefined;
  const newStatus = body.newStatus as string | undefined;
  if (!confirmationId || !newStatus) return jsonResp({ error: "confirmationId and newStatus are required" }, 400);

  if (!["under-review", "completed", "cancelled"].includes(newStatus)) {
    return jsonResp({ ok: true, skipped: true, reason: "No email needed for this status" });
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders").select("id, confirmation_id, email, first_name, last_name, doctor_name, patient_notification_sent_at")
    .eq("confirmation_id", confirmationId).maybeSingle();
  if (orderErr || !order) return jsonResp({ error: `Order not found: ${confirmationId}` }, 404);

  if (newStatus === "completed" && order.patient_notification_sent_at) {
    return jsonResp({ ok: true, skipped: true, reason: "Docs already sent — no duplicate completion email" });
  }

  let subject = "";
  let customerHtml = "";
  let emailType = "";
  let adminNotifKey = "";

  if (newStatus === "under-review") {
    subject = `Your ESA Case Is Being Reviewed — Order ${confirmationId}`;
    customerHtml = buildUnderReviewEmail({ firstName: order.first_name ?? "there", confirmationId, doctorName: order.doctor_name });
    emailType = "status_under_review";
    adminNotifKey = "order_under_review";
  } else if (newStatus === "completed") {
    subject = `Your ESA Order Is Complete — Order ${confirmationId}`;
    customerHtml = buildCompletedEmail({ firstName: order.first_name ?? "there", confirmationId, doctorName: order.doctor_name });
    emailType = "status_completed";
    adminNotifKey = "order_completed";
  } else if (newStatus === "cancelled") {
    const refunded = body.refunded as boolean ?? false;
    const refundAmount = body.refundAmount as number | undefined;
    const cancelNote = body.cancelNote as string | undefined;
    subject = `Your PawTenant Order Has Been Cancelled — Order ${confirmationId}`;
    customerHtml = buildCancelledEmail({ firstName: order.first_name ?? "there", confirmationId, refunded, refundAmount, cancelNote });
    emailType = "order_cancelled";
    adminNotifKey = "order_cancelled";
  }

  const customerEmailSent = await sendViaResend({
    to: order.email, subject, html: customerHtml,
    tags: [{ name: "confirmation_id", value: confirmationId }, { name: "email_type", value: emailType }],
  });

  await appendEmailLog(supabase, confirmationId, { type: emailType, sentAt: new Date().toISOString(), to: order.email, success: customerEmailSent });

  if (adminNotifKey) {
    const { enabled: adminEnabled, recipients: adminRecipients } = await getAdminRecipients(adminNotifKey);
    if (adminEnabled && adminRecipients.length > 0) {
      const adminHtml = buildAdminNotifEmail({
        confirmationId,
        customerEmail: order.email,
        customerName: `${order.first_name ?? ""} ${order.last_name ?? ""}`.trim() || order.email,
        newStatus,
        doctorName: order.doctor_name,
      });
      const adminSubject = `[Admin] Order ${newStatus === "completed" ? "Completed" : newStatus === "cancelled" ? "Cancelled" : "Under Review"} — ${confirmationId}`;
      await Promise.all(
        adminRecipients.map((email) => sendViaResend({ to: email, subject: adminSubject, html: adminHtml }))
      );
    }
  }

  return jsonResp({ ok: true, emailSent: customerEmailSent, status: newStatus, confirmationId });
});
