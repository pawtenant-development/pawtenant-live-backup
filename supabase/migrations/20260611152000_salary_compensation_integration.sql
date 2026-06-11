-- Company OS — Phase 3 (LIVE): salary <-> compensation integration.
--
-- Approved compensation adjustments now feed payroll math:
--   • get_salary_expense_summary / get_salary_expense_detail — ported VERBATIM
--     from TEST 20260611152000 (they fold approved bonus/commission/other and
--     inherit the attendance-correction overlay through get_half_day_late_attendance,
--     which on LIVE already carries the overlay).
--   • get_my_salary_snapshot — HAND-MERGED, NOT copied from TEST. TEST's snapshot
--     lost the attendance overlay (a known TEST regression); LIVE's current snapshot
--     has the overlay but lacked compensation. This recreates it = current LIVE
--     overlay body + the 152000 compensation fold/columns. Self-scoping, owner
--     exclusion, policy-dated late-deduction and the approved-correction overlay
--     are all preserved.
--
-- Rules: status='approved' only (pending/rejected/cancelled never count);
-- adjustments month-anchored to the salary period; owner compensation excluded.
-- Additive + idempotent. LIVE (cvwbozlbbmrjxznknouq). No data mutated.

-- ── get_salary_expense_detail (TEST 152000 verbatim — folds comp + overlay helper) ──
drop function if exists public.get_salary_expense_detail(date, date);
create function public.get_salary_expense_detail(p_from date, p_to date)
returns table (
  team_member_id uuid, display_name text, employee_code text, base_salary numeric,
  salary_currency text, employment_status text, is_active boolean, prorated_amount numeric,
  included boolean, exclude_reason text, working_days integer, half_day_late_days integer,
  late_deduction_amount numeric, bonus_amount numeric, commission_amount numeric,
  other_additions numeric, other_deductions numeric, additions_total numeric, payable_amount numeric
)
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
  ),
  adj as (
    select a.team_member_id as tm,
      sum(case when a.type = 'bonus' then a.amount_pkr else 0 end) as bonus,
      sum(case when a.type = 'commission' then a.amount_pkr else 0 end) as commission,
      sum(case when a.type in ('adjustment','reimbursement') and a.amount_pkr > 0 then a.amount_pkr else 0 end) as other_add,
      sum(case when a.type = 'deduction' then a.amount_pkr
               when a.type = 'adjustment' and a.amount_pkr < 0 then -a.amount_pkr
               else 0 end) as other_ded
    from public.employee_compensation_adjustments a
    where a.status = 'approved'
      and a.period_month >= (date_trunc('month', p_from))::date
      and a.period_month <= p_to
    group by 1
  ),
  base as (
    select tm.id as tmid, tm.display_name as dname, tm.employee_code as ecode,
      coalesce(h.base_salary, 0)::numeric as bsal,
      coalesce(h.salary_currency, 'PKR') as cur,
      coalesce(tm.employment_status, 'active') as estatus,
      coalesce(tm.is_active, true) as eactive,
      (coalesce(tm.is_active, true) = true
        and coalesce(tm.employment_status, 'active') not in ('terminated','resigned','inactive','suspended','offboarded','deleted')
        and coalesce(h.base_salary, 0) > 0
        and coalesce(tm.domain_role, '') <> 'owner'
        and coalesce(dp.role, '') <> 'owner') as incl,
      case
        when coalesce(tm.domain_role, '') = 'owner' or coalesce(dp.role, '') = 'owner' then 'owner_compensation_excluded'
        when coalesce(h.base_salary, 0) <= 0 then 'no salary set'
        when coalesce(tm.is_active, true) = false then 'inactive'
        when coalesce(tm.employment_status, 'active') in ('terminated','resigned','inactive','suspended','offboarded','deleted')
          then 'status: ' || tm.employment_status
        else null end as reason,
      coalesce(ld.cnt, 0) as late_cnt,
      coalesce(aj.bonus, 0) as bonus,
      coalesce(aj.commission, 0) as commission,
      coalesce(aj.other_add, 0) as other_add,
      coalesce(aj.other_ded, 0) as other_ded
    from public.employee_hr_private h
    join public.team_members tm on tm.id = h.team_member_id
    left join public.doctor_profiles dp on dp.user_id = tm.user_id
    left join late_days ld on ld.tm = tm.id
    left join adj aj on aj.tm = tm.id
  )
  select b.tmid, b.dname, b.ecode, b.bsal, b.cur, b.estatus, b.eactive,
    round(b.bsal * (v_days::numeric / 30.0), 2),
    b.incl, b.reason, v_workdays,
    (case when b.incl then b.late_cnt else 0 end)::integer,
    case when b.incl then round(round(b.bsal / v_workdays / 2.0, 2) * b.late_cnt, 2) else 0 end,
    case when b.incl then b.bonus else 0 end,
    case when b.incl then b.commission else 0 end,
    case when b.incl then b.other_add else 0 end,
    case when b.incl then b.other_ded else 0 end,
    case when b.incl then b.bonus + b.commission + b.other_add - b.other_ded else 0 end,
    greatest(round(b.bsal * (v_days::numeric / 30.0)
      - case when b.incl then round(b.bsal / v_workdays / 2.0, 2) * b.late_cnt else 0 end
      + case when b.incl then b.bonus + b.commission + b.other_add - b.other_ded else 0 end, 2), 0)
  from base b
  order by b.bsal desc;
