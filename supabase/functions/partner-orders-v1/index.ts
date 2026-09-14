/**
 * partner-orders-v1
 *
 * PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 -- the versioned B2B clinical
 * intake API that Zeek/PawTenant SUPPLIES to fulfillment partners.
 *
 * ROUTES
 *   POST /partner-orders-v1/orders            create a paid partner order
 *   GET  /partner-orders-v1/orders/{id}       retrieve status by partner_order_id
 *
 * WHY verify_jwt=false
 *   The partner presents an API key, not a Supabase JWT -- the same situation as
 *   stripe-webhook and the ghl-* functions. That makes the credential check in
 *   this file the ONLY thing in front of clinical data, so it runs before any
 *   order, assessment or customer row is read or written, and every failure
 *   path refuses rather than continues.
 *
 * WHAT THIS ENDPOINT WILL NOT DO
 *   * It never accepts card numbers or payment credentials. A payload carrying
 *     anything that looks like one is rejected outright.
 *   * It never trusts a partner-supplied PDF as clinical truth. The structured
 *     assessment is authoritative and is stored in public.assessment_answers.
 *   * It never returns PHI, SQL text or internal identifiers in an error.
 *   * It never records the partner's RETAIL price. That is not our revenue.
 */

import {
  ABSOLUTE_MAX_PAYLOAD_BYTES,
  authenticatePartner,
  canonicalPayloadHash,
  clientIdentity,
  CORS_HEADERS,
  enforceRateLimit,
  hasScope,
  isSecureRequest,
  newRequestId,
  PARTNER_ASSESSMENT_SCHEMA_VERSION,
  PARTNER_PSD_SCHEMA_VERSION,
  partnerError,
  partnerJson,
  PSD_TARGET_ASSESSMENT_VERSION,
  type PartnerErrorCode,
  type PartnerIdentity,
  serviceClient,
  trustedClientIp,
} from "../_shared/partnerApi.ts";
import { hasDuplicateJsonKeys, validateOrderRequest, type ValidatedOrder } from "./validate.ts";
import { acceptPartnerOrder } from "./accept.ts";
import { handleDocumentRetrieval } from "./document.ts";
import { handleRevision } from "./revise.ts";

const FUNCTION_PREFIX = "partner-orders-v1";

/** Route the path suffix after the function name. */
function routeOf(url: URL): { kind: "create" | "status" | "document" | "revise" | "unknown"; ref?: string } {
  const parts = url.pathname.split("/").filter(Boolean);
  const i = parts.indexOf(FUNCTION_PREFIX);
  const tail = i >= 0 ? parts.slice(i + 1) : parts;
  if (tail.length === 1 && tail[0] === "orders") return { kind: "create" };
  if (tail.length === 2 && tail[0] === "orders") return { kind: "status", ref: decodeURIComponent(tail[1]) };
  if (tail.length === 3 && tail[0] === "orders" && tail[2] === "document") {
    return { kind: "document", ref: decodeURIComponent(tail[1]) };
  }
  if (tail.length === 3 && tail[0] === "orders" && tail[2] === "revisions") {
    return { kind: "revise", ref: decodeURIComponent(tail[1]) };
  }
  return { kind: "unknown" };
}

/**
 * Audit every API decision. Uses the canonical audit_logs table.
 *
 * NO PHI: only the partner, the partner's own order reference, the outcome code
 * and non-identifying counts. Never the customer, never the assessment, never
 * the credential.
 */
