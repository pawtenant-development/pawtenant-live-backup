# STRIPE-ADMIN-DAILY-PAYMENT-TIMEZONE-RECONCILIATION-001

**Date:** 2026-09-11 · **Owner decision:** PawTenant and Stripe reporting use ONE canonical business day, `America/New_York` (IANA, DST-safe, never a fixed offset). Timestamps stay in UTC; only day boundaries, counts and displayed reporting dates convert.

## 1. Root cause

The report — *"Admin shows four paid orders Today, Stripe shows two payments dated Sep 11"* — was a **display-timezone mismatch, not a data defect**:

- PawTenant Admin Orders groups rows by the `America/New_York` business day (already correct since ADMIN-ORDERS-NEW-YORK-CLOCK-…-001).
- The Stripe account's **Time zone** setting (Settings → Business → Account details) was **`America/Chicago`**. Two of the four payments landed at 00:06 and 00:10 ET on Sep 11, which Chicago renders as **11:06 PM / 11:10 PM Sep 10**. Not Pacific — Pacific would have shown 9:06 PM.
- All four orders reconcile to four genuine `succeeded` Stripe charges, all on Sep 11 New York time.

Investigating it exposed **real defects in PawTenant's own daily-payment reporting** (fixed here):

| Surface | Defect | Fix |
|---|---|---|
| `stripe-payment-history` edge fn | Daily revenue buckets keyed on the **UTC** calendar day (`toISOString().slice(0,10)`); `from`/`to` parsed as `T00:00:00Z` / `T23:59:59Z` (UTC bounds, inclusive sentinel). Every Accounts/Monthly-Books range was up to 5 h wrong at each end. **In Sep 1–11 2026, 8 of 53 succeeded LIVE charges ($849 of $6,115) sat on a different day under UTC than under New York.** | New pure `_shared/stripeDailyBuckets.ts`: NY business-day window (inclusive start, **exclusive** `created[lt]` end), buckets by the NY date of Stripe `created`, one succeeded charge per PaymentIntent; response carries `timezone`, `from`, `to_inclusive`, window UTC bounds, `daily_payment_count` (additive). |
| `PaymentsTab.tsx` / `PaymentsAccountsPanel.tsx` | "today" fallbacks and the highlighted "today" bar used the **UTC** day. | `businessIsoDate(new Date())`; chart labelled *"Succeeded Stripe payments by payment date · America/New_York · from → to · N payments"*. |
| `AnalyticsTab.tsx` (**FROZEN**, tracker row 395) | Presets (`setHours(0,0,0,0)`) and custom ranges (`customTo + "T23:59:59"`) were the **operator's browser day**; ISO strings for ad-spend panels were UTC dates. | Six surgical hunks in one date-helper block: `businessDayRange()` over NY business days (exclusive next-day bound − 1 ms), custom bounds as NY dates, labels rendered in NY with the zone suffix, `dateFromStr/dateToStr = businessIsoDate(...)`. |
| `AdminDashboard.tsx` | 7-day sparklines were **rolling 24-hour windows from "now"**, and revenue was keyed on **`created_at`** (not a payment time). "This month" was the browser month. | `paymentDayBuckets.ts`: revenue by `paid_at` NY business day (Stripe PI required; partner-funded/test/cancelled excluded; one per PI), order count by `created_at` business day; caption *"7-day bars · by paid date · America/New_York"*; NY business month. |
| Admin Orders day ribbons | "Today" said nothing about its basis, so an operational group read like a payment count. | Ribbon now reads **"Today · Created date · America/New_York"** (desktop + mobile; mobile wraps, never truncates), with a title explaining it is not a Stripe payment count. |

The five numbers are now distinct and labelled: orders **created** today (Orders ribbons, Dashboard order bars), successful **payments** today (Payments → Daily Revenue, Dashboard revenue bars), gross **paid revenue** today (same), operational queues by creation (labelled), partner-funded/manual orders (never a Stripe payment — excluded by `isStripePaidOrder`).

