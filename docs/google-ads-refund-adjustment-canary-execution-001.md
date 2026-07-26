# GOOGLE-ADS-REFUND-ADJUSTMENT-CANARY-EXECUTION-001 — execution record

**Status:** LIVE CANARY COMPLETE — one full-refund RETRACTION accepted.
**Date:** 2026-07-26 · **LIVE SHA:** `ea1a52f` (no code change required)
**Real Google adjustment requests sent: exactly 1. RESTATEMENTs: 0. Candidates processed: 1 of 7.**

---

## 1. Owner authorization

Exactly one real Google Ads conversion RETRACTION for masked order **`PT***3ZC`**,
ledger adjustment **`c1b0d4c4…`**. No other adjustment authorized. No automation, no
batch, no cron, no Ads-account changes.

## 2. Preflight

`main` at `ea1a52f`, 0 ahead / 0 behind, no merge/rebase/cherry-pick/bisect/index-lock.
Only 4 pre-existing unrelated untracked tracker docs. All three mutation flags **unset**.
No cron references the consumer. No `single_canary` reference anywhere in `src/` — no
upload button exists.

## 3. Final candidate revalidation — all pass

| Check | Value |
|---|---|
| Ledger row exists / masked order | ✅ `c1b0d4c4…` / `PT***3ZC` |
| Status | `dry_run_ready` |
| Type / retained value | RETRACTION / **0.00** |
| Refund full + successful, not reversed | ✅ `full` |
| Charged / uploaded / refunded | **$99 / $99 / $99** |
| Original conversion identity proven | ✅ uploaded `2026-07-19 20:17:32Z` |
| Conversion action | `7567366496` |
| Prior adjustment | none — `uploaded_at` NULL, `attempt_count` 0 |
| Ledger rows / active rows | 1 / 1 |
| Add-on ambiguity | none (0 rows) |
| Multiple-payment ambiguity | none (1 succeeded payment) |
| Multiple-refund ambiguity | none (single full refund) |
| Adjustment window | **6.20 days** — past the 24 h floor, ~48 d before the 54 d expiry |

## 4. Final validate-only checkpoint (before enabling anything)

HTTP **200** · `partialFailureError` **null** · top-level error **null** · no error code ·
1 operation · request `YNr_GdJuhGKYPM0qM5vlpg` · job `7787300052683836014`.
Ledger after: `dry_run_ready`, `uploaded_at` NULL, `attempt_count` 0 — no real mutation.

## 5. Gate enablement + proof

Set `GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED=true`, `GOOGLE_ADS_REFUND_CANARY_ENABLED=true`,
`GOOGLE_ADS_REFUND_CANARY_ADJUSTMENT_ID=<approved UUID>` (value never printed).

Proven while enabled:

| Probe | Result |
|---|---|
| Both flags true, exactly one id allow-listed | ✅ `real_mutation_possible_now: true`, `max_operations_per_request: 1` |
| **A different, legitimate ready candidate with `validateOnly:false`** | **403 — "adjustmentId does not match the configured allow-list", nothing sent** |
| `mode: batch` | **501** |

## 6. The one real request

Redacted payload actually sent:

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
  "validateOnly": false
}
```

`operation_count === 1` asserted pre-send. Sent **once**. No retry.
Sent `2026-07-26T01:10:36Z` · returned `2026-07-26T01:10:40Z`.

## 7. Response — ACCEPTED

| Field | Value |
|---|---|
| HTTP | **200** |
| Top-level error | **null** |
| `partialFailureError` | **null** |
| Google error code | none |
| **`results`** | **populated** — one entry echoing `adjustmentType: RETRACTION`, the conversion action, the adjustment date-time and the order id |
| Request ID | `r2OlRsEJuS7LMwso96kMBg` |
| Job ID | `3933924553813249566` |
| Operations sent | 1 |

**Why this counts as acceptance evidence:** under `validateOnly: true` Google returned
`results: null` (validate-only returns errors, not results). The real call returned a
**non-null `results` array echoing the operation**, which is Google confirming it
processed a concrete adjustment — the residual "can Google match this historical
conversion?" risk carried since the readiness report is now **resolved**. No
`CONVERSION_NOT_FOUND`.

## 8. Ledger result

| Field | Value |
|---|---|
| Status | **`uploaded`** |
| `uploaded_at` | `2026-07-26 01:10:39.844Z` |
| `attempt_count` | **1** (incremented once) |
| `google_request_id` | `r2OlRsEJuS7LMwso96kMBg` |
| `google_response_summary.real_upload` | `{http_status: 200, request_id}` |

Only the approved row changed. Written **after** Google accepted — never optimistically.

## 9. Immediate containment (performed right after the single request)

All three variables **removed**. Verified:

| Check | Result |
|---|---|
| `supabase secrets list` for `GOOGLE_ADS_REFUND*` | **empty** |
| Second real request on the same row | **403** — all three blockers listed, "Nothing was sent to Google." |
| `mode: batch` | **501** |
| `mode: single` (legacy) | **501** |
| Runtime gate state | `mutations_enabled:false, canary_enabled:false, allow_list:false, real_mutation_possible_now:false, shadow_mode:true` |
| Cron created | **0** |
| Automatic retry scheduled | **none** |

## 10. Google Ads verification

- Conversion-action config re-read **after** the retraction is **byte-identical**:
  `UPLOAD_CLICKS`, `ENABLED`, `PURCHASE`, `primaryForGoal: true`,
  `alwaysUseDefaultValue: false`, `MANY_PER_CLICK`, lookback 30 d, default value 100.
  **No conversion setting changed.**
- No campaign, ad, keyword, negative-keyword, bid, budget, audience or Final URL was
  touched — this build contains no code path that could.

**Not yet verifiable (honest gap):** conversion **count/value** in Google Ads reporting.
Offline conversion adjustments are processed asynchronously and reporting lags, so an
immediate metrics query would prove nothing. The API-level acceptance above (populated
`results`, no `partialFailureError`) is the strongest evidence available at this moment.

**Follow-up owner check (recommended, read-only):** in Google Ads → Goals → Conversions →
"Pawtenant Backend Purchase (API)", confirm for conversion date **2026-07-19** that the
count drops by exactly **1** and value by exactly **$99**, and that no unrelated
conversion changed.

## 11. Safety verification

| Metric | Count |
|---|---|
| Real Google adjustment requests | **1** |
| RETRACTION operations | **1** |
| RESTATEMENT operations | **0** |
| Candidates processed | **1** |
| Remaining ready candidates, untouched | **6** |
| Stripe mutations | 0 |
| Order financial mutations | 0 (canary order still price $99 / refund $99) |
| Campaign / ad-copy / Final URL / keyword / negative-keyword / bid / budget / conversion-setting mutations | 0 |
| Cron additions | 0 |
| Customer communications | 0 |
| PII exposure | 0 |

## 12. Residual risks

1. **The retraction is effectively irreversible.** Google ignores further adjustments to a
   retracted conversion. If this proves wrong, the only remedy is re-uploading the
   conversion as a new offline conversion — **requires separate owner approval**.
2. **Reporting confirmation is still outstanding** (§10) until Google processes the
   adjustment.
3. **Value provenance for the remaining 6 is still `reconstructed`** — irrelevant for
   RETRACTIONs (no value is sent) but still blocking any future RESTATEMENT.

## 13. Next approval boundary

**6 ready RETRACTION candidates remain, worth $680 of over-credited conversion value
($779 total minus this $99).** None may be processed without a new owner decision, and
that decision should wait until the reporting check in §10 confirms this canary behaved
as expected. Automation (cron/batch) remains explicitly unauthorized and unbuilt.
