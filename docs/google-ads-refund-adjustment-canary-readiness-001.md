# GOOGLE-ADS-REFUND-ADJUSTMENT-CANARY-READINESS-001

**Status:** LIVE CANARY READY — one full-refund RETRACTION proven. **Owner approval required.**
**Date:** 2026-07-26 · **Starting SHA:** `1f5a4f8` · **Environment:** LIVE (`cvwbozlbbmrjxznknouq`)
**Google mutations sent this task: 0.** Kill switch remains unset (disabled). No cron.

---

## 1. Authenticated deployed-function dry run

Invoked the deployed `google-ads-refund-adjustments` over HTTPS with a real
server credential obtained from the authenticated Supabase CLI. No credential was
printed at any point.

| Test | Result |
|---|---|
| Unauthenticated POST | **401** ✅ |
| Anon key (non-admin, no session) | **401** ✅ |
| Service-role invocation | **200** ✅ (`authorized_as: service_role_capability`) |
| Default mode with no `mode` field | **`dry_run`** ✅ |
| `mode: "single"` / `mode: "batch"` | **501, refused** ✅ |
| Repeat invocation byte-identical | **true** ✅ |
| Ledger rows after repeats | **21, unchanged** ✅ |
| PII in response | none — no `@`, email, phone, `pi_*`, `gbraid`, `wbraid`, `hashedEmail` ✅ |
| Order references | masked (`PT***3ZC`) ✅ |
| `mutation_calls_sent` | **0** ✅ |

The only `gclid` substring in the response is the explanatory sentence
"identified by order_id only (never gclid_date_time_pair)" — descriptive text, not
a click identifier.

### Ledger reconciliation — exact match

| Metric | Expected | Deployed function | Ledger |
|---|---|---|---|
| Candidates | 21 | 21 | 21 |
| Ready RETRACTIONs | 7 | 7 | 7 |
| Blocked, original not uploaded | 12 | 12 | 12 |
| Skipped overcharge corrections | 2 | 2 | 2 |
| Proposed value | $779 | $779 | $779 |
| Proposed RESTATEMENTs | 0 | 0 | 0 |
| Mutation calls | 0 | 0 | 0 |

### Defect found and fixed: service-role authorization

The first authenticated attempt returned **401 despite a valid service-role
credential** — one that demonstrably bypasses RLS on PostgREST (returned all 21
ledger rows). Root cause: the function authorized by comparing the bearer token
to `SUPABASE_SERVICE_ROLE_KEY` with string equality. This project has **both** the
legacy service-role JWT and the newer `sb_secret_*` key, and the value injected
into the function does not match the credential a legitimate caller presents.
(The `sb_secret_*` key is separately rejected by the functions gateway with
"Invalid API key", so there was **no** working service-role path at all.)

Fixed by authorizing on **proven capability instead of a secret comparison**: the
function attempts `get_google_ads_refund_adjustment_candidates`, which is granted
to `service_role` **only** (revoked from public/anon/authenticated in
`20260726130000`). Being able to execute it *is* service-role authorization.
This widens nothing — it authorizes exactly the callers a correct string
comparison would have. The string-equality fast path and the admin-user path are
both retained. Anon still gets 401.

---

## 2. Immutable original-upload provenance

New table `public.google_ads_conversion_uploads`
(`20260726150000_google_ads_conversion_upload_provenance.sql`).

Records at successful upload time: order id, Google transaction/order id,
conversion action id, **exact uploaded value**, currency, conversion date-time,
attribution method, API version, upload attempt id, Google request id, upload
timestamp, status, safe response summary, idempotency key.

Verified on LIVE (all tests **rolled back** — nothing persisted):

| Guarantee | Result |
|---|---|
| UPDATE of a successful row | **blocked** ✅ |
| DELETE of a successful row | **blocked** ✅ |
| UPDATE of a failed row (retry) | allowed ✅ |
| Second successful row for same order | **blocked** by unique partial index ✅ |
| RLS enabled + forced, no browser write policy | ✅ |
| Provenance rows currently stored | **0** — no historical value guessed ✅ |

