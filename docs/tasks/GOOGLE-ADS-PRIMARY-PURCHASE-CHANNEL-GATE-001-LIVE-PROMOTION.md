# GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001-LIVE-PROMOTION

**Status:** see the closeout section at the bottom (updated after deployment and verification).
**Source (TEST):** `aa34a84` (acquisition-channel eligibility gate) + `17820e3` (invocation authorization closure) — ported together, surgically, onto LIVE `origin/main` `c46450e6`. No other TEST commit (`809375a`, `d1a05d9`, ESA Housing work, 24-hour delivery) is included.
**LIVE base:** `c46450e6752eb7a8620387f99c0be45df9cb3ed0` (customer-portal letter-view recovery). Every later LIVE fix is preserved untouched.
**Edge function:** `sync-google-ads-conversions` LIVE **v87 → v88**, `verify_jwt=true` before and after.
**Migrations:** none. **Supabase secrets:** none added (`GOOGLE_ADS_CRON_SECRET` deliberately unset ⇒ the cron-secret branch is disabled).
**Rollback:** git `c46450e6` + edge function v87 + Vercel `dpl_EnNiqX87Zt5tQ2dxyM6uujGe1Yqi` (`pawtenant-production-hh0e5mkiq`).

---

## What ships

### 1. Acquisition-channel eligibility gate (from `aa34a84`)
`supabase/functions/sync-google-ads-conversions/channelGate.ts` → `resolveGoogleAdsChannelEligibility(order)` → `eligible | excluded | conflict`. The predicate is byte-for-byte the TEST predicate:

- canonical first touch (`orders.first_touch_json`, fallback `attribution_json.first_touch`) is authoritative;
- `google_ads` first touch qualifies only with a proven (`click_provenance="url"` or legacy no-provenance) first-touch `gclid`/`gbraid`/`wbraid`, or an explicitly paid medium (`cpc, ppc, paid, paidsearch, paid-search, paid_search, sem, ads, searchad, search-ad, search_ad` — **not widened**);
- a legacy order with no first touch qualifies only on a flat click id or `utm_source=google` + paid medium;
- every explicit non-Google channel (organic, direct, referral, Meta, paid social, email, AI referral, unknown) is excluded; `utm_source=google` with a non-paid medium is excluded;
- a Google click id contradicting a non-Google channel, an unproven storage-restored click id, or contradictory first/last touch ⇒ `conflict` (never uploaded, flagged for review);
- the last-touch `attribution_json.channel` can refuse or flag, never grant.

Wiring in `index.ts`: `partitionByChannelGate()` runs in `single` (the stripe-webhook payment path), `backfill`, `retry_failed`, `retry_gclid_upgraded` **before** the lazily-acquired OAuth token (`ensureAccessToken()`); `test_upload` picks the newest paid order that passes the gate before requesting a token; `processOrder()` re-runs the gate as defence in depth before any identifier resolution, email hashing, payload or Google call. `forceUpload` never touches the decision. A skip writes `google_ads_upload_status = skipped_non_google_channel | skipped_attribution_conflict`, `google_ads_upload_error = <reason token>`, `google_ads_upload_method = excluded` — never `google_ads_uploaded_at`, never `google_ads_last_attempt_at`. Both skip statuses are excluded from the backfill selection (NULL-safe `.or()`) and from the Sync Health pending count.

### 2. Invocation authorization (from `17820e3`)
`supabase/functions/sync-google-ads-conversions/invocationAuth.ts` → `authorizeInvocation()` runs before order selection, hashing, OAuth, payload and any write:

| Caller | Result |
|---|---|
| no bearer | 401 `missing_bearer` |
| public anon key (valid project JWT, no identity) | 401 `not_an_authenticated_session` — every mode |
| forged/expired bearer | 401 |
| signed-in customer / provider | 403 `not_admin` |
| PawTenant admin (`doctor_profiles.is_admin` or role ∈ owner/admin_manager/support) | 200 for the 7 UI modes; 403 `mode_not_permitted_for_admin` for internal-only modes |
| service-role bearer (stripe-webhook) or capability-proven service credential | 200, all modes |
| unknown mode | 403 `unknown_mode` (never defaults to backfill) |
| `x-cron-secret` with no secret provisioned | branch disabled — never authorizes |
| bogus `x-cron-secret` | refused |

