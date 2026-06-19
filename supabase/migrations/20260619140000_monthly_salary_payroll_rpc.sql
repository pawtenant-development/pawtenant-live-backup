-- Monthly Salary Payroll RPC for the monthly business report — TEST
-- ---------------------------------------------------------------------------
-- get_monthly_salary_payroll(p_from, p_to) → one privacy-sensitive jsonb blob
-- (per-employee payroll detail + totals + policy + warnings) for the monthly
-- report's "Salary Payroll" Excel sheet.
--
-- Reuses the EXACT formula of get_salary_expense_detail / get_salary_expense_summary
-- (so payroll figures tie out to the Accounts Books salary expense) and enriches
-- with attendance (present/absent/late), approved leave days, and dept/role.
-- The half-day-late calc is inlined verbatim from get_half_day_late_attendance
-- (which is auth.uid()-gated and cannot be called from a service-role context).
--
-- Security: SECURITY DEFINER. Gate mirrors get_monthly_business_report — service
-- role (auth.uid() IS NULL) OR an accounts admin. EXECUTE granted to authenticated
-- + service_role only (NOT anon/public), so payroll is never publicly reachable.
-- Additive: touches no existing function, table or calculation.

create or replace function public.get_monthly_salary_payroll(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_fx       numeric := 280.0;
  v_days     integer := greatest(1, (p_to - p_from) + 1);
  v_workdays integer;
  v_policy   date := public.late_deduction_policy_start_date();
  v_from_late date := greatest(p_from, public.late_deduction_policy_start_date());
  v_att_rows integer := 0;
  v_net_usd  numeric := 0;
  v_est_usd  numeric := 0;
  v_warn     jsonb := '[]'::jsonb;
  v_result   jsonb;
begin
  -- Gate: service role (no user JWT) OR accounts admin. EXECUTE is granted only
  -- to authenticated + service_role, so anon can never reach payroll.
  if auth.uid() is not null and not public.is_accounts_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select count(*)::int into v_workdays
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
   where extract(isodow from d) between 1 and 5;
  v_workdays := greatest(1, v_workdays);

  select count(*)::int into v_att_rows
    from public.attendance_daily_summary where work_date between p_from and p_to;

  with
  -- Half-day-late count per member — inlined copy of get_half_day_late_attendance
  -- so the numbers match the canonical rule (shift start + 30-min grace floor,
  -- approved corrections, policy start date). Empty when p_to < policy date.
  first_in_raw as (
    select t.team_member_id as tm, t.work_date as wd, min(t.clock_in_at) as cin
    from public.time_clock_entries t
    where t.work_date between v_from_late and p_to
    group by 1, 2
  ),
  approved_corr as (
    select distinct on (c.team_member_id, c.correction_date)
           c.team_member_id as tm, c.correction_date as wd, c.requested_clock_in as cin
    from public.employee_attendance_correction_requests c
    where c.status = 'approved' and c.requested_clock_in is not null
      and c.correction_date between v_from_late and p_to
    order by c.team_member_id, c.correction_date, c.reviewed_at desc nulls last, c.updated_at desc
  ),
  first_in as (
    select coalesce(r.tm, a.tm) as tm, coalesce(r.wd, a.wd) as wd, coalesce(a.cin, r.cin) as cin
    from first_in_raw r full outer join approved_corr a on a.tm = r.tm and a.wd = r.wd
  ),
  calc as (
    select f.tm, f.wd, x.mins_after_start,
           greatest(coalesce(st.grace_minutes, 30), 30) as threshold_minutes
    from first_in f
    join lateral (
      select a.shift_template_id from public.employee_shift_assignments a
      where a.team_member_id = f.tm and a.effective_from <= f.wd
        and (a.effective_to is null or a.effective_to >= f.wd)
      order by a.effective_from desc limit 1
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
  ),
  late_days as (
    select c.tm, count(*)::int as cnt
    from calc c where c.mins_after_start >= c.threshold_minutes
    group by c.tm
  ),
  att as (
    select team_member_id as tm,
      count(*) filter (where coalesce(total_worked_minutes, 0) > 0)::int as present_days,
      count(*) filter (where was_absent)::int as absent_days,
      count(*) filter (where was_late)::int as att_late_days
    from public.attendance_daily_summary
    where work_date between p_from and p_to
    group by 1
  ),
  lv as (
    select team_member_id as tm,
      sum(case when partial_day then 0.5
               else (least(end_date, p_to) - greatest(start_date, p_from) + 1) end)::numeric as leave_days,
      sum(case when leave_type ilike '%unpaid%'
               then (case when partial_day then 0.5 else (least(end_date, p_to) - greatest(start_date, p_from) + 1) end)
               else 0 end)::numeric as unpaid_days
    from public.employee_leave_requests
    where status = 'approved' and start_date <= p_to and end_date >= p_from
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
    where a.status = 'approved' and a.deleted_at is null
      and a.period_month >= (date_trunc('month', p_from))::date and a.period_month <= p_to
    group by 1
  ),
  base as (
    select tm.id as tmid, tm.display_name as dname, tm.employee_code as ecode,
      coalesce(nullif(tm.title, ''), nullif(tm.domain_role, ''), 'Member') as role,
      coalesce(nullif(tm.department, ''), '—') as dept,
      coalesce(h.base_salary, 0)::numeric as bsal,
      coalesce(h.salary_currency, 'PKR') as cur,
      coalesce(tm.employment_status, 'active') as estatus,
      (coalesce(tm.domain_role, '') = 'owner' or coalesce(dp.role, '') = 'owner') as is_owner,
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
      coalesce(aj.bonus, 0) as bonus, coalesce(aj.commission, 0) as commission,
      coalesce(aj.other_add, 0) as other_add, coalesce(aj.other_ded, 0) as other_ded,
      coalesce(at.present_days, 0) as present_days, coalesce(at.absent_days, 0) as absent_days,
      coalesce(at.att_late_days, 0) as att_late_days,
      coalesce(lv.leave_days, 0) as leave_days, coalesce(lv.unpaid_days, 0) as unpaid_days
    from public.employee_hr_private h
    join public.team_members tm on tm.id = h.team_member_id
    left join public.doctor_profiles dp on dp.user_id = tm.user_id
    left join late_days ld on ld.tm = tm.id
    left join adj aj on aj.tm = tm.id
    left join att at on at.tm = tm.id
    left join lv on lv.tm = tm.id
  ),
  emp as (
    select
      b.ecode as employee_code,
      b.dname as employee_name,
      b.role,
      b.dept as department,
      b.estatus as status,
      b.incl as included,
      b.is_owner as owner_excluded,
      b.reason as exclude_reason,
      b.cur as currency,
      round(b.bsal, 2) as base_salary,
      round(b.bsal * (v_days::numeric / 30.0), 2) as prorated_base,
      v_workdays as working_days,
      b.present_days, b.absent_days, b.att_late_days as late_days,
      (case when b.incl then b.late_cnt else 0 end) as half_day_late_days,
      b.leave_days,
      (b.leave_days - b.unpaid_days) as paid_leave_days,
      b.unpaid_days as unpaid_leave_days,
      (case when b.incl then round(round(b.bsal / v_workdays / 2.0, 2) * b.late_cnt, 2) else 0 end) as attendance_deduction,
      (case when b.incl then b.bonus else 0 end) as bonus,
      (case when b.incl then b.commission else 0 end) as commission,
      (case when b.incl then b.bonus + b.commission else 0 end) as approved_additions,
      (case when b.incl then b.other_add else 0 end) as other_adjustments,
      (case when b.incl then b.other_ded else 0 end) as approved_deductions,
      null::numeric as medical_addition,
      null::numeric as medical_deduction,
      (case when b.incl then round(b.bsal * (v_days::numeric / 30.0) + b.bonus + b.commission + b.other_add, 2)
            else round(b.bsal * (v_days::numeric / 30.0), 2) end) as gross_payable,
      (case when b.incl then greatest(round(b.bsal * (v_days::numeric / 30.0)
              - round(b.bsal / v_workdays / 2.0, 2) * b.late_cnt
              + b.bonus + b.commission + b.other_add - b.other_ded, 2), 0)
            else 0 end) as net_payable
    from base b
  )
  select
    round(coalesce(sum(net_payable) filter (where included), 0) / v_fx, 2),
    round(coalesce(sum(prorated_base + approved_additions + other_adjustments - approved_deductions) filter (where included), 0) / v_fx, 2),
    jsonb_build_object(
      'policy', jsonb_build_object(
        'effective_date', v_policy, 'working_days_basis', 'Monday–Friday', 'grace_minutes', 30,
        'rule', 'More than 30 minutes late = half-day salary deduction',
        'owner_excluded', true, 'fx_pkr_per_usd', v_fx, 'working_days', v_workdays, 'period_days', v_days),
      'employees', coalesce(jsonb_agg(
        to_jsonb(e) || jsonb_build_object(
          'base_salary_usd', round(e.base_salary / v_fx, 2),
          'net_payable_usd', round(e.net_payable / v_fx, 2)
        ) order by e.included desc, e.base_salary desc), '[]'::jsonb),
      'totals', jsonb_build_object(
        'employees_included', count(*) filter (where included),
        'employees_total', count(*),
        'gross_base_pkr', round(coalesce(sum(base_salary) filter (where included), 0), 2),
        'prorated_base_pkr', round(coalesce(sum(prorated_base) filter (where included), 0), 2),
        'approved_additions_pkr', round(coalesce(sum(approved_additions) filter (where included), 0), 2),
        'other_adjustments_pkr', round(coalesce(sum(other_adjustments) filter (where included), 0), 2),
        'approved_deductions_pkr', round(coalesce(sum(approved_deductions) filter (where included), 0), 2),
        'attendance_deduction_pkr', round(coalesce(sum(attendance_deduction) filter (where included), 0), 2),
        'medical_addition_pkr', null, 'medical_deduction_pkr', null,
        'leave_days_total', coalesce(sum(leave_days) filter (where included), 0),
        'net_payroll_pkr', round(coalesce(sum(net_payable) filter (where included), 0), 2),
        'net_payroll_usd', round(coalesce(sum(net_payable) filter (where included), 0) / v_fx, 2),
        'estimate_usd', round(coalesce(sum(prorated_base + approved_additions + other_adjustments - approved_deductions) filter (where included), 0) / v_fx, 2),
        'attendance_deduction_usd', round(coalesce(sum(attendance_deduction) filter (where included), 0) / v_fx, 2),
        'owner_excluded_count', count(*) filter (where owner_excluded),
        'owner_excluded_pkr', round(coalesce(sum(prorated_base) filter (where owner_excluded), 0), 2),
        'owner_excluded_usd', round(coalesce(sum(prorated_base) filter (where owner_excluded), 0) / v_fx, 2),
        'currency_native', 'PKR')
    )
  into v_net_usd, v_est_usd, v_result
  from emp e;

  -- Warnings
  v_warn := v_warn
    || jsonb_build_array('Payroll details are based on existing HR salary, attendance, leave and compensation records — no figures are invented.')
    || jsonb_build_array('Attendance / late deductions apply only from the policy date (' || v_policy || '). Earlier periods are treated as 100% attendance.')
    || jsonb_build_array('Owner salary is excluded from business payroll expense.')
    || jsonb_build_array('Medical allowance / medical deduction category does not exist in the compensation system — shown as Not available.');
  if v_att_rows = 0 then
    v_warn := v_warn || jsonb_build_array('No attendance summary rows for this period — Present / Absent / Late days show 0 (no clock-in data, e.g. before the attendance policy date).');
  end if;
  if round(v_net_usd, 2) <> round(v_est_usd, 2) then
    v_warn := v_warn || jsonb_build_array('Payroll net total (USD ' || round(v_net_usd,2) || ', includes attendance deductions) differs from the P&L salary estimate (USD ' || round(v_est_usd,2) || ', which excludes attendance deductions). Operating Net is unchanged — this sheet holds the more accurate figure.');
  end if;

  v_result := jsonb_set(v_result, '{warnings}', v_warn);
  return v_result;
end;
$fn$;

revoke all on function public.get_monthly_salary_payroll(date, date) from public;
grant execute on function public.get_monthly_salary_payroll(date, date) to authenticated, service_role;
