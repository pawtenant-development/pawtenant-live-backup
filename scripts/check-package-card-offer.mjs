// scripts/check-package-card-offer.mjs
//
// ASSESSMENT-PACKAGE-CARD-OFFER-PRESENTATION-001 regression + safety guard.
//
// BLOCKING in the normal build (`npm run build`) — fails the build (exit 1) if
// the pre-checkout package-card OFFER PRESENTATION (compare-at price, "$30 OFF"
// badge, Klarna 4-payment figure) drifts from the approved model, if the
// presentation-only compare-at price could leak into a charge path, or if any
// non-compliant refund/guarantee wording appears on the cards.
//
// It executes the REAL helper + canonical pricing via jiti (not regex on the
// numbers), so the negative controls in the task card genuinely fail:
//   - installment from compare-at instead of payable  → behavioral assert fails
//   - savings changed away from $30                    → behavioral assert fails
//   - compare-at fed into checkout payload             → import-scope assert fails
//
// Usage:
//   node scripts/check-package-card-offer.mjs             → exit 1 on failure
//   node scripts/check-package-card-offer.mjs --warn-only → always exit 0 (audit)

import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const warnOnly = process.argv.includes("--warn-only");
const TAG = "[check-package-card-offer]";
const jiti = createJiti(import.meta.url);

// Owner-approved offer matrix (2026-07). payable = canonical one-time total.
const OFFER = [
  { payable: 129, compareAt: 159, savings: 30, installment: "32.25" }, // 1 pet/dog standard
  { payable: 149, compareAt: 179, savings: 30, installment: "37.25" }, // 2-3 standard
  { payable: 179, compareAt: 209, savings: 30, installment: "44.75" }, // RA combo (flat)
];

async function read(f) {
  try { return await readFile(resolve(ROOT, f), "utf8"); }
  catch { return null; }
}

