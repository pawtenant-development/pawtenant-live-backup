import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.13";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANY_NAME = "PawTenant";
const COMPANY_DOMAIN = "pawtenant.com";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const ADMIN_NOTIFY_EMAIL = "eservices.dm@gmail.com";
const PORTAL_URL = `https://${COMPANY_DOMAIN}/my-orders`;
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;

function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function baseEmailLayout({ badge, heading, subheading, content }: { badge: string; heading: string; subheading: string; content: string }) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#F3F4F6;font-family:Arial;"><table width="100%" style="padding:24px;"><tr><td align="center"><table width="680" style="background:#fff;border-radius:20px;border:1px solid #E5E7EB;overflow:hidden;"><tr><td style="padding:30px;background:#F7F7F8;text-align:center;border-bottom:1px solid #E5E7EB;"><img src="${LOGO_URL}" width="220" style="margin-bottom:16px;" alt="${COMPANY_NAME}" /><div style="background:#FFF1E8;color:#FF6A00;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:bold;display:inline-block;">${badge}</div><h2 style="margin:16px 0 6px;">${heading}</h2><p style="color:#6B7280;">${subheading}</p></td></tr><tr><td style="padding:30px;">${content}</td></tr><tr><td style="padding:20px;background:#F9FAFB;text-align:center;border-top:1px solid #E5E7EB;"><p style="font-size:13px;color:#6B7280;">${COMPANY_NAME} &bull; Secure ESA Consultation Support</p><p style="font-size:12px;color:#9CA3AF;">${SUPPORT_EMAIL}</p></td></tr></table></td></tr></table></body></html>`;
}

function adminBaseLayout({ badge, badgeColor, heading, subheading, content }: { badge: string; badgeColor: string; heading: string; subheading: string; content: string }) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#F3F4F6;font-family:Arial;"><table width="100%" style="padding:24px;"><tr><td align="center"><table width="680" style="background:#fff;border-radius:20px;border:1px solid #E5E7EB;overflow:hidden;"><tr><td style="padding:24px 30px;background:#1F2937;text-align:center;border-bottom:1px solid #374151;"><img src="${LOGO_URL}" width="180" style="margin-bottom:14px;filter:brightness(1.1);" alt="${COMPANY_NAME}" /><div style="background:${badgeColor};color:#fff;padding:5px 14px;border-radius:999px;font-size:12px;font-weight:bold;display:inline-block;letter-spacing:0.5px;">${badge}</div><h2 style="margin:14px 0 4px;color:#F9FAFB;">${heading}</h2><p style="color:#9CA3AF;margin:0;">${subheading}</p></td></tr><tr><td style="padding:28px 30px;">${content}</td></tr><tr><td style="padding:16px 30px;background:#F9FAFB;text-align:center;border-top:1px solid #E5E7EB;"><p style="font-size:12px;color:#9CA3AF;margin:0;">Admin notification from ${COMPANY_NAME} &bull; <a href="https://${COMPANY_DOMAIN}/admin" style="color:#FF6A00;">Open Admin Panel</a></p></td></tr></table></td></tr></table></body></html>`;
}

function adminRow(label: string, value: string) {
  return `<tr><td style="padding:8px 0;color:#6B7280;font-size:13px;width:140px;vertical-align:top;">${label}</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;">${escapeHtml(value)}</td></tr>`;
}

function adminTable(rows: string) {
  return `<table style="width:100%;border-collapse:collapse;margin-top:6px;">${rows}</table>`;
}

function adminCard(title: string, body: string, borderColor = "#E5E7EB") {
  return `<div style="background:#FAFAFA;border:1px solid ${borderColor};border-left:4px solid ${borderColor};border-radius:10px;padding:18px 20px;margin-bottom:16px;"><p style="color:#FF6A00;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">${title}</p>${body}</div>`;
}

function buildAdminNewOrderEmail(opts: {
  confirmationId: string; firstName: string; lastName: string; email: string;
  phone: string; state: string; planType: string; priceInDollars: number;
  deliverySpeed: string; addonServices?: string[] | null;
}) {
  const ADDON_LABELS: Record<string, string> = {
    zoom_call: "Private Zoom Call",
    physical_mail: "Physical Mail",
    landlord_letter: "Landlord Letter",
  };
  const addonText = opts.addonServices && opts.addonServices.length > 0
    ? opts.addonServices.map((a) => ADDON_LABELS[a] ?? a).join(", ")
    : "None";

  const deliveryLabel = opts.deliverySpeed === "priority" ? "Priority (24h)" : "Standard (2-3 days)";
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

  const content = `
    <p style="color:#374151;margin-bottom:20px;">A new paid order has just been placed. Review details below and ensure the assignment is queued.</p>
    ${adminCard("Order Details", adminTable(
      adminRow("Order ID", opts.confirmationId) +
      adminRow("Amount", `$${opts.priceInDollars.toFixed(2)}`) +
      adminRow("Plan", opts.planType) +
      adminRow("Delivery", deliveryLabel) +
      adminRow("State", opts.state) +
      adminRow("Add-ons", addonText) +
      adminRow("Time", timestamp + " ET")
    ), "#10B981")}
    ${adminCard("Customer Info", adminTable(
      adminRow("Name", `${opts.firstName} ${opts.lastName}`.trim() || "—") +
      adminRow("Email", opts.email || "—") +
      adminRow("Phone", opts.phone || "—")
    ), "#3B82F6")}
    <div style="text-align:center;margin:24px 0;">
      <a href="https://${COMPANY_DOMAIN}/admin" style="background:#FF6A00;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">Open Admin Panel &rarr;</a>
    </div>
  `;
  return adminBaseLayout({
    badge: "NEW PAID ORDER",
    badgeColor: "#10B981",
    heading: `Order ${opts.confirmationId}`,
    subheading: `$${opts.priceInDollars.toFixed(2)} received from ${opts.firstName || opts.email}`,
    content,
  });
}