async function audit(
  admin: ReturnType<typeof serviceClient>,
  opts: {
    partnerId?: string | null;
    partnerSlug?: string | null;
    partnerOrderId?: string | null;
    orderId?: string | null;
    action: string;
    outcome: string;
    requestId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from("audit_logs").insert({
      actor_type: "system",
      actor_name: opts.partnerSlug ? `partner:${opts.partnerSlug}` : "partner-api",
      actor_role: "partner_api",
      object_type: "partner_order",
      object_id: opts.partnerOrderId ?? opts.orderId ?? null,
      order_id: opts.orderId ?? null,
      action: opts.action,
      category: "partner_api",
      source: FUNCTION_PREFIX,
      description: `partner API ${opts.action}: ${opts.outcome}`,
      metadata: {
        outcome: opts.outcome,
        request_id: opts.requestId,
        partner_id: opts.partnerId ?? null,
        ...(opts.metadata ?? {}),
      },
    });
  } catch {
    // Auditing must never take the endpoint down. The request outcome is
    // returned regardless; a lost audit row is preferable to a 500 on a
    // clinical intake.
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = newRequestId();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  // ── 1. TLS ONLY ───────────────────────────────────────────────────────────
  if (!isSecureRequest(req)) {
    return partnerError("tls_required", requestId);
  }

  const url = new URL(req.url);

  // A credential in a query string would land in access logs, proxy logs and
  // browser history. We do not merely ignore them -- we refuse, so a partner
  // who misreads the docs finds out immediately instead of leaking a secret
  // for months.
  for (const forbidden of ["key", "key_id", "secret", "api_key", "apikey", "token"]) {
    if (url.searchParams.has(forbidden)) {
      return partnerError("unauthenticated", requestId);
    }
  }

  const admin = serviceClient();
  const route = routeOf(url);
  const routeAction =
    route.kind === "status" ? "order_status"
    : route.kind === "document" ? "document_retrieval"
    : route.kind === "revise" ? "assessment_revision"
    : "order_create";

  // ── 2. AUTHENTICATE BEFORE ANY CLINICAL READ OR WRITE ─────────────────────
  const auth = await authenticatePartner(req, admin);
  if (!auth.ok) {
    await audit(admin, {
      action: routeAction,
      outcome: auth.code,
      requestId,
      metadata: { authenticated: false },
    });
    return partnerError(auth.code, requestId);
  }
  const identity: PartnerIdentity = auth.identity;

  // ── 3. RATE LIMIT (per credential) ────────────────────────────────────────
  const allowed = await enforceRateLimit(
    admin,
    `${identity.credentialId}:${clientIdentity(req)}`,
    // Document retrieval gets its own bucket so a polling integration cannot
    // starve order intake; everything else keeps its Slice 2 scopes.
    `partner_api_${route.kind}`,
    identity.rateLimitPerMinute,
  );
  if (!allowed) {
    await audit(admin, {
      partnerId: identity.partnerId,
      partnerSlug: identity.partnerSlug,
      action: "rate_limit",
      outcome: "rate_limited",
      requestId,
    });
    return partnerError("rate_limited", requestId);
  }

  // Telemetry only after a SUCCESSFUL auth, so a failed guess cannot be used to
  // probe whether a key id exists by watching last_used_at.
  await admin.rpc("partner_touch_api_credential", {
    p_credential_id: identity.credentialId,
    p_client_ip: trustedClientIp(req),
  }).then(() => {}, () => {});

  try {
    // ── STATUS ──────────────────────────────────────────────────────────────
    if (route.kind === "status") {
      if (req.method !== "GET") return partnerError("method_not_allowed", requestId);
      if (!hasScope(identity, "orders:read")) return partnerError("forbidden_scope", requestId);
      return await handleStatus(admin, identity, route.ref!, requestId);
    }

    // ── CREATE ──────────────────────────────────────────────────────────────
    if (route.kind === "create") {
      if (req.method !== "POST") return partnerError("method_not_allowed", requestId);
      if (!hasScope(identity, "orders:create")) return partnerError("forbidden_scope", requestId);
      return await handleCreate(admin, identity, req, requestId);
    }

    // ── DOCUMENT (Slice 8 · Part A) ─────────────────────────────────────────
    if (route.kind === "document") {
      if (req.method !== "GET") return partnerError("method_not_allowed", requestId);
      if (!hasScope(identity, "documents:read")) return partnerError("forbidden_scope", requestId);
      return await handleDocumentRetrieval(
        admin, identity, route.ref!, requestId, (opts) => audit(admin, opts),
      );
    }

    // ── REVISIONS (Slice 8 · Part C) ────────────────────────────────────────
    if (route.kind === "revise") {
      if (req.method !== "POST") return partnerError("method_not_allowed", requestId);
      if (!hasScope(identity, "orders:create")) return partnerError("forbidden_scope", requestId);
      return await handleRevision(
        admin, identity, req, route.ref!, requestId, (opts) => audit(admin, opts),
      );
    }

    return partnerError("not_found", requestId);
  } catch (_e) {
    // Deliberately opaque. An internal failure must never surface SQL text, a
    // stack trace or a column name to an external partner.
    await audit(admin, {
      partnerId: identity.partnerId,
      partnerSlug: identity.partnerSlug,
      action: routeAction,
      outcome: "internal_error",
      requestId,
    });
    return partnerError("internal_error", requestId);
  }
});

