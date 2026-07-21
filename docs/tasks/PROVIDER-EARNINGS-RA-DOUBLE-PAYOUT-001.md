# PROVIDER-EARNINGS-RA-DOUBLE-PAYOUT-001 — RA completion provider payout

## Bug
Combo orders (ESA/PSD + Reasonable Accommodation — `includes_reasonable_accommodation_letter=true`
/ `esa_ra_bundle` / `psd_ra_bundle`) bundle a **second** piece of professional work — the
completed Housing Accommodation / RA form — into one price with **no extra customer charge**.
The provider earnings ledger only ever created the **base** payout, so a provider who also
completed the RA work was underpaid by one standard rate.

Confirmed LIVE example: **PT-MRUT8CHL**, Stephanie White, `esa_ra_bundle`, RA completed —
had `base $30 pending` only; correct total is `base $30 + RA $30 = $60 pending`.

## Contract
- Standard order only → **1×** standard rate.
- Combo RA **included but not completed** → **1×**.
- Combo RA **completed** → **2×** (base + `ra_completion`).
- Repeated completion / webhook / reconciliation → still exactly **2×**, never 3×+.
- RA payout = the provider's **standard `doctor_profiles.per_order_rate`** — never the
  customer price / coupon / $159 / $179 / document count. (Twice their **own** rate, not a
  fixed $60.)

## Canonical facts
- **Standard rate source**: `doctor_profiles.per_order_rate` (same source the base earning uses).
- **RA completion event**: provider submits `housing_completed` / `ra_completed_form` via
  `provider-submit-letter` → sets `orders.additional_documentation_status='completed'`.
  Customer uploads only set `'uploaded'` — never trigger payout.
- **Recipient**: the assigned provider (`orders.doctor_user_id`) who performed the work.

## Ledger architecture (component model)
`doctor_earnings` was already multi-component: `earning_type='base'` (one active per
`confirmation_id`) and `earning_type='additional_documentation'` (one per paid standalone
add-on request), each with a partial-unique index. This task adds a **third** component:

- `earning_type='ra_completion'`, keyed by `order_id`.
- Migration `20260721140000_ra_completion_provider_earning.sql`:
  `doctor_earnings_ra_completion_order_uniq (order_id) WHERE earning_type='ra_completion'
  AND COALESCE(status,'')<>'cancelled'`.

Separate rows (not a mutated single row) are **required** so base and RA keep independent
pending/paid audit history — e.g. base already paid + RA completed late → base stays paid,
RA is a new pending row (no history rewrite).

## Idempotency
`_shared/raCompletionEarning.ts`:
- Pure `isRaCompletionEligible(order)` gate (combo + completed + base paid + provider).
- `ensureRaCompletionEarning(supabase, orderId)`: eligibility gate → pre-check existing
  `ra_completion` row → insert; `23505` (partial-index race) treated as success.
- Deterministic amount = `per_order_rate`; never multiplies an existing total.
Rerun / concurrent / backfill all converge to exactly one RA row per order.

## Wiring
- `provider-submit-letter` housing-completed path calls `ensureRaCompletionEarning`
  (non-fatal; backfill / next completion heals a transient failure).
- `PaymentHistoryTab` — distinct "RA completion payout" line in the per-order breakdown.
- `EarningsPanel` — component badge (Base / RA completion / Additional Doc); **Total Cases**
  and per-provider counts now count **distinct orders** (a base+RA order = one case, no
  inflation); CSV gains a Component column.
- `ProviderEarnings` — "Reasonable Accommodation" badge; totals already sum all rows.
- `scripts/check-provider-ra-earnings.mjs` — pure-logic matrix + static wiring + negative
  controls; wired into `build`.

## Scope decision (standalone add-on preserved)
The paid **standalone** Additional Documentation add-on already creates its extra earning on
**payment** (`completeAdditionalDocPayment.ensureAddonEarning`, generic — not RA-specific).
Every confirmed-bug record is the **combo** case. Changing standalone to completion-gated
would regress a working generic mechanism and reduce existing pending earnings — out of the
confirmed-bug scope — so standalone behavior is **preserved**. Owner may request standalone
completion-gating as a separate task.

## TEST evidence
- Migration applied (TEST `opudhofjbydrljgleofq`); function `provider-submit-letter` v41
  (`verify_jwt=false`).
- Backfill: 3 Class-A orders (PT-MRIAX1MC, PT-QA-LATEHOUSING, PT-MRHPU2S2) → each base+RA=$60;
  reruns inserted 0.
- Synthetic fixtures: variable rate $35 → $70 (not fixed $60); RA row appears only on
  `uploaded`→`completed`; paid base preserved + RA pending; idempotent (cleaned up after).
- RLS (impersonated provider claims, not service role): provider sees only own base+RA rows,
  no cross-provider leak.
- Guard 39/39 (+ self-test 44/44); no domain-guard regressions; changed files typecheck/lint
  clean and Vite-compile clean.

## Safety
No customer charge / Stripe / checkout / package price / coupon / order-status / provider-
assignment / refund-policy / Ads change. No payout marked paid. No document deletion. No
customer communication or provider reminder sent. Only unambiguous completed-RA combo
earnings corrected.
