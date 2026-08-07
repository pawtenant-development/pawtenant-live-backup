-- ORDERS-PUBLIC-LEAD-UPDATE-POLICY-HARDENING-001  ·  P0
--
-- THE DEFECT
-- ----------
-- `orders` grants full DML to `anon` and `authenticated` (Supabase default), so
-- RLS is the only gate, and RLS carries:
--     allow_anon_lead_payment_update  USING (status = 'lead')  WITH CHECK (true)
--     anyone_can_update_lead_order    USING (status = 'lead')  WITH CHECK (true)
--     "Users can claim their own orders" USING (auth.email() = email) WITH CHECK (true)
-- RLS is row-level only — it cannot restrict WHICH COLUMNS a permitted UPDATE
-- writes. So an authenticated customer could rewrite any column on their own
-- unpaid lead. Verified: price 129 -> 1.
--
-- That mattered because BOTH charge paths — create-payment-intent AND
-- create-checkout-session — ran `resolveLegacyQuoteLock()`, which adopted
-- `orders.price` as the charge base for any unpaid order with no floor and no
-- comparison:
--     out.baseCents = savedCents;   // "the saved price comes from the DB, not
--                                   //  the client" — false: the column is
--                                   //  client-writable.
-- and that base flowed into stripe.paymentIntents.create / Checkout Session.
-- `orders.price` is INTEGER DOLLARS, so the floor was $1.00 (not $0.01), on
-- standard one-time ESA/PSD orders.
--
-- WHY AN ALLOWLIST, NOT A DENYLIST
-- --------------------------------
-- `orders` has 150 columns. A denylist rots: every new column is exposed by
-- default. Derived from source, the ONLY column a non-admin client session
-- legitimately writes is `google_tag_fired` (assessment-thankyou and
-- psd-assessment-thankyou). Lead creation, assessment answers and checkout all
-- moved server-side already. So the allowlist is tiny and everything else —
-- including columns added in future — is protected by default.
--
-- WHY A TRUSTED QUOTE RECORD, NOT A PRICE FLOOR
-- ---------------------------------------------
-- `orders.price` legitimately holds post-discount and retired amounts across a
-- continuous range ($35–$179 observed in production), so "reject anything below
-- canonical" would break genuine legacy quotes and "allowlist known amounts"
-- would still accept a forged value that happens to look legitimate. The only
-- sound control is provenance: honour an amount ONLY when the server itself
-- issued it. That is `order_price_quotes`.
--
-- This migration does NOT change any current business price.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Trusted, immutable, server-issued price quotes
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.order_price_quotes (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  confirmation_id text not null,
  amount_cents    integer not null check (amount_cents > 0),
  currency        text    not null default 'usd' check (currency = lower(currency)),
  package_key     text,
  billing_plan    text,
  letter_type     text,
  pet_count       integer,
  pricing_version text    not null,
  source          text    not null,
  issued_by       text    not null default 'server',
  issued_at       timestamptz not null default now()
);

create index if not exists order_price_quotes_order_idx
  on public.order_price_quotes (order_id, issued_at desc);

alter table public.order_price_quotes enable row level security;

-- No policy for anon/authenticated => deny by default. Only service_role and
-- the SECURITY DEFINER helper below may read/write.
drop policy if exists order_price_quotes_service_role on public.order_price_quotes;
create policy order_price_quotes_service_role on public.order_price_quotes
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

revoke all on public.order_price_quotes from public, anon, authenticated;
grant select, insert on public.order_price_quotes to service_role;
-- Deliberately NO update/delete grant: quotes are append-only evidence.

-- Belt and braces: even a role that somehow acquires UPDATE/DELETE cannot use it.
create or replace function public.order_price_quotes_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog, pg_temp
as $$
begin
  raise exception 'order_price_quotes is append-only (attempted %)', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists order_price_quotes_immutable_trg on public.order_price_quotes;
create trigger order_price_quotes_immutable_trg
  before update or delete on public.order_price_quotes
  for each row execute function public.order_price_quotes_immutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill trusted quotes for existing unpaid orders
-- ─────────────────────────────────────────────────────────────────────────────
-- Without this, every existing unpaid lead would silently reprice to CURRENT
-- pricing on resume — overcharging customers who were quoted a retired amount.
--
-- Safe to migrate the existing values because forgery has been ruled out at
-- migration time: no production order has ever had price < 35, and the lowest
-- legitimate observed amount is $35. Recorded with source
-- 'migrated_from_orders_price_pre_hardening' so these are distinguishable from
-- quotes the server issues from here on.
insert into public.order_price_quotes
  (order_id, confirmation_id, amount_cents, currency, package_key, billing_plan,
   letter_type, pet_count, pricing_version, source, issued_by)