## 2. Reconciliation — the four orders (LIVE, read-only, no PII)

New York business day 2026-09-11 = `[2026-09-11T04:00:00Z, 2026-09-12T04:00:00Z)` (EDT, UTC−4).

| Order | `orders.created_at` (UTC) | Authoritative payment instant (Stripe charge `created`, Unix → UTC) | `orders.paid_at` (webhook stamp, UTC) | PI (masked) | PI status / charge | Amount | NY time | Chicago display (before) | NY display (after) | Why Admin said "Today" |
|---|---|---|---|---|---|---|---|---|---|---|
| PT-PSD68YH61W7 | 2026-09-11 04:04:52 | **1789099601** → 2026-09-11 04:06:41 | 04:06:44.573 | `pi_3UEL…zz7e` | succeeded / charge `…83Ej` succeeded (subscription invoice, counted once) | $115.00 USD | 00:06:41 EDT Sep 11 | Sep 10, 11:06 PM | Sep 11, 12:06 AM | created 00:04 ET Sep 11 (Created-date basis) |
| PT-MTWFHL5C | 2026-09-11 04:06:21 | **1789099833** → 2026-09-11 04:10:33 | 04:10:34.843 | `pi_3UEL…GuTQ` | succeeded / charge `…OvWT` succeeded | $109.00 USD | 00:10:33 EDT Sep 11 | Sep 10, 11:10 PM | Sep 11, 12:10 AM | created 00:06 ET Sep 11 |
| PT-MTWNCKG1 (screenshot read "PT-MTNNCKG1") | 2026-09-11 07:48:03 | **1789113503** → 2026-09-11 07:58:23 | 07:58:25.535 | `pi_3UEP…KsC2` | succeeded / charge `…zHeH` succeeded | $109.00 USD | 03:58:23 EDT Sep 11 | Sep 11, 2:58 AM | Sep 11, 3:58 AM | created 03:48 ET Sep 11 |
| PT-PSDMPJIYMUZ | 2026-09-11 09:39:50 | **1789120521** → 2026-09-11 09:55:21 | 09:55:23.214 | `pi_3UEQ…p3Je` | succeeded / charge `…1SpU` succeeded after two `card_declined` charges on the same PI (`…hF5r`, `…Sk2L` — not counted) | $129.00 USD | 05:55:21 EDT Sep 11 | Sep 11, 4:55 AM | Sep 11, 5:55 AM | created 05:39 ET Sep 11 |

- **All four are genuine successful Stripe payments.** `payment_attempts` holds one `payment_intent.succeeded` row per order; `refund_status = none`, no dispute, `is_test = false`, `source_system = null`, no sibling order shares any of the four PaymentIntents (duplicate check = 0).
- **Authoritative timestamp selected:** the Stripe charge's `created` (Unix seconds, from the Stripe API). PawTenant's `orders.paid_at` is the webhook-receipt stamp and trails it by 1–3 s; `payment_attempts.created_at` is the same receipt. `created_at`, `last_meaningful_activity_at`, assignment and last-contact times were never used.
- **Stripe Dashboard timezone:** before `America/Chicago` (account-level setting), after `America/New_York`. Stripe's support docs: the setting *"will only affect the times displayed in your dashboard and will not affect your reporting exports, the times returned by the API, or the timing of your subscriptions and transfers"*; financial reports on Balance/Reconciliation generate in the account time zone by default. Country, address, settlement, tax and payout schedule untouched.
- Counts for the NY day: orders created 4 · succeeded payments 4 · gross $462 · under a UTC day the same four also count, but the UTC day also pulled in 6 created orders vs 4 (two Sep 10 evening ET leads) — the misfiling pattern that the eight Sep 1–11 charges above demonstrate on revenue.
- Discrepancy sources ruled out: subscription invoice vs PaymentIntent (one charge each), duplicate orders (0), manual/partner (none), refunded/failed/incomplete/uncaptured (failed retries excluded by status), webhook delay (≤3 s), missing PI link (none), test vs live mode (LIVE keys, `is_test=false`).

