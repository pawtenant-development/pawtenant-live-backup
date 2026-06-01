-- Company expenses ledger for the admin Payments "Accounts" / management-P&L
-- tab. Internal management accounting only. Admin/finance gated. Additive +
-- idempotent. Applied to LIVE (cvwbozlbbmrjxznknouq).
--
-- LIVE SCOPE NOTE
-- ----------------------------------------------------------------------------
-- The TEST version of this migration also created an aggregate salary-expense
-- RPC (get_salary_expense_summary) that reads from `employee_hr_private` and
-- `team_members.domain_role`. Those Company OS HR objects do NOT exist in LIVE
-- yet (HR foundation is a separate, not-yet-mirrored phase), and the
-- owner-salary-exclusion logic lives in a later migration that is also out of
-- scope here. Creating the salary RPC now would (a) be dead/erroring code and
-- (b) compute an employee-salary figure WITHOUT the owner-exclusion guard,
-- which is explicitly disallowed. The salary RPC is therefore intentionally
-- omitted from LIVE. The Accounts panel degrades gracefully: the salary card is
-- hidden and the P&L still computes (companyExpenses.ts catches the missing
-- RPC and returns []). The salary RPCs ship with the future LIVE HR phase.

-- 1) Expense ledger ---------------------------------------------------------
create table if not exists public.company_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  brand text default 'pawtenant',
  expense_date date not null,
  category text not null check (category in (
    'employee_salary','provider_payout','marketing','google_ads','facebook_meta',
    'seo','subscription','software','utilities','rent_office','contractor',
    'refund_cost','bank_fee','tax','other'
  )),
  subcategory text,
  vendor text,
  description text,
  amount numeric(12,2) not null,
  currency text default 'USD',
  source text default 'manual' check (source in (
    'manual','employee_salary','provider_payout','google_ads','facebook_meta','analytics_import','system'
  )),
  status text default 'confirmed' check (status in ('confirmed','estimated','pending','cancelled')),
  recurring boolean default false,
  recurring_period text,
  related_team_member_id uuid references public.team_members(id),
  related_order_id uuid,
  related_provider_id uuid,
  external_reference text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_expenses_date on public.company_expenses(expense_date);
create index if not exists idx_company_expenses_category on public.company_expenses(category);

alter table public.company_expenses enable row level security;

-- Admin/finance only. Normal employees, providers and customers are blocked by
-- default (no other policy + RLS on). Matches the task's owner/admin/admin_manager/
-- is_admin rule, plus the existing 'finance' admin sub-role.
drop policy if exists company_expenses_admin_all on public.company_expenses;
create policy company_expenses_admin_all on public.company_expenses
  for all to authenticated
  using (exists (
    select 1 from public.doctor_profiles dp
    where dp.user_id = auth.uid()
      and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))
  ))
  with check (exists (
    select 1 from public.doctor_profiles dp
    where dp.user_id = auth.uid()
      and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))
  ));

-- keep updated_at fresh
create or replace function public.company_expenses_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_company_expenses_updated_at on public.company_expenses;
create trigger trg_company_expenses_updated_at
  before update on public.company_expenses
  for each row execute function public.company_expenses_touch_updated_at();
