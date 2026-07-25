/**
 * accountsFinancialFlow — LIVE-ACCOUNTS-FINANCIAL-RECONCILIATION-UX-001 (Phase B)
 *
 * The ONE pure model behind the Accounts "financial flow": the ordered
 * company-wide P&L bridge that the Overview renders, the calculation-drawer
 * metadata for every step, and the reconciliation status shown in the Accounts
 * header. No React, no fetch, no formatting — numbers and metadata only.
 *
 * WHY THIS EXISTS
 * The Accounts view previously showed five disconnected KPI cards whose
 * relationship a first-time viewer had to infer, and reused the word
 * "Contribution" for two DIFFERENT formulas (company: after Stripe fees;
 * channel: before Stripe fees and ad spend). This module makes the arithmetic
 * explicit and gives every visible label exactly one formula.
 *
 * DESIGN CONTRACT (do not weaken without updating
 * scripts/check-accounts-financial-flow.mjs):
 *   1. ONE STEP = ONE FORMULA = ONE LABEL. `COMPANY_FLOW_LABELS` is the single
 *      list of visible company step labels and they are pairwise unique. The
 *      channel section uses its own distinct labels (CHANNEL_FLOW_LABELS) so
 *      "Contribution" can never mean two things on one screen.
 *   2. THE BRIDGE IS ARITHMETIC, NOT DECORATION. Each running step's value is
 *      derived from the previous running total and its own delta, so a rendered
 *      bridge cannot display a subtotal that its own +/- rows do not produce.
 *   3. STRIPE FEES ARE COMPANY-LEVEL ONLY. This module never apportions,
 *      estimates, or splits a Stripe fee per order or per channel.
 *   4. RECONCILIATION STATUS IS EVIDENCE-DRIVEN. `resolveReconciliationStatus`
 *      returns "balanced" ONLY when the Stripe↔Orders bridge explains every
 *      residual AND the channel partition ties to the order basis. Missing data
 *      is "updating"/"sync_pending"/"data_source_error" — never "balanced".
 *   5. NO NaN / NO Infinity. Every ratio goes through `safeRatio` and returns
 *      null instead of a non-finite number. Negative values stay negative and
 *      are never clamped to zero.
 *   6. NO PII. Only amounts, counts and status codes cross this boundary.
 */

// ── Numeric helpers ──────────────────────────────────────────────────────────

