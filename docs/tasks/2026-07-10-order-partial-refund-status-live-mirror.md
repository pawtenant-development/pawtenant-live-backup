# ORDER-PARTIAL-REFUND-STATUS-FIX-LIVE-MIRROR-001 — mirror partial-refund fix to LIVE

**Owner:** Claude session (2026-07-10) — owner-approved LIVE mirror · **Repo:** LIVE `pawtenant-live-backup` (`cvwbozlbbmrjxznknouq`)
**Source:** TEST `ORDER-PARTIAL-REFUND-STATUS-FIX-001` — code commit `d855138`, E2E `0ffab51` (browser-verified in TEST).
**Started from:** LIVE `8462873`.

## Scope
Mirror ONLY the partial-refund fix (`d855138`, TEST create-refund v33 / stripe-webhook v47 logic). The later
idempotency-cleanup follow-up (`ORDER-REFUND-IDEMPOTENCY-CLEANUP-TEST-001`, TEST `73e78c5`, v34/v48) is a
**separate future LIVE mirror** (it relies on the `log_order_status_change` trigger — verify before mirroring).

## What LIVE had before
LIVE `create-refund` + `stripe-webhook` `charge.refunded` set `orders.status='refunded'` on ANY refund (the
original bug — Desiree PT-MR1HX27H, a $40 partial on a completed order, read as fully refunded). LIVE had no
`orders.refund_status` column and no "Refund Only" admin action. LIVE functions/UI were byte-identical to TEST's
pre-`d855138` baseline, so the exact hunks applied cleanly.

## Changes mirrored (per-file, surgical)
- **NEW `supabase/migrations/20260710120000_order_refund_status_partial_tracking.sql`** — copied verbatim.
- **`supabase/functions/create-refund/index.ts`** — Stripe-truth full/partial detection (`charges.retrieve`),
  write `refund_amount`(cumulative)/`refunded_at`/`refund_status` always but set `status='refunded'` + void
  earnings ONLY on full; return payload gains `refundStatus`/`isFullRefund`. (Exact `d855138` hunks.)
- **`supabase/functions/stripe-webhook/index.ts`** — `charge.refunded`: Stripe-truth `isFullRefund`, partial
  preserves status + ads conversion, full sets `status='refunded'` + ads flag + earnings void; partial-refund
  idempotency (targeted re-select). (Exact `d855138` hunks.)
