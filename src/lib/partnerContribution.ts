/**
 * partnerContribution — PARTNER-CONTRIBUTION-ACCOUNTS-001
 *
 * The ONE pure model for B2B (partner) fulfilment economics in Accounts.
 * Every surface that shows a partner figure — the Financial Overview bridge,
 * the Estimated P&L, the Monthly Books rows, the Partner Contribution tab and
 * the CSV export — reduces the SAME canonical rows through the SAME function
 * here, so those four surfaces cannot disagree.
 *
 * CANONICAL SOURCE (never re-derived in this module)
 * --------------------------------------------------
 * `get_partner_contribution_summary(p_from, p_to)` — an `is_chat_admin()`-gated
 * SECURITY DEFINER RPC that returns one row per RECOGNISED partner charge:
 * a `partner_billable_events` row with `event_kind = 'charge'`, minted by
 * `tg_partner_billable_on_completion` at the instant an `order_origin='partner'`
 * order reaches `doctor_status = 'patient_notified'`.
 *
 * DESIGN CONTRACT (do not weaken without updating
 * scripts/check-partner-contribution-accounts.mjs):
 *
 *  1. RECOGNITION IS AN EVENT, NOT A STATUS. A partner order contributes only
 *     once its charge event exists. A raw partner order that merely EXISTS, is
 *     pending, in review, or awaiting admin approval has no charge event and
 *     therefore contributes exactly $0. This module never looks at
 *     `orders.status` to decide recognition, which is also why:
 *       • CANCELLED AFTER COMPLETION keeps its earned contribution — the
 *         historical charge event, provider earning and any invoice stay
 *         exactly as they were. Earned financial history is never erased
 *         because an operational status later became "cancelled".
 *       • CANCELLED BEFORE COMPLETION contributes nothing — no charge event was
 *         ever minted, so there is nothing to exclude.
 *     A pre-completion cancellation that somehow already carries a charge event
 *     is corrected through the canonical APPEND-ONLY reversal: a second
 *     `partner_billable_events` row with `event_kind = 'credit'` (negative
 *     `amount_cents`, `related_event_id` → the charge). Those credits flow
 *     through `creditsCents` below. Nothing here deletes or rewrites history.
 *
 *  2. AMOUNTS ARE FROZEN, NEVER RECALCULATED. `charge_cents` is the
 *     `partner_order_financials.wholesale_fee_cents` snapshot taken when the
 *     order was created, stamped with its `rate_card_id` / `rate_card_version`.
 *     Changing a partner's CURRENT rate card can never restate a historical
 *     period, because this module only ever SUMS the frozen ledger values.
 *
 *  3. PARTNER MONEY NEVER TOUCHES STRIPE. Partner charges are invoiced offline.
 *     They are never added to Gross Charged, never attract Stripe fees, and are
 *     never counted as direct-customer revenue.
 *
 *  4. PARTNER PROVIDER COMPENSATION IS SUBTRACTED EXACTLY ONCE — here. The
 *     direct waterfall's "Direct Provider Payments" is computed strictly from
 *     Stripe charges keyed by `payment_intent`; every partner order has a NULL
 *     `payment_intent_id` and no recovery-chain parent, so a partner payout can
 *     never reach that term. See the guard's double-subtraction battery.
 *
 *  5. ONE EVENT IS COUNTED ONCE. The RPC LEFT JOINs `partner_invoice_lines`,
 *     whose `billable_event_id` index is NOT unique — an event that appears on
 *     two invoice lines comes back as two identical rows. Every consumer must
 *     go through `dedupePartnerRows` first, or one billable event would be
 *     counted twice. (`partner_billable_one_charge_per_order` already
 *     guarantees at most ONE charge event per order at the database level.)
 *
 *  6. CENTS IN, CENTS OUT. Every amount is an integer number of USD cents, as
 *     stored. Conversion to dollars happens once, at the display boundary, via
 *     `centsToUsd`. PKR and the Accounts FX rate are irrelevant here: partner
 *     charges are USD-denominated, so the displayed exchange rate can never
 *     move a partner figure.
 *
 *  7. NO PII. Only partner names, order confirmation ids, amounts, dates and
 *     status codes cross this boundary — never patient answers, clinical
 *     information or customer contact details.
 */

