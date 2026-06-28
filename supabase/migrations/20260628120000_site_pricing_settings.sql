-- ─────────────────────────────────────────────────────────────────────────
-- site_pricing_settings — admin-managed DISPLAY prices for public website text
-- ─────────────────────────────────────────────────────────────────────────
-- One central source of truth for the prices shown as marketing/UI text on the
-- public website (ESA / PSD / add-on / subscription package prices).
--
-- SCOPE — DISPLAY ONLY:
--   * This table DOES NOT drive Stripe checkout amounts, price IDs, products,
--     coupons, order totals, refunds, payouts, or accounting.
--   * Editing a value here only changes the number rendered as website text.
--   * Real selling prices remain controlled by Stripe + checkout logic
--     (src/pages/assessment/page.tsx getAssessmentBasePrice + Stripe catalog).
--
-- Idempotent + non-destructive: IF NOT EXISTS everywhere, seed uses
-- ON CONFLICT DO NOTHING so re-running never overwrites an admin's later edits.
--
-- LIVE adaptation: unlike TEST, the LIVE database did not yet define the
-- public.is_admin_staff() helper (it has is_chat_admin() only). The pricing RLS
-- policies depend on is_admin_staff(), so this migration creates it idempotently
-- with the exact same definition used on TEST (any active admin staff member).
-- ─────────────────────────────────────────────────────────────────────────

-- ── Helper: any active admin staff member (mirrors TEST) ───────────────────
create or replace function public.is_admin_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.doctor_profiles dp
     where dp.user_id  = auth.uid()
       and dp.is_admin = true
       and dp.is_active = true
  );
$$;

revoke all on function public.is_admin_staff() from public;
grant execute on function public.is_admin_staff() to anon, authenticated, service_role;

create table if not exists public.site_pricing_settings (
  id            uuid primary key default gen_random_uuid(),
  key           text unique not null,
  label         text not null,
  service_type  text not null default 'general',  -- esa | psd | addon | subscription | general
  amount_cents  integer not null,
  currency      text not null default 'USD',
  display_text  text,                              -- optional override, e.g. "$110"
  description   text,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  updated_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.site_pricing_settings is
  'Admin-managed DISPLAY prices for public website text. Does NOT affect Stripe checkout amounts, price IDs, order totals, refunds, or payouts.';

-- ── updated_at trigger (per-table convention) ──────────────────────────────
create or replace function public.site_pricing_settings_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_site_pricing_settings_updated_at on public.site_pricing_settings;
create trigger trg_site_pricing_settings_updated_at
  before update on public.site_pricing_settings
  for each row execute function public.site_pricing_settings_set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.site_pricing_settings enable row level security;

-- Public website can READ active display prices (anon + authenticated).
-- Admin staff can read everything (incl. inactive) for the admin panel.
drop policy if exists site_pricing_public_read on public.site_pricing_settings;
create policy site_pricing_public_read
  on public.site_pricing_settings
  for select
  to anon, authenticated
  using (is_active = true or public.is_admin_staff());

-- Only active admin staff may modify display prices.
drop policy if exists site_pricing_admin_update on public.site_pricing_settings;
create policy site_pricing_admin_update
  on public.site_pricing_settings
  for update
  to authenticated
  using (public.is_admin_staff())
  with check (public.is_admin_staff());

drop policy if exists site_pricing_admin_insert on public.site_pricing_settings;
create policy site_pricing_admin_insert
  on public.site_pricing_settings
  for insert
  to authenticated
  with check (public.is_admin_staff());

drop policy if exists site_pricing_admin_delete on public.site_pricing_settings;
create policy site_pricing_admin_delete
  on public.site_pricing_settings
  for delete
  to authenticated
  using (public.is_admin_staff());

revoke all on public.site_pricing_settings from anon;
grant select on public.site_pricing_settings to anon, authenticated;
grant insert, update, delete on public.site_pricing_settings to authenticated;

-- ── Seed current visible prices (existing displayed LIVE values only) ──────
-- ON CONFLICT DO NOTHING keeps this safe to re-run and never clobbers edits.
insert into public.site_pricing_settings (key, label, service_type, amount_cents, currency, description, sort_order) values
  ('esa_single_pet',         'ESA Letter — One-Time (single pet)',     'esa',          11000, 'USD', 'One-time ESA letter base price for one pet.',                          10),
  ('esa_additional_pet',     'ESA — Additional Pet (one-time)',        'esa',           2500, 'USD', 'Add-on per extra pet on the one-time ESA letter.',                     11),
  ('esa_subscription_annual','ESA Annual Subscription (single pet)',   'subscription',  9900, 'USD', 'Annual ESA subscription base price for one pet (per year).',           12),
  ('esa_subscription_addon', 'ESA Annual — Additional Pet (per year)', 'subscription',  2000, 'USD', 'Add-on per extra pet on the annual ESA subscription.',                 13),
  ('psd_standard',           'PSD Letter — Standard',                  'psd',          10000, 'USD', 'Standard PSD letter (2-3 business days).',                             20),
  ('psd_priority',           'PSD Letter — Priority (24h)',            'psd',          12000, 'USD', 'Priority PSD letter (within 24 hours).',                               21),
  ('psd_annual',             'PSD Letter — Annual Subscription',       'psd',           9900, 'USD', 'Annual PSD subscription (per year).',                                  22),
  ('additional_documentation','Additional Documentation (add-on)',     'addon',         4000, 'USD', 'Add-on additional documentation request price.',                       30)
on conflict (key) do nothing;
