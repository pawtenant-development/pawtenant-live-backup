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
  const i = c.indexOf("ageMin >= 5 && !lead.sms_5min_sent_at");
  if (i < 0) return "";
  const j = c.indexOf("if (ageMin >= 5 && !lead.seq_30min_sent_at)", i);
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
  ["a failed send keeps the sent stamp (release dead-coded)", CORE,
    (s) => s.replace(/results\.sms_send_failed\+\+;/, "results.sms_send_failed++; if (false)")],
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
