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

## NOT done in this rollout

* **Browser-driven LIVE QA and responsive QA were not performed.** No
  `PT-LIVE-PENDINGQA-*` fixture was created, so there is **nothing to clean up**
  and no synthetic row or storage object exists in production. Zero real
  recipients were contacted.
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
