-- Company OS — Employee Leave & Absence Requests. Self-service HR workflow.
-- Employees submit/cancel their own requests; admin (owner/admin_manager + is_admin)
-- reviews (approve/reject) all. Additive + idempotent. Employees only
-- (team_members); providers/customers excluded. NOT linked to payroll yet.
-- Applied to TEST (opudhofjbydrljgleofq) via Supabase MCP on 2026-06-01.

-- 1) Table
create table if not exists public.employee_leave_requests (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  company_id uuid,                                   -- future-ready, nullable, no FK
  leave_type text not null default 'casual',
  start_date date not null,
  end_date date not null,
  partial_day boolean not null default false,
  partial_day_hours numeric,
  reason text,
  status text not null default 'pending',
  employee_note text,
  manager_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='employee_leave_type_chk') then
    alter table public.employee_leave_requests add constraint employee_leave_type_chk
      check (leave_type in ('casual','sick','emergency','unpaid','half_day','annual','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname='employee_leave_status_chk') then
    alter table public.employee_leave_requests add constraint employee_leave_status_chk
      check (status in ('pending','approved','rejected','cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname='employee_leave_dates_chk') then
    alter table public.employee_leave_requests add constraint employee_leave_dates_chk
      check (end_date >= start_date);
  end if;
  if not exists (select 1 from pg_constraint where conname='employee_leave_partial_chk') then
    -- partial_day_hours may only be set when partial_day is true.
    alter table public.employee_leave_requests add constraint employee_leave_partial_chk
      check (partial_day_hours is null or partial_day = true);
  end if;
end $$;

create index if not exists idx_employee_leave_member on public.employee_leave_requests (team_member_id);
create index if not exists idx_employee_leave_status on public.employee_leave_requests (status);
create index if not exists idx_employee_leave_dates on public.employee_leave_requests (start_date, end_date);

alter table public.employee_leave_requests enable row level security;

-- Admin (owner/admin_manager + is_admin): full read + manage of all requests.
drop policy if exists eleave_admin_all on public.employee_leave_requests;
create policy eleave_admin_all on public.employee_leave_requests
  for all to authenticated
  using (exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')))
  with check (exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')));

-- Employee: read ONLY their own leave requests (never other employees').
drop policy if exists eleave_self_read on public.employee_leave_requests;
create policy eleave_self_read on public.employee_leave_requests
  for select to authenticated
  using (
    team_member_id in (select tm.id from public.team_members tm where tm.user_id = auth.uid())
  );

-- NOTE: employees have NO direct INSERT/UPDATE/DELETE policy. All employee writes
-- go through the SECURITY DEFINER RPCs below, which enforce ownership + status
-- rules. This prevents an employee from approving/rejecting or editing manager
-- fields directly.

create or replace function public.employee_leave_set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists eleave_set_updated_at on public.employee_leave_requests;
create trigger eleave_set_updated_at before update on public.employee_leave_requests
  for each row execute function public.employee_leave_set_updated_at();

-- 2) Employee submits their own leave request (always status 'pending').
create or replace function public.submit_my_leave_request(
  p_leave_type text,
  p_start_date date,
  p_end_date date,
  p_partial_day boolean default false,
  p_partial_day_hours numeric default null,
  p_reason text default null,
  p_employee_note text default null
)
returns public.employee_leave_requests
language plpgsql security definer set search_path = public
as $$
declare
  v_tm uuid;
  v_row public.employee_leave_requests;
begin
  select tm.id into v_tm
    from public.team_members tm
   where tm.user_id = auth.uid()
   limit 1;
  if v_tm is null then
    raise exception 'no employee profile for current user';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'start and end date are required';
  end if;
  if p_end_date < p_start_date then
    raise exception 'end date cannot be before start date';
  end if;

  insert into public.employee_leave_requests (
    team_member_id, leave_type, start_date, end_date,
    partial_day, partial_day_hours, reason, employee_note, status
  ) values (
    v_tm,
    coalesce(p_leave_type, 'casual'),
    p_start_date,
    p_end_date,
    coalesce(p_partial_day, false),
    case when coalesce(p_partial_day, false) then p_partial_day_hours else null end,
    p_reason,
    p_employee_note,
    'pending'
  )
  returning * into v_row;

  return v_row;
end; $$;

grant execute on function public.submit_my_leave_request(text, date, date, boolean, numeric, text, text) to authenticated;

-- 3) Employee cancels their OWN request — only while still pending.
create or replace function public.cancel_my_leave_request(p_request_id uuid)
returns public.employee_leave_requests
language plpgsql security definer set search_path = public
as $$
declare v_row public.employee_leave_requests;
begin
  update public.employee_leave_requests r
     set status = 'cancelled',
         cancelled_by = auth.uid(),
         cancelled_at = now()
   where r.id = p_request_id
     and r.status = 'pending'
     and r.team_member_id in (select tm.id from public.team_members tm where tm.user_id = auth.uid())
   returning * into v_row;
  if v_row.id is null then
    raise exception 'request not found, not yours, or no longer cancellable';
  end if;
  return v_row;
end; $$;

grant execute on function public.cancel_my_leave_request(uuid) to authenticated;

-- 4) Admin reviews a request — approve or reject only (owner/admin_manager + is_admin).
create or replace function public.review_employee_leave_request(
  p_request_id uuid,
  p_status text,
  p_manager_note text default null
)
returns public.employee_leave_requests
language plpgsql security definer set search_path = public
as $$
declare v_row public.employee_leave_requests;
begin
  if not exists (
    select 1 from public.doctor_profiles dp
     where dp.user_id = auth.uid() and dp.is_admin = true
       and coalesce(dp.role,'') in ('owner','admin_manager')
  ) then
    raise exception 'not authorized to review leave requests';
  end if;

  if p_status not in ('approved','rejected') then
    raise exception 'status must be approved or rejected';
  end if;

  update public.employee_leave_requests r
     set status = p_status,
         manager_note = p_manager_note,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where r.id = p_request_id
     and r.status = 'pending'
   returning * into v_row;
  if v_row.id is null then
    raise exception 'request not found or not in a reviewable state';
  end if;
  return v_row;
end; $$;

grant execute on function public.review_employee_leave_request(uuid, text, text) to authenticated;
