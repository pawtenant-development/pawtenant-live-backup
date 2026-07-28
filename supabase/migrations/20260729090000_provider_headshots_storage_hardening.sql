-- PROVIDER-HEADSHOT-OBJECT-KEY-DEIDENTIFICATION-001
--
-- Storage policy hardening for the PUBLIC `provider-headshots` bucket.
--
-- WHAT WAS WRONG (verified on LIVE before this migration)
--
-- 1) ANONYMOUS BUCKET LISTING.
--    Policy "Public read headshots" was `FOR SELECT USING (bucket_id =
--    'provider-headshots')` with no role restriction, so `anon` had SELECT on
--    storage.objects for the whole bucket. Verified over real HTTP with only
--    the publishable anon key:
--        POST /storage/v1/object/list/provider-headshots  ->  16 objects
--    Because every object key was derived from the provider's email address,
--    that endpoint enumerated 16 provider email addresses — including providers
--    who were never published publicly. De-identifying the keys removes the PII
--    from the listing, but anonymous enumeration of a staff-media bucket has no
--    legitimate purpose and is removed here as well.
--
--    IMPORTANT: this does NOT stop public images from loading. For a PUBLIC
--    bucket, `/storage/v1/object/public/<bucket>/<key>` is served without
--    consulting RLS; only the LIST/metadata API goes through this SELECT
--    policy. Verified 200 + correct byte count after this change.
--
-- 2) ANY AUTHENTICATED USER COULD WRITE PROVIDER HEADSHOTS.
--    "Authenticated upload headshots" (INSERT) and "Authenticated update
--    headshots" (UPDATE) were gated only on `auth.role() = 'authenticated'`,
--    which includes every signed-in customer. Writing to a public staff-media
--    bucket must be an admin action.
--
-- Admin predicate: is_admin_staff() — an ACTIVE admin (stricter than
-- check_is_admin(), which does not require is_active). SECURITY DEFINER with a
-- pinned search_path, already used by the provider-uploads policies.
--
-- service_role bypasses RLS entirely, so the approval Edge Function and the
-- migration helper are unaffected.

-- ── SELECT: metadata/listing is admin-only. Public image GETs are unaffected. ─
drop policy if exists "Public read headshots" on storage.objects;

create policy "provider_headshots_admin_select"
  on storage.objects for select
  using (bucket_id = 'provider-headshots' and public.is_admin_staff());

-- ── INSERT: admins only (was: any authenticated user) ────────────────────────
drop policy if exists "Authenticated upload headshots" on storage.objects;

create policy "provider_headshots_admin_insert"
  on storage.objects for insert
  with check (bucket_id = 'provider-headshots' and public.is_admin_staff());

-- ── UPDATE: admins only (was: any authenticated user) ───────────────────────
drop policy if exists "Authenticated update headshots" on storage.objects;

create policy "provider_headshots_admin_update"
  on storage.objects for update
  using (bucket_id = 'provider-headshots' and public.is_admin_staff())
  with check (bucket_id = 'provider-headshots' and public.is_admin_staff());

-- ── DELETE: admins only. There was previously NO delete policy, so cleanup
--    required service_role. Admins replacing a headshot should be able to
--    remove the superseded object.
drop policy if exists "provider_headshots_admin_delete" on storage.objects;

create policy "provider_headshots_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'provider-headshots' and public.is_admin_staff());
