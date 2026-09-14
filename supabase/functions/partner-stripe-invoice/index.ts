// partner-stripe-invoice
//
// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002.
//
// Admin action: turn selected eligible unbilled orders for ONE partner into a
// finalized, sent Stripe invoice.
//
// ORDER OF OPERATIONS (deliberate)
//   1. `partner_prepare_invoice` writes PawTenant's own invoice, its lines and
//      the per-order lock INSIDE one transaction. An order that is already
//      invoiced, paid or credited is refused there, so an order can never join
//      a second active invoice.
//   2. Only then is Stripe called, with an idempotency key derived from the
//      PawTenant invoice id.
//   3. `partner_attach_stripe_invoice` records the Stripe references.
//
// A Stripe failure between 1 and 3 leaves a DRAFT invoice with its orders
// locked to it — visible, retryable and voidable — rather than money taken
// against orders nobody can find, or orders billed twice.
//
// Nothing here changes an order's clinical state. Issuing an invoice is
// bookkeeping.

import { requirePartnerPlatformAdmin, partnerJson, PARTNER_ADMIN_CORS } from "../_shared/partnerAdminAuth.ts";
import { createAndSendStripeInvoice, type PreparedInvoice } from "../_shared/partnerStripeInvoice.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: PARTNER_ADMIN_CORS });
  if (req.method !== "POST") return partnerJson(405, { ok: false, error: "POST only" });

  const auth = await requirePartnerPlatformAdmin(req);
  if (!auth.ok) return partnerJson(auth.status, { ok: false, code: auth.code, error: auth.error });
  const { service } = auth;

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!stripeKey) return partnerJson(500, { ok: false, error: "Stripe is not configured" });

  let body: { partner_id?: string; order_ids?: string[]; due_days?: number };
  try { body = await req.json(); } catch { return partnerJson(400, { ok: false, error: "Expected JSON" }); }

  const partnerId = (body.partner_id ?? "").trim();
  const orderIds = Array.isArray(body.order_ids) ? body.order_ids.map((s) => String(s).trim()) : [];
  if (!UUID_RE.test(partnerId)) return partnerJson(400, { ok: false, error: "partner_id is required" });
  if (orderIds.length === 0) return partnerJson(400, { ok: false, error: "Select at least one order" });
  if (orderIds.some((id) => !UUID_RE.test(id))) return partnerJson(400, { ok: false, error: "order_ids must be uuids" });

  const { data: profile, error: profErr } = await service
    .from("partner_billing_profiles")
    .select("partner_id, legal_business_name, billing_email, stripe_customer_id, currency, payment_terms_days, active")
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (profErr) return partnerJson(500, { ok: false, error: "Could not read the billing profile" });
  if (!profile) return partnerJson(409, { ok: false, error: "This partner has no billing profile yet" });
  if (!profile.billing_email) return partnerJson(409, { ok: false, error: "Set a billing email before invoicing" });
  if (profile.active === false) return partnerJson(409, { ok: false, error: "This partner's billing profile is inactive" });

  // 1. PawTenant's own invoice and order locks, in one transaction.
  const { data: preparedRaw, error: prepErr } = await service.rpc("partner_prepare_invoice", {
    p_partner_id: partnerId,
    p_order_ids: orderIds,
    p_source: "manual",
    p_billing_period_key: null,
    p_period_start: null,
    p_period_end: null,
    p_due_days: body.due_days ?? null,
  });
  if (prepErr) {
    const msg = prepErr.message ?? "Could not prepare the invoice";
    const conflict = /already|not invoice eligible|mixed currencies/i.test(msg);
    return partnerJson(conflict ? 409 : 500, { ok: false, error: msg });
  }
  const prepared = preparedRaw as PreparedInvoice;

  // 2. Stripe.
  let sent;
  try {
    sent = await createAndSendStripeInvoice({
      stripeKey,
      prepared,
      billingEmail: String(profile.billing_email),
      legalName: String(profile.legal_business_name),
      currency: prepared.currency ?? String(profile.currency ?? "USD"),
      dueDays: Number(profile.payment_terms_days ?? 14),
      existingCustomerId: (profile.stripe_customer_id as string | null) ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // The draft invoice and its order locks survive on purpose: an admin can
    // retry or void it. Silently unlocking here is how the same work gets
    // invoiced twice.
    return partnerJson(502, {
      ok: false,
      error: `Stripe refused the invoice: ${msg}`,
      invoice_id: prepared.invoice_id,
      invoice_number: prepared.invoice_number,
      recoverable: true,
    });
  }

  // 3. Record the Stripe references and mark the invoice issued.
  const { error: attachErr } = await service.rpc("partner_attach_stripe_invoice", {
    p_invoice_id: prepared.invoice_id,
    p_stripe_customer_id: sent.stripe_customer_id,
    p_stripe_invoice_id: sent.stripe_invoice_id,
    p_stripe_invoice_number: sent.stripe_invoice_number,
    p_hosted_url: sent.hosted_invoice_url,
    p_stripe_status: sent.stripe_status,
    p_idempotency_key: sent.idempotency_key,
  });
  if (attachErr) {
    return partnerJson(500, {
      ok: false,
      error: `Stripe invoice ${sent.stripe_invoice_id} was sent but could not be recorded: ${attachErr.message}`,
      invoice_id: prepared.invoice_id,
      stripe_invoice_id: sent.stripe_invoice_id,
    });
  }

  // Remember the verified Stripe Customer so the next invoice reuses it.
  if (!profile.stripe_customer_id) {
    await service.from("partner_billing_profiles")
      .update({ stripe_customer_id: sent.stripe_customer_id })
      .eq("partner_id", partnerId);
  }

  return partnerJson(200, {
    ok: true,
    invoice_id: prepared.invoice_id,
    invoice_number: prepared.invoice_number,
    total_cents: prepared.total_cents,
    currency: prepared.currency,
    billing_email: profile.billing_email,
    order_count: orderIds.length,
    stripe_invoice_id: sent.stripe_invoice_id,
    hosted_invoice_url: sent.hosted_invoice_url,
  });
});
