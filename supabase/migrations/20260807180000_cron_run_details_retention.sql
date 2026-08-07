-- SUPABASE-DISK-IO-BUDGET-AND-CRON-RETENTION-001
--
-- pg_cron records every execution in cron.job_run_details and never removes
-- anything. History reached back to 2026-03-20 (LIVE: 57,407 rows / 42 MB,
-- ~22% of the database) purely to record that a job succeeded months ago. The
-- rows are cheap individually; what is not cheap is that pg_cron periodically
-- rewrites their status in bulk — one observed
-- `update cron.job_run_details set status = ...` cost 5,067 PHYSICAL reads at a
-- 99.98% miss rate, the single largest source of disk reads measured here.
--
-- RETENTION IS NOT UNIFORM, deliberately:
--   * succeeded runs are noise after 30 days;
--   * anything NOT succeeded is kept for 90 days, because a failure is the
--     entire reason this table is worth reading. Every failure recorded on LIVE
--     was older than 30 days, so a flat 30-day rule would have deleted them all.
--
-- Bounded batches by ctid: one unbounded DELETE over tens of thousands of rows
-- holds locks and writes one large WAL transaction — the opposite of what a
-- project short of IO budget needs.
create or replace function public.purge_cron_run_details(
  p_batch_size  integer default 5000,
  p_max_batches integer default 40
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_deleted integer := 0;
  v_batch   integer;
  v_i       integer := 0;
begin
  loop
    exit when v_i >= p_max_batches;

    delete from cron.job_run_details
     where ctid in (
       select d.ctid
         from cron.job_run_details d
        where (d.status = 'succeeded' and d.start_time < now() - interval '30 days')
           or (d.status <> 'succeeded' and d.start_time < now() - interval '90 days')
        limit p_batch_size
     );

    get diagnostics v_batch = row_count;
    v_deleted := v_deleted + v_batch;
    exit when v_batch = 0;
    v_i := v_i + 1;
  end loop;

  return v_deleted;
end;
$$;

revoke all on function public.purge_cron_run_details(integer, integer) from public;
revoke all on function public.purge_cron_run_details(integer, integer) from anon;
revoke all on function public.purge_cron_run_details(integer, integer) from authenticated;
grant execute on function public.purge_cron_run_details(integer, integer) to service_role;

comment on function public.purge_cron_run_details(integer, integer) is
  'SUPABASE-DISK-IO-BUDGET-AND-CRON-RETENTION-001: bounded-batch retention for cron.job_run_details. Succeeded runs kept 30 days, failures kept 90.';

-- Scheduled separately (not in this file) so the migration stays idempotent:
--   select cron.schedule('purge-cron-run-details','25 3 * * *',
--                        $c$select public.purge_cron_run_details();$c$);
