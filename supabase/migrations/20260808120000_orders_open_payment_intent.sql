-- ASSESSMENT-CHECKOUT-REFRESH-AND-RESUME-PERSISTENCE-LIVE-INCIDENT-003
--
-- WHY THIS COLUMN EXISTS
-- ----------------------
-- Making the checkout URL durable means a refresh now RESTORES checkout instead
-- of dumping the customer back on Question 1. That is the fix — but it also
-- means Step 3 remounts on every reload, and every mount asked Stripe for a new
-- PaymentIntent. Five refreshes, five PaymentIntents. None of them are charges
-- (they never leave `requires_payment_method`), but they pollute Stripe
-- reporting and reconciliation, and the old bug was the only thing preventing
-- them. Restoring checkout is our change, so the litter is our problem.
--
-- This column lets `create-payment-intent` find the order's still-open intent
-- and REUSE it — re-pricing and re-stamping metadata on the existing object —
-- instead of minting another one.
--
-- WHY NOT REUSE `payment_intent_id`
-- ---------------------------------
-- `orders.payment_intent_id` means "this order was PAID, and this is the intent
-- that paid it". Writing an unpaid intent id there is exactly the defect fixed
-- by ORDER-PAYMENT-INTENT-LIFECYCLE-TRIGGER-HARDENING-001: it used to stamp
-- `paid_at` and mint an entitlement snapshot for an order nobody had paid for.
-- A PaymentIntent id is an identifier, not a receipt. This column is therefore
-- deliberately SEPARATE, and no trigger, view, KPI or reconciliation path reads
-- it as evidence of payment.

alter table public.orders
  add column if not exists open_payment_intent_id text;

comment on column public.orders.open_payment_intent_id is
  'Stripe PaymentIntent that is currently OPEN (requires_payment_method) for this '
  'unpaid order, so a checkout reload reuses it instead of minting another. '
  'NOT a payment record and NEVER evidence of payment — paid state is paid_at '
  '(+ payment_intent_id). Written only by create-payment-intent (service role).';

-- Deliberately no index: the only read is by confirmation_id on a single order
-- row, which the existing confirmation_id index already serves.
