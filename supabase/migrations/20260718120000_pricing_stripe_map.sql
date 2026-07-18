-- CHECKOUT-PRICING-LIVE-ROLLOUT-006 · foundation (LIVE)
-- Durable mapping of canonical subscription pricing lookup_keys -> the Stripe
-- (LIVE) Product/Price objects that back them. Written by provision-subscription-prices.
-- New-subscriptions-only pricing; existing subscriptions are untouched.

create table if not exists public.pricing_stripe_map (
  lookup_key        text primary key,
  product           text not null check (product in ('esa','psd')),
  package           text not null default 'standard',
  tier              text not null check (tier in ('single','multi')),
  phase             text not null check (phase in ('first_year','renewal')),
  stripe_price_id   text,
  stripe_product_id text,
  unit_amount       integer not null,
  currency          text not null default 'usd',
  bill_interval     text not null default 'year',
  livemode          boolean,
  last_result       text,
  provisioned_at    timestamptz,
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

comment on table public.pricing_stripe_map is
  'Canonical subscription pricing lookup_key -> Stripe (LIVE) Price/Product mapping. Written by provision-subscription-prices. livemode MUST be true in the LIVE project.';

alter table public.pricing_stripe_map enable row level security;

drop policy if exists pricing_stripe_map_admin_select on public.pricing_stripe_map;
create policy pricing_stripe_map_admin_select
  on public.pricing_stripe_map
  for select
  to authenticated
  using (public.check_is_admin());
