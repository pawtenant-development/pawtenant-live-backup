// scripts/check-google-ads-primary-channel-gate.mjs
//
// GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001 — release-safety guard.
//
// WHY THIS EXISTS (verified incident):
// "Pawtenant Backend Purchase (API)" (conversion action 7567366496) is the
// PRIMARY conversion action and drives BIDDING. The uploader's eligibility used
// to be "paid order with any usable identifier", so getUploadMethod() returned
// "hashed_email_only" for organic / direct / referral / AI-referral / social
// purchases and uploaded them to the Primary action via Enhanced Conversions for
// Leads. Confirmed contamination: >=48 non-Google purchases in July 2026 and
// >=16 in August 2026.
//
// WHAT IT PROVES
//   A. BEHAVIOUR — the real channelGate.ts module is bundled with esbuild and
//      EXECUTED against the owner's full decision matrix. Not a text scan.
//   B. WIRING    — the gate is actually USED, in every mode, and always BEFORE
//      email hashing, the OAuth token request, payload construction and any
//      Google API call.
//   C. NO BYPASS — retry_failed / single / retry_gclid_upgraded / test_upload
//      cannot route around it, and forceUpload does not disable it.
//   D. NO STATE  — an excluded order never gets google_ads_uploaded_at (so it can
//      never become a refund-adjustment candidate) and never moves the
//      "last sync" clock.
//   E. NO REPEAT — the skip statuses are excluded from the backfill selection and
//      from the admin "pending Google conversions" count.
//   F. PRIVACY   — the gate never returns or logs a click id, an email, a hash,
//      a URL or PHI.
//
// Usage:
//   node scripts/check-google-ads-primary-channel-gate.mjs             → guard (exit 1 on fail)
//   node scripts/check-google-ads-primary-channel-gate.mjs --warn-only → audit (exit 0)
//   node scripts/check-google-ads-primary-channel-gate.mjs --self-test → prove the controls trip
//
// LIVE ADAPTATION (GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001-LIVE-PROMOTION):
// LIVE's uploader has no lib.ts / refund-adjustment consumer (TEST-only work), so
// channelGate.ts inlines cleanClickId, processOrder is bounded by serve() rather
// than processRefundAdjustment, the refund-path assertion is conditional on that
// function existing, and the shared select list ends at google_tag_fired (LIVE's
// processOrder has no is_test fixture bypass — fixtures go through the gate too).

import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

