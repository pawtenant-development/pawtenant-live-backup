-- provider_approval_phase2_step1: safe, additive schema changes on doctor_profiles
-- Prepares the table for Phase 2 "approve application → auto-create provider".
-- No data is modified, no columns are dropped. Fully idempotent.

-- 1. Lifecycle status for provider onboarding stages.
ALTER TABLE doctor_profiles
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'approved';

-- 2. Controls whether the provider appears publicly on the website.
ALTER TABLE doctor_profiles
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

-- 3. Backlink to the originating provider_applications row (nullable
--    for providers created outside of the application flow).
ALTER TABLE doctor_profiles
  ADD COLUMN IF NOT EXISTS application_id UUID NULL;

-- 4. Timestamp for when the provider first completed setup / logged in.
ALTER TABLE doctor_profiles
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMP NULL;

-- 5. Case-insensitive unique index on email to prevent duplicate
--    provider accounts being created from the same address.
CREATE UNIQUE INDEX IF NOT EXISTS doctor_profiles_email_unique
  ON doctor_profiles (LOWER(email));