All 12 LIVE admin call sites (`GoogleAdsSyncPanel` ×8, `GoogleOAuthPanel` ×3, `UnifiedBackfillPanel` ×1) now send the admin's session JWT via the new shared `src/lib/adminFunctionAuth.ts` (`adminFunctionHeadersOrThrow()` — no anon-key fallback). The two remaining anon-key sites in `GoogleOAuthPanel` call different functions (`google-oauth-start`, `google-oauth-save-token`) and are out of scope, exactly as on TEST.

---

## LIVE divergence and the adaptations it forced

LIVE's uploader (v87, identical to the repo file) is materially different from TEST's: it has **no `lib.ts`**, no gbraid/wbraid upload support, no refund-adjustment consumer (`apply_refund_adjustments`), no API-version pin, and an extra read-only `inspect_conversion_action` mode. The port therefore could not be a file copy:

| Divergence | Adaptation | Contract impact |
|---|---|---|
| no `lib.ts` (`cleanClickId` lived there on TEST) | `channelGate.ts` inlines `cleanClickId` + `CLICK_ID_MACRO_RE`, byte-identical rule | none |
| no `apply_refund_adjustments` handler | kept **internal-only** in `invocationAuth.ts`; `index.ts` now refuses any known-but-unhandled mode (and `single` without a `confirmationId`) with HTTP 400 **instead of falling through into the default backfill** (pre-existing LIVE fall-through) | strictly safer |
| extra `inspect_conversion_action` mode (no Admin UI caller) | added to `INTERNAL_ONLY_MODES` | admin → 403, service role → 200 |
| `is_test` fixture bypass in TEST's `partitionByChannelGate` | dropped — LIVE's `processOrder` has no fixture bypass, so fixtures go through the gate too (fail closed) | none |
| `ORDER_SELECT_COLUMNS` | LIVE column set (no `is_test`, `stripe_gross_charged_cents`); still carries `first_touch_json, last_touch_json, utm_source, utm_medium, gclid, gbraid, wbraid` | none |
| `deno check` noise | baseline 15 errors (untyped supabase-js client ⇒ `never`), ported 27 of the same class — none in the new modules; identical construct on TEST | none |

Frontend files (`GoogleAdsSyncPanel`, `GoogleOAuthPanel`, `UnifiedBackfillPanel`, `SyncHealthCards`, `acquisitionClassifier`) were byte-identical to TEST's pre-task base, so the TEST patches applied cleanly (`git apply`).

---

## Files shipped

| File | Change |
|---|---|
| `supabase/functions/sync-google-ads-conversions/channelGate.ts` | new — predicate (TEST + inlined `cleanClickId`) |
| `supabase/functions/sync-google-ads-conversions/invocationAuth.ts` | new — fail-closed authorization (TEST + `inspect_conversion_action` internal-only) |
| `supabase/functions/sync-google-ads-conversions/index.ts` | gate wiring, lazy `ensureAccessToken()`, `ORDER_SELECT_COLUMNS`, skip persistence, authorization boundary, explicit-backfill refusal |
| `src/lib/adminFunctionAuth.ts` | new — session-JWT headers for admin-only edge function calls |
| `src/pages/admin-orders/components/GoogleAdsSyncPanel.tsx` | 8 call sites → session JWT; "Not Google Ads" / "Attribution conflict" pills + filter tab |
| `src/pages/admin-orders/components/GoogleOAuthPanel.tsx` | 3 sync call sites → session JWT |
| `src/pages/admin-orders/components/UnifiedBackfillPanel.tsx` | Google call → session JWT |
| `src/pages/admin-orders/components/SyncHealthCards.tsx` | pending-Google count excludes the skip statuses; NULL-safe `.or()` |
| `scripts/check-google-ads-primary-channel-gate.mjs` | new — 180 checks, 14 planted controls (LIVE-bounded `processOrder`, conditional refund-path assertion) |
| `scripts/check-google-ads-invocation-auth.mjs` | new — 296 checks, 16 planted controls (adds N16: unhandled known mode must not reach backfill) |
| `scripts/check-edge-function-modules.mjs` | uploader module graph registered |
| `package.json` | both guards in `npm run build`; `check:/test:google-ads-channel-gate`, `check:/test:google-ads-invocation-auth` |
| `docs/tasks/GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001-LIVE-PROMOTION.md`, `docs/PAWTENANT_MASTER_EXECUTION_QUEUE.md` | this record + registry row |

