// supabase/functions/_shared/googleAdsRefundAdjustment.mjs
//
// GOOGLE-ADS-REFUND-ADJUSTMENT-CONSUMER-001 — pure refund-adjustment core.
//
// WHY .mjs AND NOT .ts:
//   This module is imported by BOTH the Deno edge function
//   (supabase/functions/google-ads-refund-adjustments) AND the Node guard
//   (scripts/check-google-ads-refund-adjustment.mjs --self-test). Plain ESM is
//   the only format both runtimes execute directly, so the guard's numeric test
//   matrix runs against the REAL shipped code instead of a hand-kept copy.
//
// This module is PURE: no network, no Supabase client, no Stripe, no Google Ads
// client, no clock of its own (callers pass `nowMs`). It cannot upload anything.
//
// ── VERIFIED GOOGLE ADS API CONTRACT (primary source, v21 protos) ────────────
// google/ads/googleads/v21/services/conversion_adjustment_upload_service.proto
// google/ads/googleads/v21/errors/conversion_adjustment_upload_error.proto
//
//   • Service/method: ConversionAdjustmentUploadService.UploadConversionAdjustments
//     REST: POST customers/{customerId}:uploadConversionAdjustments
//   • adjustment_type: RETRACTION | RESTATEMENT | ENHANCEMENT
//   • RESTATEMENT  → requires `restatement_value.adjusted_value` = the value the
//     conversion should now have ("to change 100 to 70, report 70").
//   • RETRACTION   → `restatement_value` MUST NOT be supplied ("An error will be
//     returned if provided for a retraction").
//   • Identification: `order_id` when the original conversion was uploaded with
//     one. Error 24 MISSING_ORDER_ID_FOR_WEBPAGE: "Adjustment for website
//     conversion requires Order ID". Error 20 GCLID_DATE_TIME_PAIR_AND_ORDER_ID_
//     BOTH_SET: "Cannot set both gclid_date_time_pair and order_id."
//     → PawTenant ALWAYS uploads orderId = confirmation_id, therefore adjustments
//       MUST use order_id ONLY and MUST NEVER set gclid_date_time_pair.
//       gclid / gbraid / wbraid are irrelevant to the adjustment path.
//   • user_identifiers are accepted ONLY in ENHANCEMENT adjustments → never sent
//     here (we emit no ENHANCEMENT), so no hashed email leaves this module.
//   • Window: error 6 CONVERSION_EXPIRED — "Adjustment can't be made to a
//     conversion that occurred more than 54 days ago."
//     Error 9 TOO_RECENT_CONVERSION — "Try adjusting a conversion that occurred
//     at least 24 hours ago."
//   • adjustment_date_time "Must be after the conversion_date_time. The timezone
//     must be specified. Format yyyy-mm-dd hh:mm:ss+|-hh:mm".
//     Error 7 ADJUSTMENT_PRECEDES_CONVERSION guards the same rule.
//   • Dedup is keyed on adjustment_date_time: errors 13 RESTATEMENT_ALREADY_EXISTS,
//     8 MORE_RECENT_RESTATEMENT_FOUND, 14 DUPLICATE_ADJUSTMENT_IN_REQUEST.
//     "If you want to upload a second restatement with a different adjusted
//     value, it must have a new, more recent, adjustment occurrence time."
//   • Error 4 CONVERSION_ALREADY_RETRACTED — "The conversion was already
//     retracted. This adjustment was not processed."
//     → RETRACTION IS TERMINAL. A retracted conversion can never be restated.
//       Consequence: partial-then-full must retract LAST and never restate after.
//   • currency_code: "If not provided, then the default currency from the
//     conversion action is used, and if that is not set then the account currency
//     is used." → we always set it explicitly.
//   • partial_failure "should always be set to true"; per-operation errors come
//     back in partialFailureError.details[].errors[].
//   • Error 11 TOO_MANY_ADJUSTMENTS_IN_REQUEST — "fewer than 2001 adjustments in
//     a single API request."
//
// ── CANONICAL FINANCIAL RULE ─────────────────────────────────────────────────
//   true_retained_revenue = amount_charged − cumulative_successful_refunds
//   google_target_value   = clamp(true_retained_revenue, 0, original_uploaded_value)
//
//   WHY THE CHARGE — NOT THE UPLOADED VALUE — IS THE REFUND BASIS:
//   The naive rule (uploaded_value − refund) is WRONG whenever the amount charged
//   differs from the value uploaded, and at LIVE it demonstrably does. Both real
//   partial refunds are coupon OVERCHARGE CORRECTIONS:
//
//     PT-MRJKQA4X  uploaded 89, charged 109, refunded 20 → customer kept 89
//     PT-MR1HX27H  uploaded 59, charged  99, refunded 40 → customer kept 59
//
//   In both, retained revenue already EQUALS what Google was told, so the correct
//   action is NO ADJUSTMENT. The naive rule would have restated them to 69 and 19
//   — understating retained revenue by $60 and mis-training bidding.
//
//   google_target_value is capped at the original uploaded value because an
//   adjustment must never INVENT revenue Google was not already told about.
//   When it equals the uploaded value, nothing is sent (skipped_no_effective_reduction).
//
//   NOT deducted, ever: provider cost, Stripe fees, advertising spend. Coupons are
//   already reflected in the charge and are never deducted a second time. This
//   module reads only charged / refunded / uploaded, so no other deduction is
//   structurally possible.
//
//   If the charged amount cannot be proven, the basis is unknown: a full refund
//   may still RETRACT (removing a conversion can never overstate revenue), but a
//   partial refund is BLOCKED rather than restated from an unproven basis.

