-- OPS-PROVIDER-APPLICATION-PHASE1-SAFE-FIXES
--
-- Phase 1 of the OPS-PROVIDER-APPLICATION-FORM-V2 redesign. Adds two groups
-- of nullable columns to provider_applications so the Join Our Network form
-- can persist:
--   1. Agreement audit (which checkboxes the applicant ticked + when)
--   2. Attribution (UTM, referrer, gclid/fbclid, landing URL) so we can
--      later target provider marketing in specific states.
--
-- All changes are ADDITIVE, IDEMPOTENT, and NON-DESTRUCTIVE. Existing rows
-- get NULL for every new column — never NOT NULL because the form did not
-- collect these values before this migration.
--
-- License/state redesign and any backfill of doctor_profiles.state_license_numbers
-- are intentionally NOT in this phase.

ALTER TABLE provider_applications
  ADD COLUMN IF NOT EXISTS agree_credentials BOOLEAN,
  ADD COLUMN IF NOT EXISTS agree_hipaa       BOOLEAN,
  ADD COLUMN IF NOT EXISTS agree_terms       BOOLEAN,
  ADD COLUMN IF NOT EXISTS agreements_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agreements_ip     TEXT,
  ADD COLUMN IF NOT EXISTS utm_source        TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium        TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign      TEXT,
  ADD COLUMN IF NOT EXISTS utm_term          TEXT,
  ADD COLUMN IF NOT EXISTS utm_content       TEXT,
  ADD COLUMN IF NOT EXISTS gclid             TEXT,
  ADD COLUMN IF NOT EXISTS fbclid            TEXT,
  ADD COLUMN IF NOT EXISTS referrer          TEXT,
  ADD COLUMN IF NOT EXISTS landing_url       TEXT;

-- Helpful index for state/source analytics on incoming provider leads.
CREATE INDEX IF NOT EXISTS provider_applications_utm_source_idx
  ON provider_applications (utm_source);

-- PostgREST schema cache reload so the API picks up the new columns
-- without waiting for a tick.
NOTIFY pgrst, 'reload schema';
