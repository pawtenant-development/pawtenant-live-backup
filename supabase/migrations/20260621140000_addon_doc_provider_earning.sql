-- ADDON-DOC PROVIDER PAYOUT (2026-06-21)
-- Every PAID Additional Documentation ($40) request earns the assigned provider
-- an extra payout equal to their normal per-order rate (doctor_profiles.per_order_rate).
-- This is recorded as a SEPARATE row in the existing doctor_earnings ledger so it
-- flows through every existing reader (provider earnings tab, admin earnings panel,
-- payout-reminder totals) with no special-casing.
--
-- Additive only:
--   • earning_type            — distinguishes the base order payout from the add-on
--                               payout. Defaults to 'base' so all existing rows keep
--                               their meaning unchanged.
--   • additional_documentation_request_id — links the add-on earning back to its
--                               order_additional_documentation_requests row.
--   • partial UNIQUE index    — hard idempotency: at most ONE earning per add-on
--                               request, even if the webhook + reconciler + list
--                               self-heal all fire. Base-order rows (NULL request id)
--                               are unaffected by the index.

ALTER TABLE public.doctor_earnings
  ADD COLUMN IF NOT EXISTS earning_type text NOT NULL DEFAULT 'base';

ALTER TABLE public.doctor_earnings
  ADD COLUMN IF NOT EXISTS additional_documentation_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS doctor_earnings_addon_request_uniq
  ON public.doctor_earnings (additional_documentation_request_id)
  WHERE additional_documentation_request_id IS NOT NULL;
