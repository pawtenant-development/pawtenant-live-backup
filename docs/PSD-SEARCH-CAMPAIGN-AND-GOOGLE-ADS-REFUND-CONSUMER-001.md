# PSD-SEARCH-CAMPAIGN-AND-GOOGLE-ADS-REFUND-CONSUMER-001

**Status: PARTIAL** — full preflight, evidence and design complete for both phases. **No Google Ads mutation and no code change were made.** Phase A construction and Phase B consumer implementation remain.

Report time: **2026-08-04 10:53 America/New_York** (19:53 PKT).

---

## 0. Preflight

| Item | Value |
|---|---|
| TEST repo | `main`, HEAD `1a75c3b`, clean, origin 0/0 |
| LIVE repo | `main`, HEAD `8f9ce7e`, clean, origin 0/0 |
| Google Ads account | Paw Tenant, 248-085-3323, ocid `1628176789` |
| Search – ESA High Intent | campaignId `22472726576`, **Enabled, Eligible, PKR85,000/day**, opt score 85.2% |
| Search – Pawtenant Brand | PKR1,000/day (unchanged) |
| Search – ESA Competitors | PKR15,000/day, 0 impressions |
| Search – ESA Housing Issues | PKR9,302/day, 0 impressions |
| Ad group 5 – PSD Services | adGroupId `198437547798`, Enabled, Eligible |
| Ads timezone | (GMT-04:00) Eastern |

### Concurrency

Change History showed **manual web-client changes by `info@pawtenant.com` at 09:39:13, 09:41:49 and 09:46:42 ET today** — campaign assets created/changed on Search – ESA High Intent — plus an Ask Advisor chat left open mid-conversation. Owner confirmed the account was then clear. Per owner decision those assets are **left entirely alone**: not modified, not removed, not cloned into any new campaign. They are pre-existing state, not part of this task.

### Correction to a previous session's note

A prior task recorded the Google Ads UI as "renders chrome but not data grids", and speculated about a browser blocker. **That was wrong.** The actual behaviour is that a *hard URL navigation* into the Ads SPA shows the loading splash for ~15–25s before the grid paints; waiting long enough (or navigating via in-app menu clicks) renders everything correctly. Campaigns, keywords, ad groups and Change History all read cleanly this session. No extension was involved.

---

## 1. Phase A — PSD campaign: evidence complete, NOT built

### Landing page — VERIFIED and approved

`https://pawtenant.com/how-to-get-psd-letter`

- host `pawtenant.com`, non-www, **no redirect hop**
- title "PSD Letter Guide: Psychiatric Service Dog Evaluation"; canonical self-referencing; `index, follow` (this is an SEO page, unlike the noindex ESA housing LP)
- PSD content confirmed; **no ESA-housing mismatch**
- prices $115 / $129 / $149 / $135 — consistent with `src/config/pricing.ts`
- mobile 390px: **no horizontal overflow**, 9 visible PSD-assessment CTAs, **zero console errors**

**Attribution — checked, and it holds.** Only 3 of 11 funnel links carry query-string attribution (the shared navbar links); the 8 in-page body CTAs are bare `/psd-assessment`. That looked like the defect class repaired on the ESA housing page, so it was tested against production data rather than assumed:

> 77 leads landed on `/how-to-get-psd-letter` in 60 days — 68 with `gclid`, 59 with `gbraid`, 71 with a keyword, 42 paid, **39 of 42 paid orders carry a click ID (93%)**.

Attribution is carried by the sessionStorage attribution store, not the URL, so the bare CTAs do **not** break it. Not a blocker; noted only as a robustness gap (URL params would be a useful fallback). No page change made — the task forbids creating/modifying pages here.

`"psychiatric service dog documentation"` points at a **different** page, `/all-about-service-dogs`. Flagged; it would need its own verification before being carried into a PSD campaign ad group.

### Ad group 5 – PSD Services — L30 (Jul 5 – Aug 3, ET)

Ad-group totals: **445 clicks · 5,559 impr · 8.01% CTR · PKR1,673 avg CPC · PKR744,635 cost · 42.00 conv · PKR17,729 cost/conv · conv value 1,763,080**

