#!/usr/bin/env node
// check-otp-dual-channel.mjs — OTP-EMAIL-PRIMARY-DELIVERY-001
// (supersedes ASSESSMENT-OTP-DUAL-CHANNEL-001 by owner decision, 2026-08-19)
//
// Policy under guard: EMAIL IS PRIMARY, SMS IS BEST-EFFORT SECONDARY.
//   * One code is generated; the SAME code goes to both channels.
//   * The code stays active when email OR SMS succeeded.
//   * The code is deleted only when BOTH channels failed — and then only the
//     code the request issued, so a failed resend never destroys a still-valid
//     earlier code (insert-before-delete ordering).
//   * A missing/undialable phone skips SMS; it never blocks the send and never
//     invalidates an email-accepted code.
//   * The customer-facing message names exactly the channels that delivered.
//   * The OTP value never appears in a response, log line or analytics call.
//
// WHY THE PREVIOUS POLICY WAS RETIRED: the both-channels-required rule deleted
// an email-accepted code the moment GHL refused the SMS, so a fake/unreachable
// phone invalidated a code the customer was already holding in their inbox.
//
// This guard EXECUTES the real decision table (_shared/otpDeliveryPolicy.ts,
// transpiled with esbuild) with stubbed outcomes, then pins the handler's DB
// wiring and the callers at source level (comment-stripped).
//
// Run:  node scripts/check-otp-dual-channel.mjs
// Self: node scripts/check-otp-dual-channel.mjs --self-test   (negative controls)

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { transform } from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY = "supabase/functions/_shared/otpDeliveryPolicy.ts";
const FN = "supabase/functions/send-customer-otp/index.ts";
const VERIFY = "supabase/functions/verify-customer-otp/index.ts";
const STEP = "src/pages/assessment/components/CustomerOtpStep.tsx";
const ESA = "src/pages/assessment/page.tsx";
const PSD = "src/pages/psd-assessment/page.tsx";

let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures++; };
const pass = (m) => console.log(`  ✓ ${m}`);
const ok = (cond, m) => (cond ? pass(m) : fail(m));

/** CRLF normalise — a CRLF checkout has silently disarmed anchors in this repo. */
const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/**
 * Strip comments before asserting.
 * GUARD-ASSERTIONS-MUST-TEST-USE-NOT-MENTION: these files explain the policy
 * at length in prose. Scanning raw text would match the explanation instead of
 * the implementation.
 */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/^\s*\*.*$/gm, " ");
}

/** Transpile + import a TS module SOURCE STRING (so controls can mutate it). */
async function loadPolicyFromSource(src) {
  const { code } = await transform(src, { loader: "ts", format: "esm", target: "es2022" });
  const tmpDir = join(ROOT, "node_modules", ".cache", "otp-email-primary-guard");
  mkdirSync(tmpDir, { recursive: true });
  const out = join(tmpDir, `policy-${Date.now()}-${Math.floor(Math.random() * 1e6)}.mjs`);
  writeFileSync(out, code, "utf8");
  try {
    return await import(pathToFileURL(out).href);
  } finally {
    // best-effort cleanup happens at process end via rmSync in main paths
  }
}

