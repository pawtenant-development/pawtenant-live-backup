// create-additional-pet-request
//
// ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001 — the customer-facing Additional Pet
// flow for an EXISTING paid ESA/PSD order.
//
// This NEVER creates a brand-new order and NEVER mutates the parent order's
// price, coupon, paid_at, payment intent or assessment answers. The new pet
// lives on its own request row; `orders.assessment_answers->'pets'` is the
// entitlement evidence the pricing depends on and is deliberately untouched.
//
// PRICING IS SERVER-AUTHORITATIVE. The browser supplies no amount, no outcome
// and no entitlement. Every decision comes from resolve_additional_pet_pricing().
//   • single tier -> multi : $20 PACKAGE-TIER upgrade (not a per-pet fee)
//   • existing multi tier  : $0, provider review still required
//   • annual / ambiguous   : manual review, NO amount ever computed
//
// Actions (POST body { action }):
//   "quote"      — server pricing + eligibility for this order (no write).
//   "create"     — create the request; $20 -> one Stripe Checkout Session,
//                  $0 -> straight to provider review with NO Stripe object.
//   "list"       — list requests for an order (auto-reconciles a paid session).
//   "resume"     — finish an abandoned pending payment without duplicating.
//   "update_pet" — customer edits the pet while in draft / clarification.
//   "cancel"     — cancel a not-yet-paid request.
//
// Auth mirrors create-additional-doc-invoice: service-role bearer = trusted
// admin context; otherwise getUser(bearer) and the caller's email MUST match
// the order email (or they must be admin staff).

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  completeAdditionalPetPayment,
  sendAdditionalPetEmail,
  ADDITIONAL_PET_UPGRADE_CENTS,
} from "../_shared/completeAdditionalPetPayment.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_SITE = "https://pawtenant.com";
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";

/** Species accepted per service. PSD is a psychiatric SERVICE DOG — dogs only. */
const ESA_TYPES = ["dog", "cat", "bird", "rabbit", "hamster", "guinea pig", "other"];
const PSD_TYPES = ["dog"];

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface PetInput { name?: string; type?: string; breed?: string; age?: string; weight?: string }

/** Normalise to the canonical pet shape {name,type,breed,age,weight}. */
function normalisePet(input: PetInput): Record<string, string> {
  const s = (v: unknown) => String(v ?? "").trim();
  return {
    name: s(input.name), type: s(input.type).toLowerCase(),
    breed: s(input.breed), age: s(input.age), weight: s(input.weight),
  };
}

