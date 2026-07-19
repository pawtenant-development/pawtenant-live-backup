// Deterministic test matrix for ORDERS-RA-COMBO-CHIP-FILTER-001.
//
//   node scripts/test-order-package-classification.mjs
//
// This repo has no unit-test framework. Rather than add one (which would churn
// package.json / package-lock), we transpile the REAL shipped modules with
// esbuild (already a Vite dependency) and assert against the actual logic —
// same approach as scripts/test-refund-classification.mjs.
//
// Fixtures are pure in-memory objects: NO database rows are created, no Stripe
// call is made, no payout or customer communication can occur from this file.
//
// The central invariant: order product/package is classified ONLY from explicit
// saved identity fields (package_key, includes_reasonable_accommodation_letter,
// letter_type, and a PAID standalone add-on) — NEVER from price. A misleading
// price must never change the classification.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

async function load(relPath, aliasStubs = {}) {
  let src = readFileSync(join(ROOT, relPath), "utf8");
  for (const [spec, replacement] of Object.entries(aliasStubs)) {
    src = src.replaceAll(`"${spec}"`, `"${replacement}"`);
  }
  const { code } = await esbuild.transform(src, { loader: "ts", format: "esm" });
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

// orderPackage.ts imports the canonical helpers via the "@/config/pricing"
// alias; inline pricing.ts as a data URL so we exercise the REAL helper chain
// (isRaBundle / packageProduct) end-to-end.
const pricingCode = (await esbuild.transform(readFileSync(join(ROOT, "src/config/pricing.ts"), "utf8"), { loader: "ts", format: "esm" })).code;
const pricingUrl = "data:text/javascript;base64," + Buffer.from(pricingCode).toString("base64");

const op = await load("src/pages/admin-orders/orderPackage.ts", { "@/config/pricing": pricingUrl });
const { classifyOrderPackage, matchesPackageFilter, isRaRelated, raDocState } = op;

let passed = 0, failed = 0;
const ok = (n) => { passed++; console.log(`  ✓ ${n}`); };
const fail = (n, m) => { failed++; console.error(`  ✗ ${n}\n      ${m}`); };
const eq = (name, actual, expected) => {
  if (actual === expected) ok(name);
  else fail(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

console.log("\n[test-order-package-classification]");

// ── 1. Category classification (required matrix) ────────────────────────────
console.log("\n  category:");
eq("ESA Standard (package_key) → esa",
  classifyOrderPackage({ package_key: "esa_standard", letter_type: "esa" }), "esa");
eq("PSD Standard (package_key) → psd",
  classifyOrderPackage({ package_key: "psd_standard", letter_type: "psd" }), "psd");
eq("ESA combo (package_key) → esa_ra",
  classifyOrderPackage({ package_key: "esa_ra_bundle", letter_type: "esa", includes_reasonable_accommodation_letter: true }), "esa_ra");
eq("PSD combo (package_key) → psd_ra",
  classifyOrderPackage({ package_key: "psd_ra_bundle", letter_type: "psd", includes_reasonable_accommodation_letter: true }), "psd_ra");
eq("combo via includes_RA flag only (no package_key) → esa_ra",
  classifyOrderPackage({ package_key: null, letter_type: "esa", includes_reasonable_accommodation_letter: true }), "esa_ra");
eq("PSD combo via includes_RA flag only → psd_ra",
  classifyOrderPackage({ package_key: null, letter_type: "psd", includes_reasonable_accommodation_letter: true }), "psd_ra");

// standalone paid add-on on a base order → ra_addon
eq("ESA standard + PAID add-on → ra_addon",
  classifyOrderPackage({ package_key: "esa_standard", letter_type: "esa" }, { hasPaidStandaloneAddon: true }), "ra_addon");
eq("legacy ESA (null package_key) + PAID add-on → ra_addon",
  classifyOrderPackage({ package_key: null, letter_type: "esa" }, { hasPaidStandaloneAddon: true }), "ra_addon");
eq("combo + add-on → combo wins (esa_ra, package identity)",
  classifyOrderPackage({ package_key: "esa_ra_bundle", letter_type: "esa", includes_reasonable_accommodation_letter: true }, { hasPaidStandaloneAddon: true }), "esa_ra");
eq("add-on flag but NO base identity (no package_key, no letter_type) → unknown",
  classifyOrderPackage({ package_key: null, letter_type: null }, { hasPaidStandaloneAddon: true }), "unknown");

// legacy fallback → letter_type
eq("legacy ESA (letter_type only) → esa",
  classifyOrderPackage({ package_key: null, letter_type: "esa" }), "esa");
eq("legacy PSD (letter_type only) → psd",
  classifyOrderPackage({ package_key: null, letter_type: "psd" }), "psd");
eq("legacy PSD-consultation (letter_type) → psd",
  classifyOrderPackage({ package_key: null, letter_type: "psd-consultation" }), "psd");
eq("PSD via -PSD marker in confirmation_id → psd",
  classifyOrderPackage({ package_key: null, letter_type: null, confirmation_id: "PT-ABC-PSD" }), "psd");

// unknown — no explicit identity, never guessed as ESA
eq("no package_key, no letter_type → unknown (never guessed ESA)",
  classifyOrderPackage({ package_key: null, letter_type: null }), "unknown");
eq("empty strings → unknown",
  classifyOrderPackage({ package_key: "", letter_type: "" }), "unknown");

// ── 2. NEGATIVE CONTROL — price must NEVER affect classification ─────────────
console.log("\n  negative control (price is irrelevant):");
const esaBase = { package_key: "esa_standard", letter_type: "esa" };
const c1 = classifyOrderPackage({ ...esaBase, price: 129 });
const c2 = classifyOrderPackage({ ...esaBase, price: 179 });   // combo-looking price
const c3 = classifyOrderPackage({ ...esaBase, price: 149 });   // multi-pet price
const c4 = classifyOrderPackage({ ...esaBase, price: 0 });     // free / $0
eq("ESA standard @ $129 → esa", c1, "esa");
eq("ESA standard @ $179 (combo price) → STILL esa", c2, "esa");
eq("ESA standard @ $149 (multi-pet price) → STILL esa", c3, "esa");
eq("ESA standard @ $0 → STILL esa", c4, "esa");
eq("all four price variants classify identically",
  new Set([c1, c2, c3, c4]).size, 1);
// a combo at an ESA-standard price must still be a combo
eq("combo @ $129 (standard price) → STILL esa_ra",
  classifyOrderPackage({ package_key: "esa_ra_bundle", letter_type: "esa", includes_reasonable_accommodation_letter: true, price: 129 }), "esa_ra");

// ── 3. isRaRelated ──────────────────────────────────────────────────────────
console.log("\n  isRaRelated:");
eq("esa_ra is RA-related", isRaRelated("esa_ra"), true);
eq("psd_ra is RA-related", isRaRelated("psd_ra"), true);
eq("ra_addon is RA-related", isRaRelated("ra_addon"), true);
eq("esa is NOT RA-related", isRaRelated("esa"), false);
eq("psd is NOT RA-related", isRaRelated("psd"), false);
eq("unknown is NOT RA-related", isRaRelated("unknown"), false);

// ── 4. Filter semantics ─────────────────────────────────────────────────────
console.log("\n  filter semantics:");
eq("ESA filter includes esa", matchesPackageFilter("esa", "esa"), true);
eq("ESA filter EXCLUDES esa_ra combo", matchesPackageFilter("esa_ra", "esa"), false);
eq("ESA filter EXCLUDES ra_addon", matchesPackageFilter("ra_addon", "esa"), false);
eq("ESA filter EXCLUDES unknown (no leak)", matchesPackageFilter("unknown", "esa"), false);
eq("PSD filter EXCLUDES psd_ra combo", matchesPackageFilter("psd_ra", "psd"), false);
eq("PSD filter EXCLUDES unknown (no leak)", matchesPackageFilter("unknown", "psd"), false);
eq("ESA+RA filter is exact (esa_ra only)", matchesPackageFilter("esa_ra", "esa_ra"), true);
eq("ESA+RA filter excludes psd_ra", matchesPackageFilter("psd_ra", "esa_ra"), false);
eq("PSD+RA filter is exact (psd_ra only)", matchesPackageFilter("psd_ra", "psd_ra"), true);
eq("All RA includes esa_ra", matchesPackageFilter("esa_ra", "all_ra"), true);
eq("All RA includes psd_ra", matchesPackageFilter("psd_ra", "all_ra"), true);
eq("All RA includes ra_addon", matchesPackageFilter("ra_addon", "all_ra"), true);
eq("All RA EXCLUDES esa standard", matchesPackageFilter("esa", "all_ra"), false);
eq("All RA EXCLUDES unknown", matchesPackageFilter("unknown", "all_ra"), false);
eq("RA Add-on filter is exact (ra_addon only)", matchesPackageFilter("ra_addon", "ra_addon"), true);
eq("RA Add-on filter excludes esa_ra combo", matchesPackageFilter("esa_ra", "ra_addon"), false);
eq("All filter matches everything (unknown too)", matchesPackageFilter("unknown", "all"), true);

// ── 5. RA doc state ─────────────────────────────────────────────────────────
console.log("\n  RA document state:");
eq("non-RA order → no doc state", raDocState({ additional_documentation_status: "completed" }, "esa"), null);
eq("combo, status uploaded → uploaded", raDocState({ additional_documentation_status: "uploaded" }, "esa_ra"), "uploaded");
eq("combo, status in_review → in_review", raDocState({ additional_documentation_status: "in_review" }, "psd_ra"), "in_review");
eq("combo, status completed → completed", raDocState({ additional_documentation_status: "completed" }, "esa_ra"), "completed");
eq("combo, status not_uploaded → missing", raDocState({ additional_documentation_status: "not_uploaded" }, "esa_ra"), "missing");
eq("combo, status null → missing", raDocState({ additional_documentation_status: null }, "psd_ra"), "missing");
eq("ra_addon, status null → missing", raDocState({ additional_documentation_status: null }, "ra_addon"), "missing");

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n[test-order-package-classification] ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
