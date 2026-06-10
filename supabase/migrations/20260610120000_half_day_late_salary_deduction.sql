-- TEST-ATTENDANCE-30-MINUTE-LATE-GRACE-AND-HALF-DAY-SALARY-DEDUCTION
-- Business rule:
--   • Clock-in less than 30 minutes after scheduled shift start → NOT late.
--   • Clock-in 30 minutes or more after scheduled shift start  → late,
--     half-day late, half-day salary deduction.
--   • Threshold = GREATEST(shift grace_minutes, 30): the 30-minute policy is a
--     FLOOR. Templates with a smaller grace (e.g. 15) still get the 30-minute
--     window; a larger configured grace is honoured.
--   • Half-day deduction = (base_salary / Mon–Fri working days in period) / 2,
--     once per late work_date (first clock-in of the day decides).
--   • Deductions are DERIVED at read time from raw attendance + shift data —
--     nothing is stored, so corrections to clock_in_at are reflected on every
--     recalculation and recalculation can never double-deduct.
--   • Owner compensation stays excluded (same gates as before).
-- Additive + idempotent. No data is mutated. TEST (opudhofjbydrljgleofq).

-- ── 1) clock_in_for_current_user: 30-minute late grace floor ────────────────
-- Changes vs previous version (20260530180000):
--   • threshold minutes = GREATEST(COALESCE(grace_minutes, 30), 30)
--   • was_late  = minutes after SCHEDULED START >= threshold (so 10:29 → on
--     time, 10:30 → late for a 10:00 shift; boundary is inclusive)
--   • late_minutes = minutes after SCHEDULED START when late (e.g. 10:30 →
--     30), 0 when on time. Previously it was minutes past the grace threshold.
-- Idempotent open-session handling, assignment lookup and the overnight
-- (crosses_midnight) anchor logic are preserved exactly.
create or replace function public.clock_in_for_current_user()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_uid             uuid := auth.uid();
  v_team_member_id  uuid;
  v_existing_id     uuid;
  v_assignment      public.employee_shift_assignments%ROWTYPE;
  v_shift           public.shift_templates%ROWTYPE;
  v_today_pkt       date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_expected_start  timestamptz;
  v_mins_after      int;
  v_threshold_min   int;
  v_late_min        int;
  v_was_late        boolean;
  v_new_id          uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'clock_in_for_current_user: not authenticated';
  END IF;

  SELECT id INTO v_team_member_id
    FROM public.team_members
   WHERE user_id = v_uid
   LIMIT 1;

  IF v_team_member_id IS NULL THEN
    RAISE EXCEPTION 'clock_in_for_current_user: no team_members row for caller';
  END IF;

  -- Idempotent: if there's an open session, return it.
  SELECT id INTO v_existing_id
    FROM public.time_clock_entries
   WHERE team_member_id = v_team_member_id
     AND clock_out_at IS NULL
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Resolve the active assignment for today PKT.
  SELECT * INTO v_assignment
    FROM public.employee_shift_assignments
   WHERE team_member_id = v_team_member_id
     AND effective_from <= v_today_pkt
     AND (effective_to IS NULL OR effective_to >= v_today_pkt)
   ORDER BY effective_from DESC
   LIMIT 1;

  IF v_assignment.id IS NOT NULL THEN
    SELECT * INTO v_shift
      FROM public.shift_templates
     WHERE id = v_assignment.shift_template_id
     LIMIT 1;

    IF v_shift.id IS NOT NULL AND v_shift.is_active THEN
      DECLARE
        v_tz        text      := COALESCE(v_shift.timezone, 'Asia/Karachi');
        v_now_local timestamp := (now() AT TIME ZONE v_tz);
        v_anchor    date      := v_now_local::date;
      BEGIN
        -- Overnight shift: an early-morning clock-in (local time-of-day before
        -- the shift end) belongs to the shift that started the PREVIOUS day.
        IF v_shift.crosses_midnight AND v_now_local::time < v_shift.end_time THEN
          v_anchor := v_anchor - 1;
        END IF;

        v_expected_start := ((v_anchor::timestamp + v_shift.start_time) AT TIME ZONE v_tz);
        -- 30-minute late-grace POLICY FLOOR: a shorter template grace never
        -- marks anyone late before 30 minutes; a longer grace is honoured.
        v_threshold_min  := GREATEST(COALESCE(v_shift.grace_minutes, 30), 30);
        v_mins_after     := FLOOR(EXTRACT(EPOCH FROM (now() - v_expected_start)) / 60.0)::int;
        v_was_late       := v_mins_after >= v_threshold_min;
        v_late_min       := CASE WHEN v_was_late THEN v_mins_after ELSE 0 END;
      END;
    END IF;
  END IF;

  INSERT INTO public.time_clock_entries (
    team_member_id, assignment_id, clock_in_at, source, was_late, late_minutes
  ) VALUES (
    v_team_member_id,
    v_assignment.id,
    now(),
    'web',
    v_was_late,
    v_late_min
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;

-- ── 2) Half-day-late attendance detail (single source of truth) ─────────────
-- One row per (employee, work_date) whose FIRST clock-in of the day was
-- >= threshold minutes after the scheduled shift start. Recomputed from raw
-- time_clock_entries + employee_shift_assignments + shift_templates (mirrors
-- the clock-in RPC's overnight anchor logic), so corrected clock-in times are
-- always reflected and a day can never produce more than one deduction.
-- Admin/owner/admin_manager/finance only (same gate as the salary RPCs).
drop function if exists public.get_half_day_late_attendance(date, date);
create function public.get_half_day_late_attendance(p_from date, p_to date)
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
begin
  if not exists (select 1 from public.doctor_profiles dp where dp.user_id = auth.uid()
                 and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))) then
    raise exception 'not authorized';
  end if;

  return query
  with first_in as (
    select t.team_member_id as tm, t.work_date as wd, min(t.clock_in_at) as cin
    from public.time_clock_entries t
    where t.work_date between p_from and p_to
    group by 1, 2
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

-- ── 3) Salary summary: auto half-day late deductions ────────────────────────
-- New columns (additive; frontend maps by field name):
--   working_days         Mon–Fri days in [p_from, p_to] (deduction denominator)
--   half_day_late_count  total half-day-late instances across included staff
--   late_deduction_total sum of per-employee half-day deductions
--   payable_total        prorated_total − late_deduction_total (floored at 0)
-- Return signature changes → drop + recreate (same pattern as prior salary
-- RPC revisions). Owner exclusion and status filters unchanged.
drop function if exists public.get_salary_expense_summary(date, date);
create function public.get_salary_expense_summary(p_from date, p_to date)
returns table (currency text, monthly_total numeric, prorated_total numeric, employee_count integer, range_days integer,
               working_days integer, half_day_late_count integer, late_deduction_total numeric, payable_total numeric)
