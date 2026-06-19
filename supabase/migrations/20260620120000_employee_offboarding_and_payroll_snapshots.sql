-- Employee Offboarding / Archive + Monthly Payroll Snapshots — TEST
-- ---------------------------------------------------------------------------
-- Problem this fixes:
--   "Deleting" a team member from Roles & Access only removed their
--   doctor_profiles (staff login) row — their team_members (employee master)
--   row stayed active, so they kept appearing in HR → Employees & Departments
--   and in the live payroll calculation, and their /company portal login was
--   never locked.
--
-- This migration adds a safe, reversible, audit-logged OFFBOARDING flow:
--   • soft-deactivation fields on team_members (no row is ever deleted),
--   • offboard_employee()/reactivate_employee() RPCs (owner-protected, audited),
--   • current_team_member_id() now excludes offboarded/inactive members, so the
--     employee self-service portal + self RPCs return nothing for them
--     (app-side login lock — the Supabase auth user is preserved, never banned),
--   • employee_monthly_payroll_snapshots so past months' payroll survives an
--     employee being offboarded (the live payroll RPC recomputes with CURRENT
--     status, which would otherwise show an offboarded person as "excluded $0"
--     for months they were actually paid).
--
-- Safety: fully additive. No existing row is deleted. No existing function's
-- behaviour changes except current_team_member_id() (which now correctly
-- excludes offboarded/inactive members — active members are unaffected).
-- SQL is idempotent (IF NOT EXISTS / CREATE OR REPLACE / guarded DO blocks).

-- ── 1. Soft-deactivation / offboarding metadata on team_members ─────────────
alter table public.team_members
  add column if not exists offboarded_at      timestamptz,
  add column if not exists offboarded_by      uuid,
  add column if not exists offboarding_reason text,
  add column if not exists login_locked_at    timestamptz,
  add column if not exists login_locked_by    uuid,
  add column if not exists archived_at        timestamptz,
  add column if not exists archived_by        uuid;

comment on column public.team_members.offboarded_at is
  'When the employee was offboarded/archived (soft). NULL = active. Set by offboard_employee().';
comment on column public.team_members.login_locked_at is
  'When app-side login access was locked (offboarding). Auth user is preserved — not deleted/banned.';

-- Allow employment_status = ''offboarded'' (the payroll RPCs already exclude it,
-- but the CHECK constraint previously blocked the value from ever being set).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'team_members_employment_status_chk'
      and conrelid = 'public.team_members'::regclass
  ) then
    alter table public.team_members drop constraint team_members_employment_status_chk;
  end if;
  alter table public.team_members
    add constraint team_members_employment_status_chk
    check (employment_status = any (array[
      'active','inactive','terminated','on_leave','offboarded'
    ]));
end $$;

-- ── 2. App-side login lock at the data layer ────────────────────────────────
-- current_team_member_id() backs every employee SELF read (salary snapshot,
-- compensation, attendance, portal data). Returning NULL for an offboarded /
-- inactive member means their /company portal + self RPCs return nothing.
-- Active members are unaffected. SECURITY DEFINER + stable preserved.
create or replace function public.current_team_member_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select id
  from public.team_members
  where user_id = auth.uid()
    and coalesce(is_active, true) = true
    and coalesce(employment_status, 'active') not in
      ('offboarded','terminated','resigned','inactive','suspended','deleted')
  limit 1;
$fn$;

