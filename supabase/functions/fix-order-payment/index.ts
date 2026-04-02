import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANY_NAME = "PawTenant";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const COMPANY_DOMAIN = "pawtenant.com";
const PORTAL_URL = `https://${COMPANY_DOMAIN}/my-orders`;
const INTERNAL_EMAIL = "eservices.dm@gmail.com";
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { sent: false, error: `Resend ${res.status}: ${err}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function buildPaymentReceiptHtml(opts: {
  firstName: string;
  confirmationId: string;
  amountFormatted: string;
  paymentIntentId: string;
  paymentMethod: string;
  receiptUrl: string;
  paidAt: string;
}): string {
  const methodLabel: Record<string, string> = {
    card: "Credit / Debit Card",
    klarna: "Klarna (Pay in 4)",
    qr: "QR Code / Mobile Pay",
    subscription: "Subscription (Annual)",
  };
  const method = methodLabel[opts.paymentMethod] ?? opts.paymentMethod ?? "Card";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:560px;width:100%;">
      <tr>
        <td style="background:#0f172a;padding:28px 32px;text-align:center;">
          <img src="${LOGO_URL}" width="140" alt="${COMPANY_NAME}" style="display:block;margin:0 auto 12px;height:auto;" />
          <div style="display:inline-block;background:rgba(255,255,255,0.12);color:#94a3b8;padding:4px 14px;border-radius:99px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:12px;">PAYMENT RECEIPT</div>
          <p style="margin:0;font-size:40px;font-weight:900;color:#ffffff;letter-spacing:-0.02em;">${opts.amountFormatted}</p>
          <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Payment received &mdash; ${opts.paidAt}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
            Hi <strong>${opts.firstName || "there"}</strong>, thank you! Your payment has been processed successfully and your ESA consultation is now active.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 14px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Transaction Details</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:7px 0;font-size:13px;color:#6b7280;width:150px;vertical-align:top;border-bottom:1px solid #f1f5f9;">Amount Charged</td>
                  <td style="padding:7px 0;font-size:14px;font-weight:800;color:#0f172a;border-bottom:1px solid #f1f5f9;">${opts.amountFormatted}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;font-size:13px;color:#6b7280;vertical-align:top;border-bottom:1px solid #f1f5f9;">Order ID</td>
                  <td style="padding:7px 0;font-size:13px;font-weight:600;color:#1e293b;font-family:monospace;border-bottom:1px solid #f1f5f9;">${opts.confirmationId}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;font-size:13px;color:#6b7280;vertical-align:top;border-bottom:1px solid #f1f5f9;">Payment Method</td>
                  <td style="padding:7px 0;font-size:13px;font-weight:600;color:#1e293b;border-bottom:1px solid #f1f5f9;">${method}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;font-size:13px;color:#6b7280;vertical-align:top;border-bottom:1px solid #f1f5f9;">Transaction ID</td>
                  <td style="padding:7px 0;font-size:11px;font-weight:500;color:#6b7280;font-family:monospace;border-bottom:1px solid #f1f5f9;">${opts.paymentIntentId}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;font-size:13px;color:#6b7280;vertical-align:top;">Status</td>
                  <td style="padding:7px 0;">
                    <span style="display:inline-flex;align-items:center;gap:4px;background:#dcfce7;color:#15803d;font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px;">&#10003; Paid</span>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr>
              <td style="padding-right:8px;width:50%;">
                <a href="${PORTAL_URL}" style="display:block;text-align:center;background:#1a5c4f;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;padding:12px 16px;border-radius:8px;">Track My Order &rarr;</a>
              </td>
              <td style="padding-left:8px;width:50%;">
                ${opts.receiptUrl
                  ? `<a href="${opts.receiptUrl}" style="display:block;text-align:center;background:#f8fafc;color:#374151;font-size:13px;font-weight:700;text-decoration:none;padding:12px 16px;border-radius:8px;border:1px solid #e2e8f0;">Stripe Receipt &rarr;</a>`
                  : `<a href="https://pawtenant.com/my-orders" style="display:block;text-align:center;background:#f8fafc;color:#374151;font-size:13px;font-weight:700;text-decoration:none;padding:12px 16px;border-radius:8px;border:1px solid #e2e8f0;">My Orders &rarr;</a>`
                }
              </td>
            </tr>
          </table>
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;text-align:center;">
            Keep this email as your payment record. Questions? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a5c4f;text-decoration:none;">${SUPPORT_EMAIL}</a>
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px;text-align:center;border-top:1px solid #f1f5f9;background:#f8fafc;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">${COMPANY_NAME} &nbsp;&middot;&nbsp; ESA Consultation &nbsp;&middot;&nbsp; <a href="https://${COMPANY_DOMAIN}" style="color:#1a5c4f;text-decoration:none;">${COMPANY_DOMAIN}</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function buildInternalNotificationHtml(order: Record<string, unknown>, amount: number, piId: string, matchedBy: string): string {
  const rows: Array<[string, string]> = [
    ["Order ID",       (order.confirmation_id as string) ?? "—"],
    ["Customer Name",  [`${order.first_name ?? ""}`, `${order.last_name ?? ""}`].join(" ").trim() || "—"],
    ["Email",          (order.email as string) ?? "—"],
    ["Phone",          (order.phone as string) || "—"],
    ["State",          (order.state as string) || "—"],
    ["Service Type",   (order.letter_type as string) === "psd" ? "PSD Letter" : "ESA Letter"],
    ["Plan",           (order.plan_type as string) || "One-Time Purchase"],
    ["Amount Paid",    `$${amount.toFixed(2)}`],
    ["Payment Status", "PAID (Admin Fix)"],
    ["Stripe PI ID",   piId],
    ["Matched By",     matchedBy],
    ["Timestamp",      new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET"],
  ];

  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#6b7280;width:160px;border-bottom:1px solid #f3f4f6;vertical-align:top;font-weight:600;">${label}</td>
      <td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500;">${value}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr>
        <td style="background:#1a5c4f;padding:28px 32px;text-align:center;">
          <img src="${LOGO_URL}" width="160" alt="PawTenant" style="display:block;margin:0 auto 14px;height:auto;" />
          <div style="display:inline-block;background:rgba(255,255,255,0.2);color:#ffffff;padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">PAYMENT LINKED (ADMIN FIX)</div>
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">Order Now Active &amp; Paid</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0 0 20px;font-size:14px;color:#374151;">An admin has manually linked a Stripe payment to this order. It is now active and ready for provider assignment.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:24px;">
            ${rowsHtml}
          </table>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="https://pawtenant.com/admin-orders" style="display:inline-block;background:#f97316;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:8px;">Open Admin Portal &rarr;</a>
            </td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant Internal Notification &mdash; <a href="https://pawtenant.com" style="color:#1a5c4f;text-decoration:none;">pawtenant.com</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

type EmailLogEntry = { type: string; sentAt: string; to: string; success: boolean; error?: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: {
    confirmationId?: string;
    stripePaymentIntentId?: string;
    stripeChargeId?: string;
    searchMode?: boolean;
    searchEmail?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { confirmationId, stripePaymentIntentId, stripeChargeId, searchMode, searchEmail } = body;

  if (!stripePaymentIntentId && !stripeChargeId) {
    return json({ error: "stripePaymentIntentId or stripeChargeId is required" }, 400);
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // @ts-ignore
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  let resolvedPiId = stripePaymentIntentId ?? "";
  let amountDollars = 0;
  let receiptUrl = "";
  let stripeEmail = "";
  let stripeConfirmationId = "";

  try {
    if (stripeChargeId) {
      const charge = await stripe.charges.retrieve(stripeChargeId);
      resolvedPiId = typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : (charge.payment_intent as { id: string })?.id ?? stripeChargeId;
      amountDollars = Math.round((charge.amount ?? 0) / 100);
      receiptUrl = charge.receipt_url ?? "";
      stripeEmail = charge.billing_details?.email ?? charge.receipt_email ?? "";
    } else {
      const pi = await stripe.paymentIntents.retrieve(resolvedPiId);
      if (pi.status !== "succeeded") {
        return json({ ok: false, error: `Payment intent status is "${pi.status}" — only "succeeded" can be linked` }, 400);
      }
      amountDollars = Math.round((pi.amount_received ?? pi.amount ?? 0) / 100);
      stripeEmail = pi.metadata?.email ?? pi.receipt_email ?? "";
      stripeConfirmationId = pi.metadata?.confirmation_id ?? "";
      if (pi.latest_charge) {
        try {
          const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge as { id: string }).id;
          const charge = await stripe.charges.retrieve(chargeId);
          receiptUrl = charge.receipt_url ?? "";
          if (!stripeEmail) stripeEmail = charge.billing_details?.email ?? "";
        } catch { /* non-critical */ }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: `Stripe lookup failed: ${msg}` }, 400);
  }

  let order: Record<string, unknown> | null = null;
  let matchedBy = "confirmation_id";

  const orderFields = "id, confirmation_id, email, first_name, last_name, phone, state, plan_type, delivery_speed, price, payment_intent_id, letter_type, doctor_name, email_log, status, coupon_code, coupon_discount, paid_at, payment_method";

  if (confirmationId) {
    const { data } = await supabase.from("orders").select(orderFields).eq("confirmation_id", confirmationId).maybeSingle();
    if (data) { order = data as unknown as Record<string, unknown>; matchedBy = "confirmation_id"; }
  }

  if (!order && stripeConfirmationId) {
    const { data } = await supabase.from("orders").select(orderFields).eq("confirmation_id", stripeConfirmationId).maybeSingle();
    if (data) { order = data as unknown as Record<string, unknown>; matchedBy = "stripe_metadata_confirmation_id"; }
  }

  if (!order) {
    const { data } = await supabase.from("orders").select(orderFields).eq("payment_intent_id", resolvedPiId).maybeSingle();
    if (data) { order = data as unknown as Record<string, unknown>; matchedBy = "payment_intent_id"; }
  }

  const emailToSearch = searchEmail || stripeEmail;
  if (!order && emailToSearch) {
    const { data } = await supabase
      .from("orders")
      .select(orderFields)
      .ilike("email", emailToSearch)
      .is("payment_intent_id", null)
      .neq("status", "refunded")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) { order = data as unknown as Record<string, unknown>; matchedBy = `email:${emailToSearch}`; }
  }

  if (searchMode && !order && emailToSearch) {
    const { data: candidates } = await supabase
      .from("orders")
      .select("id, confirmation_id, email, first_name, last_name, status, payment_intent_id, created_at, price")
      .ilike("email", emailToSearch)
      .order("created_at", { ascending: false })
      .limit(10);
    return json({
      ok: false,
      searchResults: candidates ?? [],
      stripeAmount: amountDollars,
      stripeEmail,
      stripeConfirmationId,
      resolvedPiId,
      error: "No unpaid order found — showing all orders for this email. Pick one and retry with confirmationId.",
    });
  }

  if (!order) {
    return json({
      ok: false,
      error: `No matching order found. Stripe PI: ${resolvedPiId}, email: ${stripeEmail || "unknown"}, cid_in_meta: ${stripeConfirmationId || "none"}`,
      stripeAmount: amountDollars,
      stripeEmail,
      stripeConfirmationId,
      resolvedPiId,
    }, 404);
  }

  const resolvedConfirmationId = order.confirmation_id as string;
  const alreadySynced = (order.payment_intent_id as string) === resolvedPiId && (order.status as string) === "processing";
  const paidAt = new Date().toISOString();

  // ── Update the order ──────────────────────────────────────────────────────
  const { error: updateErr } = await supabase.from("orders").update({
    status: "processing",
    payment_intent_id: resolvedPiId,
    price: amountDollars > 0 ? amountDollars : ((order.price as number) ?? amountDollars),
    paid_at: (order.paid_at as string) ?? paidAt,
    payment_failed_at: null,
    payment_failure_reason: null,
  }).eq("confirmation_id", resolvedConfirmationId);

  if (updateErr) {
    return json({ ok: false, error: `DB update failed: ${updateErr.message}` }, 500);
  }

  // ── Write status log (correct schema: new_status, changed_by, changed_at) ──
  try {
    await supabase.from("order_status_logs").insert({
      order_id: order.id,
      confirmation_id: resolvedConfirmationId,
      new_status: "processing",
      changed_by: "admin_fix",
      changed_at: paidAt,
    });
  } catch { /* non-critical */ }

  // ── Write audit log (correct schema: object_type, object_id) ─────────────
  try {
    await supabase.from("audit_logs").insert({
      action: "admin_payment_linked",
      object_type: "order",
      object_id: resolvedConfirmationId,
      details: {
        confirmation_id: resolvedConfirmationId,
        payment_intent_id: resolvedPiId,
        amount: amountDollars,
        previous_status: order.status,
        new_status: "processing",
        matched_by: matchedBy,
        timestamp: paidAt,
      },
    });
  } catch { /* non-critical */ }

  // ── Email sending ─────────────────────────────────────────────────────────
  const currentLog: EmailLogEntry[] = (order.email_log as EmailLogEntry[]) ?? [];
  const newLogEntries: EmailLogEntry[] = [];

  const alreadySentConfirmation = currentLog.some((e) => e.type === "order_confirmation" && e.success === true);
  const alreadySentReceipt      = currentLog.some((e) => e.type === "payment_receipt"   && e.success === true);
  const alreadySentInternal     = currentLog.some((e) => e.type === "internal_notification" && e.success === true);

  if (!alreadySentConfirmation) {
    try {
      const confRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/resend-confirmation-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ confirmationId: resolvedConfirmationId, force: false }),
      });
      const confData = await confRes.json() as { ok: boolean; emailSent?: boolean; skipped?: boolean; error?: string };
      if (confData.ok && confData.emailSent) {
        console.info(`[fix-order-payment] ✓ Order confirmation sent to ${order.email}`);
      } else if (confData.skipped) {
        console.info(`[fix-order-payment] Confirmation already sent — skipped`);
      } else {
        console.warn(`[fix-order-payment] Confirmation failed: ${confData.error}`);
        newLogEntries.push({ type: "order_confirmation_admin_fix", sentAt: paidAt, to: order.email as string, success: false, error: confData.error });
      }
    } catch (err) {
      console.error("[fix-order-payment] resend-confirmation-email call failed:", err);
    }
  }

  if (!alreadySentReceipt) {
    const paidAtFormatted = new Date(paidAt).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });

    const receiptHtml = buildPaymentReceiptHtml({
      firstName: (order.first_name as string) || "",
      confirmationId: resolvedConfirmationId,
      amountFormatted: `$${amountDollars.toFixed(2)}`,
      paymentIntentId: resolvedPiId,
      paymentMethod: (order.payment_method as string) || "card",
      receiptUrl,
      paidAt: paidAtFormatted,
    });

    const receiptResult = await sendViaResend({
      to: order.email as string,
      subject: `Payment Receipt — $${amountDollars.toFixed(2)} — ${COMPANY_NAME}`,
      html: receiptHtml,
    });

    newLogEntries.push({
      type: "payment_receipt",
      sentAt: paidAt,
      to: order.email as string,
      success: receiptResult.sent,
      ...(receiptResult.error && !receiptResult.sent ? { error: receiptResult.error } : {}),
    });
  }

  if (!alreadySentInternal) {
    const freshOrder = { ...order, payment_intent_id: resolvedPiId };
    const internalHtml = buildInternalNotificationHtml(freshOrder as unknown as Record<string, unknown>, amountDollars, resolvedPiId, matchedBy);
    const internalResult = await sendViaResend({
      to: INTERNAL_EMAIL,
      subject: `[PawTenant] Order Activated (Admin Fix) — ${resolvedConfirmationId}${matchedBy !== "confirmation_id" ? " [FALLBACK]" : ""}`,
      html: internalHtml,
    });

    newLogEntries.push({
      type: "internal_notification",
      sentAt: paidAt,
      to: INTERNAL_EMAIL,
      success: internalResult.sent,
      ...(internalResult.error ? { error: internalResult.error } : {}),
    });
  }

  if (newLogEntries.length > 0) {
    try {
      const { data: latestOrder } = await supabase.from("orders").select("email_log").eq("confirmation_id", resolvedConfirmationId).maybeSingle();
      const latestLog: EmailLogEntry[] = (latestOrder?.email_log as EmailLogEntry[]) ?? currentLog;
      await supabase.from("orders").update({ email_log: [...latestLog, ...newLogEntries] }).eq("confirmation_id", resolvedConfirmationId);
    } catch { /* non-critical */ }
  }

  return json({
    ok: true,
    message: `Payment linked and emails triggered for ${resolvedConfirmationId}`,
    paymentIntentId: resolvedPiId,
    confirmationId: resolvedConfirmationId,
    priceUpdated: amountDollars,
    alreadySynced,
    matchedBy,
    emailsTriggered: !alreadySentConfirmation || !alreadySentReceipt || !alreadySentInternal,
  });
});
