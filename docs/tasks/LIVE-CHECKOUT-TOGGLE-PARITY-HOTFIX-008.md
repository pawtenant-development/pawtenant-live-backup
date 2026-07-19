# LIVE-CHECKOUT-TOGGLE-PARITY-HOTFIX-008

**Date:** 2026-07-19
**Scope:** LIVE (`pawtenant-live-backup` → `pawtenant-production` / pawtenant.com)
**Status:** ✅ FIXED + DEPLOYED + VERIFIED

## Summary

The Assessment Funnel LIVE rollout (`1a2352c`) shipped **without** commit `2774cbd`'s
one-time-plan fix. As a result the ESA one-time PaymentIntent minter on LIVE was sending
the unsafe dynamic `plan: step3.plan` in its `create-payment-intent` body — reintroducing
the original P0 price-toggle defect. Fixed by hard-coding `plan: "one-time"` (byte-for-byte
parity with the verified-safe TEST), guarded against future regression, and deployed.

## Was the LIVE discrepancy real? — YES

| Question | Answer |
|----------|--------|
| Was LIVE using the unsafe plan value? | **Yes** — `src/pages/assessment/page.tsx` `fetchClientSecret` sent `plan: step3.plan`. |
| Could prices merge when toggling? | **Yes** — reproduced in-browser (below). |
| Was a fix needed? | **Yes**. |
| Are $129/$149 one-time prices stable now? | **Yes** — distinct across 20+ toggles; server 2-pet one-time = $149. |
| Are $115/$135 subscription prices stable? | **Yes** — config-confirmed; card renders correctly. |
| Was any real payment completed? | **No** — never pressed Pay; only harmless incomplete one-time PaymentIntents (normal-visitor behavior). |
| Is Assessment Funnel tracking unchanged? | **Yes** — only the `plan` field in the one-time CPI body changed; all `trackAssessment*` / `trackPaymentSuccess` calls untouched. |

## Exact source behavior

- `fetchClientSecret` is the **sole live one-time PaymentIntent minter**; its `stripeClientSecret`
  feeds only the one-time `StripePaymentForm`. The subscription path mints its own PI at pay
  time via `subscriptionParams` / `StripeCardForm`.
- Root cause: `handleStep3Change` calls `fetchClientSecret` right after `setStep3(next)`, so
  the closure still held the OLD plan (`"subscription"`) when toggling Subscribe→One-time. The
  stale value minted a subscription PI whose annual amount was written into
  `quotedBasePriceDollars`, collapsing the one-time price onto the subscription price.
- The full `assessment/page.tsx` diff between TEST and LIVE was **only** this one hunk.
- Other `plan: step3.plan` uses in the file are legitimate and were left untouched: the inert
  `handleSubmit` fallback (throws before using the result), analytics tracking, and logging.

## Browser reproduction (pre-fix, LIVE source `1a2352c`, local dev, 1 pet)

| State | One-time card | Subscribe card | Amount Due Today | Pay button |
|-------|--------------|----------------|------------------|------------|
| Initial (One-time) | $129 | $115 | $129 | $129 |
| After Sub→One-time | **$115 ✗** | $115 | **$115 ✗** | **$115 ✗** |

Both plan cards + Amount Due Today + Pay button all collapsed to **$115** for a one-time
selection — exact P0 symptom.

## Fix

`src/pages/assessment/page.tsx` — `fetchClientSecret` create-payment-intent body:
`plan: step3.plan` → `plan: "one-time"` (with explanatory comment). Now byte-for-byte identical
to TEST for this file (commit `2774cbd`'s exact change).

## Regression guard

`scripts/check-pricing-guards.mjs` (blocking in `npm run build`) extended: fails the build if the
one-time PI minter body stops sending `plan:"one-time"` or reintroduces `plan:step3.plan`.
Negative control verified: regressing the line → guard exits **1** (both checks fire); restored
byte-for-byte → guard exits **0**.

## Post-fix verification (local dev on the deployed source)

- 20+ Subscribe↔One-time toggles: **0 price-merge events**; One-time stays **$129**,
  Subscribe stays **$115**, distinct throughout; final one-time Pay = $129.00.
- LIVE server 2-pet **one-time** = `basePriceAmount 14900` ($149).
- Pricing config: one-time $129/$149, subscription first-year $115/$135, renewal $100/$115.
- `type-check`: 0 introduced (8 pre-existing baseline, all unrelated files).
- `npm run build`: PASS (prerender 242/0; attribution parity + hygiene; refund guard; pricing
  parity; pricing guards incl. new one-time guard).
- **Served bundle** (pawtenant.com, chunk `page-B1lKRWX5.js`):
  `state:r.state,plan:"one-time",packageKey:` — fix confirmed live; no dynamic-plan regression.

## Deployment

| Item | Value |
|------|-------|
| Final LIVE SHA | `f6c6cd3` (was `1a2352c`) |
| Deployment ID | `dpl_3X4mx83gtQuyZ5v7dh1DENeLL1u6` (`pawtenant-production-azlqf22j9`) |
| Prior / rollback deployment | `pawtenant-production-eurl0a52i` (built from `1a2352c`) |
| Served bundle | `page-B1lKRWX5.js` (contains `plan:"one-time"`) |
| Method | `vercel deploy --prod` (fresh source build; guard passed in build log) |

## Untouched / preserved

Pricing values, Stripe Price IDs, subscription schedules, coupons, Admin Pricing, existing
subscriptions, Google Ads / Meta, refund logic, provider payouts, Assessment Funnel tracking.
TEST repo unchanged (`aac1ac1`).

## Follow-up (optional)

Mirror the same guard into `pawtenant-test/scripts/check-pricing-guards.mjs` for parity (TEST
already carries the fix; LIVE's build now blocks the regression regardless).
