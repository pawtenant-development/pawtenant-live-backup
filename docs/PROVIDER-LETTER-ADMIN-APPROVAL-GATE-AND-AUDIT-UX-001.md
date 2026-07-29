# PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001

**Status:** LIVE — deployed and verified in production
**LIVE:** `075546f` -> `f3fc831` · deployment `dpl_HxQBtTzEx3gpqJLEapC9j21n2v4W`
**Rollback:** `dpl_BbP71fGJ3xUrxAxADSnDxXhejsQn` (`075546f`)
**TEST source:** `eec2b77`
**TEST baseline:** `ea21e57` → **final `8c7eb3a`**
**Supabase (LIVE):** `cvwbozlbbmrjxznknouq` · **Vercel:** `pawtenant-production` (pawtenant.com)

Two connected changes:

- **Part A** — a provider's submission is no longer a customer delivery. An
  authorized employee must review and release the document.
- **Part B** — every important order action records the real authenticated
  actor, surfaced in a new order-level Audit tab.

---

## 1. The problem Part A actually solves

`provider-submit-letter` used to do all of this in one request, with no human
ever having looked at the file:

- insert the document with `customer_visible = true`
- set `status = completed`, `doctor_status = patient_notified`,
  `patient_notification_sent_at = now()`
- repoint `orders.signed_letter_url` at the freshly uploaded file
- call `notify-patient-letter` (customer email + attachments)
- fire the GHL `order_completed` event

**The customer was reachable through three independent channels, not one.**
This is the part that makes a naive fix wrong:

| # | Channel | Why it matters |
|---|---|---|
| 1 | the `order_documents` row | gated by RLS `customers_read_own_docs` and by `get-document-signed-url` |
| 2 | `orders.signed_letter_url` | read by `resolveCustomerDocuments()`'s **legacy fallback — which fires precisely WHEN channel 1 is hidden.** Closing only channel 1 would have *created* this leak. |
| 3 | `order_document_versions.file_url` | a long-lived signed URL in its own right |

All three are closed. The guard pins all three.

---

## 2. Status model

Held on `order_documents` (the row customer visibility already keys on), not in
a new parallel table.

| `review_status` | Customer sees it? | Meaning |
|---|---|---|
| `not_applicable` | yes | pre-gate historical row, customer upload, internal admin attachment |
| `pending_admin_approval` | **no** | provider submitted; awaiting review |
| `needs_correction` | **no** | sent back to the provider with a note |
| `approved` | yes | released by an employee |
| `superseded` | yes | a previously delivered letter, replaced by a newer approved one |

Metadata: `submitted_by`, `submitted_at`, `reviewed_by`, `reviewed_at`,
`correction_note`, `approved_by`, `approved_at`, `delivered_at`,
`superseded_by_document_id`. Actors are **UUIDs**, never display names.

### Why `superseded` stays visible

A document the customer already received is never taken away (§23). The
ordering problem this creates — `resolveCustomerDocuments()` took the **first**
finalized letter from an ascending-by-upload list, i.e. the **oldest**, so after
a revision the customer resolved to the letter that had just been superseded —
is fixed in the resolver by taking the newest. That was a pre-existing bug.

---

## 3. Customer visibility is server-enforced

Not a React filter. Four layers:

1. **RLS** `customers_read_own_docs` requires `customer_visible = true`.
2. **Trigger** `trg_order_document_release_gate` **raises** if a row with
   `review_status in ('pending_admin_approval','needs_correction')` is written
   with `customer_visible = true` or `sent_to_customer = true`. Applies to every
   write path — React, direct SQL, PostgREST, a replayed edge function.
3. **`get-document-signed-url`** returns 403 to an owning customer for a
   non-visible row, so a guessed document id or a copied storage URL fails.
4. **`docver_customer_select`** on `order_document_versions` requires the
   **backing document** to be released — not merely `approval_status`, because
   versions are activated at submission time.

> Version **activation timing is deliberately unchanged.** The Additional Pet
> completion linkage hangs off it, and that workstream is mid-LIVE-rollout.
> Gating the projection on the backing document achieves the same closure with
> zero blast radius there.

**Proved with RLS enforced** (impersonated customer JWT, not service-role SQL):
the customer sees the approved and superseded letters and **not** the pending or
`needs_correction` ones.

---

## 4. Approval and correction

