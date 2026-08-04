# ADMIN-ORDERS-ACCOUNTS-MONTH-END-LIFECYCLE-DATE-INTEGRITY-002

**Status: COMPLETE — TEST + LIVE, 2026-08-04.**
Frontend only. No SQL, no migration, no edge function, no schema change, no LIVE fixtures.

| | TEST | LIVE |
|---|---|---|
| Repo | `pawtenant-test` | `pawtenant-live-backup` |
| From → To | `de42c9c` → `386d985` | `293ab45` → `8022232` |
| Vercel | `pawtenant-test-2tiw5u940` | `pawtenant-production-o3kssuarh` (`dpl_73wwHRNfs85WLM8RRYQduWwwCxb6`) |
| Rollback deploy | — | `pawtenant-production-bvi3vj6w2` |

---

## 1. The reported defect

`https://pawtenant.com/admin-orders?sub=emails&tab=orders&kpi=completed` with the
August period selected showed day groups dated approximately **July 28–31** inside
the **August Completed** view.

## 2. Root cause

`ADMIN-ORDERS-CLICKABLE-KPI-CARD-COUNT-TO-LIST-PARITY-001` introduced a derived
effective window — `effDateBasis` / `effDateFrom` / `effDateTo` — where a selected
KPI card supplies its own stage-entry column (`KPI_CARD_BASIS.completed =
"completed"` → `last_completed_at`) over the active New York month.

That effective window was wired into **two** places:

- the client row predicate — `matchesBasisDateRange(o, effDateBasis, …)`
- the server card counts — `fetchOrderFacetCounts({ dateBasis: effDateBasis, … })`

and **not** into the three display surfaces, which still read the operator's raw,
`localStorage`-persisted `dateBasis`:

| Surface | Was | Now |
|---|---|---|
| Day-ribbon grouping | `orderGroupingIso(order, dateBasis)` | `…, effDateBasis)` |
| Display sort | `orderComparator(dateBasis)(a, b)` | `orderComparator(effDateBasis)(a, b)` |
| CSV order / filename / `Date Basis` column | `dateBasis` | `effDateBasis` |
| Pagination reset deps | `dateBasis, dateFrom, dateTo` | `effDateBasis, effDateFrom, effDateTo` |

So the **right rows** were selected (August completions) and then **filed under the
wrong headings** — the operator's Created / First-paid day. On production the
August-completed set contains many orders created or paid on **Jul 21, Jul 30 and
Jul 31**, which is exactly the "July 28–31" the owner saw.

This was never a `paid_at`-cohort bug and the predicate was never wrong. Only the
display basis was.

## 3. Authoritative date semantics (unchanged where already correct)

| Metric | Authoritative field | Timezone |
|---|---|---|
| Completed count / list / groups / CSV | `last_completed_at` (latest fulfilment; advances on reissue, survives reopen via immutable `first_completed_at`) | America/New_York |
| Lead (Unpaid) | `created_at` | America/New_York |
| Paid (Unassigned) | `paid_at` (immutable first payment) | America/New_York |
| Under Review / Pending Delivery **cards** | `last_under_review_entered_at` / `last_pending_delivery_entered_at` | America/New_York |
| Under Review / Pending Delivery **tabs** (active workload) | current status only — **no date window**, so work never disappears at month rollover | n/a |
| Accounts revenue / Gross Charged | Stripe transaction date (payment-dated) | America/New_York |
| Refund ledger | `refunded_at` | America/New_York |

Revenue was **not** moved into the completion month. LIVE August: payment-dated
8 orders / $962 DB gross vs $1,643 if completion-dated; Accounts reports **$1,071**
Gross Charged (Stripe API, includes add-on charges) — payment-dated, as required.

## 4. Labelling (rule 5 — "label the meaning clearly")

`effDateBasisLabel` is derived from the same `effDateBasis` and is the single label
every surface names the date by:

