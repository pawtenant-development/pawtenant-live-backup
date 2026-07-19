# STATE-PAGE-PRICING-HOMEPAGE-PARITY-TRUST-STRIP-LIVE-ROLLOUT-001

**Date:** 2026-07-19
**Scope:** LIVE (`pawtenant-live-backup` → `pawtenant-production` / pawtenant.com)
**Status:** ✅ **LIVE COMPLETE — HOMEPAGE-PRICING PARITY AND PAYMENT LOGOS VERIFIED**
**Owner approval:** Hamza visually approved the TEST implementation
(STATE-PAGE-PRICING-HOMEPAGE-PARITY-TRUST-STRIP-001) and explicitly authorized this surgical LIVE rollout.

## Plain-language verdict
The ESA and PSD state pages on pawtenant.com now show the **same 3-card pricing as the homepage / PSD
landing page** — ESA Letter $129 one-time · ESA Annual $115 first year (renews $100/yr) · Multi-Pet ESA
$149 fixed ($135→$115 annual); PSD identical with dog terminology. The rejected **$179 "Standard +
Reasonable Accommodation" card is not present** on any homepage/state pricing (the RA bundle stays only in
the assessment package-selection step). The payment strip below the pricing now shows **real Visa /
Mastercard / American Express / Discover logo graphics** instead of plain-text chips. Frontend-only. No
checkout / Stripe / package-key / schema / migration / edge-function change.

## Preflight
- TEST source (approved): code `db4d96d`, final `c3308c5`; TEST deploy `dpl_CzuMyFTmBJ7yE9vpvh8SPdDsBtD3`.
- LIVE starting SHA: `1445cb6` (= origin/main, ahead/behind 0/0, clean tracked tree; 4 untracked orphan docs preserved).
- Canonical `main`, no worktree/branch/reset/rebase/merge. TEST kept read-only.

## Cross-repo audit (before editing)
- `PlanPricingSection.tsx` — **identical** LIVE vs TEST (shared component; unchanged).
- `HomePricingSection.tsx`, `PsdPricingSection.tsx`, `PaymentTrustStrip.tsx` — LIVE was **byte-identical to
  TEST's pre-`db4d96d` baseline** (confirmed via diff), so applying TEST's post version is a faithful mirror.
- `src/data/planPricingCards.ts`, `scripts/check-state-pricing-cards.mjs` — **absent** in LIVE (created).
- The rejected `StatePricingCards.tsx` / `statePricingCards.ts` **never existed in LIVE** (nothing to delete).
- LIVE state-esa used `<EsaPricingMini premium>`; LIVE state-psd used an inline `pricingPlans` map — the older
  baseline (pre-parity). Swapped surgically to the shared `PlanPricingSection`. `EsaPricingMini` / `PsdPricingMini`
  remain used by ~25 other LIVE pages and were **not** touched.
- LIVE `src/config/pricing.ts` exports all needed getters + `PACKAGE_DISPLAY_NAMES` with `esa_ra_bundle` /
  `psd_ra_bundle`. LIVE homepage renders `<HomePricingSection>`, LIVE PSD landing renders `<PsdPricingSection>`.
- Pre-existing LIVE↔TEST divergences left **untouched**: LIVE state pages lack the TEST `HeroPriceLine` and use
  `font-bold` where TEST uses `pt-hero-display`. Only the pricing region changed.
- Recent LIVE work confirmed intact: Stripe webhook fail-closed, package-card savings/alignment, AI-SEO
  machine-facts hygiene (guard green), RA Orders chips/filters (order-package 52/0).

## Files changed (8)
- NEW `src/data/planPricingCards.ts` (mirrored from TEST) — `buildEsaPlanCards`/`buildPsdPlanCards` + copy, from canonical `pricing.ts`.
- NEW `scripts/check-state-pricing-cards.mjs` (mirrored) — blocking guard, wired into `npm run build`.
- M `src/pages/home/components/HomePricingSection.tsx` — consume shared `buildEsaPlanCards` (identical output).
- M `src/components/feature/PsdPricingSection.tsx` — consume shared `buildPsdPlanCards` (identical output).
- M `src/components/feature/PaymentTrustStrip.tsx` — real inline-SVG Visa/Mastercard/Amex/Discover logos.
- M `src/pages/state-esa/page.tsx` — `<EsaPricingMini premium>` → `<PlanPricingSection theme="esa" cards={buildEsaPlanCards('/assessment?state=<ABBR>&ref=state-page')}>`.
- M `src/pages/state-psd/page.tsx` — inline `pricingPlans` → `<PlanPricingSection theme="psd" cards={buildPsdPlanCards('/psd-assessment')}>` (removed unused `useSitePricing`).
- M `package.json` — add `check-state-pricing-cards.mjs` to the build chain + `check:state-pricing` script.

