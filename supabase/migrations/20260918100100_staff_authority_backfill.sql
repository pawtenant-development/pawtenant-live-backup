-- PAWTENANT-SEO-EDITOR-RBAC-AND-ADMIN-ESCALATION-HARDENING-001 -- part 2/3.
--
-- Seeds private.staff_authority from the staff records that exist today.
--
-- WHAT "PROVEN AUTHORITY" CAN MEAN HERE, HONESTLY
-- Before this migration, doctor_profiles WAS the only record of who is staff.
-- There is no older, harder source to derive from, so this backfill takes the
-- current rows as the starting truth. That is only defensible because the rows
-- were inspected first and none looked anomalous:
--
--   * every is_admin row has a real auth.users account;
--   * none was created recently or by an unexpected route;
--   * the role/is_admin pairs are internally consistent (every non-provider role
--     carries is_admin = true, every provider carries false), which is what an
--     exploited row would NOT look like -- the escalation writes is_admin = true
--     while leaving role at 'provider', or creates a row for an account that has
--     customer orders.
--
-- The one genuinely suspicious shape -- role = 'provider' with is_admin = true --
-- is NOT backfilled as an admin. It is recorded as a provider and reported, so a
-- human decides rather than a migration.
--
-- Counts are reported without any personal data.

begin;

-- ---------------------------------------------------------------------------
-- 1. Refuse to run blind: if the mirror is internally contradictory in a way
--    that looks like the exploit, stop and make a human look.
-- ---------------------------------------------------------------------------
do $$
declare
  v_suspicious integer;
begin
  select count(*) into v_suspicious
    from public.doctor_profiles
   where user_id is not null and is_admin = true and coalesce(role, 'provider') = 'provider';
  if v_suspicious > 0 then
    raise warning 'staff_authority_backfill: % profile(s) carry is_admin=true with role=provider. They are being backfilled as PROVIDERS, not admins. Review them.', v_suspicious;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Backfill. Idempotent; never downgrades a row that already exists.
-- ---------------------------------------------------------------------------
insert into private.staff_authority (user_id, access_role, tab_access, is_active, granted_by, granted_at, note)
select d.user_id,
       -- A contradictory row (is_admin=true, role=provider) becomes a provider.
       case
         when coalesce(d.role, 'provider') = 'provider' then 'provider'
         when d.role in ('owner','admin_manager','support','finance','read_only') then d.role
         else 'provider'
       end,
       d.custom_tab_access,
       -- NEVER WIDEN. A non-provider role whose stored is_admin is false was
       -- deliberately not an administrator, so it is backfilled INACTIVE rather
       -- than promoted by the role->admin derivation. The recorded role is kept
       -- so an owner can reactivate it deliberately; effective_staff_role()
       -- returns NULL meanwhile, so the account gains nothing from this
       -- migration. Providers legitimately carry is_admin = false and are
       -- unaffected.
       coalesce(d.is_active, true)
         and (coalesce(d.role,'provider') = 'provider' or coalesce(d.is_admin,false)),
       null,
       now(),
       case
         when coalesce(d.role,'provider') <> 'provider' and not coalesce(d.is_admin,false)
           then 'backfilled INACTIVE: role said staff but is_admin was false; not widened'
         else 'backfilled from doctor_profiles at RBAC hardening'
       end
  from public.doctor_profiles d
 where d.user_id is not null
on conflict (user_id) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- 3. Report. Counts only -- no names, no emails, no ids.
-- ---------------------------------------------------------------------------
select 'authority rows'            as what, count(*)::text as value from private.staff_authority
union all
select 'admins (non-provider)',    count(*)::text from private.staff_authority where access_role <> 'provider' and is_active and revoked_at is null
union all
select 'admin-level (owner/admin_manager)', count(*)::text from private.staff_authority where access_role in ('owner','admin_manager') and is_active and revoked_at is null
union all
select 'providers',                count(*)::text from private.staff_authority where access_role = 'provider'
union all
select 'profiles with a user_id',  count(*)::text from public.doctor_profiles where user_id is not null
union all
select 'profiles WITHOUT a user_id (not backfilled)', count(*)::text from public.doctor_profiles where user_id is null
union all
select 'mirror disagrees with authority (must be 0)', count(*)::text
  from public.doctor_profiles d
  join private.staff_authority s on s.user_id = d.user_id
 where (coalesce(d.is_admin,false) is distinct from
        (s.access_role <> 'provider' and s.is_active and s.revoked_at is null))
union all
select 'suspicious is_admin+provider rows', count(*)::text
  from public.doctor_profiles where user_id is not null and is_admin = true and coalesce(role,'provider') = 'provider'
union all
select 'backfilled INACTIVE (role said staff, is_admin said no)', count(*)::text
  from private.staff_authority where not is_active and access_role <> 'provider';