async function checkPolicy(policySrc) {
  let mod;
  try {
    mod = await loadPolicyFromSource(policySrc);
  } catch (e) {
    fail(`policy module failed to load: ${e.message}`);
    return;
  }
  const d = mod.decideOtpDelivery;
  if (typeof d !== "function") { fail("decideOtpDelivery is not exported"); return; }

  const both = d({ emailOk: true, smsOk: true, smsAttempted: true });
  ok(both.keepNewCode && both.ok && both.httpStatus === 200, "email+SMS success keeps the code active");
  ok(both.message === "We sent your code by email and SMS.", "email+SMS message names both channels");

  const emailOnly = d({ emailOk: true, smsOk: false, smsAttempted: true });
  ok(emailOnly.keepNewCode && emailOnly.ok, "email success + SMS failure KEEPS the code active (the incident case)");
  ok(!emailOnly.deleteNewCode, "email-accepted code is never deleted because SMS failed");
  ok(/by email\. SMS delivery was unavailable/.test(emailOnly.message),
    "email-only message admits the SMS did not deliver");
  ok(emailOnly.channels.email === true && emailOnly.channels.sms === false,
    "channels report email=true sms=false truthfully");

  const emailNoPhone = d({ emailOk: true, smsOk: false, smsAttempted: false });
  ok(emailNoPhone.keepNewCode && emailNoPhone.message === "We sent your code by email.",
    "email success with no dialable phone keeps the code and claims email only");

  const smsOnly = d({ emailOk: false, smsOk: true, smsAttempted: true });
  ok(smsOnly.keepNewCode && smsOnly.ok, "email failure + SMS success keeps the code active");
  ok(/Email delivery was unavailable, but we sent your code by SMS/.test(smsOnly.message),
    "SMS-only message admits the email did not deliver");

  const neither = d({ emailOk: false, smsOk: false, smsAttempted: true });
  ok(neither.deleteNewCode && !neither.keepNewCode && !neither.ok,
    "double failure deletes the new code and reports failure");
  ok(!neither.deletePriorCodes,
    "double failure NEVER deletes prior codes (a failed resend preserves a still-valid code)");

  for (const o of [both, emailOnly, emailNoPhone, smsOnly, neither]) {
    ok(o.keepNewCode === !o.deleteNewCode, "keepNewCode and deleteNewCode are exact opposites");
    ok(!o.deletePriorCodes || o.keepNewCode, "prior codes are removed only when the new code is kept");
    ok(!/\d{6}/.test(o.message), "no message can contain a 6-digit code");
  }
}

