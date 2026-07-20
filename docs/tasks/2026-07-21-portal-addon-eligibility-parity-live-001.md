# PORTAL-ADDON-ELIGIBILITY-PARITY-LIVE-001 — LIVE rollout

**Date:** 2026-07-21
**Status:** ✅ LIVE COMPLETE — final RA add-on eligibility contract verified
**Repo:** pawtenant-live-backup (canonical `main`)
**Source of truth:** approved TEST implementation (code `13e86c0`, docs `7bc7bef`, fn v19)

## What changed and why

The standalone `$50` "Additional Documentation" / Reasonable-Accommodation
add-on (`create-additional-doc-invoice`) enforced only ownership + a
duplicate-pending guard on LIVE (v16). It was missing the server-side
eligibility gates that TEST already had. This rollout mirrors the approved
TEST delta surgically into LIVE — **no wholesale replacement, all LIVE-only
behavior preserved.**

All gates run **before** any Stripe session or email is created.

### Owner decisions (as implemented)

- **A — Bundle/RA exclusion:** an order that already includes Reasonable
  Accommodation (`includes_reasonable_accommodation_letter = true`, or
  `package_key ∈ {esa_ra_bundle, psd_ra_bundle}`) cannot buy the standalone
  add-on → 409 `ra_already_included`. Both customer AND admin paths, **no
  admin override**, decided via explicit entitlement/package fields (never
  price).
- **B — One add-on per order:** an existing **paid** request blocks
  repurchase → 409 `addon_already_owned`. **Refunded and cancelled requests
  ALLOW a retry** (a refund means the provider could not complete the
  service; matches the refund panel + portal copy). `pending` is still handled
  by the existing duplicate guard.
- **C — DB race hardening:** partial unique index
  `uq_addon_doc_active_per_order (order_id) WHERE status IN ('pending','paid')`.
  A 23505 unique-violation on insert maps to 409 `addon_already_active` (no
  Stripe session created on a concurrent-create race).

### Status vocabulary (actual)

`pending`, `paid`, `refunded`, `cancelled`. No `processing`/`completed` DB
status (completion = `paid`). Blocked: `pending`, `paid`. Retry-allowed:
`refunded`, `cancelled`.

### Base-order-paid contract

`paid = payment_intent_id OR paid_at` (canonical fields, **not** status) → a
synthetic/mis-advanced order that was never paid is still rejected. Applies to
both paths, no admin override → 409 `base_order_unpaid`. Refunded/cancelled
base order → 409 `base_order_reversed`.

## LIVE duplicate pre-check (read-only, before applying the index)

| metric | value |
|---|---|
| status vocabulary present | `paid` only |
| total rows | 6 |
| paid rows | 6 |
| active (pending+paid) rows | 6 |
| orders with >1 active row | **0** |
| index `uq_addon_doc_active_per_order` pre-existing | no |
| migration `20260720130000` in schema_migrations | no |

Pre-check clean → safe to apply. Table/column names match TEST.

## Migration

Applied to LIVE DB `cvwbozlbbmrjxznknouq` as an idempotent, non-destructive
`CREATE UNIQUE INDEX IF NOT EXISTS` (mirrors how TEST applied it — TEST DB has
the index but no `schema_migrations` row for this version; the repo file
`supabase/migrations/20260720130000_addon_one_active_per_order.sql` is the
reproducible artifact).

Verified LIVE index definition (byte-identical to TEST):

```
CREATE UNIQUE INDEX uq_addon_doc_active_per_order
  ON public.order_additional_documentation_requests USING btree (order_id)
  WHERE (status = ANY (ARRAY['pending'::text, 'paid'::text]))
```

Post-apply counts unchanged: total 6, paid 6, active 6, violating 0 — **no
rows created, updated, or deleted.**

## Files changed

- `supabase/functions/create-additional-doc-invoice/index.ts` — +4 gates,
  extra order-select fields, orderRow type, 23505 handling (functionally
  byte-identical to TEST; only the pre-existing LIVE-only price-history header
  comment differs).
