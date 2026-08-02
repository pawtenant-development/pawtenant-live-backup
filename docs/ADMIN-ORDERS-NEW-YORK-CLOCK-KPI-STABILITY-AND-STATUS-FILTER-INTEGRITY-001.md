# ADMIN-ORDERS-NEW-YORK-CLOCK-KPI-STABILITY-AND-STATUS-FILTER-INTEGRITY-001

**Status: LIVE COMPLETE** — New York clock, business-date order grouping,
non-clickable stable KPI cards, and strict status filters verified.

| | |
|---|---|
| TEST start / final | `cfebf56` → `10e9102` |
| LIVE start / final | `6dbcd0b` → `1555117` |
| TEST deployment | `pawtenant-test-crap9hzex` (Ready, production, `pawtenant-test.vercel.app`) |
| LIVE deployment | `pawtenant-production-l8xwvf52y` (`dpl_Fr3XPJJnnqo7fR7bJ7xQiUe5wYtE`, Ready, `pawtenant.com` + `www.pawtenant.com`) |
| Rollback deployment | `pawtenant-production-i94hahglg` (previous Ready production) |
| SQL / migrations applied | **None.** Frontend-only. |
| Edge functions deployed | None. |

---

## 1. Root causes

Nine reported symptoms traced to **two** independent defects. This was
established from code and from the databases — not inferred from screenshots.

### Defect 1 — the KPI cards were clickable and mutated filter state

`src/pages/admin-orders/page.tsx`, the five-card banner. Each card was a
`<button onClick>` that called `setStatusFilter`, `setDateBasis`, `setDateFrom`
and `setDateTo`. That single fact produced almost every symptom:

| Reported symptom | Mechanism |
|---|---|
| Paid (Unassigned) shows Under Review / Completed orders | The click set `statusFilter="all"` **and** a Date Basis, while the card still rendered as *active*. A highlighted "Paid (Unassigned)" card was showing an all-statuses list. |
| Under Review shows Completed orders | Same mechanism. |
| Active tab styling disagrees with the rows returned | The card's `active` flag was computed from `dateBasis` + `statusFilter`, not from the tab. |
| KPI cards act as hidden filters / cannot be deselected | Nothing cleared `dateFrom`/`dateTo`/`dateBasis` once a card had set them. |
| "All" does not clear the list | "All" cleared the *status* only; the card's date range survived. |
| Filters badge shows filters the owner cannot see | A month-scoped card set **both** `dateFrom` and `dateTo`; `activeFilterCount` counted them as 2 → **"Filters (2)"**. |
| Cards flicker and switch values | Setting a range flipped `rangeKpiActive`, which re-labelled **and** re-valued all five cards from the *other* KPI universe (queue depth ⇄ period events) behind five skeletons. Not a race — `runLatest` already ordered responses — but two semantics fighting over one row of cards. |
| KPI semantics keep changing | Same: two universes, switched at runtime. |

**The status predicates were never wrong.** Measured before changing anything:

```
TEST (585 non-archived): pu×completed 0, pu×under_review 0, pu×pending 0,
                         ur×completed 0, pd×completed 0, ur×pending 0,
                         lead_with_payment 0, lead×refunded 0
LIVE (all non-archived): identical — every overlap 0
```

`isPaidUnassigned`, `isUnderReview`, `isPendingDelivery` in
`src/lib/orderClassification.ts` were already strictly mutually exclusive.
They are **unchanged** by this task; changing them would have been a
behaviour change with no defect behind it.

### Defect 2 — Today/Yesterday followed the operator's browser day

`page.tsx` grouped rows with `d.toDateString() === today.toDateString()` and
keyed them with `getFullYear()/getMonth()/getDate()` — the **browser's**
calendar day. From Karachi that is ~9 hours ahead of New York, so for roughly a
third of every day every order the business calls "today" was filed under
"Yesterday".

---

## 2. Canonical business timezone

`America/New_York`, via the existing `src/lib/businessTime.ts`
(`BUSINESS_TIMEZONE`). There is no second timezone implementation on this page.

`src/lib/timezones.ts` (`Asia/Karachi`) is a **separate** concern — HR shift
wall-clock and attendance `work_date` — and was deliberately not touched or
repurposed.

New pure helpers in `businessTime.ts`: `businessZoneAbbrev`,
`formatBusinessClock`, `msUntilNextBusinessMidnight`, `businessDayGroupLabel`.
All DST-safe (offsets resolved from the IANA database at the instant in
question; no hardcoded `-04:00` and no hardcoded `EDT`).

