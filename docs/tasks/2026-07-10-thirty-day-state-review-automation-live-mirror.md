# Task: THIRTY-DAY-STATE-REVIEW-AUTOMATION-LIVE-MIRROR-001

**Date:** 2026-07-10 · **Scope:** LIVE (`cvwbozlbbmrjxznknouq`) · Mirrors TEST `9f5fa6b` (Phases 2–5) + `ab256b6` (Phase 6).

## Owner decision — FUTURE-ONLY rollout
Do **NOT** reopen or email any order whose day-29 has already passed — those crossed-date orders already received
their official letter **manually**. Fix the system going forward only.
- Backfill/enroll only orders whose computed day-29 due date is **still in the future**.
- Leave already-past-due orders untouched (no enroll, no past `official_letter_due_at`, no reopen queue).
- The 3 not-yet-due orders enroll and reopen normally when their future day-29 arrives.
- Let the existing daily 08:00 UTC cron fire future reopens (no manual trigger for historical orders).

## LIVE adaptation (vs TEST migration)
- LIVE `notify-thirty-day-reissue` (slug) is **verify_jwt=false**, called by the reopen fn with **no Authorization
  header** (Content-Type only; no vault key). So the LIVE reopen fn calls BOTH provider + customer functions no-auth,
  and `notify-thirty-day-customer` is deployed **verify_jwt=false** on LIVE (TEST used verify_jwt=true + Bearer).
- Backfill has an extra `AND (first_completed + 29d)::date > now()::date` gate (future-only) — TEST enrolled recent
  past-due misses; LIVE must not.

## Already-past-due orders EXCLUDED (handled manually — NOT reopened/emailed)
CA unless noted. All completed before the enrollment trigger existed; day-29 already crossed:
PT-MQ2OS7ML (Pearl-May Galvez, Jun7→Jul6, the reported order), PT-MPYYFGB7 (Jun5→Jul4), PT-MPSVXHGD (Jun1→Jun30),
PT-MPU97OUL (May31→Jun29), PT-MPQ6FHZA (May29→Jun27), PT-MPQ297Y7 (May28→Jun26), PT-MPP3LAWF (May28→Jun26),
PT-MPONX7MN (May27→Jun25). **0 reopened, 0 customer emails, 0 provider notifications for these.**

## Future orders ENROLLED by backfill (day-29 still ahead → reopen normally on their day)
PT-MQB40S1K (Jun12→Jul11), PT-MPYVF7H6 (Jun17→Jul16), PT-MQIFJGD9 (Jun17→Jul16).

## Status — DONE
- [x] Customer fn `notify-thirty-day-customer` deployed LIVE **v1, verify_jwt=false** (no-auth, matches provider fn).
- [x] Migration `20260710130000` applied LIVE (future-only backfill; day-29; date-based selector; cust marker col).
- [x] Frozen-file Phase 6 mirrored — LIVE lacked `handleMarkBackUnderReview` (TEST-only since 2026-06-16), so this
      ported that handler + applied the 3 visibility hunks. 4 hunks total (+114/-14), status-actions only.
- [x] type-check: 0 new errors (only pre-existing unrelated baseline); build PASS (32.71s, prerender 242/0).
- [x] Verification (SQL below). Admin modal browser E2E is login/OTP-walled (owner-gated); LIVE bundle boots clean,
      no console errors.

## Verification proof (LIVE, read-only after apply)
- **would_reopen_today = 0** → next cron tick reopens NO past-due order.
- **any_customer_emailed_ever = 0** → zero customer emails sent (the 8 past-due all excluded).
- The 8 past-due orders: all `not_enrolled / due_null / not_reopened / not_emailed`, status still `completed` — untouched.
- The 3 future orders enrolled; soonest reopen **PT-MQB40S1K on 2026-07-11** (its real day-29) → future automation works.
- `total_enrolled = 20` (16 prior + 3 future backfill + 1 pre-existing cancelled/enrolled PT-MQZQ1TKE, ignored by status gate).
- Frozen-file handler DB behavior identical to TEST (TEST SQL sim already proved: under-review, provider preserved,
  audit `manual_reopen_under_review` + status log, no `official_letter_*` change → no 30-day email).

## Manual owner check (one supervised LIVE admin login)
Open a completed order → "Mark Under Review" (amber, go-back icon) appears → (do NOT click a real customer order
without intent) → an under-review order shows NO such button → cancelled/refunded show none → Refund Only / Refund +
Cancel unchanged.
