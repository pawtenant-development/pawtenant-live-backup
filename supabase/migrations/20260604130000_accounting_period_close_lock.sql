-- Company OS — Accounts monthly close/lock foundation.
-- Extends company_accounting_periods (from 20260604120000) with a stored books
-- snapshot + reopen audit, and adds admin/finance-gated close/reopen/read RPCs.
-- Additive + idempotent. NO source data is mutated: closing a month only stores
-- a JSON snapshot of the figures (computed client-side) for later review.
-- No salary/payroll/owner amounts beyond the aggregate figures already shown in
-- the Accounts P&L. Owner salary remains excluded upstream (get_salary_expense_*).

-- 1) Additive columns ---------------------------------------------------------
alter table public.company_accounting_periods add column if not exists snapshot_json jsonb;
alter table public.company_accounting_periods add column if not exists reopened_by uuid references auth.users(id);
alter table public.company_accounting_periods add column if not exists reopened_at timestamptz;

-- Accounts permission tier (same gate as company_expenses / get_salary_expense_*).
create or replace function public.is_accounts_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.doctor_profiles dp
    where dp.user_id = auth.uid()
      and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))
  );
$$;

-- 2) Read periods overlapping a range ----------------------------------------
create or replace function public.get_company_accounting_periods(p_from date, p_to date)
returns table (
  id uuid,
  period_start date,
  period_end date,
  label text,
  status text,
  snapshot_json jsonb,
  notes text,
  closed_by uuid,
  closed_at timestamptz,
  reopened_by uuid,
  reopened_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_accounts_admin() then
    raise exception 'not authorized to view accounting periods';
  end if;
  return query
  select p.id, p.period_start, p.period_end, p.label, p.status, p.snapshot_json, p.notes,
         p.closed_by, p.closed_at, p.reopened_by, p.reopened_at, p.updated_at
  from public.company_accounting_periods p
  where p.period_start <= p_to and p.period_end >= p_from
  order by p.period_start desc;
end; $$;

-- 3) Close a month — upsert by (period_start, period_end), store snapshot ------
create or replace function public.close_company_accounting_period(
  p_period_start date,
  p_period_end date,
  p_label text,
  p_snapshot jsonb,
  p_notes text default null
)
returns public.company_accounting_periods
language plpgsql security definer set search_path = public as $$
declare v_row public.company_accounting_periods;
begin
  if not public.is_accounts_admin() then
    raise exception 'not authorized to close accounting periods';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'invalid period range';
  end if;

  insert into public.company_accounting_periods (
    period_start, period_end, label, status, snapshot_json, notes,
    closed_by, closed_at, reopened_by, reopened_at
  ) values (
    p_period_start, p_period_end, p_label, 'closed', p_snapshot, p_notes,
    auth.uid(), now(), null, null
  )
  on conflict (period_start, period_end) do update set
    label = excluded.label,
    status = 'closed',
    snapshot_json = excluded.snapshot_json,
    notes = excluded.notes,
    closed_by = auth.uid(),
    closed_at = now(),
    reopened_by = null,
    reopened_at = null
  returning * into v_row;
  return v_row;
end; $$;

-- 4) Reopen a closed month — keeps snapshot, marks reopened, status -> review --
create or replace function public.reopen_company_accounting_period(
  p_id uuid,
  p_reason text default null
)
returns public.company_accounting_periods
language plpgsql security definer set search_path = public as $$
declare v_row public.company_accounting_periods;
begin
  if not public.is_accounts_admin() then
    raise exception 'not authorized to reopen accounting periods';
  end if;
  update public.company_accounting_periods p
     set status = 'review',
         reopened_by = auth.uid(),
         reopened_at = now(),
         notes = coalesce(nullif(btrim(p_reason), ''), p.notes)
   where p.id = p_id and p.status = 'closed'
   returning * into v_row;
  if v_row.id is null then
    raise exception 'period not found or not in a closed state';
  end if;
  return v_row;
end; $$;

-- 5) Grants — authenticated only; anon revoked (defense-in-depth; RPCs re-check)
revoke execute on function public.is_accounts_admin() from public, anon;
revoke execute on function public.get_company_accounting_periods(date, date) from public, anon;
revoke execute on function public.close_company_accounting_period(date, date, text, jsonb, text) from public, anon;
revoke execute on function public.reopen_company_accounting_period(uuid, text) from public, anon;

grant execute on function public.get_company_accounting_periods(date, date) to authenticated, service_role;
grant execute on function public.close_company_accounting_period(date, date, text, jsonb, text) to authenticated, service_role;
grant execute on function public.reopen_company_accounting_period(uuid, text) to authenticated, service_role;
grant execute on function public.is_accounts_admin() to authenticated, service_role;
