#!/usr/bin/env node
// LEAD-FOLLOWUP-GHL-DELIVERY-AND-ADMIN-RESUME-CHECKOUT-EMAIL-002
//
// RUNTIME test for `_shared/ghlSms.ts` — the classifier that decides whether a
// customer is ever contacted about a stage again.
//
// WHY A RUNTIME TEST AND NOT JUST THE STATIC GUARD
// ------------------------------------------------
// `check-lead-followup-sequence-integrity.mjs` asserts the SHAPE of the
// classification table (that the fallthrough returns "permanent", that 5xx
// stays retryable). That catches a deletion; it cannot catch a reordering, a
// pattern list that no longer matches the strings GHL actually sends, or a
// normaliser that quietly accepts a 4-digit number. Those need execution.
//
// Edge functions are Deno TypeScript and sit outside `tsconfig.app.json`, so
// `tsc` never sees this file and there is no Deno binary on the build host.
// esbuild (already a Vite dependency) strips the types so Node can run the real
// module — the same source that ships, not a copy.
//
// The module reads Deno.env only INSIDE functions, so a minimal stub suffices.
//
// Run:  node scripts/test-ghl-sms-classification.mjs

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformSync } from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GREEN = "\x1b[32m", RED = "\x1b[31m", RESET = "\x1b[0m";
const SRC = join(ROOT, "supabase/functions/_shared/ghlSms.ts");

// Stub the Deno global the module reaches for inside its functions.
globalThis.Deno = { env: { get: (k) => process.env[`__STUB_${k}`] ?? "" } };

const tmpDir = join(ROOT, "node_modules", ".ghlsms-test");
mkdirSync(tmpDir, { recursive: true });
const tmpFile = join(tmpDir, "ghlSms.mjs");
writeFileSync(
  tmpFile,
  transformSync(readFileSync(SRC, "utf8"), { loader: "ts", format: "esm" }).code,
);

const { classifyGhlFailure, normalizeE164, testSmsSendBlocked, isTestSupabaseProject } =
  await import(pathToFileURL(tmpFile).href);
rmSync(tmpDir, { recursive: true, force: true });

const results = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, ok, actual, expected });
};

// ── Classification: transient conditions must stay RETRYABLE ────────────────
// Making a blip terminal silently drops a customer who was reachable.
check("429 rate limit → retryable", classifyGhlFailure(429, "Too Many Requests").outcome, "retryable");
check("500 → retryable", classifyGhlFailure(500, "Internal Server Error").outcome, "retryable");
check("502 → retryable", classifyGhlFailure(502, "Bad Gateway").outcome, "retryable");
check("503 → retryable", classifyGhlFailure(503, "Service Unavailable").outcome, "retryable");
check("408 → retryable", classifyGhlFailure(408, "Request Timeout").outcome, "retryable");
check("400 saying 'temporarily unavailable' → retryable",
  classifyGhlFailure(400, "Service temporarily unavailable, try again").outcome, "retryable");

// ── Classification: anything that cannot succeed unchanged is PERMANENT ─────
// This is the incident: 642 identical failures re-attempted every 15 minutes.
check("401 → permanent", classifyGhlFailure(401, "Unauthorized").outcome, "permanent");
check("403 → permanent", classifyGhlFailure(403, "Forbidden").outcome, "permanent");
check("invalid destination → permanent",
  classifyGhlFailure(400, "Invalid phone number").outcome, "permanent");
check("opted out → permanent",
  classifyGhlFailure(400, "Contact has opted out of SMS").outcome, "permanent");
check("unsubscribed → permanent",
  classifyGhlFailure(422, "Recipient unsubscribed").outcome, "permanent");
check("blacklisted → permanent",
  classifyGhlFailure(400, "Number is blacklisted").outcome, "permanent");
check("landline → permanent",
  classifyGhlFailure(400, "Destination is a landline").outcome, "permanent");
check("UNRECOGNISED 4xx → permanent (never loop on the unknown)",
  classifyGhlFailure(418, "some brand new error nobody has seen").outcome, "permanent");
check("unrecognised 4xx carries a safe code",
  classifyGhlFailure(418, "???").code, "provider_rejected");

// Status must beat message text: a 5xx whose body happens to contain the word
// "invalid" is still a server fault, not a bad number.
check("5xx wins over an 'invalid' in the body",
  classifyGhlFailure(500, "invalid internal state").outcome, "retryable");

// ── Normalisation: reject what can only fail at the provider ───────────────
check("10-digit US number gets +1", normalizeE164("8323309603"), "+18323309603");
check("11-digit with country code", normalizeE164("18323309603"), "+18323309603");
check("formatted number", normalizeE164("(832) 330-9603"), "+18323309603");
check("already E.164", normalizeE164("+18323309603"), "+18323309603");
check("empty → rejected", normalizeE164(""), "");
check("null → rejected", normalizeE164(null), "");
check("undefined → rejected", normalizeE164(undefined), "");
check("4-digit junk → rejected", normalizeE164("5551"), "");
check("9-digit short → rejected", normalizeE164("832330960"), "");
check("letters only → rejected", normalizeE164("not-a-phone"), "");
check("over-long → rejected", normalizeE164("1234567890123456"), "");

// ── TEST containment (SMS-LIVE-INCIDENT-001) ───────────────────────────────
// The TEST project holds PRODUCTION GHL credentials. A regression here messages
// real customers from a test run — it has happened once already.
const TEST_URL = "https://opudhofjbydrljgleofq.supabase.co";
const LIVE_URL = "https://cvwbozlbbmrjxznknouq.supabase.co";
check("unknown environment is treated as TEST", isTestSupabaseProject(""), true);
check("TEST url is TEST", isTestSupabaseProject(TEST_URL), true);
check("LIVE url is not TEST", isTestSupabaseProject(LIVE_URL), false);
check("TEST blocks a non-approved number", testSmsSendBlocked("+15551234567", TEST_URL), true);
check("TEST allows approved tester 1", testSmsSendBlocked("+18323309603", TEST_URL), false);
check("TEST allows approved tester 2", testSmsSendBlocked("+18322804249", TEST_URL), false);
check("LIVE is unaffected by the guard", testSmsSendBlocked("+15551234567", LIVE_URL), false);
check("unknown environment blocks a non-approved number", testSmsSendBlocked("+15551234567", ""), true);

for (const r of results) {
  console.log(`  ${r.ok ? GREEN + "PASS" : RED + "FAIL"}${RESET}  ${r.name}` +
    (r.ok ? "" : ` — got ${JSON.stringify(r.actual)}, want ${JSON.stringify(r.expected)}`));
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? GREEN : RED}${results.length - failed}/${results.length} passed.${RESET}`);
if (failed) {
  console.log(`${RED}✗ GHL SMS classification test FAILED${RESET}`);
  process.exit(1);
}
console.log(`${GREEN}✓ GHL SMS: retry classification, phone normalisation and TEST containment verified${RESET}`);