-- ── 3. Offboard / Archive an employee (safe, reversible, audited) ───────────
-- Authorization: owner / admin_manager (is_chat_admin). Finance / support cannot
-- offboard. The owner account can NEVER be offboarded. Idempotent: a member who
-- is already offboarded raises a clear error (cannot archive twice).
create or replace function public.offboard_employee(
  p_team_member_id uuid,
  p_reason         text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_tm        public.team_members%rowtype;
  v_is_owner  boolean;
begin
  if not public.is_chat_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_tm from public.team_members where id = p_team_member_id;
  if not found then
    raise exception 'Employee not found.';
  end if;

  -- Owner protection — owner is identified by domain_role OR linked staff role.
  v_is_owner := coalesce(v_tm.domain_role, '') = 'owner'
    or exists (
      select 1 from public.doctor_profiles dp
      where dp.user_id = v_tm.user_id and coalesce(dp.role, '') = 'owner'
    );
  if v_is_owner then
    raise exception 'The owner account cannot be offboarded.';
  end if;

  -- Already archived → block (cannot archive twice).
  if coalesce(v_tm.employment_status, '') = 'offboarded' or v_tm.archived_at is not null then
    raise exception 'This employee is already offboarded/archived.';
  end if;

  update public.team_members set
    employment_status  = 'offboarded',
    is_active          = false,
    offboarded_at      = now(),
    offboarded_by      = auth.uid(),
    offboarding_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    login_locked_at    = now(),
    login_locked_by    = auth.uid(),
    archived_at        = now(),
    archived_by        = auth.uid(),
    updated_at         = now()
  where id = p_team_member_id;

  -- Lock any linked staff/provider login too (doctor_profiles powers
  -- /admin-login + provider-portal via resolveStaffRole/is_active). Preserve the
  -- row for history; just deactivate it.
  if v_tm.user_id is not null then
    update public.doctor_profiles set is_active = false where user_id = v_tm.user_id;
  end if;

  insert into public.audit_logs
    (actor_id, actor_name, actor_role, object_type, object_id, action, description, old_values, new_values)
  values (
    auth.uid(), public.company_os_actor_name(), public.company_os_actor_role(),
    'staff', p_team_member_id::text, 'employee_offboarded',
    'Offboarded ' || coalesce(v_tm.display_name, 'employee')
      || ' (' || coalesce(v_tm.employee_code, '—') || ')',
    jsonb_build_object('employment_status', v_tm.employment_status, 'is_active', v_tm.is_active),
    jsonb_build_object('employment_status', 'offboarded', 'is_active', false,
      'login_locked', true, 'reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );

  return true;
end;
$fn$;

-- ── 4. Reactivate / Re-hire an offboarded employee (reversibility) ──────────
create or replace function public.reactivate_employee(
  p_team_member_id uuid
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_tm public.team_members%rowtype;
begin
  if not public.is_chat_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_tm from public.team_members where id = p_team_member_id;
  if not found then
    raise exception 'Employee not found.';
  end if;

  if coalesce(v_tm.employment_status, '') <> 'offboarded' and v_tm.archived_at is null then
    raise exception 'This employee is not offboarded.';
  end if;

  update public.team_members set
    employment_status  = 'active',
    is_active          = true,
    offboarded_at      = null,
    offboarded_by      = null,
    offboarding_reason = null,
    login_locked_at    = null,
    login_locked_by    = null,
    archived_at        = null,
    archived_by        = null,
    updated_at         = now()
  where id = p_team_member_id;

  if v_tm.user_id is not null then
    update public.doctor_profiles set is_active = true where user_id = v_tm.user_id;
  end if;

  insert into public.audit_logs
    (actor_id, actor_name, actor_role, object_type, object_id, action, description, old_values, new_values)
  values (
    auth.uid(), public.company_os_actor_name(), public.company_os_actor_role(),
    'staff', p_team_member_id::text, 'employee_reactivated',
    'Reactivated ' || coalesce(v_tm.display_name, 'employee')
      || ' (' || coalesce(v_tm.employee_code, '—') || ')',
    jsonb_build_object('employment_status', v_tm.employment_status, 'is_active', v_tm.is_active),
    jsonb_build_object('employment_status', 'active', 'is_active', true)
  );

  return true;
end;
$fn$;

-- Supabase default privileges grant EXECUTE to anon/authenticated at create
-- time; revoke from public AND anon so only signed-in admins can reach these.
revoke all on function public.offboard_employee(uuid, text)  from public, anon;
revoke all on function public.reactivate_employee(uuid)      from public, anon;
grant execute on function public.offboard_employee(uuid, text) to authenticated;
grant execute on function public.reactivate_employee(uuid)     to authenticated;

-- ── 5. Monthly payroll snapshots (per-employee, frozen history) ─────────────
-- One row per (employee_code, month). Captures the exact payable figures at the
-- time payroll was generated, so an offboarded employee's PAST months stay
-- correct even though the live RPC would now exclude them. Survives offboarding
-- (no FK cascade deletes it). Name/code/title are denormalised so the row stays
-- readable even if the profile later changes.
create table if not exists public.employee_monthly_payroll_snapshots (
  id                            uuid primary key default gen_random_uuid(),
  team_member_id                uuid references public.team_members(id) on delete set null,
  employee_code                 text not null,
  employee_name                 text,
  title                         text,
  department                    text,
  period_start                  date not null,
  period_end                    date not null,
  report_label                  text,
  base_salary                   numeric,
  salary_currency               text default 'PKR',
  working_days                  integer,
  present_days                  integer,
  absent_days                   integer,
  leave_days                    numeric,
  half_day_late_days            integer,
  attendance_deduction_amount   numeric,
  approved_additions            numeric,
  other_adjustments             numeric,
  approved_deductions           numeric,
  gross_payable                 numeric,
  net_payable                   numeric,
  net_payable_usd               numeric,
  fx_rate                       numeric,
  employment_status_at_period_end text,
  is_owner_excluded             boolean default false,
  snapshot_payload              jsonb,
  created_at                    timestamptz not null default now(),
  created_by                    uuid,
  unique (employee_code, period_start)
);

create index if not exists idx_emp_payroll_snap_period
  on public.employee_monthly_payroll_snapshots (period_start desc);
create index if not exists idx_emp_payroll_snap_tm
  on public.employee_monthly_payroll_snapshots (team_member_id);

alter table public.employee_monthly_payroll_snapshots enable row level security;

-- Read-only to accounts admins (owner/admin_manager/finance). Never to anon /
-- customer / provider. Writes happen ONLY through the SECURITY DEFINER snapshot
-- function below (and service role), so there are no insert/update/delete policies.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='employee_monthly_payroll_snapshots'
      and policyname='emp_payroll_snap_admin_read'
  ) then
    drop policy emp_payroll_snap_admin_read on public.employee_monthly_payroll_snapshots;
  end if;
  create policy emp_payroll_snap_admin_read
    on public.employee_monthly_payroll_snapshots
    for select to authenticated
    using (public.is_accounts_admin());
end $$;

-- ── 6. Generate/refresh a month's payroll snapshot ──────────────────────────
-- Reuses get_monthly_salary_payroll (the canonical per-employee payroll source
-- used by the monthly report) so snapshot figures tie out exactly. Idempotent:
-- re-running a month UPSERTs (no duplicates, no double-count). Only INCLUDED
-- (actually-payable, non-owner) employees are snapshotted. Returns rows written.
create or replace function public.snapshot_monthly_payroll(
  p_from  date,
  p_to    date,
  p_label text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_payroll jsonb;
  v_fx      numeric := 280.0;
  v_count   integer := 0;
begin
  -- Gate: service role (no JWT) OR accounts admin. Mirrors get_monthly_salary_payroll.
  if auth.uid() is not null and not public.is_accounts_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_payroll := public.get_monthly_salary_payroll(p_from, p_to);
  v_fx := coalesce((v_payroll #>> '{policy,fx_pkr_per_usd}')::numeric, 280.0);

  insert into public.employee_monthly_payroll_snapshots as s (
    team_member_id, employee_code, employee_name, title, department,
    period_start, period_end, report_label,
    base_salary, salary_currency, working_days, present_days, absent_days, leave_days,
    half_day_late_days, attendance_deduction_amount,
    approved_additions, other_adjustments, approved_deductions,
    gross_payable, net_payable, net_payable_usd, fx_rate,
    employment_status_at_period_end, is_owner_excluded, snapshot_payload, created_by
  )
  select
    tm.id,
    e->>'employee_code',
    e->>'employee_name',
    nullif(e->>'role',''),
    nullif(e->>'department',''),
    p_from, p_to, coalesce(p_label, to_char(p_from,'Mon YYYY')),
    nullif(e->>'base_salary','')::numeric,
    coalesce(nullif(e->>'currency',''),'PKR'),
    nullif(e->>'working_days','')::int,
    nullif(e->>'present_days','')::int,
    nullif(e->>'absent_days','')::int,
    nullif(e->>'leave_days','')::numeric,
    nullif(e->>'half_day_late_days','')::int,
    nullif(e->>'attendance_deduction','')::numeric,
    nullif(e->>'approved_additions','')::numeric,
    nullif(e->>'other_adjustments','')::numeric,
    nullif(e->>'approved_deductions','')::numeric,
    nullif(e->>'gross_payable','')::numeric,
    nullif(e->>'net_payable','')::numeric,
    nullif(e->>'net_payable_usd','')::numeric,
    v_fx,
    nullif(e->>'status',''),
    coalesce((e->>'owner_excluded')::boolean, false),
    e,
    auth.uid()
  from jsonb_array_elements(v_payroll->'employees') e
  left join public.team_members tm on tm.employee_code = e->>'employee_code'
  where coalesce((e->>'included')::boolean, false) = true
    and nullif(e->>'employee_code','') is not null
  on conflict (employee_code, period_start) do update set
    team_member_id              = excluded.team_member_id,
    employee_name               = excluded.employee_name,
    title                       = excluded.title,
    department                  = excluded.department,
    period_end                  = excluded.period_end,
    report_label                = excluded.report_label,
    base_salary                 = excluded.base_salary,
    salary_currency             = excluded.salary_currency,
    working_days                = excluded.working_days,
    present_days                = excluded.present_days,
    absent_days                 = excluded.absent_days,
    leave_days                  = excluded.leave_days,
    half_day_late_days          = excluded.half_day_late_days,
    attendance_deduction_amount = excluded.attendance_deduction_amount,
    approved_additions          = excluded.approved_additions,
    other_adjustments           = excluded.other_adjustments,
    approved_deductions         = excluded.approved_deductions,
    gross_payable               = excluded.gross_payable,
    net_payable                 = excluded.net_payable,
    net_payable_usd             = excluded.net_payable_usd,
    fx_rate                     = excluded.fx_rate,
    employment_status_at_period_end = excluded.employment_status_at_period_end,
    is_owner_excluded           = excluded.is_owner_excluded,
    snapshot_payload            = excluded.snapshot_payload,
    created_by                  = excluded.created_by;

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- anon must NOT reach this: its gate treats a NULL auth.uid() as service role.
revoke all on function public.snapshot_monthly_payroll(date, date, text) from public, anon;
grant execute on function public.snapshot_monthly_payroll(date, date, text) to authenticated, service_role;
