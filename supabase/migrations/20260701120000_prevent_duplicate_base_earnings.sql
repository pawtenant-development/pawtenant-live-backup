-- Prevent duplicate provider BASE earnings.
--
-- Root cause: the base-earning creators (notify-patient-letter, assign-doctor) deduped by
-- confirmation_id using .maybeSingle(). That call returns an ERROR (surfaced as null data)
-- whenever more than one earning row shares the confirmation_id — which happens as soon as
-- an add-on (additional_documentation) earning exists. The guard then failed open and
-- inserted a duplicate BASE row on every re-completion / re-assignment / letter re-send.
-- Add-on earnings were never affected (they have their own partial unique index).
--
-- This migration:
--   1) Self-heals existing duplicate ACTIVE base rows by soft-voiding the later ones,
--      keeping the earliest per confirmation_id (matches the manual LIVE cleanup).
--   2) Enforces at most one ACTIVE base earning per confirmation_id via a partial unique
--      index, so the bug can never recur even under a race.
--
-- Safe to run on TEST and LIVE: idempotent, non-destructive (soft-void only, no hard
-- delete), and it does not touch add-on earnings, valid base earnings, paid amounts, or
-- provider balances. 'cancelled' is the status sentinel every reader + resolve_charge_payouts
-- already excludes from payable/reporting.

-- 1) Soft-void duplicate ACTIVE base rows, keeping the earliest per confirmation_id.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY confirmation_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.doctor_earnings
  WHERE earning_type = 'base'
    AND COALESCE(status, '') <> 'cancelled'
    AND confirmation_id IS NOT NULL
)
UPDATE public.doctor_earnings d
SET status = 'cancelled',
    notes  = COALESCE(d.notes || ' | ', '')
             || 'Auto-voided duplicate base-order earning (uniqueness migration). '
             || 'Earliest base earning retained; add-on earning untouched; no clawback.'
FROM ranked r
WHERE d.id = r.id
  AND r.rn > 1;

-- 2) Enforce: at most one ACTIVE base earning per confirmation_id.
--    Predicate mirrors resolve_charge_payouts' exclusion (COALESCE(status,'') <> 'cancelled')
--    so a voided duplicate never blocks a legitimately re-created base earning.
CREATE UNIQUE INDEX IF NOT EXISTS doctor_earnings_base_conf_uniq
  ON public.doctor_earnings (confirmation_id)
  WHERE earning_type = 'base'
    AND COALESCE(status, '') <> 'cancelled'
    AND confirmation_id IS NOT NULL;