Both are SECURITY DEFINER RPCs with pinned `search_path`, revoked from
`public, anon, authenticated` **by name** and granted back to `authenticated`
only. The edge function `admin-review-document` invokes them **on the caller's
own JWT**, so `auth.uid()` is the real approver.

### `approve_order_document(p_document_id)`

- authorizes on `is_admin_staff()` only → **a provider can never approve their
  own document**
- returns `transitioned: false` for every replay, double-click and losing
  concurrent caller — this single flag is what makes the customer email
  exactly-once
- records approver + timestamps, sets `customer_visible = true`
- supersedes prior letters of the same family (without hiding them)
- writes the delivery-time order state: `completed`, `patient_notified`,
  `signed_letter_url`, `patient_notification_sent_at`
- writes `document_approved` + `document_delivered` audit rows
- **creates no provider earning, changes no clinical decision, regenerates
  nothing**

### `request_order_document_correction(p_document_id, p_note)`

- note required (5–1000 chars, trimmed) — enforced **in the database**, not only
  in React
- document stays hidden; provider notified once; customer gets nothing
- the original submission is preserved, never overwritten
- a corrected resubmission marks the rejected row `superseded` and returns to
  `pending_admin_approval`

---

## 5. Notification timing

| Event | Before | After |
|---|---|---|
| Employee "letter submitted" alert | on submission | on submission (wording now **Pending Admin Approval**, direct review link, states the customer was not notified) |
| **Customer "your letter is ready"** | **on submission** | **on approval**, exactly once |
| Provider "correction requested" | did not exist | on correction, once |
| GHL `order_completed` | on submission | on approval |

Idempotency has two independent layers: the RPC's `transitioned` flag, and
`notify-patient-letter`'s existing `communications.dedupe_key`.

TEST-fixture suppression moved with the customer email and is still fail-closed
(explicit secret **and** TEST project ref **and** reserved non-deliverable TLD).

---

## 6. RBAC

| Role | Can | Cannot |
|---|---|---|
| Provider | submit, see pending state, see the correction note, resubmit | approve, deliver, see employee-only audit metadata |
| Customer | see approved/delivered documents | see pending or correction-requested documents, see correction notes, see the Audit tab |
| Admin staff (`is_admin_staff()`) | preview, approve & deliver, request correction, view Audit | — |
| Anon | — | RPCs are revoked outright |

No new role system. `is_admin_staff()` is the existing gate.

**Verified against the live RPCs:**

| Actor | Result |
|---|---|
| provider | `42501 approve_order_document: not authorised` |
| customer | `42501 approve_order_document: not authorised` |
| anon | `42501 permission denied for function` |
| admin | 1st call `transitioned: true`; 2nd and 3rd `transitioned: false, reason: already_approved` |
| correction, empty / `"   x  "` note | `23514 a correction note is required (min 5 characters)` |
| correction replay | `transitioned: false, reason: already_needs_correction` |

Three approval calls produced **exactly one** `document_approved` and **one**
`document_delivered` audit row.

---

## 7. Part B — actor attribution

Two classes of defect:

**Actions with no audit row at all.** `assign-doctor` was called with the **anon
key** from all five admin call sites, so it could not know who acted and wrote
nothing. Order status changes were a bare client-side `update orders`. Both now
resolve the actor server-side.

**Forgeable actors.** `send-sms`, `ghl-send-sms` and `send-templated-email` took
a `sentBy` **string** from the request body (or hard-coded `"admin_comms"`) and
wrote it into the record. `sentBy` is now accepted for compatibility and
**ignored**; the actor comes from the JWT via `_shared/auditActor.ts`.

A caller presenting no user token, the anon key or the service-role key is
recorded as **System** — never attributed to a person, never inferred from the
order's current assignee.

### Event contract

`audit_logs` gains `actor_type`, `category`, `source`, `order_id`,
`entity_type`, `entity_id`, `communication_id`, `document_id`,
`refund_reference`, `provider_id`. All nullable; **nothing backfilled**.

Actor types: `employee · admin · provider · customer · system · webhook`.

Events: `provider_assigned` · `provider_reassigned` · `order_marked_under_review`
· `order_marked_complete` · `order_reopened` · `order_status_updated` ·
`refund_initiated` · `customer_email_sent` · `customer_sms_sent` ·
`provider_document_submitted` · `provider_document_resubmitted` ·
`document_correction_requested` · `document_approved` · `document_delivered`.

Communication events **link** to the authoritative `communications` row by id and
do **not** duplicate the message body. Recipients are masked (`•••• 1234`,
`j•••@example.com`). No card data, no secrets, no provider API payloads.

