-- Company OS — Make applied leave amendments authoritative in on-leave logic.
-- Recreates the two admin SECURITY DEFINER read RPCs so their approved-leave
-- overlap uses EFFECTIVE leave (original row overlaid by the latest APPLIED,
-- non-reversed employee_leave_adjustment): effective dates/status drive
-- on_leave; withdraw-by-amendment (effective status 'cancelled') no longer
-- counts; pending/reversed amendments do NOT affect it. Read-only, additive,
-- non-destructive — original leave rows are never mutated. Admin-only.
-- No salary/pay/payroll data. Applied to TEST via Supabase MCP on 2026-06-03.

-- Admin net summary for a single date — effective on_leave.
create or replace function public.get_team_attendance_summary_for_date(p_date date)
returns table (
  team_member_id uuid, display_name text, employee_code text, title text, domain_role text,
  gross_seconds bigint, break_seconds bigint, net_seconds bigint, first_clock_in timestamptz, last_clock_out timestamptz,
  active_clocked_in boolean, active_break boolean, break_count integer, on_leave boolean,
  gross_adjustment_seconds bigint, break_adjustment_seconds bigint, net_adjustment_seconds bigint,
  adjusted_gross_seconds bigint, adjusted_break_seconds bigint, adjusted_net_worked_seconds bigint, has_adjustments boolean
)
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.doctor_profiles dp where dp.user_id = auth.uid() and dp.is_admin = true and coalesce(dp.role,'') in ('owner','admin_manager')) then
    raise exception 'not authorized to view team attendance summary';
  end if;
  return query
  with cl as (
    select t.team_member_id as tm, min(t.clock_in_at) as fi, max(t.clock_out_at) as lo,
      coalesce(sum(extract(epoch from (coalesce(t.clock_out_at, now()) - t.clock_in_at))), 0)::bigint as gross, bool_or(t.clock_out_at is null) as any_open
    from public.time_clock_entries t where t.work_date = p_date group by t.team_member_id
  ),
  br as (
    select b.team_member_id as tm, coalesce(sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at))), 0)::bigint as brk, count(*)::int as cnt, bool_or(b.status = 'active') as any_active
    from public.employee_break_records b where b.status <> 'cancelled' and (b.started_at at time zone 'Asia/Karachi')::date = p_date group by b.team_member_id
  ),
  adj as (
    select a.team_member_id as tm, coalesce(sum(a.gross_adjustment_seconds),0)::bigint as g, coalesce(sum(a.break_adjustment_seconds),0)::bigint as b, count(*)::int as c
    from public.employee_timesheet_adjustments a where a.status = 'applied' and a.adjustment_date = p_date group by a.team_member_id
  ),
  eff_leave as (
    select l.team_member_id as tm,
      coalesce((a.applied_snapshot->>'start_date')::date, l.start_date) as eff_start,
      coalesce((a.applied_snapshot->>'end_date')::date, l.end_date) as eff_end,
      coalesce(a.applied_snapshot->>'status', l.status) as eff_status
    from public.employee_leave_requests l
    left join lateral (
      select la.applied_snapshot from public.employee_leave_adjustments la
      where la.leave_request_id = l.id and la.status = 'applied'
      order by la.applied_at desc limit 1
    ) a on true
  ),
  lv as (
    select tm from eff_leave where eff_status = 'approved' and p_date between eff_start and eff_end group by tm
  ),
  ids as (select tm from cl union select tm from br union select tm from lv union select tm from adj)
  select i.tm, m.display_name, m.employee_code, m.title, m.domain_role,
    coalesce(cl.gross, 0)::bigint, coalesce(br.brk, 0)::bigint, greatest(coalesce(cl.gross, 0) - coalesce(br.brk, 0), 0)::bigint,
    cl.fi, cl.lo, coalesce(cl.any_open, false), coalesce(br.any_active, false), coalesce(br.cnt, 0), (lv.tm is not null),
    coalesce(adj.g, 0)::bigint, coalesce(adj.b, 0)::bigint, (coalesce(adj.g,0) - coalesce(adj.b,0)),
    (coalesce(cl.gross,0) + coalesce(adj.g,0)), (coalesce(br.brk,0) + coalesce(adj.b,0)),
    greatest((coalesce(cl.gross,0) + coalesce(adj.g,0)) - (coalesce(br.brk,0) + coalesce(adj.b,0)), 0)::bigint, (coalesce(adj.c,0) > 0)
  from ids i
  left join public.team_members m on m.id = i.tm
  left join cl on cl.tm = i.tm left join br on br.tm = i.tm left join adj on adj.tm = i.tm left join lv on lv.tm = i.tm
  order by m.display_name nulls last;
end;
$$;
grant execute on function public.get_team_attendance_summary_for_date(date) to authenticated;

