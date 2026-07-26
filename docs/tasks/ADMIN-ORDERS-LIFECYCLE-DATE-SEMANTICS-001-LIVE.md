# ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 — LIVE ROLLOUT

Surgical LIVE rollout of the canonical Admin Orders lifecycle date model and the
finalized compact lifecycle UI.

| | |
|---|---|
| Source TEST SHA | `3994b41` (`fix: show order id on mobile order cards`) |
| Starting LIVE SHA | `bab140f` (`docs: record refund adjustment reconciliation fix`) |
| LIVE Supabase | `cvwbozlbbmrjxznknouq` |
| TEST Supabase | `opudhofjbydrljgleofq` |

---

## 1. Google Ads concurrency confirmation

The Google Ads refund-adjustment writer was confirmed **idle and clean** before any
change was made:

| Check | Result |
|---|---|
| LIVE local HEAD = `origin/main` | `bab140f` = `bab140f`, 0 ahead / 0 behind |
| Working tree | clean except 4 previously-known untracked `docs/*.md` |
| Merge / rebase / cherry-pick / bisect / index.lock | none present |
| Refund-adjustment cron | **none** (`cron.job` has 9 jobs, none refund-related) |
| Adjustment ledger | **1 `uploaded` / 6 `dry_run_ready`** (+12 blocked, 2 skipped) |
| Gate env vars | all unset (2nd real request → 403, per prior session) |

**No Google Ads refund-adjustment object was altered, reverted, renamed or ported.**
The `check-google-ads-refund-adjustment.mjs` guard passes unchanged (153 checks)
in the post-rollout build.

### Migration version collision — resolved by re-timestamping

Three TEST lifecycle migrations collided with LIVE Google Ads refund-adjustment
migration versions. The lifecycle files were re-timestamped; **the Google Ads files
were left untouched**.

| TEST filename | Collides with (LIVE, Google Ads) | LIVE filename used |
|---|---|---|
| `20260725220000_admin_orders_lifecycle_date_semantics.sql` | — (free) | unchanged |
| `20260726120000_admin_orders_date_basis_indexes.sql` | `20260726120000_google_ads_refund_adjustment_shadow_ledger.sql` | `20260726210000_…` |
| `20260726130000_lifecycle_renewal_payment_advance.sql` | `20260726130000_google_ads_refund_adjustment_harden_grants.sql` | `20260726220000_…` |
| `20260726140000_lifecycle_event_handoff.sql` | — (free, moved for ordering) | `20260726230000_…` |

### Migration-ledger drift (pre-existing, documented, NOT changed)

`supabase migration list --linked` shows LIVE's `schema_migrations` is **out of sync
with the repo**: recent work (incl. all Google Ads refund-adjustment migrations) was
applied via MCP `apply_migration`, which records its own generated version rather
than the repo filename. Consequence:

> **`supabase db push` must NOT be run against LIVE.** It would attempt to re-apply
> ~20 local migration files that are already applied under different recorded
> versions. This rollout therefore used MCP `apply_migration`, consistent with how
> every recent LIVE migration was applied. Repairing the ledger is out of scope and
> deliberately untouched (it would rewrite Google Ads migration bookkeeping).

---

## 2. Parity audit — TEST `3994b41` vs LIVE `bab140f`

| Object | TEST state | LIVE state | Decision | Risk |
|---|---|---|---|---|
| `orders` lifecycle columns (6) | present | **absent** | add (Phase A) | low — additive |
| `order_lifecycle_events` + RLS | present | **absent** | add (Phase A) | low — new table |
| `detect_order_lifecycle_events` | final (post-`…130000`) | absent | add **final only** | low |
| `orders_lifecycle_before/after_write` | final (post-`…140000`) | absent | add **final only** | low |
| `order_payment_state` / `order_workflow_state` | present | absent | add | low |
| `addon_request_paid_lifecycle` | present | absent | add | low |
| `admin_correct_order_first_paid_at` | present | absent | add | low |
| `get_order_lifecycle_events` RPC | present | absent | add | low |
| date-basis partial indexes (2) | present | absent | add (Phase D) | low |
| `orders_official_letter_completion` trigger | present | **present, identical** | leave | none |
| `check_is_admin()` RLS gate | present | **present** | reuse | none |
| `src/lib/orderLifecycle.ts` | present | absent | copy verbatim | low |
| `OrderLifecyclePanel.tsx` | present | absent | copy verbatim | low |
| `orderFacetCounts.ts` | present | **absent** | copy verbatim (owner-approved) | medium — see §5 |
| `page.tsx` | lifecycle + facet KPI | divergent (own loader + `kpiCounts`) | **surgical hunks** | medium |
| `OrderCard.tsx` | compact status | divergent | surgical hunks | low |
| `PaymentHistoryTab.tsx` | mounts panel | divergent | surgical hunks | low |
| `types.ts` | +9 fields | divergent | surgical hunks | low |
| `exportOrders.ts` | +`dateBasisLabel` | divergent | surgical hunks | low |
| `OrderDetailModal.tsx` (**FROZEN**) | net-unchanged | untouched | **untouched** | none |
| Accounts / Google Ads / provider / attribution | — | LIVE-only, newer | **preserved** | none |

