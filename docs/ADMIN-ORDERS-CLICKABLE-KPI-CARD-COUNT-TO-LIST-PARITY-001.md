# ADMIN-ORDERS-CLICKABLE-KPI-CARD-COUNT-TO-LIST-PARITY-001

**Status: LIVE COMPLETE** — clickable operational KPI cards, count-to-list
parity, toggle/clear behaviour, flicker prevention and New York time verified.

| | |
|---|---|
| TEST start / final | `2ecf8e8` → `429fe9d` (+docs) |
| LIVE start / final | `7b82e51` → `1ae8d22` (+docs) |
| LIVE deployment | `pawtenant-production-99b49avbk` (`dpl_8tFAnLXkRNLVBsuHbitPLtxhUMKd`), Ready, `pawtenant.com` + `www.pawtenant.com` |
| Rollback deployment | `pawtenant-production-3m0i214mk` (`dpl_FUrzSaXT61LaTP1iYmcWFvr1iQwy`) |
| SQL / migrations / edge fns | **None.** Frontend only. |

---

## 1. Why the screenshot numbers disagreed

The previous task made the cards display-only period-EVENT counters while the
tabs show CURRENT state. Those two things measure different populations by
design, so no amount of UI work could make them agree. Measured on LIVE, with
every contributing order named:

| Card (old) | Count | Contributing orders → current state | Actually in that tab |
|---|---|---|---|
| Orders Paid | 3 | `PT-MS9TNN34` → Completed · `PT-MSANYT96` → Completed · `PT-MSAQI6SS` → Pending Delivery | **0** |
| Entered Under Review | 4 | `PT-MS9TNN34`, `PT-MSANYT96` → Completed · `PT-MSAQI6SS` → Pending Delivery · `PT-MR4FI3Z8` → Under Review | **1** |
| Entered Pending Delivery | 4 | `PT-MS9S1TW8`, `PT-MS9TNN34`, `PT-MSANYT96` → Completed · `PT-MSAQI6SS` → Pending Delivery | **1** |
| Completed | 7 | all 7 genuinely Completed | **7** |

So the first three were genuine event/state mismatches. **Completed was never
wrong** — all 7 completions were real, and all 7 fell on NY Aug 1. They appeared
under older date ribbons because the ribbons group on the *active Date Basis*,
not on the completion date; only one landed under "Today". That is a reading
problem, not a counting problem, and §15's result summary now states it.

---

## 2. The corrected contract

Each card is a **hybrid**:

> in that queue **right now** ∧ **entered** it inside the active
> America/New_York window

| Card | Current-state predicate | Date field |
|---|---|---|
| Lead (Unpaid) | `isLeadOrder` | `created_at` |
| Paid (Unassigned) | paid ∧ ¬refunded ∧ ¬completed ∧ no provider | `paid_at` (immutable) |
| Under Review | paid ∧ ¬refunded ∧ ¬completed ∧ provider ∧ ¬pendingDelivery | `last_under_review_entered_at` |
| Pending Delivery | paid ∧ ¬refunded ∧ ¬completed ∧ `doctor_status='pending_admin_approval'` | `last_pending_delivery_entered_at` |
| Completed | `doctor_status='patient_notified'` | `last_completed_at` |

Under this predicate a progressed order leaves the earlier card and appears in
the card for the stage it is actually in — which is exactly what makes the count
and the tab reconcile.

**Window**: no explicit date filter → the current New York calendar month;
an explicit From/To → that range. Inclusive NY start, exclusive NY end,
converted to UTC by the existing business-day helpers.

---

## 3. Parity is structural, not asserted

`fetchKpiCardCounts()` (orderFacetCounts.ts) builds each card count with the
**same** `applyNonStatusFilters()` + `applyBucket()` pair that produces the list
total, differing only in the per-card `KPI_CARD_BASIS`. Selecting a card applies
that card's basis and window to the list through a derived **effective window**:

```ts
const effDateBasis = activeKpi ? KPI_CARD_BASIS[activeKpi] : dateBasis;
const effDateFrom  = activeKpi ? kpiFrom : (dateFrom || undefined);
const effDateTo    = activeKpi ? kpiTo   : (dateTo   || undefined);
```

The row predicate, the facet counts (list total) and the CSV export all read the
effective window, so there is one predicate and one window. The count and the
clicked list cannot drift apart.

### Verified parity

| | TEST (July range) | LIVE (current NY month) |
|---|---|---|
| Lead (Unpaid) | card 28 → `Showing 28` | card 20 → 20 rows |
| Paid (Unassigned) | card 4 → `Showing 4` | card 0 → 0 |
| Under Review | card 9 → `Showing 9` | card 0 → 0 |
| Pending Delivery | card 2 → `Showing 2` | card 0 → 0 |
| Completed | card 11 → `Showing 11` | card 9 → 9 rows |

