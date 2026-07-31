// scripts/check-provider-document-single-current-pending.mjs  (LIVE)
//
// PROVIDER-DOCUMENT-SINGLE-CURRENT-PENDING-VERSION-LIVE-ROLLOUT-001 §14
//
// WHAT THIS GUARD PINS
// ────────────────────
// LIVE Pending Delivery QA proved that one order could hold TWO documents at
// `pending_admin_approval`, which the Admin Documents tab rendered as TWO
// "Approve & Deliver" cards — either of which could be approved, releasing two
// customer-visible letters with two different verification IDs.
//
// The cause was a supersede query that looked ONLY for `needs_correction`:
//
//     .eq("review_status", "needs_correction")
//
// so a resubmission arriving while the previous one was still PENDING retired
// nothing. Widening that filter alone would have fixed the sequential case and
// left the concurrent one open, because the old code was three unlocked round
// trips (SELECT candidates -> INSERT -> UPDATE candidates): two simultaneous
// submissions each read an empty candidate set and each inserted.
//
// This is the LIVE copy. It differs from the TEST guard in three ways, all
// deliberate:
//   * it forbids the TEST project ref leaking into LIVE (the mirror of the TEST
//     guard's rule);
//   * S19 asserts the permanent PT-LIVE-PENDINGQA GHL suppression IS INTACT —
//     that control lives in THIS repo, so here it can be checked directly
//     rather than only by blast radius;
//   * S21 asserts the completed contact-submission privacy hotfix is not
//     weakened by this rollout.
//
//   S1  submission goes through ONE atomic server RPC, not read-then-write
//   S2  the old needs_correction-only supersede query is GONE
//   S3  the RPC retires BOTH unapproved states, not just needs_correction
//   S4  the RPC serialises on an order+doc_type lock
//   S5  a partial unique index makes two current candidates impossible
//   S6  supersession preserves the row and hides it (never deletes)
//   S7  the RPC refuses to silently replace a delivered document
//   S8  the delivered-document exemption requires a reopen AFTER the delivery
//   S9  replay is recognised by CONTENT, not by a per-upload storage path
//   S10 a replay RETURNS the existing row's file_url and never falls through
//   S11 a replay creates no audit event, no bell row and no staff alert
//   S12 a refused or replayed upload does not orphan a storage object
//   S13 the RPC is service_role-only, by capability not key compare
//   S14 the RPC is revoked from anon/authenticated BY NAME
//   S15 the Admin panel still selects exactly the constrained status pair
//   S16 the customer projection still keys on customer_visible
//   S17 provider earnings are untouched by a replacement
//   S18 the LIVE staff-alert branding is preserved (no TEST asset host)
//   S19 the permanent PT-LIVE-PENDINGQA GHL suppression is intact
//   S20 no TEST project ref introduced into LIVE
//   S21 the contact-submission privacy hotfix is not weakened
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-provider-document-single-current-pending.mjs
//   node scripts/check-provider-document-single-current-pending.mjs --self-test
//   node scripts/check-provider-document-single-current-pending.mjs --warn-only

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = process.argv.includes("--self-test");
const WARN = process.argv.includes("--warn-only");
const NAME = "check-provider-document-single-current-pending";

const TEST_PROJECT_REF = "opudhofjbydrljgleofq";
/** The LIVE staff-alert logo. TEST points at pawtenant.com/assets/brand/...;
 *  a blind TEST->LIVE copy silently rebrands every production staff email. */
const LIVE_ALERT_LOGO_HOST = "static.readdy.ai";

const FILES = {
  submit:      "supabase/functions/provider-submit-letter/index.ts",
  slotSql:     "supabase/migrations/20260731120000_provider_document_single_current_pending.sql",
  reviewPanel: "src/pages/admin-orders/components/OrderDocumentReviewPanel.tsx",
  customerDoc: "src/lib/customerDocuments.ts",
  ghlProxy:    "supabase/functions/ghl-webhook-proxy/index.ts",
  contactSql:  "supabase/migrations/20260730250000_contact_submission_anon_exposure_hotfix.sql",
};