### Deliberate LIVE-only divergences preserved

* **Loader/pagination.** LIVE runs its progressive-paging loader (`loadSeqRef` +
  `fetchOrdersPage` + `ORDERS_PAGE_SIZE`). TEST's atomic-snapshot loader
  (`commitSnapshot` / `ordersReady`) was **reverted on LIVE** and was NOT ported,
  per owner instruction. Only the page *ordering* became basis-aware.
* **CSV surface.** LIVE has "Export Selected CSV"; TEST additionally has
  `exportFilteredAll`. The basis-ordering + Date-Basis stamp contract was applied to
  LIVE's selected export.

---

## 3. `paid_at` dependency audit

Canonical rule adopted: **`paid_at` = FIRST successful payment, immutable.**

| Reference | Current meaning | Intended meaning | Correct field | Required change |
|---|---|---|---|---|
| `stripe-webhook` renewal branch (L1005) | overwrites `paid_at` on renewal | latest payment | `last_payment_at` | **none** — DB trigger now preserves `paid_at` and routes the value to `last_payment_at` |
| `sync-google-ads-conversions` → `conversion_date_time` | `paid_at` | original purchase time | `paid_at` | **none — strictly improved** (a renewal can no longer corrupt the uploaded conversion time) |
| `google-ads-refund-adjustments` | `original_conversion_uploaded_at` from provenance | — | provenance table | **none** — never reads `orders.paid_at` |
| `send-meta-capi-event` / `send-meta-events` event_time | `paid_at` | original purchase time | `paid_at` | **none — improved** |
| `attributionResolver` time-to-payment | `paid_at` | first payment | `paid_at` | **none — improved** |
| `analyticsMetrics` paid-order test | `paid_at`/`payment_intent_id` | is-paid | either | none |
| `lead-followup-sequence` (`paid_at is null`) | unpaid gate | unpaid gate | `paid_at` | none |
| `get_accounts_reconciliation` revenue window | `paid_at` window, `orders.price` gross | transaction time | transaction time | **none now — see limitation L1** |
| `get_channel_contribution_orders` window | `paid_at` | transaction time | transaction time | **none now — see limitation L1** |
| Admin Orders operational sort | `created_at` | latest activity | `last_meaningful_activity_at` | **changed (this task)** |

**Reporting references migrated: 0.** No LIVE report currently depends on
renewal-overwritten `paid_at`, because **no annual renewal has ever fired on LIVE**
(see §4). Every `paid_at` reader wants the *first* payment and is therefore made more
correct, not less, by immutability.

---

## 4. LIVE data & scale audit

| Metric | Value |
|---|---|
| Orders total | 1,621 |
| With `paid_at` | 459 |
| With `payment_intent_id` | 460 |
| Subscription orders | 35 |
| **Orders with a fired renewal (`subscription_first_renewal_at`)** | **0** |
| **Orders with `paid_at` > `created_at` + 30d** | **0** |
| Completed (`doctor_status='patient_notified'`) | 441 |
| Reopened (30-day) | 9 |
| Refunded (partial or full) | 21 |
| Paid add-on requests | 8 |
| `order_status_logs` rows | 1,408 |
| `payment_attempts` rows | 604 |
| Orders missing `created_at` | 0 |
| `orders` table size | 6,872 kB |

### Historical recovery result

**Not required.** Zero renewals have fired, so no historical `paid_at` has ever been
renewal-overwritten. Nothing was reconstructed, guessed or rewritten. The migration
stops *future* loss; it fabricates no past truth.

