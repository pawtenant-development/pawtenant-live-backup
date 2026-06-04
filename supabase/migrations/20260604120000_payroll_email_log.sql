-- Monthly payroll summary email — send log.
-- Records each "Send Payroll" action from Accounts → Monthly Books Summary so the
-- UI can show a last-sent timestamp and we keep an audit trail. This is a
-- NOTIFICATION/REPORT log only — it stores NO per-employee salary figures and
-- moves NO money. Owner/co-owner comp is excluded upstream by the salary RPC.
-- Admin/finance gated (same rule as company_expenses). Additive + idempotent.
-- TEST (opudhofjbydrljgleofq). Do NOT apply to LIVE from this task.

create table if not exists public.payroll_email_log (
  id               uuid primary key default gen_random_uuid(),
  period_start     date not null,
  period_end       date not null,
  period_label     text,
  recipient_emails text[] not null default '{}',
  employee_count   integer not null default 0,
  total_pkr        numeric not null default 0,
  total_usd        numeric not null default 0,
  fx_rate          numeric not null default 280,
  status           text not null default 'sent',   -- 'sent' | 'dry_run' | 'failed'
  error            text,
  sent_by          uuid,
  sent_at          timestamptz not null default now()
);

create index if not exists payroll_email_log_period_idx
  on public.payroll_email_log (period_start, period_end, sent_at desc);

alter table public.payroll_email_log enable row level security;

-- Admin / owner / admin_manager / finance may READ the log (drives last-sent UI).
-- Writes are performed by the edge function with the service role (bypasses RLS),
-- so no insert policy is needed for normal users — payroll detail stays owner-only.
drop policy if exists payroll_email_log_admin_read on public.payroll_email_log;
create policy payroll_email_log_admin_read on public.payroll_email_log
  for select
  using (exists (
    select 1 from public.doctor_profiles dp
    where dp.user_id = auth.uid()
      and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))
  ));

grant select on public.payroll_email_log to authenticated;
