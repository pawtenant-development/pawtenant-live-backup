-- ============================================================================
-- PROVIDER-UPLOADS-PRIVATE-REMEDIATION (2026-07-02)
--
-- The provider-uploads bucket held applicant onboarding files (resumes,
-- licenses, insurance PDFs, headshots) uploaded straight from the PUBLIC
-- join-our-network form via anon storage policies:
--   • "Allow public reads"   (SELECT, role public)  → every applicant document
--     world-readable + bucket enumerable
--   • "Allow public uploads" (INSERT, role public)  → world-writable bucket
--     (abuse / malware-hosting vector)
-- and provider_applications stored permanent public URLs.
--
-- This migration:
--   §1 Backfills provider_applications.headshot_url / documents_urls from
--      public URLs to bare storage paths ("headshots/…", "documents/…").
--      Host-agnostic on purpose: TEST rows cloned from LIVE reference the
--      LIVE hostname but the same object paths exist in this project's bucket.
--      Non-provider-uploads values (external URLs) are left untouched.
--   §2 Flips the bucket private.
--   §3 Drops the two anon policies. Uploads now flow through the
--      provider-application-upload edge function (service role → bypasses
--      RLS); no anon storage policy is needed at all.
--   §4 Adds an authenticated-admin SELECT policy so admin surfaces can mint
--      short-lived signed URLs client-side (src/lib/providerUploads.ts).
--      Gate: is_admin_staff() — active is_admin staff of any role; exists
--      with the same definition on BOTH projects. (Deliberately broader than
--      is_provider_records_admin(), which stays reserved for the stricter
--      provider-internal bucket; application docs are reviewed by all admin
--      staff.)
--
-- Public provider photos are NOT served from this bucket:
-- approve-provider-application now copies approved headshots into the public
-- provider-headshots bucket. (On LIVE, a pre-flip backfill must migrate the
-- existing doctor_profiles / doctor_contacts / approved_providers photo_url
-- rows that still point here — see the LIVE runbook. TEST has none.)
--
-- Idempotent + non-destructive: no objects are deleted; re-running is a no-op.
-- ============================================================================

-- §1a — headshot_url: public URL → storage path
UPDATE provider_applications
SET headshot_url = regexp_replace(
      headshot_url,
      '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/provider-uploads/',
      ''
    )
WHERE headshot_url ~ '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/provider-uploads/';

-- §1b — documents_urls (text[]): rewrite each element, preserving order.
UPDATE provider_applications
SET documents_urls = (
      SELECT array_agg(
               regexp_replace(
                 u,
                 '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/provider-uploads/',
                 ''
               )
               ORDER BY ord
             )
      FROM unnest(documents_urls) WITH ORDINALITY AS t(u, ord)
    )
WHERE documents_urls IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM unnest(documents_urls) AS u
    WHERE u ~ '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/provider-uploads/'
  );

-- §2 — flip the bucket private
UPDATE storage.buckets SET public = false WHERE id = 'provider-uploads';

-- §3 — drop the anon policies
DROP POLICY IF EXISTS "Allow public reads"   ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;

-- §4 — authenticated-admin read access for signed-URL minting.
DROP POLICY IF EXISTS provider_uploads_admin_select ON storage.objects;
CREATE POLICY provider_uploads_admin_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'provider-uploads' AND is_admin_staff());
