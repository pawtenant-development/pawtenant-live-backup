// scripts/check-addon-price-contract.mjs
//
// PORTAL-ADDON-PRICE-RECONCILE-001 — deterministic add-on price-contract guard.
//
// The standalone "Additional Documentation" / Reasonable-Accommodation add-on
// (bought from the customer portal AFTER the original letter, and via the admin
// "Send Additional Documentation Invoice") has ONE owner-approved price:
//
//     $50 USD  =  5,000 cents   (owner decision 2026-07-20; supersedes $70/$40)
//
// This add-on has TWO price knobs that MUST agree. They drifted apart on LIVE
// (the modal / email showed one number while the server charged another) because
// nothing pinned them together. This guard pins the whole contract so that can
// never recur:
//
//   P1  display  = $50            (src/config/pricing.ts ADDITIONAL_DOC_PRICING.addon)
//   P2  server   = 5000 cents     (create-additional-doc-invoice ADDON_AMOUNT_CENTS)
//   P3  the two knobs AGREE       (server cents === display dollars × 100)
//   P4  Stripe charges the CONSTANT, never a client-supplied amount
//   P5  the tracking row records the authoritative amount at create
//   P6  refunds follow the ACTUAL charge (full refund by payment_intent)
//   P7  the webhook completion path uses the ACTUAL charged amount
//   P8  the RA BUNDLE prices are UNCHANGED (this task must not touch them)
//   P9  the ADMIN "Send Additional Documentation Invoice" hint renders $50
//       (OrderDetailModal.tsx — a merge-frozen file; catch a stale $70/$40 hint)
//   P10 NO stale current-contract $40/$70 literal in the active add-on path,
//       while ALLOWING legitimate historical migration/audit references
//
// Static source assertions over the real files — no runtime, no network, no DB.
//
// The negative controls (A–J) are proven by `--self-test`, which applies each
// breaking mutation IN MEMORY and asserts the matching check trips; a separate
// ALLOW list proves a historical reference does NOT trip P10. Nothing is ever
// written to disk, so no drift can be committed unnoticed.
//
// Usage:
//   node scripts/check-addon-price-contract.mjs             → guard real files (exit 1 on fail)
//   node scripts/check-addon-price-contract.mjs --warn-only → audit (always exit 0)
//   node scripts/check-addon-price-contract.mjs --self-test → prove every control trips

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const warnOnly = process.argv.includes("--warn-only");
const selfTest = process.argv.includes("--self-test");
const TAG = "[check-addon-price-contract]";

// The one authoritative contract.
const DISPLAY_DOLLARS = 50;
const SERVER_CENTS = 5000;
// The RA bundle prices this task must NOT change (COMBO_MATRIX in pricing.ts).
const BUNDLE = { oneTime: 179, firstYear: 159, renewal: 159 };

const PATHS = {
  // Contract-critical (P1–P8) — must exist.
  pricing: "src/config/pricing.ts",
  server: "supabase/functions/create-additional-doc-invoice/index.ts",
  complete: "supabase/functions/_shared/completeAdditionalDocPayment.ts",
  // Admin hint (P9) — merge-frozen file; only the rendered hint is asserted.
  orderModal: "src/pages/admin-orders/components/OrderDetailModal.tsx",
  // Active add-on UI/flow files (P10 stale-literal scan).
  addonReq: "src/pages/my-orders/components/AdditionalDocRequest.tsx",
  addonInvoiceModal: "src/pages/admin-orders/components/AdditionalDocInvoiceModal.tsx",
  raDocPanel: "src/pages/admin-orders/components/OrderRaDocPanel.tsx",
  lockedPreviews: "src/pages/my-orders/components/LockedFeaturePreviews.tsx",
  raUpload: "src/pages/my-orders/components/RaDocumentUpload.tsx",
  paymentHistory: "src/pages/admin-orders/components/PaymentHistoryTab.tsx",
  providerOrderDetail: "src/pages/provider-portal/components/ProviderOrderDetail.tsx",
};
// Only these three are hard-required; the rest are best-effort for P9/P10.
const REQUIRED = ["pricing", "server", "complete"];

