-- Employee Master / HR Profile foundation.
-- Non-sensitive HR fields live on team_members (self-readable via existing
-- team_members_self_read). Sensitive financial/notes fields live in a separate
-- admin-only table employee_hr_private so employees can NEVER read them.
-- Additive + idempotent. Providers/customers untouched. No RBAC rewrite.
-- Applied to TEST (opudhofjbydrljgleofq) via Supabase MCP on 2026-06-01.

-- 1) Non-sensitive HR fields on team_members (employee may see their OWN row).
alter table public.team_members add column if not exists personal_email text;
alter table public.team_members add column if not exists phone text;
alter table public.team_members add column if not exists emergency_contact_name text;
alter table public.team_members add column if not exists emergency_contact_phone text;
alter table public.team_members add column if not exists date_of_birth date;
alter table public.team_members add column if not exists joining_date date;
alter table public.team_members add column if not exists employment_type text;
alter table public.team_members add column if not exists employment_status text not null default 'active';
alter table public.team_members add column if not exists address text;
-- Forward-compatible tenant column (nullable, no FK yet) per multi-brand blueprint.
alter table public.team_members add column if not exists company_id uuid;

-- Safe value constraints (idempotent).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'team_members_employment_type_chk') then
    alter table public.team_members add constraint team_members_employment_type_chk
      check (employment_type is null or employment_type in
             ('full_time','part_time','contractor','intern','temporary'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'team_members_employment_status_chk') then
    alter table public.team_members add constraint team_members_employment_status_chk
      check (employment_status in ('active','inactive','terminated','on_leave'));
  end if;
end $$;

-- Helpful indexes (employee_code already unique; these aid search/filter).
create index if not exists idx_team_members_workspace_email on public.team_members (workspace_email);
create index if not exists idx_team_members_employment_status on public.team_members (employment_status);
create index if not exists idx_team_members_department on public.team_members (department);

-- 2) Sensitive HR/payroll master data — admin-only, NO self-read.
create table if not exists public.employee_hr_private (
  team_member_id uuid primary key references public.team_members(id) on delete cascade,
  base_salary numeric(14,2),
  salary_currency text not null default 'PKR',
  payment_method text,
  payroll_notes text,
  hr_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.employee_hr_private enable row level security;

-- Owner / admin_manager (with is_admin) only — read + write. No employee self policy.
drop policy if exists ehp_admin_all on public.employee_hr_private;
create policy ehp_admin_all on public.employee_hr_private
  for all to authenticated
  using (
    exists (select 1 from public.doctor_profiles dp
            where dp.user_id = auth.uid()
              and dp.is_admin = true
              and coalesce(dp.role,'') in ('owner','admin_manager'))
  )
  with check (
    exists (select 1 from public.doctor_profiles dp
            where dp.user_id = auth.uid()
              and dp.is_admin = true
              and coalesce(dp.role,'') in ('owner','admin_manager'))
  );

-- updated_at trigger.
create or replace function public.employee_hr_private_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists ehp_set_updated_at on public.employee_hr_private;
create trigger ehp_set_updated_at
  before update on public.employee_hr_private
  for each row execute function public.employee_hr_private_set_updated_at();