function buildAdminLeadEmail(opts: {
  firstName: string; lastName: string; email: string; phone: string;
  state: string; plan: string; deliverySpeed: string; petCount: number;
  estimatedTotal: number; letterType: string;
}) {
  const deliveryLabel = opts.deliverySpeed === "priority" ? "Priority (24h)" : "Standard (2-3 days)";
  const planLabel = opts.plan === "subscription" ? "Annual Subscription" : "One-Time Purchase";
  const letterLabel = opts.letterType === "psd" ? "PSD Letter" : "ESA Letter";
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

  const content = `
    <p style="color:#374151;margin-bottom:20px;">A new lead has just started checkout. They have NOT paid yet — this is an unpaid lead.</p>
    ${adminCard("Lead Details", adminTable(
      adminRow("Letter Type", letterLabel) +
      adminRow("Plan", planLabel) +
      adminRow("Delivery", deliveryLabel) +
      adminRow("State", opts.state || "—") +
      adminRow("Pets", String(opts.petCount)) +
      adminRow("Est. Total", `$${(opts.estimatedTotal / 100).toFixed(2)}`) +
      adminRow("Time", timestamp + " ET")
    ), "#F59E0B")}
    ${adminCard("Customer Info", adminTable(
      adminRow("Name", `${opts.firstName} ${opts.lastName}`.trim() || "—") +
      adminRow("Email", opts.email || "—") +
      adminRow("Phone", opts.phone || "—")
    ), "#3B82F6")}
    <p style="font-size:13px;color:#6B7280;text-align:center;margin-top:10px;">If this lead doesn't convert, consider sending a follow-up email.</p>
  `;
  return adminBaseLayout({
    badge: "NEW UNPAID LEAD",
    badgeColor: "#F59E0B",
    heading: "Lead Started Checkout",
    subheading: `${opts.firstName || opts.email} is at the payment step`,
    content,
  });
}

function button(url: string, text: string) {
  return `<div style="text-align:center;margin:25px 0;"><a href="${escapeHtml(url)}" style="background:#FF6A00;color:#fff;padding:14px 26px;border-radius:10px;text-decoration:none;font-weight:bold;">${text}</a></div>`;
}

function card(title: string, body: string) {
  return `<div style="background:#FAFAFA;border:1px solid #E5E7EB;border-radius:14px;padding:20px;margin-top:20px;"><p style="color:#FF6A00;font-size:12px;font-weight:bold;">${title}</p>${body}</div>`;
}

function buildCombinedConfirmationEmail(opts: {
  firstName?: string; confirmationId: string; state?: string; planType?: string;
  deliverySpeed?: string; formattedPrice?: string; receiptUrl?: string;
  couponCode?: string | null; couponDiscount?: number | null;
  addonServices?: string[] | null;
}) {
  const name = escapeHtml(opts.firstName || "Customer");
  const deliveryLabel = opts.deliverySpeed === "priority" ? "Priority — Within 24 Hours" : "Standard — 2-3 Business Days";
  const couponRow = opts.couponCode
    ? `<p><b>Coupon:</b> <span style="background:#FFF1E8;color:#FF6A00;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:bold;">${escapeHtml(opts.couponCode)}</span>${opts.couponDiscount ? ` — <span style="color:#059669;font-weight:bold;">-$${opts.couponDiscount}.00 saved</span>` : ""}</p>`
    : "";

  const ADDON_EMAIL_LABELS: Record<string, string> = {
    zoom_call: "Private Zoom Call Session with Provider",
    physical_mail: "Physical Letter via Certified Mail",
    landlord_letter: "Verification Letter Addressing Landlord",
  };
  const addonRow = opts.addonServices && opts.addonServices.length > 0
    ? `<p><b>Add-on Services:</b></p><ul style="margin:4px 0 0 0;padding-left:18px;">${opts.addonServices.map((a) => `<li style="font-size:13px;color:#374151;">${escapeHtml(ADDON_EMAIL_LABELS[a] ?? a)}</li>`).join("")}</ul>`
    : "";

  const content = `<p>Hi ${name},</p><p>Your order has been <strong>successfully confirmed</strong> and our team is reviewing your case. We'll notify you as soon as your documents are ready.</p>${card("Order Details", `<p><b>Order ID:</b> ${escapeHtml(opts.confirmationId)}</p><p><b>State:</b> ${escapeHtml(opts.state ?? "")}</p><p><b>Delivery:</b> ${escapeHtml(deliveryLabel)}</p><p><b>Plan:</b> ${escapeHtml(opts.planType ?? "")}</p>${couponRow}${addonRow}<p><b>Amount Paid:</b> ${escapeHtml(opts.formattedPrice ?? "")}</p>${opts.receiptUrl ? `<p><a href="${escapeHtml(opts.receiptUrl)}" style="color:#FF6A00;">View Payment Receipt &rarr;</a></p>` : ""}`)}${button(PORTAL_URL, "Track Your Order")}<p style="margin-top:20px;font-size:13px;color:#6B7280;">Keep this email for your records. Your Order ID is your reference number.</p>`;
  return baseEmailLayout({ badge: "Order Confirmed & Payment Received", heading: "Your consultation is confirmed", subheading: `Thank you for choosing ${COMPANY_NAME}`, content });
}

