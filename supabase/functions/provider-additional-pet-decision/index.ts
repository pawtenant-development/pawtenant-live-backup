// provider-additional-pet-decision
//
// ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001 §15/§16/§17 — the provider's
// decision on an Additional Pet request.
//
// Actions: "approve" | "request_clarification" | "reject".
//
// HARD RULES ENFORCED HERE:
//   • A provider NEVER sees or touches a financial field. This function reads
//     the request through an explicit safe projection for its response, and
//     never returns amount, pricing outcome, Stripe identifiers or refunds to a
//     provider caller.
//   • APPROVAL DOES NOT PUBLISH A DOCUMENT. Approving moves the request to
//     `approved_pending_document`. The revised letter is produced by the
//     EXISTING provider-submit-letter path, whose closed revision architecture
//     creates version 2+, mints a NEW verification ID, and activates only after
//     generation succeeds. The original letter and its ID are never touched.
//   • Rejecting a PAID request refunds EXACTLY the $20 add-on — never the base
//     order, never a partial, never a deduction — and leaves the original
//     document and verification ID in place.
//   • Rejecting a $0 request creates no refund object at all.

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAdditionalPetEmail, ADDITIONAL_PET_UPGRADE_CENTS } from "../_shared/completeAdditionalPetPayment.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
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

  let body: { action?: string; requestId?: string; reason?: string };
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "Invalid JSON body" }); }

  const action = body.action ?? "";
  if (!["approve", "request_clarification", "reject"].includes(action)) {
    return json(400, { ok: false, error: `Unknown action: ${action}` });
  }
  if (!body.requestId) return json(400, { ok: false, error: "requestId required" });

  // ── Caller identity ───────────────────────────────────────────────────────
  let isAdmin = false;
  let callerUserId: string | null = null;
  if (bearer === serviceKey) {
    isAdmin = true;
  } else {
    const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
    if (userErr || !userResp.user) return json(401, { ok: false, error: "Invalid token" });
    callerUserId = userResp.user.id;
    const { data: profile } = await admin.from("doctor_profiles")
      .select("is_admin").eq("user_id", callerUserId).maybeSingle();
    isAdmin = !!(profile as { is_admin?: boolean } | null)?.is_admin;
  }

  // ── Load request + order, and AUTHORISE ───────────────────────────────────
  const { data: reqRow } = await admin.from("order_additional_pet_requests")
    .select("*").eq("id", body.requestId).maybeSingle();
  if (!reqRow) return json(404, { ok: false, error: "Request not found" });

  const { data: order } = await admin.from("orders")
    .select("id, confirmation_id, email, first_name, doctor_user_id, letter_type")
    .eq("id", reqRow.order_id).maybeSingle();
  if (!order) return json(404, { ok: false, error: "Order not found" });

  const isAssignedProvider = !!callerUserId && order.doctor_user_id === callerUserId;
  if (!isAdmin && !isAssignedProvider) {
    return json(403, { ok: false, error: "Not authorized for this request" });
  }

  const decidable = ["pending_provider_review", "clarification_requested", "resubmitted"];

  // IDEMPOTENCY FIRST. A retried approve/reject (double click, network retry,
  // client replay) must return the decision that already stands rather than a
  // 409 — otherwise a provider whose request timed out after the write sees an
  // error for an action that actually succeeded. This is checked BEFORE the
  // decidable-status gate precisely because a decided request is no longer in
  // a decidable state.
  if ((action === "approve" && reqRow.provider_decision === "approved")
      || (action === "reject" && reqRow.provider_decision === "rejected")) {
    return json(200, {
      ok: true, status: reqRow.status, alreadyDecided: true,
      decision: reqRow.provider_decision,
    });
  }

  // Only a request that is actually in front of a provider can be decided.
  if (!decidable.includes(reqRow.status as string)) {
    return json(409, {
      ok: false, code: "not_decidable",
      error: `This request is not awaiting a decision (status=${reqRow.status}).`,
    });
  }

  const confId = (order.confirmation_id as string) ?? "";
  const custEmail = (order.email as string) ?? "";
  const petName = ((reqRow.new_pet as Record<string, unknown> | null)?.name as string) ?? "the pet";
  const nowIso = new Date().toISOString();
  const actorRole = isAdmin && !isAssignedProvider ? "admin" : "provider";

  // ── REQUEST CLARIFICATION ────────────────────────────────────────────────
  if (action === "request_clarification") {
    const reason = (body.reason ?? "").trim();
    if (!reason) return json(400, { ok: false, error: "A clarification reason is required." });

    const { data: updated, error } = await admin.from("order_additional_pet_requests")
      .update({ status: "clarification_requested", provider_decision_reason: reason })
      .eq("id", reqRow.id).in("status", decidable).select().maybeSingle();
    if (error) return json(500, { ok: false, error: error.message });
    if (!updated) return json(409, { ok: false, error: "Request state changed — reload and try again." });

    await admin.from("order_additional_pet_request_events").insert({
      request_id: reqRow.id, order_id: order.id, event_type: "clarification_requested",
      from_status: reqRow.status as string, to_status: "clarification_requested",
      actor_role: actorRole, actor_id: callerUserId, detail: { reason },
    });

    if (custEmail) {
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#374151;"><img src="${LOGO_URL}" width="140" alt="PawTenant" style="display:block;margin-bottom:16px;"/><h2 style="color:#0f172a;font-size:20px;">More information needed</h2><p style="line-height:1.7;font-size:14px;">Hi ${order.first_name || "there"}, the provider reviewing the request to add <strong>${petName}</strong> to order <strong>${confId}</strong> needs a little more information:</p><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;font-size:13px;color:#9a3412;line-height:1.6;">${reason}</div><p style="line-height:1.7;font-size:14px;">Please update the pet's details in your customer portal. No further payment is required.</p></div>`;
      await sendAdditionalPetEmail(admin, {
        orderId: order.id, confirmationId: confId, to: custEmail,
        subject: "More Information Needed — Additional Pet — PawTenant", html,
        slug: "additional_pet_clarification", dedupeKey: `${reqRow.id}:clarification:${nowIso}`,
        sentBy: `provider_${actorRole}`,
      });
    }
    return json(200, { ok: true, status: "clarification_requested" });
  }

  // ── APPROVE ──────────────────────────────────────────────────────────────
  if (action === "approve") {
    // Idempotent: approving twice is a no-op, never a second decision.
    if (reqRow.provider_decision === "approved") {
      return json(200, { ok: true, status: reqRow.status, alreadyDecided: true });
    }

    const { data: updated, error } = await admin.from("order_additional_pet_requests")
      .update({
        provider_decision: "approved", provider_decision_at: nowIso,
        provider_decision_reason: (body.reason ?? "").trim() || null,
        // NOT `completed`. The revised document does not exist yet; it is
        // produced by provider-submit-letter, which activates version 2+ only
        // after generation succeeds.
        status: "approved_pending_document",
      })
      .eq("id", reqRow.id).is("provider_decision", null)
      .in("status", decidable).select().maybeSingle();
    if (error) return json(500, { ok: false, error: error.message });
    if (!updated) return json(409, { ok: false, error: "Request state changed — reload and try again." });

    await admin.from("order_additional_pet_request_events").insert({
      request_id: reqRow.id, order_id: order.id, event_type: "provider_approved",
      from_status: reqRow.status as string, to_status: "approved_pending_document",
      actor_role: actorRole, actor_id: callerUserId,
      detail: { pet_name: petName, target_pet_count: reqRow.target_pet_count },
    });

    try {
      await admin.from("audit_logs").insert({
        action: "additional_pet_approved", object_type: "order", object_id: confId,
        description: `Additional Pet approved by ${actorRole} — awaiting the revised document. The original letter and its verification ID remain active and unchanged until the revision is generated.`,
        metadata: { request_id: reqRow.id, order_id: order.id, pet_name: petName,
                    target_pet_count: reqRow.target_pet_count },
      });
    } catch { /* non-critical */ }

    return json(200, { ok: true, status: "approved_pending_document" });
  }

  // ── REJECT ───────────────────────────────────────────────────────────────
  const reason = (body.reason ?? "").trim();
  if (!reason) return json(400, { ok: false, error: "A rejection reason is required." });

  if (reqRow.provider_decision === "rejected") {
    return json(200, { ok: true, status: reqRow.status, alreadyDecided: true });
  }

  const wasPaid = !!reqRow.paid_at && (reqRow.pricing_outcome as string) === "paid_upgrade";

  const { data: rejected, error: rErr } = await admin.from("order_additional_pet_requests")
    .update({
      provider_decision: "rejected", provider_decision_at: nowIso,
      provider_decision_reason: reason,
      // A paid rejection owes a refund before it is terminal.
      status: wasPaid ? "refund_pending" : "rejected",
    })
    .eq("id", reqRow.id).is("provider_decision", null)
    .in("status", decidable).select().maybeSingle();
  if (rErr) return json(500, { ok: false, error: rErr.message });
  if (!rejected) return json(409, { ok: false, error: "Request state changed — reload and try again." });

  await admin.from("order_additional_pet_request_events").insert({
    request_id: reqRow.id, order_id: order.id, event_type: "provider_rejected",
    from_status: reqRow.status as string, to_status: rejected.status as string,
    actor_role: actorRole, actor_id: callerUserId, detail: { reason },
  });

  // ── ADD-ON-ONLY REFUND ────────────────────────────────────────────────────
  // Refunds EXACTLY the $20 add-on payment intent. The base order's payment,
  // price, paid_at and refund fields are never touched, so this can never
  // register as an order refund, never reach the Google Ads refund-adjustment
  // candidate generator (which reads `orders`), and never void a provider
  // earning. No administration deduction is applied — the add-on is refunded
  // in full per owner policy.
  let refundResult: Record<string, unknown> = { refunded: false };
  if (wasPaid) {
    const piId = reqRow.stripe_payment_intent_id as string | null;
    if (!stripeKey || !piId) {
      refundResult = { refunded: false, pending: true, reason: !piId ? "no_payment_intent" : "stripe_not_configured" };
    } else {
      try {
        // @ts-ignore — Stripe types under Deno
        const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
        const refund = await stripe.refunds.create(
          { payment_intent: piId, amount: ADDITIONAL_PET_UPGRADE_CENTS },
          // Idempotent: a retried rejection can never issue a second refund.
          { idempotencyKey: `addpet-refund:${reqRow.id}` },
        );
        await admin.from("order_additional_pet_requests").update({
          status: "refunded", refunded_at: new Date().toISOString(),
          stripe_refund_id: refund.id,
          refund_amount_cents: refund.amount ?? ADDITIONAL_PET_UPGRADE_CENTS,
        }).eq("id", reqRow.id).is("refunded_at", null);

        await admin.from("order_additional_pet_request_events").insert({
          request_id: reqRow.id, order_id: order.id, event_type: "addon_refunded",
          from_status: "refund_pending", to_status: "refunded",
          actor_role: "system",
          detail: { amount_cents: refund.amount ?? ADDITIONAL_PET_UPGRADE_CENTS, scope: "addon_only" },
        });
        refundResult = { refunded: true, refundId: refund.id, amountCents: refund.amount };

        await admin.from("audit_logs").insert({
          action: "additional_pet_refunded", object_type: "order", object_id: confId,
          description: `Additional Pet add-on refunded in full ($${(ADDITIONAL_PET_UPGRADE_CENTS / 100).toFixed(2)}) after provider rejection. ADD-ON ONLY — the base order, its payment and the original document are untouched. No administration deduction. No Google Ads adjustment.`,
          metadata: { request_id: reqRow.id, order_id: order.id, stripe_refund_id: refund.id,
                      payment_intent_id: piId, amount_cents: ADDITIONAL_PET_UPGRADE_CENTS,
                      scope: "addon_only", base_order_untouched: true },
        });
      } catch (err) {
        console.error("[addPet] refund failed:", err instanceof Error ? err.message : String(err));
        refundResult = { refunded: false, pending: true, error: "refund_failed" };
      }
    }
  }

  try {
    await admin.from("audit_logs").insert({
      action: "additional_pet_rejected", object_type: "order", object_id: confId,
      description: `Additional Pet rejected by ${actorRole}. The base order and the original letter (and its verification ID) are unchanged.${wasPaid ? " Add-on refund initiated." : " No payment was taken, so no refund object was created."}`,
      metadata: { request_id: reqRow.id, order_id: order.id, was_paid: wasPaid, refund: refundResult },
    });
  } catch { /* non-critical */ }

  if (custEmail) {
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#374151;"><img src="${LOGO_URL}" width="140" alt="PawTenant" style="display:block;margin-bottom:16px;"/><h2 style="color:#0f172a;font-size:20px;">Update on your additional pet request</h2><p style="line-height:1.7;font-size:14px;">Hi ${order.first_name || "there"}, after clinical review the provider was not able to approve adding <strong>${petName}</strong> to order <strong>${confId}</strong>.</p><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;font-size:13px;color:#475569;line-height:1.6;">${reason}</div><p style="line-height:1.7;font-size:14px;">${wasPaid ? "We have refunded the $20 upgrade in full. Refunds typically appear on your statement within 5&ndash;10 business days." : "No payment was taken for this request."}</p><p style="line-height:1.7;font-size:13px;color:#64748b;">Your existing letter is unaffected and remains valid, and its verification ID continues to verify unchanged.</p></div>`;
    await sendAdditionalPetEmail(admin, {
      orderId: order.id, confirmationId: confId, to: custEmail,
      subject: "Update on Your Additional Pet Request — PawTenant", html,
      slug: "additional_pet_rejected", dedupeKey: `${reqRow.id}:additional_pet_rejected`,
      sentBy: `provider_${actorRole}`,
    });
  }

  return json(200, { ok: true, status: wasPaid ? (refundResult.refunded ? "refunded" : "refund_pending") : "rejected", refund: refundResult });
});
