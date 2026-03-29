import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Resend helper ──────────────────────────────────────────────────────────

async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[resend-confirmation] RESEND_API_KEY secret is not set");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[resend-confirmation] Resend error ${res.status}: ${errBody}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[resend-confirmation] Resend fetch error:", err);
    return false;
  }
}

// ── Template helpers ──────────────────────────────────────────────────────

function baseLayout(badge: string, heading: string, subheading: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr>
        <td style="background:#1a5c4f;padding:32px;text-align:center;">
          <img src="${LOGO_URL}" width="180" alt="PawTenant" style="display:block;margin:0 auto 16px;height:auto;" />
          <div style="display:inline-block;background:rgba(255,255,255,0.18);color:#ffffff;padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px;">${badge}</div>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#ffffff;line-height:1.3;">${heading}</h1>
          <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.75);">${subheading}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">${body}</td>
      </tr>
      <tr>
        <td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a5c4f;text-decoration:none;">${SUPPORT_EMAIL}</a></p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">${COMPANY_NAME} &mdash; ESA Consultation &nbsp;&middot;&nbsp; <a href="https://${COMPANY_DOMAIN}" style="color:#1a5c4f;text-decoration:none;">${COMPANY_DOMAIN}</a></p>
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
        <div style="width:22px;height:22px;background:#1a5c4f;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#fff;">${i + 1}</div>
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
  firstName: string;
  confirmationId: string;
  state: string;
  planType: string;
  deliverySpeed: string;
  formattedPrice: string;
  receiptUrl?: string;
  couponCode?: string | null;
  couponDiscount?: number | null;
}) {
  const name = escapeHtml(opts.firstName || "there");
  const deliveryLabel = opts.deliverySpeed === "priority"
    ? "Priority &mdash; Within 24 Hours"
    : "Standard &mdash; 2&ndash;3 Business Days";

  const couponValue = opts.couponCode
    ? `<span style="background:#f0faf7;color:#1a5c4f;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:700;">${escapeHtml(opts.couponCode)}</span>${opts.couponDiscount ? ` <span style="color:#059669;font-weight:700;">(-$${opts.couponDiscount}.00 saved)</span>` : ""}`
    : "";

  const detailRows: Array<[string, string, string?]> = [
    ["Order ID", escapeHtml(opts.confirmationId), "#1a5c4f"],
    ["State", escapeHtml(opts.state)],
    ["Plan", escapeHtml(opts.planType)],
    ["Delivery", deliveryLabel],
    ["Amount Paid", escapeHtml(opts.formattedPrice)],
  ];
  if (opts.couponCode) detailRows.push(["Coupon Applied", couponValue]);
  if (opts.receiptUrl) detailRows.push(["Receipt", `<a href="${escapeHtml(opts.receiptUrl)}" style="color:#1a5c4f;text-decoration:none;">View Payment Receipt &rarr;</a>`]);

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
      You don&rsquo;t need to do anything right now. We&rsquo;ll send you another email the moment your documents are ready. In the meantime, you can check your order status anytime in your portal.
    </p>`;

  return baseLayout("Order Confirmed", "Your order is confirmed!", "We've received your payment and your case is now under review.", body);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type EmailLogEntry = { type: string; sentAt: string; to: string; success: boolean };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { confirmationId?: string };
  try {
    body = await req.json() as { confirmationId?: string };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { confirmationId } = body;
  if (!confirmationId) return json({ error: "confirmationId is required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, confirmation_id, email, first_name, last_name, state, plan_type, delivery_speed, price, payment_intent_id, email_log, coupon_code, coupon_discount")
    .eq("confirmation_id", confirmationId)
    .maybeSingle();

  if (orderErr || !order) {
    return json({ ok: false, error: `Order not found: ${orderErr?.message ?? "no row"}` }, 404);
  }

  const email = order.email as string;
  if (!email) return json({ ok: false, error: "Order has no email address" }, 400);

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
    } catch (err) {
      console.warn(`[RESEND-CONFIRM] Could not fetch Stripe receipt: ${err}`);
    }
  }

  const priceInDollars = (order.price as number) ?? 0;
  const html = buildConfirmationEmail({
    firstName: (order.first_name as string) || "",
    confirmationId: order.confirmation_id as string,
    state: (order.state as string) || "",
    planType: (order.plan_type as string) || "",
    deliverySpeed: (order.delivery_speed as string) || "",
    formattedPrice: `$${priceInDollars.toFixed(2)}`,
    receiptUrl,
    couponCode: order.coupon_code as string | null,
    couponDiscount: order.coupon_discount as number | null,
  });

  let sent = false;
  let attempt = 0;
  let lastError = "";

  while (attempt < 3 && !sent) {
    try {
      sent = await sendViaResend({ to: email, subject: `Order Confirmed — ${confirmationId}`, html });
      if (!sent) throw new Error("Resend returned non-ok response");
    } catch (err: unknown) {
      attempt++;
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`[RESEND-CONFIRM] Attempt ${attempt} failed: ${lastError}`);
      if (attempt < 3) await sleep(attempt * 2000);
    }
  }

  const currentLog: EmailLogEntry[] = (order.email_log as EmailLogEntry[]) ?? [];
  const newEntry: EmailLogEntry = {
    type: "order_confirmation",
    sentAt: new Date().toISOString(),
    to: email,
    success: sent,
  };
  await supabase
    .from("orders")
    .update({ email_log: [...currentLog, newEntry] })
    .eq("confirmation_id", confirmationId);

  if (!sent) {
    return json({ ok: false, error: `Failed after 3 attempts: ${lastError}` }, 500);
  }

  return json({ ok: true, emailSent: true, to: email });
});
