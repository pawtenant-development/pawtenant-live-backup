// scripts/check-system-health-alert-delivery.mjs
//
// SYSTEM-HEALTH-TECHNICAL-ALERT-DELIVERY-REPAIR-001 — alert delivery guard.
//
// WHAT THIS PINS. The technical-alert path was dead for its entire life.
// `src/lib/auditLogger.ts` posted { to, subject, body } to `send-followup-email`
// with the anon key. That function requires an admin session (→ 401) and reads
// { email, first_name, bulk } (→ 400, and on success would have sent a PROVIDER
// APPLICATION FOLLOW-UP template). An empty catch hid both. Not one alert ever
// arrived. Changing the recipient string did not fix it.
//
//   S1  auditLogger no longer calls send-followup-email at all.
//   S2  auditLogger escalates through the typed reportSystemAlert() client,
//       and never hand-rolls a { to, subject, body } email payload.
//   S3  no service-role key reference anywhere in the shipped frontend.
//   S4  the frontend client cannot express a recipient — no `to` in its type
//       or its request body. An open relay is impossible by construction.
//   S5  the server IGNORES a caller-supplied `to` and derives the recipient
//       from the shared constant.
//   S6  that constant is info@ — the technical mailbox, not accounts@.
//   S7  dedupe, cooldown and an hourly ceiling all exist, so a looping caller
//       cannot flood the mailbox.
//   S8  no silent `catch {}` remains in the alert path.
//   S9  metadata reaching the email body is HTML-escaped.
//   S10 the alert function never invokes itself — no recursive failure loop.
//   S11 the alert function never reuses the customer/provider follow-up
//       function.
//
// Comments are stripped before every "must NOT contain" scan, so commenting
// out real wiring still trips the relevant check.
//
// Usage:
//   node scripts/check-system-health-alert-delivery.mjs
//   node scripts/check-system-health-alert-delivery.mjs --self-test

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "check-system-health-alert-delivery";
const SELF = process.argv.includes("--self-test");
const WARN = process.argv.includes("--warn-only");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const F_AUDIT = "src/lib/auditLogger.ts";
const F_CLIENT = "src/lib/systemAlert.ts";
const F_FN = "supabase/functions/send-system-health-alert/index.ts";
const F_ROLES = "supabase/functions/_shared/roleMailboxes.ts";

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/([^:])\/\/.*$/gm, "$1");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

function loadAll() {
  return {
    audit: readFileSync(join(ROOT, F_AUDIT), "utf8"),
    client: readFileSync(join(ROOT, F_CLIENT), "utf8"),
    fn: readFileSync(join(ROOT, F_FN), "utf8"),
    roles: readFileSync(join(ROOT, F_ROLES), "utf8"),
  };
}

