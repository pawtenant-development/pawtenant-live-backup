// scripts/check-attribution-parity.mjs
//
// ATTR-CONSISTENCY-LOCK safety check (2026-05-23). Validates the
// acquisition classifier in src/lib/acquisitionClassifier.ts against the
// hierarchy locked by the admin UI: gclid/gbraid/wbraid > fbclid > UTM
// source+medium > referrer host > legacy referred_by salvage >
// Direct / Unknown.
//
// Five surfaces consume attribution and MUST agree:
//   1. Order list pill        (OrderCard.tsx)
//   2. Overview source badge  (OrderDetailModal.tsx)
//   3. Attribution Journey    (AttributionJourneyTab.tsx)
//   4. Analytics dashboard    (AdminDashboard.tsx)
//   5. Stored order row       (orders flat columns + first_touch_json
//                              / last_touch_json snapshots)
//
// Surfaces 1, 2, and 3 ALL flow through this single classifier. This
// script asserts the documented Dayana case (gclid + a weak
// referred_by) plus the four other hierarchy rungs so any regression
// in the classifier surfaces immediately at build time.
//
// Usage:
//   node scripts/check-attribution-parity.mjs              → standalone,
//                                                            exit 1 on fail
//   node scripts/check-attribution-parity.mjs --warn-only  → still prints
//                                                            failures, but
//                                                            always exit 0
//
// Mirrors the pattern this repo's prerender script uses for jiti-based
// TS imports — zero new dependencies (jiti is already a devDep). The
// build script invokes this with --warn-only so a regression surfaces
// during `npm run build` without blocking the deploy pipeline.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const CLASSIFIER_PATH = resolve(ROOT, "src/lib/acquisitionClassifier.ts");

const jiti = createJiti(import.meta.url, { interopDefault: true });
const mod = await jiti.import(CLASSIFIER_PATH);

const { classifyOrder, classifyAcquisition } = mod;

if (typeof classifyOrder !== "function" || typeof classifyAcquisition !== "function") {
  console.error(
    "[check-attribution-parity] ERROR: classifyOrder / classifyAcquisition not exported from src/lib/acquisitionClassifier.ts"
  );
  process.exit(1);
}

const CASES = [
  {
    name:           "Dayana case — gclid + referred_by='State page'",
    order:          { gclid: "CjwKCAjw_test", referred_by: "State page" },
    expectedLabel:  "Google Ads",
  },
  {
    name:           "fbclid + referred_by='Referral'",
    order:          { fbclid: "fb_test_id", referred_by: "Referral" },
    expectedLabel:  "Facebook Paid",
  },
  {
    name:           "utm_source=google + utm_medium=organic",
    order:          { utm_source: "google", utm_medium: "organic" },
    expectedLabel:  "Google Organic",
  },
  {
    name:           "Legacy salvage — referred_by='Facebook / Instagram Ads'",
    order:          { referred_by: "Facebook / Instagram Ads" },
    expectedLabel:  "Facebook Paid",
  },
  {
    name:           "All-null row",
    order:          {},
    expectedLabel:  "Direct / Unknown",
  },
];

function buildAcquisitionInputsLike(order) {
  // Matches the structure OrderCard's buildAcquisitionInputs builds. The
  // order-side helper used by the Overview badge (classifyOrder) handles
  // the same merge internally — both call paths must agree on every case.
  return {
    utm_source:   order.utm_source   ?? null,
    utm_medium:   order.utm_medium   ?? null,
    utm_campaign: order.utm_campaign ?? null,
    gclid:        order.gclid        ?? null,
    fbclid:       order.fbclid       ?? null,
    referred_by:  order.referred_by  ?? null,
  };
}

function main() {
  const warnOnly = process.argv.includes("--warn-only");
  const failures = [];
  let parityMismatches = 0;

  for (const tc of CASES) {
    const r1 = classifyOrder(tc.order);
    const r2 = classifyAcquisition(buildAcquisitionInputsLike(tc.order));

    const labelOk  = r1.label === tc.expectedLabel;
    const parityOk = r1.label === r2.label;

    if (!labelOk) {
      failures.push({
        case: tc.name,
        expected: tc.expectedLabel,
        got: r1.label,
        reasoning: r1.reasoning,
      });
    }
    if (!parityOk) {
      parityMismatches += 1;
      failures.push({
        case: `${tc.name} — cross-classifier parity`,
        expected: `classifyAcquisition=${r2.label} == classifyOrder=${r1.label}`,
        got: "MISMATCH",
        reasoning: "Order modal badge and order list pill would disagree.",
      });
    }
  }

  if (failures.length === 0) {
    console.log(
      `[check-attribution-parity] OK — ${CASES.length} hierarchy cases pass; classifyOrder == classifyAcquisition on every case.`
    );
    return;
  }

  const tag = warnOnly ? "WARN" : "ERROR";
  console.error(
    `[check-attribution-parity] ${tag} — ${failures.length} failure(s) detected (parity mismatches: ${parityMismatches}).`
  );
  for (const f of failures) {
    console.error(`\n  ✗ ${f.case}`);
    console.error(`      expected: ${f.expected}`);
    console.error(`      got:      ${f.got}`);
    if (f.reasoning) console.error(`      classifier reasoning: ${f.reasoning}`);
  }
  console.error(
    `\n  → src/lib/acquisitionClassifier.ts is the single source of truth\n` +
    `    for every admin surface that renders an order source. Investigate\n` +
    `    the failing case(s) above before shipping.\n`
  );

  if (!warnOnly) process.exit(1);
}

main();
