# PROVIDER-DOCUMENT-SINGLE-CURRENT-PENDING-VERSION-LIVE-ROLLOUT-001

**Status:** ✅ LIVE COMPLETE
**TEST source:** `6bd0eca` (`pawtenant-test`, project `opudhofjbydrljgleofq`)
**LIVE start:** `8eb5d14` → **LIVE final:** `a057cac` (project `cvwbozlbbmrjxznknouq`)
**Date:** 2026-07-31

---

## 1. Defect closed

`provider-submit-letter` retired a prior submission **only** when it sat in
`needs_correction`:

```ts
.eq("review_status", "needs_correction")
```

So: v1 submitted → admin requests correction → v2 submitted (v1 correctly
retired) → **v2 submitted again → nothing in `needs_correction` to retire → TWO
rows at `pending_admin_approval`.**

`OrderDocumentReviewPanel` selects
`review_status in (pending_admin_approval, needs_correction)` and renders one card
per row, so the employee saw **two Approve & Deliver buttons and two attestation
checkboxes**. `approve_order_document()` is idempotent *per document* but has no
cross-document exclusivity, so **both could be approved** — releasing two
customer-visible letters with two different verification IDs.

**Widening the status filter was not the fix.** The old path was three unlocked
round trips (SELECT candidates → INSERT → UPDATE candidates), so two *concurrent*
submissions each read an empty candidate set and each inserted. Enumerating one
more status does not change that.

---

## 2. Architecture

| Layer | What |
|---|---|
| Atomic RPC | `provider_submit_document_slot(...)` — replay detection, delivered-document guard, supersede, insert, audit, all in ONE transaction |
| Lock scope | `pg_advisory_xact_lock(hashtextextended(order_id \|\| ':' \|\| doc_type, 0))` — same key `create_document_version()` uses, so a later version re-enters the same lock |
| Invariant | `uq_order_documents_one_current_unapproved` UNIQUE on `(order_id, doc_type)` WHERE `review_status in ('pending_admin_approval','needs_correction')` |
| Grants | anon ❌ · authenticated ❌ · service_role ✅ · `search_path` pinned · RLS intact |
| Authorisation | by **capability** (`auth.role()`), never a bearer/key string compare — LIVE carries both a legacy JWT and `sb_secret_` keys |

**Scope is `(order_id, doc_type)`, never order alone.** A combo order legitimately
has the ESA/PSD letter *and* the completed Housing form pending at once; a
per-order constraint would break every one.

**Replay identity is a sha256 of the uploaded bytes** — it cannot be the storage
path or signed URL, because the multipart path mints
`${stem}/provider/${Date.now()}-${uuid}-${name}`, so a genuine replay produces a
different object every time. On replay the caller reuses the **existing** row's
`file_url`; the version idempotency keys are file-derived, so keeping the new URL
would mint a second version and a second verification ID.

---

## 3. LIVE historical conflict audit (run BEFORE the index)

| Check | Result |
|---|---|
| `(order, doc_type)` with >1 `pending_admin_approval` | **0** |
| with >1 `needs_correction` | **0** |
| with >1 current unapproved (**blocker**) | **0** |
| with >1 `approved` + `customer_visible` | **0** |
| self-referencing / dangling / cyclic supersede links | **0 / 0 / 0** |
| version self-ref, self-parent, orphan parent | **0 / 0 / 0** |
| `(order, doc_type)` with >1 ACTIVE version | **0** |
| **rows currently in the index subset** | **0** |

The index subset was **empty** (476 documents, none unapproved), so creation could
not fail and repaired nothing.

> **Reported, not repaired.** 5 documents are `superseded` while still
> `customer_visible`: `PT-PSDWRWALQ8J` (×2), `PT-MQZQBUZR`, `PT-MR18ROL7`,
> `PT-MR285V7Y` — all uploaded 2026-06-30/07-01, i.e. **before the approval gate
> shipped (2026-07-29)**. Each carries `sent_to_customer=true` and
> `footer_injected=true`: they were genuinely delivered under the pre-gate regime,
> then superseded by a revision. A delivered document is never taken away from the
> customer (`resolveCustomerDocuments` picks the newest finalized letter), so this
> is the documented design, not a leak. They sit outside every constrained state
> and were deliberately left untouched. `audit_order_document_current_conflicts()`
> therefore reports `superseded_but_customer_visible: 5` on LIVE — expected. The
> blocker field is `groups_with_multiple_unapproved`.

---

## 4. Reconciliation — NOT a copy