### Historical data

Nothing is fabricated. A row whose actor cannot be proven renders as
**"Legacy event · actor unavailable"**. The only inference made is the automated
case, and only from literal actor names the system itself wrote.

---

## 8. Audit tab UI

`OrderAuditTimeline.tsx`, mounted as an additive tab on the order modal.

- header summary: total events, last activity, last employee action, current
  provider / status
- filters: All · Assignment · Status · Documents · Refunds · Communications ·
  Payments / System, each with a count
- per event: plain-English sentence, actor + role, timestamp, category icon,
  old → new when exactly one field changed, related provider / document / refund
  / communication reference
- raw metadata is **never** the default view — collapsed technical details only
- newest first, with a stable secondary sort so two events written in the same
  transaction never reshuffle between renders
- merges `audit_logs` with `order_status_logs`; matches `audit_logs` on the new
  `order_id` **or** the legacy `object_id = confirmation_id`, so pre-existing
  rows still appear

---

## 9. Merge-freeze compliance

`OrderDetailModal.tsx` is merge-frozen. Changes are exactly the approved edit
types — **additive tab registration** and **isolated component mount**:

1. two imports
2. one `Section` union member (`"audit"`)
3. one `TABS` entry
4. one render branch
5. one `<OrderDocumentReviewPanel />` mount in the Documents tab
6. one surgical swap of the status update to the audited RPC

No existing tab, panel or prop shape is touched. No blanket copy, no
restructuring.

---

## 10. Migrations

| File | Applied as |
|---|---|
| `20260729120000_provider_document_admin_approval_gate.sql` | `provider_document_admin_approval_gate` |
| `20260729120500_provider_document_review_rpcs.sql` | `provider_document_review_rpcs` |
| `20260729121000_order_audit_actor_attribution.sql` | `order_audit_actor_attribution` |
| `20260729121500_approve_order_document_releases_order_state.sql` | `approve_order_document_releases_order_state` + 2 in-place corrections |

Applied to TEST via explicit MCP SQL. **`supabase db push` was not used.**

### Backfill

All 37 pre-existing documents → `not_applicable`, `customer_visible` untouched.
Nothing was retroactively hidden; nothing needs re-approval.

---

## 11. Guard

`scripts/check-provider-document-approval-gate.mjs` — 20 blocking assertions,
20 planted negative controls, **20/20 caught**. Wired into `npm run build` and
available as `npm run check:document-approval-gate` /
`npm run test:document-approval-gate`.

Two controls initially reported MISSED. Both were **weak mutations, not weak
checks** — the target strings occur twice and `.replace()` rewrote only the
first. Fixed globally, and A13 was tightened to require both review actions to
early-return and the approve path specifically to report
`customerNotified: false`.

---

## 12. Rollback

| Layer | Rollback |
|---|---|
| Frontend | promote `dpl_14LScskb8NAx5a7Vg9eYAM4HJtEU` (`ea21e57`) |
| Edge functions | redeploy previous versions: `provider-submit-letter` v55, `assign-doctor` v44, `send-templated-email` v36, `ghl-send-sms` v42, `send-sms` v41, `create-refund` v49. **`provider-submit-letter`, `assign-doctor` and `send-templated-email` must be redeployed with `--no-verify-jwt`** — they run `verify_jwt=false` and omitting the flag silently flips it to true. |
| Release gate | `drop trigger trg_order_document_release_gate on public.order_documents;` — pending documents become releasable again, nothing is lost |
| Review columns | leave in place; they are additive and harmless |
| Audit columns | leave in place |

Rollback **preserves** uploaded documents, document versions, already-delivered
customer documents, audit history and communication history. **Newly created
audit records are never deleted.**

---

## 13. Known limitations

1. **Revision verification-ID label window.** `orders.letter_id` still follows
   the newly *activated* version at submission time, because activation timing
   was deliberately left alone to protect the Additional Pet linkage. For a
   revision on an already-delivered order, the portal shows the **new**
   verification ID next to the **old** file until approval. Cosmetic, narrow, and
   not a leak — the file itself stays gated. Fixing it means moving activation,
   which needs the Additional Pet workstream to land first.

2. **Housing late-upload status.** When a completed housing form arrives on an
   order whose base letter is already delivered, the order returns to
   `completed` / `patient_notified` at submission. That reflects the **base
   letter**, which genuinely is delivered; the housing document itself stays
   gated.