- `supabase/migrations/20260720130000_addon_one_active_per_order.sql` — new,
  identical to TEST.
- `scripts/check-addon-eligibility.mjs` — new, identical to TEST.
- `package.json` — wired `check-addon-eligibility.mjs` into the build chain
  (after `check-addon-price-contract.mjs`) + added `check:/test:addon-eligibility`.

Frontend: **no change** — LIVE `page.tsx:375`, `AdditionalDocRequest.tsx:68`,
`RaDocumentUpload.tsx:36` already match the contract. No Vercel deploy needed.

## Guard + negative controls

- `node scripts/check-addon-eligibility.mjs` → OK (E1–E17 pass on LIVE).
- `node scripts/check-addon-eligibility.mjs --self-test` → OK (all 21 negative
  controls A–U trip).
- `node scripts/check-addon-price-contract.mjs --self-test` → OK (price
  contract intact; 10 controls trip).

## Validation

- Full production build (`npm run build`) → exit 0 (vite build + entire guard
  chain incl. the new eligibility guard; order-package classifier 52/0).
- `git diff --check` → no whitespace errors.
- Secret scan of changed files → none.
- Privacy scan → no new PII handling.
- `type-check` (`tsc`) → pre-existing failures in unrelated `src/` files
  (`AIAssistantTrustCard.tsx`, `AnalyticsTab.tsx`, `EmployeeHrDirectory.tsx`,
  `ProviderInternalRecords.tsx`) — **not touched by this change**; the LIVE
  build does not run `tsc`, so these do not block deploy.
- ESLint "on changed files": no changed file is under `src/` (the eslint
  target), so no applicable lint scope; the `.mjs` guard is not part of the
  lint set.

## Edge function deployment

- Function: `create-additional-doc-invoice`
- Starting version: **v16** → final version: **v17**
- `verify_jwt`: **false** (preserved — function does its own service-role/getUser auth)
- Deployed 3 files: `index.ts` + `_shared/logEmailComm.ts` +
  `_shared/completeAdditionalDocPayment.ts` (shared modules unchanged).
- Deployed source hash matches local; all four new gates + 23505 handling +
  `ADDON_AMOUNT_CENTS = 5000` present in deployed source.
- **stripe-webhook NOT deployed** (v149, unchanged by this task).

## Price contract (unchanged)

`ADDON_AMOUNT_CENTS = 5000`; invoice email/button `$50`; combo $179 one-time /
$159 annual; currency USD; quantity 1. Provider payout, refund architecture,
Google Ads attribution, Stripe products unaffected.

## Safe production verification

No real Stripe object, email, customer, refund, SMS, GHL message, provider
assignment, or Ads conversion. Verified via source + guards + DB index
definition + read-only probes:

- unpaid base → rejects before Stripe (`base_order_unpaid`)
- refunded/cancelled base → rejects (`base_order_reversed`)
- ESA+RA / PSD+RA bundle + explicit RA entitlement → rejects
  (`ra_already_included`), no admin override
- existing paid add-on → rejects (`addon_already_owned`)
- existing pending → duplicate reuse (no second row)
- refunded/cancelled add-on → eligible for a new request (owned gate queries
  `status = paid` only; index predicate excludes refunded/cancelled)
- unauthorized customer → forbidden; admin cannot bypass entitlement/ownership
- 23505 race → 409 `addon_already_active`, no Stripe session

## Rollback

1. Redeploy previous function source (LIVE commit `4f8872b`,
   `create-additional-doc-invoice` v16) with `verify_jwt=false` — restores
   pre-rollout function behavior (a new version number, same source).
2. Drop the index (does NOT alter any request rows):
   ```sql
   drop index if exists public.uq_addon_doc_active_per_order;
   ```
3. Revert the git commit:
   ```
   git revert 99e2ee8
   ```

## Provider-profile session

A separate provider-profile session operates on TEST only. Confirmed at
preflight: TEST `main` at `7bc7bef` with no tracked-file modifications; this
session touched **LIVE only** and did not overlap the provider work.
