#!/usr/bin/env node
// ORDER-ENTITLEMENT-AND-DOCUMENT-VERSIONING-FOUNDATION-001 — integrity guard.
//
// Static guard over the foundation migrations, the provider submission path and
// the checkout copy. Proves the invariants the Additional Pet Upgrade will
// later depend on, and proves the customer-facing upgrade has NOT shipped yet.
//
// Run:  node scripts/check-entitlement-document-versioning.mjs
// Self-test (planted defects must all be caught):
//       node scripts/check-entitlement-document-versioning.mjs --self-test

import { readFile } from "node:fs/promises";

const ENT = "supabase/migrations/20260727120000_order_entitlement_snapshots.sql";
const DOC = "supabase/migrations/20260727130000_order_document_versions.sql";
const SUBMIT = "supabase/functions/provider-submit-letter/index.ts";
const STEP2 = "src/pages/assessment/components/Step2PersonalInfo.tsx";
// ORDER-ENTITLEMENT-DOCUMENT-FOUNDATION-CLOSURE-001 §17
const ADMIN_PANEL = "src/pages/admin-orders/components/OrderDocumentVersionsPanel.tsx";
const PORTAL_PANEL = "src/pages/my-orders/components/MyDocumentVersionHistory.tsx";
const PORTAL_CARD = "src/pages/my-orders/components/MyDocumentsCard.tsx";
// DOCUMENT-REVISION-ID-AND-CUSTOMER-QA-CLOSURE-001 §20
const SUPPRESS = "supabase/functions/_shared/testNotificationSuppression.ts";
const REVISION_MIG = "supabase/migrations/20260727140000_ensure_revision_verification_id.sql";

const failures = [];
const fail = (f, m) => failures.push(`${f}: ${m}`);

async function read(p) {
  try { return await readFile(new URL(`../${p}`, import.meta.url), "utf8"); }
  catch { fail(p, "MISSING — foundation file not found"); return ""; }
}

const need = (src, file, re, msg) => { if (src && !re.test(src)) fail(file, msg); };
const forbid = (src, file, re, msg) => { if (src && re.test(src)) fail(file, msg); };

/** Strip `--` comment lines so prose ABOUT a forbidden key is not a violation. */
const stripSqlComments = (src) =>
  src.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");

/** Same idea for TS/TSX: a header comment that says "this never touches Stripe"
 *  must not itself register as a Stripe reference. Strips block and line
 *  comments so the forbid checks only ever see EXECUTABLE code. */
const stripJsComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * Every SET clause of an `update public.letter_verifications` statement, i.e.
 * the text between `set` and the following `where`. Lets us assert on what is
 * ASSIGNED without tripping over columns merely referenced in a WHERE.
 */
function letterVerificationSetClauses(src) {
  const out = [];
  const re = /update\s+public\.letter_verifications\b[\s\S]*?\bset\b([\s\S]*?)(?=\bwhere\b|\breturning\b|;)/gi;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

// ── Checks ──────────────────────────────────────────────────────────────────
function checkEntitlement(ent) {
  const f = ENT;
  // Entitlement must NOT be derived from the mutable pet array alone.
  need(ent, f, /purchased_pet_limit\s+integer/,
    "entitlement must persist a purchased_pet_limit column");
  need(ent, f, /order_entitlement_snapshots/,
    "entitlement snapshot table must exist");
  forbid(ent, f, /jsonb_array_length\s*\(\s*[^)]*assessment_answers[^)]*\)\s*(as\s+)?purchased_pet_limit/i,
    "purchased_pet_limit must NEVER be taken straight from the mutable pet array");

  // Immutability without an audited repair.
  need(ent, f, /is immutable: a core entitlement change requires a new repair_reason/,
    "entitlement rows must be immutable without an audited repair_reason");
  need(ent, f, /trg_order_entitlement_immutable/,
    "immutability trigger must be attached");

  // Ambiguous stays manual review; annual stays unsupported.
  need(ent, f, /ambiguous_manual_review/,
    "an ambiguous confidence level must exist");
  need(ent, f, /when v_conf = 'ambiguous_manual_review' then 'manual_review_required'/,
    "ambiguous orders must map to manual_review_required");
  need(ent, f, /when v_plan = 'annual'\s+then 'manual_review_required'/,
    "annual/subscription upgrades must remain manual_review_required");

  // Coupons must not move entitlement.
  need(ent, f, /coalesce\(p_price,0\) \+ coalesce\(p_coupon_discount,0\)/,
    "list price must be reconstructed as price + coupon_discount");

  // Retired per-pet pricing must never come back as EXECUTABLE sql (prose in a
  // comment explaining that the keys stay dead is fine).
  forbid(stripSqlComments(ent), f, /esa_additional_pet|esa_subscription_addon/,
    "reintroduces a RETIRED per-pet pricing key");

  // Fail-closed grants.
  need(ent, f, /revoke all on function public\.backfill_order_entitlements\(boolean\)\s*\n?\s*from public, anon, authenticated/,
    "backfill must be revoked from public, anon AND authenticated by name");
  need(ent, f, /enable row level security/, "entitlement table must enable RLS");
}

