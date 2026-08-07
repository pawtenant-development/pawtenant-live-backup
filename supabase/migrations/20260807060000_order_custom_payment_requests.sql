-- ORDER-LINKED-CUSTOM-STRIPE-INVOICE-001
--
-- An Admin-authorised, order-linked custom payment request.
--
-- WHY A SEPARATE TABLE
-- The amount here is an explicit ADMIN OVERRIDE, not a package price. It must
-- never touch `orders.price`: that column is the canonical, provenance-backed
-- charge base protected by ORDERS-PUBLIC-LEAD-UPDATE-POLICY-HARDENING-001, and
-- letting an ad-hoc admin figure land in it would re-open the exact hole that
-- P0 closed. So the authorised amount lives here, in its own record, and the
-- order is only ever LINKED to it.
--
-- Two purposes, deliberately only two:
--   * supplemental_charge      — extra work alongside an order. Paying it does
--                                NOT mark the base order paid.
--   * outstanding_order_balance — settles an order that is genuinely unpaid.
--
-- Statuses mirror real Stripe Invoice semantics rather than inventing states
-- Stripe cannot produce.

create table if not exists public.order_custom_payment_requests (
  id                      uuid primary key default gen_random_uuid(),
  order_id                uuid not null references public.orders(id) on delete cascade,
  confirmation_id         text,

  purpose                 text not null
                            check (purpose in ('supplemental_charge','outstanding_order_balance')),
  amount_cents            integer not null check (amount_cents > 0),
  currency                text not null default 'usd' check (currency = 'usd'),

  -- Shown to the customer on the Stripe page and in the request email.
  customer_description    text not null,
  -- Never leaves PawTenant. Not sent to Stripe, not shown to the customer.
  internal_note           text,

  status                  text not null default 'draft'
                            check (status in ('draft','creating','open','paid','void',
                                              'expired','failed','partially_refunded','refunded')),

  stripe_customer_id      text,
  stripe_invoice_id       text,
  stripe_payment_intent_id text,
  hosted_url              text,

  created_by_user_id      uuid,
  created_by_name         text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  sent_at                 timestamptz,
  paid_at                 timestamptz,
  voided_at               timestamptz,
  failed_at               timestamptz,
  expired_at              timestamptz,

  refunded_amount_cents   integer not null default 0 check (refunded_amount_cents >= 0),
  provider_message_id     text,

  -- Durable idempotency: the UI mints one token per create the operator
  -- initiated, so five concurrent submits collapse to a single Stripe object.
  idempotency_key         text,
  metadata                jsonb not null default '{}'::jsonb
);

-- One row per operation token. This is the constraint that makes CLAIM → CREATE
-- → FINALIZE safe; without it the claim is advisory only.
create unique index if not exists order_custom_payment_requests_idem_uniq
  on public.order_custom_payment_requests (idempotency_key)
  where idempotency_key is not null;

-- Webhook lookup path: Stripe hands us the invoice id and we must find the row.
create unique index if not exists order_custom_payment_requests_invoice_uniq
  on public.order_custom_payment_requests (stripe_invoice_id)
  where stripe_invoice_id is not null;

create index if not exists order_custom_payment_requests_order_idx
  on public.order_custom_payment_requests (order_id, created_at desc);

alter table public.order_custom_payment_requests enable row level security;

-- Admin-only. A customer never reads this table: they interact with the Stripe
-- hosted page, which needs no PawTenant read. Service role (edge functions and
-- the Stripe webhook) is what actually writes here.
drop policy if exists "admins manage custom payment requests"
  on public.order_custom_payment_requests;
create policy "admins manage custom payment requests"
  on public.order_custom_payment_requests
  for all
  using (exists (select 1 from public.doctor_profiles dp
                  where dp.user_id = auth.uid() and dp.is_admin = true))
  with check (exists (select 1 from public.doctor_profiles dp
                       where dp.user_id = auth.uid() and dp.is_admin = true));

drop policy if exists "service role manages custom payment requests"
  on public.order_custom_payment_requests;
create policy "service role manages custom payment requests"
  on public.order_custom_payment_requests
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- New table → revoke the default grants BY NAME. "from public" alone does not
-- undo what anon/authenticated already hold.
revoke all on public.order_custom_payment_requests from anon;

create or replace function public.order_custom_payment_requests_touch()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists order_custom_payment_requests_touch_trg
  on public.order_custom_payment_requests;
create trigger order_custom_payment_requests_touch_trg
  before update on public.order_custom_payment_requests
  for each row execute function public.order_custom_payment_requests_touch();

revoke all on function public.order_custom_payment_requests_touch() from public, anon, authenticated;

comment on table public.order_custom_payment_requests is
  'Admin-authorised custom Stripe payment requests linked to an existing order. The amount here is an explicit admin override and is deliberately NOT orders.price.';
