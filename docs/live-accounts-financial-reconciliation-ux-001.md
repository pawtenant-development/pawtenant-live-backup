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

---

# Correction addendum — 2026-07-25 (owner UX correction)

Owner review of the Phase B LIVE experience was NOT approved: too plain, too
vertically stretched, empty reconciliation cells, Company Expenses buried,
two near-duplicate marketing sections, and a reconciliation query error
(`canceling statement due to statement timeout`). This addendum fixes all of
it surgically on LIVE HEAD. TEST deliberately untouched.

## 1. Reconciliation timeout — root cause + fix (DB)

- **Symptom:** `get_accounts_reconciliation` → `canceling statement due to
  statement timeout` on LIVE (Orders database — Error in the UI).
- **Root cause (proven via EXPLAIN ANALYZE on LIVE):** the `prov` CTE was
  referenced inside a per-order CASE, so Postgres inlined it as a subplan
  re-executed once per paid order AND per aggregate (`jsonb_agg` + sums) —
  each execution re-scanning `doctor_earnings` whose owner attribution itself
  used correlated subqueries against the `paid` CTE. July 2026: **8,007 ms**,
  right at the 8 s authenticated `statement_timeout`. NOT an index problem
  (orders: 1,603 rows).
- **Fix:** migration `20260725190000_optimize_get_accounts_reconciliation.sql`
  (applied to LIVE) — narrow `paid` projection (no `o.*`), MATERIALIZED CTEs,
  hash LEFT JOIN owner attribution (order_id first, else confirmation_id —
  unique, no fan-out), `prov` joined once. Same payload, gate, money model.
- **Equivalence proof:** per-row md5 hashes identical for June + July 2026
  baseline vs rewrite. **7.5 ms for the ALL-TIME range** (456 paid orders);
  end-to-end RPC verified <1 ms with impersonated admin JWT claims.
- **No index added** — deliberately: a `paid_at` index saves <2 ms at this
  scale; the defect was query shape. Guard now proves shape stays bounded.

## 2. Additional-documentation payments — audited (owner hypothesis CONFIRMED)

Aggregate, PII-safe LIVE evidence (2026-07-25): July 2026 had **5 paid
additional-documentation payments totalling $230.00**, each with its own
Stripe PaymentIntent, **none** present in `orders.payment_intent_id`
(all-time: 8 payments / $350.00, zero refunds). They are in the Stripe cash
basis and correctly outside the order/channel universe. Now surfaced as:
- bridge line renamed **"Additional-documentation payments without a primary
  order row"** (count + gross + per-item drilldown);
- an explicit **"Unallocated additional-documentation revenue"** banner in the
  bridge and in Reconciliation Level 1 (count, gross, inclusion/exclusion,
  reconciliation effect). Never forced into a channel, never inside Unknown.

## 3. UX restructure (§4–§8)

- **Page order:** Header (+quick actions) → Financial Overview → Company
  Expenses & Estimated P&L (restored near the top; desktop two-column with
  Operating Net on the right) → Channel Contribution → Marketing ROI & Sync
  Health → Monthly Books → Payroll Archive → Reconciliation.
- **Header quick actions:** Sync Ads (SAME shared sync flow as the marketing
  section — one implementation in PaymentsTab, concurrency-guarded, shows
  progress/result/last-sync, refreshes expenses + ROI + channel spend on
  success), Add Expense (opens the ledger form), Export, PKR→USD.
- **Marketing consolidated:** `MarketingSpendPanel.tsx` DELETED; the single
  "Marketing ROI & Sync Health" section carries the §6 summary metrics +
  per-platform rows (collapsible), one RPC (`get_marketing_roi_health`),
  spend still deducted exactly once via Company Expenses.
- **Collapsible sections** (`AccountsCollapsibleSection.tsx`): Overview +
  Expenses open; Channel/Marketing keep summaries visible with detail
  toggles; Books/Payroll/Reconciliation closed when healthy. Reconciliation
  AUTO-EXPANDS on needs_review / data_source_error (never auto-closes).
  aria-expanded/aria-controls, native buttons, grid-rows animation; children
  stay mounted so lifted evidence keeps flowing while collapsed.
- **Reconciliation layered (§8):** Level 1 six status chips (Balanced is
  RESERVED for exact ties like Order Basis = Channel Total; cash-vs-order
  reads "Reconciled · explained differences"); Level 2 the Stripe↔Orders
  bridge; Level 3 comparison tables behind a toggle — a side with no data
  renders a one-line Unavailable note, never a grid of dashes. Global header
  badge for the balanced status now reads **"Reconciled"**, not "Balanced".

## 4. Preserved (verified by guards + build)

Accounts default subtab · current-month race fix · `fetchSeq` stale-response
guard · bridge formulas · Channel Contribution · Stripe cash basis · order
basis · provider-payment logic · company expenses · ROI math · manual sync
only (no cron) · no estimated per-order Stripe fees · no PII · CSV export.

## 5. Guards (strengthened)

- `check-accounts-reconciliation.mjs`: + optimized-migration boundedness
  checks (LEFT JOIN + MATERIALIZED required; correlated `(select … from paid`
  and `o.*` forbidden; security/PII posture re-asserted) + new bridge
  placement rule (Level 2 inside Reconciliation via bridgeSlot).
- `check-accounts-financial-flow.mjs`: + single-marketing-section rule,
  shared-sync rules (no duplicate sync fetch, concurrency guard), header
  quick-action presence, collapsible a11y, reconciliation auto-expand.
- `check-accounts-date-range-alignment.mjs`: MarketingSpendPanel check
  replaced with a must-NOT-return rule.
All three pass with `--self-test`; full `npm run build` chain green.

## Rollback

UI: revert this commit. DB: re-apply the function body from
`20260725120000_add_get_accounts_reconciliation.sql` (restores the slow but
correct definition) — payloads are identical.

## Owner validation owed

Authenticated LIVE review: header quick actions, section order, collapsed
defaults, Reconciliation chips + add-on banner, and that "Orders database"
loads with no timeout for current month AND a full-year custom range.