The uploader now writes this record on success. It also **fixes a silent data-loss
bug**: the audit insert wrote `audit_logs.details`, a column that does not exist,
inside an empty `catch` — 1 audit row for 404 uploads. Now `metadata`. The
uploader remains backward compatible: `test_auth`, `list_conversion_actions` and
`test_upload` (validateOnly=true) all return 200 after the change.

### Historical classification — never guessed

`get_google_ads_upload_provenance(order)` returns `proven` | `reconstructed` |
`unknown` and reads `uploaded_value` **only** from the provenance table, so a
`reconstructed` order returns **NULL**, never `orders.price`. Guard S42 pins this.

All **7** ready candidates classify as **identity proven, value reconstructed**:
upload succeeded (`google_ads_uploaded_at`), order id stable, action known, inside
the window — but no recorded uploaded value, because they predate this table.

**Consequence:** a **RETRACTION carries no value**, so reconstructed provenance
cannot corrupt it → the canary is safe. A **RESTATEMENT requires proven value** →
remains blocked. There are 0 proposed restatements anyway.

---

## 3. Google Ads prerequisites — verified, nothing changed

Read-only GAQL via a new additive `inspect_conversion_action` mode.

| Prerequisite | Verified value |
|---|---|
| Customer account | **2480853323** ✅ |
| Login customer (MCC) | **7629508384** ✅ |
| Conversion action | **7567366496** — "Pawtenant Backend Purchase (API)" ✅ |
| Action type | **`UPLOAD_CLICKS`** |
| Adjustments supported for type | ✅ Google: adjustments are supported for `SALESFORCE`, `UPLOAD_CLICKS`, or `WEBPAGE` |
| Status | `ENABLED`, category `PURCHASE` |
| **Primary for bidding** | **`primaryForGoal: true`** ✅ |
| `alwaysUseDefaultValue` | **`false`** → uploaded values are accepted, not overridden ✅ (error 10 would not block a restatement) |
| Counting type | `MANY_PER_CLICK` |
| API version in use | **`v24`** ✅ supported (Google currently indexes v23–v25) |
| Contract drift v21 → v24 | **none** — 54-day window, 24-hour floor, order_id/gclid mutual exclusion, and "no `restatement_value` on retraction" are byte-identical |
| Order-ID identification | ✅ Google recommends `order_id` over GCLID; our uploads always set it |
| Retraction is terminal | ✅ once retracted, further adjustments are ignored |

> **Correction to the previous report.** The earlier canary prerequisite said
> "confirm the action is `type = WEBPAGE`". That was wrong — it is `UPLOAD_CLICKS`,
> which is separately confirmed as supported. Order-ID identification is required
> because our original conversions were *uploaded with* an `order_id`, not because
> of the action type.

---

## 4. Selected canary — exactly one

**Masked reference: `PT***3ZC`** (full-refund RETRACTION)

| Criterion | Evidence |
|---|---|
| Full successful refund | `refund_status = full`; charged **$99** = refunded **$99** |
| Retained revenue | **$0** → RETRACTION, not RESTATEMENT |
| Original upload proven | `google_ads_uploaded_at = 2026-07-19 20:17:32Z` |
| Order ID stable | yes — `confirmation_id`, also the Google `order_id` |
| Attribution | `gclid_plus_hashed_email` (strongest) |
| Charge ambiguity | none — exactly **1** succeeded payment; charged = uploaded value |
| Add-on ambiguity | none — 0 add-on rows |
| Multiple-refund ambiguity | none — single full refund |
| Prior adjustment | none — `uploaded_at IS NULL` in the ledger |
| Duplicate ledger candidate | none — exactly 1 ledger row |
| Adjustment window | **~6.2 days** old — far past the 24 h floor, ~48 days of margin before the 54-day expiry |
| Diagnostics observability | recent enough to be visible in Google Ads reporting |

**Rejected candidates:** the newest (2.99 d) has **two** succeeded payment
attempts → charge ambiguity. One other has charged $149 ≠ uploaded $129 (coupon
overcharge) → least clean basis. Both excluded despite being valid retractions.

---

## 5. Exact payload — built, NOT sent

