// partner-orders-v1/revise.ts
//
// PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 8 · Part C
// POST /partner-orders-v1/orders/{partner_order_id}/revisions
//
// An API-mediated revision REPLACES the assessment with a complete, freshly
// re-validated canonical payload. It never patches: a partial answer set is a
// validation failure, because the server only ever materializes complete
// immutable snapshots. The accepted original is untouched — the database
// inserts revision N+1 linked to N (partner_revise_assessment), and both the
// snapshot chain and the verbatim raw submissions remain auditable forever.
//
// FAIL-CLOSED STATES (enforced in the database, mirrored here for clear
// errors): once a provider is assigned, or the order is completed or
// cancelled, the API refuses — changed answers under an active clinical
// review require the documented administrative + clinical review path via
// partner support. ESA (generic-contract) orders have no canonical schema to
// re-validate and are likewise support-mediated.
//
// Idempotency mirrors the create route: Idempotency-Key required; the same
// key with different content is a conflict; identical content can never mint
// a duplicate version (content-hash replay inside the transaction).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ABSOLUTE_MAX_PAYLOAD_BYTES,
  canonicalPayloadHash,
  PARTNER_PSD_SCHEMA_VERSION,
  partnerError,
  partnerJson,
  type PartnerErrorCode,
  type PartnerIdentity,
} from "../_shared/partnerApi.ts";
import {
  hasDuplicateJsonKeys,
  looksLikeCardData,
  validatePsdContractAssessment,
} from "./validate.ts";

const ALLOWED_TOP_LEVEL = new Set(["revision_reason", "assessment"]);
const ALLOWED_ASSESSMENT = new Set(["schema_version", "answers"]);
const MAX_REASON_CHARS = 1000;

type AuditFn = (opts: {
  partnerId?: string | null; partnerSlug?: string | null; partnerOrderId?: string | null;
  orderId?: string | null; action: string; outcome: string; requestId: string;
  metadata?: Record<string, unknown>;
}) => Promise<void>;

/** Map a partner_revise_assessment refusal to the documented error code. */
function mapRpcError(message: string): PartnerErrorCode {
  if (message.includes("revision_not_found")) return "not_found";
  if (message.includes("revision_locked")) return "revision_locked";
  if (message.includes("revision_unsupported_for_service")) return "revision_unsupported_for_service";
  if (message.includes("revision_reason_required")) return "schema_violation";
  return "internal_error";
}

