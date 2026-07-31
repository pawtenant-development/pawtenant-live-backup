# PROVIDER-SUBMISSION-REPLAY-DELIVERED-STATE-IDEMPOTENCY-LIVE-ROLLOUT-001

LIVE rollout of the replay fix proven on TEST `000d926` (fn v60).
Source defect found by `ADMIN-ORDER-PENDING-DELIVERY-LIVE-OPERATIONS-QA-004`.

| | |
|---|---|
| TEST source | `000d926`, `provider-submit-letter` v60 |
| Starting LIVE | `087e6bd`, fn **v107**, `dpl_DJEDtBXjy4SzMh7Y2vRGGUFamFd5` |
| Final LIVE | `98a8b05` (+ docs commit), fn **v108**, `verify_jwt=false` |
| Migration | **none** — the stored state was already readable |

## Pre-deploy data-integrity audit — LIVE was clean

Read-only, before any change. **Zero genuine corruption.**

| Check | Result |
|---|---|
| delivered doc footer id ≠ `orders.letter_id` | **0** |
| multiple ACTIVE version rows per (order, doc_type) | **0** |
| customer-visible approved doc but order = Pending Delivery | **0** |
| completed+notified order still `doctor_status='pending_admin_approval'` | **0** |
| version rows > letter documents | **0** |

Two counts looked suspicious and were both cleared:

* **3 orders with >1 `letter_verifications`** — `PT-PSDXYJXUHIC` (3), `PT-PSD9GF1AX10` (2),
  `PT-PSD786L78H1` (2). All have `verifs == docs == versions` with exactly **one
  active version**, and `orders.letter_id` equals the latest. That is the
  signature of **genuine revisions**, which mint their own id by design — not
  replay corruption, whose signature is *more verifications than versions*.
* **7 orders with verifications > `%_letter` documents** — each has exactly **one**
  verification. Their single document predates the `doc_type` taxonomy, so the
  filter, not the data, was wrong.

No data repair was required. The rollout was a pure code deploy.

## Reconciliation — surgical, not a copy

`diff` of LIVE vs TEST `provider-submit-letter` showed exactly three hunks. Only
one was ported:

| Hunk | Decision |
|---|---|
| line 362 — staff-alert logo `static.readdy.ai` (LIVE) vs `pawtenant.com/assets/...` (TEST) | **NOT ported.** Copying it would rebrand every production staff email. Guard S18 pins the LIVE host. |
| lines 645–725 — replay block | **PORTED.** LIVE's block was byte-identical to TEST's pre-fix version. |
| line 1089 — comment wording | **NOT ported.** Cosmetic. |

## The fix

Previous ordering: slot RPC → *(reuse stored URL)* → order patch → revision probe →
verification id → footer → version → gate → auto-deliver → notify → earning.

Final ordering: slot RPC → **`if (isReplay)` → discard duplicate upload → read
stored document + order → return** → *(everything above unreachable on a replay)*.

Root cause was never one line: once a first submission is delivered an ACTIVE
version row exists for `(order, doc_type)`, so the revision probe classified the
replay as version 2 — and a revision mints its own verification id **by design**.
The order patch separately wrote `doctor_status='pending_admin_approval'`
unconditionally. Nothing consulted `isReplay`, so the only safe cut point is
before all of them.

Every response field is READ from `order_documents`/`orders` — `reviewStatus`,
`customerVisible`, `letterId`, `autoDelivered`, `patientNotified`, `orderStatus`,
`doctorStatus`, `processedPdfUrl`, `fileUrl`. Nothing hardcoded.

## Bounded LIVE verification (gate stayed ON throughout)

Fixture `PT-LIVE-PENDINGQA-61` (reserved GHL-suppressed namespace), synthetic
`.test` provider and customer. Submitted through the deployed function, then
**approved and delivered through the real Admin “Approve & Deliver” UI** (which
requires ticking the reviewed-details confirmation first).

### Delivered baseline

document `718aa80e`, `letter_id` = `footer_letter_id` = **ESA-CA-H3ZK9TU**,
`review_status=approved`, `customer_visible=true`, order `completed` /
`patient_notified`, notified `17:45:44.232`, 1 version, 1 verification.

### After 15 replays — every value identical

1 exact replay + 5 sequential + 8 **concurrent** + 1 different-filename replay.

| Field | Before | After |
|---|---|---|
| document id | `718aa80e` | `718aa80e` |
| `orders.letter_id` | ESA-CA-H3ZK9TU | ESA-CA-H3ZK9TU |
| PDF footer id | ESA-CA-H3ZK9TU | ESA-CA-H3ZK9TU |
| review_status / customer_visible | approved / true | approved / true |
| order status / doctor_status | completed / patient_notified | completed / patient_notified |
| patient notified at | 17:45:44.232 | 17:45:44.232 |
| documents / versions / verifications | 1 / 1 / 1 | 1 / 1 / 1 |
| doctor notifications / status logs | 1 / 2 | 1 / 2 |
| GHL events | 0 | 0 |
| storage objects | 2 | 2 |

All 8 concurrent requests reached the server (0 client failures) and converged on
one document id and one verification id, all `replayed:true`, all HTTP 200.

> **Read the audit/earning counts carefully.** The delivered-baseline snapshot was
> taken seconds after clicking Approve, while the approval's async tail was still
> landing, so audits later read 3→4 and earnings 0→1. Timestamps settle it: the
> newest row is `customer_email_sent` at **17:45:48**, and every replay ran from
> ~17:47 onward. **The replays created zero rows.**

### Fingerprint controls

* different filename, identical bytes → **replay** (same doc + id) — fingerprint is
  content-based SHA-256, not the filename.
* same filename, different bytes → **HTTP 409
  `approved_document_requires_reopen`** — the delivered-document protection still
  holds, and a replay is not a back door around it.

### Admin UI

After all 15 replays: **Pending Delivery card = 0**, Completed 196 → 197, one
customer-visible document, no second approval card, no phantom Pending Delivery
row. Under the old code the replay would have dragged this order back into the
queue.

## Safety ledger

* Real human recipients **0**; SMS **0**; Stripe writes **0**; refunds **0**.
* GHL forwarded events for the fixture **0** (reserved-namespace suppression held).
* `.test` API attempts: one customer `letter_ready` email to
  `replayqa.customer61@pawtenant-qa.test`.
* `provider_letter_submitted` staff alert disabled **17:40:42 → 17:42:24 (102s)**
  and restored with its exact three recipients. **Zero genuine provider
  submissions fell inside the window.**
* Approval gate remained **ON** for the entire task.

## Cleanup and preservation

Fixtures 0, reserved Storage objects 0 (deleted by **exact name** — the list
API's `search` returns 0 for flat names and would falsely read clean), synthetic
auth user and profile 0. Whole-table counts returned to the exact pre-task
baseline: orders **1733**, documents **482**, versions **36**, verifications
**414**, provider earnings **497**.

## Rollback

Do **not** redeploy v107 — it contains the corrupting behaviour. Roll forward
only. If the hard no-op proves too strict, allow a replay to *complete missing
processing* while still forbidding any new verification id, any `letter_id` write
and any `doctor_status` write.

Known trade-off (unchanged from TEST): a first submission that failed partway
(e.g. footer injection errored) can no longer be completed by a provider
re-upload; it needs an admin re-process.

## Next

`ADMIN-ORDER-PENDING-DELIVERY-LIVE-OPERATIONS-QA-004` is unblocked — resume the
manual Return-to-Under-Review validation, notification groups and deep links, the
realtime matrix, stale-response/flicker proof, Customer and Provider View
projections, and the five-width responsive matrix.
