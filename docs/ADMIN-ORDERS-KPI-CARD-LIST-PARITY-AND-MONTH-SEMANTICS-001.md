# ADMIN-ORDERS-KPI-CARD-LIST-PARITY-AND-MONTH-SEMANTICS-001

**Status:** LIVE COMPLETE — Admin Orders KPI month/current semantics and card-to-tab parity verified.
**Date:** 2026-08-01
**TEST:** `52b1536` → `ecc60f3` (Supabase `opudhofjbydrljgleofq`)
**LIVE:** `4449a6e` → `4c96ba2` (Supabase `cvwbozlbbmrjxznknouq`)
**Vercel:** `dpl_47ng9mLqibgHTaLmxMG3rdaftixp` → **`dpl_GVjuhKq7oSBL31bwKyR6UiQ22LnK`** READY on `pawtenant.com`

---

## 1. The incorrect display

| Card | Displayed | Should be |
|---|---|---|
| **Lead (Unpaid) · now** | **1257** | **4** (leads created this America/New_York month) |
| Paid (Unassigned) · now | 0 | 0 — already correct |
| Under Review · now | 2 | 2 — already correct |
| Pending Delivery · now | 0 | 0 — already correct |
| Completed · this month | 5 | 5 — already correct |

Exactly **one** card was wrong. 1257 was the entire historical open-lead backlog.

## 2. Root cause — client field mapping, one line

`src/pages/admin-orders/page.tsx`, the Lead card:

```ts
timeframe: "now",
value: monthlyKpis?.leadUnpaidCurrent ?? null,   // every open lead EVER created
```

The RPC was **not** at fault: `get_admin_orders_monthly_kpis()` already computed and returned
*both* `leadUnpaid` (current month, on `created_at`) and `leadUnpaidCurrent` (all-time current
state). The card simply read the wrong one.

It was broadened by `ADMIN-ORDERS-UNDER-REVIEW-KPI-CURRENT-WORKLOAD-001`, which correctly made the
**queue** cards current-state — a queue card wired to a monthly field reads 0 against a non-empty
tab the moment the month turns over — but swept Lead into the same rule. Lead is not a queue: it is
an **acquisition** metric and must reset at rollover. The guard from that task actively asserted the
wrong contract ("the four queue cards read CURRENT queue depth"), which is what made the defect
shippable.

## 3. Corrected contract

| Card | Timeframe | Field | Timestamp |
|---|---|---|---|
| Lead (Unpaid) | **this month** | `leadUnpaid` | `created_at` |
| Paid (Unassigned) | now | `paidUnassignedCurrent` | — (current state) |
| Under Review | now | `underReviewCurrent` | — (current state) |
| Pending Delivery | now | `pendingDeliveryCurrent` | — (current state) |
| Completed | this month | `completed` | `last_completed_at` |

Custom-range mode is unchanged: every card switches to its period-EVENT metric on the authoritative
lifecycle timestamp and shows "in range", never "now".

### Card-to-tab parity (§C)

A "this month" card must not open an all-time list. The two month-scoped cards (Lead, Completed) now
apply their own lifecycle Date Basis **plus the current America/New_York month** on click — exactly
the window the number was computed over — so the list reconciles with the figure. The range is
visible in the From/To inputs and Clear restores the default view. The three "now" cards keep
applying their status filter alone, which already reconciled.

## 4. SQL change

One latent defect: the monthly lead count did not exclude archived orders while the current-state
count did. Now that the card reads the monthly field, an archived lead created this month would have
inflated it. `supabase/migrations/20260801180000_admin_orders_monthly_lead_excludes_archived.sql`
adds `and o.status <> 'archived'` to `v_lead` only; every other branch is byte-identical. **Zero rows
affected in either environment** (neither has archived orders), so no displayed number changed.

The migration also re-asserts `revoke ... from public, anon` / `grant ... to authenticated,
service_role`. `CREATE OR REPLACE` preserves grants on an already-deployed function, but the file
must be safe to replay into a fresh environment where the default EXECUTE grant would otherwise
survive. Verified post-deploy: `anon` EXECUTE = **false**.

## 5. TEST evidence — 9 fixtures across the July/August boundary

| # | Fixture | Expected | Result |
|---|---|---|---|
| 1 | July unpaid lead, still unpaid | not in August Lead | ✅ |
| 2 | August unpaid lead | in August Lead | ✅ |
| 3 | July paid-unassigned, still unassigned | in Paid Unassigned (now) | ✅ |
| 4 | July Under Review, still open | in Under Review (now) | ✅ |
| 5 | July Pending Delivery, still pending | in Pending Delivery (now) | ✅ |
| 6 | July-paid, completed in August | in August Completed | ✅ |
| 7 | Completed in July | not in August Completed | ✅ |
| 8 | Fully refunded, Under-Review-shaped | not in Under Review | ✅ |
| 9 | **Archived** August unpaid lead | not in August Lead | ✅ |

Baseline → after (server-authoritative SQL, same predicates as the RPC):

