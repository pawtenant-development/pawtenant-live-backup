# ACCOUNTS-RESPONSIVE-PARITY-LIVE-HOTFIX-001

**Status:** LIVE COMPLETE — ACCOUNTS RESPONSIVE PARITY VERIFIED
**Date:** 2026-07-26
**Type:** Narrow LIVE responsive hotfix (frontend layout only)

---

## 1. Scope

Port **only** the three already-verified TEST responsive layout corrections into LIVE.
No Accounts functionality was ported again. No financial, data or backend change.

| # | Defect | Component |
|---|---|---|
| 1 | View switcher unreachable below ~440px | `PaymentsTab.tsx` |
| 2 | Company Expenses / Operating Net summary clipped | `PaymentsAccountsPanel.tsx` |
| 3 | Marketing ROI `Sync now` cut off at 360px | `MarketingROIHealthPanel.tsx` |

---

## 2. Source and target SHAs

| Item | SHA |
|---|---|
| TEST final repository SHA | `d577994` (`docs: record accounts responsive QA closure`) |
| TEST responsive code SHAs | `4a53f0b` (fixes 1+2) and `1bdc8da` (fix 3) |
| **Starting LIVE SHA (actual)** | `3968544` (`docs: close live lifecycle rollout qa`); last code SHA `60bf61e` |
| **Final LIVE SHA** | `cc23710` (`fix: align live accounts responsive layout`) |

Both repositories were fetched at preflight and were clean, on `main`, and exactly level
with `origin/main` (`0 0`). No merge / rebase / cherry-pick / bisect state, no index lock.
No concurrent LIVE writer held any of the three files or `package.json`.

---

## 3. Exact source-diff audit

Every anchor site in LIVE was **byte-identical to TEST's pre-fix state**, so all three
hunks ported cleanly with no 3-way merge required. Only line offsets differ.

| File | TEST responsive fix | Current LIVE state (before) | Port decision |
|---|---|---|---|
| `PaymentsTab.tsx` | `@@ -710,18 +710,22 @@` — row gains `max-w-full overflow-x-auto`; each of 3 tabs gains `shrink-0` | identical pre-fix markup at `@@ -709` | **PORTED verbatim** |
| `PaymentsAccountsPanel.tsx` | `@@ -464,9 +464,14 @@` — outer summary span drops `whitespace-nowrap`; inner `Net $x` span gains it | identical pre-fix markup at `@@ -458` | **PORTED verbatim** |
| `MarketingROIHealthPanel.tsx` | `@@ -197,7 +197,12 @@` — sync control group drops `shrink-0` | identical pre-fix markup at `@@ -197` | **PORTED verbatim** |
| everything else in those TEST commits | commit messages / docs only | n/a | **NOT ported** |

Resulting LIVE diff: **3 files, +22 / −8**, all of it `className` strings plus explanatory
comments. No logic, no imports, no props, no state, no handlers.

---

## 4. The three fixes

### Fix 1 — view-switcher reachability
`w-fit` + `whitespace-nowrap` tabs meant the row ran past the viewport below ~440px, and
because an ancestor clips horizontal overflow the `Reconciliation Tool` tab was
**unreachable**, not merely off-screen. The row now scrolls in its own container
(`max-w-full overflow-x-auto`) with `shrink-0` tabs — the same pattern the section nav and
wide tables already use. No tab renamed, removed or reordered; selected-tab styling intact.

### Fix 2 — Expenses / Operating Net summary
The outer span was `whitespace-nowrap`, so `Expenses −$x · Net $y` overran the header slot
and Operating Net was clipped. The outer span now wraps; `whitespace-nowrap` moved to the
inner `Net $x` span so the amount never breaks mid-figure. `aria-expanded` /
`aria-controls` untouched. No expense total, Operating Net formula, card ordering or
open/closed default changed.

### Fix 3 — Marketing sync controls
`shrink-0` pinned the header group to its ~353px intrinsic width inside a ~286px column at
360px, so the group's existing `flex-wrap` could never engage and `Sync now` was cut off.
Dropping `shrink-0` lets the group shrink and wrap. The shared sync handler and its
concurrency lock are untouched — only the container that lays the buttons out.