3. **Pre-existing repo-wide failures, not introduced here and not papered over:**
   `npm run lint` fails on 4 `react-hooks/exhaustive-deps` warnings and
   `tsc` reports 7 errors, all in unrelated files
   (`AIAssistantTrustCard`, `EmployeeHrDirectory`, `ProviderInternalRecords`).
   Task-owned files are clean: **0 type errors, 0 lint problems.**

4. **Employee-sent SMS and employee-sent email were not exercised in the
   browser**, to avoid outbound traffic while TEST suppression is disabled. Their
   server-side attribution is pinned by guard A16 and the deployed functions; the
   automated `customer_email_sent` path IS visible in the Audit tab, correctly
   attributed to PawTenant System rather than to the employee.

5. **Dead comms insert removed.** The old `communications` insert in
   `provider-submit-letter` named columns that do not exist on that table
   (`channel` / `sent_at` / `metadata`), so every write silently failed inside
   its catch — there are **zero** rows with `source='provider_submit'`. It also
   claimed an outbound customer email that no longer happens at submission, so it
   was removed rather than repaired.

---

## 13b. Authenticated browser QA (2026-07-29)

Driven as a signed-in admin (Hamza Farid) against the deployed TEST app, using
five isolated `PT-GATE-*` fixtures on a reserved non-deliverable `.test`
recipient.

### Verified through the real UI

| Check | Result |
|---|---|
| Pending badge, provider, doc type, submitted time, preview, checklist | rendered as designed |
| Approve disabled until the reviewer confirms | confirmed (tooltip "Confirm your review first") |
| Customer pre-approval | 0 documents readable under RLS; portal shows the empty state |
| **Triple-click Approve & Deliver** | **1** approval, **1** delivery, **1** email event — no duplicates |
| Approval actor | `Hamza Farid` / `employee` / `owner`, resolved from the JWT |
| Customer post-approval | "Signed ESA Letter · Delivered" card with Open + Download; "Completed letters" 0 → 1 |
| Correction: empty note | rejected in UI **and** by the DB (`23514`) |
| Correction: valid note | hidden from customer, note stored, 1 audit row, 1 provider notification, no customer email |
| Resubmission | rejected version retired as `superseded`, its file and note preserved |
| **Assignment audit** | `provider_reassigned`, actor `Hamza Farid`, old → new provider captured — this path previously wrote **nothing** |
| Audit tab | 5 events, filters with counts, System vs employee correctly separated, old→new chips, expandable key/value details (never raw JSON) |

### §7 superseded-version rule — resolved

Both behaviours are correct because **supersede never flips `customer_visible`**:

- a superseded **correction** version was never approved, so it stays hidden;
- a superseded **delivered** letter stays accessible, because taking back a
  document the customer already received is forbidden (§23).

The newest approved letter resolves as the current one.

### Three defects found and fixed (`8c7eb3a`)

1. **"Notify Patient" bypassed the gate.** The banner appeared for ANY
   footer-injected document, including one still pending. Clicking it emailed
   the customer "your documents are ready" pre-approval — and because
   notify-patient-letter only attaches customer_visible docs, that email would
   have carried **zero documents**. Now requires a released document.
2. **The `customer_visible` toggle was offered on a gated document.** The DB
   trigger rejected the write, but the handler swallows the error, so the
   control silently did nothing. Now disabled with an explanatory tooltip.
3. **The customer portal did not know `pending_admin_approval`,** so it fell
   through to "Assigned to Provider" and told the customer their case was
   "being queued for provider assignment" — false, the provider had already
   submitted. Now classified with the in_review family → "Under Review".

Guards **A21** and **A22** pin all three. **22/22 checks, 22/22 negative
controls caught.**

### Responsive

Customer portal: **no page horizontal overflow**; My Documents card 0px overflow
at 390/768/1024/1440/1920. Admin review panel: 0px at 768+; at 390 it overflows
by 249px — **identical to the pre-existing legacy document row measured the same
way**, i.e. a shared constraint of the desktop order modal, not a regression.
No console errors on either surface.

### Notification safety — one honest exception