function runChecks(s) {
  const out = [];
  const audit = stripComments(s.audit);
  const client = stripComments(s.client);
  const fn = stripComments(s.fn);
  const roles = stripComments(s.roles);

  const add = (id, desc, ok, detail = "") => out.push({ id, desc, ok, detail });

  // S1 — the dead call site is gone.
  add("S1", "auditLogger does not call send-followup-email",
    !audit.includes("send-followup-email"),
    "send-followup-email still referenced in auditLogger");

  // S2 — escalation goes through the typed client, not a hand-rolled payload.
  const usesClient = /reportSystemAlert\s*\(/.test(audit) &&
    /import\s*\{[^}]*\breportSystemAlert\b[^}]*\}\s*from\s*["'][^"']*systemAlert["']/.test(audit);
  const handRolled = /\bto:\s*[A-Za-z_$][\w$]*\s*,[\s\S]{0,200}?\bsubject:/.test(audit);
  add("S2", "auditLogger escalates via reportSystemAlert, not a raw {to,subject,body}",
    usesClient && !handRolled,
    !usesClient ? "reportSystemAlert not imported/called" : "a raw {to, subject, ...} payload is still built");

  // S3 — no service-role key in shipped frontend.
  // The in-memory copies are checked FIRST so a self-test mutation of
  // auditLogger/systemAlert is actually seen; the disk walk then covers every
  // other frontend file. Reading only from disk would make this check blind to
  // the very mutations that are supposed to trip it.
  const SR_RE = /SERVICE_ROLE|service_role_key|serviceRoleKey/i;
  const srOffenders = [];
  if (SR_RE.test(audit)) srOffenders.push(F_AUDIT);
  if (SR_RE.test(client)) srOffenders.push(F_CLIENT);
  for (const file of walk(join(ROOT, "src"))) {
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, "/");
    if (rel === F_AUDIT || rel === F_CLIENT) continue;   // already covered above
    const body = stripComments(readFileSync(file, "utf8"));
    if (SR_RE.test(body)) srOffenders.push(rel);
  }
  add("S3", "no service-role key reference in shipped src/", srOffenders.length === 0,
    srOffenders.join(", "));

  // S4 — the client cannot express a recipient.
  const clientHasTo = /\bto\s*[?]?\s*:/.test(client) || /"to"\s*:/.test(client);
  add("S4", "frontend alert client has no recipient parameter", !clientHasTo,
    "a `to` field exists in the client — recipient could become caller-controlled");

  // S5 — server ignores caller `to` and uses the shared constant.
  const usesConstant = /to:\s*SYSTEM_ALERT_RECIPIENT/.test(fn) &&
    /import\s*\{[^}]*\bSYSTEM_ALERT_RECIPIENT\b[^}]*\}\s*from\s*["'][^"']*roleMailboxes\.ts["']/.test(fn);
  // A `to` from the body may only be READ to record that it was ignored.
  const honoursCallerTo = /to:\s*(body\.to|callerSupplied|payload\.to|input\.to)\b/.test(fn);
  add("S5", "server sends to the shared constant and never to a caller-supplied address",
    usesConstant && !honoursCallerTo,
    !usesConstant ? "SYSTEM_ALERT_RECIPIENT not used as the recipient" : "a caller-supplied `to` reaches the send call");

  // S6 — the constant is the technical mailbox.
  add("S6", "SYSTEM_ALERT_RECIPIENT resolves to info@pawtenant.com",
    /SYSTEM_ALERT_RECIPIENT\s*=\s*ROLE_MAILBOX\.INFO/.test(roles) &&
    /INFO:\s*"info@pawtenant\.com"/.test(roles),
    "alert recipient is no longer info@");

  // S7 — flood control really exists.
  // Assert the DECLARATIONS with real numeric budgets, not merely that the
  // identifiers appear. A rename leaves the old name behind at the use site,
  // so a mention-only test would keep passing with the limit gone.
  const hasCooldown = /const\s+COOLDOWN_MINUTES\s*=\s*\d+\s*;/.test(fn) &&
    /system_health_alert_sent/.test(fn) && /dedupe_key/.test(fn);
  const hasCeiling = /const\s+MAX_EMAILS_PER_HOUR\s*=\s*\d+\s*;/.test(fn) &&
    /rate_limited/.test(fn);
  const hasDedupeQuery = /gte\(\s*["']created_at["']/.test(fn);
  add("S7", "dedupe cooldown + hourly ceiling both enforced before sending",
    hasCooldown && hasCeiling && hasDedupeQuery,
    !hasCooldown ? "no cooldown/dedupe" : !hasCeiling ? "no hourly ceiling" : "no time-window query");

  // S8 — no silent catch in the alert path.
  const silent = (src) => /catch\s*(\([^)]*\))?\s*\{\s*\}/.test(src);
  const silentIn = [];
  if (silent(audit)) silentIn.push(F_AUDIT);
  if (silent(client)) silentIn.push(F_CLIENT);
  add("S8", "no empty catch {} anywhere in the alert path", silentIn.length === 0,
    silentIn.join(", "));

  // S9 — metadata is escaped before it reaches the email body.
  const metaEscaped = /escapeHtml\(k\)/.test(fn) && /escapeHtml\(v\)/.test(fn);
  add("S9", "alert metadata is HTML-escaped in the email body", metaEscaped,
    "metadata is interpolated without escapeHtml");

  // S10 — no recursion.
  add("S10", "alert function never invokes itself",
    !fn.includes("functions/v1/send-system-health-alert"),
    "the alert function calls its own endpoint — recursive failure loop");

  // S11 — never reuse the customer/provider follow-up mailer.
  add("S11", "alert function does not reuse send-followup-email",
    !fn.includes("send-followup-email"),
    "alert path routes through the provider follow-up function again");

  return out;
}

