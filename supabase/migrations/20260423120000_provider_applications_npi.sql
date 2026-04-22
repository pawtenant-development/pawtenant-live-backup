-- provider_applications_npi: add optional NPI column to provider_applications.
-- Safe, additive, idempotent. No data modified, no drops, no indexes.

ALTER TABLE provider_applications
  ADD COLUMN IF NOT EXISTS npi TEXT;
