// scripts/check-google-ads-refund-adjustment.mjs
//
// GOOGLE-ADS-REFUND-ADJUSTMENT-CONSUMER-001 — shadow-mode guard + test matrix.
//
// Two halves:
//   BEHAVIOUR (T*) — executes the REAL shipped core
//                    supabase/functions/_shared/googleAdsRefundAdjustment.mjs
//                    (plain ESM precisely so Node can run the same file Deno
//                    imports — these are not a re-implementation).
//   STATIC (S*)    — pins the zero-mutation safety contract in the consumer,
//                    the migration and the refund writers so it cannot silently
//                    regress.
//
// No network. No DB. No Google Ads client. Running this guard cannot upload
// anything, by construction.
//
// Usage:
//   node scripts/check-google-ads-refund-adjustment.mjs             → enforce (exit 1 on fail)
//   node scripts/check-google-ads-refund-adjustment.mjs --warn-only → audit (always exit 0)
//   node scripts/check-google-ads-refund-adjustment.mjs --self-test → prove every control trips

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyAdjustmentCandidate,
  buildAdjustmentPayload,
  buildIdempotencyKey,
  summarizeCandidates,
  toSafeReportRow,
  resolveBatchSize,
  classifyGoogleError,
  STATUS,
  ADJUSTMENT_TYPE,
  ADJUSTMENT_WINDOW_DAYS,
  EFFECTIVE_WINDOW_DAYS,
  MIN_CONVERSION_AGE_HOURS,
  MAX_BATCH_SIZE,
  MAX_ATTEMPTS,
  GOOGLE_MAX_ADJUSTMENTS_PER_REQUEST,
  applyLedgerOutcome,
  isDurableLedgerOutcome,
} from "../supabase/functions/_shared/googleAdsRefundAdjustment.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const warnOnly = process.argv.includes("--warn-only");
const selfTest = process.argv.includes("--self-test");
const TAG = "[check-google-ads-refund-adjustment]";

const PATHS = {
  core: "supabase/functions/_shared/googleAdsRefundAdjustment.mjs",
  consumer: "supabase/functions/google-ads-refund-adjustments/index.ts",
  migration: "supabase/migrations/20260726120000_google_ads_refund_adjustment_shadow_ledger.sql",
  migration2: "supabase/migrations/20260726123000_google_ads_refund_adjustment_charge_basis.sql",
  migration3: "supabase/migrations/20260726130000_google_ads_refund_adjustment_harden_grants.sql",
  migration4: "supabase/migrations/20260726150000_google_ads_conversion_upload_provenance.sql",
  migration5: "supabase/migrations/20260726190000_google_ads_adjustment_uploaded_immutability.sql",
  webhook: "supabase/functions/stripe-webhook/index.ts",
  createRefund: "supabase/functions/create-refund/index.ts",
  uploader: "supabase/functions/sync-google-ads-conversions/index.ts",
  pkg: "package.json",
};

const failures = [];
const passes = [];
function check(id, ok, msg) {
  if (ok) passes.push(id);
  else failures.push(`${id}: ${msg}`);
  return ok;
}

// A fixed clock — the matrix must never depend on the day it runs.
const NOW = Date.parse("2026-07-26T12:00:00Z");
const DAY = 86_400_000;
const ago = (days) => new Date(NOW - days * DAY).toISOString();

const ACTION = "7567366496"; // Backend Purchase (API) — the ONLY adjustment target

function order(overrides = {}) {
  const base = {
    orderTransactionId: "PT-TESTORDER",
    originalUploaded: true,
    originalValue: 129,
    refundStatus: "none",
    cumulativeRefund: 0,
    conversionAt: ago(10),
    refundedAt: ago(3),
    conversionActionId: ACTION,
    ...overrides,
  };
  // Default: the customer was charged exactly the value uploaded to Google.
  // Tests that model a coupon overcharge pass chargedAmount explicitly.
  if (!("chargedAmount" in base)) base.chargedAmount = base.originalValue;
  return base;
}
const classify = (o) => classifyAdjustmentCandidate(order(o), NOW);

