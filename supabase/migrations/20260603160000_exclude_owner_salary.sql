-- Exclude owner/founder compensation from the ESTIMATED EMPLOYEE salary expense.
-- Owners (doctor_profiles.role = 'owner' OR team_members.domain_role = 'owner')
-- are not normal payroll; their compensation (owner draw) is tracked separately
-- in a future task. The detail RPC still RETURNS owner rows but flags them
-- included = false with reason 'owner_compensation_excluded' so the admin
-- breakdown shows them as excluded (no data is changed/deleted).
-- Admin/finance gated. Additive + idempotent. TEST (opudhofjbydrljgleofq).

create or replace function public.get_salary_expense_summary(p_from date, p_to date)
returns table (currency text, monthly_total numeric, prorated_total numeric, employee_count integer, range_days integer)
language plpgsql security definer set search_path = public
as $$
declare v_days integer;
begin
  if not exists (select 1 from public.doctor_profiles dp where dp.user_id = auth.uid()
                 and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))) then
    raise exception 'not authorized';
  end if;
  v_days := greatest(1, (p_to - p_from) + 1);
  return query
  select coalesce(h.salary_currency,'PKR'), sum(coalesce(h.base_salary,0))::numeric,
    round(sum(coalesce(h.base_salary,0)) * (v_days::numeric/30.0), 2), count(*)::integer, v_days
  from public.employee_hr_private h
  join public.team_members tm on tm.id = h.team_member_id
  left join public.doctor_profiles dp on dp.user_id = tm.user_id
  where coalesce(tm.is_active,true) = true
    and coalesce(tm.employment_status,'active') not in ('terminated','resigned','inactive','suspended','offboarded','deleted')
    and coalesce(h.base_salary,0) > 0
    and coalesce(tm.domain_role,'') <> 'owner'
    and coalesce(dp.role,'') <> 'owner'
  group by coalesce(h.salary_currency,'PKR');
end; $$;
grant execute on function public.get_salary_expense_summary(date, date) to authenticated;

create or replace function public.get_salary_expense_detail(p_from date, p_to date)
returns table (team_member_id uuid, display_name text, employee_code text, base_salary numeric, salary_currency text,
  employment_status text, is_active boolean, prorated_amount numeric, included boolean, exclude_reason text)
language plpgsql security definer set search_path = public
as $$
declare v_days integer;
begin
  if not exists (select 1 from public.doctor_profiles dp where dp.user_id = auth.uid()
                 and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))) then
    raise exception 'not authorized';
  end if;
  v_days := greatest(1, (p_to - p_from) + 1);
  return query
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
      else null end
  from public.employee_hr_private h
  join public.team_members tm on tm.id = h.team_member_id
  left join public.doctor_profiles dp on dp.user_id = tm.user_id
  order by coalesce(h.base_salary,0) desc;
end; $$;
grant execute on function public.get_salary_expense_detail(date, date) to authenticated;
