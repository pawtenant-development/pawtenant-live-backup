import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FALLBACK_INTERNAL_EMAIL = "eservices.dm@gmail.com";
const COMPANY_NAME = "PawTenant";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const COMPANY_DOMAIN = "pawtenant.com";
const PORTAL_URL = `https://${COMPANY_DOMAIN}/my-orders`;
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

type EmailLogEntry = { type: string; sentAt: string; to: string; success: boolean; error?: string };

// ── Resolve admin notification recipients via the helper function ─────────────
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
    console.info(`[stripe-webhook] notif recipients for "${notificationKey}": ${data.recipients.join(", ")} (source: ${data.source})`);
    return { enabled: data.enabled, recipients: data.recipients };
  } catch (err) {
    console.warn(`[stripe-webhook] getAdminNotifRecipients failed for "${notificationKey}":`, err instanceof Error ? err.message : String(err));
    return { enabled: true, recipients: [FALLBACK_INTERNAL_EMAIL] };
  }
}

async function sendViaResend(opts: { to: string; subject: string; html: string; tags?: Array<{ name: string; value: string }>; }): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [opts.to], subject: opts.subject, html: opts.html, ...(opts.tags ? { tags: opts.tags } : {}) }),
    });
    if (!res.ok) { const errBody = await res.text(); return { sent: false, error: `Resend ${res.status}: ${errBody}` }; }
    return { sent: true };
  } catch (err) { return { sent: false, error: err instanceof Error ? err.message : String(err) }; }
}

// Send to multiple recipients — returns true if at least one succeeded
async function sendViaResendMulti(opts: { to: string[]; subject: string; html: string; tags?: Array<{ name: string; value: string }>; }): Promise<{ sent: boolean; sentCount: number; error?: string }> {
  if (opts.to.length === 0) return { sent: false, sentCount: 0, error: "No recipients" };
  const results = await Promise.allSettled(
    opts.to.map((recipient) => sendViaResend({ ...opts, to: recipient }))
  );
  const sentCount = results.filter((r) => r.status === "fulfilled" && r.value.sent).length;
  return { sent: sentCount > 0, sentCount };
}

function buildPaymentReceiptHtml(opts: { firstName: string; confirmationId: string; amountFormatted: string; paymentIntentId: string; paymentMethod: string; receiptUrl: string; paidAt: string; }): string {
  const methodLabel: Record<string, string> = { card: "Credit / Debit Card", klarna: "Klarna (Pay in 4)", qr: "QR Code / Mobile Pay", subscription: "Subscription (Annual)" };
  const method = methodLabel[opts.paymentMethod] ?? opts.paymentMethod ?? "Card";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:560px;width:100%;"><tr><td style="background:#0f172a;padding:28px 32px;text-align:center;"><img src="${LOGO_URL}" width="140" alt="${COMPANY_NAME}" style="display:block;margin:0 auto 12px;height:auto;" /><div style="display:inline-block;background:rgba(255,255,255,0.12);color:#94a3b8;padding:4px 14px;border-radius:99px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:12px;">PAYMENT RECEIPT</div><p style="margin:0;font-size:40px;font-weight:900;color:#ffffff;letter-spacing:-0.02em;">${opts.amountFormatted}</p><p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Payment received &mdash; ${opts.paidAt}</p></td></tr><tr><td style="padding:28px 32px;"><p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">Hi <strong>${opts.firstName || "there"}</strong>, thank you! Your payment has been processed successfully and your ESA consultation is now active.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;"><tr><td style="padding:20px 24px;"><p style="margin:0 0 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Transaction Details</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:7px 0;font-size:13px;color:#6b7280;width:150px;vertical-align:top;border-bottom:1px solid #f1f5f9;">Amount Charged</td><td style="padding:7px 0;font-size:14px;font-weight:800;color:#0f172a;border-bottom:1px solid #f1f5f9;">${opts.amountFormatted}</td></tr><tr><td style="padding:7px 0;font-size:13px;color:#6b7280;vertical-align:top;border-bottom:1px solid #f1f5f9;">Order ID</td><td style="padding:7px 0;font-size:13px;font-weight:600;color:#1e293b;font-family:monospace;border-bottom:1px solid #f1f5f9;">${opts.confirmationId}</td></tr><tr><td style="padding:7px 0;font-size:13px;color:#6b7280;vertical-align:top;border-bottom:1px solid #f1f5f9;">Payment Method</td><td style="padding:7px 0;font-size:13px;font-weight:600;color:#1e293b;border-bottom:1px solid #f1f5f9;">${method}</td></tr><tr><td style="padding:7px 0;font-size:13px;color:#6b7280;vertical-align:top;border-bottom:1px solid #f1f5f9;">Transaction ID</td><td style="padding:7px 0;font-size:11px;font-weight:500;color:#6b7280;font-family:monospace;border-bottom:1px solid #f1f5f9;">${opts.paymentIntentId}</td></tr><tr><td style="padding:7px 0;font-size:13px;color:#6b7280;vertical-align:top;">Status</td><td style="padding:7px 0;"><span style="display:inline-flex;align-items:center;gap:4px;background:#dcfce7;color:#15803d;font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px;">&#10003; Paid</span></td></tr></table></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr><td style="padding-right:8px;width:50%;"><a href="${PORTAL_URL}" style="display:block;text-align:center;background:#1a5c4f;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;padding:12px 16px;border-radius:8px;">Track My Order &rarr;</a></td><td style="padding-left:8px;width:50%;">${opts.receiptUrl ? `<a href="${opts.receiptUrl}" style="display:block;text-align:center;background:#f8fafc;color:#374151;font-size:13px;font-weight:700;text-decoration:none;padding:12px 16px;border-radius:8px;border:1px solid #e2e8f0;">Stripe Receipt &rarr;</a>` : `<span style="display:block;text-align:center;background:#f8fafc;color:#94a3b8;font-size:13px;padding:12px 16px;border-radius:8px;border:1px solid #e2e8f0;">Receipt Loading</span>`}</td></tr></table><p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;text-align:center;">Keep this email as your payment record. If you have questions, reply here or email <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a5c4f;text-decoration:none;">${SUPPORT_EMAIL}</a></p></td></tr><tr><td style="padding:16px 32px;text-align:center;border-top:1px solid #f1f5f9;background:#f8fafc;"><p style="margin:0;font-size:11px;color:#9ca3af;">${COMPANY_NAME} &nbsp;&middot;&nbsp; ESA Consultation &nbsp;&middot;&nbsp; <a href="https://${COMPANY_DOMAIN}" style="color:#1a5c4f;text-decoration:none;">${COMPANY_DOMAIN}</a></p></td></tr></table></td></tr></table></body></html>`;
}

