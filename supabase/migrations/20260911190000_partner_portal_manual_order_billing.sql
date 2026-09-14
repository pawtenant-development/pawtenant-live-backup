-- PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002
--
-- Invite-only partner portal accounts, a structured manual order form that
-- replaces PDF/OCR extraction as the normal intake path, a Stripe-backed
-- partner receivables ledger, and MANUAL per-order payment reconciliation.
--
-- NON-NEGOTIABLES ENCODED HERE
--   * A partner user's organisation is derived from auth.uid() through
--     public.partner_users. It is NEVER taken from the request, so a partner
--     cannot forge a partner_id.
--   * Every partner-facing read is a SECURITY DEFINER projection. The partner
--     tables themselves keep their admin-only RLS, so a partner session reading
--     a table directly still sees ZERO rows.
--   * Paying an invoice is an ACCOUNTING event. It never touches orders.status,
--     orders.doctor_status, documents or provider earnings. An individual order
--     only becomes `paid` when an admin reconciles it by hand.
--   * Rate cards are never edited in place; an order freezes its rate at
--     submission time into partner_order_financials (already immutable).
-- ───────────────────────────────────────────────────────────────────────────
-- 1. PARTNER USERS — invite-only, one organisation per authenticated user
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.partner_users (
  id                      uuid primary key default gen_random_uuid(),
  partner_id              uuid not null references public.partner_organizations(id) on delete restrict,
  user_id                 uuid references auth.users(id) on delete set null,
  email                   text not null,
  role                    text not null default 'partner_staff',
  status                  text not null default 'invited',
  invited_by              uuid,
  invited_by_email        text,
  invited_at              timestamptz not null default now(),
  invitation_sent_count   integer not null default 1,
  invitation_last_sent_at timestamptz not null default now(),
  accepted_at             timestamptz,
  revoked_at              timestamptz,
  revoked_by              uuid,
  revoke_reason           text,
  last_access_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint partner_users_role_valid   check (role   in ('partner_admin','partner_staff')),
  constraint partner_users_status_valid check (status in ('invited','active','revoked')),
  constraint partner_users_email_lower  check (email = lower(email)),
  constraint partner_users_email_format check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  -- An ACTIVE membership must be bound to a real authenticated user that has
  -- accepted. "Active" can never mean "an email we once typed in".
  constraint partner_users_active_bound  check (status <> 'active' or (user_id is not null and accepted_at is not null)),
  constraint partner_users_revoked_bound check (status <> 'revoked' or revoked_at is not null)
);

-- One invitation per address, and one organisation per authenticated user:
-- cross-partner membership is not a supported shape and must fail loudly.
create unique index if not exists partner_users_email_uniq   on public.partner_users (email);
create unique index if not exists partner_users_user_uniq    on public.partner_users (user_id) where user_id is not null;
create index        if not exists partner_users_partner_idx  on public.partner_users (partner_id, status);

drop trigger if exists trg_partner_users_touch on public.partner_users;
create trigger trg_partner_users_touch before update on public.partner_users
  for each row execute function public.tg_partner_touch_updated_at();

alter table public.partner_users enable row level security;

drop policy if exists partner_users_admin_read on public.partner_users;
create policy partner_users_admin_read on public.partner_users
  for select to authenticated using (public.is_chat_admin());

-- A partner user may read THEIR OWN membership row and nothing else — not the
-- colleague rows of their own organisation, and never another organisation's.
drop policy if exists partner_users_self_read on public.partner_users;
create policy partner_users_self_read on public.partner_users
  for select to authenticated using (user_id = auth.uid());

-- ── identity helpers ───────────────────────────────────────────────────────
-- THE single source of truth for "which partner is this caller". Everything
-- partner-facing routes through here; nothing reads a partner id off a request.
create or replace function public.current_partner_id()
returns uuid
language sql
stable
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
  select pu.partner_id
    from public.partner_users pu
    join public.partner_organizations po on po.id = pu.partner_id
   where pu.user_id = auth.uid()
     and pu.status  = 'active'
     and po.status in ('sandbox','active')
   limit 1;
$fn$;

create or replace function public.current_partner_role()
returns text
language sql
stable
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
  select pu.role
    from public.partner_users pu
    join public.partner_organizations po on po.id = pu.partner_id
   where pu.user_id = auth.uid()
     and pu.status  = 'active'
     and po.status in ('sandbox','active')
   limit 1;
$fn$;

