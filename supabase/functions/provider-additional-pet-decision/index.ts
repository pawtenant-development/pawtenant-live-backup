// provider-additional-pet-decision
//
// ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001 §15/§16/§17 — the provider's
// decision on an Additional Pet request — amended by
// ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-DOCUMENT-REVISION-001 (owner
// decision 2026-08-26): a provider DECLINE is that provider's decision only.
// It never refunds, never finally rejects the customer's paid request, and
// returns the review to the admin reassignment queue.
//
// Actions:
//   "approve" | "request_clarification" | "reject"  — provider (or admin).
//     "reject" now DECLINES: the request moves to `needs_reassignment`, the
//     declining provider's assignment ends, the payment stays applied, and
//     NO refund of any kind is initiated. "decline" is accepted as an alias.
//   "refund" | "final_reject" — ADMIN ONLY. `refund` is the single explicit
//     path that can move add-on money back to the customer; `final_reject`
//     closes a request that holds no unreturned payment.
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
//   • A PROVIDER DECLINE NEVER REACHES STRIPE. The decline branch contains no
//     refund call and no refund state: the paid add-on stays paid and becomes
//     `needs_reassignment` for the admin workload. Only the explicit admin
//     `refund` action below may move money, and it refunds EXACTLY the add-on,
//     at the amount THIS request was quoted and settled at (its immutable
//     amount_cents/currency) — never the current list price, never the base
//     order, never a partial. If Stripe's settled amount and the request's
//     quote disagree, no refund is issued and the case is held for Admin.
//   • The reviewer of record is the REQUEST-level assignee
//     (assigned_provider_user_id), falling back to the order's provider for
//     legacy rows — reassignment must never rewrite the completed base order.

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAdditionalPetEmail } from "../_shared/completeAdditionalPetPayment.ts";
import { resolveAuditActor } from "../_shared/auditActor.ts";

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

  // "decline" is the truthful name for what "reject" now does; both are accepted
  // so existing clients keep working.
  const action = body.action === "decline" ? "reject" : (body.action ?? "");
  if (!["approve", "request_clarification", "reject", "refund", "final_reject"].includes(action)) {
    return json(400, { ok: false, error: `Unknown action: ${action}` });
  }
  if (!body.requestId) return json(400, { ok: false, error: "requestId required" });

  // ── Caller identity ───────────────────────────────────────────────────────
  // ADMIN-AUDIT-ACTOR-ATTRIBUTION-...-001: the audit rows below used to carry no
  // actor columns at all, so "who approved this add-on?" fell back to the table
  // defaults. The shared resolver is the single source of actor truth for edge
  // functions — it reads the JWT and never the request body.
  const auditActor = await resolveAuditActor(req, admin);
  let isAdmin = false;
  let callerUserId: string | null = null;
  let callerName: string | null = null;
  if (bearer === serviceKey) {
    isAdmin = true;
  } else {
    const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
    if (userErr || !userResp.user) return json(401, { ok: false, error: "Invalid token" });
    callerUserId = userResp.user.id;
    const { data: profile } = await admin.from("doctor_profiles")
      .select("is_admin, full_name").eq("user_id", callerUserId).maybeSingle();
    isAdmin = !!(profile as { is_admin?: boolean } | null)?.is_admin;
    callerName = ((profile as { full_name?: string } | null)?.full_name ?? null);
  }

  // ── Load request + order, and AUTHORISE ───────────────────────────────────
  const { data: reqRow } = await admin.from("order_additional_pet_requests")
    .select("*").eq("id", body.requestId).maybeSingle();
  if (!reqRow) return json(404, { ok: false, error: "Request not found" });

  const { data: order } = await admin.from("orders")
    .select("id, confirmation_id, email, first_name, doctor_user_id, letter_type")
    .eq("id", reqRow.order_id).maybeSingle();
  if (!order) return json(404, { ok: false, error: "Order not found" });

  // ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-DOCUMENT-REVISION-001: the
  // reviewer of record is the REQUEST-level assignee. Falling back to the
  // order's provider covers legacy rows created before request-level
  // assignment existed. Reassignment therefore never needs to touch
  // orders.doctor_user_id — the completed base order's provider history stays
  // exactly as it is.
  const effectiveReviewerId =
    (reqRow.assigned_provider_user_id as string | null) ?? order.doctor_user_id;
  const isAssignedProvider = !!callerUserId && effectiveReviewerId === callerUserId;
  if (!isAdmin && !isAssignedProvider) {
    return json(403, { ok: false, error: "Not authorized for this request" });
  }

  const decidable = ["pending_provider_review", "clarification_requested", "resubmitted"];

  const confId = (order.confirmation_id as string) ?? "";
  const custEmail = (order.email as string) ?? "";
  const petName = ((reqRow.new_pet as Record<string, unknown> | null)?.name as string) ?? "the pet";
  const nowIso = new Date().toISOString();
  const actorRole = isAdmin && !isAssignedProvider ? "admin" : "provider";
  const wasPaid = !!reqRow.paid_at && (reqRow.pricing_outcome as string) === "paid_upgrade";

  // ── ADMIN-ONLY: EXPLICIT REFUND ──────────────────────────────────────────
  // The ONLY path in the Additional Pet workflow that can move money back to
  // the customer. Provider decline routes to reassignment and never gets here.
  if (action === "refund") {
    if (!isAdmin) {
      return json(403, { ok: false, error: "Refunds require an authorized admin." });
    }
    const reason = (body.reason ?? "").trim();
    if (!reason) return json(400, { ok: false, error: "A refund reason is required." });

    if (reqRow.refunded_at) {
      return json(200, {
        ok: true, status: reqRow.status, alreadyRefunded: true,
        refundId: reqRow.stripe_refund_id ?? null,
      });
    }
    if (!wasPaid) {
      return json(400, { ok: false, code: "nothing_to_refund",
        error: "No settled add-on payment exists on this request." });
    }
    const refundableFrom = ["needs_reassignment", "refund_pending"];
    if (!refundableFrom.includes(reqRow.status as string)) {
      return json(409, { ok: false, code: "not_refundable",
        error: `This request is not in a refundable state (status=${reqRow.status}).` });
    }

    // ── ADD-ON-ONLY REFUND ──────────────────────────────────────────────────
    // Refunds EXACTLY the add-on payment intent, at the amount THIS REQUEST was
    // quoted and settled at. The base order's payment, price, paid_at and refund
    // fields are never touched, so this can never register as an order refund,
    // never reach the Google Ads refund-adjustment candidate generator (which
    // reads `orders`), and never void a provider earning. No administration
    // deduction is applied — the add-on is refunded in full per owner policy.
    //
    // ADDITIONAL-PET-POST-LIVE-RECONCILIATION-001: the amount MUST come from the
    // request's own immutable quote (amount_cents/currency, frozen by
    // tg_addpet_immutable), never from the CURRENT global price. After $20 -> $30
    // the global helper returns 3000, so a grandfathered v1_2000 request would
    // have been refunded 3000 against a 2000 charge — Stripe rejects a refund
    // larger than the charge, so every grandfathered refund would have failed.
    // The global price describes what a NEW request costs today; it says nothing
    // about what THIS customer actually paid.
    let refundResult: Record<string, unknown> = { refunded: false };
    // The status reported back always mirrors what was actually written:
    // "refunded" only after the row transitioned, "refund_pending" only when
    // the row was moved there (amount mismatch), otherwise the standing state.
    let statusAfter = reqRow.status as string;
    const piId = reqRow.stripe_payment_intent_id as string | null;
    const quotedCents = Number(reqRow.amount_cents);
    const quotedCurrency = String(reqRow.currency ?? "").toLowerCase();
    const quotedVersion = (reqRow.pricing_version as string | null) ?? null;

    if (!stripeKey || !piId) {
      refundResult = { refunded: false, pending: true, reason: !piId ? "no_payment_intent" : "stripe_not_configured" };
    } else if (!Number.isInteger(quotedCents) || quotedCents <= 0 || !quotedCurrency) {
      // The row cannot state what was owed. Never guess an amount.
      refundResult = { refunded: false, pending: true, error: "quote_not_resolvable",
                       requiresAdminReview: true };
      await admin.from("audit_logs").insert({
        actor_id: auditActor.id, actor_name: auditActor.name,
        actor_role: auditActor.role, actor_type: auditActor.type,
        action: "additional_pet_refund_blocked", object_type: "order", object_id: confId,
        description: `Additional Pet refund HELD: the request does not carry a usable quote (amount_cents=${String(reqRow.amount_cents)}, currency=${String(reqRow.currency)}). No refund was issued and no amount was guessed.`,
        metadata: { request_id: reqRow.id, order_id: order.id, payment_intent_id: piId,
                    reason: "quote_not_resolvable", scope: "addon_only" },
      });
    } else {
      try {
        // @ts-ignore — Stripe types under Deno
        const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

        // The two authoritative sources — what Stripe actually settled, and the
        // request's frozen quote — must agree before a single cent moves.
        const pi = await stripe.paymentIntents.retrieve(piId);
        const settledCents = Number(pi.amount_received ?? pi.amount ?? 0);
        const settledCurrency = String(pi.currency ?? "").toLowerCase();
        const amountAgrees = settledCents === quotedCents;
        const currencyAgrees = settledCurrency === quotedCurrency;

        if (!amountAgrees || !currencyAgrees) {
          // Disagreement is an accounting fact, not something to average over.
          // Preserve the evidence and hold the request in refund_pending so the
          // money is visibly still owed.
          refundResult = {
            refunded: false, pending: true, error: "amount_mismatch",
            requiresAdminReview: true,
            quotedCents, quotedCurrency, quotedVersion, settledCents, settledCurrency,
          };
          await admin.from("order_additional_pet_requests").update({
            status: "refund_pending",
          }).eq("id", reqRow.id).in("status", refundableFrom);
          statusAfter = "refund_pending";
          await admin.from("order_additional_pet_request_events").insert({
            request_id: reqRow.id, order_id: order.id, event_type: "addon_refund_blocked",
            from_status: reqRow.status as string, to_status: "refund_pending",
            actor_role: "system",
            detail: { reason: "amount_mismatch", quoted_cents: quotedCents,
                      quoted_currency: quotedCurrency, quoted_version: quotedVersion,
                      settled_cents: settledCents, settled_currency: settledCurrency,
                      payment_intent_id: piId, scope: "addon_only" },
          });
          await admin.from("audit_logs").insert({
            actor_id: auditActor.id, actor_name: auditActor.name,
            actor_role: auditActor.role, actor_type: auditActor.type,
            action: "additional_pet_refund_blocked", object_type: "order", object_id: confId,
            description: `Additional Pet refund HELD for Admin review: the settled payment (${settledCents} ${settledCurrency}) does not match the request's quote (${quotedCents} ${quotedCurrency}${quotedVersion ? `, ${quotedVersion}` : ""}). No refund was issued — refunding either figure automatically would either short-change the customer or over-refund PawTenant.`,
            metadata: { request_id: reqRow.id, order_id: order.id, payment_intent_id: piId,
                        reason: "amount_mismatch", quoted_cents: quotedCents,
                        quoted_currency: quotedCurrency, quoted_version: quotedVersion,
                        settled_cents: settledCents, settled_currency: settledCurrency,
                        scope: "addon_only", base_order_untouched: true },
          });
        } else {
          const refund = await stripe.refunds.create(
            { payment_intent: piId, amount: quotedCents },
            // Idempotent: a retried refund can never issue a second one.
            { idempotencyKey: `addpet-refund:${reqRow.id}` },
          );
          const refundedCents = Number(refund.amount ?? quotedCents);
          await admin.from("order_additional_pet_requests").update({
            status: "refunded", refunded_at: new Date().toISOString(),
            stripe_refund_id: refund.id,
            refund_amount_cents: refundedCents,
          }).eq("id", reqRow.id).is("refunded_at", null);
          statusAfter = "refunded";

          await admin.from("order_additional_pet_request_events").insert({
            request_id: reqRow.id, order_id: order.id, event_type: "addon_refunded",
            from_status: reqRow.status as string, to_status: "refunded",
            actor_role: "admin", actor_id: callerUserId,
            detail: { amount_cents: refundedCents, currency: quotedCurrency,
                      pricing_version: quotedVersion, scope: "addon_only",
                      reason },
          });
          refundResult = { refunded: true, refundId: refund.id, amountCents: refundedCents,
                           currency: quotedCurrency, pricingVersion: quotedVersion };

          await admin.from("audit_logs").insert({
            actor_id: auditActor.id, actor_name: auditActor.name,
            actor_role: auditActor.role, actor_type: auditActor.type,
            action: "additional_pet_refunded", object_type: "order", object_id: confId,
            description: `Additional Pet add-on refunded in full ($${(refundedCents / 100).toFixed(2)}${quotedVersion ? `, ${quotedVersion}` : ""}) by EXPLICIT admin action — the amount this request was quoted and settled at, not the current list price. ADD-ON ONLY — the base order, its payment and the original document are untouched. No administration deduction. No Google Ads adjustment.`,
            metadata: { request_id: reqRow.id, order_id: order.id, stripe_refund_id: refund.id,
                        payment_intent_id: piId, amount_cents: refundedCents,
                        currency: quotedCurrency, pricing_version: quotedVersion,
                        settled_cents: settledCents, refund_reason: reason,
                        scope: "addon_only", base_order_untouched: true },
          });
        }
      } catch (err) {
        console.error("[addPet] refund failed:", err instanceof Error ? err.message : String(err));
        refundResult = { refunded: false, pending: true, error: "refund_failed" };
      }
    }

    if (custEmail) {
      // The refund sentence states what THIS customer actually paid, and only
      // claims the money is back when it genuinely is. A held/pending refund must
      // never read as completed — the customer would stop watching for it.
      const emailRefundCents = Number(refundResult.amountCents ?? reqRow.amount_cents ?? 0);
      const refundLine = refundResult.refunded
        ? `We have refunded the $${(emailRefundCents / 100).toFixed(2)} upgrade in full. Refunds typically appear on your statement within 5&ndash;10 business days.`
        : "Your refund for this upgrade is being processed. Our support team is completing it and will confirm as soon as it is on its way.";
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#374151;"><img src="${LOGO_URL}" width="140" alt="PawTenant" style="display:block;margin-bottom:16px;"/><h2 style="color:#0f172a;font-size:20px;">Update on your additional pet request</h2><p style="line-height:1.7;font-size:14px;">Hi ${order.first_name || "there"}, the request to add <strong>${petName}</strong> to order <strong>${confId}</strong> has been closed.</p><p style="line-height:1.7;font-size:14px;">${refundLine}</p><p style="line-height:1.7;font-size:13px;color:#64748b;">Your existing letter is unaffected and remains valid, and its verification ID continues to verify unchanged.</p></div>`;
      await sendAdditionalPetEmail(admin, {
        orderId: order.id, confirmationId: confId, to: custEmail,
        subject: "Update on Your Additional Pet Request — PawTenant", html,
        slug: "additional_pet_refunded", dedupeKey: `${reqRow.id}:additional_pet_refunded`,
        sentBy: "admin_refund_action",
      });
    }

    return json(200, {
      ok: true,
      status: statusAfter,
      refund: refundResult,
    });
  }

  // ── ADMIN-ONLY: FINAL REJECTION (no unreturned money) ─────────────────────
  // Closes a request that holds no unreturned payment: a $0 included request,
  // or a paid request whose refund has already been issued. A paid, unrefunded
  // request can NOT be finally rejected — the explicit `refund` action is the
  // only terminal path for it, so closing a paid request always returns the
  // money or visibly holds it for review.
  if (action === "final_reject") {
    if (!isAdmin) {
      return json(403, { ok: false, error: "Final rejection requires an authorized admin." });
    }
    const reason = (body.reason ?? "").trim();
    if (!reason) return json(400, { ok: false, error: "A rejection reason is required." });

    if (reqRow.status === "rejected") {
      return json(200, { ok: true, status: "rejected", alreadyDecided: true });
    }
    if (reqRow.status !== "needs_reassignment") {
      return json(409, { ok: false, code: "not_finally_rejectable",
        error: `Only a request awaiting reassignment can be finally rejected (status=${reqRow.status}).` });
    }
    if (wasPaid && !reqRow.refunded_at) {
      return json(409, { ok: false, code: "refund_required",
        error: "This request holds a settled payment. Use the explicit refund action instead — closing it must return the money." });
    }

    const { data: closed, error: frErr } = await admin.from("order_additional_pet_requests")
      .update({ status: "rejected" })
      .eq("id", reqRow.id).eq("status", "needs_reassignment").select().maybeSingle();
    if (frErr) return json(500, { ok: false, error: frErr.message });
    if (!closed) return json(409, { ok: false, error: "Request state changed — reload and try again." });

    await admin.from("order_additional_pet_request_events").insert({
      request_id: reqRow.id, order_id: order.id, event_type: "admin_final_rejected",
      from_status: "needs_reassignment", to_status: "rejected",
      actor_role: "admin", actor_id: callerUserId, detail: { reason },
    });
    try {
      await admin.from("audit_logs").insert({
        actor_id: auditActor.id, actor_name: auditActor.name,
        actor_role: auditActor.role, actor_type: auditActor.type,
        action: "additional_pet_rejected", object_type: "order", object_id: confId,
        description: `Additional Pet request finally rejected by admin. ${wasPaid ? "The add-on payment was already refunded — no money is retained." : "No payment was taken for this request."} The base order and the original letter (and its verification ID) are unchanged.`,
        metadata: { request_id: reqRow.id, order_id: order.id, was_paid: wasPaid,
                    already_refunded: !!reqRow.refunded_at, reason },
      });
    } catch { /* non-critical */ }

    if (custEmail) {
      const moneyLine = !wasPaid
        ? "No payment was taken for this request."
        : "The payment for this request was already refunded in full.";
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#374151;"><img src="${LOGO_URL}" width="140" alt="PawTenant" style="display:block;margin-bottom:16px;"/><h2 style="color:#0f172a;font-size:20px;">Update on your additional pet request</h2><p style="line-height:1.7;font-size:14px;">Hi ${order.first_name || "there"}, after clinical review we were not able to approve adding <strong>${petName}</strong> to order <strong>${confId}</strong>.</p><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;font-size:13px;color:#475569;line-height:1.6;">${reason}</div><p style="line-height:1.7;font-size:14px;">${moneyLine}</p><p style="line-height:1.7;font-size:13px;color:#64748b;">Your existing letter is unaffected and remains valid, and its verification ID continues to verify unchanged.</p></div>`;
      await sendAdditionalPetEmail(admin, {
        orderId: order.id, confirmationId: confId, to: custEmail,
        subject: "Update on Your Additional Pet Request — PawTenant", html,
        slug: "additional_pet_rejected", dedupeKey: `${reqRow.id}:additional_pet_rejected`,
        sentBy: "admin_final_reject",
      });
    }

    return json(200, { ok: true, status: "rejected" });
  }

  // IDEMPOTENCY FIRST. A retried approve/decline (double click, network retry,
  // client replay) must return the state that already stands rather than a
  // 409 — otherwise a provider whose request timed out after the write sees an
  // error for an action that actually succeeded. This is checked BEFORE the
  // decidable-status gate precisely because a decided request is no longer in
  // a decidable state.
  if (action === "approve" && reqRow.provider_decision === "approved") {
    return json(200, {
      ok: true, status: reqRow.status, alreadyDecided: true,
      decision: reqRow.provider_decision,
    });
  }
  if (action === "reject") {
    // A replayed decline: the request is already in the reassignment queue.
    if (reqRow.status === "needs_reassignment") {
      return json(200, { ok: true, status: "needs_reassignment", alreadyDeclined: true });
    }
    // Legacy terminal rows (decided under the retired auto-refund policy).
    if (reqRow.provider_decision === "rejected") {
      return json(200, {
        ok: true, status: reqRow.status, alreadyDecided: true,
        decision: reqRow.provider_decision,
      });
    }
  }

  // Only a request that is actually in front of a provider can be decided.
  if (!decidable.includes(reqRow.status as string)) {
    return json(409, {
      ok: false, code: "not_decidable",
      error: `This request is not awaiting a decision (status=${reqRow.status}).`,
    });
  }

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
        actor_id: auditActor.id, actor_name: auditActor.name,
        actor_role: auditActor.role, actor_type: auditActor.type,
        action: "additional_pet_approved", object_type: "order", object_id: confId,
        description: `Additional Pet approved by ${actorRole} — awaiting the revised document. The original letter and its verification ID remain active and unchanged until the revision is generated.`,
        metadata: { request_id: reqRow.id, order_id: order.id, pet_name: petName,
                    target_pet_count: reqRow.target_pet_count },
      });
    } catch { /* non-critical */ }

    return json(200, { ok: true, status: "approved_pending_document" });
  }

  // ── DECLINE (wire name "reject") ─────────────────────────────────────────
  // ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-DOCUMENT-REVISION-001: a decline
  // is THIS provider's decision, not the system's. The request moves to
  // `needs_reassignment` for the admin workload, the declining provider's
  // assignment ends, and the payment — if any — stays applied to the request.
  // NO Stripe call happens here, no refund state is entered, no "rejected"
  // terminal state is written, and the customer is never told the request was
  // refunded or finally rejected.
  const reason = (body.reason ?? "").trim();
  if (!reason) return json(400, { ok: false, error: "A decline reason is required." });

  const { data: declined, error: dErr } = await admin.from("order_additional_pet_requests")
    .update({
      // The provider_decision columns stay NULL: they describe the CURRENT
      // standing decision, and a decline leaves the request undecided pending
      // reassignment. The decline itself is recorded in the append-only events
      // table below, permanently.
      status: "needs_reassignment",
      assigned_provider_user_id: null,
    })
    .eq("id", reqRow.id).is("provider_decision", null)
    .in("status", decidable).select().maybeSingle();
  if (dErr) return json(500, { ok: false, error: dErr.message });
  if (!declined) return json(409, { ok: false, error: "Request state changed — reload and try again." });

  await admin.from("order_additional_pet_request_events").insert({
    request_id: reqRow.id, order_id: order.id, event_type: "provider_declined",
    from_status: reqRow.status as string, to_status: "needs_reassignment",
    actor_role: actorRole, actor_id: callerUserId,
    detail: {
      reason,
      declined_by: callerUserId,
      declined_by_name: callerName,
    },
  });

  try {
    await admin.from("audit_logs").insert({
      actor_id: auditActor.id, actor_name: auditActor.name,
      actor_role: auditActor.role, actor_type: auditActor.type,
      action: "additional_pet_declined", object_type: "order", object_id: confId,
      description: `Additional Pet declined by ${actorRole} — the request now needs reassignment to another eligible provider. ${wasPaid ? "The add-on payment stays applied to the request; NO refund was initiated." : "No payment was taken for this request."} The base order, its provider history and the original letter (and its verification ID) are unchanged.`,
      metadata: { request_id: reqRow.id, order_id: order.id, was_paid: wasPaid,
                  declined_by: callerUserId, reason, refund: { refunded: false, initiated: false } },
    });
  } catch { /* non-critical */ }

  if (custEmail) {
    // Truthful, neutral copy: not a refund, not a final rejection. The request
    // continues with another provider and no action or payment is needed.
    const paidLine = wasPaid
      ? " Your payment remains applied to this request — no refund has been issued and no further payment is needed."
      : "";
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#374151;"><img src="${LOGO_URL}" width="140" alt="PawTenant" style="display:block;margin-bottom:16px;"/><h2 style="color:#0f172a;font-size:20px;">Your additional pet request is being reviewed further</h2><p style="line-height:1.7;font-size:14px;">Hi ${order.first_name || "there"}, the provider who first looked at the request to add <strong>${petName}</strong> to order <strong>${confId}</strong> was unable to complete the review, so we are arranging for another licensed provider to review it.${paidLine}</p><p style="line-height:1.7;font-size:14px;">There is nothing you need to do right now — we will update you as soon as the review is complete.</p><p style="line-height:1.7;font-size:13px;color:#64748b;">Your existing letter is unaffected and remains valid, and its verification ID continues to verify unchanged.</p></div>`;
    await sendAdditionalPetEmail(admin, {
      orderId: order.id, confirmationId: confId, to: custEmail,
      subject: "Update on Your Additional Pet Request — PawTenant", html,
      slug: "additional_pet_reassignment_pending", dedupeKey: `${reqRow.id}:declined:${nowIso}`,
      sentBy: `provider_${actorRole}`,
    });
  }

  return json(200, { ok: true, status: "needs_reassignment", reassignment: true });
});
