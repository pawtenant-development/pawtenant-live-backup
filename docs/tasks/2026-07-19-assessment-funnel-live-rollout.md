# ASSESSMENT-FUNNEL-TRACKING-LIVE-ROLLOUT-004

**Session:** Claude session (2026-07-19) — owner-authorized LIVE rollout.
**Status:** 🟢 **ASSESSMENT FUNNEL TRACKING IS LIVE ON pawtenant.com AND VERIFIED.**

## SHAs / deployment
- **LIVE main:** `82444ea` (was `265bf37`). Two focused commits on top of `265bf37`:
  - `c50b728` — funnel DB truth (3 migration files).
  - `82444ea` — funnel frontend + admin display (10 source files).
- **LIVE production deployment:** `dpl_79jQkgxAqD7ntVPe41cZV88KsQ3w` (`pawtenant-production-n34b6vb91`),
  READY, **aliased to pawtenant.com + www**, built from `82444ea` via `vercel deploy --prod`
  (fresh build; pricing parity + guards green).
- **Rollback deployment:** `dpl_CSMabjoKmPRwYhNhBTHiisWhh5mQ` (`pawtenant-production-ir25jmm95`,
  commit `265bf37` = the phased-pricing cutover). isRollbackCandidate.
- **Source of truth ported:** TEST `e06775f` (funnel code tip `35696d2`), fully verified in TEST
  (ASSESSMENT-FUNNEL-PORTAL-VIEW-FINAL-CHECK-003).

## DB changes (LIVE `cvwbozlbbmrjxznknouq`, applied via direct DDL — no ledger repair)
- `20260716120000` — `idx_events_props_confirmation_id` + `get_visitor_journey_by_order` upgraded to
  UNION events by `props->>'confirmation_id'` (admin-gated).
- `20260718130000` — **`link_session_to_order` no longer stamps `visitor_sessions.paid_at`** (kills the
  false-paid stamp — LIVE's copy WAS the buggy `COALESCE(paid_at,now())` version; `mark_visitor_session_event`
  is now the SOLE `paid_at` writer) + `record_event_once` RPC + partial unique index
  `uniq_events_one_time_milestone` over exactly the 4 one-time milestones.
- `20260718125959` (**LIVE-only**) — PRESERVED (did not delete) 85 legacy duplicate `payment_success`
  re-fires by archiving them to `payment_success__legacy_dup` (owner-chosen). Combined `payment_success`
  rows preserved: **387** (302 live + 85 archived). Fully reversible.
- Verified post-apply: `record_event_once` exists, both indexes exist, `link_session_to_order` no longer
  references `paid_at`, sole vs.paid_at writer = `mark_visitor_session_event`, existing events intact.

## Verification (all on the deployed LIVE build / real read-only data)
- **pawtenant.com** serves `82444ea`: homepage pricing correct — **$129/$149 one-time, $115/$135 first
  year, $100 renewal, $79 retired (absent)**; 0 console errors; no horizontal overflow (desktop + 375px).
- **www → non-www** 308 redirect confirmed.
- **Deployed bundle contains the funnel code** (`trackEvent-Bcl2sAql.js`: customer_portal_viewed,
  record_event_once, payment_failed, card_declined).
- **Pricing untouched:** `check-pricing-parity` OK + `check-pricing-guards` OK in the deploy build.
- **type-check:** 0 funnel-file errors (8 pre-existing baseline errors in untouched files:
  AIAssistantTrustCard, AnalyticsTab[frozen], EmployeeHrDirectory, ProviderInternalRecords).
- **DB safety proofs (real LIVE data, read-only):**
  - `visitor_sessions.paid_at` count **unchanged (519)** → the rollout created no new false-paid stamp.
  - `orders.paid_at` count **unchanged (411)** → no order falsely flipped to paid.
  - A real historical pre-funnel paid order has **0 funnel milestone events** → Admin renders "Unknown".
  - A recent paid order has canonical `orders.paid_at` → Admin paid status is canonical.
