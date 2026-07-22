# LIVE rollout — Admin Orders dataset stability (ADMIN-ORDERS-DATASET-STABILITY-LIVE-001)

**Status:** LIVE surgical port of the verified TEST fix. Source TEST commits
`d7a7b89` (code) + `fe416eb` (docs). Nothing changed in the database, orders,
providers, refunds, Stripe, GHL, Ads, or Supabase functions.

## Problem (LIVE)

The admin Orders list flipped between a partial page and the full set with no
filter change: total blinked ~250 → ~1,250 → full; Dupes, No-GHL and the "X of Y"
total blinked; recent rows disappeared and returned. Every 30s auto-refresh reset
the visible list back to page 1 (250) and rebuilt it, and the client-derived
counts recomputed off the growing array.

## Root cause (LIVE, confirmed in code)

LIVE already read orders newest-first in pages of 250 with a monotonic
`loadSeqRef`/`isLatest()` stale-guard and a detached background backfill. The
defect was that the loader published every growing page straight to React state:

- page 1 → `setOrders(accumulated)` (reset the visible list to 250 each cycle);
- each backfill page → `setOrders(accumulated.slice())` (list + counts grew live);
- `duplicateCount`, No-GHL and totals derive from `orders`, so they blinked as the
  array grew. The stale guard blocked *older cycles*, but not the intended
  partial→full rebuild inside the current cycle.

## Fix (surgical, one function + count gating)

Ported the TEST-verified behavior onto LIVE's existing structure:

- Pages accumulate into a LOCAL array, **deduplicated by order id** after each
  page; **never** published page-by-page to React state.
- **One atomic commit** (`commitSnapshot`): sort once, then `setOrders(snapshot)`
  + readiness + counts together (React 19 batches async state writes), and only
  if the cycle is still latest.
- **Page 1 still paints instantly on the very first load only**; a routine
  background refresh keeps the previous completed list visible and swaps
  atomically — a completed dataset is never reset to 250.
- New state: `ordersReady` (full-scope counts show a placeholder until the first
  complete snapshot; never presented from a partial page), `ordersRefreshing`
  (subtle "Refreshing" chip while a completed list is rebuilt), `ordersReadyRef`
  (ref mirror so the loader callback stays dependency-free).
- The monotonic cycle id now guards every async write (rows, counts, loading,
  error, refreshing, note counts). Stale page loops abort immediately.
- **Preserved (LIVE-only):** `ORDERS_SELECT` column projection, the secondary
  fire-and-forget provider-roster load, the `ordersError` retry affordance,
  complete-history search/filters (search filters the full loaded set),
  `exportMetaAudience`, bulk selection, provider chips, order actions.
- **"All Leads" / Sequence-Stage chips (LIVE-only surface, not present in TEST):**
  these counts are client-derived from `orders`; the core loader change already
  keeps them stable across refreshes (orders no longer resets), and the chips row
  is now additionally gated on `ordersReady` so it renders only from the completed
  snapshot — never a partial page-1 count. This is the "All Leads: 173 ↔ 840" and
  "sequence-stage counts blink" symptom.

## Independent adversarial review

A separate adversarial React-concurrency review of the diff cleared it for deploy:
no path where a stale cycle wins, where `ordersRefreshing` hangs, where the
secondary rosters are skipped for the latest cycle, where a completed snapshot
resets to 250, or where dedup double-appends/drops a row. React 19 guarantees the
atomic commit batches. Verdict: safe to deploy on concurrency correctness.

## Follow-up (tracked, both repos — parity-preserving)

