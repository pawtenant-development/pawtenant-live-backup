#!/usr/bin/env node
/**
 * check-command-center-identity.mjs
 *
 * UNIFIED-ADMIN-COMMAND-CENTER-UNKNOWN-SMS-CALLS-SEARCH-INLINE-SMS-GHL-SYNC-001
 *
 * Static + behavioural guards for the Command Center conversation work.
 *
 * Run with `--self-test` to execute the NEGATIVE CONTROLS: each guard is re-run
 * against a deliberately broken input, and the script FAILS if a guard passes
 * something it is supposed to catch. A guard that has never been observed
 * failing is not evidence of anything.
 *
 * GUARDS MUST ASSERT THE USE, NOT THE MENTION. Every "must NOT contain" scan
 * strips comments and string literals first, because this codebase's comments
 * legitimately quote the very patterns being banned (e.g. the comment in
 * ghl-call-inbound that explains the old `.limit(1)` bug).
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--self-test");

let failures = 0;
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);

const read = (rel) => {
  const p = join(ROOT, rel);
  if (!existsSync(p)) { fail(`missing file: ${rel}`); return ""; }
  // CRLF normalised: a Windows checkout otherwise makes every LF-anchored
  // pattern miss silently, which turns a guard into a no-op that still "passes".
  return readFileSync(p, "utf8").replace(/\r\n/g, "\n");
};

/**
 * Strip line comments, block comments and string literals.
 *
 * Without this, a guard asserting "the file must not use `.limit(1)` for phone
 * matching" is satisfied — or defeated — by a COMMENT that mentions `.limit(1)`
 * while explaining why it was removed. The guard must see code only.
 */