// ── Status ──────────────────────────────────────────────────────────────────

async function handleStatus(
  admin: ReturnType<typeof serviceClient>,
  identity: PartnerIdentity,
  partnerOrderId: string,
  requestId: string,
): Promise<Response> {
  // TENANT ISOLATION: partner_id is part of the predicate, not a post-filter.
  // A partner asking for another partner's reference gets not_found, which is
  // also the answer for a reference that does not exist -- so the endpoint
  // cannot be used to probe whether another partner has a given order.
  const { data, error } = await admin
    .from("orders")
    .select(
      "id, confirmation_id, partner_order_id, letter_type, status, doctor_status, " +
      "order_origin, partner_id, partner_communication_policy, partner_document_policy, " +
      "partner_accepted_at, partner_clinical_completed_at, doctor_user_id, doctor_email, " +
      "additional_documentation_required, additional_documentation_status, " +
      "official_letter_reopened_at, official_letter_final_completed_at, payment_intent_id, paid_at",
    )
    .eq("partner_id", identity.partnerId)
    .eq("partner_order_id", partnerOrderId)
    .maybeSingle();

  if (error) return partnerError("internal_error", requestId);
  if (!data) return partnerError("not_found", requestId);

  const { data: stateRow } = await admin
    .rpc("partner_clinical_state_for_order", { p_order_id: data.id });

  return partnerJson({
    partner_order_id: data.partner_order_id,
    // The partner's CRM stores this as our reference.
    pawtenant_reference: data.confirmation_id,
    service: data.letter_type,
    clinical_status: stateRow ?? "received",
    provider_assigned: Boolean(data.doctor_user_id || data.doctor_email),
    accepted_at: data.partner_accepted_at,
    clinical_completed_at: data.partner_clinical_completed_at,
    request_id: requestId,
  }, 200, requestId);
}

// ── Create ──────────────────────────────────────────────────────────────────

