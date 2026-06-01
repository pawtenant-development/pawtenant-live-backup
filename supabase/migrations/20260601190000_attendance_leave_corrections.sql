-- Company OS — Attendance & Leave correction workflows + leave-type expansion.
-- Additive + idempotent. Employees only (team_members); providers/customers
-- excluded. NOT payroll. Approvals are decision records only — they do NOT
-- mutate time_clock_entries, employee_break_records, or employee_leave_requests
-- (safe, fully auditable; future payroll/timesheet phase can apply them).
-- Uses team_member_id to match existing Company OS convention.
-- Applied to TEST (opudhofjbydrljgleofq) via Supabase MCP on 2026-06-01.

-- ── PART B: expand allowed leave types (add work_from_home) ──────────────────
alter table public.employee_leave_requests drop constraint if exists employee_leave_type_chk;
alter table public.employee_leave_requests add constraint employee_leave_type_chk
  check (leave_type in ('casual','sick','emergency','unpaid','half_day','annual','work_from_home','other'));

-- ── PART A: Attendance correction requests ───────────────────────────────────
create table if not exists public.employee_attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  company_id uuid,                                   -- future-ready, nullable, no FK
  correction_date date not null,
  correction_type text not null,
  requested_clock_in timestamptz,
  requested_clock_out timestamptz,
  requested_break_start timestamptz,
  requested_break_end timestamptz,
  requested_break_minutes integer,
  reason text not null,
  employee_note text,
  status text not null default 'pending',
  manager_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='att_corr_type_chk') then
    alter table public.employee_attendance_correction_requests add constraint att_corr_type_chk
      check (correction_type in ('missed_clock_in','missed_clock_out','wrong_clock_in','wrong_clock_out',
                                 'missed_break_start','missed_break_end','wrong_break','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname='att_corr_status_chk') then
    alter table public.employee_attendance_correction_requests add constraint att_corr_status_chk
      check (status in ('pending','approved','rejected','cancelled'));
  end if;
end $$;

create index if not exists idx_att_corr_member on public.employee_attendance_correction_requests (team_member_id);
create index if not exists idx_att_corr_status on public.employee_attendance_correction_requests (status);
create index if not exists idx_att_corr_date on public.employee_attendance_correction_requests (correction_date);

alter table public.employee_attendance_correction_requests enable row level security;

drop policy if exists att_corr_admin_all on public.employee_attendance_correction_requests;
create policy att_corr_admin_all on public.employee_attendance_correction_requests
  for all to authenticated
  using (exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')))
  with check (exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')));

drop policy if exists att_corr_self_read on public.employee_attendance_correction_requests;
create policy att_corr_self_read on public.employee_attendance_correction_requests
  for select to authenticated
  using (team_member_id in (select tm.id from public.team_members tm where tm.user_id = auth.uid()));

create or replace function public.att_corr_set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists att_corr_set_updated_at on public.employee_attendance_correction_requests;
create trigger att_corr_set_updated_at before update on public.employee_attendance_correction_requests
  for each row execute function public.att_corr_set_updated_at();

-- Employee submits an attendance correction request.
create or replace function public.submit_my_attendance_correction_request(
  p_correction_date date,
  p_correction_type text,
  p_reason text,
  p_requested_clock_in timestamptz default null,
  p_requested_clock_out timestamptz default null,
  p_requested_break_start timestamptz default null,
  p_requested_break_end timestamptz default null,
  p_requested_break_minutes integer default null,
  p_employee_note text default null
)
returns public.employee_attendance_correction_requests
language plpgsql security definer set search_path = public
as $$
declare v_tm uuid; v_row public.employee_attendance_correction_requests;
begin
  if p_correction_type not in ('missed_clock_in','missed_clock_out','wrong_clock_in','wrong_clock_out',
                               'missed_break_start','missed_break_end','wrong_break','other') then
    raise exception 'invalid correction type: %', p_correction_type;
  end if;
  if p_correction_date is null then raise exception 'correction date is required'; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'reason is required'; end if;

  select tm.id into v_tm from public.team_members tm
   where tm.user_id = auth.uid() and tm.is_active is true limit 1;
  if v_tm is null then raise exception 'no active employee profile for current user'; end if;

  insert into public.employee_attendance_correction_requests (
    team_member_id, correction_date, correction_type, requested_clock_in, requested_clock_out,
    requested_break_start, requested_break_end, requested_break_minutes, reason, employee_note, status
  ) values (
    v_tm, p_correction_date, p_correction_type, p_requested_clock_in, p_requested_clock_out,
    p_requested_break_start, p_requested_break_end, p_requested_break_minutes,
    p_reason, p_employee_note, 'pending'
  ) returning * into v_row;
  return v_row;
end; $$;

grant execute on function public.submit_my_attendance_correction_request(date, text, text, timestamptz, timestamptz, timestamptz, timestamptz, integer, text) to authenticated;

-- Employee cancels their OWN pending attendance correction.
create or replace function public.cancel_my_attendance_correction_request(p_request_id uuid, p_reason text default null)
returns public.employee_attendance_correction_requests
language plpgsql security definer set search_path = public
as $$
declare v_row public.employee_attendance_correction_requests;
begin
  update public.employee_attendance_correction_requests r
     set status = 'cancelled', cancelled_at = now(), cancelled_reason = p_reason
   where r.id = p_request_id and r.status = 'pending'
     and r.team_member_id in (select tm.id from public.team_members tm where tm.user_id = auth.uid())
   returning * into v_row;
  if v_row.id is null then raise exception 'request not found, not yours, or no longer cancellable'; end if;
  return v_row;
end; $$;

grant execute on function public.cancel_my_attendance_correction_request(uuid, text) to authenticated;

-- Admin reviews an attendance correction (approve/reject). Decision record only —
-- does NOT mutate time_clock_entries / employee_break_records.
create or replace function public.review_attendance_correction_request(
  p_request_id uuid, p_decision text, p_manager_note text default null
)
returns public.employee_attendance_correction_requests
language plpgsql security definer set search_path = public
as $$
declare v_row public.employee_attendance_correction_requests;
begin
  if not exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')) then
    raise exception 'not authorized to review attendance corrections';
  end if;
  if p_decision not in ('approved','rejected') then raise exception 'decision must be approved or rejected'; end if;

  update public.employee_attendance_correction_requests r
     set status = p_decision, manager_note = p_manager_note, reviewed_by = auth.uid(), reviewed_at = now()
   where r.id = p_request_id and r.status = 'pending'
   returning * into v_row;
  if v_row.id is null then raise exception 'request not found or not in a reviewable state'; end if;
  return v_row;
end; $$;

grant execute on function public.review_attendance_correction_request(uuid, text, text) to authenticated;

-- ── PART C: Leave correction / amendment requests ────────────────────────────
create table if not exists public.employee_leave_correction_requests (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.employee_leave_requests(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  company_id uuid,
  correction_type text not null,
  requested_start_date date,
  requested_end_date date,
  requested_leave_type text,
  requested_partial_day boolean,
  requested_duration_hours numeric,
  correction_reason text not null,
  status text not null default 'pending',
  manager_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='leave_corr_type_chk') then
    alter table public.employee_leave_correction_requests add constraint leave_corr_type_chk
      check (correction_type in ('change_dates','change_leave_type','change_duration',
                                 'withdraw_approved_leave','extend_leave','correct_reason','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname='leave_corr_status_chk') then
    alter table public.employee_leave_correction_requests add constraint leave_corr_status_chk
      check (status in ('pending','approved','rejected','cancelled'));
  end if;
end $$;

create index if not exists idx_leave_corr_member on public.employee_leave_correction_requests (team_member_id);
create index if not exists idx_leave_corr_parent on public.employee_leave_correction_requests (leave_request_id);
create index if not exists idx_leave_corr_status on public.employee_leave_correction_requests (status);

alter table public.employee_leave_correction_requests enable row level security;

drop policy if exists leave_corr_admin_all on public.employee_leave_correction_requests;
create policy leave_corr_admin_all on public.employee_leave_correction_requests
  for all to authenticated
  using (exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')))
  with check (exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')));

drop policy if exists leave_corr_self_read on public.employee_leave_correction_requests;
create policy leave_corr_self_read on public.employee_leave_correction_requests
  for select to authenticated
  using (team_member_id in (select tm.id from public.team_members tm where tm.user_id = auth.uid()));

create or replace function public.leave_corr_set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists leave_corr_set_updated_at on public.employee_leave_correction_requests;
create trigger leave_corr_set_updated_at before update on public.employee_leave_correction_requests
  for each row execute function public.leave_corr_set_updated_at();

-- Employee submits a correction/amendment for one of their OWN leave requests.
create or replace function public.submit_my_leave_correction_request(
  p_leave_request_id uuid,
  p_correction_type text,
  p_correction_reason text,
  p_requested_start_date date default null,
  p_requested_end_date date default null,
  p_requested_leave_type text default null,
  p_requested_partial_day boolean default null,
  p_requested_duration_hours numeric default null
)
returns public.employee_leave_correction_requests
language plpgsql security definer set search_path = public
as $$
declare v_tm uuid; v_owns boolean; v_row public.employee_leave_correction_requests;
begin
  if p_correction_type not in ('change_dates','change_leave_type','change_duration',
                               'withdraw_approved_leave','extend_leave','correct_reason','other') then
    raise exception 'invalid correction type: %', p_correction_type;
  end if;
  if coalesce(btrim(p_correction_reason),'') = '' then raise exception 'correction reason is required'; end if;
  if p_requested_leave_type is not null and p_requested_leave_type not in
     ('casual','sick','emergency','unpaid','half_day','annual','work_from_home','other') then
    raise exception 'invalid requested leave type: %', p_requested_leave_type;
  end if;

  select tm.id into v_tm from public.team_members tm
   where tm.user_id = auth.uid() and tm.is_active is true limit 1;
  if v_tm is null then raise exception 'no active employee profile for current user'; end if;

  -- The parent leave request must belong to the caller.
  select exists(select 1 from public.employee_leave_requests l
                 where l.id = p_leave_request_id and l.team_member_id = v_tm) into v_owns;
  if not v_owns then raise exception 'leave request not found or not yours'; end if;

  insert into public.employee_leave_correction_requests (
    leave_request_id, team_member_id, correction_type, requested_start_date, requested_end_date,
    requested_leave_type, requested_partial_day, requested_duration_hours, correction_reason, status
  ) values (
    p_leave_request_id, v_tm, p_correction_type, p_requested_start_date, p_requested_end_date,
    p_requested_leave_type, p_requested_partial_day, p_requested_duration_hours, p_correction_reason, 'pending'
  ) returning * into v_row;
  return v_row;
end; $$;

grant execute on function public.submit_my_leave_correction_request(uuid, text, text, date, date, text, boolean, numeric) to authenticated;

-- Employee cancels their OWN pending leave correction.
create or replace function public.cancel_my_leave_correction_request(p_request_id uuid, p_reason text default null)
returns public.employee_leave_correction_requests
language plpgsql security definer set search_path = public
as $$
declare v_row public.employee_leave_correction_requests;
begin
  update public.employee_leave_correction_requests r
     set status = 'cancelled', cancelled_at = now(), cancelled_reason = p_reason
   where r.id = p_request_id and r.status = 'pending'
     and r.team_member_id in (select tm.id from public.team_members tm where tm.user_id = auth.uid())
   returning * into v_row;
  if v_row.id is null then raise exception 'request not found, not yours, or no longer cancellable'; end if;
  return v_row;
end; $$;

grant execute on function public.cancel_my_leave_correction_request(uuid, text) to authenticated;

-- Admin reviews a leave correction (approve/reject). Decision record only — does
-- NOT mutate the original employee_leave_requests row (original history preserved).
create or replace function public.review_leave_correction_request(
  p_request_id uuid, p_decision text, p_manager_note text default null
)
returns public.employee_leave_correction_requests
language plpgsql security definer set search_path = public
as $$
declare v_row public.employee_leave_correction_requests;
begin
  if not exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')) then
    raise exception 'not authorized to review leave corrections';
  end if;
  if p_decision not in ('approved','rejected') then raise exception 'decision must be approved or rejected'; end if;

  update public.employee_leave_correction_requests r
     set status = p_decision, manager_note = p_manager_note, reviewed_by = auth.uid(), reviewed_at = now()
   where r.id = p_request_id and r.status = 'pending'
   returning * into v_row;
  if v_row.id is null then raise exception 'request not found or not in a reviewable state'; end if;
  return v_row;
end; $$;

grant execute on function public.review_leave_correction_request(uuid, text, text) to authenticated;