function buildDisputeAlertEmail(opts: { confirmationId: string; disputeId: string; reason: string; amount: number; customerEmail: string }) {
  const content = `<p>A chargeback/dispute has been filed on the following order. Please review immediately and respond within 7 days to protect your revenue.</p>${card("Dispute Details", `<p><b>Order ID:</b> ${escapeHtml(opts.confirmationId)}</p><p><b>Dispute ID:</b> ${escapeHtml(opts.disputeId)}</p><p><b>Reason:</b> ${escapeHtml(opts.reason)}</p><p><b>Disputed Amount:</b> $${(opts.amount / 100).toFixed(2)}</p><p><b>Customer Email:</b> ${escapeHtml(opts.customerEmail)}</p>`)}${button("https://dashboard.stripe.com/disputes", "Respond in Stripe Dashboard")}<p style="color:#DC2626;font-weight:bold;font-size:13px;">Action required within 7 days or the dispute will be automatically decided against you.</p>`;
  return baseEmailLayout({ badge: "Action Required — Chargeback Filed", heading: "A dispute has been opened", subheading: "Review and respond immediately in Stripe", content });
}

function buildRefundConfirmationEmail(opts: { firstName: string; confirmationId: string; refundAmount: number }) {
  const name = escapeHtml(opts.firstName || "Customer");
  const content = `<p>Hi ${name},</p><p>Your refund has been successfully processed. Please allow 5–10 business days for the funds to appear on your statement.</p>${card("Refund Details", `<p><b>Order ID:</b> ${escapeHtml(opts.confirmationId)}</p><p><b>Refund Amount:</b> $${opts.refundAmount.toFixed(2)}</p><p><b>Status:</b> <span style="color:#059669;font-weight:bold;">Refunded</span></p>`)}<p style="margin-top:20px;font-size:13px;color:#6B7280;">If you have any questions, please contact us at ${SUPPORT_EMAIL}.</p>`;
  return baseEmailLayout({ badge: "Refund Processed", heading: "Your refund is on the way", subheading: `From ${COMPANY_NAME}`, content });
}

function buildRenewalFailedEmail(opts: { firstName: string; confirmationId: string; amount: number }) {
  const name = escapeHtml(opts.firstName || "Customer");
  const content = `<p>Hi ${name},</p><p>We were unable to process your annual renewal payment. Your ESA letter coverage may lapse if the payment is not completed.</p>${card("Renewal Details", `<p><b>Order ID:</b> ${escapeHtml(opts.confirmationId)}</p><p><b>Amount Due:</b> $${(opts.amount / 100).toFixed(2)}</p><p><b>Status:</b> <span style="color:#DC2626;font-weight:bold;">Payment Failed</span></p>`)}${button(`https://${COMPANY_DOMAIN}/renew-esa-letter`, "Update Payment Method & Renew")}<p style="margin-top:20px;font-size:13px;color:#6B7280;">If you believe this is an error, contact us at ${SUPPORT_EMAIL}.</p>`;
  return baseEmailLayout({ badge: "Renewal Payment Failed", heading: "Action needed on your account", subheading: `From ${COMPANY_NAME}`, content });
}

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

async function sendViaResend(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (res.ok) { console.log(`[STRIPE-WH] Email sent via Resend to ${opts.to}`); return true; }
    const errText = await res.text();
    console.warn(`[STRIPE-WH] Resend failed ${res.status}: ${errText}`);
    return false;
  } catch (err) {
    console.warn("[STRIPE-WH] Resend error:", String(err));
    return false;
  }
}

async function sendViaSmtp(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const smtpHost = Deno.env.get("SMTP_HOST");
  const smtpPort = parseInt(Deno.env.get("SMTP_PORT") ?? "465");
  const smtpUser = Deno.env.get("SMTP_USER_CUSTOMER");
  const smtpPass = Deno.env.get("SMTP_PASS_CUSTOMER");
  if (!smtpHost || !smtpUser || !smtpPass) return false;
  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost, port: smtpPort, secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass }, pool: true, maxConnections: 1, rateDelta: 2000, rateLimit: 1,
    });
    await transporter.sendMail({ from: `"${COMPANY_NAME}" <${smtpUser}>`, to: opts.to, subject: opts.subject, html: opts.html });
    console.log(`[STRIPE-WH] Email sent via SMTP to ${opts.to}`);
    return true;
  } catch (err) {
    console.error("[STRIPE-WH] SMTP error:", String(err));
    return false;
  }
}

async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const sentViaResend = await sendViaResend(opts);
  if (sentViaResend) return true;
  return sendViaSmtp(opts);
}

/** Fire-and-forget admin notification — never blocks order processing */
function notifyAdminNewOrder(opts: {
  confirmationId: string; firstName: string; lastName: string; email: string;
  phone: string; state: string; planType: string; priceInDollars: number;
  deliverySpeed: string; addonServices?: string[] | null;
}): void {
  const html = buildAdminNewOrderEmail(opts);
  sendEmail({
    to: ADMIN_NOTIFY_EMAIL,
    subject: `New Order — ${opts.confirmationId} ($${opts.priceInDollars.toFixed(2)})`,
    html,
  }).then((ok) => {
    console.log(`[STRIPE-WH] Admin new order notification: ${ok ? "sent" : "failed"}`);
  }).catch((err) => {
    console.warn("[STRIPE-WH] Admin notification error:", String(err));
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

function triggerPdf(confirmationId: string): void {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  fetch(`${supabaseUrl}/functions/v1/generate-esa-letter`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ confirmationId }),
  }).catch((err) => console.error(`[STRIPE-WH] PDF trigger failed: ${err}`));
}

