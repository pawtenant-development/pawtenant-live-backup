-- Legacy-resume price preservation (2026-07).
--
-- Track which pricing path a checkout used so admins can see when an order kept
-- its ORIGINAL quoted price instead of the current public pricing. This is the
-- audit/visibility half of the fix; the authoritative amount decision lives in
-- create-payment-intent / create-checkout-session (server-side, at PI/session
-- creation). These columns NEVER affect the amount charged.
--
-- Additive + idempotent. No existing data touched. No lead is repriced.

alter table public.orders add column if not exists pricing_source text;
alter table public.orders add column if not exists quote_locked_at timestamptz;

comment on column public.orders.pricing_source is
  'How the checkout amount was chosen at PI/session creation: current_pricing | legacy_saved_quote | legacy_fallback. Display/audit only — never affects the Stripe amount.';
comment on column public.orders.quote_locked_at is
  'Timestamp when a legacy/original saved quote was locked in for this order''s checkout (set only when pricing_source = legacy_saved_quote).';
