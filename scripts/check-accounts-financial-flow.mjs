#!/usr/bin/env node
// LIVE-ACCOUNTS-FINANCIAL-RECONCILIATION-UX-001 (Phase B) — regression guard.
//
// Locks the Accounts financial-flow contract so a future edit cannot silently:
//   • break the bridge arithmetic (a rendered subtotal that its own +/- rows
//     do not produce),
//   • reuse one visible label for two different formulas,
//   • report "Balanced" without positive reconciliation evidence,
//   • re-label a same-basis mismatch as "explained",
//   • apportion Stripe fees per order / per channel,
//   • drop paid orders out of the channel partition,
//   • emit NaN / Infinity, clamp negatives, or leak PII.
//
// Two layers:
//   1. LOGIC — imports the REAL pure module src/lib/accountsFinancialFlow.ts
//      via jiti and runs a behavioural battery. No mirrored copy to drift.
//   2. STATIC — asserts required invariants are present (and forbidden
//      shortcuts absent) across the Accounts components.
//
// Usage:
//   node scripts/check-accounts-financial-flow.mjs             # guard source
//   node scripts/check-accounts-financial-flow.mjs --self-test # prove it has power

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const C = join(ROOT, "src", "pages", "admin-orders", "components");

const F_LIB      = join(ROOT, "src", "lib", "accountsFinancialFlow.ts");
const F_TAB      = join(C, "PaymentsTab.tsx");
const F_PANEL    = join(C, "PaymentsAccountsPanel.tsx");
const F_CHANNEL  = join(C, "ChannelContributionPanel.tsx");
const F_HEADER   = join(C, "AccountsHeader.tsx");
const F_NAV      = join(C, "AccountsSectionNav.tsx");
const F_FLOW     = join(C, "FinancialBridgeFlow.tsx");
const F_DRAWER   = join(C, "MetricCalculationDrawer.tsx");
const F_RECONVW  = join(C, "AccountsReconciliationView.tsx");
const F_COLLAPSE = join(C, "AccountsCollapsibleSection.tsx");
const F_ROI      = join(C, "MarketingROIHealthPanel.tsx");
const F_CHANLIB  = join(ROOT, "src", "lib", "channelContribution.ts");

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";
const jiti = createJiti(import.meta.url);
const read = (p) => readFileSync(p, "utf8");
const near = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;

// ── Canonical fixture — the owner's July 2026 production figures ─────────────
const JULY = {
  grossChargedUsd: 16764,
  refundsUsd: 843,
  stripeFeesUsd: 585.56,
  providerPaymentsUsd: 3885,
  companyExpensesUsd: 8592,
  paidOrders: 150,
  refundCount: 9,
};

