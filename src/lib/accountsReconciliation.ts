/**
 * accountsReconciliation — LIVE-ACCOUNTS-FINANCIAL-RECONCILIATION-UX-001
 *
 * Pure, side-effect-free bridge between the two Accounts money bases:
 *   • STRIPE CASH BASIS — the company summary cards: succeeded charges and
 *     refunds by Stripe event date (stripe-payment-history edge fn).
 *   • ORDER BASIS — the Channel Contribution section: orders.price /
 *     refund_amount / provider payments for orders with paid_at in the window
 *     (get_channel_contribution_orders money model).
 *
 * Both are correct on their own basis; they legitimately disagree whenever a
 * window contains add-on documentation charges (own payment intent, no order
 * row), refunds of orders paid in an earlier window, charged-amount vs
 * recorded-price differences, boundary charges, or provider-payout resolver
 * differences. This module names and quantifies every one of those mechanisms
 * as explicit bridge lines and reports any UNEXPLAINED residual — it never
 * hides a gap and never fabricates data to force a tie-out.
 *
 * Design contract (do not weaken without updating
 * scripts/check-accounts-reconciliation.mjs):
 *   1. PURE SUMS ONLY. Inputs are the live Stripe charge/refund list the
 *      Accounts view already fetched + the get_accounts_reconciliation RPC
 *      payload. This module only joins and sums; it never derives money rules.
 *   2. EVERY CHARGE LANDS IN EXACTLY ONE BUCKET (matched order / add-on /
 *      duplicate-intent / unlinked) — an exclusive partition, so bridge lines
 *      can never double-count a charge.
 *   3. RESIDUALS ARE FIRST-CLASS. Each bridge ends in a computed vs actual
 *      order-basis figure; a non-zero residual is surfaced, never suppressed.
 *   4. NO STRIPE FEES ARE APPORTIONED. Fees stay a company-level cash figure;
 *      this bridge reconciles gross / refunds / provider only.
 *   5. NO PII. Inputs carry payment-intent + confirmation ids only.
 */

// ── Inputs ───────────────────────────────────────────────────────────────────

/** One Stripe charge from the Accounts dataset (only succeeded ones count). */
export interface ReconCharge {
  payment_intent: string | null;
  amount: number;
  status: string;
  /** Provider payout the Stripe-basis cards deduct for this charge
   *  (resolutionToClassification(...).deducted) — computed by the caller. */
  providerDeductedUsd?: number;
}

/** Per-order projection from get_accounts_reconciliation → orders[]. */
export interface ReconOrderRow {
  payment_intent_id: string | null;
  confirmation_id: string | null;
  gross_usd: number;
  refund_usd: number;
  provider_usd: number;
}

/** Add-on documentation payment from get_accounts_reconciliation → addon_payments[]. */
export interface ReconAddonRow {
  payment_intent_id: string | null;
  confirmation_id: string | null;
  amount_usd: number;
  refund_in_window_usd: number;
}

export interface ReconRefundTiming {
  prior_order_refunds_usd: number;
  addon_refunds_usd: number;
  window_order_refunds_outside_usd: number;
}

export interface ReconRpcPayload {
  date_from: string;
  date_to: string;
  currency: string;
  order_basis: {
    paid_orders: number;
    gross_usd: number;
    refund_usd: number;
    net_usd: number;
    provider_usd: number;
  };
  orders: ReconOrderRow[];
  addon_payments: ReconAddonRow[];
  refund_timing: ReconRefundTiming;
}

export interface BuildReconciliationInput {
  charges: ReconCharge[];
  /** Stripe refunds total for the window (summary.total_refunded). */
  stripeRefundsUsd: number;
  rpc: ReconRpcPayload;
}

// ── Output model ─────────────────────────────────────────────────────────────

export interface BridgeItem {
  /** Confirmation id (or payment-intent tail when no order exists). */
  id: string;
  amountUsd: number;
}