## 3. Files changed

TEST `96e0a47` (+ `19854bc` mobile ribbon wrap) · rollback = `b28a3f0`.

- NEW `supabase/functions/_shared/stripeDailyBuckets.ts`, `src/lib/paymentDayBuckets.ts`, `scripts/check-stripe-daily-payment-timezone.mjs`
- `src/lib/businessTime.ts` + `supabase/functions/_shared/businessTime.ts` (twins): `isBusinessIsoDate`, `businessIsoDateOfUnix`, `businessDayStart`, `businessDayEndExclusive`, `shiftBusinessIsoDate`, `businessDateRange`
- `supabase/functions/stripe-payment-history/index.ts`, `PaymentsTab.tsx`, `PaymentsAccountsPanel.tsx`, `AdminDashboard.tsx`, `admin-orders/page.tsx`, `AnalyticsTab.tsx` (frozen — surgical, tracker row 395), `scripts/check-accounts-date-range-alignment.mjs` (regex), `package.json`
- Not touched: `OrderDetailModal.tsx`, checkout, webhook, prices, products, comms, earnings, attribution, migrations. `exportOrders.ts` keeps explicit ISO-UTC (`Z`) timestamps.

## 4. Guard

`check:stripe-daily-tz` — 104 assertion sites in three layers (executed browser + edge clocks and both bucketing modules with fixtures; static wiring with comments AND string literals stripped; twin parity). `test:stripe-daily-tz` — **23/23 planted negative controls** detected: UTC grouping, browser-local grouping, fixed UTC−4 bounds, inclusive 23:59:59 sentinel, edge UTC bucket key, duplicate PaymentIntent counted twice, failed charges counted, from/to parsed as UTC, rolling preset ending on the UTC day, `created_at` as payment time, partner-funded orders counted, duplicate orders double-counted, today ending on the UTC day, twin drift, plus nine static re-plants. Wired into `npm run build`.

Proven in the executed battery: 11:59 PM ET → same day; 12:01 AM ET → next day; 04:06:41Z (Chicago Sep 10) → Sep 11; 02:50:16Z (UTC Sep 10) → Sep 9; spring-forward day = 23 h, fall-back day = 25 h, January bounds at 05:00Z; failed/pending/refunded-only/partner/test/manual/duplicate rows excluded; subscription invoice counted once; adjacent days share one boundary instant.

## 5. Build / type-check

- `npm run type-check`: **8 errors, all pre-existing baseline** (none in task files).
- `npm run build`: full guard chain **exit 0** on an LF archive of the staged tree. On the CRLF working copy the chain stops at the pre-existing A21 customer-portal check (known local-only artifact, files untouched by this task).

## 6. Deployments

- Migration: **none**. `verify_jwt`: **unchanged**.
- TEST edge fn `stripe-payment-history` v45 → **v46**, `verify_jwt=true` (CLI default, re-read after deploy). Deployed response verified through an admin session: `timezone: America/New_York`, `window_start_utc 2026-09-10T04:00:00Z`, `window_end_exclusive_utc 2026-09-12T04:00:00Z`, `daily[].count`.
- TEST Vercel: `dpl_H8H1yLUNoybMNW2rciffAAdky8CL` (`pawtenant-test-9uotxx4xb`) for `96e0a47`; ribbon-wrap redeploy for `19854bc` — see §8.
- LIVE: see §8.

## 7. Browser QA (TEST, authenticated admin session)

1440 px (window) and 390 / 768 px (same-origin iframes — the Chrome window cannot be resized below the desktop width):

- Orders: every day ribbon reads `<day> · Created date · America/New_York`; `scrollWidth == clientWidth` at 390/768/1440. First pass at 390 showed the mobile label ellipsised → `19854bc` makes the row wrap.
- Payments → Payments & Refunds: *"Daily Revenue — September 2026 Books / Succeeded Stripe payments by payment date · America/New_York · 2026-09-01 → 2026-09-30 · 0 payments"*.
- Dashboard: *"7-day bars · by paid date · America/New_York"* with the paid-date window in the title; no truncation at 390/768.
- Console: zero errors.