function runLogic(mod) {
  const f = [];
  const {
    buildCompanyFlow, resolveReconciliationStatus, buildReconRows,
    safeRatio, round2, numOr0, relativeFreshness,
    COMPANY_FLOW_LABELS, CHANNEL_FLOW_LABELS, ALL_ACCOUNTS_LABELS,
  } = mod;

  // ── 1. Bridge arithmetic ──────────────────────────────────────────────────
  const flow = buildCompanyFlow(JULY);
  const byKey = Object.fromEntries(flow.steps.map((s) => [s.key, s]));

  if (!near(byKey.net_revenue.runningUsd, JULY.grossChargedUsd - JULY.refundsUsd))
    f.push(`Net Revenue !== Gross − Refunds (got ${byKey.net_revenue.runningUsd})`);
  if (!near(flow.contributionBeforeStripeUsd, 16764 - 843 - 3885))
    f.push(`Contribution Before Stripe wrong (got ${flow.contributionBeforeStripeUsd})`);
  // Must equal the legacy ordering Gross − Fees − Refunds − Provider = 11450.44.
  if (!near(flow.contributionAfterStripeUsd, 11450.44))
    f.push(`Contribution After Stripe must equal the production figure 11450.44 (got ${flow.contributionAfterStripeUsd})`);
  if (!near(flow.operatingNetUsd, 11450.44 - JULY.companyExpensesUsd))
    f.push(`Operating Net !== Contribution After Stripe − Company Expenses (got ${flow.operatingNetUsd})`);

  // Every step's running total must be reproducible from the one before it —
  // a rendered subtotal can never disagree with the rows above it.
  let running = null;
  for (const s of flow.steps) {
    if (running === null) { running = s.runningUsd; continue; }
    const expected = s.kind === "delta" ? round2(running + s.amountUsd) : running;
    if (!near(s.runningUsd, expected))
      f.push(`step "${s.key}" running total ${s.runningUsd} != ${expected} derived from the previous step`);
    running = s.runningUsd;
  }
  // Deltas must be signed as costs (negative), never silently positive.
  for (const s of flow.steps.filter((x) => x.kind === "delta")) {
    if (s.amountUsd > 0) f.push(`delta step "${s.key}" should be negative (a deduction), got ${s.amountUsd}`);
  }
  // Every step carries drawer metadata.
  for (const s of flow.steps) {
    if (!s.formula || !s.workedExample || !s.tooltip || !s.dateBasis || !s.source)
      f.push(`step "${s.key}" is missing calculation-drawer metadata`);
  }

  // ── 2. One label = one formula ────────────────────────────────────────────
  const dupes = ALL_ACCOUNTS_LABELS.filter((l, i) => ALL_ACCOUNTS_LABELS.indexOf(l) !== i);
  if (dupes.length > 0) f.push(`duplicate visible label(s) across Accounts: ${[...new Set(dupes)].join(", ")}`);
  if (ALL_ACCOUNTS_LABELS.includes("Contribution"))
    f.push(`bare label "Contribution" is ambiguous — company and channel formulas differ`);
  if (ALL_ACCOUNTS_LABELS.includes("Contribution Margin"))
    f.push(`"Contribution Margin" must be renamed to state which fees are already deducted`);
  for (const l of CHANNEL_FLOW_LABELS) {
    if (COMPANY_FLOW_LABELS.includes(l)) f.push(`channel label "${l}" collides with a company label`);
  }
  const flowLabels = flow.steps.map((s) => s.label);
  if (flowLabels.join("|") !== COMPANY_FLOW_LABELS.join("|"))
    f.push(`buildCompanyFlow labels drifted from COMPANY_FLOW_LABELS`);

  // ── 3. Negatives visible, no NaN / Infinity ───────────────────────────────
  const loss = buildCompanyFlow({ ...JULY, companyExpensesUsd: 999999 });
  if (loss.operatingNetUsd >= 0) f.push(`a loss-making range must keep Operating Net negative`);

  const garbage = buildCompanyFlow({
    grossChargedUsd: NaN, refundsUsd: Infinity, stripeFeesUsd: undefined,
    providerPaymentsUsd: null, companyExpensesUsd: NaN, paidOrders: NaN, refundCount: -5,
  });
  for (const s of garbage.steps) {
    if (!isFinite(s.amountUsd) || !isFinite(s.runningUsd))
      f.push(`non-finite value survived into step "${s.key}"`);
    if (s.includedCount != null && (!isFinite(s.includedCount) || s.includedCount < 0))
      f.push(`step "${s.key}" produced an invalid count ${s.includedCount}`);
  }
  if (safeRatio(1, 0) !== null) f.push(`safeRatio must return null (not Infinity) on a zero denominator`);
  if (safeRatio(1, -3) !== null) f.push(`safeRatio must return null on a negative denominator`);
  if (numOr0(NaN) !== 0 || numOr0(Infinity) !== 0) f.push(`numOr0 must neutralise NaN/Infinity`);

  // ── 4. Reconciliation status is evidence-driven ───────────────────────────
  const base = {
    loading: false, hasError: false, bridgeFullyExplained: true,
    channelPartitionBalanced: true, channelVsOrderBasisOrderDelta: 0,
    channelVsOrderBasisNetDeltaUsd: 0, spendSyncStale: false,
  };
  if (resolveReconciliationStatus(base).status !== "balanced")
    f.push(`clean evidence must read "balanced"`);
  if (resolveReconciliationStatus({ ...base, bridgeFullyExplained: null }).status !== "updating")
    f.push(`an unresolved bridge must read "updating", never "balanced"`);
  if (resolveReconciliationStatus({ ...base, loading: true }).status !== "updating")
    f.push(`a still-loading range must read "updating"`);
  if (resolveReconciliationStatus({ ...base, hasError: true }).status !== "data_source_error")
    f.push(`a failed data source must read "data_source_error"`);
  if (resolveReconciliationStatus({ ...base, bridgeFullyExplained: false }).status !== "needs_review")
    f.push(`an unexplained bridge residual must read "needs_review"`);

  // The production symptom: 6 paid orders missing from the channel view.
  const missing6 = resolveReconciliationStatus({ ...base, channelVsOrderBasisOrderDelta: -6 });
  if (missing6.status !== "needs_review")
    f.push(`missing paid orders must read "needs_review", got "${missing6.status}"`);
  if (!missing6.reasons.some((r) => r.includes("6")))
    f.push(`the missing-order reason must state how many orders are missing`);

  const net300 = resolveReconciliationStatus({ ...base, channelVsOrderBasisNetDeltaUsd: -300 });
  if (net300.status !== "needs_review") f.push(`a net-revenue delta must read "needs_review"`);
  if (net300.reasons.length === 0) f.push(`a net-revenue delta must state a reason`);

  if (resolveReconciliationStatus({ ...base, channelPartitionBalanced: false }).status !== "needs_review")
    f.push(`an unbalanced channel partition must read "needs_review"`);
  if (resolveReconciliationStatus({ ...base, spendSyncStale: true }).status !== "sync_pending")
    f.push(`a stale spend sync must read "sync_pending"`);
  // A cent of float noise must not trip the badge.
  if (resolveReconciliationStatus({ ...base, channelVsOrderBasisNetDeltaUsd: 0.004 }).status !== "balanced")
    f.push(`sub-cent float noise must not flip the badge off "balanced"`);
  if (resolveReconciliationStatus(base).reasons.length !== 0)
    f.push(`"balanced" must carry no reasons`);

  // ── 5. Same-basis mismatches never read "explained" ───────────────────────
  const sameBasis = buildReconRows(
    [{ metric: "Paid Orders", companyValue: 158, channelValue: 152, isCount: true, basisNote: null }],
    true,
  );
  if (sameBasis[0].status !== "mismatch")
    f.push(`a same-basis difference must be a "mismatch" (got "${sameBasis[0].status}")`);
  if (sameBasis[0].deltaValue !== -6)
    f.push(`same-basis delta must be reported exactly (got ${sameBasis[0].deltaValue})`);

  const diffBasis = buildReconRows(
    [{ metric: "Gross Charged", companyValue: 16764, channelValue: 16534, basisNote: "add-on payments", isCount: false }],
    true,
  );
  if (diffBasis[0].status !== "explained")
    f.push(`a different-basis difference with a resolved bridge must be "explained"`);

  const diffBasisUnresolved = buildReconRows(
    [{ metric: "Gross Charged", companyValue: 16764, channelValue: 16534, basisNote: "add-on payments", isCount: false }],
    false,
  );
  if (diffBasisUnresolved[0].status !== "mismatch")
    f.push(`a basis difference must NOT read "explained" while the bridge has an unexplained residual`);

  const tied = buildReconRows(
    [{ metric: "Net Revenue", companyValue: 17357, channelValue: 17357, basisNote: null, isCount: false }],
    true,
  );
  if (tied[0].status !== "ok") f.push(`identical values must read "ok"`);

  const missingSide = buildReconRows(
    [{ metric: "Net Revenue", companyValue: null, channelValue: 100, basisNote: null, isCount: false }],
    true,
  );
  if (missingSide[0].status !== "unavailable")
    f.push(`a missing side must read "unavailable", never "ok"`);

  // ── 6. Freshness helper ───────────────────────────────────────────────────
  if (relativeFreshness(null, 1_000_000) !== "not loaded yet")
    f.push(`relativeFreshness must handle a never-loaded range`);
  if (!relativeFreshness(0, 120_000).includes("2 minute"))
    f.push(`relativeFreshness must render minutes`);

  return f;
}