---

## 3. New York clock

- Component: `src/components/admin/BusinessClock.tsx`
- Hooks: `src/hooks/useBusinessClock.ts` — `useBusinessNow` (30s tick, plus
  re-sync on tab focus/visibility, since background tabs are throttled) and
  `useBusinessDayKey`.
- Mounted in the Admin navbar's **left** cluster in `page.tsx`, beside
  `EmployeePresenceBar`, so it never crowds notifications / Refresh / profile.
  That navbar is the Admin Portal's single top header — Orders, Accounts,
  Analytics and Communications are tabs of the same page — so one mount covers
  every admin surface.
- Renders `New York · Aug 1, 2026 · 9:24 PM EDT`. "New York" is dropped below
  the `sm` breakpoint so the navbar never wraps on a phone.
- `role="timer"`, `aria-live="off"` (a clock announcing itself every 30s would
  be unusable), descriptive `aria-label`.
- Lazily-initialised `useState`, so first render === first commit — no
  hydration mismatch, no frozen module-load clock.
- No database request, no network.

---

## 4. Today / Yesterday grouping

**Grouping timestamp — unchanged.** Still
`orderGroupingIso(order, dateBasis) ?? order.created_at`, the same basis-aware
value the list is **sorted** on. (A ribbon keyed on a different date than the
sort emits one ribbon per row.) Only the timezone the date is *read in* changed.

`useBusinessDayKey()` arms a timer on the exact next New York midnight and
re-arms itself, so "Today" rolls over on its own with no page refresh — and
never at the operator's local midnight. It also re-checks on focus, because a
throttled background tab can miss the timeout entirely.

### Mismatch proof (TEST, controlled fixtures)

Browser (Pakistan) `2026-08-02`; New York `2026-08-01`:

| Fixture | `created_at` | NY date | Ribbon | Old browser-local code |
|---|---|---|---|---|
| `PT-TEST-NYCLOCK-01` | `2026-08-01T03:59:59Z` | Jul 31 23:59:59 | **Yesterday** ✓ | Yesterday |
| `PT-TEST-NYCLOCK-02` | `2026-08-01T04:00:00Z` | Aug 1 00:00:00 | **Today** ✓ | Yesterday ✗ |
| `PT-TEST-NYCLOCK-03` | `2026-08-01T14:00:00Z` | Aug 1 10:00 | **Today** ✓ | **Yesterday ✗ — the reported bug** |

01/02 pin the exact EDT midnight boundary (`04:00Z`). The guard's logic checks
additionally prove the **EST** boundary is `05:00Z`, so `04:00Z` is not
hardcoded anywhere.

On LIVE the ribbons render `Today` / `Yesterday` over genuine production orders.

---

## 5. KPI contract

**One semantics — PERIOD EVENTS — over one normalized America/New_York window.**
The dual monthly/range universes were folded into a single state + single fetch.
No card is queue depth; no card is labelled "now".

| Card | Authoritative timestamp |
|---|---|
| Leads Created | `orders.created_at` |
| Orders Paid | `orders.paid_at` (immutable) |
| Entered Under Review | `orders.last_under_review_entered_at` |
| Entered Pending Delivery | `orders.last_pending_delivery_entered_at` |
| Completed | `orders.last_completed_at` |

- **Default window**: the current New York calendar month, re-derived when
  `businessDayKey` flips, so it rolls into the next month at NY midnight.
- **Explicit From/To**: replaces the window; same five metrics. Bounds are
  inclusive-start / exclusive-end in NY, converted to UTC by the RPC
  (`make_timestamptz`). Clearing the filter restores the current NY month.
- Heading always names the window:
  `PERIOD EVENTS · 2026-08-01 – 2026-08-31 · America/New_York`.
- Card totals are **not** expected to equal status-tab totals. An order that
  entered Under Review this month and has since been completed counts under
  *Entered Under Review* **and** *Completed*, but appears only on the Completed
  tab. This is stated in the banner's tooltip.

### Display-only (§B)

`<div>` — no `onClick`, no `role`, no `tabIndex`, `cursor-default`, no
active/selected styling. Verified in the authenticated browser on both
environments: clicking all five cards left URL, dates, Filters count, active
tab, card values and list total **byte-identical**.

### Stability (§11)

- One normalized key: two primitive strings (`kpiFrom`, `kpiTo`) — never a
  `Date` object, which would be a new identity every render.