/** Google's hard limit: conversions older than this cannot be adjusted (CONVERSION_EXPIRED). */
export const ADJUSTMENT_WINDOW_DAYS = 54;
/** Safety margin so a queued row can't expire between classification and upload. */
export const ADJUSTMENT_WINDOW_SAFETY_DAYS = 2;
/** Effective window we will act on. */
export const EFFECTIVE_WINDOW_DAYS = ADJUSTMENT_WINDOW_DAYS - ADJUSTMENT_WINDOW_SAFETY_DAYS; // 52
/** Google's floor: a conversion younger than this cannot be adjusted (TOO_RECENT_CONVERSION). */
export const MIN_CONVERSION_AGE_HOURS = 24;
/** Google's per-request cap (TOO_MANY_ADJUSTMENTS_IN_REQUEST is >2000). */
export const GOOGLE_MAX_ADJUSTMENTS_PER_REQUEST = 2000;
/** Our own bounded batch — deliberately far below Google's cap. */
export const DEFAULT_BATCH_SIZE = 50;
export const MAX_BATCH_SIZE = 200;
/** Bounded retry policy. */
export const MAX_ATTEMPTS = 5;

export const ADJUSTMENT_TYPE = {
  RETRACTION: "RETRACTION",
  RESTATEMENT: "RESTATEMENT",
};

export const STATUS = {
  PENDING: "pending",
  DRY_RUN_READY: "dry_run_ready",
  BLOCKED_ORIGINAL_NOT_UPLOADED: "blocked_original_not_uploaded",
  BLOCKED_MISSING_IDENTIFIER: "blocked_missing_identifier",
  BLOCKED_OUTSIDE_ADJUSTMENT_WINDOW: "blocked_outside_adjustment_window",
  BLOCKED_CONVERSION_TOO_RECENT: "blocked_conversion_too_recent",
  BLOCKED_VALUE_INTEGRITY: "blocked_value_integrity",
  UPLOADED: "uploaded",
  RETRYABLE_ERROR: "retryable_error",
  TERMINAL_ERROR: "terminal_error",
  SUPERSEDED: "superseded",
  SKIPPED_NO_SUCCESSFUL_REFUND: "skipped_no_successful_refund",
  SKIPPED_NOT_GOOGLE_ATTRIBUTED: "skipped_not_google_attributed",
  // Refund happened, but retained revenue still equals the value Google already
  // holds (coupon overcharge correction) — telling Google anything would be wrong.
  SKIPPED_NO_EFFECTIVE_REDUCTION: "skipped_no_effective_reduction",
};

/** Statuses that a dry run may legitimately propose an upload for. */
export const READY_STATUSES = new Set([STATUS.DRY_RUN_READY]);