function checkFunction(raw) {
  const c = codeOnly(raw);

  ok(/import\s*\{[^}]*sendGhlSms[^}]*\}\s*from\s*["']\.\.\/_shared\/ghlSms\.ts["']/.test(c),
    "function imports sendGhlSms from the canonical _shared/ghlSms.ts");
  ok(/import\s*\{[^}]*decideOtpDelivery[^}]*\}\s*from\s*["']\.\.\/_shared\/otpDeliveryPolicy\.ts["']/.test(c),
    "function imports the shared delivery-policy decision table");
  ok(/decideOtpDelivery\s*\(/.test(c), "function actually calls decideOtpDelivery()");
  ok(!/twilio/i.test(c), "function introduces no direct Twilio delivery path");

  // EMAIL-PRIMARY: a missing/undialable phone must NOT reject the request.
  ok(/normalizeE164\s*\(/.test(c), "phone is still normalised to E.164");
  ok(!/if\s*\(\s*!\s*phone\s*\)\s*return/.test(c),
    "a missing/undialable phone no longer blocks the send (email is primary)");

  // ONE code, both channels: the same `otp` binding feeds email and SMS.
  const otpGenCount = (c.match(/=\s*generateOTP\s*\(\s*\)/g) || []).length;
  ok(otpGenCount === 1, `exactly one OTP is generated (found ${otpGenCount} generateOTP() call sites)`);
  ok(/buildEmail\s*\(\s*[\w.]+\s*,\s*otp\s*\)/.test(c), "the generated code is what goes into the email");
  ok(/message:\s*`\$\{otp\}/.test(raw), "the SAME generated code is what goes into the SMS");
  ok(/Promise\.all\s*\(/.test(c), "both channels are dispatched together");

  // A missing Resend key is an email-channel FAILURE, not an early return that
  // abandons the SMS channel and deletes the code.
  ok(/resendKey\s*\?\s*fetch/.test(c),
    "a missing RESEND_API_KEY degrades to email-channel failure instead of aborting");

  // RESEND SAFETY — insert first, delete later, and delete precisely:
  //  * the ONLY email-wide delete must exclude the just-inserted row (.neq)
  //  * the both-fail delete must target the new row's id alone
  ok(!/\.delete\(\)\.eq\(\s*["']email["']\s*,\s*email\s*\)\s*;/.test(c.replace(/\n\s*/g, "")),
    "no unqualified email-wide delete remains (old delete-then-insert ordering)");
  const emailWideDeletes = (c.match(/\.delete\(\)[\s\S]{0,80}?\.eq\(\s*["']email["']\s*,\s*email\s*\)/g) || []);
  ok(emailWideDeletes.length > 0 && emailWideDeletes.every((d0, i, arr) => {
    // find the text right after each match in c to require .neq("id"
    let idx = -1; let all = true;
    for (const m of arr) {
      idx = c.indexOf(m, idx + 1);
      const tail = c.slice(idx + m.length, idx + m.length + 60);
      if (!/^\s*\.neq\(\s*["']id["']/.test(tail)) all = false;
    }
    return all;
  }), "every email-wide delete excludes the just-inserted code (.neq(\"id\", …))");
  ok(/\.delete\(\)\.eq\(\s*["']id["']\s*,\s*insRow\.id\s*\)/.test(c.replace(/\n\s*/g, "")),
    "the double-failure path deletes ONLY the new code (id-scoped)");
  ok(/\.insert\(\{[\s\S]{0,400}?\}\)\.select\(\s*["']id["']\s*\)\.single\(\)/.test(c),
    "the insert captures the new row id (insert-before-delete design)");
  const insIdx = c.indexOf(".insert({");
  const priorDeleteIdx = c.indexOf('.delete()');
  ok(insIdx >= 0 && (priorDeleteIdx === -1 || c.indexOf(".delete()", 0) > -1),
    "insert exists");
  // deletes that touch customer_otp_codes must all come AFTER the insert
  {
    const beforeInsert = c.slice(0, insIdx);
    ok(!/customer_otp_codes["']\s*\)\s*\.delete\(/.test(beforeInsert.replace(/\n\s*/g, "")),
      "no customer_otp_codes delete runs before the new code is inserted");
  }

  // The OTP must never leave in a response payload or a log line.
  ok(!/json\(\s*\{[^}]*\botp\b\s*[,:}]/.test(c), "no response payload returns the OTP");
  ok(!/console\.(log|info|warn|error)\([^)]*(\$\{otp\}|,\s*otp\s*[,)]|\botp\s*\+)/.test(c),
    "no console line prints the OTP value");
}

function checkVerify(raw) {
  const c = codeOnly(raw);
  ok(/MAX_ATTEMPTS\s*=\s*6/.test(c), "verify keeps the 6-attempt limit");
  ok(/attempts:\s*\(row\.attempts as number\)\s*\+\s*1/.test(c), "a wrong code increments attempts");
  ok(/expires_at/.test(c) && /expired/i.test(raw), "an expired code is rejected");
  // Single use: the matched code row is deleted on success.
  ok(/\.delete\(\)\.eq\(\s*["']id["']\s*,\s*row\.id\s*\)/.test(c.replace(/\n\s*/g, "")),
    "a correct code is single-use (row deleted)");
  ok(!/json\(\s*\{[^}]*\bcode\b\s*[,:}]/.test(c), "verify never echoes a code back");
}

function checkCallers({ step, esa, psd }) {
  const s = codeOnly(step);
  ok(/phone\s*:\s*string/.test(s), "CustomerOtpStep declares the phone prop");
  ok(/post\(\s*["']send-customer-otp["']\s*,\s*\{[^}]*\bphone\b/.test(s),
    "CustomerOtpStep sends phone to send-customer-otp");
  ok(/maskPhone\s*\(/.test(s) && /maskEmail\s*\(/.test(s),
    "CustomerOtpStep masks both the email and the phone in the UI");

  // CHANNEL-TRUTHFUL UI: the copy comes from the server's channels/message and
  // the header renders per-channel — no unconditional "email and SMS" claim.
  ok(/setChannels\(\s*r\.channels\s*\)/.test(s),
    "CustomerOtpStep records which channels the server actually reached");
  ok(/channels\s*===\s*null\s*\?/.test(step),
    "the header copy is conditional on the delivered channels");
  ok(/r\.message\s*\?\?/.test(s), "the info line prefers the server's channel-accurate message");

  // The verify button must always leave "Verifying…" — success, failure and
  // network error paths each reset the flag.
  const resets = (s.match(/setVerifying\(false\)/g) || []).length;
  ok(resets >= 3, `verify exits the Verifying state on every path (${resets} resets, need >= 3)`);

  for (const [name, src] of [["ESA", esa], ["PSD", psd]]) {
    const c = codeOnly(src);
    const mounts = /<CustomerOtpStep[\s\S]{0,400}?\/>/.exec(c);
    ok(!!mounts, `${name} assessment mounts CustomerOtpStep`);
    ok(!!mounts && /phone=\{/.test(mounts[0]),
      `${name} assessment still passes phone (best-effort SMS stays wired)`);
  }
}

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) {
  console.log("NEGATIVE CONTROLS — assertions below MUST fail.\n");
  const before = failures;

  console.log("[1] policy regressed to both-channels-required (emailOk && smsOk):");
  await checkPolicy(read(POLICY).replace("o.emailOk || o.smsOk", "o.emailOk && o.smsOk"));

  console.log("\n[2] policy deletes prior codes even on double failure:");
  await checkPolicy(read(POLICY).replace("deletePriorCodes: delivered", "deletePriorCodes: true"));

  console.log("\n[3] handler regressions (phone required again, delete-before-insert, OTP logged):");
  checkFunction(
    read(FN)
      .replace(/const phone = normalizeE164\(\(body\.phone \?\? ""\)\.trim\(\)\);/,
        'const phone = normalizeE164((body.phone ?? "").trim());\n    if (!phone) return json({ ok: false }, 400);')
      .replace(/\.neq\("id", insRow\.id\)/, "")
      .replace(/\.delete\(\)\.eq\("id", insRow\.id\)/, '.delete().eq("email", email)')
      .replace(/console\.error\("\[send-customer-otp\] insert failed:", insErr\);/,
        'console.error("[send-customer-otp] insert failed:", insErr, otp);'),
  );

  console.log("\n[4] verify regressions (attempt limit gone, code echoed):");
  checkVerify(
    read(VERIFY)
      .replace(/MAX_ATTEMPTS = 6/, "MAX_ATTEMPTS = 999999")
      .replace(/attempts:\s*\(row\.attempts as number\)\s*\+\s*1/, "attempts: 0")
      .replace(/return json\(\{ ok: true, verified: true/, "return json({ ok: true, verified: true, code"),
  );

  console.log("\n[5] UI regressed to unconditional both-channel copy / stuck Verifying:");
  checkCallers({
    step: read(STEP)
      .replace(/setChannels\(r\.channels\)/, "void r.channels")
      .replace(/channels === null \?/, "false ?")
      .replace(/r\.message \?\? /, "")
      .replace(/setVerifying\(false\);\s*\n\s*setCode\(""\);\s*\n\s*setError\("Could not verify right now\. Please try again\."\);/, 'setError("Could not verify right now.");'),
    esa: read(ESA).replace(/phone=\{[^}]*\}/, ""),
    psd: read(PSD).replace(/phone=\{[^}]*\}/, ""),
  });

  const tripped = failures - before;
  const EXPECTED_MIN = 12;
  console.log("");
  rmSync(join(ROOT, "node_modules", ".cache", "otp-email-primary-guard"), { recursive: true, force: true });
  if (tripped >= EXPECTED_MIN) {
    console.log(`✅ SELF-TEST PASSED — ${tripped} assertions tripped (>= ${EXPECTED_MIN}).`);
    process.exit(0);
  }
  console.error(`❌ SELF-TEST FAILED — only ${tripped} tripped, expected >= ${EXPECTED_MIN}.`);
  process.exit(1);
}

console.log("OTP-EMAIL-PRIMARY-DELIVERY-001\n");
console.log("Delivery policy (executed with stubbed provider outcomes):");
await checkPolicy(read(POLICY));
console.log("\nSend handler (insert-before-delete, precise deletions, no OTP leakage):");
checkFunction(read(FN));
console.log("\nVerify handler (attempt limit, expiry, single use):");
checkVerify(read(VERIFY));
console.log("\nCallers (channel-truthful UI, phone stays wired, Verifying always exits):");
checkCallers({ step: read(STEP), esa: read(ESA), psd: read(PSD) });

console.log("");
rmSync(join(ROOT, "node_modules", ".cache", "otp-email-primary-guard"), { recursive: true, force: true });
if (failures > 0) {
  console.error(`❌ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("✅ OTP is email-primary: a code survives when either channel delivers, dies only when both fail, and the UI never overclaims.");
