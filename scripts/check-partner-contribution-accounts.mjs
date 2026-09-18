#!/usr/bin/env node
// PARTNER-CONTRIBUTION-ACCOUNTS-001 — durable regression guard.
//
// Locks the integration of partner (B2B) economics into Admin → Accounts:
//
//   Operating Net = Direct Contribution After Stripe
//                 + Partner Contribution
//                 − Company Expenses
//
// It fails if a future edit reintroduces any of the fourteen regressions the
// owner enumerated:
//
//    1. Partner Contribution omitted from Operating Net.
//    2. Partner revenue added to Stripe Gross Charged.
//    3. Stripe fees applied to partner revenue.
//    4. Partner provider compensation subtracted twice.
//    5. Partner provider compensation not subtracted at all.
//    6. Historical partner contribution moves when a partner's current rate changes.
//    7. A duplicate join counts one billable event twice.
//    8. An unrecognised / unbillable partner order counted.
//    9. New York month boundaries replaced with UTC boundaries.
//   10. The Overview and the Partner Contribution tab disagree.
//   11. A hidden `partner=` query parameter filters the global Overview.
//   12. The export omits Partner Contribution.
//   13. A non-admin role gains access.
//   14. Direct-only Accounts totals change when no partner events exist.
//
// Two layers, same pattern as check-accounts-financial-flow.mjs:
//   1. LOGIC  — imports the REAL pure modules (src/lib/partnerContribution.ts,
//               src/lib/accountsFinancialFlow.ts) via jiti and runs a
//               behavioural battery. No mirrored copy to drift.
//   2. STATIC — asserts required invariants are present (and forbidden
//               shortcuts absent) across the Accounts components, the
//               canonical SQL, and the CSV exports.
//
// Usage:
//   node scripts/check-partner-contribution-accounts.mjs             # guard source
//   node scripts/check-partner-contribution-accounts.mjs --self-test # prove it has power

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const C = join(ROOT, "src", "pages", "admin-orders", "components");

const F_PARTNER  = join(ROOT, "src", "lib", "partnerContribution.ts");
const F_FLOW     = join(ROOT, "src", "lib", "accountsFinancialFlow.ts");
const F_BOOKSLIB = join(ROOT, "src", "lib", "accountsBooks.ts");
const F_PERIODS  = join(ROOT, "src", "lib", "accountsPeriods.ts");
const F_TAB      = join(C, "PaymentsTab.tsx");
const F_PANEL    = join(C, "PaymentsAccountsPanel.tsx");
const F_CONTRIB  = join(C, "PartnerContributionPanel.tsx");
const F_BOOKS    = join(C, "MonthlyBooksSummary.tsx");
const F_BRIDGE   = join(C, "FinancialBridgeFlow.tsx");
const F_WORKSPC  = join(C, "partner-platform", "PartnerPlatformWorkspace.tsx");
const F_DRAWER   = join(C, "MetricCalculationDrawer.tsx");
const F_BRIDGE_RECON = join(C, "AccountsReconciliationBridge.tsx");
const F_RECONVW  = join(C, "AccountsReconciliationView.tsx");
const F_CHANNEL  = join(C, "ChannelContributionPanel.tsx");
const F_MIG      = join(ROOT, "supabase", "migrations", "20260911120000_partner_multi_brand_manual_pdf_intake.sql");
const PKG_JSON   = join(ROOT, "package.json");

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";
const jiti = createJiti(import.meta.url);

// CRLF is normalised at this SINGLE read point, so every regex below behaves
// identically on Windows and on CI.
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const near = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;

// Strip `//` and `/* */` comments so an assertion tests CODE, never prose that
// merely mentions the thing. String literals are deliberately KEPT: visible
// labels and the canonical RPC name live inside string literals.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

// ── Canonical fixture ────────────────────────────────────────────────────────
// Mirrors the real TEST ledger shape: two recognised partner charges, each with
// a $30 provider earning, no credits, no invoice lines.
const row = (o) => ({
  event_id: o.event_id, partner_id: o.partner_id ?? "p1", partner_name: o.partner_name ?? "Partner One",
  partner_slug: "p-one", order_id: o.order_id ?? o.event_id, confirmation_id: o.confirmation_id ?? "PT-X",
  partner_order_id: null, service: "esa", intake_method: "partner_portal_manual",
  is_test: o.is_test ?? false,
  recognized_at: o.recognized_at ?? "2026-09-13T21:21:23.287Z",
  recognized_date_ny: o.recognized_date_ny ?? "2026-09-13",
  charge_cents: o.charge_cents, credit_cents: o.credit_cents ?? 0,
  provider_payout_cents: o.provider_payout_cents ?? 0,
  net_contribution_cents: o.net_contribution_cents ??
    (o.charge_cents + (o.credit_cents ?? 0) - (o.provider_payout_cents ?? 0)),
  billable_status: "billable", invoice_status: o.invoice_status ?? null,
  invoice_number: o.invoice_number ?? null, invoice_payment_status: o.invoice_payment_status ?? null,
});

const LEDGER = [
  row({ event_id: "e1", partner_id: "pA", partner_name: "Alpha", confirmation_id: "PT-C3CE3A9D29", charge_cents: 5200, provider_payout_cents: 3000 }),
  row({ event_id: "e2", partner_id: "pB", partner_name: "Beta",  confirmation_id: "PT-2205F616D2", charge_cents: 6000, provider_payout_cents: 3000, recognized_date_ny: "2026-09-14" }),
];

// The direct (Stripe) side, held constant across every partner scenario.
const DIRECT = {
  grossChargedUsd: 16764, refundsUsd: 843, stripeFeesUsd: 585.56,
  providerPaymentsUsd: 3885, companyExpensesUsd: 8592, paidOrders: 150, refundCount: 9,
};
const DIRECT_AFTER_STRIPE = 11450.44; // Gross − Refunds − Provider − Fees