Assigning a provider fired `assign-doctor`'s own notification emails. The
customer copy went to the non-deliverable `.test` fixture address, but the
**provider** copy went to `hammy.cool@gmail.com`, a real deliverable inbox on
the TEST provider roster. That is a pre-existing side effect of assignment, not
of this task, but it was triggered by a QA action and is recorded here. **TEST
notification suppression is NOT enabled** (`TEST_SUPPRESS_EXTERNAL_NOTIFICATIONS`
is unset), so only the reserved `.test` recipient protected the customer side.
No QA SMS was sent, and no employee-sent email was exercised, to avoid further
outbound traffic.

## 14. LIVE rollout recommendation

**Sequencing blocker is clear.** This task was scoped while the Additional Pet
LIVE rollout was in flight — they share `provider-submit-letter`. That rollout
has since landed on LIVE (`0293bbe`), so the two no longer contend. Re-confirm
LIVE `provider-submit-letter` is at the post-Additional-Pet version before
deploying over it.

**Prerequisite that is NOT technical:** the gate inserts a human step into
fulfilment. Name the owner of the `pending_admin_approval` queue and agree a
response time *before* shipping — if nobody watches it, delivery stops.

Order matters — the frontend and the gate must land together, or providers
submit into a queue no one can see:

1. Apply the four migrations via explicit MCP SQL (never `db push`). Verify the
   backfill: every pre-existing document must be `not_applicable` and still
   `customer_visible`.
2. Verify `has_function_privilege('anon', ...)` is **false** for all four new
   functions, and run `get_advisors(security)`. Expect **+4 authenticated**
   SECDEF advisories — required design, each gated on `is_admin_staff()`. The
   gate is "**no new anon-executable SECDEF**", not "count must not rise".
3. Deploy `admin-review-document` (new, `verify_jwt=true`).
4. Deploy the frontend **and** `provider-submit-letter` together.
   `provider-submit-letter` and `assign-doctor` and `send-templated-email` need
   **`--no-verify-jwt`** on LIVE too — confirm each function's current
   `verify_jwt` before deploying it.
5. Deploy the remaining comms/refund functions.
6. Smoke: one real provider submission → confirm the customer is **not**
   notified and the document is **not** visible → approve → confirm exactly one
   customer email and one visible document.
7. Watch for orders stuck in `pending_admin_approval` — that is the new
   operational queue and it needs an owner.

**Before LIVE, decide who reviews.** The gate inserts a human step into
fulfilment. If nobody is watching the queue, delivery stops.

---

# LIVE ROLLOUT RECORD (2026-07-29)

`075546f` → **`f3fc831`** · production **`dpl_HxQBtTzEx3gpqJLEapC9j21n2v4W`** ·
rollback **`dpl_BbP71fGJ3xUrxAxADSnDxXhejsQn`** (`075546f`).

## Reconciliation — TEST was NOT cherry-picked

24 task-owned files were classified against LIVE before any edit:

| Class | Count | Handling |
|---|---|---|
| TEST-only (new) | 10 | copied |
| Identical base | 3 | TEST final copied safely |
| **Divergent** | **11** | **hand-reconciled** |

Divergences that would have caused a regression if copied wholesale:

- **`provider-submit-letter`** — LIVE differed from the TEST task base by exactly
  one line, its own logo CDN, which was preserved.
- **`ghl-send-sms`** — TEST carries a TEST-only SMS containment guard
  (`testSmsSendBlocked`). It was deliberately **not** brought across.
- **`ProviderOrderDetail.tsx`** — LIVE has its own `REFUND-ONLY-OPERATIONAL`
  locking rule and a `providerSafe` projection; both preserved.
- **`OrderDetailModal.tsx`** (merge-frozen, CRLF) — 9 anchored edits,
  51 insertions / 4 deletions, every deletion one of the four replaced lines.
  Additional Pet mounts intact.
- **`package.json`** — one guard inserted into LIVE's own chain; LIVE-only guards
  (google-ads refund adjustment, attribution hygiene, headshot privacy, public
  conversion page, Additional Pet, edge module graph) all preserved.

## Migrations (explicit MCP SQL — never `db push`)

`provider_document_admin_approval_gate` · `provider_document_review_rpcs` ·
`order_audit_actor_attribution` · `approve_order_document_releases_order_state` ·
`correction_audit_uses_actor_columns`.

### Historical preservation

| | Before | After |
|---|---|---|
| order_documents | 462 | 462 |
| customer_visible = true | 462 | **462** |
| orders with signed_letter_url | 397 | **397** |
| orders patient_notified | 456 | **456** |

All 462 became `not_applicable` with `customer_visible` untouched. **No
historical customer lost access; no notification replayed; no approver
fabricated.**

