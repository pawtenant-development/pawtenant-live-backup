-- ============================================================================
-- CRON-BLEED-CLEANUP-001  —  LIVE project record  (2026-07-08)
--
-- ⚠️ RUN ONLY ON THE LIVE PROJECT:  cvwbozlbbmrjxznknouq
--
-- What this removes (and why):
--   LIVE had TWO pg_cron jobs firing the SAME lead-followup-sequence function:
--     * lead-followup-sequence            @ */30   (stale, pre-fix ad-hoc job)
--     * lead-followup-sequence-every-15min @ */15  (the CANONICAL job — the
--                                                   root-fix in
--                                                   docs/SCHEDULE_LEAD_FOLLOWUP_CRON.sql
--                                                   installs ONLY this one)
--   Both carried the valid x-cron-secret, so both actually ran; at :00 and :30
--   they fired simultaneously. No double-sends occurred (the engine claims each
--   stage atomically before sending), but the duplicate is wasteful/fragile.
--   Keep the canonical */15 job; remove the stale */30 one.
--
-- Recorded in docs/ (not a migration) to match the repo convention that
-- lead-followup cron schedules live in docs/ (they carry the secret). Executed
-- via the Supabase MCP with an explicit project_id.
--
-- Idempotent: guarded unschedule, safe to re-run. Does NOT touch
-- lead-followup-sequence-every-15min or ghl-message-reconcile.
-- ============================================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'lead-followup-sequence'
             and schedule = '*/30 * * * *') then
    perform cron.unschedule('lead-followup-sequence');
  end if;
end $$;

-- Verify: expect exactly ONE lead-followup job (the */15 canonical one),
-- and ghl-message-reconcile still present & active.
-- select jobid, jobname, schedule, active from cron.job
--  where jobname like '%lead-followup%' or jobname = 'ghl-message-reconcile'
--  order by jobid;