function checkDocumentVersions(doc) {
  const f = DOC;
  need(doc, f, /create table if not exists public\.order_document_versions/,
    "document version table must exist");

  // Original never overwritten; IDs never repointed.
  need(doc, f, /is immutable: cannot repoint version/,
    "a published version's file/letter_id must be un-repointable");
  need(doc, f, /letter_id\s+text unique/,
    "each version must carry its OWN unique verification ID");

  // Exactly one active version.
  need(doc, f, /create unique index if not exists uq_docver_one_active_per_order_type[\s\S]{0,200}where is_active/,
    "a partial unique index must enforce ONE active version per order+doc_type");

  // A failed revision may never replace a valid active document.
  need(doc, f, /failed generation and cannot be activated/,
    "activation must refuse a failed version");
  need(doc, f, /has no generated file/,
    "activation must refuse a version with no generated file");

  // Idempotency.
  need(doc, f, /idempotency_key\s+text unique/, "versions must have a unique idempotency key");
  need(doc, f, /idempotency_key = p_idempotency_key/,
    "create_document_version must return the existing row on a retry");

  // Supersession must NOT rewrite the old verification.
  need(doc, f, /set superseded_at\s*=\s*now\(\),\s*\n?\s*superseded_by_letter_id/,
    "supersession must flag the old verification, not repoint it");
  // Inspect only what these UPDATEs ASSIGN — a column named in a WHERE is fine.
  for (const setClause of letterVerificationSetClauses(doc)) {
    if (/\bfile_url\s*=/.test(setClause) || /\bprocessed_file_url\s*=/.test(setClause)) {
      fail(f, "must NEVER rewrite an existing verification's file_url");
    }
    if (/(^|[\s,])letter_id\s*=/.test(setClause)) {
      fail(f, "must NEVER reassign an existing verification's letter_id");
    }
    if (/\bstatus\s*=/.test(setClause)) {
      fail(f, "must NEVER rewrite an existing verification's status");
    }
  }

  // Backward compatibility of the public verification result.
  need(doc, f, /'has_newer_version'/, "verify_letter_id must expose has_newer_version");
  need(doc, f, /'document_version'/, "verify_letter_id must expose document_version");
  need(doc, f, /'provider_name'/, "verify_letter_id must keep its existing public fields");
  forbid(doc, f, /'superseded_by_letter_id',\s*v_rec\.superseded_by_letter_id/,
    "the newer verification ID must not be disclosed publicly");

  // Fail-closed grants.
  need(doc, f, /revoke all on function public\.activate_document_version\(uuid\) from public, anon, authenticated/,
    "activate_document_version must be revoked from anon AND authenticated by name");
  need(doc, f, /enable row level security/, "version table must enable RLS");
}