async function handleCreate(
  admin: ReturnType<typeof serviceClient>,
  identity: PartnerIdentity,
  req: Request,
  requestId: string,
): Promise<Response> {
  const fail = async (code: PartnerErrorCode, details?: Record<string, string[]>, partnerOrderId?: string) => {
    await audit(admin, {
      partnerId: identity.partnerId,
      partnerSlug: identity.partnerSlug,
      partnerOrderId: partnerOrderId ?? null,
      action: "order_create",
      outcome: code,
      requestId,
      metadata: details ? { invalid_fields: Object.keys(details) } : undefined,
    });
    return partnerError(code, requestId, details);
  };

  // ── Idempotency key is mandatory, and checked before we read the body ─────
  const idempotencyKey = req.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return await fail("idempotency_key_required");
  if (idempotencyKey.length > 255) return await fail("schema_violation", { "Idempotency-Key": ["too long"] });

  // ── Size ceiling BEFORE parsing ───────────────────────────────────────────
  const declared = Number(req.headers.get("content-length") ?? "0");
  const ceiling = Math.min(identity.maxPayloadBytes, ABSOLUTE_MAX_PAYLOAD_BYTES);
  if (Number.isFinite(declared) && declared > ceiling) return await fail("payload_too_large");

  const raw = await req.text();
  // Content-Length can lie or be absent (chunked), so the real length is
  // re-checked against the same ceiling after reading.
  if (new TextEncoder().encode(raw).length > ceiling) return await fail("payload_too_large");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return await fail("malformed_json");
  }

  // Slice 7: duplicate JSON keys vanish in JSON.parse (last one wins), which
  // is how a clinical answer could be silently replaced within one payload.
  // Refused outright, before hashing or validation.
  if (hasDuplicateJsonKeys(raw)) {
    return await fail("schema_violation", { body: ["duplicate JSON keys are not permitted"] });
  }

  // ── Idempotency: same key + same payload replays; different payload is a
  //    conflict. The hash is computed on the CANONICALISED body, so a partner
  //    re-serialising the same order with different key order is a retry.
  const requestHash = await canonicalPayloadHash(body);

  // The ledger lives in the private schema, which is deliberately NOT exposed
  // to the Data API -- so it is read through a SECURITY DEFINER RPC rather than
  // PostgREST. Reaching for `.from()` here silently returns nothing and lets a
  // retry fall through to a fresh create.
  const { data: priorRows } = await admin.rpc("partner_lookup_idempotency", {
    p_partner_id: identity.partnerId,
    p_idempotency_key: idempotencyKey,
  });
  const prior = Array.isArray(priorRows) ? priorRows[0] : priorRows;

  if (prior) {
    if (prior.request_hash !== requestHash) {
      await audit(admin, {
        partnerId: identity.partnerId,
        partnerSlug: identity.partnerSlug,
        partnerOrderId: prior.partner_order_id,
        action: "order_create",
        outcome: "idempotency_conflict",
        requestId,
      });
      return partnerError("idempotency_conflict", requestId);
    }
    // Same key + same payload -> return the EXISTING accepted order. No second
    // order, no second earning, no second partner charge.
    if (prior.outcome === "accepted" && prior.order_id) {
      const { data: existing } = await admin
        .from("orders")
        .select("id, confirmation_id, partner_order_id, letter_type, partner_accepted_at")
        .eq("id", prior.order_id)
        .maybeSingle();
      if (existing) {
        return partnerJson({
          partner_order_id: existing.partner_order_id,
          pawtenant_reference: existing.confirmation_id,
          service: existing.letter_type,
          clinical_status: "received",
          accepted_at: existing.partner_accepted_at,
          idempotent_replay: true,
          request_id: requestId,
        }, 200, requestId);
      }
    }
    // A prior REJECTION with the same payload is replayed as the same rejection
    // rather than re-running validation.
    if (prior.outcome === "rejected" && prior.response_code) {
      return partnerError(prior.response_code as PartnerErrorCode, requestId);
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────
  const validation = await validateOrderRequest(body, identity, admin);
  if (!validation.ok) {
    await admin.rpc("partner_record_api_rejection", {
      p_partner_id: identity.partnerId,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
      p_partner_order_id: validation.partnerOrderId ?? null,
      p_response_code: validation.code,
      p_http_status: 422,
    }).then(() => {}, () => {});
    return await fail(validation.code, validation.details, validation.partnerOrderId);
  }

  const order: ValidatedOrder = validation.order;

  // ── Accept ────────────────────────────────────────────────────────────────
  // PSD orders arrive under the canonical contract (validated above) and are
  // normalized onto the retail psd_v1 catalog — an identity mapping on the
  // question ids, with provenance recorded per order. ESA keeps the generic
  // contract and no normalization, exactly as before.
  const accepted = await acceptPartnerOrder(admin, identity, order, {
    idempotencyKey,
    requestHash,
    requestId,
    assessmentSchemaVersion:
      order.service === "psd" ? PARTNER_PSD_SCHEMA_VERSION : PARTNER_ASSESSMENT_SCHEMA_VERSION,
    targetAssessmentVersion:
      order.service === "psd" ? PSD_TARGET_ASSESSMENT_VERSION : null,
  });

  if (!accepted.ok) {
    await audit(admin, {
      partnerId: identity.partnerId,
      partnerSlug: identity.partnerSlug,
      partnerOrderId: order.partnerOrderId,
      action: "order_create",
      outcome: accepted.code,
      requestId,
    });
    return partnerError(accepted.code, requestId);
  }

  await audit(admin, {
    partnerId: identity.partnerId,
    partnerSlug: identity.partnerSlug,
    partnerOrderId: order.partnerOrderId,
    orderId: accepted.orderId,
    action: "order_create",
    outcome: "accepted",
    requestId,
    metadata: {
      service: order.service,
      state: order.currentPhysicalState,
      assessment_answer_count: Object.keys(order.assessmentAnswers).length,
      communication_policy: accepted.communicationPolicy,
      document_policy: accepted.documentPolicy,
    },
  });

  // A retry that reached acceptance (rather than being short-circuited by the
  // ledger above) is still a REPLAY -- the database matched it on
  // (partner_id, partner_order_id) and handed back the existing order. Saying
  // 201/created there would tell the partner a second order exists when it does
  // not, which is exactly the reconciliation bug this contract has to avoid.
  return partnerJson({
    partner_order_id: order.partnerOrderId,
    pawtenant_reference: accepted.confirmationId,
    service: order.service,
    clinical_status: "received",
    accepted_at: accepted.acceptedAt,
    idempotent_replay: accepted.replayed,
    request_id: requestId,
  }, accepted.replayed ? 200 : 201, requestId);
}