| Keyword | Match | Status | Clicks | Cost PKR | Conv | Cost/conv | Backend L90 paid / rev | Decision |
|---|---|---|---|---|---|---|---|---|
| `"service dog letter"` | Phrase | Eligible | 153 | 289,531 | 15.50 | 18,679 | 14 / $1,756 | **KEEP** — top volume + top backend revenue |
| `[psd letter]` | Exact | Eligible | 62 | 113,967 | 9.00 | 12,663 | 14 / $1,617 | **KEEP** — core term |
| `"how to make a pet a service animal"` | Phrase | Eligible | 52 | 78,803 | 7.00 | 11,258 | 7 / $869 | **KEEP** — 63.6% backend rate |
| `"psychiatric service dog documentation"` | Phrase | Eligible | 22 | 52,022 | 2.00 | 26,011 | 2 / $308 | KEEP, but verify `/all-about-service-dogs` |
| `[service dog registration]` | Exact | Eligible | 31 | 44,273 | 2.00 | 22,137 | 2 / $278 | **KEEP** — see negatives note |
| `[psychiatric service dog housing letter]` | Exact | Eligible | 17 | 36,136 | 2.50 | 14,455 | 3 / $338 | **KEEP** — housing intent |
| `"psychiatric service dog letter online"` | Phrase | Eligible | 26 | 30,979 | 4.00 | 7,745 | 4 / $566 | **KEEP** — best cost/conv |
| `"service dog letter for landlord"` | Phrase | Eligible | 14 | 19,991 | 0 | — | 0 | OMIT — spend, no orders |
| `[psychiatric service dog evaluation]` | Exact | Eligible | 7 | 10,254 | 0 | — | 0 | OMIT |
| `[psd housing letter]` | Exact | Eligible | 7 | 8,458 | 0 | — | 1 / $120 | Borderline — keep Exact |
| `"federal service animal registration"` | Phrase | Eligible | 5 | 2,517 | 0 | — | 0 | OMIT |
| `"ada service dog registration"` | Phrase | Eligible | 2 | 394 | 0 | — | 0 | OMIT |
| `[how to make your dog a service dog]` | Exact | Eligible | 2 | 1,058 | 0 | — | 0 | OMIT |
| `"how to make my dog a service animal"` | Phrase | Eligible | 1 | 644 | 0 | — | 0 | OMIT |
| `"psd letter for dog"` | **Phrase** | Eligible | **0** | **0** | 0 | — | **0** | **KEEP as Phrase** (owner instruction; zero traffic to date) |
| `"psychiatric service animal letter"` | Phrase | **Paused** | 32 | 41,523 | 0 | — | 0 | Leave paused |
| `[psychiatric service dog letter]` | Exact | **Paused** | 0 | 0 | 0 | — | **3 / $299** | **RE-ENABLE** — paused despite 60% backend rate |
| `[psd letter online]` | Exact | **Paused** | 0 | 0 | 0 | — | **5 / $558 (100%)** | **RE-ENABLE** — paused despite 5/5 backend |
| `"are online psd letters legit"` / `"online psd letter service"` / `"where to get a psd letter"` / `"psd letter service near me"` | Phrase | Not eligible (low search volume) | 0 | 0 | 0 | — | 0 | OMIT |

Two paused Exact keywords (`[psd letter online]`, `[psychiatric service dog letter]`) have **real backend paid orders** and zero Ads-side cost — the strongest add candidates for the new campaign.

**Ad-group structure decision:** the data supports **one consolidated PSD ad group**. Housing-specific PSD terms are only `[psychiatric service dog housing letter]` (2.5 conv) and `[psd housing letter]` (0 conv) — too thin for a distinct group, and splitting would fragment an already-small conversion pool under Maximize conversion value. Recommend a single "PSD Core" ad group; revisit after the 7-day review.

**Negatives:** do **not** blanket-add `registration`. `[service dog registration]` Exact produced **2 backend paid orders / $278** (L30) and 31 clicks — it converts. A `registration` negative would suppress it. Registration-related queries must be reviewed individually.

### Budget observation the owner should see