---

## 5. KPI architecture decision (owner-approved)

LIVE's `kpiCounts` (5 cards, partially date-windowed, not filter-aware) was replaced
by the TEST `orderFacetCounts.ts` contract, per explicit owner approval: filter-aware
and Date-Basis-aware counts are part of the verified TEST source contract at
`3994b41`.

Dependency audit before porting (**stop condition not triggered** — no loader
architecture required):

* `orderFacetCounts.ts` → `supabaseClient`, `orderClassification`
  (`EXCLUDE_FULL_REFUND_OR`, `EXCLUDE_REFUNDED_AT_OR`), `orderLifecycle`
* `orderLifecycle.ts` → `orderClassification` (`isFullRefund`, `isPartialRefund`,
  `isOperationallyCancelled`, `ClassifiableOrder`)
* All 6 symbols verified present on LIVE; all 27 `orders` columns the helper filters
  on verified present; LIVE `statusFilter` vocabulary matches the facet bucket keys
  exactly.

Result: exactly four KPI cards (Lead/Unpaid, Paid/Unassigned, Under Review,
Completed). **Payment Failed removed as a card, retained as a working status filter.**
Counts reconcile with the displayed "X of Y" via `filteredTotalDisplay`.

---

## 6. Phased database rollout

Applied via MCP `apply_migration` against `cvwbozlbbmrjxznknouq`.

| Phase | Content | Result |
|---|---|---|
| **A** | 6 columns + comments + activity index; `order_lifecycle_events` + type CHECK + 3 indexes + RLS (4 policies) + grants; `order_lifecycle_event_rank`; `order_payment_state`; `order_workflow_state`; `addon_request_paid_lifecycle` + trigger; `admin_correct_order_first_paid_at`; `get_order_lifecycle_events` | success |
| **B** | **Final** `detect_order_lifecycle_events`, `orders_lifecycle_before_write`, `orders_lifecycle_after_write` + both triggers | success |
| **C** | Historical backfill (10a–10f), instrumented | success |
| **D** | `orders_first_paid_basis_idx`, `orders_last_completed_basis_idx` (partial) | success |
| **E** | `get_order_lifecycle_events` RPC (landed in Phase A) | success |

**Phase B applied the FINAL function definitions directly.** The known-buggy
intermediate versions (renewal not detected; AFTER trigger re-deriving after
immutability had erased the evidence; add-on double-write) **never ran on
production**. The four repo migration files still replay to the identical end state
on a fresh environment.

### Trigger ordering — verified identical to TEST

| Timing | Order on both TEST and LIVE |
|---|---|
| BEFORE | `orders_lifecycle_before_write` → `orders_official_letter_completion` |
| AFTER | `orders_lifecycle_after_write` → `orders_status_change_trigger` |

`handle_official_letter_completion` writes only `official_letter_first_completed_at`,
`_final_completed_at`, `_due_at`, `_cycle_complete` — it never sets
`official_letter_reopened_at`, so no lifecycle detection is missed by ordering.

### Query plans (measured pre-mutation)

Heaviest backfill join (`orders` ⋈ grouped `order_status_logs`):

```
Hash Join (actual time=0.813..1.751 rows=441)
  -> Index Only Scan using orders_pkey (rows=1621)
  -> HashAggregate -> Seq Scan on order_status_logs (rows=479, filtered 929)
Buffers: shared hit=471
Planning Time: 1.134 ms
Execution Time: 1.994 ms
```

`statement_timeout` = 120,000 ms. Bounded execution proven; **no batching and no
concurrent index creation were required**.

### Backfill results

| Statement | Rows |
|---|---|
| 10a `last_payment_at` ← `paid_at` | 459 |
| 10b `last_payment_at` ← paid add-on | 8 |
| 10c1 completion ← `order_status_logs` | 441 |
| 10c2 completion fallback | 0 |
| 10d `last_reopened_at` ← 30-day column | 9 |
| 10e `last_meaningful_activity_*` | 1,621 |
| 10f activity floor (`created_at`) | 0 |

* **Total elapsed: 801.97 ms** (longest single statement well under that).
* **Locks:** row-level only; no `ACCESS EXCLUSIVE` beyond the brief `ALTER TABLE …
  ADD COLUMN` (metadata-only in PG11+). Checkout/webhook/admin writes stayed available.