```json
{
  "conversionAction": "customers/2480853323/conversionActions/7567366496",
  "adjustmentType": "RETRACTION",
  "adjustmentDateTime": "2026-07-21 21:54:10+00:00",
  "orderId": "PT-***3ZC (redacted)"
}
```

Wrapped as a single-item request with `partialFailure: true` and, for step 5 below,
`validateOnly: true`.

| Validation | Result |
|---|---|
| Customer ID / action resource | ✅ matches verified account + action |
| `adjustmentType` | ✅ `RETRACTION` |
| `restatementValue` | ✅ **absent** (Google errors if present on a retraction) |
| `gclidDateTimePair` | ✅ **absent** (error 20 if set alongside `order_id`) |
| `userIdentifiers` / `user_agent` | ✅ absent (accepted only in ENHANCEMENT) |
| `adjustmentDateTime` format + after conversion | ✅ `yyyy-mm-dd hh:mm:ss+00:00`, refund time > conversion time |
| Items in request | ✅ exactly **1** — no second candidate |
| Total fields | 4 |

---

## 6. Canary containment plan — execute only after owner approval

1. Re-run the dry run; confirm the ledger row for `PT***3ZC` is unchanged
   (`status = dry_run_ready`, `uploaded_at IS NULL`, retained value 0).
2. Ship a protected single-item mutation path (this build has none), hard-scoped
   to one ledger adjustment ID passed explicitly — never a query-string toggle.
3. Restrict execution to that adjustment ID; refuse any batch.
4. Set `GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED=true` for the canary window only.
5. **First send `validateOnly: true`.** Expect no errors. This is the last
   non-mutating checkpoint — it proves the conversion is findable under this
   action *before* anything changes.
6. Send the single live request with `partialFailure: true`.
7. Capture the response, `job_id`, request id, and any `partialFailureError`.
8. **Immediately unset the kill switch.**
9. Mark the ledger row `uploaded` **only after** confirmed API acceptance —
   never optimistically.
10. Inspect Google Ads diagnostics; confirm the conversion count and value fall by
    exactly one conversion / $99 for that action.
11. **Stop.** Do not process a second row without separate owner approval.

### Stop conditions — abort and disable immediately

- `CONVERSION_NOT_FOUND` — the conversion is not under this action; the historical
  action assumption is wrong (see limitation 1).
- `NO_CONVERSION_ACTION_FOUND` / `INVALID_CONVERSION_ACTION_TYPE` — wrong action.
- `CONVERSION_ALREADY_RETRACTED` / `TOO_MANY_ADJUSTMENTS` — a prior adjustment
  exists that our ledger does not know about.
- `CONVERSION_EXPIRED` — window closed; recompute eligibility.
- `TOO_RECENT_CONVERSION` — under the 24 h floor.
- `ADJUSTMENT_PRECEDES_CONVERSION` — adjustment timestamp is wrong.
- Any `partialFailureError` at all.
- Conversion count/value changes by an unexpected amount, or more than one
  conversion changes.
- Any authentication/authorization error.
- Google diagnostics disagree with the ledger.

---

## 7. Known limitations

1. **Historical action identity is inferred, not recorded.** Uploads before this
   task did not record which conversion action they targeted; it is inferred from
   the uploader's env (`7567366496`). Step 5's `validateOnly` call is precisely the
   control for this — `CONVERSION_NOT_FOUND` there would disprove the assumption
   without changing anything.
2. **Uploaded values remain reconstructed for all 7 historical candidates.** Only
   conversions uploaded *after* this deployment carry proven values. Restatements
   stay blocked until proven rows exist.
3. **No mutation path is shipped.** The canary requires a further, owner-approved
   code change — the kill switch alone does nothing.
4. `orders.refund_amount` / `orders.price` are integer columns; sub-dollar refunds
   would round. Not applicable to any current candidate.

---

## 8. Rollback

- Code: revert the commits; nothing else references these paths.
- Functions: redeploy the prior versions, or
  `supabase functions delete google-ads-refund-adjustments`.
- Database: additive only —
  `drop table public.google_ads_conversion_uploads;`
  `drop function public.get_google_ads_upload_provenance(text);`
- No Google Ads, Stripe, order, refund or campaign state was modified, so there is
  nothing to unwind.