function validatePet(pet: Record<string, string>, serviceType: string): string | null {
  if (!pet.name) return "Please enter the pet's name.";
  if (pet.name.length > 60) return "That pet name is too long.";
  if (!pet.type) return "Please select the type of animal.";
  const allowed = serviceType === "psd" ? PSD_TYPES : ESA_TYPES;
  if (!allowed.includes(pet.type)) {
    return serviceType === "psd"
      ? "A Psychiatric Service Dog letter can only cover a dog."
      : "That animal type is not supported.";
  }
  if (!pet.breed) return "Please enter the pet's breed.";
  return null;
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
    action?: string; orderId?: string; confirmationId?: string; requestId?: string;
    pet?: PetInput; siteUrl?: string;
    // Deliberately IGNORED if present — the amount is never client-supplied.
    amount?: unknown; amountCents?: unknown; price?: unknown; pricingOutcome?: unknown;
  };
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "Invalid JSON body" }); }

  const action = body.action ?? "quote";

  // ── Caller identity ───────────────────────────────────────────────────────
  let isAdmin = false;
  let callerEmail = "";
  let callerUserId: string | null = null;
  if (bearer === serviceKey) {
    isAdmin = true;
  } else {
    const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
    if (userErr || !userResp.user) return json(401, { ok: false, error: "Invalid token" });
    callerUserId = userResp.user.id;
    callerEmail = (userResp.user.email ?? "").toLowerCase();
    const { data: profile } = await admin.from("doctor_profiles")
      .select("is_admin").eq("user_id", callerUserId).maybeSingle();
    isAdmin = !!(profile as { is_admin?: boolean } | null)?.is_admin;
  }

  // ── Parent order ──────────────────────────────────────────────────────────
  let q = admin.from("orders")
    .select("id, confirmation_id, email, first_name, letter_type, status, doctor_user_id, payment_intent_id, paid_at")
    .limit(1);
  if (body.orderId) q = q.eq("id", body.orderId);
  else if (body.confirmationId) q = q.eq("confirmation_id", body.confirmationId);
  else return json(400, { ok: false, error: "orderId or confirmationId required" });

  const { data: order, error: orderErr } = await q.maybeSingle();
  if (orderErr || !order) return json(404, { ok: false, error: "Order not found" });

  const o = order as {
    id: string; confirmation_id: string | null; email: string | null; first_name: string | null;
    letter_type: string | null; status: string | null; doctor_user_id: string | null;
    payment_intent_id: string | null; paid_at: string | null;
  };
  const orderEmail = (o.email ?? "").toLowerCase();

  // Ownership. A cross-customer request is refused outright.
  if (!isAdmin && (!callerEmail || callerEmail !== orderEmail)) {
    return json(403, { ok: false, error: "Not authorized for this order" });
  }

  const stripe = stripeKey
    // @ts-ignore — Stripe types under Deno
    ? new Stripe(stripeKey, { apiVersion: "2024-06-20" })
    : null;

  /** Self-heal: ask Stripe whether a pending checkout actually completed. */
  async function reconcilePending(rows: Array<Record<string, unknown>>): Promise<boolean> {
    if (!stripe) return false;
    let changed = false;
    for (const r of rows) {
      if (r.paid_at) continue;
      if ((r.pricing_outcome as string) !== "paid_upgrade") continue;
      const sid = r.stripe_checkout_session_id as string | null;
      if (!sid) continue;
      try {
        const s = await stripe.checkout.sessions.retrieve(sid);
        if (!(s.payment_status === "paid" || s.status === "complete")) continue;
        const piId = typeof s.payment_intent === "string"
          ? s.payment_intent : (s.payment_intent as { id?: string } | null)?.id ?? null;
        const res = await completeAdditionalPetPayment(admin, {
          requestId: r.id as string, parentOrderId: r.order_id as string,
          sessionId: sid, piId, amountCents: s.amount_total ?? null,
          currency: s.currency ?? null, source: "reconcile",
        });
        if (res.status === "completed") changed = true;
      } catch (e) {
        console.warn("[addPet] reconcile probe failed", r.id, e instanceof Error ? e.message : String(e));
      }
    }
    return changed;
  }

  async function loadRequests() {
    const { data } = await admin.from("order_additional_pet_requests")
      .select("*").eq("order_id", o.id).order("created_at", { ascending: false });
    return (data ?? []) as Array<Record<string, unknown>>;
  }

  // ── QUOTE ─────────────────────────────────────────────────────────────────
  if (action === "quote" || action === "list") {
    let rows = await loadRequests();
    const changed = await reconcilePending(rows);
    if (changed) rows = await loadRequests();

    const { data: pricing, error: pErr } = await admin
      .rpc("resolve_additional_pet_pricing", { p_order_id: o.id });
    if (pErr) return json(500, { ok: false, error: pErr.message });

    const state = (await admin.rpc("additional_pet_effective_state", { p_order_id: o.id })).data;

    return json(200, {
      ok: true, pricing, state, requests: rows, reconciled: changed,
      allowedPetTypes: (o.letter_type ?? "").toLowerCase() === "psd" ? PSD_TYPES : ESA_TYPES,
    });
  }

  // ── CANCEL ────────────────────────────────────────────────────────────────
  if (action === "cancel") {
    if (!body.requestId) return json(400, { ok: false, error: "requestId required" });
    const { data: row } = await admin.from("order_additional_pet_requests")
      .select("*").eq("id", body.requestId).eq("order_id", o.id).maybeSingle();
    if (!row) return json(404, { ok: false, error: "Request not found" });
    if (row.paid_at) {
      return json(409, { ok: false, error: "A paid request cannot be cancelled — it must be resolved by provider review or refunded by an admin.", code: "already_paid" });
    }
    const { data: updated } = await admin.from("order_additional_pet_requests")
      .update({ status: "cancelled" }).eq("id", body.requestId)
      .is("paid_at", null).select().maybeSingle();
    if (!updated) return json(409, { ok: false, error: "Request could not be cancelled" });
    await admin.from("order_additional_pet_request_events").insert({
      request_id: body.requestId, order_id: o.id, event_type: "cancelled",
      from_status: row.status as string, to_status: "cancelled",
      actor_role: isAdmin ? "admin" : "customer", actor_id: callerUserId, detail: {},
    });
    return json(200, { ok: true, request: updated });
  }

  // ── UPDATE PET (draft / clarification only) ───────────────────────────────
  if (action === "update_pet") {
    if (!body.requestId) return json(400, { ok: false, error: "requestId required" });
    const { data: row } = await admin.from("order_additional_pet_requests")
      .select("*").eq("id", body.requestId).eq("order_id", o.id).maybeSingle();
    if (!row) return json(404, { ok: false, error: "Request not found" });

    const editable = ["draft", "payment_required", "checkout_created", "paid_pending_details", "clarification_requested"];
    if (!editable.includes(row.status as string)) {
      return json(409, { ok: false, error: "This request can no longer be edited.", code: "not_editable" });
    }

    const pet = normalisePet(body.pet ?? {});
    const vErr = validatePet(pet, row.service_type as string);
    if (vErr) return json(400, { ok: false, error: vErr, code: "invalid_pet" });

    const { data: dup } = await admin.rpc("additional_pet_is_duplicate", {
      p_order_id: o.id, p_name: pet.name, p_type: pet.type,
    });
    // A pet identical to the one already on THIS request is not a duplicate.
    const samePet = (row.new_pet as Record<string, string> | null)?.name?.toLowerCase().trim() === pet.name.toLowerCase()
      && (row.new_pet as Record<string, string> | null)?.type === pet.type;
    if (dup === true && !samePet) {
      return json(409, { ok: false, error: "That pet is already covered by this order.", code: "duplicate_pet" });
    }

    // A clarification response is a RESUBMISSION — it goes back to the provider.
    const wasClarification = row.status === "clarification_requested";
    const nextStatus = wasClarification ? "resubmitted" : (row.status as string);

    const { data: updated, error: uErr } = await admin.from("order_additional_pet_requests")
      .update({ new_pet: pet, status: nextStatus }).eq("id", body.requestId).select().maybeSingle();
    if (uErr) return json(500, { ok: false, error: uErr.message });

    await admin.from("order_additional_pet_request_events").insert({
      request_id: body.requestId, order_id: o.id,
      event_type: wasClarification ? "resubmitted" : "pet_updated",
      from_status: row.status as string, to_status: nextStatus,
      actor_role: isAdmin ? "admin" : "customer", actor_id: callerUserId,
      detail: { pet_name: pet.name, pet_type: pet.type },
    });
    return json(200, { ok: true, request: updated, resubmitted: wasClarification });
  }

  // ── RESUME ────────────────────────────────────────────────────────────────
  if (action === "resume") {
    if (!stripe) return json(500, { ok: false, error: "Stripe not configured" });
    const { data: pending } = await admin.from("order_additional_pet_requests")
      .select("*").eq("order_id", o.id).is("paid_at", null)
      .eq("pricing_outcome", "paid_upgrade")
      .in("status", ["payment_required", "checkout_created"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!pending) return json(409, { ok: false, error: "No pending payment to resume" });

    const pr = pending as { id: string; stripe_checkout_session_id: string | null };
    if (pr.stripe_checkout_session_id) {
      try {
        const s = await stripe.checkout.sessions.retrieve(pr.stripe_checkout_session_id);
        if (s.payment_status === "paid" || s.status === "complete") {
          const piId = typeof s.payment_intent === "string"
            ? s.payment_intent : (s.payment_intent as { id?: string } | null)?.id ?? null;
          await completeAdditionalPetPayment(admin, {
            requestId: pr.id, parentOrderId: o.id, sessionId: pr.stripe_checkout_session_id,
            piId, amountCents: s.amount_total ?? null, currency: s.currency ?? null, source: "reconcile",
          });
          return json(200, { ok: true, alreadyPaid: true });
        }
        if (s.status === "open" && s.url) return json(200, { ok: true, checkoutUrl: s.url });
      } catch (e) {
        console.warn("[addPet] resume retrieve failed", e instanceof Error ? e.message : String(e));
      }
    }
    // Expired / missing session → refresh on the SAME row (never a new request).
    const site = (body.siteUrl && /^https?:\/\//.test(body.siteUrl)) ? body.siteUrl.replace(/\/$/, "") : DEFAULT_SITE;
    const meta = {
      type: "additional_pet", request_id: pr.id, parent_order_id: o.id,
      parent_confirmation_id: o.confirmation_id ?? "",
      target_pet_count: String((pending as { target_pet_count: number }).target_pet_count),
      service_type: (pending as { service_type: string }).service_type,
      idempotency_key: (pending as { idempotency_key: string | null }).idempotency_key ?? "",
    };
    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment", payment_method_types: ["card"], customer_email: orderEmail,
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: ADDITIONAL_PET_UPGRADE_CENTS,
          product_data: { name: "Additional Pet — Multi-Pet Package Upgrade", description: `Add-on for order ${o.confirmation_id ?? ""}`.trim() } } }],
        submit_type: "pay",
        // ORDER-ADDITIONAL-PET-FINAL-TEST-CLOSURE-001 §2 — see the CREATE path
        // below for the full rationale. Adaptive Pricing must stay OFF here too,
        // or a resumed payment could settle in a different currency than the
        // session it replaces.
        adaptive_pricing: { enabled: false },
        success_url: `${site}/my-orders?addpet=success&order=${encodeURIComponent(o.confirmation_id ?? "")}`,
        cancel_url: `${site}/my-orders?addpet=cancelled&order=${encodeURIComponent(o.confirmation_id ?? "")}`,
        metadata: meta, payment_intent_data: { metadata: meta },
      });
    } catch (err) {
      return json(502, { ok: false, error: `Stripe session failed: ${err instanceof Error ? err.message : String(err)}` });
    }
    await admin.from("order_additional_pet_requests")
      .update({ stripe_checkout_session_id: session.id, status: "checkout_created" }).eq("id", pr.id);
    return json(200, { ok: true, checkoutUrl: session.url });
  }

  // ── CREATE ────────────────────────────────────────────────────────────────
  if (action !== "create") return json(400, { ok: false, error: `Unknown action: ${action}` });

  // THE server decision. Nothing the client sent influences it.
  const { data: pricing, error: pErr } = await admin
    .rpc("resolve_additional_pet_pricing", { p_order_id: o.id });
  if (pErr) return json(500, { ok: false, error: pErr.message });

  const pr = pricing as {
    eligible: boolean; outcome: string; code: string; amount_cents: number;
    current_pet_count?: number; target_pet_count?: number; prior_pet_tier?: string;
    service_type?: string; entitlement_snapshot_id?: string; message?: string;
    active_request_id?: string; manual_review_reason?: string;
  };

  // Manual review and every blocked case stop here — no request, no Stripe,
  // no amount. A manual-review order is NEVER given an automated price.
  if (pr.outcome === "manual_review") {
    return json(409, {
      ok: false, code: `manual_review:${pr.code}`,
      manualReview: true,
      error: pr.message ?? "Adding another pet to this order requires a manual review. Contact PawTenant Support for assistance.",
    });
  }
  if (!pr.eligible || pr.outcome === "blocked") {
    return json(409, { ok: false, code: pr.code, error: pr.message ?? "Adding another pet is not available for this order." });
  }

  const serviceType = (pr.service_type ?? (o.letter_type ?? "").toLowerCase());
  const pet = normalisePet(body.pet ?? {});
  const vErr = validatePet(pet, serviceType);
  if (vErr) return json(400, { ok: false, error: vErr, code: "invalid_pet" });

  const { data: dup } = await admin.rpc("additional_pet_is_duplicate", {
    p_order_id: o.id, p_name: pet.name, p_type: pet.type,
  });
  if (dup === true) {
    return json(409, { ok: false, error: "That pet is already covered by this order.", code: "duplicate_pet" });
  }

  const isPaid = pr.outcome === "paid_upgrade";
  const amountCents = isPaid ? ADDITIONAL_PET_UPGRADE_CENTS : 0;

  // Idempotency key is derived from the ORDER + TARGET COUNT, so a double click,
  // a refresh or two open tabs converge on ONE request rather than two.
  const idemKey = `addpet:${o.id}:v${pr.target_pet_count ?? 0}`;

  const { data: inserted, error: insErr } = await admin
    .from("order_additional_pet_requests")
    .insert({
      order_id: o.id,
      confirmation_id: o.confirmation_id,
      customer_email: orderEmail,
      entitlement_snapshot_id: pr.entitlement_snapshot_id ?? null,
      service_type: serviceType,
      prior_pet_tier: pr.prior_pet_tier ?? "unknown",
      prior_pet_count: pr.current_pet_count ?? 0,
      target_pet_count: pr.target_pet_count ?? ((pr.current_pet_count ?? 0) + 1),
      new_pet: pet,
      pricing_outcome: pr.outcome,
      amount_cents: amountCents,
      currency: "usd",
      // $0 requests need no payment step at all — straight to provider review.
      status: isPaid ? "payment_required" : "pending_provider_review",
      assigned_provider_user_id: o.doctor_user_id,
      idempotency_key: idemKey,
      created_by: isAdmin ? "admin" : "customer",
    })
    .select().maybeSingle();

  if (insErr || !inserted) {
    // 23505 = the one-active-request partial unique index OR the idempotency key.
    // Either way a concurrent create won the race; return that request rather
    // than a 500, and never create a second Stripe session.
    if ((insErr as { code?: string } | null)?.code === "23505") {
      const { data: existing } = await admin.from("order_additional_pet_requests")
        .select("*").eq("order_id", o.id)
        .not("status", "in", "(completed,rejected,refunded,cancelled)")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return json(200, { ok: true, duplicate: true, request: existing,
        message: "A request to add another pet is already in progress for this order." });
    }
    return json(500, { ok: false, error: `Could not create request: ${insErr?.message ?? "unknown"}` });
  }

  const request = inserted as Record<string, unknown>;
  const requestId = request.id as string;

  await admin.from("order_additional_pet_request_events").insert({
    request_id: requestId, order_id: o.id,
    event_type: isPaid ? "created_payment_required" : "submitted_for_review",
    from_status: null, to_status: request.status as string,
    actor_role: isAdmin ? "admin" : "customer", actor_id: callerUserId,
    detail: { pricing_outcome: pr.outcome, pet_name: pet.name, pet_type: pet.type,
              target_pet_count: pr.target_pet_count ?? null },
  });

  // ── $0 INCLUDED PATH — no Stripe object of any kind ───────────────────────
  if (!isPaid) {
    try {
      await admin.from("audit_logs").insert({
        action: "additional_pet_included_request",
        object_type: "order", object_id: o.confirmation_id,
        description: `Additional Pet request created at $0 — already covered by the customer's multi-pet package. Provider review required. No Stripe object, no revenue row, no new order.`,
        metadata: { request_id: requestId, order_id: o.id, pet_type: pet.type,
                    prior_pet_tier: pr.prior_pet_tier, target_pet_count: pr.target_pet_count },
      });
    } catch { /* non-critical */ }

    if (orderEmail) {
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#374151;"><img src="${LOGO_URL}" width="140" alt="PawTenant" style="display:block;margin-bottom:16px;"/><h2 style="color:#0f172a;font-size:20px;">Additional pet submitted for review</h2><p style="line-height:1.7;font-size:14px;">Hi ${o.first_name || "there"}, we've received your request to add <strong>${pet.name}</strong> to order <strong>${o.confirmation_id}</strong>.</p><p style="line-height:1.7;font-size:14px;">Your current package already covers this pet. No additional payment is required. Provider review is still required before an updated document can be issued.</p><p style="line-height:1.7;font-size:13px;color:#64748b;">Your existing letter stays valid and available throughout, and its verification ID will continue to verify unchanged.</p></div>`;
      await sendAdditionalPetEmail(admin, {
        orderId: o.id, confirmationId: o.confirmation_id ?? "", to: orderEmail,
        subject: "Additional Pet Submitted for Review — PawTenant", html,
        slug: "additional_pet_included_submitted", dedupeKey: `${requestId}:additional_pet_included_submitted`,
        sentBy: isAdmin ? "admin" : "customer",
      });
    }

    return json(200, {
      ok: true, requestId, included: true, amountCents: 0, request,
      message: "Your current package already covers this pet. No additional payment is required. Provider review is still required before an updated document can be issued.",
    });
  }

  // ── $20 PAID PATH ─────────────────────────────────────────────────────────
  if (!stripe) return json(500, { ok: false, error: "Stripe not configured" });
  const site = (body.siteUrl && /^https?:\/\//.test(body.siteUrl)) ? body.siteUrl.replace(/\/$/, "") : DEFAULT_SITE;

  // SAFE metadata only — no diagnosis, no pet intake, no address, no PII beyond
  // the identifiers the webhook needs to route the payment.
  const meta = {
    type: "additional_pet",
    request_id: requestId,
    parent_order_id: o.id,
    parent_confirmation_id: o.confirmation_id ?? "",
    target_pet_count: String(pr.target_pet_count ?? ""),
    service_type: serviceType,
    idempotency_key: idemKey,
  };

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment", payment_method_types: ["card"], customer_email: orderEmail,
      line_items: [{ quantity: 1, price_data: { currency: "usd",
        unit_amount: ADDITIONAL_PET_UPGRADE_CENTS,
        product_data: {
          name: "Additional Pet — Multi-Pet Package Upgrade",
          description: `Upgrade for order ${o.confirmation_id ?? ""} — covers up to 3 pets`.trim(),
        } } }],
      submit_type: "pay",
      // ORDER-ADDITIONAL-PET-FINAL-TEST-CLOSURE-001 §2 — FORCE USD.
      //
      // Stripe Adaptive Pricing is enabled on this account, so Checkout was
      // offering a non-US buyer their local currency (observed on TEST: the
      // session defaulted to PKR 5,760.29 instead of $20.00). `price_data.currency`
      // only sets the SETTLEMENT currency — Adaptive Pricing overrides what is
      // PRESENTED and charged, so a customer could have paid in PKR.
      //
      // completeAdditionalPetPayment deliberately verifies amount === 2000 AND
      // currency === "usd" before marking anything paid, so such a payment would
      // be held as an integrity mismatch rather than fulfilled. Owner decision:
      // fix it at the source and DO NOT weaken that validation.
      //
      // Scoped to this product only — no global Stripe setting is touched, so no
      // other checkout product changes behaviour.
      adaptive_pricing: { enabled: false },
      success_url: `${site}/my-orders?addpet=success&order=${encodeURIComponent(o.confirmation_id ?? "")}`,
      cancel_url: `${site}/my-orders?addpet=cancelled&order=${encodeURIComponent(o.confirmation_id ?? "")}`,
      metadata: meta, payment_intent_data: { metadata: meta },
    }, { idempotencyKey: idemKey });
  } catch (err) {
    await admin.from("order_additional_pet_requests")
      .update({ status: "cancelled", manual_review_reason: `Stripe session create failed: ${err instanceof Error ? err.message : String(err)}` })
      .eq("id", requestId);
    return json(502, { ok: false, error: `Stripe session failed: ${err instanceof Error ? err.message : String(err)}` });
  }

  await admin.from("order_additional_pet_requests")
    .update({ stripe_checkout_session_id: session.id, status: "checkout_created" })
    .eq("id", requestId);

  try {
    await admin.from("audit_logs").insert({
      action: "additional_pet_checkout_created",
      object_type: "order", object_id: o.confirmation_id,
      description: `Additional Pet upgrade checkout created ($${(ADDITIONAL_PET_UPGRADE_CENTS / 100).toFixed(2)} package-tier upgrade, single -> multi). Awaiting payment.`,
      metadata: { request_id: requestId, order_id: o.id, amount_cents: ADDITIONAL_PET_UPGRADE_CENTS,
                  stripe_checkout_session_id: session.id, target_pet_count: pr.target_pet_count },
    });
  } catch { /* non-critical */ }

  return json(200, {
    ok: true, requestId, checkoutUrl: session.url, sessionId: session.id,
    amountCents: ADDITIONAL_PET_UPGRADE_CENTS,
    request: { ...request, stripe_checkout_session_id: session.id, status: "checkout_created" },
  });
});
