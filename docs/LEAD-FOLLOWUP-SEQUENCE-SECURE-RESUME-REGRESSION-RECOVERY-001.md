# LEAD-FOLLOWUP-SEQUENCE-SECURE-RESUME-REGRESSION-RECOVERY-001

**Status: LIVE COMPLETE** — lead follow-up email/SMS sequence restored, false SMS
stamps repaired, backlog safely processed, dedupe and secure resume links verified.

| | |
|---|---|
| Failure window | `2026-08-01 22:30:01 UTC` (last success) → `2026-08-02 11:38:13 UTC` (recovery) — ~13h |
| LIVE function | `lead-followup-sequence` **v85 → v86**, ACTIVE, `verify_jwt=false` preserved |
| TEST function | v59, ACTIVE, `verify_jwt=false` preserved |
| TEST / LIVE commits | `8bdf211` / `ae15db4` |
| SQL / migrations | **None.** One scoped `UPDATE` repairing 7 rows by exact id. |

---

## 1. Root cause

The secure-resume-token rollout copied the `issueResumeLink({...})` call site from
TEST into LIVE **without adapting one identifier**:

| | declared const | call site |
|---|---|---|
| TEST | `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` ✅ |
| LIVE | `SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` ❌ undeclared |

Every LIVE cron tick threw `SUPABASE_SERVICE_ROLE_KEY is not defined`.

**This was a LIVE-only defect.** TEST never reproduced it, so no amount of TEST
running would have caught it — which is exactly why the new guard walks *every*
identifier passed to `issueResumeLink` and requires it to be declared in the file.

Verified against the **deployed v85 artifact**, not just the repo: one occurrence
of the bad identifier, zero of the good one.

### Why it was worse than a stalled drip

1. The SMS path **claimed `sms_5min_sent_at` before minting the link**. The throw
   landed between the claim and the send, so seven leads were permanently marked
   "sent" having received nothing.
2. The throw **escaped the per-lead scope**, aborting the whole run — so every
   *email* stage stalled too, on a defect only the SMS path could trigger.

**Email stages were not corrupted**: they stamp only after a successful send.
Verified — zero email false stamps across all three stages.

---

## 2. Backlog at the checkpoint

| Stage | Due |
|---|---|
| 30-minute email | 8 |
| 24-hour email | 8 |
| 3-day email | 2 |
| 5-minute SMS | 8 (1 genuinely due + 7 released false stamps) |

---

## 3. The code fix

```diff
- serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
+ serviceRoleKey: SERVICE_ROLE_KEY,
```

Plus SMS-path hardening, applied to **both** repos (TEST carried the same latent
ordering defect, it simply never threw):

```
before:  claim sms_5min_sent_at → mint link → send
after:   mint link → claim → send → release claim if not accepted
```

- A link failure now claims nothing and is retried next tick (`sms_link_failed`).
- A rejected send **releases** the claim (`sms_send_failed`) instead of leaving a
  permanent false "sent".
- The release is matched on **the exact timestamp this run wrote**, so a claim a
  concurrent run legitimately took can never be cleared by us.
- The atomic `.is(null)` concurrency lock is untouched — two simultaneous runs
  still send at most one SMS per lead.

---

## 4. False-stamp repair

Seven rows, all still eligible (`status='lead'`, unpaid, no opt-out, zero SMS of
any kind). Repaired by **exact id + exact confirmation id**, with eligibility and
"no communications row" re-asserted inside the `UPDATE`. No wildcard patterns.

| Confirmation id | False stamp (UTC) |
|---|---|
| `PT-MSAXUDQM` | 2026-08-01 22:45:03 |
| `PT-MSB298C0` | 2026-08-02 00:45:05 |
| `PT-MSB2USMC` | 2026-08-02 01:00:04 |
| `PT-MSBAFSSU` | 2026-08-02 04:30:05 |
| `PT-MSBDU6J8` | 2026-08-02 06:15:01 |
| `PT-MSBFYIP1` | 2026-08-02 07:00:05 |
| `PT-MSBH1880` | 2026-08-02 07:30:04 |

**None excluded** — all seven met every condition. Post-recovery each has exactly
**one** outbound SMS, sent during the catch-up, **zero before** — so the stamps
were genuinely false and the repair produced no duplicate.

---

## 5. Controlled catch-up

One invocation, fired by executing cron job 8's own stored command from inside the
database so the cron secret never entered a shell or a transcript.

```
last_run_started_at   2026-08-02 11:37:51.499Z
last_run_finished_at  2026-08-02 11:38:13.618Z
last_success_at       2026-08-02 11:38:13.618Z   ← advanced
last_error_message    null                        ← cleared
last_processed        51
results  step1_30min 8 · step2_24h 8 · step3_3day 2 · sms_5min 8
         skipped 28 · opted_out 5 · expired 0 · dedup_skipped 0
         sms_link_failed 0 · sms_send_failed 0
```

