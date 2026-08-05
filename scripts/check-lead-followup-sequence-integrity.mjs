#!/usr/bin/env node
// LEAD-FOLLOWUP-SEQUENCE-SECURE-RESUME-REGRESSION-RECOVERY-001
//
// Deploy-blocking guard for the lead follow-up email/SMS drip.
//
// WHAT HAPPENED
// -------------
// The secure-resume-token rollout copied the `issueResumeLink({...})` call site
// from TEST into LIVE without adapting one identifier. TEST declares
// `SUPABASE_SERVICE_ROLE_KEY`; LIVE declares `SERVICE_ROLE_KEY`. The LIVE call
// site kept the TEST name, which does not exist in that file, so every cron run
// threw `SUPABASE_SERVICE_ROLE_KEY is not defined` from 2026-08-01 22:30 UTC.
//
// Two things made it worse than a stalled drip:
//   • the SMS path CLAIMED `sms_5min_sent_at` BEFORE minting the link, so the
//     throw left seven leads permanently marked "sent" having received nothing;
//   • the throw escaped the per-lead scope, aborting the whole run — so every
//     EMAIL stage stalled too, on a defect that only the SMS path triggered.
//
// A plain typecheck does not catch this: these are Deno edge functions, outside
// `tsconfig.app.json`. This guard is the thing that catches it.
//
// Run:  node scripts/check-lead-followup-sequence-integrity.mjs [--self-test]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";

const CORE = "supabase/functions/lead-followup-sequence/core.ts";
const INDEX = "supabase/functions/lead-followup-sequence/index.ts";
// LEAD-FOLLOWUP-GHL-DELIVERY-AND-ADMIN-RESUME-CHECKOUT-EMAIL-002
const GHLSMS = "supabase/functions/_shared/ghlSms.ts";
const GHLFN = "supabase/functions/ghl-send-sms/index.ts";

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