## 8. LIVE rollout — ✅ COMPLETE (owner-approved 2026-09-11)

The port is an anchored, per-hunk cherry-pick (never a TEST-main merge); AnalyticsTab hunks were re-resolved against LIVE's own preset set `today/yesterday/7d/30d/90d/mtd/lastmonth/ytd`. LIVE stores LF blobs (`core.autocrlf=false`), so the port files were written LF — the diff is exactly 13 files, +1000/−94 (+4/−2 for the ribbon wrap).

- Re-fetched `origin/main` first: unchanged at `cccf5869`, local ahead by exactly the three verified task commits. Pushed `a5f0814f` (port) + `50a24988` (ribbon wrap) + `fd83a4c7` (docs) · rollback = `cccf5869`. LIVE guard 104 sites green, self-test 23/23, type-check 8 pre-existing errors (none in task files), full build chain exit 0 on an LF archive.
- LIVE edge fn `stripe-payment-history` v95 → **v96**, deployed with `--no-verify-jwt`; re-read after deploy: `verify_jwt=false` preserved. Deployed bundle `ezbr_sha256 bb420e02…`.
- LIVE Vercel (git auto-deploy): `dpl_5TiRPaC7kc9iezNExgKLByNW5X2B` (`pawtenant-production-47fzbishg`), canonical `https://pawtenant.com` alias verified pointing at it; admin chunk `page-ne_V3lZV.js` on the canonical host contains all four new string literals (payments label, dashboard caption, ribbon basis + zone, ribbon title).
- **Read-only re-reconciliation on the DEPLOYED LIVE report** (`?from=2026-09-11&to=2026-09-11`, admin session): `timezone: America/New_York`, `window_start_utc 2026-09-11T04:00:00.000Z`, `window_end_exclusive_utc 2026-09-12T04:00:00.000Z`, `daily: [{date: 2026-09-11, revenue: 462, count: 4}]`, `daily_payment_count 4`, `charge_count 4`, `total_revenue 462`, `daily_skipped 2` (the two declined retries on the PSD order), succeeded PIs = exactly the four reconciled orders, no extras. **September 11 = 4 payments, $462.**
- LIVE browser QA (pawtenant.com, authenticated admin, 1440-wide window): Orders ribbons *"Today · Latest activity · America/New_York · 8 orders"* (this operator's saved basis; the label names it), *"Yesterday · …"*; Payments → Payments & Refunds *"Succeeded Stripe payments by payment date · America/New_York · 2026-09-01 → 2026-09-30 · 51 payments"*; Dashboard *"7-day bars · by paid date · America/New_York"* with the paid-date window in the title; `scrollWidth == clientWidth`; zero console errors. 390/768 behaviour is identical markup to TEST (verified there via iframes).
- ⚠️ Pre-existing, not this task: the Orders list fetch is gated on `activeTab === "orders"` (page.tsx), so the LIVE Dashboard tab renders against an **empty** `orders` dataset when opened directly (Total Revenue $0 · 0 paid orders, pipeline 0, Recent Activity empty — all computed by untouched code) and its 7-day bars read 0. Tracked with the Admin Orders dataset work; the caption/title logic is correct for whatever dataset it is handed.
- Stripe account time zone `America/Chicago → America/New_York` (display-only; verified all four listed under Sep 11 at 12:06 AM, 12:10 AM, 3:58 AM, 5:55 AM). No payment, order, price, product, subscription, communication, earning or attribution record was modified during the rollout.

## 9. Confirmation of non-changes

No order, payment, price, Stripe product, subscription schedule, communication, earning or attribution record was created, modified or deleted. Read-only SQL on LIVE; read-only Stripe API listing through the existing admin-only report; one reversible Stripe *display* setting changed (owner-directed).