Not touched: frozen mega-files, any other edge function, migrations, Stripe, order attribution / first-touch data, Google Ads account settings, historical conversions.

---

## LIVE data preflight (read-only, 2026-09-04, before deployment)

643 paid orders (`payment_intent_id` set, status processing/completed). The **real** `channelGate.ts` was bundled with esbuild and executed offline against the gate columns of all 643 rows (no PII read):

| Gate result | Orders |
|---|---|
| eligible | **338** (335 `canonical_channel_with_first_touch_click_id`, 3 `legacy_flat_google_click_id`; all 338 click-id supported, 0 hashed-email-only) |
| excluded | **297** — organic_search 75, direct 52, chatgpt.com 42, facebook_ads 32, social_organic 11, claude.ai 1, no attribution evidence at all 84 |
| conflict | **8** (`non_google_channel_with_google_click_id`: organic_search / direct / facebook_ads / social_organic first touch carrying a Google click id) |

`utm_source=google` with a non-paid medium: 0 orders on LIVE.

Current upload state: uploaded 595 (`gclid_plus_hashed_email` 325, `hashed_email_only` 270) · NULL 18 · failed 13 · skipped_website_tag 12 · deferred_ecl_disabled 5 · refunded_pending_adjustment 1. Pending backlog (not uploaded, not terminally skipped) = 36 → 4 eligible / 32 excluded. All 13 failed rows are excluded by the gate. Refund-adjustment rows: 21 (12 blocked_original_not_uploaded, 6 dry_run_ready, 2 skipped_no_effective_reduction, 1 uploaded).

**Historical non-Google uploads (read-only, NOT retracted):** of the 595 uploaded orders, **256 are excluded** by the gate and **8 are conflicts** — 264 uploads that would not qualify today (direct 48, organic_search 67, chatgpt.com 41, facebook_ads 28, social_organic 12, claude.ai 1, no evidence 67). Left exactly as they are; retroactive retraction is a separate owner decision.

---

## Local proof

- `npm run check:google-ads-channel-gate` → **180 checks passed**; `--self-test` → **14/14** planted controls detected (gate removed, inverted, moved after hashing, paid-medium widened, non-Google admitted, backfill bypass, eager OAuth, skip statuses dropped from selection, fake upload timestamp, pending-count regression, later-touch grants, first-touch dropped from select, retry_failed/forceUpload bypass, storage click id trusted).
- `npm run check:google-ads-invocation-auth` → **296 checks passed**; `--self-test` → **16/16** (helper removed, inverted, anon JWT trusted, customer/provider as admin, internal-only opened to admins, forceUpload in the decision, authorization after hashing/OAuth, plain header as secret, empty-matches-empty, call site reverts to anon key, helper anon fallback, unknown mode → backfill, borrowed cron secret, unhandled mode → backfill (LIVE), plus the two cross-guard controls).
- `npm run type-check` → 8 errors, all pre-existing in untouched files (`AdminProviderContactPanel` 1, `AnalyticsTab` 1, `EmployeeHrDirectory` 5, `ProviderInternalRecords` 1); 0 in changed files.
- `npm run build` → exit 0 with both guards in the chain.
- Deployed-vs-repo drift check before editing: downloaded v87 == repo `index.ts` (0 diff lines).

---

## Closeout (deployment + LIVE verification)

_Filled in by the closeout commit after deployment._
