import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
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
const FALLBACK_ADMIN_EMAIL = "eservices.dm@gmail.com";

const HEADER_BG = "#4a9e8a";
const HEADER_BADGE_BG = "rgba(255,255,255,0.22)";
const HEADER_TEXT = "#ffffff";
const HEADER_SUB = "rgba(255,255,255,0.82)";
const ACCENT = "#1a5c4f";

async function getAdminNotifRecipients(supabaseUrl: string, serviceKey: string, notificationKey: string): Promise<{ enabled: boolean; recipients: string[] }> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/get-admin-notif-recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ notificationKey }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { enabled: boolean; recipients: string[]; source: string };
    console.info(`[notify-customer-refund] recipients for "${notificationKey}": ${data.recipients.join(", ")} (source: ${data.source})`);
    return { enabled: data.enabled, recipients: data.recipients };
  } catch (err) {
    console.warn(`[notify-customer-refund] getAdminNotifRecipients failed:`, err instanceof Error ? err.message : String(err));
    return { enabled: true, recipients: [FALLBACK_ADMIN_EMAIL] };
  }
}

async function sendViaResend(opts: {
  to: string; subject: string; html: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.error("[notify-customer-refund] RESEND_API_KEY secret is not set"); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [opts.to], subject: opts.subject, html: opts.html, ...(opts.tags ? { tags: opts.tags } : {}) }),
    });
    if (!res.ok) { const errBody = await res.text(); console.error(`[notify-customer-refund] Resend error ${res.status}: ${errBody}`); return false; }
    return true;
  } catch (err) { console.error("[notify-customer-refund] Resend fetch error:", err); return false; }
}

function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeName(firstName = "") { return escapeHtml(firstName || "Customer"); }

