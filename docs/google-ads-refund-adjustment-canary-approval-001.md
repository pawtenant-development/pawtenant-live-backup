# GOOGLE-ADS-REFUND-ADJUSTMENT-CANARY-EXECUTION-PREP-001 — Owner approval package

**Status:** LIVE CANARY VALIDATED — one RETRACTION ready. **Final owner approval required.**
**Date:** 2026-07-26 · **Starting SHA:** `99cb794`

> ## NO REAL GOOGLE ADS ADJUSTMENT WAS SENT
> Real mutations: **0**. Validate-only requests: **2** (the second solely to prove
> idempotency). All three protection flags remain **unset**.

---

## 1. The candidate

| Field | Value |
|---|---|
| Masked order reference | **`PT***3ZC`** |
| Masked ledger adjustment ID | **`c1b0d4c4…`** |
| Adjustment type | **RETRACTION** (full refund, retained revenue $0) |

### Eligibility — re-audited at execution time, all pass

| Check | Result |
|---|---|
| Refund full and successful | ✅ `refund_status = full`; charged **$99** = refunded **$99** = uploaded **$99** |
| Refund not pending / failed / cancelled / reversed | ✅ |
| Original conversion identity proven | ✅ `google_ads_uploaded_at = 2026-07-19 20:17:32Z` |
| Exact original `order_id` proven | ✅ stable `confirmation_id`, also the Google `order_id` |
| Conversion action = `7567366496` | ✅ |
| Attribution method | ✅ `gclid_plus_hashed_email` (strongest) |
| Inside adjustment window | ✅ **6.19 days** old — past the 24 h floor, ~48 days before the 54-day expiry |
| No prior adjustment uploaded | ✅ `uploaded_at IS NULL`, `attempt_count = 0` |
| No duplicate active ledger row | ✅ exactly 1 row, 1 active |
| No additional-documentation ambiguity | ✅ 0 add-on rows |
| No multiple-payment ambiguity | ✅ exactly 1 succeeded payment |
| No multiple-refund ambiguity | ✅ single full refund |
| No charge/upload mismatch | ✅ 99 / 99 / 99 |
| Retained revenue zero | ✅ `0.00` |
| Ledger ready for RETRACTION | ✅ `dry_run_ready` |
| Still the lowest-risk option | ✅ — the newest candidate has **2** succeeded payments; another was charged $149 vs $129 uploaded. Both remain rejected. |

---

## 2. Conversion action + window verification

Re-verified read-only (no setting changed):

`2480853323` · MCC `7629508384` · action **`7567366496`** "Pawtenant Backend Purchase (API)" ·
type **`UPLOAD_CLICKS`** (Google supports adjustments for `SALESFORCE`, `UPLOAD_CLICKS`,
`WEBPAGE`) · `ENABLED` · `primaryForGoal: true` · `alwaysUseDefaultValue: false` ·
API **`v24`**.

---

## 3. Exact payload — redacted

```json
{
  "conversionAdjustments": [
    {
      "conversionAction": "customers/2480853323/conversionActions/7567366496",
      "adjustmentType": "RETRACTION",
      "adjustmentDateTime": "2026-07-21 21:54:10+00:00",
      "orderId": "PT***3ZC"
    }
  ],
  "partialFailure": true,
  "validateOnly": true
}
```

Exactly **1** operation. No `restatementValue` (Google errors on a retraction), no
`gclidDateTimePair` (error 20 alongside `orderId`), no `userIdentifiers`, no other
optional fields.

---

## 4. Validate-only result

| Field | Value |
|---|---|
| HTTP status | **200** |
| Top-level `error` | **null** |
| `partialFailureError` | **null** |
| Google error code | **none** |
| `results` | null *(expected — `validate_only` returns errors, not results)* |
| Request ID (call 1) | `baGTbds9TTbCFhU__dU4tw` |
| Job ID (call 1) | `2120607017731896023` |
| Request ID (call 2, idempotency) | `JZKxQ4JuLUcfa5rVhj7Gpg` |
| Operations sent | 1 |
| `CONVERSION_NOT_FOUND` | not returned |
| Duplicate adjustment | not returned |
| Unsupported action type | not returned |
| Expired window | not returned |
| Adjustment timestamp error | not returned |

**Payload structure is accepted.**

> ### Important limitation — read before approving
> `validateOnly: true` proves the request **structure**, the conversion action, the
> customer, and the timestamp ordering are valid. It does **not** conclusively prove
> that Google can match this specific historical conversion. Google did not
> explicitly confirm a match, and `results` is null by design under validate-only.
> `CONVERSION_NOT_FOUND` is reported per-operation via `partialFailureError`, which
> may only be evaluated during real processing.
>
> The residual risk is therefore unchanged from the readiness report: historical
> uploads never recorded **which** conversion action they targeted (inferred from
> the uploader env). The real send is the first moment that assumption is truly
> tested — and its only failure mode is a `CONVERSION_NOT_FOUND` that changes
> nothing at Google.

---

## 5. Ledger status after validation

| Field | Value |
|---|---|
| Status | **`dry_run_ready`** (unchanged) |
| `uploaded_at` | **NULL** |
| `attempt_count` | **0** (real-upload retry count untouched) |
| `google_job_id` | NULL (set only on a real send) |
| `last_attempt_at` | validation timestamp |
| `google_response_summary.last_validation` | `{at, api_version, validate_only:true, http_status, accepted, google_error_code, request_id}` — no PII |
| Across all 21 rows | 0 uploaded, 7 still ready, 0 total attempts |