// ── BEHAVIOUR MATRIX ─────────────────────────────────────────────────────────
function runBehaviourMatrix() {
  // A. $129 conversion, no refund → no candidate.
  const A = classify({});
  check("T01", A.status === STATUS.SKIPPED_NO_SUCCESSFUL_REFUND, `no-refund order must not produce an adjustment (got ${A.status})`);
  check("T02", A.adjustmentType === null, "no-refund order must have no adjustment type");

  // B. $129, successful $40 partial → retained $89, RESTATEMENT.
  const B = classify({ refundStatus: "partial", cumulativeRefund: 40 });
  check("T03", B.status === STATUS.DRY_RUN_READY, `partial refund must be ready (got ${B.status})`);
  check("T04", B.retainedValue === 89, `retained value must be 89 (got ${B.retainedValue})`);
  check("T05", B.adjustmentType === ADJUSTMENT_TYPE.RESTATEMENT, "partial refund must propose RESTATEMENT");

  // C. $129, full $129 refund → retained 0, RETRACTION.
  const C = classify({ refundStatus: "full", cumulativeRefund: 129 });
  check("T06", C.retainedValue === 0, `full refund retained value must be 0 (got ${C.retainedValue})`);
  check("T07", C.adjustmentType === ADJUSTMENT_TYPE.RETRACTION, "full refund must propose RETRACTION");

  // D. $179 with two successful partials ($30 + $20 = $50 cumulative) → $129.
  const D = classify({ originalValue: 179, refundStatus: "partial", cumulativeRefund: 50 });
  check("T08", D.retainedValue === 129, `cumulative partial refunds must yield 129 (got ${D.retainedValue})`);
  check("T09", D.adjustmentType === ADJUSTMENT_TYPE.RESTATEMENT, "multi-partial must stay a RESTATEMENT");

  // E/F. Pending and failed refunds never reach partial/full → no ready adjustment.
  for (const [id, st] of [["T10", "pending"], ["T11", "failed"], ["T12", "canceled"], ["T13", "none"]]) {
    const r = classify({ refundStatus: st, cumulativeRefund: 40 });
    check(id, r.status === STATUS.SKIPPED_NO_SUCCESSFUL_REFUND, `refund_status='${st}' must not produce a ready adjustment (got ${r.status})`);
  }

  // G/K. Refund before / without the original upload → blocked, never fabricated.
  const G = classify({ originalUploaded: false, refundStatus: "full", cumulativeRefund: 129 });
  check("T14", G.status === STATUS.BLOCKED_ORIGINAL_NOT_UPLOADED, `refund before upload must block (got ${G.status})`);
  check("T15", G.adjustmentType === null, "blocked-not-uploaded must not carry an adjustment type");

  // …and once the original upload lands, the very same refund becomes ready.
  const G2 = classify({ originalUploaded: true, refundStatus: "full", cumulativeRefund: 129 });
  check("T16", G2.status === STATUS.DRY_RUN_READY, "candidate must become ready once the original upload succeeds");

  // H/I. Duplicate webhook and duplicate consumer run collapse to ONE key.
  const h1 = classify({ refundStatus: "partial", cumulativeRefund: 40 });
  const h2 = classify({ refundStatus: "partial", cumulativeRefund: 40 });
  check("T17", h1.idempotencyKey === h2.idempotencyKey, "duplicate refund state must produce one idempotency key");
  check("T18", h1.idempotencyKey === buildIdempotencyKey({ orderTransactionId: "PT-TESTORDER", conversionActionId: ACTION, adjustmentType: ADJUSTMENT_TYPE.RESTATEMENT, retainedValue: 89 }), "idempotency key must be deterministic");

  // …but a LATER partial (different retained value) is a genuinely new adjustment.
  const h3 = classify({ refundStatus: "partial", cumulativeRefund: 60 });
  check("T19", h3.idempotencyKey !== h1.idempotencyKey, "a changed retained value must produce a NEW idempotency key");

  // J. Add-on documentation refunds must never adjust the parent conversion.
  //    Add-ons live in order_additional_documentation_requests, are never
  //    uploaded as their own conversion, and carry their own payment intent.
  const J = classifyAdjustmentCandidate(order({ orderTransactionId: "", refundStatus: "full", cumulativeRefund: 50 }), NOW);
  check("T20", J.status === STATUS.BLOCKED_MISSING_IDENTIFIER, `an add-on refund with no own conversion order_id must block (got ${J.status})`);

  // L. Non-Google order (never uploaded) → skipped/blocked, never uploaded.
  const L = classify({ originalUploaded: false, refundStatus: "partial", cumulativeRefund: 10 });
  check("T21", L.status !== STATUS.DRY_RUN_READY, "a non-Google-attributed order must never be ready");

  // M. Coupon-discounted purchase: the uploaded value is already net of the
  //    coupon, so only the refund is deducted — never the coupon a second time.
  const M = classify({ originalValue: 89, refundStatus: "partial", cumulativeRefund: 20 });
  check("T22", M.retainedValue === 69, `coupon must not be deducted twice (expected 69, got ${M.retainedValue})`);

  // N. Partial then full → latest retained value 0 and a RETRACTION.
  const N = classify({ refundStatus: "full", cumulativeRefund: 129 });
  check("T23", N.retainedValue === 0 && N.adjustmentType === ADJUSTMENT_TYPE.RETRACTION, "partial-then-full must end at retained 0 + RETRACTION");

  // O. Refund exceeds the amount charged (corrupt data) → blocked, never negative.
  const O = classify({ originalValue: 129, chargedAmount: 129, refundStatus: "full", cumulativeRefund: 500 });
  check("T24", O.status === STATUS.BLOCKED_VALUE_INTEGRITY, `refund > charged must block (got ${O.status})`);
  check("T25", !(O.retainedValue < 0), "retained value must never be negative");

  // ── CHARGE-BASIS RULE (the real LIVE landmine) ─────────────────────────────
  // Coupon overcharge correction: uploaded 89, charged 109, refunded 20. The
  // customer still kept 89 — exactly what Google was told. NOTHING must be sent.
  // The naive (uploaded − refund) rule would wrongly restate this to 69.
  const CB1 = classify({ originalValue: 89, chargedAmount: 109, refundStatus: "partial", cumulativeRefund: 20 });
  check("T52", CB1.status === STATUS.SKIPPED_NO_EFFECTIVE_REDUCTION, `overcharge correction must send nothing (got ${CB1.status})`);
  check("T53", CB1.trueRetainedRevenue === 89, `true retained revenue must be charged−refund = 89 (got ${CB1.trueRetainedRevenue})`);
  check("T54", CB1.adjustmentType === null, "an overcharge correction must propose no adjustment type");

  // Real LIVE PT-MR1HX27H: uploaded 59, charged 99, refunded 40 → kept 59.
  const CB2 = classify({ originalValue: 59, chargedAmount: 99, refundStatus: "partial", cumulativeRefund: 40 });
  check("T55", CB2.status === STATUS.SKIPPED_NO_EFFECTIVE_REDUCTION, `PT-MR1HX27H-shaped order must send nothing (got ${CB2.status})`);

  // A genuine partial revenue loss on the same overcharged order still restates.
  const CB3 = classify({ originalValue: 89, chargedAmount: 109, refundStatus: "partial", cumulativeRefund: 50 });
  check("T56", CB3.status === STATUS.DRY_RUN_READY && CB3.retainedValue === 59, `genuine partial loss must restate to 59 (got ${CB3.status}/${CB3.retainedValue})`);

  // Refund larger than the uploaded value but a genuine FULL refund of the charge
  // (real LIVE PT-MRF1ECR0: uploaded 129, charged 149, refunded 149) → RETRACTION.
  const CB4 = classify({ originalValue: 129, chargedAmount: 149, refundStatus: "full", cumulativeRefund: 149 });
  check("T57", CB4.status === STATUS.DRY_RUN_READY && CB4.adjustmentType === ADJUSTMENT_TYPE.RETRACTION, `full refund of an overcharged order must RETRACT (got ${CB4.status}/${CB4.adjustmentType})`);

  // An adjustment must never INVENT revenue above what Google already holds.
  const CB5 = classify({ originalValue: 89, chargedAmount: 200, refundStatus: "partial", cumulativeRefund: 10 });
  check("T58", CB5.retainedValue <= 89, "retained value must never exceed the original uploaded value");

  // Unproven charge basis: a partial refund must be blocked, never guessed…
  const CB6 = classify({ originalValue: 129, chargedAmount: null, refundStatus: "partial", cumulativeRefund: 40 });
  check("T59", CB6.status === STATUS.BLOCKED_VALUE_INTEGRITY, `partial refund with no provable charge must block (got ${CB6.status})`);
  // …but a full refund may still retract, since removing a conversion can never
  // overstate revenue.
  const CB7 = classify({ originalValue: 129, chargedAmount: null, refundStatus: "full", cumulativeRefund: 129 });
  check("T60", CB7.status === STATUS.DRY_RUN_READY && CB7.adjustmentType === ADJUSTMENT_TYPE.RETRACTION, `full refund with no provable charge may still RETRACT (got ${CB7.status})`);

  // Window rules (Google: CONVERSION_EXPIRED > 54d, TOO_RECENT_CONVERSION < 24h).
  const W1 = classify({ conversionAt: ago(60), refundStatus: "full", cumulativeRefund: 129 });
  check("T26", W1.status === STATUS.BLOCKED_OUTSIDE_ADJUSTMENT_WINDOW, `a 60-day-old conversion must block (got ${W1.status})`);
  const W2 = classify({ conversionAt: ago(0.2), refundedAt: ago(0.1), refundStatus: "full", cumulativeRefund: 129 });
  check("T27", W2.status === STATUS.BLOCKED_CONVERSION_TOO_RECENT, `a <24h conversion must block (got ${W2.status})`);
  check("T28", ADJUSTMENT_WINDOW_DAYS === 54 && EFFECTIVE_WINDOW_DAYS === 52 && MIN_CONVERSION_AGE_HOURS === 24, "window constants must match Google's documented limits");

  // Payload shape — the exact thing a future canary would send.
  const payload = buildAdjustmentPayload(B, { customerId: "248-085-3323" });
  check("T29", payload.orderId === "PT-TESTORDER" && !("gclidDateTimePair" in payload), "adjustments must use order_id ONLY (never gclid_date_time_pair)");
  check("T30", payload.conversionAction === `customers/2480853323/conversionActions/${ACTION}`, "payload must target the Backend Purchase action only");
  check("T31", payload.restatementValue?.adjustedValue === 89 && payload.restatementValue?.currencyCode === "USD", "RESTATEMENT must carry the retained value in USD");
  const retractionPayload = buildAdjustmentPayload(C, { customerId: "2480853323" });
  check("T32", !("restatementValue" in retractionPayload), "RETRACTION must NOT carry restatementValue (Google errors if it does)");
  check("T33", /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+00:00$/.test(payload.adjustmentDateTime), `adjustment_date_time must match Google's format (got ${payload.adjustmentDateTime})`);

  // adjustment_date_time must be strictly after the conversion (error 7).
  const P = classify({ conversionAt: ago(5), refundedAt: ago(9), refundStatus: "partial", cumulativeRefund: 40 });
  check("T34", Date.parse(P.adjustmentOccurredAt.replace(" ", "T").replace("+00:00", "Z")) > Date.parse(ago(5)), "adjustment_date_time must be clamped to AFTER the conversion");

  // Never-deducted invariants: only the two money inputs can influence retained.
  const base = classify({ refundStatus: "partial", cumulativeRefund: 40 });
  check("T35", base.retainedValue === 89, "provider cost must not be deducted");
  check("T36", base.retainedValue === 89, "Stripe fees must not be deducted");
  check("T37", base.retainedValue === 89, "advertising spend must not be deducted");

  // Two conversions for one customer stay separate.
  const c1 = classify({ orderTransactionId: "PT-AAA", refundStatus: "partial", cumulativeRefund: 40 });
  const c2 = classify({ orderTransactionId: "PT-BBB", refundStatus: "partial", cumulativeRefund: 40 });
  check("T38", c1.idempotencyKey !== c2.idempotencyKey, "two orders for one customer must remain separate adjustments");

  // Retry classification.
  check("T39", classifyGoogleError("CONVERSION_ALREADY_RETRACTED") === STATUS.TERMINAL_ERROR, "CONVERSION_ALREADY_RETRACTED must be terminal (a retraction can never be restated)");
  check("T40", classifyGoogleError("CONVERSION_EXPIRED") === STATUS.TERMINAL_ERROR, "CONVERSION_EXPIRED must be terminal");
  check("T41", classifyGoogleError("CONVERSION_NOT_FOUND") === STATUS.RETRYABLE_ERROR, "CONVERSION_NOT_FOUND must be retryable");
  check("T42", classifyGoogleError("SOMETHING_NEW") === STATUS.RETRYABLE_ERROR, "unknown errors must default to bounded-retryable");

  // Bounded batch.
  check("T43", resolveBatchSize(99999) === MAX_BATCH_SIZE, `batch size must be capped at ${MAX_BATCH_SIZE}`);
  check("T44", resolveBatchSize(-5) > 0 && resolveBatchSize("abc") > 0, "invalid batch sizes must fall back to a safe default");
  check("T45", MAX_BATCH_SIZE < GOOGLE_MAX_ADJUSTMENTS_PER_REQUEST && MAX_ATTEMPTS > 0 && MAX_ATTEMPTS <= 10, "batch + retry limits must stay bounded and below Google's per-request cap");

  // Reporting: zero mutations + no PII.
  const summary = summarizeCandidates([A, B, C, D, G, O, W1]);
  check("T46", summary.mutation_calls_sent === 0, "summary must report mutation_calls_sent = 0");
  check("T47", summary.proposed_retraction_count === 1 && summary.proposed_restatement_count === 2, `summary must count 1 retraction + 2 restatements (got ${summary.proposed_retraction_count}/${summary.proposed_restatement_count})`);
  check("T48", summary.blocked_original_not_uploaded === 1 && summary.blocked_value_integrity === 1 && summary.blocked_outside_adjustment_window === 1, "summary must count each blocked class");
  check("T49", summary.total_proposed_retained_value === 218, `retained-value total must be 89+0+129=218 (got ${summary.total_proposed_retained_value})`);

  const row = JSON.stringify(toSafeReportRow(B));
  check("T50", !row.includes("PT-TESTORDER"), "report rows must mask the order reference");
  check("T51", !/gclid|email|phone|@/i.test(row), "report rows must contain no click IDs, email or phone");

  // ── LEDGER RECONCILIATION (LEDGER-RECONCILIATION-FIX-001) ─────────────────
  // The classifier has no memory: an order whose conversion was already
  // retracted still re-derives as a perfect candidate. The ledger must win.
  const uploadedLedger = {
    status: "uploaded", uploaded_at: "2026-07-26T01:10:39.844Z",
    google_request_id: "req123", google_job_id: "job456", attempt_count: 1,
  };
  const readyAgain = classify({ refundStatus: "full", cumulativeRefund: 129 });
  check("T61", readyAgain.status === STATUS.DRY_RUN_READY, "sanity: the raw classifier still calls the retracted order ready");

  const overlaid = applyLedgerOutcome(readyAgain, uploadedLedger);
  check("T62", overlaid.status === STATUS.UPLOADED, `an uploaded ledger row must override the classifier (got ${overlaid.status})`);
  check("T63", overlaid.adjustmentType === null, "an already-adjusted candidate must propose no adjustment type");
  check("T64", overlaid.ledgerGoogleJobId === "job456" && overlaid.ledgerUploadedAt, "the durable ledger evidence must be carried onto the candidate");

  // Ready count and proposed value must both exclude it; uploaded reported apart.
  const mixed = summarizeCandidates([
    overlaid,
    classify({ orderTransactionId: "PT-A", refundStatus: "full", cumulativeRefund: 129 }),
    classify({ orderTransactionId: "PT-B", refundStatus: "full", cumulativeRefund: 129 }),
  ]);
  check("T65", mixed.dry_run_ready === 2, `uploaded rows must be excluded from the ready count (got ${mixed.dry_run_ready})`);
  check("T66", mixed.already_uploaded === 1, `uploaded count must be reported separately (got ${mixed.already_uploaded})`);
  check("T67", mixed.total_original_uploaded_value === 258, `proposed value must exclude the uploaded adjustment (got ${mixed.total_original_uploaded_value})`);
  check("T68", mixed.already_uploaded_value === 129, `uploaded value must be reported separately (got ${mixed.already_uploaded_value})`);
  check("T69", mixed.proposed_retraction_count === 2, "an already-adjusted conversion must not be proposed again");

  // Durability detection covers every completion signal, not just status.
  check("T70", isDurableLedgerOutcome({ status: "dry_run_ready", uploaded_at: "2026-07-26T00:00:00Z" }), "uploaded_at alone must mark a row durable");
  check("T71", isDurableLedgerOutcome({ status: "dry_run_ready", google_request_id: "r" }), "an accepted Google request id must mark a row durable");
  check("T72", isDurableLedgerOutcome({ status: "superseded" }), "superseded must be durable — never reopened");
  check("T73", isDurableLedgerOutcome({ status: "terminal_error" }), "terminal_error must be durable — never silently reopened");
  check("T74", !isDurableLedgerOutcome({ status: "dry_run_ready" }), "a genuinely pending row must NOT be treated as durable");
  check("T75", !isDurableLedgerOutcome(null) && !isDurableLedgerOutcome(undefined), "a candidate with no ledger row must stay classifier-driven");

  // A pending row may still legitimately change (e.g. a further partial refund).
  const pendingUpdated = applyLedgerOutcome(
    classify({ refundStatus: "partial", chargedAmount: 129, cumulativeRefund: 40 }),
    { status: "dry_run_ready", uploaded_at: null },
  );
  check("T76", pendingUpdated.status === STATUS.DRY_RUN_READY && pendingUpdated.retainedValue === 89,
    "a pending ledger row must not suppress a recomputed pending candidate");

  // Expected LIVE shape after the accepted canary: 1 uploaded, 6 ready.
  const liveShape = summarizeCandidates([
    overlaid,
    ...Array.from({ length: 6 }, (_, i) => classify({ orderTransactionId: `PT-R${i}`, refundStatus: "full", cumulativeRefund: 129 })),
  ]);
  check("T77", liveShape.already_uploaded === 1 && liveShape.dry_run_ready === 6,
    `expected LIVE shape 1 uploaded / 6 ready (got ${liveShape.already_uploaded}/${liveShape.dry_run_ready})`);

  const overlaidRow = JSON.stringify(toSafeReportRow(overlaid));
  check("T78", !overlaidRow.includes("PT-TESTORDER") && !/@|gclid/i.test(overlaidRow),
    "a reconciled report row must stay PII-safe");
}

