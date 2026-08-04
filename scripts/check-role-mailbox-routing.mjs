// scripts/check-role-mailbox-routing.mjs
//
// MICROSOFT-365-PRECUTOVER-BACKEND-ROLE-MAILBOX-REMEDIATION-001 — routing guard.
//
// WHAT THIS PINS. Before the Microsoft 365 MX cutover, PawTenant's role
// mailboxes were only partly wired. `support@pawtenant.com` was a live sender
// (189 LIVE sends) with NO Reply-To, so every customer answering a review
// request landed in a second inbox nobody watches. A dead `admin@pawtenant.com`
// constant sat in auditLogger.ts pretending to be a Stripe alert route.
//
//   R1  the five owner-confirmed role mailboxes are declared once, centrally,
//       in _shared/roleMailboxes.ts — not scattered as ad-hoc literals.
//   R2  send-review-request's From is the CENTRAL support sender. It must not
//       drift back to a hardcoded literal or silently collapse into hello@.
//   R3  send-review-request attaches Reply-To INSIDE the Resend payload — a
//       mention in a comment or an unused const does not count as wiring.
//   R4  auditLogger.ts routes its alert to a role mailbox, never to the dead
//       admin@ address.
//   R5  admin@pawtenant.com appears nowhere in shipped frontend code, in any
//       form — constant, placeholder or copy.
//
// Comments are stripped before every "must NOT contain" scan, so a control
// that merely comments out the real wiring still trips the check. Address
// literals are NOT stripped: for these checks the literal IS the value.
//
// Usage:
//   node scripts/check-role-mailbox-routing.mjs
//   node scripts/check-role-mailbox-routing.mjs --self-test

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "check-role-mailbox-routing";
const SELF = process.argv.includes("--self-test");
const WARN = process.argv.includes("--warn-only");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const F_ROLES = "supabase/functions/_shared/roleMailboxes.ts";
const F_REVIEW = "supabase/functions/send-review-request/index.ts";
const F_AUDIT = "src/lib/auditLogger.ts";

const ROLES = [
  "accounts@pawtenant.com",
  "hello@pawtenant.com",
  "support@pawtenant.com",
  "info@pawtenant.com",
  "socials@pawtenant.com",
];

/** Strip // line comments and block comments. Leaves string literals intact. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/([^:])\/\/.*$/gm, "$1");
}

/**
 * Extract the `resendPayload` object literal by brace matching, so we can
 * assert a key is really IN the payload rather than merely near it.
 */
