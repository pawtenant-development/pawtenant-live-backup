# ORDERS-RA-COMBO-CHIP-FILTER-LIVE-ROLLOUT-001

**Date:** 2026-07-19
**Scope:** LIVE (`pawtenant-live-backup` → `pawtenant-production` / pawtenant.com)
**Status:** ✅ **LIVE COMPLETE — RA PACKAGE CHIPS AND FILTERS VERIFIED**
**Owner approval:** Hamza visually approved the TEST implementation
(ORDERS-RA-COMBO-CHIP-FILTER-001) and authorized this LIVE mirror.

## Plain-language verdict
The owner-approved Admin Orders RA feature is now LIVE on pawtenant.com. Staff can
see, per row, whether an order is ESA / PSD / ESA + RA / PSD + RA / RA Add-on /
Unknown plus a concise RA-document state (Doc Missing / Uploaded / Under Review /
RA Completed), and can filter by package (All · ESA · PSD · ESA + RA · PSD + RA ·
All RA · RA Add-on). Classification uses only explicit saved identity fields —
never price. No migration, no edge-function, no schema change. Frontend-only.

## Preflight
- TEST source: `889f06f` (code `e4c078e` + docs `889f06f`); TEST deploy `dpl_6rjdCX8NS9qQmxzLuMRRrRHwumzq`.
- LIVE starting SHA: `1cf5d36` (= origin/main, ahead/behind 0/0, clean tracked tree).
- Preserved orphan docs: LIVE 4 untracked (none staged/edited). Canonical `main`, no worktree/branch.

## LIVE data-contract verification (read-only)
All required columns present on `orders` (`package_key`, `letter_type`,
`includes_reasonable_accommodation_letter`, `additional_documentation_status`,
`additional_documentation_required`, `package_display_name`) and the
`order_additional_documentation_requests` table exists with `status='paid'` rows.
LIVE `src/config/pricing.ts` exports the classifier deps (`isRaBundle`,
`packageProduct`, `PackageKey`). LIVE already had the order-detail RA panels
(`OrderRaOverviewStatus`, `OrderRaDocPanel`). **No migration needed.**
LIVE distribution (1477 orders at preflight): package_key null 1348 / esa_standard
112 / esa_ra_bundle 9 / psd_standard 5 / psd_ra_bundle 3; includes_RA true 12;
paid add-on requests 6.

## Exact files mirrored
New (copied byte-for-byte from TEST — self-contained, deps present in LIVE):
- `src/pages/admin-orders/orderPackage.ts`
- `src/pages/admin-orders/components/PackageChips.tsx`
- `scripts/test-order-package-classification.mjs`

