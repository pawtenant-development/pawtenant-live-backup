-- TEST-ATTENDANCE-CORRECTION-APPLIES-TO-HALF-DAY-LATE-SALARY-DEDUCTION
-- ROOT CAUSE: get_half_day_late_attendance (the single source every salary RPC
-- derives half-day-late deductions from) read ONLY raw time_clock_entries.
-- Attendance correction approval (review_attendance_correction_request) is a
-- DECISION RECORD — it never mutates time_clock_entries — so an approved
-- correction to a late clock-in never reached payroll and the half-day
-- deduction kept showing in Accounts. The optional "Apply to Timesheet" ledger
-- (employee_timesheet_adjustments) only adjusts NET WORKED TIME, not the
-- late-deduction derivation, and required a separate manual step.
--
-- FIX: overlay APPROVED attendance corrections inside the late-derivation source
-- of truth. Effective clock-in for (employee, work_date) =
--   COALESCE(latest approved correction's requested_clock_in for that date,
--            raw first clock-in of the day).
-- Approval alone recalculates payroll automatically — no manual adjustment.
--
-- Behaviour:
--   • Approved correction with requested_clock_in  → corrected time is used.
--   • Rejected / pending / cancelled correction     → ignored, raw clock-in used.
--   • Corrected clock-in < 30 min (or template grace) after shift start → no row
--     → half-day late deduction disappears.
--   • Corrected clock-in still >= threshold late     → row stays → deduction kept.
--   • One row per (employee, work_date) → one half-day deduction max, never doubled.
--   • Policy start (2026-06-08) and owner exclusion unchanged.
--   • Cross-midnight anchor logic unchanged (recomputed from the effective cin).
-- Salary summary/detail RPCs call get_half_day_late_attendance, so they inherit
-- the overlay with no change. get_my_salary_snapshot inlines the same overlay.
-- Additive + idempotent. No raw data mutated. TEST (opudhofjbydrljgleofq).

-- ── 1) Half-day-late attendance with approved-correction overlay ────────────
create or replace function public.get_half_day_late_attendance(p_from date, p_to date)
returns table (
  team_member_id uuid,
  display_name text,
  employee_code text,
  work_date date,
  shift_name text,
  shift_start time,
  clock_in_at timestamptz,
  minutes_late integer
)
language plpgsql security definer set search_path = public
as $$
declare
  v_from date := greatest(p_from, public.late_deduction_policy_start_date());
begin
  if not exists (select 1 from public.doctor_profiles dp where dp.user_id = auth.uid()
                 and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))) then
    raise exception 'not authorized';
  end if;

  -- Whole range is before the policy start → no deductions, by definition.
  if p_to < public.late_deduction_policy_start_date() then
    return;
  end if;

  return query
  with first_in_raw as (
    select t.team_member_id as tm, t.work_date as wd, min(t.clock_in_at) as cin
    from public.time_clock_entries t
    where t.work_date between v_from and p_to
    group by 1, 2
  ),
  -- Latest APPROVED correction per (employee, date) that sets a clock-in.
  approved_corr as (
    select distinct on (c.team_member_id, c.correction_date)
           c.team_member_id as tm, c.correction_date as wd, c.requested_clock_in as cin
    from public.employee_attendance_correction_requests c
    where c.status = 'approved'
      and c.requested_clock_in is not null
      and c.correction_date between v_from and p_to
    order by c.team_member_id, c.correction_date, c.reviewed_at desc nulls last, c.updated_at desc
  ),
  -- Effective first clock-in: approved correction overrides the raw clock-in.
  -- FULL OUTER JOIN so a correction can also stand in for a missing clock-in.
  first_in as (
    select coalesce(r.tm, a.tm) as tm,
           coalesce(r.wd, a.wd) as wd,
           coalesce(a.cin, r.cin) as cin
    from first_in_raw r
    full outer join approved_corr a on a.tm = r.tm and a.wd = r.wd
  ),
  calc as (
    select f.tm, f.wd, f.cin,
           st.name as sh_name, st.start_time as sh_start,
           x.mins_after_start,
           greatest(coalesce(st.grace_minutes, 30), 30) as threshold_minutes
    from first_in f
    join lateral (
      select a.shift_template_id
      from public.employee_shift_assignments a
      where a.team_member_id = f.tm
        and a.effective_from <= f.wd
        and (a.effective_to is null or a.effective_to >= f.wd)
      order by a.effective_from desc
      limit 1
    ) asn on true
    join public.shift_templates st on st.id = asn.shift_template_id and st.is_active = true
    cross join lateral (
      select floor(extract(epoch from (f.cin - (
        ((case when st.crosses_midnight
                and ((f.cin at time zone coalesce(st.timezone, 'Asia/Karachi'))::time < st.end_time)
           then ((f.cin at time zone coalesce(st.timezone, 'Asia/Karachi'))::date - 1)
           else ((f.cin at time zone coalesce(st.timezone, 'Asia/Karachi'))::date)
          end)::timestamp + st.start_time) at time zone coalesce(st.timezone, 'Asia/Karachi')
      ))) / 60.0)::int as mins_after_start
    ) x
  )
  select c.tm, m.display_name, m.employee_code, c.wd, c.sh_name, c.sh_start, c.cin, c.mins_after_start
  from calc c
  join public.team_members m on m.id = c.tm
  where c.mins_after_start >= c.threshold_minutes
  order by c.wd desc, m.display_name nulls last;
end; $$;

grant execute on function public.get_half_day_late_attendance(date, date) to authenticated;
revoke execute on function public.get_half_day_late_attendance(date, date) from public, anon;