## Function versions and JWT modes

**LIVE had FOUR `verify_jwt=false` functions, not the three seen on TEST** —
`ghl-send-sms` is `false` on LIVE but `true` on TEST. Each was deployed with the
flag it actually needed.

| Function | Prev → New | verify_jwt |
|---|---|---|
| admin-review-document | new → v1 | true |
| assign-doctor | 112 → 113 | **false** |
| create-refund | 103 → 104 | true |
| ghl-send-sms | 82 → 83 | **false** |
| send-sms | 86 → 87 | true |
| send-templated-email | 24 → 25 | **false** |
| provider-submit-letter | 104 → **105** (deployed LAST) | **false** |

All seven boot-proved at the application layer.

## Cutover order

Migrations → historical proof → `admin-review-document` + actor functions →
frontend (`e9c202c`) → served-bundle proof → **`provider-submit-letter` last**.
The Admin review path existed in production before any submission could enter
the gate.

## Production verification

| Check | Result |
|---|---|
| Pre-approval customer read (RLS enforced) | **0 documents, 0 versions, no fallback URL** |
| Trigger vs. service-role write | refuses release **and** sent_to_customer |
| provider / customer / anon approve | `42501` / `42501` / `permission denied` |
| Approve x3 | **1** transition, **1** approved + **1** delivered |
| Correction empty note | rejected by the database (`23514`) |
| Post-approval customer | one "Signed ESA Letter" card, Open + Download |
| Customer status copy | "Under Review" + the required quality-check sentence |
| Audit tab | summary, 7 filters, actor `Hamza Farid` (employee/owner) |
| Audit timeline responsive | **0px overflow at 390/768/1024/1440/1920** |
| Console errors | none |

## Third bypass found in production QA

Two controls were gated from the TEST work. Production QA surfaced a **third**
instance of the same class: **"Send All to Customer"** calls
`notify-patient-letter` directly. Because that function only attaches
`customer_visible` documents, on a fully gated order it would have emailed the
customer "your documents are ready" carrying **zero documents**. Now disabled in
exactly that case; orders with a released document can still be resent.

> **TEST carries the same latent control.** Out of scope here — see next task.

## Queue ownership

- **Queue:** Pending Admin Approval
- **Owner:** authorized PawTenant Admin/Support employees receiving the existing
  `provider_letter_submitted` notification
- **Verified routing:** enabled, reaching two *internal* recipients —
  `h***@gmail.com` (active owner) and `e***@gmail.com`. Not the provider, not
  the customer. Activation not blocked.
- **SLA:** review within 30 minutes during staffed hours, hard maximum one
  business hour. Correction handled by the same team.

## Notification safety

**Zero external email and zero SMS were sent by this QA.** The synthetic fixture
used a reserved non-deliverable `.test` recipient and `doctor_user_id = NULL`, so
no provider notification could fire. Verified: 0 communications rows to fixture
recipients, 0 real customer orders touched.

`TEST_SUPPRESS_EXTERNAL_NOTIFICATIONS` is honoured by the shared module but is
pinned to the TEST project ref, so it is **inert on LIVE by design** — no
suppression behaviour was added to production.

## QA fixtures

`PT-QAGATE-A` / `PT-QAGATE-B` — synthetic, `$0`, `.test` recipient, tagged
`[QA FIXTURE — PROVIDER DOCUMENT GATE]`. Orders and documents deleted after
evidence capture; **3 audit rows retained and relabelled** (append-only history
is never deleted).

## Rollback

Frontend → `dpl_BbP71fGJ3xUrxAxADSnDxXhejsQn`. Functions → v104 / v112 / v103 /
v82 / v86 / v24. `assign-doctor`, `ghl-send-sms`, `send-templated-email` and
`provider-submit-letter` **must** be redeployed with `--no-verify-jwt`. Gate →
`drop trigger trg_order_document_release_gate on public.order_documents;`.
Columns and audit rows are additive and stay. **Any document approved under the
new system keeps its delivered visibility and is never reverted to pending.**

## Monitoring

Immediate: 0 pending, 0 needs_correction, 0 gated-and-visible, 0 duplicate
approvals, 0 real orders mutated. **The 15-minute, 1-hour and next-business-day
checkpoints are NOT yet done.**

## Next task

Port the "Send All to Customer" gate (and its guard control) to TEST so TEST and
LIVE agree. The Additional Pet TEST-drift reconciliation remains separate.
