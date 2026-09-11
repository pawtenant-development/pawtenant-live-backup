# STRIPE-ADMIN-DAILY-PAYMENT-TIMEZONE-RECONCILIATION-001

**Date:** 2026-09-11 Â· **Owner decision:** PawTenant and Stripe reporting use ONE canonical business day, `America/New_York` (IANA, DST-safe, never a fixed offset). Timestamps stay in UTC; only day boundaries, counts and displayed reporting dates convert.

## 1. Root cause

The report â€” *"Admin shows four paid orders Today, Stripe shows two payments dated Sep 11"* â€” was a **display-timezone mismatch, not a data defect**:

- PawTenant Admin Orders groups rows by the `America/New_York` business day (already correct since ADMIN-ORDERS-NEW-YORK-CLOCK-â€¦-001).
- The Stripe account's **Time zone** setting (Settings â†’ Business â†’ Account details) was **`America/Chicago`**. Two of the four payments landed at 00:06 and 00:10 ET on Sep 11, which Chicago renders as **11:06 PM / 11:10 PM Sep 10**. Not Pacific â€” Pacific would have shown 9:06 PM.
- All four orders reconcile to four genuine `succeeded` Stripe charges, all on Sep 11 New York time.

Investigating it exposed **real defects in PawTenant's own daily-payment reporting** (fixed here):

| Surface | Defect | Fix |
|---|---|---|
| `stripe-payment-history` edge fn | Daily revenue buckets keyed on the **UTC** calendar day (`toISOString().slice(0,10)`); `from`/`to` parsed as `T00:00:00Z` / `T23:59:59Z` (UTC bounds, inclusive sentinel). Every Accounts/Monthly-Books range was up to 5 h wrong at each end. **In Sep 1â€“11 2026, 8 of 53 succeeded LIVE charges ($849 of $6,115) sat on a different day under UTC than under New York.** | New pure `_shared/stripeDailyBuckets.ts`: NY business-day window (inclusive start, **exclusive** `created[lt]` end), buckets by the NY date of Stripe `created`, one succeeded charge per PaymentIntent; response carries `timezone`, `from`, `to_inclusive`, window UTC bounds, `daily_payment_count` (additive). |
| `PaymentsTab.tsx` / `PaymentsAccountsPanel.tsx` | "today" fallbacks and the highlighted "today" bar used the **UTC** day. | `businessIsoDate(new Date())`; chart labelled *"Succeeded Stripe payments by payment date Â· America/New_York Â· from â†’ to Â· N payments"*. |
| `AnalyticsTab.tsx` (**FROZEN**, tracker row 395) | Presets (`setHours(0,0,0,0)`) and custom ranges (`customTo + "T23:59:59"`) were the **operator's browser day**; ISO strings for ad-spend panels were UTC dates. | Six surgical hunks in one date-helper block: `businessDayRange()` over NY business days (exclusive next-day bound âˆ’ 1 ms), custom bounds as NY dates, labels rendered in NY with the zone suffix, `dateFromStr/dateToStr = businessIsoDate(...)`. |
| `AdminDashboard.tsx` | 7-day sparklines were **rolling 24-hour windows from "now"**, and revenue was keyed on **`created_at`** (not a payment time). "This month" was the browser month. | `paymentDayBuckets.ts`: revenue by `paid_at` NY business day (Stripe PI required; partner-funded/test/cancelled excluded; one per PI), order count by `created_at` business day; caption *"7-day bars Â· by paid date Â· America/New_York"*; NY business month. |
| Admin Orders day ribbons | "Today" said nothing about its basis, so an operational group read like a payment count. | Ribbon now reads **"Today Â· Created date Â· America/New_York"** (desktop + mobile; mobile wraps, never truncates), with a title explaining it is not a Stripe payment count. |

The five numbers are now distinct and labelled: orders **created** today (Orders ribbons, Dashboard order bars), successful **payments** today (Payments â†’ Daily Revenue, Dashboard revenue bars), gross **paid revenue** today (same), operational queues by creation (labelled), partner-funded/manual orders (never a Stripe payment â€” excluded by `isStripePaidOrder`).

## 2. Reconciliation â€” the four orders (LIVE, read-only, no PII)

New York business day 2026-09-11 = `[2026-09-11T04:00:00Z, 2026-09-12T04:00:00Z)` (EDT, UTCâˆ’4).