| Metric | Baseline | After | Δ |
|---|---|---|---|
| **lead_month** | 0 | **1** | +1 — only fixture 2 |
| lead_alltime (the old field) | 439 | 441 | +2 — fixtures 1 and 2 |
| paid_unassigned_now | 38 | **39** | +1 |
| under_review_now | 14 | **15** | +1 (refunded excluded) |
| pending_delivery_now | 2 | **3** | +1 |
| completed_month | 0 | **1** | +1 |

## 6. LIVE acceptance

Verified in the **shipped production bundle** (`js/page-B3cLdgZx.js`):

```
Lead (Unpaid)",timeframe:"this month",value:q?.leadUnpaid??null,monthScoped:!0,…
Paid (Unassigned)",timeframe:"now",value:…paidUnassignedCurrent
Under Review",timeframe:"now",value:…underReviewCurrent
Pending Delivery",timeframe:"now",value:…pendingDeliveryCurrent
Completed",timeframe:"this month",value:…completed
```

| Card | Old displayed | **Corrected** | Authoritative DB | Timeframe | Timestamp |
|---|---|---|---|---|---|
| Lead (Unpaid) | **1257** | **5** | 5 | this month | `created_at` |
| Paid (Unassigned) | 0 | 0 | 0 | now | — |
| Under Review | 2 | 2 | 2 | now | — |
| Pending Delivery | 0 | 0 | 0 | now | — |
| Completed | 5 | 5 | 5 | this month | `last_completed_at` |

Lead reads 5 rather than the 4 measured at preflight because one **genuine** new lead
(`PT-MSAN4101`, created 17:28 UTC) arrived during the session. It incremented the monthly card
(4→5), the all-time backlog (1257→1258) and `orders_total` (1750→1751) consistently — the fix
behaving exactly as intended on live traffic.

## 7. Guards and build

New `scripts/check-admin-orders-kpi-semantics.mjs` — **14/14 checks, 14/14 planted negative
controls**, deploy-blocking in both build chains. Covers: Lead monthly / three queues current /
Completed on `last_completed_at`, labels, America/New_York, refunded exclusion, archived exclusion,
month-scoped click parity, custom-range never showing "now", and no value derived from the loaded
500-row list.

While writing it the extractor was reading the **wrong block** — "Lead (Unpaid)", "Paid
(Unassigned)" and "Under Review" also appear in an earlier status-chip map, so anchoring on the
first match gave false results. It now walks every occurrence and keeps the one carrying
`timeframe:` and `rangeBasis:`.

The existing `check-admin-orders-monthly-kpis.mjs` was **corrected in scope**, not bypassed: the
four-queue rule became a three-queue rule, a new invariant pins Lead to the monthly field, the
timeframe vector became `["this month","now","now","now","this month"]`, the Lead negative control
now plants the all-time field, and the summary prose states the corrected contract. Its `MIG`
constant also pointed at a **superseded** migration; repointing it at the newest canonical
definition immediately caught the missing anon revoke described in §4. 59 invariants, 24/24 planted
defects still rejected.

Builds exit 0 in both repos. Type-check: TEST 7, LIVE 9 — both identical to baseline, none in task
files.

## 8. Cleanup and preservation

TEST fixtures `PT-QA-KPI-01..09` and their status/lifecycle/audit rows deleted; fixtures 0,
`@pawtenant.test` orders 0. TEST totals identical to baseline (587 orders / 147 paid / 2465 audit /
931 communications / 53 auth users) and the orders hash is **byte-identical**
(`38cf233d94c103cd6a4e978e99eaa0d7`).

> A first cleanup query appeared to show a hash mismatch. The cause was the query itself — it omitted
> `payment_intent_id`, which the session baseline formula included. Recomputed with the baseline
> formula it matches exactly. No data changed.

**No LIVE fixtures were created at all** for this task (`task_fixtures` = 0). LIVE earnings unchanged
at 502; no lead deleted or modified; no payment, workflow, email, SMS, GHL or Ads side effects. The
only LIVE row delta is the one genuine new lead in §6.

## 9. Secure-token task preservation

`ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001` remains **PARTIAL and paused**. Its TEST
commits (`4206858`, `4a0f17a`, `f6caec9`, `8bb1cee`, `ad1d3e8`, `52b1536`) are untouched and are the
direct ancestors of this task's commits. Its `order_resume_tokens` table survives with 0 rows, its
two edge functions remain deployed on TEST, and nothing in its task-owned files was modified.

## 10. Limitations

The five cards were verified through the **shipped bundle's field mapping plus server-authoritative
SQL**, not through an authenticated admin screenshot — the KPI RPC is admin-gated and no admin
session was available in this environment. The mapping proof is exact (see §6) and the DB values are
the same aggregates the RPC computes, but a visual confirmation of the rendered banner is still
worth an owner glance.

## 11. Rollback

Forward-only. Revert `4c96ba2` (LIVE) / `42e0137`+`ecc60f3` (TEST); redeploy
`dpl_47ng9mLqibgHTaLmxMG3rdaftixp`. The migration is a `CREATE OR REPLACE` — replaying the previous
`..._all_cards.sql` restores the prior definition. No data migration to unwind.

## 12. Next task

Resume `ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001` from its §11 open items.