async function sendOrderConfirmationSMS(opts: {
  orderId: string; confirmationId: string; firstName: string; phone: string;
}): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!opts.phone || !opts.orderId) return;
  const name = opts.firstName?.trim() || "there";
  const message = `Hi ${name}, your ESA consultation is confirmed! Order ID: ${opts.confirmationId}. Track your order at pawtenant.com/my-orders\nReply STOP to unsubscribe.`;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/ghl-send-sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ orderId: opts.orderId, confirmationId: opts.confirmationId, toPhone: opts.phone, message, sentBy: "System" }),
    });
    const resBody = await res.text();
    console.log(`[STRIPE-WH] Confirmation SMS -> ${opts.phone}: HTTP ${res.status} ${resBody.slice(0, 200)}`);
  } catch (err) {
    console.warn("[STRIPE-WH] Confirmation SMS send error:", String(err));
  }
}

type EmailLogEntry = { type: string; sentAt: string; to: string; success: boolean };

async function appendEmailLog(supabase: SupabaseClient, confirmationId: string, entries: EmailLogEntry[]): Promise<void> {
  try {
    const { data } = await supabase.from("orders").select("email_log").eq("confirmation_id", confirmationId).maybeSingle();
    const currentLog: EmailLogEntry[] = (data?.email_log as EmailLogEntry[]) ?? [];
    await supabase.from("orders").update({ email_log: [...currentLog, ...entries] }).eq("confirmation_id", confirmationId);
  } catch (err) { console.warn("[STRIPE-WH] email_log update failed:", err); }
}

async function sendCombinedConfirmationEmail(opts: {
  email: string; firstName: string; lastName: string; confirmationId: string;
  planType: string; deliverySpeed: string; state: string; priceInDollars: number;
  receiptUrl: string; couponCode?: string | null; couponDiscount?: number | null;
  addonServices?: string[] | null;
}): Promise<{ confirmSent: boolean; receiptSent: boolean }> {
  const html = buildCombinedConfirmationEmail({
    firstName: opts.firstName, confirmationId: opts.confirmationId, state: opts.state,
    planType: opts.planType, deliverySpeed: opts.deliverySpeed,
    formattedPrice: `$${opts.priceInDollars.toFixed(2)}`, receiptUrl: opts.receiptUrl,
    couponCode: opts.couponCode, couponDiscount: opts.couponDiscount,
    addonServices: opts.addonServices,
  });
  const subject = `Order Confirmed — ${opts.confirmationId}`;
  let attempt = 0;
  while (attempt < 3) {
    const sent = await sendEmail({ to: opts.email, subject, html });
    if (sent) return { confirmSent: true, receiptSent: true };
    attempt++;
    console.error(`[STRIPE-WH] Email attempt ${attempt} failed for ${opts.email}`);
    if (attempt < 3) await sleep(attempt * 2000);
  }
  return { confirmSent: false, receiptSent: false };
}

async function notifyGhlPaymentConfirmed(payload: {
  email: string; firstName: string; lastName: string; phone: string; state: string;
  confirmationId: string; selectedProvider: string; planType: string; orderTotal: number; paymentIntentId: string;
  addonServices?: string[] | null;
}): Promise<{ ok: boolean; status: number; body: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/ghl-webhook-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        webhookType: "assessment", event: "payment_confirmed", email: payload.email,
        firstName: payload.firstName, lastName: payload.lastName, phone: payload.phone,
        state: payload.state, confirmationId: payload.confirmationId,
        selectedProvider: payload.selectedProvider, planType: payload.planType,
        orderTotal: payload.orderTotal, leadStatus: "Paid - Order Completed",
        paymentIntentId: payload.paymentIntentId, confirmedAt: new Date().toISOString(),
        addonServices: payload.addonServices ?? [],
        tags: ["Payment Confirmed", "Order Created", "Processing"],
      }),
    });
    const bodyText = await res.text();
    return { ok: res.ok, status: res.status, body: bodyText };
  } catch (err: unknown) {
    return { ok: false, status: 0, body: err instanceof Error ? err.message : "GHL proxy fetch error" };
  }
}

async function sendDisputeAlertToAdmin(opts: { confirmationId: string; disputeId: string; reason: string; amount: number; customerEmail: string }): Promise<void> {
  const html = buildDisputeAlertEmail(opts);
  await sendEmail({ to: SUPPORT_EMAIL, subject: `URGENT: Chargeback Filed — ${opts.confirmationId}`, html });
}