function checkNoCustomerUpgradeYet(submit, step2) {
  // The customer-facing upgrade belongs to the NEXT task. Prove it has not shipped.
  const ctaRe = /Add another pet|Add Another Pet<\/button>[\s\S]{0,80}upgrade|additional_pet_checkout|create-additional-pet/i;
  for (const [file, src] of [[SUBMIT, submit], [STEP2, step2]]) {
    forbid(src, file, /additional_pet_upgrade|create-additional-pet-checkout/i,
      "an Additional Pet checkout path exists — not approved in this foundation task");
  }
  void ctaRe;

  // Provider submission: version registration must be BEST EFFORT.
  need(submit, SUBMIT, /create_document_version/,
    "provider submission must register a document version");
  need(submit, SUBMIT, /activate_document_version/,
    "provider submission must activate the version after generation");
  need(submit, SUBMIT, /\[documentVersion\] unexpected error/,
    "version registration must be wrapped so it can never fail a submission");
  need(submit, SUBMIT, /submit:\$\{order\.id\}:\$\{documentId\}/,
    "version registration must use a deterministic idempotency key");
  forbid(submit, SUBMIT, /google_ads|gclid|conversion/i,
    "provider submission must not gain a Google Ads conversion path");
}

function checkCheckoutCopy(step2) {
  forbid(step2, STEP2, /cannot be included after submission/,
    "the inaccurate 'cannot be included after submission' promise is still present");
  need(step2, STEP2, /Additional pets may be requested after submission/,
    "the ESA disclosure must state that additional pets may be requested later");
  need(step2, STEP2, /Additional dogs may be requested after submission/,
    "the PSD disclosure must state that additional dogs may be requested later");
  need(step2, STEP2, /Approval is not automatic/,
    "the disclosure must state approval is not automatic");
  forbid(step2, STEP2, /\$20|\$\s?20\b/,
    "checkout copy must NOT quote the $20 upgrade price");
}