- **`src/pages/admin-orders/components/RefundModal.tsx`** — `+paymentIntentId?` prop, sent to create-refund.
- **FROZEN `src/pages/admin-orders/components/OrderDetailModal.tsx`** — 8 surgical hunks (import, Order type
  `+refund_status`, display helper full-only, "Partial Refund" block label, header More menu "Refund Only" +
  gate `refund_status!=='full'`, body-action "Refund Only" + gate, `showRefundOnly` state, RefundModal mount).
  **Frozen-file workflow:** tracker row REFUND-PARTIAL-STATUS (CLAUDE.md "Scoped bugfix"+"Isolated component
  mount"+"Localized UI correction"); classified **LIVE-mirror of a verified TEST fix**; per-hunk diff only, no
  blanket copy; each of the 8 LIVE anchors verified to match TEST context before editing (import order diverged
  — RefundModal import anchored before `canDelete` instead of `AttributionJourneyTab`; body-action preceding
  comment diverged `-TEST` suffix but code lines identical). type-check + build pass.

## Migration (applied LIVE)
`refund_status text not null default 'none'` + CHECK `IN ('none','partial','full')`. Verified: column exists
(text, NOT NULL, default `'none'`), constraint `orders_refund_status_check` present. Backfill (no status
rewritten): **14 full / 1 partial / 1279 none**. The single `partial` = Desiree PT-MR1HX27H (correctly classified).

## Function deploy (LIVE)
- `create-refund` **v97**, verify_jwt=**true** (preserved).
- `stripe-webhook` **v142**, verify_jwt=**false** (preserved).

## Desiree PT-MR1HX27H — read-only verification + correction (NOT RUN)
Current LIVE row: `status='refunded'`, `doctor_status='patient_notified'` (letter delivered), `price=59`,
`refund_amount=40`, `refunded_at=2026-07-09 22:41`, `refund_status='partial'` (backfilled), `pi_3ToEeBGwm9wIWlgi1eN4HvDv`.
The migration classified her `partial`; only `status` remains wrong. Correction WHERE matches **exactly 1 row** (dry-run confirmed).

**Correction (NOT RUN — needs owner confirmation of the Stripe charge state; no Stripe read tool available this session):**
```sql
update public.orders
set status='completed', refund_status='partial'
where confirmation_id='PT-MR1HX27H'
  and status='refunded' and doctor_status='patient_notified'
  and refund_amount is not null and price is not null and refund_amount < price;
```
Owner to confirm on the Stripe charge for `pi_3ToEeBGwm9wIWlgi1eN4HvDv`: `amount_refunded=$40`, `refunded=false`
(partial). DB `refund_amount=40` was written from that refund, so it corroborates. After confirmation, run the
SQL (affects 1 row; sets the delivered order back to `completed` + keeps `refund_status='partial'`; reversible).

## Safety
No real Stripe refund issued. No SMS/call. No GHL. No checkout/pricing/provider-assignment change. Ads code
untouched except the already-verified `charge.refunded` `refunded_pending_adjustment` line. Preserved LIVE
untracked docs (operating rules, google-ads trackers). Idempotency follow-up (v34/v48) NOT mirrored (separate task).

## OUTCOME (2026-07-10) — DONE
- **Commit:** LIVE `4854c99` (pushed `8462873..4854c99`). Diffstat identical to TEST `d855138`
  (OrderDetailModal 128 / RefundModal 9 / create-refund 72 / stripe-webhook 48) → faithful mirror.
- **Migration:** applied LIVE — column `refund_status text NOT NULL default 'none'` + CHECK constraint verified.
  Backfill: **14 full / 1 partial / 1279 none**; no statuses rewritten. Only mismarked partial = Desiree.
- **Functions:** `create-refund` **v97** (verify_jwt=true), `stripe-webhook` **v142** (verify_jwt=false).
- **type-check / build:** 0 new errors (only the 4 known pre-existing LIVE files); build PASS (242 prerender/0, parity OK).
- **Browser verify (Claude in Chrome as Hamza, no OTP):** logged into pawtenant.com admin. Deploy confirmed
  live (a transient "Failed to fetch dynamically imported module" = old page referencing replaced chunk hashes;
  hard-reload fixed it). Desiree PT-MR1HX27H modal opens: header "Refunded" (correct — `status='refunded'`
  uncorrected), REFUND ISSUED block **$40.00**, provider Stephanie White, $59/Paid. Normal paid order
  (Adam Maher PT-MRELTXUD, Under Review) More menu shows **BOTH "Refund Only (keep order active)" and
  "Refund + Cancel Order"** → new UI live. **No refund executed.** Console clean (no errors).
- **Known cosmetic (identical TEST↔LIVE, NOT a mirror defect):** the payment-rail block shows "Refund Issued"
  (not "Partial Refund") for a partial because `src/pages/admin-orders/page.tsx` orders query selects
  `refund_amount` but NOT `refund_status` (confirmed absent in BOTH repos; d855138 didn't add it). The CORE
  fix still holds — `getModalDisplayStatus` keys "Refunded" off `status`/`refund_status='full'`, so a corrected
  Desiree (`status='completed'`) will read "Order (Completed)". Follow-up: add `refund_status` to the orders
  query in both repos to light up the "Partial Refund" label.
- **Desiree correction: NOT RUN** (owner-gated; needs Stripe charge confirmation — no Stripe read tool this
  session). Ready-to-run SQL above; dry-run confirms it matches exactly 1 row. DB `refund_amount=40` (< captured
  $99, price $59) + `doctor_status=patient_notified` corroborate a partial on a completed order.
- **Idempotency follow-up (TEST `73e78c5`, v34/v48) NOT included** — separate LIVE mirror (verify the
  `log_order_status_change` trigger exists on LIVE first).
