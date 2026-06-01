-- Company OS — Accounting periods (monthly books) foundation.
-- Prepares a place to record monthly book periods + future close/lock status.
-- Additive + idempotent. Admin/finance only (mirrors company_expenses RLS).
-- This task does NOT freeze data or finalize a ledger — the Accounts UI still
-- derives month status (Open/Review) on the fly. This table is the future home
-- for explicit monthly close/lock, bonuses/commissions roll-ups, and
-- payroll-ready period exports. No salary/payroll amounts live here.

create table if not exists public.company_accounting_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,                                   -- future-ready, nullable, no FK
  period_start date not null,
  period_end date not null,
  label text,
  status text not null default 'open',
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'company_accounting_periods_status_chk') then
    alter table public.company_accounting_periods add constraint company_accounting_periods_status_chk
      check (status in ('open','review','closed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'company_accounting_periods_dates_chk') then
    alter table public.company_accounting_periods add constraint company_accounting_periods_dates_chk
      check (period_end >= period_start);
  end if;
end $$;

create unique index if not exists uq_accounting_periods_range
  on public.company_accounting_periods (period_start, period_end);

alter table public.company_accounting_periods enable row level security;

-- Admin/finance only (same gate as company_expenses). Employees/providers/customers blocked.
drop policy if exists company_accounting_periods_admin_all on public.company_accounting_periods;
create policy company_accounting_periods_admin_all on public.company_accounting_periods
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

create or replace function public.company_accounting_periods_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_accounting_periods_updated_at on public.company_accounting_periods;
create trigger trg_accounting_periods_updated_at
  before update on public.company_accounting_periods
  for each row execute function public.company_accounting_periods_set_updated_at();