function runLogic(pc, flowMod) {
  const f = [];
  const {
    computePartnerTotals, dedupePartnerRows, visiblePartnerRows, groupPartnerTotals,
    partnerContributionUsd, partnerBreakdownUsd, centsToUsd,
  } = pc;
  const { buildCompanyFlow, computeOperatingNet } = flowMod;

  // ── Baseline: the four separate figures ───────────────────────────────────
  const t = computePartnerTotals(LEDGER);
  if (t.grossContributionCents !== 11200) f.push(`gross partner revenue must be 11200c (got ${t.grossContributionCents})`);
  if (t.providerCompensationCents !== 6000) f.push(`partner provider compensation must be 6000c (got ${t.providerCompensationCents})`);
  if (t.creditsCents !== 0) f.push(`credits must be 0c (got ${t.creditsCents})`);
  if (t.netContributionCents !== 5200) f.push(`net retained contribution must be 5200c (got ${t.netContributionCents})`);
  if (t.eventCount !== 2) f.push(`event count must be 2 (got ${t.eventCount})`);
  if (!t.componentsReconcile) f.push(`gross + credits − provider must reconcile to the canonical net`);
  if (!near(partnerContributionUsd(t), 52)) f.push(`net partner contribution must be $52.00 (got ${partnerContributionUsd(t)})`);

  // REGRESSION 5 — provider compensation not subtracted at all.
  if (t.netContributionCents >= t.grossContributionCents)
    f.push(`R5: partner provider compensation was not subtracted — net >= gross`);
  if (t.netContributionCents !== t.grossContributionCents + t.creditsCents - t.providerCompensationCents)
    f.push(`R5: net must equal gross + credits − provider compensation`);

  // REGRESSION 4 — provider compensation subtracted twice.
  if (t.netContributionCents === t.grossContributionCents - 2 * t.providerCompensationCents && t.providerCompensationCents !== 0)
    f.push(`R4: partner provider compensation appears to be subtracted twice`);

  // ── REGRESSION 7 — a duplicate join counts one billable event twice ───────
  // partner_invoice_lines.billable_event_id is NOT unique, so the canonical RPC
  // can legitimately return the same event more than once.
  const dupLedger = [...LEDGER, { ...LEDGER[0], invoice_number: "INV-2" }];
  const dupT = computePartnerTotals(dupLedger);
  if (dupT.eventCount !== 2) f.push(`R7: a duplicated billable event must be counted once (got ${dupT.eventCount} events)`);
  if (dupT.netContributionCents !== 5200) f.push(`R7: a duplicated billable event inflated the net to ${dupT.netContributionCents}c`);
  if (dupT.grossContributionCents !== 11200) f.push(`R7: a duplicated billable event inflated gross revenue to ${dupT.grossContributionCents}c`);
  if (dedupePartnerRows(dupLedger).length !== 2) f.push(`R7: dedupePartnerRows must collapse rows sharing an event_id`);
  if (groupPartnerTotals(dupLedger).reduce((s, g) => s + g.netCents, 0) !== 5200)
    f.push(`R7: the per-partner breakdown double-counted a duplicated event`);

  // ── REGRESSION 8 — an unrecognised partner order must not be counted ──────
  // Recognition is an EVENT: a pending / in-review / cancelled-before-completion
  // partner order has no charge row at all, so an empty ledger must be $0 and
  // must never be inferred from order existence.
  const none = computePartnerTotals([]);
  if (none.netContributionCents !== 0 || none.grossContributionCents !== 0 || none.eventCount !== 0)
    f.push(`R8: a range with no recognised charges must contribute exactly $0`);
  if (!none.componentsReconcile) f.push(`R8: an empty range must still reconcile`);
  // Test rows are excluded by default so a synthetic order cannot inflate books.
  const withTest = [...LEDGER, row({ event_id: "e3", charge_cents: 9900, is_test: true })];
  if (computePartnerTotals(withTest).netContributionCents !== 5200)
    f.push(`R8: a test row inflated the default (non-test) contribution`);
  if (computePartnerTotals(withTest, true).netContributionCents !== 5200 + 9900)
    f.push(`R8: opting IN to test rows must include them`);
  if (visiblePartnerRows(withTest).length !== 2) f.push(`R8: test rows must be excluded by default`);

  // ── Credits / reversals are append-only and reduce contribution ───────────
  // Cancelled AFTER completion keeps its earned contribution; a correction is a
  // NEGATIVE credit event, never a deleted charge.
  const credited = [
    LEDGER[0],
    { ...LEDGER[1], credit_cents: -6000, net_contribution_cents: 6000 - 6000 - 3000 },
  ];
  const cT = computePartnerTotals(credited);
  if (cT.grossContributionCents !== 11200)
    f.push(`a credit must NOT erase the historical charge (gross fell to ${cT.grossContributionCents}c)`);
  if (cT.creditsCents !== -6000) f.push(`credits must stay negative as stored (got ${cT.creditsCents})`);
  if (cT.netContributionCents !== 2200 - 3000 + 3000 - 3000 + 3000 - 800 + 800) { /* value asserted below */ }
  if (cT.netContributionCents !== (5200 - 3000) + (6000 - 6000 - 3000))
    f.push(`a credit must reduce the net contribution exactly once (got ${cT.netContributionCents}c)`);
  if (!cT.componentsReconcile) f.push(`a credited period must still reconcile`);
  // A period whose credits exceed its charges is a real negative and is carried.
  const negT = computePartnerTotals([{ ...LEDGER[0], credit_cents: -9000, net_contribution_cents: 5200 - 9000 - 3000 }]);
  if (negT.netContributionCents >= 0) f.push(`a net-negative partner period must stay negative, never clamped`);

  // ── The four figures are exposed SEPARATELY for the drilldown ─────────────
  const bd = partnerBreakdownUsd(t);
  if (bd.length !== 4) f.push(`the drilldown must show four separate figures (got ${bd.length})`);
  const labels = bd.map((x) => x.label.toLowerCase()).join("|");
  for (const want of ["revenue", "provider", "credit", "net"]) {
    if (!labels.includes(want)) f.push(`the drilldown is missing the "${want}" figure`);
  }
  if (!near(bd[0].amountUsd, 112)) f.push(`drilldown gross revenue must be $112.00 (got ${bd[0].amountUsd})`);
  if (!near(bd[1].amountUsd, -60)) f.push(`drilldown provider compensation must render as a cost (got ${bd[1].amountUsd})`);
  if (!near(bd[3].amountUsd, 52)) f.push(`drilldown net must be $52.00 (got ${bd[3].amountUsd})`);

  // ── REGRESSION 6 — a current rate change must not restate history ─────────
  // Every amount is the FROZEN ledger value. Re-reducing the same rows can only
  // ever produce the same answer; a re-priced row is a DIFFERENT row, and the
  // historical one is unaffected by it.
  const repriced = LEDGER.map((r) => ({ ...r })); // same frozen charge_cents
  if (computePartnerTotals(repriced).netContributionCents !== t.netContributionCents)
    f.push(`R6: re-reducing frozen rows changed the historical figure`);
  if (centsToUsd(LEDGER[0].charge_cents) !== 52)
    f.push(`R6: the frozen charge must be read as stored, not recomputed`);

  // ── REGRESSION 14 — direct totals unchanged when no partner events exist ──
  const directOnly = buildCompanyFlow({ ...DIRECT, partnerContributionUsd: 0, partnerEventCount: 0 });
  if (!near(directOnly.directContributionAfterStripeUsd, DIRECT_AFTER_STRIPE))
    f.push(`R14: the direct waterfall moved when no partner events exist (got ${directOnly.directContributionAfterStripeUsd})`);
  if (!near(directOnly.operatingNetUsd, DIRECT_AFTER_STRIPE - DIRECT.companyExpensesUsd))
    f.push(`R14: Operating Net moved when no partner events exist (got ${directOnly.operatingNetUsd})`);
  if (!near(directOnly.partnerContributionUsd, 0))
    f.push(`R14: a zero-partner range must report exactly $0 partner contribution`);

  // ── REGRESSION 1 — Partner Contribution must reach Operating Net ──────────
  const withP = buildCompanyFlow({ ...DIRECT, partnerContributionUsd: 52, partnerEventCount: 2 });
  if (!near(withP.operatingNetUsd, DIRECT_AFTER_STRIPE + 52 - DIRECT.companyExpensesUsd))
    f.push(`R1: Operating Net must include Partner Contribution (got ${withP.operatingNetUsd})`);
  if (near(withP.operatingNetUsd, directOnly.operatingNetUsd))
    f.push(`R1: Partner Contribution had no effect on Operating Net`);
  const steps = Object.fromEntries(withP.steps.map((x) => [x.key, x]));
  if (!steps.partner_contribution) f.push(`R1: the bridge has no "partner_contribution" step`);
  if (steps.partner_contribution.label !== "Partner Contribution")
    f.push(`R1: the step must be labelled "Partner Contribution" (got "${steps.partner_contribution.label}")`);
  // The same formula, reached through the Monthly Books entry point.
  const booksNet = computeOperatingNet({
    businessNet: DIRECT_AFTER_STRIPE, partnerContribution: 52,
    expenses: DIRECT.companyExpensesUsd, salary: 0, adSpend: 0,
  });
  if (!near(booksNet, withP.operatingNetUsd))
    f.push(`R1: Monthly Books' Operating Net disagrees with the Overview bridge (${booksNet} vs ${withP.operatingNetUsd})`);
  if (near(computeOperatingNet({ businessNet: DIRECT_AFTER_STRIPE, partnerContribution: 52, expenses: 0, salary: 0, adSpend: 0 }), DIRECT_AFTER_STRIPE))
    f.push(`R1: computeOperatingNet ignored its partnerContribution term`);

  // ── REGRESSION 2 — partner revenue must never enter Stripe Gross Charged ──
  if (!near(steps.gross_charged.runningUsd, DIRECT.grossChargedUsd))
    f.push(`R2: partner revenue leaked into Gross Charged (got ${steps.gross_charged.runningUsd})`);
  if (!near(steps.net_revenue.runningUsd, DIRECT.grossChargedUsd - DIRECT.refundsUsd))
    f.push(`R2: partner revenue leaked into Net Revenue (got ${steps.net_revenue.runningUsd})`);
  if (!near(steps.contribution_before_stripe.runningUsd, directOnly.contributionBeforeStripeUsd))
    f.push(`R2: partner revenue leaked into Contribution Before Stripe`);
  // A very large partner figure must still leave every Stripe term untouched.
  const huge = buildCompanyFlow({ ...DIRECT, partnerContributionUsd: 999999, partnerEventCount: 3 });
  for (const k of ["gross_charged", "refunds", "net_revenue", "provider_payments", "contribution_before_stripe", "stripe_fees", "contribution_after_stripe"]) {
    const a = huge.steps.find((x) => x.key === k), b = directOnly.steps.find((x) => x.key === k);
    if (!near(a.runningUsd, b.runningUsd) || !near(a.amountUsd, b.amountUsd))
      f.push(`R2/R3: a huge partner figure moved the direct step "${k}"`);
  }

  // ── REGRESSION 3 — Stripe fees must never be applied to partner revenue ───
  if (!near(steps.stripe_fees.amountUsd, -DIRECT.stripeFeesUsd))
    f.push(`R3: the Stripe fee changed when partner revenue was present (got ${steps.stripe_fees.amountUsd})`);
  const moreFeesIfCharged = buildCompanyFlow({ ...DIRECT, partnerContributionUsd: 100000 });
  if (!near(moreFeesIfCharged.steps.find((x) => x.key === "stripe_fees").amountUsd, -DIRECT.stripeFeesUsd))
    f.push(`R3: Stripe fees scaled with partner revenue`);
  // Ordering makes fee application structurally impossible.
  const order = withP.steps.map((x) => x.key);
  if (order.indexOf("partner_contribution") < order.indexOf("stripe_fees"))
    f.push(`R3: Partner Contribution must come AFTER the Stripe fee step`);
  if (order.indexOf("partner_contribution") > order.indexOf("company_expenses"))
    f.push(`R3: Partner Contribution must come BEFORE Company Expenses`);

  // The step is ADDITIVE, never a red "LESS" cost row.
  if (steps.partner_contribution.kind !== "addition")
    f.push(`Partner Contribution must be an "addition" step (got "${steps.partner_contribution.kind}")`);
  if (steps.partner_contribution.amountUsd < 0)
    f.push(`a positive partner period must present a positive amount`);

  // ── REGRESSION 10 — Overview and tab must agree ──────────────────────────
  // Both surfaces reduce the SAME rows through the SAME function, so equality is
  // structural. Assert the identity the UI relies on.
  const overview = partnerContributionUsd(computePartnerTotals(LEDGER, false));
  const tab = centsToUsd(
    visiblePartnerRows(LEDGER, false).reduce((sum, r) => sum + r.net_contribution_cents, 0),
  );
  if (!near(overview, tab)) f.push(`R10: Overview ($${overview}) and tab ($${tab}) disagree`);
  const grouped = groupPartnerTotals(LEDGER).reduce((sum, g) => sum + g.netCents, 0);
  if (grouped !== computePartnerTotals(LEDGER).netContributionCents)
    f.push(`R10: the per-partner breakdown does not sum to the section total`);
  // ...and the same identity must hold with the test toggle ON.
  const ovT = partnerContributionUsd(computePartnerTotals(withTest, true));
  const tabT = centsToUsd(visiblePartnerRows(withTest, true).reduce((s, r) => s + r.net_contribution_cents, 0));
  if (!near(ovT, tabT)) f.push(`R10: Overview and tab disagree with test rows included`);

  // ── An ADDITION is a movement, like a delta ───────────────────────────────
  // The drawer headlines a MOVEMENT's own amount and a SUBTOTAL's running
  // total. If `addition` ever stops counting as a movement, Partner
  // Contribution headlines the post-partner subtotal ($172.92) instead of the
  // $52.00 the step is worth — the exact defect browser QA caught.
  const { isFlowMovement } = flowMod;
  if (typeof isFlowMovement !== "function") {
    f.push(`accountsFinancialFlow must export isFlowMovement`);
  } else {
    if (isFlowMovement("delta") !== true) f.push(`isFlowMovement("delta") must be true`);
    if (isFlowMovement("addition") !== true) f.push(`isFlowMovement("addition") must be true — an addition moves the running total`);
    if (isFlowMovement("subtotal") !== false) f.push(`isFlowMovement("subtotal") must be false`);
    // The headline the drawer would render for each step.
    for (const st of withP.steps) {
      const headline = isFlowMovement(st.kind) ? st.amountUsd : st.runningUsd;
      if (st.key === "partner_contribution" && !near(headline, 52))
        f.push(`the Partner Contribution drilldown headline must be its own $52.00, got ${headline}`);
      if (st.key === "partner_contribution" && near(headline, withP.steps.find((x) => x.key === "partner_contribution").runningUsd))
        f.push(`the Partner Contribution headline is showing the running total, not the step amount`);
      if (st.key === "stripe_fees" && !near(headline, -DIRECT.stripeFeesUsd))
        f.push(`a deduction must still headline its own amount, got ${headline}`);
      if (st.key === "operating_net" && !near(headline, withP.operatingNetUsd))
        f.push(`a subtotal must still headline the running total, got ${headline}`);
    }
  }

  // ── Numeric safety: cents in, cents out; no NaN, no FX ────────────────────
  const junk = computePartnerTotals([
    { ...LEDGER[0], charge_cents: NaN, credit_cents: undefined, provider_payout_cents: null, net_contribution_cents: Infinity },
  ]);
  for (const [k, v] of Object.entries(junk)) {
    if (typeof v === "number" && !isFinite(v)) f.push(`a non-finite value survived into totals.${k}`);
  }
  if (centsToUsd(NaN) !== 0) f.push(`centsToUsd must neutralise NaN`);
  if (centsToUsd(5250) !== 52.5) f.push(`centsToUsd must divide by exactly 100`);
  // Rounding happens once, at the boundary: three 1-cent rows must total 3c,
  // never 0.01 * 3 accumulated in floats.
  const pennies = computePartnerTotals([1, 2, 3].map((i) => row({ event_id: `p${i}`, charge_cents: 1 })));
  if (pennies.grossContributionCents !== 3) f.push(`cent totals must be summed as integers (got ${pennies.grossContributionCents})`);

  return f;
}

