-- Employee presence (away/break overlay) for Company OS.
-- Promoted to LIVE from TEST (COMPANY-OS-PRESENCE-BUNDLE-LIVE-PROMOTION, Phase 1).
-- Renamed from TEST's 20260530190000_employee_presence.sql to a unique later
-- timestamp because LIVE already used 20260530190000 for
-- fix_live_employee_code_ordering.sql. Content is unchanged + idempotent.
--
-- Lightweight, additive. Green/orange/red is COMPUTED:
--   red    = no open time_clock_entry (signed out / not timed in)
--   orange = clocked in AND away/break/lunch/washroom
--   green  = clocked in AND available
-- Providers are NOT included unless they are also team_members (employees).
-- Safe to re-run (idempotent).

create table if not exists public.employee_presence (
  team_member_id uuid primary key references public.team_members(id) on delete cascade,
  status text not null default 'available'
    check (status in ('available','away','break','lunch','washroom')),
  away_reason text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.employee_presence enable row level security;

-- A team member can read their own presence row.
drop policy if exists ep_self_read on public.employee_presence;
create policy ep_self_read on public.employee_presence
  for select to authenticated
  using (
    team_member_id in (select tm.id from public.team_members tm where tm.user_id = auth.uid())
  );

-- Admins / owners can read all presence rows.
drop policy if exists ep_admin_read on public.employee_presence;
create policy ep_admin_read on public.employee_presence
  for select to authenticated
  using (
    exists (
      select 1 from public.doctor_profiles dp
      where dp.user_id = auth.uid()
        and (dp.is_admin is true or coalesce(dp.role,'') in ('owner','admin_manager'))
    )
  );

-- A team member can only write their OWN presence row (no editing others).
drop policy if exists ep_self_write on public.employee_presence;
create policy ep_self_write on public.employee_presence
  for all to authenticated
  using (
    team_member_id in (select tm.id from public.team_members tm where tm.user_id = auth.uid())
  )
  with check (
    team_member_id in (select tm.id from public.team_members tm where tm.user_id = auth.uid())
  );

-- ── RPC: current user sets their own away/available status ──
create or replace function public.set_my_presence(p_status text, p_reason text default null)
returns public.employee_presence
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tm uuid;
  v_row public.employee_presence;
begin
  if p_status is null or p_status not in ('available','away','break','lunch','washroom') then
    raise exception 'invalid presence status: %', p_status;
  end if;

  select tm.id into v_tm
  from public.team_members tm
  where tm.user_id = auth.uid() and tm.is_active is true
  limit 1;

  if v_tm is null then
    raise exception 'no active team member for current user';
  end if;

  insert into public.employee_presence (team_member_id, status, away_reason, updated_at, updated_by)
  values (v_tm, p_status, p_reason, now(), auth.uid())
  on conflict (team_member_id)
  do update set status = excluded.status,
               away_reason = excluded.away_reason,
               updated_at = now(),
               updated_by = auth.uid()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.set_my_presence(text, text) to authenticated;

-- ── RPC: roster with computed presence (admins + any active team member) ──
create or replace function public.get_team_presence()
returns table (
  team_member_id uuid,
  display_name text,
  employee_code text,
  is_clocked_in boolean,
  away_status text,
  away_reason text,
  presence text,
  status_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.team_members tm
    where tm.user_id = auth.uid() and tm.is_active is true
  ) and not exists (
    select 1 from public.doctor_profiles dp
    where dp.user_id = auth.uid()
      and (dp.is_admin is true or coalesce(dp.role,'') in ('owner','admin_manager'))
  ) then
    raise exception 'not authorized';
  end if;

  return query
  select
    tm.id,
    tm.display_name,
    tm.employee_code,
    (coalesce(oc.open_count,0) > 0) as is_clocked_in,
    coalesce(ep.status, 'available') as away_status,
    ep.away_reason,
    case
      when coalesce(oc.open_count,0) = 0 then 'red'
      when coalesce(ep.status,'available') <> 'available' then 'orange'
      else 'green'
    end as presence,
    ep.updated_at
  from public.team_members tm
  left join public.employee_presence ep on ep.team_member_id = tm.id
  left join lateral (
    select count(*) as open_count
    from public.time_clock_entries tce
    where tce.team_member_id = tm.id and tce.clock_out_at is null
  ) oc on true
  where tm.is_active is true
  order by
    case
      when coalesce(oc.open_count,0) = 0 then 2
      when coalesce(ep.status,'available') <> 'available' then 1
      else 0
    end,
    tm.display_name;
end;
$$;

grant execute on function public.get_team_presence() to authenticated;
