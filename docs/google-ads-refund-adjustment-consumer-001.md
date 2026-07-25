# GOOGLE-ADS-REFUND-ADJUSTMENT-CONSUMER-001 — LIVE shadow rollout

**Status:** LIVE SHADOW COMPLETE — zero Google Ads mutations sent.
**Date:** 2026-07-26 · **Environment:** LIVE (`cvwbozlbbmrjxznknouq`, repo `pawtenant-live-backup`)

---

## 1. Defect

PawTenant uploads paid orders to Google Ads (`sync-google-ads-conversions` →
`uploadClickConversions`, Backend Purchase API action, Primary for bidding).

When an order is refunded, `google_ads_upload_status` is set to
`refunded_pending_adjustment` — **and nothing ever consumes it.** Google therefore
keeps counting refunded revenue as retained revenue, and Smart Bidding optimises
toward it.

Two further defects were found during this task:

- **The marker is unreliable in both directions.** LIVE has orders marked
  `refunded_pending_adjustment` that were **never uploaded** (`google_ads_uploaded_at`
  is NULL), and fully-refunded uploaded orders that carry **no marker** at all.
  It also *overwrites* `google_ads_upload_status='uploaded'`, destroying the
  evidence it depends on. Partial refunds set **no marker whatsoever**, so partial
  refunds were entirely invisible.
  → The durable proof of upload is **`google_ads_uploaded_at IS NOT NULL`**. This
  system uses that and ignores the marker.

- **There is no durable record of the value actually uploaded.** The uploader
  writes an audit row with a `details` column that **does not exist** on
  `audit_logs` (it has `old_values`/`new_values`/`metadata`). The insert is wrapped
  in an empty `catch`, so it fails silently: **1** `google_ads_conversion_uploaded`
  audit row exists for **404** uploaded orders. See §12.

---

## 2. Verified Google Ads API contract (primary source)

From the v21 protobuf definitions in `googleapis/googleapis` — not from memory:

| Item | Contract |
|---|---|
| Service | `ConversionAdjustmentUploadService.UploadConversionAdjustments` |
| Endpoint | `POST customers/{customerId}:uploadConversionAdjustments` |
| Types | `RETRACTION`, `RESTATEMENT`, `ENHANCEMENT` |
| Partial refund | `RESTATEMENT` + `restatement_value.adjusted_value` = value the conversion should now have |
| Full refund | `RETRACTION` — removes the conversion. A restatement to 0 would keep the conversion **count** and still inflate volume-based bidding |
| Retraction payload | `restatement_value` **must not** be set — "An error will be returned if provided for a retraction" |
| Identification | **`order_id` only.** Err 24 `MISSING_ORDER_ID_FOR_WEBPAGE`; Err 20 `GCLID_DATE_TIME_PAIR_AND_ORDER_ID_BOTH_SET` — setting both is an error. PawTenant always uploads `orderId = confirmation_id`, so gclid/gbraid/wbraid are **irrelevant** to adjustments |
| Window (max) | Err 6 `CONVERSION_EXPIRED` — "more than **54 days** ago" |
| Window (min) | Err 9 `TOO_RECENT_CONVERSION` — conversion must be ≥ **24 hours** old |
| `adjustment_date_time` | Must be **after** `conversion_date_time`; `yyyy-mm-dd hh:mm:ss+|-hh:mm` (Err 7 `ADJUSTMENT_PRECEDES_CONVERSION`) |
| Duplicates | Keyed on `adjustment_date_time`: Err 13 `RESTATEMENT_ALREADY_EXISTS`, Err 8 `MORE_RECENT_RESTATEMENT_FOUND`, Err 14 `DUPLICATE_ADJUSTMENT_IN_REQUEST`. A second restatement needs a **strictly newer** occurrence time |
| Retraction is terminal | Err 4 `CONVERSION_ALREADY_RETRACTED` — **a retracted conversion can never be restated.** Partial-then-full must retract last |
| Currency | Defaults to conversion-action currency, then account currency. We always set `USD` explicitly |
| `user_identifiers` | Accepted **only** in `ENHANCEMENT`. We emit none — no hashed email leaves this system |
| Batch cap | Err 11 — fewer than 2001 per request. Our cap is **200** (default 50) |
| Partial failure | `partial_failure` must always be `true`; per-op errors in `partialFailureError.details[].errors[]` |

