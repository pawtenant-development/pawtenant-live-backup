-- LIVE-COMPANY-SALARY-SNAPSHOT-SELF-SCOPED
-- Employee self-service salary snapshot for the /company portal.
-- Returns ONLY the calling user's own current-month figures. Mirrors the
-- deduction math of get_salary_expense_detail exactly:
--   • half-day late day = first clock-in of a work_date >= GREATEST(grace, 30)
--     minutes after scheduled shift start (overnight anchor logic identical)
--   • policy active from late_deduction_policy_start_date() (2026-06-08) only
--   • deduction = round(base / Mon–Fri working days in month / 2, 2) per day
--   • owner compensation excluded (team_members.domain_role / doctor_profiles.role)
-- Additive + idempotent. No data mutated. LIVE (cvwbozlbbmrjxznknouq).
create or replace function public.get_my_salary_snapshot()
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
    -- get_half_day_late_attendance (which is admin-gated, hence inlined here),
    -- clamped to the policy start date.
    select count(*)::int into v_late_days
    from (
      select t.work_date as wd, min(t.clock_in_at) as cin
        from public.time_clock_entries t
       where t.team_member_id = v_tm.id
         and t.work_date between greatest(v_from, public.late_deduction_policy_start_date()) and v_to
       group by 1
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