Every figure matched an independent SQL query run against the same database.

---

## 4. No hidden state

`activeKpi` is the **only** state a card writes. Its status tab and its date
window are *derived* from it, so clearing it removes every trace at once.
`dateFrom`/`dateTo` remain purely the operator's own explicit, visible range —
a card never writes them, which makes the "Filters (2)" failure of the previous
task structurally impossible.

- Clicking the active card again → deselects; `?kpi=` removed; explicit range
  preserved.
- Any status tab, including **All** → clears the card and its window; explicit
  range preserved.
- Filters badge never counts KPI state (verified: `Filters` with a card active,
  `Filters (1)` only for a manually chosen range).

**URL**: `?kpi=<card>`, seeded on the first render by `readKpiParam()`.

---

## 5. Two defects found by browser QA that static review missed

1. **The obsolete-param sanitiser stripped the live `?kpi=`.** The previous task
   listed `"kpi"` as obsolete — correct then, since nothing wrote it. With
   clickable cards it deleted the parameter the instant a card wrote it, so every
   selection deselected itself on the next tick and no card could ever look
   active. Guard **N21b** now asserts `kpi` is not in that list.
2. **A direct load of `?kpi=…` cleared the card.** `activeKpi` started null and
   the URL was adopted in an effect; on mount the URL-*writer* effect ran first,
   saw state disagree with the URL, and "corrected" the URL by deleting the
   parameter. Fixed by seeding state from the URL on the first render.

Both are behaviours no amount of code reading would have surfaced — they only
appear when a real click happens in a real browser.

---

## 6. Guards

`check-admin-orders-ny-clock-kpi-status.mjs` rewritten to the corrected
contract: **59 checks + 24 planted negative controls**, all caught in both
repos, source restored byte-for-byte.

Three assertions were **tightened** after their own controls exposed them:

- the parity check matched `applyBucket(applyNonStatusFilters(…))` anywhere in
  the file, so gutting the KPI builder still passed — now scoped to the body of
  `fetchKpiCardCounts`;
- two monthly-guard checks were pinned to the old `value:` property shape and
  missed a planted "derive it from loaded rows" mutation;
- two control regexes had a 400-char window too small to span the new effect
  body, making them silent NO-OPs.

Contract updates (not bypasses):

| Guard | Change |
|---|---|
| `check-admin-orders-monthly-kpis` | The banner was required to be filter-**blind**. Under parity that is wrong — if a search is active and the cards ignored it, clicking a card would show fewer rows than the number on it. Re-scoped to ban only selection/pagination deps. |
| `check-admin-orders-facet-counts` | The bare name `kpiCounts` was banned outright from a long-dead implementation. Re-scoped to ban the old flat **shape** and require the new server-side `{counts}`. |
| `kpi-semantics`, `lifecycle-dates`, `pending-delivery` | Anchors follow the effective-window rename and the by-key card declaration. |

`tsc -p tsconfig.app.json --noEmit`: TEST 7 / LIVE 9 errors, all pre-existing in
files outside this diff. `npm run build` exit **0** in both repos.

---

## 7. Preserved

New York clock, New York Today/Yesterday grouping, NY-midnight rollover, the
strict current-status predicates in `orderClassification.ts` (unchanged), the
secure resume-token rollout and its pre-boot scrub, public PII protection,
payment-authority guards, Accounts and reporting integrity.

LIVE-specific `scheduleAggregateInvalidation` still drives the counts through
`monthlyKpiReloadToken`.

## 8. Fixtures

**None created in either environment.** TEST exercised the July range against
existing data; LIVE exercised the current NY month against genuine production
rows. No fixture cleanup was required and no audit evidence was touched.

## 9. Rollback

Forward-only: revert TEST `11dbca2`, `d657d65`, `2af7075`, `429fe9d`; LIVE
`ec2e8d5`, `1ae8d22`; redeploy `pawtenant-production-3m0i214mk`. No SQL to
reverse.

## 10. Remaining limitations

1. While the dataset is still paging in, the "X of Y" total briefly falls back
   to the loaded-row count before the server facets resolve (observed once as
   `Showing 50 of 1000` settling to 1768). Pre-existing and null-guarded.
2. With a card active the Date Basis dropdown still displays the operator's own
   basis while the list uses the card's. The active-card summary states the real
   window; a future pass could disable the control while a card is selected.
3. Rapid-click and slow-network were exercised through the request guard and the
   normalized key rather than by throttling the network in-session.