* **Synthetic lifecycle events created: 0** — by construction. The backfill writes
  only lifecycle columns, none of which `detect_order_lifecycle_events()` inspects.
* Post-backfill invariants: `paid_at` count unchanged (459), completed unchanged
  (441), all 1,621 orders have a sort key, **0 rows with `last_payment_at < paid_at`**.
* Audit trail: `audit_logs.action = 'order_lifecycle_backfill'`.

---

## 7. Transactional LIVE tests

All executed inside rollback-only transactions (terminated by `RAISE EXCEPTION`, so
every write was discarded). **15 / 15 PASS.**

| # | Scenario | Result |
|---|---|---|
| 1 | Unpaid lead creation | PASS — 1 `lead_created`, activity = `lead_created` |
| 2 | First payment | PASS — `paid_at` + `last_payment_at` set, 1 `payment_received` |
| 3 | Duplicate payment webhook (identical instant) | PASS — no 2nd event, `paid_at` stable |
| 4 | **Annual renewal** (same PI, later `paid_at`) | PASS — **`paid_at` IMMUTABLE**, `last_payment_at` advanced, 1 `additional_payment_received`, activity moved |
| 5 | Duplicate renewal webhook | PASS — still 1 event, `paid_at` stable |
| 6 | Payment retry / recovery | PASS — `paid_at` stable |
| 7 | Additional-documentation payment | PASS — 1 add-on event, `paid_at` immutable, `last_payment_at` advanced |
| 8 | Duplicate add-on update | PASS — **total `additional_payment_received` = 1** (no double-write) |
| 9 | 30-day reopen | PASS — `last_reopened_at` set, 1 `order_reopened`, **no payment created** |
| 10 | Duplicate reopen | PASS — still 1 event |
| 11 | Re-completion | PASS — `first_completed_at` IMMUTABLE, `last_completed_at` advanced |
| 12 | Partial refund | PASS — 1 `refund_completed`, `paid_at` stable |
| 13 | Metadata-only update (`ghl_synced_at`) | PASS — **activity NOT moved** |
| 14 | Google Ads upload-status update | PASS — **activity NOT moved** |
| 15 | Attribution enrichment | PASS — **activity NOT moved** |

Also verified: exactly 1 paid-order row per order (no duplicate paid count, no
duplicated revenue). **Leakage check after rollback: 0 test orders, 0 test add-ons,
0 lifecycle events, `orders` still 1,621 / `paid_at` still 459.** No email, SMS,
provider notification, Stripe transaction or Google Ads adjustment was triggered
(all are edge-function paths, never reached by DB-level tests).

---

## 8. Guards, typecheck, lint, build

| Check | Result |
|---|---|
| `check-admin-orders-lifecycle-dates.mjs` | PASS — 82 invariants, 19 negative controls, 33 background-column exclusions, 8 PII exclusions, 4-card KPI contract |
| … logic | PASS — 45 scenarios (§22 1–35 + fixtures A/B/C/D) |
| … `--self-test` | PASS — 6 + 12 negative controls |
| `check-admin-orders-facet-counts.mjs` | PASS — partition/reconciliation + all static invariants |
| … `--self-test` | PASS — 13/13 |
| `check-google-ads-refund-adjustment.mjs` | **PASS — 153 checks, unchanged** |
| `check-accounts-reconciliation` / `-financial-flow` / `-date-range-alignment` | PASS |
| `check-admin-order-export-provider-net` | PASS — 11 scenarios |
| `check-provider-portal-preview` | PASS — 27 invariants |
| `check-channel-contribution` | PASS — 25 checks |
| `tsc --noEmit` | **0 errors** |
| `eslint` (changed files) | **0 errors**, 3 pre-existing warnings |
| `npm run build` (full chain) | **PASS** |
| `git diff --check` | clean |
| Secret / PII scan | clean |

### Guard anchors retargeted (intent preserved, NOT weakened)

Three source-pattern assertions encoded TEST's rolled-back loader / filtered-all
export. Their *logic* assertions were untouched and pass in full.

