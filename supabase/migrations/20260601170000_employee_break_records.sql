-- Company OS — Employee Break / Lunch / Away tracking (true break timer).
-- Employees start/end their own breaks (SECURITY DEFINER RPCs); admin reads all.
-- Additive + idempotent. Employees only (team_members); providers/customers
-- excluded. NOT linked to payroll. Does NOT modify Time In/Out durations.
-- Applied to TEST (opudhofjbydrljgleofq) via Supabase MCP on 2026-06-01.

-- 1) Table
create table if not exists public.employee_break_records (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  company_id uuid,                                   -- future-ready, nullable, no FK
  time_clock_entry_id uuid references public.time_clock_entries(id) on delete set null,
  break_type text not null default 'break',
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- Stored generated duration (seconds). Only references row columns, so STORED is valid.
  duration_seconds integer generated always as (
    case when ended_at is not null
      then greatest(0, floor(extract(epoch from (ended_at - started_at)))::int)
      else null end
  ) stored,
  employee_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='employee_break_type_chk') then
    alter table public.employee_break_records add constraint employee_break_type_chk
      check (break_type in ('break','lunch','washroom','away','meeting','prayer','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname='employee_break_status_chk') then
    alter table public.employee_break_records add constraint employee_break_status_chk
      check (status in ('active','completed','cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname='employee_break_ended_chk') then
    alter table public.employee_break_records add constraint employee_break_ended_chk
      check (ended_at is null or ended_at >= started_at);
  end if;
end $$;

create index if not exists idx_employee_break_member on public.employee_break_records (team_member_id);
create index if not exists idx_employee_break_started on public.employee_break_records (started_at);
create index if not exists idx_employee_break_status on public.employee_break_records (status);
-- Only ONE active break per employee at a time.
create unique index if not exists uq_employee_break_one_active
  on public.employee_break_records (team_member_id) where status = 'active';

alter table public.employee_break_records enable row level security;

-- Admin (owner/admin_manager + is_admin): full read + manage of all break records.
drop policy if exists ebreak_admin_all on public.employee_break_records;
create policy ebreak_admin_all on public.employee_break_records
  for all to authenticated
  using (exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')))
  with check (exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')));

-- Employee: read ONLY their own break records.
drop policy if exists ebreak_self_read on public.employee_break_records;
create policy ebreak_self_read on public.employee_break_records
  for select to authenticated
  using (
    team_member_id in (select tm.id from public.team_members tm where tm.user_id = auth.uid())
  );

-- NOTE: employees have NO direct INSERT/UPDATE/DELETE policy. All employee writes
-- go through the SECURITY DEFINER RPCs below.

create or replace function public.employee_break_set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists ebreak_set_updated_at on public.employee_break_records;
create trigger ebreak_set_updated_at before update on public.employee_break_records
  for each row execute function public.employee_break_set_updated_at();

-- Helper: map a break_type to an employee_presence status value.
create or replace function public.break_type_to_presence(p_break_type text)
returns text language sql immutable as $$
  select case p_break_type
    when 'lunch' then 'lunch'
    when 'washroom' then 'washroom'
    when 'break' then 'break'
    else 'away'              -- away, meeting, prayer, other
  end;
$$;

-- 2) Start a break — employee must be clocked in; only one active break allowed.
create or replace function public.start_my_break(
  p_break_type text,
  p_employee_note text default null
)
returns public.employee_break_records
language plpgsql security definer set search_path = public
as $$
declare
  v_tm uuid;
  v_entry uuid;
  v_row public.employee_break_records;
begin
  if p_break_type is null or p_break_type not in
     ('break','lunch','washroom','away','meeting','prayer','other') then
    raise exception 'invalid break type: %', p_break_type;
  end if;

  select tm.id into v_tm
    from public.team_members tm
   where tm.user_id = auth.uid() and tm.is_active is true
   limit 1;
  if v_tm is null then
    raise exception 'no active employee profile for current user';
  end if;

  -- Must have an open clock entry to take a break.
  select id into v_entry
    from public.time_clock_entries
   where team_member_id = v_tm and clock_out_at is null
   limit 1;
  if v_entry is null then
    raise exception 'you must be clocked in to start a break';
  end if;

  -- Block a second active break (also enforced by the partial unique index).
  if exists (select 1 from public.employee_break_records
              where team_member_id = v_tm and status = 'active') then
    raise exception 'you already have an active break';
  end if;

  insert into public.employee_break_records (
    team_member_id, time_clock_entry_id, break_type, status, started_at, employee_note
  ) values (
    v_tm, v_entry, p_break_type, 'active', now(), p_employee_note
  )
  returning * into v_row;

  -- Reflect the break in presence (best-effort; do not fail the break on this).
  begin
    insert into public.employee_presence (team_member_id, status, away_reason, updated_at, updated_by)
    values (v_tm, public.break_type_to_presence(p_break_type), p_break_type, now(), auth.uid())
    on conflict (team_member_id)
    do update set status = excluded.status,
                 away_reason = excluded.away_reason,
                 updated_at = now(),
                 updated_by = auth.uid();
  exception when others then
    null;
  end;

  return v_row;
end; $$;

grant execute on function public.start_my_break(text, text) to authenticated;

-- 3) End the caller's active break. Restores presence to 'available'.
create or replace function public.end_my_break()
returns public.employee_break_records
language plpgsql security definer set search_path = public
as $$
declare
  v_tm uuid;
  v_row public.employee_break_records;
begin
  select tm.id into v_tm
    from public.team_members tm
   where tm.user_id = auth.uid() and tm.is_active is true
   limit 1;
  if v_tm is null then
    raise exception 'no active employee profile for current user';
  end if;

  update public.employee_break_records r
     set status = 'completed', ended_at = now()
   where r.team_member_id = v_tm and r.status = 'active'
   returning * into v_row;
  if v_row.id is null then
    raise exception 'no active break to end';
  end if;

  -- Restore presence to available (best-effort).
  begin
    insert into public.employee_presence (team_member_id, status, away_reason, updated_at, updated_by)
    values (v_tm, 'available', null, now(), auth.uid())
    on conflict (team_member_id)
    do update set status = 'available', away_reason = null, updated_at = now(), updated_by = auth.uid();
  exception when others then
    null;
  end;

  return v_row;
end; $$;

grant execute on function public.end_my_break() to authenticated;

-- 4) Cancel the caller's own active break (discard it). Restores presence.
create or replace function public.cancel_my_break(p_record_id uuid)
returns public.employee_break_records
language plpgsql security definer set search_path = public
as $$
declare
  v_tm uuid;
  v_row public.employee_break_records;
begin
  select tm.id into v_tm
    from public.team_members tm
   where tm.user_id = auth.uid() and tm.is_active is true
   limit 1;
  if v_tm is null then
    raise exception 'no active employee profile for current user';
  end if;

  update public.employee_break_records r
     set status = 'cancelled', ended_at = now()
   where r.id = p_record_id and r.team_member_id = v_tm and r.status = 'active'
   returning * into v_row;
  if v_row.id is null then
    raise exception 'active break not found or not yours';
  end if;

  begin
    insert into public.employee_presence (team_member_id, status, away_reason, updated_at, updated_by)
    values (v_tm, 'available', null, now(), auth.uid())
    on conflict (team_member_id)
    do update set status = 'available', away_reason = null, updated_at = now(), updated_by = auth.uid();
  exception when others then
    null;
  end;

  return v_row;
end; $$;

grant execute on function public.cancel_my_break(uuid) to authenticated;

-- 5) Extend clock-out to safely auto-complete any active break for the caller.
--    Identical to the prior definition plus one additive UPDATE before closing the
--    entry; return type/behavior (returns the closed entry id) is unchanged.
create or replace function public.clock_out_for_current_user()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid             uuid := auth.uid();
  v_team_member_id  uuid;
  v_closed_id       uuid;
begin
  if v_uid is null then
    raise exception 'clock_out_for_current_user: not authenticated';
  end if;

  select id into v_team_member_id
    from public.team_members
   where user_id = v_uid
   limit 1;

  if v_team_member_id is null then
    raise exception 'clock_out_for_current_user: no team_members row for caller';
  end if;

  -- Safely close any active break so a clock-out never leaves a dangling break.
  update public.employee_break_records
     set status = 'completed', ended_at = now()
   where team_member_id = v_team_member_id and status = 'active';

  update public.time_clock_entries
     set clock_out_at = now()
   where team_member_id = v_team_member_id
     and clock_out_at is null
   returning id into v_closed_id;

  return v_closed_id;
end;
$$;
