#!/usr/bin/env node
// LIVE-ACCOUNTS-FINANCIAL-RECONCILIATION-UX-001 — regression guard + test suite.
//
// Locks in the Stripe ↔ Orders Reconciliation contract so a future edit can't
// silently break the exclusive charge partition, the bridge arithmetic, the
// first-class residual reporting, or the no-fee-apportionment / no-PII
// invariants.
//
// Two layers:
//   1. LOGIC — imports the REAL pure module src/lib/accountsReconciliation.ts
//      via jiti and runs the behavioural battery (partition exclusivity,
//      add-on / unlinked / duplicate / price-diff / boundary lines, refund
//      timing bridge, provider basis bridge, residual detection, failed
//      charges ignored). No mirror to drift.
//   2. STATIC — asserts required invariants are present (and forbidden
//      shortcuts absent) in accountsReconciliation.ts,
//      AccountsReconciliationBridge.tsx, PaymentsTab.tsx, and the
//      get_accounts_reconciliation migration.
//
// Usage:
//   node scripts/check-accounts-reconciliation.mjs             # guard source
//   node scripts/check-accounts-reconciliation.mjs --self-test # prove the battery has power

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const F_LIB = join(ROOT, "src", "lib", "accountsReconciliation.ts");
const F_PANEL = join(ROOT, "src", "pages", "admin-orders", "components", "AccountsReconciliationBridge.tsx");
const F_TAB = join(ROOT, "src", "pages", "admin-orders", "components", "PaymentsTab.tsx");
const F_MIG = join(ROOT, "supabase", "migrations", "20260725120000_add_get_accounts_reconciliation.sql");

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";

const jiti = createJiti(import.meta.url);

// ── Canonical fixture ────────────────────────────────────────────────────────
// 5 succeeded charges + 1 failed:
//   a  (pi_a) $129, provider deducted $30 — clean match
//   a2 (pi_a) $129, provider deducted $30 — DUPLICATE intent (recovery chain)
//   b  (pi_b) $169, provider deducted $30 — charged $20 over recorded price;
//                                            order-side provider is $60 (add-on earning)
//   x  (pi_x) $50 — add-on documentation payment (no order row)
//   u  (pi_u) $89, provider deducted $25 — unlinked (no order, no add-on)
// Order C (pi_c, $110, provider $30) has NO charge in the window (boundary).
// Stripe refunds $268 = order-basis $149 + prior-window orders $119.
function fixture() {
  return {
    charges: [
      { payment_intent: "pi_a", amount: 129, status: "succeeded", providerDeductedUsd: 30 },
      { payment_intent: "pi_a", amount: 129, status: "succeeded", providerDeductedUsd: 30 },
      { payment_intent: "pi_b", amount: 169, status: "succeeded", providerDeductedUsd: 30 },
      { payment_intent: "pi_x", amount: 50, status: "succeeded", providerDeductedUsd: 0 },
      { payment_intent: "pi_u", amount: 89, status: "succeeded", providerDeductedUsd: 25 },
      { payment_intent: "pi_f", amount: 999, status: "failed", providerDeductedUsd: 0 },
    ],
    stripeRefundsUsd: 268,
    rpc: {
      date_from: "2026-07-01",
      date_to: "2026-07-31",
      currency: "USD",
      order_basis: { paid_orders: 3, gross_usd: 388, refund_usd: 149, net_usd: 239, provider_usd: 120 },
      orders: [
        { payment_intent_id: "pi_a", confirmation_id: "PT-A", gross_usd: 129, refund_usd: 0, provider_usd: 30 },
        { payment_intent_id: "pi_b", confirmation_id: "PT-B", gross_usd: 149, refund_usd: 149, provider_usd: 60 },
        { payment_intent_id: "pi_c", confirmation_id: "PT-C", gross_usd: 110, refund_usd: 0, provider_usd: 30 },
      ],
      addon_payments: [
        { payment_intent_id: "pi_x", confirmation_id: "PT-A", amount_usd: 50, refund_in_window_usd: 0 },
      ],
      refund_timing: {
        prior_order_refunds_usd: 119,
        addon_refunds_usd: 0,
        window_order_refunds_outside_usd: 0,
      },
    },
  };
}

const eq = (a, b) => Math.abs(a - b) < 0.005;
const line = (section, key) => section.lines.find((l) => l.key === key);