| Order | `orders.created_at` (UTC) | Authoritative payment instant (Stripe charge `created`, Unix â†’ UTC) | `orders.paid_at` (webhook stamp, UTC) | PI (masked) | PI status / charge | Amount | NY time | Chicago display (before) | NY display (after) | Why Admin said "Today" |
|---|---|---|---|---|---|---|---|---|---|---|
| PT-PSD68YH61W7 | 2026-09-11 04:04:52 | **1789099601** â†’ 2026-09-11 04:06:41 | 04:06:44.573 | `pi_3UELâ€¦zz7e` | succeeded / charge `â€¦83Ej` succeeded (subscription invoice, counted once) | $115.00 USD | 00:06:41 EDT Sep 11 | Sep 10, 11:06 PM | Sep 11, 12:06 AM | created 00:04 ET Sep 11 (Created-date basis) |
| PT-MTWFHL5C | 2026-09-11 04:06:21 | **1789099833** â†’ 2026-09-11 04:10:33 | 04:10:34.843 | `pi_3UELâ€¦GuTQ` | succeeded / charge `â€¦OvWT` succeeded | $109.00 USD | 00:10:33 EDT Sep 11 | Sep 10, 11:10 PM | Sep 11, 12:10 AM | created 00:06 ET Sep 11 |
| PT-MTWNCKG1 (screenshot read "PT-MTNNCKG1") | 2026-09-11 07:48:03 | **1789113503** â†’ 2026-09-11 07:58:23 | 07:58:25.535 | `pi_3UEPâ€¦KsC2` | succeeded / charge `â€¦zHeH` succeeded | $109.00 USD | 03:58:23 EDT Sep 11 | Sep 11, 2:58 AM | Sep 11, 3:58 AM | created 03:48 ET Sep 11 |
| PT-PSDMPJIYMUZ | 2026-09-11 09:39:50 | **1789120521** â†’ 2026-09-11 09:55:21 | 09:55:23.214 | `pi_3UEQâ€¦p3Je` | succeeded / charge `â€¦1SpU` succeeded after two `card_declined` charges on the same PI (`â€¦hF5r`, `â€¦Sk2L` â€” not counted) | $129.00 USD | 05:55:21 EDT Sep 11 | Sep 11, 4:55 AM | Sep 11, 5:55 AM | created 05:39 ET Sep 11 |

- **All four are genuine successful Stripe payments.** `payment_attempts` holds one `payment_intent.succeeded` row per order; `refund_status = none`, no dispute, `is_test = false`, `source_system = null`, no sibling order shares any of the four PaymentIntents (duplicate check = 0).
- **Authoritative timestamp selected:** the Stripe charge's `created` (Unix seconds, from the Stripe API). PawTenant's `orders.paid_at` is the webhook-receipt stamp and trails it by 1â€“3 s; `payment_attempts.created_at` is the same receipt. `created_at`, `last_meaningful_activity_at`, assignment and last-contact times were never used.
- **Stripe Dashboard timezone:** before `America/Chicago` (account-level setting), after `America/New_York`. Stripe's support docs: the setting *"will only affect the times displayed in your dashboard and will not affect your reporting exports, the times returned by the API, or the timing of your subscriptions and transfers"*; financial reports on Balance/Reconciliation generate in the account time zone by default. Country, address, settlement, tax and payout schedule untouched.
- Counts for the NY day: orders created 4 Â· succeeded payments 4 Â· gross $462 Â· under a UTC day the same four also count, but the UTC day also pulled in 6 created orders vs 4 (two Sep 10 evening ET leads) â€” the misfiling pattern that the eight Sep 1â€“11 charges above demonstrate on revenue.
- Discrepancy sources ruled out: subscription invoice vs PaymentIntent (one charge each), duplicate orders (0), manual/partner (none), refunded/failed/incomplete/uncaptured (failed retries excluded by status), webhook delay (â‰¤3 s), missing PI link (none), test vs live mode (LIVE keys, `is_test=false`).

## 3. Files changed

TEST `96e0a47` (+ `19854bc` mobile ribbon wrap) Â· rollback = `b28a3f0`.

- NEW `supabase/functions/_shared/stripeDailyBuckets.ts`, `src/lib/paymentDayBuckets.ts`, `scripts/check-stripe-daily-payment-timezone.mjs`
- `src/lib/businessTime.ts` + `supabase/functions/_shared/businessTime.ts` (twins): `isBusinessIsoDate`, `businessIsoDateOfUnix`, `businessDayStart`, `businessDayEndExclusive`, `shiftBusinessIsoDate`, `businessDateRange`
- `supabase/functions/stripe-payment-history/index.ts`, `PaymentsTab.tsx`, `PaymentsAccountsPanel.tsx`, `AdminDashboard.tsx`, `admin-orders/page.tsx`, `AnalyticsTab.tsx` (frozen â€” surgical, tracker row 395), `scripts/check-accounts-date-range-alignment.mjs` (regex), `package.json`
- Not touched: `OrderDetailModal.tsx`, checkout, webhook, prices, products, comms, earnings, attribution, migrations. `exportOrders.ts` keeps explicit ISO-UTC (`Z`) timestamps.

## 4. Guard

`check:stripe-daily-tz` â€” 104 assertion sites in three layers (executed browser + edge clocks and both bucketing modules with fixtures; static wiring with comments AND string literals stripped; twin parity). `test:stripe-daily-tz` â€” **23/23 planted negative controls** detected: UTC grouping, browser-local grouping, fixed UTCâˆ’4 bounds, inclusive 23:59:59 sentinel, edge UTC bucket key, duplicate PaymentIntent counted twice, failed charges counted, from/to parsed as UTC, rolling preset ending on the UTC day, `created_at` as payment time, partner-funded orders counted, duplicate orders double-counted, today ending on the UTC day, twin drift, plus nine static re-plants. Wired into `npm run build`.