---

## 5. Static verification

| Check | Result |
|---|---|
| `check-accounts-financial-flow` | PASS |
| `check-accounts-date-range-alignment` | PASS (18 invariants) |
| `check-accounts-reconciliation` | PASS |
| `check-channel-contribution` | PASS (25 checks) |
| `check-admin-orders-monthly-kpis` | PASS (33 invariants) |
| `check-admin-orders-lifecycle-dates` | PASS (82 static + 45 logic) |
| `check-admin-orders-facet-counts` | PASS |
| `check-google-ads-refund-adjustment` | PASS (153 checks) |
| `check-provider-portal-preview` | PASS (27 invariants) |
| `check-admin-order-export-provider-net` | PASS (11 scenarios) |
| Full `npm run build` (runs all 30+ guards) | PASS |
| Lint (3 changed files, `--max-warnings 0`) | PASS, exit 0 |
| Typecheck | Pre-existing project-wide errors only, **none in the 3 changed files** |
| `git diff --check` | clean |
| Secret / PII scan on added lines | clean |

Typecheck baseline errors live in `AIAssistantTrustCard.tsx`, `AnalyticsTab.tsx`,
`EmployeeHrDirectory.tsx`, `ProviderInternalRecords.tsx` and `admin-orders/page.tsx` —
all untouched by this commit, and unreachable from a `className`-only change.

---

## 6. Deployment

| Item | Value |
|---|---|
| Deployment ID | `dpl_Do7BX4eEpNxaUrKPW6EdLiBe4yDM` |
| Deployment URL | `pawtenant-production-6e0k61uix` |
| Status | ● Ready, production alias `https://pawtenant.com` attached |
| **Rollback deployment** | `dpl_EUVJxH3WDrDB5XtkaFbvjW1Evsre` (`pawtenant-production-nt9ax9zks`, LIVE `3968544`) |
| Concurrent builds | none |

Served-code verification was done in the browser against `https://pawtenant.com` rather
than by asset-hash matching: Vercel's build inlines environment values, so production
chunk hashes legitimately differ from a local build and filename matching would prove
nothing. The served DOM was asserted directly instead (§7).

---

## 7. Authenticated LIVE responsive QA

**Method:** same-origin iframe harness inside an authenticated `pawtenant.com` admin
session, with a **fresh mount per width** (`/admin-orders?tab=payments`). Resizing a single
mounted page was deliberately avoided — it yields false stale-layout results. Each mount
patched `console.error`, `window.onerror`, `unhandledrejection` and `fetch` to record
console errors and non-OK responses for that mount's whole lifetime.

`vw` is the iframe's `documentElement.clientWidth`; it sits 15px below the nominal width
when a vertical scrollbar is present.

| Nominal | vw | scrollWidth | page overflow | escaping els | switcher | Expenses summary | `Sync now` | console errors | failed RPCs |
|---|---|---|---|---|---|---|---|---|---|
| 1440px | 1425 | 1425 | **no** | 0 | fits inline | 1 line | inline | 0 | 0 |
| 1280px | 1265 | 1265 | **no** | 0 | fits inline | 1 line | inline | 0 | 0 |
| 1024px | 1009 | 1009 | **no** | 0 | fits inline | 1 line | inline | 0 | 0 |
| 768px | 753 | 753 | **no** | 0 | fits inline | 1 line | inline | 0 | 0 |
| 440px | 425 | 425 | **no** | 0 | **scrolls** | 3 lines | inline | 0 | 0 |
| 390px | 375 | 375 | **no** | 0 | **scrolls** | 3 lines | **wrapped** | 0 | 0 |
| 375px | 360 | 360 | **no** | 0 | **scrolls** | 3 lines | **wrapped** | 0 | 0 |
| 360px | 345 | 345 | **no** | 1 (pre-existing, see §10) | **scrolls** | 3 lines | **wrapped** | 0 | 0 |