Modified (surgical, adapted to LIVE's structure):
- `src/pages/admin-orders/types.ts` — package columns on the `Order` type.
- `src/pages/admin-orders/components/OrderCard.tsx` — ESA/PSD pill → `<PackageChips>`, `raAddonOrderIds` prop.
- `src/pages/admin-orders/page.tsx` — classifier import; package columns into `ORDERS_SELECT`; `packageFilter` + `raAddonOrderIds` state; paid-add-on fetch effect; `matchPackage` in the inline `filtered` predicate; Package pill row; pagination reset; `raAddonOrderIds` into `orderCardProps`.
- `package.json` — `test:order-package` + appended to LIVE's build chain.

## Diff from approved TEST behavior
Behaviorally identical. The only structural difference: LIVE's `page.tsx` uses an
inline `const filtered = orders.filter((o) => {...})` (not TEST's memoized
`orderMatchesFilters` useCallback) and an inline `ORDERS_SELECT` const (not TEST's
`ORDERS_LIST_COLUMNS`). The RA filter was applied inside LIVE's inline predicate,
so TEST's useCallback deps-array hunk was N/A (the inline filter recomputes each
render and picks up `packageFilter`/`raAddonOrderIds` automatically). Classifier,
chips, filter semantics, and pill row are identical. LIVE loads all orders in
250-row pages (more complete than TEST's 100-cap), so the client-side filter covers
the full order set.

## Automated validation
- Classifier test: `node scripts/test-order-package-classification.mjs` → **52 passed, 0 failed** (incl. price negative control, Unknown, All-RA union, standard-excludes-combos).
- Type-check: **0 introduced** (8 pre-existing LIVE baseline in unrelated files:
  AIAssistantTrustCard, AnalyticsTab, EmployeeHrDirectory×5, ProviderInternalRecords).
- `git diff --check`: clean.
- Production build (`npm run build`): **PASS** — attribution + hygiene + refund +
  pricing parity + pricing guards + the new classifier test all green.

## Commit
- LIVE code SHA: **`ccbb2be`** (feat) — was `1cf5d36`.
- Docs SHA: (this commit, separate).
- Push: canonical LIVE `main`.

## Deployment
| Item | Value |
|---|---|
| Method | `vercel deploy --prod` (fresh source build from `ccbb2be`) |
| New deployment | `dpl_EdQCsvH5W9jJB6uYrwtWuFaqVEtC` (`pawtenant-production-g0ekx4cud`) |
| Production alias | `pawtenant.com` → `g0ekx4cud` (confirmed) |
| Prior / rollback deployment | `pawtenant-production-gxgturdig` (from `1cf5d36`) |
| Served bundle | admin-orders chunk contains the classifier + package filter (browser-verified live) |

## Browser verification (pawtenant.com, owner admin session, read-only)
- Package filter row present. Package chips + RA-doc chips render (correct Admin colors).
- **ESA + RA → 10** (all genuine ESA combos; 10 vs preflight 9 = a new live order arrived).
- **RA Add-on → 6** (exactly the paid add-on requests; incl. two PSD-base + paid add-on rows correctly = RA Add-on).
- **All RA → 19** = 10 ESA+RA ∪ 3 PSD+RA ∪ 6 RA Add-on (exact union).
- **ESA → 1165** standard, **0** ESA+RA / PSD+RA / RA Add-on rows (no leakage).
- Existing chips preserved (VIP / Google Ads / Referral / Organic / ChatGPT / Microsoft).
- Order detail (Julie Morris PT-MRQLMPGD, ESA+RA): "Housing Accommodation Included"
  + "Waiting for customer upload" + missing-doc warning + PACKAGE/SOURCE lines +
  Contact customer / Open Documents. No Send clicked.
- 0 console errors introduced.
- (An accidental row-checkbox select during navigation was immediately cleared — no delete, no edit, no data change.)

## Mobile verification
- Genuine 375px CSS viewport not achievable: the authenticated Chrome window is
  maximized and ignores resize (innerWidth stays 1536) — the same limitation noted
  on TEST. Per task §13 this alone does not require rollback given Hamza's prior
  visual approval and no observed LIVE layout defect.
- LIVE mobile OrderCard markup inspected safely (real DOM): renders `<PackageChips>`
  ("ESA + RA" / "Doc Missing") inside a `flex-wrap` chip row — byte-identical to the
  owner-approved TEST components (which were visually verified wrapping cleanly at
  ~380px on TEST). No horizontal-overflow risk by construction.

## Database
- Migration required: **NO** (all columns/tables pre-existed).
- Writes: **NONE** (read-only classification + read-only paid-add-on SELECT).

## Edge Functions
- Changed: **NO.**

## Safety confirmation
Frontend-only. No payment, refund, subscription, provider assignment, document
creation, email, SMS, Google Ads / Meta upload, customer record edit, synthetic
fixture, DB write, migration, or edge-function deploy. Frozen `OrderDetailModal.tsx`
untouched.

## Remaining work
- The state-page pricing task may begin after this rollout closes (separate task; not started).
- No unrelated task started. TEST remains `889f06f`.
