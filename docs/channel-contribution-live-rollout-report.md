# ACCOUNTS-CHANNEL-CONTRIBUTION-LIVE-ROLLOUT-001 — LIVE rollout report

**Status:** `LIVE ROLLOUT COMPLETE — CHANNEL CONTRIBUTION VERIFIED` (Google Ads spend sync remains manual, unchanged).
**Owner-approved.** Ported from approved TEST commits `ccc7d46` (feature) + `be37ecc` (docs) + RPC `get_channel_contribution_orders`.
**LIVE baseline SHA at start:** `3913bc3` (= origin/main, clean, 0/0).
**LIVE Supabase:** `cvwbozlbbmrjxznknouq`.

## 1. What rolled out
- The Channel Contribution section inside the LIVE Accounts view (Payments tab → Accounts), beneath the main P&L summary.
- Owner-approved navigation change: the Payments subtabs are reordered to **Accounts → Payments & Refunds → Reconciliation Tool**, and **Accounts is the default** subtab when the Payments area opens.

## 2. Preflight + divergence audit
- LIVE `main`, HEAD = origin/main = `3913bc3`, 0/0, no merge/rebase/cherry-pick/bisect/lock, only unrelated other-session `docs/*.md` untracked (left untouched).
- **`acquisitionClassifier.ts` is byte-identical** TEST↔LIVE after CRLF normalization (0 real diff lines); the `AcquisitionLabel` union is identical (25 members) and `canonicalChannelToLabel` matches → the ported `channelContribution.ts` behaves identically on LIVE.
- New files absent in LIVE (clean copies): `channelContribution.ts`, `ChannelContributionPanel.tsx`, `check-channel-contribution.mjs`. `orderFinancials.ts` is absent in LIVE but **not needed** (money is computed in the RPC; the panel/lib never import it). `supabaseClient.ts`, `providerPaymentExport.ts` present.

Port map:
| TEST object | LIVE action | Result |
|---|---|---|
| `channelContribution.ts` | copy | added (classifier identical) |
| `ChannelContributionPanel.tsx` | copy | added |
| `check-channel-contribution.mjs` | copy + wire into build | added |
| `PaymentsTab.tsx` | surgical: import + mount + default→accounts + subtab reorder | edited |
| `package.json` | surgical: build guard + check:/test: scripts | edited |
| `get_channel_contribution_orders` RPC | apply migration to LIVE | applied |

## 3. Backend (LIVE DB verification before apply)
All confirmed on LIVE `cvwbozlbbmrjxznknouq`:
- `is_accounts_admin()` **exists** and is a real gate: `doctor_profiles.is_admin OR role IN (owner,admin_manager,finance)` — identical behavior to TEST.
- Every referenced column exists with matching types (orders price/refund_amount int, attribution_json/first_touch_json/last_touch_json jsonb, gclid/fbclid/utm_*/referred_by/landing_url, paid_at, doctor_status, id/confirmation_id; doctor_earnings order_id uuid / doctor_amount int / status; marketing_ad_spend_daily platform/spend_date/spend_amount/currency).
- Money units identical (USD dollars integer). Google Ads spend present (`platform='google_ads'`, 201 rows).
- RPC applied via migration `20260723120000_add_get_channel_contribution_orders.sql` — additive (create-or-replace + grant), read-only, `security definer`, `is_accounts_admin()`-gated, reversible (drop function). Gate verified: unauthenticated call → `42501 not authorized`.

## 4. Contract preserved (unchanged from approved TEST)
Gross = orders.price; Net = gross − refunds; Provider = patient_notified ? Σ non-cancelled doctor_earnings.doctor_amount : 0 (completed-then-refunded retained; incomplete = 0). Contribution stops **before Stripe fees** (no order-level fee exists) and is never called profit. Ad spend (synced Google Ads only, PKR→USD @ 280) attaches to the Google Ads leaf only. No Stripe/order/earning/ad-platform mutation. No new cron (manual Sync-now path preserved).