select o.id, o.confirmation_id, o.price * 100, 'usd', o.package_key, o.billing_plan,
       o.letter_type,
       greatest(1, coalesce(jsonb_array_length(o.assessment_answers->'pets'), 1)),
       'pre_hardening_v1', 'migrated_from_orders_price_pre_hardening', 'migration'
from public.orders o
where o.paid_at is null
  and o.payment_intent_id is null
  and o.price is not null
  and o.price > 0
  and not exists (select 1 from public.order_price_quotes q where q.order_id = o.id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Server-side reader for the charge paths
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the edge functions read quotes without holding table
-- grants. Returns the most recent trusted quote, or NULL when there is none —
-- in which case the caller MUST fall back to canonical current pricing.
create or replace function public.trusted_price_quote_cents(p_confirmation_id text)
returns integer
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select q.amount_cents
  from public.order_price_quotes q
  join public.orders o on o.id = q.order_id
  where o.confirmation_id = p_confirmation_id
    and o.paid_at is null
    and o.payment_intent_id is null
  order by q.issued_at desc
  limit 1
$$;

revoke all on function public.trusted_price_quote_cents(text) from public, anon, authenticated;
grant execute on function public.trusted_price_quote_cents(text) to service_role;

-- Append-only writer used by the charge paths to record the quote they issued.
create or replace function public.issue_price_quote(
  p_confirmation_id text,
  p_amount_cents    integer,
  p_package_key     text,
  p_billing_plan    text,
  p_letter_type     text,
  p_pet_count       integer,
  p_pricing_version text,
  p_source          text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare v_order uuid; v_id uuid;
begin
  if auth.role() is distinct from 'service_role'
     and current_user not in ('postgres','supabase_admin','service_role') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'amount_cents must be positive' using errcode = '22023';
  end if;

  select id into v_order from public.orders where confirmation_id = p_confirmation_id;
  if v_order is null then return null; end if;

  insert into public.order_price_quotes
    (order_id, confirmation_id, amount_cents, currency, package_key, billing_plan,
     letter_type, pet_count, pricing_version, source, issued_by)
  values
    (v_order, p_confirmation_id, p_amount_cents, 'usd', p_package_key, p_billing_plan,
     p_letter_type, p_pet_count, coalesce(p_pricing_version,'unknown'),
     coalesce(p_source,'server'), 'server')
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.issue_price_quote(text,integer,text,text,text,integer,text,text)
  from public, anon, authenticated;
grant execute on function public.issue_price_quote(text,integer,text,text,text,integer,text,text)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Column allowlist for client sessions (supersedes the identity-only guard)
-- ─────────────────────────────────────────────────────────────────────────────
-- Replaces orders_protect_identity_columns_trg, which protected only user_id
-- and email. Same trusted-writer logic — and SECURITY INVOKER remains
-- load-bearing: in a SECURITY DEFINER function current_user is the OWNER, so
-- the bypass would match every call and the guard would protect nothing.
create or replace function public.orders_reject_client_column_writes()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_blocked text[];
  -- The ONLY column a non-admin client session legitimately writes, derived
  -- from source (assessment-thankyou + psd-assessment-thankyou). Everything
  -- else — including columns added later — is protected by default.
  v_allowed constant text[] := array['google_tag_fired'];
begin
  if auth.role() = 'service_role'
     or current_setting('app.portal_identity_writer', true) = 'on'
     or current_user in ('postgres','supabase_admin','service_role','supabase_auth_admin')
     or coalesce(public.check_is_admin(), false)
  then
    return new;
  end if;

  select coalesce(array_agg(n.key), '{}')
    into v_blocked
  from jsonb_each(to_jsonb(new)) n
  where n.value is distinct from (to_jsonb(old) -> n.key)
    and n.key <> all (v_allowed);

  if array_length(v_blocked, 1) is not null then
    raise exception
      'orders: client sessions cannot write %. Use a server path.',
      array_to_string(v_blocked, ', ')
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.orders_reject_client_column_writes() from public, anon, authenticated;

drop trigger if exists orders_protect_identity_columns_trg on public.orders;
drop trigger if exists orders_reject_client_column_writes_trg on public.orders;
create trigger orders_reject_client_column_writes_trg
  before update on public.orders
  for each row
  execute function public.orders_reject_client_column_writes();
