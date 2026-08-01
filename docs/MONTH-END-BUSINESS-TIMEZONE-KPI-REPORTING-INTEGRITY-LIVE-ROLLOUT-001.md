# MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-LIVE-ROLLOUT-001

**Status:** 🟢 `LIVE COMPLETE — MONTH-END TIMEZONE, KPI SEMANTICS, ACCOUNTS RECONCILIATION, CANONICAL REPORTING, JULY NO-SEND PROTECTION, FUTURE AUTOMATION, CLEANUP, AND PRESERVATION VERIFIED`
**Date:** 2026-08-01
**TEST source:** `pawtenant-test` @ `f3f99ef` (task doc: `docs/MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001.md` there)
**LIVE:** `38e857a` → `09f3fc3` (6 commits) → +1 docs/preview commit
**No report email was sent to anyone at any point. July 2026 is terminally delivery-disabled.**

## 1. Reconciliation decisions (commit classification)

| TEST commit | Decision | Notes |
|---|---|---|
| `f8f1e01` Monthly Books paid media | **port exactly** | LIVE files were byte-identical to TEST pre-task (SAFE-FULL-PORT proof) except `accountsBooks.ts`, which got only the 6-line `adSpend?` hunk on top of its LIVE-divergent body |
| `989c331` business clock | **port exactly** | `accountsPeriods.ts` proven SAFE-FULL-PORT; `businessTime.ts` twins new to LIVE |
| `25adca8` queue KPI cards | **port surgically** | LIVE already had the UR/PD half (its own `0124aff` + migration `20260731130000` — that work originated on LIVE); the card REGION was swapped to the canonical final shape; `adminOrdersMonthlyKpis.ts` adopted the canonical superset lib; LIVE's monthly RPC extended in place (payload keys strict superset) |
| `aa64096` report fn v1→fail-closed | **superseded** | LIVE went straight to the v2 canonical-payload function |
| `6717c0b` lifecycle timestamps + range RPC | **port surgically** | trigger functions rebuilt from **LIVE's own bodies** (pinned `search_path`, LIVE comments, the `paid_at` override guard all preserved) + only the task arms |
| `a79cd5a` canonical payload v2 | **port exactly** | RPC body identical by design; `is_accounts_admin()` exists on LIVE |
| `726613f` email + workbook | **port + §H extension** | `delivery_allowed` terminal gate added (schema-tolerant) |
| `2e2f60d` §D range mode + NY list bounds | **port surgically** | page.tsx = bounded card region + 3 select columns + separate range effect only; 1,292 lines of unrelated TEST-only page divergence untouched |
| `e3e8017` cron doc | **adapted** | LIVE URL, `x-cron-secret` auth (LIVE cron convention — the vault-bearer pattern 401s on LIVE), created ACTIVE because July is delivery-disabled |
| `6045561` guard + archived-exclusion + 390px fix | **port exactly** | guard paths repointed to LIVE migration filenames |
| `e4ad5ac`/`f3f99ef` docs/previews/import fix | **docs only / already folded in** | |
| LIVE-only guard `check-admin-orders-current-workload-kpi.mjs` | **retired** | bound to the superseded intermediate contract (Lead/Paid monthly); every invariant lives, stronger, in the ported 57-check `check-admin-orders-monthly-kpis.mjs` (24/24 plants) |

## 2. Migrations (explicit MCP SQL; ledger names)

`order_lifecycle_event_timestamps` · `admin_orders_current_workload_kpi_all_cards` ·
`month_end_report_stack_tables` · `month_end_report_stack_canonical_payload`
(repo files `20260801170000/171000/172000`). Backfill from `order_status_logs`:
**428** UR-entered / **22** PD-entered / **17** cancelled stamped; **2** legacy
cancellations + **64** pre-tracking assignments remain NULL — disclosed, never
invented; no speculative history repair. Report tables are service-role-only
(RLS on, no policies; anon/authenticated revoked BY NAME). `anon` holds no
EXECUTE on any new function (verified with `has_function_privilege`).

## 3. Functions / deployment

- `send-monthly-business-report` deployed to LIVE `--no-verify-jwt` (custom auth:
  x-cron-secret OR service key OR admin JWT), 3 assets (index, workbook, shared clock).
- Vercel: `dpl_B6gDn8oeP7E2K4A9dyNjjHRRX5Bx` ● Ready, target production, aliases
  `pawtenant.com` + `www.pawtenant.com`; routes `/`,
  `/admin-orders?sub=chats&tab=orders`, `…&tab=payments` all 200; the served
  admin chunk (`page-vnetyFoU.js`, byte-exact vs build log) contains
  `Entered Pending Delivery`, `get_admin_orders_range_event_kpis`,
  `Period events`, `Operations overview`.
- Rollback: previous production deployment `pawtenant-production-gusz1h0ft…`
  (Ready, 18h older); function rollback = redeploy prior tag (none existed —
  the function is new; disable path = cron + delivery_allowed);
  cron disable: `select cron.alter_job(job_id := 16, active := false);`
  forward revert commits only.

## 4. July 2026 — reconciled, review-only, cannot send

Fresh post-deployment payload (LIVE RPC, all **7 internal checks pass to the cent**):

| | USD |
|---|---:|
| Gross (190 paid: 143 ESA / 47 PSD) | 22,076.00 |
| Stripe fees (est.) | 697.20 |
| Refunds (11, event basis) | 913.00 |
| Provider payouts | 5,270.00 |
| **Business Net** | **15,195.80** |
| Salary (est., 3 employees) | 461.31 |
| Paid media (Google, synced 31/31 days, PKR 2,774,568.48 @280) | 9,909.17 |
| Other company expenses | 705.75 |
| **OPERATING NET** | **4,119.57** |

