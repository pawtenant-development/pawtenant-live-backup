-- PAWTENANT-LIVE-STAFF-AUTHORITY-HARDENING-001
-- Removes every LIVE QA fixture this task created.
--
-- SAFETY
-- Bounded to the four `rbac-*-qa@pawtenant-live.invalid` accounts (RFC 2606
-- reserved TLD -- they can never be real). No real customer, provider or staff
-- account is matched by that pattern.
--
-- INSPECT FIRST: run section 0 alone and read the counts. Inspecting before
-- deleting is not ceremony -- a previous sweep on a `PT-QACLOSE-%` prefix took
-- two rows from an unrelated fixture that happened to share the prefix.
--
--   supabase db query --linked -f scripts/qa-rbac-cleanup.sql

-- ── 0. What is about to be removed ─────────────────────────────────────────
select 'fixture auth users'        as what, count(*)::text as value from auth.users where email like 'rbac-%-qa@pawtenant-live.invalid'
union all select 'fixture profiles',       count(*)::text from public.doctor_profiles where email like 'rbac-%-qa@pawtenant-live.invalid'
union all select 'fixture authority rows', count(*)::text from private.staff_authority s
            where exists (select 1 from auth.users u where u.id=s.user_id and u.email like 'rbac-%-qa@pawtenant-live.invalid')
union all select 'TOTAL profiles now',    count(*)::text from public.doctor_profiles
union all select 'TOTAL authority rows now', count(*)::text from private.staff_authority;

-- ── 1. The fixture accounts ────────────────────────────────────────────────
begin;

delete from private.staff_authority s
 where exists (select 1 from auth.users u where u.id = s.user_id and u.email like 'rbac-%-qa@pawtenant-live.invalid');

delete from public.doctor_profiles where email like 'rbac-%-qa@pawtenant-live.invalid';
delete from auth.identities where user_id in (select id from auth.users where email like 'rbac-%-qa@pawtenant-live.invalid');
delete from auth.users where email like 'rbac-%-qa@pawtenant-live.invalid';

-- audit_logs rows for the grants/revocations are KEPT deliberately: they are the
-- record that this QA happened, they name no customer and carry no secret.

commit;

-- ── 2. Confirm the restored baseline ───────────────────────────────────────
-- The intended real baseline for LIVE is 30 profiles / 30 authority rows, with
-- admin_manager=2, owner=2, provider=20, read_only=3, support=3.
select 'fixture users left (must be 0)' as what, count(*)::text as value from auth.users where email like 'rbac-%-qa@pawtenant-live.invalid'
union all select 'fixture profiles left (must be 0)', count(*)::text from public.doctor_profiles where email like 'rbac-%-qa@pawtenant-live.invalid'
union all select 'fixture authority rows left (must be 0)', count(*)::text from private.staff_authority s
            where exists (select 1 from auth.users u where u.id=s.user_id and u.email like 'rbac-%-qa@pawtenant-live.invalid')
union all select 'profiles (must be 30)',            count(*)::text from public.doctor_profiles
union all select 'authority rows (must be 30)',      count(*)::text from private.staff_authority
union all select 'authority role breakdown',
            (select string_agg(access_role||'='||n, ', ' order by access_role)
               from (select access_role, count(*) n from private.staff_authority group by access_role) x)
union all select 'admin-level remaining (must be >= 1)', count(*)::text from private.staff_authority
            where access_role in ('owner','admin_manager') and is_active and revoked_at is null
union all select 'mirror disagrees with authority (must be 0)', count(*)::text
            from public.doctor_profiles d join private.staff_authority s on s.user_id = d.user_id
           where coalesce(d.is_admin,false) is distinct from (s.access_role <> 'provider' and s.is_active and s.revoked_at is null)
union all select 'orphan authority rows (must be 0)', count(*)::text
            from private.staff_authority s where not exists (select 1 from public.doctor_profiles d where d.user_id = s.user_id);
