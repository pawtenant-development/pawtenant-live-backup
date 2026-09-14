// partner-orders-v1/accept.ts
//
// Acceptance is a single database call on purpose.
//
// The order row, the canonical assessment answers, the immutable financial
// snapshot and the idempotency ledger entry are written by
// public.partner_accept_order() inside ONE transaction. Doing this as four
// round trips from the edge function would mean a crash between steps could
// leave an order with no financial snapshot, or an assessment with no order --
// and a retry would then either duplicate or be permanently stuck.
//
// Idempotency is enforced by the DATABASE, via the partial unique index on
// (partner_id, partner_order_id). Two concurrent identical requests cannot both
// win: the loser is handed the winner's order.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { PartnerErrorCode, PartnerIdentity } from "../_shared/partnerApi.ts";
import type { ValidatedOrder } from "./validate.ts";

export type AcceptResult =
  | {
      ok: true;
      orderId: string;
      confirmationId: string;
      acceptedAt: string;
      communicationPolicy: string;
      documentPolicy: string;
      replayed: boolean;
    }
  | { ok: false; code: PartnerErrorCode };

export async function acceptPartnerOrder(
  admin: SupabaseClient,
  identity: PartnerIdentity,
  order: ValidatedOrder,
  ctx: {
    idempotencyKey: string;
    requestHash: string;
    requestId: string;
    assessmentSchemaVersion: string;
    /** Slice 7: canonical version normalized answers are stored under (PSD
     *  contract submissions). Null keeps the legacy source-version storage. */
    targetAssessmentVersion: string | null;
  },
): Promise<AcceptResult> {
  // GUARD: the same partner_order_id arriving with DIFFERENT content is a
  // conflict, not a retry. partner_accept_order() would happily replay the
  // stored order, which would silently discard the partner's new content -- so
  // the divergence is detected here and reported, with an audit trail.
  const { data: existing } = await admin
    .from("orders")
    .select("id, partner_payload_hash")
    .eq("partner_id", identity.partnerId)
    .eq("partner_order_id", order.partnerOrderId)
    .maybeSingle();

  if (existing && existing.partner_payload_hash !== ctx.requestHash) {
    await admin.from("audit_logs").insert({
      actor_type: "system",
      actor_name: `partner:${identity.partnerSlug}`,
      actor_role: "partner_api",
      object_type: "partner_order",
      object_id: order.partnerOrderId,
      order_id: existing.id,
      action: "order_create",
      category: "partner_api",
      source: "partner-orders-v1",
      description: "partner order id resubmitted with different content -- rejected",
      metadata: {
        outcome: "partner_order_conflict",
        request_id: ctx.requestId,
        partner_id: identity.partnerId,
      },
    }).then(() => {}, () => {});
    return { ok: false, code: "partner_order_conflict" };
  }

  const { data, error } = await admin.rpc("partner_accept_order", {
    p_partner_id: identity.partnerId,
    p_payload: order.rawPayload,
    p_payload_hash: ctx.requestHash,
    p_schema_version: ctx.assessmentSchemaVersion,
    p_idempotency_key: ctx.idempotencyKey,
    p_request_id: ctx.requestId,
    p_target_assessment_version: ctx.targetAssessmentVersion,
  });

  if (error) return { ok: false, code: "internal_error" };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.order_id) return { ok: false, code: "internal_error" };

  // partner_accept_order() already wrote the ledger row inside its transaction.
  // Nothing to do here: the private schema is not reachable through PostgREST,
  // and a second write from this isolate could not be atomic with the order
  // anyway.

  return {
    ok: true,
    orderId: row.order_id,
    confirmationId: row.confirmation_id,
    acceptedAt: row.accepted_at,
    communicationPolicy: row.communication_policy,
    documentPolicy: row.document_policy,
    replayed: Boolean(row.replayed),
  };
}