function buildInternalNotificationHtml(opts: { confirmationId: string; firstName: string; lastName: string; email: string; phone: string; state: string; letterType: string; planType: string; deliverySpeed: string; amount: number; paymentIntentId: string; checkoutSessionId?: string; paymentMethod: string; doctorName: string | null; timestamp: string; matchedBy?: string; }): string {
  const rows = [["Order ID", opts.confirmationId], ["Customer Name", `${opts.firstName} ${opts.lastName}`.trim() || "—"], ["Email", opts.email], ["Phone", opts.phone || "—"], ["State", opts.state || "—"], ["Service Type", opts.letterType === "psd" ? "PSD Letter" : "ESA Letter"], ["Plan", opts.planType || "One-Time Purchase"], ["Delivery Speed", opts.deliverySpeed === "2-3days" ? "Standard (2-3 days)" : "Priority (24h)"], ["Amount Paid", `$${opts.amount.toFixed(2)}`], ["Payment Status", "PAID"], ["Payment Method", opts.paymentMethod || "card"], ["Stripe PI ID", opts.paymentIntentId], ...(opts.checkoutSessionId ? [["Checkout Session ID", opts.checkoutSessionId]] : []), ["Provider", opts.doctorName || "Not assigned yet"], ["Matched By", opts.matchedBy || "confirmation_id"], ["Timestamp", opts.timestamp]];
  const rowsHtml = rows.map(([label, value]) => `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;width:180px;border-bottom:1px solid #f3f4f6;vertical-align:top;font-weight:600;">${label}</td><td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500;">${value}</td></tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;"><tr><td style="background:#1a5c4f;padding:28px 32px;text-align:center;"><img src="${LOGO_URL}" width="160" alt="PawTenant" style="display:block;margin:0 auto 14px;height:auto;" /><div style="display:inline-block;background:rgba(255,255,255,0.2);color:#ffffff;padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">NEW PAID ORDER</div><h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">Order Received &amp; Paid</h1></td></tr><tr><td style="padding:28px 32px;"><p style="margin:0 0 20px;font-size:14px;color:#374151;">A new paid order has been received. Review and assign a provider from the admin portal.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:24px;">${rowsHtml}</table><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><a href="https://pawtenant.com/admin-orders" style="display:inline-block;background:#f97316;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:8px;">Open Admin Portal &rarr;</a></td></tr></table></td></tr><tr><td style="padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant Internal Notification &mdash; <a href="https://pawtenant.com" style="color:#1a5c4f;text-decoration:none;">pawtenant.com</a></p></td></tr></table></td></tr></table></body></html>`;
}

// ── Fire GHL payment_confirmed event ─────────────────────────────────────────
async function triggerGhlPaymentConfirmed(order: Record<string, unknown>, amountDollars: number): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const confirmationId = order.confirmation_id as string;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/ghl-webhook-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        webhookType: "main",
        eventType: "payment_confirmed",
        firstName: (order.first_name as string) ?? "",
        lastName: (order.last_name as string) ?? "",
        email: (order.email as string) ?? "",
        phone: (order.phone as string) ?? "",
        state: (order.state as string) ?? "",
        confirmationId,
        amount: amountDollars,
        letterType: (order.letter_type as string) ?? "esa",
      }),
    });
    console.info(`[stripe-webhook] >>> triggerGhlPaymentConfirmed DONE for ${confirmationId} — HTTP ${res.status}`);
  } catch (err) {
    console.warn(`[stripe-webhook] >>> triggerGhlPaymentConfirmed FAILED for ${confirmationId}:`, err instanceof Error ? err.message : String(err));
  }
}