end; $$;

-- ── get_salary_expense_summary (TEST 152000 verbatim) ────────────────────────
drop function if exists public.get_salary_expense_summary(date, date);
create function public.get_salary_expense_summary(p_from date, p_to date)
returns table (
  currency text, monthly_total numeric, prorated_total numeric, employee_count integer,
  range_days integer, working_days integer, half_day_late_count integer, late_deduction_total numeric,
  payable_total numeric, bonus_total numeric, commission_total numeric,
  other_additions_total numeric, other_deductions_total numeric, additions_total numeric
)
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
  ),
  adj as (
    select a.team_member_id as tm,
      sum(case when a.type = 'bonus' then a.amount_pkr else 0 end) as bonus,
      sum(case when a.type = 'commission' then a.amount_pkr else 0 end) as commission,
      sum(case when a.type in ('adjustment','reimbursement') and a.amount_pkr > 0 then a.amount_pkr else 0 end) as other_add,
      sum(case when a.type = 'deduction' then a.amount_pkr
               when a.type = 'adjustment' and a.amount_pkr < 0 then -a.amount_pkr
               else 0 end) as other_ded
    from public.employee_compensation_adjustments a
    where a.status = 'approved'
      and a.period_month >= (date_trunc('month', p_from))::date
      and a.period_month <= p_to
    group by 1
  )
  select coalesce(h.salary_currency, 'PKR'),
    sum(coalesce(h.base_salary, 0))::numeric,
    round(sum(coalesce(h.base_salary, 0)) * (v_days::numeric / 30.0), 2),
    count(*)::integer, v_days, v_workdays,
    coalesce(sum(ld.cnt), 0)::integer,
    round(sum(round(coalesce(h.base_salary, 0)::numeric / v_workdays / 2.0, 2) * coalesce(ld.cnt, 0)), 2),
    greatest(round(sum(coalesce(h.base_salary, 0)) * (v_days::numeric / 30.0)
      - sum(round(coalesce(h.base_salary, 0)::numeric / v_workdays / 2.0, 2) * coalesce(ld.cnt, 0))
      + sum(coalesce(aj.bonus, 0) + coalesce(aj.commission, 0) + coalesce(aj.other_add, 0) - coalesce(aj.other_ded, 0)), 2), 0),
    round(sum(coalesce(aj.bonus, 0)), 2),
    round(sum(coalesce(aj.commission, 0)), 2),
    round(sum(coalesce(aj.other_add, 0)), 2),
    round(sum(coalesce(aj.other_ded, 0)), 2),
    round(sum(coalesce(aj.bonus, 0) + coalesce(aj.commission, 0) + coalesce(aj.other_add, 0) - coalesce(aj.other_ded, 0)), 2)
  from public.employee_hr_private h
  join public.team_members tm on tm.id = h.team_member_id
  left join public.doctor_profiles dp on dp.user_id = tm.user_id
  left join late_days ld on ld.tm = tm.id
  left join adj aj on aj.tm = tm.id
  where coalesce(tm.is_active, true) = true
    and coalesce(tm.employment_status, 'active') not in ('terminated','resigned','inactive','suspended','offboarded','deleted')
    and coalesce(h.base_salary, 0) > 0
    and coalesce(tm.domain_role, '') <> 'owner'
    and coalesce(dp.role, '') <> 'owner'
  group by coalesce(h.salary_currency, 'PKR');
end; $$;