// ── Static invariants ────────────────────────────────────────────────────────
function runStatic() {
  const f = [];
  const tab = read(F_TAB);
  const panel = read(F_PANEL);
  const channel = read(F_CHANNEL);
  const header = read(F_HEADER);
  const nav = read(F_NAV);
  const flow = read(F_FLOW);
  const drawer = read(F_DRAWER);
  const reconvw = read(F_RECONVW);
  const collapse = read(F_COLLAPSE);
  const roi = read(F_ROI);
  const chanlib = read(F_CHANLIB);
  const lib = read(F_LIB);

  const need = (src, name, re, msg) => { if (!re.test(src)) f.push(`${name}: ${msg}`); };
  const forbid = (src, name, re, msg) => { if (re.test(src)) f.push(`${name}: ${msg}`); };

  // Shell is mounted.
  need(tab, "PaymentsTab", /<AccountsHeader\b/, "AccountsHeader must be mounted in the Accounts view");
  need(tab, "PaymentsTab", /<AccountsSectionNav\b/, "AccountsSectionNav must be mounted");
  need(tab, "PaymentsTab", /<AccountsReconciliationView\b/, "AccountsReconciliationView must be mounted");
  need(tab, "PaymentsTab", /<AccountsReconciliationBridge[\s\S]{0,400}onResult=/, "the bridge verdict must be lifted via onResult");
  need(tab, "PaymentsTab", /<ChannelContributionPanel[\s\S]{0,400}onTotals=/, "channel totals must be lifted via onTotals");
  need(tab, "PaymentsTab", /resolveReconciliationStatus\(/, "the header badge must come from resolveReconciliationStatus");

  // ONE date range for every Accounts section.
  need(tab, "PaymentsTab", /const accountsFrom = customFrom \|\|/, "a single accountsFrom must drive every Accounts query");
  need(tab, "PaymentsTab", /const accountsTo = customTo \|\|/, "a single accountsTo must drive every Accounts query");
  const accountsBlock = tab.slice(tab.indexOf("activeView === \"accounts\""));
  const perPanelDates = accountsBlock.match(/(from|to)=\{(customFrom|customTo) \|\| new Date\(\)/g) ?? [];
  if (perPanelDates.length > 0)
    f.push(`PaymentsTab: ${perPanelDates.length} Accounts panel(s) still compute their own date instead of using accountsFrom/accountsTo`);

  // The current-month race fix must survive.
  need(tab, "PaymentsTab", /fetchSeq\.current/, "the stale-response sequence guard must remain intact");
  need(tab, "PaymentsTab", /if \(activeView === "accounts"\) return;/, "the Accounts view must keep owning its own range fetch (no preset race)");
  need(tab, "PaymentsTab", /applyAccountsPreset\("current_month"\)/, "Accounts must still default to the current calendar month");

  // Overview replaced the disconnected cards with the real bridge.
  need(panel, "PaymentsAccountsPanel", /buildCompanyFlow\(/, "the Overview must be built from buildCompanyFlow");
  need(panel, "PaymentsAccountsPanel", /<FinancialBridgeFlow\b/, "the financial bridge must be rendered");
  need(panel, "PaymentsAccountsPanel", /<MetricCalculationDrawer\b/, "the calculation drawer must be mounted");
  need(panel, "PaymentsAccountsPanel", /onTotals\?\.|onTotals\(/, "company totals must be published upward");

  // Renamed labels — two formulas may never share a visible label.
  forbid(panel, "PaymentsAccountsPanel", /"Contribution Margin"|>Contribution Margin</, "the ambiguous label \"Contribution Margin\" must be gone");
  need(panel, "PaymentsAccountsPanel", /Contribution After Stripe/, "the company figure must state that Stripe fees are already deducted");
  forbid(channel, "ChannelContributionPanel", /label: "Contribution"/, "the channel KPI must not use the bare label \"Contribution\"");
  need(channel, "ChannelContributionPanel", /Before Stripe &amp; Ad Spend|Before Stripe & Ad Spend/, "the channel figure must say it is before Stripe and ad spend");

  // Channel honesty: basis statement, reconciliation bar, Unknown catch-all.
  need(channel, "ChannelContributionPanel", /same paid-order universe/, "the channel section must state its basis explicitly");
  need(channel, "ChannelContributionPanel", /paid order[\s\S]{0,40}classified/, "the channel section must show how many paid orders were classified");
  need(channel, "ChannelContributionPanel", /unknownOrders/, "Unknown must be surfaced as the reconciliation catch-all");

  // No fabricated Stripe fee anywhere in the channel path.
  for (const [src, name] of [[channel, "ChannelContributionPanel"], [chanlib, "channelContribution.ts"], [flow, "FinancialBridgeFlow"]]) {
    forbid(src, name, /stripeFeePerOrder|feePerChannel|allocateStripeFee|estimatedChannelFee/, "Stripe fees must never be apportioned per order or per channel");
  }
  need(chanlib, "channelContribution.ts", /NO STRIPE FEES/, "the no-fee-apportionment contract note must remain");

  // Marketing spend must not be double counted or fabricated.
  need(panel, "PaymentsAccountsPanel", /duplicateMarketingRisk/, "the duplicate marketing-spend warning must remain");
  need(tab, "PaymentsTab", /Microsoft Ads[\s\S]{0,200}not_connected/, "Microsoft Ads must report not-connected rather than a fabricated spend");

  // ── Correction addendum §4–§7 invariants ──────────────────────────────────
  // §6: exactly ONE marketing section — the old Marketing Spend panel must not return.
  forbid(tab, "PaymentsTab", /<MarketingSpendPanel\b/, "the duplicate Marketing Spend panel was consolidated into Marketing ROI & Sync Health and must not be re-mounted");
  need(roi, "MarketingROIHealthPanel", /get_marketing_roi_health/, "the consolidated marketing section must read the ONE roi-health RPC");
  forbid(roi, "MarketingROIHealthPanel", /get_marketing_spend_summary/, "the consolidated marketing section must not double-fetch the spend-summary RPC");
  need(roi, "MarketingROIHealthPanel", /onSyncNow/, "the consolidated marketing section must use the SHARED sync handler (no duplicate sync implementation)");
  forbid(roi, "MarketingROIHealthPanel", /functions\/v1\/sync-marketing-spend/, "the sync fetch lives once in PaymentsTab — the panel must not carry its own copy");
  // §5: ONE shared sync flow, guarded against concurrent duplicates.
  need(tab, "PaymentsTab", /sync-marketing-spend/, "the shared manual sync flow must call the existing protected edge fn");
  need(tab, "PaymentsTab", /if \(adsSyncing[\s\S]{0,60}return;/, "the shared sync must refuse to start while a sync is already running");
  need(tab, "PaymentsTab", /onSyncAds=/, "the Accounts header must expose the Sync Ads quick action");
  need(tab, "PaymentsTab", /onAddExpense=/, "the Accounts header must expose the Add Expense quick action");
  need(header, "AccountsHeader", /Sync Ads/, "the header must render the Sync Ads quick action");
  need(header, "AccountsHeader", /Add Expense/, "the header must render the Add Expense quick action");
  // §7: accessible collapsible sections; reconciliation auto-opens on attention.
  need(collapse, "AccountsCollapsibleSection", /aria-expanded=\{open\}/, "collapsible sections must expose aria-expanded");
  need(collapse, "AccountsCollapsibleSection", /aria-controls=/, "collapsible sections must wire aria-controls");
  need(collapse, "AccountsCollapsibleSection", /<button/, "the collapse toggle must be a real button (keyboard support)");
  need(tab, "PaymentsTab", /reconNeedsAttention\) setReconOpen\(true\)/, "Reconciliation must auto-expand when evidence needs attention");

  // Reconciliation view honesty + no PII.
  need(reconvw, "AccountsReconciliationView", /Order basis vs Channel Contribution/, "the same-basis comparison must be shown separately");
  need(reconvw, "AccountsReconciliationView", /Data-source health/, "data-source health must be shown");
  need(reconvw, "AccountsReconciliationView", /Unclassified items/, "unclassified aggregate counts must be shown");
  forbid(reconvw, "AccountsReconciliationView", /customer_email|customer_name|\.email\b/, "the reconciliation view must never render customer PII");
  forbid(drawer, "MetricCalculationDrawer", /customer_email|customer_name|\.email\b/, "the calculation drawer must never render customer PII");
  forbid(flow, "FinancialBridgeFlow", /customer_email|customer_name/, "the bridge flow must never render customer PII");

  // Aggregated data only — no raw order dump into the browser for these views.
  for (const [src, name] of [[reconvw, "AccountsReconciliationView"], [flow, "FinancialBridgeFlow"], [drawer, "MetricCalculationDrawer"], [header, "AccountsHeader"], [nav, "AccountsSectionNav"]]) {
    forbid(src, name, /\.from\(["']orders["']\)/, "must not query raw orders from the browser — use the aggregated RPCs");
  }

  // Accessibility: subtraction is not communicated by colour alone.
  need(flow, "FinancialBridgeFlow", /Less|−/, "deductions must carry an explicit minus/Less marker, not colour alone");

  // Responsive: wide content scrolls inside its own container.
  need(reconvw, "AccountsReconciliationView", /overflow-x-auto/, "wide tables must scroll inside their own container");
  need(flow, "FinancialBridgeFlow", /overflow-x-auto/, "the desktop bridge must scroll inside its own container");
  need(flow, "FinancialBridgeFlow", /md:hidden/, "the bridge must have a stacked mobile layout");
  need(nav, "AccountsSectionNav", /overflow-x-auto/, "the section nav must scroll horizontally on narrow screens");

  // Header must not hard-code a status. Comments are stripped first so the
  // guard reacts to CODE, not to prose that happens to mention "Balanced".
  const headerCode = header.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  forbid(headerCode, "AccountsHeader", /status\s*=\s*["']balanced["']/, "the header must not assign a hard-coded balanced status");
  forbid(headerCode, "AccountsHeader", />\s*Balanced\s*</, "the header must not render a hard-coded \"Balanced\" label");
  need(header, "AccountsHeader", /RECONCILIATION_STATUS_META\[status\]/, "the header badge must be driven by the resolved status");
  need(header, "AccountsHeader", /statusReasons\.map/, "unresolved reasons must be disclosed, not hidden behind the badge");

  // Existing exports / flows preserved.
  need(panel, "PaymentsAccountsPanel", /exportAccountsCSV\(/, "the Accounts CSV export must still exist");
  need(tab, "PaymentsTab", /activeView === "payments"/, "Payments & Refunds must still render");
  need(tab, "PaymentsTab", /<PaymentReconciliationPanel\b/, "the Reconciliation Tool must still render");

  // Library contract notes must survive.
  need(lib, "accountsFinancialFlow.ts", /ONE STEP = ONE FORMULA = ONE LABEL/, "the label contract note must remain");
  need(lib, "accountsFinancialFlow.ts", /STRIPE FEES ARE COMPANY-LEVEL ONLY/, "the no-fee-apportionment note must remain");
  need(lib, "accountsFinancialFlow.ts", /NO NaN \/ NO Infinity/, "the numeric-safety note must remain");

  return f;
}

async function main() {
  const selfTest = process.argv.includes("--self-test");
  const mod = await jiti.import(F_LIB);

  if (selfTest) {
    // Prove the battery has power: sabotage the model and expect failures.
    const sabotaged = {
      ...mod,
      buildCompanyFlow: (i) => {
        const r = mod.buildCompanyFlow(i);
        return { ...r, operatingNetUsd: Math.max(0, r.operatingNetUsd) }; // clamp a loss
      },
      resolveReconciliationStatus: () => ({ status: "balanced", reasons: [] }), // always green
    };
    const found = runLogic(sabotaged);
    if (found.length === 0) {
      console.error(`${RED}✗ SELF-TEST FAILED: sabotaged model passed the battery${RESET}`);
      process.exit(1);
    }
    console.log(`${GREEN}✓ self-test: battery detected ${found.length} planted defect(s)${RESET}`);
  }

  const failures = [...runLogic(mod), ...runStatic()];
  if (failures.length > 0) {
    console.error(`${RED}✗ check-accounts-financial-flow: ${failures.length} failure(s)${RESET}`);
    for (const x of failures) console.error(`  ${YELLOW}- ${x}${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ check-accounts-financial-flow: all logic + static invariants hold${RESET}`);
}

main().catch((e) => {
  console.error(`${RED}✗ check-accounts-financial-flow crashed: ${e?.message ?? e}${RESET}`);
  process.exit(1);
});