async function handlePaymentSuccess(
  stripe: Stripe,
  supabase: SupabaseClient,
  paymentIntentId: string,
  source: string,
  sessionMeta: Record<string, string> = {},
): Promise<Response> {
  console.log(`[STRIPE-WH] handlePaymentSuccess triggered by: ${source}, pi: ${paymentIntentId}`);

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  const piMeta = pi.metadata ?? {};
  const meta: Record<string, string> = { ...sessionMeta, ...piMeta };

  const confirmationId = meta.confirmationId || `PT-WHK-${pi.id.slice(-8).toUpperCase()}`;
  const email = meta.email || pi.receipt_email || "";
  const firstName = meta.firstName || "";
  const lastName = meta.lastName || "";
  const phone = meta.phone || "";
  const state = meta.state || "";
  const selectedProvider = meta.selectedProvider || "";
  const planType = meta.planType === "subscription" ? "Subscription (Annual)" : "One-Time Purchase";
  const deliverySpeed = meta.deliverySpeed || "";
  const priceInDollars = Math.round((pi.amount ?? 0) / 100);
  const couponCode = meta.couponCode || null;
  const couponDiscount = meta.couponDiscount ? parseInt(meta.couponDiscount) : null;

  let addonServices: string[] | null = null;
  if (meta.addonServices) {
    try {
      const parsed = JSON.parse(meta.addonServices);
      addonServices = Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch { /* ignore malformed JSON */ }
  }

  let receiptUrl = "";
  if (pi.latest_charge) {
    try {
      const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge as Stripe.Charge).id;
      const charge = await stripe.charges.retrieve(chargeId);
      receiptUrl = charge.receipt_url ?? "";
    } catch (err) { console.warn(`[STRIPE-WH] Could not fetch receipt URL: ${err}`); }
  }

  const { data: existing, error: lookupError } = await supabase
    .from("orders")
    .select("id, confirmation_id, letter_url, ghl_synced_at, email_log, payment_intent_id, status, first_name, last_name, phone, price, sms_confirmation_sent, email_confirmation_sent, addon_services")
    .or(`payment_intent_id.eq.${pi.id},confirmation_id.eq.${confirmationId}`)
    .maybeSingle();

  if (lookupError) return json({ received: true, warning: lookupError.message });

  if (existing) {
    if (existing.email_confirmation_sent) {
      console.log(`[STRIPE-WH][${source}] Order ${existing.confirmation_id} already fully processed — skipping duplicate event`);
      return json({ received: true, action: "duplicate_skipped", source, confirmationId: existing.confirmation_id });
    }

    if (!existing.payment_intent_id) {
      console.log(`[STRIPE-WH][${source}] Writing payment_intent_id to order ${existing.confirmation_id}`);
      await supabase.from("orders").update({
        payment_intent_id: pi.id,
        price: priceInDollars || (existing.price as number),
        status: (existing.status === "lead" || !existing.status) ? "processing" : (existing.status as string),
        first_name: firstName || (existing.first_name as string | null),
        last_name: lastName || (existing.last_name as string | null),
        phone: phone || (existing.phone as string | null),
        coupon_code: couponCode,
        coupon_discount: couponDiscount,
        addon_services: (existing.addon_services as string[] | null) ?? addonServices,
        webhook_source: source,
      }).eq("id", existing.id as string);
    } else {
      console.log(`[STRIPE-WH][${source}] Order ${existing.confirmation_id} already has payment_intent_id — checking if still needs processing`);
      const patch: Record<string, unknown> = { coupon_code: couponCode, coupon_discount: couponDiscount };
      if (phone && !existing.phone) patch.phone = phone;
      if (!existing.addon_services && addonServices) patch.addon_services = addonServices;
      await supabase.from("orders").update(patch).eq("id", existing.id as string);
    }

    if (!existing.letter_url) triggerPdf(existing.confirmation_id as string);

    const resolvedPhone = phone || (existing.phone as string | null) || "";
    const resolvedFirstName = firstName || (existing.first_name as string) || "";

    const { error: flagError } = await supabase
      .from("orders")
      .update({ email_confirmation_sent: true })
      .eq("id", existing.id as string)
      .eq("email_confirmation_sent", false);

    const flagSet = !flagError;

    if (!existing.ghl_synced_at) {
      const ghlResult = await notifyGhlPaymentConfirmed({
        email, firstName: resolvedFirstName, lastName: lastName || (existing.last_name as string) || "",
        phone: resolvedPhone, state, confirmationId: existing.confirmation_id as string,
        selectedProvider, planType, orderTotal: priceInDollars, paymentIntentId: pi.id,
        addonServices,
      });
      await supabase.from("orders").update({
        ghl_synced_at: ghlResult.ok ? new Date().toISOString() : null,
        ghl_sync_error: ghlResult.ok ? null : `HTTP ${ghlResult.status}: ${ghlResult.body.slice(0, 500)}`,
      }).eq("id", existing.id as string);

      if (resolvedPhone && !existing.sms_confirmation_sent) {
        await supabase.from("orders").update({ sms_confirmation_sent: true }).eq("id", existing.id as string);
        sendOrderConfirmationSMS({
          orderId: existing.id as string,
          confirmationId: existing.confirmation_id as string,
          firstName: resolvedFirstName,
          phone: resolvedPhone,
        }).catch(() => {});
      }
    }

    const resolvedAddonServices = addonServices ?? (existing.addon_services as string[] | null);
    if (email && flagSet) {
      try {
        const { confirmSent, receiptSent } = await sendCombinedConfirmationEmail({
          email,
          firstName: resolvedFirstName,
          lastName: lastName || (existing.last_name as string) || "",
          confirmationId: existing.confirmation_id as string,
          planType,
          deliverySpeed,
          state,
          priceInDollars,
          receiptUrl,
          couponCode,
          couponDiscount,
          addonServices: resolvedAddonServices,
        });
        const sentAt = new Date().toISOString();
        await appendEmailLog(supabase, existing.confirmation_id as string, [
          { type: "order_confirmation", sentAt, to: email, success: confirmSent },
          { type: "payment_receipt", sentAt, to: email, success: receiptSent },
        ]);
        console.log(`[STRIPE-WH] Confirmation email for ${existing.confirmation_id}: confirmSent=${confirmSent}`);

        // ── Admin notification (fire and forget) ──────────────────────────
        notifyAdminNewOrder({
          confirmationId: existing.confirmation_id as string,
          firstName: resolvedFirstName,
          lastName: lastName || (existing.last_name as string) || "",
          email,
          phone: resolvedPhone,
          state,
          planType,
          priceInDollars,
          deliverySpeed,
          addonServices: resolvedAddonServices,
        });
      } catch (err) {
        console.error("[STRIPE-WH] Email send error (existing order):", err);
      }
    } else if (email && !flagSet) {
      console.log(`[STRIPE-WH][${source}] Lost atomic flag race for ${existing.confirmation_id} — email already being sent by another event`);
    }

    return json({ received: true, action: "existing_order_synced", source, confirmationId: existing.confirmation_id });
  }

  // ── Brand new order ───────────────────────────────────────────────────────
  const { error: insertError } = await supabase.from("orders").insert({
    user_id: null, confirmation_id: confirmationId, email, first_name: firstName,
    last_name: lastName, phone: phone || null, state, selected_provider: selectedProvider,
    plan_type: planType, delivery_speed: deliverySpeed, price: priceInDollars,
    payment_intent_id: pi.id, assessment_answers: null, letter_url: null,
    status: "processing", coupon_code: couponCode, coupon_discount: couponDiscount,
    addon_services: addonServices,
    email_log: [], webhook_source: source, sms_confirmation_sent: false,
    email_confirmation_sent: false,
  });
  if (insertError) return json({ error: insertError.message }, 500);

  triggerPdf(confirmationId);

  const { data: newOrderRow } = await supabase
    .from("orders").select("id").eq("confirmation_id", confirmationId).maybeSingle();

  if (newOrderRow?.id) {
    await supabase.from("orders").update({ email_confirmation_sent: true }).eq("id", newOrderRow.id as string);
  }

  if (email) {
    try {
      const { confirmSent, receiptSent } = await sendCombinedConfirmationEmail({
        email, firstName, lastName, confirmationId, planType, deliverySpeed,
        state, priceInDollars, receiptUrl, couponCode, couponDiscount, addonServices,
      });
      const sentAt = new Date().toISOString();
      await appendEmailLog(supabase, confirmationId, [
        { type: "order_confirmation", sentAt, to: email, success: confirmSent },
        { type: "payment_receipt", sentAt, to: email, success: receiptSent },
      ]);
      console.log(`[STRIPE-WH] Confirmation email for new order ${confirmationId}: confirmSent=${confirmSent}`);

      // ── Admin notification (fire and forget) ────────────────────────────
      notifyAdminNewOrder({
        confirmationId,
        firstName,
        lastName,
        email,
        phone,
        state,
        planType,
        priceInDollars,
        deliverySpeed,
        addonServices,
      });
    } catch (err) {
      console.error("[STRIPE-WH] Customer email send error (new order):", err);
    }
  }

  const ghlResult = await notifyGhlPaymentConfirmed({
    email, firstName, lastName, phone, state, confirmationId, selectedProvider,
    planType, orderTotal: priceInDollars, paymentIntentId: pi.id, addonServices,
  });
  await supabase.from("orders").update({
    ghl_synced_at: ghlResult.ok ? new Date().toISOString() : null,
    ghl_sync_error: ghlResult.ok ? null : `HTTP ${ghlResult.status}: ${ghlResult.body.slice(0, 500)}`,
  }).eq("confirmation_id", confirmationId);

  if (phone && newOrderRow?.id) {
    await supabase.from("orders").update({ sms_confirmation_sent: true }).eq("confirmation_id", confirmationId).catch(() => {});
    sendOrderConfirmationSMS({ orderId: newOrderRow.id as string, confirmationId, firstName, phone }).catch(() => {});
  }

  return json({ received: true, action: "order_created", source, confirmationId, paymentIntentId: pi.id, ghlSynced: ghlResult.ok });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!webhookSecret) return json({ error: "STRIPE_WEBHOOK_SECRET not configured" }, 500);
  if (!stripeKey) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);
  } catch (err: unknown) {
    return json({ error: `Webhook signature failed: ${err instanceof Error ? err.message : "unknown"}` }, 400);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  console.log(`[STRIPE-WH] Event received: ${event.type}`);

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    return handlePaymentSuccess(stripe, supabase, pi.id, "payment_intent.succeeded");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid" && session.payment_intent) {
      const piId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent as Stripe.PaymentIntent).id;
      const sessionMeta = (session.metadata ?? {}) as Record<string, string>;
      return handlePaymentSuccess(stripe, supabase, piId, "checkout.session.completed", sessionMeta);
    }
    return json({ received: true, skipped: "checkout.session.completed — payment_status not paid" });
  }

  if (event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_intent) {
      const piId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent as Stripe.PaymentIntent).id;
      const sessionMeta = (session.metadata ?? {}) as Record<string, string>;
      console.log(`[STRIPE-WH] Klarna async payment succeeded — session: ${session.id}, pi: ${piId}`);
      return handlePaymentSuccess(stripe, supabase, piId, "checkout.session.async_payment_succeeded", sessionMeta);
    }
    return json({ received: true, skipped: "async_payment_succeeded — no payment_intent on session" });
  }

  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const sessionMeta = (session.metadata ?? {}) as Record<string, string>;
    const confirmationId = sessionMeta.confirmationId;
    console.warn(`[STRIPE-WH] Async payment failed — session: ${session.id}, confirmationId: ${confirmationId ?? "unknown"}`);
    if (confirmationId) {
      await supabase.from("orders").update({
        payment_failed_at: new Date().toISOString(),
        payment_failure_reason: "async_payment_failed: Klarna or deferred payment declined",
      }).eq("confirmation_id", confirmationId);
    }
    return json({ received: true, action: "async_payment_failure_logged", confirmationId: confirmationId ?? null });
  }

  if (event.type === "charge.succeeded") {
    const charge = event.data.object as Stripe.Charge;
    console.log(`[STRIPE-WH] charge.succeeded received for charge ${charge.id} — intentionally skipped to prevent duplicate processing`);
    return json({ received: true, skipped: "charge.succeeded — handled via payment_intent.succeeded to prevent duplicates" });
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const meta = pi.metadata ?? {};
    const confirmationId = meta.confirmationId;
    const failureMessage = pi.last_payment_error?.message ?? "Unknown payment failure";
    const failureCode = pi.last_payment_error?.code ?? "unknown";
    console.log(`[STRIPE-WH] Payment failed for PI ${pi.id}: ${failureCode} — ${failureMessage}`);
    if (confirmationId) {
      await supabase.from("orders").update({
        payment_failed_at: new Date().toISOString(),
        payment_failure_reason: `${failureCode}: ${failureMessage}`,
      }).eq("confirmation_id", confirmationId);
    }
    return json({ received: true, action: "payment_failure_logged", paymentIntentId: pi.id, confirmationId: confirmationId ?? null, failureCode });
  }

  if (event.type === "payment_intent.canceled") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const meta = pi.metadata ?? {};
    const confirmationId = meta.confirmationId;
    console.log(`[STRIPE-WH] Payment intent canceled: ${pi.id}`);
    if (confirmationId) {
      await supabase.from("orders").update({
        payment_failed_at: new Date().toISOString(),
        payment_failure_reason: `canceled: ${pi.cancellation_reason ?? "unknown reason"}`,
      }).eq("confirmation_id", confirmationId);
    }
    return json({ received: true, action: "payment_canceled_logged", paymentIntentId: pi.id });
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const piId = typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent as Stripe.PaymentIntent | null)?.id ?? "";
    const refundAmount = charge.amount_refunded;
    const refundDollars = refundAmount / 100;

    console.log(`[STRIPE-WH] Refund received — charge: ${charge.id}, PI: ${piId}, amount: $${refundDollars}`);

    let order: { id: string; confirmation_id: string; email: string | null; first_name: string | null; status: string | null } | null = null;

    if (piId) {
      const { data } = await supabase
        .from("orders")
        .select("id, confirmation_id, email, first_name, status")
        .eq("payment_intent_id", piId)
        .maybeSingle();
      order = data as typeof order;
    }

    if (!order) {
      const chargeMeta = (charge.metadata ?? {}) as Record<string, string>;
      const cid = chargeMeta.confirmationId;
      if (cid) {
        const { data } = await supabase
          .from("orders")
          .select("id, confirmation_id, email, first_name, status")
          .eq("confirmation_id", cid)
          .maybeSingle();
        order = data as typeof order;
      }
    }

    if (order) {
      const { error: refundUpdateErr } = await supabase.from("orders").update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        refund_amount: Math.round(refundDollars),
      }).eq("id", order.id);

      if (refundUpdateErr) {
        console.error(`[STRIPE-WH] Failed to update refund status for ${order.confirmation_id}:`, refundUpdateErr.message);
      } else {
        console.log(`[STRIPE-WH] Order ${order.confirmation_id} marked as refunded ($${refundDollars})`);
      }

      if (order.email) {
        const html = buildRefundConfirmationEmail({
          firstName: order.first_name || "Customer",
          confirmationId: order.confirmation_id,
          refundAmount: refundDollars,
        });
        const emailSent = await sendEmail({
          to: order.email,
          subject: `Refund Processed — ${order.confirmation_id}`,
          html,
        });
        await appendEmailLog(supabase, order.confirmation_id, [
          { type: "refund_confirmation", sentAt: new Date().toISOString(), to: order.email, success: emailSent },
        ]);
      }

      return json({ received: true, action: "order_refunded", confirmationId: order.confirmation_id, refundAmount: refundDollars });
    }

    console.warn(`[STRIPE-WH] charge.refunded — no order found for PI: ${piId}`);
    return json({ received: true, action: "refund_received_no_order_found", paymentIntentId: piId });
  }

  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = typeof dispute.charge === "string" ? dispute.charge : (dispute.charge as Stripe.Charge).id;

    console.warn(`[STRIPE-WH] DISPUTE CREATED — dispute: ${dispute.id}, charge: ${chargeId}, reason: ${dispute.reason}`);

    let piId = "";
    try {
      const charge = await stripe.charges.retrieve(chargeId);
      piId = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent as Stripe.PaymentIntent | null)?.id ?? "";
    } catch (err) { console.warn("[STRIPE-WH] Could not retrieve charge for dispute:", err); }

    const { data: order } = await supabase
      .from("orders")
      .select("id, confirmation_id, email, first_name")
      .eq("payment_intent_id", piId)
      .maybeSingle();

    if (order) {
      await supabase.from("orders").update({
        dispute_id: dispute.id,
        dispute_status: dispute.status,
        dispute_reason: dispute.reason,
        dispute_created_at: new Date().toISOString(),
        status: "disputed",
      }).eq("id", order.id as string);
    }

    await sendDisputeAlertToAdmin({
      confirmationId: (order?.confirmation_id as string) ?? `PI: ${piId}`,
      disputeId: dispute.id,
      reason: dispute.reason,
      amount: dispute.amount,
      customerEmail: (order?.email as string) ?? "unknown",
    });

    return json({ received: true, action: "dispute_logged_admin_alerted", disputeId: dispute.id, confirmationId: order?.confirmation_id ?? null });
  }

  if (event.type === "charge.dispute.closed") {
    const dispute = event.data.object as Stripe.Dispute;
    console.log(`[STRIPE-WH] Dispute closed — ${dispute.id}, status: ${dispute.status}`);

    const { data: order } = await supabase
      .from("orders")
      .select("id, confirmation_id, status")
      .eq("dispute_id", dispute.id)
      .maybeSingle();

    if (order) {
      const newStatus = dispute.status === "won" ? "processing" : "refunded";
      await supabase.from("orders").update({
        dispute_status: dispute.status,
        status: newStatus,
      }).eq("id", order.id as string);
      console.log(`[STRIPE-WH] Dispute ${dispute.id} closed (${dispute.status}) — order ${order.confirmation_id} status -> ${newStatus}`);
    }

    const outcomeLabel = dispute.status === "won" ? "WON - Funds returned" : "LOST - Funds taken";
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `Dispute ${dispute.status === "won" ? "WON" : "LOST"} — ${order?.confirmation_id ?? dispute.id}`,
      html: baseEmailLayout({
        badge: dispute.status === "won" ? "Dispute Won" : "Dispute Lost",
        heading: `Chargeback dispute ${outcomeLabel}`,
        subheading: `Dispute ID: ${dispute.id}`,
        content: `<p>The dispute for order <b>${order?.confirmation_id ?? "unknown"}</b> has been resolved.</p><p><b>Outcome:</b> ${outcomeLabel}</p>${button("https://dashboard.stripe.com/disputes", "View in Stripe")}`,
      }),
    });

    return json({ received: true, action: "dispute_closed", disputeId: dispute.id, status: dispute.status });
  }

  if (event.type === "radar.early_fraud_warning.created") {
    const warning = event.data.object as Stripe.Radar.EarlyFraudWarning;
    const chargeId = typeof warning.charge === "string" ? warning.charge : (warning.charge as Stripe.Charge).id;
    console.warn(`[STRIPE-WH] FRAUD WARNING — charge: ${chargeId}, fraud type: ${warning.fraud_type}`);

    let piId = "";
    try {
      const charge = await stripe.charges.retrieve(chargeId);
      piId = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent as Stripe.PaymentIntent | null)?.id ?? "";
    } catch (err) { console.warn("[STRIPE-WH] Could not retrieve charge for fraud warning:", err); }

    const { data: order } = await supabase
      .from("orders")
      .select("id, confirmation_id, email")
      .eq("payment_intent_id", piId)
      .maybeSingle();

    if (order) {
      await supabase.from("orders").update({
        fraud_warning: true,
        fraud_warning_at: new Date().toISOString(),
      }).eq("id", order.id as string);
    }

    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `Fraud Warning — ${order?.confirmation_id ?? chargeId}`,
      html: baseEmailLayout({
        badge: "Fraud Alert",
        heading: "Early fraud warning received",
        subheading: "Stripe Radar detected a potential issue",
        content: `<p>Stripe has issued an early fraud warning for order <b>${order?.confirmation_id ?? "unknown"}</b>.</p><p><b>Fraud Type:</b> ${escapeHtml(warning.fraud_type)}</p><p><b>Charge ID:</b> ${escapeHtml(chargeId)}</p><p>Consider reviewing the order and contacting the customer proactively.</p>${button("https://dashboard.stripe.com/radar", "View in Stripe Radar")}`,
      }),
    });

    return json({ received: true, action: "fraud_warning_logged", chargeId, confirmationId: order?.confirmation_id ?? null });
  }

  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const subMeta = sub.metadata ?? {};
    const confirmationId = subMeta.confirmationId;
    console.log(`[STRIPE-WH] Subscription updated: ${sub.id}, status: ${sub.status}`);
    if (confirmationId) {
      await supabase.from("orders").update({
        subscription_id: sub.id,
        subscription_status: sub.status,
      }).eq("confirmation_id", confirmationId);
    }
    return json({ received: true, action: "subscription_updated", subscriptionId: sub.id, status: sub.status });
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const subMeta = sub.metadata ?? {};
    const confirmationId = subMeta.confirmationId;
    console.log(`[STRIPE-WH] Subscription canceled: ${sub.id}`);
    if (confirmationId) {
      await supabase.from("orders").update({ subscription_status: "canceled" }).eq("confirmation_id", confirmationId);
    }
    return json({ received: true, action: "subscription_canceled", subscriptionId: sub.id });
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const subId = typeof invoice.subscription === "string" ? invoice.subscription : (invoice.subscription as Stripe.Subscription | null)?.id ?? "";
    const billing_reason = (invoice as { billing_reason?: string }).billing_reason;
    if (billing_reason === "subscription_cycle" && subId) {
      console.log(`[STRIPE-WH] Renewal payment succeeded — invoice: ${invoice.id}, sub: ${subId}`);
      const { data: order } = await supabase
        .from("orders")
        .select("id, confirmation_id, email, first_name")
        .eq("subscription_id", subId)
        .maybeSingle();
      if (order) {
        await supabase.from("orders").update({ subscription_status: "active" }).eq("id", order.id as string);
        console.log(`[STRIPE-WH] Annual renewal confirmed for order ${order.confirmation_id}`);
      }
    }
    return json({ received: true, action: "invoice_payment_succeeded", invoiceId: invoice.id });
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const subId = typeof invoice.subscription === "string" ? invoice.subscription : (invoice.subscription as Stripe.Subscription | null)?.id ?? "";
    const customerEmail = typeof invoice.customer_email === "string" ? invoice.customer_email : "";
    console.warn(`[STRIPE-WH] Invoice payment FAILED — invoice: ${invoice.id}, sub: ${subId}, customer: ${customerEmail}`);
    const { data: order } = await supabase
      .from("orders")
      .select("id, confirmation_id, email, first_name")
      .eq("subscription_id", subId)
      .maybeSingle();
    if (order) {
      await supabase.from("orders").update({ subscription_status: "past_due" }).eq("id", order.id as string);
      if (order.email) {
        const html = buildRenewalFailedEmail({
          firstName: (order.first_name as string) || "Customer",
          confirmationId: order.confirmation_id as string,
          amount: invoice.amount_due ?? 0,
        });
        await sendEmail({
          to: order.email as string,
          subject: `Action Required: Annual Renewal Payment Failed — ${order.confirmation_id}`,
          html,
        });
      }
    }
    return json({ received: true, action: "invoice_payment_failed", invoiceId: invoice.id, subscriptionId: subId });
  }

  return json({ received: true, skipped: event.type });
});