/**
 * DURABLE LEDGER OUTCOMES — the ledger is the source of truth after ingestion.
 *
 * The orders/refund classifier re-derives candidates from source data every run,
 * so it has no memory: an order whose conversion has ALREADY been retracted still
 * looks like a perfect candidate. Without this, the dry run reported the accepted
 * canary as actionable (7 ready / $779 instead of 6 / $680) and an ingest could
 * upsert a completed row back to `dry_run_ready`.
 *
 * A row in any of these states — or with `uploaded_at` set, or carrying accepted
 * Google identifiers — is FINISHED. The classifier may discover new candidates,
 * but it must never override a durable outcome.
 */
export const DURABLE_LEDGER_STATUSES = new Set([
  STATUS.UPLOADED,
  STATUS.SUPERSEDED,
  STATUS.TERMINAL_ERROR,
]);

/**
 * True when a ledger row records a completed//terminal outcome that must survive
 * any re-classification.
 */
export function isDurableLedgerOutcome(ledgerRow) {
  if (!ledgerRow) return false;
  if (ledgerRow.uploaded_at) return true;
  if (ledgerRow.google_request_id || ledgerRow.google_job_id) return true;
  return DURABLE_LEDGER_STATUSES.has(String(ledgerRow.status ?? ""));
}

/**
 * Overlay the durable ledger outcome onto a freshly classified candidate.
 *
 * Returns the candidate unchanged when the ledger has nothing durable to say, so
 * genuinely pending/new candidates keep their computed classification (including
 * a legitimately changed cumulative refund).
 */
export function applyLedgerOutcome(candidate, ledgerRow) {
  if (!isDurableLedgerOutcome(ledgerRow)) return candidate;
  return {
    ...candidate,
    status: String(ledgerRow.status ?? STATUS.UPLOADED),
    // A finished adjustment is not actionable: it proposes nothing.
    adjustmentType: null,
    ledgerUploadedAt: ledgerRow.uploaded_at ?? null,
    ledgerGoogleRequestId: ledgerRow.google_request_id ?? null,
    ledgerGoogleJobId: ledgerRow.google_job_id ?? null,
    blockedReason: ledgerRow.uploaded_at
      ? "already adjusted at Google — durable ledger outcome"
      : `durable ledger outcome: ${ledgerRow.status}`,
  };
}

/**
 * Google error codes that are permanent for a given (conversion, adjustment)
 * pair — retrying the identical payload can never succeed.
 * Source: conversion_adjustment_upload_error.proto (see header).
 */
export const TERMINAL_ERROR_CODES = new Set([
  "CONVERSION_ALREADY_RETRACTED",
  "CONVERSION_EXPIRED",
  "ADJUSTMENT_PRECEDES_CONVERSION",
  "MORE_RECENT_RESTATEMENT_FOUND",
  "RESTATEMENT_ALREADY_EXISTS",
  "DUPLICATE_ADJUSTMENT_IN_REQUEST",
  "CANNOT_RESTATE_CONVERSION_ACTION_THAT_ALWAYS_USES_DEFAULT_CONVERSION_VALUE",
  "MISSING_ORDER_ID_FOR_WEBPAGE",
  "ORDER_ID_CONTAINS_PII",
  "GCLID_DATE_TIME_PAIR_AND_ORDER_ID_BOTH_SET",
  "INVALID_CONVERSION_ACTION_TYPE",
  "NO_CONVERSION_ACTION_FOUND",
  "TOO_MANY_ADJUSTMENTS",
]);

/**
 * Errors worth retrying later — the conversion may simply not be queryable yet,
 * or the failure is transport/quota shaped.
 */
export const RETRYABLE_ERROR_CODES = new Set([
  "CONVERSION_NOT_FOUND",
  "TOO_RECENT_CONVERSION",
  "TOO_RECENT_CONVERSION_ACTION",
  "INTERNAL_ERROR",
  "TRANSIENT_ERROR",
  "RESOURCE_EXHAUSTED",
  "DEADLINE_EXCEEDED",
  "UNAVAILABLE",
]);

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

// ── helpers ──────────────────────────────────────────────────────────────────

/** Parse a timestamp to epoch ms, or null when absent/unparseable. */
export function toMs(ts) {
  if (ts === null || ts === undefined || ts === "") return null;
  const ms = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Google-Ads wire format: "yyyy-mm-dd HH:MM:SS+00:00".
 * Always emitted in UTC so the offset is explicit and never ambiguous.
 */
export function formatGoogleDateTime(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "+00:00");
}