**Page overflow: zero at all eight widths** — `scrollWidth === clientWidth` everywhere.
Desktop (768–1440px) is byte-for-byte the previous presentation: switcher inline, summary
on one line, sync controls inline.

### View-switcher reachability (440 / 390 / 375 / 360)
All 3 tabs present, each `flex-shrink: 0`, row `overflow-x: auto` and genuinely scrollable.
`Reconciliation Tool` starts at x=451 — past the viewport at every mobile width — and after
scrolling the row it lands **fully inside both the row and the viewport**:

| width | recon right before scroll | after scroll | fully inside viewport |
|---|---|---|---|
| 440px | 451 | 409 (vw 425) | yes |
| 390px | 451 | 359 (vw 375) | yes |
| 375px | 451 | 344 (vw 360) | yes |
| 360px | 451 | 329 (vw 345) | yes |

Clicking `Reconciliation Tool` at 360px selects it (`bg-white` applied), the Reconciliation
Tool view renders, and the selected tab **stays fully visible** after selection (right edge
344 ≤ vw 345). Clicking back to `Accounts` restores the Accounts view.

### Expenses / Operating Net (440 / 390 / 375 / 360)
Outer span computes `white-space: normal`, inner `Net $…` computes `nowrap`. The summary
wraps to 3 lines and **both figures stay fully inside the viewport at every width**
(e.g. 360px: summary right edge 316 ≤ vw 345; `Net $3,662.63` fully visible). Toggling the
section drives `aria-expanded` `true → false → true` on a real `<button>` carrying
`aria-controls`; the summary text and the Net figure remain visible and unchanged in all
three states. Chevron sits at x=24–52, summary starts at x=233 — no overlap.

### Marketing sync (360 / 390)
Group computes `flex-shrink: 1` and `flex-wrap: wrap`. At 390/375/360 `Sync now` wraps to
its own line (left edge x=29) and is fully visible and enabled. No page overflow.

---

## 8. Functional / regression QA

| Check | Result |
|---|---|
| Accounts is default Payments subtab | PASS (desktop + mobile) |
| Current month loads once, `July 2026 Books · 2026-07-01 → 2026-07-31` | PASS |
| Date switch **July → June → July** | **Exact round-trip**: `Expenses −$9,321.61 · Net $3,662.63`, ad spend `$8,290.98`, revenue `$14,135.00`, 121 orders — identical before and after the June excursion (June showed `−$6,053.13 / $1,884.08`, 66 orders) |
| Financial Overview / bridge (Gross · Stripe · Refunds · Provider) | present |
| Company Expenses / Operating Net / Estimated P&L | present |
| Channel Contribution | present |
| Marketing ROI & Sync Health | appears **exactly once** |
| Microsoft Ads icon | renders — `ri-microsoft-line` (not the blank-rendering `-fill`), 19×28px |
| Reconciliation section opens and closes | PASS |
| Horizontal scrollers inside the page | exactly 1 (the view switcher) |
| Timeouts | none |
| Console errors | **0** across every mount |
| Failed RPCs | **0** across every mount |
| Add Expense | not submitted |

### Shared Sync lock
Clicking the section-level `Sync now` at 360px locked **both** buttons simultaneously —
one shared handler, one shared lock, no duplicate sync path:

```
t = 0ms      Sync Ads:enabled     Sync now:enabled
t = 477ms    Syncing…:DISABLED    Syncing…:DISABLED     <- both locked by one click
t = 10489ms  Sync Ads:enabled     Sync now:enabled      <- both re-enabled on completion
```

The sync returned **real** platform data, not fabricated rows: `marketing_ad_spend_daily`
July rows went 46 → 47 for `google_ads` (one new row for today, 2026-07-26, which did not
exist at the 06:09 sync) and `meta_ads` stayed at 1 row / $0.00. The three independent
displayed figures moved consistently by exactly the same amount:

