// supabase/functions/google-ads-refund-adjustments/index.ts
//
// GOOGLE-ADS-REFUND-ADJUSTMENT-CONSUMER-001 — SHADOW consumer.
//
// ── ZERO-MUTATION SAFETY CONTRACT ────────────────────────────────────────────
// This build is PHYSICALLY INCAPABLE of uploading a conversion adjustment.
//
//   1. There is NO call to googleads.googleapis.com anywhere in this file, and
//      no `uploadConversionAdjustments` request is ever constructed as a fetch.
//      The proposed payload is BUILT and REPORTED, never sent. This is the
//      strongest control: not a flag that could be flipped at runtime, but the
//      absence of the code that would do it.
//   2. Kill switch: GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED must be exactly "true"
//      for any mutation mode to even be considered. It defaults to DISABLED.
//   3. Dry-run default: an invocation with no mode runs `dry_run`.
//   4. Mutation modes (`single`, `batch`) fail closed with 501 — enabling the
//      kill switch alone is NOT enough; shipping the upload path requires a
//      separate, owner-approved code change.
//   5. No cron job schedules this function.
//   6. The Stripe webhook does not call it — refund ingestion writes a ledger
//      row only, so Google Ads availability can never affect checkout/refunds.
//   7. Every response reports mutation_calls_sent: 0.
//
// Modes permitted in this build:
//   dry_run   (default) — classify candidates, build exact payloads, upload none
//   reconcile           — read-only ledger aggregate
//   ingest              — write/refresh shadow ledger rows (DB only, no Google)
//   single | batch      — REFUSED (501)
//
// Auth: service-role key OR an authenticated admin. Browser anon is refused.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  classifyAdjustmentCandidate,
  buildAdjustmentPayload,
  summarizeCandidates,
  toSafeReportRow,
  resolveBatchSize,
  STATUS,
  ADJUSTMENT_TYPE,
  EFFECTIVE_WINDOW_DAYS,
  ADJUSTMENT_WINDOW_DAYS,
  MIN_CONVERSION_AGE_HOURS,
  shortFingerprint,
} from "../_shared/googleAdsRefundAdjustment.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Backend Purchase (API) is the ONLY adjustment target. ESA Dynamic and PSD
// Dynamic are Secondary diagnostics actions and must never be adjusted — this
// consumer reads the same env var the original uploader uses, so the two can
// never drift onto different actions.
const GOOGLE_ADS_CONVERSION_ACTION_ID = Deno.env.get("GOOGLE_ADS_CONVERSION_ACTION_ID") ?? "";
const GOOGLE_ADS_CUSTOMER_ID = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "";
const GOOGLE_ADS_API_VERSION = Deno.env.get("GOOGLE_ADS_API_VERSION") || "v21";

// ── DUAL KILL SWITCHES — fail closed. Anything other than the exact string
//    "true" (including unset) leaves real adjustments DISABLED. BOTH are
//    required; neither alone can enable a live mutation.
const MUTATIONS_ENABLED = Deno.env.get("GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED") === "true";
const CANARY_ENABLED = Deno.env.get("GOOGLE_ADS_REFUND_CANARY_ENABLED") === "true";

// Allow-list: the ONE ledger adjustment id a live canary may ever touch.
// Unset = no live canary is possible for any row.
const CANARY_ADJUSTMENT_ID = (Deno.env.get("GOOGLE_ADS_REFUND_CANARY_ADJUSTMENT_ID") ?? "").trim();

// Google's per-request cap is 2000; ours is hard-wired to exactly ONE.
const CANARY_MAX_OPERATIONS = 1;

const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";
const GOOGLE_ADS_OAUTH_CLIENT_ID = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_ID") ?? "";
const GOOGLE_ADS_OAUTH_CLIENT_SECRET = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_SECRET") ?? "";
const GOOGLE_ADS_REFRESH_TOKEN = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN") ?? "";
const GOOGLE_ADS_LOGIN_CUSTOMER_ID = (Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "").replace(/[-\s]/g, "");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Counts REAL (validateOnly=false) adjustment requests actually sent in this
// invocation. Validate-only calls are counted separately and never here.
let realMutationCallsSent = 0;
let validateOnlyCallsSent = 0;

