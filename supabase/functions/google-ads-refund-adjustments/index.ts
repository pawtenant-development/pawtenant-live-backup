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

// ── KILL SWITCH — fail closed. Anything other than the exact string "true"
//    (including unset) leaves adjustments DISABLED.
const MUTATIONS_ENABLED = Deno.env.get("GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED") === "true";

// Invariant asserted in every response: this build sends nothing.
const MUTATION_CALLS_SENT = 0;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
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
    mode?: "dry_run" | "reconcile" | "ingest" | "single" | "batch";
    limit?: number;
    includePayloads?: boolean;
  };

  // Dry-run is the DEFAULT for every invocation.
  const mode = body.mode ?? "dry_run";
  const limit = resolveBatchSize(body.limit);

  const safety = {
    authorized_as: actor,
    shadow_mode: true,
    mutations_enabled: MUTATIONS_ENABLED,
    kill_switch_env: "GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED",
    mutation_path_present_in_build: false,
    mutation_calls_sent: MUTATION_CALLS_SENT,
    google_ads_api_version: GOOGLE_ADS_API_VERSION,
    adjustment_window_days: ADJUSTMENT_WINDOW_DAYS,
    effective_window_days: EFFECTIVE_WINDOW_DAYS,
    min_conversion_age_hours: MIN_CONVERSION_AGE_HOURS,
  };

  // ── Mutation modes: fail closed, twice. ───────────────────────────────────
  if (mode === "single" || mode === "batch") {
    return json({
      ok: false,
      mode,
      error: "Conversion-adjustment uploads are not available in this build.",
      reason: MUTATIONS_ENABLED
        ? "kill switch is enabled, but this shadow build ships no upload path — enabling uploads requires a separate, owner-approved code change"
        : "kill switch GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED is not 'true'",
      safety,
    }, 501);
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
