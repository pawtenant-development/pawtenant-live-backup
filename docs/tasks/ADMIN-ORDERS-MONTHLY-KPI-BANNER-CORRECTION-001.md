# ADMIN-ORDERS-MONTHLY-KPI-BANNER-CORRECTION-001

Owner correction: the upper Admin Orders KPI banner is a **current-month**
operational summary. It had regressed to all-time / filter-faceted totals.

| | |
|---|---|
| TEST | `d577994` → `4f4febc` |
| LIVE | `55dd7fe` → `60bf61e` |
| Timezone | `America/New_York` |
| Period at rollout | Jul 1 – Jul 31, 2026 (`2026-07-01 04:00 UTC` → `2026-08-01 04:00 UTC`, exclusive) |

## Root cause

During `ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001-LIVE-ROLLOUT` the four cards were
wired to `orderFacetCounts.ts`. That helper is correct for the **list** — its
universe is the active filter set — but wrong for the **banner**, whose universe is
the calendar month. One ambiguous count object served both, so the banner showed
all-time totals (Lead 1,161 / Completed 441 against 1,621 orders).

## The contract

The banner and the list are **different universes and are never reconciled**:

* **Banner** — current Eastern calendar month, server-authoritative, aggregate-only.
  Never narrowed by search, status / package / sequence filters, Date Basis,
  pagination, or the rows currently loaded.
* **List** — filter-aware and Date-Basis-aware. Keeps `X of Y`, the status facets
  and the Payment Failed filter count. Unchanged.

| Card | Canonical timestamp | Rule |
|---|---|---|
| Lead (Unpaid) | `created_at` | created this month, still an unpaid lead |
| Paid (Unassigned) | `paid_at` | **first** payment this month, still unassigned, currently paid |
| Under Review | proven review transition | entered review this month, still under review |
| Completed | `last_completed_at` | fulfilled this month |

## Under Review — the §3 ambiguity, resolved

§3 preferred `last_meaningful_activity_at`, but required confirming the associated
event actually represents Under Review. **It does not.** That column carries whichever
business event was newest; of the six qualifying TEST orders, four were
`payment_received` and one was `refund_completed`. Only one was review work.

The canonical transition *is* provable, from `order_status_logs`
(`new_doctor_status` → `pending_review` / `in_review`, or `new_status = 'under-review'`),
so the task was **not** blocked and no timestamp was invented. Fail-closed: an order
with no review transition on record is not counted.

Both candidate bases select **identical** orders on current data (TEST 6/6, LIVE 4/4),
so the stricter, provable basis was adopted with no behavioural surprise.

## Server-authoritative aggregate

`get_admin_orders_monthly_kpis()` — one RPC, counts only, **no PII**.

* Admin-gated via `check_is_admin()`, **fails closed** (verified: the service
  connection itself is rejected without an admin JWT).
* `SECURITY DEFINER` (it must call `order_workflow_state` / `order_payment_state`,
  which are revoked from `authenticated` on LIVE), `search_path` pinned to `public`.
* `EXECUTE` revoked from `public` and `anon` **by name** — Supabase default-grants new
  public functions to `anon`/`authenticated` as explicit role grants, and
  `revoke ... from public` does not undo them. `authenticated` is retained because the
  browser calls as that role; non-admins are rejected inside the function.
* **Timezone is a hardcoded constant, not a parameter** — a parameter would let a
  caller silently shift the reporting month.
* Upper bound is the next month's first instant, **exclusive**.

Query plan (heaviest arm, the Under Review join): **15 ms**, 75 buffers, HashAggregate
+ index scan on `orders_pkey`; both state functions are **inlined** by the planner, so
there are **no per-row correlated scans**.

Applied via MCP `apply_migration` on both projects. **`supabase db push` was not used** —
the LIVE migration ledger is out of sync with the repo.

## Verification

Independent SQL vs UI — exact match on both environments:

| KPI | Timestamp | TEST SQL | TEST UI | LIVE SQL | LIVE UI |
|---|---|---|---|---|---|
| Lead (Unpaid) | `created_at` | 28 | 28 | 288 | 288 |
| Paid (Unassigned) | `paid_at` | 7 | 7 | 0 | 0 |
| Under Review | review transition | 6 | 6 | 4 | 4 |
| Completed | `last_completed_at` | 7 | 7 | 164 | 164 |

Sanity: LIVE completions by month run Apr 97 / May 64 / Jun 116 / Jul 164, and orders
created run Apr 187 / May 257 / Jun 402 / Jul 441 — consistent with business growth,
not a compressed backfill.

**Independence** — the four values did not move under any of: Date Basis (all four
options), status filter (Completed / Payment Failed / All), package filter (ESA / PSD /
All), search (applied and cleared), sequence filter, pagination (More). Verified on both
TEST and LIVE.

**Responsive** — 1440 / 1280 / 1024 / 768 / 440 / 390 / 375 / 360 on both environments:
4 cards, correct values, period label visible, no horizontal overflow, no clipping.

## Guard

`check-admin-orders-monthly-kpis.mjs` — 33 static invariants, wired into the build on
both repos. Seven planted defects are each rejected by `--self-test`: all-time window,
KPI wired to `statusFilter`, to `packageFilter`, to `dateBasis`, Completed counted on
`created_at`, Paid counted on `last_payment_at`, and Payment Failed re-added as a fifth
card.

`check-admin-orders-facet-counts.mjs` previously *required* the cards to read
`facetCounts.buckets` — that assertion encoded the regression. It now asserts the
**inverse**, so the two universes cannot be re-merged.

## Known limitations

* **L1 (carried over)** — Accounts revenue still keys on `paid_at` + `orders.price`. Not
  affected by this change; unaffected today because zero renewals have fired.
* **L2** — The banner reloads on mount and on explicit Refresh only. That is deliberate
  (it must not recompute on filter changes); a month rollover with the tab left open will
  not refresh until the operator reloads or hits Refresh.
* **L3** — LIVE first paint sits on "Loading all orders…" for ~20 s because the list
  payload is large. Pre-existing; the banner renders a skeleton until then, never a stale
  number.
