import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reserveEmailSend, finalizeEmailSend } from "../_shared/logEmailComm.ts";
import { renderOrderConfirmationContent } from "../_shared/orderConfirmationLayout.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANY_NAME = "PawTenant";
const COMPANY_DOMAIN = "pawtenant.com";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const PORTAL_URL = `https://${COMPANY_DOMAIN}/my-orders`;
// Logo served from the PawTenant domain (same domain as the From address),
// so Resend Insights does not flag it as a third-party tracking/CDN image.
// White-on-transparent variant matches the dark teal/blue header bands.
const LOGO_URL = `https://www.${COMPANY_DOMAIN}/assets/brand/pawtenant-logo-white-02.png`;
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;

const HEADER_BG = "#4a9e8a";
const HEADER_BADGE_BG = "rgba(255,255,255,0.22)";
const HEADER_TEXT = "#ffffff";
const HEADER_SUB = "rgba(255,255,255,0.82)";
const ACCENT = "#1a5c4f";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function substitute(s: string, vars: Record<string, string>): string {
  return String(s ?? "").replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

// Clean fallback layout used only when comms_settings.email_layout_html is
// not configured. Mirrors the Settings hub preview shape — header + body
// slot + footer. (Not the same as buildConfirmationEmail's rich layout —
// that one is the deeper hardcoded fallback for a missing DB row.)
const FALLBACK_LAYOUT = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr><td style="background:#3b6ea5;padding:28px 32px;text-align:center;">
        <img src="${LOGO_URL}" width="160" alt="PawTenant" style="display:block;margin:0 auto 10px;height:auto;max-width:160px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
        <span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.75);letter-spacing:0.05em;">ESA &amp; PSD Letter Consultations</span>
      </td></tr>
      <tr><td style="padding:32px 36px;">{{content}}</td></tr>
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
        <p style="margin:0 0 4px 0;font-size:12px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:hello@pawtenant.com" style="color:#3b6ea5;text-decoration:none;">hello@pawtenant.com</a></p>
        <p style="margin:0;font-size:11px;color:#9ca3af;">PawTenant &mdash; ESA &amp; PSD Letter Consultations &nbsp;&middot;&nbsp; <a href="https://pawtenant.com" style="color:#9ca3af;">pawtenant.com</a></p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

async function loadMasterLayout(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const { data } = await supabase
    .from("comms_settings")
    .select("value")
    .eq("key", "email_layout_html")
    .maybeSingle();
  const val = (data?.value as string | null) ?? "";
  if (val && val.includes("{{content}}")) return val;
  return FALLBACK_LAYOUT;
}

// Render body text + CTA the same way Settings preview / send-review-request do.
function renderBodyAsHtml(subject: string, bodyText: string, ctaLabel: string, ctaUrl: string): string {
  const paragraphs = bodyText
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px 0;line-height:1.65;color:#374151;font-size:15px;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  const cta = (ctaLabel && ctaUrl)
    ? `<div style="text-align:center;margin:28px 0 0;">
         <a href="${ctaUrl}" style="display:inline-block;background:#3b6ea5;color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">${ctaLabel}</a>
       </div>`
    : "";

  const heading = subject
    ? `<h1 style="margin:0 0 22px 0;font-size:20px;font-weight:800;color:#111827;line-height:1.3;">${escapeHtml(subject)}</h1>`
    : "";

  return `${heading}${paragraphs}${cta}`;
}

interface DbTemplate { subject: string; body: string; cta_label: string; cta_url: string }

async function loadOrderConfirmationTemplate(
  supabase: ReturnType<typeof createClient>,
): Promise<DbTemplate | null> {
  try {
    const { data, error } = await supabase
      .from("email_templates")
      .select("subject, body, cta_label, cta_url")
      .eq("slug", "order_confirmation")
      .eq("channel", "email")
      .maybeSingle();
    if (error || !data) return null;
    return data as DbTemplate;
  } catch (err) {
    console.warn("[resend-confirmation] template lookup failed:", err);
    return null;
  }
}