// PT_GUARD_ROOT lets a SIBLING guard point this one at a temp copy of the tree, so
// its planted negative controls can prove that THIS guard still catches a
// channel-gate regression (check-google-ads-invocation-auth N14/N15). Without it a
// cross-guard control would silently re-check the real, clean repo and "pass".
const ROOT = process.env.PT_GUARD_ROOT
  ? resolve(process.env.PT_GUARD_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const GATE      = "supabase/functions/sync-google-ads-conversions/channelGate.ts";
const UPLOADER  = "supabase/functions/sync-google-ads-conversions/index.ts";
const CLASSIFIER = "src/lib/acquisitionClassifier.ts";
const HEALTH    = "src/pages/admin-orders/components/SyncHealthCards.tsx";
const PANEL     = "src/pages/admin-orders/components/GoogleAdsSyncPanel.tsx";

// ── SINGLE read point. CRLF is normalised HERE and nowhere else, so a planted
//    negative control written with LF endings can never "pass" a CRLF file. ──
function read(root, rel) {
  return readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

/**
 * Strip comments AND string/template literals. A guard must assert the USE of a
 * symbol, never its mention in a comment or an error message.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

const failures = [];
let checks = 0;
function ok(cond, label) {
  checks++;
  if (!cond) failures.push(label);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bundle + execute the REAL gate module.
// ─────────────────────────────────────────────────────────────────────────────
async function loadGate(root) {
  const out = join(mkdtempSync(join(tmpdir(), "pt-gate-")), "gate.mjs");
  await build({
    entryPoints: [join(root, GATE)],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    outfile: out,
    logLevel: "silent",
  });
  return import(pathToFileURL(out).href + `?t=${Date.now()}`);
}

// ── Fixture builders — shaped exactly like real orders.* columns ─────────────
const ft = (o = {}) => ({ captured_at: "2026-07-01T10:00:00.000Z", ...o });
const order = (o = {}) => ({
  gclid: null, gbraid: null, wbraid: null,
  utm_source: null, utm_medium: null,
  first_touch_json: null, last_touch_json: null, attribution_json: null,
  ...o,
});

const GCLID = "Cj0KCQjw_TESTCLICKID";

async function runBehaviour(root) {
  const gate = await loadGate(root);
  const R = (o) => gate.resolveGoogleAdsChannelEligibility(order(o));
  const state = (o) => R(o).state;

  // ── OWNER MATRIX ──────────────────────────────────────────────────────────

  // 1. Google Ads + GCLID → uploads.
  ok(state({
    first_touch_json: ft({ channel: "google_ads", gclid: GCLID, click_provenance: { gclid: "url" }, provenance_version: 1 }),
    gclid: GCLID,
  }) === "eligible", "matrix 1: canonical google_ads + proven gclid must be ELIGIBLE");

  // 2. Google Ads + hashed email but NO gclid → still eligible (ECL preserved).
  const ecl = R({
    first_touch_json: ft({ channel: "google_ads", utm_source: "google", utm_medium: "cpc" }),
  });
  ok(ecl.state === "eligible", "matrix 2: canonical google_ads without a gclid must stay ELIGIBLE (ECL)");
  ok(ecl.reason === "canonical_channel_with_paid_medium", "matrix 2: ECL eligibility must be reasoned on the paid medium");

  // 3. Google tag already fired → the gate is indifferent (backend Primary still uploads).
  ok(state({
    google_tag_fired: true,
    first_touch_json: ft({ channel: "google_ads", gclid: GCLID, click_provenance: { gclid: "url" } }),
  }) === "eligible", "matrix 3: google_tag_fired must not affect the channel gate");

  // 4-6. Every non-Google canonical channel → EXCLUDED, even with an email.
  for (const ch of [
    "organic_search", "direct", "referral", "social_organic", "facebook_ads",
    "chatgpt.com", "claude.ai", "bing", "instagram", "reddit", "tiktok",
    "email", "th", "unknown",
  ]) {
    const r = R({ first_touch_json: ft({ channel: ch }) });
    ok(r.state === "excluded", `matrix 4-6: canonical channel "${ch}" must be EXCLUDED`);
    ok(r.uploadStatus === gate.SKIP_NON_GOOGLE_CHANNEL, `matrix 4-6: "${ch}" must carry skipped_non_google_channel`);
  }

  // 7. utm_source=google + ORGANIC medium → skipped, even though buildChannel()
  //    normalises a bare utm_source=google to the canonical value "google_ads".
  for (const medium of ["organic", "organic_search", "seo", "referral", "", null]) {
    const r = R({ first_touch_json: ft({ channel: "google_ads", utm_source: "google", utm_medium: medium }) });
    ok(r.state === "excluded", `matrix 7: utm_source=google + medium "${medium}" must be EXCLUDED`);
    ok(r.reason === "utm_source_google_without_paid_medium" || r.reason === "google_channel_without_supporting_evidence",
      `matrix 7: utm_source=google + medium "${medium}" must be refused for lack of a paid medium`);
  }

  // 8. utm_source=google + paid medium, NO canonical channel → eligible fallback.
  for (const medium of ["cpc", "ppc", "paid", "paid_search", "paid-search", "sem", "search_ad"]) {
    const r = R({ first_touch_json: ft({ utm_source: "google", utm_medium: medium }) });
    ok(r.state === "eligible", `matrix 8: no channel + utm_source=google + "${medium}" must be ELIGIBLE`);
    ok(r.reason === "first_touch_google_paid_medium", `matrix 8: "${medium}" must be reasoned as the paid-medium fallback`);
  }

  // 9. Canonical organic + stale GCLID → CONFLICT, never an upload.
  const stale = R({
    first_touch_json: ft({ channel: "organic_search" }),
    gclid: GCLID, // restored into the flat column by a later upsert
  });
  ok(stale.state === "conflict", "matrix 9: canonical organic + stale flat gclid must be a CONFLICT");
  ok(stale.uploadStatus === gate.SKIP_ATTRIBUTION_CONFLICT, "matrix 9: conflict must carry skipped_attribution_conflict");
  ok(stale.eligible === false, "matrix 9: a conflict must never be eligible");

  // 9b. Storage-restored id INSIDE the first touch, channel says google_ads →
  //     unproven provenance is not proof; conflict, never an upload.
  ok(state({
    first_touch_json: ft({ channel: "google_ads", gclid: GCLID, click_provenance: { gclid: "storage" }, provenance_version: 1 }),
  }) === "conflict", "matrix 9b: google_ads channel with STORAGE-provenance gclid must be a CONFLICT");

  // 10. Canonical Google Ads + later organic visit → still eligible (first touch wins).
  ok(state({
    first_touch_json: ft({ channel: "google_ads", gclid: GCLID, click_provenance: { gclid: "url" } }),
    last_touch_json: { channel: "direct", captured_at: "2026-07-02T10:00:00.000Z" },
    attribution_json: { channel: "organic_search" },
  }) === "eligible", "matrix 10: a later organic touch must not revoke first-touch Google eligibility");

  // ── A LATER-TOUCH GOOGLE SIGNAL MUST NEVER GRANT ELIGIBILITY ──────────────
  ok(state({
    first_touch_json: ft({ channel: "organic_search" }),
    attribution_json: { channel: "google_ads" },
  }) === "excluded", "later-touch google_ads must NOT override an organic first touch");
  ok(state({
    first_touch_json: ft({ channel: "direct" }),
    last_touch_json: { channel: "google_ads", gclid: GCLID, click_provenance: { gclid: "url" } },
  }) === "conflict", "a proven later-touch gclid must not upload an order whose first touch is direct");

  // ── Hashed email availability must never be a substitute for attribution ──
  ok(state({ first_touch_json: ft({ channel: "direct" }), email_sha256: "deadbeef" }) === "excluded",
    "hashed email availability must not grant eligibility");

  // ── Macro / placeholder click ids are not evidence ────────────────────────
  for (const macro of ["{gclid}", "%7Bgclid%7D", "[gbraid]", "gclid", "   "]) {
    ok(state({ first_touch_json: ft({}), gclid: macro }) === "excluded",
      `macro/placeholder click id "${macro}" must not grant eligibility`);
  }

  // ── gbraid / wbraid are first-class Google paid click ids ────────────────
  ok(state({ first_touch_json: ft({ gbraid: "AbCd1234GX" }) }) === "eligible", "first-touch gbraid must be ELIGIBLE");
  ok(state({ first_touch_json: ft({ wbraid: "AbCd1234WX" }) }) === "eligible", "first-touch wbraid must be ELIGIBLE");

  // ── The embedded first touch (attribution_json.first_touch) counts as the
  //    canonical snapshot when the column is absent ─────────────────────────
  ok(state({ attribution_json: { channel: "direct", first_touch: ft({ channel: "organic_search" }) } }) === "excluded",
    "attribution_json.first_touch must be read as the canonical first touch");
  ok(state({ attribution_json: { channel: "direct", first_touch: ft({ channel: "google_ads", gclid: GCLID }) } }) === "eligible",
    "attribution_json.first_touch google_ads + gclid must be ELIGIBLE");

  // ── LEGACY orders (no first touch at all) ────────────────────────────────
  ok(state({ gclid: GCLID }) === "eligible", "legacy order with a flat gclid must be ELIGIBLE");
  ok(state({ utm_source: "google", utm_medium: "cpc" }) === "eligible", "legacy utm_source=google + cpc must be ELIGIBLE");
  ok(state({ utm_source: "google", utm_medium: "organic" }) === "excluded", "legacy utm_source=google + organic must be EXCLUDED");
  ok(state({}) === "excluded", "legacy order with no attribution evidence at all must be EXCLUDED");
  ok(state({ attribution_json: { channel: "organic_search" }, gclid: GCLID }) === "conflict",
    "legacy order with an organic canonical channel + a flat gclid must be a CONFLICT");
  ok(state({ attribution_json: { channel: "google_ads" } }) === "excluded",
    "legacy order whose ONLY evidence is a last-touch google_ads channel must be EXCLUDED (fail closed)");

  // ── An empty first_touch_json object must not read as "has a first touch" ─
  ok(state({ first_touch_json: {}, gclid: GCLID }) === "eligible",
    "an empty first_touch_json must fall back to the legacy flat-column path");

  // ── Null-safety: the predicate must never throw ───────────────────────────
  for (const bad of [
    { first_touch_json: "not-an-object" }, { attribution_json: [] },
    { first_touch_json: { channel: 42 } }, { gclid: 12345 },
    { first_touch_json: { channel: "google_ads", click_provenance: "nope", gclid: GCLID } },
  ]) {
    let threw = false;
    try { R(bad); } catch { threw = true; }
    ok(!threw, `the predicate must not throw on malformed input ${JSON.stringify(bad)}`);
  }

  // ── PRIVACY: the result must never carry an identifier value ─────────────
  const priv = R({
    first_touch_json: ft({ channel: "organic_search", gclid: GCLID, referrer: "https://example.com/x", landing_url: "https://pawtenant.com/y" }),
    gclid: GCLID,
    email: "person@example.com",
  });
  const serialized = JSON.stringify(priv);
  ok(!serialized.includes(GCLID), "PRIVACY: the gate result must never contain a click id value");
  ok(!serialized.includes("person@example.com"), "PRIVACY: the gate result must never contain an email");
  ok(!serialized.includes("example.com"), "PRIVACY: the gate result must never contain a referrer/landing URL");

  // ── Paid-medium list integrity ───────────────────────────────────────────
  const paid = gate.GOOGLE_PAID_MEDIUM_TOKENS;
  for (const t of ["cpc", "ppc", "paid", "paid_search", "search_ad"]) {
    ok(paid.includes(t), `the owner-specified paid medium "${t}" must be accepted`);
  }
  for (const t of ["organic", "organic_search", "seo", "referral", "none", "email", "social", "paid_social", "paidsocial"]) {
    ok(!paid.includes(t), `"${t}" must NEVER count as a Google paid medium`);
  }
  // Every token must exist in the canonical classifier's PAID_MEDIUM_TOKENS or
  // be one the owner named explicitly — the list can never silently widen.
  const OWNER_TOKENS = new Set(["cpc", "ppc", "paid", "paid_search", "search_ad", "searchad", "search-ad"]);
  const canonicalPaid = read(root, CLASSIFIER).match(/const PAID_MEDIUM_TOKENS = new Set\(\[([\s\S]*?)\]\)/);
  ok(!!canonicalPaid, "the canonical PAID_MEDIUM_TOKENS set must be findable in acquisitionClassifier.ts");
  const canonicalSet = new Set((canonicalPaid?.[1] ?? "").match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) ?? []);
  for (const t of paid) {
    ok(canonicalSet.has(t) || OWNER_TOKENS.has(t),
      `paid medium "${t}" is neither canonical nor owner-specified — the gate's medium list must not widen`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural wiring — the gate must actually be USED.
// ─────────────────────────────────────────────────────────────────────────────
function runWiring(root) {
  const rawUploader = read(root, UPLOADER);
  const src = code(rawUploader);

  ok(/import\s*\{[\s\S]*?resolveGoogleAdsChannelEligibility[\s\S]*?\}\s*from\s*/.test(src) &&
     rawUploader.includes('from "./channelGate.ts"'),
    "the uploader must import resolveGoogleAdsChannelEligibility from ./channelGate.ts");

  // ── processOrder: the gate must run before ANY identifier / hash / API work ──
  const poStart = src.indexOf("async function processOrder(");
  ok(poStart > 0, "processOrder must exist");
  // LIVE has no processRefundAdjustment: bound processOrder by the next top-level
  // function or the serve() handler, whichever comes first after it.
  const poEndCandidates = [src.indexOf("async function processRefundAdjustment("), src.indexOf("serve(async (req)")].filter((i) => i > poStart);
  const poEnd = poEndCandidates.length ? Math.min(...poEndCandidates) : -1;
  const po = src.slice(poStart, poEnd > poStart ? poEnd : undefined);

  const gateAt = po.indexOf("resolveGoogleAdsChannelEligibility(");
  ok(gateAt > 0, "processOrder must call the channel gate");
  ok(/if\s*\(\s*!\s*channelGate\.eligible\s*\)/.test(po),
    "processOrder must return early when the gate says NOT eligible (an inverted or missing test fails here)");

  for (const [needle, label] of [
    ["sha256Hex(", "email hashing"],
    ["uploadConversionToGoogleAds(", "the Google Ads API call"],
    ["resolveGclid(", "click-id resolution"],
    ["buildClickConversion", "payload construction"],
    ["resolveConversionValue(", "conversion-value resolution"],
  ]) {
    const at = po.indexOf(needle);
    if (at >= 0) ok(gateAt < at, `processOrder must run the channel gate BEFORE ${label}`);
    else checks++;
  }

  // ── serve(): every order-selecting mode gates BEFORE the OAuth token ────────
  const serveAt = src.indexOf("serve(async (req)");
  ok(serveAt > 0, "the serve handler must exist");
  const serve = src.slice(serveAt);

  // Mode anchors come from the RAW source: code() collapses every string literal
  // to "", so `mode === "single"` is indistinguishable from any other after
  // stripping. The anchors below are executable statements, not comments.
  const rawServe = rawUploader.slice(rawUploader.indexOf("serve(async (req)"));

  ok(!/(const|let)\s+\w*[Tt]oken\w*\s*=\s*await\s+getAccessToken\(\)[\s\S]{0,600}?if \(mode === "single"/.test(rawServe),
    "the OAuth token must not be fetched eagerly ahead of the mode branches");

  const modeBlocks = [
    ["single", 'if (mode === "single" && body.confirmationId) {'],
    ["retry_failed", 'if (mode === "retry_failed") {'],
    ["retry_gclid_upgraded", 'if (mode === "retry_gclid_upgraded") {'],
  ];
  for (const [name, anchor] of modeBlocks) {
    const at = rawServe.indexOf(anchor);
    ok(at > 0, `mode "${name}" must exist`);
    if (at <= 0) continue;
    const block = rawServe.slice(at, at + 3000);
    const gateIdx = block.indexOf("partitionByChannelGate(");
    const tokenIdx = block.indexOf("ensureAccessToken(");
    ok(gateIdx > 0, `mode "${name}" must call partitionByChannelGate`);
    ok(tokenIdx > 0, `mode "${name}" must acquire its token through ensureAccessToken`);
    ok(gateIdx > 0 && tokenIdx > 0 && gateIdx < tokenIdx,
      `mode "${name}" must run the channel gate BEFORE requesting a Google token`);
  }

  // backfill (the default path, and the cron path)
  const bfAt = serve.indexOf("const bfSourceSystem");
  ok(bfAt > 0, "the backfill block must exist");
  const bf = serve.slice(bfAt);
  const bfGate = bf.indexOf("partitionByChannelGate(");
  const bfToken = bf.indexOf("ensureAccessToken(");
  ok(bfGate > 0 && bfToken > 0 && bfGate < bfToken,
    "backfill must run the channel gate BEFORE requesting a Google token");

  // test_upload builds a real payload → must be gated, before its token too.
  const tuAt = rawServe.indexOf('if (mode === "test_upload") {');
  ok(tuAt > 0, "mode test_upload must exist");
  const tu = rawServe.slice(tuAt, tuAt + 3000);
  const tuGate = tu.indexOf("resolveGoogleAdsChannelEligibility(");
  const tuToken = tu.indexOf("getAccessToken(");
  ok(tuGate > 0, "mode test_upload must apply the channel gate to its sample order");
  ok(tuGate > 0 && tuToken > 0 && tuGate < tuToken,
    "mode test_upload must run the channel gate BEFORE requesting a Google token");

  // ── forceUpload must not be able to disable the gate ──────────────────────
  ok(!/forceUpload[\s\S]{0,120}resolveGoogleAdsChannelEligibility/.test(po) &&
     !/resolveGoogleAdsChannelEligibility[\s\S]{0,80}forceUpload/.test(po),
    "forceUpload must not participate in the channel-gate decision");

  // ── The skip write must not claim an upload or move the sync clock ────────
  const pcAt = src.indexOf("async function persistChannelGateSkip(");
  ok(pcAt > 0, "persistChannelGateSkip must exist");
  const pc = src.slice(pcAt, src.indexOf("function channelGateSkipResult("));
  ok(!pc.includes("google_ads_uploaded_at"),
    "a channel-gate skip must NEVER write google_ads_uploaded_at (that would fake an upload and create a refund-adjustment candidate)");
  ok(!pc.includes("google_ads_last_attempt_at"),
    "a channel-gate skip must NEVER write google_ads_last_attempt_at (no Google request was attempted)");
  ok(pc.includes("google_ads_upload_status"), "a channel-gate skip must record its upload status");

  // ── The refund path stays keyed on a real prior upload ────────────────────
  const raAt = src.indexOf("async function processRefundAdjustment(");
  if (raAt >= 0) {
    const ra = src.slice(raAt, raAt + 2500);
    ok(/if\s*\(\s*!\s*order\.google_ads_uploaded_at\s*\)\s*return\s+skip/.test(ra),
      "processRefundAdjustment must still refuse orders with no prior successful upload");
  } else {
    // LIVE: no adjustment consumer is deployed, so the internal-only mode must not
    // silently fall through into the default backfill either (see invocation guard).
    ok(!rawUploader.includes("apply_refund_adjustments\") {"), "LIVE must not carry a half-ported apply_refund_adjustments handler");
  }

  // ── Selection: the skip statuses must be excluded from the backfill ───────
  // Asserted on the backfill query's OWN .or() argument, not on a mention
  // anywhere in the file — the surrounding comment names both statuses too.
  const rawBfAt = rawUploader.indexOf("let pendingQuery = supabase");
  ok(rawBfAt > 0, "the backfill query must exist");
  const rawBfOr = rawUploader.slice(rawUploader.indexOf(".or(", rawBfAt), rawUploader.indexOf(".order(", rawBfAt));
  ok(rawBfOr.includes("CHANNEL_GATE_SKIP_STATUSES"),
    "the backfill selection's .or() must exclude both channel-gate skip statuses so they are not re-selected forever");
  ok(rawBfOr.includes("google_ads_upload_status.is.null"),
    "the backfill selection must stay NULL-safe (never-attempted orders must remain selectable)");

  // ── One shared select list carrying every gate input ─────────────────────
  const selAt = src.indexOf("const ORDER_SELECT_COLUMNS");
  ok(selAt > 0, "ORDER_SELECT_COLUMNS must exist");
  const selRawAt = rawUploader.indexOf("const ORDER_SELECT_COLUMNS");
  const sel = rawUploader.slice(selRawAt, rawUploader.indexOf(";", rawUploader.indexOf("google_tag_fired", selRawAt)));
  for (const col of ["first_touch_json", "last_touch_json", "utm_source", "utm_medium", "attribution_json", "gclid", "gbraid", "wbraid"]) {
    ok(sel.includes(col), `ORDER_SELECT_COLUMNS must select ${col} — the gate reads it`);
  }
  // No mode may hand-write its own click-conversion column list again.
  const handWritten = rawUploader.match(/\.select\("id, confirmation_id, email, price/g) ?? [];
  ok(handWritten.length === 0,
    "click-conversion modes must select through ORDER_SELECT_COLUMNS, never a hand-written column list");
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin surfaces — skipped orders must not read as "pending".
// ─────────────────────────────────────────────────────────────────────────────
function runAdmin(root) {
  const health = read(root, HEALTH);
  const healthCode = code(health);
  const pgAt = healthCode.indexOf("pendingGoogle");
  ok(pgAt > 0, "SyncHealthCards must compute a pending-Google count");
  // Slice the pendingGoogle QUERY (the two queries sit inside one Promise.all,
  // so the destructured names both appear on the line above them).
  const pgQueryStart = health.indexOf("google_ads_uploaded_at", pgAt);
  const pgBlock = health.slice(pgQueryStart, health.indexOf("meta_capi_sent_at", pgQueryStart));
  ok(pgBlock.includes("skipped_non_google_channel") && pgBlock.includes("skipped_attribution_conflict"),
    "the pending-Google conversions count must exclude both channel-gate skip statuses");
  ok(/\.or\(/.test(pgBlock),
    "the pending-Google exclusion must be NULL-safe (.or with an is.null branch) — a bare .neq drops every never-attempted order");
  ok(pgBlock.includes("google_ads_upload_status.is.null"),
    "the pending-Google exclusion must keep never-attempted (NULL status) orders in the count");

  const panel = read(root, PANEL);
  ok(panel.includes("skipped_non_google_channel") && panel.includes("skipped_attribution_conflict"),
    "GoogleAdsSyncPanel must render both channel-gate skip statuses instead of falling back to 'Pending'");
  ok(/STATUS_STYLE[\s\S]{0,1600}skipped_non_google_channel/.test(panel),
    "GoogleAdsSyncPanel STATUS_STYLE must carry a label for skipped_non_google_channel");
}

// ─────────────────────────────────────────────────────────────────────────────
// Privacy — the gate module must not touch identity fields at all.
// ─────────────────────────────────────────────────────────────────────────────
function runPrivacy(root) {
  const gateCode = code(read(root, GATE));
  for (const forbidden of ["email", "sha256", "phone", "assessment_answers", "first_name", "last_name"]) {
    ok(!gateCode.includes(forbidden),
      `the channel gate must never reference "${forbidden}" — it decides on channel evidence only`);
  }
  const uploaderCode = code(read(root, UPLOADER));
  const skipAt = uploaderCode.indexOf("function channelGateSkipResult(");
  const skipFn = uploaderCode.slice(skipAt, uploaderCode.indexOf("async function partitionByChannelGate("));
  for (const forbidden of ["order.email", "emailSha256", "order.gclid", "order.gbraid", "order.wbraid"]) {
    ok(!skipFn.includes(forbidden),
      `the skip result must never carry ${forbidden}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Negative controls — plant a defect on a TEMP COPY and prove the guard trips.
// Real repo files are never mutated.
// ─────────────────────────────────────────────────────────────────────────────
const CONTROLS = [
  {
    name: "C1 — gate call removed from processOrder",
    file: UPLOADER,
    apply: (s) => s.split("const channelGate = resolveGoogleAdsChannelEligibility(order);").join("const channelGate = { eligible: true, state: \"eligible\", uploadStatus: null, reason: \"\", channel: \"\", channelSource: \"none\", signals: {} };"),
  },
  {
    name: "C2 — gate inverted (uploads exactly the excluded orders)",
    file: UPLOADER,
    apply: (s) => s.split("if (!channelGate.eligible) {").join("if (channelGate.eligible) {"),
  },
  {
    name: "C3 — gate moved AFTER the email is hashed",
    file: UPLOADER,
    apply: (s) => s
      .replace("  const channelGate = resolveGoogleAdsChannelEligibility(order);", "  const channelGateMoved = true;")
      .replace("  let emailSha256 = order.email_sha256 || null;",
        "  const channelGate = resolveGoogleAdsChannelEligibility(order);\n  if (!channelGate.eligible) { await persistChannelGateSkip(order, channelGate, supabase, dryRun); return channelGateSkipResult(order, channelGate); }\n  let emailSha256 = order.email_sha256 || null;"),
  },
  {
    name: "C4 — paid-medium list widened with an organic medium",
    file: GATE,
    apply: (s) => s.replace('  "cpc",\n', '  "cpc",\n  "organic",\n'),
  },
  {
    name: "C5 — non-Google canonical channel allowed through",
    file: GATE,
    apply: (s) => s.replace(
      "    if (ftChannel !== GOOGLE_ADS_CANONICAL_CHANNEL) {",
      "    if (false && ftChannel !== GOOGLE_ADS_CANONICAL_CHANNEL) {"),
  },
  {
    name: "C6 — backfill stops partitioning by the gate",
    file: UPLOADER,
    apply: (s) => s.replace(
      "    const backfillGate = await partitionByChannelGate(pendingOrders as OrderRow[], supabase, dryRun);",
      "    const backfillGate = { eligible: pendingOrders as OrderRow[], skipped: [] };"),
  },
  {
    name: "C7 — eager OAuth token restored ahead of the mode branches",
    file: UPLOADER,
    apply: (s) => s.replace(
      "    // ── Single order ",
      "    const tokenResult = await getAccessToken();\n    if (!tokenResult.token) return json({ ok: false, error: \"OAuth failed\" }, 500);\n\n    // ── Single order "),
  },
  {
    name: "C8 — skip statuses dropped from the backfill exclusion",
    file: UPLOADER,
    apply: (s) => s.replace(
      "${CHANNEL_GATE_SKIP_STATUSES.map((s) => `google_ads_upload_status.neq.${s}`).join(\",\")}",
      "google_ads_upload_status.neq.skip_historical"),
  },
  {
    name: "C9 — a skip fakes an upload timestamp",
    file: UPLOADER,
    apply: (s) => s.replace(
      "    google_ads_upload_status: gate.uploadStatus,\n    google_ads_upload_error: gate.reason,",
      "    google_ads_uploaded_at: new Date().toISOString(),\n    google_ads_upload_status: gate.uploadStatus,\n    google_ads_upload_error: gate.reason,"),
  },
  {
    name: "C10 — pending count stops excluding the skip statuses",
    file: HEALTH,
    apply: (s) => s.replace(
      /\.or\(\[[\s\S]*?\]\.join\(","\)\),/,
      '.neq("google_ads_upload_status", "skipped_website_tag"),'),
  },
  {
    name: "C11 — a later-touch google_ads channel grants eligibility",
    file: GATE,
    apply: (s) => s.replace(
      "  const { snapshot: ft, source: ftSource } = resolveFirstTouch(order);",
      "  const { snapshot: ftRaw, source: ftSource } = resolveFirstTouch(order);\n  const ft = normalize(asObject(order.attribution_json)?.channel) === GOOGLE_ADS_CANONICAL_CHANNEL ? { channel: GOOGLE_ADS_CANONICAL_CHANNEL, utm_source: \"google\", utm_medium: \"cpc\" } : ftRaw;"),
  },
  {
    name: "C12 — first_touch_json dropped from the shared select list",
    file: UPLOADER,
    apply: (s) => s.replace('"attribution_json, first_touch_json, last_touch_json, utm_source, utm_medium, " +', '"attribution_json, utm_source, utm_medium, " +'),
  },
  {
    name: "C13 — retry_failed skips the gate (forceUpload bypass)",
    file: UPLOADER,
    apply: (s) => s.replace(
      "      const retryGate = await partitionByChannelGate(failedOrders as OrderRow[], supabase, dryRun);",
      "      const retryGate = { eligible: failedOrders as OrderRow[], skipped: [] };"),
  },
  {
    name: "C14 — an unproven storage click id counts as proof",
    file: GATE,
    apply: (s) => s.replace("  return normalize(map[field]) === \"url\";", "  return true;"),
  },
];

async function selfTest() {
  const results = [];
  for (const ctl of CONTROLS) {
    const dir = mkdtempSync(join(tmpdir(), "pt-gate-ctl-"));
    let detected = false;
    let planted = false;
    try {
      cpSync(join(ROOT, "supabase"), join(dir, "supabase"), { recursive: true });
      cpSync(join(ROOT, "src"), join(dir, "src"), { recursive: true });
      const target = join(dir, ctl.file);
      const before = readFileSync(target, "utf8").replace(/\r\n/g, "\n");
      const after = ctl.apply(before);
      planted = after !== before;
      writeFileSync(target, after, "utf8");

      failures.length = 0;
      await runBehaviour(dir).catch(() => failures.push("behaviour threw"));
      try { runWiring(dir); } catch { failures.push("wiring threw"); }
      try { runAdmin(dir); } catch { failures.push("admin threw"); }
      try { runPrivacy(dir); } catch { failures.push("privacy threw"); }
      detected = failures.length > 0;
    } catch (err) {
      detected = true;
      failures.push(`control harness error: ${err?.message ?? err}`);
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    results.push({ name: ctl.name, planted, detected, sample: failures.slice(0, 2) });
  }

  let allOk = true;
  for (const r of results) {
    const bad = !r.planted || !r.detected;
    if (bad) allOk = false;
    const mark = !r.planted ? "NO-OP (plant did not apply)" : r.detected ? "detected" : "*** NOT DETECTED ***";
    console.log(`  ${bad ? "FAIL" : "ok  "}  ${r.name} — ${mark}`);
    if (r.detected && r.sample.length) console.log(`          e.g. ${r.sample[0]}`);
  }
  console.log(`\n${results.filter((r) => r.planted && r.detected).length}/${results.length} planted negative controls detected.`);
  // process.exitCode, never process.exit() — the temp dirs above must finish cleanup.
  process.exitCode = allOk ? 0 : 1;
}

async function main() {
  if (SELF) { await selfTest(); return; }

  await runBehaviour(ROOT);
  runWiring(ROOT);
  runAdmin(ROOT);
  runPrivacy(ROOT);

  if (failures.length === 0) {
    console.log(`Google Ads Primary purchase channel gate: ${checks} checks passed.`);
    return;
  }
  console.log(`Google Ads Primary purchase channel gate: ${failures.length} of ${checks} checks FAILED:\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (!WARN) process.exitCode = 1;
}

main().catch((err) => {
  console.error("check-google-ads-primary-channel-gate crashed:", err);
  process.exitCode = WARN ? 0 : 1;
});