Identical to the pre-rollout read-only preview. Two explained refinements: Microsoft
= `not_connected_manual_expense_only` with **$300** manual July rows (the RPC's
description-regex found rows the simplified preview query missed — display-only,
already inside other-expenses, never double-deducted); `google_attributed_refunds_in_period`
= 9 (event basis) vs 8 cohort refunds in the channel table — two documented bases.
Bridge to Accounts (Stripe cash basis: operating net 4,451.38): shared component
ad spend matches to the cent; gross/fees/refund-timing bases differ by design and
are stated on every surface. Monthly Books and the detailed P&L share ONE formula
(`computeOperatingNet`, guard-proven TS↔SQL twins) — the $9,909.17 overstatement
class is closed on LIVE.

**No-send proof:** run row `2026-07 · skipped_owner_review · delivery_allowed=false`
(seeded BEFORE the cron existed). Real July invocation → `deliveryDisabled` skip;
`force` cannot override; zero `monthly_business_report` communications rows; zero
Resend deliveries; zero recipient emails. Dry July: environment LIVE accepted,
`wouldSend:true` with ZERO blockers — i.e. only the owner-review flag stands
between July and delivery, exactly as specified. To release July manually:
`update monthly_business_report_runs set delivery_allowed=true where report_month='2026-07';`
then POST `{"month":"2026-07","force":true}`.

## 5. Automation (first deliverable month = August 2026)

Cron `monthly-business-report-v2` = LIVE **jobid 16**, `0 6-13 1-5 * *`, ACTIVE.
The FUNCTION decides in America/New_York: previous month complete + all
fail-closed gates + idempotency (unique month/type; `sent` = terminal skip) +
the delivery_allowed gate. August 2026 generates in the Sept 1–5 window
(~02:00 NY on the 1st at the earliest); until then every firing resolves to the
July `deliveryDisabled` skip (proven live). Real-August invocation today was
refused: "not over yet in America/New_York". Recipient resolved from
`monthly_report_recipients`, seeded with the LIVE owner-role profile that
historically received this report (hamzaengr94@gmail.com); the second owner
profile (omer_kam@yahoo.com) exists and can be added deliberately.

## 6. KPI semantics proof (LIVE data)

- Queue cards = live depth: 1,257 / 0 / 3 / 0 at verification; Completed (July)
  = 197 on `last_completed_at` with pending-delivery exclusion.
- **July-paid → August-completed:** 4 real orders paid in July have
  `last_completed_at` in August — excluded from July's 197, will count as
  August completions, visible in current workload meanwhile. The §C contract
  holds on production data with no fixtures.
- Custom range: `get_admin_orders_range_event_kpis` (NY business days, archived
  excluded) ↔ list Date Basis reconciliation guard-proven; July events:
  562 created / 190 paid / 201 entered UR / 22 entered PD / 197 completed.

## 7. Build / guards / type-check baseline

Unmasked LIVE build `BUILD_EXIT=0` (46 guards in chain, zero hard errors); the
same chain passed inside the Vercel production build. All six ported month-end
guards green WITH self-tests on LIVE (7/7, 24/24 plants etc.). Pristine LIVE
`npm run type-check` baseline = 4 files, ALL pre-existing (`AnalyticsTab.tsx`,
`EmployeeHrDirectory.tsx`, `ProviderInternalRecords.tsx`, plus two long-standing
`GenericStringError[]` casts in `page.tsx` proven present at `38e857a`) —
**zero new task-owned type errors**; the known files were not touched.

## 8. Cleanup & preservation

No LIVE QA fixtures were created by this task (orders/expenses/earnings/auth/
profiles/Storage: zero) — the lifecycle-trigger walk-through was performed on
TEST only; LIVE columns verified against real backfilled data. Baseline-scoped
md5 hashes (cutoff 2026-08-01 11:35Z) recomputed after the rollout are
BYTE-IDENTICAL: orders 1,749/`defc82c5…`, expenses 9/`1349861c…`, ad spend
215/`5829cca7…`, earnings 502/`bae784b6…`. New rows since cutoff: genuine
customer activity (+1 order at verification time), the July skip row, the
recipient row, cron jobid 16 — all expected configuration/production activity.

## 9. Limitations

1. GSC / GA4 remain unintegrated — explicit "not connected" states (follow-up
   dependency; deliberately not built here).
2. Admin Orders UI verified by build + guards + RPC-level tests + served-bundle
   markers; no logged-in visual pass (no admin session available to tooling).
3. Meta spend stale since 2026-07-03 — surfaced as `connected_stale`, never $0.
4. 64 pre-2026-03-30 assignments have no UR-entry timestamp (no log exists).
5. `AnalyticsTab.tsx` (FROZEN) keeps its own browser-local range parsing.
6. Salary and Stripe fees remain labelled estimates.
7. The email's rendering matrix (390/768/1280, zero overflow) was DOM-verified
   on TEST with the identical code; LIVE re-verification was file-level
   (env-LIVE render: 11 sheets, 11/11 frozen panes, no TEST banner, LIVE
   statement present).

## 10. Next task

`ORDER-RESUME-CLIENT-PAID-AT-HARDENING-LIVE-ROLLOUT-001` (queued; note the
`orders_lifecycle_before_write` paid_at-override guard is already on LIVE —
that rollout concerns the `get-resume-order` / `check-payment-status` edge
functions).