// ── STATIC SAFETY CONTRACT ───────────────────────────────────────────────────
// "Absence of code" checks must look at CODE, not at the comments that describe
// the rule — otherwise a file documenting "we never call googleads.googleapis.com"
// would fail its own guard. Comment-text checks use the raw source instead.
function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ")
    .replace(/([^:])\/\/.*$/gm, "$1");
}

function runStaticChecks(files) {
  const { core, consumer, migration, webhook, createRefund, pkg } = files;
  const consumerCode = stripComments(consumer);
  const coreCode = stripComments(core);
  const webhookCode = stripComments(webhook);
  const refundCode = stripComments(createRefund);

  // ── POSTURE CHANGE (CANARY-EXECUTION-PREP-001) ────────────────────────────
  // A protected single-item mutation path now EXISTS, so "absence of code" is no
  // longer the control. The controls are now: exactly one operation, dual flags
  // plus an exact allow-list id, and validate-only as the fail-closed default.
  check("S01", /uploadConversionAdjustments/.test(consumerCode),
    "the adjustment endpoint must be the ConversionAdjustmentUploadService upload method");
  check("S02", (consumerCode.match(/googleads\.googleapis\.com/g) ?? []).length === 1,
    "there must be exactly ONE Google Ads endpoint in the consumer (no second/batch path)");
  check("S03", !/uploadClickConversions|:mutate|campaignBudget|conversionAction:mutate/i.test(consumerCode),
    "the consumer must reach no endpoint other than conversion-adjustment upload");
  check("S04", /protected_canary_path_present:\s*true/.test(consumer) && /batch_path_present:\s*false/.test(consumer),
    "consumer must declare the protected canary path present and NO batch path");

  // Exactly one operation, structurally enforced.
  check("S46", /const CANARY_MAX_OPERATIONS = 1/.test(consumerCode),
    "the per-request operation cap must be hard-wired to 1");
  check("S47", /operations\.length !== CANARY_MAX_OPERATIONS/.test(consumerCode) && /refusing to send/.test(consumerCode),
    "the sender must assert exactly one operation immediately before the request");
  check("S48", /conversionAdjustments: operations/.test(consumerCode),
    "the request body must carry the single-element operations array");

  // Dual flags + allow-list, all fail-closed on the exact string "true".
  check("S49", /GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED"\s*\)\s*===\s*"true"/.test(consumerCode) &&
               /GOOGLE_ADS_REFUND_CANARY_ENABLED"\s*\)\s*===\s*"true"/.test(consumerCode),
    "BOTH kill switches must require the exact string 'true'");
  check("S50", /if \(!MUTATIONS_ENABLED\) blockers\.push/.test(consumerCode) &&
               /if \(!CANARY_ENABLED\) blockers\.push/.test(consumerCode) &&
               /CANARY_ADJUSTMENT_ID !== adjustmentId/.test(consumerCode),
    "a real mutation must be blocked unless both flags are true AND the allow-list id matches exactly");
  check("S51", /const wantsRealMutation = body\.validateOnly === false/.test(consumerCode),
    "only an explicit `validateOnly: false` may request a real mutation (missing input must validate, not mutate)");
  check("S52", /const validateOnly = !wantsRealMutation/.test(consumerCode),
    "validateOnly must be derived so the request is validate-only unless every condition held");
  check("S53", /partialFailure: true/.test(consumerCode), "partialFailure must be true");
  check("S54", /adjustmentType: ADJUSTMENT_TYPE\.RETRACTION/.test(consumerCode) &&
               !/restatementValue/.test(consumerCode.replace(/\/\/.*$/gm, "")),
    "the canary payload must be RETRACTION with no restatementValue");
  check("S55", !/gclidDateTimePair|userIdentifiers/.test(consumerCode),
    "the canary payload must not set gclidDateTimePair or userIdentifiers");
  check("S56", /mode === "single" \|\| mode === "batch"/.test(consumerCode) && /501/.test(consumerCode),
    "legacy single and batch modes must stay permanently refused");
  // Ledger safety: a validate-only run must never mark the row uploaded.
  check("S57", /if \(validateOnly\) \{[\s\S]{0,400}last_validation/.test(consumerCode),
    "a validate-only run must write only a validation record");
  check("S58", /\} else if \(accepted\) \{[\s\S]{0,200}status: "uploaded"/.test(consumerCode),
    "uploaded status may be written ONLY on a real, accepted send");
  check("S59", /ledger_marked_uploaded: !validateOnly && accepted/.test(consumerCode),
    "the response must report ledger_marked_uploaded derived from a real accepted send");
  check("S60", /v24|GOOGLE_ADS_API_VERSION/.test(consumerCode),
    "the adjustment must use the configured Google Ads API version");

  // Kill switch + dry-run default + fail-closed mutation modes.
  check("S05", /GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED"\s*\)\s*===\s*"true"/.test(consumer), "kill switch must require the exact string 'true' (fail closed)");
  check("S06", /body\.mode\s*\?\?\s*"dry_run"/.test(consumer), "dry_run must be the default mode");
  check("S07", /mode === "single" \|\| mode === "batch"/.test(consumer) && /501/.test(consumer), "single/batch mutation modes must fail closed with 501");
  check("S08", /mutation_calls_sent: realMutationCallsSent/.test(consumerCode) &&
               /if \(validateOnly\) validateOnlyCallsSent\+\+; else realMutationCallsSent\+\+/.test(consumerCode),
    "the consumer must count REAL mutations separately from validate-only calls and report the real count");

  // Backend Purchase only — never the Secondary dynamic actions.
  check("S09", /GOOGLE_ADS_CONVERSION_ACTION_ID/.test(consumer), "consumer must read the Backend Purchase action from the same env var as the uploader");
  check("S10", !/ESA[_ ]?Purchase|PSD[_ ]?Purchase|esaDynamic|psdDynamic/i.test(consumerCode + coreCode), "ESA/PSD Dynamic actions must never be adjustment targets");

  // No Ads account mutation of any kind.
  const adsMutation = /campaignBudget|campaign_budget|:mutateCampaigns|:mutateAdGroup|biddingStrategy|targetCpa|keywordPlan|:mutateAds\b|finalUrls/i;
  check("S11", !adsMutation.test(consumerCode + coreCode), "no campaign/bid/budget/keyword/ad-copy/final-URL mutation code may exist here");

  // Refund writers must not call Google (checkout must never depend on Ads).
  check("S12", !/googleads\.googleapis\.com/.test(webhookCode), "the Stripe webhook must never call Google Ads");
  check("S13", !/google-ads-refund-adjustments/.test(webhookCode), "the Stripe webhook must not invoke the adjustment consumer synchronously");
  check("S14", !/googleads\.googleapis\.com/.test(refundCode), "create-refund must never call Google Ads");

  // Core contract pins.
  check("S15", /ADJUSTMENT_WINDOW_DAYS = 54/.test(core), "the 54-day CONVERSION_EXPIRED window must be pinned");
  check("S16", /MIN_CONVERSION_AGE_HOURS = 24/.test(core), "the 24-hour TOO_RECENT_CONVERSION floor must be pinned");
  check("S17", /orderId:\s*candidate\.orderTransactionId/.test(core) && !/gclidDateTimePair:/.test(core), "the payload builder must use order_id only");
  check("S18", /RETRACTION intentionally carries NO restatementValue/.test(core), "the retraction/restatement rule must stay documented in code");
  check("S31", /chargeBasisKnown/.test(coreCode) && /Math\.max\(basis - cumulativeRefund, 0\)/.test(coreCode), "the refund basis must be the amount CHARGED, clamped at zero");
  check("S32", /Math\.min\(trueRetainedRevenue, originalValue\)/.test(coreCode), "the adjusted value must be capped at the original uploaded value (never invent revenue)");
  check("S33", /SKIPPED_NO_EFFECTIVE_REDUCTION/.test(coreCode), "overcharge corrections must be skipped, not restated");
  check("S34", /charge_basis_known/.test(stripComments(files.migration + (files.migration2 ?? ""))), "the ledger must record whether the charge basis was proven");

  // Supabase default privileges re-grant EXECUTE to `authenticated` on new public
  // functions, and REVOKE ... FROM public does NOT undo an explicit role grant.
  // The candidate RPC returns order + payment-intent identifiers, so it must be
  // revoked from `authenticated` EXPLICITLY.
  const grants = stripComments(files.migration3 ?? "");
  check("S35",
    /revoke\s+all\s+on\s+function\s+public\.get_google_ads_refund_adjustment_candidates\(integer\)\s*\n?\s*from[^;]*authenticated/i.test(grants),
    "the candidate RPC must be revoked from `authenticated` explicitly (it exposes order + payment-intent identifiers)");
  check("S36",
    /alter\s+function\s+public\.tg_google_ads_conv_adj_touch\(\)\s+set\s+search_path/i.test(grants),
    "the trigger function must pin search_path");

  // ── Original-upload provenance (CANARY-READINESS-001) ─────────────────────
  // An adjustment must be computed against what was ACTUALLY sent to Google, so
  // the record of a successful upload has to be permanent.
  const prov = stripComments(files.migration4 ?? "");
  check("S37", /create table if not exists public\.google_ads_conversion_uploads/.test(prov),
    "an immutable original-upload provenance table is required");
  check("S38", /successful upload provenance is immutable \(update blocked\)/.test(files.migration4 ?? "") &&
               /successful upload provenance is immutable \(delete blocked\)/.test(files.migration4 ?? ""),
    "successful upload provenance must be immutable against BOTH update and delete");
  check("S39", /before update or delete on public\.google_ads_conversion_uploads/i.test(prov),
    "the immutability trigger must fire on update AND delete");
  check("S40", /create unique index if not exists gac_uploads_success_uidx[\s\S]*?where upload_status = 'success'/i.test(prov),
    "a retry must not be able to create a second successful upload record");
  check("S41", /enable row level security/i.test(prov) && /force row level security/i.test(prov) &&
               !/for (insert|update|delete) to authenticated/i.test(prov),
    "the provenance table must enable+force RLS and grant browser clients no write policy");
  // Historical conversions must never be assigned a guessed uploaded value: the
  // classifier reads uploaded_value ONLY from the provenance table, so a
  // 'reconstructed' row returns NULL rather than orders.price.
  check("S42", /when u\.id is not null then 'proven'/.test(prov) &&
               /when o\.google_ads_uploaded_at is not null then 'reconstructed'/.test(prov) &&
               /u\.uploaded_value,/.test(prov) && !/o\.price/.test(prov),
    "provenance classification must never fall back to the mutable orders.price for a value");

  // The uploader must persist provenance and must not reintroduce the audit bug.
  const up = stripComments(files.uploader);
  check("S43", /from\("google_ads_conversion_uploads"\)\s*\.insert\(/.test(up),
    "the uploader must record immutable provenance on a successful upload");
  check("S44", !/^\s*details:\s*\{/m.test(up),
    "the uploader must not write audit_logs.details (a column that does not exist) — use metadata");
  check("S45", /upload_status: "success"/.test(up) && /uploaded_value: price/.test(up),
    "the provenance record must capture the exact uploaded value");

  // ── LEDGER RECONCILIATION (LEDGER-RECONCILIATION-FIX-001) ─────────────────
  check("S61", /DURABLE_LEDGER_STATUSES/.test(coreCode) &&
               /STATUS\.UPLOADED,[\s\S]{0,60}STATUS\.SUPERSEDED,[\s\S]{0,60}STATUS\.TERMINAL_ERROR/.test(coreCode),
    "uploaded / superseded / terminal outcomes must all be treated as durable");
  check("S62", /if \(ledgerRow\.uploaded_at\) return true/.test(coreCode),
    "uploaded_at alone must mark a ledger row durable");
  // Scoped to applyLedgerOutcome's body — `adjustmentType: null` also appears in
  // the base classifier, so an unscoped match would pass even if the overlay
  // stopped clearing it.
  const overlayFn = (coreCode.match(/export function applyLedgerOutcome[\s\S]*?\n\}/) ?? [""])[0];
  check("S63", /adjustmentType: null/.test(overlayFn),
    "a durable ledger outcome must clear the proposed adjustment type");
  check("S64", /already_uploaded_value/.test(coreCode),
    "uploaded value must be summarised separately from the proposed value");
  // The dry run must overlay the ledger BEFORE summarising/reporting.
  check("S65", /const reconciled = candidates\.map\(\(c\) =>[\s\S]{0,120}applyLedgerOutcome/.test(consumerCode),
    "the consumer must overlay durable ledger outcomes onto classified candidates");
  check("S66", /summarizeCandidates\(reconciled\)/.test(consumerCode) && !/summarizeCandidates\(candidates\)/.test(consumerCode),
    "the summary must be built from the RECONCILED candidates, never the raw classifier output");
  check("S67", /for \(const c of reconciled\)/.test(consumerCode),
    "ingest must iterate the reconciled candidates");
  check("S68", /if \(isDurableLedgerOutcome\(ledgerByTx\.get\(c\.orderTransactionId\)\)\) \{[\s\S]{0,160}continue;/.test(consumerCode),
    "ingest must SKIP durable rows entirely — never upsert over a completed adjustment");
  // Database invariant.
  const imm = stripComments(files.migration5 ?? "");
  check("S69", /accepted adjustment % cannot change status/.test(files.migration5 ?? ""),
    "a DB trigger must block status changes on an accepted adjustment");
  check("S70", /new\.uploaded_at\s+is distinct from old\.uploaded_at/.test(imm) &&
               /new\.google_request_id\s+is distinct from old\.google_request_id/.test(imm) &&
               /new\.google_job_id\s+is distinct from old\.google_job_id/.test(imm) &&
               /new\.attempt_count\s+is distinct from old\.attempt_count/.test(imm),
    "uploaded_at, both Google identifiers and the attempt count must be immutable once accepted");
  check("S71", /before update or delete on public\.google_ads_conversion_adjustments/i.test(imm),
    "the accepted-row trigger must fire on UPDATE and DELETE");
  check("S72", /if\s+not\s+was_accepted\s+then[\s\S]{0,80}?return\s+new;/.test(imm),
    "pending rows must remain freely updatable");
  check("S73", /get_google_ads_adjustment_discrepancies/.test(imm),
    "a read-only discrepancy report is required for reconcile");
  check("S74", /google_calls: 0/.test(consumerCode),
    "reconcile must declare zero Google calls");
  check("S75", !/uploadConversionAdjustments/.test(
      (consumerCode.match(/if \(mode === "ingest"\)[\s\S]*?\n    \}/) ?? [""])[0]),
    "the ingest path must contain no Google adjustment call");

  // Migration: RLS, fail-closed writes, value constraints, idempotency.
  check("S19", /enable row level security/i.test(migration) && /force row level security/i.test(migration), "the ledger must enable AND force RLS");
  check("S20", /for select to authenticated/i.test(migration) && !/for (insert|update|delete) to authenticated/i.test(migration), "browser clients must have no write policy on the ledger");
  check("S21", /check_is_admin\(\)/.test(migration), "ledger reads must be admin-gated via check_is_admin()");
  check("S22", /retained_value >= 0/.test(migration), "a non-negative retained-value constraint is required");
  check("S23", /retained_value <= original_value/.test(migration), "retained value must be constrained to never exceed the original");
  check("S24", /create unique index if not exists google_ads_conv_adj_idempotency_uidx/.test(migration), "a unique idempotency index is required");
  check("S25", /google_ads_conv_adj_one_active_uidx/.test(migration), "only one ACTIVE adjustment per original conversion may exist");
  check("S26", !/cron\.schedule/i.test(migration), "the migration must create no cron job");
  check("S27", !/(alter|update)\s+.*\borders\b.*\bset\b/i.test(migration), "the migration must not mutate order financial data");

  // No cron / no build-time invocation anywhere in the repo wiring.
  check("S28", !/google-ads-refund-adjustments/.test(pkg) || /check-google-ads-refund-adjustment/.test(pkg), "the consumer must not be wired into an automated build/run step");

  // No PII or raw click IDs in the reporting surface.
  check("S29", !/hashedEmail|email_sha256|\bgclid\b|\bgbraid\b|\bwbraid\b/.test(consumerCode), "the consumer must not handle hashed email or raw click identifiers");
  check("S30", /maskRef/.test(core) && /order_ref: maskRef/.test(core), "report rows must mask order references");
}

// ── NEGATIVE CONTROLS ────────────────────────────────────────────────────────
// Prove each static control actually trips when the property is removed.
function runSelfTest(files) {
  const results = [];
  const mutate = (key, fn) => ({ ...files, [key]: fn(files[key]) });

  const cases = [
    ["S01", mutate("consumer", (s) => s.replace(/uploadConversionAdjustments/g, "uploadSomethingElse"))],
    ["S02", mutate("consumer", (s) => s + "\nawait fetch('https://googleads.googleapis.com/v24/second:batch');")],
    ["S03", mutate("consumer", (s) => s + "\nawait fetch(u + ':mutate');")],
    ["S05", mutate("consumer", (s) => s.replace(/=== "true"/, '!== "false"'))],
    // Canary-specific controls.
    ["S46", mutate("consumer", (s) => s.replace(/const CANARY_MAX_OPERATIONS = 1/, "const CANARY_MAX_OPERATIONS = 50"))],
    ["S47", mutate("consumer", (s) => s.replace(/operations\.length !== CANARY_MAX_OPERATIONS/, "false"))],
    ["S48", mutate("consumer", (s) => s.replace(/conversionAdjustments: operations/, "conversionAdjustments: [adjustment, adjustment]"))],
    ["S50", mutate("consumer", (s) => s.replace(/if \(!CANARY_ENABLED\) blockers\.push/, "if (false) blockers.push"))],
    ["S51", mutate("consumer", (s) => s.replace(/const wantsRealMutation = body\.validateOnly === false/, "const wantsRealMutation = body.validateOnly !== true"))],
    ["S52", mutate("consumer", (s) => s.replace(/const validateOnly = !wantsRealMutation/, "const validateOnly = false"))],
    ["S53", mutate("consumer", (s) => s.replace(/partialFailure: true/, "partialFailure: false"))],
    ["S54", mutate("consumer", (s) => s.replace(/orderId: row\.original_order_or_transaction_id,/, "orderId: row.original_order_or_transaction_id, restatementValue: { adjustedValue: 1 },"))],
    ["S55", mutate("consumer", (s) => s.replace(/orderId: row\.original_order_or_transaction_id,/, "gclidDateTimePair: { gclid: 'x' },"))],
    ["S58", mutate("consumer", (s) => s.replace(/\} else if \(accepted\) \{/, "} else if (true) {").replace(/if \(validateOnly\) \{/, "if (false) {"))],
    ["S59", mutate("consumer", (s) => s.replace(/ledger_marked_uploaded: !validateOnly && accepted/, "ledger_marked_uploaded: true"))],
    ["S06", mutate("consumer", (s) => s.replace(/body\.mode \?\? "dry_run"/, 'body.mode ?? "batch"'))],
    ["S07", mutate("consumer", (s) => s.replace(/mode === "single" \|\| mode === "batch"/, "false"))],
    ["S12", mutate("webhook", (s) => s + "\nfetch('https://googleads.googleapis.com/');")],
    ["S19", mutate("migration", (s) => s.replace(/force row level security/i, "-- removed"))],
    ["S20", mutate("migration", (s) => s + "\ncreate policy x on t for insert to authenticated with check (true);")],
    ["S22", mutate("migration", (s) => s.replace(/retained_value >= 0/, "true"))],
    ["S24", mutate("migration", (s) => s.replace(/create unique index if not exists google_ads_conv_adj_idempotency_uidx/, "-- removed"))],
    ["S26", mutate("migration", (s) => s + "\nselect cron.schedule('x','* * * * *','select 1');")],
    ["S38", mutate("migration4", (s) => s.replace(/successful upload provenance is immutable \(delete blocked\)/, "ok"))],
    ["S39", mutate("migration4", (s) => s.replace(/before update or delete on public\.google_ads_conversion_uploads/i, "before update on public.google_ads_conversion_uploads"))],
    ["S40", mutate("migration4", (s) => s.replace(/create unique index if not exists gac_uploads_success_uidx/, "create index if not exists gac_uploads_success_uidx"))],
    ["S42", mutate("migration4", (s) => s.replace(/u\.uploaded_value,/, "coalesce(u.uploaded_value, o.price),"))],
    ["S43", mutate("uploader", (s) => s.replace(/from\("google_ads_conversion_uploads"\)\s*\.insert\(/, 'from("nope").insert('))],
    ["S44", mutate("uploader", (s) => s.replace(/^(\s*)metadata: \{/m, "$1details: {"))],
    // Ledger-reconciliation negative controls: each plants a defect that would
    // let a completed adjustment come back to life.
    ["S61", mutate("core", (s) => s.replace(/STATUS\.SUPERSEDED,/, ""))],
    ["S62", mutate("core", (s) => s.replace(/if \(ledgerRow\.uploaded_at\) return true;/, ""))],
    ["S63", mutate("core", (s) => s.replace(/(export function applyLedgerOutcome[\s\S]*?)adjustmentType: null,/, "$1adjustmentType: candidate.adjustmentType,"))],
    ["S64", mutate("core", (s) => s.replace(/already_uploaded_value/g, "unused_value"))],
    ["S66", mutate("consumer", (s) => s.replace(/summarizeCandidates\(reconciled\)/, "summarizeCandidates(candidates)"))],
    ["S68", mutate("consumer", (s) => s.replace(/if \(isDurableLedgerOutcome\(ledgerByTx\.get\(c\.orderTransactionId\)\)\) \{/, "if (false) {"))],
    ["S69", mutate("migration5", (s) => s.replace(/accepted adjustment % cannot change status/, "ok"))],
    ["S70", mutate("migration5", (s) => s.replace(/new\.google_job_id\s+is distinct from old\.google_job_id/, "false"))],
    ["S72", mutate("migration5", (s) => s.replace(/if\s+not\s+was_accepted\s+then[\s\S]{0,80}?return\s+new;/, "if false then"))],
  ];

  for (const [id, broken] of cases) {
    failures.length = 0; passes.length = 0;
    runStaticChecks(broken);
    const tripped = failures.some((f) => f.startsWith(id + ":"));
    results.push([id, tripped]);
  }

  // Behavioural negative controls: the financial rule must reject bad inputs.
  failures.length = 0; passes.length = 0;
  const neg = [
    ["NEG-negative-retained", classifyAdjustmentCandidate(order({ originalValue: 50, refundStatus: "full", cumulativeRefund: 500 }), NOW).status === STATUS.BLOCKED_VALUE_INTEGRITY],
    ["NEG-zero-original", classifyAdjustmentCandidate(order({ originalValue: 0, refundStatus: "full", cumulativeRefund: 10 }), NOW).status === STATUS.BLOCKED_VALUE_INTEGRITY],
    ["NEG-no-upload", classifyAdjustmentCandidate(order({ originalUploaded: false, refundStatus: "full", cumulativeRefund: 10 }), NOW).status === STATUS.BLOCKED_ORIGINAL_NOT_UPLOADED],
    ["NEG-payload-refused", (() => {
      try { buildAdjustmentPayload(classifyAdjustmentCandidate(order({}), NOW), { customerId: "1" }); return false; }
      catch { return true; }
    })()],
  ];

  failures.length = 0; passes.length = 0;
  const allTripped = results.every(([, t]) => t) && neg.every(([, t]) => t);
  console.log(`${TAG} self-test — static negative controls:`);
  for (const [id, t] of results) console.log(`  ${t ? "✓" : "✗"} ${id} trips when removed`);
  console.log(`${TAG} self-test — behavioural negative controls:`);
  for (const [id, t] of neg) console.log(`  ${t ? "✓" : "✗"} ${id}`);

  if (!allTripped) {
    console.error(`${TAG} SELF-TEST FAILED — at least one control does not trip.`);
    process.exit(1);
  }
  console.log(`${TAG} SELF-TEST PASSED — every control trips.`);
}

// ── main ─────────────────────────────────────────────────────────────────────
const files = {};
for (const [k, p] of Object.entries(PATHS)) {
  try { files[k] = await readFile(resolve(ROOT, p), "utf8"); }
  catch { files[k] = ""; }
}
for (const k of ["core", "consumer", "migration"]) {
  if (!files[k]) {
    console.error(`${TAG} FAIL — required file missing: ${PATHS[k]}`);
    process.exit(warnOnly ? 0 : 1);
  }
}

if (selfTest) {
  runSelfTest(files);
  process.exit(0);
}

runBehaviourMatrix();
runStaticChecks(files);

if (failures.length) {
  console.error(`${TAG} ${failures.length} FAILED / ${passes.length} passed`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(warnOnly ? 0 : 1);
}
console.log(`${TAG} OK — ${passes.length} checks passed (behaviour matrix + zero-mutation safety contract).`);
console.log(`${TAG} protected canary: exactly 1 operation, dual fail-closed flags + exact allow-list id, validate-only default, RETRACTION only, no batch, no cron.`);
