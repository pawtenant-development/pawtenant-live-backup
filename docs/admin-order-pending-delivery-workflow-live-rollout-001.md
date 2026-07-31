# ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001

Pending Delivery workflow, approval-gate toggle, reopen reasons, notification
navigation and Admin Orders realtime consistency — **shipped to LIVE**.

| | |
|---|---|
| Source TEST SHA | `f372a8a` (`pawtenant-test`, Supabase `opudhofjbydrljgleofq`) |
| Starting LIVE origin SHA | `ca092e0` |
| Final LIVE SHA | `ddb7bde39db60a9326c71cd1fe4690b382178151` |
| LIVE Supabase | `cvwbozlbbmrjxznknouq` |
| Production deployment | `dpl_2ScUaacFE4bQX2mtZozNdvXxTQVJ` — READY |
| Production alias | `https://pawtenant.com` (non-www; `www` 308 → 200) |
| Approval gate | **ON** at start and at finish |

## Commits

| SHA | Subject |
|---|---|
| `55d22b2` | feat: add Pending Delivery workflow settings and status |
| `57e9495` | fix: preserve visible documents with null source URLs |
| `0c0e231` | feat: enforce Pending Delivery provider submission workflow |
| `dcf4ea0` | feat: add manual reopen reason to the provider notifier |
| `88c4a27` | feat: add Pending Delivery Admin and portal projections |
| `13c04a3` | feat: add approval toggle, reopen reasons and notification navigation |
| `e69309f` | fix: synchronize Admin order workflow aggregates |
| `ddb7bde` | test: guard Pending Delivery LIVE rollout |

## Migrations (applied via MCP, forward-only)

`20260730200000` gate toggle · `20260730210000` Pending Delivery state + KPI ·
`20260730220000` correction hand-back · `20260730230000` reopen reason ·
`20260730240000` notification categories.

TEST `280a72e` (gate-reader RBAC hardening) was **folded into `…200000`** rather
than replayed, so the known-vulnerable intermediate reader never existed on
production. TEST `69ec1d8` (notification suppression) was **not ported**.

## Reconciliation — six places a verbatim TEST port would have REGRESSED LIVE

1. **`order_workflow_state()`** — the TEST copy has **no `search_path` pin**; LIVE
   has one. Copying TEST would have un-pinned a security-relevant setting.
   Preserved and verified via `pg_proc.proconfig`.