- KPI caption: *"Counted, listed, grouped and exported by **Completed date** · America/New_York."*
- From/To filter labels follow the effective basis (were stuck on the operator's).
- A notice under the Date Basis control when a card overrides it: *"The Completed
  card is active — the list, day groups and export currently use Completed date.
  Clear the card to return to Created date."* The operator's own choice is preserved
  and resumes on clear.

## 5. Guards

`check-admin-orders-lifecycle-dates.mjs`
- +5 (LIVE) / +6 (TEST) invariants: ribbons, sort, CSV order, CSV filename, CSV
  `Date Basis` stamp, caption, pagination — all on `effDateBasis`.
- +4 negative controls rejecting the raw-basis call forms. Each is a call /
  interpolation form, so prose naming `dateBasis` cannot satisfy it.
- **§36 August-Completed matrix, 21 new scenarios** (68 total, was 47): fixtures
  A–L, NY month boundary, DST fall-back, reopen, missing-timestamp legacy row, plus
  a `36-DEFECT` scenario that asserts the bug still reproduces under the raw basis —
  so the fix scenarios cannot go vacuous.

`check-admin-orders-ny-clock-kpi-status.mjs`
- **N14 asserted the defect literally** (`orderGroupingIso(order, dateBasis)`).
  Rewritten to extract the grouping and sort identifiers and require they be equal
  **and** effective — a structural invariant instead of a hardcoded name.

**Planted-mutation self-test: 4/4 regressions caught, in both repos.**

## 6. Verification

Typecheck 0 errors, production build exit 0, full guard chain green (both repos).

**TEST** — 10 synthetic fixtures (`PT-DI002A…K`, `@fixture.test`, $0, no charges, no
comms) reproduced the defect on the pre-fix bundle: card said *3 Completed in
2026-08-01 – 2026-08-31* while the groups read **"Monday, July 20, 2026"** and
**"Wednesday, July 1, 2026"**. After deploy: groups Aug 5 / Aug 2 / Aug 1, card 3,
list 3, group total 3, no duplicates. Fixtures deleted by explicit
`confirmation_id`; TEST back to 588 orders, 0 remaining.

**LIVE** — read-only against real data:

| Check | Result |
|---|---|
| Completed card | **14** (SQL: 14) |
| Caption / list total | 14 / "14 of 1810" |
| Day groups | Today(1) + Yesterday(3) + Aug 2(3) + Aug 1(7) = **14** |
| Distinct NY completion days | 4 (SQL: 4) |
| July-or-earlier headings | **0** |
| Duplicate order ids | 0 |
| July-paid → August-completed included | yes — `PT-MRUCYHYR` (Jul 21), `PT-MR4FI3Z8` (Jul 3), `PT-MS9TNN34`, `PT-MS9S1TW8`, `PT-PSDFGEQXEWY`, `PT-MS7YOGVZ`, `PT-PSDD12VIK1T`, `PT-MS8B4ILC` (Jul 30–31) |
| CSV | `pawtenant-orders-export-selected-**completed**-2026-08-04.csv`, 14 rows, 14 unique ids, every row stamped `Date Basis = Completed date`, ordered by completion desc |
| Under Review rollover | tab shows **2 of 1810** — both **paid before August** (`PT-MR8RRBBE` Jul 6, `PT-MR8EBCU0` Jul 5). Still visible after rollover. |
| Pending Delivery rollover | LIVE currently has **0** such orders (SQL agrees); proven on TEST fixture `PT-DI002F` instead — no LIVE fixtures were created |
| Widths 390 / 430 / 768 / 1024 / 1280 / 1440 | card 14, rows 14, basis "Completed date", 4 August headings, 0 July leak, no horizontal overflow |
| Console errors / failed requests | none |
| Deep link after reload | `?kpi=completed` survives |
| Accounts | August Books 2026-08-01 → 2026-08-31, Gross Charged $1,071 payment-dated, flow intact |

Responsive widths measured with a **same-origin sized iframe** (Chrome refuses to
resize below display width). The sweep must wait for the LIVE progressive pager to
converge (`rendered === card count`) — read too early it shows 12 of 14 and looks
like a defect.

## 7. Monthly report automation — VERIFIED, NOT re-enabled

- Cron `monthly-business-report-v2` (jobid 16, `0 6-13 1-5 * *`) is **`active = true`**.
- The pause is **not** the cron — it is a per-month row gate. `monthly_business_report_runs`
  holds exactly one row: `2026-07`, `status = skipped_owner_review`,
  `delivery_allowed = false`, `sent_at = NULL`. The §H gate returns
  `skipped: true` before any send, so July can never be backfilled.
- **Nothing was changed.** July remains blocked; no re-enable was performed.

🔴 **Forward risk for the owner:** the gate is month-scoped. On **Sep 1–5** the cron
targets **August 2026**, for which no run row exists, so `guardRow` is null and the
gate is inert — the August report **would send automatically**. Extending the pause
requires deliberately seeding an August row with `delivery_allowed = false`, which is
an owner decision and was **not** taken here.

## 8. Legacy data

`COMPLETED_TAB_MISSING_TIMESTAMP = 0` on LIVE — every currently-Completed order has
a `last_completed_at`. There is **no** legacy backfill needed and no fabricated date
was assigned anywhere. `orderBasisIso` returns `null` for a missing basis and
`matchesBasisDateRange` excludes it from any bounded range (guard §36K).

## 9. Rollback

1. `git revert 8022232` in `pawtenant-live-backup`, push — Vercel redeploys.
2. Or promote deployment `pawtenant-production-bvi3vj6w2` (pre-fix production).
3. No SQL, function or schema rollback exists or is needed.
4. Trigger: any regression in the Admin Orders list, KPI cards, or CSV export.

## 10. Known divergence recorded

TEST's basis-stamped CSV lives in `exportFilteredAll`, which **has no UI call site**
— TEST's only CSV button is `exportSelected`, which passes no basis. LIVE's
"Export Selected CSV" is inline and does carry the basis. The three CSV hunks
therefore land in different functions per repo; the contract is identical and both
guards assert it against their own anchor.
