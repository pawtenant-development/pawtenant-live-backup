-- SEQ-AUTOMATION-LIVE-SCHEDULER-ROOT-FIX
--
-- Root cause being addressed:
--   The lead-followup-sequence Edge Function relies on Supabase pg_cron to
--   fire automatically. That pg_cron job was historically configured
--   ad-hoc through the dashboard, with no migration in source control,
--   no heartbeat, and no admin visibility. When the job got disabled,
--   pointed at the wrong URL, or stopped firing for any reason, the
--   system failed silently — no emails went out, no row appeared in
--   audit_logs (which only writes when something actually fires).
--
-- This migration adds the durable, queryable side of the fix:
--   1. A singleton `sequence_automation_status` row that the engine
--      stamps on every invocation (auto OR manual), success OR failure.
--   2. RLS so authenticated admins can read the row from the admin UI.
--   3. NO pg_cron schedule is installed by this migration — the schedule
--      needs the project's CRON_SECRET embedded in the cron job body and
--      that secret must NOT live in source control. The exact one-time
--      SQL block Hamza pastes into the LIVE Supabase SQL Editor is
--      kept at docs/SCHEDULE_LEAD_FOLLOWUP_CRON.sql.
--
-- Idempotent. Re-applying is a no-op.

create table if not exists public.sequence_automation_status (
  id                       int primary key default 1,
  -- Heartbeat (stamped at every run, regardless of outcome)
  last_run_started_at      timestamptz,
  last_run_finished_at     timestamptz,
  last_invocation_source   text,            -- 'cron' | 'manual' | 'unknown'
  -- Outcome
  last_success_at          timestamptz,
  last_error_at            timestamptz,
  last_error_message       text,
  -- Last run summary (the SequenceResults object: counts, etc.)
  last_results             jsonb,
  last_processed           int,
  -- Bookkeeping
  updated_at               timestamptz not null default now(),
  -- Singleton guarantee — only one row, id = 1
  constraint sequence_automation_status_single check (id = 1)
);

-- Seed the singleton row if it does not exist.
insert into public.sequence_automation_status (id) values (1)
on conflict (id) do nothing;

-- RLS: enable + admin-read policy. Writes are done by the engine using
-- the service-role key, which bypasses RLS, so no write policy is needed.
alter table public.sequence_automation_status enable row level security;

-- Drop+create so re-running the migration repairs a stale policy.
drop policy if exists "admins read sequence_automation_status"
  on public.sequence_automation_status;

create policy "admins read sequence_automation_status"
  on public.sequence_automation_status
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.doctor_profiles dp
      where dp.user_id = auth.uid()
        and dp.is_active = true
        and (
          dp.is_admin = true
          or coalesce(dp.role, '') in ('owner', 'admin_manager')
        )
    )
  );

-- Auto-bump updated_at on UPDATE so admins can see freshness at a glance
-- even when the engine sets only a subset of columns.
create or replace function public.sequence_automation_status_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sequence_automation_status_touch
  on public.sequence_automation_status;

create trigger sequence_automation_status_touch
  before update on public.sequence_automation_status
  for each row
  execute function public.sequence_automation_status_touch();

comment on table public.sequence_automation_status is
  'Singleton heartbeat row for the lead-followup-sequence engine. id=1. '
  'Stamped at every invocation (cron or manual). Used by the admin Settings '
  'panel to surface silent automation failures.';
