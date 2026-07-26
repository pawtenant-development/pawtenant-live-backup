# GOOGLE-ADS-REFUND-ADJUSTMENT-LEDGER-RECONCILIATION-FIX-001

**Status:** PARTIAL COMPLETE — ledger fixed, Google reporting pending.
**Date:** 2026-07-26 · **Starting SHA:** `a9d7273`
**Google mutation calls this task: 0.** All three flags remain unset. No cron.

---

## 1. Root cause

The refund classifier re-derives candidates from `orders` on **every** run and has
**no memory**. An order whose conversion had already been retracted still satisfied
every rule — full refund, identity proven, inside window — so it re-appeared as a
perfect candidate.

Consequences before this fix:

- Dry run reported **7 ready / $779** instead of **6 / $680**, presenting the
  already-adjusted canary as actionable.
- `ingest` upserted on `idempotency_key`, so a re-run would have written the
  completed row's `status` back to `dry_run_ready`.

Not an external-mutation vulnerability — `single_canary` independently refuses any
row with `uploaded_at`, verified at the time — but a genuine ledger-integrity and
reporting-accuracy defect.

**Also found and repaired:** the real-upload branch stored only Google's
`request_id`, silently dropping the `job_id` acceptance evidence. The canary row's
job ID (`3933924553813249566`, from the captured response) was backfilled **before**
the immutability trigger was installed, and the code now persists it going forward.

## 2. Canonical rule now enforced

The ledger is the source of truth after ingestion. A row is **durable** when it has
`uploaded_at`, carries Google identifiers, or is `uploaded` / `superseded` /
`terminal_error`. The classifier may discover new candidates; it may never override
a durable outcome.

Enforced in three independent layers:

| Layer | Mechanism |
|---|---|
| Shared core | `isDurableLedgerOutcome()` + `applyLedgerOutcome()` overlay the ledger onto each classified candidate before summarising |
| Consumer | dry-run/ingest iterate the **reconciled** set; ingest `continue`s past durable rows — no upsert at all |
| Database | `trg_google_ads_adjustment_protect_uploaded` blocks status changes, evidence changes and deletes on accepted rows |

## 3. Database invariant — verified on LIVE (all rolled back)

| Attack on the accepted canary row | Result |
|---|---|
| `status` → `dry_run_ready` | **blocked** |
| `uploaded_at` → NULL | **blocked** |
| overwrite `google_request_id` | **blocked** |
| overwrite `google_job_id` | **blocked** |
| reset `attempt_count` → 0 | **blocked** |
| overwrite `google_response_summary` | **blocked** |
| `DELETE` the row | **blocked** |
| update a **pending** row | **allowed** ✅ |

Also immutable once accepted: `original_order_or_transaction_id`,
`conversion_action_id`, `adjustment_type`, `idempotency_key`.

## 4. Live validation (flags disabled throughout)

| Check | Result |
|---|---|
| Dry run — ready | **6** |
| Dry run — ready value | **$680** (excludes the $99) |
| Dry run — uploaded, reported separately | **1 / $99** |
| Blocked not-uploaded · skipped overcharge · candidates | 12 · 2 · 21 |
| Canary row in report | `status: uploaded`, no proposed type, job id + `uploaded_at` surfaced |
| Ingest run #1 | ingested 20, superseded 0, **protected_from_downgrade 1** |
| Ingest run #2 | identical — summaries byte-equal |
| Canary row after both ingests | `uploaded`, `uploaded_at` intact, `attempt_count` **1**, request + job ids intact |
| Reconcile — duplicate active rows | **0** |
| Reconcile — uploaded missing evidence | **0** |
| Reconcile — candidate missing from ledger / row unsupported by source | 0 / 0 |
| Reconcile — `uploaded_but_rediscovered` | **1** (expected: the drift the overlay now suppresses) |
| Google mutation calls | **0** |
| Real `single_canary` on the uploaded row | **403**, all three blockers |
| `batch` / legacy `single` | **501 / 501** |
| Feature flags | all **unset** |
| Cron | 9 pre-existing, **0** added |

**Second defect found during validation:** `reconcile`'s ledger block returned
`{"error":"forbidden"}` because `get_google_ads_refund_adjustment_status()` gated on
`check_is_admin()` only — and the server calls it as `service_role`, which is not an
admin *user*. Fixed by allowing `auth.role() = 'service_role'` explicitly; browser
clients remain admin-gated and `anon` still has no grant.

## 5. Google Ads reporting check

**`REPORTING PENDING`.**

The retraction was accepted at `2026-07-26T01:10:39Z` (server clock). Offline
conversion adjustments process asynchronously and reporting lags by hours, so a
metrics query now would be inconclusive rather than confirming. This is **not** a
failure signal.

Conversion-action config re-read after this task is **unchanged**: `UPLOAD_CLICKS`,
`ENABLED`, `primaryForGoal: true`, `alwaysUseDefaultValue: false`, `MANY_PER_CLICK`,
lookback 30 d.

**Owner check once reporting refreshes (read-only):** Google Ads → Goals →
Conversions → "Pawtenant Backend Purchase (API)", original conversion date
**2026-07-19** — expect count **−1** and value **−$99**, no duplicate adjustment, no
unrelated conversion movement.

## 6. Tests and guard

Guard: **153 checks**, **42 negative controls**, all tripping.

New behavioural tests (executing the real shipped core): uploaded row excluded from
ready; uploaded value excluded from proposed value; uploaded count and value reported
separately; durability detected from `uploaded_at`, from Google identifiers, and from
`superseded` / `terminal_error`; a pending row is **not** suppressed and may still
recompute; the expected LIVE shape is 1 uploaded / 6 ready; reconciled rows stay
PII-safe.

New negative controls plant exactly the defects this task fixed — reopening an
uploaded row, clearing `uploaded_at`, counting uploaded as ready, folding uploaded
value into the proposed total, overwriting the job ID, summarising the raw classifier
output instead of the reconciled set, and removing the ingest skip. All fail the guard.

## 7. Residual risks

1. **Reporting confirmation still outstanding** (§5) — the only open item from the canary.
2. **The retraction remains irreversible.** Google ignores further adjustments to a
   retracted conversion.
3. **Value provenance for the remaining 6 is still `reconstructed`** — harmless for
   RETRACTIONs (no value is sent), still blocking any future RESTATEMENT.

## 8. Remaining work / approval boundary

**6 ready RETRACTION candidates remain, worth $680.** None may be processed without a
new owner decision, and that decision should wait until the §5 reporting check passes.
Automation (cron / batch / retry) remains unauthorized and unbuilt.
