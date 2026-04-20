-- Drop the internal coupons table. Stripe is now the only source of truth
-- for coupon definitions; the admin coupon management panel has been removed
-- and validate-coupon / create-payment-intent now resolve codes against the
-- Stripe API directly. The orders.coupon_code and orders.coupon_discount
-- columns are intentionally preserved as a per-order historical record
-- populated by the stripe-webhook from PaymentIntent metadata.

drop table if exists public.coupons;