| Guard | TEST anchor | LIVE anchor | Why |
|---|---|---|---|
| lifecycle-dates | `acc.slice().sort(orderComparator(` | `const cmp = orderComparator(dateBasis)(a, b);` | LIVE has no `commitSnapshot`; the display sort is the equivalent invariant |
| lifecycle-dates | `}).sort(orderComparator(dateBasis));` | `.sort(orderComparator(dateBasis));` | LIVE export is selected-orders, not filtered-all |
| lifecycle-dates | `ORDER_DATE_BASIS_LABEL[dateBasis],[\s\S]{0,12}\);` | `…{0,40}\);` | indentation-only relaxation |
| facet-counts | loader marker `ordersReady` | `fetchOrdersPage`, `ORDERS_PAGE_SIZE` | `ordersReady` belongs to the reverted loader; LIVE markers prove the same "loader untouched" intent |

---

## 8b. Post-deploy hardening — Supabase grants & search_path

The security advisor was run after Phase A–E (standing rule: every new Supabase
function/table). It confirmed the known Supabase landmine: default privileges
GRANT EXECUTE on new public functions to `anon` and `authenticated` as EXPLICIT
role grants, and `revoke ... from public` does not undo them. Two new SECURITY
DEFINER trigger functions were reachable via `/rest/v1/rpc/`.

Applied `lifecycle_harden_grants_and_search_path`:

| Function | anon | authenticated | search_path |
|---|---|---|---|
| `orders_lifecycle_before_write()` | revoked | revoked | pinned |
| `orders_lifecycle_after_write()` | revoked | revoked | pinned |
| `addon_request_paid_lifecycle()` | revoked | revoked | pinned |
| `order_payment_state(orders)` | revoked | revoked | pinned |
| `order_workflow_state(orders)` | revoked | revoked | pinned |
| `detect_order_lifecycle_events(orders,orders)` | revoked | **retained** | pinned |
| `order_lifecycle_event_rank(text)` | revoked | **retained** | pinned |
| `admin_correct_order_first_paid_at(...)` | revoked | retained (by design) | pinned |
| `get_order_lifecycle_events(uuid)` | revoked | retained (by design) | pinned |

`detect_…` and `…_rank` MUST keep `authenticated` EXECUTE: the BEFORE trigger is
SECURITY INVOKER and calls them as the writing role, so revoking would break admin
order updates. Revoking the trigger functions is safe because PostgreSQL checks
EXECUTE on a trigger function at CREATE TRIGGER time, not at fire time.

Verified with `has_function_privilege`: **`anon` = false on all nine.** The full
15-scenario transactional battery was re-run after the revokes — all PASS.

## 8c. Authenticated production QA (`https://pawtenant.com`)

| Check | Result |
|---|---|
| Admin Orders loads full dataset | PASS — settles at 1,621 |
| Default basis = Latest activity | PASS (`localStorage.adminOrdersDateBasis = "activity"`) |
| Four Date Basis options present | PASS — Latest activity / Created date / First paid date / Completed date |
| Date Basis switching | PASS — Completed date activates, persists (`"completed"`), triggers one re-page |
| **Exactly four KPI cards** | PASS — grid is `lg:grid-cols-4`, 4 children: Lead (Unpaid) 1161, Paid (Unassigned) 0, Under Review 4, Completed 441 |
| **No Payment Failed KPI card** | PASS |
| Payment Failed status filter | PASS — 29 rows, server-faceted |
| Counts reconcile with "X of Y" | PASS at steady state — `1621 of 1621`, `Showing 50 of 1621` |
| Column header renamed | PASS — "Last Contact" present, "Last Activity" absent |
| No bare creation date under Order ID | PASS |
| Order ID visible exactly once (<640px) | PASS — 50 visible ID nodes for 50 rows, no duplicate |
| Horizontal overflow (<640px) | PASS — `scrollWidth == clientWidth` |
| Console errors | **PASS — zero** |
| Failed RPCs / partial-dataset stall | none observed |
| Overview has NO lifecycle panel | PASS — 0 occurrences |
| Google Ads ledger after rollout | PASS — still exactly 1 uploaded / 6 dry_run_ready |
| Order/paid counts after rollout | PASS — 1,621 / 459, 0 invariant violations, 0 synthetic events, 0 test leakage |

### Defect found by QA and fixed

Production QA caught a transient the port introduced: LIVE pages the dataset in
progressively, so the server-authoritative filtered total was published against a
still-growing `orders.length`, rendering `1621 of 250` → `1621 of 500` before
settling correctly at `1621 of 1621`. Fixed in `ea76ce2`: while the loaded set is
catching up, both halves of the readout come from the same client snapshot; the
server total takes over once the dataset is complete.