## 5. LIVE data audit + reconciliation (all-time, 438 paid orders)
| Category | Orders | Gross | Refunds | Net | Provider | Ad Spend | Contribution |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Paid Media | 203 | $21,988 | $1,169 | $20,819 | $5,370 | $11,308 | $15,449 |
| — Google Ads | 164 | $18,187 | | $17,117 | $4,350 | $11,308 | $12,767 |
| — Other Paid Media | 39 | $3,801 | | $3,702 | $1,020 | $0 | $2,682 |
| Organic | 124 | $12,763 | $892 | $11,871 | $3,310 | $0 | $8,561 |
| — Organic Search | 78 | $8,168 | | | | | |
| — Direct | 34 | $3,407 | | | | | |
| — Referral | 2 | $245 | | | | | |
| — Other Organic | 10 | $943 | | | | | |
| Organic AI | 42 | $4,257 | $135 | $4,122 | $1,205 | $0 | $2,917 |
| — ChatGPT | 42 | $4,257 | | | | | |
| Unknown / Unattributed | 69 | $6,922 | $0 | $6,922 | $1,820 | $0 | $5,102 |
| **All Channels** | **438** | **$45,930** | **$2,196** | **$43,734** | **$11,705** | **$11,308** | **$32,029** |

Reconciliation: `match=true`, `balanced=true`, all deltas 0 — categories + Unknown reconcile to company totals exactly.
Attribution quality: **84.25% attributed** (verified 239 + strong 130), **15.75% Unknown** (69), conflicting/weak 0. Real ChatGPT revenue ($4,257) and real Google Ads spend ($11,308) both surface correctly. No PII in the aggregate output.

## 6. Validation
- Guard `check-channel-contribution.mjs` on LIVE: 25 logic + all static invariants pass; self-test 6/6.
- Lint: clean. Full `npm run build`: pass (guard wired in; no regressions).
- Tab reorder is `useState`-only (no inner-subtab URL contract to preserve); refresh lands on the valid default; the accounts/payments views already share range state, so Payments & Refunds and Reconciliation Tool remain fully functional.

## 7. Marketing ROI & Sync Health (owner scope addendum)
The TEST-only `Marketing ROI & Sync Health` section was missing from LIVE and was ported in this same rollout, mounted beneath `Marketing Spend & ROI` (MarketingSpendPanel) in the Accounts view.

- **Frontend:** `MarketingROIHealthPanel.tsx` ported **verbatim** from approved TEST — the only diff (CRLF-normalized) is one mandatory icon-subset swap `ri-microsoft-fill → ri-microsoft-line` (`ri-microsoft-fill` is absent from LIVE's committed remixicon subset; all other glyphs present). The 1 pre-existing `react-hooks/exhaustive-deps` warning is identical on TEST and does not gate the build (`npm run build` runs no lint).
- **Backend:** applied RPC `get_marketing_roi_health(date,date)` to LIVE via migration `20260617120000_add_get_marketing_roi_health.sql` — `security definer`, `is_accounts_admin()` gate (verified: unauthenticated → 42501), `grant … to authenticated`; read-only aggregate. Deps verified on LIVE: `marketing_ad_spend_daily`, `marketing_ad_spend_sync_runs` (all columns), `orders.created_at`; `msclkid` read via `attribution_json` (JSON-only, as on TEST).
- **Behavior preserved:** revenue/orders from PawTenant order data; spend from synced platform data (never platform conversion value); Google + Meta synced spend reduce Operating Net; **Microsoft stays `Pending OAuth`, $0 spend, excluded from Operating Net** (never fabricated); manual `Sync now` unchanged, no new cron; no credential/campaign/bid/budget/keyword/conversion-action changes.
- **LIVE data (all-time):** Google Ads spend $11,562 / 163 paid / $18,047 rev; Meta $3,956 / 37 / $3,596; Microsoft $0 / 0 / $0 (Pending OAuth); platform revenues reconcile to total gross ($18,047 + $3,596 + $0 + $24,287 other = $45,930). (This panel's simpler google/meta/microsoft/other classification is independent of the Channel Contribution taxonomy — each reconciles to its own totals.)

## 8. Rollback
Revert the LIVE commits to return to `3913bc3`; drop `public.get_channel_contribution_orders(date,date)` and `public.get_marketing_roi_health(date,date)` to remove the RPCs (both additive/read-only — safe to leave or drop).