-- ── get_my_salary_snapshot — HAND-MERGED (LIVE overlay + 152000 comp fold) ────
drop function if exists public.get_my_salary_snapshot();
create function public.get_my_salary_snapshot()
returns table (
  period_start date, period_end date, base_salary numeric, salary_currency text,
  working_days integer, half_day_late_days integer, late_deduction_amount numeric,
  bonus_amount numeric, commission_amount numeric, other_additions numeric,
  other_deductions numeric, additions_total numeric, payable_amount numeric,
  included boolean, exclude_reason text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tm public.team_members%rowtype;
  v_from date; v_to date; v_scan_from date; v_workdays integer;
  v_base numeric := 0; v_currency text := 'PKR'; v_dp_role text := '';
  v_late_days integer := 0; v_ded numeric := 0;
  v_bonus numeric := 0; v_comm numeric := 0; v_oadd numeric := 0; v_oded numeric := 0;
  v_included boolean; v_reason text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_tm from public.team_members where user_id = v_uid limit 1;
  if v_tm.id is null then return; end if;

  v_from := date_trunc('month', (now() at time zone 'Asia/Karachi'))::date;
  v_to   := (date_trunc('month', (now() at time zone 'Asia/Karachi')) + interval '1 month - 1 day')::date;
  v_scan_from := greatest(v_from, public.late_deduction_policy_start_date());

  select count(*)::int into v_workdays
    from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') d
   where extract(isodow from d) between 1 and 5;
  v_workdays := greatest(1, v_workdays);

  select coalesce(h.base_salary, 0), coalesce(h.salary_currency, 'PKR')
    into v_base, v_currency from public.employee_hr_private h
   where h.team_member_id = v_tm.id limit 1;
  v_base := coalesce(v_base, 0); v_currency := coalesce(v_currency, 'PKR');

  select coalesce(dp.role, '') into v_dp_role
    from public.doctor_profiles dp where dp.user_id = v_uid limit 1;
  v_dp_role := coalesce(v_dp_role, '');

  v_included := coalesce(v_tm.is_active, true) = true
    and coalesce(v_tm.employment_status, 'active') not in ('terminated','resigned','inactive','suspended','offboarded','deleted')
    and v_base > 0 and coalesce(v_tm.domain_role, '') <> 'owner' and v_dp_role <> 'owner';

  v_reason := case
    when coalesce(v_tm.domain_role, '') = 'owner' or v_dp_role = 'owner' then 'owner_compensation_excluded'
    when v_base <= 0 then 'no salary set'
    when coalesce(v_tm.is_active, true) = false then 'inactive'
    when coalesce(v_tm.employment_status, 'active') in ('terminated','resigned','inactive','suspended','offboarded','deleted')
      then 'status: ' || v_tm.employment_status
    else null end;

  if v_included then
    -- Attendance-correction overlay PRESERVED: approved corrected clock-in overrides raw.
    select count(*)::int into v_late_days
    from (
      with first_in_raw as (
        select t.work_date as wd, min(t.clock_in_at) as cin
          from public.time_clock_entries t
         where t.team_member_id = v_tm.id and t.work_date between v_scan_from and v_to
         group by 1
      ),
      approved_corr as (
        select distinct on (c.correction_date) c.correction_date as wd, c.requested_clock_in as cin
          from public.employee_attendance_correction_requests c
         where c.team_member_id = v_tm.id and c.status = 'approved'
           and c.requested_clock_in is not null
           and c.correction_date between v_scan_from and v_to
         order by c.correction_date, c.reviewed_at desc nulls last, c.updated_at desc
      ),
      first_in as (
        select coalesce(r.wd, a.wd) as wd, coalesce(a.cin, r.cin) as cin
          from first_in_raw r full outer join approved_corr a on a.wd = r.wd
      )
      select f.wd, f.cin from first_in f
    ) f
    join lateral (
      select a.shift_template_id from public.employee_shift_assignments a
       where a.team_member_id = v_tm.id and a.effective_from <= f.wd
         and (a.effective_to is null or a.effective_to >= f.wd)
       order by a.effective_from desc limit 1
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

    -- Compensation fold (from 152000): approved adjustments for the current month only.
    select
      coalesce(sum(case when a.type = 'bonus' then a.amount_pkr else 0 end), 0),
      coalesce(sum(case when a.type = 'commission' then a.amount_pkr else 0 end), 0),
      coalesce(sum(case when a.type in ('adjustment','reimbursement') and a.amount_pkr > 0 then a.amount_pkr else 0 end), 0),
      coalesce(sum(case when a.type = 'deduction' then a.amount_pkr
                        when a.type = 'adjustment' and a.amount_pkr < 0 then -a.amount_pkr
                        else 0 end), 0)
      into v_bonus, v_comm, v_oadd, v_oded
    from public.employee_compensation_adjustments a
    where a.team_member_id = v_tm.id
      and a.status = 'approved'
      and a.period_month = v_from;
  end if;

  return query select
    v_from, v_to, v_base, v_currency, v_workdays,
    v_late_days, v_ded,
    v_bonus, v_comm, v_oadd, v_oded,
    v_bonus + v_comm + v_oadd - v_oded,
    greatest(v_base - v_ded + v_bonus + v_comm + v_oadd - v_oded, 0),
    v_included, v_reason;
end; $$;

grant execute on function public.get_salary_expense_detail(date, date) to authenticated;
grant execute on function public.get_salary_expense_summary(date, date) to authenticated;
grant execute on function public.get_my_salary_snapshot() to authenticated;
revoke execute on function public.get_salary_expense_detail(date, date) from public, anon;
revoke execute on function public.get_salary_expense_summary(date, date) from public, anon;
revoke execute on function public.get_my_salary_snapshot() from public, anon;
