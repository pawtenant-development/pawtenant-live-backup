# ORDER-REFUND-IDEMPOTENCY-CLEANUP-LIVE-MIRROR-001 — mirror refund idempotency cleanup to LIVE

**Owner:** Claude session (2026-07-10) — owner-approved LIVE mirror · **Repo:** LIVE `pawtenant-live-backup` (`cvwbozlbbmrjxznknouq`)
**Source:** TEST `ORDER-REFUND-IDEMPOTENCY-CLEANUP-TEST-001` — code `73e78c5`, docs `927e5ce` (browser E2E-verified in TEST).
**Builds on:** LIVE `4854c99` (partial-refund LIVE mirror). **Started from:** LIVE `37e68be`.

## Mandatory prerequisite — LIVE status-log trigger (VERIFIED PRESENT)
Read-only SQL confirmed LIVE has `orders_status_change_trigger` → `log_order_status_change()` on `public.orders`,
**enabled** (`tgenabled='O'`), function **byte-identical to TEST**: SECURITY DEFINER, fires when
`OLD.status IS DISTINCT FROM NEW.status` (or doctor_status), inserts `order_status_logs` with `changed_by='system'`.
⇒ Trigger-only logging is SAFE on LIVE; removing the explicit refunded inserts yields exactly one log per transition.

Current LIVE duplication confirmed: full-refunded orders had up to **4** `refunded` status-logs
(`Hamza Farid` [create-refund] + `stripe_webhook` [logStatus] + `system` [trigger]). Historical rows left as-is
(audit records); the cleanup only affects FUTURE refunds.

## What this fixes (both from TEST 73e78c5)
1. Full refunds created duplicate `refunded` status-logs (trigger + explicit inserts). → explicit inserts removed.
2. Admin full refunds could miss `google_ads_upload_status='refunded_pending_adjustment'` (create-refund set
   status before the webhook reconciled). → create-refund now sets the ads flag itself, guarded.

## Changes mirrored (exact 73e78c5 hunks; LIVE functions were at the d855138 state so they applied cleanly)
- **`supabase/functions/create-refund/index.ts`** — select `+google_ads_upload_status`; on FULL refund set the ads
  flag (guard: only `uploaded`/`pending_gclid_upgrade`); removed the explicit `order_status_logs` insert (trigger
  owns it); earnings void `+.neq('status','refunded')`.
- **`supabase/functions/stripe-webhook/index.ts`** (charge.refunded) — prevRefund select `+google_ads_upload_status`;
  reconcile ads flag (same guard) BEFORE the idempotency return; idempotency now treats `refunded` OR `cancelled`
  as terminal (a delayed full-refund webhook can't revert a Refund+Cancel order); removed explicit `logStatus('refunded')`;
  earnings void `+.neq('status','refunded')`; `adsAdjusted` added to audit metadata + return.
- Diffstat **identical to TEST 73e78c5** (create-refund 36 / stripe-webhook 50) → faithful mirror.

## Function deploy (LIVE)
- `create-refund` **v98**, verify_jwt=**true** (preserved).
- `stripe-webhook` **v143**, verify_jwt=**false** (preserved).

## Idempotency behavior now expected (LIVE)
- Partial refund → status/refund_status unchanged (`partial`), 0 `refunded` logs, ads untouched.
- Full refund → status `refunded`, **exactly one** `refunded` status-log (trigger `system`).
- Refund + Cancel → stays `cancelled`; a delayed/replayed webhook does NOT revert it.
- Webhook replay → no duplicate logs, no duplicate earnings void (`.neq('status','refunded')`), ads set-once.

## Google Ads adjustment behavior
Set `refunded_pending_adjustment` only when the order was actually uploaded (`uploaded` / `pending_gclid_upgrade`),
in BOTH paths (set-once — the second setter sees a non-uploaded state and no-ops). Never overwrites
`failed` / `null` / skipped / other terminal states. (`refunded_pending_adjustment` is a marker; no sweeper consumes it.)

## Verification
- `npm run type-check` — 0 new errors (only the known pre-existing LIVE files). `npm run build` — PASS (242/0, parity OK).
- Deployed-code markers confirmed: ads guard present (both), explicit refunded-log inserts REMOVED (both), terminal
  skip `refunded||cancelled`, replay-safe earnings void. **No LIVE refund executed; no order data mutated.**

## Safety
LIVE backend/function mirror only. No real Stripe refund. No SMS/call. No GHL. No checkout/pricing/provider-assignment
change. No secrets. Ads code touched only inside the already-verified refund blocks. Preserved LIVE untracked docs.

## Commit
LIVE `<pending>`.
