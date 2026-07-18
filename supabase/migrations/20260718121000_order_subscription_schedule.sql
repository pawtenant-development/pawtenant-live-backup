-- CHECKOUT-PRICING-PHASED-SUBSCRIPTION-003 · Phase 4
-- Columns recording the phased-subscription schedule attached after a NEW
-- subscription's first invoice is paid. Additive + idempotent. Existing
-- subscriptions (no schedule) simply keep these NULL and are untouched.

alter table public.orders
  add column if not exists subscription_schedule_id text,
  add column if not exists subscription_renewal_price_id text,
  add column if not exists subscription_first_year_cents integer,
  add column if not exists subscription_renewal_cents integer,
  add column if not exists subscription_first_renewal_at timestamptz;

comment on column public.orders.subscription_schedule_id is
  'Stripe Subscription Schedule id (phase 1 = first-year price, phase 2 = renewal price, then release). Set by stripe-webhook after the first invoice is paid. NULL for one-time, combo, and legacy pre-phased subscriptions.';
comment on column public.orders.subscription_first_renewal_at is
  'Timestamp the renewal (phase 2) price first applies — i.e. the first renewal date shown in the checkout disclosure.';
