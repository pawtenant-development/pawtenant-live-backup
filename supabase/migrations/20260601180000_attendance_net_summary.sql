-- Company OS — Attendance net worked time summaries.
-- Computes gross clocked time − break time = net worked time, per employee/day,
-- live (includes open clock entry + active break elapsed). Read-only RPCs over
-- existing tables (time_clock_entries, employee_break_records, team_members,
-- employee_leave_requests). Additive — does NOT touch the existing
-- attendance_daily_summary recompute system, Time In/Out, or break tracking.
-- NOT payroll. PKT (Asia/Karachi) day anchoring matches existing convention.
-- Applied to TEST (opudhofjbydrljgleofq) via Supabase MCP on 2026-06-01.

-- 1) Employee: today's summary (single row; zeros when no activity).
create or replace function public.get_my_today_attendance_summary()
returns table (
  work_date date,
  gross_seconds bigint,
  break_seconds bigint,
  net_seconds bigint,
  first_clock_in timestamptz,
  last_clock_out timestamptz,
  active_clocked_in boolean,
  active_break boolean,
  break_count integer
)
language sql security definer set search_path = public
as $$
  with me as (
    select tm.id from public.team_members tm where tm.user_id = auth.uid() limit 1
  ),
  d as (select (now() at time zone 'Asia/Karachi')::date as wd),
  cl as (
    select
      min(t.clock_in_at) as first_in,
      max(t.clock_out_at) as last_out,
      coalesce(sum(extract(epoch from (coalesce(t.clock_out_at, now()) - t.clock_in_at))), 0)::bigint as gross
    from public.time_clock_entries t, me, d
    where t.team_member_id = me.id and t.work_date = d.wd
  ),
  br as (
    select
      coalesce(sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at))), 0)::bigint as brk,
      count(*)::int as cnt
    from public.employee_break_records b, me, d
    where b.team_member_id = me.id
      and b.status <> 'cancelled'
      and (b.started_at at time zone 'Asia/Karachi')::date = d.wd
  ),
  flags as (
    select
      exists(select 1 from public.time_clock_entries t, me where t.team_member_id = me.id and t.clock_out_at is null) as oc,
      exists(select 1 from public.employee_break_records b, me where b.team_member_id = me.id and b.status = 'active') as ab
  )
  select
    d.wd,
    cl.gross,
    br.brk,
    greatest(cl.gross - br.brk, 0)::bigint,
    cl.first_in,
    cl.last_out,
    flags.oc,
    flags.ab,
    br.cnt
  from d, cl, br, flags;
$$;

grant execute on function public.get_my_today_attendance_summary() to authenticated;

-- 2) Employee: per-day summary for a PKT date range (own data only).
create or replace function public.get_my_attendance_summary_range(p_start date, p_end date)
returns table (
  work_date date,
  gross_seconds bigint,
  break_seconds bigint,
  net_seconds bigint,
  first_clock_in timestamptz,
  last_clock_out timestamptz,
  active_clocked_in boolean,
  active_break boolean,
  break_count integer
)
language sql security definer set search_path = public
as $$
  with me as (
    select tm.id from public.team_members tm where tm.user_id = auth.uid() limit 1
  ),
  cl as (
    select t.work_date as wd,
      min(t.clock_in_at) as fi,
      max(t.clock_out_at) as lo,
      coalesce(sum(extract(epoch from (coalesce(t.clock_out_at, now()) - t.clock_in_at))), 0)::bigint as gross,
      bool_or(t.clock_out_at is null) as any_open
    from public.time_clock_entries t, me
    where t.team_member_id = me.id and t.work_date between p_start and p_end
    group by t.work_date
  ),
  br as (
    select (b.started_at at time zone 'Asia/Karachi')::date as wd,
      coalesce(sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at))), 0)::bigint as brk,
      count(*)::int as cnt,
      bool_or(b.status = 'active') as any_active
    from public.employee_break_records b, me
    where b.team_member_id = me.id
      and b.status <> 'cancelled'
      and (b.started_at at time zone 'Asia/Karachi')::date between p_start and p_end
    group by 1
  )
  select
    coalesce(cl.wd, br.wd) as work_date,
    coalesce(cl.gross, 0)::bigint,
    coalesce(br.brk, 0)::bigint,
    greatest(coalesce(cl.gross, 0) - coalesce(br.brk, 0), 0)::bigint,
    cl.fi,
    cl.lo,
    coalesce(cl.any_open, false),
    coalesce(br.any_active, false),
    coalesce(br.cnt, 0)
  from cl full outer join br on cl.wd = br.wd
  order by 1 desc;
$$;

grant execute on function public.get_my_attendance_summary_range(date, date) to authenticated;

-- 3) Admin: team summary for one PKT date (owner/admin_manager + is_admin only).
--    Returns a row per employee who has clock activity, break activity, or an
--    approved leave covering the date. on_leave reflects approved leave overlap.
create or replace function public.get_team_attendance_summary_for_date(p_date date)
returns table (
  team_member_id uuid,
  display_name text,
  employee_code text,
  title text,
  domain_role text,
  gross_seconds bigint,
  break_seconds bigint,
  net_seconds bigint,
  first_clock_in timestamptz,
  last_clock_out timestamptz,
  active_clocked_in boolean,
  active_break boolean,
  break_count integer,
  on_leave boolean
)
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.doctor_profiles dp
     where dp.user_id = auth.uid() and dp.is_admin = true
       and coalesce(dp.role,'') in ('owner','admin_manager')
  ) then
    raise exception 'not authorized to view team attendance summary';
  end if;

  return query
  with cl as (
    select t.team_member_id as tm,
      min(t.clock_in_at) as fi,
      max(t.clock_out_at) as lo,
      coalesce(sum(extract(epoch from (coalesce(t.clock_out_at, now()) - t.clock_in_at))), 0)::bigint as gross,
      bool_or(t.clock_out_at is null) as any_open
    from public.time_clock_entries t
    where t.work_date = p_date
    group by t.team_member_id
  ),
  br as (
    select b.team_member_id as tm,
      coalesce(sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at))), 0)::bigint as brk,
      count(*)::int as cnt,
      bool_or(b.status = 'active') as any_active
    from public.employee_break_records b
    where b.status <> 'cancelled'
      and (b.started_at at time zone 'Asia/Karachi')::date = p_date
    group by b.team_member_id
  ),
  lv as (
    select l.team_member_id as tm
    from public.employee_leave_requests l
    where l.status = 'approved' and p_date between l.start_date and l.end_date
    group by l.team_member_id
  ),
  ids as (
    select tm from cl
    union select tm from br
    union select tm from lv
  )
  select
    i.tm,
    m.display_name,
    m.employee_code,
    m.title,
    m.domain_role,
    coalesce(cl.gross, 0)::bigint,
    coalesce(br.brk, 0)::bigint,
    greatest(coalesce(cl.gross, 0) - coalesce(br.brk, 0), 0)::bigint,
    cl.fi,
    cl.lo,
    coalesce(cl.any_open, false),
    coalesce(br.any_active, false),
    coalesce(br.cnt, 0),
    (lv.tm is not null)
  from ids i
  left join public.team_members m on m.id = i.tm
  left join cl on cl.tm = i.tm
  left join br on br.tm = i.tm
  left join lv on lv.tm = i.tm
  order by m.display_name nulls last;
end;
$$;

grant execute on function public.get_team_attendance_summary_for_date(date) to authenticated;
