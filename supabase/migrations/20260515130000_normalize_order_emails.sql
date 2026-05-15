-- LIVE hotfix 2026-05-15 (rev 2) — normalize orders.email so the customer
-- portal can find paid customers whose order was written with mixed-case
-- and/or trailing whitespace, while their Supabase auth.users.email is
-- (by Supabase's default behavior) stored lowercased and trimmed.
--
-- Concrete case that motivated this:
--   order  PT-MP5YFRIF  ·  orders.email      = 'Kathyb0013@gmail.com'
--                          auth.users.email  = 'kathyb0013@gmail.com'
-- The portal's RLS-bound client-side query (with or without ilike) was
-- never returning the row because either the orders.email RLS check or
-- the column literal differed by case from the auth subject's email.
--
-- Strategy:
--   * One-shot UPDATE that only touches rows where the email is NOT
--     already in normalized form (lower + trim). Idempotent — re-running
--     is a no-op.
--   * Does NOT change customer-facing email recipients (every order's
--     email is already case-insensitively the same; Resend / SES / Stripe
--     treat the address case-insensitively).
--   * Does NOT touch checkout, order creation, Stripe references, doctor
--     assignment, attribution, or any other column. Single column on a
--     single table.
--
-- Safe to re-run. Non-destructive.

UPDATE public.orders
   SET email = lower(trim(email))
 WHERE email IS NOT NULL
   AND email <> lower(trim(email));

-- Sanity report (for the SQL editor — no-op in production migrations).
-- Run this manually after the UPDATE to confirm zero stragglers remain:
--
--   SELECT count(*) AS still_unnormalized
--     FROM public.orders
--    WHERE email IS NOT NULL
--      AND email <> lower(trim(email));
--
-- Expected: 0.