/** One RECOGNISED partner charge, exactly as `get_partner_contribution_summary` returns it. */
export interface PartnerContributionRow {
  event_id: string;
  partner_id: string;
  partner_name: string;
  partner_slug: string;
  order_id: string;
  confirmation_id: string;
  partner_order_id: string | null;
  service: string;
  intake_method: string;
  is_test: boolean;
  recognized_at: string;
  /** America/New_York calendar date the charge was recognised on. */
  recognized_date_ny: string;
  charge_cents: number;
  /** Credits / reversals against this charge. Stored NEGATIVE (DB CHECK constraint). */
  credit_cents: number;
  provider_payout_cents: number;
  /** charge_cents + credit_cents − provider_payout_cents, computed server-side. */
  net_contribution_cents: number;
  billable_status: string | null;
  invoice_status: string | null;
  invoice_number: string | null;
  invoice_payment_status: string | null;
}

/**
 * The four figures the owner requires to be shown SEPARATELY, plus billing
 * progress. All integer USD cents.
 */
export interface PartnerContributionTotals {
  /** Gross partner contribution — Σ recognised partner charges. Never negative. */
  grossContributionCents: number;
  /** Partner provider compensation (the partner-side clinical cost). Positive magnitude. */
  providerCompensationCents: number;
  /** Refunds / credits / reversals. Zero or NEGATIVE — never flipped to positive. */
  creditsCents: number;
  /** Net retained contribution — Σ of the canonical per-row `net_contribution_cents`. */
  netContributionCents: number;
  /** Recognised charge events included (after de-duplication). */
  eventCount: number;
  /** Charges that have reached a non-draft invoice. */
  invoicedCents: number;
  /** Charges on an invoice Stripe has paid. */
  collectedCents: number;
  /**
   * True when gross + credits − providerCompensation equals the canonical net.
   * A false here means the RPC's own arithmetic drifted from its components —
   * it is surfaced, never silently corrected.
   */
  componentsReconcile: boolean;
}

export const EMPTY_PARTNER_TOTALS: PartnerContributionTotals = {
  grossContributionCents: 0,
  providerCompensationCents: 0,
  creditsCents: 0,
  netContributionCents: 0,
  eventCount: 0,
  invoicedCents: 0,
  collectedCents: 0,
  componentsReconcile: true,
};

/** The ONE visible label for this stream. Reused by every Accounts surface. */
export const PARTNER_CONTRIBUTION_LABEL = "Partner Contribution";

/** Exact USD cents → dollars. Round only at the display boundary. */
export function centsToUsd(cents: number): number {
  const n = typeof cents === "number" && isFinite(cents) ? cents : 0;
  return Math.round(n) / 100;
}

const intOr0 = (v: number | null | undefined): number =>
  typeof v === "number" && isFinite(v) ? Math.round(v) : 0;

/**
 * Collapse rows that describe the SAME billable event.
 *
 * The canonical RPC left-joins `partner_invoice_lines` (non-unique index on
 * `billable_event_id`), so one charge can legitimately arrive more than once —
 * e.g. after a void-and-reissue leaves two lines pointing at it. Without this,
 * every consumer would count that charge, its credits AND its provider payout
 * twice. The FIRST occurrence wins: the RPC orders by `occurred_at desc`, and
 * duplicates carry identical money columns by construction.
 */
export function dedupePartnerRows(rows: readonly PartnerContributionRow[]): PartnerContributionRow[] {
  const seen = new Set<string>();
  const out: PartnerContributionRow[] = [];
  for (const r of rows ?? []) {
    if (!r || !r.event_id || seen.has(r.event_id)) continue;
    seen.add(r.event_id);
    out.push(r);
  }
  return out;
}

