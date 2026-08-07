// create-custom-payment-request — ORDER-LINKED-CUSTOM-STRIPE-INVOICE-001
//
// An Admin-authorised custom Stripe payment request against an EXISTING order.
//
// WHY A STRIPE INVOICE, NOT A CHECKOUT SESSION
// The add-on flows in this codebase use Checkout Sessions, but this workflow
// needs two things a Session cannot give: a link that stays valid beyond 24h,
// and an explicit VOID. Stripe Invoices have both — `hosted_invoice_url` and
// `invoices.voidInvoice` — so an admin can cancel a request they no longer want
// honoured, and the customer's link stops accepting payment.
//
// WHAT THIS DELIBERATELY NEVER DOES
//   * touch `orders.price` — that is the canonical, provenance-backed charge
//     base protected by the pricing P0. The authorised amount lives in
//     `order_custom_payment_requests.amount_cents` and nowhere else.
//   * create another order.
//   * accept a discount/coupon. There is no field for one and none is applied.
//   * put internal notes, provider compensation or clinical detail into Stripe.
//
// ACTOR: resolved from the JWT via the shared helper. `actor_name`, `sentBy`,
// `employeeId` and `role` in the request body carry no authority.
//
// IDEMPOTENCY: CLAIM → STRIPE CREATE → FINALIZE. The claim takes the unique
// `idempotency_key` BEFORE Stripe is called, so five concurrent submits with one
// operation token produce one Stripe object. Stripe's own idempotency key is set
// from the same token as a second line of defence.

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAuditActor } from "../_shared/auditActor.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Sensible operational bounds for a manual admin charge. Low enough to catch a
// mis-keyed cents/dollars mix-up, high enough for any real service.
const MIN_CENTS = 100;        // $1.00
const MAX_CENTS = 200_000;    // $2,000.00
const VALID_PURPOSES = ["supplemental_charge", "outstanding_order_balance"] as const;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!supabaseUrl || !serviceKey || !stripeKey) {
    return json(500, { ok: false, error: "Server not configured" });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer) return json(401, { ok: false, error: "Missing bearer token" });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: {
    confirmationId?: string;
    purpose?: string;
    amountCents?: number;
    customerDescription?: string;
    internalNote?: string;
    operationToken?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Expected JSON body" });
  }

  // ── Authorise: a real, authenticated ADMIN only ──────────────────────────
  const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
  if (userErr || !userResp.user) {
    return json(401, { ok: false, error: "Authentication required" });
  }
  const { data: profile } = await admin
    .from("doctor_profiles")
    .select("is_admin, is_active, full_name")
    .eq("user_id", userResp.user.id)
    .maybeSingle();
  const prof = profile as { is_admin?: boolean; is_active?: boolean; full_name?: string } | null;
  if (!prof || prof.is_admin !== true || prof.is_active === false) {
    return json(403, { ok: false, error: "Admin privileges required" });
  }
  // The audit actor comes from the same JWT, never from the body.
  const actor = await resolveAuditActor(req, admin);

  // ── Validate input ────────────────────────────────────────────────────────
  const confirmationId = (body.confirmationId ?? "").toString().trim();
  const purpose = (body.purpose ?? "supplemental_charge").toString().trim();
  const customerDescription = (body.customerDescription ?? "").toString().trim();
  const internalNote = (body.internalNote ?? "").toString().trim() || null;
  const operationToken = (body.operationToken ?? "").toString().trim();

  if (!confirmationId) return json(400, { ok: false, error: "confirmationId is required" });
  if (!VALID_PURPOSES.includes(purpose as typeof VALID_PURPOSES[number])) {
    return json(400, { ok: false, error: `Unsupported purpose: ${purpose}` });
  }
  if (!customerDescription) {
    return json(400, { ok: false, error: "A customer-facing description is required" });
  }
  if (customerDescription.length > 300) {
    return json(400, { ok: false, error: "Customer description must be 300 characters or fewer" });
  }

  // Amount arrives as integer cents. A float, a string, a zero or a negative is
  // rejected outright rather than coerced — silent coercion is how a $12.50
  // becomes $12 or $1250.
  const rawAmount = body.amountCents;
  if (typeof rawAmount !== "number" || !Number.isInteger(rawAmount)) {
    return json(400, { ok: false, error: "amountCents must be an integer number of cents" });
  }
  if (rawAmount <= 0) return json(400, { ok: false, error: "Amount must be greater than zero" });
  if (rawAmount < MIN_CENTS) {
    return json(400, { ok: false, error: `Minimum charge is $${(MIN_CENTS / 100).toFixed(2)}` });
  }
  if (rawAmount > MAX_CENTS) {
    return json(400, { ok: false, error: `Maximum charge is $${(MAX_CENTS / 100).toFixed(2)}` });
  }
  const amountCents = rawAmount;

  // ── Load the order (never created, only linked) ──────────────────────────
  const { data: orderRaw } = await admin
    .from("orders")
    .select("id, confirmation_id, email, first_name, last_name, status, price, paid_at, payment_intent_id")
    .eq("confirmation_id", confirmationId)
    .maybeSingle();
  const order = orderRaw as {
    id: string; confirmation_id: string | null; email: string | null;
    first_name: string | null; last_name: string | null; status: string | null;
    price: number | null; paid_at: string | null; payment_intent_id: string | null;
  } | null;
  if (!order) return json(404, { ok: false, error: "Order not found" });
  if (!order.email) return json(400, { ok: false, error: "Order has no customer email" });

  // An outstanding-balance request only makes sense on an order that is actually
  // unpaid. Charging "the balance" of a settled order would be a double charge.
  if (purpose === "outstanding_order_balance" && order.paid_at) {
    return json(409, {
      ok: false,
      error: "This order is already paid. Use a supplemental charge instead of an outstanding balance.",
    });
  }

  // ── CLAIM before Stripe ───────────────────────────────────────────────────
  const idemKey = operationToken
    ? `${order.id}:custom_payment:${operationToken}`
    : null;

  const { data: claimRow, error: claimErr } = await admin
    .from("order_custom_payment_requests")
    .insert({
      order_id: order.id,
      confirmation_id: order.confirmation_id,
      purpose,
      amount_cents: amountCents,
      currency: "usd",
      customer_description: customerDescription,
      internal_note: internalNote,
      status: "creating",
      created_by_user_id: actor.id,
      created_by_name: actor.name,
      idempotency_key: idemKey,
    })
    .select("id")
    .maybeSingle();

  if (claimErr) {
    if ((claimErr as { code?: string }).code === "23505") {
      // Another concurrent submit of the SAME operation already owns this.
      const { data: existing } = await admin
        .from("order_custom_payment_requests")
        .select("id, status, hosted_url, stripe_invoice_id, amount_cents")
        .eq("idempotency_key", idemKey)
        .maybeSingle();
      return json(200, {
        ok: true, duplicate: true, request: existing,
        reason: "a payment request for this operation already exists",
      });
    }
    return json(500, { ok: false, error: `Could not claim request: ${claimErr.message}` });
  }
  const requestId = (claimRow as { id?: string } | null)?.id;
  if (!requestId) return json(500, { ok: false, error: "Claim did not return an id" });

  // ── Create the Stripe objects ─────────────────────────────────────────────
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  // Safe identifiers only. No internal note, no provider pay, no clinical data.
  const stripeMeta: Record<string, string> = {
    type: "custom_payment_request",
    custom_payment_request_id: requestId,
    order_id: order.id,
    confirmation_id: order.confirmation_id ?? "",
    purpose,
  };

  try {
    // Reuse an existing Stripe Customer for this email rather than creating a
    // duplicate every time an admin raises a request.
    let customerId: string | null = null;
    const found = await stripe.customers.list({ email: order.email, limit: 1 });
    customerId = found.data[0]?.id ?? null;
    if (!customerId) {
      const created = await stripe.customers.create({
        email: order.email,
        name: [order.first_name, order.last_name].filter(Boolean).join(" ") || undefined,
        metadata: { confirmation_id: order.confirmation_id ?? "" },
      }, { idempotencyKey: `${requestId}:customer` });
      customerId = created.id;
    }

    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "send_invoice",
      days_until_due: 30,
      auto_advance: false,
      currency: "usd",
      description: customerDescription,
      metadata: stripeMeta,
    }, { idempotencyKey: `${requestId}:invoice` });

    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      currency: "usd",
      unit_amount: amountCents,
      quantity: 1,
      description: customerDescription,
      metadata: stripeMeta,
    }, { idempotencyKey: `${requestId}:item` });

    // Finalising produces the hosted payment page the customer will use.
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id, {
      auto_advance: false,
    }, { idempotencyKey: `${requestId}:finalize` });

    await admin.from("order_custom_payment_requests").update({
      status: "open",
      stripe_customer_id: customerId,
      stripe_invoice_id: finalized.id,
      hosted_url: finalized.hosted_invoice_url ?? null,
      metadata: { stripe_invoice_number: finalized.number ?? null },
    }).eq("id", requestId);

    await admin.from("audit_logs").insert({
      actor_id: actor.id, actor_name: actor.name, actor_role: actor.role, actor_type: actor.type,
      category: "payments", source: "admin_portal",
      object_type: "order", object_id: order.confirmation_id, order_id: order.id,
      action: "custom_payment_request_created",
      description:
        `${actor.name} created a $${(amountCents / 100).toFixed(2)} custom payment request ` +
        `(${purpose.replace(/_/g, " ")}) for order ${order.confirmation_id}.`,
      metadata: {
        custom_payment_request_id: requestId,
        confirmation_id: order.confirmation_id,
        purpose, amount_cents: amountCents, currency: "usd",
        stripe_invoice_id: finalized.id,
        // The internal note is deliberately NOT copied into the audit metadata
        // that the timeline renders; it stays on the request row for Admin only.
      },
    });

    return json(200, {
      ok: true,
      request: {
        id: requestId,
        status: "open",
        amount_cents: amountCents,
        purpose,
        hosted_url: finalized.hosted_invoice_url ?? null,
        stripe_invoice_id: finalized.id,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[create-custom-payment-request] Stripe create failed:", msg);
    // Keep the evidence, and free the operation token so a corrected retry is
    // not blocked by a claim whose Stripe side never came into existence.
    await admin.from("order_custom_payment_requests").update({
      status: "failed",
      failed_at: new Date().toISOString(),
      idempotency_key: null,
      metadata: { stripe_error: msg },
    }).eq("id", requestId);
    return json(502, { ok: false, error: `Stripe request failed: ${msg}` });
  }
});