- One authoritative state, one fetch, ordered by a monotonic request guard
  (`runLatest(periodKpiGuard, …)`); stale responses cannot publish.
- **Values are never reset to null/zero while fetching.** The skeleton is
  first-load only (`firstLoad = periodKpisLoading && periodKpis == null`); later
  loads keep the numbers on screen and show a subtle `· updating…` in the
  heading. So the 30s background refresh, a realtime push, Refresh, and rapid
  month switching cannot flash the cards.
- The effect takes no dependency on status, Date Basis, search, package,
  sequence, payment, sorting or pagination.

### Before / after values

| Environment | Before | After |
|---|---|---|
| TEST, default (Aug 2026 NY) | mixed queue-depth + monthly | 0 / 0 / 0 / 0 / 0 — genuine; TEST has no August events |
| TEST, explicit Jul 1–31 | relabelled mid-interaction | **55 / 28 / 29 / 4 / 12** = SQL exactly |
| LIVE, default (Aug 2026 NY) | Lead card had shown the all-time backlog | **17 / 3 / 4 / 4 / 7** = SQL exactly |

---

## 6. Status matrix

Predicates **unchanged** (`src/lib/orderClassification.ts`); the server total
comes from `filteredTotalFor(statusFilter, facetCounts)` — server-side COUNT
queries, never the loaded row array.

| Tab | Predicate | TEST DB | TEST UI | LIVE DB | LIVE UI |
|---|---|---|---|---|---|
| All | non-archived universe | 585 | 585 | 1763 | 1763 |
| Lead (Unpaid) | `isLeadOrder` | 439 | 439 | 1268 | 1268 |
| Paid (Unassigned) | paid ∧ ¬refunded ∧ ¬completed ∧ ¬provider | 38 | 38 | 0 | 0 |
| Under Review | paid ∧ ¬refunded ∧ ¬completed ∧ provider ∧ ¬pendingDelivery | 14 | 14 | 1 | 1 |
| Pending Delivery | paid ∧ ¬refunded ∧ ¬completed ∧ `doctor_status='pending_admin_approval'` | 2 | 2 | 1 | 1 |
| Completed | `doctor_status='patient_notified'` | 84 | 84 | 478 | 478 |
| Refunded | full refund ∨ cancelled | 10 | 10 | 19 | 19 |
| Disputed | `status='disputed' ∨ dispute_id` | 0 | 0 | — | — |
| Cancelled | `status='cancelled'` | 6 | 6 | — | — |
| Payment Failed | `payment_failure_reason` ∧ (lead ∨ unpaid) | 3 | 3 | — | — |

"All" was clicked after every tab on both environments and restored the full
universe each time.

### §14 parity

The list loads the full dataset progressively (paged until exhausted) and
classifies client-side, while totals come from server facet counts. Exact
consolidation into one server-side query was **not** attempted: a prior task
(`admin-orders-dataset-stability-live-rollout-001`) was rolled back for being
too slow at LIVE scale. Per §14 the duplication is covered by guard N40/N41
instead, which assert the total comes from the server facets and that the facet
bucket predicates mirror the client classifiers.

**Known pre-existing behaviour (not introduced here):** while the dataset is
still paging in, `filteredTotalDisplay` falls back to the loaded-row count if
the facet counts have not resolved yet. Observed once on LIVE as a transient
"514" for Lead, which settled to the correct 1268. The fallback is null-guarded
and pre-existing.

---

## 7. Filters and URL state

- `activeFilterCount` counts only visible, explicit, clearable filters. It
  excludes the status tab, the KPI window, pagination, sorting, the default NY
  month, and all internal query state.
- From/To now counts as **one** "Date range" rather than two — the pair is a
  single visible control. Verified: no filter → `Filters`; July range →
  `Filters (1)`.
- **Audit result:** the page reads only `tab`, `sub`, `thread` and `view` from
  the query string. No KPI/status/date URL parameter was ever read or written,
  and there is no KPI `localStorage`/`sessionStorage`. A defensive sanitiser now
  strips `kpi`, `activeKpi`, `kpiFilter`, `card`, `monthScoped`, `kpiRange` on
  arrival via a `replace: true` navigation, preserving every legitimate param.

---

## 8. Guards

New: `scripts/check-admin-orders-ny-clock-kpi-status.mjs` — 45 static
invariants + 9 timezone logic checks, in the build chain of both repos.
**16 planted negative controls**, each mutating real source, required to be
caught, then restored byte-for-byte. All 16 caught in both repos.

Two controls exposed weak assertions, which were **tightened rather than
accommodated**:

1. The midnight-rollover check only asserted the helper was *mentioned*, so a
   timer rewritten to a fixed 24h passed. It now requires the helper to be the
   timer's actual delay. (The control also only replaced the first occurrence —
   the import — leaving the call site intact.)
2. Comment-stripping (including string literals for the URL deny-list) was added
   before every "must NOT contain" scan; without it the guard failed on the
   explanatory comments that exist precisely to stop these regressions coming
   back.

Existing guards were updated to the superseded contract, never bypassed:

| Guard | Change |
|---|---|
| `check-admin-orders-monthly-kpis.mjs` | Keeps the full `get_admin_orders_monthly_kpis` SQL contract; drops the PAGE checks for the removed dual-mode banner (now owned by the new guard). Stale negative controls replaced, not silently deleted. |
| `check-admin-orders-kpi-semantics.mjs` | Keeps K7–K10 (RPC) and K14 (no value derived from loaded rows), repointed to `periodKpis`. |
| `check-admin-orders-lifecycle-dates.mjs` | Card anchor follows the renamed first card. Anchoring on the old `"Lead (Unpaid)"` silently matched the status-tab option list and reported 17 cards. |
| `check-pending-delivery-admin-orders.mjs` (TEST) / `check-pending-delivery-live-rollout.mjs` (LIVE) | P6/P18 follow the rename; both invariants unchanged in substance. |

Preservation guards re-run green: `check-secure-resume-credential` (28/28),
`check-public-payment-status-privacy` (15/15), `check-admin-orders-facet-counts`,
`check-business-timezone`, `check-resume-payment-authority`, GHL suppression,
month-end reporting.

### Build / typecheck

`tsc -p tsconfig.app.json --noEmit` (never the vacuous root tsconfig):

- TEST: 7 errors, all pre-existing in 3 files not in this diff
  (`AIAssistantTrustCard`, `EmployeeHrDirectory`, `ProviderInternalRecords`).
- LIVE: 9 errors, all pre-existing (the same 3 files plus `AnalyticsTab` and two
  `GenericStringError` casts in `page.tsx` that predate this change).

`npm run build` exit **0** in both repos, gated on the real exit code.

---

## 9. Fixtures and preservation

Fixtures existed on **TEST only**. LIVE required none — it already had genuine
August data and genuine Today/Yesterday rows, so nothing was written to LIVE.

Predeclared IDs: `PT-TEST-NYCLOCK-01/02/03`, row ids
`d64df3d6-97ae-4713-86d4-858a3dcc97ca`, `ea8d887a-3eda-4289-8b4b-105ef73d59bf`,
`d8c44801-6d7d-47c6-a36b-8eaa270d021a`.

Before insertion the `orders` INSERT triggers were audited: only
`orders_lifecycle_before_write` / `orders_lifecycle_after_write` fire (pure
timestamp writers). No email, SMS, GHL, Stripe, Ads, earnings, assignment or
document side effects. Confirmed after the fact: **0** `order_status_logs` and
**0** `communications` rows for the three fixtures.

Cleanup was scoped by **exact row id AND exact confirmation_id** — never a
`LIKE` pattern. (A previous rollout deleted 28 historical QA audit rows through
an unscoped pattern; that class of mistake is structurally excluded here.)
Re-listed after cleanup: 0 fixtures remain; TEST back to 585 non-archived / 587
total, exactly the pre-fixture baseline.

No genuine customer state was changed in either environment. No communication
was sent.

---

## 10. Rollback

Forward-only:

- Revert commits — TEST `00fa0d8`, `b9ff990`, `10e9102`; LIVE `229ca27`,
  `1555117`.
- Redeploy the previous LIVE production deployment
  `pawtenant-production-i94hahglg`.
- No SQL to reverse (none was applied), no function to redeploy.

No `reset`, `clean`, `stash`, `rebase`, force-push or database restore was used
at any point.

---

## 11. Remaining limitations

1. Status filtering remains client-side over the progressively-loaded dataset,
   with totals from server facets (§14 above). Covered by parity guards rather
   than consolidation, deliberately.
2. The transient loaded-row fallback for the "X of Y" total during initial
   paging is pre-existing and unchanged.
3. Midnight rollover is proven by the pure-function logic checks and by the
   controlled fixture boundaries; a real wall-clock rollover was not observed in
   session.
4. `get_admin_orders_monthly_kpis()` is now unused by the Orders banner but is
   left in place, still guarded, for any other consumer.