API version follows the uploader's `GOOGLE_ADS_API_VERSION` env (default `v21`) so
the two can never drift. **Note:** Google's docs now index v23–v25; confirming v21
is still supported is a canary prerequisite (§10).

---

## 3. Canonical financial rule — corrected

```
true_retained_revenue = amount_charged − cumulative_successful_refunds
google_target_value   = clamp(true_retained_revenue, 0, original_uploaded_value)
```

**The basis is the amount CHARGED, not the value uploaded.** The naive rule
(`uploaded_value − refund`) is wrong whenever they differ — and at LIVE they do.
Both real partial refunds are **coupon overcharge corrections**:

| Order | Uploaded | Charged | Refunded | Customer kept | Naive rule | Correct |
|---|---|---|---|---|---|---|
| PT-MRJKQA4X | 89 | 109 | 20 | **89** | restate → 69 ❌ | **no adjustment** ✅ |
| PT-MR1HX27H | 59 | 99 | 40 | **59** | restate → 19 ❌ | **no adjustment** ✅ |

Implementing the naive rule would have sent two incorrect restatements
**understating retained revenue by $60** and mis-training bidding. Both now
classify as `skipped_no_effective_reduction`.

The result is capped at the uploaded value so an adjustment can never *invent*
revenue Google was not already told about. Never deducted: provider cost, Stripe
fees, advertising spend. Coupons are already in the charge and are never deducted
twice. The core reads only charged / refunded / uploaded, so no other deduction is
structurally possible.

**Unproven charge basis:** a full refund may still `RETRACT` (removing a conversion
can never overstate revenue); a partial refund is **blocked**, never guessed.

---

## 4. LIVE dry-run result (2026-07-26)

21 candidates. **Zero adjustments uploaded.**

| Outcome | Count | Value |
|---|---|---|
| `dry_run_ready` → **RETRACTION** | **7** | $779 uploaded, $799 refunded |
| `skipped_no_effective_reduction` (overcharge corrections) | 2 | $148 uploaded, $60 refunded |
| `blocked_original_not_uploaded` | 12 | $1,317 uploaded-value equivalent |
| `blocked_outside_adjustment_window` | 0 | — |
| Proposed RESTATEMENTs | **0** | — |
| **`mutation_calls_sent`** | **0** | — |

**$779 of conversion value is currently over-credited to Google Ads** across 7
fully-refunded orders, all within the 54-day window (oldest 29.2d).

The 12 blocked orders were never uploaded (ECL-deferred, failed, or unattributed),
so there is no conversion to adjust — they are correctly *not* fabricated.

Example proposed payload (built, never sent):

```json
{"conversionAction":"customers/2480853323/conversionActions/7567366496",
 "adjustmentType":"RETRACTION",
 "adjustmentDateTime":"2026-07-23 00:59:10+00:00",
 "orderId":"PT-MRWRTX4N"}
```

---

## 5. Zero-mutation safety contract

1. **The shipped consumer contains no Google Ads mutation path.** No
   `googleads.googleapis.com`, no `uploadConversionAdjustments`, no `fetch(` at
   all. This is the strongest control: not a flag that could be flipped, but the
   *absence of the code*. Guarded by S01–S03.
2. **Kill switch** `GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED` must equal the exact
   string `"true"`. Unset = disabled. **Currently not set at LIVE → disabled.**
3. **Dry-run default** — an invocation with no `mode` runs `dry_run`.
4. **`single`/`batch` fail closed with 501**, even if the kill switch were enabled.
5. **No cron.** LIVE has 9 cron jobs; none reference this function.
6. **The Stripe webhook never calls Google Ads** and never invokes this consumer —
   refunds and checkout can never depend on Google Ads availability.
7. **No admin upload button.**
8. Every response reports `mutation_calls_sent: 0`.
9. The ledger reports `mutation_calls_sent` as `count(uploaded_at IS NOT NULL)` —
   derived from data, not asserted. Currently **0**.

---

## 6. Adjustment ledger

`public.google_ads_conversion_adjustments` (additive; no existing table touched).