function runLogic(build) {
  const F = [];
  const r = build(fixture());

  // Gross bridge — partition + arithmetic.
  if (r.gross.startCount !== 5) F.push(`[gross] startCount ${r.gross.startCount} != 5 (failed charge must be ignored)`);
  if (!eq(r.gross.startUsd, 566)) F.push(`[gross] start ${r.gross.startUsd} != 566`);
  if (!eq(line(r.gross, "addons")?.amountUsd, -50)) F.push(`[gross] addons line != -50`);
  if (line(r.gross, "addons")?.count !== 1) F.push(`[gross] addons count != 1`);
  if (!eq(line(r.gross, "unlinked")?.amountUsd, -89)) F.push(`[gross] unlinked line != -89`);
  if (!eq(line(r.gross, "duplicates")?.amountUsd, -129)) F.push(`[gross] duplicates line != -129`);
  if (!eq(line(r.gross, "price_diff")?.amountUsd, -20)) F.push(`[gross] price_diff line != -20`);
  if (!eq(line(r.gross, "missing_charge")?.amountUsd, 110)) F.push(`[gross] missing_charge line != +110`);
  if (!eq(r.gross.computedUsd, 388)) F.push(`[gross] computed ${r.gross.computedUsd} != 388`);
  if (!eq(r.gross.residualUsd, 0)) F.push(`[gross] residual ${r.gross.residualUsd} != 0`);
  if (r.gross.computedCount !== 3) F.push(`[gross] computedCount ${r.gross.computedCount} != 3`);
  if (r.gross.residualCount !== 0) F.push(`[gross] residualCount ${r.gross.residualCount} != 0`);
  // Exclusive partition: matched (= start − addon − dup − unlinked) + those
  // three buckets must exactly re-compose the succeeded charge count.
  const nonMatched = (line(r.gross, "addons")?.count ?? 0)
    + (line(r.gross, "duplicates")?.count ?? 0)
    + (line(r.gross, "unlinked")?.count ?? 0);
  if (nonMatched !== 3) F.push(`[gross] partition buckets ${nonMatched} != 3 (1 addon + 1 dup + 1 unlinked)`);
  if ((r.gross.startCount ?? 0) - nonMatched !== 2) F.push(`[gross] matched charge count != 2`);

  // Refunds bridge.
  if (!eq(r.refunds.startUsd, 268)) F.push(`[refunds] start ${r.refunds.startUsd} != 268`);
  if (!eq(line(r.refunds, "prior_orders")?.amountUsd, -119)) F.push(`[refunds] prior_orders != -119`);
  if (!eq(r.refunds.computedUsd, 149)) F.push(`[refunds] computed ${r.refunds.computedUsd} != 149`);
  if (!eq(r.refunds.residualUsd, 0)) F.push(`[refunds] residual ${r.refunds.residualUsd} != 0`);

  // Provider bridge.
  if (!eq(r.provider.startUsd, 115)) F.push(`[provider] start ${r.provider.startUsd} != 115`);
  if (!eq(line(r.provider, "order_only")?.amountUsd, 60)) F.push(`[provider] order_only != +60 (30 add-on earning + 30 boundary order)`);
  if (!eq(line(r.provider, "stripe_only")?.amountUsd, -55)) F.push(`[provider] stripe_only != -55 (30 duplicate + 25 unlinked)`);
  if (!eq(r.provider.computedUsd, 120)) F.push(`[provider] computed ${r.provider.computedUsd} != 120`);
  if (!eq(r.provider.residualUsd, 0)) F.push(`[provider] residual ${r.provider.residualUsd} != 0`);

  // Net headline + verdict.
  if (!eq(r.net.stripeUsd, 298)) F.push(`[net] stripe ${r.net.stripeUsd} != 298 (566-268)`);
  if (!eq(r.net.orderBasisUsd, 239)) F.push(`[net] orderBasis ${r.net.orderBasisUsd} != 239`);
  if (!eq(r.net.deltaUsd, -59)) F.push(`[net] delta ${r.net.deltaUsd} != -59`);
  if (r.fullyExplained !== true) F.push(`[verdict] fixture must be fullyExplained`);

  // Residuals are first-class: tampering the order basis MUST surface.
  const tampered = fixture();
  tampered.rpc.order_basis.gross_usd = 500; // unexplained +112
  const rt = build(tampered);
  if (eq(rt.gross.residualUsd, 0)) F.push(`[residual] tampered gross residual not detected`);
  if (rt.fullyExplained !== false) F.push(`[residual] tampered fixture must NOT be fullyExplained`);

  const tamperedRefund = fixture();
  tamperedRefund.rpc.refund_timing.prior_order_refunds_usd = 0;
  const rr = build(tamperedRefund);
  if (eq(rr.refunds.residualUsd, 0)) F.push(`[residual] refund-timing tamper not detected`);

  // Empty inputs are safe (no NaN / crash).
  const empty = build({
    charges: [],
    stripeRefundsUsd: 0,
    rpc: {
      date_from: "2026-07-01", date_to: "2026-07-31", currency: "USD",
      order_basis: { paid_orders: 0, gross_usd: 0, refund_usd: 0, net_usd: 0, provider_usd: 0 },
      orders: [], addon_payments: [],
      refund_timing: { prior_order_refunds_usd: 0, addon_refunds_usd: 0, window_order_refunds_outside_usd: 0 },
    },
  });
  if (!empty.fullyExplained) F.push(`[empty] zero-data window must be fullyExplained`);
  for (const v of [empty.gross.startUsd, empty.net.stripeUsd, empty.provider.residualUsd])
    if (!isFinite(v)) F.push(`[empty] non-finite value leaked: ${v}`);

  return F;
}