PSD currently consumes **PKR 744,635 / 30 days ≈ PKR 24,821/day** — **34%** of campaign spend (campaign L30 = PKR 2,191,359 ≈ PKR 73,045/day). The prescribed pilot split is PSD 15,000 / ESA 70,000, i.e. **PSD spend drops ~40%** while ESA rises. That is a legitimate controlled-pilot choice, but it is a reduction in PSD investment, not a like-for-like carve-out. Flagged, not changed.

### Why Phase A was not built

The existing `google-ads-campaign-builder` edge function is purpose-built for exactly this (`validate` → `save_draft` → `approve_draft` → `apply_paused`, and by design creates **PAUSED Search campaigns only**, never enabling or editing budgets). It cannot be used here: its `ALLOWED_BIDDING_STRATEGIES` is `{MAXIMIZE_CONVERSIONS, MAXIMIZE_CLICKS, TARGET_CPA}` and `index.ts` only emits `targetSpend` or `maximizeConversions`. **Maximize conversion value is not supported.** Using it would silently create the campaign on the wrong bidding strategy — which the task explicitly forbids.

So Phase A must be built in the Ads UI (or the builder extended first, TEST-first, which is its own task).

---

## 2. Phase B — refund adjustment consumer

### Root cause

The architecture already exists and is well hardened. What does **not** exist is a **recurring producer/consumer**:

- Enqueueing into `google_ads_conversion_adjustments` only happens on a **manual** `ingest`/`reconcile` invocation. The ledger was last built **2026-07-25**; the latest refund is **2026-07-31**.
- The only path that can reach Google is `single_canary`, which sends **exactly one** allow-listed row (`CANARY_MAX_OPERATIONS = 1`). Modes `single` and `batch` are **permanently refused with 501** by design.
- Live mutation requires three env gates simultaneously: `GOOGLE_ADS_MUTATIONS_ENABLED`, `GOOGLE_ADS_REFUND_CANARY_ENABLED`, and `GOOGLE_ADS_REFUND_CANARY_ADJUSTMENT_ID` (single-row allow-list).

Net effect: **1 adjustment has ever been uploaded**, and refunded purchases keep sitting at full value inside Google Ads, feeding Maximize conversion value bidding.

### Authoritative identifiers — PROVEN, not assumed

- **Conversion action ID: `7567366496`** — single, consistent across all 21 ledger rows (Pawtenant Backend Purchase (API)).
- **Google `order_id` = PawTenant confirmation ID.** Proven from the ledger: `original_order_or_transaction_id` equals `confirmation_id` on every row (e.g. `PT-MQV920J7`, `PT-PSDYLS48MJB`). Not email, not phone, not DB UUID.

### Current reconciliation (recalculated 2026-08-04)

23 refunded orders. 21 enqueued, **2 not enqueued**.

| Ledger status | n | Original | Refunded | Meaning |
|---|---|---|---|---|
| `dry_run_ready` RETRACTION | **6** | $680 | $700 | Owed, ready to upload |
| `blocked_original_not_uploaded` | 12 | $1,317 | $1,337 | Correctly excluded — original conversion never uploaded |
| `skipped_no_effective_reduction` | 2 | $148 | $60 | Correctly excluded — overcharge corrections; retained revenue still ≥ uploaded value |
| `uploaded` RETRACTION | 1 | $99 | $99 | Prior canary |

The 6 pending retractions (all **full** refunds, retained value $0, currency USD, conversion action `7567366496`):

| Confirmation ID | Original | Refunded | Charged | Adjustment date (ET) |
|---|---|---|---|---|
| PT-MQV920J7 | $135 | $135 | $135 | 2026-06-26 |
| PT-PSDYLS48MJB | $109 | $109 | $109 | 2026-07-09 |
| PT-MRGR9PZC | $89 | $89 | $89 | 2026-07-12 |
| PT-MROZD5BT | $109 | $109 | $109 | 2026-07-17 |
| PT-MRF1ECR0 | $129 | $149 | $149 | 2026-07-20 |
| PT-MRWRTX4N | $109 | $109 | $109 | 2026-07-22 |

All six carry `value_provenance_weak = true` and `source_refund_count = null` — worth tightening when the consumer is built.

**Partial refunds: currently zero pending RESTATEMENTs in the ledger.**

### The 2 un-enqueued refunds — both partial, classification pending

