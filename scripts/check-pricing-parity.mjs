// scripts/check-pricing-parity.mjs
//
// CHECKOUT-PRICING-PHASED-SUBSCRIPTION-003 regression guard.
//
// Fails the build if the client pricing matrix (src/config/pricing.ts) and the
// server pricing matrix (supabase/functions/_shared/pricingMatrix.ts) disagree
// with each other or with the owner-approved canonical numbers, or if the eight
// provisioned subscription Price IDs / lookup_keys are incomplete, or if Combo
// ever takes a year-two reduction.
//
// Usage:
//   node scripts/check-pricing-parity.mjs             → exit 1 on drift
//   node scripts/check-pricing-parity.mjs --warn-only → always exit 0
//
// The build invokes this with --warn-only, matching the other parity checks.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const warnOnly = process.argv.includes("--warn-only");
const TAG = "[check-pricing-parity]";

// ── Owner-approved canonical (2026-07) ──────────────────────────────────────
const CANON = {
  oneTime:   { single: 129, multi: 149 },
  firstYear: { single: 115, multi: 135 },
  renewal:   { single: 100, multi: 115 },
  combo:     { oneTime: 179, firstYear: 159, renewal: 159 },
};

const LOOKUP_KEYS = [
  "pawtenant_esa_single_first_year_v1", "pawtenant_esa_single_renewal_v1",
  "pawtenant_esa_multi_first_year_v1",  "pawtenant_esa_multi_renewal_v1",
  "pawtenant_psd_single_first_year_v1", "pawtenant_psd_single_renewal_v1",
  "pawtenant_psd_multi_first_year_v1",  "pawtenant_psd_multi_renewal_v1",
];

/** Pull `<name>: { single: A, multi: B }` (Object.freeze wrapper optional). */
function pair(src, name) {
  const re = new RegExp(name + "\\s*:\\s*(?:Object\\.freeze\\()?\\{\\s*single:\\s*(\\d+)\\s*,\\s*multi:\\s*(\\d+)");
  const m = src.match(re);
  return m ? { single: Number(m[1]), multi: Number(m[2]) } : null;
}
/** Pull the combo triple `oneTime: X, firstYear: Y, renewal: Z`. */
function combo(src) {
  const one = src.match(/COMBO_MATRIX\s*=\s*(?:Object\.freeze\()?\{[\s\S]*?oneTime:\s*(\d+)/);
  const fy  = src.match(/COMBO_MATRIX\s*=\s*(?:Object\.freeze\()?\{[\s\S]*?firstYear:\s*(\d+)/);
  const rn  = src.match(/COMBO_MATRIX\s*=\s*(?:Object\.freeze\()?\{[\s\S]*?renewal:\s*(\d+)/);
  return one && fy && rn
    ? { oneTime: Number(one[1]), firstYear: Number(fy[1]), renewal: Number(rn[1]) }
    : null;
}

function extract(src) {
  return {
    oneTime: pair(src, "oneTime"),
    firstYear: pair(src, "firstYear"),
    renewal: pair(src, "renewal"),
    combo: combo(src),
  };
}

function eqPair(a, b) { return a && b && a.single === b.single && a.multi === b.multi; }

async function main() {
  const problems = [];
  const client = extract(await readFile(resolve(ROOT, "src/config/pricing.ts"), "utf8"));
  const serverSrc = await readFile(resolve(ROOT, "supabase/functions/_shared/pricingMatrix.ts"), "utf8");
  const server = extract(serverSrc);

  for (const key of ["oneTime", "firstYear", "renewal"]) {
    if (!eqPair(client[key], CANON[key])) problems.push(`client ${key} = ${JSON.stringify(client[key])} ≠ canonical ${JSON.stringify(CANON[key])}`);
    if (!eqPair(server[key], CANON[key])) problems.push(`server ${key} = ${JSON.stringify(server[key])} ≠ canonical ${JSON.stringify(CANON[key])}`);
    if (!eqPair(client[key], server[key])) problems.push(`client/server ${key} disagree: ${JSON.stringify(client[key])} vs ${JSON.stringify(server[key])}`);
  }

  for (const side of [["client", client.combo], ["server", server.combo]]) {
    const [name, c] = side;
    if (!c) { problems.push(`${name} COMBO_MATRIX not found`); continue; }
    if (c.oneTime !== CANON.combo.oneTime) problems.push(`${name} combo one-time ${c.oneTime} ≠ ${CANON.combo.oneTime}`);
    if (c.firstYear !== CANON.combo.firstYear) problems.push(`${name} combo annual ${c.firstYear} ≠ ${CANON.combo.firstYear}`);
    if (c.renewal !== c.firstYear) problems.push(`${name} combo renewal ${c.renewal} ≠ first-year ${c.firstYear} — Combo must NOT drop at renewal`);
  }

  // Every lookup_key + a matching Stripe Price ID must be present server-side.
  for (const k of LOOKUP_KEYS) {
    if (!serverSrc.includes(k)) problems.push(`server matrix missing lookup_key ${k}`);
  }
  const priceIds = serverSrc.match(/price_1[A-Za-z0-9]+/g) || [];
  const uniquePrices = new Set(priceIds);
  if (uniquePrices.size < 8) problems.push(`server matrix has ${uniquePrices.size} unique Price IDs, expected ≥ 8`);

  if (problems.length === 0) {
    console.log(`${TAG} OK — client/server pricing matrices agree with canonical; combo flat; 8 subscription prices mapped.`);
    return;
  }
  console.error(`${TAG} DRIFT — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  if (!warnOnly) process.exit(1);
}

main().catch((err) => { console.error(`${TAG} fatal:`, err); process.exit(1); });
