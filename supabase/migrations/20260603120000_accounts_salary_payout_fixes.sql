-- Accounts fixes: tighten the salary-expense aggregate to genuinely-active
-- employees and add an admin-only per-employee breakdown RPC for the Accounts
-- diagnostic. Provider-payout completion logic is handled client-side (no RPC).
-- Admin/finance gated. Additive + idempotent. TEST (opudhofjbydrljgleofq).

-- Statuses that mean "not a current payroll cost".
-- Everything else (active, null, probation, ...) is conservatively included.
-- 1) Revised aggregate summary -------------------------------------------------
create or replace function public.get_salary_expense_summary(p_from date, p_to date)
returns table (
  currency text,
  monthly_total numeric,
  prorated_total numeric,
  employee_count integer,
  range_days integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  if not exists (
    select 1 from public.doctor_profiles dp
    where dp.user_id = auth.uid()
      and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))
  ) then
    raise exception 'not authorized';
  end if;

  v_days := greatest(1, (p_to - p_from) + 1);

  return query
  select
    coalesce(h.salary_currency, 'PKR') as currency,
    sum(coalesce(h.base_salary, 0))::numeric as monthly_total,
    round(sum(coalesce(h.base_salary, 0)) * (v_days::numeric / 30.0), 2) as prorated_total,
    count(*)::integer as employee_count,
    v_days as range_days
  from public.employee_hr_private h
  join public.team_members tm on tm.id = h.team_member_id
  where coalesce(tm.is_active, true) = true
    and coalesce(tm.employment_status, 'active') not in
        ('terminated','resigned','inactive','suspended','offboarded','deleted')
    and coalesce(h.base_salary, 0) > 0
  group by coalesce(h.salary_currency, 'PKR');
end;
$$;

grant execute on function public.get_salary_expense_summary(date, date) to authenticated;

-- 2) Admin-only per-employee breakdown (diagnostic) ---------------------------
-- Returns one row per employee that has an HR salary record, with an `included`
-- flag + reason so admins can see EXACTLY which salaries drive the estimate.
-- Admin/finance only (SECURITY DEFINER + explicit gate). Never exposed to the
-- employee portal.
create or replace function public.get_salary_expense_detail(p_from date, p_to date)
returns table (
  team_member_id uuid,
  display_name text,
  employee_code text,
  base_salary numeric,
  salary_currency text,
  employment_status text,
  is_active boolean,
  prorated_amount numeric,
  included boolean,
  exclude_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  if not exists (
    select 1 from public.doctor_profiles dp
    where dp.user_id = auth.uid()
      and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))
  ) then
    raise exception 'not authorized';
  end if;

  v_days := greatest(1, (p_to - p_from) + 1);

  return query
  select
    tm.id as team_member_id,
    tm.display_name,
    tm.employee_code,
    coalesce(h.base_salary, 0)::numeric as base_salary,
    coalesce(h.salary_currency, 'PKR') as salary_currency,
    coalesce(tm.employment_status, 'active') as employment_status,
    coalesce(tm.is_active, true) as is_active,
    round(coalesce(h.base_salary, 0) * (v_days::numeric / 30.0), 2) as prorated_amount,
    (
      coalesce(tm.is_active, true) = true
      and coalesce(tm.employment_status, 'active') not in
          ('terminated','resigned','inactive','suspended','offboarded','deleted')
      and coalesce(h.base_salary, 0) > 0
    ) as included,
    case
      when coalesce(h.base_salary, 0) <= 0 then 'no salary set'
      when coalesce(tm.is_active, true) = false then 'inactive'
      when coalesce(tm.employment_status, 'active') in
           ('terminated','resigned','inactive','suspended','offboarded','deleted')
        then 'status: ' || tm.employment_status
      else null
    end as exclude_reason
  from public.employee_hr_private h
  join public.team_members tm on tm.id = h.team_member_id
  order by coalesce(h.base_salary, 0) desc;
end;
$$;

grant execute on function public.get_salary_expense_detail(date, date) to authenticated;