/** Round to cents so float noise can never leak into a money value. */
export function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * PII-safe reference. Order references are business identifiers, but the dry-run
 * report is read by humans and stored, so we mask rather than print them whole.
 * Deterministic (same input → same mask) so rows stay correlatable across runs.
 */
export function maskRef(value) {
  const s = String(value ?? "");
  if (!s) return "—";
  if (s.length <= 4) return `***${s.slice(-1)}`;
  return `${s.slice(0, 2)}***${s.slice(-3)}`;
}

/**
 * Stable idempotency key. Two runs over the same refund state MUST produce the
 * same key so a duplicate webhook / duplicate consumer invocation collapses to
 * one row (enforced by a UNIQUE index on the ledger).
 *
 * Deliberately includes retained_value: a LATER partial refund changes retained
 * value, which is a genuinely NEW adjustment Google must be told about, so it
 * gets its own key and supersedes the earlier pending row.
 */
export function buildIdempotencyKey({ orderTransactionId, conversionActionId, adjustmentType, retainedValue }) {
  const retained = adjustmentType === ADJUSTMENT_TYPE.RETRACTION ? "0.00" : roundMoney(retainedValue).toFixed(2);
  return `${orderTransactionId}:${conversionActionId}:${adjustmentType}:${retained}`;
}

/** Non-cryptographic, stable fingerprint for safe display + change detection. */
export function shortFingerprint(input) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const s = String(input);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 12);
}

// ── the classifier ───────────────────────────────────────────────────────────

/**
 * Decide what (if anything) Google should be told about one order's refund.
 *
 * @param {object} o                         candidate order facts (no PII)
 * @param {string} o.orderTransactionId      confirmation_id — the Google order_id
 * @param {boolean} o.originalUploaded       google_ads_uploaded_at IS NOT NULL (durable proof)
 * @param {number|null} o.originalValue      value actually uploaded to Google
 * @param {string|null} o.refundStatus       'none' | 'partial' | 'full'
 * @param {number|null} o.cumulativeRefund   cumulative SUCCESSFUL refunds, dollars
 * @param {string|null} o.conversionAt       original conversion date-time (paid_at/created_at)
 * @param {string|null} o.refundedAt         when the refund happened
 * @param {string} o.conversionActionId      Backend Purchase (API) action id
 * @param {boolean} [o.valueProvenanceWeak]  true when originalValue is a reconstruction
 * @param {number} nowMs
 */