function checkVersionHistoryUi(adminPanel, portalPanel, portalCard) {
  const adminCode = stripJsComments(adminPanel);
  const portalCode = stripJsComments(portalPanel);
  // ── Admin history panel: READ ONLY ────────────────────────────────────────
  need(adminPanel, ADMIN_PANEL, /order_document_versions/,
    "admin panel must read the version table");
  need(adminPanel, ADMIN_PANEL, /if \(loading \|\| versions\.length === 0\) return null;/,
    "admin panel must render NOTHING for legacy orders with no version rows");
  need(adminPanel, ADMIN_PANEL, /Active/, "admin panel must badge the active version");
  need(adminPanel, ADMIN_PANEL, /Superseded/, "admin panel must badge superseded versions");
  // Must be the explicit ordering call, not merely the words appearing somewhere.
  need(adminPanel, ADMIN_PANEL, /\.order\(\s*["']is_active["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/,
    "admin panel must order the ACTIVE version first");
  // No mutation may ever be reachable from the admin history UI.
  for (const verb of ["insert", "update", "upsert", "delete"]) {
    forbid(adminPanel, ADMIN_PANEL, new RegExp("\\." + verb + "\\("),
      `admin version history must be READ-ONLY (found .${verb}()`);
  }
  forbid(adminCode, ADMIN_PANEL, /activate_document_version|fail_document_version|create_document_version/,
    "admin version history must not call a version lifecycle RPC");
  // No financial / clinical leakage into the admin history panel.
  forbid(adminCode, ADMIN_PANEL, /price|amount_cents|stripe|coupon|discount|entitlement|diagnosis|assessment_answers/i,
    "admin version history must not expose payment, entitlement or clinical data");

  // ── Portal history: collapsed, read-only, legacy-safe ─────────────────────
  need(portalPanel, PORTAL_PANEL, /useState\(false\);\s*\/\/ collapsed by default/,
    "portal history must be collapsed by default");
  need(portalPanel, PORTAL_PANEL, /Previous document versions/,
    "portal history must use the 'Previous document versions' label");
  need(portalPanel, PORTAL_PANEL, /if \(rows\.length === 0\) return null;/,
    "portal history must render NOTHING for legacy orders");
  need(portalPanel, PORTAL_PANEL, /approval_status", "superseded"/,
    "portal history must list ONLY superseded versions (the active one is the card's own row)");
  need(portalPanel, PORTAL_PANEL, /Superseded/, "portal history must label versions as superseded");
  need(portalPanel, PORTAL_PANEL, /openSecureDocument/,
    "portal history must open historical files through the signed-URL helper");
  for (const verb of ["insert", "update", "upsert", "delete"]) {
    forbid(portalPanel, PORTAL_PANEL, new RegExp("\\." + verb + "\\("),
      `portal version history must be READ-ONLY (found .${verb}()`);
  }
  forbid(portalCode, PORTAL_PANEL, /activate_document_version|create_document_version/,
    "a customer must never be able to activate or create a version");
  forbid(portalCode, PORTAL_PANEL, /storage_path|file_url|price|stripe|entitlement|diagnosis/i,
    "portal history must not expose storage paths, raw URLs, payment or clinical data");

  // The card still renders the CURRENT document first, then the history.
  need(portalCard, PORTAL_CARD, /MyDocumentVersionHistory/,
    "the portal card must mount the version history");
  need(portalCard, PORTAL_CARD, /deliverables\.map[\s\S]{0,400}MyDocumentVersionHistory/,
    "the ACTIVE document list must render BEFORE the previous-version history");
}

function checkNoAdditionalPetUi(adminPanel, portalPanel, portalCard) {
  for (const [file, raw] of [[ADMIN_PANEL, adminPanel], [PORTAL_PANEL, portalPanel], [PORTAL_CARD, portalCard]]) {
    const src = stripJsComments(raw);
    forbid(src, file, /add another pet|add_another_pet|additional_pet/i,
      "an Additional Pet CTA/path appeared — not approved in the foundation");
    forbid(src, file, /stripe|checkout|payment_intent/i, "no Stripe path may exist here");
    forbid(src, file, /gclid|google_ads|conversion/i, "no Google Ads path may exist here");
  }
}

function checkRevisionIds(submit, mig) {
  const code = stripJsComments(submit);
  // Revision detection must be SERVER-derived, never a client flag.
  need(code, SUBMIT, /is_active["']?\s*,\s*true\)[\s\S]{0,200}isRevision\s*=\s*true|isRevision = true/,
    "revision must be detected from an existing ACTIVE version, server-side");
  forbid(code, SUBMIT, /body\.(isRevision|forceNewVerificationId)|form\.get\(["'](isRevision|forceNew)/i,
    "revision/ID-minting must never be driven by client input");
  // The revision must NOT reuse the first-letter reuse-path.
  need(code, SUBMIT, /state\.length === 2 && !isRevision/,
    "the reuse-based generateVerificationId path must be skipped for revisions");
  need(code, SUBMIT, /ensure_revision_verification_id/,
    "revisions must mint their ID via the atomic per-version DB function");
  need(code, SUBMIT, /revision:\$\{order\.id\}:\$\{storedDocType\}:v\$\{nextVersionNumber\}/,
    "revision idempotency key must be (order, doc_type, target version)");
  // Activation gates the compatibility cache.
  need(code, SUBMIT, /activate_document_version[\s\S]{0,600}letter_id: resolvedLetterId/,
    "orders.letter_id may only be repointed AFTER the revision activates");

  // DB contract
  need(stripSqlComments(mig), REVISION_MIG, /pg_advisory_xact_lock/,
    "revision minting must be serialised per version");
  need(mig, REVISION_MIG, /if v_row\.letter_id is not null then[\s\S]{0,40}return v_row\.letter_id;/,
    "an already-minted version must return its existing ID (exactly-once)");
  need(mig, REVISION_MIG, /old\.letter_id is not null and new\.letter_id is distinct from old\.letter_id/,
    "filling an EMPTY letter_id is allowed; changing a set one must stay forbidden");
  need(mig, REVISION_MIG, /revoke all on function public\.ensure_revision_verification_id/,
    "the minting function must be revoked from public/anon/authenticated");
  forbid(mig, REVISION_MIG, /update public\.(orders|order_documents)/i,
    "the revision migration must not update existing order-owned tables");
  forbid(mig, REVISION_MIG, /register_legacy_document_versions|backfill_order_entitlements/,
    "no existing-order backfill may run from this migration");
}

function checkSuppression(sup, submit) {
  const code = stripJsComments(sup);
  need(code, SUPPRESS, /TEST_SUPPRESS_EXTERNAL_NOTIFICATIONS/,
    "suppression must require an explicit secret");
  need(code, SUPPRESS, /opudhofjbydrljgleofq/,
    "suppression must require the TEST project ref");
  need(code, SUPPRESS, /\.test|\.invalid/,
    "suppression must require a reserved non-deliverable recipient TLD");
  need(code, SUPPRESS, /secretEnabled && checks\.testProject && checks\.fixtureRecipient/,
    "ALL THREE conditions must agree — fail-closed");
  forbid(code, SUPPRESS, /searchParams|req\.url|body\.|skipEmail|query/i,
    "suppression must never be reachable from a request/browser input");
  // Honest recording — never fabricate delivery.
  const sub = stripJsComments(submit);
  need(sub, SUBMIT, /notification_suppressed_test_fixture/,
    "a suppressed send must be recorded honestly in the audit trail");
  need(sub, SUBMIT, /suppressed: true, error: "suppressed_test_fixture"/,
    "a suppressed send must NOT report ok:true delivery");
}

// ── Runner ──────────────────────────────────────────────────────────────────
async function run(mutate = (s) => s) {
  failures.length = 0;
  const ent = mutate(await read(ENT), ENT);
  const doc = mutate(await read(DOC), DOC);
  const submit = mutate(await read(SUBMIT), SUBMIT);
  const step2 = mutate(await read(STEP2), STEP2);

  const adminPanel = mutate(await read(ADMIN_PANEL), ADMIN_PANEL);
  const portalPanel = mutate(await read(PORTAL_PANEL), PORTAL_PANEL);
  const portalCard = mutate(await read(PORTAL_CARD), PORTAL_CARD);

  checkEntitlement(ent);
  checkDocumentVersions(doc);
  checkNoCustomerUpgradeYet(submit, step2);
  checkCheckoutCopy(step2);
  const suppressSrc = mutate(await read(SUPPRESS), SUPPRESS);
  const revMig = mutate(await read(REVISION_MIG), REVISION_MIG);
  checkRevisionIds(submit, revMig);
  checkSuppression(suppressSrc, submit);
  checkVersionHistoryUi(adminPanel, portalPanel, portalCard);
  checkNoAdditionalPetUi(adminPanel, portalPanel, portalCard);
  return [...failures];
}

const SELF_TESTS = [
  ["entitlement mutable-only derivation", ENT,
    (s) => s.replace(/purchased_pet_limit\s+integer/, "purchased_pet_limit_removed integer")],
  ["entitlement immutability removed", ENT,
    (s) => s.replace(/is immutable: a core entitlement change requires a new repair_reason/, "silently updated")],
  ["annual upgrades silently supported", ENT,
    (s) => s.replace(/when v_plan = 'annual'\s+then 'manual_review_required'/, "when v_plan = 'annual' then 'supported'")],
  // Planted as EXECUTABLE sql — a comment mentioning the key is not a defect.
  ["retired per-pet key revived", ENT,
    (s) => s + "\nupdate public.site_pricing_settings set is_active = true where key = 'esa_additional_pet';\n"],
  ["coupon allowed to move entitlement", ENT,
    (s) => s.replace(/coalesce\(p_price,0\) \+ coalesce\(p_coupon_discount,0\)/, "coalesce(p_price,0)")],
  ["document repoint guard removed", DOC,
    (s) => s.replace(/is immutable: cannot repoint version/, "repointed version")],
  ["two active versions allowed", DOC,
    (s) => s.replace(/create unique index if not exists uq_docver_one_active_per_order_type/, "create index if not exists uq_docver_one_active_per_order_type")],
  ["failed revision can activate", DOC,
    (s) => s.replace(/failed generation and cannot be activated/, "activated anyway")],
  ["verification file_url rewritten", DOC,
    (s) => s.replace(/set superseded_at\s*=\s*now\(\),/, "set file_url = 'x', superseded_at = now(),")],
  ["newer verification ID disclosed", DOC,
    (s) => s.replace(/'superseded_at', case when/, "'superseded_by_letter_id', v_rec.superseded_by_letter_id, 'superseded_at', case when")],
  ["version registration can break submission", SUBMIT,
    (s) => s.replace(/\[documentVersion\] unexpected error/, "swallowed")],
  ["non-deterministic idempotency key", SUBMIT,
    (s) => s.replace(/submit:\$\{order\.id\}:\$\{documentId\}/, "submit:${crypto.randomUUID()}")],
  ["old checkout promise restored", STEP2,
    (s) => s.replace(/Additional pets may be requested after submission\./, "Pets added later cannot be included after submission.")],
  ["price leaked into checkout copy", STEP2,
    (s) => s.replace(/Approval is not automatic\./, "Approval is not automatic. Only $20.")],

  // ── ORDER-ENTITLEMENT-DOCUMENT-FOUNDATION-CLOSURE-001 §17 ─────────────────
  ["admin history gains a write path", ADMIN_PANEL,
    (s) => s.replace(/const \{ data \} = await supabase/,
      'await supabase.from("order_document_versions").update({ is_active: true });\n      const { data } = await supabase')],
  ["admin history can activate a version", ADMIN_PANEL,
    (s) => s.replace(/setVersions\(rows\);/, 'setVersions(rows); await supabase.rpc("activate_document_version", {});')],
  ["admin history leaks payment data", ADMIN_PANEL,
    (s) => s.replace(/generated_at, activated_at/, "generated_at, price, stripe_payment_intent_id, activated_at")],
  ["admin history stops showing the active version first", ADMIN_PANEL,
    (s) => s.replace(/\.order\("is_active", \{ ascending: false \}\)\n/, "")],
  ["admin history breaks the legacy empty state", ADMIN_PANEL,
    (s) => s.replace(/if \(loading \|\| versions\.length === 0\) return null;/, "if (loading) return null;")],
  ["portal history expanded by default", PORTAL_PANEL,
    (s) => s.replace(/useState\(false\);\s*\/\/ collapsed by default/, "useState(true);")],
  ["portal history breaks the legacy empty state", PORTAL_PANEL,
    (s) => s.replace(/if \(rows\.length === 0\) return null;/, "")],
  ["portal history exposes the active version too", PORTAL_PANEL,
    (s) => s.replace(/\.eq\("approval_status", "superseded"\)\n/, "")],
  ["customer can activate a version from the portal", PORTAL_PANEL,
    (s) => s.replace(/const openHistorical/, 'const hack = () => supabase.rpc("activate_document_version", {});\n  const openHistorical')],
  ["portal history leaks a raw storage path", PORTAL_PANEL,
    (s) => s.replace(/superseded_at, generated_at/, "superseded_at, storage_path, generated_at")],
  ["portal history dropped the superseded label", PORTAL_PANEL,
    (s) => s.replace(/>\s*Superseded\s*</, "><")],
  ["Add another pet CTA appears in the portal", PORTAL_CARD,
    (s) => s.replace(/<MyDocumentVersionHistory/, '<button>Add another pet</button>\n          <MyDocumentVersionHistory')],
  // ── DOCUMENT-REVISION-ID-AND-CUSTOMER-QA-CLOSURE-001 §20 ──────────────────
  ["revision reuses the original ID path", SUBMIT,
    (x) => x.replace(/state\.length === 2 && !isRevision/, "state.length === 2")],
  ["revision stops minting a new ID", SUBMIT,
    (x) => x.replace(/ensure_revision_verification_id/g, "noop_mint")],
  ["revision key becomes non-deterministic", SUBMIT,
    (x) => x.replace(/revision:\$\{order\.id\}:\$\{storedDocType\}:v\$\{nextVersionNumber\}/, "revision:${crypto.randomUUID()}")],
  ["client can force a revision", SUBMIT,
    (x) => x.replace(/let isRevision = false;/, "let isRevision = body.isRevision === true;")],
  ["mint loses its advisory lock", REVISION_MIG,
    (x) => x.replace(/perform pg_advisory_xact_lock/, "-- perform pg_advisory_xact_lock")],
  ["mint stops being exactly-once", REVISION_MIG,
    (x) => x.replace(/if v_row\.letter_id is not null then[\s\S]{0,40}return v_row\.letter_id;/, "if false then return null;")],
  ["set letter_id becomes repointable", REVISION_MIG,
    (x) => x.replace(/old\.letter_id is not null and new\.letter_id is distinct from old\.letter_id/, "false")],
  ["revision migration mutates existing orders", REVISION_MIG,
    (x) => x + "\nupdate public.orders set letter_id = null where letter_id is not null;\n"],
  ["legacy registration rerun added", REVISION_MIG,
    (x) => x + "\nselect public.register_legacy_document_versions(false);\n"],
  ["suppression drops the secret check", SUPPRESS,
    (x) => x.replace(/TEST_SUPPRESS_EXTERNAL_NOTIFICATIONS/g, "SOME_OTHER_FLAG")],
  ["suppression drops the project check", SUPPRESS,
    (x) => x.replace(/opudhofjbydrljgleofq/g, "any-project")],
  ["suppression accepts any recipient", SUPPRESS,
    (x) => x.replace(/secretEnabled && checks\.testProject && checks\.fixtureRecipient/, "secretEnabled")],
  ["suppression reachable from the browser", SUPPRESS,
    (x) => x.replace(/const checks =/, "const q = new URL(req.url).searchParams;\n  const checks =")],
  ["suppressed send reports success", SUBMIT,
    (x) => x.replace(/suppressed: true, error: "suppressed_test_fixture"/, "suppressed: true, ok: true")],
  ["history renders BEFORE the active document", PORTAL_CARD,
    (s) => s.replace(/<MyDocumentVersionHistory confirmationId=\{order\.confirmation_id\} \/>/, "")],
];

const selfTest = process.argv.includes("--self-test");

if (selfTest) {
  const baseline = await run();
  if (baseline.length) {
    console.error("[check-entitlement-document-versioning] baseline is NOT clean:");
    baseline.forEach((f) => console.error("  ✗ " + f));
    process.exit(1);
  }
  let bad = 0;
  for (const [name, target, mut] of SELF_TESTS) {
    const found = await run((src, file) => (file === target ? mut(src) : src));
    if (!found.length) { console.error(`  ✗ NEGATIVE CONTROL NOT CAUGHT: ${name}`); bad++; }
    else console.log(`  ✓ caught: ${name}`);
  }
  if (bad) {
    console.error(`[check-entitlement-document-versioning] ${bad} planted defect(s) NOT caught`);
    process.exit(1);
  }
  console.log(`[check-entitlement-document-versioning] SELF-TEST OK — ${SELF_TESTS.length}/${SELF_TESTS.length} planted defects caught`);
  process.exit(0);
}

const found = await run();
if (found.length) {
  console.error("[check-entitlement-document-versioning] FAILED");
  found.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log("[check-entitlement-document-versioning] OK — entitlement immutable & never pet-array-derived; annual + ambiguous stay manual review; documents versioned, originals un-repointable, one active version, failed revisions cannot replace it; verification backward compatible; no Additional Pet checkout yet; checkout copy corrected.");