-- ── 2) Self-scoped salary snapshot with the same overlay ────────────────────
-- Identical math to get_salary_expense_detail; the late-day count now uses the
-- effective (corrected) first clock-in for the calling employee.
drop function if exists public.get_my_salary_snapshot();
create function public.get_my_salary_snapshot()
returns table (
  period_start date,
  period_end date,
  base_salary numeric,
  salary_currency text,
  working_days integer,
  half_day_late_days integer,
  late_deduction_amount numeric,
  payable_amount numeric,
  included boolean,
  exclude_reason text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tm public.team_members%rowtype;
  v_from date;
  v_to date;
  v_scan_from date;
  v_workdays integer;
  v_base numeric := 0;
  v_currency text := 'PKR';
  v_dp_role text := '';
  v_late_days integer := 0;
  v_ded numeric := 0;
  v_included boolean;
  v_reason text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_tm from public.team_members where user_id = v_uid limit 1;
  if v_tm.id is null then
    return; -- no employee profile → empty result, widget shows fallback
  end if;

  -- Current PKT calendar month.
  v_from := date_trunc('month', (now() at time zone 'Asia/Karachi'))::date;
  v_to   := (date_trunc('month', (now() at time zone 'Asia/Karachi')) + interval '1 month - 1 day')::date;
  v_scan_from := greatest(v_from, public.late_deduction_policy_start_date());

  select count(*)::int into v_workdays
    from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') d
   where extract(isodow from d) between 1 and 5;
  v_workdays := greatest(1, v_workdays);

  select coalesce(h.base_salary, 0), coalesce(h.salary_currency, 'PKR')
    into v_base, v_currency
    from public.employee_hr_private h
   where h.team_member_id = v_tm.id
   limit 1;
  v_base := coalesce(v_base, 0);
  v_currency := coalesce(v_currency, 'PKR');

  select coalesce(dp.role, '') into v_dp_role
    from public.doctor_profiles dp where dp.user_id = v_uid limit 1;
  v_dp_role := coalesce(v_dp_role, '');

  v_included := coalesce(v_tm.is_active, true) = true
    and coalesce(v_tm.employment_status, 'active') not in ('terminated','resigned','inactive','suspended','offboarded','deleted')
    and v_base > 0
    and coalesce(v_tm.domain_role, '') <> 'owner'
    and v_dp_role <> 'owner';

  v_reason := case
    when coalesce(v_tm.domain_role, '') = 'owner' or v_dp_role = 'owner' then 'owner_compensation_excluded'
    when v_base <= 0 then 'no salary set'
    when coalesce(v_tm.is_active, true) = false then 'inactive'
    when coalesce(v_tm.employment_status, 'active') in ('terminated','resigned','inactive','suspended','offboarded','deleted')
      then 'status: ' || v_tm.employment_status
    else null
  end;

  if v_included then
    -- Self-only half-day-late derivation — identical rule to
    -- get_half_day_late_attendance, including the approved-correction overlay
    -- (corrected clock-in overrides raw), clamped to the policy start date.
    select count(*)::int into v_late_days
    from (
      with first_in_raw as (
        select t.work_date as wd, min(t.clock_in_at) as cin
          from public.time_clock_entries t
         where t.team_member_id = v_tm.id
           and t.work_date between v_scan_from and v_to
         group by 1
      ),
      approved_corr as (
        select distinct on (c.correction_date)
               c.correction_date as wd, c.requested_clock_in as cin
          from public.employee_attendance_correction_requests c
         where c.team_member_id = v_tm.id
           and c.status = 'approved'
           and c.requested_clock_in is not null
           and c.correction_date between v_scan_from and v_to
         order by c.correction_date, c.reviewed_at desc nulls last, c.updated_at desc
      ),
      first_in as (
        select coalesce(r.wd, a.wd) as wd, coalesce(a.cin, r.cin) as cin
          from first_in_raw r
          full outer join approved_corr a on a.wd = r.wd
      )
      select f.wd, f.cin
        from first_in f
    ) f
    join lateral (
      select a.shift_template_id
        from public.employee_shift_assignments a
       where a.team_member_id = v_tm.id
         and a.effective_from <= f.wd
         and (a.effective_to is null or a.effective_to >= f.wd)
       order by a.effective_from desc
       limit 1
    ) asn on true
    join public.shift_templates st on st.id = asn.shift_template_id and st.is_active = true
    where floor(extract(epoch from (f.cin - (
      ((case when st.crosses_midnight
              and ((f.cin at time zone coalesce(st.timezone, 'Asia/Karachi'))::time < st.end_time)
         then ((f.cin at time zone coalesce(st.timezone, 'Asia/Karachi'))::date - 1)
         else ((f.cin at time zone coalesce(st.timezone, 'Asia/Karachi'))::date)
        end)::timestamp + st.start_time) at time zone coalesce(st.timezone, 'Asia/Karachi')
    ))) / 60.0)::int >= greatest(coalesce(st.grace_minutes, 30), 30);

    v_late_days := coalesce(v_late_days, 0);
    v_ded := round(round(v_base / v_workdays / 2.0, 2) * v_late_days, 2);
  end if;

  return query select
    v_from, v_to, v_base, v_currency, v_workdays,
    v_late_days, v_ded,
    greatest(v_base - v_ded, 0),
    v_included, v_reason;
end;
$$;

grant execute on function public.get_my_salary_snapshot() to authenticated;
revoke execute on function public.get_my_salary_snapshot() from public, anon;