### QA NOT completed

* **Responsive matrix at 1024 / 768 / 440 / 390 / 375 / 360.** Chrome page zoom for
  the origin was changed to ~317% by a tooling call during QA (`innerWidth` 484 vs
  `outerWidth` 1536) and the keyboard zoom reset is blocked in this environment, so
  `resize_window` could not produce the target viewports. Only the `<640px` branch
  was measured (at 484px) plus the full-width desktop layout captured before the
  zoom changed. **Reset with `Ctrl+0` on pawtenant.com before re-testing.**
* **Payments-tab lifecycle panel not browser-confirmed.** The modal could not be
  driven reliably at the zoomed viewport. It is code-verified (`PaymentHistoryTab`
  mounts `<OrderLifecyclePanel>` unconditionally, and the panel always renders its
  "Lifecycle & Payment" heading) and guard-verified (two passing assertions:
  "Payments tab mounts the lifecycle panel", "Payments tab reuses the SHARED panel
  component"), but not visually confirmed on production.
* **CSV export not exercised on production** (basis-aware filename + Date Basis
  column are guard-verified only).

## 9. Known limitations

**L1 — Accounts revenue window still keys on `paid_at` + `orders.price`.**
`get_accounts_reconciliation` and `get_channel_contribution_orders` window revenue on
`orders.paid_at` and read gross from `orders.price`. `stripe-webhook` overwrites
`orders.price` on renewal. Because **zero renewals have fired**, no LIVE figure is
currently affected and nothing was changed. When the first renewal lands, the original
sale will remain in its original month (an improvement) but its gross will reflect the
renewal amount, and the renewal will not appear in the renewal month. The correct fix
per the owner's rule is to move Accounts revenue onto actual payment-transaction
timestamps — which requires a per-transaction revenue source that does not yet exist
(`ADMIN-ORDERS-FILTER-COUNT-…-001` Workstream B is `PARTIAL — STRIPE LINKAGE
INCOMPLETE`). **Tracked separately; not attempted inside this rollout.**

**L2 — Historic `paid_at` overwrites are unrecoverable in principle.** Not applicable
today (0 renewals), documented for completeness.

**L3 — Migration-ledger drift.** See §1. `supabase db push` must not be run against
LIVE until the ledger is repaired.

**L4 — Date Basis is per-operator.** Persisted in `localStorage`
(`adminOrdersDateBasis`), so it does not follow an operator across browsers.

**L5 — KPI counts are hidden (not wrong) under client-only filters.** Traffic source,
Package and Duplicates cannot be expressed server-side; when active, the cards show
`—` with an explanatory banner rather than a silently-wrong number.

---

## 10. Rollback

Adapted from `docs/rollback/admin-orders-lifecycle-date-semantics-001-rollback.sql`
(TEST). Execute only on a rollback condition.

1. **Code:** `git revert` the rollout commits (normal revert commits — never `reset`,
   never force-push), or promote the previous Vercel production deployment.
2. **Triggers first** (stops all new lifecycle behaviour, leaves data intact):
   ```sql
   drop trigger if exists orders_lifecycle_before_write on public.orders;
   drop trigger if exists orders_lifecycle_after_write  on public.orders;
   drop trigger if exists addon_request_paid_lifecycle  on public.order_additional_documentation_requests;
   ```
3. **Before any destructive stage, export renewal-derived values** (no independent
   source exists once the column is dropped):
   ```sql
   select id, confirmation_id, paid_at, last_payment_at, first_completed_at,
          last_completed_at, last_reopened_at, last_meaningful_activity_at,
          last_meaningful_activity_type
     from public.orders
    where last_payment_at is distinct from paid_at;
   ```
4. Columns and `order_lifecycle_events` are **additive** — dropping them is optional
   and not required to restore prior behaviour.

**Rollback conditions:** payment/webhook DB error · checkout failure · Admin Orders
load failure · partial-dataset stall · duplicate lifecycle events · duplicated revenue
· unexpected paid-order count change · wrong date-basis universe · pagination
instability · provider CSV regression · Accounts regression · excessive locking · RPC
timeout · failed production deployment.

**Rollback point:** LIVE `bab140f` + the Vercel production deployment immediately
preceding this rollout.