// Dedicated add-on files — the WHOLE file is the add-on flow, so any $40/$70 is
// add-on-related. Shared files carry other content, so a $40/$70 there only
// counts when the line also mentions the add-on.
const DEDICATED_ADDON = ["addonReq", "addonInvoiceModal", "raDocPanel", "lockedPreviews", "raUpload"];
const SHARED_ADDON = ["server", "complete", "paymentHistory", "providerOrderDetail"];
// A line that legitimately documents PAST amounts (a real migration / audit note)
// is allowed to name $40/$70.
const HISTORICAL = /supersed|\bearlier\b|\bprior\b|\bprevious\b|\braised\b|→|->|was \$|historical|legacy|\bformerly\b|\bused to\b|never relabelled/i;
const ADDON_CTX = /add-?on|additional doc|documentation|reasonable accommodation/i;

async function readAll() {
  const files = {};
  for (const [k, p] of Object.entries(PATHS)) {
    try { files[k] = await readFile(resolve(ROOT, p), "utf8"); }
    catch { files[k] = null; }
  }
  return files;
}

/** Read ADDITIONAL_DOC_PRICING.addon (whole dollars) from pricing.ts, or NaN. */
function displayDollars(src) {
  const m = (src ?? "").match(/ADDITIONAL_DOC_PRICING\s*=\s*\{\s*addon:\s*(\d+)/);
  return m ? Number(m[1]) : NaN;
}
/** Read ADDON_AMOUNT_CENTS (cents) from the server function, or NaN. */
function serverCents(src) {
  const m = (src ?? "").match(/const ADDON_AMOUNT_CENTS\s*=\s*(\d+)/);
  return m ? Number(m[1]) : NaN;
}
/** Read COMBO_MATRIX { oneTime, firstYear, renewal } from pricing.ts. */
function comboMatrix(src) {
  const m = (src ?? "").match(
    /const COMBO_MATRIX\s*=\s*Object\.freeze\(\{\s*oneTime:\s*(\d+),\s*firstYear:\s*(\d+),\s*renewal:\s*(\d+)/,
  );
  return m ? { oneTime: Number(m[1]), firstYear: Number(m[2]), renewal: Number(m[3]) } : null;
}

// Each check: { id, run(files) -> problem string | null }. A null return = pass.
const CHECKS = [
  { id: "P1-display-50", run: (f) => {
      const d = displayDollars(f.pricing);
      return d === DISPLAY_DOLLARS ? null : `pricing.ts ADDITIONAL_DOC_PRICING.addon must be ${DISPLAY_DOLLARS} (found ${Number.isNaN(d) ? "unreadable" : d})`;
    } },
  { id: "P2-server-5000", run: (f) => {
      const c = serverCents(f.server);
      return c === SERVER_CENTS ? null : `create-additional-doc-invoice ADDON_AMOUNT_CENTS must be ${SERVER_CENTS} (found ${Number.isNaN(c) ? "unreadable" : c})`;
    } },
  { id: "P3-knobs-agree", run: (f) => {
      const d = displayDollars(f.pricing), c = serverCents(f.server);
      if (Number.isNaN(d) || Number.isNaN(c)) return "cannot verify display/server agreement — a knob is unreadable";
      return c === d * 100 ? null : `display/charge MISMATCH: portal shows $${d} but server charges ${c} cents ($${(c / 100).toFixed(2)}) — the two add-on price knobs must agree`;
    } },
  { id: "P4-charge-not-client-supplied", run: (f) => {
      const tokens = [...(f.server ?? "").matchAll(/unit_amount:\s*([A-Za-z0-9_.]+)/g)].map((m) => m[1]);
      if (!tokens.length) return "server function has no Stripe unit_amount line item to verify";
      const bad = tokens.filter((t) => t !== "ADDON_AMOUNT_CENTS");
      return bad.length ? `Stripe unit_amount must be the server constant ADDON_AMOUNT_CENTS, never a client value (found: ${bad.join(", ")})` : null;
    } },
  { id: "P5-record-records-constant", run: (f) => /amount_cents:\s*ADDON_AMOUNT_CENTS/.test(f.server ?? "") ? null : "the add-on tracking row insert must record amount_cents: ADDON_AMOUNT_CENTS" },
  { id: "P6-refund-uses-actual-charge", run: (f) => {
      const s = f.server ?? "";
      const fullRefund = /stripe\.refunds\.create\(\{\s*payment_intent:\s*rr\.stripe_payment_intent_id\s*\}\)/.test(s);
      const recordsActual = /refund_amount_cents:\s*refund\.amount\s*\?\?\s*rr\.amount_cents/.test(s);
      if (!fullRefund) return "refund must be a FULL Stripe refund by payment_intent (no hard-coded amount)";
      if (!recordsActual) return "refund record must store refund.amount ?? rr.amount_cents (the actual charged amount)";
      return null;
    } },
  { id: "P7-completion-uses-actual-amount", run: (f) => /const amountCents = opts\.amountCents \?\? \(reqRow\.amount_cents as number\) \?\? 5000;/.test(f.complete ?? "") ? null : "completeAdditionalDocPayment must derive amountCents from opts.amountCents ?? reqRow.amount_cents (Stripe/stored actual), with 5000 only as last-resort fallback" },
  { id: "P8-bundle-prices-unchanged", run: (f) => {
      const cm = comboMatrix(f.pricing);
      if (!cm) return "cannot read COMBO_MATRIX (RA bundle prices) from pricing.ts";
      const diffs = Object.keys(BUNDLE).filter((k) => cm[k] !== BUNDLE[k]);
      return diffs.length ? `RA bundle prices must stay unchanged by this task — COMBO_MATRIX drifted at: ${diffs.map((k) => `${k} ${cm[k]}≠${BUNDLE[k]}`).join(", ")}` : null;
    } },
  { id: "P9-admin-hint-50", run: (f) => {
      const src = f.orderModal;
      if (!src) return null; // frozen file absent — nothing to assert (defensive)
      const i = src.indexOf("Send Additional Documentation Invoice");
      if (i < 0) return null; // admin action not present — nothing to assert
      const win = src.slice(i, i + 300);
      if (/>\s*\$(70|40)\s*</.test(win)) return "OrderDetailModal 'Send Additional Documentation Invoice' hint shows a stale $70/$40 — the admin-visible price must be $50";
      if (!/>\s*\$50\s*</.test(win)) return "OrderDetailModal 'Send Additional Documentation Invoice' must render a $50 price hint";
      return null;
    } },
  { id: "P10-no-stale-current-literal", run: (f) => {
      const bad = [];
      const scan = (key, needCtx) => {
        const src = f[key];
        if (!src) return;
        src.split("\n").forEach((line, idx) => {
          if (!/\$(40|70)\b/.test(line)) return;
          if (HISTORICAL.test(line)) return;           // real history — allowed
          if (needCtx && !ADDON_CTX.test(line)) return; // shared file, unrelated $ — ignore
          bad.push(`${PATHS[key]}:${idx + 1}`);
        });
      };
      for (const k of DEDICATED_ADDON) scan(k, false);
      for (const k of SHARED_ADDON) scan(k, true);
      return bad.length ? `stale current-contract $40/$70 in the active add-on path (use $50; mark real history with a historical note): ${bad.join(", ")}` : null;
    } },
];

function runChecks(files) {
  return CHECKS.map((c) => ({ id: c.id, problem: c.run(files) })).filter((r) => r.problem);
}

// ── Negative controls: (label, mutator, expected check id that must trip) ───────
const CONTROLS = [
  ["A: server charge drifts away from $50", (f) => ({ ...f, server: f.server.replace("const ADDON_AMOUNT_CENTS = 5000", "const ADDON_AMOUNT_CENTS = 7000") }), "P2-server-5000"],
  ["B: portal display drifts to $60", (f) => ({ ...f, pricing: f.pricing.replace("addon: 50", "addon: 60") }), "P1-display-50"],
  ["C: display ($70) and server ($50) disagree", (f) => ({ ...f, pricing: f.pricing.replace("addon: 50", "addon: 70") }), "P3-knobs-agree"],
  ["D: Stripe charge trusts a client-supplied amount", (f) => ({ ...f, server: f.server.replace("unit_amount: ADDON_AMOUNT_CENTS", "unit_amount: body.amount ?? ADDON_AMOUNT_CENTS") }), "P4-charge-not-client-supplied"],
  ["E: tracking row records the wrong amount", (f) => ({ ...f, server: f.server.replace("amount_cents: ADDON_AMOUNT_CENTS", "amount_cents: 7000") }), "P5-record-records-constant"],
  ["F: refund hard-codes an amount instead of a full refund", (f) => ({ ...f, server: f.server.replace("stripe.refunds.create({ payment_intent: rr.stripe_payment_intent_id })", "stripe.refunds.create({ payment_intent: rr.stripe_payment_intent_id, amount: 5000 })") }), "P6-refund-uses-actual-charge"],
  ["G: completion path ignores the actual charged amount", (f) => ({ ...f, complete: f.complete.replace("const amountCents = opts.amountCents ?? (reqRow.amount_cents as number) ?? 5000;", "const amountCents = 7000;") }), "P7-completion-uses-actual-amount"],
  ["H: RA bundle one-time price changed", (f) => ({ ...f, pricing: f.pricing.replace("oneTime: 179,", "oneTime: 199,") }), "P8-bundle-prices-unchanged"],
  ["I: admin add-on invoice hint reverts to $70", (f) => ({ ...f, orderModal: f.orderModal.replace('normal-case">$50</span>', 'normal-case">$70</span>') }), "P9-admin-hint-50"],
  ["J: a stale current-contract $70 sneaks into the add-on path", (f) => ({ ...f, addonReq: f.addonReq.replace('"$50 Additional Documentation" flow', '"$70 Additional Documentation" flow') }), "P10-no-stale-current-literal"],
];

// ── ALLOW controls: mutations that must NOT trip (historical references are OK) ──
const ALLOW = [
  ["a legitimate historical $70 reference is allowed", (f) => ({ ...f, addonReq: f.addonReq.replace("//   • create → start a fresh $50 Checkout session and redirect to Stripe.", "//   • create → start a fresh $50 Checkout session and redirect to Stripe.\n//   (the add-on was formerly a $70 service, superseded 2026-07-20.)") }), "P10-no-stale-current-literal"],
];

async function main() {
  const files = await readAll();
  const missing = REQUIRED.filter((k) => files[k] == null).map((k) => PATHS[k]);
  if (missing.length) {
    console.error(`${TAG} FAIL — missing required files: ${missing.join(", ")}`);
    if (!warnOnly) process.exit(1);
    return;
  }

  if (selfTest) {
    const failures = [];
    // 1) The real files must PASS the guard (baseline sanity).
    const baseProblems = runChecks(files);
    for (const p of baseProblems) failures.push(`baseline unexpectedly failed: ${p.id} — ${p.problem}`);
    // 2) Each negative control must TRIP its expected check.
    for (const [label, mutate, expectedId] of CONTROLS) {
      const problems = runChecks(mutate(files));
      if (!problems.some((p) => p.id === expectedId)) failures.push(`control "${label}" did NOT trip ${expectedId} (guard would miss this regression)`);
    }
    // 3) Each ALLOW mutation must NOT trip its check (historical refs are legal).
    for (const [label, mutate, notExpectedId] of ALLOW) {
      const problems = runChecks(mutate(files));
      if (problems.some((p) => p.id === notExpectedId)) failures.push(`ALLOW case "${label}" wrongly tripped ${notExpectedId} (guard over-flags legitimate history)`);
    }
    if (failures.length) {
      console.error(`${TAG} SELF-TEST FAIL — ${failures.length} problem(s):`);
      for (const p of failures) console.error(`  ✗ ${p}`);
      process.exit(1);
    }
    console.log(`${TAG} SELF-TEST OK — baseline passes; all ${CONTROLS.length} negative controls (A–J) trip their guard; ${ALLOW.length} historical-reference case stays allowed. No file mutated on disk.`);
    return;
  }

  const problems = runChecks(files);
  if (problems.length === 0) {
    console.log(`${TAG} OK — standalone RA add-on contract intact: display $${DISPLAY_DOLLARS} = server ${SERVER_CENTS}c, knobs agree, charge server-authoritative (never client), record + refund + webhook use the actual charged amount, admin invoice hint $50, no stale $40/$70 in the active path, RA bundle prices unchanged.`);
    return;
  }
  console.error(`${TAG} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ [${p.id}] ${p.problem}`);
  if (!warnOnly) process.exit(1);
}

main().catch((err) => { console.error(`${TAG} fatal:`, err); process.exit(1); });