2. **`request_order_document_correction()`** — the deployed LIVE audit INSERT is
   **richer** than TEST's final version (`actor_type, category, source,
   entity_type, entity_id, document_id, provider_id`) and **already sets
   `order_id`**. TEST `64d7393` repaired a **TEST-only** regression, so it has no
   LIVE counterpart; porting it would have dropped five audit columns the Audit
   timeline filters on. LIVE's body kept; only the hand-back UPDATE + a
   `new_values` key added.
3. **`get_company_notifications()`** — LIVE has an `order_completed` arm TEST
   **lacks**, and the spec requires that category. Only the two new arms added.
4. **`reopen_order_under_review()`** — the TEST source hardcodes the **TEST
   project ref** in the pg_net URL. LIVE uses `cvwbozlbbmrjxznknouq`, verified by
   extracting the URL back out of `pg_proc.prosrc`.
5. **`my-orders`** — TEST renders "documents were sent to `{userEmail}`" using the
   **authenticated viewer's** address, which leaks the admin's own email in Admin
   Customer View and claims a delivery that may not have happened. LIVE already
   keys on `order.email` + `patient_notification_sent_at`. LIVE logic kept; only
   the pending-approval copy sentence taken.
6. **`provider-portal`** — TEST's partial-refund helper refactor and its
   `customer_document_uploaded` bell type belong to **other workstreams**; not
   ported. Only the seven projection hunks were.

Also: the TEST reopen migration **cannot apply as written** — single-backslash
`E'[\x00-…]'` puts a raw NUL in the literal (`22021`). TEST's *deployed* function
uses double backslashes. **Trust `pg_proc`, not the migration file.**

`is_admin_staff()` / `is_chat_admin()` were compared body-to-body and are
**semantically identical** on both projects, so no authorization adaptation was
required and no second admin-role system was introduced.

## Edge Functions

| Function | Old → New | verify_jwt |
|---|---|---|
| `notify-patient-letter` | 115 → **116** | `false` (preserved) |
| `notify-thirty-day-reissue` | 84 → **85** | `false` (preserved) |
| `provider-submit-letter` | 105 → **106** | `false` (preserved, deployed LAST) |
| `assign-doctor` | 113 (untouched) | `false` |
| `admin-review-document` | 1 (untouched) | `true` |

> The task brief expected `notify-thirty-day-reissue` to be `verify_jwt=true`.
> Revalidation showed it is **`false`** on LIVE; `false` was preserved.

Boot proofs: 401 / 401 / 400 respectively — all three booted on new code and
refused safely. Zero notifications sent.

## Status projection matrix

| Workflow state | Admin | Customer | Provider |
|---|---|---|---|
| provider reviewing | Under Review | Under Review | Under Review |
| awaiting employee approval | **Pending Delivery** | Under Review | **Completed** |
| correction requested | Under Review / Correction Requested | Under Review | In Review / Correction Required |
| approved and delivered | Completed | Completed | Completed |

## Verification

* **KPI exclusivity PROVEN on real production data**: `orders_in_two_buckets = 0`
  across all 1716 orders (lead 1234 · paid_unassigned 0 · under_review 4 ·
  pending_delivery 0 · completed 461; the remaining 17 are cancelled, which is not
  a KPI bucket).
* **RBAC matrix all-false**: anon cannot read or write the gate, read the KPI RPC,
  read notifications, reopen, request a correction, or select `workflow_settings`.
  `authenticated` cannot execute `auto_deliver_order_document`.
* **Preservation exact** — before and after the entire rollout:
  `visible_docs_hash = 914c3a66b01753601b33fb79a719691e` and
  `all_docs_status_hash = 7a3b136d6dc98eeff93c9ca9009eef80`, documents
  476 / visible 475 / approved 11 / pending 0, `doctor_earnings` 491,
  Additional Pet 0. Zero Stripe mutations. `orders` 1713 → 1716 is genuine
  concurrent production traffic.
* **Served bundle proof**: `VITE_VERCEL_GIT_COMMIT_SHA` =
  `ddb7bde39db60a9326c71cd1fe4690b382178151`; admin chunk `page-wDiN4Y-N.js`
  contains `pendingDelivery`, `order_pending_delivery`, `Employee Letter Quality
  Check` and `Return Order to Under Review`.
* Routes: `/`, `/admin-orders`, `/my-orders`, `/admin/provider-preview` all 200.

## Guards

Two new blocking guards registered in `build`
(`check-pending-delivery-live-rollout.mjs` 32/32 checks + 33/33 controls;
`check-portal-role-projection.mjs` 23/23), plus three amended. Full production
build green.

**Three real guard defects fixed while adapting:**

* **CRLF** — LIVE checks out with `autocrlf=true`, so planted mutations written
  with `\n` silently became no-ops and controls reported **MISSED-BY-
  CONSTRUCTION**. Normalised at the read boundary.
* **Control-id mapping** was hardcoded to `/^A22[bcd]$/`, so any other suffixed
  control looked for a check id that does not exist and could never pass.
* **`indexOf(a) < indexOf(b)` FAILS OPEN** — a deleted anchor returns `-1`, less
  than any index, so the assertion passed precisely when the gate it guarded was
  gone. Replaced with a `before()` helper requiring both anchors.

The four-card KPI contract is amended to five; the Payment-Failed ban list is
untouched and still proven by its own control.

## Operations QA — ADMIN-ORDER-PENDING-DELIVERY-LIVE-OPERATIONS-QA-004 (2026-07-31)

Run against LIVE HEAD `0124aff` / deployment `dpl_CiuvSWvucFhjwmcN8ac3eh8AJDWP`
(Ready, aliased to `pawtenant.com`). Dependency
`PROVIDER-DOCUMENT-SINGLE-CURRENT-PENDING-VERSION-LIVE-ROLLOUT-001` @ `8ca919b`.

### Current-workload KPI — regression check PASSED

Browser-verified on the real admin session: Under Review card **6** = Under
Review tab **6**; Pending Delivery card **2** = Pending Delivery tab **2**.

`order_workflow_state()` alone reports 7 under review. The extra row
(`PT-MPNI2THL`) is **fully refunded**; `get_admin_orders_monthly_kpis()` excludes
`fully_refunded` and the list routes it to the Refunded tab. Card and tab agree —
**this is correct behaviour, not a drift**. Do not "fix" it.

Realtime confirmed without pressing Refresh: while the page stayed open, the
fixture entered the list, a genuine order left Pending Delivery, and Completed
moved 190 → 191.

### Approval gate — toggle verified through the real Settings UI

Confirmation copy states the contract explicitly: *"Letters already waiting for
approval stay where they are — they are not released."*

| Step | Result |
|---|---|
| Gate OFF (UI, confirmed) | `false` @ 15:01:58, audit `approval_gate_disabled`, actor **Hamza Farid**, previous `true` → new `false` |
| Existing backlog (fixture A) with gate OFF | **PRESERVED** — `pending_admin_approval`, `customer_visible=false`, `approved_at`/`delivered_at` null, no customer notification |
| Future submission (fixture B) with gate OFF | **AUTO-DELIVERED** — `approved`, `customer_visible=true` once, one `document_auto_delivered` event, patient notified once |
| Gate ON restored (UI) | `true` @ 15:04:43, audit `approval_gate_enabled`, same actor. Gate-OFF window **2m45s** |

Zero genuine provider submissions occurred inside the gate-OFF window, so no
real letter reached a customer unreviewed.

### 🔴 DEFECT FOUND — replay of an auto-delivered submission corrupts the order

Replaying an **identical** submission (same bytes) after gate-OFF auto-delivery
returns `replayed: true` and correctly avoids a duplicate document, a duplicate
customer notification and a duplicate auto-delivery audit event — **but it is not
idempotent.** Evidence from fixture `PT-LIVE-PENDINGQA-52`, one document
`4e4f701f`:

* mints a **second verification id** — `ESA-CA-7KK98RB` (15:03:58) then
  `ESA-CA-LUZC5RW` (15:04:08); `letter_verifications` held **2 rows for 1 order**
* re-runs `pdf_footer_injected` with the new id and **overwrites
  `orders.letter_id`**. The customer already holds a PDF stamped
  `ESA-CA-7KK98RB`, so **public verification of the letter they actually received
  no longer matches the order record**
* writes a **second `order_document_versions` row** for the same document
* resets `orders.doctor_status` to `pending_admin_approval`, so a
  `status='completed'`, customer-visible, already-notified order is dragged
  **back into Pending Delivery** as a phantom "Approve & Deliver" card
* the response reports `reviewStatus: pending_admin_approval` and *"awaiting
  review"* for a letter that was already delivered

Control: fixture A (gate ON, single submission) produced exactly 1 verification
and 1 version — the divergence is caused by the replay path, not by the fixture.

Severity **high**, customer-facing. Reachable in production by a provider
double-submitting or a retried request. Exposure is currently limited because the
gate is ON (no auto-delivery), but the id churn and the `doctor_status`
regression also occur with the gate ON.

**✅ FIXED AND SHIPPED** by
`PROVIDER-SUBMISSION-REPLAY-DELIVERED-STATE-IDEMPOTENCY-LIVE-ROLLOUT-001`
(LIVE `98a8b05`, `provider-submit-letter` **v108**, `verify_jwt=false`). A
recognised replay now returns the stored document/order state before every
mutation. Proven on LIVE with 15 replays (including 8 concurrent) against a
delivered document: verification id, `orders.letter_id`, PDF footer, version
count, customer-visible state, Completed workflow and the patient-notification
timestamp were all unchanged, and no phantom Pending Delivery card appeared. The
pre-deploy audit found **zero** already-corrupted production orders. See
`docs/PROVIDER-SUBMISSION-REPLAY-DELIVERED-STATE-IDEMPOTENCY-LIVE-ROLLOUT-001.md`.

**Operations QA 004 is therefore unblocked** — its remaining scope is listed
under "NOT done in this rollout" below.

### Safety ledger

* Real human recipients: **0**. SMS: **0**. Stripe writes: **0**. Refunds: **0**.
* GHL: **0** forwarded fixture events — all 5 `ghl_sync_logs` rows in the window
  belong to genuine orders. Reserved-namespace suppression held.
* `provider_letter_submitted` staff alert disabled only across two windows
  (61s and 70s) and restored to `enabled=true` with its exact three recipients.
  **No genuine provider submission fell in either window**, so nothing real was
  suppressed.
* Production stayed live throughout — a real employee approved and delivered
  three genuine orders during the run. Those deltas are genuine activity, not
  QA mutations.

### Cleanup — complete

Fixture orders 0, `.test` orders 0, `.test` profiles 0, `PENDINGQA` storage
objects 0 (deleted via service_role Storage REST, then **re-listed** to prove
absence — `storage rm` can silently no-op), synthetic auth user 0, synthetic
provider profile 0. Gate `true`; staff alert `true` with original recipients.
Append-only `audit_logs` evidence retained by policy.

## Operations QA 004 — second run (2026-07-31, after the replay fix)

LIVE `2713c78`, deployment `dpl_AfBent2cTjknXfyQ3XdBXKg92GV9`,
`provider-submit-letter` v108 / `ghl-webhook-proxy` v118 (both `verify_jwt=false`).
Approval gate stayed **ON** for the whole run. Fixture `PT-LIVE-PENDINGQA-71`
with reserved `.test` provider, a second unrelated `.test` provider, and a `.test`
customer identity. **No code changed** — repo clean, all six guards pass.

### Correction → resubmission → re-approval: PASSED end to end

| Step | Result |
|---|---|
| Provider submits (gate ON) | one Pending Delivery candidate, `customer_visible=false` |
| Admin "Needs Correction" + reason | document `needs_correction`, order left Pending Delivery → **Under Review**, reason stored, `reviewed_by` = the real admin |
| Provider resubmits | old document **superseded** (reason and history preserved, linked to successor), new document pending, **exactly 1 active approval candidate** |
| Admin "Approve & Deliver" | corrected document approved + customer-visible, order **Completed**, **exactly 1 customer-visible document**, `orders.letter_id` = the visible document's footer id (`ESA-CA-MAFXGNB`) |

**Contradiction prevention confirmed:** "Return Order to Under Review"
(reopen-with-reason) is gated on `status='completed' || doctor_status='patient_notified'`,
so it is correctly **not offered** while a Pending Delivery document is active —
the Pending Delivery path is "Needs Correction". *Observation, not a defect:* the
separate legacy "Mark Under Review" button remains available on a Pending Delivery
order; it was deliberately not exercised (it emails the customer).

### RLS-enforced authorization proof (real JWTs, never service_role)

| Actor | Order | Documents | **Correction reason** | Audit | Provider bell |
|---|---|---|---|---|---|
| Provider (assigned) | 1 | 2 (incl. superseded history) | **visible** | 0 | 3, incl. "Correction Requested" carrying the reason |
| Other provider (unrelated) | **0** | **0** | none | 0 | **0** |
| Customer (owner) | 1 | **1** (only the approved one) | **none** | 0 | **0** |
| Anonymous | **0** | **0** | none | 0 | **0** |

The provider's non-zero rows are the positive control, so the zeros elsewhere are
meaningful. **The customer never sees the correction reason — before or after
delivery — and the superseded document never leaks.**

### Realtime — PASSED for 3 of 4 transitions, ONE GAP

With the Admin list open and untouched: provider submission (Pending Delivery
1 → 2 with the row appearing), correction (order moved to Under Review) and
resubmission (back to 2) **all updated with no manual refresh**.

🔴 **Gap: approve-and-deliver did not refresh the KPI aggregates in the acting
tab.** After approval the cards still read Pending Delivery 2 / Completed 196
while the database held 1 / 197 — unchanged after **40+ seconds**, past the 30s
safety refresh, and unchanged after closing the modal. A manual reload corrected
it to 1 / 197. The order row itself did show `Completed`. Low severity (no data
impact, self-corrects on reload) but it is the exact "stale banner" class this
workflow was meant to eliminate, so it is recorded rather than waived.

### Portal projections (browser)

* **Customer View** (`/my-orders?preview_email=…`): correction reason **absent**,
  verification id `ESA-CA-MAFXGNB` matching the order, Completed/Delivered with
  Open/Download. Runs on the ADMIN session — a projection check, not RLS proof;
  the RLS proof is the customer-JWT table above.
* **Provider View** (`/admin/provider-preview?provider=…&order=…`): fixture
  visible as Completed, no active correction task, and **no upload control** —
  the approved document correctly requires a formal reopen.

### Safety and cleanup

Real human recipients **0**; SMS **0**; Stripe writes **0**; Ads **0**;
GHL fixture events **0**; marketing enrollment **0**. `.test` API attempts only.
Staff alert disabled three times for **43s / 32s / (approval sends no provider
alert)** and restored each time with its exact three recipients; **zero genuine
provider submissions in any window**.

Cleanup: fixtures 0, reserved Storage objects 0 (deleted by **exact name**),
synthetic auth identities 0, synthetic profiles 0, gate **ON**, alert **ON**.
Preservation: documents **483**, versions **37**, verifications **415** all
unchanged; orders +1 and earnings +1 are both one genuine production order
(`PT-PSD2DVX9P8P`, 19:10) and its own base earning.

## NOT done in this rollout

* **Still open in QA-004:** notification **deep-link** resolution (exact order +
  tab), the remaining realtime matrix rows, the stale-response / dataset-flicker
  matrix, and the **five-width responsive matrix**. Plus the realtime approval
  gap above.
* Not started: `CUSTOMER-PORTAL-DUAL-LETTER-DOWNLOAD-001`,
  `ORDER-DOCUMENT-STORAGE-DELETE-CASCADE-001`,
  `PROVIDER-PORTAL-MOBILE-TAB-OVERFLOW-001`.

## Rollback

* **Fastest safe lever:** the gate is already ON; it is the behavioural guard.
* Frontend: redeploy `dpl_…ccdhirebj` (previous Ready production).
* Functions: `notify-patient-letter` → 115, `notify-thirty-day-reissue` → 84,
  `provider-submit-letter` → 105.
* Database: prefer a forward corrective migration. Do **not** drop
  `workflow_settings` or the new `orders.last_reopen_reason*` columns; every
  migration is additive and no historical row was mutated.