Exactly the 8 / 8 / 2 / 8 backlog. The two new counters appearing in the heartbeat
independently confirm v86 is the running code.

---

## 6. Communication proof

| Channel | Rows | Status | Distinct orders | Distinct dedupe keys |
|---|---|---|---|---|
| `auto_sequence:seq_30min` | 8 | sent | 8 | 8 |
| `auto_sequence:seq_24h` | 8 | sent | 8 | 8 |
| `auto_sequence:seq_3day` | 2 | sent | 2 | 2 |
| 5-minute SMS | 8 | sent | 8 | — |

- 18 distinct orders contacted; **all still `lead`** — 0 with a payment intent,
  0 paid, 0 terminal, 0 email-opted-out, 0 SMS-opted-out.
- All 8 SMS bodies carry a **secure token link**; **0** legacy `?resume=PT-…`
  confirmation-id links.
- No raw token value was read into, or written to, any log or report.

### ⚠️ Observation worth a follow-up (not changed here)

LIVE's GHL send path writes its SMS `communications` row as
`sent_by = "PawTenant System"`, `type = "sms_outbound"` — **not**
`auto_sequence:sms_5min`, which is what the function passes as `sentBy` and what
the audit log records. The send is logged and correct, but it is not attributable
to the sequence from the `communications` table alone.

This matters operationally: the natural "was an SMS actually sent for this lead?"
query keys on `auto_sequence:sms_5min` and finds nothing, so a *genuine* send can
look like a false stamp. The false-stamp detection here was therefore re-run
against `type in ('sms','sms_outbound')` before any row was touched, which
confirmed 0 prior sends for all seven. Changing the attribution was **not**
authorised in this task; it is left as a recommended follow-up.

---

## 7. Guard

`scripts/check-lead-followup-sequence-integrity.mjs` — **15 checks + 11 planted
negative controls**, all caught in both repos, source restored byte-for-byte.

These are Deno edge functions, outside `tsconfig.app.json`, so a plain typecheck
never saw the undeclared identifier. The guard is what catches it:

- **S1** walks every identifier passed to `issueResumeLink` and requires it to be
  declared in that file — the exact defect, generically.
- **S4–S8** pin the claim ordering, the link-failure path, the claim release, the
  release scoping, and "only count a send that was accepted".
- **S9–S11** protect dedupe, the paid/terminal exclusions and opt-out.
- **S12–S13** keep secure tokens and per-lead memoisation.
- **S14–S15** keep the cron-secret gate and ban a hardcoded LIVE ref.

Two assertions were **tightened after their own controls exposed them**:

- **S6** originally checked that `sms_send_failed++` and the null-update both
  *appeared* in the block — a planted `if (false)` between them dead-coded the
  release and still passed. It now requires the release to follow the counter with
  no branch opening in between (assert the *use*, not the mention).
- Three control anchors ended in a bare `\n` and silently no-opped against the
  CRLF LIVE checkout, reporting success while mutating nothing. Made CRLF-safe.

---

## 8. TEST verification — and what was deliberately not done

Verified on TEST: the changed `core.ts` **compiles and deploys** in the Deno edge
runtime (v59 ACTIVE, `verify_jwt=false` preserved), and the guard passes 15/15
with 11/11 controls.

**The full sequence was deliberately NOT executed on TEST.** TEST holds 20
eligible leads of which **10 carry real email addresses**; a run would have sent
20 emails and 16 SMS to real people for no diagnostic value, which the task's
side-effect restrictions forbid. And because TEST never had the defect, running it
could not have exercised the fix anyway.

The behavioural verification therefore happened on LIVE, where the run was
explicitly authorised and operationally required — with a full before/after
accounting (§5, §6) rather than a blind wait for cron.

---

## 9. Preservation

- No duplicate emails — 18 rows, 18 distinct orders, 18 distinct dedupe keys.
- No duplicate SMS — each repaired lead has exactly one outbound SMS, none prior.
- No genuine sent timestamp removed — only stamps written inside the outage window
  with no communications row and full eligibility re-asserted.
- No paid, completed, cancelled, refunded or opted-out order contacted.
- Sequence copy, discount codes, timing thresholds, templates and GHL workflows
  unchanged. No Stripe write, no Ads conversion, no earnings impact.
- No historical audit rows deleted; the repair only nulled seven timestamps.

## 10. Rollback

Forward-only: revert LIVE `ae15db4`, redeploy the function (returns to the v85
source), and re-stamp the seven ids if desired. Nothing else to reverse.