// ── Fire Google Ads conversion upload ─────────────────────────────────────────
function triggerGoogleAdsSync(confirmationId: string): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return fetch(`${supabaseUrl}/functions/v1/sync-google-ads-conversions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
    body: JSON.stringify({ mode: "single", confirmationId }),
  })
    .then((res) => { console.info(`[stripe-webhook] >>> triggerGoogleAdsSync DONE for ${confirmationId} — HTTP ${res.status}`); })
    .catch((err) => { console.warn(`[stripe-webhook] >>> triggerGoogleAdsSync FAILED for ${confirmationId}:`, err instanceof Error ? err.message : String(err)); });
}

// ── Fire Meta CAPI Purchase event ─────────────────────────────────────────────
function triggerMetaCAPIEvent(confirmationId: string): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return fetch(`${supabaseUrl}/functions/v1/send-meta-capi-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
    body: JSON.stringify({ mode: "single", confirmationId }),
  })
    .then((res) => { console.info(`[stripe-webhook] >>> triggerMetaCAPIEvent DONE for ${confirmationId} — HTTP ${res.status}`); })
    .catch((err) => { console.warn(`[stripe-webhook] >>> triggerMetaCAPIEvent FAILED for ${confirmationId}:`, err instanceof Error ? err.message : String(err)); });
}