function formatDate(value: string | undefined) {
  if (!value) return "";
  try { return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
  catch { return escapeHtml(value); }
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
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px;">
    <tr><td style="padding:20px 24px;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">${title}</p>
      <table width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
    </td></tr>
  </table>`;
}

function stepsCard(title: string, steps: string[]): string {
  const stepsHtml = steps.map((s, i) => `
    <tr>
      <td style="padding:7px 0;vertical-align:top;width:30px;">
        <div style="width:22px;height:22px;background:${ACCENT};border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#fff;">${i + 1}</div>
      </td>
      <td style="padding:7px 0 7px 10px;font-size:13px;color:#374151;line-height:1.5;">${s}</td>
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

function buildRefundEmail(opts: {
  firstName?: string; confirmationId: string; formattedAmount: string;
  reasonLabel?: string; issuedAt?: string; note?: string;
}): string {
  const name = safeName(opts.firstName);
  const detailRows: Array<[string, string, string?]> = [
    ["Order ID", escapeHtml(opts.confirmationId), ACCENT],
    ["Refund Amount", escapeHtml(opts.formattedAmount), "#059669"],
    ["Reason", escapeHtml(opts.reasonLabel ?? "Customer Request")],
    ["Issued On", escapeHtml(formatDate(opts.issuedAt))],
  ];
  if (opts.note) detailRows.push(["Note", escapeHtml(opts.note)]);

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
      Your refund has been processed and is on its way. Please see the details below for your records.
    </p>
    ${detailCard("Refund Details", detailRows)}
    ${stepsCard("What Happens Next", [
      "Your refund has been issued to your original payment method",
      "Most refunds appear within 3&ndash;5 business days depending on your bank",
      "You&rsquo;ll receive a separate receipt from Stripe confirming the transaction",
    ])}
    ${ctaButton(PORTAL_URL, "View My Order")}
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      Questions about your refund? <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a> or <strong style="color:#374151;">(409) 965-5885</strong>.
    </p>`;

  return baseLayout("Refund Issued", "Your refund has been processed", "The funds are on their way back to you", body);
}

function buildAdminRefundNotificationHtml(opts: {
  confirmationId: string; customerName: string; customerEmail: string;
  formattedAmount: string; reasonLabel: string; note?: string; issuedAt: string;
}): string {
  const rows = [
    ["Order ID", opts.confirmationId],
    ["Customer", opts.customerName],
    ["Email", opts.customerEmail],
    ["Refund Amount", opts.formattedAmount],
    ["Reason", opts.reasonLabel],
    ...(opts.note ? [["Note", opts.note]] : []),
    ["Issued At", new Date(opts.issuedAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET"],
  ];
  const rowsHtml = rows.map(([label, value]) => `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;width:160px;border-bottom:1px solid #f3f4f6;font-weight:600;">${label}</td><td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${value}</td></tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;"><tr><td style="background:#dc2626;padding:28px 32px;text-align:center;"><img src="${LOGO_URL}" width="160" alt="PawTenant" style="display:block;margin:0 auto 14px;height:auto;" /><div style="display:inline-block;background:rgba(255,255,255,0.2);color:#ffffff;padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">REFUND ISSUED</div><h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">Refund Processed</h1></td></tr><tr><td style="padding:28px 32px;"><p style="margin:0 0 20px;font-size:14px;color:#374151;">A refund has been issued for the following order. Review in the admin portal if needed.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:24px;">${rowsHtml}</table><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><a href="https://pawtenant.com/admin-orders" style="display:inline-block;background:#f97316;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:8px;">Open Admin Portal &rarr;</a></td></tr></table></td></tr><tr><td style="padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant Internal Notification</p></td></tr></table></td></tr></table></body></html>`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

type EmailLogEntry = { type: string; sentAt: string; to: string; success: boolean };

async function appendEmailLog(adminClient: ReturnType<typeof createClient>, confirmationId: string, entry: EmailLogEntry): Promise<void> {
  try {
    const { data } = await adminClient.from("orders").select("email_log").eq("confirmation_id", confirmationId).maybeSingle();
    const currentLog: EmailLogEntry[] = (data?.email_log as EmailLogEntry[]) ?? [];
    await adminClient.from("orders").update({ email_log: [...currentLog, entry] }).eq("confirmation_id", confirmationId);
  } catch (err) { console.warn("[notify-customer-refund] email_log update failed:", err); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  const isInternalCall = token === serviceKey;

  let actorName = "Internal Service";
  let actorId = "service";
  let actorRole = "service";

  if (!isInternalCall) {
    const callerClient = createClient(supabaseUrl, token);
    const { data: { user }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);
    const { data: callerProfile } = await adminClient.from("doctor_profiles").select("is_admin, full_name, role").eq("user_id", user.id).maybeSingle();
    if (!callerProfile?.is_admin) return json({ error: "Forbidden — admin only" }, 403);
    actorName = callerProfile.full_name ?? "Admin";
    actorId = user.id;
    actorRole = callerProfile.role ?? "admin_manager";
  }

  let body: { confirmationId?: string; refundAmount?: number; refundId?: string; reason?: string; note?: string; };
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const { confirmationId, refundAmount, refundId, reason, note } = body;
  if (!confirmationId) return json({ error: "confirmationId is required" }, 400);
  if (!refundAmount || refundAmount <= 0) return json({ error: "refundAmount is required" }, 400);

  // ── Fetch order — now includes phone ─────────────────────────────────────
  const { data: order, error: orderErr } = await adminClient
    .from("orders").select("id, confirmation_id, email, first_name, last_name, phone, state, price, plan_type, doctor_name, status")
    .eq("confirmation_id", confirmationId).maybeSingle();
  if (orderErr || !order) return json({ error: `Order not found: ${confirmationId}` }, 404);

  const patientName = `${order.first_name ?? ""} ${order.last_name ?? ""}`.trim() || order.email;
  const formattedAmount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(refundAmount);
  const refundReasonLabel: Record<string, string> = {
    requested_by_customer: "Customer Request",
    duplicate: "Duplicate Charge",
    fraudulent: "Fraudulent",
  };
  const reasonLabel = refundReasonLabel[reason ?? ""] ?? reason ?? "Customer Request";
  const issuedAt = new Date().toISOString();

  const html = buildRefundEmail({
    firstName: order.first_name ?? "there",
    confirmationId,
    formattedAmount,
    reasonLabel,
    issuedAt,
    note,
  });

  const emailSent = await sendViaResend({
    to: order.email,
    subject: `Refund Confirmation — Order ${confirmationId}`,
    html,
    tags: [{ name: "confirmation_id", value: confirmationId }, { name: "email_type", value: "refund" }],
  });

  await appendEmailLog(adminClient, confirmationId, { type: "refund", sentAt: new Date().toISOString(), to: order.email, success: emailSent });

  const { enabled: refundNotifEnabled, recipients: adminRecipients } = await getAdminNotifRecipients(supabaseUrl, serviceKey, "refund_issued");
  let adminNotifSentCount = 0;
  if (refundNotifEnabled && adminRecipients.length > 0) {
    const adminHtml = buildAdminRefundNotificationHtml({
      confirmationId,
      customerName: patientName,
      customerEmail: order.email,
      formattedAmount,
      reasonLabel,
      note,
      issuedAt,
    });
    const adminResults = await Promise.allSettled(
      adminRecipients.map((recipient) =>
        sendViaResend({
          to: recipient,
          subject: `[PawTenant] Refund Issued — ${confirmationId} — ${formattedAmount}`,
          html: adminHtml,
          tags: [{ name: "confirmation_id", value: confirmationId }, { name: "email_type", value: "refund_admin_notification" }],
        })
      )
    );
    adminNotifSentCount = adminResults.filter((r) => r.status === "fulfilled" && r.value).length;
    console.info(`[notify-customer-refund] Admin refund notifications sent: ${adminNotifSentCount}/${adminRecipients.length} to [${adminRecipients.join(", ")}]`);
  }

  // ── GHL webhook — now includes phone ─────────────────────────────────────
  let ghlOk = false;
  let ghlStatus = 0;
  try {
    const ghlRes = await fetch(`${supabaseUrl}/functions/v1/ghl-webhook-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        webhookType: "main", event: "refund_issued",
        email: order.email,
        firstName: order.first_name ?? "",
        lastName: order.last_name ?? "",
        phone: (order.phone as string) ?? "",
        fullName: patientName,
        confirmationId,
        refundId: refundId ?? "",
        refundAmount,
        refundAmountFormatted: formattedAmount,
        refundReason: reasonLabel,
        refundNote: note ?? "",
        refundIssuedAt: issuedAt,
        orderTotal: order.price ?? 0,
        planType: order.plan_type ?? "",
        patientState: order.state ?? "",
        doctorName: order.doctor_name ?? "",
        leadStatus: `Refund Issued — ${formattedAmount}`,
        tags: ["Refund Issued"],
      }),
    });
    ghlStatus = ghlRes.status;
    ghlOk = ghlRes.ok;
  } catch (err: unknown) {
    console.error(`[REFUND-NOTIFY] GHL proxy failed: ${err instanceof Error ? err.message : "GHL fetch error"}`);
  }

  await adminClient.from("audit_logs").insert({
    actor_id: actorId, actor_name: actorName, actor_role: actorRole,
    object_type: "refund", object_id: confirmationId,
    action: "refund_customer_notified",
    description: `Refund notification sent to ${order.email} for ${formattedAmount} — order ${confirmationId}`,
    new_values: { refundAmount, refundId, reason: reasonLabel, ghlOk, emailSent, adminNotifSentCount, adminRecipients },
    metadata: { confirmationId, note, ghlStatus, isInternal: isInternalCall },
  });

  return json({
    ok: true,
    message: `Refund notification sent to ${order.email} (${formattedAmount})`,
    confirmationId,
    patientEmail: order.email,
    refundAmount,
    ghlOk,
    ghlStatus,
    emailSent,
    adminNotifSentCount,
    adminRecipients: refundNotifEnabled ? adminRecipients : [],
  });
});
