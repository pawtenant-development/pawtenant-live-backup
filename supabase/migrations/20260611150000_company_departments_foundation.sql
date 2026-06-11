-- TEST-COMPANY-OS-SAAS-ORG-STRUCTURE — Phase 1: department access foundation.
--
-- Many-to-many department/domain assignment model:
--   • company_departments            — master list of departments/domains (+ optional sub-domains via parent_department_id)
--   • team_member_department_roles   — one row per (employee × department) with a department-scoped role level
--                                      and delegation flags (people / permissions / salary / bonus request / bonus approve)
--   • team_members.primary_department_id — display/default department; legacy team_members.department text stays untouched
--
-- Role hierarchy: Global Owner (doctor_profiles.role='owner', NOT a per-department level)
--   → domain_owner → sub_domain_owner → team_coordinator → user (+ viewer / approver helper levels).
--
-- Safety:
--   • Additive + idempotent. No existing table/policy modified, no rows deleted.
--   • Every write gate falls back to is_chat_admin() (owner/admin_manager) — the owner can never be locked out.
--   • Backfill maps existing free-text departments; owners get an Executive domain_owner assignment automatically.
-- TEST (opudhofjbydrljgleofq) only.

-- ── 1. Department master ────────────────────────────────────────────────────
create table if not exists public.company_departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  parent_department_id uuid references public.company_departments(id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  company_id uuid, -- multi-brand convention: nullable, no FK until the companies keystone lands
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 2. Many-to-many department role assignments ─────────────────────────────
create table if not exists public.team_member_department_roles (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  department_id uuid not null references public.company_departments(id) on delete cascade,
  role_level text not null default 'user',
  sub_domain text,
  permission_bundle text,
  permission_addons text[],
  permission_removed text[],
  can_manage_people boolean not null default false,
  can_manage_permissions boolean not null default false,
  can_view_salary boolean not null default false,
  can_request_bonus boolean not null default false,
  can_approve_bonus boolean not null default false,
  starts_at date not null default current_date,
  ends_at date,
  is_active boolean not null default true,
  assigned_by uuid, -- auth.users id of the assigner
  company_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tmdr_role_level_chk check (
    role_level in ('domain_owner','sub_domain_owner','team_coordinator','user','viewer','approver')
  ),
  constraint tmdr_dates_chk check (ends_at is null or ends_at >= starts_at)
);

-- One ACTIVE assignment per employee per department (history rows keep is_active=false).
create unique index if not exists tmdr_active_unique
  on public.team_member_department_roles (team_member_id, department_id)
  where is_active;
create index if not exists tmdr_department_idx on public.team_member_department_roles (department_id) ;
create index if not exists tmdr_member_idx on public.team_member_department_roles (team_member_id);

-- ── 3. Primary department pointer on team_members ───────────────────────────
alter table public.team_members
  add column if not exists primary_department_id uuid references public.company_departments(id) on delete set null;

-- ── 4. Helper functions ──────────────────────────────────────────────────────
create or replace function public.current_team_member_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.team_members where user_id = auth.uid() limit 1;
$$;

create or replace function public.is_company_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.doctor_profiles dp
    where dp.user_id = auth.uid()
      and dp.is_admin = true and dp.is_active = true
      and coalesce(dp.role,'') = 'owner'
  );
$$;