language plpgsql security definer set search_path = public
as $$
declare
  v_days integer;
  v_workdays integer;
begin
  if not exists (select 1 from public.doctor_profiles dp where dp.user_id = auth.uid()
                 and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))) then
    raise exception 'not authorized';
  end if;
  v_days := greatest(1, (p_to - p_from) + 1);
  select count(*)::int into v_workdays
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
   where extract(isodow from d) between 1 and 5;
  v_workdays := greatest(1, v_workdays);

  return query
  with late_days as (
    select l.team_member_id as tm, count(*)::int as cnt
    from public.get_half_day_late_attendance(p_from, p_to) l
    group by 1
  )
  select coalesce(h.salary_currency,'PKR'),
    sum(coalesce(h.base_salary,0))::numeric,
    round(sum(coalesce(h.base_salary,0)) * (v_days::numeric/30.0), 2),
    count(*)::integer, v_days, v_workdays,
    coalesce(sum(ld.cnt), 0)::integer,
    round(sum(round(coalesce(h.base_salary,0)::numeric / v_workdays / 2.0, 2) * coalesce(ld.cnt, 0)), 2),
    greatest(round(sum(coalesce(h.base_salary,0)) * (v_days::numeric/30.0)
      - sum(round(coalesce(h.base_salary,0)::numeric / v_workdays / 2.0, 2) * coalesce(ld.cnt, 0)), 2), 0)
  from public.employee_hr_private h
  join public.team_members tm on tm.id = h.team_member_id
  left join public.doctor_profiles dp on dp.user_id = tm.user_id
  left join late_days ld on ld.tm = tm.id
  where coalesce(tm.is_active,true) = true
    and coalesce(tm.employment_status,'active') not in ('terminated','resigned','inactive','suspended','offboarded','deleted')
    and coalesce(h.base_salary,0) > 0
    and coalesce(tm.domain_role,'') <> 'owner'
    and coalesce(dp.role,'') <> 'owner'
  group by coalesce(h.salary_currency,'PKR');
end; $$;
grant execute on function public.get_salary_expense_summary(date, date) to authenticated;
revoke execute on function public.get_salary_expense_summary(date, date) from public, anon;

