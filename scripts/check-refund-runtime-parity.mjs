// scripts/check-refund-runtime-parity.mjs
//
// REFUND-POLICY-RUNTIME-CLEANUP-001
//
// Deterministic, BLOCKING guard for the refund RUNTIME contract:
//   (A) the DB refund-email timing migration uses 5-10 business days, and
//   (B) the deployed AI-support knowledge source reflects the approved refund
//       contract and only genuine knowledge-base consumers are redeployed.
//
// Repo-only (never queries the DB or a deployed function). Positive-presence
// assertions are used because the knowledge base deliberately contains
// "Never say ..." guardrail phrases that naive negative regexes would false-match.
//
// Run:  node scripts/check-refund-runtime-parity.mjs
//       node scripts/check-refund-runtime-parity.mjs --self-test
//
// Read-only: never writes files.

import { readFile, readdir, access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KB = "supabase/functions/_shared/aiSupport/knowledgeBase.ts";
const FUNCS_DIR = "supabase/functions";

// The ONLY functions that should be redeployed for this cleanup — the ones that
// consume the AI-support knowledge base in their replies (directly or via
// prompt.ts, which imports knowledgeBase.ts). Keep this list minimal.
// LIVE consumes the KB only through ai-handle-inbound-chat (no ai-handle-inbound-sms
// on LIVE; SMS is routed via ghl-sms-inbound / ghl-webhook-proxy, which do NOT
// import the knowledge base). REFUND-POLICY-RUNTIME-CLEANUP-001.
const DEPLOY_LIST = ["ai-handle-inbound-chat"];

async function fileExists(p) { try { await access(join(ROOT, p)); return true; } catch { return false; } }
async function rd(p) { return (await fileExists(p)) ? await readFile(join(ROOT, p), "utf8") : null; }

async function findMigration() {
  const dir = join(ROOT, "supabase/migrations");
  try {
    const files = await readdir(dir);
    const m = files.find((f) => /refund_email_timing/i.test(f) && f.endsWith(".sql"));
    return m ? await readFile(join(dir, m), "utf8") : null;
  } catch { return null; }
}

/** Pure checks over a { kb, migration, funcImports } snapshot. Returns failures[]. */
function runChecks(s) {
  const F = [];
  const k = s.kb || "";
  const m = s.migration || "";

  // ── (A) migration ──────────────────────────────────────────────────────────
  if (s.migration == null) F.push("A0. refund_email_timing migration file not found");
  if (!/5[-–]10 business days/i.test(m)) F.push("A1. migration does not set 5-10 business days");
  if (!/replace\s*\(/i.test(m)) F.push("A2. migration is not a safe replace()-based update");

  // ── (B) AI knowledge source ─────────────────────────────────────────────────
  if (s.kb == null) F.push("B0. knowledgeBase.ts not found");
  if (!/5[-–]10 business days/i.test(k)) F.push("B1. KB does not state 5-10 business days refund timing");
  if (!/never say 3[-–]5 days/i.test(k)) F.push('B2. KB missing the "Never say 3-5 days" guardrail');
  if (!/provider non-qualification is refunded in full/i.test(k)) F.push("B3. KB does not state provider non-qualification = full refund");
  if (!/(both esa and psd|esa or psd)/i.test(k)) F.push("B4. KB does not state full refund applies to BOTH ESA and PSD");
  if (!/never say psd orders are non-refundable/i.test(k)) F.push("B5. KB missing the PSD-refundable guardrail");
  if (!/does not automatically qualify for a refund/i.test(k)) F.push("B6. KB does not state a landlord denial does NOT automatically qualify");
  if (!/reviewed by the support team under pawtenant's refund policy/i.test(k)) F.push("B7. KB does not route housing-denial refunds to the Refund Policy review");
  if (!/reviews refund eligibility only/i.test(k)) F.push("B8. KB does not limit PawTenant to refund-eligibility (no legal determination)");
  if (!/hud[^.]{0,60}optional/i.test(k)) F.push("B9. KB does not state the HUD reference is OPTIONAL");
  if (!/never tell a customer a hud complaint is required/i.test(k)) F.push("B10. KB missing the HUD-not-required guardrail");
  if (!/add-on is refunded in full/i.test(k)) F.push("B11. KB does not state RA/add-on provider non-approval = full add-on refund");
  if (!/up to \$40/i.test(k)) F.push("B12. KB does not mention the up-to-$40 provision");
  if (!/discretionary partial or goodwill refunds/i.test(k)) F.push("B13. KB does not describe the $40 as discretionary");
  if (!/does not automatically keep a fee/i.test(k)) F.push("B14. KB does not state PawTenant does NOT automatically keep a fee");
  if (!/never present \$40 as automatic/i.test(k)) F.push("B15. KB missing the '$40-not-automatic' guardrail");

  // ── (C) deploy list — only genuine KB consumers ──────────────────────────────
  for (const fn of DEPLOY_LIST) {
    const imp = s.funcImports[fn];
    if (imp == null) { F.push(`C. deploy-list function ${fn} has no index.ts`); continue; }
    if (!/_shared\/aiSupport\/(knowledgeBase|prompt)\.ts/.test(imp))
      F.push(`C. deploy-list function ${fn} does not import the AI knowledge base — must not be redeployed for this task`);
  }
  return F;
}

async function snapshot() {
  const kb = await rd(KB);
  const migration = await findMigration();
  const funcImports = {};
  for (const fn of DEPLOY_LIST) funcImports[fn] = await rd(`${FUNCS_DIR}/${fn}/index.ts`);
  return { kb, migration, funcImports };
}

async function selfTest(base) {
  console.log("[check-refund-runtime-parity] self-test — negative controls\n");
  const clone = (s) => ({ kb: s.kb, migration: s.migration, funcImports: { ...s.funcImports } });
  const controls = [
    { name: "3-5-day wording returns (migration)", mut: (s) => { s.migration = (s.migration || "").replace(/5[-–]10 business days/gi, "3-5 business days"); } },
    { name: "HUD becomes mandatory", mut: (s) => { s.kb = (s.kb || "").replace(/optional/gi, "required").replace(/never tell a customer a hud complaint is required/gi, "always require a HUD complaint"); } },
    { name: "PSD refunds prohibited", mut: (s) => { s.kb = (s.kb || "").replace(/never say psd orders are non-refundable/gi, "PSD orders are non-refundable"); } },
    { name: "landlord denial becomes automatic refund", mut: (s) => { s.kb = (s.kb || "").replace(/does not automatically qualify for a refund/gi, "automatically qualifies for a full refund"); } },
    { name: "$40 becomes mandatory/automatic", mut: (s) => { s.kb = (s.kb || "").replace(/does not automatically keep a fee/gi, "automatically keeps a fee"); } },
    { name: "RA rejection stops being refundable", mut: (s) => { s.kb = (s.kb || "").replace(/add-on is refunded in full/gi, "add-on is not refundable"); } },
    { name: "unrelated function added to deploy list", mut: (s) => { s.funcImports["stripe-webhook"] = "import { verifyStripeSignature } from '../_shared/verifyStripeSignature.ts';"; DEPLOY_LIST.push("stripe-webhook"); } },
  ];
  const baseN = runChecks(base).length;
  let ok = 0; const bad = [];
  for (const c of controls) {
    const s = clone(base);
    c.mut(s);
    const n = runChecks(s).length;
    if (n > baseN) { ok++; console.log(`  ✓ caught: ${c.name}`); }
    else { bad.push(c.name); console.error(`  ✗ NOT caught: ${c.name}`); }
    if (c.name.includes("deploy list")) DEPLOY_LIST.pop(); // restore
  }
  console.log(`\n[self-test] ${ok}/${controls.length} negative controls caught.`);
  if (bad.length) process.exit(1);
  console.log("[self-test] PASSED — all negative controls fail the guard as expected.");
}

async function main() {
  const base = await snapshot();
  if (process.argv.includes("--self-test")) { await selfTest(base); return; }

  console.log("[check-refund-runtime-parity] refund runtime contract\n");
  const failures = runChecks(base);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error(`\n[check-refund-runtime-parity] FAILED — ${failures.length} violation(s).`);
    process.exit(1);
  }
  console.log("  ✓ migration sets refund timing to 5-10 business days (safe replace()).");
  console.log("  ✓ AI knowledge: full refund on non-qualification (ESA + PSD); RA non-approval = full add-on refund.");
  console.log("  ✓ AI knowledge: housing-denial reviewed under Refund Policy; HUD optional; eligibility only, no legal call.");
  console.log("  ✓ AI knowledge: up-to-$40 discretionary, never automatic; no 3-5-day wording.");
  console.log(`  ✓ deploy list = only genuine KB consumers: ${DEPLOY_LIST.join(", ")}.`);
  console.log("\n[check-refund-runtime-parity] PASSED — refund runtime contract green.");
}

main().catch((err) => { console.error("[check-refund-runtime-parity] fatal:", err); process.exit(1); });
