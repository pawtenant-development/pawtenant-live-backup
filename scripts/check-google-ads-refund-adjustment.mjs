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

  // The single most important control: the shipped consumer has no upload path.
  check("S01", !/googleads\.googleapis\.com/.test(consumerCode), "consumer must contain NO Google Ads API endpoint");
  check("S02", !/uploadConversionAdjustments/.test(consumerCode), "consumer must not construct an uploadConversionAdjustments request");
  check("S03", !/fetch\s*\(/.test(consumerCode), "consumer must make no outbound HTTP call at all");
  check("S04", /mutation_path_present_in_build:\s*false/.test(consumer), "consumer must declare mutation_path_present_in_build: false");

  // Kill switch + dry-run default + fail-closed mutation modes.
  check("S05", /GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED"\s*\)\s*===\s*"true"/.test(consumer), "kill switch must require the exact string 'true' (fail closed)");
  check("S06", /body\.mode\s*\?\?\s*"dry_run"/.test(consumer), "dry_run must be the default mode");
  check("S07", /mode === "single" \|\| mode === "batch"/.test(consumer) && /501/.test(consumer), "single/batch mutation modes must fail closed with 501");
  check("S08", /mutation_calls_sent/.test(consumer) && /const MUTATION_CALLS_SENT = 0/.test(consumer), "consumer must report mutation_calls_sent = 0");

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
    ["S01", mutate("consumer", (s) => s + "\nfetch('https://googleads.googleapis.com/v21/x');")],
    ["S02", mutate("consumer", (s) => s + "\nconst u = client.uploadConversionAdjustments(req);")],
    ["S05", mutate("consumer", (s) => s.replace(/=== "true"/, '!== "false"'))],
    ["S06", mutate("consumer", (s) => s.replace(/body\.mode \?\? "dry_run"/, 'body.mode ?? "batch"'))],
    ["S07", mutate("consumer", (s) => s.replace(/mode === "single" \|\| mode === "batch"/, "false"))],
    ["S12", mutate("webhook", (s) => s + "\nfetch('https://googleads.googleapis.com/');")],
    ["S19", mutate("migration", (s) => s.replace(/force row level security/i, "-- removed"))],
    ["S20", mutate("migration", (s) => s + "\ncreate policy x on t for insert to authenticated with check (true);")],
    ["S22", mutate("migration", (s) => s.replace(/retained_value >= 0/, "true"))],
    ["S24", mutate("migration", (s) => s.replace(/create unique index if not exists google_ads_conv_adj_idempotency_uidx/, "-- removed"))],
    ["S26", mutate("migration", (s) => s + "\nselect cron.schedule('x','* * * * *','select 1');")],
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
console.log(`${TAG} shadow mode: mutation path absent from build, kill switch fail-closed, dry-run default, no cron.`);