export function classifyAdjustmentCandidate(o, nowMs) {
  const conversionActionId = String(o.conversionActionId ?? "");
  const orderTransactionId = String(o.orderTransactionId ?? "").trim();
  const originalValue = o.originalValue === null || o.originalValue === undefined ? null : roundMoney(o.originalValue);
  const cumulativeRefund = o.cumulativeRefund === null || o.cumulativeRefund === undefined ? 0 : roundMoney(o.cumulativeRefund);
  const refundStatus = o.refundStatus ?? "none";

  const base = {
    orderTransactionId,
    conversionActionId,
    originalValue,
    cumulativeRefund,
    retainedValue: null,
    adjustmentType: null,
    currencyCode: "USD",
    adjustmentOccurredAt: null,
    conversionAgeDays: null,
    status: null,
    blockedReason: null,
    valueProvenanceWeak: o.valueProvenanceWeak === true,
  };

  // 1. Successful refunds only. 'none', pending, failed and reversed refunds never
  //    reach 'partial'/'full' with a positive cumulative amount, so they stop here.
  if (refundStatus !== "partial" && refundStatus !== "full") {
    return { ...base, status: STATUS.SKIPPED_NO_SUCCESSFUL_REFUND, blockedReason: `refund_status=${refundStatus}` };
  }
  if (!(cumulativeRefund > 0)) {
    return { ...base, status: STATUS.SKIPPED_NO_SUCCESSFUL_REFUND, blockedReason: "cumulative successful refund is not > 0" };
  }

  // 2. Never fabricate an adjustment for a conversion Google never received.
  //    google_ads_uploaded_at is the durable proof — NOT google_ads_upload_status,
  //    which the refund writers OVERWRITE with 'refunded_pending_adjustment' and
  //    which LIVE data proves is set on never-uploaded orders in both directions.
  if (o.originalUploaded !== true) {
    return { ...base, status: STATUS.BLOCKED_ORIGINAL_NOT_UPLOADED, blockedReason: "no google_ads_uploaded_at — original conversion was never uploaded" };
  }

  // 3. Identifier. Adjustments are order_id-only (see header, errors 20 + 24).
  if (!orderTransactionId) {
    return { ...base, status: STATUS.BLOCKED_MISSING_IDENTIFIER, blockedReason: "missing order_id (confirmation_id)" };
  }
  if (!conversionActionId) {
    return { ...base, status: STATUS.BLOCKED_MISSING_IDENTIFIER, blockedReason: "missing conversion_action_id" };
  }

  // 4. Value integrity — fail closed rather than guess.
  if (originalValue === null || !(originalValue > 0)) {
    return { ...base, status: STATUS.BLOCKED_VALUE_INTEGRITY, blockedReason: "original uploaded value is missing or not > 0" };
  }

  // The refund basis is the amount actually CHARGED (see header). When it cannot
  // be proven we fall back to the uploaded value and refuse to restate from it.
  const chargedAmount = o.chargedAmount === null || o.chargedAmount === undefined ? null : roundMoney(o.chargedAmount);
  const chargeBasisKnown = chargedAmount !== null && chargedAmount > 0;
  base.chargedAmount = chargedAmount;
  base.chargeBasisKnown = chargeBasisKnown;

  if (chargeBasisKnown && cumulativeRefund > chargedAmount) {
    return {
      ...base,
      status: STATUS.BLOCKED_VALUE_INTEGRITY,
      blockedReason: `cumulative refund (${cumulativeRefund.toFixed(2)}) exceeds the amount charged (${chargedAmount.toFixed(2)}) — refund data is inconsistent`,
    };
  }
  if (!chargeBasisKnown && cumulativeRefund > originalValue && refundStatus !== "full") {
    return {
      ...base,
      status: STATUS.BLOCKED_VALUE_INTEGRITY,
      blockedReason: `cumulative refund (${cumulativeRefund.toFixed(2)}) exceeds original uploaded value (${originalValue.toFixed(2)}) and the charged amount is unknown — value basis unproven`,
    };
  }

  // 5. Timing.
  const conversionMs = toMs(o.conversionAt);
  if (conversionMs === null) {
    return { ...base, status: STATUS.BLOCKED_MISSING_IDENTIFIER, blockedReason: "missing original conversion date-time" };
  }
  const ageDays = (nowMs - conversionMs) / MS_PER_DAY;
  const ageHours = (nowMs - conversionMs) / MS_PER_HOUR;
  base.conversionAgeDays = Math.round(ageDays * 100) / 100;

  if (ageHours < MIN_CONVERSION_AGE_HOURS) {
    return { ...base, status: STATUS.BLOCKED_CONVERSION_TOO_RECENT, blockedReason: `conversion is ${ageHours.toFixed(1)}h old — Google requires >= ${MIN_CONVERSION_AGE_HOURS}h (TOO_RECENT_CONVERSION)` };
  }
  if (ageDays > EFFECTIVE_WINDOW_DAYS) {
    return { ...base, status: STATUS.BLOCKED_OUTSIDE_ADJUSTMENT_WINDOW, blockedReason: `conversion is ${ageDays.toFixed(1)}d old — beyond the ${EFFECTIVE_WINDOW_DAYS}d effective window (Google hard limit ${ADJUSTMENT_WINDOW_DAYS}d, CONVERSION_EXPIRED)` };
  }

  // 6. adjustment_date_time must be strictly AFTER the conversion (error 7).
  //    Clamp forward by one second when the recorded refund time is not.
  const refundMs = toMs(o.refundedAt);
  const adjustmentMs = refundMs !== null && refundMs > conversionMs ? refundMs : conversionMs + 1000;
  if (adjustmentMs > nowMs) {
    return { ...base, status: STATUS.BLOCKED_VALUE_INTEGRITY, blockedReason: "adjustment_date_time would be in the future" };
  }
  base.adjustmentOccurredAt = formatGoogleDateTime(adjustmentMs);

  // 7. Canonical financial rule (see header). The basis is the amount charged;
  //    the result is clamped to [0, original] so it can never go negative and can
  //    never invent revenue Google was not already told about. Provider cost /
  //    Stripe fees / ad spend are not inputs, so they cannot be deducted.
  const basis = chargeBasisKnown ? chargedAmount : originalValue;
  const trueRetainedRevenue = roundMoney(Math.max(basis - cumulativeRefund, 0));
  const retainedValue = roundMoney(Math.min(trueRetainedRevenue, originalValue));
  base.trueRetainedRevenue = trueRetainedRevenue;
  base.retainedValue = retainedValue;

  // 8. Nothing to tell Google: the customer still retained everything Google was
  //    credited with (coupon overcharge correction). Both real LIVE partial
  //    refunds land here — restating them would UNDERSTATE retained revenue.
  if (retainedValue >= originalValue) {
    return {
      ...base,
      status: STATUS.SKIPPED_NO_EFFECTIVE_REDUCTION,
      blockedReason: `retained revenue (${retainedValue.toFixed(2)}) still equals the uploaded conversion value — refund was an overcharge correction, no adjustment is owed`,
    };
  }

  // 9. Without a proven charge basis we may REMOVE a conversion (a retraction can
  //    never overstate revenue) but must never restate to a value we cannot prove.
  if (!chargeBasisKnown && retainedValue > 0) {
    return {
      ...base,
      status: STATUS.BLOCKED_VALUE_INTEGRITY,
      blockedReason: "partial refund with no provable charged amount — refusing to restate from an unproven value basis",
    };
  }

  // 10. Adjustment type.
  //     Nothing retained → RETRACTION. Google's documented way to remove a
  //     conversion; a RESTATEMENT to 0 would keep the conversion COUNT and still
  //     inflate volume-based bidding.
  //     Something retained → RESTATEMENT to the retained value.
  base.adjustmentType = retainedValue <= 0 ? ADJUSTMENT_TYPE.RETRACTION : ADJUSTMENT_TYPE.RESTATEMENT;
  base.status = STATUS.DRY_RUN_READY;
  base.idempotencyKey = buildIdempotencyKey({
    orderTransactionId,
    conversionActionId,
    adjustmentType: base.adjustmentType,
    retainedValue,
  });
  base.idempotencyFingerprint = shortFingerprint(base.idempotencyKey);
  return base;
}

