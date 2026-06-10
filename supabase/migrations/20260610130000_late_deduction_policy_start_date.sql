-- TEST-ATTENDANCE-LATE-DEDUCTION-POLICY-EFFECTIVE-DATE
-- The 30-minute late grace / half-day deduction policy is enforced from
-- 2026-06-08 ONLY. Attendance before that date is treated as 100% paid for
-- salary purposes — no retroactive penalties, ever, regardless of the range
-- the salary snapshot is run for.
--
-- The effective date is centralized in ONE named constant function
-- (late_deduction_policy_start_date) and the gate lives inside
-- get_half_day_late_attendance — the single source every salary RPC derives
-- deductions from — so the rule holds server-side, not just in the UI.
-- Additive + idempotent. No data mutated. TEST (opudhofjbydrljgleofq).

-- ── 1) Named policy constant ─────────────────────────────────────────────────
create or replace function public.late_deduction_policy_start_date()
returns date
language sql immutable
set search_path = public
as $$ select date '2026-06-08' $$;

grant execute on function public.late_deduction_policy_start_date() to authenticated;

-- ── 2) Gate the half-day-late derivation at the policy start date ───────────
-- Same body as 20260610120000, plus: the scanned window is clamped to
-- GREATEST(p_from, policy start). Ranges entirely before the policy return
-- zero rows → zero deductions. Salary summary/detail RPCs call this function,
-- so they inherit the gate automatically.
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
  with first_in as (
    select t.team_member_id as tm, t.work_date as wd, min(t.clock_in_at) as cin
    from public.time_clock_entries t
    where t.work_date between v_from and p_to
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
