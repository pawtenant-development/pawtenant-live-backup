-- Company OS — Auditable timesheet adjustment layer.
-- Approved attendance/leave corrections can be APPLIED as ledger overlays that
-- adjust the official net worked time WITHOUT ever mutating raw
-- time_clock_entries / employee_break_records / employee_leave_requests.
-- Full audit trail: original / requested / applied snapshots, who/when, reversible.
-- Additive + idempotent. Admin-only apply/reverse via SECURITY DEFINER RPCs.
-- Employees read only their own adjustments. NOT payroll.
-- Applied to TEST (opudhofjbydrljgleofq) via Supabase MCP on 2026-06-03.

-- ── PART A: attendance timesheet adjustment ledger ───────────────────────────
create table if not exists public.employee_timesheet_adjustments (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  source_type text not null default 'attendance_correction',
  source_request_id uuid references public.employee_attendance_correction_requests(id) on delete set null,
  adjustment_date date not null,
  adjustment_kind text not null,
  original_clock_entry_id uuid references public.time_clock_entries(id) on delete set null,
  original_break_record_id uuid references public.employee_break_records(id) on delete set null,
  original_snapshot jsonb not null default '{}'::jsonb,
  requested_snapshot jsonb not null default '{}'::jsonb,
  applied_snapshot jsonb not null default '{}'::jsonb,
  gross_adjustment_seconds integer not null default 0,
  break_adjustment_seconds integer not null default 0,
  net_adjustment_seconds integer generated always as (gross_adjustment_seconds - break_adjustment_seconds) stored,
  reason text,
  manager_note text,
  status text not null default 'applied',
  applied_by uuid not null references auth.users(id),
  applied_at timestamptz not null default now(),
  reversed_by uuid references auth.users(id),
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='ts_adj_source_type_chk') then
    alter table public.employee_timesheet_adjustments add constraint ts_adj_source_type_chk
      check (source_type in ('attendance_correction','manual_admin_adjustment_future'));
  end if;
  if not exists (select 1 from pg_constraint where conname='ts_adj_kind_chk') then
    alter table public.employee_timesheet_adjustments add constraint ts_adj_kind_chk
      check (adjustment_kind in ('clock_in','clock_out','clock_in_out','break_start','break_end',
                                 'break_duration','add_work_time','subtract_work_time','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname='ts_adj_status_chk') then
    alter table public.employee_timesheet_adjustments add constraint ts_adj_status_chk
      check (status in ('applied','reversed'));
  end if;
end $$;

create index if not exists idx_ts_adj_member on public.employee_timesheet_adjustments (team_member_id);
create index if not exists idx_ts_adj_date on public.employee_timesheet_adjustments (adjustment_date);
create index if not exists idx_ts_adj_status on public.employee_timesheet_adjustments (status);
create index if not exists idx_ts_adj_source on public.employee_timesheet_adjustments (source_request_id);
-- One APPLIED adjustment per source correction request (idempotency). A reversed
-- row frees the slot so a corrected re-apply is possible.
create unique index if not exists uq_ts_adj_one_applied_per_request
  on public.employee_timesheet_adjustments (source_request_id)
  where status = 'applied' and source_request_id is not null;

alter table public.employee_timesheet_adjustments enable row level security;

drop policy if exists ts_adj_admin_all on public.employee_timesheet_adjustments;
create policy ts_adj_admin_all on public.employee_timesheet_adjustments
  for all to authenticated
  using (exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')))
  with check (exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')));

drop policy if exists ts_adj_self_read on public.employee_timesheet_adjustments;
create policy ts_adj_self_read on public.employee_timesheet_adjustments
  for select to authenticated
  using (team_member_id in (select tm.id from public.team_members tm where tm.user_id = auth.uid()));

create or replace function public.ts_adj_set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists ts_adj_set_updated_at on public.employee_timesheet_adjustments;
create trigger ts_adj_set_updated_at before update on public.employee_timesheet_adjustments
  for each row execute function public.ts_adj_set_updated_at();

-- ── PART D: leave amendment ledger ───────────────────────────────────────────
create table if not exists public.employee_leave_adjustments (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.employee_leave_requests(id) on delete cascade,
  leave_correction_request_id uuid references public.employee_leave_correction_requests(id) on delete set null,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  original_snapshot jsonb not null default '{}'::jsonb,
  requested_snapshot jsonb not null default '{}'::jsonb,
  applied_snapshot jsonb not null default '{}'::jsonb,
  adjustment_type text not null,
  status text not null default 'applied',
  applied_by uuid not null references auth.users(id),
  applied_at timestamptz not null default now(),
  reversed_by uuid references auth.users(id),
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='leave_adj_type_chk') then
    alter table public.employee_leave_adjustments add constraint leave_adj_type_chk
      check (adjustment_type in ('change_dates','change_leave_type','change_duration',
                                 'withdraw_approved_leave','extend_leave','correct_reason','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname='leave_adj_status_chk') then
    alter table public.employee_leave_adjustments add constraint leave_adj_status_chk
      check (status in ('applied','reversed'));
  end if;
end $$;

create index if not exists idx_leave_adj_member on public.employee_leave_adjustments (team_member_id);
create index if not exists idx_leave_adj_parent on public.employee_leave_adjustments (leave_request_id);
create index if not exists idx_leave_adj_source on public.employee_leave_adjustments (leave_correction_request_id);
create unique index if not exists uq_leave_adj_one_applied_per_request
  on public.employee_leave_adjustments (leave_correction_request_id)
  where status = 'applied' and leave_correction_request_id is not null;

alter table public.employee_leave_adjustments enable row level security;

drop policy if exists leave_adj_admin_all on public.employee_leave_adjustments;
create policy leave_adj_admin_all on public.employee_leave_adjustments
  for all to authenticated
  using (exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')))
  with check (exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')));

drop policy if exists leave_adj_self_read on public.employee_leave_adjustments;
create policy leave_adj_self_read on public.employee_leave_adjustments
  for select to authenticated
  using (team_member_id in (select tm.id from public.team_members tm where tm.user_id = auth.uid()));

create or replace function public.leave_adj_set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists leave_adj_set_updated_at on public.employee_leave_adjustments;
create trigger leave_adj_set_updated_at before update on public.employee_leave_adjustments
  for each row execute function public.leave_adj_set_updated_at();

-- ── PART B: apply an approved attendance correction → ledger overlay ─────────
create or replace function public.apply_attendance_correction_to_timesheet(
  p_request_id uuid,
  p_manual_gross_seconds integer default null,
  p_manual_break_seconds integer default null
)
returns public.employee_timesheet_adjustments
language plpgsql security definer set search_path = public
as $$
declare
  r public.employee_attendance_correction_requests;
  v_gross integer := 0;
  v_break integer := 0;
  v_kind text := 'other';
  v_method text := 'auto';
  v_row public.employee_timesheet_adjustments;
begin
  if not exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')) then
    raise exception 'not authorized to apply timesheet adjustments';
  end if;

  select * into r from public.employee_attendance_correction_requests where id = p_request_id;
  if r.id is null then raise exception 'correction request not found'; end if;
  if r.status <> 'approved' then raise exception 'only approved corrections can be applied'; end if;
  if exists (select 1 from public.employee_timesheet_adjustments
             where source_request_id = p_request_id and status = 'applied') then
    raise exception 'this correction has already been applied';
  end if;

  -- Manual override takes precedence (admin entered exact seconds).
  if p_manual_gross_seconds is not null or p_manual_break_seconds is not null then
    v_gross := coalesce(p_manual_gross_seconds, 0);
    v_break := coalesce(p_manual_break_seconds, 0);
    v_method := 'manual';
    v_kind := case
      when v_break <> 0 and v_gross = 0 then 'break_duration'
      when v_gross > 0 then 'add_work_time'
      when v_gross < 0 then 'subtract_work_time'
      else 'other' end;
  else
    -- Conservative auto-calculation. Only compute when values are unambiguous;
    -- otherwise require a manual override (UI surfaces "needs manual review").
    if r.correction_type in ('missed_clock_in','missed_clock_out','wrong_clock_in','wrong_clock_out') then
      if r.requested_clock_in is not null and r.requested_clock_out is not null then
        v_gross := floor(extract(epoch from (r.requested_clock_out - r.requested_clock_in)))::int;
        v_kind := 'clock_in_out';
      else
        raise exception 'needs manual review: provide manual adjustment seconds for this clock correction';
      end if;
    elsif r.correction_type in ('missed_break_start','missed_break_end','wrong_break') then
      if r.requested_break_minutes is not null then
        v_break := r.requested_break_minutes * 60;
      elsif r.requested_break_start is not null and r.requested_break_end is not null then
        v_break := floor(extract(epoch from (r.requested_break_end - r.requested_break_start)))::int;
      else
        raise exception 'needs manual review: provide manual adjustment seconds for this break correction';
      end if;
      v_kind := case r.correction_type
        when 'missed_break_start' then 'break_start'
        when 'missed_break_end' then 'break_end'
        else 'break_duration' end;
    else
      raise exception 'needs manual review: provide manual adjustment seconds for this correction';
    end if;
  end if;

  insert into public.employee_timesheet_adjustments (
    team_member_id, source_type, source_request_id, adjustment_date, adjustment_kind,
    original_snapshot, requested_snapshot, applied_snapshot,
    gross_adjustment_seconds, break_adjustment_seconds, reason, manager_note, status, applied_by
  ) values (
    r.team_member_id, 'attendance_correction', r.id, r.correction_date, v_kind,
    jsonb_build_object('method', v_method, 'note',
      case when v_method = 'manual' then 'manual admin adjustment'
           else 'computed from requested values; no single raw record mutated' end),
    jsonb_build_object(
      'requested_clock_in', r.requested_clock_in,
      'requested_clock_out', r.requested_clock_out,
      'requested_break_start', r.requested_break_start,
      'requested_break_end', r.requested_break_end,
      'requested_break_minutes', r.requested_break_minutes,
      'correction_type', r.correction_type),
    jsonb_build_object('gross_adjustment_seconds', v_gross, 'break_adjustment_seconds', v_break,
      'net_adjustment_seconds', v_gross - v_break, 'method', v_method),
    v_gross, v_break, r.reason, r.manager_note, 'applied', auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.apply_attendance_correction_to_timesheet(uuid, integer, integer) to authenticated;

create or replace function public.reverse_timesheet_adjustment(p_adjustment_id uuid, p_reason text)
returns public.employee_timesheet_adjustments
language plpgsql security definer set search_path = public
as $$
declare v_row public.employee_timesheet_adjustments;
begin
  if not exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')) then
    raise exception 'not authorized to reverse timesheet adjustments';
  end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'reversal reason is required'; end if;

  update public.employee_timesheet_adjustments
     set status = 'reversed', reversed_by = auth.uid(), reversed_at = now(), reversal_reason = p_reason
   where id = p_adjustment_id and status = 'applied'
   returning * into v_row;
  if v_row.id is null then raise exception 'adjustment not found or not in applied state'; end if;
  return v_row;
end;
$$;

grant execute on function public.reverse_timesheet_adjustment(uuid, text) to authenticated;

-- ── PART D: apply / reverse leave amendment (ledger overlay; parent untouched) ─
create or replace function public.apply_leave_correction_amendment(p_request_id uuid)
returns public.employee_leave_adjustments
language plpgsql security definer set search_path = public
as $$
declare
  c public.employee_leave_correction_requests;
  l public.employee_leave_requests;
  v_applied jsonb;
  v_row public.employee_leave_adjustments;
begin
  if not exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')) then
    raise exception 'not authorized to apply leave amendments';
  end if;

  select * into c from public.employee_leave_correction_requests where id = p_request_id;
  if c.id is null then raise exception 'leave correction request not found'; end if;
  if c.status <> 'approved' then raise exception 'only approved leave corrections can be applied'; end if;
  if exists (select 1 from public.employee_leave_adjustments
             where leave_correction_request_id = p_request_id and status = 'applied') then
    raise exception 'this leave correction has already been applied';
  end if;

  select * into l from public.employee_leave_requests where id = c.leave_request_id;
  if l.id is null then raise exception 'original leave request not found'; end if;

  -- Effective (applied) values overlaid on the original, by correction type.
  v_applied := jsonb_build_object(
    'leave_type', case when c.correction_type = 'change_leave_type' and c.requested_leave_type is not null
                       then c.requested_leave_type else l.leave_type end,
    'start_date', case when c.correction_type in ('change_dates','extend_leave') and c.requested_start_date is not null
                       then c.requested_start_date::text else l.start_date::text end,
    'end_date', case when c.correction_type in ('change_dates','extend_leave') and c.requested_end_date is not null
                     then c.requested_end_date::text else l.end_date::text end,
    'partial_day', case when c.correction_type = 'change_duration' and c.requested_partial_day is not null
                        then c.requested_partial_day else l.partial_day end,
    'status', case when c.correction_type = 'withdraw_approved_leave' then 'cancelled' else l.status end
  );

  insert into public.employee_leave_adjustments (
    leave_request_id, leave_correction_request_id, team_member_id,
    original_snapshot, requested_snapshot, applied_snapshot, adjustment_type, status, applied_by
  ) values (
    l.id, c.id, c.team_member_id,
    jsonb_build_object('leave_type', l.leave_type, 'start_date', l.start_date::text,
      'end_date', l.end_date::text, 'partial_day', l.partial_day, 'status', l.status,
      'partial_day_hours', l.partial_day_hours),
    jsonb_build_object('requested_start_date', c.requested_start_date::text,
      'requested_end_date', c.requested_end_date::text, 'requested_leave_type', c.requested_leave_type,
      'requested_partial_day', c.requested_partial_day, 'requested_duration_hours', c.requested_duration_hours,
      'correction_type', c.correction_type),
    v_applied, c.correction_type, 'applied', auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.apply_leave_correction_amendment(uuid) to authenticated;

create or replace function public.reverse_leave_adjustment(p_adjustment_id uuid, p_reason text)
returns public.employee_leave_adjustments
language plpgsql security definer set search_path = public
as $$
declare v_row public.employee_leave_adjustments;
begin
  if not exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')) then
    raise exception 'not authorized to reverse leave amendments';
  end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'reversal reason is required'; end if;

  update public.employee_leave_adjustments
     set status = 'reversed', reversed_by = auth.uid(), reversed_at = now(), reversal_reason = p_reason
   where id = p_adjustment_id and status = 'applied'
   returning * into v_row;
  if v_row.id is null then raise exception 'adjustment not found or not in applied state'; end if;
  return v_row;
end;
$$;

grant execute on function public.reverse_leave_adjustment(uuid, text) to authenticated;

-- ── PART C: net worked time summaries now include applied adjustments ────────
-- Return signatures change (new columns) so drop+recreate. Frontend maps by
-- field name and ignores unknown columns, so existing consumers keep working.

drop function if exists public.get_my_today_attendance_summary();
create function public.get_my_today_attendance_summary()
returns table (
  work_date date,
  gross_seconds bigint,
  break_seconds bigint,
  net_seconds bigint,
  first_clock_in timestamptz,
  last_clock_out timestamptz,
  active_clocked_in boolean,
  active_break boolean,
  break_count integer,
  gross_adjustment_seconds bigint,
  break_adjustment_seconds bigint,
  net_adjustment_seconds bigint,
  adjusted_gross_seconds bigint,
  adjusted_break_seconds bigint,
  adjusted_net_worked_seconds bigint,
  has_adjustments boolean
)
language sql security definer set search_path = public
as $$
  with me as (select tm.id from public.team_members tm where tm.user_id = auth.uid() limit 1),
  d as (select (now() at time zone 'Asia/Karachi')::date as wd),
  cl as (
    select min(t.clock_in_at) as first_in, max(t.clock_out_at) as last_out,
      coalesce(sum(extract(epoch from (coalesce(t.clock_out_at, now()) - t.clock_in_at))), 0)::bigint as gross
    from public.time_clock_entries t, me, d
    where t.team_member_id = me.id and t.work_date = d.wd
  ),
  br as (
    select coalesce(sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at))), 0)::bigint as brk,
      count(*)::int as cnt
    from public.employee_break_records b, me, d
    where b.team_member_id = me.id and b.status <> 'cancelled'
      and (b.started_at at time zone 'Asia/Karachi')::date = d.wd
  ),
  adj as (
    select coalesce(sum(a.gross_adjustment_seconds),0)::bigint as g,
           coalesce(sum(a.break_adjustment_seconds),0)::bigint as b,
           count(*)::int as c
    from public.employee_timesheet_adjustments a, me, d
    where a.team_member_id = me.id and a.status = 'applied' and a.adjustment_date = d.wd
  ),
  flags as (
    select exists(select 1 from public.time_clock_entries t, me where t.team_member_id = me.id and t.clock_out_at is null) as oc,
           exists(select 1 from public.employee_break_records b, me where b.team_member_id = me.id and b.status = 'active') as ab
  )
  select d.wd, cl.gross, br.brk, greatest(cl.gross - br.brk, 0)::bigint,
    cl.first_in, cl.last_out, flags.oc, flags.ab, br.cnt,
    adj.g, adj.b, (adj.g - adj.b),
    (cl.gross + adj.g), (br.brk + adj.b),
    greatest((cl.gross + adj.g) - (br.brk + adj.b), 0)::bigint,
    (adj.c > 0)
  from d, cl, br, adj, flags;
$$;
grant execute on function public.get_my_today_attendance_summary() to authenticated;

drop function if exists public.get_my_attendance_summary_range(date, date);
create function public.get_my_attendance_summary_range(p_start date, p_end date)
returns table (
  work_date date,
  gross_seconds bigint,
  break_seconds bigint,
  net_seconds bigint,
  first_clock_in timestamptz,
  last_clock_out timestamptz,
  active_clocked_in boolean,
  active_break boolean,
  break_count integer,
  gross_adjustment_seconds bigint,
  break_adjustment_seconds bigint,
  net_adjustment_seconds bigint,
  adjusted_gross_seconds bigint,
  adjusted_break_seconds bigint,
  adjusted_net_worked_seconds bigint,
  has_adjustments boolean
)
language sql security definer set search_path = public
as $$
  with me as (select tm.id from public.team_members tm where tm.user_id = auth.uid() limit 1),
  cl as (
    select t.work_date as wd, min(t.clock_in_at) as fi, max(t.clock_out_at) as lo,
      coalesce(sum(extract(epoch from (coalesce(t.clock_out_at, now()) - t.clock_in_at))), 0)::bigint as gross,
      bool_or(t.clock_out_at is null) as any_open
    from public.time_clock_entries t, me
    where t.team_member_id = me.id and t.work_date between p_start and p_end
    group by t.work_date
  ),
  br as (
    select (b.started_at at time zone 'Asia/Karachi')::date as wd,
      coalesce(sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at))), 0)::bigint as brk,
      count(*)::int as cnt, bool_or(b.status = 'active') as any_active
    from public.employee_break_records b, me
    where b.team_member_id = me.id and b.status <> 'cancelled'
      and (b.started_at at time zone 'Asia/Karachi')::date between p_start and p_end
    group by 1
  ),
  adj as (
    select a.adjustment_date as wd,
      coalesce(sum(a.gross_adjustment_seconds),0)::bigint as g,
      coalesce(sum(a.break_adjustment_seconds),0)::bigint as b,
      count(*)::int as c
    from public.employee_timesheet_adjustments a, me
    where a.team_member_id = me.id and a.status = 'applied' and a.adjustment_date between p_start and p_end
    group by 1
  ),
  days as (
    select wd from cl union select wd from br union select wd from adj
  )
  select
    days.wd,
    coalesce(cl.gross, 0)::bigint,
    coalesce(br.brk, 0)::bigint,
    greatest(coalesce(cl.gross, 0) - coalesce(br.brk, 0), 0)::bigint,
    cl.fi, cl.lo,
    coalesce(cl.any_open, false), coalesce(br.any_active, false), coalesce(br.cnt, 0),
    coalesce(adj.g, 0)::bigint, coalesce(adj.b, 0)::bigint, (coalesce(adj.g,0) - coalesce(adj.b,0)),
    (coalesce(cl.gross,0) + coalesce(adj.g,0)), (coalesce(br.brk,0) + coalesce(adj.b,0)),
    greatest((coalesce(cl.gross,0) + coalesce(adj.g,0)) - (coalesce(br.brk,0) + coalesce(adj.b,0)), 0)::bigint,
    (coalesce(adj.c,0) > 0)
  from days
  left join cl on cl.wd = days.wd
  left join br on br.wd = days.wd
  left join adj on adj.wd = days.wd
  order by 1 desc;
$$;
grant execute on function public.get_my_attendance_summary_range(date, date) to authenticated;

drop function if exists public.get_team_attendance_summary_for_date(date);
create function public.get_team_attendance_summary_for_date(p_date date)
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
  on_leave boolean,
  gross_adjustment_seconds bigint,
  break_adjustment_seconds bigint,
  net_adjustment_seconds bigint,
  adjusted_gross_seconds bigint,
  adjusted_break_seconds bigint,
  adjusted_net_worked_seconds bigint,
  has_adjustments boolean
)
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')) then
    raise exception 'not authorized to view team attendance summary';
  end if;

  return query
  with cl as (
    select t.team_member_id as tm, min(t.clock_in_at) as fi, max(t.clock_out_at) as lo,
      coalesce(sum(extract(epoch from (coalesce(t.clock_out_at, now()) - t.clock_in_at))), 0)::bigint as gross,
      bool_or(t.clock_out_at is null) as any_open
    from public.time_clock_entries t where t.work_date = p_date group by t.team_member_id
  ),
  br as (
    select b.team_member_id as tm,
      coalesce(sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at))), 0)::bigint as brk,
      count(*)::int as cnt, bool_or(b.status = 'active') as any_active
    from public.employee_break_records b
    where b.status <> 'cancelled' and (b.started_at at time zone 'Asia/Karachi')::date = p_date
    group by b.team_member_id
  ),
  adj as (
    select a.team_member_id as tm,
      coalesce(sum(a.gross_adjustment_seconds),0)::bigint as g,
      coalesce(sum(a.break_adjustment_seconds),0)::bigint as b, count(*)::int as c
    from public.employee_timesheet_adjustments a
    where a.status = 'applied' and a.adjustment_date = p_date
    group by a.team_member_id
  ),
  lv as (
    select l.team_member_id as tm from public.employee_leave_requests l
    where l.status = 'approved' and p_date between l.start_date and l.end_date group by l.team_member_id
  ),
  ids as (
    select tm from cl union select tm from br union select tm from lv union select tm from adj
  )
  select
    i.tm, m.display_name, m.employee_code, m.title, m.domain_role,
    coalesce(cl.gross, 0)::bigint, coalesce(br.brk, 0)::bigint,
    greatest(coalesce(cl.gross, 0) - coalesce(br.brk, 0), 0)::bigint,
    cl.fi, cl.lo, coalesce(cl.any_open, false), coalesce(br.any_active, false), coalesce(br.cnt, 0),
    (lv.tm is not null),
    coalesce(adj.g, 0)::bigint, coalesce(adj.b, 0)::bigint, (coalesce(adj.g,0) - coalesce(adj.b,0)),
    (coalesce(cl.gross,0) + coalesce(adj.g,0)), (coalesce(br.brk,0) + coalesce(adj.b,0)),
    greatest((coalesce(cl.gross,0) + coalesce(adj.g,0)) - (coalesce(br.brk,0) + coalesce(adj.b,0)), 0)::bigint,
    (coalesce(adj.c,0) > 0)
  from ids i
  left join public.team_members m on m.id = i.tm
  left join cl on cl.tm = i.tm
  left join br on br.tm = i.tm
  left join adj on adj.tm = i.tm
  left join lv on lv.tm = i.tm
  order by m.display_name nulls last;
end;
$$;
grant execute on function public.get_team_attendance_summary_for_date(date) to authenticated;
