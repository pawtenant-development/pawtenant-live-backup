#!/usr/bin/env node
// check-otp-dual-channel.mjs — ASSESSMENT-OTP-DUAL-CHANNEL-001
//
// The assessment OTP must reach the customer through BOTH email and SMS, and a
// partial delivery must never be treated as a successful send.
//
// WHY THIS GUARD EXISTS
// ---------------------
// The delivery half and the calling half drifted apart. `send-customer-otp` was
// deployed (TEST v19) requiring a phone number and sending through both Resend
// and canonical GHL SMS — while `CustomerOtpStep` had no `phone` prop at all and
// never sent one. Result: every send returned 400 "a valid mobile number is
// required" and the assessment OTP step was dead on TEST, with the repo copy of
// the function still showing the old email-only implementation.
//
// So this guard checks BOTH SIDES. A regression on either one breaks OTP:
//   * the function must require both channels and fail closed;
//   * the ESA and PSD pages must actually pass the phone through.
//
// Run:  node scripts/check-otp-dual-channel.mjs
// Self: node scripts/check-otp-dual-channel.mjs --self-test   (negative control)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FN = "supabase/functions/send-customer-otp/index.ts";
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
 * Strip comments and template literals before asserting.
 * GUARD-ASSERTIONS-MUST-TEST-USE-NOT-MENTION: these files explain the dual
 * channel rule at length in prose. Scanning raw text would match the
 * explanation instead of the implementation.
 */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/^\s*\*.*$/gm, " ");
}

function checkFunction(raw) {
  const c = codeOnly(raw);

  ok(/import\s*\{[^}]*sendGhlSms[^}]*\}\s*from\s*["']\.\.\/_shared\/ghlSms\.ts["']/.test(c),
    "function imports sendGhlSms from the canonical _shared/ghlSms.ts");
  ok(/sendGhlSms\s*\(/.test(c), "function actually calls sendGhlSms()");
  ok(!/twilio/i.test(c), "function introduces no direct Twilio delivery path");

  // A dialable number is required up front, not discovered after emailing.
  ok(/normalizeE164\s*\(/.test(c) && /valid mobile number is required/i.test(raw),
    "function rejects a missing/undialable phone before sending anything");

  // ONE code, BOTH channels: the same `otp` binding must feed the email body and
  // the SMS message. Two generateOTP() calls would silently send two codes.
  // Count CALL SITES only. A bare /generateOTP\(\)/ also matches the function's
  // own declaration, which would report 2 on correct code.
  const otpGenCount = (c.match(/=\s*generateOTP\s*\(\s*\)/g) || []).length;
  ok(otpGenCount === 1, `exactly one OTP is generated (found ${otpGenCount} generateOTP() call sites)`);
  ok(/buildEmail\s*\(\s*[\w.]+\s*,\s*otp\s*\)/.test(c), "the generated code is what goes into the email");
  ok(/message:\s*`\$\{otp\}/.test(raw), "the SAME generated code is what goes into the SMS");

  // Both channels dispatched together and BOTH results inspected.
  ok(/Promise\.all\s*\(/.test(c), "both channels are dispatched together");
  ok(/if\s*\(\s*!\s*emailRes\.ok\s*\)/.test(c), "the email result is checked");
  ok(/if\s*\(\s*!\s*smsRes\.ok\s*\)/.test(c), "the SMS result is checked");

  // FAIL CLOSED: each failure branch must delete the stored code, so a partially
  // delivered OTP can never be verified.
  const deletes = (c.match(/\.delete\(\)[\s\S]{0,120}?\.eq\(\s*["']code["']\s*,\s*otp\s*\)/g) || []).length;
  ok(deletes >= 2,
    `each failing channel invalidates the stored code (found ${deletes} code-scoped deletes, need >= 2)`);

  // The OTP must never leave in a response payload or a log line.
  ok(!/json\(\s*\{[^}]*\botp\b\s*[,:}]/.test(c), "no response payload returns the OTP");
  // Must match the OTP VARIABLE being logged, not the literal string
  // "send-customer-otp" that prefixes every log line in this file — `\botp\b`
  // matches inside that slug and reported a false positive on correct code.
  ok(!/console\.(log|warn|error)\([^)]*(\$\{otp\}|,\s*otp\s*[,)]|\botp\s*\+)/.test(c),
    "no console line prints the OTP value");
}

function checkCallers({ step, esa, psd }) {
  const s = codeOnly(step);
  ok(/phone\s*:\s*string/.test(s), "CustomerOtpStep declares a required phone prop");
  ok(/\{[^}]*\bphone\b[^}]*\}\s*:\s*Props/.test(s), "CustomerOtpStep destructures phone");
  ok(/post\(\s*["']send-customer-otp["']\s*,\s*\{[^}]*\bphone\b/.test(s),
    "CustomerOtpStep sends phone to send-customer-otp");
  // Never show the raw contact details back to the user.
  ok(/maskPhone\s*\(/.test(s) && /maskEmail\s*\(/.test(s),
    "CustomerOtpStep masks both the email and the phone in the UI");

  for (const [name, src] of [["ESA", esa], ["PSD", psd]]) {
    const c = codeOnly(src);
    const mounts = /<CustomerOtpStep[\s\S]{0,400}?\/>/.exec(c);
    ok(!!mounts, `${name} assessment mounts CustomerOtpStep`);
    ok(!!mounts && /phone=\{/.test(mounts[0]),
      `${name} assessment passes phone to CustomerOtpStep (no email-only regression)`);
  }
}

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) {
  console.log("NEGATIVE CONTROL — assertions below MUST fail.\n");
  const before = failures;

  // Break the function: remove the SMS channel entirely (the email-only regression).
  const brokenFn = read(FN)
    .replace(/import\s*\{[^}]*sendGhlSms[^}]*\}[^\n]*\n/, "")
    .replace(/sendGhlSms\(/g, "noSms(")
    .replace(/if \(!smsRes\.ok\) \{/, "if (false) {")
    .replace(/normalizeE164\(/g, "String(");
  console.log("[1] function regressed to email-only:");
  checkFunction(brokenFn);

  // Break the callers: strip the phone prop from both pages.
  console.log("\n[2] assessment pages stop passing phone:");
  checkCallers({
    step: read(STEP).replace(/phone\s*:\s*string;/, "").replace(/\bphone,/, ""),
    esa: read(ESA).replace(/phone=\{step2\.phone\}\n/, ""),
    psd: read(PSD).replace(/phone=\{step2\.phone\}\n/, ""),
  });

  const tripped = failures - before;
  const EXPECTED_MIN = 8;
  console.log("");
  if (tripped >= EXPECTED_MIN) {
    console.log(`✅ SELF-TEST PASSED — ${tripped} assertions tripped (>= ${EXPECTED_MIN}).`);
    process.exit(0);
  }
  console.error(`❌ SELF-TEST FAILED — only ${tripped} tripped, expected >= ${EXPECTED_MIN}.`);
  process.exit(1);
}

console.log("ASSESSMENT-OTP-DUAL-CHANNEL-001\n");
console.log("Delivery function (both channels required, fail closed):");
checkFunction(read(FN));
console.log("\nCallers (ESA + PSD must pass the phone):");
checkCallers({ step: read(STEP), esa: read(ESA), psd: read(PSD) });

console.log("");
if (failures > 0) {
  console.error(`❌ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("✅ OTP is dual-channel end to end, and neither assessment can regress to email-only.");
