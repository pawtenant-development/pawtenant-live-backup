#!/usr/bin/env node
// PSD-CHECKOUT-CANONICAL-ANSWER-GATE-LIVE-INCIDENT-002 — deployment guard.
//
// WHY THIS EXISTS
// ---------------
// The canonical PSD answer model shipped to LIVE as a payment GATE without its
// WRITER. `get-resume-order` never minted the autosave credential, so the
// browser had nothing to authorise per-answer saves with, `assessment_answers`
// stayed empty, and the gate refused payment to customers who had answered
// every question. Typecheck was clean and review passed: nothing in the build
// knows that a gate and its writer must travel together.
//
// This asserts that pairing. Each check tests the USE, not the mention — the
// file is stripped of comments first, so a check can never be satisfied by the
// very comment that describes it, and the assertions match call shapes rather
// than bare identifiers.
//
// Run from a repo root:  node scripts/guard-psd-persistence.mjs

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Remove line and block comments so a check cannot pass on prose alone. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const CHECKS = [
  {
    file: "supabase/functions/get-resume-order/index.ts",
    name: "lead save MINTS an assessment session",
    // The write itself, not the table name appearing somewhere.
    re: /\.from\(\s*["']assessment_sessions["']\s*\)\s*\.insert\(/,
  },
  {
    file: "supabase/functions/get-resume-order/index.ts",
    name: "minted token is DECLARED and RETURNED to the browser",
    re: /let\s+assessmentToken[\s\S]*JSON\.stringify\(\{[\s\S]*?\bassessmentToken\b[\s\S]*?\}\)/,
  },
  {
    file: "src/pages/psd-assessment/page.tsx",
    name: "browser STORES the credential from the lead-save response",
    re: /storeAssessmentToken\(\s*upsertJson\??\.\??\s*assessmentToken\s*\)/,
  },
  {
    file: "src/pages/psd-assessment/page.tsx",
    name: "completed draft is FLUSHED after the order exists",
    re: /\bflushDraft\(\)/,
  },
  {
    file: "supabase/functions/_shared/psdCompletionGate.ts",
    name: "payment gate can REBUILD canonical rows from a complete projection",
    re: /\.rpc\(\s*[\s\S]{0,40}["']psd_repair_answers_from_projection["']/,
  },
  {
    file: "supabase/functions/create-payment-intent/index.ts",
    name: "payment path still CALLS the completion gate",
    re: /\bcheckPsdAssessmentComplete\s*\(/,
  },
];

let failed = 0;
for (const c of CHECKS) {
  const path = join(ROOT, c.file);
  if (!existsSync(path)) {
    console.error(`FAIL  ${c.name}\n      missing file: ${c.file}`);
    failed++;
    continue;
  }
  const src = stripComments(readFileSync(path, "utf8"));
  if (c.re.test(src)) {
    console.log(`ok    ${c.name}`);
  } else {
    console.error(`FAIL  ${c.name}\n      ${c.file} does not satisfy ${c.re}`);
    failed++;
  }
}

if (failed) {
  console.error(
    `\n${failed} PSD persistence invariant(s) broken.\n` +
      "The canonical answer gate must never ship without the writer that fills it:\n" +
      "a customer who answers every question would be refused payment.",
  );
  process.exit(1);
}
console.log(`\nAll ${CHECKS.length} PSD persistence invariants hold.`);