| figure | before | after | delta |
|---|---|---|---|
| Total Ad Spend | $8,290.98 | $8,580.00 | **+$289.02** |
| Expenses | −$9,321.61 | −$9,610.63 | **+$289.02** |
| Operating Net | $3,662.63 | $3,373.61 | **−$289.02** |
| Attributed revenue / orders | $14,135.00 / 121 | $14,135.00 / 121 | unchanged (correct — sync touches spend only) |

The UI footer honestly reported `Google: 47 rows · Meta: 1 rows`. No credential, campaign,
budget, bid, ad, keyword or conversion setting was touched.

---

## 9. Cross-feature non-regression

| Check | Result |
|---|---|
| Monthly KPI banner is current-month only | PASS — `THIS MONTH · Jul 1 – Jul 31, 2026` |
| Exactly four KPI cards | PASS — Lead (Unpaid) 288 · Paid (Unassigned) 0 · Under Review 5 · Completed 164 |
| Payment Failed remains a filter, not a card | PASS — appears only in the filter row |
| Banner independent of list filters | PASS — applying the `Under Review` filter drove the list to `5 of 1628` while the banner stayed 288 / 0 / 5 / 164 (distinct universes preserved) |
| Mobile Order ID visible exactly once | PASS — 1 per card across all 50 cards at 390px; no page overflow |
| Lifecycle panel present in Payments tab | PASS — `Lifecycle & Payment`, with first-paid and last-payment semantics |
| Lifecycle panel absent from Overview | PASS — 0 occurrences of "Lifecycle" |
| Google Ads ledger | **unchanged: 1 uploaded / 6 dry_run_ready** (+12 blocked, 2 skipped); last upload still `2026-07-26 01:10:39Z` |
| Refund-adjustment flags | remain disabled/unset; guard's 153 checks pass (dual fail-closed flags, allow-list id, validate-only default, RETRACTION only, no batch, no cron) |
| Refund-adjustment cron | none — no `cron.job` matching refund/adjust/google (9 unrelated jobs) |
| New Google Ads **adjustment** call | none |

---

## 10. Known limitations

1. **Pre-existing 3px chip clip at 360px.** The Reconciliation collapsible's status chip
   (`Reconciled`) has its own `whitespace-nowrap` and its *box* ends 3px past the viewport
   at vw=345. It is **not** caused by this hotfix: it lives at `PaymentsTab.tsx:873`,
   outside this commit's only hunk (`@@ -709,18`), and the identical markup exists in TEST,
   which passed sign-off. Impact is cosmetic only — the chip's `padding-right` is 10px and
   the **text ends 7px inside the viewport, so no glyph is clipped**, and page
   `scrollWidth` still equals `clientWidth` (no page-level overflow). Left for a separate
   task rather than widening this hotfix's blast radius.
2. **Typecheck baseline.** The repo has pre-existing TS errors in five untouched files;
   this commit neither adds nor fixes any.
3. **Live figures move during QA.** Operating Net drifted $3,657.63 → $3,662.63 between two
   mounts from ordinary production activity, independent of this change.
4. One authorized ad-spend refresh was executed to verify the shared Sync lock (§8). It is
   an idempotent read-and-upsert of real platform spend; it is the only LIVE data write in
   this task.

---

## 11. Rollback

Conditions for rollback (page-level overflow, desktop regression, unreachable control,
changed financial figure, duplicate sync, reconciliation failure, console error, failed
RPC, Admin Orders regression, deployment mismatch) — **none met**.

If needed: revert commit `cc23710` with a normal revert commit, or promote deployment
`dpl_EUVJxH3WDrDB5XtkaFbvjW1Evsre`. No reset, clean, stash, rebase, merge, force push,
worktree or history rewrite was used at any point.

---

## 12. Mutation summary

| Category | Count |
|---|---|
| Financial logic mutations | **0** |
| Database schema mutations | **0** |
| Migrations | **0** |
| RPC / function mutations | **0** |
| Edge Function deployments | **0** |
| Triggers / policies | **0** |
| LIVE data writes | **1** — the authorized ad-spend refresh in §8 |
| Production files changed | **3** (layout only) |
