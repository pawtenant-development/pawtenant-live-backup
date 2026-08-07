// manage-custom-payment-request — ORDER-LINKED-CUSTOM-STRIPE-INVOICE-001
//
// Post-creation Admin actions on a custom payment request:
//   action = "void"  → void the Stripe invoice so the customer's link stops
//                      accepting payment. Only Stripe can decide this is legal;
//                      a PAID invoice cannot be voided and we do not pretend
//                      otherwise.
//   action = "send"  → email the customer the payment request.
//   action = "sync"  → re-read Stripe and reconcile local status (recovery path
//                      for a webhook that was missed).
//
// Creation lives in create-custom-payment-request. This function deliberately
// cannot create anything — an admin who can void must not be able to mint a new
// charge through the same endpoint by accident.
//
// ACTOR: resolved from the JWT. Body actor fields carry no authority.

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAuditActor } from "../_shared/auditActor.ts";
// The webhook owns reconciliation; sync reuses it rather than reimplementing a
// second, subtly different version of the same business rules.
import { reconcileCustomPaymentInvoice } from "../_shared/reconcileCustomPayment.ts";
import { reserveEmailSend, finalizeEmailSend } from "../_shared/reserveEmailSend.ts";
import { sendEmailViaResend } from "../_shared/resendClient.ts";
import {
  evaluateNotificationSuppression,
  suppressForFixtureOrder,
} from "../_shared/testNotificationSuppression.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM = "PawTenant <hello@pawtenant.com>";
const HEADER_BG = "#4a9e8a";
const ACCENT = "#1a5c4f";
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function esc(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** The customer-facing request email. Carries the order reference, the amount,
 *  the reason and the secure CTA — and nothing internal. */
function buildEmail(o: {
  firstName: string; confirmationId: string; amount: string;
  description: string; url: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Payment request — PawTenant</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <tr><td style="background:${HEADER_BG};padding:28px 32px;text-align:center;">
    <img src="${LOGO_URL}" alt="PawTenant" height="40" style="height:40px;width:auto;display:block;margin:0 auto 12px;" />
    <h1 style="color:#ffffff;font-size:18px;font-weight:800;margin:0;">Payment Request</h1>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">Hi <strong>${esc(o.firstName)}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
      PawTenant has issued a payment request on your order. You can pay securely using the button below.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px;"><tr><td style="padding:16px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:3px 0;"><span style="font-size:12px;color:#6b7280;width:120px;display:inline-block;">Order</span>
          <strong style="font-size:13px;color:${ACCENT};font-family:monospace;">${esc(o.confirmationId)}</strong></td></tr>
        <tr><td style="padding:3px 0;"><span style="font-size:12px;color:#6b7280;width:120px;display:inline-block;">Amount due</span>
          <strong style="font-size:15px;color:${ACCENT};">${esc(o.amount)}</strong></td></tr>
        <tr><td style="padding:3px 0;"><span style="font-size:12px;color:#6b7280;width:120px;display:inline-block;">For</span>
          <strong style="font-size:13px;color:${ACCENT};">${esc(o.description)}</strong></td></tr>
      </table>
    </td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="${o.url}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:10px;">Pay Securely &rarr;</a>
    </td></tr></table>
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
      Payment is processed securely by Stripe. If the button doesn't work, copy this link:<br/>
      <a href="${o.url}" style="color:${ACCENT};word-break:break-all;">${o.url}</a>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#6b7280;text-align:center;">
      Questions? Reply to this email or contact <a href="mailto:hello@pawtenant.com" style="color:${ACCENT};">hello@pawtenant.com</a>.
    </p>
  </td></tr>
  <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">&copy; ${new Date().getFullYear()} PawTenant</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!supabaseUrl || !serviceKey || !stripeKey) return json(500, { ok: false, error: "Server not configured" });

  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer) return json(401, { ok: false, error: "Missing bearer token" });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: { requestId?: string; action?: string; operationToken?: string };
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "Expected JSON body" }); }

  const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
  if (userErr || !userResp.user) return json(401, { ok: false, error: "Authentication required" });
  const { data: profile } = await admin.from("doctor_profiles")
    .select("is_admin, is_active").eq("user_id", userResp.user.id).maybeSingle();
  const prof = profile as { is_admin?: boolean; is_active?: boolean } | null;
  if (!prof || prof.is_admin !== true || prof.is_active === false) {
    return json(403, { ok: false, error: "Admin privileges required" });
  }
  const actor = await resolveAuditActor(req, admin);

  const requestId = (body.requestId ?? "").toString().trim();
  const action = (body.action ?? "").toString().trim();
  if (!requestId) return json(400, { ok: false, error: "requestId is required" });
  if (!["void", "send", "sync"].includes(action)) {
    return json(400, { ok: false, error: `Unsupported action: ${action}` });
  }

  const { data: reqRaw } = await admin.from("order_custom_payment_requests")
    .select("*").eq("id", requestId).maybeSingle();
  const cpr = reqRaw as Record<string, unknown> | null;
  if (!cpr) return json(404, { ok: false, error: "Payment request not found" });

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const status = cpr.status as string;
  const invoiceId = cpr.stripe_invoice_id as string | null;
  const confirmationId = cpr.confirmation_id as string | null;
  const orderId = cpr.order_id as string;

  // ── VOID ──────────────────────────────────────────────────────────────────
  if (action === "void") {
    // A settled payment is not voidable. Refunding is the correct remedy and it
    // goes through the existing refund architecture, not through here.
    if (status === "paid" || cpr.paid_at) {
      return json(409, { ok: false, error: "This request is already paid and cannot be voided. Use a refund instead." });
    }
    // Idempotent: voiding an already-void request is a no-op success.
    if (status === "void") return json(200, { ok: true, alreadyVoid: true, status: "void" });
    if (!invoiceId) return json(409, { ok: false, error: "No Stripe invoice to void" });

    try {
      await stripe.invoices.voidInvoice(invoiceId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json(502, { ok: false, error: `Stripe void failed: ${msg}` });
    }

    const nowIso = new Date().toISOString();
    await admin.from("order_custom_payment_requests")
      .update({ status: "void", voided_at: nowIso })
      .eq("id", requestId).neq("status", "paid");

    await admin.from("audit_logs").insert({
      actor_id: actor.id, actor_name: actor.name, actor_role: actor.role, actor_type: actor.type,
      category: "payments", source: "admin_portal",
      object_type: "order", object_id: confirmationId, order_id: orderId,
      action: "custom_payment_request_voided",
      description: `${actor.name} voided the $${((cpr.amount_cents as number) / 100).toFixed(2)} custom payment request for order ${confirmationId}. The customer's payment link no longer accepts payment.`,
      metadata: { custom_payment_request_id: requestId, stripe_invoice_id: invoiceId, confirmation_id: confirmationId },
    });
    return json(200, { ok: true, status: "void" });
  }

  // ── SYNC (recovery when a webhook was missed) ────────────────────────────
  // This must be a FULL recovery, not just a status remap. A sync that only
  // flipped status to "paid" left the request looking settled while the
  // purpose-specific reconciliation, the payment_intent id and the
  // `custom_payment_received` audit row were all still missing — a silently
  // half-reconciled payment, which is worse than an obviously stuck one.
  if (action === "sync") {
    if (!invoiceId) return json(409, { ok: false, error: "No Stripe invoice to sync" });
    const inv = await stripe.invoices.retrieve(invoiceId);

    if (inv.status === "paid") {
      // Exactly the same code path the webhook runs, so a recovered payment is
      // indistinguishable from one that reconciled first time.
      const handled = await reconcileCustomPaymentInvoice(admin, inv);
      return json(200, { ok: true, status: "paid", stripeStatus: inv.status, reconciled: handled ?? undefined });
    }

    const map: Record<string, string> = { void: "void", open: "open", draft: "draft", uncollectible: "failed" };
    const next = map[inv.status ?? ""] ?? status;
    const patch: Record<string, unknown> = { status: next };
    if (next === "void" && !cpr.voided_at) patch.voided_at = new Date().toISOString();
    await admin.from("order_custom_payment_requests").update(patch).eq("id", requestId);
    return json(200, { ok: true, status: next, stripeStatus: inv.status });
  }

  // ── SEND the request email ───────────────────────────────────────────────
  if (status === "void" || status === "paid") {
    return json(409, { ok: false, error: `Cannot send a request that is ${status}.` });
  }
  const hostedUrl = cpr.hosted_url as string | null;
  if (!hostedUrl) return json(409, { ok: false, error: "No hosted payment URL on this request" });

  const { data: orderRaw } = await admin.from("orders")
    .select("email, first_name").eq("id", orderId).maybeSingle();
  const order = orderRaw as { email: string | null; first_name: string | null } | null;
  if (!order?.email) return json(409, { ok: false, error: "Order has no customer email" });

  const amountLabel = `$${((cpr.amount_cents as number) / 100).toFixed(2)}`;
  const subject = `Payment request for your PawTenant order ${confirmationId}`;
  const operationToken = (body.operationToken ?? "").toString().trim();

  // Claim before sending, same durable pattern as every other send path.
  const reservation = await reserveEmailSend({
    supabase: admin,
    orderId, confirmationId,
    to: order.email, from: FROM, subject,
    slug: "custom_payment_request",
    dedupeKey: `${confirmationId}:custom_payment_request:${requestId}${operationToken ? `:${operationToken}` : ""}`,
    templateSource: "hardcoded",
    sentBy: actor.name,
    staleClaimMinutes: 5,
  });
  if (!reservation.proceed) {
    return json(200, { ok: true, duplicate: true, reason: "this payment request was already emailed" });
  }

  const suppression = suppressForFixtureOrder(order.email)
    ? { suppressed: true, reason: "TEST fixture order (reserved customer TLD)" }
    : evaluateNotificationSuppression(order.email);
  if (suppression.suppressed) {
    await finalizeEmailSend(admin, reservation.rowId, {
      success: false, status: "terminal_failed", errorMessage: `suppressed: ${suppression.reason}`,
    });
    return json(200, { ok: true, emailSent: false, suppressed: true, reason: suppression.reason });
  }

  const html = buildEmail({
    firstName: order.first_name?.trim() || "there",
    confirmationId: confirmationId ?? "",
    amount: amountLabel,
    description: cpr.customer_description as string,
    url: hostedUrl,
  });

  const result = await sendEmailViaResend({ from: FROM, to: order.email, subject, html });
  await finalizeEmailSend(admin, reservation.rowId, {
    success: result.ok,
    status: result.ok ? "sent" : ((result as { status: number }).status >= 500 ? "retryable_failed" : "terminal_failed"),
    body: result.ok ? html : null,
    resendId: result.ok ? result.messageId : null,
    errorMessage: result.ok ? null : (result as { error: string }).error,
  });

  if (result.ok) {
    await admin.from("order_custom_payment_requests")
      .update({ sent_at: new Date().toISOString(), provider_message_id: result.messageId })
      .eq("id", requestId);
  }

  await admin.from("audit_logs").insert({
    actor_id: actor.id, actor_name: actor.name, actor_role: actor.role, actor_type: actor.type,
    category: "payments", source: "admin_portal",
    object_type: "order", object_id: confirmationId, order_id: orderId,
    action: result.ok ? "custom_payment_request_sent" : "custom_payment_request_send_failed",
    description: result.ok
      ? `${actor.name} emailed the ${amountLabel} payment request to the customer for order ${confirmationId}.`
      : `${actor.name} attempted to email the ${amountLabel} payment request for order ${confirmationId}, but the send failed.`,
    metadata: { custom_payment_request_id: requestId, confirmation_id: confirmationId, delivered: result.ok },
  });

  return json(result.ok ? 200 : 502, {
    ok: result.ok, emailSent: result.ok,
    error: result.ok ? undefined : (result as { error: string }).error,
  });
});