/** Round to cents, absorbing float drift. Non-finite input collapses to 0. */
export function round2(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Coerce anything to a finite number (null/undefined/NaN/Infinity → 0). */
export function numOr0(v: number | null | undefined): number {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

/** Ratio that returns null (never NaN/Infinity) unless the denominator is > 0. */
export function safeRatio(numer: number, denom: number): number | null {
  if (!isFinite(numer) || !isFinite(denom) || denom <= 0) return null;
  const r = numer / denom;
  return isFinite(r) ? r : null;
}

// ── Step model ───────────────────────────────────────────────────────────────

/**
 * A step is either a running SUBTOTAL (the result of everything above it) or a
 * DELTA applied to the running total. The renderer draws deltas with an explicit
 * +/− and subtotals with an "=" — so subtraction is never communicated by colour
 * alone (accessibility requirement).
 */
export type FlowStepKind = "subtotal" | "delta";

/** Which upstream system owns a step's number — surfaced in the drawer. */
export type FlowSource =
  | "stripe"        // Stripe API (cash basis) via stripe-payment-history
  | "orders"        // orders / doctor_earnings (order basis)
  | "expenses"      // company_expenses + salary RPCs
  | "ad_platforms"  // synced Google / Meta ad spend
  | "derived";      // pure arithmetic over other steps

export const FLOW_SOURCE_LABEL: Record<FlowSource, string> = {
  stripe: "Stripe API",
  orders: "Orders database",
  expenses: "Company expenses & payroll",
  ad_platforms: "Ad platform sync",
  derived: "Calculated from the steps above",
};

export interface FlowStep {
  key: string;
  /** Visible label. Unique across the flow — see COMPANY_FLOW_LABELS. */
  label: string;
  kind: FlowStepKind;
  /**
   * For a delta: the signed amount applied to the running total (a cost is
   * negative). For a subtotal: the running total itself.
   */
  amountUsd: number;
  /** Running total AFTER this step. Equal to amountUsd on subtotal steps. */
  runningUsd: number;
  /** Plain-English formula, e.g. "Gross Charged − Refunds". */
  formula: string;
  /** The same formula with this range's actual numbers substituted. */
  workedExample: string;
  /** One-sentence, non-accountant explanation used by the tooltip. */
  tooltip: string;
  source: FlowSource;
  /** Which date field decides whether a record lands in the range. */
  dateBasis: string;
  /** Transactions included, when the step has a countable universe. */
  includedCount: number | null;
  /** Known limitation to disclose in the drawer (null when there is none). */
  limitation: string | null;
}

// ── Company-wide P&L flow ────────────────────────────────────────────────────

export interface CompanyFlowInput {
  /** Stripe succeeded-charge total for the range (cash basis). */
  grossChargedUsd: number;
  /** Stripe refunds for the range, by refund date. */
  refundsUsd: number;
  /** Actual Stripe fees (may include pending estimates — flagged separately). */
  stripeFeesUsd: number;
  /** Provider payouts deducted (completed provider work only). */
  providerPaymentsUsd: number;
  /** Company operating expenses: manual + salary + synced ad spend. */
  companyExpensesUsd: number;
  /** Paid Stripe charges in the range. */
  paidOrders: number;
  /** Refund transactions in the range. */
  refundCount: number;
  /** True when any Stripe fee in the range is a 2.9%+$0.30 estimate. */
  feesIncludeEstimates?: boolean;
}

export interface CompanyFlow {
  steps: FlowStep[];
  netRevenueUsd: number;
  contributionBeforeStripeUsd: number;
  contributionAfterStripeUsd: number;
  operatingNetUsd: number;
}

/**
 * Canonical visible labels for the company flow, in render order. Exported so
 * the guard can assert uniqueness and that the channel flow never reuses one.
 */
export const COMPANY_FLOW_LABELS = [
  "Gross Charged",
  "Refunds",
  "Net Revenue",
  "Provider Payments",
  "Contribution Before Stripe",
  "Stripe Fees",
  "Contribution After Stripe",
  "Company Expenses",
  "Operating Net",
] as const;

const money = (n: number): string => {
  const v = round2(n);
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "−" : ""}$${s}`;
};

/**
 * Build the ordered company P&L bridge.
 *
 * Gross Charged − Refunds = Net Revenue
 * Net Revenue − Provider Payments = Contribution Before Stripe
 * Contribution Before Stripe − Stripe Fees = Contribution After Stripe
 * Contribution After Stripe − Company Expenses = Operating Net
 *
 * NOTE the ordering choice: provider payments are deducted BEFORE Stripe fees
 * so that "Contribution Before Stripe" is directly comparable to the channel
 * section's "Before Stripe & Ad Spend" (which cannot include fees, because no
 * authoritative order-level Stripe fee exists). The final figure is arithmetically
 * identical to the previous Gross − Fees − Refunds − Provider ordering.
 */
export function buildCompanyFlow(input: CompanyFlowInput): CompanyFlow {
  const gross = round2(numOr0(input.grossChargedUsd));
  const refunds = round2(numOr0(input.refundsUsd));
  const fees = round2(numOr0(input.stripeFeesUsd));
  const provider = round2(numOr0(input.providerPaymentsUsd));
  const expenses = round2(numOr0(input.companyExpensesUsd));

  const netRevenue = round2(gross - refunds);
  const beforeStripe = round2(netRevenue - provider);
  const afterStripe = round2(beforeStripe - fees);
  const operatingNet = round2(afterStripe - expenses);

  const paidOrders = Math.max(0, Math.trunc(numOr0(input.paidOrders)));
  const refundCount = Math.max(0, Math.trunc(numOr0(input.refundCount)));

  const steps: FlowStep[] = [
    {
      key: "gross_charged",
      label: "Gross Charged",
      kind: "subtotal",
      amountUsd: gross,
      runningUsd: gross,
      formula: "Sum of succeeded Stripe charges settled in the range",
      workedExample: `${paidOrders} paid charge${paidOrders === 1 ? "" : "s"} = ${money(gross)}`,
      tooltip: "All money customers actually paid you in this period, before anything is taken out.",
      source: "stripe",
      dateBasis: "Stripe charge settled date (cash basis)",
      includedCount: paidOrders,
      limitation: "Counts money received in this range, not orders completed in it.",
    },
    {
      key: "refunds",
      label: "Refunds",
      kind: "delta",
      amountUsd: -refunds,
      runningUsd: netRevenue,
      formula: "Sum of successful Stripe refunds issued in the range",
      workedExample: `${refundCount} refund${refundCount === 1 ? "" : "s"} = ${money(refunds)}`,
      tooltip: "Money given back to customers. Counted on the day the refund was issued, which may be a later month than the original payment.",
      source: "stripe",
      dateBasis: "Stripe refund date",
      includedCount: refundCount,
      limitation: "A refund of an order paid in an earlier month still lands in this month.",
    },
    {
      key: "net_revenue",
      label: "Net Revenue",
      kind: "subtotal",
      amountUsd: netRevenue,
      runningUsd: netRevenue,
      formula: "Gross Charged − Refunds",
      workedExample: `${money(gross)} − ${money(refunds)} = ${money(netRevenue)}`,
      tooltip: "The money you actually kept from customers after refunds.",
      source: "derived",
      dateBasis: "Stripe charge / refund date",
      includedCount: null,
      limitation: null,
    },
    {
      key: "provider_payments",
      label: "Provider Payments",
      kind: "delta",
      amountUsd: -provider,
      runningUsd: beforeStripe,
      formula: "Provider earnings for orders the provider has completed",
      workedExample: `${money(provider)} deducted`,
      tooltip: "What you owe the providers who did the clinical work. Only deducted once the provider has completed the order.",
      source: "orders",
      dateBasis: "Order completion (provider notified the patient)",
      includedCount: null,
      limitation: "Pending provider work is NOT deducted here — it is advisory until the order completes.",
    },
    {
      key: "contribution_before_stripe",
      label: "Contribution Before Stripe",
      kind: "subtotal",
      amountUsd: beforeStripe,
      runningUsd: beforeStripe,
      formula: "Net Revenue − Provider Payments",
      workedExample: `${money(netRevenue)} − ${money(provider)} = ${money(beforeStripe)}`,
      tooltip: "What the orders earned after paying providers, before payment-processing fees. This is the figure comparable to the channel breakdown.",
      source: "derived",
      dateBasis: "Mixed — see the reconciliation section",
      includedCount: null,
      limitation: null,
    },
    {
      key: "stripe_fees",
      label: "Stripe Fees",
      kind: "delta",
      amountUsd: -fees,
      runningUsd: afterStripe,
      formula: "Actual Stripe processing fees for the range",
      workedExample: `${money(fees)} deducted`,
      tooltip: "What Stripe charged you to process the payments.",
      source: "stripe",
      dateBasis: "Stripe balance-transaction date",
      includedCount: null,
      limitation: input.feesIncludeEstimates
        ? "Some fees are still estimated (2.9% + $0.30) because Stripe has not settled their balance transaction yet."
        : "Company-level total only — there is no authoritative per-order Stripe fee, so fees are never split by order or channel.",
    },
    {
      key: "contribution_after_stripe",
      label: "Contribution After Stripe",
      kind: "subtotal",
      amountUsd: afterStripe,
      runningUsd: afterStripe,
      formula: "Contribution Before Stripe − Stripe Fees",
      workedExample: `${money(beforeStripe)} − ${money(fees)} = ${money(afterStripe)}`,
      tooltip: "What is left to cover the running costs of the business — salaries, marketing and everything else. This is not profit yet.",
      source: "derived",
      dateBasis: "Mixed — see the reconciliation section",
      includedCount: null,
      limitation: null,
    },
    {
      key: "company_expenses",
      label: "Company Expenses",
      kind: "delta",
      amountUsd: -expenses,
      runningUsd: operatingNet,
      formula: "Salary + marketing spend + subscriptions + other expenses",
      workedExample: `${money(expenses)} deducted`,
      tooltip: "Everything it costs to run the company in this period, including salaries and advertising spend.",
      source: "expenses",
      dateBasis: "Expense date / payroll period",
      includedCount: null,
      limitation: "Salary figures are prorated estimates; PKR amounts use the editable conversion rate shown in the header.",
    },
    {
      key: "operating_net",
      label: "Operating Net",
      kind: "subtotal",
      amountUsd: operatingNet,
      runningUsd: operatingNet,
      formula: "Contribution After Stripe − Company Expenses",
      workedExample: `${money(afterStripe)} − ${money(expenses)} = ${money(operatingNet)}`,
      tooltip: "The estimated bottom line for this period. Negative means the period cost more than it earned.",
      source: "derived",
      dateBasis: "Mixed — see the reconciliation section",
      includedCount: null,
      limitation: "Management estimate, not finalized accounting.",
    },
  ];

  return { steps, netRevenueUsd: netRevenue, contributionBeforeStripeUsd: beforeStripe, contributionAfterStripeUsd: afterStripe, operatingNetUsd: operatingNet };
}

/**
 * Channel-section labels. Deliberately DISJOINT from COMPANY_FLOW_LABELS for
 * every metric whose formula differs — most importantly the channel figure is
 * "Before Stripe & Ad Spend", never a bare "Contribution".
 */
export const CHANNEL_FLOW_LABELS = [
  "Before Stripe & Ad Spend",
  "After Ad Spend, Before Stripe",
] as const;

/**
 * Every label rendered in the Accounts area that must map to exactly one
 * formula. The guard asserts this list has no duplicates.
 */
export const ALL_ACCOUNTS_LABELS: readonly string[] = [
  ...COMPANY_FLOW_LABELS,
  ...CHANNEL_FLOW_LABELS,
];

// ── Reconciliation status ────────────────────────────────────────────────────

export type ReconciliationStatus =
  | "balanced"
  | "updating"
  | "needs_review"
  | "sync_pending"
  | "data_source_error";

export const RECONCILIATION_STATUS_META: Record<
  ReconciliationStatus,
  { label: string; tone: "ok" | "warn" | "bad" | "muted"; icon: string }
> = {
  balanced:          { label: "Balanced",          tone: "ok",    icon: "ri-checkbox-circle-line" },
  updating:          { label: "Updating",          tone: "muted", icon: "ri-loader-4-line" },
  needs_review:      { label: "Needs Review",      tone: "warn",  icon: "ri-error-warning-line" },
  sync_pending:      { label: "Sync Pending",      tone: "warn",  icon: "ri-time-line" },
  data_source_error: { label: "Data Source Error", tone: "bad",   icon: "ri-close-circle-line" },
};

export interface ReconciliationEvidence {
  /** Any Accounts dataset still in flight. */
  loading: boolean;
  /** A required source failed to load. */
  hasError: boolean;
  /** The Stripe↔Orders bridge resolved and explained every residual. */
  bridgeFullyExplained: boolean | null;
  /** Channel partition ties to its own order-basis total. */
  channelPartitionBalanced: boolean | null;
  /** |channel order count − order-basis order count|. */
  channelVsOrderBasisOrderDelta: number | null;
  /** |channel net revenue − order-basis net revenue| in USD. */
  channelVsOrderBasisNetDeltaUsd: number | null;
  /** An ad-spend source has not synced for the range. */
  spendSyncStale: boolean;
}

export interface ReconciliationVerdict {
  status: ReconciliationStatus;
  /** Short, human reasons — rendered as-is. Empty when balanced. */
  reasons: string[];
}

/** Cent-level tolerance for money comparisons. */
export const MONEY_TOLERANCE_USD = 0.01;

/**
 * Decide the header badge from real evidence.
 *
 * Precedence: error > still-loading > unexplained residual / partition drift >
 * stale spend sync > balanced. "Balanced" therefore requires POSITIVE evidence
 * that the bridge explained everything — an unresolved bridge can never read
 * balanced.
 */
export function resolveReconciliationStatus(e: ReconciliationEvidence): ReconciliationVerdict {
  const reasons: string[] = [];

  if (e.hasError) {
    return { status: "data_source_error", reasons: ["One or more Accounts data sources failed to load."] };
  }
  if (e.loading || e.bridgeFullyExplained == null) {
    return { status: "updating", reasons: ["Accounts data is still loading for this range."] };
  }

  if (e.bridgeFullyExplained === false) {
    reasons.push("The Stripe ↔ Orders bridge has an unexplained residual.");
  }
  if (e.channelPartitionBalanced === false) {
    reasons.push("Channel totals do not add up to the all-channels total.");
  }
  const orderDelta = e.channelVsOrderBasisOrderDelta;
  if (orderDelta != null && Math.abs(orderDelta) > 0) {
    reasons.push(`${Math.abs(orderDelta)} paid order${Math.abs(orderDelta) === 1 ? " is" : "s are"} missing from the channel view.`);
  }
  const netDelta = e.channelVsOrderBasisNetDeltaUsd;
  if (netDelta != null && Math.abs(netDelta) > MONEY_TOLERANCE_USD) {
    reasons.push(`Channel net revenue differs from the order basis by ${money(Math.abs(netDelta))}.`);
  }

  if (reasons.length > 0) return { status: "needs_review", reasons };

  if (e.spendSyncStale) {
    return { status: "sync_pending", reasons: ["Ad spend has not synced for this range yet."] };
  }

  return { status: "balanced", reasons: [] };
}

// ── Company vs channel comparison rows (Reconciliation section) ──────────────

export interface ReconRowInput {
  metric: string;
  companyValue: number | null;
  channelValue: number | null;
  /** True for counts (compared exactly) rather than money (cent tolerance). */
  isCount?: boolean;
  /**
   * Explanation shown when the two sides legitimately differ because they are
   * on different bases. Null means any difference is a genuine defect.
   */
  basisNote: string | null;
}

export interface ReconRow extends ReconRowInput {
  deltaValue: number | null;
  /** ok = ties exactly; explained = differs but the bridge accounts for it. */
  status: "ok" | "explained" | "mismatch" | "unavailable";
}

/**
 * Build the company-vs-channel comparison table. A difference is only ever
 * reported as "explained" when a basis note exists AND the bridge says every
 * residual is accounted for — otherwise it is a mismatch and stays visible.
 */
export function buildReconRows(rows: ReconRowInput[], bridgeFullyExplained: boolean | null): ReconRow[] {
  return rows.map((r) => {
    if (r.companyValue == null || r.channelValue == null) {
      return { ...r, deltaValue: null, status: "unavailable" as const };
    }
    const delta = r.isCount
      ? Math.trunc(r.channelValue) - Math.trunc(r.companyValue)
      : round2(r.channelValue - r.companyValue);
    const ties = r.isCount ? delta === 0 : Math.abs(delta) <= MONEY_TOLERANCE_USD;
    if (ties) return { ...r, deltaValue: delta, status: "ok" as const };
    const explained = r.basisNote != null && bridgeFullyExplained === true;
    return { ...r, deltaValue: delta, status: explained ? ("explained" as const) : ("mismatch" as const) };
  });
}

// ── Data-source health ───────────────────────────────────────────────────────

export type SourceHealth = "ok" | "pending" | "not_connected" | "error" | "manual";

export const SOURCE_HEALTH_META: Record<SourceHealth, { label: string; tone: "ok" | "warn" | "bad" | "muted" }> = {
  ok:            { label: "Connected",     tone: "ok" },
  pending:       { label: "Sync pending",  tone: "warn" },
  not_connected: { label: "Not connected", tone: "muted" },
  error:         { label: "Error",         tone: "bad" },
  manual:        { label: "Manual entry",  tone: "muted" },
};

export interface DataSourceRow {
  name: string;
  health: SourceHealth;
  detail: string;
}

/** Relative "x minutes ago" for the header. Pure — the caller supplies `now`. */
export function relativeFreshness(refreshedAtMs: number | null, nowMs: number): string {
  if (refreshedAtMs == null || !isFinite(refreshedAtMs)) return "not loaded yet";
  const secs = Math.max(0, Math.floor((nowMs - refreshedAtMs) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs} seconds ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
