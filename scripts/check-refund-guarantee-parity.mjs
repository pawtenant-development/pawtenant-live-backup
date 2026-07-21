// scripts/check-refund-guarantee-parity.mjs
//
// REFUND-POLICY-HOUSING-DENIAL-IMPLEMENTATION-001
//
// Deterministic, BLOCKING guard for the layered Refund Policy / housing-denial
// contract. Exits non-zero on any violation so `npm run build` fails fast.
//
// Design principle (owner correction): the DETAILED refund rules live ONLY in
// the dedicated Refund Policy (and the concise Terms summary + internal support
// surfaces). Checkout and marketing pages stay brief. So this guard does NOT
// require every condition to appear on checkout or every page — it verifies the
// source-of-truth exists, that public pages don't CONTRADICT it, that the
// up-to-$40 rule is discretionary (never automatic), and that checkout stays
// free of newly-added detailed refund-policy copy.
//
// Run:  node scripts/check-refund-guarantee-parity.mjs
//       node scripts/check-refund-guarantee-parity.mjs --self-test   (negative controls)
//
// Read-only: never writes files.

import { readFile, access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── file paths ───────────────────────────────────────────────────────────────
const REFUND_POLICY = "src/pages/refund-policy/page.tsx";
const TERMS = "src/pages/terms-of-use/page.tsx";
const PRIVACY = "src/pages/privacy-policy/page.tsx";
const PLAN_CARDS = "src/data/planPricingCards.ts";
const CREATE_REFUND = "supabase/functions/create-refund/index.ts";

// Customer-facing marketing / guarantee / landlord surfaces scanned for
// contradictions (curated so internal admin/provider files are excluded).
const PUBLIC_SCAN = [
  REFUND_POLICY,
  "src/pages/no-risk-guarantee/page.tsx",
  "src/pages/faqs/page.tsx",
  "src/pages/esa-letter-cost/page.tsx",
  "src/pages/psd-letter-cost/page.tsx",
  "src/pages/housing-rights/page.tsx",
  "src/pages/contact-us/page.tsx",
  "src/pages/how-to-get-esa/page.tsx",
  "src/pages/is-pawtenant-legit/page.tsx",
  "src/pages/best-online-esa-letter-service/page.tsx",
  "src/pages/landlord-denied-esa-letter/page.tsx",
  "src/pages/can-landlord-reject-esa-letter/page.tsx",
  "src/pages/can-a-landlord-deny-a-psd-letter/page.tsx",
  "src/pages/my-orders/page.tsx",
  "src/config/seoConfig.ts",
  PLAN_CARDS,
  "src/mocks/blogPosts.ts",
  "public/llms.txt",
];

// Checkout components that MUST stay free of newly-added $40 / detailed policy.
const CHECKOUT_FILES = [
  "src/pages/assessment/components/StripeCardForm.tsx",
  "src/pages/assessment/components/StripePaymentForm.tsx",
  "src/pages/assessment/components/KlarnaPaymentTab.tsx",
  "src/pages/assessment/components/QRPaymentTab.tsx",
  "src/pages/assessment/components/PackageSelectionStep.tsx",
  "src/pages/assessment/components/step3/RefundReassurance.tsx",
  "src/pages/assessment/components/Step3Checkout.tsx",
  "src/pages/psd-assessment/components/PSDStep3Checkout.tsx",
];

// Frontend surfaces where refund timing is stated — must be 5–10, never 3–5.
const TIMING_FILES = [
  REFUND_POLICY,
  "src/pages/no-risk-guarantee/page.tsx",
  "src/pages/faqs/page.tsx",
  "src/pages/my-orders/page.tsx",
  "src/pages/admin-orders/components/CommunicationsTemplatesPanel.tsx",
];

// ── forbidden-pattern sets ───────────────────────────────────────────────────
const FORBIDDEN_PUBLIC = [
  { re: /no questions asked/i, label: '"no questions asked"' },
  { re: /every penny back/i, label: '"every penny back"' },
  { re: /landlord denies\?\s*full refund/i, label: '"Landlord denies? Full refund"' },
  { re: /all landlord denials/i, label: '"all landlord denials …"' },
  { re: /\bletter does(n['’]?t| not) work\b/i, label: '"letter doesn\'t work"' },
  { re: /100% refund if your letter/i, label: '"100% refund if your letter…"' },
  { re: /cannot[^.]{0,30}deny a valid ESA letter/i, label: '"cannot … deny a valid ESA letter"' },
  { re: /unlawfully denies your letter/i, label: '"unlawfully denies your letter"' },
];
const FORBIDDEN_ADJUDICATION = [
  { re: /confirm(?:s|ing)?[^.]{0,25}unlawful denial/i, label: 'claims to confirm an unlawful denial' },
  { re: /verified[^.]{0,25}unlawful denial/i, label: 'claims a "verified unlawful denial"' },
];
const FORBIDDEN_HUD_MANDATORY = [
  { re: /must file a[^.]{0,25}HUD/i, label: '"must file a … HUD"' },
  { re: /requires? a HUD complaint/i, label: '"requires a HUD complaint"' },
  { re: /HUD complaint (?:number )?is required/i, label: '"HUD complaint is required"' },
];
const CHECKOUT_FORBIDDEN = [
  { re: /\$40\b/, label: '"$40"' },
  { re: /refund-policy/i, label: "a /refund-policy link" },
  { re: /administrative services fee/i, label: "retained-services-fee copy" },
  { re: /housing.?denial/i, label: "housing-denial policy copy" },
  { re: /no questions asked/i, label: '"no questions asked"' },
];
const TIMING_FORBIDDEN = /3\s*(?:–|-|&ndash;)\s*5 business days/i;
const BACKEND_FEE_FORBIDDEN = [
  /administrative[_ ]?services?[_ ]?fee/i,
  /\bretain(?:ed)?[_ ]?fee\b/i,
  /\badmin(?:istrative)?fee\b/i,
  /SERVICES_FEE/,
];

// ── harness ──────────────────────────────────────────────────────────────────
async function fileExists(p) {
  try { await access(join(ROOT, p)); return true; } catch { return false; }
}
async function readAll(paths) {
  const map = {};
  for (const p of paths) {
    map[p] = (await fileExists(p)) ? await readFile(join(ROOT, p), "utf8") : null;
  }
  return map;
}

/**
 * Pure check function over a { path: contents|null } map. Returns an array of
 * failure strings. Used by both the real run and the in-memory self-test.
 */
function runChecks(f) {
  const F = [];
  const rp = f[REFUND_POLICY] || "";
  // Tag-stripped copy so <strong>/<em> boundaries don't split required phrases
  // (e.g. "<strong>does not apply</strong> to:"). Used for POSITIVE checks only.
  const rpS = rp.replace(/<[^>]*>/g, " ").replace(/&ndash;/g, "-").replace(/\s+/g, " ");

  // 1. /refund-policy exists.
  if (f[REFUND_POLICY] == null) F.push("1. src/pages/refund-policy/page.tsx is missing");

  // 3 + 4. Refund Policy distinguishes provider non-qualification (full refund)
  //        from housing-denial review.
  if (!/Housing-Denial Review/i.test(rpS))
    F.push("3. Refund Policy is missing a distinct housing-denial review section");
  if (!(/not qualify/i.test(rpS) && /full refund/i.test(rpS)))
    F.push("4. Refund Policy does not state a full refund for provider non-qualification");

  // 5. up-to-$40 rule exists.
  if (!/up to\s*\$40/i.test(rpS))
    F.push("5. Refund Policy is missing the up-to-$40 provision");

  // 6. $40 rule is discretionary, not automatic.
  if (!/discretionary/i.test(rpS))
    F.push("6. Refund Policy fee is not described as discretionary");
  if (!/not an automatic deduction/i.test(rpS))
    F.push('6. Refund Policy fee is missing the "not an automatic deduction" qualifier');
  if (/automatic\s*\$40|\$40[^.]{0,20}(deducted from every|mandatory)/i.test(rpS))
    F.push("6. Refund Policy describes the $40 fee as automatic/mandatory");

  // 7. Full-refund categories are expressly exempt from the fee.
  if (!/does not apply to[\s\S]{0,300}provider non-qualification/i.test(rpS))
    F.push("7. Refund Policy fee section does not exempt provider non-qualification / full-refund categories");

  // 13. Timing is 5–10 business days in the Refund Policy.
  if (!/5.{0,12}10 business days/i.test(rpS))
    F.push("13. Refund Policy does not state 5–10 business days timing");

  // 14. HUD reference is optional when mentioned (and not mandatory).
  if (!(/HUD[\s\S]{0,160}(optional|where available)/i.test(rpS) && /never the sole/i.test(rpS)))
    F.push("14. Refund Policy does not make the HUD/agency reference optional");
  for (const src of [REFUND_POLICY, ...PUBLIC_SCAN]) {
    const txt = f[src]; if (!txt) continue;
    for (const { re, label } of FORBIDDEN_HUD_MANDATORY)
      if (re.test(txt)) F.push(`14. ${src} makes a HUD complaint mandatory: ${label}`);
  }

  // 2. Terms link to the Refund Policy.
  const terms = f[TERMS] || "";
  if (!/to="\/refund-policy"/.test(terms))
    F.push("2. Terms of Use does not link to /refund-policy");
  // 11. No old $30 refund fee remains (Terms + Refund Policy).
  for (const src of [TERMS, REFUND_POLICY]) {
    if ((f[src] || "").includes("$30"))
      F.push(`11. ${src} still contains a "$30" refund fee`);
  }
  // 12. "PSD refunds are never issued" is absent.
  for (const src of [TERMS, REFUND_POLICY]) {
    if (/PSD letters are\s*(?:<strong>)?\s*never issued|never issued/i.test(f[src] || "") &&
        /PSD/i.test(f[src] || "") && /refund/i.test(f[src] || ""))
      F.push(`12. ${src} still says PSD refunds are never issued`);
  }

  // 8. Privacy Policy covers housing-provider refund evidence.
  const priv = f[PRIVACY] || "";
  if (!(/denial/i.test(priv) && /fair.?housing/i.test(priv) && /refund/i.test(priv)))
    F.push("8. Privacy Policy does not cover housing-provider refund evidence (denial + fair-housing + refund)");

  // 9 + 10. Public pages don't contradict the policy or claim legal adjudication.
  for (const src of PUBLIC_SCAN) {
    const txt = f[src]; if (!txt) continue;
    for (const { re, label } of FORBIDDEN_PUBLIC)
      if (re.test(txt)) F.push(`9. ${src} contains a forbidden public refund claim: ${label}`);
    for (const { re, label } of FORBIDDEN_ADJUDICATION)
      if (re.test(txt)) F.push(`10. ${src} ${label}`);
  }

  // 4 (public). Provider non-qualification stays a full-refund public claim.
  if (!/Full refund if you don'?t qualify/i.test(f[PLAN_CARDS] || ""))
    F.push('4. planPricingCards.ts no longer states "Full refund if you don\'t qualify"');

  // 13 (consistency). No 3–5 business days left on frontend timing surfaces.
  for (const src of TIMING_FILES) {
    if (TIMING_FORBIDDEN.test(f[src] || ""))
      F.push(`13. ${src} still promises 3–5 business days (should be 5–10)`);
  }

  // 15. Checkout stays free of newly-added $40 / detailed refund-policy copy.
  for (const src of CHECKOUT_FILES) {
    const txt = f[src]; if (txt == null) continue;
    for (const { re, label } of CHECKOUT_FORBIDDEN)
      if (re.test(txt)) F.push(`15. checkout file ${src} contains ${label} (checkout must stay unchanged)`);
  }

  // 16. No automatic refund-fee backend path was added.
  const cr = f[CREATE_REFUND] || "";
  for (const re of BACKEND_FEE_FORBIDDEN)
    if (re.test(cr)) F.push(`16. ${CREATE_REFUND} appears to add an automatic refund-fee path (${re})`);

  return F;
}

// ── self-test (negative controls) ────────────────────────────────────────────
function clone(f) { return { ...f }; }
async function selfTest(baseFiles) {
  console.log("[check-refund-guarantee-parity] self-test — negative controls\n");
  const controls = [
    { name: 'reintroduce "Landlord denies? Full refund. No questions asked."',
      mutate: (f) => { f["src/pages/faqs/page.tsx"] = (f["src/pages/faqs/page.tsx"] || "x") + "\nLandlord denies? Full refund. No questions asked."; } },
    { name: "make the $40 fee an automatic deduction",
      mutate: (f) => { f[REFUND_POLICY] = (f[REFUND_POLICY] || "").replace(/not an automatic deduction/i, "an automatic deduction on every refund"); } },
    { name: "remove the fee exemption list",
      mutate: (f) => { f[REFUND_POLICY] = (f[REFUND_POLICY] || "").replace(/does not apply/gi, "applies"); } },
    { name: 'reintroduce the old "$30" refund fee',
      mutate: (f) => { f[TERMS] = (f[TERMS] || "x") + "\na $30 administrative fee will be deducted."; } },
    { name: 'reintroduce "Refunds for PSD letters are never issued"',
      mutate: (f) => { f[TERMS] = (f[TERMS] || "x") + "\nRefunds for PSD letters are never issued."; } },
    { name: "insert $40 clause into a checkout file",
      mutate: (f) => { f["src/pages/assessment/components/StripeCardForm.tsx"] = (f["src/pages/assessment/components/StripeCardForm.tsx"] || "x") + "\nPawTenant may retain up to $40."; } },
    { name: "introduce a mandatory HUD complaint",
      mutate: (f) => { f[REFUND_POLICY] = (f[REFUND_POLICY] || "x") + "\nA HUD complaint is required to qualify."; } },
    { name: "claim PawTenant determines an unlawful denial",
      mutate: (f) => { f["src/pages/faqs/page.tsx"] = (f["src/pages/faqs/page.tsx"] || "x") + "\nPawTenant confirms the unlawful denial before refunding."; } },
    { name: "provider non-qualification stops being fully refundable",
      mutate: (f) => { f[PLAN_CARDS] = (f[PLAN_CARDS] || "").replace(/Full refund if you don'?t qualify/gi, "Store credit only"); } },
  ];

  const baseFailures = runChecks(baseFiles).length;
  let ok = 0;
  const bad = [];
  for (const c of controls) {
    const mutated = clone(baseFiles);
    c.mutate(mutated);
    const n = runChecks(mutated).length;
    if (n > baseFailures) { ok++; console.log(`  ✓ caught: ${c.name}`); }
    else { bad.push(c.name); console.error(`  ✗ NOT caught: ${c.name}`); }
  }
  console.log(`\n[self-test] ${ok}/${controls.length} negative controls caught.`);
  if (bad.length) process.exit(1);
  console.log("[self-test] PASSED — all negative controls fail the guard as expected.");
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const allPaths = [...new Set([
    REFUND_POLICY, TERMS, PRIVACY, PLAN_CARDS, CREATE_REFUND,
    ...PUBLIC_SCAN, ...CHECKOUT_FILES, ...TIMING_FILES,
  ])];
  const files = await readAll(allPaths);

  if (process.argv.includes("--self-test")) {
    await selfTest(files);
    return;
  }

  console.log("[check-refund-guarantee-parity] refund + housing-denial contract\n");
  const failures = runChecks(files);
  if (failures.length) {
    for (const m of failures) console.error(`  ✗ ${m}`);
    console.error(`\n[check-refund-guarantee-parity] FAILED — ${failures.length} violation(s).`);
    process.exit(1);
  }
  console.log("  ✓ Refund Policy is the source of truth; Terms link to it; Privacy covers evidence.");
  console.log("  ✓ up-to-$40 fee is discretionary, exempts full-refund categories, absent from checkout.");
  console.log("  ✓ No unconditional landlord-denial refund, legal adjudication, $30 fee, or PSD-never-refund copy.");
  console.log("  ✓ HUD reference optional; refund timing consistently 5–10 business days.");
  console.log("\n[check-refund-guarantee-parity] PASSED — refund/housing-denial contract green.");
}

main().catch((err) => {
  console.error("[check-refund-guarantee-parity] fatal:", err);
  process.exit(1);
});