/** Strip comments — this guard's own prose quotes the patterns it bans. */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ")
    .replace(/([^:"'`\\])\/\/[^\n"'`]*$/gm, "$1");
}

/** Every identifier the module actually declares at top level. */
export function declaredConsts(src) {
  return new Set([...stripComments(src).matchAll(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
}

/** The 5-minute SMS block, from its trigger to the end of its branch. */
export function smsBlock(src) {
  const c = stripComments(src);
  // Anchored on the stage-trigger CONST, not on a literal threshold. The
  // threshold became configurable (`recovery_stage_1_minutes`), so an anchor
  // containing `>= 5` silently stopped matching and this slice returned "" —
  // which makes every check below vacuously inspect an empty string.
  const i = c.indexOf("const smsStageDue =");
  if (i < 0) return "";
  // End anchor is the FIRST EMAIL STAGE's predicate. It moved when the stage
  // triggers were hoisted into named consts for the dry run; left stale, this
  // slice silently ran to end-of-file and the checks below would have scanned
  // code they were never meant to see.
  const j = c.indexOf("const step1Due =", i);
  return j < 0 ? c.slice(i) : c.slice(i, j);
}

/**
 * The `sendRecoverySms` helper body — the provider call plus its single
 * communications row. This lives at module scope, OUTSIDE `smsBlock`, so the
 * one-row / idempotency invariants have to be asserted against this slice.
 */
export function recoverySender(src) {
  const c = stripComments(src);
  const i = c.indexOf("async function sendRecoverySms(");
  if (i < 0) return "";
  const j = c.indexOf("export async function writeAuditLog", i);
  return j < 0 ? c.slice(i) : c.slice(i, j);
}

const CHECKS = [
  // ── 1. the root cause ─────────────────────────────────────────────────────
  ["S1", "every identifier passed to issueResumeLink is actually declared", () => {
    const src = read(CORE);
    const code = stripComments(src);
    const decls = declaredConsts(src);
    const m = code.match(/issueResumeLink\(\{([\s\S]{0,600}?)\}\)/);
    if (!m) return false;
    // Collect bare identifier VALUES (`key: IDENT`) and require each to exist.
    const idents = [...m[1].matchAll(/^\s*\w+\s*:\s*([A-Z][A-Z0-9_]{2,})\s*,/gm)].map((x) => x[1]);
    if (idents.length === 0) return false;
    return idents.every((id) => decls.has(id));
  }],
  ["S2", "the service-role key passed to issueResumeLink is the declared const", () => {
    const src = read(CORE);
    const code = stripComments(src);
    const decls = declaredConsts(src);
    const m = code.match(/issueResumeLink\(\{[\s\S]{0,600}?serviceRoleKey:\s*([A-Za-z_$][\w$]*)/);
    return !!m && decls.has(m[1]);
  }],
  ["S3", "the service-role const is read from the SUPABASE_SERVICE_ROLE_KEY env", () =>
    /(?:SUPABASE_)?SERVICE_ROLE_KEY\s*=\s*Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/.test(read(CORE))],

  // ── 2. SMS claim ordering and honesty ─────────────────────────────────────
  ["S4", "the resume link is minted BEFORE the sms_5min_sent_at claim", () => {
    const b = smsBlock(read(CORE));
    if (!b) return false;
    const link = b.search(/getResumeLink\(\)/);
    const claim = b.search(/update\(\{\s*sms_5min_sent_at:/);
    return link >= 0 && claim >= 0 && link < claim;
  }],
  ["S5", "a failed link mint claims nothing and is recorded", () => {
    const b = smsBlock(read(CORE));
    return /catch\s*\(linkErr\)/.test(b) && /sms_link_failed\+\+/.test(b)
      && /sms_5min_link_failed/.test(b);
  }],
  ["S6", "a failed send RELEASES the claim instead of leaving a false stamp", () => {
    const b = smsBlock(read(CORE));
    // Assert the USE, not the mention. Checking that both `sms_send_failed++`
    // and the null-update merely APPEAR let a planted `if (false)` between them
    // pass while the release was dead code. Require the release to follow the
    // counter directly, with no branch opening in between.
    const m = b.match(/results\.sms_send_failed\+\+;([\s\S]{0,300}?)update\(\{\s*sms_5min_sent_at:\s*null\s*\}\)/);
    if (!m) return false;
    return !/\bif\s*\(/.test(m[1]) && !/\breturn\b/.test(m[1]) && !/\bcontinue\b/.test(m[1]);
  }],
  ["S7", "the release is scoped to THIS run's own claim timestamp", () => {
    const b = smsBlock(read(CORE));
    // Releasing on order id alone could clear a claim another concurrent run
    // legitimately took a moment earlier.
    return /const claimTs = new Date\(\)\.toISOString\(\)/.test(b)
      && /update\(\{\s*sms_5min_sent_at:\s*null\s*\}\)[\s\S]{0,160}?\.eq\("sms_5min_sent_at",\s*claimTs\)/.test(b);
  }],
  ["S8", "sms_5min is only counted when the send was accepted", () => {
    const b = smsBlock(read(CORE));
    return /if \(smsRes\.sent\)\s*\{?\s*(?:\n\s*)?results\.sms_5min\+\+/.test(b);
  }],

  // ── 3. deduplication must not be weakened ─────────────────────────────────
  ["S9", "the atomic null-check claim (concurrency lock) is intact", () => {
    const b = smsBlock(read(CORE));
    return /\.is\("sms_5min_sent_at",\s*null\)/.test(b) && /dedup_skipped\+\+/.test(b);
  }],
  ["S10", "the lead query still excludes paid / completed / cancelled / refunded", () => {
    const c = stripComments(read(CORE));
    return /\.is\("payment_intent_id",\s*null\)/.test(c) && /\.is\("paid_at",\s*null\)/.test(c)
      && /\.neq\("status",\s*"completed"\)/.test(c) && /\.neq\("status",\s*"cancelled"\)/.test(c)
      && /\.neq\("status",\s*"refunded"\)/.test(c);
  }],
  ["S11", "opt-out and SMS opt-out are still honoured", () => {
    const c = stripComments(read(CORE));
    return /lead\.followup_opt_out/.test(c) && /!lead\.sms_opted_out/.test(c);
  }],

  // ── 4. secure resume links must not regress ───────────────────────────────
  ["S12", "the drip mints a secure token, never a confirmation-id resume link", () => {
    const c = stripComments(read(CORE));
    return /issueResumeLink\(/.test(c) && !/[?&]resume=\$\{/.test(c) && !/resume=.{0,12}confirmationId/.test(c);
  }],
  ["S13", "the resume link is memoised per lead (one token per lead per run)", () => {
    const c = stripComments(read(CORE));
    return /let _resumeLink: string \| null = null/.test(c) && /if \(_resumeLink === null\)/.test(c);
  }],

  // ── 5. transport / auth posture ───────────────────────────────────────────
  ["S14", "the cron-secret gate is still enforced", () => {
    const c = stripComments(read(INDEX));
    return /x-cron-secret/i.test(c) && /CRON_SECRET/.test(c);
  }],
  ["S15", "no LIVE project ref is hardcoded in the function source", () =>
    !/cvwbozlbbmrjxznknouq/.test(read(CORE)) && !/cvwbozlbbmrjxznknouq/.test(read(INDEX))],

  // ══ LEAD-FOLLOWUP-GHL-DELIVERY-AND-ADMIN-RESUME-CHECKOUT-EMAIL-002 ══════════
  // The incident: this sequence sent via Twilio DIRECTLY while every other
  // PawTenant producer used GHL. Twilio is unconfigured on LIVE, so 642
  // consecutive sends short-circuited before any HTTP call. GHL is now the one
  // canonical path and these checks are what keep it that way.

  // ── 6. the direct Twilio dependency must stay gone ────────────────────────
  ["S16", "the sequence has NO direct Twilio dependency", () => {
    // Bans the credentials and the endpoint, NOT the word "twilio" — the
    // `twilio_sid` column is the legitimate provider-id field for every
    // provider and is still written (as `ghl:<id>`).
    const c = stripComments(read(CORE)) + stripComments(read(INDEX));
    return !/api\.twilio\.com/.test(c)
      && !/TWILIO_ACCOUNT_SID|TWILIO_AUTH_TOKEN|TWILIO_PHONE_NUMBER/.test(c);
  }],
  ["S17", "the recovery SMS is sent through the canonical GHL helper", () => {
    const c = stripComments(read(CORE));
    return /import\s*\{[^}]*sendGhlSms[^}]*\}\s*from\s*"\.\.\/_shared\/ghlSms\.ts"/.test(c)
      && /await sendGhlSms\(\{/.test(recoverySender(read(CORE)));
  }],
  ["S18", "ghl-send-sms shares that helper instead of its own GHL protocol copy", () => {
    const c = stripComments(read(GHLFN));
    return /import\s*\{[^}]*sendGhlSms[^}]*\}\s*from\s*"\.\.\/_shared\/ghlSms\.ts"/.test(c)
      && /await sendGhlSms\(\{/.test(c)
      // No second, hand-maintained copy of the Conversations protocol.
      && !/conversations\/messages/.test(c);
  }],

  // ── 7. the SMS body comes from CONFIG; the URL stays clean ────────────────
  // OWNER CORRECTION 2026-08-05. The rule is no longer "no discount anywhere".
  // It is: the promo may appear as TEXT IN THE BODY, sourced from the owner's
  // saved settings, and may NEVER be attached to the checkout URL.
  ["S19", "the SMS body is rendered from saved config, not a literal in source", () => {
    const c = stripComments(read(CORE));
    // The key must be BOTH requested from comms_settings AND read back out.
    // Checking only that the string appears somewhere passed a mutation that
    // dropped it from the fetch list while leaving the map.get() behind — the
    // template then silently resolved to null on every run.
    if (!/comms_settings/.test(c)) return false;
    if (!/function renderRecoverySms\(/.test(c)) return false;
    if (!/renderRecoverySms\(smsConfig\.template!/.test(c)) return false;
    const keyList = c.match(/const keys = \[([\s\S]*?)\];/);
    if (!keyList || !/"recovery_sms_5min_template"/.test(keyList[1])) return false;
    return /map\.get\("recovery_sms_5min_template"\)/.test(c);
  }],
  ["S20", "no hard-coded SMS body survives in the function", () => {
    const c = stripComments(read(CORE));
    // The old generic string and the owner's warm wording must BOTH be absent
    // as literals — either one present means a second source of truth exists.
    return !/you can complete your existing PawTenant order here/.test(c)
      && !/we hope your bond with/i.test(c)
      && !/function buildRecoverySms/.test(c);
  }],
  ["S21", "the promo code comes from config, with PAW20 only as a named fallback", () => {
    const c = stripComments(read(CORE));
    if (!/recovery_sms_promo_code/.test(c)) return false;
    // PAW20 may appear EXACTLY once, as the fallback constant — never inside a
    // message template or an appended string.
    const hits = [...c.matchAll(/PAW20/g)];
    if (hits.length !== 1) return false;
    return /const RECOVERY_PROMO_FALLBACK = "PAW20";/.test(c);
  }],
  ["S22", "the promo NEVER reaches the checkout URL", () => {
    const c = stripComments(read(CORE));
    // No promo/coupon/discount/code query parameter may be built anywhere, and
    // the renderer must substitute the bare link it was handed.
    if (/[?&](promo|coupon|discount|code|dc)=/i.test(c)) return false;
    if (/extraParams/.test(c)) return false;
    return /resume_url: vars\.resumeUrl/.test(c);
  }],
  ["S23", "the code never appends its own STOP wording", () => {
    const c = stripComments(read(CORE));
    // GHL emits the required unsubscribe disclosure itself; ours duplicated it.
    return !/Reply STOP/i.test(c);
  }],
  ["S24", "opt-out suppression and provider DND are still enforced", () => {
    const c = stripComments(read(CORE));
    return /!lead\.sms_opted_out/.test(c) && /checkDnd:\s*true/.test(c);
  }],
  ["S25", "a disabled or unconfigured stage sends nothing", () => {
    const c = stripComments(read(CORE));
    return /smsConfig\.enabled && !!smsConfig\.template/.test(c)
      && /ageMin >= smsConfig\.stage1Minutes/.test(c);
  }],

  // ── 8. one provider attempt = exactly one communications row ──────────────
  ["S26", "the SMS sender writes exactly ONE communications insert", () => {
    const b = recoverySender(read(CORE));
    if (!b) return false;
    return (b.match(/from\("communications"\)\s*\n?\s*\.insert\(/g) ?? []).length === 1;
  }],
  ["S27", "that row is claimed with a durable idempotency key BEFORE the send", () => {
    const b = recoverySender(read(CORE));
    const claim = b.search(/dedupe_key:\s*idempotencyKey/);
    const send = b.search(/await sendGhlSms\(\{/);
    return claim >= 0 && send >= 0 && claim < send;
  }],
  ["S28", "the claim is never stamped as a delivery", () => {
    const b = recoverySender(read(CORE));
    // The 2026-08-01 incident stamped success before the side effect and left
    // seven leads permanently "sent" having received nothing. The pre-send row
    // must read `sending`, and only the post-send update may say `sent`.
    const m = b.match(/\.insert\(\{[\s\S]{0,900}?\}\)/);
    if (!m) return false;
    return /status:\s*"sending"/.test(m[0]) && !/status:\s*"sent"/.test(m[0]);
  }],
  ["S29", "a lost idempotency claim suppresses the send instead of double-sending", () => {
    const b = recoverySender(read(CORE));
    const m = b.match(/if \(claimErr \|\| !commId\)\s*\{([\s\S]{0,700}?)\n\s{2}\}/);
    if (!m) return false;
    return /duplicateSuppressed:\s*true/.test(m[1]) && /return \{/.test(m[1])
      && !/sendGhlSms/.test(m[1]);
  }],

  // ── 9. retry classification comes from the provider, not a string regex ───
  ["S26", "terminality is decided by the provider outcome, not by matching text", () => {
    const b = smsBlock(read(CORE));
    return /p_permanent:\s*!smsRes\.sent && smsRes\.outcome === "permanent"/.test(b)
      // The old regex-over-the-error-string classifier must be gone: it read a
      // human message to make a "never contact this customer again" decision.
      && !/not configured\|phone missing\|invalid/.test(b);
  }],
  ["S27", "a suppressed duplicate does NOT consume a retry slot", () => {
    const b = smsBlock(read(CORE));
    const m = b.match(/if \(!smsRes\.duplicateSuppressed\)\s*\{([\s\S]{0,700}?)\n\s{12}\}/);
    return !!m && /sms_attempt_record/.test(m[1]);
  }],
  ["S28", "the durable eligibility gate still runs before every send", () => {
    const b = smsBlock(read(CORE));
    return /sms_attempt_is_eligible/.test(b) && /smsAttemptEligible/.test(b);
  }],

  // ── 10. the shared provider helper's own invariants ───────────────────────
  ["S29", "an unrecognised provider failure defaults to PERMANENT, never retryable", () => {
    const c = stripComments(read(GHLSMS));
    const m = c.match(/export function classifyGhlFailure\([\s\S]*?\n\}/);
    if (!m) return false;
    // The LAST return in the classifier is the fallthrough for anything not
    // explicitly recognised. Retrying an unknown 4xx every 15 minutes forever
    // IS the incident.
    const returns = [...m[0].matchAll(/return \{ outcome: "(\w+)"/g)].map((x) => x[1]);
    return returns.length > 0 && returns[returns.length - 1] === "permanent";
  }],
  ["S30", "429 and 5xx stay RETRYABLE so a blip is not made terminal", () => {
    const c = stripComments(read(GHLSMS));
    return /status === 429\) return \{ outcome: "retryable"/.test(c)
      && /status >= 500\) return \{ outcome: "retryable"/.test(c);
  }],
  ["S31", "the TEST tester-number containment guard is intact and fails closed", () => {
    const c = stripComments(read(GHLSMS));
    if (!/\+18323309603/.test(c) || !/\+18322804249/.test(c)) return false;
    // Unknown environment must be treated as TEST (restricted).
    if (!/if \(!url\) return true;/.test(c)) return false;
    // Assert the USE, not the mention. A first pass here only checked that the
    // pieces APPEARED, which a `return false && isTestSupabaseProject(...)`
    // bypass sails straight through. Pin the whole returned expression instead,
    // normalising whitespace so formatting alone cannot fail it.
    const m = c.match(/export function testSmsSendBlocked\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
    if (!m) return false;
    const body = m[1].replace(/\s+/g, " ").trim();
    return body ===
      "return isTestSupabaseProject(supabaseUrl) && !APPROVED_TEST_SMS_NUMBERS.includes((phoneE164 || \"\").trim());";
  }],
  ["S32", "the automated path reads provider-side DND before sending", () => {
    // orders.sms_opted_out cannot see a STOP the customer texted to the GHL
    // number, so without this the cron keeps messaging an opted-out customer.
    return /checkDnd:\s*true/.test(recoverySender(read(CORE)));
  }],
  ["S36", "a POSITIVE DND is terminal, an UNREADABLE one does not kill the channel", () => {
    const c = stripComments(read(GHLSMS));
    // Measured on TEST 2026-08-06: GHL answers POST /contacts/ but 401s on
    // GET /contacts/{id}. Refusing to send on an unreadable DND made every
    // recovery SMS terminal on attempt one — the Twilio incident's outcome
    // with a better excuse. GHL enforces DND at send time and that rejection
    // classifies as permanent, so the customer stays protected either way.
    if (!/return fail\(\s*"permanent", "dnd_blocked"/.test(c)) return false;
    const m = c.match(/if \(!dnd\.verified\) \{([\s\S]{0,400}?)\n {4}\}/);
    if (!m) return false;
    return !/return fail\(/.test(m[1]) && /console\.warn/.test(m[1]);
  }],
  ["S37", "a send with unreadable opt-out state is logged, never silent", () =>
    /res\.ok && !res\.dndVerified/.test(recoverySender(read(CORE)))],
  // ── 11. the dry run must predict the real run, not approximate it ─────────
  ["S34", "every stage's dry run and real branch read the SAME predicate", () => {
    const c = stripComments(read(CORE));
    // A rehearsal with its own copy of the eligibility rules is free to
    // disagree with the sender it exists to predict.
    return ["smsWouldSend", "step1Due", "step2Due", "step3Due"].every((p) =>
      new RegExp(`if \\(${p} && dryRun\\)`).test(c) &&
      new RegExp(`if \\(${p} && !dryRun\\)`).test(c));
  }],
  ["S35", "a dry run cannot send, stamp or move the heartbeat", () => {
    const c = stripComments(read(CORE));
    // Every heartbeat write is gated. An ungated one would let a rehearsal
    // overwrite "when did this last really run?".
    // Both gate shapes are legitimate — `if (!dryRun) await heartbeat(...)` and
    // `if (!dryRun) {` on its own line — so look back a short window rather
    // than pinning one formatting.
    const beats = [...c.matchAll(/await heartbeat\(supabase, \{/g)];
    if (beats.length === 0) return false;
    return beats.every((m) => /!dryRun/.test(c.slice(Math.max(0, m.index - 40), m.index)));
  }],

  ["S33", "a missing or unusable phone is terminal without a provider call", () => {
    const c = stripComments(read(GHLSMS));
    return /"permanent", "missing_phone"/.test(c) && /"permanent", "invalid_phone"/.test(c)
      && /"permanent", "provider_not_configured"/.test(c)
      && /"permanent", "dnd_blocked"/.test(c);
  }],
];

async function run() {
  const results = CHECKS.map(([id, label, fn]) => {
    let ok = false, err = null;
    try { ok = !!fn(); } catch (e) { err = e.message; }
    return { id, label, ok, err };
  });
  for (const r of results) {
    console.log(`  ${r.ok ? GREEN + "PASS" : RED + "FAIL"}${RESET}  ${r.id.padEnd(4)} ${r.label}${r.err ? ` — ${r.err}` : ""}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? GREEN : RED}${results.length - failed}/${results.length} checks passed.${RESET}`);
  return failed === 0;
}

// ── Planted negative controls ────────────────────────────────────────────────
const CONTROLS = [
  // The exact LIVE defect: the TEST identifier at the LIVE call site.
  ["the undeclared TEST identifier is restored at the call site", CORE,
    (s) => s.replace(/serviceRoleKey: (SUPABASE_)?SERVICE_ROLE_KEY,/, "serviceRoleKey: SOME_UNDECLARED_KEY,")],
  ["the claim happens BEFORE the link is minted again", CORE,
    (s) => s.replace(
      // CRLF-safe: the LIVE repo is CRLF, so \n-only anchors no-op there.
      /let smsMsg: string \| null = null;\r?\n\s*try \{/,
      "let smsMsg: string | null = null;\n        await supabase.from(\"orders\").update({ sms_5min_sent_at: new Date().toISOString() }).eq(\"id\", orderId);\n        try {")],
  // Two shapes of the same regression: deleting the release outright, and
  // dead-coding it. The second one slipped through while S6 only checked that
  // the counter and the update both APPEARED somewhere in the block.
  ["a failed send keeps the sent stamp (release deleted)", CORE,
    (s) => s.replace(/\.update\(\{ sms_5min_sent_at: null \}\)/, ".select(\"id\")")],
  // Anchored on the RELEASE site specifically. A bare `results.sms_send_failed++`
  // anchor started matching the missing-phone terminal block instead, which
  // mutated a different statement and left the release intact — the control
  // reported nothing while proving nothing.
  ["a failed send keeps the sent stamp (release dead-coded)", CORE,
    (s) => s.replace(
      /results\.sms_send_failed\+\+;([\s\S]{0,60}?await supabase[\s\S]{0,60}?\.from\("orders"\))/,
      "results.sms_send_failed++; if (false) $1")],
  ["the release stops being scoped to this run's claim", CORE,
    (s) => s.replace(/\.eq\("sms_5min_sent_at", claimTs\);/, ";")],
  ["the link-failure catch is removed", CORE,
    (s) => s.replace(/results\.sms_link_failed\+\+;/, "")],
  // LINE ENDINGS: the LIVE repo checks out CRLF, so an anchor written with a
  // bare \n silently fails to match there — the mutation becomes a no-op and the
  // control reports success while proving nothing. These two anchored on a
  // trailing newline and did exactly that on LIVE. Match no newline at all.
  ["the atomic concurrency claim is weakened", CORE,
    (s) => s.replace(/\.is\("sms_5min_sent_at", null\)/, "")],
  ["paid orders stop being excluded from the drip", CORE,
    (s) => s.replace(/\.is\("paid_at", null\)/, "")],
  ["opt-out stops being honoured", CORE,
    (s) => s.replace(/if \(lead\.followup_opt_out\)/, "if (false)")],
  ["confirmation-id resume links come back", CORE,
    (s) => s.replace(/issueResumeLink\(\{/, "legacyResumeUrl(`?resume=${lead.confirmation_id}`) || issueResumeLink({")],
  ["the cron-secret gate is removed", INDEX,
    (s) => s.replace(/x-cron-secret/gi, "x-open-door")],

  // ── LEAD-FOLLOWUP-GHL-DELIVERY-...-002 controls ───────────────────────────
  // Every mutation below is a plausible way a future edit reintroduces the
  // 2026-08-04 incident. Each must trip at least one check.
  ["the direct Twilio send comes back", CORE,
    (s) => s.replace(
      /const GHL_FROM_NUMBER = Deno\.env\.get\("GHL_PHONE_NUMBER"\) \?\? "";/,
      'const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";\nconst GHL_FROM_NUMBER = Deno.env.get("GHL_PHONE_NUMBER") ?? "";')],
  ["the sequence bypasses the shared helper with its own fetch", CORE,
    (s) => s.replace(/await sendGhlSms\(\{/, 'await fetch("https://api.twilio.com/x", {')],
  // OWNER CORRECTION 2026-08-05 controls. The contract inverted: the promo is
  // now REQUIRED as body text from config, and BANNED from the URL.
  ["a hard-coded SMS body is reintroduced", CORE,
    (s) => s.replace(
      /smsMsg = renderRecoverySms\(smsConfig\.template!, \{/,
      'smsMsg = `Hi ${firstName}, we hope your bond with your pet stays strong.`; if (false) smsMsg = renderRecoverySms(smsConfig.template!, {')],
  ["the promo code is hard-coded into the message instead of read from config", CORE,
    (s) => s.replace(/promoCode: smsConfig\.promoCode,/, 'promoCode: "PAW20",')],
  ["the promo is smuggled onto the checkout URL", CORE,
    (s) => s.replace(/resume_url: vars\.resumeUrl,/, 'resume_url: vars.resumeUrl + "?promo=" + vars.promoCode,')],
  ["STOP wording is appended to the body again", CORE,
    (s) => s.replace(
      /return template\.replace\(/,
      'template = template + " Reply STOP to opt out."; return template.replace(')],
  // Targets the QUOTED key actually requested from comms_settings. An unquoted
  // anchor renamed the first mention — which lives in a comment — leaving the
  // real lookup untouched, so the control mutated bytes and proved nothing.
  ["the saved template is bypassed for a literal", CORE,
    (s) => s.replace(/"recovery_sms_5min_template"/, '"recovery_sms_5min_template_DISABLED"')],
  ["a disabled recovery stage sends anyway", CORE,
    (s) => s.replace(/smsConfig\.enabled && !!smsConfig\.template &&/, "")],
  ["the configured stage timing is ignored", CORE,
    (s) => s.replace(/ageMin >= smsConfig\.stage1Minutes/, "ageMin >= 5")],
  ["provider-side DND is dropped from the automated path", CORE,
    (s) => s.replace(/checkDnd: true,/, "checkDnd: false,")],
  ["a second communications row is written per attempt", CORE,
    (s) => s.replace(
      /const res = await sendGhlSms\(\{/,
      'await supabase.from("communications").insert({ type: "sms_outbound", direction: "outbound" });\n  const res = await sendGhlSms({')],
  ["the attempt row is claimed as already sent", CORE,
    (s) => s.replace(/status: "sending",/, 'status: "sent",')],
  ["the idempotency key stops being written to the claim", CORE,
    (s) => s.replace(/dedupe_key: idempotencyKey,/, "")],
  ["a lost claim falls through and sends anyway", CORE,
    (s) => s.replace(/duplicateSuppressed: true,/, "duplicateSuppressed: false,")],
  ["terminality goes back to regex-matching the error text", CORE,
    (s) => s.replace(
      /p_permanent: !smsRes\.sent && smsRes\.outcome === "permanent",/,
      'p_permanent: !smsRes.sent && /not configured|phone missing|invalid/i.test(String(smsRes.failureReason)),')],
  ["a suppressed duplicate starts burning a retry slot", CORE,
    (s) => s.replace(/if \(!smsRes\.duplicateSuppressed\) \{/, "if (true) {")],
  ["the durable eligibility gate is removed", CORE,
    (s) => s.replace(/sms_attempt_is_eligible/, "sms_attempt_always_true")],
  ["an unknown provider failure becomes retryable again", GHLSMS,
    (s) => s.replace(
      /return \{ outcome: "permanent", code: "provider_rejected" \};\n\}/,
      'return { outcome: "retryable", code: "provider_rejected" };\n}')],
  ["a 5xx blip is made terminal", GHLSMS,
    (s) => s.replace(
      /if \(status >= 500\) return \{ outcome: "retryable", code: "provider_unavailable" \};/,
      'if (status >= 500) return { outcome: "permanent", code: "provider_unavailable" };')],
  ["the TEST containment guard stops failing closed", GHLSMS,
    (s) => s.replace(/if \(!url\) return true;/, "if (!url) return false;")],
  // A real bypass, not `!!!x` — which is logically identical to `!x` and so
  // mutated the bytes without changing the behaviour the check is defending.
  ["the TEST containment guard is short-circuited off", GHLSMS,
    (s) => s.replace(
      /return isTestSupabaseProject\(supabaseUrl\) &&/,
      "return false && isTestSupabaseProject(supabaseUrl) &&")],
  ["an unreadable DND blocks the whole channel again", GHLSMS,
    (s) => s.replace(
      /console\.warn\(`\[ghlSms\] DND unverified, proceeding to provider: \$\{dnd\.detail\}`\);/,
      'return fail("permanent", "dnd_unverified", "unreadable");')],
  ["a positive DND stops being terminal", GHLSMS,
    (s) => s.replace(/return fail\(\n        "permanent", "dnd_blocked",/,
      'return fail(\n        "retryable", "dnd_blocked",')],
  ["a send with unreadable opt-out state becomes silent", CORE,
    (s) => s.replace(/if \(res\.ok && !res\.dndVerified\) \{/, "if (false) {")],
  ["a missing phone stops being terminal", GHLSMS,
    (s) => s.replace(/"permanent", "missing_phone"/, '"retryable", "missing_phone"')],
  ["the dry run re-derives its own SMS eligibility", CORE,
    (s) => s.replace(/if \(smsWouldSend && dryRun\)/, "if (ageMin >= 5 && dryRun)")],
  ["a dry run is allowed to actually send the SMS stage", CORE,
    (s) => s.replace(/if \(smsWouldSend && !dryRun\) \{/, "if (smsWouldSend) {")],
  ["a dry run moves the operational heartbeat", CORE,
    (s) => s.replace(/if \(!dryRun\) await heartbeat\(supabase, \{\n      last_run_finished_at: finishedAtIso,\n      last_success_at/,
      "await heartbeat(supabase, {\n      last_run_finished_at: finishedAtIso,\n      last_success_at")],
  ["ghl-send-sms grows its own copy of the GHL protocol again", GHLFN,
    (s) => s.replace(/const phone = smsRes\.phone \|\| toPhone;/,
      'await fetch("https://services.leadconnectorhq.com/conversations/messages");\n  const phone = smsRes.phone || toPhone;')],
];

async function selfTest() {
  console.log(`${YELLOW}self-test: planted negative controls${RESET}\n`);
  if (!(await run())) {
    console.log(`${RED}✗ guard is not green before planting — fix the source first${RESET}`);
    return false;
  }
  let allTripped = true;
  for (const [name, rel, mutate] of CONTROLS) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) { console.log(`  ${RED}SKIP${RESET}   ${name} — ${rel} missing`); allTripped = false; continue; }
    const original = readFileSync(abs, "utf8");
    const mutated = mutate(original);
    if (mutated === original) {
      console.log(`  ${RED}NO-OP${RESET}  ${name} — anchor moved; control proves nothing`);
      allTripped = false;
      continue;
    }
    writeFileSync(abs, mutated);
    let caught;
    try {
      caught = CHECKS.map(([, , fn]) => { try { return !!fn(); } catch { return false; } }).some((r) => !r);
    } finally {
      writeFileSync(abs, original); // restore byte-for-byte, always
    }
    console.log(`  ${caught ? GREEN + "CAUGHT" : RED + "MISSED"}${RESET}  ${name}`);
    if (!caught) allTripped = false;
  }
  const restored = await run();
  console.log(`\n${restored ? GREEN + "✓ source restored and green" : RED + "✗ source NOT restored"}${RESET}`);
  return allTripped && restored;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1]);
if (invokedDirectly) {
  const ok = process.argv.includes("--self-test") ? await selfTest() : await run();
  if (!ok) {
    console.log(`${RED}✗ lead-followup-sequence integrity guard FAILED${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ lead follow-up sequence: declared identifiers, honest SMS claim ordering, dedupe and secure resume links verified${RESET}`);
}