function loadAll() {
  const out = {};
  for (const [key, rel] of Object.entries(FILES)) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) throw new Error(`missing required file: ${rel}`);
    // CRLF -> LF FIRST. On Windows with autocrlf=true these files are checked
    // out with CRLF, so a regex written with \n would silently never match and
    // every check would "pass" on a file it never actually read.
    out[key] = readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
  }
  return out;
}

/** Strip comments so a check can never be satisfied by prose alone. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*--.*$/gm, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const has = (s, needle) => code(s).includes(needle);
const hasRe = (s, re) => re.test(code(s));

function runChecks(f) {
  const submit = code(f.submit);
  const slot   = code(f.slotSql);
  const panel  = code(f.reviewPanel);
  const r = [];
  const add = (id, desc, ok) => r.push({ id, desc, ok: !!ok });

  add("S1", "submission goes through ONE atomic server RPC",
    hasRe(submit, /supabase\.rpc\(\s*\n?\s*["']provider_submit_document_slot["']/)
    && hasRe(submit, /p_submission_fingerprint:/));

  add("S2", "the needs_correction-only supersede query is gone",
    !hasRe(submit, /\.eq\(\s*["']review_status["']\s*,\s*["']needs_correction["']\s*\)/)
    && !hasRe(submit, /from\(["']order_documents["']\)\s*\n?\s*\.insert\(/)
    && !hasRe(submit, /review_status:\s*["']superseded["']/));

  add("S3", "the RPC retires BOTH unapproved states, not just needs_correction",
    hasRe(slot, /set\s+review_status\s*=\s*'superseded'[\s\S]{0,400}review_status\s+in\s*\(\s*'pending_admin_approval'\s*,\s*'needs_correction'\s*\)/));

  add("S4", "the RPC serialises on an order+doc_type advisory lock",
    hasRe(slot, /pg_advisory_xact_lock\(\s*hashtextextended\(\s*p_order_id::text\s*\|\|\s*':'\s*\|\|\s*p_doc_type/));

  add("S5", "a partial unique index makes two current candidates impossible",
    hasRe(slot, /create\s+unique\s+index\s+if\s+not\s+exists\s+uq_order_documents_one_current_unapproved/i)
    && hasRe(slot, /on\s+public\.order_documents\s*\(order_id,\s*doc_type\)/i)
    && hasRe(slot, /where\s+review_status\s+in\s*\(\s*'pending_admin_approval'\s*,\s*'needs_correction'\s*\)/i));

  add("S6", "supersession preserves the row and hides it, never deletes",
    hasRe(slot, /superseded_by_document_id\s*=\s*v_new_id/)
    && hasRe(slot, /customer_visible\s*=\s*false/)
    && hasRe(slot, /superseded_at\s*=\s*now\(\)/)
    && !hasRe(slot, /delete\s+from\s+public\.order_documents/i));

  add("S7", "the RPC refuses to silently replace a delivered document",
    hasRe(slot, /review_status\s*=\s*'approved'\s*\n?\s*and\s+coalesce\(customer_visible,\s*false\)/)
    && has(slot, "approved_document_requires_reopen")
    && hasRe(submit, /slot\.rejected\s*===\s*true/)
    && hasRe(submit, /\}\,\s*409\)/));

  add("S8", "the reopen exemption must post-date the delivery",
    hasRe(slot, /v_since\s*:=\s*coalesce\(v_approved\.approved_at/)
    && (slot.match(/>\s*v_since/g) ?? []).length >= 2
    && has(slot, "approved_pending_document"));

  add("S9", "replay is recognised by CONTENT, not by a per-upload path",
    hasRe(submit, /crypto\.subtle\.digest\(\s*["']SHA-256["']/)
    && hasRe(submit, /submissionFingerprint\s*=\s*await\s+fingerprintBytes\(buf\)/)
    && hasRe(slot, /submission_fingerprint\s*=\s*v_fp/));

  // SUPERSEDED BY PROVIDER-SUBMISSION-REPLAY-DELIVERED-STATE-IDEMPOTENCY-001.
  //
  // This originally asserted that a replay swapped `documentUrl` to the stored
  // row's URL and then FELL THROUGH the normal path, on the theory that
  // file-derived idempotency keys would then dedupe the version and the id.
  // LIVE Operations QA disproved that: once a first submission is auto-delivered
  // under a disabled gate, an ACTIVE version exists, so the replay is classified
  // as a REVISION — and a revision mints its own new verification id by design,
  // re-injects the footer, overwrites orders.letter_id and adds a second version
  // row. Reusing the URL never prevented any of it.
  //
  // The contract is now stronger: a replay RETURNS the stored file_url and
  // reaches no downstream write at all. Ordering is proven in detail by
  // scripts/check-provider-submission-replay-idempotency.mjs; here we only pin
  // that the replay surfaces the EXISTING row's URL rather than the new upload.
  add("S10", "a replay returns the EXISTING row's file_url and does not fall through",
    hasRe(submit, /if\s*\(isReplay\)\s*\{[\s\S]{0,3000}?return\s+json\(\{[\s\S]{0,600}?fileUrl:\s*storedDoc\?\.file_url\s*\?\?\s*slot\.file_url/)
    && hasRe(slot, /'file_url',\s*v_existing\.file_url/));

  // COUNTED, not merely present. There are two of each announcement — one on the
  // final-letter path and one on the completed-Housing path — and gating only one
  // still lets a replay announce itself.
  add("S11", "a replay creates no audit event, no bell row and no staff alert",
    (submit.match(/if\s*\(!isReplay\)\s*await\s+supabase\.from\("audit_logs"\)\.insert/g) ?? []).length === 2
    && (submit.match(/if\s*\(!isReplay\)\s*await\s+supabase\.from\("doctor_notifications"\)\.insert/g) ?? []).length === 2
    && (submit.match(/if\s*\(!isReplay\)\s*notifyAdminLetterSubmitted\(/g) ?? []).length === 2);

  add("S12", "a refused or replayed upload does not orphan a storage object",
    has(submit, "discardUploadedObject")
    && (submit.match(/discardUploadedObject\(supabase,\s*uploadedFilePath\)/g) ?? []).length >= 4);

  // LIVE carries BOTH a legacy JWT and sb_secret_ keys, so comparing a bearer
  // string to SUPABASE_SERVICE_ROLE_KEY is not a reliable identity test.
  add("S13", "the RPC is service_role-only, by capability not key compare",
    hasRe(slot, /coalesce\(auth\.role\(\),\s*''\)\s*<>\s*'service_role'/)
    && hasRe(slot, /insufficient_privilege/)
    && !has(slot, "SUPABASE_SERVICE_ROLE_KEY"));

  add("S14", "the RPC is revoked from anon/authenticated BY NAME",
    hasRe(slot, /revoke\s+all\s+on\s+function\s+public\.provider_submit_document_slot\([\s\S]{0,200}from\s+public,\s*anon,\s*authenticated/i)
    && !hasRe(slot, /grant\s+execute\s+on\s+function\s+public\.provider_submit_document_slot/i));

  add("S15", "the Admin panel selects exactly the constrained status pair",
    hasRe(panel, /\.in\("review_status",\s*\["pending_admin_approval",\s*"needs_correction"\]\)/));

  add("S16", "the customer projection still keys on customer_visible",
    hasRe(f.customerDoc, /\.filter\(\(d\)\s*=>\s*d\.customer_visible\)/));

  add("S17", "provider earnings are untouched by a replacement",
    !hasRe(slot, /doctor_earnings|provider_earnings|ensureRaCompletionEarning/i)
    && (submit.match(/ensureRaCompletionEarning\(/g) ?? []).length === 1);

  // A blind TEST->LIVE copy of provider-submit-letter silently rebrands the
  // production staff alert, because TEST and LIVE use different logo hosts.
  add("S18", "the LIVE staff-alert branding is preserved",
    has(f.submit, LIVE_ALERT_LOGO_HOST)
    && !has(f.submit, "pawtenant.com/assets/brand/pawtenant-logo-white-02.png"));

  // ── Blast radius / standing controls ──────────────────────────────────────
  // The permanent reserved-QA GHL suppression stops LIVE QA fixtures firing real
  // CRM events. It lives in THIS repo, so assert it directly — including the
  // exact pattern, because a fixture id that does not match it is NOT suppressed.
  add("S19", "the permanent PT-LIVE-PENDINGQA GHL suppression is intact",
    has(f.ghlProxy, "PT-LIVE-PENDINGQA")
    && hasRe(f.ghlProxy, /QA_FIXTURE_CONFIRMATION_ID_RE\s*=\s*\/\^PT-LIVE-PENDINGQA-\\d\{2,4\}\$\//)
    && has(f.ghlProxy, "isReservedQaFixture"));

  add("S20", "no TEST project ref introduced into LIVE",
    !Object.values(f).some((s) => code(s).includes(TEST_PROJECT_REF)));

  add("S21", "the contact-submission privacy hotfix is not weakened",
    hasRe(f.contactSql, /revoke\s+all[\s\S]{0,120}from\s+anon/i)
    && !hasRe(f.slotSql, /contact_submission/i));

  return r;
}

// ── Planted negative controls ────────────────────────────────────────────────
const CONTROLS = [
  ["S1", "submission stops using the atomic RPC",
    (f) => ({ ...f, submit: f.submit.replace(/["']provider_submit_document_slot["']/, '"some_other_rpc"') })],
  ["S2", "the original defect is restored verbatim (needs_correction only)",
    (f) => ({ ...f, submit: f.submit.replace(
      "const { data: slotRaw, error: slotErr } = await supabase.rpc(",
      '.eq("review_status", "needs_correction")\n    const { data: slotRaw, error: slotErr } = await supabase.rpc(') })],
  ["S2b", "submission hand-rolls the document insert again",
    (f) => ({ ...f, submit: f.submit.replace(
      "const slot = (slotRaw ?? {}) as {",
      'await supabase.from("order_documents").insert({ review_status: "pending_admin_approval" });\n    const slot = (slotRaw ?? {}) as {') })],
  ["S3", "the RPC supersedes only needs_correction again",
    (f) => ({ ...f, slotSql: f.slotSql.replaceAll(
      "review_status in ('pending_admin_approval', 'needs_correction')",
      "review_status = 'needs_correction'") })],
  ["S4", "the RPC drops its serialising lock",
    (f) => ({ ...f, slotSql: f.slotSql.replace(/perform pg_advisory_xact_lock\([^;]*;/, "") })],
  ["S5", "the partial unique index is removed",
    (f) => ({ ...f, slotSql: f.slotSql.replace(
      /create unique index if not exists uq_order_documents_one_current_unapproved/i,
      "create index if not exists uq_order_documents_one_current_unapproved") })],
  ["S6", "supersession deletes history instead of retiring it",
    (f) => ({ ...f, slotSql: f.slotSql.replace(
      "superseded_by_document_id  = v_new_id,",
      "superseded_by_document_id  = v_new_id,\n           x = (select 1);\n  delete from public.order_documents where false;\n  -- ") })],
  ["S7", "a delivered document can be silently replaced again",
    (f) => ({ ...f, submit: f.submit.replace(/slot\.rejected\s*===\s*true/, "false") })],
  ["S8", "any historical reopen authorises a replacement",
    (f) => ({ ...f, slotSql: f.slotSql.replaceAll("> v_since", "is not null or true --") })],
  ["S9", "replay detection reverts to the per-upload storage path",
    (f) => ({ ...f, submit: f.submit.replace(
      /submissionFingerprint = await fingerprintBytes\(buf\)/, "submissionFingerprint = objectPath") })],
  ["S10", "a replay falls through instead of returning the stored state",
    (f) => ({ ...f, submit: f.submit.replace(
      /fileUrl: storedDoc\?\.file_url \?\? slot\.file_url \?\? null,/, "fileUrl: documentUrl,") })],
  ["S11", "a replay announces itself as a fresh submission again",
    (f) => ({ ...f, submit: f.submit.replace(
      'if (!isReplay) await supabase.from("audit_logs").insert({',
      'await supabase.from("audit_logs").insert({') })],
  ["S11b", "a replay pages staff again",
    (f) => ({ ...f, submit: f.submit.replace(
      "if (!isReplay) notifyAdminLetterSubmitted({\n      confirmationId,",
      "notifyAdminLetterSubmitted({\n      confirmationId,") })],
  ["S12", "a refused upload is left orphaned in the private bucket",
    (f) => ({ ...f, submit: f.submit.replaceAll(
      "await discardUploadedObject(supabase, uploadedFilePath);", "") })],
  ["S13", "the RPC drops its service-role capability check",
    (f) => ({ ...f, slotSql: f.slotSql.replace(
      /coalesce\(auth\.role\(\), ''\) <> 'service_role'/, "false") })],
  ["S13b", "the RPC authorises by comparing a bearer to the service key",
    (f) => ({ ...f, slotSql: f.slotSql.replace(
      /coalesce\(auth\.role\(\), ''\) <> 'service_role'/,
      "current_setting('request.header.authorization', true) <> 'Bearer ' || 'SUPABASE_SERVICE_ROLE_KEY'") })],
  ["S14", "the RPC is left executable by signed-in users",
    (f) => ({ ...f, slotSql: f.slotSql.replace(
      /revoke all on function public\.provider_submit_document_slot\([\s\S]*?from public, anon, authenticated;/,
      "") })],
  ["S14b", "the RPC is granted back to authenticated",
    (f) => ({ ...f, slotSql: f.slotSql +
      "\ngrant execute on function public.provider_submit_document_slot(uuid, text, text, text, text, text, text, integer, text, text, uuid, text) to authenticated;\n" })],
  ["S15", "the Admin panel widens its status filter past the index",
    (f) => ({ ...f, reviewPanel: f.reviewPanel.replace(
      '.in("review_status", ["pending_admin_approval", "needs_correction"])',
      '.in("review_status", ["pending_admin_approval", "needs_correction", "superseded"])') })],
  ["S16", "the customer projection stops filtering on customer_visible",
    (f) => ({ ...f, customerDoc: f.customerDoc.replace(
      "(order.documents ?? []).filter((d) => d.customer_visible)", "(order.documents ?? [])") })],
  ["S17", "a replacement mints a provider earning",
    (f) => ({ ...f, slotSql: f.slotSql +
      "\ninsert into public.doctor_earnings (order_id) values (null);\n" })],
  ["S18", "a blind TEST->LIVE copy rebrands the production staff alert",
    (f) => ({ ...f, submit: f.submit.replace(
      /https:\/\/static\.readdy\.ai\/[^"]+/,
      "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png") })],
  ["S19", "the permanent LIVE QA GHL suppression is removed",
    (f) => ({ ...f, ghlProxy: f.ghlProxy.replaceAll("PT-LIVE-PENDINGQA", "PT-SOMETHING-ELSE") })],
  ["S19b", "the QA fixture pattern is loosened",
    (f) => ({ ...f, ghlProxy: f.ghlProxy.replace(
      /\/\^PT-LIVE-PENDINGQA-\\d\{2,4\}\$\//, "/^PT-LIVE-PENDINGQA-.*$/") })],
  ["S20", "a TEST project ref is introduced into LIVE",
    (f) => ({ ...f, slotSql: f.slotSql + `\nselect '${TEST_PROJECT_REF}';\n` })],
  ["S21", "this rollout reaches into contact-submission privacy",
    (f) => ({ ...f, slotSql: f.slotSql + "\ngrant select on public.contact_submissions to anon;\n" })],
];

try {
  const base = loadAll();

  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST trip its check\n`);
    let bad = 0;
    for (const [target, label, mutate] of CONTROLS) {
      const results = runChecks(mutate(base));
      const hit = results.find((x) => x.id === target.replace(/^(S\d+)[a-z]$/, "$1"));
      const tripped = hit && !hit.ok;
      if (!tripped) bad++;
      console.log(`  ${tripped ? "CAUGHT " : "MISSED "} ${target.padEnd(5)} ${label}`);
    }
    console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const results = runChecks(base);
  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`  ${x.ok ? "PASS" : "FAIL"}  ${x.id.padEnd(4)} ${x.desc}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length && !WARN) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