const CONTROLS = [
  ["S1", "auditLogger calls send-followup-email again",
    (b) => ({ audit: b.audit.replace("await reportSystemAlert({", 'await fetch("/functions/v1/send-followup-email"); await reportSystemAlert({') })],
  ["S2", "auditLogger hand-rolls a {to, subject} payload",
    (b) => ({ audit: b.audit.replace("const result = await reportSystemAlert({", "const p = { to: ALERT, subject: 'x', body: 'y' }; void p;\n      const result = await NOTHING({") })],
  ["S3", "a service-role key leaks into shipped frontend",
    (b) => ({ client: b.client.replace("const ENDPOINT =", "const SERVICE_ROLE_KEY = import.meta.env.VITE_SERVICE_ROLE;\nconst ENDPOINT =") })],
  ["S4", "the client gains a caller-controlled recipient",
    (b) => ({ client: b.client.replace("  alert_type: SystemAlertType;", "  to: string;\n  alert_type: SystemAlertType;") })],
  ["S5", "server honours the caller-supplied recipient",
    (b) => ({ fn: b.fn.replace("to: SYSTEM_ALERT_RECIPIENT,", "to: body.to,") })],
  ["S6", "alert recipient repointed away from info@",
    (b) => ({ roles: b.roles.replace("SYSTEM_ALERT_RECIPIENT = ROLE_MAILBOX.INFO", "SYSTEM_ALERT_RECIPIENT = ROLE_MAILBOX.ACCOUNTS") })],
  ["S7", "hourly ceiling removed",
    (b) => ({ fn: b.fn.replace(/const MAX_EMAILS_PER_HOUR = \d+;/, "const MAX_PER_HOUR_DISABLED = 0;") })],
  ["S7b", "dedupe cooldown removed",
    (b) => ({ fn: b.fn.replace(/const COOLDOWN_MINUTES = \d+;/, "const NO_COOLDOWN = 0;") })],
  ["S8", "silent catch {} reintroduced in the client",
    (b) => ({ client: b.client.replace(/\} catch \(err\) \{[\s\S]*?\n  \}\n\}/, "} catch {}\n}") })],
  ["S9", "metadata interpolated unescaped",
    (b) => ({ fn: b.fn.replace("${escapeHtml(k)}", "${k}").replace("${escapeHtml(v)}", "${v}") })],
  ["S10", "alert function calls itself",
    (b) => ({ fn: b.fn.replace("const CORS = {", 'const SELF_URL = "/functions/v1/send-system-health-alert";\nconst CORS = {') })],
  ["S11", "alert function routes through send-followup-email",
    (b) => ({ fn: b.fn.replace("const CORS = {", 'const FALLBACK = "send-followup-email";\nconst CORS = {') })],
];

try {
  const base = loadAll();

  if (SELF) {
    console.log(`[${NAME}] self-test — every planted regression MUST trip its check\n`);
    let bad = 0;
    for (const [target, label, mutate] of CONTROLS) {
      const patch = mutate(base);
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
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(4)} ${r.desc}${r.ok || !r.detail ? "" : `\n            ↳ ${r.detail}`}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length && !WARN) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