async function sendViaResend(opts: {
  to: string; subject: string; html: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<{ sent: boolean; resendId?: string; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [opts.to], subject: opts.subject, html: opts.html, ...(opts.tags ? { tags: opts.tags } : {}) }),
    });
    if (!res.ok) { const errBody = await res.text(); return { sent: false, error: `Resend ${res.status}: ${errBody}` }; }
    const data = await res.json() as { id?: string };
    return { sent: true, resendId: data.id };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
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
          <img src="${LOGO_URL}" width="180" alt="PawTenant" style="display:block;margin:0 auto 16px;height:auto;max-width:180px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
          <div style="display:inline-block;background:${HEADER_BADGE_BG};color:${HEADER_TEXT};padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px;">${badge}</div>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${HEADER_TEXT};line-height:1.3;">${heading}</h1>
          <p style="margin:0;font-size:14px;color:${HEADER_SUB};">${subheading}</p>
        </td>
      </tr>
      <tr><td style="padding:32px;">${body}</td></tr>
      <tr>
        <td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a></p>
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
  const rowsHtml = rows.map(([label, value, valueColor]) => `
    <tr>
      <td style="padding:7px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">${label}</td>
      <td style="padding:7px 0;font-size:13px;font-weight:600;color:${valueColor ?? "#111827"};">${value}</td>
    </tr>`).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px;">
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