Diffed TEST vs LIVE hunk-by-hunk (CRLF normalised first). **Two LIVE-only
behaviours were preserved that a verbatim copy would have destroyed:**

1. **Staff-alert logo host.** LIVE uses `static.readdy.ai/...`; TEST uses
   `pawtenant.com/assets/brand/pawtenant-logo-white-02.png`. A blind copy would
   have silently rebranded every production staff email. Guard **S18** now pins it.
2. **The LIVE approval-gate comment** naming the LIVE rollout task.

After reconciliation the only TEST↔LIVE deltas in the file are exactly those two.

---

## 5. LIVE QA — through the REAL deployed function

Fixture: **`PT-LIVE-PENDINGQA-31`**, `.test` customer and provider, synthetic
payment id, no Stripe object, TX (non-30-day), synthetic provider auth identity.

> ⚠️ **The task-suggested fixture id `PT-LIVE-PENDINGQA-SLOT-01` was NOT used, and
> must never be.** The permanent GHL suppression matches
> `/^PT-LIVE-PENDINGQA-\d{2,4}$/`. `...-SLOT-01` does **not** match it, so using it
> would have bypassed the very control that keeps synthetic events out of GHL.
> A conforming id (`-31`) was used instead. Guard **S19** now pins the pattern.

| # | Test | Result |
|---|---|---|
| A | First submission | 1 pending, 1 card ✅ |
| B | Second (distinct) | v1 superseded+hidden; v2 only pending ✅ |
| C | Third (distinct) | v1,v2 superseded; v3 only pending ✅ |
| D | **Exact replay** | `replayed:true`, **same documentId AND same letterId** ✅ |
| E | **5 CONCURRENT distinct** | exactly **1** pending / **1** admin card; all 8 rows + 8 files preserved ✅ |
| F | **5 CONCURRENT identical** | all 5 `replayed:true`, **1 distinct documentId, 1 distinct letterId** ✅ |
| G | Needs Correction → resubmit | correction row superseded; 1 card ✅ |
| G2 | Same bytes once pending | replays, no duplicate ✅ |
| H1 | Raw INSERT of 2nd pending row | **BLOCKED** by the unique index ✅ |
| H2 | Revive superseded → queue | **BLOCKED** by the unique index ✅ |
| I2 | Different file after delivery | **409 rejected**, delivered doc untouched ✅ |
| I3 | Replay of the delivered file | clean no-op replay ✅ |
| I4 | Same file **after a formal reopen** | **accepted** ✅ |
| J | Customer under RLS | sees **only** the approved doc — no pending, no superseded ✅ |
| K | Provider (non-admin) under RLS | 11 rows, 11 distinct files — full history ✅ |
| L | Admin panel query | **1 card, 1 Approve & Deliver button** ✅ |

H1/H2 ran inside an explicit transaction that **rolled back**; verified afterwards
that document count and both hashes were unchanged.

**Idempotency counts** — 20 HTTP submissions → 11 documents, 11 versions, 11
verification IDs, 11 provider bell rows, 9 supersede audit rows, **0** earnings.
The 9 replays and the 1 rejection created nothing.

**Orphan storage:** 10 objects retained = exactly the 10 genuine uploads at that
point. All replayed and rejected uploads were discarded by `discardUploadedObject`.

---

## 6. Message safety

| Item | Value |
|---|---|
| Staff alert (`provider_letter_submitted`) pre-QA | `enabled=true`, 3 real recipients |
| Disabled at | `2026-07-31 00:13:00.553392+00` |
| Restored at | `2026-07-31 00:22:14.190315+00` (≈9m14s) |
| Restored state | `enabled=true`, same 3 recipients, `email_override=null`, `group_emails=null` — **identical** |
| Genuine provider submissions during the window | **0** — nothing to reconcile |
| Scope | ONLY that one `notification_key`; no other alert touched |
| GHL rows for the fixture | **0** |
| GHL rows during the entire QA window | **0** |
| Real human recipients emailed | **0** |
| SMS | **0** · Stripe writes **0** · refunds **0** |

A real provider submission (`PT-MS7YOGVZ`) landed at `00:38:43`, **after** the
alert was restored, so it alerted staff normally — and it exercised the new v107
path, producing exactly **one** admin approval card. Real-world validation.

---

## 7. Preservation

Counts moved during the rollout because production kept running. What matters is
that **no pre-existing row changed**. Restricting the hashes to rows that existed
at the pre-change baseline:

