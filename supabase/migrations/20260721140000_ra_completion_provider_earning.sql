-- RA-COMPLETION PROVIDER PAYOUT (2026-07-21) — PROVIDER-EARNINGS-RA-DOUBLE-PAYOUT-001
--
-- Combo packages (ESA/PSD + Reasonable Accommodation, i.e.
-- includes_reasonable_accommodation_letter = true / package_key esa_ra_bundle |
-- psd_ra_bundle) bundle a SECOND piece of professional work — the completed
-- Housing Accommodation / RA form — into one price with NO extra customer charge.
-- When the assigned provider completes that RA work, they earn a SECOND payout
-- equal to their normal per-order rate (doctor_profiles.per_order_rate), exactly
-- like the standalone Additional Documentation add-on already does.
--
-- The ledger is already component-based (earning_type: 'base' one-per-order,
-- 'additional_documentation' one-per-request). This migration adds the idempotency
-- backstop for a THIRD component — 'ra_completion' — with NO new column and NO data
-- change here (the values already exist as free text; the reconciler + backfill
-- create the rows). It mirrors the existing add-on partial index so every existing
-- reader (provider earnings tab, admin earnings panel, per-order Payments tab,
-- payout-reminder totals) picks up the RA row with no special-casing.
--
-- Idempotency contract: AT MOST ONE active RA-completion earning per order.
--   • Keyed by order_id (combo RA has no additional_documentation_request_id).
--   • Predicate mirrors resolve_charge_payouts' exclusion
--     (COALESCE(status,'') <> 'cancelled') so a voided row never blocks a
--     legitimately re-created one, and never doubles under a race.
--
-- Additive + non-destructive: creates one partial UNIQUE index. Safe on TEST and
-- LIVE (IF NOT EXISTS). Base rows and add-on rows are unaffected.

CREATE UNIQUE INDEX IF NOT EXISTS doctor_earnings_ra_completion_order_uniq
  ON public.doctor_earnings (order_id)
  WHERE earning_type = 'ra_completion'
    AND COALESCE(status, '') <> 'cancelled'
    AND order_id IS NOT NULL;