function buildConfirmationEmail(opts: {
  firstName: string; confirmationId: string; state: string; planType: string;
  deliverySpeed: string; formattedPrice: string; receiptUrl?: string;
  couponCode?: string | null; couponDiscount?: number | null;
}) {
  const name = escapeHtml(opts.firstName || "there");
  const deliveryLabel = opts.deliverySpeed === "priority"
    ? "Priority &mdash; Within 24 Hours"
    : "Standard &mdash; 2&ndash;3 Business Days";

  const couponValue = opts.couponCode
    ? `<span style="background:#f0faf7;color:${ACCENT};padding:2px 8px;border-radius:99px;font-size:12px;font-weight:700;">${escapeHtml(opts.couponCode)}</span>${opts.couponDiscount ? ` <span style="color:#059669;font-weight:700;">(-$${opts.couponDiscount}.00 saved)</span>` : ""}`
    : "";

  const detailRows: Array<[string, string, string?]> = [
    ["Order ID", escapeHtml(opts.confirmationId), ACCENT],
    ["State", escapeHtml(opts.state)],
    ["Plan", escapeHtml(opts.planType)],
    ["Delivery", deliveryLabel],
    ["Amount Paid", escapeHtml(opts.formattedPrice)],
  ];
  if (opts.couponCode) detailRows.push(["Coupon Applied", couponValue]);
  if (opts.receiptUrl) detailRows.push(["Receipt", `<a href="${escapeHtml(opts.receiptUrl)}" style="color:${ACCENT};text-decoration:none;">View Payment Receipt &rarr;</a>`]);

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>${name}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
      Thank you for choosing ${COMPANY_NAME}. Your ESA consultation has been confirmed and a licensed mental health provider will be reviewing your case shortly.
    </p>
    ${detailCard("Order Details", detailRows)}
    ${stepsCard("What Happens Next", [
      "A licensed provider reviews your assessment and pet information",
      "They prepare and sign your official ESA letter",
      "You receive your completed documents by email and in your portal",
    ])}
    ${ctaButton(PORTAL_URL, "Track My Order")}
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      You don&rsquo;t need to do anything right now. We&rsquo;ll send you another email the moment your documents are ready.
    </p>`;

  return baseLayout("Order Confirmed", "Your order is confirmed!", "We've received your payment and your case is now under review.", body);
}

type EmailLogEntry = { type: string; sentAt: string; to: string; success: boolean; templateSource?: "db" | "hardcoded"; error?: string; resendId?: string };

function sleep(ms: number) { return new Promise<void>((resolve) => setTimeout(resolve, ms)); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { confirmationId?: string; force?: boolean; source?: string };
  try { body = await req.json() as { confirmationId?: string; force?: boolean; source?: string }; }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const { confirmationId, force = false } = body;
  if (!confirmationId) return json({ error: "confirmationId is required" }, 400);

  // Source marker — webhook | client_fallback | manual | retry | unknown.
  // Stamped onto communications.sent_by so the admin Comms timeline shows
  // exactly which path triggered each confirmation send.
  const ALLOWED_SOURCES = new Set(["webhook", "client_fallback", "manual", "retry"]);
  const source = ALLOWED_SOURCES.has(String(body.source ?? "")) ? String(body.source) : "unknown";
  // Suffix sent_by only when caller identified itself, so legacy callers
  // (admin manual resend, etc.) keep clean identifiers in the timeline.
  const sentBySuffix = source === "unknown" ? "" : `:${source}`;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, confirmation_id, email, first_name, last_name, state, plan_type, delivery_speed, price, payment_intent_id, email_log, coupon_code, coupon_discount, status")
    .eq("confirmation_id", confirmationId).maybeSingle();

  if (orderErr || !order) return json({ ok: false, error: `Order not found: ${orderErr?.message ?? "no row"}` }, 404);

  const email = order.email as string;
  if (!email) return json({ ok: false, error: "Order has no email address" }, 400);

  const currentLog: EmailLogEntry[] = (order.email_log as EmailLogEntry[]) ?? [];
  const alreadySentLegacy = currentLog.some((e) => e.type === "order_confirmation" && e.success === true);
  if (alreadySentLegacy && !force) return json({ ok: true, emailSent: false, skipped: true, reason: "Confirmation email already sent (email_log)", to: email });

  let receiptUrl = "";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (stripeKey && order.payment_intent_id) {
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
      const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id as string);
      if (pi.latest_charge) {
        const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge as { id: string }).id;
        const charge = await stripe.charges.retrieve(chargeId);
        receiptUrl = charge.receipt_url ?? "";
      }
    } catch (err) { console.warn(`[resend-confirmation] Could not fetch Stripe receipt: ${err}`); }
  }

  const priceInDollars = (order.price as number) ?? 0;
  const formattedPrice = `$${priceInDollars.toFixed(2)}`;
  const planType = (order.plan_type as string) || "One-Time Purchase";
  const deliverySpeed = (order.delivery_speed as string) || "";
  const deliveryLabel = deliverySpeed === "priority"
    ? "Priority — Within 24 Hours"
    : "Standard — 2-3 Business Days";
  const stateValue = (order.state as string) || "";
  const firstName = (order.first_name as string) || "";

  // ───────────────── DB-FIRST RENDER (matches Settings hub preview) ─────────
  // Try the email_templates row first. On ANY failure (row missing, layout
  // load fails, render throws), fall back to the existing hardcoded
  // buildConfirmationEmail so the customer still gets a valid email.
  let html = "";
  let subject = `Order Confirmed — ${confirmationId}`;
  let templateSource: "db" | "hardcoded" = "hardcoded";

  try {
    const tmpl = await loadOrderConfirmationTemplate(supabase);
    if (tmpl) {
      const vars: Record<string, string> = {
        name: firstName || "there",
        order_id: confirmationId,
        email,
        amount: formattedPrice,
        state: stateValue,
        plan: planType,
        delivery: deliveryLabel,
        portal_url: PORTAL_URL,
        receipt_url: receiptUrl,
        coupon_code: (order.coupon_code as string | null) ?? "",
        coupon_discount: (order.coupon_discount as number | null) != null
          ? `$${order.coupon_discount}`
          : "",
        date: new Date().toISOString().slice(0, 10),
      };
      const dbSubject = substitute(tmpl.subject ?? "", vars);
      const dbBody    = substitute(tmpl.body    ?? "", vars);
      const dbCtaLbl  = substitute(tmpl.cta_label ?? "", vars);
      const dbCtaUrl  = substitute(tmpl.cta_url   ?? "", vars) || PORTAL_URL;

      // Render the body via the shared order-confirmation renderer so the
      // automatic (webhook + client_fallback) email and the admin Comms
      // manual email look identical. The structured order details card is
      // injected programmatically — admins can edit the body copy without
      // accidentally dropping detail rows.
      const content = renderOrderConfirmationContent({
        subject: dbSubject || subject,
        bodyText: dbBody,
        ctaLabel: dbCtaLbl || "Track My Order",
        ctaUrl: dbCtaUrl,
        details: {
          orderId: confirmationId,
          state: stateValue,
          plan: planType,
          delivery: deliveryLabel,
          amount: formattedPrice,
          couponCode: order.coupon_code as string | null,
          couponDiscount: order.coupon_discount as number | null,
          receiptUrl: receiptUrl || null,
        },
      });
      const layout  = await loadMasterLayout(supabase);
      html = layout.replace("{{content}}", content);
      if (dbSubject) subject = dbSubject;
      templateSource = "db";
    } else {
      console.warn("[resend-confirmation] DB template order_confirmation/email NOT FOUND — using hardcoded fallback");
    }
  } catch (err) {
    console.warn("[resend-confirmation] DB template render failed — using hardcoded fallback:", err);
  }

  if (!html) {
    html = buildConfirmationEmail({
      firstName,
      confirmationId: order.confirmation_id as string,
      state: stateValue,
      planType,
      deliverySpeed,
      formattedPrice,
      receiptUrl,
      couponCode: order.coupon_code as string | null,
      couponDiscount: order.coupon_discount as number | null,
    });
    templateSource = "hardcoded";
  }

  // Atomic reservation against communications table — blocks duplicate sends
  // across concurrent stripe-webhook events (PI succeeded + checkout completed).
  // When `force=true` the caller has explicitly requested a re-send, so we
  // bypass reservation entirely and allow a new row.
  //
  // allowRetryAfterFailed=true: if a prior reservation failed (Resend outage,
  // network error), recycle that row and try again. This makes the webhook
  // retries + client fallback genuinely belt-and-braces — a transient failure
  // no longer permanently blocks the customer's confirmation email.
  let reserveRowId: string | null | undefined = null;
  let recycled = false;
  if (!force) {
    const reserve = await reserveEmailSend({
      supabase,
      orderId: order.id as string,
      confirmationId,
      to: email,
      from: FROM_ADDRESS,
      subject,
      slug: "order_confirmation",
      templateSource,
      sentBy: `resend_confirmation_email${sentBySuffix}`,
      allowRetryAfterFailed: true,
    });
    if (!reserve.proceed) {
      console.info(`[resend-confirmation] DEDUPED for ${confirmationId} (key=${reserve.dedupeKey}, source=${source})`);
      return json({ ok: true, emailSent: false, skipped: true, reason: "Confirmation email already reserved/sent (communications)", to: email, dedupeKey: reserve.dedupeKey, source });
    }
    reserveRowId = reserve.rowId;
    recycled = reserve.reason === "retry_after_failed";
  }

  let result = { sent: false, error: "Not attempted", resendId: undefined as string | undefined };
  let attempt = 0;

  while (attempt < 3 && !result.sent) {
    result = await sendViaResend({
      to: email,
      subject,
      html,
      tags: [
        { name: "confirmation_id", value: confirmationId },
        { name: "email_type", value: "order_confirmation" },
        { name: "template_source", value: templateSource },
      ],
    });
    if (!result.sent) {
      attempt++;
      if (attempt < 3) await sleep(attempt * 2000);
    }
  }

  const newEntry: EmailLogEntry = {
    type: "order_confirmation",
    sentAt: new Date().toISOString(),
    to: email,
    success: result.sent,
    templateSource,
    ...(result.error && !result.sent ? { error: result.error } : {}),
    ...(result.resendId ? { resendId: result.resendId } : {}),
  };
  await supabase.from("orders").update({ email_log: [...currentLog, newEntry] }).eq("confirmation_id", confirmationId);

  // Finalize reserved row (status=sent/failed, body + resend id).
  // When force=true there is no reserved row — fall back to a direct insert so
  // the send still shows up in the comms timeline.
  if (reserveRowId) {
    await finalizeEmailSend(supabase, reserveRowId, {
      success: result.sent,
      body: html,
      resendId: result.resendId ?? null,
      errorMessage: result.error ?? null,
    });
  } else if (force) {
    try {
      await supabase.from("communications").insert({
        order_id: order.id as string,
        confirmation_id: confirmationId,
        type: "email",
        direction: "outbound",
        body: html,
        email_to: email,
        email_from: FROM_ADDRESS,
        subject,
        slug: "order_confirmation",
        template_source: templateSource,
        status: result.sent ? "sent" : "failed",
        sent_by: `admin_resend_confirmation_force${sentBySuffix}`,
        twilio_sid: result.resendId ?? null,
        dedupe_key: null,
      });
    } catch (err) {
      console.warn("[resend-confirmation] force-send comms insert failed", err);
    }
  }

  if (!result.sent) return json({ ok: false, error: `Failed after 3 attempts: ${result.error}`, source, recycled }, 500);

  return json({ ok: true, emailSent: true, to: email, templateSource, source, recycled });
});