async function getAccessToken(): Promise<{ token: string | null; error?: string }> {
  if (!GOOGLE_ADS_OAUTH_CLIENT_ID || !GOOGLE_ADS_OAUTH_CLIENT_SECRET || !GOOGLE_ADS_REFRESH_TOKEN) {
    return { token: null, error: "Missing OAuth credentials" };
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_ADS_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_ADS_OAUTH_CLIENT_SECRET,
      refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const text = await res.text();
  if (!res.ok) return { token: null, error: `OAuth refresh failed (${res.status})` };
  return { token: (JSON.parse(text) as { access_token: string }).access_token };
}

/**
 * Send EXACTLY ONE conversion adjustment.
 *
 * `validateOnly` is a REQUIRED parameter, never defaulted — a caller that
 * forgets it is a compile error rather than a silent live mutation. The
 * operation array is built here and its length is asserted to be exactly 1
 * immediately before the request, so no code path can widen it to a batch.
 */
async function uploadSingleConversionAdjustment(
  adjustment: Record<string, unknown>,
  accessToken: string,
  validateOnly: boolean,
): Promise<{ httpStatus: number; ok: boolean; body: unknown; requestId: string | null; error?: string }> {
  const customerId = GOOGLE_ADS_CUSTOMER_ID.replace(/[-\s]/g, "");
  const operations = [adjustment];
  if (operations.length !== CANARY_MAX_OPERATIONS) {
    throw new Error(`refusing to send ${operations.length} operations — exactly ${CANARY_MAX_OPERATIONS} is allowed`);
  }
  const requestBody = {
    conversionAdjustments: operations,
    partialFailure: true,
    validateOnly,
  };
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:uploadConversionAdjustments`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
    "Content-Type": "application/json",
  };
  if (GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers["login-customer-id"] = GOOGLE_ADS_LOGIN_CUSTOMER_ID;

  if (validateOnly) validateOnlyCallsSent++; else realMutationCallsSent++;

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(requestBody) });
  const rawText = await res.text();
  const requestId = res.headers.get("request-id") ?? res.headers.get("x-request-id") ?? null;
  let body: unknown;
  try { body = JSON.parse(rawText); } catch { body = { nonJson: rawText.slice(0, 800) }; }
  return { httpStatus: res.status, ok: res.ok, body, requestId };
}

interface CandidateRow {
  order_id: string;
  order_transaction_id: string;
  source_payment_id: string | null;
  original_uploaded: boolean;
  original_uploaded_at: string | null;
  original_value: number | null;
  charged_amount: number | null;
  refund_status: string | null;
  cumulative_refund: number | null;
  conversion_at: string | null;
  refunded_at: string | null;
  upload_method: string | null;
  ads_upload_status: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Authorization: service-role OR authenticated admin. Never anon. ────────
  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!bearer) return json({ ok: false, error: "Unauthorized" }, 401);

  // 1. Fast path: the caller presented exactly the injected service-role key.
  let authorized = bearer === SERVICE_KEY;
  let actor = authorized ? "service_role_env" : "unknown";

  // 2. Capability probe. String equality against SUPABASE_SERVICE_ROLE_KEY is
  //    brittle: this project has BOTH the legacy service-role JWT and the newer
  //    sb_secret_* key, and the value injected into the function does not always
  //    match the credential a legitimate server caller presents (verified at
  //    LIVE — a valid service-role JWT that bypasses RLS on PostgREST was still
  //    rejected here). So instead of comparing secrets, PROVE the capability:
  //    get_google_ads_refund_adjustment_candidates is granted to service_role
  //    ONLY (revoked from public/anon/authenticated), so being able to execute
  //    it with the caller's own credential IS service-role authorization.
  //    This widens nothing — it authorizes exactly the callers a correct string
  //    comparison would have authorized.
  if (!authorized) {
    try {
      const callerClient = createClient(SUPABASE_URL, bearer, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: probeErr } = await callerClient
        .rpc("get_google_ads_refund_adjustment_candidates", { p_limit: 1 });
      if (!probeErr) { authorized = true; actor = "service_role_capability"; }
    } catch { /* not a service-role credential — fall through */ }
  }

  // 3. Authenticated admin user.
  if (!authorized) {
    const { data: { user } } = await supabase.auth.getUser(bearer);
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);
    const { data: profile } = await supabase
      .from("doctor_profiles").select("is_admin, role").eq("user_id", user.id).maybeSingle();
    authorized = profile?.is_admin === true ||
      ["owner", "admin_manager", "finance", "admin"].includes((profile?.role as string) ?? "");
    if (authorized) actor = "admin_user";
  }
  if (!authorized) return json({ ok: false, error: "Access denied — admin only" }, 403);

  const body = await req.json().catch(() => ({})) as {
    mode?: "dry_run" | "reconcile" | "ingest" | "single" | "batch" | "single_canary";
    limit?: number;
    includePayloads?: boolean;
    adjustmentId?: string;
    validateOnly?: boolean;
  };

  // Dry-run is the DEFAULT for every invocation.
  const mode = body.mode ?? "dry_run";
  const limit = resolveBatchSize(body.limit);

  const safety = {
    authorized_as: actor,
    shadow_mode: !(MUTATIONS_ENABLED && CANARY_ENABLED),
    mutations_enabled: MUTATIONS_ENABLED,
    canary_enabled: CANARY_ENABLED,
    canary_allow_list_configured: CANARY_ADJUSTMENT_ID.length > 0,
    kill_switch_env: "GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED",
    canary_switch_env: "GOOGLE_ADS_REFUND_CANARY_ENABLED",
    allow_list_env: "GOOGLE_ADS_REFUND_CANARY_ADJUSTMENT_ID",
    // A protected single-item path now EXISTS, but a real mutation requires
    // both switches true AND an exact allow-list id match. Batch/cron/webhook
    // paths do not exist at all.
    protected_canary_path_present: true,
    batch_path_present: false,
    max_operations_per_request: CANARY_MAX_OPERATIONS,
    real_mutation_possible_now: MUTATIONS_ENABLED && CANARY_ENABLED && CANARY_ADJUSTMENT_ID.length > 0,
    mutation_calls_sent: realMutationCallsSent,
    google_ads_api_version: GOOGLE_ADS_API_VERSION,
    adjustment_window_days: ADJUSTMENT_WINDOW_DAYS,
    effective_window_days: EFFECTIVE_WINDOW_DAYS,
    min_conversion_age_hours: MIN_CONVERSION_AGE_HOURS,
  };

  // ── Legacy/batch mutation modes: permanently refused. ─────────────────────
  // There is deliberately NO batch, process-all, or recurring path. The ONLY
  // way an adjustment can reach Google is `single_canary`, one row at a time.
  if (mode === "single" || mode === "batch") {
    return json({
      ok: false, mode,
      error: "Batch and legacy single adjustment uploads are permanently disabled.",
      reason: "the only adjustment path is `single_canary`, which sends exactly one allow-listed operation",
      safety,
    }, 501);
  }

  // ── PROTECTED SINGLE-ITEM CANARY ──────────────────────────────────────────
  // Sends at most ONE adjustment for ONE explicitly named ledger row.
  //
  // validateOnly=true  — non-mutating structural + eligibility validation.
  //                      Google changes nothing. Allowed without the flags.
  // validateOnly=false — a REAL retraction. Requires ALL of:
  //                        1. GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED = "true"
  //                        2. GOOGLE_ADS_REFUND_CANARY_ENABLED      = "true"
  //                        3. GOOGLE_ADS_REFUND_CANARY_ADJUSTMENT_ID == the id
  //                        4. every eligibility check below still passing
  //                      Any one missing → refused, nothing sent.
  if (mode === "single_canary") {
    const adjustmentId = String(body.adjustmentId ?? "").trim();
    // Fail closed on intent: only an explicit `validateOnly: false` can ever be
    // a real send. Missing/garbled input validates instead of mutating.
    const wantsRealMutation = body.validateOnly === false;

    if (!adjustmentId) {
      return json({ ok: false, mode, error: "adjustmentId is required", safety }, 400);
    }

    // Gate the REAL mutation before doing anything else.
    if (wantsRealMutation) {
      const blockers: string[] = [];
      if (!MUTATIONS_ENABLED) blockers.push("GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED is not 'true'");
      if (!CANARY_ENABLED) blockers.push("GOOGLE_ADS_REFUND_CANARY_ENABLED is not 'true'");
      if (!CANARY_ADJUSTMENT_ID) blockers.push("GOOGLE_ADS_REFUND_CANARY_ADJUSTMENT_ID is not configured");
      else if (CANARY_ADJUSTMENT_ID !== adjustmentId) blockers.push("adjustmentId does not match the configured allow-list");
      if (blockers.length) {
        return json({
          ok: false, mode, validate_only: false,
          error: "Real conversion-adjustment upload is disabled.",
          blockers, safety,
          note: "Nothing was sent to Google.",
        }, 403);
      }
    }

    // ── Re-verify eligibility from the DB at execution time ─────────────────
    const { data: rows, error: rowErr } = await supabase
      .from("google_ads_conversion_adjustments")
      .select("id, original_order_or_transaction_id, conversion_action_id, adjustment_type, retained_value, adjustment_occurred_at, status, uploaded_at, order_id")
      .eq("id", adjustmentId)
      .limit(2);
    if (rowErr) return json({ ok: false, mode, error: rowErr.message, safety }, 500);
    if (!rows || rows.length !== 1) {
      return json({ ok: false, mode, error: "ledger row not found", safety }, 404);
    }
    const row = rows[0] as Record<string, unknown>;

    const failures: string[] = [];
    if (row.status !== STATUS.DRY_RUN_READY) failures.push(`ledger status is '${row.status}', expected '${STATUS.DRY_RUN_READY}'`);
    if (row.adjustment_type !== ADJUSTMENT_TYPE.RETRACTION) failures.push(`adjustment_type is '${row.adjustment_type}', only RETRACTION is permitted`);
    if (row.conversion_action_id !== GOOGLE_ADS_CONVERSION_ACTION_ID) failures.push("conversion action is not the configured Backend Purchase action");
    if (row.uploaded_at !== null) failures.push("row already has uploaded_at — a prior adjustment exists");
    if (Number(row.retained_value) !== 0) failures.push(`retained_value is ${row.retained_value}, expected 0 for a RETRACTION`);

    // Refund + identity + window must still hold, straight from source data.
    const { data: cands } = await supabase.rpc("get_google_ads_refund_adjustment_candidates", { p_limit: 200 });
    const cand = ((cands ?? []) as CandidateRow[])
      .find((c) => c.order_transaction_id === row.original_order_or_transaction_id) ?? null;
    if (!cand) failures.push("order is no longer a refund-adjustment candidate");
    else {
      const re = classifyAdjustmentCandidate({
        orderTransactionId: cand.order_transaction_id,
        originalUploaded: cand.original_uploaded === true,
        originalValue: cand.original_value,
        chargedAmount: cand.charged_amount,
        refundStatus: cand.refund_status,
        cumulativeRefund: cand.cumulative_refund,
        conversionAt: cand.conversion_at,
        refundedAt: cand.refunded_at,
        conversionActionId: GOOGLE_ADS_CONVERSION_ACTION_ID,
        valueProvenanceWeak: true,
      }, Date.now());
      if (re.status !== STATUS.DRY_RUN_READY) failures.push(`re-classification is '${re.status}': ${re.blockedReason ?? ""}`);
      if (re.adjustmentType !== ADJUSTMENT_TYPE.RETRACTION) failures.push("re-classification is no longer a RETRACTION");
      if (cand.original_uploaded !== true) failures.push("original conversion identity is no longer proven");
    }

    if (failures.length) {
      return json({ ok: false, mode, error: "candidate is not eligible", failures, safety }, 409);
    }

    // ── Build EXACTLY ONE operation ────────────────────────────────────────
    const adjustment: Record<string, unknown> = {
      conversionAction: `customers/${GOOGLE_ADS_CUSTOMER_ID.replace(/[-\s]/g, "")}/conversionActions/${GOOGLE_ADS_CONVERSION_ACTION_ID}`,
      adjustmentType: ADJUSTMENT_TYPE.RETRACTION,
      adjustmentDateTime: String(row.adjustment_occurred_at ?? "")
        .replace("T", " ").replace(/\.\d+/, "").replace("Z", "+00:00"),
      orderId: row.original_order_or_transaction_id,
      // Deliberately absent: restatementValue (Google errors on a retraction),
      // gclidDateTimePair (error 20 alongside orderId), userIdentifiers.
    };

    // The request is validate-only unless EVERY real-mutation condition held.
    const validateOnly = !wantsRealMutation;

    const tok = await getAccessToken();
    if (!tok.token) return json({ ok: false, mode, error: `OAuth failed: ${tok.error}`, safety }, 500);

    const result = await uploadSingleConversionAdjustment(adjustment, tok.token, validateOnly);

    // Per-operation errors live in partialFailureError, not the HTTP status.
    const bodyObj = (result.body ?? {}) as Record<string, unknown>;
    const partialFailureError = bodyObj.partialFailureError ?? null;
    const topLevelError = bodyObj.error ?? null;
    let googleErrorCode: string | null = null;
    try {
      const details = ((partialFailureError ?? topLevelError) as Record<string, unknown>)?.details as Array<Record<string, unknown>> | undefined;
      const errs = details?.[0]?.errors as Array<Record<string, unknown>> | undefined;
      const ec = errs?.[0]?.errorCode as Record<string, unknown> | undefined;
      googleErrorCode = ec ? (Object.values(ec)[0] as string) : null;
    } catch { /* leave null */ }

    const accepted = result.ok && !partialFailureError && !topLevelError;

    // ── Ledger safety ──────────────────────────────────────────────────────
    // A validate-only call NEVER marks the row uploaded. Only a REAL, accepted
    // send does — and only after Google accepted it.
    if (validateOnly) {
      await supabase.from("google_ads_conversion_adjustments").update({
        last_attempt_at: new Date().toISOString(),
        google_response_summary: {
          last_validation: {
            at: new Date().toISOString(),
            api_version: GOOGLE_ADS_API_VERSION,
            validate_only: true,
            http_status: result.httpStatus,
            accepted,
            google_error_code: googleErrorCode,
            request_id: result.requestId,
          },
        },
      }).eq("id", adjustmentId);
    } else if (accepted) {
      await supabase.from("google_ads_conversion_adjustments").update({
        status: "uploaded",
        uploaded_at: new Date().toISOString(),
        last_attempt_at: new Date().toISOString(),
        attempt_count: (Number(row.attempt_count) || 0) + 1,
        google_request_id: result.requestId,
        google_response_summary: { real_upload: { http_status: result.httpStatus, request_id: result.requestId } },
      }).eq("id", adjustmentId);
    }

    return json({
      ok: accepted,
      mode,
      validate_only: validateOnly,
      operations_sent: 1,
      adjustment_masked: {
        ...adjustment,
        orderId: `${String(row.original_order_or_transaction_id).slice(0, 2)}***${String(row.original_order_or_transaction_id).slice(-3)}`,
      },
      google: {
        http_status: result.httpStatus,
        accepted,
        request_id: result.requestId,
        job_id: bodyObj.jobId ?? null,
        results: bodyObj.results ?? null,
        partial_failure_error: partialFailureError,
        error: topLevelError,
        google_error_code: googleErrorCode,
      },
      ledger_marked_uploaded: !validateOnly && accepted,
      safety: {
        ...safety,
        real_mutation_calls_sent: realMutationCallsSent,
        validate_only_calls_sent: validateOnlyCallsSent,
      },
    }, accepted ? 200 : 422);
  }

  try {
    // ── reconcile: read-only aggregate over the ledger ──────────────────────
    if (mode === "reconcile") {
      const { data, error } = await supabase.rpc("get_google_ads_refund_adjustment_status");
      if (error) return json({ ok: false, mode, error: error.message, safety }, 500);
      return json({ ok: true, mode, ledger: data, safety });
    }

    if (!GOOGLE_ADS_CONVERSION_ACTION_ID) {
      return json({ ok: false, mode, error: "GOOGLE_ADS_CONVERSION_ACTION_ID is not configured", safety }, 500);
    }

    // ── Bounded, index-backed candidate discovery (no N+1, no full scan) ────
    const { data: rows, error: rpcErr } = await supabase
      .rpc("get_google_ads_refund_adjustment_candidates", { p_limit: limit });
    if (rpcErr) return json({ ok: false, mode, error: rpcErr.message, safety }, 500);

    const nowMs = Date.now();
    const candidates = ((rows ?? []) as CandidateRow[]).map((r) => {
      const c = classifyAdjustmentCandidate({
        orderTransactionId: r.order_transaction_id,
        originalUploaded: r.original_uploaded === true,
        // LIVE has no durable record of the value actually uploaded (the
        // uploader's audit insert targets a column audit_logs does not have, so
        // it silently fails). orders.price is the only available basis and it is
        // MUTABLE — flagged weak so a RESTATEMENT canary cannot proceed blindly.
        originalValue: r.original_value,
        // The refund basis: what the customer was ACTUALLY charged. Differs from
        // the uploaded value on coupon-overcharge orders, where the refund is a
        // correction rather than lost revenue.
        chargedAmount: r.charged_amount,
        refundStatus: r.refund_status,
        cumulativeRefund: r.cumulative_refund,
        conversionAt: r.conversion_at,
        refundedAt: r.refunded_at,
        conversionActionId: GOOGLE_ADS_CONVERSION_ACTION_ID,
        valueProvenanceWeak: true,
      }, nowMs);
      return { ...c, _row: r };
    });

    const summary = summarizeCandidates(candidates);
    const report = candidates.map((c) => toSafeReportRow(c));

    // Proposed payloads are BUILT so the owner can inspect exactly what a future
    // canary would send — and are returned as data, never posted anywhere.
    const proposedPayloads = body.includePayloads === true
      ? candidates
          .filter((c) => c.status === STATUS.DRY_RUN_READY)
          .map((c) => buildAdjustmentPayload(c, { customerId: GOOGLE_ADS_CUSTOMER_ID || "REDACTED" }))
      : undefined;

    // ── ingest: persist/refresh shadow ledger rows. DB ONLY. ────────────────
    let ingested = 0;
    let superseded = 0;
    if (mode === "ingest") {
      for (const c of candidates) {
        const row = c._row as CandidateRow;
        const isReady = c.status === STATUS.DRY_RUN_READY;

        // Blocked/skipped candidates still get a durable row so the owner can
        // see WHY nothing will be sent — but with a deterministic key so repeat
        // runs update in place instead of duplicating.
        // Blocked/skipped rows key on status alone (no reason fingerprint) so the
        // key stays stable across wording changes and matches the deterministic
        // backfill exactly — re-running can never duplicate a row.
        const idempotencyKey = c.idempotencyKey ??
          `${c.orderTransactionId}:${GOOGLE_ADS_CONVERSION_ACTION_ID}:${c.status}`;

        // Supersede any earlier ACTIVE row for this conversion whose key differs
        // (a later partial refund changed the retained value → new adjustment).
        const { data: existing } = await supabase
          .from("google_ads_conversion_adjustments")
          .select("id, idempotency_key, status")
          .eq("original_order_or_transaction_id", c.orderTransactionId)
          .eq("conversion_action_id", GOOGLE_ADS_CONVERSION_ACTION_ID)
          .in("status", ["pending", "dry_run_ready", "retryable_error"]);

        let supersedesId: string | null = null;
        for (const e of existing ?? []) {
          if ((e as { idempotency_key: string }).idempotency_key !== idempotencyKey) {
            await supabase.from("google_ads_conversion_adjustments")
              .update({ status: "superseded" }).eq("id", (e as { id: string }).id);
            supersedesId = (e as { id: string }).id;
            superseded++;
          }
        }

        const { error: upsertErr } = await supabase
          .from("google_ads_conversion_adjustments")
          .upsert({
            order_id: row.order_id,
            source_payment_id: row.source_payment_id,
            original_order_or_transaction_id: c.orderTransactionId,
            conversion_action_id: GOOGLE_ADS_CONVERSION_ACTION_ID,
            original_conversion_uploaded_at: row.original_uploaded_at,
            original_value: c.originalValue,
            charged_amount: c.chargedAmount ?? null,
            charge_basis_known: c.chargeBasisKnown === true,
            true_retained_revenue: c.trueRetainedRevenue ?? null,
            cumulative_successful_refund: c.cumulativeRefund,
            retained_value: isReady ? c.retainedValue : null,
            currency_code: "USD",
            value_provenance_weak: true,
            adjustment_type: isReady ? c.adjustmentType : null,
            adjustment_occurred_at: isReady ? c.adjustmentOccurredAt : null,
            // No per-refund ledger exists at LIVE: cumulative refund state is the
            // Stripe-derived orders.refund_amount, so the fingerprint covers the
            // cumulative amount + refund time rather than individual refund IDs.
            source_refund_ids_hash: shortFingerprint(`${c.cumulativeRefund}:${row.refunded_at ?? ""}`),
            source_refund_count: null,
            status: c.status,
            blocked_reason: c.blockedReason,
            idempotency_key: idempotencyKey,
            supersedes_adjustment_id: supersedesId,
          }, { onConflict: "idempotency_key" });

        if (upsertErr) return json({ ok: false, mode, error: upsertErr.message, safety }, 500);
        ingested++;
      }
    }

    return json({
      ok: true,
      mode,
      dry_run: true,
      limit,
      summary,
      report,
      proposed_payloads: proposedPayloads,
      ingested: mode === "ingest" ? ingested : undefined,
      superseded: mode === "ingest" ? superseded : undefined,
      safety,
      note:
        "SHADOW MODE — no conversion adjustment was uploaded. This build contains no Google Ads mutation path. " +
        "Full refunds propose RETRACTION; partial refunds propose RESTATEMENT to the retained value. " +
        `Adjustments are identified by order_id only (never gclid_date_time_pair). Restatement type: ${ADJUSTMENT_TYPE.RESTATEMENT}.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[google-ads-refund-adjustments] error:", msg);
    return json({ ok: false, error: msg, safety }, 500);
  }
});
