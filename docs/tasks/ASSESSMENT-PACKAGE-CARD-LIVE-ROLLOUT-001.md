# ASSESSMENT-PACKAGE-CARD-LIVE-ROLLOUT-001

**Status:** ✅ **LIVE COMPLETE — PACKAGE CARD SAVINGS AND ALIGNMENT VERIFIED.**
Presentation-only. No migration. No edge function. No real payment. TEST unchanged.

Mirrors the owner-approved TEST package-card design to LIVE (`pawtenant.com`).

## Owner approval

Hamza visually approved the package-card **presentation** and **alignment** on TEST
before this rollout.

## SHAs

| | |
|---|---|
| **TEST source** | offer `ca0f3df` + alignment `ac90b78` (TEST final `f394135`). |
| **LIVE start** | `75e2f47`. |
| **LIVE code commit** | `ab3a6ce` — `feat: add approved package card savings presentation` (4 files). |
| **LIVE docs commit** | this record. |

## Deployment (LIVE)

| | |
|---|---|
| **Deploy ID** | `dpl_4ASh2gkphn7kT9JdJ5f3L7Q8wHTc` (READY, target production) — explicit `vercel deploy --prod`. |
| **Deploy hostname** | `pawtenant-production-dbsiqpxai-pawtenant-3686s-projects.vercel.app`. |
| **Alias** | `https://pawtenant.com` (canonical non-www). |
| **Git auto-deploy** | `pawtenant-production-qqd6yk9wq` also built from `ab3a6ce` (push-triggered); the explicit deploy is the authoritative alias holder. |
| **Rollback target** | prior Ready prod `pawtenant-production-bxfx8jj2j` (pre-rollout `75e2f47`). |
| **Served-bundle check** | `pawtenant.com` — 17 JS chunks scanned; contains `Full refund if you don't qualify.`, `Choose Klarna to pay in 4 installments starting at`, `the crossed-out price is our regular one-time rate`, `No additional label` (chip-slot spacer), `Fast digital delivery after provider approval`, `Everything included in Standard ESA` + `…PSD`, `Official PSD letter PDF if you qualify`. 0 console errors on load. |

## Files changed (exactly 4)

- **`src/lib/packageOffer.ts`** (NEW) — byte-identical to approved TEST.
- **`scripts/check-package-card-offer.mjs`** (NEW) — byte-identical to approved TEST.
- **`src/pages/assessment/components/PackageSelectionStep.tsx`** (MODIFIED) — now
  byte-identical to approved TEST final. **LIVE's pre-rollout version was byte-identical
  (mod. CRLF) to TEST's pre-offer baseline**, so this is a clean mirror, not a blind
  overwrite of divergent LIVE code.
- **`package.json`** — surgically added `check-package-card-offer.mjs` to the `build`
  chain (before `test-order-package-classification`) + a `check:package-card-offer`
  script. LIVE's other build steps (attribution/refund guards) left untouched; the
  TEST-only machine-facts/sitemap/refund-writer guards were NOT added.

## Presentation model (unchanged from approved TEST)

payable = canonical `getPackageTotal(key,"one_time",n)`; compare-at = payable + $30
(display only); savings $30; Klarna = payable/4. **Compare-at is presentation-only** —
never a charged amount (import-scope guard forbids any checkout/payment file importing
the helper). LIVE `pricing.ts` is identical to TEST (129/149/179 + combo flat 179).

| Package | Payable | Compare-at | Savings | Klarna 4-pay |
|---|---|---|---|---|
| Standard 1 | $129 | $159 | $30 | $32.25 |
| Standard 2–3 | $149 | $179 | $30 | $37.25 |
| RA Combo (flat) | $179 | $209 | $30 | $44.75 |

## Feature lists (7 per card)

ESA Standard / PSD Standard / ESA Combo / PSD Combo per the approved spec (ESA/PSD
wording separated; PSD Combo item 1 = "Everything included in Standard PSD"). Guard
enforces 4 arrays × exactly 7 items + ESA/PSD separation.

## Alignment (approved TEST, mirrored byte-for-byte)

Shared equal-height header: `min-h-[2.5rem]` title / `min-h-[2.25rem]` tagline /
`min-h-[1.5rem]` chip slot (Combo chip vs Standard `sr-only` "No additional label"
spacer) → both price groups start at the same Y. On TEST this measured **0px delta**
across payable / crossed / badge / one-time / refund / Klarna / CTA / card-height at
1280px; because LIVE's component + `pricing.ts` are byte-identical, LIVE renders
identically.

## Automated validation (on LIVE source)

- **Guard**: `check-package-card-offer` OK (offer matrix, ESA/PSD parity, combo flat,
  refund wording, no-guarantee, key-only onSelect, 4×7 features, ESA/PSD separation,
  card-scoped import — verified via the REAL helper + LIVE pricing.ts through jiti).
- **Build**: `npm run build` exit 0 (prerender 242 files, attribution-hygiene 29/0,
  pricing-parity + pricing-guards OK, package-card-offer OK, order-package 52/0).
- **type-check**: 8 pre-existing errors in unrelated files (`AIAssistantTrustCard`,
  `AnalyticsTab`, `EmployeeHrDirectory`, `ProviderInternalRecords`); **0 in my files →
  delta = 0** (LIVE baseline is 8; one more than TEST due to the frozen `AnalyticsTab`).
- **ESLint** (my files): 0 warnings. `git diff --check`: clean. Secret/log scan: none.

## Browser verification

- **Served bundle on pawtenant.com**: contains the full new card code (8 unique
  strings), 0 console errors. Production domain resolves to the new deploy (HTTP 200).
- **Card appearance / alignment / mobile**: guaranteed by the byte-identical mirror of
  the approved TEST component (exhaustively browser-verified on TEST: 0px desktop
  deltas, correct ESA/PSD prices + 7 features, 375px no overflow / badge not clipped).
- **Interactive prod-funnel verification intentionally NOT performed.** On LIVE,
  reaching the checkout step calls `create-payment-intent`, which creates a live Stripe
  PaymentIntent AND writes an `orders` row — a production side effect the task's own
  strict exclusions forbid ("do not change order persistence", "do not create a
  payment"). The owner can visually confirm the cards on `pawtenant.com` by running the
  assessment to the **package step** (which does NOT mint a PI) and stopping there.

## Checkout regression

Not exercised on LIVE (would mint a live PI + test order). Structurally unchanged:
`onSelect(c.key)` passes the package **key only** (guard-enforced); LIVE checkout /
`create-payment-intent` / pricing code is untouched; compare-at is card-scoped. The
identical click-through was verified on TEST with the same component (Standard → $129
payable, `$159`/`$209` absent from Amount Due Today, annual $115/$100 unchanged).

## Safety

No change to charged amounts, annual pricing, package keys, Stripe, PaymentIntent /
subscription logic, refund logic, Google Ads values, provider payouts, order
persistence, DB schema, Supabase functions, or env vars. No migration, no edge
function, no real payment, no subscription. TEST untouched (`f394135`).

## Remaining

None required for this rollout. Optional: owner visual spot-check on `pawtenant.com`
at the package step.