// ── Static invariants ────────────────────────────────────────────────────────
function runStatic() {
  const F = [];
  const lib = readFileSync(F_LIB, "utf8");
  const panel = readFileSync(F_PANEL, "utf8");
  const tab = readFileSync(F_TAB, "utf8");
  const mig = readFileSync(F_MIG, "utf8");

  // Lib is pure: no supabase / fetch / side effects; no fee estimation.
  if (/from\s+["'].*supabase/i.test(lib)) F.push("[static] lib must not import supabase (pure module)");
  if (/\b(fetch|axios)\s*\(/.test(lib)) F.push("[static] lib must not perform I/O");
  if (/0\.029|EST_FEE|estimateFee/i.test(lib)) F.push("[static] lib must never estimate/apportion Stripe fees");
  if (!/export function buildAccountsReconciliation/.test(lib)) F.push("[static] lib must export buildAccountsReconciliation");
  if (!/residualUsd/.test(lib)) F.push("[static] lib must model residuals explicitly");

  // Panel: reads the RPC, reuses the canonical payout classifier, no fee math.
  if (!/get_accounts_reconciliation/.test(panel)) F.push("[static] panel must read get_accounts_reconciliation");
  if (!/buildAccountsReconciliation/.test(panel)) F.push("[static] panel must use the pure bridge builder");
  if (!/resolutionToClassification/.test(panel)) F.push("[static] panel must reuse the canonical payout classification");
  if (/0\.029|estimateFee/.test(panel)) F.push("[static] panel must never estimate Stripe fees");
  if (/never hidden|never hides|surfaced/i.test(lib) === false) F.push("[static] lib contract comment lost");

  // PaymentsTab: bridge mounted BETWEEN the accounts panel and channel panel.
  const iAccounts = tab.indexOf("<PaymentsAccountsPanel");
  const iBridge = tab.indexOf("<AccountsReconciliationBridge");
  const iChannel = tab.indexOf("<ChannelContributionPanel");
  if (iBridge === -1) F.push("[static] PaymentsTab must mount AccountsReconciliationBridge");
  else if (!(iAccounts !== -1 && iChannel !== -1 && iAccounts < iBridge && iBridge < iChannel))
    F.push("[static] bridge must sit between PaymentsAccountsPanel and ChannelContributionPanel");
  for (const prop of ["summary={data?.summary}", "charges={data?.charges}", "resolutionMap={resolutionMap}"])
    if (!tab.includes(prop)) F.push(`[static] PaymentsTab must pass ${prop} to the bridge`);

  // Migration: gated, definer, additive, PII-safe.
  if (!/is_accounts_admin\(\)/.test(mig)) F.push("[static] migration must gate on is_accounts_admin()");
  if (!/security definer/i.test(mig)) F.push("[static] migration must be security definer");
  if (!/stable/i.test(mig)) F.push("[static] migration must be stable (read-only)");
  if (!/grant execute on function public\.get_accounts_reconciliation/i.test(mig)) F.push("[static] migration must grant execute to authenticated");
  if (/customer_email|customer_name|\bo\.email\b|first_name|last_name/i.test(mig)) F.push("[static] migration must not project PII columns");
  if (/\b(update|delete|insert)\s+/i.test(mig.replace(/--.*$/gm, ""))) F.push("[static] migration must be read-only (no writes)");
  if (!/order_additional_documentation_requests/.test(mig)) F.push("[static] migration must cover add-on payments");
  if (!/patient_notified/.test(mig)) F.push("[static] migration must keep the completed-only provider rule");

  return F;
}

// ── Runner ───────────────────────────────────────────────────────────────────
async function main() {
  const selfTest = process.argv.includes("--self-test");
  const mod = await jiti.import(F_LIB);
  const build = mod.buildAccountsReconciliation;

  if (selfTest) {
    // Prove the battery has power: a sabotaged builder must produce failures.
    const sabotaged = (input) => {
      const r = build(input);
      return { ...r, fullyExplained: true, gross: { ...r.gross, residualUsd: 0, computedUsd: r.gross.orderBasisUsd } };
    };
    const f = runLogic(sabotaged);
    if (f.length === 0) {
      console.error(`${RED}✗ SELF-TEST FAILED: sabotaged builder passed the battery${RESET}`);
      process.exit(1);
    }
    console.log(`${GREEN}✓ self-test: battery detected ${f.length} planted defect(s)${RESET}`);
  }

  const failures = [...runLogic(build), ...runStatic()];
  if (failures.length > 0) {
    console.error(`${RED}✗ check-accounts-reconciliation: ${failures.length} failure(s)${RESET}`);
    for (const f of failures) console.error(`  ${YELLOW}- ${f}${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ check-accounts-reconciliation: all logic + static invariants hold${RESET}`);
}

main().catch((e) => {
  console.error(`${RED}✗ check-accounts-reconciliation crashed: ${e?.message ?? e}${RESET}`);
  process.exit(1);
});
