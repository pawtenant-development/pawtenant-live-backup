-- ASSESSMENT-FUNNEL-TRACKING-LIVE-ROLLOUT-004 — LIVE-ONLY preservation step.
--
-- Context: unlike TEST (which had ~no historical milestone events), the LIVE
-- events ledger already contained 387 `payment_success` rows for 302 orders —
-- i.e. 85 REDUNDANT re-fires (the OLD analytics fired payment_success on every
-- thank-you-page load; a customer re-opening the thank-you URL logged success
-- again for the SAME order + SAME Stripe payment_intent). Verified: no LIVE edge
-- function reads events.payment_success; Admin paid-truth is orders.paid_at.
--
-- The canonical funnel migration 20260718130000 builds a PARTIAL UNIQUE INDEX
-- over the one-time milestones, which requires collapsing those duplicates.
-- On TEST that migration DELETES the extra rows. On LIVE the owner explicitly
-- chose to PRESERVE historical events (no deletion). So this LIVE-only step runs
-- FIRST and ARCHIVES the 85 duplicate rows by renaming their event_name to
-- `payment_success__legacy_dup` (keeping the earliest row per order as the live
-- `payment_success`). Nothing is deleted; every row and all props are retained.
-- The rename excludes them from the partial unique index (which matches the exact
-- name `payment_success`), so 20260718130000 then builds cleanly and its own
-- dedupe-DELETE becomes a 0-row no-op.
--
-- FULLY REVERSIBLE: to undo, run
--   update public.events set event_name='payment_success'
--    where event_name='payment_success__legacy_dup';
--
-- Idempotent: after the first run no `payment_success` duplicates remain, so a
-- re-run rewrites 0 rows.

with ranked as (
  select id,
         row_number() over (
           partition by event_name, (props->>'confirmation_id')
           order by created_at asc, id asc
         ) as rn
    from public.events
   where event_name = 'payment_success'
     and props->>'confirmation_id' is not null
)
update public.events e
   set event_name = 'payment_success__legacy_dup',
       props = coalesce(e.props, '{}'::jsonb)
               || jsonb_build_object(
                    'archived_by',   'ASSESSMENT-FUNNEL-TRACKING-LIVE-ROLLOUT-004',
                    'archived_from', 'payment_success'
                  )
  from ranked r
 where e.id = r.id
   and r.rn > 1;