- **Admin display** (Assessment & Checkout Funnel section, canonical paid truth, historical Unknown,
  admin-preview no-fire): the deployed `AttributionJourneyTab.tsx` + `my-orders/page.tsx` are
  BYTE-IDENTICAL to the TEST versions browser-verified in FINAL-CHECK-003. A LIVE-admin browser
  spot-check is available to the owner using their real admin login (not performed here — no real LIVE
  admin credentials, and synthetic LIVE data is forbidden).

## Preserved (not touched)
- LIVE phased pricing (`265bf37`) — parity + guards green.
- LIVE checkout **orange** styling (`#F97316`) in StripeCardForm (TEST's green `#059669` NOT ported).
- LIVE-only `my-orders` features: `patient_notification_sent_at` + `order.email` delivery-recipient logic.
- OTP tester guard NOT ported — `send-customer-otp` on LIVE has no `OTP_TEST_MODE`/allowlist/.invalid
  suppression (stays inert); logs no OTP code; `verify_jwt` unchanged. No edge function deployed.
- 4 LIVE orphan docs untouched.

## Data safety (rollout created nothing)
0 synthetic LIVE orders/customers, 0 payments, 0 communications, 0 provider assignments, 0 documents,
0 ad-conversion uploads, 0 false-paid timestamps. Only data mutation = archiving 85 duplicate
payment_success rows (rename, reversible). Organic real traffic during the window (+1 order, +45 sessions,
+88 events) is real customers, not the rollout.

## ⚠️ Observed pre-existing divergence (NOT changed — out of funnel scope)
- `assessment/page.tsx` `fetchClientSecret` uses `plan: step3.plan` on LIVE, whereas TEST hard-codes
  `plan: "one-time"` (CHECKOUT-PRICING-STABILITY-001). This is a PRICING-stability difference, not funnel;
  preserved untouched. Flag for a separate pricing review.
- `payment_success`/`payment_attempted` events carry `user_email` (pre-existing conversion/recovery
  behavior on both TEST and LIVE; unchanged — my port routes payment_success through the one-time path,
  which REDUCES it to one email-carrying row per order). The NEW funnel milestones are PII-free.

## Monitoring (follow-up — first natural LIVE examples)
Watch these on `cvwbozlbbmrjxznknouq` (events + orders):
1. New ESA lead → `assessment_started` + `assessment_submitted` (once) + `otp_requested`/`otp_verified`.
2. New PSD lead → same, `funnel_type:"psd"`.
3. Customer portal open → `customer_portal_viewed` (repeatable per session; never from admin preview).
4. Genuine payment attempt → `payment_attempted` at Pay press (repeatable), `payment_fields_completed` once.
5. Genuine payment failure → `payment_failed` with a safe category only (no raw message/PII).
6. Genuine success → `payment_success` once per order; Admin paid status = `orders.paid_at`.
7. Historical order in Admin → "Unknown / tracking not enabled"; no fabricated drop-off; no false paid.
For each: correct event, correct order association (confirmation_id), one-time milestones never duplicate
(unique index), repeatable counts where intended, no PII, no false paid status.

## Rollback plan
- **Frontend (reversible):** `vercel rollback dpl_CSMabjoKmPRwYhNhBTHiisWhh5mQ` (or promote it in the Vercel
  dashboard) → pawtenant.com back to the pre-funnel `265bf37` bundle. Also `git revert 82444ea c50b728`
  (no force push) if reverting source.
- **DB (durable safety improvements — prefer forward-fix over reverting):**
  - `record_event_once`, `uniq_events_one_time_milestone`, `idx_events_props_confirmation_id`,
    `get_visitor_journey_by_order` — additive; leave in place (dropping them is unnecessary and would
    reintroduce nothing harmful).
  - `link_session_to_order` fix is a SAFETY improvement — do NOT restore the old body (it re-creates false
    `visitor_sessions.paid_at` stamps). Keep the fix.
  - Archived duplicates: restore with
    `update public.events set event_name='payment_success' where event_name='payment_success__legacy_dup';`
  - Preserve all historical events; never drop the event ledger.

## Next task (released, NOT implemented here)
`ORDERS-RA-COMBO-CHIP-FILTER-001` — RA combo order chip + filters.