function schedulePostPaymentTriggers(confirmationId: string, order?: Record<string, unknown>, amountDollars?: number): void {
  // @ts-ignore — EdgeRuntime is injected by Supabase edge runtime
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    // @ts-ignore
    EdgeRuntime.waitUntil(
      (async () => {
        await triggerGoogleAdsSync(confirmationId);
        await triggerMetaCAPIEvent(confirmationId);
        if (order && typeof amountDollars === "number") {
          await triggerGhlPaymentConfirmed(order, amountDollars);
        }
      })()
    );
  } else {
    triggerGoogleAdsSync(confirmationId).catch(() => {});
    triggerMetaCAPIEvent(confirmationId).catch(() => {});
    if (order && typeof amountDollars === "number") {
      triggerGhlPaymentConfirmed(order, amountDollars).catch(() => {});
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey) { console.error("[stripe-webhook] STRIPE_SECRET_KEY not set"); return json({ error: "Not configured" }, 500); }

  // @ts-ignore
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  if (webhookSecret && sigHeader) {
    try { event = await stripe.webhooks.constructEventAsync(rawBody, sigHeader, webhookSecret); }
    catch (err) { console.error("[stripe-webhook] Signature verification failed:", err); return json({ error: "Webhook signature mismatch" }, 400); }
  } else {
    try { event = JSON.parse(rawBody); if (!webhookSecret) console.warn("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature check"); }
    catch { return json({ error: "Invalid JSON body" }, 400); }
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ── Helper: log a payment attempt to payment_attempts table ──────────────
  async function logPaymentAttempt(opts: {
    confirmationId: string;
    orderId?: string | null;
    eventType: string;
    status: "succeeded" | "failed" | "pending" | "cancelled" | "async_failed" | "async_succeeded";
    amount?: number | null;
    paymentMethod?: string | null;
    paymentIntentId?: string | null;
    checkoutSessionId?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    declineCode?: string | null;
    stripeEventId?: string | null;
    rawError?: Record<string, unknown> | null;
  }) {
    try {
      await supabase.from("payment_attempts").insert({
        confirmation_id: opts.confirmationId,
        order_id: opts.orderId ?? null,
        event_type: opts.eventType,
        status: opts.status,
        amount: opts.amount ?? null,
        payment_method: opts.paymentMethod ?? null,
        payment_intent_id: opts.paymentIntentId ?? null,
        checkout_session_id: opts.checkoutSessionId ?? null,
        failure_code: opts.failureCode ?? null,
        failure_message: opts.failureMessage ?? null,
        decline_code: opts.declineCode ?? null,
        stripe_event_id: opts.stripeEventId ?? null,
        raw_error: opts.rawError ?? null,
      });
    } catch (err) {
      console.warn("[stripe-webhook] logPaymentAttempt failed:", err instanceof Error ? err.message : String(err));
    }
  }

  async function findOrderByConfId(confirmationId: string) {
    const { data } = await supabase.from("orders").select("id, status, payment_intent_id, checkout_session_id, email, confirmation_id, first_name, last_name, phone, state, plan_type, delivery_speed, price, payment_method, letter_type, doctor_name, email_log, paid_at, doctor_status").eq("confirmation_id", confirmationId).maybeSingle();
    return data;
  }
  async function findOrderByEmail(email: string) {
    const { data } = await supabase.from("orders").select("id, status, payment_intent_id, checkout_session_id, email, confirmation_id, first_name, last_name, phone, state, plan_type, delivery_speed, price, payment_method, letter_type, doctor_name, email_log, paid_at, doctor_status").ilike("email", email).is("payment_intent_id", null).neq("status", "refunded").neq("status", "cancelled").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data;
  }
  async function findOrderByPaymentIntent(piId: string) {
    const { data } = await supabase.from("orders").select("id, status, payment_intent_id, checkout_session_id, email, confirmation_id, first_name, last_name, phone, state, plan_type, delivery_speed, price, payment_method, letter_type, doctor_name, email_log, paid_at, doctor_status").eq("payment_intent_id", piId).maybeSingle();
    return data;
  }
  async function findOrderByCheckoutSession(sessionId: string) {
    const { data } = await supabase.from("orders").select("id, status, payment_intent_id, checkout_session_id, email, confirmation_id, first_name, last_name, phone, state, plan_type, delivery_speed, price, payment_method, letter_type, doctor_name, email_log, paid_at, doctor_status").eq("checkout_session_id", sessionId).maybeSingle();
    return data;
  }
  async function findOrderBySubId(subscriptionId: string) {
    const { data } = await supabase.from("orders").select("id, status, email, confirmation_id, payment_intent_id, checkout_session_id, first_name, last_name, phone, state, plan_type, delivery_speed, price, payment_method, letter_type, doctor_name, email_log, paid_at, doctor_status").eq("payment_intent_id", subscriptionId).maybeSingle();
    return data;
  }

  async function resolveOrder(confirmationId: string | undefined, piId: string, emailFromMeta: string | undefined, checkoutSessionId?: string): Promise<{ order: Record<string, unknown>; matchedBy: string } | null> {
    if (confirmationId) { const order = await findOrderByConfId(confirmationId); if (order) return { order: order as unknown as Record<string, unknown>, matchedBy: "confirmation_id" }; console.warn(`[stripe-webhook] confirmation_id ${confirmationId} not found — trying fallbacks`); }
    if (checkoutSessionId) { const bySession = await findOrderByCheckoutSession(checkoutSessionId); if (bySession) return { order: bySession as unknown as Record<string, unknown>, matchedBy: "checkout_session_id" }; }
    const byPi = await findOrderByPaymentIntent(piId); if (byPi) return { order: byPi as unknown as Record<string, unknown>, matchedBy: "payment_intent_id" };
    if (emailFromMeta) { const byEmail = await findOrderByEmail(emailFromMeta); if (byEmail) { console.warn(`[stripe-webhook] FALLBACK: matched ${byEmail.confirmation_id} by email for PI ${piId}`); return { order: byEmail as unknown as Record<string, unknown>, matchedBy: `email:${emailFromMeta}` }; } }
    return null;
  }

  async function markOrderProcessing(confirmationId: string, paymentIntentId: string, amountDollars: number, paymentMethod = "card", checkoutSessionId?: string) {
    const payload: Record<string, unknown> = { status: "processing", payment_intent_id: paymentIntentId, price: amountDollars, payment_method: paymentMethod, paid_at: new Date().toISOString(), payment_failed_at: null, payment_failure_reason: null };
    if (checkoutSessionId) payload.checkout_session_id = checkoutSessionId;
    const { error } = await supabase.from("orders").update(payload).eq("confirmation_id", confirmationId);
    if (error) { console.error(`[stripe-webhook] Failed to update order ${confirmationId}:`, error.message); return false; }
    console.info(`[stripe-webhook] ✓ ${confirmationId} -> processing ($${amountDollars}) via ${paymentMethod}`);
    return true;
  }

  async function logStatus(orderId: string, confirmationId: string, newStatus: string, note: string) {
    try {
      await supabase.from("order_status_logs").insert({ order_id: orderId, confirmation_id: confirmationId, new_status: newStatus, changed_by: "stripe_webhook", changed_at: new Date().toISOString() });
      console.info(`[stripe-webhook] status_log: ${confirmationId} -> ${newStatus} | ${note}`);
    } catch { /* non-critical */ }
  }

  async function appendEmailLog(confirmationId: string, entries: EmailLogEntry[]) {
    try {
      const { data } = await supabase.from("orders").select("email_log").eq("confirmation_id", confirmationId).maybeSingle();
      const currentLog: EmailLogEntry[] = (data?.email_log as EmailLogEntry[]) ?? [];
      await supabase.from("orders").update({ email_log: [...currentLog, ...entries] }).eq("confirmation_id", confirmationId);
    } catch (err) { console.warn("[stripe-webhook] email_log update failed:", err); }
  }

  async function getReceiptUrl(piId: string): Promise<string> {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.latest_charge) {
        const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge as { id: string }).id;
        const charge = await stripe.charges.retrieve(chargeId);
        return charge.receipt_url ?? "";
      }
    } catch (err) { console.warn("[stripe-webhook] Could not fetch receipt URL:", err); }
    return "";
  }

  async function sendPostPaymentEmails(order: Record<string, unknown>, paymentIntentId: string, amountDollars: number, matchedBy = "confirmation_id", checkoutSessionId?: string) {
    const confirmationId = order.confirmation_id as string;
    const email = order.email as string;
    if (!email || !confirmationId) { console.warn("[stripe-webhook] sendPostPaymentEmails: missing email or confirmationId"); return; }
    const existingLog: EmailLogEntry[] = (order.email_log as EmailLogEntry[]) ?? [];
    const alreadySentConfirmation = existingLog.some((e) => e.type === "order_confirmation" && e.success === true);
    const alreadySentReceipt = existingLog.some((e) => e.type === "payment_receipt" && e.success === true);
    const alreadySentInternal = existingLog.some((e) => e.type === "internal_notification" && e.success === true);
    const newLogEntries: EmailLogEntry[] = [];
    const now = new Date().toISOString();

    if (!alreadySentConfirmation) {
      try {
        const confRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/resend-confirmation-email`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` }, body: JSON.stringify({ confirmationId }) });
        const confData = await confRes.json() as { ok: boolean; emailSent?: boolean; skipped?: boolean; error?: string };
        if (confData.ok && confData.emailSent) { console.info(`[stripe-webhook] ✓ Order confirmation sent to ${email}`); }
        else if (confData.skipped) { console.info(`[stripe-webhook] Order confirmation already sent — skipped`); }
        else { console.warn(`[stripe-webhook] Order confirmation failed: ${confData.error}`); newLogEntries.push({ type: "order_confirmation_webhook_trigger", sentAt: now, to: email, success: false, error: confData.error }); }
      } catch (err) { console.error("[stripe-webhook] Order confirmation fetch error:", err); }
    }

    if (!alreadySentReceipt) {
      try {
        const receiptUrl = await getReceiptUrl(paymentIntentId);
        const paidAtRaw = (order.paid_at as string) ?? now;
        const paidAtFormatted = new Date(paidAtRaw).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
        const receiptHtml = buildPaymentReceiptHtml({ firstName: (order.first_name as string) || "", confirmationId, amountFormatted: `$${amountDollars.toFixed(2)}`, paymentIntentId, paymentMethod: (order.payment_method as string) || "card", receiptUrl, paidAt: paidAtFormatted });
        const receiptResult = await sendViaResend({ to: email, subject: `Payment Receipt — $${amountDollars.toFixed(2)} — ${COMPANY_NAME}`, html: receiptHtml, tags: [{ name: "confirmation_id", value: confirmationId }, { name: "email_type", value: "payment_receipt" }] });
        newLogEntries.push({ type: "payment_receipt", sentAt: now, to: email, success: receiptResult.sent, ...(receiptResult.error && !receiptResult.sent ? { error: receiptResult.error } : {}) });
        if (receiptResult.sent) { console.info(`[stripe-webhook] ✓ Payment receipt sent to ${email} for ${confirmationId}`); }
        else { console.warn(`[stripe-webhook] Payment receipt failed for ${confirmationId}: ${receiptResult.error}`); }
      } catch (err) { console.error("[stripe-webhook] Payment receipt error:", err); }
    }

    if (!alreadySentInternal) {
      const { enabled: notifEnabled, recipients: internalRecipients } = await getAdminNotifRecipients("new_paid_order");
      if (notifEnabled && internalRecipients.length > 0) {
        const internalHtml = buildInternalNotificationHtml({ confirmationId, firstName: (order.first_name as string) ?? "", lastName: (order.last_name as string) ?? "", email, phone: (order.phone as string) ?? "", state: (order.state as string) ?? "", letterType: (order.letter_type as string) ?? "esa", planType: (order.plan_type as string) ?? "One-Time Purchase", deliverySpeed: (order.delivery_speed as string) ?? "2-3days", amount: amountDollars, paymentIntentId, checkoutSessionId: checkoutSessionId ?? (order.checkout_session_id as string | undefined), paymentMethod: (order.payment_method as string) ?? "card", doctorName: (order.doctor_name as string | null) ?? null, timestamp: new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET", matchedBy });
        const internalResult = await sendViaResendMulti({ to: internalRecipients, subject: `[PawTenant] New Paid Order — ${confirmationId}${matchedBy !== "confirmation_id" ? " [FALLBACK MATCH]" : ""}`, html: internalHtml, tags: [{ name: "confirmation_id", value: confirmationId }, { name: "email_type", value: "internal_notification" }] });
        internalRecipients.forEach((recipient) => {
          newLogEntries.push({ type: "internal_notification", sentAt: now, to: recipient, success: internalResult.sent });
        });
      } else if (!notifEnabled) {
        console.info(`[stripe-webhook] new_paid_order notification is disabled — skipping internal email for ${confirmationId}`);
      }
    }

    if (newLogEntries.length > 0) await appendEmailLog(confirmationId, newLogEntries);
  }

  const t = event.type;

  // ── payment_intent.succeeded ──────────────────────────────────────────────
  if (t === "payment_intent.succeeded") {
    const pi = event.data.object;
    const cidFromMeta = pi.metadata?.confirmation_id;
    const emailFromMeta = pi.metadata?.email ?? pi.receipt_email;
    const sessionIdFromMeta = pi.metadata?.checkout_session_id;
    const resolved = await resolveOrder(cidFromMeta, pi.id, emailFromMeta, sessionIdFromMeta);
    if (!resolved) {
      console.error(`[stripe-webhook] ORPHANED PAYMENT: PI ${pi.id}`);
      try { await supabase.from("audit_logs").insert({ action: "orphaned_payment_intent", object_type: "stripe_payment", object_id: pi.id, description: `Orphaned PI: ${pi.id}`, metadata: { payment_intent_id: pi.id, amount: Math.round((pi.amount_received ?? 0) / 100), confirmation_id_in_meta: cidFromMeta ?? null, email_in_meta: emailFromMeta ?? null, stripe_event_id: event.id, timestamp: new Date().toISOString() } }); } catch { /* non-critical */ }
      return json({ ok: true, skipped: true, reason: "no_matching_order", piId: pi.id });
    }
    const { order, matchedBy } = resolved;
    const confirmationId = order.confirmation_id as string;
    const amt = Math.round((pi.amount_received ?? 0) / 100);

    // Log successful payment attempt
    await logPaymentAttempt({
      confirmationId,
      orderId: order.id as string,
      eventType: "payment_intent.succeeded",
      status: "succeeded",
      amount: amt,
      paymentMethod: (order.payment_method as string) ?? "card",
      paymentIntentId: pi.id,
      checkoutSessionId: sessionIdFromMeta ?? null,
      stripeEventId: event.id,
    });

    if ((order.status as string) === "processing" && (order.payment_intent_id as string) === pi.id) {
      console.info(`[stripe-webhook] ${confirmationId} already processing — idempotent. Firing triggers anyway.`);
      if (sessionIdFromMeta && !order.checkout_session_id) { await supabase.from("orders").update({ checkout_session_id: sessionIdFromMeta }).eq("confirmation_id", confirmationId); }
      await sendPostPaymentEmails(order, pi.id, amt, matchedBy, sessionIdFromMeta);
      schedulePostPaymentTriggers(confirmationId, order, amt);
      return json({ ok: true, idempotent: true, matchedBy });
    }

    const updated = await markOrderProcessing(confirmationId, pi.id, amt, "card", sessionIdFromMeta);
    if (updated) {
      const freshOrder = await findOrderByConfId(confirmationId);
      if (freshOrder?.id) {
        await logStatus(freshOrder.id, confirmationId, "processing", `Payment confirmed via Stripe. PI: ${pi.id}. Amount: $${amt}. Matched by: ${matchedBy}`);
        await sendPostPaymentEmails(freshOrder as unknown as Record<string, unknown>, pi.id, amt, matchedBy, sessionIdFromMeta);
        schedulePostPaymentTriggers(confirmationId, freshOrder as unknown as Record<string, unknown>, amt);
      }
    }
    return json({ ok: true, type: t, confirmationId, amount: amt, matchedBy });
  }

  // ── payment_intent.payment_failed ─────────────────────────────────────────
  if (t === "payment_intent.payment_failed") {
    const pi = event.data.object;
    const cid = pi.metadata?.confirmation_id;
    const lastErr = pi.last_payment_error;
    const failureCode = lastErr?.code ?? null;
    const failureMessage = lastErr?.message ?? lastErr?.code ?? "Payment declined";
    const declineCode = lastErr?.decline_code ?? null;
    const paymentMethod = lastErr?.payment_method?.type ?? pi.payment_method_types?.[0] ?? null;
    const amt = pi.amount ? Math.round(pi.amount / 100) : null;

    if (!cid) return json({ ok: true, skipped: true });

    // Update order with failure info
    await supabase.from("orders").update({
      payment_failed_at: new Date().toISOString(),
      payment_failure_reason: failureMessage,
    }).eq("confirmation_id", cid);

    // Look up order for orderId
    const order = await findOrderByConfId(cid);

    // Log the failed attempt with full detail
    await logPaymentAttempt({
      confirmationId: cid,
      orderId: order?.id ?? null,
      eventType: "payment_intent.payment_failed",
      status: "failed",
      amount: amt,
      paymentMethod,
      paymentIntentId: pi.id,
      failureCode,
      failureMessage,
      declineCode,
      stripeEventId: event.id,
      rawError: lastErr ? {
        code: lastErr.code,
        decline_code: lastErr.decline_code,
        message: lastErr.message,
        type: lastErr.type,
        param: lastErr.param,
        payment_method_type: lastErr.payment_method?.type,
      } : null,
    });

    return json({ ok: true, type: t, confirmationId: cid, reason: failureMessage });
  }

  if (t === "payment_intent.canceled") {
    const pi = event.data.object;
    const cid = pi.metadata?.confirmation_id;
    if (cid) {
      const order = await findOrderByConfId(cid);
      await logPaymentAttempt({
        confirmationId: cid,
        orderId: order?.id ?? null,
        eventType: "payment_intent.canceled",
        status: "cancelled",
        amount: pi.amount ? Math.round(pi.amount / 100) : null,
        paymentIntentId: pi.id,
        stripeEventId: event.id,
        failureMessage: pi.cancellation_reason ?? "Payment intent cancelled",
      });
    }
    return json({ ok: true, type: t });
  }

  if (t === "payment_intent.created") { return json({ ok: true, type: t }); }

  // ── charge.refunded ───────────────────────────────────────────────────────
  if (t === "charge.refunded") {
    const charge = event.data.object;
    const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
    const refundedAmountDollars = Math.round(charge.amount_refunded ?? 0) / 100;
    const isFullRefund = charge.refunded === true;

    if (!piId) { return json({ ok: true, skipped: true, reason: "no_payment_intent" }); }

    const order = await findOrderByPaymentIntent(piId);
    if (!order) { return json({ ok: true, skipped: true, reason: "no_matching_order", piId }); }

    const confirmationId = order.confirmation_id as string;
    const orderId = order.id as string;
    const currentStatus = order.status as string;
    const doctorStatus = order.doctor_status as string | null;

    if (currentStatus === "refunded") { return json({ ok: true, idempotent: true, confirmationId }); }

    const refundedAt = new Date().toISOString();
    const { error: updateErr } = await supabase.from("orders").update({
      status: "refunded",
      refunded_at: refundedAt,
      refund_amount: refundedAmountDollars,
      google_ads_upload_status: "refunded_pending_adjustment",
    }).eq("id", orderId);
    if (updateErr) { return json({ ok: false, error: updateErr.message }, 500); }

    await logStatus(orderId, confirmationId, "refunded", `Refund $${refundedAmountDollars} via Stripe. Full: ${isFullRefund}. PI: ${piId}.`);

    const orderWasCompleted = doctorStatus === "letter_sent" || doctorStatus === "patient_notified";
    if (!orderWasCompleted) {
      await supabase.from("doctor_earnings").update({ status: "refunded", notes: `Order refunded via Stripe on ${refundedAt}. Provider had not completed work.` }).eq("confirmation_id", confirmationId).neq("status", "paid");
    }

    try {
      await supabase.from("audit_logs").insert({ action: "order_refunded_via_stripe", object_type: "order", object_id: confirmationId, description: `Order refunded: ${confirmationId}`, metadata: { confirmation_id: confirmationId, order_id: orderId, payment_intent_id: piId, refund_amount: refundedAmountDollars, is_full_refund: isFullRefund, doctor_status_at_refund: doctorStatus ?? "none", earnings_preserved: orderWasCompleted, refunded_at: refundedAt, stripe_event_id: event.id } });
    } catch { /* non-critical */ }

    return json({ ok: true, type: t, confirmationId, refundAmount: refundedAmountDollars, isFullRefund, earningsPreserved: orderWasCompleted });
  }

  // ── checkout.session.completed ────────────────────────────────────────────
  if (t === "checkout.session.completed") {
    const session = event.data.object;
    const cid = session.metadata?.confirmation_id;
    const emailFromMeta = session.metadata?.email ?? session.customer_email;
    if (session.payment_status !== "paid") return json({ ok: true, deferred: true, confirmationId: cid });
    const isSubscription = session.subscription != null;
    const piId = isSubscription ? (session.subscription ?? session.id) : (session.payment_intent ?? session.id);
    const amt = Math.round((session.amount_total ?? 0) / 100);
    const mode = session.metadata?.payment_mode ?? (isSubscription ? "subscription" : "klarna");
    const resolved = await resolveOrder(cid, piId, emailFromMeta, session.id);
    if (!resolved) {
      console.error(`[stripe-webhook] ORPHANED CHECKOUT: session ${session.id}`);
      try { await supabase.from("audit_logs").insert({ action: "orphaned_checkout_session", object_type: "stripe_payment", object_id: session.id, description: `Orphaned checkout: ${session.id}`, metadata: { session_id: session.id, payment_intent_id: piId, amount: amt, confirmation_id_in_meta: cid ?? null, stripe_event_id: event.id, timestamp: new Date().toISOString() } }); } catch { /* non-critical */ }
      return json({ ok: true, skipped: true, reason: "no_matching_order" });
    }
    const { order, matchedBy } = resolved;
    const confirmationId = order.confirmation_id as string;

    // Log successful checkout attempt
    await logPaymentAttempt({
      confirmationId,
      orderId: order.id as string,
      eventType: "checkout.session.completed",
      status: "succeeded",
      amount: amt,
      paymentMethod: mode,
      paymentIntentId: piId,
      checkoutSessionId: session.id,
      stripeEventId: event.id,
    });

    if ((order.status as string) === "processing") {
      if (session.id && !order.checkout_session_id) { await supabase.from("orders").update({ checkout_session_id: session.id }).eq("confirmation_id", confirmationId); }
      await sendPostPaymentEmails(order, piId, amt, matchedBy, session.id);
      schedulePostPaymentTriggers(confirmationId, order, amt);
      return json({ ok: true, idempotent: true, matchedBy });
    }
    await markOrderProcessing(confirmationId, piId, amt, mode, session.id);
    const freshOrder = await findOrderByConfId(confirmationId);
    if (freshOrder?.id) {
      await logStatus(freshOrder.id, confirmationId, "processing", `Checkout session ${session.id} completed. PI: ${piId}. Amount: $${amt}. Matched by: ${matchedBy}`);
      await sendPostPaymentEmails(freshOrder as unknown as Record<string, unknown>, piId, amt, matchedBy, session.id);
      schedulePostPaymentTriggers(confirmationId, freshOrder as unknown as Record<string, unknown>, amt);
    }
    return json({ ok: true, type: t, confirmationId, amount: amt, isSubscription, matchedBy, checkoutSessionId: session.id });
  }

  // ── checkout.session.async_payment_succeeded ─────────────────────────────
  if (t === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    const cid = session.metadata?.confirmation_id;
    const emailFromMeta = session.metadata?.email ?? session.customer_email;
    const isSubscription = session.subscription != null;
    const piId = isSubscription ? (session.subscription ?? session.id) : (session.payment_intent ?? session.id);
    const amt = Math.round((session.amount_total ?? 0) / 100);
    const resolved = await resolveOrder(cid, piId, emailFromMeta, session.id);
    if (!resolved) return json({ ok: true, skipped: true, reason: "no_matching_order" });
    const { order, matchedBy } = resolved;
    const confirmationId = order.confirmation_id as string;

    await logPaymentAttempt({
      confirmationId,
      orderId: order.id as string,
      eventType: "checkout.session.async_payment_succeeded",
      status: "async_succeeded",
      amount: amt,
      paymentMethod: session.metadata?.payment_mode ?? "klarna",
      paymentIntentId: piId,
      checkoutSessionId: session.id,
      stripeEventId: event.id,
    });

    if ((order.status as string) === "processing") {
      if (session.id && !order.checkout_session_id) { await supabase.from("orders").update({ checkout_session_id: session.id }).eq("confirmation_id", confirmationId); }
      await sendPostPaymentEmails(order, piId, amt, matchedBy, session.id);
      schedulePostPaymentTriggers(confirmationId, order, amt);
      return json({ ok: true, idempotent: true });
    }
    await markOrderProcessing(confirmationId, piId, amt, session.metadata?.payment_mode ?? "klarna", session.id);
    const freshOrder = await findOrderByConfId(confirmationId);
    if (freshOrder) {
      await sendPostPaymentEmails(freshOrder as unknown as Record<string, unknown>, piId, amt, matchedBy, session.id);
      schedulePostPaymentTriggers(confirmationId, freshOrder as unknown as Record<string, unknown>, amt);
    }
    return json({ ok: true, type: t, confirmationId, amount: amt });
  }

  if (t === "checkout.session.async_payment_failed") {
    const session = event.data.object;
    const cid = session.metadata?.confirmation_id;
    if (!cid) return json({ ok: true, skipped: true });

    const order = await findOrderByConfId(cid);
    await supabase.from("orders").update({
      payment_failed_at: new Date().toISOString(),
      payment_failure_reason: "Async payment failed (Klarna/QR)",
    }).eq("confirmation_id", cid);

    await logPaymentAttempt({
      confirmationId: cid,
      orderId: order?.id ?? null,
      eventType: "checkout.session.async_payment_failed",
      status: "async_failed",
      amount: session.amount_total ? Math.round(session.amount_total / 100) : null,
      paymentMethod: session.metadata?.payment_mode ?? "klarna",
      checkoutSessionId: session.id,
      stripeEventId: event.id,
      failureMessage: "Async payment failed (Klarna/QR)",
    });

    return json({ ok: true, type: t, confirmationId: cid });
  }

  if (t === "checkout.session.expired") {
    const session = event.data.object;
    const cid = session.metadata?.confirmation_id;
    if (cid) {
      const order = await findOrderByConfId(cid);
      await logPaymentAttempt({
        confirmationId: cid,
        orderId: order?.id ?? null,
        eventType: "checkout.session.expired",
        status: "cancelled",
        amount: session.amount_total ? Math.round(session.amount_total / 100) : null,
        checkoutSessionId: session.id,
        stripeEventId: event.id,
        failureMessage: "Checkout session expired without payment",
      });
    }
    return json({ ok: true, type: t });
  }

  if (t === "customer.subscription.created") {
    const sub = event.data.object; const cid = sub.metadata?.confirmation_id;
    if (cid) { const order = await findOrderByConfId(cid); if (order?.id && sub.status === "active") { await logStatus(order.id, cid, "processing", `Subscription ${sub.id} created.`); } }
    return json({ ok: true, type: t });
  }
  if (t === "customer.subscription.updated") {
    const sub = event.data.object; const cid = sub.metadata?.confirmation_id;
    if (cid && sub.cancel_at_period_end) { await supabase.from("orders").update({ plan_type: "Subscription (Annual) — Cancelling" }).eq("confirmation_id", cid); const order = await findOrderByConfId(cid); if (order?.id) await logStatus(order.id, cid, "processing", `Subscription scheduled to cancel.`); }
    return json({ ok: true, type: t });
  }
  if (t === "customer.subscription.deleted") {
    const sub = event.data.object; const cid = sub.metadata?.confirmation_id;
    if (cid) { await supabase.from("orders").update({ plan_type: "Subscription (Annual) — Cancelled" }).eq("confirmation_id", cid); const order = await findOrderByConfId(cid); if (order?.id) await logStatus(order.id, cid, "processing", `Subscription ${sub.id} cancelled.`); }
    return json({ ok: true, type: t });
  }
  if (["customer.subscription.paused","customer.subscription.resumed","customer.subscription.trial_will_end"].includes(t)) { return json({ ok: true, type: t }); }

  if (t === "invoice.paid") {
    const invoice = event.data.object; const amt = Math.round((invoice.amount_paid ?? 0) / 100); const billing = invoice.billing_reason; const cid = invoice.subscription_details?.metadata?.confirmation_id;
    if (billing === "subscription_cycle") {
      let order = cid ? await findOrderByConfId(cid) : null;
      if (!order && invoice.subscription) order = await findOrderBySubId(invoice.subscription);
      if (order?.id) { await supabase.from("orders").update({ status: "processing", price: amt, paid_at: new Date().toISOString(), payment_failed_at: null, payment_failure_reason: null }).eq("id", order.id); await logStatus(order.id, order.confirmation_id as string, "processing", `Annual renewal billed: $${amt}`); }
    }
    return json({ ok: true, type: t, billing, amount: amt });
  }
  if (t === "invoice.payment_succeeded") { return json({ ok: true, type: t, amount: Math.round((event.data.object.amount_paid ?? 0) / 100) }); }
  if (t === "invoice.payment_failed") {
    const invoice = event.data.object; const cid = invoice.subscription_details?.metadata?.confirmation_id;
    let order = cid ? await findOrderByConfId(cid) : null;
    if (!order && invoice.subscription) order = await findOrderBySubId(invoice.subscription);
    if (order?.id) {
      const failMsg = `Invoice payment failed (attempt ${invoice.attempt_count})`;
      await supabase.from("orders").update({ payment_failed_at: new Date().toISOString(), payment_failure_reason: failMsg }).eq("id", order.id);
      await logPaymentAttempt({
        confirmationId: order.confirmation_id as string,
        orderId: order.id,
        eventType: "invoice.payment_failed",
        status: "failed",
        amount: invoice.amount_due ? Math.round(invoice.amount_due / 100) : null,
        stripeEventId: event.id,
        failureMessage: failMsg,
      });
    }
    return json({ ok: true, type: t });
  }
  if (t === "invoice.payment_action_required") { return json({ ok: true, type: t }); }
  if (["invoice.created","invoice.finalized","invoice.upcoming","invoice.marked_uncollectible","invoice.voided"].includes(t)) { return json({ ok: true, type: t }); }
  if (t === "customer.created" || t === "customer.updated") { return json({ ok: true, type: t }); }

  console.info(`[stripe-webhook] Received unhandled event: ${t}`);
  return json({ ok: true, type: t, handled: false });
});
