-- ============================================================================
-- SEQ-AUTOMATION-LIVE-SCHEDULER-ROOT-FIX
-- One-time SQL block to install / repair the automatic lead-followup-sequence
-- schedule on the LIVE Supabase project (ref: cvwbozlbbmrjxznknouq).
--
-- Why this lives in docs/ and NOT in supabase/migrations/:
--   The schedule body contains the project's LEAD_FOLLOWUP_CRON_SECRET, which
--   must never be committed to source control. Hamza pastes this block into
--   the Supabase SQL Editor *once*, replacing the two placeholders, and the
--   pg_cron job is installed durably.
--
-- HOW TO USE
--   1. Set the function secret in LIVE:
--        npx supabase secrets set LEAD_FOLLOWUP_CRON_SECRET=<random-strong-token> \
--          --project-ref cvwbozlbbmrjxznknouq
--      Pick a long, opaque random string (e.g. `openssl rand -hex 32`).
--   2. Redeploy the engine so it picks up the new secret:
--        npx supabase functions deploy lead-followup-sequence \
--          --project-ref cvwbozlbbmrjxznknouq --no-verify-jwt
--   3. Apply the migration that creates the heartbeat table:
--        npx supabase db push --project-ref cvwbozlbbmrjxznknouq
--      (or in Studio: SQL Editor → run
--      `supabase/migrations/20260511120000_lead_followup_sequence_automation.sql`)
--   4. Replace BOTH placeholders below and run this entire block in the
--      Supabase SQL Editor as the postgres role:
--        <PASTE_LEAD_FOLLOWUP_CRON_SECRET_HERE>  → exact secret string
--        <PASTE_PROJECT_REF_HERE>                → cvwbozlbbmrjxznknouq
--   5. Verify with the diagnostic queries at the bottom of this file.
--
-- This block is idempotent — it unschedules any prior job with the same name
-- before reinstalling, so it's safe to re-run after rotating the secret.
-- ============================================================================

-- Extensions (no-op if already enabled on the project)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any prior schedule with our name so this block stays idempotent.
-- pg_cron's unschedule() is strict about job name existence — wrap in a guard.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'lead-followup-sequence-every-15min') then
    perform cron.unschedule('lead-followup-sequence-every-15min');
  end if;
end $$;

-- Install the new schedule. */15 * * * *  →  every 15 minutes.
-- Eligibility check inside the engine is idempotent (dedupe + stamp columns),
-- so a tighter cadence is safe — the engine will just no-op on most ticks.
select cron.schedule(
  'lead-followup-sequence-every-15min',
  '*/15 * * * *',
  $cmd$
  select net.http_post(
    url    := 'https://<PASTE_PROJECT_REF_HERE>.supabase.co/functions/v1/lead-followup-sequence',
    headers:= jsonb_build_object(
      'Content-Type',   'application/json',
      'x-cron-secret',  '<PASTE_LEAD_FOLLOWUP_CRON_SECRET_HERE>'
    ),
    body   := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- DIAGNOSTICS — run these any time to confirm the schedule is healthy.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. The cron job exists and is active.
-- select jobid, jobname, schedule, active, command
--   from cron.job
--  where jobname = 'lead-followup-sequence-every-15min';

-- 2. Recent cron-job runs (status, return code, response body excerpt).
-- select runid, jobid, status, return_message, end_time
--   from cron.job_run_details
--  where jobid = (select jobid from cron.job where jobname = 'lead-followup-sequence-every-15min')
--  order by end_time desc nulls last
--  limit 20;

-- 3. Heartbeat row — should refresh every 15 minutes on a healthy schedule.
-- select id, last_run_started_at, last_run_finished_at, last_invocation_source,
--        last_success_at, last_error_at, last_error_message, last_processed, last_results
--   from public.sequence_automation_status
--  where id = 1;

-- 4. Last 10 net.http_post calls' raw HTTP results (per pg_net log).
-- select id, status_code, content_type,
--        substr(content::text, 1, 200) as body_excerpt,
--        created
--   from net._http_response
--  order by created desc
--  limit 10;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK — disable automation immediately without losing the job definition.
-- ─────────────────────────────────────────────────────────────────────────────

-- Disable (keeps the row in cron.job, just stops firing):
-- update cron.job set active = false where jobname = 'lead-followup-sequence-every-15min';
--
-- Re-enable:
-- update cron.job set active = true  where jobname = 'lead-followup-sequence-every-15min';
--
-- Hard remove (use only if reinstalling from scratch):
-- select cron.unschedule('lead-followup-sequence-every-15min');