function codeOnly(src) {
  return stripComments(src)
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

/**
 * Strip comments but KEEP string and template literals.
 *
 * `codeOnly` blanks literals too, which is right when the banned thing is a
 * code construct. It is exactly WRONG for two cases this file cares about, and
 * the self-test caught both:
 *
 *   1. PII in logs. The body reaches a log through a TEMPLATE literal —
 *      console.log(`body: ${message.slice(0,100)}`). Blanking templates hides
 *      the very defect the guard exists to catch, and the negative control
 *      reported the guard as a no-op.
 *   2. String-valued configuration. The reconciler excludes GHL-origin rows via
 *      .neq("ghl_sync_state", "ghl_origin") — the USE *is* a string literal, so
 *      blanking it made a correct implementation look non-compliant.
 *
 * Comments still go, so a comment merely NAMING a banned pattern cannot trip or
 * satisfy a guard.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

// ─────────────────────────────────────────────────────────────────────────────
// The guards. Each takes its sources as arguments so `--self-test` can feed
// them broken inputs instead of the real files.
// ─────────────────────────────────────────────────────────────────────────────
const GUARDS = {
  /**
   * The E.164 rule exists in three places (SQL, Deno, browser) and
   * `communications.contact_e164` is GENERATED from the SQL one. If the browser
   * normalises differently it will look up threads that do not exist.
   */
  normalizerAgreement(tsClient, tsServer, sql) {
    const problems = [];
    for (const [name, src] of [["client", tsClient], ["server", tsServer]]) {
      if (!/digits\.length === 10/.test(src)) problems.push(`${name}: missing the 10-digit US rule`);
      if (!/digits\.length < 11 \|\| digits\.length > 15/.test(src)) problems.push(`${name}: missing the 11..15 length bound`);
    }
    if (!/length\(d\.digits\) = 10/.test(sql)) problems.push("sql: missing the 10-digit US rule");
    if (!/between 11 and 15/.test(sql)) problems.push("sql: missing the 11..15 length bound");
    return problems;
  },

  /**
   * Inbound writers must NORMALISE before storing. Storing the provider's
   * display string is what produced 570 unreachable "(832) 726-0357" rows.
   */
  inboundNormalises(callSrc, smsSrc) {
    const problems = [];
    for (const [name, src] of [["ghl-call-inbound", callSrc], ["ghl-sms-inbound", smsSrc]]) {
      const code = codeOnly(src);
      if (!/buildInboundColumns\s*\(/.test(code)) {
        problems.push(`${name}: does not use buildInboundColumns() — phone may be stored unnormalised`);
      }
      // The raw verbatim assignment must be GONE from executable code.
      if (/phone_from:\s*phone\b/.test(code)) {
        problems.push(`${name}: still assigns phone_from from the raw payload value`);
      }
    }
    return problems;
  },

  /**
   * Identity must never be guessed from a first match. `.limit(1)` on a phone
   * `ilike` silently picks one of several customers.
   */
  noFirstMatchIdentity(callSrc, smsSrc) {
    const problems = [];
    for (const [name, src] of [["ghl-call-inbound", callSrc], ["ghl-sms-inbound", smsSrc]]) {
      const code = codeOnly(src);
      // A phone ilike followed by limit(1) within the same statement chain.
      if (/ilike\([^)]*phone[^)]*\)[\s\S]{0,120}?\.limit\(1\)/.test(code)) {
        problems.push(`${name}: still resolves identity with a phone ilike + .limit(1)`);
      }
      if (!/resolveInboundIdentity\s*\(/.test(code)) {
        problems.push(`${name}: does not use resolveInboundIdentity()`);
      }
    }
    return problems;
  },

  /**
   * §10 — no message body, no full phone number, no recording URL in logs.
   */
  noPiiInLogs(callSrc, smsSrc) {
    const problems = [];
    for (const [name, src] of [["ghl-call-inbound", callSrc], ["ghl-sms-inbound", smsSrc]]) {
      // stripComments, NOT codeOnly: the body reaches a log through a template
      // literal, and codeOnly blanks templates — which made this guard a no-op.
      const code = stripComments(src);
      const logs = code.match(/console\.(log|warn|error)\([^;]*\)/g) ?? [];
      for (const line of logs) {
        if (/JSON\.stringify\(\s*payload\s*\)/.test(line)) {
          problems.push(`${name}: logs the raw webhook payload (contains the message body)`);
        }
        if (/\bmessage\.slice\(/.test(line) || /\$\{\s*message\s*\}/.test(line)) {
          problems.push(`${name}: logs the message body`);
        }
        if (/\$\{\s*phone\s*\}/.test(line) || /\$\{\s*phone\s*\?\?/.test(line)) {
          problems.push(`${name}: logs an unmasked phone number`);
        }
        if (/recordingUrl/.test(line)) {
          problems.push(`${name}: logs a recording URL`);
        }
      }
    }
    return problems;
  },

  /**
   * The reconciler must have NO send path. §8/§9: reconciliation must never
   * resend an SMS or place a call.
   */
  reconcilerCannotSend(src) {
    const problems = [];
    // Comments stripped, literals KEPT: the endpoint names and the ghl_origin
    // exclusion are themselves string literals, so codeOnly() would blank the
    // real usage and judge a compliant file non-compliant.
    const code = stripComments(src);
    if (/sendGhlSms\s*\(/.test(code)) problems.push("reconciler calls sendGhlSms()");
    if (/["'`]ghl-send-sms|functions\/v1\/ghl-send-sms/.test(code)) {
      problems.push("reconciler references the SMS send endpoint");
    }
    if (/make-outbound-call/.test(code)) problems.push("reconciler references the outbound call endpoint");
    if (/method:\s*["'`]POST["'`]/.test(code) && /\/conversations\/messages/.test(code)) {
      problems.push("reconciler POSTs to the GHL messages endpoint");
    }
    if (!/["'`]ghl_origin["'`]/.test(code)) {
      problems.push("reconciler does not exclude ghl_origin rows (loop prevention)");
    }
    return problems;
  },

  /**
   * The composer must reuse the canonical endpoint and must fail closed on DND.
   */
  composerUsesCanonicalPath(src) {
    const problems = [];
    const code = codeOnly(src);
    if (!/functions\/v1\/ghl-send-sms|ghl-send-sms/.test(src)) {
      problems.push("composer does not call ghl-send-sms");
    }
    if (!/operationToken/.test(code)) problems.push("composer sends no operationToken (double-send protection)");
    if (!/checkDnd:\s*true/.test(code)) problems.push("composer does not request DND verification (must fail closed)");
    if (!/inFlightRef/.test(code)) problems.push("composer has no synchronous re-entry guard");
    // A second provider implementation is exactly what §4 forbids.
    if (/leadconnectorhq\.com/.test(code)) problems.push("composer talks to the GHL API directly");
    return problems;
  },

  /**
   * The full-message surfaces must not clip the body.
   */
  fullBodyRendered(threadSrc, drawerSrc) {
    const problems = [];
    for (const [name, src] of [["UnifiedThreadPane", threadSrc], ["CommDetailDrawer", drawerSrc]]) {
      if (!/whitespace-pre-wrap/.test(src)) problems.push(`${name}: body is not rendered with preserved line breaks`);
      if (!/sanitizeMessageText/.test(src)) problems.push(`${name}: body is not sanitised`);
      if (/dangerouslySetInnerHTML/.test(src)) problems.push(`${name}: renders message content as HTML`);
    }
    // The body paragraph itself must not carry `truncate` / `line-clamp`.
    const bodyBlocks = (threadSrc + drawerSrc).match(/className="[^"]*"[^>]*>\s*\{\s*(text|fullBody)\b/g) ?? [];
    for (const b of bodyBlocks) {
      if (/\btruncate\b|line-clamp/.test(b)) problems.push("a full-body element still clips its text");
    }
    return problems;
  },

  /**
   * Ambiguity must outrank a row-level order link in the search RPC.
   */
  ambiguityOutranksRowLink(sql) {
    const problems = [];
    const m = sql.match(/resolved as \(([\s\S]*?)\)\s*\n\s*select/);
    if (!m) return ["search RPC has no `resolved` priority block"];
    const block = m[1];
    const iAmb = block.indexOf("'ambiguous'");
    const iLink = block.indexOf("linked_order is not null");
    if (iAmb === -1 || iLink === -1) return ["priority block missing ambiguous/linked_order branches"];
    if (iAmb > iLink) {
      problems.push("a row-level order link is evaluated BEFORE ambiguity — a shared phone would attach a guessed customer");
    }
    return problems;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
function runGuards(sources) {
  const results = [];
  results.push(["E.164 rule agrees across SQL / Deno / browser",
    GUARDS.normalizerAgreement(sources.client, sources.ghlSms, sources.sql)]);
  results.push(["inbound webhooks normalise the phone before storing",
    GUARDS.inboundNormalises(sources.callFn, sources.smsFn)]);
  results.push(["inbound webhooks never guess identity from a first match",
    GUARDS.noFirstMatchIdentity(sources.callFn, sources.smsFn)]);
  results.push(["no message body / phone / recording URL in logs",
    GUARDS.noPiiInLogs(sources.callFn, sources.smsFn)]);
  results.push(["reconciler has no send path and skips ghl_origin",
    GUARDS.reconcilerCannotSend(sources.reconciler)]);
  results.push(["composer reuses ghl-send-sms and fails closed on DND",
    GUARDS.composerUsesCanonicalPath(sources.thread)]);
  results.push(["full message bodies are rendered unclipped and sanitised",
    GUARDS.fullBodyRendered(sources.thread, sources.drawer)]);
  results.push(["ambiguity outranks a row-level order link",
    GUARDS.ambiguityOutranksRowLink(sources.sql)]);
  return results;
}

const SOURCES = {
  client:     read("src/lib/conversationIdentity.ts"),
  ghlSms:     read("supabase/functions/_shared/ghlSms.ts"),
  sql:        read("supabase/migrations/20260815090000_command_center_identity_search_and_ghl_sync.sql"),
  callFn:     read("supabase/functions/ghl-call-inbound/index.ts"),
  smsFn:      read("supabase/functions/ghl-sms-inbound/index.ts"),
  reconciler: read("supabase/functions/ghl-reconcile-communications/index.ts"),
  thread:     read("src/pages/admin-orders/components/commandCenter/UnifiedThreadPane.tsx"),
  drawer:     read("src/pages/admin-orders/components/CommDetailDrawer.tsx"),
};

console.log("\nCommand Center identity & sync guards\n");
for (const [name, problems] of runGuards(SOURCES)) {
  if (problems.length === 0) pass(name);
  else { fail(name); for (const p of problems) console.error(`      · ${p}`); }
}

// ─────────────────────────────────────────────────────────────────────────────
// NEGATIVE CONTROLS — each guard must FAIL on a deliberately broken input.
// If a guard stays green here it is not testing what its name claims.
// ─────────────────────────────────────────────────────────────────────────────
if (SELF_TEST) {
  console.log("\nNegative controls (each guard must catch a planted defect)\n");
  let ncFail = 0;
  const expectCaught = (label, problems) => {
    if (problems.length > 0) console.log(`  ✓ caught: ${label}`);
    else { ncFail++; console.error(`  ✗ NOT CAUGHT (guard is a no-op): ${label}`); }
  };

  expectCaught("browser normalizer drops the 11..15 bound",
    GUARDS.normalizerAgreement(
      SOURCES.client.replace("digits.length < 11 || digits.length > 15", "false"),
      SOURCES.ghlSms, SOURCES.sql));

  expectCaught("SQL normalizer drops the 10-digit rule",
    GUARDS.normalizerAgreement(SOURCES.client, SOURCES.ghlSms,
      SOURCES.sql.replace("length(d.digits) = 10", "length(d.digits) = 99")));

  expectCaught("call webhook stores the raw payload phone again",
    GUARDS.inboundNormalises(
      SOURCES.callFn.replace(/\.\.\.buildInboundColumns\(\{[\s\S]*?\}\),/, "phone_from: phone,"),
      SOURCES.smsFn));

  expectCaught("sms webhook reverts to phone ilike + limit(1)",
    GUARDS.noFirstMatchIdentity(SOURCES.callFn,
      SOURCES.smsFn.replace("const identity = await resolveInboundIdentity(supabase, phone);",
        'const { data: o } = await supabase.from("orders").select("id").ilike("phone", `%${p}`).limit(1);')));

  expectCaught("webhook logs the raw payload again",
    GUARDS.noPiiInLogs(
      SOURCES.callFn.replace(/console\.log\("\[GHL-CALL-INBOUND\] payload keys:[^;]*\);/,
        'console.log("[GHL-CALL-INBOUND] payload:", JSON.stringify(payload));'),
      SOURCES.smsFn));

  expectCaught("webhook logs the message body again",
    GUARDS.noPiiInLogs(SOURCES.callFn,
      SOURCES.smsFn + '\nconsole.log(`body: ${message.slice(0, 100)}`);\n'));

  expectCaught("reconciler gains a send path",
    GUARDS.reconcilerCannotSend(
      SOURCES.reconciler + '\nimport { sendGhlSms } from "../_shared/ghlSms.ts";\nsendGhlSms({});\n'));

  expectCaught("reconciler stops excluding ghl_origin",
    GUARDS.reconcilerCannotSend(SOURCES.reconciler.replaceAll("ghl_origin", "some_other_state")));

  // replaceAll, not replace: `checkDnd: true` appears FIRST in the composer's
  // doc comment, so a single replace edited the prose and left the real call
  // untouched — the guard then correctly still passed and the control looked
  // like a guard failure when it was a control failure.
  expectCaught("composer stops requesting DND verification",
    GUARDS.composerUsesCanonicalPath(SOURCES.thread.replaceAll("checkDnd: true", "checkDnd: false")));

  expectCaught("composer loses its double-send guard",
    GUARDS.composerUsesCanonicalPath(SOURCES.thread.replaceAll("inFlightRef", "someOtherRef")
      .replace("operationToken,", "")));

  expectCaught("thread body becomes clipped",
    GUARDS.fullBodyRendered(SOURCES.thread.replaceAll("whitespace-pre-wrap", "truncate"), SOURCES.drawer));

  expectCaught("drawer renders message content as HTML",
    GUARDS.fullBodyRendered(SOURCES.thread,
      SOURCES.drawer.replace("{fullBody ||", "{/* */} <div dangerouslySetInnerHTML={{__html: fullBody}} /> || (")));

  expectCaught("row-level order link is evaluated before ambiguity",
    GUARDS.ambiguityOutranksRowLink(SOURCES.sql.replace(
      /resolved as \(([\s\S]*?)\)\s*\n\s*select/,
      `resolved as (
    select m.*,
           case
             when m.linked_order is not null then 'linked'
             when coalesce(m.people, 0) > 1  then 'ambiguous'
             else 'unknown'
           end as istate
      from merged m
  )
  select`)));

  if (ncFail > 0) {
    console.error(`\n${ncFail} negative control(s) were NOT caught — those guards prove nothing.\n`);
    failures += ncFail;
  } else {
    console.log("\nAll negative controls caught their planted defect.\n");
  }
}

if (failures > 0) {
  console.error(`\nFAILED — ${failures} problem(s).\n`);
  process.exit(1);
}
console.log("\nAll Command Center identity & sync guards passed.\n");