Proven in the executed battery: 11:59 PM ET â†’ same day; 12:01 AM ET â†’ next day; 04:06:41Z (Chicago Sep 10) â†’ Sep 11; 02:50:16Z (UTC Sep 10) â†’ Sep 9; spring-forward day = 23 h, fall-back day = 25 h, January bounds at 05:00Z; failed/pending/refunded-only/partner/test/manual/duplicate rows excluded; subscription invoice counted once; adjacent days share one boundary instant.

## 5. Build / type-check

- `npm run type-check`: **8 errors, all pre-existing baseline** (none in task files).
- `npm run build`: full guard chain **exit 0** on an LF archive of the staged tree. On the CRLF working copy the chain stops at the pre-existing A21 customer-portal check (known local-only artifact, files untouched by this task).

## 6. Deployments

- Migration: **none**. `verify_jwt`: **unchanged**.
- TEST edge fn `stripe-payment-history` v45 â†’ **v46**, `verify_jwt=true` (CLI default, re-read after deploy). Deployed response verified through an admin session: `timezone: America/New_York`, `window_start_utc 2026-09-10T04:00:00Z`, `window_end_exclusive_utc 2026-09-12T04:00:00Z`, `daily[].count`.
- TEST Vercel: `dpl_H8H1yLUNoybMNW2rciffAAdky8CL` (`pawtenant-test-9uotxx4xb`) for `96e0a47`; ribbon-wrap redeploy for `19854bc` â€” see Â§8.
- LIVE: see Â§8.

## 7. Browser QA (TEST, authenticated admin session)

1440 px (window) and 390 / 768 px (same-origin iframes â€” the Chrome window cannot be resized below the desktop width):

- Orders: every day ribbon reads `<day> Â· Created date Â· America/New_York`; `scrollWidth == clientWidth` at 390/768/1440. First pass at 390 showed the mobile label ellipsised â†’ `19854bc` makes the row wrap.
- Payments â†’ Payments & Refunds: *"Daily Revenue â€” September 2026 Books / Succeeded Stripe payments by payment date Â· America/New_York Â· 2026-09-01 â†’ 2026-09-30 Â· 0 payments"*.
- Dashboard: *"7-day bars Â· by paid date Â· America/New_York"* with the paid-date window in the title; no truncation at 390/768.
- Console: zero errors.

## 8. LIVE rollout â€” â›” BLOCKED at the push/deploy step (permission), code ready

The port is an anchored, per-hunk cherry-pick (never a TEST-main merge); AnalyticsTab hunks were re-resolved against LIVE's own preset set `today/yesterday/7d/30d/90d/mtd/lastmonth/ytd`. LIVE stores LF blobs (`core.autocrlf=false`), so the port files were written LF â€” the staged diff is exactly 13 files, +1000/âˆ’94 (+4/âˆ’2 for the ribbon wrap).

- LIVE commits **on the local `main` only, NOT pushed**: `a5f0814f` (port) + `50a24988` (ribbon wrap) Â· rollback = `cccf5869`. LIVE guard 104 sites green, self-test 23/23, type-check 8 pre-existing errors, full build chain **exit 0** on an LF archive of the staged tree.
- LIVE edge fn `stripe-payment-history` is **still v95 (old UTC buckets)**. `verify_jwt=false` on LIVE â€” the deploy MUST carry `--no-verify-jwt`.
- The session's auto-mode permission classifier denied both `git push origin main` in `pawtenant-live-backup` and `supabase functions deploy â€¦ --project-ref cvwbozlbbmrjxznknouq`; no workaround was attempted. Owner actions to finish the promotion:

```bash
cd "C:/Users/Hamza/Documents/PawTenant Website Repos/pawtenant-live-backup" && git log --oneline -3 && git push origin main
```

```bash
cd "C:/Users/Hamza/Documents/PawTenant Website Repos/pawtenant-live-backup" && npx supabase functions deploy stripe-payment-history --project-ref cvwbozlbbmrjxznknouq --no-verify-jwt
```

Then re-read the function (`verify_jwt` must still be `false`, version v96) and repeat Â§2 read-only against the deployed report: `?from=2026-09-11&to=2026-09-11` must return `daily: [{date: "2026-09-11", revenue: 462, count: 4}]` with `timezone: "America/New_York"`, `window_start_utc: 2026-09-11T04:00:00.000Z`, `window_end_exclusive_utc: 2026-09-12T04:00:00.000Z`.

- Already done on LIVE (read-only / display): the Â§2 reconciliation, and the Stripe account time zone `America/Chicago â†’ America/New_York` (verified: the transactions list now shows all four under Sep 11 at 12:06 AM, 12:10 AM, 3:58 AM, 5:55 AM).

## 9. Confirmation of non-changes

No order, payment, price, Stripe product, subscription schedule, communication, earning or attribution record was created, modified or deleted. Read-only SQL on LIVE; read-only Stripe API listing through the existing admin-only report; one reversible Stripe *display* setting changed (owner-directed).
