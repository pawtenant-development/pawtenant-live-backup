-- Company OS — Admin notification aggregator for actionable HR requests.
-- Read-only SECURITY DEFINER RPC that returns PENDING items from the three
-- request tables (attendance corrections, leave requests, leave corrections)
-- joined to team_members for the employee name. Admin-only (owner/admin_manager
-- + is_admin). Additive — no tables changed. Not payroll. Employees only
-- (providers/customers never appear).
-- Applied to TEST (opudhofjbydrljgleofq) via Supabase MCP on 2026-06-03.

create or replace function public.get_admin_company_os_notifications()
returns table (
  id text,
  source_type text,
  source_id uuid,
  employee_name text,
  title text,
  message text,
  status text,
  created_at timestamptz,
  target_tab text,
  priority integer
)
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.doctor_profiles dp
     where dp.user_id = auth.uid() and dp.is_admin = true
       and coalesce(dp.role,'') in ('owner','admin_manager')
  ) then
    raise exception 'not authorized to view admin HR notifications';
  end if;

  return query
  -- 1) Attendance correction requests (pending)
  select
    ('att-' || r.id)::text,
    'attendance_correction'::text,
    r.id,
    coalesce(tm.display_name, 'Employee'),
    'Attendance correction pending'::text,
    coalesce(tm.display_name, 'Employee') || ' — ' || to_char(r.correction_date, 'Mon DD, YYYY'),
    r.status,
    r.created_at,
    'attendance'::text,
    1
  from public.employee_attendance_correction_requests r
  join public.team_members tm on tm.id = r.team_member_id
  where r.status = 'pending'

  union all
  -- 2) Leave requests (pending)
  select
    ('lv-' || r.id)::text,
    'leave_request'::text,
    r.id,
    coalesce(tm.display_name, 'Employee'),
    'Leave request pending'::text,
    coalesce(tm.display_name, 'Employee') || ' — ' ||
      to_char(r.start_date, 'Mon DD') ||
      case when r.end_date <> r.start_date then ' → ' || to_char(r.end_date, 'Mon DD') else '' end,
    r.status,
    r.created_at,
    'team'::text,
    1
  from public.employee_leave_requests r
  join public.team_members tm on tm.id = r.team_member_id
  where r.status = 'pending'

  union all
  -- 3) Leave correction / amendment requests (pending)
  select
    ('lvc-' || r.id)::text,
    'leave_correction'::text,
    r.id,
    coalesce(tm.display_name, 'Employee'),
    'Leave correction pending'::text,
    coalesce(tm.display_name, 'Employee') || ' — ' || replace(r.correction_type, '_', ' '),
    r.status,
    r.created_at,
    'team'::text,
    1
  from public.employee_leave_correction_requests r
  join public.team_members tm on tm.id = r.team_member_id
  where r.status = 'pending'

  order by created_at desc;
end;
$$;

grant execute on function public.get_admin_company_os_notifications() to authenticated;