| Confirmation ID | Price | Refund | Refund date (ET) | Original upload | Naive expectation |
|---|---|---|---|---|---|
| PT-MRFW18C0 | $89 | $20 | 2026-07-27 | uploaded 2026-07-11 | RESTATEMENT → $69 |
| PT-PSDAEUFNWO1 | $129 | $50 | 2026-07-31 | uploaded 2026-07-28 | RESTATEMENT → $79 |

**Do not treat these as two confirmed adjustments.** An existing `skipped_no_effective_reduction` row has the *identical shape* ($89 original / $20 refund) and was correctly classified as an overcharge correction owing nothing. Whether these two are owed depends on the charge-basis rule (`charged_amount` / `true_retained_revenue` / `charge_basis_known`) that only the ingest pass applies. They must be classified by running ingest, not by assumption.

### Existing assets to build on (do not duplicate)

- Table `google_ads_conversion_adjustments` — already has `idempotency_key`, `attempt_count`, `next_attempt_at`, `last_attempt_at`, `google_request_id`, `google_job_id`, `supersedes_adjustment_id`, `last_error_code`, `last_error_message_safe`, `source_refund_ids_hash`, charge-basis columns. **A new queue table is not needed.**
- Table `google_ads_conversion_uploads` — original upload provenance.
- Function `google-ads-refund-adjustments` (633 lines) — modes `dry_run` (default) / `reconcile` / `ingest` / `single_canary`; `single`/`batch` refused 501.
- Migrations: shadow ledger, charge basis, harden grants, upload provenance, adjustment request id, uploaded immutability, status service_role.
- Guards: `check-google-ads-refund-adjustment.mjs`, `check-refund-consumer-guard.mjs`.

---

## 3. What was NOT done

- **No Google Ads mutation of any kind.** No campaign, budget, ad group, keyword, ad, negative or setting was created or changed. Change History carries no entry from this task.
- **No code change, no migration, no function deploy, no cron change.** TEST and LIVE remain at `1a75c3b` / `8f9ce7e` (this doc aside).
- No canary upload; no historical replay.

Preserved by construction: ESA High Intent at PKR85,000/day and all its settings; Brand at PKR1,000/day; affordability cross-negatives; `"psd letter for dog"` as Phrase; Backend Purchase API as sole Primary; ESA/PSD Dynamic Secondary; Lead Form outside bidding; repaired ESA Housing page.

---

## 4. Exact next task

**Phase B first** (it corrupts bidding data for every campaign, including the PSD one, and is the smaller build):

1. In TEST: extend `google-ads-refund-adjustments` with a bounded recurring `batch` consumer replacing the 501 — atomic claim via `next_attempt_at`/`status`, per-row `idempotency_key`, bounded exponential backoff, explicit retryable vs permanent classification, no `catch {}`, no PII in logs. Keep the triple env gate; add a max-operations cap.
2. Add the hourly cron in the existing PawTenant cron architecture; preserve `verify_jwt` (deploy with `--no-verify-jwt`).
3. Build the 14 fixture scenarios (A–N), including the two real partial-refund shapes above and the overcharge-correction case that must produce **no** adjustment.
4. Re-run `ingest` so the 2 un-enqueued refunds are classified by the real rule.
5. TEST typecheck + build + guards; commit; then surgical LIVE deploy.
6. Canary one full-refund row (recommend **PT-MQV920J7**, oldest, cleanest full refund), verify `google_request_id`/`google_job_id` persisted and no duplicate, then release the remaining batch.

**Then Phase A** in the Ads UI: build `Search – PSD High Intent` **Paused** (Maximize conversion value, no tROAS, Search only, Partners/Display off, AI Max/Final URL expansion/Text customization off, US presence-only, English, no audiences, one consolidated PSD ad group, keywords per the table above including re-enabling the two paused Exacts, `/how-to-get-psd-letter`), verify eligibility, then the single activation batch: enable PSD @ PKR15,000 → ESA to PKR70,000 → pause Ad group 5 (`198437547798`) → verify combined = PKR85,000 and Change History.

Rollback values if Phase A is later executed: ESA budget PKR85,000/day; Ad group 5 id `198437547798` (re-enable); new PSD campaign → pause.
