# LIVE rollout — Admin Orders CSV Provider Payment + Net After Provider Deduction (ADMIN-ORDER-EXPORT-PROVIDER-NET-LIVE-001)

**Status:** ✅ LIVE. Surgical rollout of verified TEST commit `6c646f7`.
**Source:** TEST `6c646f7` "feat: add provider payment + net-after-deduction to Admin Orders CSV" (not TEST HEAD).
**No mutations:** code-only. No order / earning / payout / refund / comms / Ads / DB change. No migration, no edge function.

## What shipped

Two columns in the Admin Orders CSV, inserted after `Net After Refund (USD)`:

- **`Provider Payment`** — bare 2-dp USD; `0.00` never blank.
- **`Net After Provider Deduction`** — `Net After Refund − Provider Payment`; negatives kept (`-40.00`).

```
Provider Payment(order) = order.doctor_status === 'patient_notified'
                          ? Σ doctor_amount over non-cancelled doctor_earnings of the order
                          : 0
Net After Provider Deduction = (price − refund_amount) − Provider Payment
```

- Completed → sum of valid components (base + ra_completion + additional_documentation). Completed-then-refunded → **retained**. Refunded/closed before completion or under review → **0**. Only `status='cancelled'` earnings are excluded. Never derived from price / rate / %.

## Files (surgical)

| File | Change |
|---|---|
| `src/lib/providerPaymentExport.ts` | **NEW** — byte-identical copy from `6c646f7` (self-contained; deps present on LIVE). |
| `scripts/check-admin-order-export-provider-net.mjs` | **NEW** — byte-identical guard; wired into `npm run build` + `check:/test:admin-order-export`. |
| `src/lib/exportOrders.ts` | 4 surgical hunks (netAfterRefundNum; ExportCtx; 2 columns; map param). **LIVE-only lines preserved**: `"5min Sent"` and the `Requested Provider (ID)` column. |
| `src/pages/admin-orders/page.tsx` | 3 hunks only — import, `exporting`/`exportMsg` state, and augmenting the **existing inline** Export-Selected handler to fetch provider payments first (cancel on error). **Admin Orders loader NOT touched.** |
| `package.json` | Guard appended to build chain + two npm scripts. |

## LIVE-specific decisions

- **Loader preserved.** LIVE HEAD is `119b948` = *Revert "stabilize admin order loading…"*. The TEST stability loader was NOT ported; none of `loadOrderData` / pagination / snapshot code appears in the diff. This rollout is orthogonal to the Admin Orders loader / flicker.
- **`page.tsx` diverges from TEST** (no `exporting` state, no `exportFilteredAll`). Ported logically: augmented LIVE's existing inline Export-Selected handler rather than introducing TEST's `exportSelected` callback — smallest change, same verified behaviour. The latent TEST `exportFilteredAll` does not exist on LIVE and was not added.
- **`exportOrders.ts` diverges** (2 LIVE-only lines). Applied hunks surgically; verified post-edit diff vs `6c646f7` shows only those 2 preserved lines.

## LIVE data validation (project `cvwbozlbbmrjxznknouq`, read-only)

- Schema identical to TEST; `doctor_amount` is whole **USD** ($25–$60), not cents.
- 1,539 orders → **418 completed-with-earnings = $11,780** total Provider Payment.
- **0 anomalies** (0 completed-without-earning, 0 paid-on-incomplete).
- **7 `refunded`-status earnings — all on incomplete orders** → completion gate returns **$0** for each (refunded-before-completion). None on completed orders.
- **6 `cancelled` earnings** → correctly excluded.
- RLS `admins_read_all_earnings` (`is_admin=true`) — same policy EarningsPanel uses; browser SELECT works, no service role, no RLS change.

## Verification

- `node scripts/check-admin-order-export-provider-net.mjs` → 11 logic scenarios + all static invariants pass on LIVE source.
- `--self-test` → 19/19 (4 negative controls).
- Full `npm run build` → green (compile + all guards).
- ⚠️ Authenticated production CSV click-through requires an admin login (agent cannot enter passwords) — owner smoke-test on the LIVE admin Orders page after deploy: select a completed-then-refunded order, confirm `Provider Payment` stays populated with a negative `Net After Provider Deduction`.

## Preflight

LIVE `main`, `0/0` vs `origin/main`, no in-progress ops. Baseline before rollout: `119b948`.