- **RLS enabled *and* forced.** One policy: `SELECT` for admins via
  `check_is_admin()`. **No write policy exists**, so every anon/authenticated
  write is refused. Only `service_role` may write.
- Constraints enforce the financial rule in the database: `retained_value >= 0`,
  `retained_value <= original_value`, `RETRACTION ⇒ retained = 0`,
  `RESTATEMENT ⇒ retained > 0`, `cumulative_refund >= 0`.
- **Idempotency:** `UNIQUE(idempotency_key)` where the key is
  `order_id:conversion_action_id:adjustment_type:retained_value`. A later partial
  refund changes retained value → genuinely new adjustment → new row that
  supersedes the earlier active one.
- `UNIQUE(order_transaction_id, conversion_action_id) WHERE status IN
  (pending, dry_run_ready, retryable_error)` — at most **one active** adjustment
  per original conversion, so concurrent producers cannot double-queue.
- No PII, no email, no phone, no medical data, no raw click IDs.

**Backfill idempotency proven:** re-running the deterministic backfill inserted
**0** rows (21 rows, 21 distinct keys).

---

## 7. Consumer

`supabase/functions/google-ads-refund-adjustments` (deployed LIVE, verify_jwt on;
unauthenticated POST → **401** verified).

| Mode | Behaviour |
|---|---|
| `dry_run` *(default)* | Classify, build exact payloads, upload nothing |
| `reconcile` | Read-only ledger aggregate |
| `ingest` | Write/refresh ledger rows — **DB only** |
| `single` / `batch` | **501 — refused** |

Auth: service-role key **or** an authenticated admin. Browser anon refused.
Batch size bounded (default 50, max 200). Retries bounded (`MAX_ATTEMPTS = 5`).

The pure core lives in `supabase/functions/_shared/googleAdsRefundAdjustment.mjs`.
It is plain ESM **on purpose**: Deno (the function) and Node (the guard's test
matrix) execute *the same file*, so the tests exercise shipped code rather than a
hand-kept copy.

---

## 8. Performance

`EXPLAIN ANALYZE` on LIVE: **2.5 ms**, 401 buffers, 21 rows.
The candidate set is bounded *first* (≤200), so the lateral charge lookup runs at
most 200 times and rides the existing `idx_payment_attempts_confirmation_id`
(index scan, 1 row per loop). No unbounded scan, no N+1, no timeout tuning.

**No index was added to `orders`.** EXPLAIN proves the planner prefers a seq scan
(1.9 ms over ~1,600 rows) and ignores a partial index on `refunded_at`. A
speculative index was created, measured, found unused, and **dropped** — per the
"index only when EXPLAIN proves it useful" rule.

---

## 9. Tests & guard

`scripts/check-google-ads-refund-adjustment.mjs` — **94 checks pass**.

- **60 behavioural (T01–T60)** executing the real core: partial/full/multiple
  refunds, cumulative refunds, partial-then-full, never-negative, pending/failed
  refunds ignored, duplicate-webhook and duplicate-consumer idempotency,
  refund-before-upload blocking, missing original conversion, window blocking
  (54d/24h), payload shape (`order_id` only; retraction carries no
  `restatement_value`), coupon-not-double-deducted, provider-cost / Stripe-fee /
  ad-spend never deducted, add-on separation, bounded batch, retry
  classification, no PII in output, and the **charge-basis matrix (T52–T60)**
  modelled on the real LIVE orders.
- **34 static (S01–S34)** pinning the zero-mutation contract, RLS, fail-closed
  writes, value constraints, idempotency index, no-cron, Backend-Purchase-only,
  and no campaign/bid/budget/keyword/ad-copy/Final-URL mutation code.
- `--self-test` proves **all 15 negative controls trip** when the property is
  removed.

Wired into `npm run build`. Also `npm run check:ads-refund-adjustment` /
`npm run test:ads-refund-adjustment`.

---

## 10. Canary prerequisites — NOT executed in this task

A canary requires **separate, explicit owner approval** plus:

1. Confirm the Backend Purchase action (`7567366496`) is `type = WEBPAGE` and is
   **not** set to "use default value" (Err 10 would block every restatement).
   Run: `sync-google-ads-conversions` with `{"mode":"list_conversion_actions"}` —
   read-only.