| Hash (baseline-scoped) | Before | After |
|---|---|---|
| `order_documents` ids (476 rows) | `4b4f76622d19921586c82b29dcea13fb` | **identical** |
| `order_documents` state (url\|status\|visible) | `785c523bdc8779dcacfed7bc9df9eac9` | **identical** |
| `order_document_versions` ids | `6b526d8a465a51ff7b63b46bfc34df54` | **identical** |
| `letter_verifications` ids | `d52944477e9ab13944d4b88e289577c9` | **identical** |

Every delta was verified row-by-row as organic production traffic
(`is_fixture=false`): 1 real provider document, 1 verification, 1 version, 5 new
orders, 2 doctor earnings, 31 communications. **No historical document deleted or
hidden; no real earning changed; no Additional Pet row touched (0 before, 0
after); no Stripe write; no historical California order altered.**

Fixture residue: orders **0**, profiles **0**, storage **0**, auth user **deleted
(404 confirmed)**. Approval gate **ON**. Staff alert **ON**.

---

## 8. Guards, checks, deployment

| Item | Result |
|---|---|
| `check-provider-document-single-current-pending` (LIVE) | **21/21**, **26/26** negative controls caught |
| `check-provider-document-approval-gate` | 32/32 |
| `check-pending-delivery-live-rollout` | 23/23 |
| `check-contact-submission-privacy` | 14/14 |
| GHL reserved-QA guard (in build) | 11/11 |
| Edge function module graph | 3/3 |
| Type-check | exit 0 |
| Production build | exit 0 |
| `provider-submit-letter` | **v106 → v107**, `verify_jwt=false` **preserved** |
| Bundle boot proof | 401 `Missing authorization` / 401 `Unauthorized` from our own code |
| `ghl-webhook-proxy` | untouched at v118 |
| Vercel | newest production deployment **READY** |
| `pawtenant.com` serves | `a057cacc0972593985acb224c58610588e5b389d` = final LIVE HEAD |

### Pre-existing failures — NOT caused by this rollout

Both were confirmed failing on **pristine LIVE HEAD `8eb5d14`** via `git archive`,
before any edit, and were deliberately **not** fixed here (surgical scope):

1. `check-refund-consumer-guard` — `!!refunded_at` boolean reads in
   `OrderAdditionalPetPanel.tsx:152` and
   `provider-additional-pet-decision/index.ts:246` (commit `5078380`, 2026-07-27).
2. `check-entitlement-document-versioning` — 3 stale assertions: it pins the
   revision idempotency-key shape that `ORDER-ADDITIONAL-PET-FINAL-TEST-CLOSURE-001`
   deliberately replaced (**the guard pins the bug**), and looks for the
   customer-email suppression in `provider-submit-letter` after the approval gate
   moved it to `admin-review-document`. **A validated fix already exists on TEST
   (`6bd0eca`)** and can be ported in a separate narrow commit.

---

## 9. Commits

| SHA | Message |
|---|---|
| `d2c6fe9` | feat: enforce one current provider document approval |
| `38789df` | fix: reconcile provider submission replay and replacement |
| `a057cac` | test: guard provider document concurrency invariant |
| *(this file)* | docs: record provider document LIVE rollout |

---

## 10. Rollback

```sql
drop index if exists public.uq_order_documents_one_current_unapproved;
drop function if exists public.provider_submit_document_slot(
  uuid, text, text, text, text, text, text, integer, text, text, uuid, text);
drop function if exists public.audit_order_document_current_conflicts();
-- superseded_at / submission_fingerprint are additive; leave them.
```
Then `git revert` the function commit and redeploy with `--no-verify-jwt`.

**Do not roll back by permitting multiple active pending documents.** Rolling the
function back to v106 restores the two-card defect. Preferred: keep the index
(it is safe and load-bearing) and fix forward. Keep the approval gate ON, keep the
`PT-LIVE-PENDINGQA` GHL suppression, keep the contact privacy hotfix.

---

## 11. Follow-ups

- **Next LIVE task:** `ADMIN-ORDER-PENDING-DELIVERY-LIVE-OPERATIONS-QA-004` — now
  unblocked. Not started here.
- Port the TEST fix for the stale `check-entitlement-document-versioning`
  assertions into LIVE.
- Pre-existing: `!!refunded_at` boolean reads in the Additional Pet surface.
- Observation (pre-existing versioning behaviour, unchanged by this task): each
  *distinct* submission mints its own verification ID even when the prior one was
  superseded before ever being approved, so IDs can exist for never-delivered
  drafts. Replays correctly mint none. Worth a future review of whether an
  unapproved draft should mint a publicly-resolvable ID at all.