Repeated validation is idempotent: the second call changed only the
`last_validation` record.

---

## 6. Real mutation remains disabled

Verified live: `supabase secrets list` contains **no** `GOOGLE_ADS_REFUND*` variable.

A real send requires **all seven** conditions; a real attempt right now returns
**403** listing every missing one:

```json
{"error":"Real conversion-adjustment upload is disabled.",
 "blockers":["GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED is not 'true'",
             "GOOGLE_ADS_REFUND_CANARY_ENABLED is not 'true'",
             "GOOGLE_ADS_REFUND_CANARY_ADJUSTMENT_ID is not configured"],
 "note":"Nothing was sent to Google."}
```

| Condition | State |
|---|---|
| 1. `GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED=true` | ❌ unset |
| 2. `GOOGLE_ADS_REFUND_CANARY_ENABLED=true` | ❌ unset |
| 3. `GOOGLE_ADS_REFUND_CANARY_ADJUSTMENT_ID` == the row | ❌ unset |
| 4. mode exactly `single_canary` | enforced |
| 5. approved server/admin capability | enforced |
| 6. candidate still eligible (re-checked at send time) | enforced |
| 7. `validateOnly` false — only an explicit `false` counts | enforced |

**Design note:** `validateOnly: true` deliberately does **not** require the flags —
it cannot change anything at Google, and requiring the allow-list env would have
meant setting a LIVE secret just to validate. No environment variable was created,
modified, or deleted in this task.

### Authorization results

| Test | Result |
|---|---|
| Unauthenticated | **401** |
| Anon key | **401** |
| Non-admin authenticated user | **401/403** (no admin row → rejected) |
| Approved server capability + `validateOnly:true` | **200** |
| Real mutation with flags off | **403**, nothing sent |
| Wrong adjustment ID | **404** |
| Missing adjustment ID | **400** |
| `mode: batch` | **501** |
| `mode: single` (legacy) | **501** |

---

## 7. Future real canary — exact procedure (DO NOT RUN YET)

```bash
supabase secrets set GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED=true GOOGLE_ADS_REFUND_CANARY_ENABLED=true GOOGLE_ADS_REFUND_CANARY_ADJUSTMENT_ID=<ledger-id> --project-ref cvwbozlbbmrjxznknouq
```

1. Re-run `mode:"single_canary"` with `validateOnly:true` — confirm still accepted.
2. Set the three variables above (allow-list = the exact `c1b0d4c4…` row).
3. Send **one** request: `{"mode":"single_canary","adjustmentId":"<id>","validateOnly":false}`.
4. Confirm the response reports `operations_sent: 1`.
5. Capture `request_id`, `job_id`, `partialFailureError`.
6. **Immediately** unset all three variables:
   ```bash
   supabase secrets unset GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED GOOGLE_ADS_REFUND_CANARY_ENABLED GOOGLE_ADS_REFUND_CANARY_ADJUSTMENT_ID --project-ref cvwbozlbbmrjxznknouq
   ```
7. The ledger marks `uploaded` **only** if Google accepted — the code cannot mark it
   optimistically.
8. Verify in Google Ads that the Backend Purchase action drops by exactly **1
   conversion / $99** for the conversion date **2026-07-19**.
9. **Stop.** No second candidate without new owner approval.

### Stop conditions — abort and unset the flags immediately

- `CONVERSION_NOT_FOUND` — the historical action assumption is wrong. **Nothing
  changed at Google**; do not retry against another action.
- `NO_CONVERSION_ACTION_FOUND` / `INVALID_CONVERSION_ACTION_TYPE`
- `CONVERSION_ALREADY_RETRACTED` / `TOO_MANY_ADJUSTMENTS` — an unknown prior adjustment exists
- `CONVERSION_EXPIRED` / `TOO_RECENT_CONVERSION` — window wrong
- `ADJUSTMENT_PRECEDES_CONVERSION` — timestamp wrong
- Any non-null `partialFailureError`
- More than one conversion changes, or the value changes by ≠ $99
- Any authentication/authorization error
- Google reporting disagrees with the ledger

### Rollback / containment

- **A retraction cannot be undone** — Google ignores further adjustments to a
  retracted conversion. Containment is therefore *prevention*: one row, one
  operation, allow-listed id.
- If the retraction was wrong, the only remedy is re-uploading the conversion as a
  new offline conversion — **requires separate owner approval**.
- Code rollback: revert the commits; redeploy the prior function version.
- Flags: unset all three (this restores the current state exactly).
- DB: `google_request_id` is additive; drop only if fully reverting.

---

## 8. Safety posture change (read this)

Before this task, zero-mutation was guaranteed by the **absence** of any Google
mutation code. That is no longer true: a protected single-item path now exists.
The guard was updated accordingly — it no longer asserts "no endpoint exists" but
instead asserts the endpoint is **gated**:

exactly one operation (hard-wired cap + pre-send assertion) · exactly one Google
endpoint in the file · dual fail-closed flags requiring the literal `"true"` ·
exact allow-list id match · validate-only unless every condition held · RETRACTION
only · no `restatementValue` · no `gclidDateTimePair`/`userIdentifiers` ·
`partialFailure: true` · batch and legacy single permanently 501 · no cron · the
Stripe webhook still never calls Google · a validate-only run can never write
`uploaded`.

**Guard: 120 checks, 33 negative controls, all tripping.**