2. Confirm the API version in use is still supported (docs now index v23–v25).
3. Ship an upload path (this build has none) behind the kill switch.
4. Set `GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED=true` **only** for the canary window.
5. Start with **one RETRACTION** from the 7 ready candidates (retractions do not
   depend on the weak value provenance in §12). Capture `job_id` + response.
6. Verify in Google Ads that the conversion count/value fell as expected.
7. **Do not canary a RESTATEMENT until §12 is fixed** — restatements depend on an
   original value we cannot currently prove.
8. Disable the kill switch again. Report. Request separate approval for automation.

**Automation prerequisites:** a successful canary, §12 fixed, then a cron +
bounded batch — each needing its own owner approval.

---

## 11. Rollback

- **Code:** revert the commits; the consumer is referenced by nothing else.
- **Function:** `supabase functions delete google-ads-refund-adjustments`.
- **Database:** additive only —
  `drop table public.google_ads_conversion_adjustments;`
  `drop function public.get_google_ads_refund_adjustment_candidates(integer);`
  `drop function public.get_google_ads_refund_adjustment_status();`
- No order, refund, payment or Google Ads state was modified, so there is nothing
  to unwind.

---

## 12. Known limitations

1. **No durable record of the uploaded conversion value.** The uploader's audit
   insert targets a nonexistent `audit_logs.details` column and fails silently
   (1 audit row for 404 uploads). `original_value` is therefore reconstructed from
   the **mutable** `orders.price` and every ledger row is flagged
   `value_provenance_weak = true`. **Retractions are unaffected** (they carry no
   value). **Restatements must not be canaried until this is fixed** — suggested
   fix: correct the uploader's audit insert to use `metadata`, and record the
   value sent at upload time.
2. **`orders.refund_amount` and `orders.price` are `integer`** — sub-dollar refunds
   round. Not an issue for the current candidates (all whole dollars).
3. **No per-refund ledger exists.** Cumulative refund comes from Stripe-derived
   `orders.refund_amount`, so individual refund events cannot be counted
   (`source_refund_count` is NULL). Multiple partial refunds still aggregate
   correctly because the field is cumulative.
4. **Add-on documentation payments** (`order_additional_documentation_requests`)
   are never uploaded as their own conversions and carry their own payment intent.
   8 exist at LIVE, **0 refunded**. An add-on refund must never adjust the parent
   conversion — enforced by keying candidates on `orders` only.
5. **12 refunded orders can never be adjusted** because their original conversion
   was never uploaded. That revenue was never sent to Google, so no correction is
   owed — but it means the "refunded revenue Google over-counts" figure is $779,
   not the ~$1,070 the earlier audit estimated from all refunds.
6. The consumer was deployed but **not invoked end-to-end** from this session (no
   service-role key available locally). The ledger was seeded by a deterministic
   SQL backfill that mirrors the core's classification exactly, and the dry-run
   output was produced by executing the real core module against the real LIVE
   candidate rows. The deployed endpoint was verified to reject unauthenticated
   calls (401).

---

## 13. Files

| File | Change |
|---|---|
| `supabase/functions/_shared/googleAdsRefundAdjustment.mjs` | new — pure core + verified API contract |
| `supabase/functions/google-ads-refund-adjustments/index.ts` | new — shadow consumer (no mutation path) |
| `supabase/migrations/20260726120000_google_ads_refund_adjustment_shadow_ledger.sql` | new — ledger, RLS, RPCs |
| `supabase/migrations/20260726123000_google_ads_refund_adjustment_charge_basis.sql` | new — charge-basis columns + corrected candidate RPC |
| `scripts/check-google-ads-refund-adjustment.mjs` | new — guard + 94-check test matrix |
| `package.json` | guard wired into build + 2 scripts |
| `docs/google-ads-refund-adjustment-consumer-001.md` | this file |

**Not touched:** ad content, Final URLs, campaigns, bids, budgets, keywords,
conversion-action Primary/Secondary status, Stripe, refunds, order financials,
`OrderDetailModal.tsx`, `AnalyticsTab.tsx`.