export async function handleRevision(
  admin: SupabaseClient,
  identity: PartnerIdentity,
  req: Request,
  partnerOrderId: string,
  requestId: string,
  audit: AuditFn,
): Promise<Response> {
  const auditBase = {
    partnerId: identity.partnerId,
    partnerSlug: identity.partnerSlug,
    partnerOrderId,
    action: "assessment_revision",
    requestId,
  };
  const fail = async (code: PartnerErrorCode, details?: Record<string, string[]>) => {
    await audit({ ...auditBase, outcome: code, metadata: details ? { invalid_fields: Object.keys(details) } : undefined });
    return partnerError(code, requestId, details);
  };

  // ── Idempotency key + size ceiling, before the body is trusted ───────────
  const idempotencyKey = req.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return await fail("idempotency_key_required");
  if (idempotencyKey.length > 255) return await fail("schema_violation", { "Idempotency-Key": ["too long"] });

  const declared = Number(req.headers.get("content-length") ?? "0");
  const ceiling = Math.min(identity.maxPayloadBytes, ABSOLUTE_MAX_PAYLOAD_BYTES);
  if (Number.isFinite(declared) && declared > ceiling) return await fail("payload_too_large");

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > ceiling) return await fail("payload_too_large");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return await fail("malformed_json");
  }
  if (hasDuplicateJsonKeys(raw)) {
    return await fail("schema_violation", { body: ["duplicate JSON keys are not permitted"] });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return await fail("schema_violation", { body: ["must be a JSON object"] });
  }
  const b = body as Record<string, unknown>;

  if (looksLikeCardData(b)) return await fail("payment_credentials_rejected");

  const unexpected = Object.keys(b).filter((k) => !ALLOWED_TOP_LEVEL.has(k));
  if (unexpected.length) {
    return await fail("schema_violation", { body: unexpected.map((k) => `unexpected field: ${k}`) });
  }

  // ── revision_reason is mandatory and bounded ─────────────────────────────
  const reason = typeof b.revision_reason === "string" ? b.revision_reason.trim() : "";
  if (!reason) return await fail("schema_violation", { revision_reason: ["required"] });
  if (reason.length > MAX_REASON_CHARS) {
    return await fail("schema_violation", { revision_reason: ["too long"] });
  }

  // ── assessment: complete canonical payload, same shape as intake ─────────
  const assessment = (b.assessment ?? {}) as Record<string, unknown>;
  if (typeof assessment !== "object" || Array.isArray(assessment)) {
    return await fail("schema_violation", { assessment: ["must be an object"] });
  }
  const badAssessment = Object.keys(assessment).filter((k) => !ALLOWED_ASSESSMENT.has(k));
  if (badAssessment.length) {
    return await fail("schema_violation", { assessment: badAssessment.map((k) => `unexpected field: ${k}`) });
  }
  const schemaVersion = typeof assessment.schema_version === "string" ? assessment.schema_version : null;
  const answersRaw = assessment.answers;
  if (!answersRaw || typeof answersRaw !== "object" || Array.isArray(answersRaw)) {
    return await fail("schema_violation", { "assessment.answers": ["required, must be an object of question_id -> answer"] });
  }
  const answers = answersRaw as Record<string, unknown>;

  const requestHash = await canonicalPayloadHash(body);

  // ── Idempotency ledger (private schema — via RPC, same as intake) ────────
  const { data: priorRows } = await admin.rpc("partner_lookup_idempotency", {
    p_partner_id: identity.partnerId,
    p_idempotency_key: idempotencyKey,
  });
  const prior = Array.isArray(priorRows) ? priorRows[0] : priorRows;
  if (prior) {
    if (prior.request_hash !== requestHash) {
      await audit({ ...auditBase, outcome: "idempotency_conflict" });
      return partnerError("idempotency_conflict", requestId);
    }
    if (prior.outcome === "revision_accepted" && prior.order_id) {
      // Replay: report the revision this exact content produced.
      const { data: snap } = await admin
        .from("partner_assessment_snapshots")
        .select("revision, accepted_at")
        .eq("order_id", prior.order_id)
        .eq("source_payload_hash", requestHash)
        .maybeSingle();
      const { data: ord } = await admin
        .from("orders").select("confirmation_id").eq("id", prior.order_id).maybeSingle();
      return partnerJson({
        partner_order_id: partnerOrderId,
        pawtenant_reference: ord?.confirmation_id ?? null,
        revision: snap?.revision ?? null,
        accepted_at: snap?.accepted_at ?? null,
        idempotent_replay: true,
        request_id: requestId,
      }, 200, requestId);
    }
    if (prior.outcome === "rejected" && prior.response_code) {
      return partnerError(prior.response_code as PartnerErrorCode, requestId);
    }
  }

  // ── Tenant-isolated order lookup (service discipline before validation) ──
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, confirmation_id, letter_type")
    .eq("partner_id", identity.partnerId)
    .eq("partner_order_id", partnerOrderId)
    .maybeSingle();
  if (orderErr) return partnerError("internal_error", requestId);
  if (!order) return await fail("not_found");

  const recordRejection = (code: PartnerErrorCode, http: number) =>
    admin.rpc("partner_record_api_rejection", {
      p_partner_id: identity.partnerId,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
      p_partner_order_id: partnerOrderId,
      p_response_code: code,
      p_http_status: http,
    }).then(() => {}, () => {});

  if ((order.letter_type ?? "").toLowerCase() !== "psd") {
    await recordRejection("revision_unsupported_for_service", 422);
    return await fail("revision_unsupported_for_service");
  }

  // ── The COMPLETE canonical contract, re-validated — the same validator the
  //    intake route runs. A partial payload dies here. ──────────────────────
  const contract = await validatePsdContractAssessment(schemaVersion, answers, admin);
  if (!contract.ok) {
    await recordRejection(contract.code, 422);
    return await fail(contract.code, contract.details);
  }

  // ── One transaction: snapshot N+1 + raw record + re-materialized answers ─
  const { data, error } = await admin.rpc("partner_revise_assessment", {
    p_partner_id: identity.partnerId,
    p_partner_order_id: partnerOrderId,
    p_answers: answers,
    p_payload: body,
    p_payload_hash: requestHash,
    p_schema_version: schemaVersion,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
    p_request_id: requestId,
  });

  if (error) {
    const code = mapRpcError(error.message ?? "");
    // State refusals (locked) are deliberately NOT pinned into the idempotency
    // ledger: if an admin later un-assigns the order, the partner may retry
    // the same revision under the same key and have it re-evaluated.
    await audit({ ...auditBase, orderId: order.id, outcome: code });
    return partnerError(code, requestId);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.revision !== "number") return partnerError("internal_error", requestId);

  await audit({
    ...auditBase,
    orderId: order.id,
    outcome: row.replayed ? "revision_replayed" : "revision_accepted",
    metadata: { revision: row.revision, answer_count: Object.keys(answers).length },
  });

  return partnerJson({
    partner_order_id: partnerOrderId,
    pawtenant_reference: order.confirmation_id,
    revision: row.revision,
    accepted_at: row.accepted_at,
    idempotent_replay: Boolean(row.replayed),
    request_id: requestId,
  }, row.replayed ? 200 : 201, requestId);
}
