-- ──────────────────────────────────────────────────────────────────────────
-- CONSULTATION REQUESTS — extend source_context enum with 'manual_recovery'
--
-- Manual Consultation Invite Flow V1 (admin-side) introduces a new origin
-- for consultation requests: an admin clicked "Send Consultation Invite"
-- from the Order Detail modal, the customer landed via that email, and
-- submitted the form. Distinguishing this source from the existing
-- 'email_recovery' (automated future flows) gives ops a clean attribution
-- channel for the funnel.
--
-- Idempotent + non-destructive:
--   - drops + re-adds the CHECK with the wider value list only if the
--     current constraint differs
--   - existing rows are unaffected (none currently use 'manual_recovery')
-- ──────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultation_requests_source_check') THEN
    ALTER TABLE public.consultation_requests
      DROP CONSTRAINT consultation_requests_source_check;
  END IF;

  ALTER TABLE public.consultation_requests
    ADD CONSTRAINT consultation_requests_source_check
    CHECK (source_context IN (
      'email_recovery',
      'manual_recovery',
      'checkout_prompt',
      'assessment_prompt',
      'manual',
      'direct_link'
    ));
END$$;
