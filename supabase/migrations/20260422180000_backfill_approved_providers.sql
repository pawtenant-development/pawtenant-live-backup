-- Phase 4 Provider Pipeline fix — backfill approved_providers
--
-- Purpose:
--   Insert approved_providers rows for provider-role doctor_profiles that
--   are missing from approved_providers. Needed so homepage + profile
--   routing (which key off approved_providers.slug) can resolve legacy
--   providers that were created before the approval flow populated this
--   table.
--
-- Safety:
--   * Idempotent — WHERE NOT EXISTS ensures rows are only added once.
--   * Non-destructive — never updates or overwrites existing rows.
--   * Only targets role = 'provider' (excludes owner / admin_manager /
--     support / finance / read_only / NULL).
--   * Slug uniqueness is guaranteed by appending a deterministic 5-char
--     hash of the email — safe even when two providers share a name.
--
-- How to run:
--   Execute once in Supabase SQL editor (or via supabase db push if
--   applied as a migration). Safe to re-run — already-backfilled rows
--   will be skipped.

INSERT INTO approved_providers (
  application_id,
  slug,
  full_name,
  email,
  title,
  bio,
  states,
  photo_url,
  phone,
  is_active,
  created_at
)
SELECT
  dp.application_id,
  -- Slug: lowercase(full_name) with non-alphanumerics collapsed to "-",
  -- fallback to email prefix, plus a 5-char email hash suffix to guarantee
  -- uniqueness across duplicate names. Trimmed to 60 chars + suffix.
  (
    COALESCE(
      NULLIF(
        substring(
          trim(both '-' from regexp_replace(lower(trim(dp.full_name)), '[^a-z0-9]+', '-', 'g'))
          from 1 for 60
        ),
        ''
      ),
      NULLIF(
        regexp_replace(lower(split_part(dp.email, '@', 1)), '[^a-z0-9]+', '-', 'g'),
        ''
      ),
      'provider'
    )
    || '-' || substr(md5(lower(dp.email)), 1, 5)
  ) AS slug,
  dp.full_name,
  lower(trim(dp.email)) AS email,
  dp.title,
  dp.bio,
  COALESCE(dp.licensed_states, ARRAY[]::text[]) AS states,
  dp.photo_url,
  dp.phone,
  TRUE AS is_active,
  COALESCE(dp.created_at, now()) AS created_at
FROM doctor_profiles dp
WHERE dp.role = 'provider'
  AND dp.email IS NOT NULL
  AND trim(dp.email) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM approved_providers ap
    WHERE lower(ap.email) = lower(trim(dp.email))
  );