## Final ESA (homepage + state) & PSD (landing + state) pricing
| Card | Price | Annual / renewal |
|---|---|---|
| ESA Letter / PSD Letter (1) | **$129** one-time | — |
| ESA/PSD Annual Plan (1, "Most Popular") | **$115** first year | Renews at **$100/year** beginning in year two |
| Multi-Pet / Multi-Dog (2–3) | **$149** one-time · fixed total | Prefer annual? **$135** first year, then **$115/year** |
ESA CTAs → `/assessment?state=<ABBR>&ref=state-page`; PSD CTAs → `/psd-assessment`. No `package=` / no RA preselect.

## No RA / $179 on the cards; RA identity preserved
pawtenant.com `/esa-letter/california`, `/esa-letter/texas`, `/psd-letter/california`, `/psd-letter/texas`
all measured `hasRA=false`, `has179=false`. Canonical `esa_ra_bundle` / `psd_ra_bundle` package keys remain in
`pricing.ts` (guard-asserted) — RA is untouched in assessment / checkout / portal / admin / order metadata.

## Payment logos
`PaymentTrustStrip` renders self-contained inline SVGs: Visa (blue italic wordmark), Mastercard (interlocking
red/amber circles — 2 `<circle>` + overlap path), Amex (white wordmark on brand-blue box), Discover (dark
wordmark + orange ball). Each `role="img"` + `aria-label`, uniform ~14–18px marks in 32px pills, no
distortion/clip, responsive wrap. Kept Secure Checkout + 100% Money-Back Guarantee. Brand colors confirmed in
the live pawtenant.com DOM (#1434CB / #EB001B+#F79E1B+#FF5F00 / #016FD0 / #1A1A1A+#F76E11). No CDN, no emoji,
no font files. Rendered by `PlanPricingSection`, so it appears on homepage + PSD landing + state pages.

## Guard + negative controls
`scripts/check-state-pricing-cards.mjs` (jiti behavioral prices/renewal/terminology + no-RA/$179 + homepage
parity + import-scope + real-logo checks) passes. 8 negative controls proven to FAIL the LIVE guard
(A $179 RA card · B annual removed · C multi one-time≠149 · D annual renewal≠100 · E multi renewal≠115 ·
F Visa→text · G Mastercard→text · H PSD leaks ESA); both mutated files restored byte-for-byte (sha256 match),
guard green after restore. None committed.

## Validation
- Corrected guard ✓ · `check-machine-facts` ✓ · `check-pricing-parity`+`check-pricing-guards` ✓ ·
  `check-package-card-offer` ✓ · `test-order-package-classification` 52/0 ✓.
- **type-check:** 0 new errors; **8 pre-existing, unrelated** remain (AIAssistantTrustCard.tsx, AnalyticsTab.tsx
  [frozen], EmployeeHrDirectory.tsx, ProviderInternalRecords.tsx) — not a clean overall typecheck; this task
  introduced zero.
- **ESLint** on all touched files: 0. **Production build:** exit 0 (full guard chain + prerender). `git diff --check` clean.

## Deployment
- New deployment: `dpl_BQ4x2AP6uYwgLDAGUH84SrzAA4VY` (`pawtenant-production-2qcqti1ml-pawtenant-3686s-projects.vercel.app`), READY, production.
- Served SHA: `ff04029` (built from the committed working tree). Git auto-deploy also built `pawtenant-production-12wj9uhwx`.
- Production alias **pawtenant.com** serves the new bundle (verified: 3-card pricing + logos, no RA/$179).
- **Rollback:** prior Ready production `pawtenant-production-79f7isgjt-pawtenant-3686s-projects.vercel.app`.

## Browser evidence (pawtenant.com; DOM-measured)
- Homepage: 3 ESA cards unchanged; Visa/Mastercard/Amex/Discover SVG logos; Secure Checkout + Money-Back.
- ESA state CA + TX: 3 homepage-parity cards, state CTAs, logos, `hasRA=false`, `has179=false`, equal height.
- PSD state CA + TX: 3 PSD/dog cards, `/psd-assessment` CTAs, logos, no RA/$179/ESA/animal, equal height.
- Desktop 1280px: equal card heights, consistent logo height, no horizontal overflow, 0 console errors.
- Mobile 375px: cards single-column (335px), trust strip fits (375px) and logos wrap cleanly, no overflow.
- **CTA safety:** routing verified via DOM hrefs (ESA `/assessment?state=…&ref=state-page`; PSD `/psd-assessment`;
  no `package=` / no RA preselect) **plus transitive TEST-deploy evidence** (on TEST the same CTA opened the
  assessment intake with no Stripe element / no order). Per the CTA-safety rule, no production CTA was clicked,
  so no LIVE PaymentIntent / order / assessment submission / customer communication occurred.

## Confirmations
- Migration: **no**. Supabase Edge Function deploy: **no**. Payment / order / DB write / customer comms: **none**.
- No Stripe change. **TEST untouched** (read-only this session). No unrelated LIVE change (only the pricing region
  of the two state pages + the shared pricing/trust files + the guard + build-chain wiring).

## Remaining
None for this pricing/trust-strip task. Next separate SEO task remains `AI-SEO-SOFT-404-ROUTE-STATUS-001`
(NOT started in this session).
