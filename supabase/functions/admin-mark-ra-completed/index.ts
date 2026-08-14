// admin-mark-ra-completed — RA-LIFECYCLE-001 step E.
//
// The manual escape hatch for RA/Additional-Documentation work that was really
// performed but never went through the dedicated workflow (historical orders,
// work done over email, a provider who sent the form the wrong way).
//
// WHAT MAKES THIS SAFE
// --------------------
//   * ADMIN ONLY, attributable. A service-role bearer is refused outright: this
//     transition creates money (a provider earning), so it must be traceable to
//     a real employee, exactly like admin-review-document.
//   * ENTITLEMENT IS PROVEN, NEVER INFERRED. Only a saved RA bundle or a paid,
//     non-refunded additional-documentation request counts. Price, coupons,
//     filenames, document count and pre-existing earnings prove nothing — an
//     order with three uploaded files and no entitlement is still refused.
//   * IDEMPOTENT. Completion state is re-read inside the call, and the earning
//     is created through the shared ensureRaCompletionEarning(), which is itself
//     guarded by a pre-check AND the partial unique index
//     doctor_earnings_ra_completion_order_uniq. Double-click, retry, replay and
//     reconciliation all converge on exactly one earning.
//   * FILE COUNT IS IRRELEVANT. The amount comes from the provider's configured
//     per-order rate. Nothing here multiplies by documents.
//   * THE IMMUTABLE ORIGINAL IS NEVER TOUCHED. Reclassifying legacy evidence
//     clears the derived verification pointers only. `file_url` is never
//     written, so the clean original keeps being served.
//
// verify_jwt stays TRUE for this function (admin surface, real user JWT).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureRaCompletionEarning } from "../_shared/raCompletionEarning.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Derived verification pointers. Cleared on reclassify; `file_url` is NOT here. */
const VERIFICATION_POINTER_RESET = {
  processed_file_url: null,
  footer_injected: false,
  footer_letter_id: null,
  qr_file_url: null,
  qr_generated_at: null,
  qr_letter_id: null,
  qr_placement: null,
  qr_source_sha256: null,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer) return json(401, { ok: false, error: "Missing bearer token" });

  // Creating a payout must be attributable to a person, never to a key.
  if (bearer === SERVICE_ROLE_KEY) {
    return json(403, {
      ok: false,
      error: "Marking RA complete requires an employee session — a service-role key cannot perform it.",
    });
  }

  let body: {
    orderId?: string;
    reason?: string;
    confirmed?: boolean;
    evidenceDocumentId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const orderId = (body.orderId ?? "").trim();
  const reason = (body.reason ?? "").trim();
  const evidenceDocumentId = (body.evidenceDocumentId ?? "") || null;
  if (!orderId) return json(400, { ok: false, error: "orderId is required" });
  if (body.confirmed !== true) return json(400, { ok: false, error: "Explicit confirmation is required" });
  if (reason.length < 5) return json(400, { ok: false, error: "A short internal reason is required" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: userResp, error: userErr } = await admin.auth.getUser(bearer);
  if (userErr || !userResp?.user) return json(401, { ok: false, error: "Invalid token" });
  const callerId = userResp.user.id;

  const { data: prof } = await admin
    .from("doctor_profiles")
    .select("is_admin, is_active, full_name")
    .eq("user_id", callerId)
    .maybeSingle();
  const p = prof as { is_admin?: boolean; is_active?: boolean; full_name?: string } | null;
  if (!p || p.is_admin !== true || p.is_active === false) {
    return json(403, { ok: false, error: "Not authorized to mark RA services complete" });
  }

  // ── Load the order and PROVE entitlement ──────────────────────────────────
  const { data: order } = await admin
    .from("orders")
    .select(
      "id, confirmation_id, status, doctor_status, additional_documentation_status, includes_reasonable_accommodation_letter, package_key, doctor_user_id",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return json(404, { ok: false, error: "Order not found" });

  const isBundle = order.includes_reasonable_accommodation_letter === true ||
    ["esa_ra_bundle", "psd_ra_bundle"].includes(String(order.package_key ?? ""));

  const { data: paidRequests } = await admin
    .from("order_additional_documentation_requests")
    .select("id, status, paid_at, cancelled_at, amount_cents, refund_amount_cents")
    .eq("order_id", orderId);
  // REFUND-CONSUMER rule: `refunded_at` is stamped for PARTIAL refunds too. A
  // bare boolean read would deny entitlement for RA work that was paid for and
  // only partly refunded. Entitlement survives a partial refund and ends only
  // when the charge has been returned in full.
  const paidRequest = (paidRequests ?? []).find((r) => {
    const amt = typeof r.amount_cents === "number" ? r.amount_cents : 0;
    const ref = typeof r.refund_amount_cents === "number" ? r.refund_amount_cents : 0;
    return r.status === "paid" && !!r.paid_at && !r.cancelled_at && amt - ref > 0;
  }) ?? null;

  // FAIL CLOSED. No bundle and no paid request → there is no RA service to
  // complete, whatever the documents or the price happen to look like.
  if (!isBundle && !paidRequest) {
    return json(422, {
      ok: false,
      reason: "no_ra_entitlement",
      error: "This order has no RA entitlement — no saved RA bundle and no paid, non-refunded Additional Documentation request.",
    });
  }

  // ── Idempotency: is it already done? ──────────────────────────────────────
  const { data: existingEarning } = await admin
    .from("doctor_earnings")
    .select("id")
    .eq("order_id", orderId)
    .in("earning_type", ["ra_completion", "additional_documentation"])
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();

  const alreadyComplete = (order.additional_documentation_status ?? "") === "completed";
  if (alreadyComplete && existingEarning) {
    return json(200, {
      ok: true,
      alreadyCompleted: true,
      created: false,
      message: "RA service was already marked complete — nothing changed.",
    });
  }

  // ── Optional: reclassify confirmed legacy evidence ────────────────────────
  let reclassified: string | null = null;
  if (evidenceDocumentId) {
    const { data: doc } = await admin
      .from("order_documents")
      .select("id, order_id, doc_type")
      .eq("id", evidenceDocumentId)
      .maybeSingle();
    if (!doc || doc.order_id !== orderId) {
      return json(404, { ok: false, error: "Evidence document does not belong to this order" });
    }
    if (doc.doc_type !== "housing_completed") {
      const { error: reErr } = await admin
        .from("order_documents")
        .update({
          doc_type: "housing_completed",
          review_status: "approved",
          customer_visible: true,
          ...VERIFICATION_POINTER_RESET,
        })
        .eq("id", evidenceDocumentId);
      if (reErr) return json(500, { ok: false, error: `Could not reclassify evidence: ${reErr.message}` });
      reclassified = evidenceDocumentId;
    }
  }

  // ── Mark the RA service completed ─────────────────────────────────────────
  const { error: statusErr } = await admin
    .from("orders")
    .update({ additional_documentation_status: "completed" })
    .eq("id", orderId);
  if (statusErr) return json(500, { ok: false, error: `Could not update RA status: ${statusErr.message}` });

  // ── Create the earning AT MOST ONCE ───────────────────────────────────────
  // Bundle orders earn through the shared, index-guarded primitive. A paid
  // standalone request already has its own earning keyed to the request id by
  // doctor_earnings_addon_request_uniq, so nothing extra is created here.
  let earningResult: { created: boolean; reason: string } = { created: false, reason: "already_exists" };
  if (isBundle) {
    earningResult = await ensureRaCompletionEarning(admin, orderId);
  } else {
    earningResult = { created: false, reason: "addon_request_earning_owned_by_payment_flow" };
  }

  // ── Return to Completed ONLY when the base letter was already delivered ───
  // RA approval alone must never complete an order whose clinical letter has not
  // reached the customer.
  const baseDelivered = order.doctor_status === "patient_notified";
  let orderReturnedToCompleted = false;
  if (baseDelivered && order.status !== "completed") {
    const { error: oErr } = await admin.from("orders").update({ status: "completed" }).eq("id", orderId);
    if (!oErr) orderReturnedToCompleted = true;
  }

  // ── Audit: actor, order, evidence, transition, reason. No PHI. ────────────
  await admin.from("audit_logs").insert({
    actor_id: callerId,
    actor_name: p.full_name ?? "Admin",
    actor_role: "admin",
    actor_type: "user",
    category: "approval",
    source: "admin-mark-ra-completed",
    object_type: "order",
    object_id: order.confirmation_id ?? orderId,
    order_id: orderId,
    document_id: reclassified,
    action: "ra_service_marked_completed_manually",
    description: `RA service marked completed manually for ${order.confirmation_id ?? orderId}`,
    metadata: {
      reason,
      entitlement: isBundle ? "saved_ra_bundle" : "paid_additional_documentation_request",
      additional_documentation_request_id: paidRequest?.id ?? null,
      evidence_document_id: reclassified,
      evidence_reclassified_to: reclassified ? "housing_completed" : null,
      earning_created: earningResult.created,
      earning_outcome: earningResult.reason,
      base_letter_delivered: baseDelivered,
      order_returned_to_completed: orderReturnedToCompleted,
    },
  });

  return json(200, {
    ok: true,
    created: earningResult.created,
    earningOutcome: earningResult.reason,
    reclassifiedDocumentId: reclassified,
    orderReturnedToCompleted,
    baseLetterDelivered: baseDelivered,
  });
});
