-- OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2
--
-- Adds the structured `licenses` jsonb column to provider_applications so the
-- Join Our Network form can capture multiple repeatable rows of:
--   { state_code: "VA", credential: "LCSW", license_number: "0701016127" }
--
-- ADDITIVE, IDEMPOTENT, NON-DESTRUCTIVE.
-- Legacy columns (license_state, license_number, license_types,
-- additional_states) are intentionally preserved for backward compatibility
-- so existing applications and admin review surfaces keep working.
-- Existing rows get NULL for the new column.

ALTER TABLE provider_applications
  ADD COLUMN IF NOT EXISTS licenses jsonb;

-- PostgREST schema cache reload so the API picks up the new column without
-- waiting for a tick.
NOTIFY pgrst, 'reload schema';