/** Recursively collect .ts/.tsx files under a dir. */
async function walk(dir) {
  const out = [];
  let entries = [];
  try { entries = await readdir(resolve(ROOT, dir), { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const rel = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(rel));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

async function main() {
  const problems = [];
  const CARD = "src/pages/assessment/components/PackageSelectionStep.tsx";
  const HELPER = "src/lib/packageOffer.ts";

  // ── Behavioral: execute the REAL helper (jiti) ──────────────────────────────
  let packageOffer, PACKAGE_CARD_SAVINGS, getPackageTotal;
  try {
    const off = await jiti.import(resolve(ROOT, "src/lib/packageOffer.ts"));
    packageOffer = off.packageOffer;
    PACKAGE_CARD_SAVINGS = off.PACKAGE_CARD_SAVINGS;
    const pricing = await jiti.import(resolve(ROOT, "src/config/pricing.ts"));
    getPackageTotal = pricing.getPackageTotal;
  } catch (e) {
    problems.push(`could not load helper/pricing via jiti: ${e.message}`);
  }

  if (typeof packageOffer === "function") {
    if (PACKAGE_CARD_SAVINGS !== 30) problems.push(`PACKAGE_CARD_SAVINGS = ${PACKAGE_CARD_SAVINGS} ≠ 30`);
    for (const row of OFFER) {
      const o = packageOffer(row.payable);
      if (o.payablePrice !== row.payable) problems.push(`packageOffer(${row.payable}).payablePrice = ${o.payablePrice} ≠ ${row.payable}`);
      if (o.compareAtPrice !== row.compareAt) problems.push(`packageOffer(${row.payable}).compareAtPrice = ${o.compareAtPrice} ≠ ${row.compareAt}`);
      if (o.savings !== row.savings) problems.push(`packageOffer(${row.payable}).savings = ${o.savings} ≠ ${row.savings}`);
      if (o.klarnaInstallment !== row.installment) problems.push(`packageOffer(${row.payable}).klarnaInstallment = "${o.klarnaInstallment}" ≠ "${row.installment}"`);
      // compare-at must be exactly payable + $30, and installment must come from
      // the PAYABLE price, never the compare-at price (the core safety invariant).
      if (o.compareAtPrice !== row.payable + 30) problems.push(`packageOffer(${row.payable}) compare-at not payable+30`);
      if (o.klarnaInstallment !== (row.payable / 4).toFixed(2)) problems.push(`packageOffer(${row.payable}) installment not payable/4`);
      if (o.klarnaInstallment === (o.compareAtPrice / 4).toFixed(2)) problems.push(`packageOffer(${row.payable}) installment equals compare-at/4 — must use payable price`);
    }
  }

  // ── Behavioral: canonical one-time prices + pet-count switch + ESA/PSD parity ─
  if (typeof getPackageTotal === "function") {
    const expect = { 1: 129, 2: 149, 3: 149 };
    for (const [product, stdKey, bundleKey] of [
      ["esa", "esa_standard", "esa_ra_bundle"],
      ["psd", "psd_standard", "psd_ra_bundle"],
    ]) {
      for (const n of [1, 2, 3]) {
        const std = getPackageTotal(stdKey, "one_time", n);
        if (std !== expect[n]) problems.push(`${product} standard one_time (${n}) = ${std} ≠ ${expect[n]}`);
        const bundle = getPackageTotal(bundleKey, "one_time", n);
        if (bundle !== 179) problems.push(`${product} combo one_time (${n}) = ${bundle} ≠ 179 (flat)`);
      }
    }
    // ESA and PSD standard one-time prices must match (parity) at each count.
    for (const n of [1, 2, 3]) {
      const e = getPackageTotal("esa_standard", "one_time", n);
      const p = getPackageTotal("psd_standard", "one_time", n);
      if (e !== p) problems.push(`ESA/PSD standard one_time parity broken at ${n}: ${e} vs ${p}`);
    }
  }

  // ── Static: card renders the offer via the helper (never raw literals) ───────
  const card = await read(CARD);
  const need = (src, file, re, msg) => {
    if (src == null) { problems.push(`${file} — MISSING`); return; }
    if (!re.test(src)) problems.push(`${file} — ${msg}`);
  };
  const forbid = (src, file, re, msg) => {
    if (src == null) { problems.push(`${file} — MISSING`); return; }
    if (re.test(src)) problems.push(`${file} — ${msg}`);
  };

  need(card, CARD, /from\s+["']@\/lib\/packageOffer["']/, "card must import from @/lib/packageOffer");
  need(card, CARD, /packageOffer\(c\.oneTime\)/, "card must build the offer from the canonical one-time price (packageOffer(c.oneTime))");
  need(card, CARD, /offer\.payablePrice/, "card must render offer.payablePrice");
  need(card, CARD, /offer\.compareAtPrice/, "card must render the crossed-out offer.compareAtPrice");
  need(card, CARD, /line-through/, "card compare-at price must be visually crossed out (line-through)");
  need(card, CARD, /offer\.savings\}\s*OFF/, "card must render the \"$XX OFF\" savings badge from offer.savings");
  need(card, CARD, /offer\.klarnaInstallment/, "card must render the Klarna installment from offer.klarnaInstallment");

  // Approved refund wording present; non-compliant guarantees absent. The wording
  // checks run against comment-stripped source so a compliance NOTE that mentions
  // a forbidden phrase (e.g. the "no guaranteed approval" header) is not a hit —
  // only text that would actually render to the customer counts.
  const stripComments = (s) => (s ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")        // /* ... */ and JSX {/* ... */}
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");    // // line comments (keep http://)
  const cardVisible = stripComments(card);
  need(card, CARD, /Full refund if you don(&apos;|')t qualify\./, "card must show the approved refund reassurance wording");
  forbid(cardVisible, CARD, /letter is not approved/i, "forbidden refund wording ('letter is not approved')");
  forbid(cardVisible, CARD, /guaranteed approval|guarantee[d]? (?:your )?qualif/i, "forbidden 'guaranteed approval/qualification' wording");
  forbid(cardVisible, CARD, /landlord must approve|must approve it/i, "forbidden 'landlord must approve' wording");

  // ── Static: each card carries the approved number of tick benefits (7) ───────
  // ASSESSMENT-PACKAGE-CARD-VISUAL-ALIGNMENT-001 — ESA + PSD × Standard + Combo
  // must each have exactly 7 benefits so the two cards stay visually balanced.
  // (`features: string[]` type annotation is not matched — it has no `[` literal
  // immediately after the colon.)
  const featureCounts = [...(card ?? "").matchAll(/features:\s*\[([\s\S]*?)\]/g)]
    .map((m) => (m[1].match(/"(?:[^"\\]|\\.)*"/g) || []).length);
  if (featureCounts.length !== 4) {
    problems.push(`${CARD} — expected 4 feature arrays (ESA+PSD × Standard+Combo), found ${featureCounts.length}`);
  }
  featureCounts.forEach((count, i) => {
    if (count !== 7) problems.push(`${CARD} — feature array #${i + 1} has ${count} benefits, expected 7`);
  });

  // ── Static: ESA and PSD product wording stays separated ──────────────────────
  need(card, CARD, /Official ESA letter PDF if you qualify/, "ESA Standard must list the ESA letter PDF benefit");
  need(card, CARD, /Official PSD letter PDF if you qualify/, "PSD Standard must list the PSD letter PDF benefit");
  need(card, CARD, /Everything included in Standard ESA/, "ESA Combo must reference 'Everything included in Standard ESA'");
  need(card, CARD, /Everything included in Standard PSD/, "PSD Combo must reference 'Everything included in Standard PSD'");

  // ── Static: compare-at CANNOT reach checkout ────────────────────────────────
  // 1) onSelect must pass ONLY the package key (never a price / offer value).
  forbid(card, CARD, /onSelect\((?!c\.key\))/, "onSelect must pass only c.key (never a price/offer value)");
  // 2) The Klarna installment must not be recomputed from the compare-at price.
  forbid(card, CARD, /compareAtPrice\s*\/\s*4/, "Klarna installment must not divide the compare-at price");

  // ── Static: helper keeps compare-at generation local + installment from payable
  const helper = await read(HELPER);
  need(helper, HELPER, /PACKAGE_CARD_SAVINGS\s*=\s*30/, "helper must define PACKAGE_CARD_SAVINGS = 30");
  need(helper, HELPER, /compareAtPrice:\s*payablePrice\s*\+\s*savings/, "helper compareAtPrice must be payablePrice + savings");
  need(helper, HELPER, /klarnaInstallment:\s*\(payablePrice\s*\/\s*4\)\.toFixed\(2\)/, "helper installment must be (payablePrice / 4).toFixed(2)");
  forbid(helper, HELPER, /compareAtPrice\s*\/\s*4/, "helper must not derive the installment from the compare-at price");

  // ── Static: import-scope — ONLY the card may import the presentation helper ──
  // Guarantees the compare-at / savings values never reach a charge/payment/order
  // path (create-payment-intent, create-checkout-session, Step3 checkout, order
  // write, Google Ads value). If any other file imports it → fail the build.
  const scanDirs = ["src", "supabase/functions"];
  const files = (await Promise.all(scanDirs.map(walk))).flat();
  const importRe = /from\s+["'](?:@\/lib\/packageOffer|\.{1,2}\/(?:[^"']*\/)?lib\/packageOffer|\.\/packageOffer)["']/;
  for (const rel of files) {
    const norm = rel.replace(/\\/g, "/");
    if (norm.endsWith("src/pages/assessment/components/PackageSelectionStep.tsx")) continue;
    if (norm.endsWith("src/lib/packageOffer.ts")) continue;
    const src = await read(rel);
    if (src == null) continue;
    if (importRe.test(src)) {
      problems.push(`${norm} — must NOT import the presentation-only packageOffer helper (compare-at could leak toward checkout)`);
    }
  }

  if (problems.length === 0) {
    console.log(`${TAG} OK — offer matrix ($129/149/179 → +$30 compare-at, $30 OFF, Klarna 32.25/37.25/44.75) verified via the real helper; ESA/PSD parity + combo flat; approved refund wording, no guarantee wording; onSelect passes key only; presentation helper is card-scoped (never reaches a charge path).`);
    return;
  }
  console.error(`${TAG} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  if (!warnOnly) process.exit(1);
}

main().catch((err) => { console.error(`${TAG} fatal:`, err); process.exit(1); });