// ── Static invariants ────────────────────────────────────────────────────────
function runStatic() {
  const f = [];
  const partnerLib = read(F_PARTNER);
  const flowLib    = read(F_FLOW);
  const bookslib   = read(F_BOOKSLIB);
  const periods    = read(F_PERIODS);
  const tab        = read(F_TAB);
  const panel      = read(F_PANEL);
  const contrib    = read(F_CONTRIB);
  const books      = read(F_BOOKS);
  const bridge     = read(F_BRIDGE);
  const workspace  = read(F_WORKSPC);
  const drawer     = read(F_DRAWER);
  const reconBrg   = read(F_BRIDGE_RECON);
  const reconView  = read(F_RECONVW);
  const channel    = read(F_CHANNEL);
  const mig        = read(F_MIG);
  const pkg        = read(PKG_JSON);

  // Code-only views: comments stripped so an assertion tests the USE of a thing,
  // not a comment that merely mentions it.
  const tabCode   = stripComments(tab);
  const panelCode = stripComments(panel);
  const contribCode = stripComments(contrib);
  const flowCode  = stripComments(flowLib);
  // The reducer's own contract notes legitimately NAME the things the forbid
  // rules below are about (rate cards, order status, PII field names). A guard
  // must assert the USE, not the mention, so forbid rules read the stripped
  // view while "must document" rules read the raw file.
  const partnerLibCode = stripComments(partnerLib);

  const need = (src, name, re, msg) => { if (!re.test(src)) f.push(`${name}: ${msg}`); };
  const forbid = (src, name, re, msg) => { if (re.test(src)) f.push(`${name}: ${msg}`); };

  // ── ONE canonical source, reused ─────────────────────────────────────────
  need(tabCode, "PaymentsTab", /get_partner_contribution_summary/,
    "the Accounts shell must read the canonical partner RPC");
  forbid(contribCode, "PartnerContributionPanel", /supabase\.rpc\(/,
    "the section must not fetch again — it reduces the shell's rows, which is what makes it tie to the Overview");
  need(tabCode, "PaymentsTab", /dedupePartnerRows\(/,
    "R7: partner rows must be de-duplicated at the single point of entry");
  need(bookslib, "accountsBooks.ts", /dedupePartnerRows\(/,
    "R7: the Monthly Books partner fetch must de-duplicate too");
  need(tabCode, "PaymentsTab", /computePartnerTotals\(/,
    "the shell must reduce partner rows through the ONE canonical reducer");
  need(contribCode, "PartnerContributionPanel", /visiblePartnerRows\(|groupPartnerTotals\(/,
    "the section must reduce through the shared module, never its own arithmetic");
  forbid(panelCode, "PaymentsAccountsPanel", /supabase\.rpc\(\s*["']get_partner_contribution_summary/,
    "the Overview panel must be GIVEN the partner figure, not fetch a second copy");

  // ── R10: one range drives every Accounts section ─────────────────────────
  need(tabCode, "PaymentsTab", /p_from: accountsFrom, p_to: accountsTo/,
    "R10: the partner fetch must use the SAME accountsFrom/accountsTo as every other section");
  need(tabCode, "PaymentsTab", /rows=\{partnerRows\}/, "R10: the section must receive the shell's rows");
  need(tabCode, "PaymentsTab", /totals=\{partnerTotals\}/, "R10: the section must receive the shell's totals");
  need(tabCode, "PaymentsTab", /partnerTotals=\{partnerTotals\}/, "R10: the Overview must receive the same totals object");

  // ── R11: no hidden partner filter on the global Overview ─────────────────
  forbid(tabCode, "PaymentsTab", /get\((["'])partner\1\)/,
    "R11: the Accounts view must never read the ?partner= query parameter");
  forbid(tabCode, "PaymentsTab", /p_partner|partner_id:|partnerId/,
    "R11: the Accounts partner query must never be narrowed to one partner");
  forbid(contribCode, "PartnerContributionPanel", /useSearchParams|location\.search|URLSearchParams/,
    "R11: the Partner Contribution section must not read URL state");
  forbid(panelCode, "PaymentsAccountsPanel", /URLSearchParams|location\.search/,
    "R11: the Overview must not read URL state");
  // The parameter legitimately exists — for the Partner Platform WORKSPACE only.
  need(workspace, "PartnerPlatformWorkspace", /URLSearchParams\(location\.search\)\.get\("partner"\)/,
    "the ?partner= scope must stay owned by the Partner Platform workspace");
  need(mig, "partner intake migration", /get_partner_contribution_summary\(p_from date, p_to date\)/,
    "R11: the canonical RPC must take ONLY a date range — no partner argument to filter by");

  // ── R9: America/New_York boundaries, never UTC ───────────────────────────
  need(mig, "partner intake migration", /at time zone 'America\/New_York'\)::date between p_from and p_to/,
    "R9: recognition must be bucketed on the America/New_York calendar date");
  forbid(mig, "partner intake migration", /occurred_at::date between p_from and p_to/,
    "R9: a bare ::date cast is the UTC day — the NY conversion must not be dropped");
  need(periods, "accountsPeriods.ts", /businessMonth|businessIsoDate/,
    "R9: Accounts presets must resolve in the business timezone");
  forbid(tabCode, "PaymentsTab", /toISOString\(\)\.slice\(0, 10\)/,
    "R9: the UTC day must never define an Accounts boundary");
  need(tabCode, "PaymentsTab", /businessIsoDate\(new Date\(\)\)/,
    "R9: the Accounts range must default to the New York business date");
  need(books, "MonthlyBooksSummary", /fetchPartnerContributionRows\(m\.from, m\.to\)/,
    "R9: each month must query the partner ledger for its OWN NY month range");

  // ── R1 / R3: the bridge adds it once, after Stripe fees ──────────────────
  need(flowCode, "accountsFinancialFlow.ts", /key: "partner_contribution"/, "R1: the bridge must carry a partner step");
  need(flowCode, "accountsFinancialFlow.ts", /const afterPartner = round2\(afterStripe \+ partner\);/,
    "R1/R3: partner money must be ADDED to the post-Stripe subtotal");
  need(flowCode, "accountsFinancialFlow.ts", /const operatingNet = round2\(afterPartner - expenses\);/,
    "R1: Operating Net must be computed from the post-partner subtotal");
  forbid(flowCode, "accountsFinancialFlow.ts", /round2\(gross - refunds \+ partner\)|round2\(gross \+ partner/,
    "R2: partner money must never be folded into a Stripe term");
  forbid(flowCode, "accountsFinancialFlow.ts", /partner \* |fees \* partner|partnerFee|stripeFeeOnPartner/,
    "R3: no Stripe fee may ever be derived from partner revenue");
  need(panelCode, "PaymentsAccountsPanel", /directContributionAfterStripe \+ partnerContribution - totalExpenses/,
    "R1: the panel's Operating Net must add Partner Contribution");
  need(flowCode, "accountsFinancialFlow.ts", /partnerContribution: number;/,
    "R1: computeOperatingNet must REQUIRE the partner term so a caller cannot forget it");
  need(flowCode, "accountsFinancialFlow.ts", /numOr0\(i\.partnerContribution\)/,
    "R1: computeOperatingNet must actually use its partner term");
  need(books, "MonthlyBooksSummary", /partnerContribution,\s*\n\s*operatingNet: computeOperatingNet\(\{ businessNet: a\.businessNet, partnerContribution,/,
    "R1: each Monthly Books row must include Partner Contribution in Operating Net");

  // ── R4 / R5: partner provider compensation is subtracted exactly once ────
  need(partnerLib, "partnerContribution.ts", /providerCompensationCents/,
    "R5: partner provider compensation must be an explicit, visible figure");
  need(mig, "partner intake migration", /from public\.doctor_earnings de\s*\n?\s*where de\.order_id = o\.id/,
    "R5: the partner payout must come from the canonical earnings ledger");
  // The direct term is derived from Stripe charges keyed by payment_intent —
  // which every partner order lacks — so it structurally cannot include one.
  // Anchored on the providerPayouts REDUCER specifically. The same one-line
  // lookup also appears in handleExport, so matching the line alone would let a
  // regression in the deduction path slip past.
  need(panelCode, "PaymentsAccountsPanel",
    /let deducted = 0, pending = 0;[\s\S]{0,120}const res = c\.payment_intent \? resolutionMap\[c\.payment_intent\] : undefined;/,
    "R4: Direct Provider Payments must stay keyed on the Stripe payment intent (which partner orders never have)");
  forbid(panelCode, "PaymentsAccountsPanel", /providerPayouts \+ partner|partnerTotals\.providerCompensationCents.*providerPayouts/,
    "R4: partner provider compensation must never be added to the direct provider term");
  need(flowCode, "accountsFinancialFlow.ts", /label: "Direct Provider Payments"/,
    "R4: the direct provider step must say \"Direct\" so the two costs are never conflated");
  need(flowCode, "accountsFinancialFlow.ts", /label: "Direct Contribution After Stripe"/,
    "R4: the post-Stripe subtotal must say \"Direct\"");

  // ── R6: frozen amounts, never a current-rate recomputation ───────────────
  need(mig, "partner intake migration", /v_fin\.wholesale_fee_cents/,
    "R6: the billable event must be minted from the order's FROZEN fee snapshot");
  need(mig, "partner intake migration", /rate_card_id, rate_card_version/,
    "R6: the rate-card version in force must be stamped on the event");
  need(mig, "partner intake migration", /e\.amount_cents as charge_cents/,
    "R6: the reported charge must be the stored event amount");
  forbid(partnerLibCode, "partnerContribution.ts", /rate_card|wholesale_fee|current_rate/,
    "R6: the reducer must never look at a rate card — it only sums frozen ledger values");
  forbid(contribCode, "PartnerContributionPanel", /wholesale_fee|rate_card/,
    "R6: the section must never re-price a historical charge");

  // ── R8: recognition is an event, not an order status ─────────────────────
  need(mig, "partner intake migration", /if new\.doctor_status is distinct from 'patient_notified' then return new; end if;/,
    "R8: a charge may only be minted when the clinical work completes");
  need(mig, "partner intake migration", /e\.event_kind = 'charge'/,
    "R8: only charge events may be reported as contribution");
  forbid(partnerLibCode, "partnerContribution.ts", /orders\.status|order_status/,
    "R8: contribution must not be gated on an operational order status");
  // Cancelled AFTER completion keeps its history; corrections are append-only.
  need(partnerLib, "partnerContribution.ts", /event_kind = 'credit'/,
    "a pre-completion correction must use the append-only credit mechanism");
  need(partnerLib, "partnerContribution.ts", /creditsCents/,
    "credits/reversals must be a separate, visible figure");
  forbid(partnerLibCode, "partnerContribution.ts", /\.delete\(|DELETE FROM|\.update\(/,
    "the reducer must never mutate financial history");
  forbid(contribCode, "PartnerContributionPanel", /\.delete\(|\.update\(|\.insert\(/,
    "the Partner Contribution section is read-only — it must never write");
  need(contrib, "PartnerContributionPanel", /cancelled <em>before<\/em> completion has no charge/,
    "R8: the recognition rule must be stated where the figures are read");

  // ── R12: the export carries the partner stream ───────────────────────────
  need(panelCode, "PaymentsAccountsPanel", /label: "Direct Contribution After Stripe", amount: directContributionAfterStripe/,
    "R12: the export must carry Direct Contribution After Stripe");
  need(panelCode, "PaymentsAccountsPanel", /label: PARTNER_CONTRIBUTION_LABEL, amount: partnerContribution/,
    "R12: the export must carry Partner Contribution");
  need(panelCode, "PaymentsAccountsPanel", /label: "Partner Revenue \(recognised\)"/,
    "R12: the export must carry recognised partner revenue separately");
  need(panelCode, "PaymentsAccountsPanel", /label: "Partner Provider Compensation"/,
    "R12: the export must carry partner provider compensation separately");
  need(panelCode, "PaymentsAccountsPanel", /label: "Partner Credits \/ Reversals"/,
    "R12: the export must carry partner credits/reversals separately");
  need(panelCode, "PaymentsAccountsPanel", /label: "Company Expenses", amount: -totalExpenses/,
    "R12: the export must carry Company Expenses");
  need(panelCode, "PaymentsAccountsPanel", /label: "Operating Net", amount: operatingNet/,
    "R12: the export must carry Operating Net");
  need(contribCode, "PartnerContributionPanel", /"TOTAL"/,
    "R12: the section CSV must carry its own reconciling total row");

  // ── R13: admin-only, unchanged ───────────────────────────────────────────
  need(mig, "partner intake migration", /where public\.is_chat_admin\(\)/,
    "R13: the canonical RPC must stay is_chat_admin()-gated");
  need(mig, "partner intake migration", /SET search_path/i, "R13: the RPC must keep a pinned search_path");
  forbid(tabCode, "PaymentsTab", /from\("partner_billable_events"\)|from\('partner_billable_events'\)/,
    "R13: the browser must never read the partner ledger table directly — only the gated RPC");
  forbid(contribCode, "PartnerContributionPanel", /from\("partner_billable_events"\)|from\("doctor_earnings"\)/,
    "R13: the section must never bypass the gated RPC");

  // ── Additive visual treatment, not a red cost row ────────────────────────
  need(bridge, "FinancialBridgeFlow", /s\.kind === "addition" \? "\+"/,
    "an addition must render with a \"+\" glyph");
  need(bridge, "FinancialBridgeFlow", /isAddition \? "Plus"/,
    "an addition must be labelled \"Plus\", never the red \"Less\" cost treatment");
  need(bridge, "FinancialBridgeFlow", /isAddition \? "text-emerald-600"/,
    "an addition must not use the cost colour");
  need(books, "MonthlyBooksSummary", /\+\{fmt\(r\.partnerContribution\)\}/,
    "the Monthly Books partner column must render as an addition");

  // ── Explainability without PII ───────────────────────────────────────────
  need(panelCode, "PaymentsAccountsPanel", /drawerStep\?\.key === "partner_contribution" \? partnerBreakdown/,
    "the Partner Contribution step must open a drilldown");
  need(flowCode, "accountsFinancialFlow.ts", /dateBasis: "Partner charge recognised \(clinical work completed\), America\/New_York date"/,
    "the drilldown must state the recognition timestamp and timezone");
  for (const [src, name] of [[partnerLibCode, "partnerContribution.ts"], [contribCode, "PartnerContributionPanel"]]) {
    forbid(src, name, /customer_email|customer_name|patient_|assessment_answers|clinical_notes|date_of_birth/,
      "no customer PII or clinical data may cross this boundary");
  }

  // ── The drilldown headlines the step's OWN amount for a movement ─────────
  need(drawer, "MetricCalculationDrawer", /isFlowMovement\(step\.kind\) \? step\.amountUsd : step\.runningUsd/,
    "the drawer headline must show a movement's own amount and only a subtotal's running total");
  forbid(stripComments(drawer), "MetricCalculationDrawer",
    /step\.kind === "delta" \? step\.amountUsd : step\.runningUsd/,
    "testing only for \"delta\" makes an ADDITION headline the running total (Partner Contribution showed $172.92 instead of $52.00)");
  need(drawer, "MetricCalculationDrawer", /isFlowMovement/,
    "the drawer must import the shared movement test rather than re-deriving it");

  // ── "Direct" is claimed ONLY where the figure really is Stripe-direct ─────
  // The waterfall step resolves provider cost from Stripe charges keyed by
  // payment_intent, so it is genuinely direct-only. Channel Contribution and
  // the Stripe<->Orders bridge compute over orders.paid_at WITHOUT filtering
  // order_origin, so their figure INCLUDES partner payouts and must not be
  // called "Direct".
  need(flowCode, "accountsFinancialFlow.ts", /label: "Direct Provider Payments"/,
    "the Stripe-keyed waterfall step keeps the \"Direct\" name");
  for (const [src, name] of [[channel, "ChannelContributionPanel"], [reconBrg, "AccountsReconciliationBridge"], [reconView, "AccountsReconciliationView"]]) {
    forbid(stripComments(src), name, /Direct Provider Payments/,
      "this figure is computed over orders.paid_at with no order_origin filter, so it includes partner payouts and must NOT be labelled \"Direct\"");
    need(src, name, /Provider Payments \(All Orders\)/,
      "the mixed direct+partner provider figure must say \"Provider Payments (All Orders)\"");
  }
  need(channel, "ChannelContributionPanel", /incl\. partner orders/,
    "the channel provider card must disclose that partner orders are included");

  // ── Wired into the build chain ───────────────────────────────────────────
  need(pkg, "package.json", /check-partner-contribution-accounts\.mjs --self-test/,
    "this guard's self-test must run in the build");
  need(pkg, "package.json", /check-partner-contribution-accounts\.mjs &&/,
    "this guard must run in the build");
  need(pkg, "package.json", /check-accounts-financial-flow\.mjs/,
    "the existing Accounts flow guard must stay in the build");
  need(pkg, "package.json", /check-partner-manual-intake\.mjs/,
    "the existing partner intake guard must stay in the build");

  return f;
}

// ── Self-test: prove the battery has power ───────────────────────────────────
// Each planted defect must genuinely WEAKEN the implementation, and each must be
// detected. These sabotage the imported modules in memory (no file is touched),
// so nothing can be left behind on disk.
function selfTest(pc, flowMod) {
  const missed = [];
  const expectFail = (name, patchedPc, patchedFlow) => {
    let found;
    try { found = runLogic(patchedPc ?? pc, patchedFlow ?? flowMod); }
    catch { return; } // a throw is also a detection
    if (found.length === 0) missed.push(name);
  };

  // R1 — Partner Contribution dropped from Operating Net.
  expectFail("R1 Partner Contribution omitted from Operating Net", null, {
    ...flowMod,
    buildCompanyFlow: (i) => flowMod.buildCompanyFlow({ ...i, partnerContributionUsd: 0 }),
  });
  expectFail("R1 computeOperatingNet ignores its partner term", null, {
    ...flowMod,
    computeOperatingNet: (i) => flowMod.computeOperatingNet({ ...i, partnerContribution: 0 }),
  });

  // R2 — partner revenue added to Stripe Gross Charged.
  expectFail("R2 partner revenue added to Gross Charged", null, {
    ...flowMod,
    buildCompanyFlow: (i) => flowMod.buildCompanyFlow({
      ...i, grossChargedUsd: i.grossChargedUsd + (i.partnerContributionUsd ?? 0),
    }),
  });

  // R3 — a Stripe fee levied on partner revenue.
  expectFail("R3 Stripe fee applied to partner revenue", null, {
    ...flowMod,
    buildCompanyFlow: (i) => flowMod.buildCompanyFlow({
      ...i, stripeFeesUsd: i.stripeFeesUsd + 0.029 * (i.partnerContributionUsd ?? 0),
    }),
  });

  // R4 — partner provider compensation subtracted twice.
  expectFail("R4 partner provider compensation subtracted twice", {
    ...pc,
    computePartnerTotals: (rows, inc) => {
      const t = pc.computePartnerTotals(rows, inc);
      return { ...t, netContributionCents: t.netContributionCents - t.providerCompensationCents };
    },
  });

  // R5 — partner provider compensation never subtracted.
  expectFail("R5 partner provider compensation not subtracted", {
    ...pc,
    computePartnerTotals: (rows, inc) => {
      const t = pc.computePartnerTotals(rows, inc);
      return { ...t, netContributionCents: t.grossContributionCents + t.creditsCents };
    },
  });

  // R6 — historical amounts recomputed from a (changed) current rate.
  expectFail("R6 historical contribution recomputed at a new current rate", {
    ...pc,
    computePartnerTotals: (rows, inc) => {
      const bumped = (rows ?? []).map((r) => ({
        ...r, charge_cents: Math.round(r.charge_cents * 1.5),
        net_contribution_cents: Math.round(r.charge_cents * 1.5) + r.credit_cents - r.provider_payout_cents,
      }));
      return pc.computePartnerTotals(bumped, inc);
    },
  });

  // R7 — the duplicate-join collapse removed.
  expectFail("R7 duplicate billable event counted twice", {
    ...pc,
    dedupePartnerRows: (rows) => [...(rows ?? [])],
    visiblePartnerRows: (rows, inc = false) => (rows ?? []).filter((r) => inc || !r.is_test),
    computePartnerTotals: (rows, inc = false) => {
      const visible = (rows ?? []).filter((r) => inc || !r.is_test);
      const sum = (k) => visible.reduce((s, r) => s + (Number(r[k]) || 0), 0);
      return {
        grossContributionCents: sum("charge_cents"),
        providerCompensationCents: sum("provider_payout_cents"),
        creditsCents: sum("credit_cents"),
        netContributionCents: sum("net_contribution_cents"),
        eventCount: visible.length, invoicedCents: 0, collectedCents: 0, componentsReconcile: true,
      };
    },
  });

  // R8 — an unrecognised partner order counted as earned contribution.
  expectFail("R8 test / unrecognised rows counted as earned", {
    ...pc,
    computePartnerTotals: (rows, _inc) => pc.computePartnerTotals(rows, true),
  });

  // R10 — the Overview total diverges from the per-row (tab) total.
  expectFail("R10 Overview disagrees with the Partner Contribution tab", {
    ...pc,
    computePartnerTotals: (rows, inc) => {
      const t = pc.computePartnerTotals(rows, inc);
      return { ...t, netContributionCents: t.netContributionCents + 1 };
    },
  });

  // R14 — direct totals move although no partner event exists.
  expectFail("R14 direct totals change with a zero partner range", null, {
    ...flowMod,
    buildCompanyFlow: (i) => flowMod.buildCompanyFlow({ ...i, providerPaymentsUsd: i.providerPaymentsUsd + 1 }),
  });

  // The four separate figures collapsed into one.
  expectFail("the four separate partner figures collapsed", {
    ...pc,
    partnerBreakdownUsd: (t) => [{ label: "Net", amountUsd: pc.centsToUsd(t.netContributionCents) }],
  });

  // A negative partner period silently clamped to zero.
  expectFail("a net-negative partner period clamped to zero", {
    ...pc,
    computePartnerTotals: (rows, inc) => {
      const t = pc.computePartnerTotals(rows, inc);
      return { ...t, netContributionCents: Math.max(0, t.netContributionCents) };
    },
  });

  // Credits erasing the historical charge instead of offsetting it.
  expectFail("a credit erases the historical charge", {
    ...pc,
    computePartnerTotals: (rows, inc) => {
      const t = pc.computePartnerTotals(rows, inc);
      return { ...t, grossContributionCents: t.grossContributionCents + t.creditsCents, creditsCents: 0 };
    },
  });

  return missed;
}


// -- File-level negative controls --------------------------------------------
// The in-memory battery above proves the LOGIC assertions have power. These
// prove the STATIC ones do, by planting a real regression in a real file,
// re-running runStatic(), and restoring the exact original bytes.
//
// Every plant captures the original buffer BEFORE writing and rewrites it in
// `finally`, and nothing here calls process.exit(), so a restore can never be
// skipped by an early termination.
const STATIC_PLANTS = [
  { name: "R9 NY month boundary replaced with the UTC day", file: F_MIG,
    find: "(e.occurred_at at time zone 'America/New_York')::date between p_from and p_to",
    replace: "e.occurred_at::date between p_from and p_to" },
  { name: "R11 the Overview reads a hidden ?partner= filter", file: F_TAB,
    find: "{ p_from: accountsFrom, p_to: accountsTo },",
    replace: '{ p_from: accountsFrom, p_to: accountsTo, p_partner: new URLSearchParams(location.search).get("partner") },' },
  { name: "R12 the export drops the Partner Contribution line", file: F_PANEL,
    find: "{ label: PARTNER_CONTRIBUTION_LABEL, amount: partnerContribution,",
    replace: '{ label: "unused", amount: 0,' },
  { name: "R13 the browser reads the partner ledger table directly", file: F_CONTRIB,
    find: 'import { useMemo } from "react";',
    replace: 'import { useMemo } from "react";\nvoid (() => supabase.from("partner_billable_events").select("*"));' },
  { name: "R7 the Monthly Books partner fetch stops de-duplicating", file: F_BOOKSLIB,
    find: "return dedupePartnerRows((data as PartnerContributionRow[]) ?? []);",
    replace: "return ((data as PartnerContributionRow[]) ?? []);" },
  { name: "R10 the partner fetch stops using the shared Accounts range", file: F_TAB,
    find: "p_from: accountsFrom, p_to: accountsTo",
    replace: 'p_from: "2020-01-01", p_to: "2099-12-31"' },
  { name: "R4 the direct provider term stops being keyed on the payment intent", file: F_PANEL,
    find: "const res = c.payment_intent ? resolutionMap[c.payment_intent] : undefined;\n      const pc = resolutionToClassification(res, c.amount_refunded > 0);\n      deducted += pc.deducted;",
    replace: 'const res = resolutionMap[c.payment_intent ?? ""];\n      const pc = resolutionToClassification(res, c.amount_refunded > 0);\n      deducted += pc.deducted;' },
  { name: "R1 the panel stops adding Partner Contribution to Operating Net", file: F_PANEL,
    find: "const operatingNet = directContributionAfterStripe + partnerContribution - totalExpenses;",
    replace: "const operatingNet = directContributionAfterStripe - totalExpenses;" },
  { name: "an additive step is given the red cost treatment", file: F_BRIDGE,
    find: '{isSubtotal ? "Total" : isAddition ? "Plus" : "Less"}',
    replace: '{isSubtotal ? "Total" : "Less"}' },
  { name: "the drawer headlines the running total for an addition step", file: F_DRAWER,
    find: "{fmtUsd(isFlowMovement(step.kind) ? step.amountUsd : step.runningUsd)}",
    replace: '{fmtUsd(step.kind === "delta" ? step.amountUsd : step.runningUsd)}' },
  { name: "the mixed channel provider figure is relabelled \"Direct\"", file: F_CHANNEL,
    find: '{ label: "Provider Payments (All Orders)", value: fmtUsd(result.total.providerPayments)',
    replace: '{ label: "Direct Provider Payments", value: fmtUsd(result.total.providerPayments)' },
  { name: "the mixed reconciliation provider figure is relabelled \"Direct\"", file: F_BRIDGE_RECON,
    find: 'label="Provider Payments (All Orders)"',
    replace: 'label="Direct Provider Payments"' },
  { name: "this guard is unwired from the build", file: PKG_JSON,
    find: "node scripts/check-partner-contribution-accounts.mjs --self-test && node scripts/check-partner-contribution-accounts.mjs &&",
    replace: "" },
];

function staticNegativeControls() {
  const missed = [];
  for (const plant of STATIC_PLANTS) {
    const original = readFileSync(plant.file);            // exact original bytes
    const text = original.toString("utf8");
    const fileCrlf = text.includes("\r\n");
    // Match against the file's REAL line endings so a plant is never silently
    // skipped on Windows.
    const needle = fileCrlf ? plant.find.replace(/\n/g, "\r\n") : plant.find;
    const body = fileCrlf ? plant.replace.replace(/\n/g, "\r\n") : plant.replace;
    const hits = text.split(needle).length - 1;
    if (hits !== 1) { missed.push(`${plant.name} -- anchor matched ${hits}x (must be exactly 1)`); continue; }
    try {
      writeFileSync(plant.file, text.replace(needle, body));
      if (runStatic().length === 0) missed.push(plant.name);
    } finally {
      writeFileSync(plant.file, original);                // byte-for-byte restore
    }
  }
  return missed;
}

async function main() {
  const selfTestMode = process.argv.includes("--self-test");
  const pc = await jiti.import(F_PARTNER);
  const flowMod = await jiti.import(F_FLOW);

  if (selfTestMode) {
    // The battery must be clean against the REAL modules first — otherwise a
    // "detection" below could just be a pre-existing failure.
    const clean = runLogic(pc, flowMod);
    if (clean.length > 0) {
      console.error(`${RED}✗ SELF-TEST ABORTED: the real modules already fail ${clean.length} check(s)${RESET}`);
      for (const x of clean) console.error(`  ${YELLOW}- ${x}${RESET}`);
      process.exitCode = 1;
      return;
    }
    // The static layer must also be clean before anything is planted,
    // otherwise a "detection" below could just be a pre-existing failure.
    const cleanStatic = runStatic();
    if (cleanStatic.length > 0) {
      console.error(`${RED}SELF-TEST ABORTED: the static layer already fails ${cleanStatic.length} check(s)${RESET}`);
      for (const x of cleanStatic) console.error(`  ${YELLOW}- ${x}${RESET}`);
      process.exitCode = 1;
      return;
    }
    const missed = [...selfTest(pc, flowMod), ...staticNegativeControls()];
    if (missed.length > 0) {
      console.error(`${RED}✗ SELF-TEST FAILED: ${missed.length} planted defect(s) went undetected${RESET}`);
      for (const m of missed) console.error(`  ${YELLOW}- ${m}${RESET}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${GREEN}✓ self-test: every planted defect was detected (logic battery + file-level static controls)${RESET}`);
  }

  const failures = [...runLogic(pc, flowMod), ...runStatic()];
  if (failures.length > 0) {
    console.error(`${RED}✗ check-partner-contribution-accounts: ${failures.length} failure(s)${RESET}`);
    for (const x of failures) console.error(`  ${YELLOW}- ${x}${RESET}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${GREEN}✓ check-partner-contribution-accounts: Operating Net = Direct Contribution After Stripe + Partner Contribution − Company Expenses${RESET}`);
}

main().catch((e) => {
  console.error(`${RED}✗ check-partner-contribution-accounts crashed: ${e?.stack ?? e}${RESET}`);
  process.exitCode = 1;
});
