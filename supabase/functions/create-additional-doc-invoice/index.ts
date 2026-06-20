// create-additional-doc-invoice
//
// Tracked "$40 Additional Documentation" add-on tied to an EXISTING paid order.
// Use case: a customer/clinic/landlord needs extra forms completed by the
// provider AFTER the original ESA/PSD letter is done.
//
// This NEVER creates a brand-new ESA/PSD order. It:
//   1. Creates (or reuses a pending) row in
//      public.order_additional_documentation_requests.
//   2. Creates a Stripe Checkout Session for $40 with discriminator metadata
//      (type=additional_documentation) on BOTH the session AND the payment
//      intent so the webhook can route it without touching the parent order.
//   3. Emails the customer the secure payment link (logged to communications).
//
// Payment completion is handled by stripe-webhook (marks request paid + sets
// the parent order back to "under-review"). This function only initiates.
//
// Actions (POST body { action }):
//   "create" (default) — admin OR owning customer initiates an invoice.
//   "list"             — list requests for an order (admin or owning customer).
//   "cancel"           — admin cancels a pending request.
//
// Auth model mirrors admin-upload-document:
//   - bearer === service role key  → trusted admin context.
//   - otherwise getUser(bearer):
//       * doctor_profiles.is_admin → admin path.
//       * else customer path — caller's email MUST match the order email.

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reserveEmailSend, finalizeEmailSend } from "../_shared/logEmailComm.ts";
import { completeAdditionalDocPayment, ensureAddonEarning } from "../_shared/completeAdditionalDocPayment.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADDON_AMOUNT_CENTS = 4000; // $40
const COMPANY_NAME = "PawTenant";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";
const DEFAULT_SITE = "https://pawtenant.com";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function buildInvoiceEmailHtml(opts: {
  firstName: string;
  confirmationId: string;
  payUrl: string;
  customerMessage?: string | null;
}): string {
  const note = opts.customerMessage
    ? `<tr><td style="padding:0 32px 8px;"><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;font-size:13px;color:#9a3412;line-height:1.6;"><strong>Note from our team:</strong><br/>${opts.customerMessage}</div></td></tr>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:560px;width:100%;">
    <tr><td style="background:#1a5c4f;padding:28px 32px;text-align:center;">
      <img src="${LOGO_URL}" width="150" alt="${COMPANY_NAME}" style="display:block;margin:0 auto 12px;height:auto;" />
      <div style="display:inline-block;background:rgba(255,255,255,0.18);color:#ffffff;padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">ADDITIONAL DOCUMENTATION</div>
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">Additional Documentation Request</h1>
    </td></tr>
    <tr><td style="padding:28px 32px 8px;">
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">Hi <strong>${opts.firstName || "there"}</strong>, additional documentation has been requested for your housing accommodation file (order <strong>${opts.confirmationId}</strong>).</p>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">Completing additional documentation or forms is a <strong>$40</strong> service. Provider review is required. To continue, please complete your secure payment below.</p>
    </td></tr>
    ${note}
    <tr><td style="padding:8px 32px 4px;" align="center">
      <a href="${opts.payUrl}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">Pay $40 Securely &rarr;</a>
    </td></tr>
    <tr><td style="padding:18px 32px 4px;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.06em;">What happens next</p>
        <p style="margin:0 0 6px;font-size:13px;color:#475569;line-height:1.7;">1. After payment, <strong>reply to this email and attach the form</strong> you need completed — or upload it in your <a href="${DEFAULT_SITE}/my-orders" style="color:#1a5c4f;">customer portal</a>.</p>
        <p style="margin:0 0 6px;font-size:13px;color:#475569;line-height:1.7;">2. Your order will be placed back <strong>under review</strong> and a provider will review the request.</p>
        <p style="margin:0;font-size:13px;color:#475569;line-height:1.7;">3. We complete the documentation that is appropriate to your file.</p>
      </div>
    </td></tr>
    <tr><td style="padding:16px 32px 24px;">
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;">Please attach the specific form you need completed. Provider review is required and is based on a clinical assessment of your file. We cannot guarantee landlord or third-party acceptance of any document. Questions? Reply here or email <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a5c4f;">${SUPPORT_EMAIL}</a>.</p>
    </td></tr>
    <tr><td style="padding:14px 32px;text-align:center;border-top:1px solid #f1f5f9;background:#f8fafc;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">${COMPANY_NAME} &middot; <a href="${DEFAULT_SITE}" style="color:#1a5c4f;text-decoration:none;">pawtenant.com</a></p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json(500, { ok: false, error: "Server not configured" });

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!bearer) return json(401, { ok: false, error: "Missing bearer token" });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: {
    action?: string;
    orderId?: string;
    confirmationId?: string;
    requestId?: string;
    adminNote?: string;
    customerMessage?: string;
    siteUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const action = body.action ?? "create";

  // ── Resolve caller identity ──────────────────────────────────────────────
  let isAdmin = false;
  let callerEmail = "";
  let callerUserId: string | null = null;
  let adminName: string | null = null;
  if (bearer === serviceKey) {
    isAdmin = true;
  } else {
    const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
    if (userErr || !userResp.user) return json(401, { ok: false, error: "Invalid token" });
    callerUserId = userResp.user.id;
    callerEmail = (userResp.user.email ?? "").toLowerCase();
    const { data: profile } = await admin
      .from("doctor_profiles")
      .select("is_admin")
      .eq("user_id", callerUserId)
      .maybeSingle();
    isAdmin = !!(profile && (profile as { is_admin?: boolean }).is_admin);
    if (isAdmin) {
      const { data: tm } = await admin
        .from("team_members")
        .select("full_name")
        .eq("user_id", callerUserId)
        .maybeSingle();
      adminName = (tm as { full_name?: string } | null)?.full_name ?? userResp.user.email ?? "Admin";
    }
  }

  // ── Resolve the parent order ─────────────────────────────────────────────
  let orderQuery = admin.from("orders").select("id, confirmation_id, email, first_name, status, doctor_status").limit(1);
  if (body.orderId) orderQuery = orderQuery.eq("id", body.orderId);
  else if (body.confirmationId) orderQuery = orderQuery.eq("confirmation_id", body.confirmationId);
  else return json(400, { ok: false, error: "orderId or confirmationId required" });

  const { data: order, error: orderErr } = await orderQuery.maybeSingle();
  if (orderErr || !order) return json(404, { ok: false, error: "Order not found" });

  const orderRow = order as {
    id: string; confirmation_id: string | null; email: string | null;
    first_name: string | null; status: string | null; doctor_status: string | null;
  };
  const orderEmail = (orderRow.email ?? "").toLowerCase();

  // Customer path: caller must own the order.
  if (!isAdmin) {
    if (!callerEmail || callerEmail !== orderEmail) {
      return json(403, { ok: false, error: "Not authorized for this order" });
    }
  }

  // Self-heal: for any pending request with a Stripe session, ask Stripe if it
  // is actually paid and finalize it. This makes completion NOT depend on the
  // webhook being delivered (the webhook endpoint is not reliably subscribed to
  // hosted-checkout events — same reason check-payment-status exists for Klarna).
  async function reconcilePending(rows: Array<Record<string, unknown>>): Promise<boolean> {
    if (!stripeKey) return false;
    // @ts-ignore — Stripe types under Deno
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    let changed = false;
    for (const r of rows) {
      if ((r.status as string) !== "pending") continue;
      const sid = r.stripe_checkout_session_id as string | null;
      if (!sid) continue;
      try {
        const session = await stripe.checkout.sessions.retrieve(sid);
        const paid = session.payment_status === "paid" || session.status === "complete";
        if (!paid) continue;
        const piId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent as { id?: string } | null)?.id ?? null;
        const res = await completeAdditionalDocPayment(admin, {
          requestId: r.id as string,
          parentOrderId: r.order_id as string,
          sessionId: sid,
          piId,
          amountCents: session.amount_total ?? (r.amount_cents as number),
          source: "reconcile",
        });
        if (res.status === "completed") changed = true;
      } catch (e) {
        console.warn("[create-addon] reconcile probe failed for", r.id, e instanceof Error ? e.message : String(e));
      }
    }
    return changed;
  }

  // ── LIST (auto-reconciles pending requests against Stripe) ─────────────────
  if (action === "list" || action === "reconcile") {
    const { data: rows0, error } = await admin
      .from("order_additional_documentation_requests")
      .select("*")
      .eq("order_id", orderRow.id)
      .order("created_at", { ascending: false });
    if (error) return json(500, { ok: false, error: error.message });
    let rows = rows0 ?? [];
    const changed = await reconcilePending(rows as Array<Record<string, unknown>>);
    if (changed) {
      const { data: refreshed } = await admin
        .from("order_additional_documentation_requests")
        .select("*")
        .eq("order_id", orderRow.id)
        .order("created_at", { ascending: false });
      rows = refreshed ?? rows;
    }
    // Self-heal provider payout: ensure every PAID add-on request has its
    // provider earning recorded (covers the case where payment completed before
    // a provider was assigned). Idempotent + best-effort — never blocks the list.
    for (const r of rows as Array<Record<string, unknown>>) {
      if ((r.status as string) === "paid") {
        try { await ensureAddonEarning(admin, r.id as string); } catch { /* non-critical */ }
      }
    }
    return json(200, { ok: true, requests: rows, reconciled: changed });
  }

  // ── RESUME (owning customer OR admin) ─────────────────────────────────────
  // Returns a usable Stripe Checkout URL for the EXISTING pending request so a
  // customer can finish an abandoned payment — WITHOUT creating a duplicate
  // request row and WITHOUT sending another email. Reuses the existing session
  // while it is still open; refreshes it on the same row once expired; or, if
  // the session is actually already paid, reconciles instead.
  if (action === "resume") {
    if (!stripeKey) return json(500, { ok: false, error: "Stripe not configured" });
    const { data: pending } = await admin
      .from("order_additional_documentation_requests")
      .select("*")
      .eq("order_id", orderRow.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!pending) return json(409, { ok: false, error: "No pending request to resume" });
    const pr = pending as { id: string; stripe_checkout_session_id: string | null; amount_cents: number };
    // @ts-ignore — Stripe types under Deno
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    if (pr.stripe_checkout_session_id) {
      try {
        const s = await stripe.checkout.sessions.retrieve(pr.stripe_checkout_session_id);
        const paid = s.payment_status === "paid" || s.status === "complete";
        if (paid) {
          const piId = typeof s.payment_intent === "string"
            ? s.payment_intent
            : (s.payment_intent as { id?: string } | null)?.id ?? null;
          await completeAdditionalDocPayment(admin, {
            requestId: pr.id, parentOrderId: orderRow.id, sessionId: pr.stripe_checkout_session_id,
            piId, amountCents: s.amount_total ?? pr.amount_cents, source: "reconcile",
          });
          return json(200, { ok: true, alreadyPaid: true, request: pending });
        }
        if (s.status === "open" && s.url) {
          return json(200, { ok: true, checkoutUrl: s.url, request: pending });
        }
      } catch (e) {
        console.warn("[create-addon] resume retrieve failed", e instanceof Error ? e.message : String(e));
      }
    }
    // Expired / no session → create a fresh one bound to the SAME request row.
    const rSite = (body.siteUrl && /^https?:\/\//.test(body.siteUrl)) ? body.siteUrl.replace(/\/$/, "") : DEFAULT_SITE;
    const rMeta = {
      type: "additional_documentation", request_id: pr.id, parent_order_id: orderRow.id,
      parent_confirmation_id: orderRow.confirmation_id ?? "", customer_email: orderEmail,
    };
    let rSession;
    try {
      rSession = await stripe.checkout.sessions.create({
        mode: "payment", payment_method_types: ["card"], customer_email: orderEmail,
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: ADDON_AMOUNT_CENTS, product_data: { name: "Additional Documentation — Provider Form Completion", description: `Add-on for order ${orderRow.confirmation_id ?? ""}`.trim() } } }],
        submit_type: "pay",
        success_url: `${rSite}/my-orders?addon=success&order=${encodeURIComponent(orderRow.confirmation_id ?? "")}`,
        cancel_url: `${rSite}/my-orders?addon=cancelled&order=${encodeURIComponent(orderRow.confirmation_id ?? "")}`,
        metadata: rMeta, payment_intent_data: { metadata: rMeta },
      });
    } catch (err) {
      return json(502, { ok: false, error: `Stripe session failed: ${err instanceof Error ? err.message : String(err)}` });
    }
    await admin.from("order_additional_documentation_requests").update({ stripe_checkout_session_id: rSession.id }).eq("id", pr.id);
    return json(200, { ok: true, checkoutUrl: rSession.url, request: { ...pending, stripe_checkout_session_id: rSession.id } });
  }

  // ── CANCEL (admin only) ──────────────────────────────────────────────────
  if (action === "cancel") {
    if (!isAdmin) return json(403, { ok: false, error: "Admin only" });
    if (!body.requestId) return json(400, { ok: false, error: "requestId required" });
    const { data: updated, error } = await admin
      .from("order_additional_documentation_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", body.requestId)
      .eq("order_id", orderRow.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (error) return json(500, { ok: false, error: error.message });
    if (!updated) return json(409, { ok: false, error: "No pending request to cancel" });
    return json(200, { ok: true, request: updated });
  }

  // ── REFUND ADD-ON ONLY (admin) ─────────────────────────────────────────────
  // Refunds ONLY the $40 additional-documentation payment. Does NOT cancel or
  // refund the original ESA/PSD order, and does NOT change the parent order
  // status. Idempotent (refunded short-circuits; only a paid row is refundable).
  if (action === "refund") {
    if (!isAdmin) return json(403, { ok: false, error: "Admin only" });
    if (!stripeKey) return json(500, { ok: false, error: "Stripe not configured" });
    if (!body.requestId) return json(400, { ok: false, error: "requestId required" });
    const { data: reqRow } = await admin
      .from("order_additional_documentation_requests")
      .select("*")
      .eq("id", body.requestId)
      .eq("order_id", orderRow.id)
      .maybeSingle();
    if (!reqRow) return json(404, { ok: false, error: "Request not found" });
    const rr = reqRow as { id: string; status: string; stripe_payment_intent_id: string | null; amount_cents: number; stripe_refund_id: string | null };
    if (rr.status === "refunded") return json(200, { ok: true, alreadyRefunded: true, request: reqRow });
    if (rr.status !== "paid" || !rr.stripe_payment_intent_id) {
      return json(409, { ok: false, error: "Only a paid add-on with a payment intent can be refunded." });
    }
    // @ts-ignore — Stripe types under Deno
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    let refund;
    try {
      refund = await stripe.refunds.create({ payment_intent: rr.stripe_payment_intent_id });
    } catch (err) {
      return json(502, { ok: false, error: `Stripe refund failed: ${err instanceof Error ? err.message : String(err)}` });
    }
    const refundedAt = new Date().toISOString();
    const { data: updated } = await admin
      .from("order_additional_documentation_requests")
      .update({ status: "refunded", refunded_at: refundedAt, stripe_refund_id: refund.id, refund_amount_cents: refund.amount ?? rr.amount_cents })
      .eq("id", rr.id)
      .neq("status", "refunded")
      .select()
      .maybeSingle();
    const amtFmt = `$${((refund.amount ?? rr.amount_cents) / 100).toFixed(2)}`;
    try {
      await admin.from("audit_logs").insert({
        action: "additional_documentation_refunded",
        object_type: "order",
        object_id: orderRow.confirmation_id,
        actor_id: callerUserId,
        actor_name: adminName,
        description: `Additional documentation ${amtFmt} refunded by ${adminName ?? "admin"} (add-on only; original order untouched)`,
        metadata: { request_id: rr.id, order_id: orderRow.id, stripe_refund_id: refund.id, payment_intent_id: rr.stripe_payment_intent_id, amount_cents: refund.amount ?? rr.amount_cents, refunded_at: refundedAt },
      });
    } catch { /* non-critical */ }
    // Customer refund confirmation (logged to Comms; deduped per refund).
    try {
      const reserve = await reserveEmailSend({
        supabase: admin, orderId: orderRow.id, confirmationId: orderRow.confirmation_id, to: orderEmail,
        from: FROM_ADDRESS, subject: "Refund Processed — Additional Documentation — PawTenant",
        slug: "additional_documentation_refund", dedupeKey: `${rr.id}:additional_documentation_refund`,
        templateSource: "hardcoded", sentBy: "admin",
      });
      if (reserve.proceed) {
        const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#374151;"><img src="${LOGO_URL}" width="140" alt="${COMPANY_NAME}" style="display:block;margin-bottom:16px;"/><h2 style="color:#0f172a;">Refund processed</h2><p>Hi ${orderRow.first_name || "there"}, we've refunded <strong>${amtFmt}</strong> for the additional documentation request on order <strong>${orderRow.confirmation_id}</strong>. Refunds typically appear on your statement within 5–10 business days. Questions? Reply to this email or contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p></div>`;
        const apiKey = Deno.env.get("RESEND_API_KEY");
        let sent = false; let errMsg: string | null = null;
        if (!apiKey) { errMsg = "RESEND_API_KEY not set"; }
        else {
          const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM_ADDRESS, to: [orderEmail], subject: "Refund Processed — Additional Documentation — PawTenant", html }) });
          sent = res.ok; if (!res.ok) errMsg = `Resend ${res.status}`;
        }
        await finalizeEmailSend(admin, reserve.rowId, { success: sent, body: html, errorMessage: errMsg });
      }
    } catch { /* non-critical */ }
    return json(200, { ok: true, refunded: true, refundId: refund.id, amount: refund.amount, request: updated ?? reqRow });
  }

  // ── CREATE ───────────────────────────────────────────────────────────────
  if (action !== "create") return json(400, { ok: false, error: `Unknown action: ${action}` });
  if (!stripeKey) return json(500, { ok: false, error: "Stripe not configured" });
  if (!orderEmail) return json(400, { ok: false, error: "Order has no email on file" });

  // Duplicate guard: refuse a second PENDING invoice for the same order.
  const { data: existingPending } = await admin
    .from("order_additional_documentation_requests")
    .select("*")
    .eq("order_id", orderRow.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingPending) {
    return json(200, {
      ok: true,
      duplicate: true,
      message: "A pending additional-documentation invoice already exists for this order.",
      request: existingPending,
    });
  }

  // Insert the tracking row first (so we always have a request_id for metadata).
  const { data: inserted, error: insertErr } = await admin
    .from("order_additional_documentation_requests")
    .insert({
      order_id: orderRow.id,
      confirmation_id: orderRow.confirmation_id,
      customer_email: orderEmail,
      amount_cents: ADDON_AMOUNT_CENTS,
      currency: "usd",
      status: "pending",
      requested_by: isAdmin ? "admin" : "customer",
      requested_by_admin_id: isAdmin ? callerUserId : null,
      requested_by_admin_name: isAdmin ? adminName : null,
      customer_message: body.customerMessage?.trim() || null,
      admin_note: body.adminNote?.trim() || null,
    })
    .select()
    .maybeSingle();
  if (insertErr || !inserted) {
    return json(500, { ok: false, error: `Could not create request: ${insertErr?.message ?? "unknown"}` });
  }
  const request = inserted as { id: string; confirmation_id: string | null };
  const requestId = request.id;

  // Create the Stripe Checkout Session. Discriminator metadata is set on BOTH
  // the session and the payment intent so the webhook routes it safely. We do
  // NOT put confirmation_id in metadata (only parent_confirmation_id) so a
  // missed interception can never mark the parent order paid.
  // @ts-ignore — Stripe types under Deno
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const site = (body.siteUrl && /^https?:\/\//.test(body.siteUrl)) ? body.siteUrl.replace(/\/$/, "") : DEFAULT_SITE;
  const meta = {
    type: "additional_documentation",
    request_id: requestId,
    parent_order_id: orderRow.id,
    parent_confirmation_id: orderRow.confirmation_id ?? "",
    customer_email: orderEmail,
  };

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: orderEmail,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: ADDON_AMOUNT_CENTS,
          product_data: {
            name: "Additional Documentation — Provider Form Completion",
            description: `Add-on for order ${orderRow.confirmation_id ?? ""}`.trim(),
          },
        },
      }],
      submit_type: "pay",
      success_url: `${site}/my-orders?addon=success&order=${encodeURIComponent(orderRow.confirmation_id ?? "")}`,
      cancel_url: `${site}/my-orders?addon=cancelled&order=${encodeURIComponent(orderRow.confirmation_id ?? "")}`,
      metadata: meta,
      payment_intent_data: { metadata: meta },
    });
  } catch (err) {
    // Roll the request back to cancelled so it doesn't linger as a dead pending.
    await admin.from("order_additional_documentation_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), admin_note: `Stripe session create failed: ${err instanceof Error ? err.message : String(err)}` })
      .eq("id", requestId);
    return json(502, { ok: false, error: `Stripe session failed: ${err instanceof Error ? err.message : String(err)}` });
  }

  await admin.from("order_additional_documentation_requests")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", requestId);

  // Email the customer the secure payment link (logged + deduped in Comms).
  let emailSent = false;
  if (session.url) {
    const reserve = await reserveEmailSend({
      supabase: admin,
      orderId: orderRow.id,
      confirmationId: orderRow.confirmation_id,
      to: orderEmail,
      from: FROM_ADDRESS,
      subject: "Additional Documentation Request — PawTenant",
      slug: "additional_documentation_invoice",
      dedupeKey: `${requestId}:additional_documentation_invoice`,
      templateSource: "hardcoded",
      sentBy: isAdmin ? "admin" : "customer",
    });
    if (reserve.proceed) {
      const html = buildInvoiceEmailHtml({
        firstName: orderRow.first_name ?? "",
        confirmationId: orderRow.confirmation_id ?? "",
        payUrl: session.url,
        customerMessage: body.customerMessage?.trim() || null,
      });
      try {
        const apiKey = Deno.env.get("RESEND_API_KEY");
        let sent = false; let errMsg: string | null = null;
        if (!apiKey) {
          errMsg = "RESEND_API_KEY not set";
        } else {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: FROM_ADDRESS, to: [orderEmail], subject: "Additional Documentation Request — PawTenant", html }),
          });
          sent = res.ok;
          if (!res.ok) errMsg = `Resend ${res.status}: ${await res.text()}`;
        }
        emailSent = sent;
        await finalizeEmailSend(admin, reserve.rowId, { success: sent, body: html, errorMessage: errMsg });
      } catch (err) {
        await finalizeEmailSend(admin, reserve.rowId, { success: false, errorMessage: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  // Audit trail (non-blocking). order_status_logs has no free-text column, so
  // the descriptive record lives in audit_logs; the customer-facing timeline
  // entry is the logged invoice email in `communications`.
  try {
    await admin.from("audit_logs").insert({
      action: "additional_documentation_invoice_sent",
      object_type: "order",
      object_id: orderRow.confirmation_id,
      description: `Additional documentation invoice ($40) sent to ${orderEmail}${isAdmin && adminName ? ` by ${adminName}` : " (customer request)"}. Awaiting payment.`,
      metadata: {
        request_id: requestId,
        order_id: orderRow.id,
        requested_by: isAdmin ? "admin" : "customer",
        admin_name: isAdmin ? adminName : null,
        stripe_checkout_session_id: session.id,
        email_sent: emailSent,
        created_at: new Date().toISOString(),
      },
    });
  } catch { /* non-critical */ }

  return json(200, {
    ok: true,
    requestId,
    checkoutUrl: session.url,
    sessionId: session.id,
    emailSent,
    request: { ...request, stripe_checkout_session_id: session.id, status: "pending" },
  });
});