/**
 * Rows that count toward earned contribution for a range.
 *
 * `includeTest` mirrors the Partner Contribution tab's own toggle so the
 * Overview, the P&L, the tab and the export always share one universe. Test
 * rows are EXCLUDED by default — a synthetic order must never inflate the
 * company's Operating Net.
 */
export function visiblePartnerRows(
  rows: readonly PartnerContributionRow[],
  includeTest = false,
): PartnerContributionRow[] {
  return dedupePartnerRows(rows).filter((r) => includeTest || !r.is_test);
}

/**
 * Reduce canonical rows to the four separate figures.
 *
 * `netContributionCents` is the SUM OF THE CANONICAL per-row net, not a second
 * calculation of it — the components are reported alongside and asserted to
 * reconcile, so a drift is visible rather than silently papered over.
 */
export function computePartnerTotals(
  rows: readonly PartnerContributionRow[],
  includeTest = false,
): PartnerContributionTotals {
  const visible = visiblePartnerRows(rows, includeTest);

  let gross = 0, provider = 0, credits = 0, net = 0, invoiced = 0, collected = 0;
  for (const r of visible) {
    const charge = intOr0(r.charge_cents);
    const credit = intOr0(r.credit_cents);
    gross += charge;
    credits += credit;
    provider += intOr0(r.provider_payout_cents);
    net += intOr0(r.net_contribution_cents);
    const invoiceable = charge + credit;
    if (r.invoice_payment_status && r.invoice_payment_status !== "draft") invoiced += invoiceable;
    if (r.invoice_payment_status === "paid") collected += invoiceable;
  }

  return {
    grossContributionCents: gross,
    providerCompensationCents: provider,
    creditsCents: credits,
    netContributionCents: net,
    eventCount: visible.length,
    invoicedCents: invoiced,
    collectedCents: collected,
    componentsReconcile: gross + credits - provider === net,
  };
}

/** Net retained partner contribution in USD — the figure the Accounts bridge adds. */
export function partnerContributionUsd(totals: PartnerContributionTotals): number {
  return centsToUsd(totals.netContributionCents);
}

/** One aggregated line per partner, strongest contributor first. */
export interface PartnerContributionByPartner {
  partner_id: string;
  name: string;
  orders: number;
  grossCents: number;
  providerCents: number;
  creditsCents: number;
  netCents: number;
}

export function groupPartnerTotals(
  rows: readonly PartnerContributionRow[],
  includeTest = false,
): PartnerContributionByPartner[] {
  const m = new Map<string, PartnerContributionByPartner>();
  for (const r of visiblePartnerRows(rows, includeTest)) {
    const e = m.get(r.partner_id) ?? {
      partner_id: r.partner_id, name: r.partner_name,
      orders: 0, grossCents: 0, providerCents: 0, creditsCents: 0, netCents: 0,
    };
    e.orders++;
    e.grossCents += intOr0(r.charge_cents);
    e.providerCents += intOr0(r.provider_payout_cents);
    e.creditsCents += intOr0(r.credit_cents);
    e.netCents += intOr0(r.net_contribution_cents);
    m.set(r.partner_id, e);
  }
  return Array.from(m.values()).sort((a, b) => b.netCents - a.netCents);
}

/**
 * The drawer / tooltip breakdown for the Overview's Partner Contribution step.
 * Signs are rendered as they are: costs negative, credits negative.
 */
export function partnerBreakdownUsd(
  totals: PartnerContributionTotals,
): { label: string; amountUsd: number }[] {
  return [
    { label: "Recognised partner revenue", amountUsd: centsToUsd(totals.grossContributionCents) },
    { label: "Partner provider compensation", amountUsd: -centsToUsd(totals.providerCompensationCents) },
    { label: "Credits / reversals", amountUsd: centsToUsd(totals.creditsCents) },
    { label: "Net retained partner contribution", amountUsd: centsToUsd(totals.netContributionCents) },
  ];
}