function payloadBlock(src) {
  const anchor = src.indexOf("const resendPayload");
  if (anchor === -1) return "";
  const open = src.indexOf("{", anchor);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return "";
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

function loadAll() {
  return {
    roles: readFileSync(join(ROOT, F_ROLES), "utf8"),
    review: readFileSync(join(ROOT, F_REVIEW), "utf8"),
    audit: readFileSync(join(ROOT, F_AUDIT), "utf8"),
  };
}

function runChecks(s) {
  const out = [];
  const roles = stripComments(s.roles);
  const review = stripComments(s.review);
  const audit = stripComments(s.audit);

  // R1 — central declaration of all five role mailboxes.
  const missing = ROLES.filter((addr) => !roles.includes(`"${addr}"`));
  out.push({
    id: "R1",
    desc: "roleMailboxes.ts declares all five owner-confirmed role mailboxes",
    ok: missing.length === 0,
    detail: missing.length ? `missing: ${missing.join(", ")}` : "",
  });

  // R2 — support sender comes from the central module, not a literal.
  const importsSupport = /import\s*\{[^}]*\bSUPPORT_FROM\b[^}]*\}\s*from\s*["'][^"']*roleMailboxes\.ts["']/.test(review);
  const fromIsCentral = /const\s+FROM_EMAIL\s*=\s*SUPPORT_FROM\s*;/.test(review);
  out.push({
    id: "R2",
    desc: "send-review-request From = central SUPPORT_FROM (support@, not a literal)",
    ok: importsSupport && fromIsCentral,
    detail: !importsSupport ? "SUPPORT_FROM not imported" : !fromIsCentral ? "FROM_EMAIL is not SUPPORT_FROM" : "",
  });

  // R3 — Reply-To is wired INSIDE the Resend payload (the use, not a mention).
  const block = payloadBlock(review);
  const replyWired = /reply_to\s*:\s*OPERATIONAL_REPLY_TO\s*,/.test(block);
  const importsReply = /import\s*\{[^}]*\bOPERATIONAL_REPLY_TO\b[^}]*\}\s*from\s*["'][^"']*roleMailboxes\.ts["']/.test(review);
  out.push({
    id: "R3",
    desc: "review-request Resend payload carries reply_to: OPERATIONAL_REPLY_TO (hello@)",
    ok: Boolean(block) && replyWired && importsReply,
    detail: !block ? "resendPayload literal not found" : !replyWired ? "reply_to absent from the payload object" : !importsReply ? "OPERATIONAL_REPLY_TO not imported" : "",
  });

  // R4 — the technical-alert recipient is SERVER-owned.
  //
  // Contract updated by SYSTEM-HEALTH-TECHNICAL-ALERT-DELIVERY-REPAIR-001.
  // This used to assert `ALERT_EMAIL === "info@pawtenant.com"` inside
  // auditLogger. That constant is now deliberately GONE: the browser must not
  // name a recipient at all, because the alert endpoint is reachable
  // anonymously and a caller-chosen address would make it an open relay. The
  // stronger contract is therefore "the frontend holds no address, and the
  // server constant is info@".
  const frontendAddr = audit.match(/["'][A-Za-z0-9._%+-]+@pawtenant\.com["']/);
  const serverOwned = /SYSTEM_ALERT_RECIPIENT\s*=\s*ROLE_MAILBOX\.INFO/.test(roles) &&
    /INFO:\s*"info@pawtenant\.com"/.test(roles);
  out.push({
    id: "R4",
    desc: "technical-alert recipient is server-owned (info@); auditLogger names no address",
    ok: !frontendAddr && serverOwned,
    detail: frontendAddr
      ? `auditLogger still hardcodes a recipient: ${frontendAddr[0]}`
      : !serverOwned ? "SYSTEM_ALERT_RECIPIENT is not ROLE_MAILBOX.INFO" : "",
  });

  // R5 — admin@pawtenant.com is gone from all shipped frontend code.
  const offenders = [];
  for (const file of walk(join(ROOT, "src"))) {
    const body = stripComments(readFileSync(file, "utf8"));
    if (body.includes("admin@pawtenant.com")) offenders.push(file.slice(ROOT.length + 1));
  }
  out.push({
    id: "R5",
    desc: "admin@pawtenant.com appears nowhere in shipped src/ code",
    ok: offenders.length === 0,
    detail: offenders.length ? `found in: ${offenders.join(", ")}` : "",
  });

  return out;
}

// [targetCheckId, label, mutate]
const CONTROLS = [
  ["R1", "drop accounts@ from the central role map",
    (b) => ({ roles: b.roles.replace('"accounts@pawtenant.com"', '"nope@pawtenant.com"') })],
  ["R2", "hardcode the From back to a literal",
    (b) => ({ review: b.review.replace("const FROM_EMAIL = SUPPORT_FROM;", 'const FROM_EMAIL = "PawTenant <support@pawtenant.com>";') })],
  ["R2b", "collapse the support sender into hello@",
    (b) => ({ review: b.review.replace("const FROM_EMAIL = SUPPORT_FROM;", "const FROM_EMAIL = OPERATIONAL_REPLY_TO;") })],
  ["R3", "delete reply_to from the Resend payload",
    (b) => ({ review: b.review.replace(/^\s*reply_to: OPERATIONAL_REPLY_TO,\n/m, "") })],
  ["R3b", "comment out reply_to (mention, not use)",
    (b) => ({ review: b.review.replace("reply_to: OPERATIONAL_REPLY_TO,", "// reply_to: OPERATIONAL_REPLY_TO,") })],
  ["R4", "reintroduce a hardcoded recipient in the frontend",
    (b) => ({ audit: b.audit.replace("const STRIPE_CLIENT_SECRET_THRESHOLD", 'const ALERT_EMAIL = "admin@pawtenant.com";\nconst STRIPE_CLIENT_SECRET_THRESHOLD') })],
  ["R4b", "repoint the server-owned alert recipient away from info@",
    (b) => ({ roles: b.roles.replace("SYSTEM_ALERT_RECIPIENT = ROLE_MAILBOX.INFO", "SYSTEM_ALERT_RECIPIENT = ROLE_MAILBOX.ACCOUNTS") })],
];

try {
  const base = loadAll();

  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST trip its check\n`);
    let bad = 0;
    for (const [target, label, mutate] of CONTROLS) {
      const patch = mutate(base);
      // A control that fails to modify the source proves nothing.
      const changed = Object.keys(patch).some((k) => patch[k] !== base[k]);
      const results = runChecks({ ...base, ...patch });
      const hit = results.find((r) => r.id === target.replace(/[a-z]+$/, ""));
      const tripped = changed && hit && !hit.ok;
      if (!tripped) bad++;
      console.log(`  ${tripped ? "CAUGHT " : changed ? "MISSED " : "NO-OP  "} ${target.padEnd(4)} ${label}`);
    }
    console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const results = runChecks(base);
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(3)} ${r.desc}${r.ok || !r.detail ? "" : `\n           ↳ ${r.detail}`}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length && !WARN) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