/**
 * Build the EXACT Google Ads payload for a ready candidate — without sending it.
 * Callers in dry-run mode print this; only a separately-approved mutation path
 * would ever POST it.
 */
export function buildAdjustmentPayload(candidate, { customerId }) {
  if (candidate.status !== STATUS.DRY_RUN_READY) {
    throw new Error(`refusing to build payload for non-ready candidate (${candidate.status})`);
  }
  const cid = String(customerId).replace(/[-\s]/g, "");
  const adjustment = {
    conversionAction: `customers/${cid}/conversionActions/${candidate.conversionActionId}`,
    adjustmentType: candidate.adjustmentType,
    adjustmentDateTime: candidate.adjustmentOccurredAt,
    // order_id ONLY. Setting gclid_date_time_pair as well is error 20.
    orderId: candidate.orderTransactionId,
  };
  if (candidate.adjustmentType === ADJUSTMENT_TYPE.RESTATEMENT) {
    adjustment.restatementValue = {
      adjustedValue: candidate.retainedValue,
      currencyCode: candidate.currencyCode,
    };
  }
  // RETRACTION intentionally carries NO restatementValue — Google errors if it does.
  return adjustment;
}

/** Classify a Google per-operation error code into our retry policy. */
export function classifyGoogleError(errorCode) {
  const code = String(errorCode ?? "").toUpperCase();
  if (TERMINAL_ERROR_CODES.has(code)) return STATUS.TERMINAL_ERROR;
  if (RETRYABLE_ERROR_CODES.has(code)) return STATUS.RETRYABLE_ERROR;
  // Unknown → retryable but bounded by MAX_ATTEMPTS, so it cannot loop forever.
  return STATUS.RETRYABLE_ERROR;
}

/** Bounded, validated batch size. */
export function resolveBatchSize(requested) {
  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.floor(n), MAX_BATCH_SIZE);
}

