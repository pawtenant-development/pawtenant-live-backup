-- TEST-COMPANY-OS-SAAS-ORG-STRUCTURE — Phase 5: org audit trail.
--
-- Automatic audit_logs rows (object_type='staff') for:
--   • employee created / profile-critical fields changed (role, department,
--     primary department, manager, status, active flag)
--   • base salary set / changed (employee_hr_private) — amounts captured old→new
--   • department role assignments created / changed / removed
-- Compensation adjustment events are logged by the RPCs themselves (Phase 3).
-- Triggers never block the write: failures are swallowed.
-- Additive + idempotent. TEST (opudhofjbydrljgleofq) only.

create or replace function public.company_os_audit_actor()
returns table (actor_id uuid, actor_name text, actor_role text)
language sql stable security definer set search_path = public
as $$
  select auth.uid(),
         case when auth.uid() is null then 'system' else public.company_os_actor_name() end,
         case when auth.uid() is null then 'system' else public.company_os_actor_role() end;
$$;

-- ── team_members: created / critical fields changed ──────────────────────────
create or replace function public.company_os_audit_team_member()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  a record;
begin
  select * into a from public.company_os_audit_actor();

  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, actor_name, actor_role, object_type, object_id, action, description, new_values)
    values (a.actor_id, a.actor_name, a.actor_role, 'staff', new.id::text, 'employee_created',
      'Employee created: ' || coalesce(new.display_name, new.workspace_email, new.id::text),
      jsonb_build_object('display_name', new.display_name, 'department', new.department,
        'domain_role', new.domain_role, 'employment_status', new.employment_status));
  elsif tg_op = 'UPDATE' then
    if (old.domain_role is distinct from new.domain_role)
       or (old.department is distinct from new.department)
       or (old.primary_department_id is distinct from new.primary_department_id)
       or (old.manager_id is distinct from new.manager_id)
       or (old.employment_status is distinct from new.employment_status)
       or (old.is_active is distinct from new.is_active)
       or (old.permission_bundle is distinct from new.permission_bundle) then
      insert into public.audit_logs (actor_id, actor_name, actor_role, object_type, object_id, action, description, old_values, new_values)
      values (a.actor_id, a.actor_name, a.actor_role, 'staff', new.id::text,
        case
          when old.is_active is distinct from new.is_active and new.is_active = false then 'employee_deactivated'
          when old.domain_role is distinct from new.domain_role or old.permission_bundle is distinct from new.permission_bundle then 'employee_role_changed'
          else 'employee_profile_changed'
        end,
        'Employee profile changed: ' || coalesce(new.display_name, new.id::text),
        jsonb_build_object('domain_role', old.domain_role, 'department', old.department,
          'primary_department_id', old.primary_department_id, 'manager_id', old.manager_id,
          'employment_status', old.employment_status, 'is_active', old.is_active,
          'permission_bundle', old.permission_bundle),
        jsonb_build_object('domain_role', new.domain_role, 'department', new.department,
          'primary_department_id', new.primary_department_id, 'manager_id', new.manager_id,
          'employment_status', new.employment_status, 'is_active', new.is_active,
          'permission_bundle', new.permission_bundle));
    end if;
  end if;
  return coalesce(new, old);
exception when others then
  return coalesce(new, old); -- audit must never block the write
end; $$;

drop trigger if exists company_os_audit_team_member_trg on public.team_members;
create trigger company_os_audit_team_member_trg
  after insert or update on public.team_members
  for each row execute function public.company_os_audit_team_member();

-- ── employee_hr_private: salary set / changed ────────────────────────────────
create or replace function public.company_os_audit_hr_private()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  a record;
  v_name text;
begin
  select * into a from public.company_os_audit_actor();
  select display_name into v_name from public.team_members where id = new.team_member_id;

  if tg_op = 'INSERT' and new.base_salary is not null then
    insert into public.audit_logs (actor_id, actor_name, actor_role, object_type, object_id, action, description, new_values)
    values (a.actor_id, a.actor_name, a.actor_role, 'staff', new.team_member_id::text, 'salary_set',
      'Base salary set for ' || coalesce(v_name, new.team_member_id::text),
      jsonb_build_object('base_salary', new.base_salary, 'salary_currency', new.salary_currency));
  elsif tg_op = 'UPDATE' and (old.base_salary is distinct from new.base_salary) then
    insert into public.audit_logs (actor_id, actor_name, actor_role, object_type, object_id, action, description, old_values, new_values)
    values (a.actor_id, a.actor_name, a.actor_role, 'staff', new.team_member_id::text, 'salary_changed',
      'Base salary changed for ' || coalesce(v_name, new.team_member_id::text),
      jsonb_build_object('base_salary', old.base_salary, 'salary_currency', old.salary_currency),
      jsonb_build_object('base_salary', new.base_salary, 'salary_currency', new.salary_currency));
  end if;
  return new;
exception when others then
  return new;
end; $$;

drop trigger if exists company_os_audit_hr_private_trg on public.employee_hr_private;
create trigger company_os_audit_hr_private_trg
  after insert or update on public.employee_hr_private
  for each row execute function public.company_os_audit_hr_private();

-- ── team_member_department_roles: assigned / changed / removed ───────────────
create or replace function public.company_os_audit_department_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  a record;
  v_name text;
  v_dept text;
  r record;
begin
  select * into a from public.company_os_audit_actor();
  r := coalesce(new, old);
  select display_name into v_name from public.team_members where id = r.team_member_id;
  select name into v_dept from public.company_departments where id = r.department_id;

  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, actor_name, actor_role, object_type, object_id, action, description, new_values)
    values (a.actor_id, a.actor_name, a.actor_role, 'staff', new.id::text, 'department_role_assigned',
      coalesce(v_name, 'Employee') || ' assigned to ' || coalesce(v_dept, 'department') || ' as ' || new.role_level,
      to_jsonb(new) - 'created_at' - 'updated_at');
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs (actor_id, actor_name, actor_role, object_type, object_id, action, description, old_values, new_values)
    values (a.actor_id, a.actor_name, a.actor_role, 'staff', new.id::text,
      case when old.is_active and not new.is_active then 'department_role_removed' else 'department_role_changed' end,
      coalesce(v_name, 'Employee') || ' — ' || coalesce(v_dept, 'department') || ' role '
        || case when old.is_active and not new.is_active then 'ended' else 'updated' end,
      to_jsonb(old) - 'created_at' - 'updated_at',
      to_jsonb(new) - 'created_at' - 'updated_at');
  elsif tg_op = 'DELETE' then
    insert into public.audit_logs (actor_id, actor_name, actor_role, object_type, object_id, action, description, old_values)
    values (a.actor_id, a.actor_name, a.actor_role, 'staff', old.id::text, 'department_role_deleted',
      coalesce(v_name, 'Employee') || ' — ' || coalesce(v_dept, 'department') || ' assignment deleted',
      to_jsonb(old) - 'created_at' - 'updated_at');
  end if;
  return coalesce(new, old);
exception when others then
  return coalesce(new, old);
end; $$;

drop trigger if exists company_os_audit_department_role_trg on public.team_member_department_roles;
create trigger company_os_audit_department_role_trg
  after insert or update or delete on public.team_member_department_roles
  for each row execute function public.company_os_audit_department_role();
