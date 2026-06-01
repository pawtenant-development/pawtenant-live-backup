-- Company OS — Adjusted timesheet report (read-only, admin range RPC).
-- Per employee/day over a PKT date range: raw + applied-adjusted gross/break/net,
-- clock/break session counts, applied/reversed adjustment counts, approved-leave
-- overlap, and pending/approved attendance-correction counts. Read-only — does
-- NOT mutate any data. Admin-only (owner/admin_manager + is_admin). Employees
-- only (providers/customers excluded). NO salary/pay/payroll data of any kind.
-- Applied to TEST (opudhofjbydrljgleofq) via Supabase MCP on 2026-06-03.

create or replace function public.get_team_adjusted_timesheet_range(p_start date, p_end date)
returns table (
  team_member_id uuid,
  display_name text,
  employee_code text,
  title text,
  domain_role text,
  work_date date,
  gross_seconds bigint,
  break_seconds bigint,
  net_seconds bigint,
  gross_adjustment_seconds bigint,
  break_adjustment_seconds bigint,
  net_adjustment_seconds bigint,
  adjusted_gross_seconds bigint,
  adjusted_break_seconds bigint,
  adjusted_net_seconds bigint,
  clock_sessions integer,
  break_sessions integer,
  applied_adjustments integer,
  reversed_adjustments integer,
  on_leave boolean,
  pending_corrections integer,
  approved_corrections integer,
  has_open_session boolean
)
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.doctor_profiles dp
     where dp.user_id = auth.uid() and dp.is_admin = true
       and coalesce(dp.role,'') in ('owner','admin_manager')
  ) then
    raise exception 'not authorized to view team timesheet report';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'invalid date range';
  end if;

  return query
  with cl as (
    select t.team_member_id as tm, t.work_date as wd,
      coalesce(sum(extract(epoch from (coalesce(t.clock_out_at, now()) - t.clock_in_at))), 0)::bigint as gross,
      count(*)::int as sessions,
      bool_or(t.clock_out_at is null) as any_open
    from public.time_clock_entries t
    where t.work_date between p_start and p_end
    group by 1, 2
  ),
  br as (
    select b.team_member_id as tm, (b.started_at at time zone 'Asia/Karachi')::date as wd,
      coalesce(sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at))), 0)::bigint as brk,
      count(*)::int as sessions
    from public.employee_break_records b
    where b.status <> 'cancelled'
      and (b.started_at at time zone 'Asia/Karachi')::date between p_start and p_end
    group by 1, 2
  ),
  adj as (
    select a.team_member_id as tm, a.adjustment_date as wd,
      coalesce(sum(a.gross_adjustment_seconds) filter (where a.status = 'applied'), 0)::bigint as g,
      coalesce(sum(a.break_adjustment_seconds) filter (where a.status = 'applied'), 0)::bigint as b,
      count(*) filter (where a.status = 'applied')::int as applied_cnt,
      count(*) filter (where a.status = 'reversed')::int as reversed_cnt
    from public.employee_timesheet_adjustments a
    where a.adjustment_date between p_start and p_end
    group by 1, 2
  ),
  corr as (
    select c.team_member_id as tm, c.correction_date as wd,
      count(*) filter (where c.status = 'pending')::int as pend,
      count(*) filter (where c.status = 'approved')::int as appr
    from public.employee_attendance_correction_requests c
    where c.correction_date between p_start and p_end
    group by 1, 2
  ),
  lv as (
    select l.team_member_id as tm, gs::date as wd
    from public.employee_leave_requests l
    cross join lateral generate_series(greatest(l.start_date, p_start), least(l.end_date, p_end), interval '1 day') as gs
    where l.status = 'approved' and l.start_date <= p_end and l.end_date >= p_start
    group by 1, 2
  ),
  grid as (
    select tm, wd from cl
    union select tm, wd from br
    union select tm, wd from adj
    union select tm, wd from corr
    union select tm, wd from lv
  )
  select
    g.tm,
    m.display_name,
    m.employee_code,
    m.title,
    m.domain_role,
    g.wd,
    coalesce(cl.gross, 0)::bigint,
    coalesce(br.brk, 0)::bigint,
    greatest(coalesce(cl.gross, 0) - coalesce(br.brk, 0), 0)::bigint,
    coalesce(adj.g, 0)::bigint,
    coalesce(adj.b, 0)::bigint,
    (coalesce(adj.g, 0) - coalesce(adj.b, 0)),
    (coalesce(cl.gross, 0) + coalesce(adj.g, 0)),
    (coalesce(br.brk, 0) + coalesce(adj.b, 0)),
    greatest((coalesce(cl.gross, 0) + coalesce(adj.g, 0)) - (coalesce(br.brk, 0) + coalesce(adj.b, 0)), 0)::bigint,
    coalesce(cl.sessions, 0),
    coalesce(br.sessions, 0),
    coalesce(adj.applied_cnt, 0),
    coalesce(adj.reversed_cnt, 0),
    (lv.tm is not null),
    coalesce(corr.pend, 0),
    coalesce(corr.appr, 0),
    coalesce(cl.any_open, false)
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