export interface BridgeLine {
  key: string;
  label: string;
  /** Signed adjustment applied to the running Stripe-basis figure. */
  amountUsd: number;
  /** Charge/order count the line covers (null when not a count concept). */
  count: number | null;
  items: BridgeItem[];
}

export interface BridgeSection {
  /** Starting figure (Stripe basis). */
  startUsd: number;
  startCount: number | null;
  lines: BridgeLine[];
  /** start + Σ lines — what the bridge PREDICTS the order basis to be. */
  computedUsd: number;
  computedCount: number | null;
  /** Actual order-basis figure from the RPC. */
  orderBasisUsd: number;
  orderBasisCount: number | null;
  /** actual − computed. Zero (±1¢) when fully explained. */
  residualUsd: number;
  residualCount: number | null;
}

export interface AccountsReconciliation {
  gross: BridgeSection;
  refunds: BridgeSection;
  provider: BridgeSection;
  /** Net-revenue headline: Stripe (gross − refunds) vs order basis. */
  net: {
    stripeUsd: number;
    orderBasisUsd: number;
    deltaUsd: number;
  };
  /** True when every residual is within a cent (all deltas explained). */
  fullyExplained: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const numOr0 = (v: number | null | undefined): number =>
  typeof v === "number" && isFinite(v) ? v : 0;

function finishSection(
  startUsd: number,
  startCount: number | null,
  lines: BridgeLine[],
  orderBasisUsd: number,
  orderBasisCount: number | null,
  countDelta: number | null,
): BridgeSection {
  const computedUsd = round2(startUsd + lines.reduce((s, l) => s + l.amountUsd, 0));
  const computedCount =
    startCount == null || countDelta == null ? null : startCount + countDelta;
  return {
    startUsd: round2(startUsd),
    startCount,
    lines,
    computedUsd,
    computedCount,
    orderBasisUsd: round2(orderBasisUsd),
    orderBasisCount,
    residualUsd: round2(orderBasisUsd - computedUsd),
    residualCount:
      computedCount == null || orderBasisCount == null ? null : orderBasisCount - computedCount,
  };
}

// ── Bridge builder ───────────────────────────────────────────────────────────

/**
 * Join the live Stripe charge list against the order-basis RPC payload and
 * produce the three itemized bridges (gross, refunds, provider) plus the
 * net-revenue headline. Exclusive charge partition:
 *   matched (first charge per order payment intent) → add-on → duplicate
 *   intent → unlinked.
 */
export function buildAccountsReconciliation(input: BuildReconciliationInput): AccountsReconciliation {
  const { rpc } = input;
  const succeeded = input.charges.filter((c) => c.status === "succeeded");

  const orderByPi = new Map<string, ReconOrderRow>();
  for (const o of rpc.orders ?? []) {
    if (o.payment_intent_id) orderByPi.set(o.payment_intent_id, o);
  }
  const addonByPi = new Map<string, ReconAddonRow>();
  for (const a of rpc.addon_payments ?? []) {
    if (a.payment_intent_id) addonByPi.set(a.payment_intent_id, a);
  }

  // ── Exclusive charge partition ────────────────────────────────────────────
  const seenOrderPis = new Set<string>();
  const matched: { charge: ReconCharge; order: ReconOrderRow }[] = [];
  const addonCharges: { charge: ReconCharge; addon: ReconAddonRow }[] = [];
  const duplicateCharges: ReconCharge[] = [];
  const unlinkedCharges: ReconCharge[] = [];

  for (const c of succeeded) {
    const pi = c.payment_intent ?? "";
    const order = pi ? orderByPi.get(pi) : undefined;
    if (order) {
      if (seenOrderPis.has(pi)) {
        duplicateCharges.push(c); // extra succeeded charge on an already-counted intent
      } else {
        seenOrderPis.add(pi);
        matched.push({ charge: c, order });
      }
      continue;
    }
    const addon = pi ? addonByPi.get(pi) : undefined;
    if (addon) {
      addonCharges.push({ charge: c, addon });
      continue;
    }
    unlinkedCharges.push(c);
  }

  // Orders paid in the window whose payment intent has no succeeded charge in
  // the Stripe window (boundary: charge settled just outside the range).
  const missingOrders = (rpc.orders ?? []).filter(
    (o) => !o.payment_intent_id || !seenOrderPis.has(o.payment_intent_id),
  );

  // ── Gross bridge ──────────────────────────────────────────────────────────
  const stripeGross = round2(succeeded.reduce((s, c) => s + numOr0(c.amount), 0));

  const addonUsd = round2(addonCharges.reduce((s, x) => s + numOr0(x.charge.amount), 0));
  const duplicateUsd = round2(duplicateCharges.reduce((s, c) => s + numOr0(c.amount), 0));
  const unlinkedUsd = round2(unlinkedCharges.reduce((s, c) => s + numOr0(c.amount), 0));

  // Charged amount vs recorded order price on matched orders (signed:
  // positive = Stripe charged more than orders.price records).
  const priceDiffItems: BridgeItem[] = [];
  let priceDiff = 0;
  for (const { charge, order } of matched) {
    const d = round2(numOr0(charge.amount) - numOr0(order.gross_usd));
    if (Math.abs(d) > 0.005) {
      priceDiff += d;
      priceDiffItems.push({ id: order.confirmation_id ?? "(no id)", amountUsd: d });
    }
  }
  priceDiff = round2(priceDiff);

  const missingUsd = round2(missingOrders.reduce((s, o) => s + numOr0(o.gross_usd), 0));

  const grossLines: BridgeLine[] = [
    {
      key: "addons",
      label: "Additional-documentation payments without a primary order row",
      amountUsd: -addonUsd,
      count: addonCharges.length,
      items: addonCharges.map((x) => ({
        id: x.addon.confirmation_id ?? "(no id)",
        amountUsd: numOr0(x.charge.amount),
      })),
    },
    {
      key: "unlinked",
      label: "Payments not linked to an order paid in this range",
      amountUsd: -unlinkedUsd,
      count: unlinkedCharges.length,
      items: unlinkedCharges.map((c) => ({
        id: c.payment_intent ? `…${c.payment_intent.slice(-8)}` : "(no intent)",
        amountUsd: numOr0(c.amount),
      })),
    },
    {
      key: "duplicates",
      label: "Extra charges on an already-counted payment intent",
      amountUsd: -duplicateUsd,
      count: duplicateCharges.length,
      items: duplicateCharges.map((c) => ({
        id: c.payment_intent ? `…${c.payment_intent.slice(-8)}` : "(no intent)",
        amountUsd: numOr0(c.amount),
      })),
    },
    {
      key: "price_diff",
      label: "Charged amount vs recorded order price",
      amountUsd: -priceDiff,
      count: priceDiffItems.length,
      items: priceDiffItems,
    },
    {
      key: "missing_charge",
      label: "Orders paid in range without a Stripe charge in range",
      amountUsd: missingUsd,
      count: missingOrders.length,
      items: missingOrders.map((o) => ({
        id: o.confirmation_id ?? "(no id)",
        amountUsd: numOr0(o.gross_usd),
      })),
    },
  ];

  const gross = finishSection(
    stripeGross,
    succeeded.length,
    grossLines,
    numOr0(rpc.order_basis?.gross_usd),
    numOr0(rpc.order_basis?.paid_orders),
    -addonCharges.length - unlinkedCharges.length - duplicateCharges.length + missingOrders.length,
  );

  // ── Refunds bridge ────────────────────────────────────────────────────────
  const t = rpc.refund_timing ?? {
    prior_order_refunds_usd: 0,
    addon_refunds_usd: 0,
    window_order_refunds_outside_usd: 0,
  };
  const refundLines: BridgeLine[] = [
    {
      key: "prior_orders",
      label: "Refunds of orders paid before this range",
      amountUsd: -round2(numOr0(t.prior_order_refunds_usd)),
      count: null,
      items: [],
    },
    {
      key: "addon_refunds",
      label: "Refunds of additional-document payments",
      amountUsd: -round2(numOr0(t.addon_refunds_usd)),
      count: null,
      items: [],
    },
    {
      key: "outside_refunds",
      label: "Refunds on in-range orders issued outside this range",
      amountUsd: round2(numOr0(t.window_order_refunds_outside_usd)),
      count: null,
      items: [],
    },
  ];
  const refunds = finishSection(
    round2(numOr0(input.stripeRefundsUsd)),
    null,
    refundLines,
    numOr0(rpc.order_basis?.refund_usd),
    null,
    null,
  );

  // ── Provider bridge ───────────────────────────────────────────────────────
  // Stripe basis deducts per CHARGE via resolve_charge_payouts (first earning
  // on the recovery chain, rate fallback allowed, duplicates possible). Order
  // basis sums ALL single-owner non-cancelled earnings per completed order.
  const stripeDeducted = round2(succeeded.reduce((s, c) => s + numOr0(c.providerDeductedUsd), 0));

  const orderOnlyItems: BridgeItem[] = [];
  const stripeOnlyItems: BridgeItem[] = [];
  let orderOnly = 0;
  let stripeOnly = 0;
  for (const { charge, order } of matched) {
    const d = round2(numOr0(order.provider_usd) - numOr0(charge.providerDeductedUsd));
    if (d > 0.005) {
      orderOnly += d;
      orderOnlyItems.push({ id: order.confirmation_id ?? "(no id)", amountUsd: d });
    } else if (d < -0.005) {
      stripeOnly += -d;
      stripeOnlyItems.push({ id: order.confirmation_id ?? "(no id)", amountUsd: -d });
    }
  }
  // Deductions on charges with no matched in-window order (add-on / duplicate /
  // unlinked charges whose chain still resolved to a payout), plus provider
  // amounts on orders that have no in-window charge.
  for (const c of [...addonCharges.map((x) => x.charge), ...duplicateCharges, ...unlinkedCharges]) {
    const d = round2(numOr0(c.providerDeductedUsd));
    if (d > 0.005) {
      stripeOnly += d;
      stripeOnlyItems.push({
        id: c.payment_intent ? `…${c.payment_intent.slice(-8)}` : "(no intent)",
        amountUsd: d,
      });
    }
  }
  for (const o of missingOrders) {
    const d = round2(numOr0(o.provider_usd));
    if (d > 0.005) {
      orderOnly += d;
      orderOnlyItems.push({ id: o.confirmation_id ?? "(no id)", amountUsd: d });
    }
  }
  orderOnly = round2(orderOnly);
  stripeOnly = round2(stripeOnly);

  const providerLines: BridgeLine[] = [
    {
      key: "order_only",
      label: "Earnings counted on order basis only (e.g. add-on completions)",
      amountUsd: orderOnly,
      count: orderOnlyItems.length,
      items: orderOnlyItems,
    },
    {
      key: "stripe_only",
      label: "Deductions counted on Stripe basis only (rate fallback / chains)",
      amountUsd: -stripeOnly,
      count: stripeOnlyItems.length,
      items: stripeOnlyItems,
    },
  ];
  const provider = finishSection(
    stripeDeducted,
    null,
    providerLines,
    numOr0(rpc.order_basis?.provider_usd),
    null,
    null,
  );

  // ── Net headline + verdict ────────────────────────────────────────────────
  const stripeNet = round2(stripeGross - round2(numOr0(input.stripeRefundsUsd)));
  const orderNet = numOr0(rpc.order_basis?.net_usd);

  const fullyExplained =
    Math.abs(gross.residualUsd) <= 0.01 &&
    (gross.residualCount ?? 0) === 0 &&
    Math.abs(refunds.residualUsd) <= 0.01 &&
    Math.abs(provider.residualUsd) <= 0.01;

  return {
    gross,
    refunds,
    provider,
    net: {
      stripeUsd: stripeNet,
      orderBasisUsd: round2(orderNet),
      deltaUsd: round2(orderNet - stripeNet),
    },
    fullyExplained,
  };
}
