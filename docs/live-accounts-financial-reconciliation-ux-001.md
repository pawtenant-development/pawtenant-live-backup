# LIVE-ACCOUNTS-FINANCIAL-RECONCILIATION-UX-001 — Stripe ↔ Orders Reconciliation

**Status:** LIVE SHIPPED (`ad3b318`, 2026-07-25). TEST untouched — mirror is a separate task.

## What was happening

On LIVE Accounts (July 2026) the company summary cards and the Channel
Contribution section did not reconcile:

| Figure | Company summary (Stripe) | Channel Contribution (orders) |
|---|---|---|
| Paid orders | 150 charges | 144 orders |
| Net revenue | $16,764 − $843 = $15,921 | $15,621 |
| Provider payouts | $3,885 | $3,815 |

**Neither side was wrong.** The cards are STRIPE CASH BASIS (succeeded charges
and refunds by Stripe event date, `stripe-payment-history` edge fn). Channel
Contribution is ORDER BASIS (`orders.price` / `refund_amount` /
`doctor_earnings` for orders with `paid_at` in range). Forensic audit against
the LIVE DB proved every delta comes from nameable mechanisms:

1. **Additional-document payments** — real Stripe charges with their own
   payment intents and NO order row (July: 5 payments, $230, tracked in
   `order_additional_documentation_requests`). The #1 cause of "more charges
   than orders".
2. **Refund timing** — Stripe counts refunds by refund date ($843 in July,
   of which $119 refunded orders paid BEFORE July); order basis counts
   `refund_amount` on July-paid orders ($724 at audit time).
3. **Charged amount ≠ recorded price** — 4 July orders where the Stripe charge
   differs from `orders.price` (+$60 net: e.g. PT-MR1HX27H charged $99,
   recorded $59).
4. **Provider payout basis** — the per-charge resolver
   (`resolve_charge_payouts`) takes the FIRST earning on the recovery chain and
   can use the per-order-rate fallback; the order basis sums ALL single-owner
   non-cancelled earnings. Orders with paid add-ons have a second earning row
   the Stripe side never sees (July: 5 orders, $145), and one July chain had
   two paid charges (double deduction on the Stripe side).
5. **Boundary charges** — a charge can settle just outside the window its
   order's `paid_at` falls in (and vice versa).

## The fix

An itemized, always-computed bridge between the two bases — differences are
explained, not hidden:

- **RPC `get_accounts_reconciliation(p_from, p_to)`**
  (`supabase/migrations/20260725120000_*.sql`, applied to LIVE DB
  `cvwbozlbbmrjxznknouq`). `is_accounts_admin()` gate (fail-closed, verified
  42501 without auth), `security definer`, `stable`, read-only. Returns the
  order-basis totals + per-order `{payment_intent_id, confirmation_id, gross,
  refund, provider}` + add-on payments + refund-timing splits. Money model is
  IDENTICAL to `get_channel_contribution_orders`, so `order_basis` ties to
  Channel Contribution by construction (verified inline vs LIVE data:
  158 / $18,081 / $724 / $4,290 on 2026-07-25).
- **Pure lib `src/lib/accountsReconciliation.ts`** — joins the live Stripe
  charge list (already fetched by PaymentsTab) against the RPC payload.
  Exclusive charge partition (matched order → add-on → duplicate intent →
  unlinked), three bridge waterfalls (gross, refunds, provider), net headline,
  and FIRST-CLASS unexplained residuals. Never apportions Stripe fees.
- **`AccountsReconciliationBridge.tsx`** — mounted between the summary cards
  and Channel Contribution. Tie-out tiles (Paid Orders / Net Revenue /
  Provider Payments: Stripe basis vs order basis + delta), expandable bridge
  detail with per-item confirmation-id chips, green "Fully explained" or amber
  "Unexplained residual" status.
- **Guard `scripts/check-accounts-reconciliation.mjs`** — jiti-imports the
  real module, behavioural battery + static invariants + `--self-test`; wired
  into `npm run build` (chain green).

## Rollback

Revert `ad3b318`; `drop function public.get_accounts_reconciliation(date, date);`
(additive — nothing else depends on it).

## Owner validation

Open LIVE Admin → Payments → Accounts. The new "Stripe ↔ Orders
Reconciliation" card should show the three tie-out tiles as *explained* (green)
once the Stripe dataset loads. An amber residual is a REAL unexplained gap
worth investigating — that is the feature working, not a bug.