-- ── 4) Salary detail: per-employee half-day late deduction ──────────────────
-- New columns (additive): working_days, half_day_late_days,
-- late_deduction_amount, payable_amount. Deductions apply only to INCLUDED
-- rows (owners/excluded rows always 0). payable_amount floored at 0.
drop function if exists public.get_salary_expense_detail(date, date);
create function public.get_salary_expense_detail(p_from date, p_to date)
returns table (team_member_id uuid, display_name text, employee_code text, base_salary numeric, salary_currency text,
  employment_status text, is_active boolean, prorated_amount numeric, included boolean, exclude_reason text,
  working_days integer, half_day_late_days integer, late_deduction_amount numeric, payable_amount numeric)
language plpgsql security definer set search_path = public
as $$
declare
  v_days integer;
  v_workdays integer;
begin
  if not exists (select 1 from public.doctor_profiles dp where dp.user_id = auth.uid()
                 and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))) then
    raise exception 'not authorized';
  end if;
  v_days := greatest(1, (p_to - p_from) + 1);
  select count(*)::int into v_workdays
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
   where extract(isodow from d) between 1 and 5;
  v_workdays := greatest(1, v_workdays);

  return query
  with late_days as (
    select l.team_member_id as tm, count(*)::int as cnt
    from public.get_half_day_late_attendance(p_from, p_to) l
    group by 1
  )
  select tm.id, tm.display_name, tm.employee_code, coalesce(h.base_salary,0)::numeric, coalesce(h.salary_currency,'PKR'),
    coalesce(tm.employment_status,'active'), coalesce(tm.is_active,true),
    round(coalesce(h.base_salary,0) * (v_days::numeric/30.0), 2),
    (coalesce(tm.is_active,true) = true
      and coalesce(tm.employment_status,'active') not in ('terminated','resigned','inactive','suspended','offboarded','deleted')
      and coalesce(h.base_salary,0) > 0
      and coalesce(tm.domain_role,'') <> 'owner'
      and coalesce(dp.role,'') <> 'owner'),
    case
      when coalesce(tm.domain_role,'') = 'owner' or coalesce(dp.role,'') = 'owner' then 'owner_compensation_excluded'
      when coalesce(h.base_salary,0) <= 0 then 'no salary set'
      when coalesce(tm.is_active,true) = false then 'inactive'
      when coalesce(tm.employment_status,'active') in ('terminated','resigned','inactive','suspended','offboarded','deleted') then 'status: ' || tm.employment_status
      else null end,
    v_workdays,
    case when (coalesce(tm.is_active,true) = true
      and coalesce(tm.employment_status,'active') not in ('terminated','resigned','inactive','suspended','offboarded','deleted')
      and coalesce(h.base_salary,0) > 0
      and coalesce(tm.domain_role,'') <> 'owner'
      and coalesce(dp.role,'') <> 'owner')
      then coalesce(ld.cnt, 0) else 0 end::integer,
    case when (coalesce(tm.is_active,true) = true
      and coalesce(tm.employment_status,'active') not in ('terminated','resigned','inactive','suspended','offboarded','deleted')
      and coalesce(h.base_salary,0) > 0
      and coalesce(tm.domain_role,'') <> 'owner'
      and coalesce(dp.role,'') <> 'owner')
      then round(round(coalesce(h.base_salary,0)::numeric / v_workdays / 2.0, 2) * coalesce(ld.cnt, 0), 2) else 0 end,
    greatest(round(coalesce(h.base_salary,0) * (v_days::numeric/30.0)
      - case when (coalesce(tm.is_active,true) = true
          and coalesce(tm.employment_status,'active') not in ('terminated','resigned','inactive','suspended','offboarded','deleted')
          and coalesce(h.base_salary,0) > 0
          and coalesce(tm.domain_role,'') <> 'owner'
          and coalesce(dp.role,'') <> 'owner')
          then round(coalesce(h.base_salary,0)::numeric / v_workdays / 2.0, 2) * coalesce(ld.cnt, 0) else 0 end, 2), 0)
  from public.employee_hr_private h
  join public.team_members tm on tm.id = h.team_member_id
  left join public.doctor_profiles dp on dp.user_id = tm.user_id
  left join late_days ld on ld.tm = tm.id
  order by coalesce(h.base_salary,0) desc;
end; $$;
grant execute on function public.get_salary_expense_detail(date, date) to authenticated;
revoke execute on function public.get_salary_expense_detail(date, date) from public, anon;