revoke all on function public.current_partner_id()   from public, anon;
revoke all on function public.current_partner_role() from public, anon;
grant execute on function public.current_partner_id()   to authenticated;
grant execute on function public.current_partner_role() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. PARTNER BILLING PROFILE — Stripe receivables configuration
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.partner_billing_profiles (
  partner_id               uuid primary key references public.partner_organizations(id) on delete restrict,
  legal_business_name      text not null,
  billing_email            text,
  stripe_customer_id       text,
  currency                 text not null default 'USD',
  payment_terms_days       integer not null default 14,
  weekly_invoicing_enabled boolean not null default false,
  invoice_weekday          smallint not null default 1,   -- 0 = Sunday … 6 = Saturday, America/New_York
  invoice_hour             smallint not null default 9,   -- 0–23, America/New_York
  active                   boolean not null default true,
  notes                    text,
  created_by               uuid,
  created_at               timestamptz not null default now(),
  updated_by               uuid,
  updated_at               timestamptz not null default now(),
  constraint partner_billing_currency_valid check (currency ~ '^[A-Z]{3}$'),
  constraint partner_billing_terms_range    check (payment_terms_days between 0 and 120),
  constraint partner_billing_weekday_range  check (invoice_weekday between 0 and 6),
  constraint partner_billing_hour_range     check (invoice_hour between 0 and 23),
  constraint partner_billing_email_format   check (billing_email is null or billing_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  -- Automatic weekly sending cannot be switched on for a half-configured
  -- partner. The database refuses it; it is not a UI convention.
  constraint partner_billing_weekly_ready check (
    weekly_invoicing_enabled = false
    or (active = true and billing_email is not null and stripe_customer_id is not null)
  )
);

drop trigger if exists trg_partner_billing_profiles_touch on public.partner_billing_profiles;
create trigger trg_partner_billing_profiles_touch before update on public.partner_billing_profiles
  for each row execute function public.tg_partner_touch_updated_at();

alter table public.partner_billing_profiles enable row level security;
drop policy if exists partner_billing_profiles_admin_read on public.partner_billing_profiles;
create policy partner_billing_profiles_admin_read on public.partner_billing_profiles
  for select to authenticated using (public.is_chat_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- 3. INVOICE LEDGER — Stripe references, billing period idempotency
-- ───────────────────────────────────────────────────────────────────────────
alter table public.partner_invoices
  add column if not exists source                     text not null default 'manual',
  add column if not exists billing_period_key         text,
  add column if not exists period_start               timestamptz,
  add column if not exists period_end                 timestamptz,
  add column if not exists stripe_customer_id         text,
  add column if not exists stripe_invoice_id          text,
  add column if not exists stripe_invoice_number      text,
  add column if not exists stripe_hosted_invoice_url  text,
  add column if not exists stripe_idempotency_key     text,
  add column if not exists stripe_status              text,
  add column if not exists billing_email              text,
  add column if not exists amount_paid_cents          integer not null default 0,
  add column if not exists paid_at                    timestamptz,
  add column if not exists paid_currency              text;

do $blk$ begin
  alter table public.partner_invoices
    add constraint partner_invoices_source_valid check (source in ('manual','weekly'));
exception when duplicate_object then null; end $blk$;

-- One invoice per partner per billing period: the weekly job can retry for
-- ever and still produce exactly one invoice.
create unique index if not exists partner_invoices_period_uniq
  on public.partner_invoices (partner_id, billing_period_key) where billing_period_key is not null;
create unique index if not exists partner_invoices_stripe_invoice_uniq
  on public.partner_invoices (stripe_invoice_id) where stripe_invoice_id is not null;
create unique index if not exists partner_invoices_stripe_idem_uniq
  on public.partner_invoices (stripe_idempotency_key) where stripe_idempotency_key is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. PER-ORDER PARTNER BILLING STATE
--
-- Canonical vocabulary, extended — NOT replaced. `uninvoiced` is this project's
-- existing spelling of "unbilled" and keeps its meaning.
--   uninvoiced → invoiced → invoice_paid_unreconciled → paid
--                       ↘ void        ↘ credited
-- ───────────────────────────────────────────────────────────────────────────
alter table public.partner_order_financials drop constraint if exists partner_fin_invoice_status_valid;
alter table public.partner_order_financials
  add constraint partner_fin_invoice_status_valid check (
    invoice_status in ('uninvoiced','invoiced','invoice_paid_unreconciled','paid','void','credited')
  );

alter table public.partner_order_financials drop constraint if exists partner_fin_invoiced_requires_eligible;
alter table public.partner_order_financials
  add constraint partner_fin_invoiced_requires_eligible check (
    invoice_status in ('uninvoiced','void') or invoice_eligible = true
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 5. MANUAL RECONCILIATION LEDGER (append-only)
--
-- Mirrors the provider payout ledger in shape: a human records that a specific
-- order inside a paid invoice has been settled. Deliberately SEPARATE from
-- doctor_earnings so the two accounting domains never mix.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.partner_order_reconciliations (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid not null references public.orders(id) on delete restrict,
  partner_id             uuid not null references public.partner_organizations(id) on delete restrict,
  invoice_id             uuid not null references public.partner_invoices(id) on delete restrict,
  amount_allocated_cents integer not null,
  currency               text not null default 'USD',
  marked_by              uuid not null,
  marked_by_email        text not null,
  marked_at              timestamptz not null default now(),
  note                   text,
  created_at             timestamptz not null default now(),
  constraint partner_recon_amount_positive check (amount_allocated_cents > 0),
  constraint partner_recon_currency_valid  check (currency ~ '^[A-Z]{3}$')
);

-- One settlement per order. A second attempt is a duplicate, not a top-up.
create unique index if not exists partner_recon_order_uniq  on public.partner_order_reconciliations (order_id);
create index        if not exists partner_recon_invoice_idx on public.partner_order_reconciliations (invoice_id);

create or replace function public.tg_partner_recon_append_only()
returns trigger
language plpgsql
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
begin
  raise exception 'partner_order_reconciliations is append-only' using errcode = '0A000';
end;
$fn$;

drop trigger if exists trg_partner_recon_append_only on public.partner_order_reconciliations;
create trigger trg_partner_recon_append_only before update or delete on public.partner_order_reconciliations
  for each row execute function public.tg_partner_recon_append_only();

alter table public.partner_order_reconciliations enable row level security;
drop policy if exists partner_recon_admin_read on public.partner_order_reconciliations;
create policy partner_recon_admin_read on public.partner_order_reconciliations
  for select to authenticated using (public.is_chat_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- 6. STRUCTURED ORDER DRAFTS (the simple form — no PDF, no OCR)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.partner_order_drafts (
  id                 uuid primary key default gen_random_uuid(),
  partner_id         uuid not null references public.partner_organizations(id) on delete restrict,
  created_by         uuid not null,
  created_by_email   text,
  created_by_kind    text not null default 'partner',
  service            text,
  form               jsonb not null default '{}'::jsonb,
  questionnaire_text text,
  partner_reference  text,
  status             text not null default 'draft',
  submitted_order_id uuid references public.orders(id) on delete restrict,
  submitted_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint partner_draft_kind_valid    check (created_by_kind in ('partner','admin')),
  constraint partner_draft_status_valid  check (status in ('draft','submitted','discarded')),
  constraint partner_draft_service_valid check (service is null or service in ('esa','psd')),
  constraint partner_draft_submitted_consistent check ((status = 'submitted') = (submitted_order_id is not null))
);

create index if not exists partner_order_drafts_partner_idx on public.partner_order_drafts (partner_id, status, updated_at desc);
create index if not exists partner_order_drafts_author_idx  on public.partner_order_drafts (created_by, status);

drop trigger if exists trg_partner_order_drafts_touch on public.partner_order_drafts;
create trigger trg_partner_order_drafts_touch before update on public.partner_order_drafts
  for each row execute function public.tg_partner_touch_updated_at();

alter table public.partner_order_drafts enable row level security;
drop policy if exists partner_order_drafts_admin_read on public.partner_order_drafts;
create policy partner_order_drafts_admin_read on public.partner_order_drafts
  for select to authenticated using (public.is_chat_admin());
-- No partner-facing table policy on purpose: drafts reach a partner only
-- through the SECURITY DEFINER projections in the companion migration, which
-- filter on current_partner_id(). A partner selecting this table directly
-- gets 0 rows.

-- ───────────────────────────────────────────────────────────────────────────
-- 7. CANONICAL INTAKE METHOD — the portal form is a third, named method
-- ───────────────────────────────────────────────────────────────────────────
alter table public.orders drop constraint if exists orders_partner_intake_method_valid;
alter table public.orders
  add constraint orders_partner_intake_method_valid check (
    partner_intake_method is null
    or partner_intake_method in ('api','manual','partner_portal_manual')
  );