-- Caller manages this department: global admin (owner/admin_manager) OR an active
-- domain_owner / sub_domain_owner assignment in it.
create or replace function public.is_department_manager(p_department_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_chat_admin() or exists (
    select 1 from public.team_member_department_roles r
    where r.department_id = p_department_id
      and r.team_member_id = public.current_team_member_id()
      and r.is_active
      and (r.ends_at is null or r.ends_at >= current_date)
      and r.role_level in ('domain_owner','sub_domain_owner')
  );
$$;

-- Caller holds a delegation flag in this department (global admins always pass).
create or replace function public.has_department_flag(p_department_id uuid, p_flag text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_chat_admin() or exists (
    select 1 from public.team_member_department_roles r
    where r.department_id = p_department_id
      and r.team_member_id = public.current_team_member_id()
      and r.is_active
      and (r.ends_at is null or r.ends_at >= current_date)
      and case p_flag
            when 'manage_people'      then r.can_manage_people
            when 'manage_permissions' then r.can_manage_permissions
            when 'view_salary'        then r.can_view_salary
            when 'request_bonus'      then r.can_request_bonus
            when 'approve_bonus'      then r.can_approve_bonus
            else false
          end
  );
$$;

grant execute on function public.current_team_member_id() to authenticated;
grant execute on function public.is_company_owner() to authenticated;
grant execute on function public.is_department_manager(uuid) to authenticated;
grant execute on function public.has_department_flag(uuid, text) to authenticated;
revoke execute on function public.current_team_member_id() from public, anon;
revoke execute on function public.is_company_owner() from public, anon;
revoke execute on function public.is_department_manager(uuid) from public, anon;
revoke execute on function public.has_department_flag(uuid, text) from public, anon;

-- ── 5. updated_at trigger ────────────────────────────────────────────────────
create or replace function public.company_os_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists company_departments_updated_at on public.company_departments;
create trigger company_departments_updated_at
  before update on public.company_departments
  for each row execute function public.company_os_set_updated_at();

drop trigger if exists tmdr_updated_at on public.team_member_department_roles;
create trigger tmdr_updated_at
  before update on public.team_member_department_roles
  for each row execute function public.company_os_set_updated_at();

-- ── 6. RLS ───────────────────────────────────────────────────────────────────
alter table public.company_departments enable row level security;
alter table public.team_member_department_roles enable row level security;

-- Departments: every signed-in employee may read the org chart; only
-- owner/admin_manager may create/edit/deactivate departments.
drop policy if exists company_departments_select on public.company_departments;
create policy company_departments_select on public.company_departments
  for select to authenticated
  using (public.is_chat_admin() or public.current_team_member_id() is not null);

drop policy if exists company_departments_admin_write on public.company_departments;
create policy company_departments_admin_write on public.company_departments
  for all to authenticated
  using (public.is_chat_admin())
  with check (public.is_chat_admin());

-- Assignments: employees see their own; department managers see their department's;
-- global admins see all.
drop policy if exists tmdr_select on public.team_member_department_roles;
create policy tmdr_select on public.team_member_department_roles
  for select to authenticated
  using (
    public.is_chat_admin()
    or team_member_id = public.current_team_member_id()
    or public.is_department_manager(department_id)
  );

-- Writes: global admins always; department managers with can_manage_people may
-- assign/edit within their department, but may NOT mint domain_owner rows and may
-- NOT grant can_manage_permissions unless they hold it themselves (delegation limit).
drop policy if exists tmdr_insert on public.team_member_department_roles;
create policy tmdr_insert on public.team_member_department_roles
  for insert to authenticated
  with check (
    public.is_chat_admin()
    or (
      public.has_department_flag(department_id, 'manage_people')
      and role_level <> 'domain_owner'
      and (not can_manage_permissions or public.has_department_flag(department_id, 'manage_permissions'))
    )
  );

drop policy if exists tmdr_update on public.team_member_department_roles;
create policy tmdr_update on public.team_member_department_roles
  for update to authenticated
  using (
    public.is_chat_admin()
    or (public.has_department_flag(department_id, 'manage_people') and role_level <> 'domain_owner')
  )
  with check (
    public.is_chat_admin()
    or (
      public.has_department_flag(department_id, 'manage_people')
      and role_level <> 'domain_owner'
      and (not can_manage_permissions or public.has_department_flag(department_id, 'manage_permissions'))
    )
  );

drop policy if exists tmdr_delete on public.team_member_department_roles;
create policy tmdr_delete on public.team_member_department_roles
  for delete to authenticated
  using (public.is_chat_admin());

-- ── 7. Seed default departments ──────────────────────────────────────────────
insert into public.company_departments (code, name, description, sort_order) values
  ('executive',           'Executive',            'Owner / executive leadership',                       10),
  ('hr',                  'HR',                   'People operations, onboarding, policies',            20),
  ('finance',             'Finance / Accounts',   'Payroll, expenses, books, payouts',                  30),
  ('operations',          'Operations',           'Day-to-day business operations',                     40),
  ('customer_support',    'Customer Support',     'Customer chats, contacts, order support',            50),
  ('provider_management', 'Provider Management',  'Provider recruitment, onboarding, payouts',          60),
  ('marketing',           'Marketing',            'Paid ads, campaigns, attribution',                   70),
  ('sales',               'Sales',                'Lead follow-up and conversion',                      80),
  ('technology',          'Technology / Admin',   'Platform, tooling, system administration',           90),
  ('compliance',          'Compliance',           'Legal, regulatory, document compliance',            100),
  ('communications',      'Communications',       'Email/SMS templates, broadcasts, sequences',        110),
  ('analytics',           'Analytics',            'Reporting, dashboards, data quality',               120),
  ('content_seo',         'Content / SEO',        'Public site content, SEO, AI answer pages',         130),
  ('fulfillment',         'Fulfillment / Orders', 'Order processing, letters, delivery',               140)
on conflict (code) do nothing;

-- ── 8. Backfill existing employees ───────────────────────────────────────────
-- 8a. Map legacy free-text team_members.department → primary_department_id.
update public.team_members tm
set primary_department_id = d.id
from public.company_departments d
where tm.primary_department_id is null
  and (
    (lower(coalesce(tm.department,'')) in ('support','customer support') and d.code = 'customer_support')
    or lower(coalesce(tm.department,'')) = lower(d.name)
    or lower(coalesce(tm.department,'')) = d.code
  );

-- 8b. Global owners → Executive domain_owner with full delegation flags.
insert into public.team_member_department_roles
  (team_member_id, department_id, role_level,
   can_manage_people, can_manage_permissions, can_view_salary, can_request_bonus, can_approve_bonus)
select tm.id, d.id, 'domain_owner', true, true, true, true, true
from public.team_members tm
join public.doctor_profiles dp on dp.user_id = tm.user_id and coalesce(dp.role,'') = 'owner'
cross join public.company_departments d
where d.code = 'executive'
  and not exists (
    select 1 from public.team_member_department_roles r
    where r.team_member_id = tm.id and r.department_id = d.id and r.is_active
  );

-- 8c. Everyone else with a mapped primary department → 'user' assignment there.
insert into public.team_member_department_roles (team_member_id, department_id, role_level)
select tm.id, tm.primary_department_id, 'user'
from public.team_members tm
where tm.primary_department_id is not null
  and not exists (
    select 1 from public.team_member_department_roles r
    where r.team_member_id = tm.id and r.department_id = tm.primary_department_id and r.is_active
  );