Pre-existing latent issue (predates this work; present in TEST and LIVE equally,
inherited from 88bc2d8): `fetchOrdersPage` orders by non-unique `created_at`
without an `id` tiebreaker, so offset `.range()` pagination *could* skip or
straddle a row if two rows share an exact `created_at` across a 250-row boundary
(or a row is deleted mid-pagination). The new client snapshot sort orders by
`(created_at, id)` and the dedup Set collapses any straddled duplicate, so the
in-memory duplicate case is already fixed; the residual row-skip case is low
probability at ~582 rows. Recommended follow-up (both repos, together, to keep
parity): add `.order("id", { ascending: false })` as a secondary sort in
`fetchOrdersPage` (deterministic keyset-style ordering). NOT changed here to keep
this rollout a faithful port of the verified TEST behavior.

Dupes definition unchanged (now full-scope): shares a normalized email
(lower-cased) OR a normalized phone (digits only, ≥7) with ≥1 other order.

## Files changed

| File | Change |
|---|---|
| `src/pages/admin-orders/page.tsx` | `loadOrderData` → local-accumulator + atomic snapshot commit + guard on all writes; `ordersReady`/`ordersRefreshing`/`ordersReadyRef` state; count surfaces (Dupes, No-GHL, both totals) gated on `ordersReady`; loader gate `loading && orders.length===0`; subtle Refreshing chip. |
| `scripts/check-admin-orders-dataset-stability.mjs` | New regression guard (ported; projection const `ORDERS_SELECT`). |
| `package.json` | Guard appended to `build`; `check:`/`test:admin-orders-dataset` scripts. |

## Parity: current LIVE → verified TEST behavior

| Surface | Current LIVE (defect) | Verified TEST | LIVE change | Risk |
|---|---|---|---|---|
| Page 1 | `setOrders(accumulated)` per cycle | fast paint first-load only | first-load-only paint | low |
| Backfill | `setOrders(accumulated.slice())` per page | local accumulator, atomic commit | atomic commit | low |
| Refresh | resets list to 250, rebuilds | keeps completed list, atomic swap | keep-visible + swap | low |
| Counts | derived from growing array | from completed snapshot, gated | `ordersReady` gate | low |
| Dedup | `concat` (no dedup) | dedup by id (`seen` Set) | dedup Set | low |
| Guard | rows only | all async writes | full guard coverage | low |
| 250 pagination | present | present | preserved | none |

## Regression guard

`scripts/check-admin-orders-dataset-stability.mjs` — 14 static invariants
(ORDERS_PAGE_SIZE=250 present, no `ORDERS_INITIAL_LIMIT` cap, no unbounded
`ORDERS_SELECT` read, monotonic guard, dedup Set, single atomic commit,
`ordersReady` gating) + 3 negative controls + `--self-test` (dedupe / sort /
stale-cycle rejection / completed-snapshot-survives-stale-partial-write /
page-1-not-ready — 10/10). Wired into `npm run build`.

## Authenticated TEST verification (production TEST site, admin session)

`https://pawtenant-test.vercel.app/admin-orders?tab=orders&sub=live`

- Sampled every 1.5s for **218s (~7 auto-refresh cycles)**: total = only ever the
  full count; filtered, Dupes and No-GHL each single-valued the entire time; the
  "Refreshing" chip appeared repeatedly while the list + counts stayed stable; no
  partial-total placeholder after the first load.
- Dupes toggle: filtered narrowed to exactly the full-scope duplicate count and
  the badge stayed stable; cleared cleanly back to baseline.
- No first-party console errors; no order mutation.

## Local validation (LIVE)

- Guard baseline PASS (14 invariants + 3 negative controls); self-test 10/10.
- Changed-file typecheck: clean. Changed-file lint: clean (pre-existing repo
  warnings only, proven identical on HEAD).
- `npm run build`: exit 0 — all existing LIVE guards (breadcrumb, PSD/ESA
  condition cluster, state-canonical, provider-entity, routes, pricing, refund,
  attribution) pass, plus the new guard.
- `git diff --check` clean; secret/PII scan clean.

## Safety confirmation

No database writes, no migrations, no Supabase-function deploys, no order/
provider/refund/GHL/Stripe/Ads changes, no ESA Housing changes. Read-only
verification only. The unrelated ESA Housing work was never touched.