-- Adjusted timesheet range report — effective on_leave per day.
create or replace function public.get_team_adjusted_timesheet_range(p_start date, p_end date)
returns table (
  team_member_id uuid, display_name text, employee_code text, title text, domain_role text,
  work_date date,
  gross_seconds bigint, break_seconds bigint, net_seconds bigint,
  gross_adjustment_seconds bigint, break_adjustment_seconds bigint, net_adjustment_seconds bigint,
  adjusted_gross_seconds bigint, adjusted_break_seconds bigint, adjusted_net_seconds bigint,
  clock_sessions integer, break_sessions integer,
  applied_adjustments integer, reversed_adjustments integer,
  on_leave boolean, pending_corrections integer, approved_corrections integer, has_open_session boolean
)
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.doctor_profiles dp where dp.user_id = auth.uid() and dp.is_admin = true and coalesce(dp.role,'') in ('owner','admin_manager')) then
    raise exception 'not authorized to view team timesheet report';
  end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'invalid date range'; end if;

  return query
  with cl as (
    select t.team_member_id as tm, t.work_date as wd,
      coalesce(sum(extract(epoch from (coalesce(t.clock_out_at, now()) - t.clock_in_at))), 0)::bigint as gross,
      count(*)::int as sessions, bool_or(t.clock_out_at is null) as any_open
    from public.time_clock_entries t where t.work_date between p_start and p_end group by 1, 2
  ),
  br as (
    select b.team_member_id as tm, (b.started_at at time zone 'Asia/Karachi')::date as wd,
      coalesce(sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at))), 0)::bigint as brk, count(*)::int as sessions
    from public.employee_break_records b
    where b.status <> 'cancelled' and (b.started_at at time zone 'Asia/Karachi')::date between p_start and p_end group by 1, 2
  ),
  adj as (
    select a.team_member_id as tm, a.adjustment_date as wd,
      coalesce(sum(a.gross_adjustment_seconds) filter (where a.status = 'applied'), 0)::bigint as g,
      coalesce(sum(a.break_adjustment_seconds) filter (where a.status = 'applied'), 0)::bigint as b,
      count(*) filter (where a.status = 'applied')::int as applied_cnt,
      count(*) filter (where a.status = 'reversed')::int as reversed_cnt
    from public.employee_timesheet_adjustments a where a.adjustment_date between p_start and p_end group by 1, 2
  ),
  corr as (
    select c.team_member_id as tm, c.correction_date as wd,
      count(*) filter (where c.status = 'pending')::int as pend, count(*) filter (where c.status = 'approved')::int as appr
    from public.employee_attendance_correction_requests c where c.correction_date between p_start and p_end group by 1, 2
  ),
  eff_leave as (
    select l.team_member_id as tm,
      coalesce((a.applied_snapshot->>'start_date')::date, l.start_date) as eff_start,
      coalesce((a.applied_snapshot->>'end_date')::date, l.end_date) as eff_end,
      coalesce(a.applied_snapshot->>'status', l.status) as eff_status
    from public.employee_leave_requests l
    left join lateral (
      select la.applied_snapshot from public.employee_leave_adjustments la
      where la.leave_request_id = l.id and la.status = 'applied'
      order by la.applied_at desc limit 1
    ) a on true
  ),
  lv as (
    select e.tm, gs::date as wd
    from eff_leave e
    cross join lateral generate_series(greatest(e.eff_start, p_start), least(e.eff_end, p_end), interval '1 day') as gs
    where e.eff_status = 'approved' and e.eff_start <= p_end and e.eff_end >= p_start
    group by 1, 2
  ),
  grid as (
    select tm, wd from cl union select tm, wd from br union select tm, wd from adj union select tm, wd from corr union select tm, wd from lv
  )
  select
    g.tm, m.display_name, m.employee_code, m.title, m.domain_role, g.wd,
    coalesce(cl.gross, 0)::bigint, coalesce(br.brk, 0)::bigint, greatest(coalesce(cl.gross, 0) - coalesce(br.brk, 0), 0)::bigint,
    coalesce(adj.g, 0)::bigint, coalesce(adj.b, 0)::bigint, (coalesce(adj.g, 0) - coalesce(adj.b, 0)),
    (coalesce(cl.gross, 0) + coalesce(adj.g, 0)), (coalesce(br.brk, 0) + coalesce(adj.b, 0)),
    greatest((coalesce(cl.gross, 0) + coalesce(adj.g, 0)) - (coalesce(br.brk, 0) + coalesce(adj.b, 0)), 0)::bigint,
    coalesce(cl.sessions, 0), coalesce(br.sessions, 0), coalesce(adj.applied_cnt, 0), coalesce(adj.reversed_cnt, 0),
    (lv.tm is not null), coalesce(corr.pend, 0), coalesce(corr.appr, 0), coalesce(cl.any_open, false)
  from grid g
  left join public.team_members m on m.id = g.tm
  left join cl on cl.tm = g.tm and cl.wd = g.wd
  left join br on br.tm = g.tm and br.wd = g.wd
  left join adj on adj.tm = g.tm and adj.wd = g.wd
  left join corr on corr.tm = g.tm and corr.wd = g.wd
  left join lv on lv.tm = g.tm and lv.wd = g.wd
  order by m.display_name nulls last, g.wd;
end;
$$;
grant execute on function public.get_team_adjusted_timesheet_range(date, date) to authenticated;