/** Aggregate a classified set into the PII-safe dry-run report. */
export function summarizeCandidates(candidates) {
  const by = (s) => candidates.filter((c) => c.status === s).length;
  const ready = candidates.filter((c) => c.status === STATUS.DRY_RUN_READY);
  const ages = ready.map((c) => c.conversionAgeDays).filter((n) => typeof n === "number");
  return {
    candidate_count: candidates.length,
    dry_run_ready: ready.length,
    partial_refund_candidates: ready.filter((c) => c.adjustmentType === ADJUSTMENT_TYPE.RESTATEMENT).length,
    full_refund_candidates: ready.filter((c) => c.adjustmentType === ADJUSTMENT_TYPE.RETRACTION).length,
    proposed_restatement_count: ready.filter((c) => c.adjustmentType === ADJUSTMENT_TYPE.RESTATEMENT).length,
    proposed_retraction_count: ready.filter((c) => c.adjustmentType === ADJUSTMENT_TYPE.RETRACTION).length,
    blocked_original_not_uploaded: by(STATUS.BLOCKED_ORIGINAL_NOT_UPLOADED),
    blocked_missing_identifier: by(STATUS.BLOCKED_MISSING_IDENTIFIER),
    blocked_outside_adjustment_window: by(STATUS.BLOCKED_OUTSIDE_ADJUSTMENT_WINDOW),
    blocked_conversion_too_recent: by(STATUS.BLOCKED_CONVERSION_TOO_RECENT),
    blocked_value_integrity: by(STATUS.BLOCKED_VALUE_INTEGRITY),
    skipped_no_successful_refund: by(STATUS.SKIPPED_NO_SUCCESSFUL_REFUND),
    skipped_not_google_attributed: by(STATUS.SKIPPED_NOT_GOOGLE_ATTRIBUTED),
    skipped_no_effective_reduction: by(STATUS.SKIPPED_NO_EFFECTIVE_REDUCTION),
    // Reported SEPARATELY from ready — never folded into the actionable counts.
    already_uploaded: by(STATUS.UPLOADED),
    already_uploaded_value: roundMoney(
      candidates.filter((c) => c.status === STATUS.UPLOADED)
        .reduce((s, c) => s + (c.originalValue ?? 0), 0),
    ),
    retryable: by(STATUS.RETRYABLE_ERROR),
    terminal: by(STATUS.TERMINAL_ERROR),
    superseded: by(STATUS.SUPERSEDED),
    total_original_uploaded_value: roundMoney(ready.reduce((s, c) => s + (c.originalValue ?? 0), 0)),
    total_cumulative_successful_refund: roundMoney(ready.reduce((s, c) => s + (c.cumulativeRefund ?? 0), 0)),
    total_proposed_retained_value: roundMoney(ready.reduce((s, c) => s + (c.retainedValue ?? 0), 0)),
    oldest_pending_age_days: ages.length ? Math.max(...ages) : null,
    newest_pending_age_days: ages.length ? Math.min(...ages) : null,
    // The safety invariant this whole task exists to prove.
    mutation_calls_sent: 0,
  };
}

/** PII-safe per-candidate row. Never emits email, name, phone, or raw click IDs. */
export function toSafeReportRow(c) {
  return {
    order_ref: maskRef(c.orderTransactionId),
    conversion_action_id: c.conversionActionId,
    original_value: c.originalValue,
    charged_amount: c.chargedAmount ?? null,
    charge_basis_known: c.chargeBasisKnown === true,
    cumulative_successful_refund: c.cumulativeRefund,
    true_retained_revenue: c.trueRetainedRevenue ?? null,
    retained_value: c.retainedValue,
    proposed_adjustment_type: c.adjustmentType,
    original_upload_status: c.originalUploaded === false ? "not_uploaded" : "uploaded",
    status: c.status,
    blocking_reason: c.blockedReason,
    conversion_age_days: c.conversionAgeDays,
    adjustment_window_status:
      c.status === STATUS.BLOCKED_OUTSIDE_ADJUSTMENT_WINDOW ? "expired"
        : c.status === STATUS.BLOCKED_CONVERSION_TOO_RECENT ? "too_recent"
        : c.conversionAgeDays === null ? "unknown" : "in_window",
    value_provenance_weak: c.valueProvenanceWeak === true,
    idempotency_fingerprint: c.idempotencyFingerprint ?? null,
    // Durable ledger evidence — present only on finished rows. Safe identifiers
    // (Google trace ids), never PII.
    ledger_uploaded_at: c.ledgerUploadedAt ?? null,
    ledger_google_request_id: c.ledgerGoogleRequestId ?? null,
    ledger_google_job_id: c.ledgerGoogleJobId ?? null,
  };
}
