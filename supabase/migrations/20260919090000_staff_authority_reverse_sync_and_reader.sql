-- PAWTENANT-LIVE-STAFF-AUTHORITY-HARDENING-001 -- part 3/3.
--
-- WHY THIS FILE EXISTS AT ALL
--
-- Parts 1 and 2 (20260918100000 / 20260918100100) are the TEST-verified
-- migrations, copied to this repository byte-for-byte -- their md5s match the
-- TEST artifacts exactly. But the TEST DATABASE carries two further objects
-- that the TEST repository never captured: they were applied directly while the
-- hardening was being brought up, and no migration file was ever written for
-- them. Diffing the TEST database against the TEST migrations is what found
-- them; a file-only comparison would have shipped LIVE a half-built design.
--
-- All three are load-bearing:
--
--   * tg_doctor_profiles_privilege_guard() is REDEFINED here. Part 1's committed
--     version treats a writer as privileged only when auth.role() = 'service_role'.
--     On a direct database connection -- a migration, psql, the MCP SQL tool --
--     auth.role() is NULL, not 'service_role', so that version refuses every
--     future migration that touches a privilege column, and refuses to seed a QA
--     fixture. The TEST database's own copy carries the corrected predicate;
--     the TEST migration file does not. Comparing the two databases object by
--     object is what surfaced it: 16 of 18 authority objects hashed identically,
--     and this was one of the two that did not.
--
--     This does NOT widen the browser boundary. PostgREST always stamps a role
--     claim on the request -- `anon`, `authenticated` or `service_role` -- so a
--     request can never arrive with auth.role() NULL. Only a connection that is
--     already superuser-equivalent sees NULL. The capability probe re-proves
--     this from the outside afterwards, anonymously and as a signed-in user.
--
--   * tg_doctor_profiles_sync_authority() + its trigger is what keeps the FOUR
--     existing service-role writers working with zero code changes --
--     create-team-member, create-provider, create-owner-admin and
--     approve-provider-application all INSERT or UPDATE doctor_profiles with
--     the service role. Part 1's BEFORE trigger waves a privileged write
--     through; this AFTER trigger is what then records it in the authority
--     table. Without it a newly created team member would have a profile and
--     no authority at all -- they would simply not be an admin.
--
--   * staff_access_for(uuid) is the service-role reader: it answers "what is
--     THIS user's access" for a backend that is acting on someone else's
--     behalf. It is deliberately NOT executable by `authenticated` (that would
--     let any signed-in account enumerate staff); `current_staff_access()`,
--     which only ever answers about the caller, is the authenticated-facing
--     one. The recurrence guard asserts exactly that asymmetry, so the guard
--     cannot even run until this function exists.
--
-- Both bodies below are the TEST database's own pg_get_functiondef() output,
-- reproduced verbatim rather than re-typed from memory or summarised from a
-- handoff -- a condensed re-type is how a previous promotion silently diverged
-- from the artifact it claimed to be copying.
--
-- SAFE TO RE-RUN. Nothing here widens anyone's access: the sync trigger only
-- ever fires for a writer that is ALREADY privileged (service role, a direct
-- database connection, or inside admin_set_staff_access()), and it derives
-- is_active from the same "role, vetoed by is_admin" rule the backfill uses.

begin;

-- ---------------------------------------------------------------------------
-- 0. The privilege guard, with the corrected privileged-writer predicate.
-- ---------------------------------------------------------------------------
--
-- Identical to part 1's version in every branch EXCEPT the first: `v_privileged`
-- now recognises a direct database connection as well as the service role.
-- Everything a browser session can reach is unchanged -- an `authenticated` or
-- `anon` request still falls through to the INSERT check, the authority-column
-- check and the operational-column check exactly as before.
create or replace function public.tg_doctor_profiles_privilege_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  -- Set transaction-locally by admin_set_staff_access() only. PostgREST cannot
  -- set an arbitrary GUC in this namespace -- it only calls functions -- so this
  -- flag is not reachable from a request.
  v_authorized_write boolean := coalesce(
    current_setting('pawtenant.staff_authority_write', true) = 'on', false);
  -- NULL  -> direct database connection (migration / SQL editor): already privileged.
  -- 'service_role' -> an Edge Function using the service key.
  v_privileged boolean := coalesce((select auth.role()), 'direct') in ('service_role', 'direct');
  v_admin   boolean;
begin
  if v_privileged or v_authorized_write then
    return new;
  end if;

  -- An INSERT by anyone who is not an admin is refused outright. This is the
  -- customer-inserts-themselves-an-admin-profile path.
  if tg_op = 'INSERT' then
    if not public.check_is_admin() then
      raise exception 'doctor_profiles_insert_forbidden: only an administrator may create a staff profile'
        using errcode = 'insufficient_privilege';
    end if;
    if new.is_admin is distinct from false or new.role is distinct from 'provider' then
      -- Even an admin must go through admin_set_staff_access() to confer
      -- authority, so the authority table and the mirror are written together.
      raise exception 'doctor_profiles_privilege_insert_forbidden: set authority via admin_set_staff_access()'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- AUTHORIZATION columns: never writable here, by anyone, whatever their role.
  if new.is_admin          is distinct from old.is_admin
     or new.role           is distinct from old.role
     or new.custom_tab_access is distinct from old.custom_tab_access
     or new.user_id        is distinct from old.user_id then
    raise exception 'doctor_profiles_authority_readonly: is_admin, role, custom_tab_access and user_id are set only by admin_set_staff_access()'
      using errcode = 'insufficient_privilege';
  end if;

  -- OPERATIONAL columns: an administrator may change them; the subject may not.
  if new.per_order_rate    is distinct from old.per_order_rate
     or new.is_published   is distinct from old.is_published
     or new.is_active      is distinct from old.is_active
     or new.lifecycle_status is distinct from old.lifecycle_status then
    v_admin := public.check_is_admin();
    if not v_admin then
      raise exception 'doctor_profiles_operational_admin_only: per_order_rate, is_published, is_active and lifecycle_status are administrator-only'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$fn$;

revoke all on function public.tg_doctor_profiles_privilege_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Reverse sync: a privileged doctor_profiles write updates the authority.
-- ---------------------------------------------------------------------------
--
-- WHY auth.role() IS COALESCED TO 'direct'
-- On a direct database connection -- a migration, psql, the MCP SQL tool --
-- auth.role() is NULL, not 'service_role'. A guard keyed only on
-- = 'service_role' therefore treats a migration as an untrusted browser write
-- and blocks it. Naming 'direct' explicitly is what keeps this trigger from
-- turning every future migration against doctor_profiles into a failure.
create or replace function public.tg_doctor_profiles_sync_authority()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_privileged boolean := coalesce((select auth.role()), 'direct') in ('service_role', 'direct')
                          or coalesce(current_setting('pawtenant.staff_authority_write', true) = 'on', false);
  v_role text;
begin
  if not v_privileged or new.user_id is null then
    return new;
  end if;

  -- The role is authoritative; is_admin is treated as a veto so a privileged
  -- writer that deactivates an account cannot leave it holding authority.
  v_role := case
    when coalesce(new.role, 'provider') in ('owner','admin_manager','support','finance','read_only') then new.role
    else 'provider'
  end;

  insert into private.staff_authority as s
    (user_id, access_role, tab_access, is_active, granted_at, note)
  values
    (new.user_id, v_role, new.custom_tab_access,
     coalesce(new.is_active, true) and (v_role = 'provider' or coalesce(new.is_admin, false)),
     now(), 'synced from a privileged doctor_profiles write')
  on conflict (user_id) do update
    set access_role = excluded.access_role,
        tab_access  = excluded.tab_access,
        is_active   = excluded.is_active,
        revoked_at  = case when excluded.is_active then null else coalesce(s.revoked_at, now()) end;

  return new;
end;
$fn$;

revoke all on function public.tg_doctor_profiles_sync_authority() from public, anon, authenticated;

-- AFTER, and narrowed with UPDATE OF, so an ordinary provider saving their bio
-- does not re-write an authority row on every keystroke-sized save.
drop trigger if exists doctor_profiles_sync_authority on public.doctor_profiles;
create trigger doctor_profiles_sync_authority
  after insert or update of role, is_admin, custom_tab_access, is_active
  on public.doctor_profiles
  for each row execute function public.tg_doctor_profiles_sync_authority();

-- ---------------------------------------------------------------------------
-- 2. staff_access_for -- the service-role reader.
-- ---------------------------------------------------------------------------
--
-- Same four answers as current_staff_access(), but ABOUT A NAMED USER. That is
-- the whole reason `authenticated` must not hold EXECUTE on it: with it, any
-- signed-in customer could walk auth user ids and map out who the admins are.
create or replace function public.staff_access_for(p_user_id uuid)
returns table (access_role text, tab_access jsonb, is_admin boolean, is_admin_level boolean)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select
    private.effective_staff_role(p_user_id) as access_role,
    (select s.tab_access from private.staff_authority s
      where s.user_id = p_user_id and s.is_active and s.revoked_at is null) as tab_access,
    coalesce(private.effective_staff_role(p_user_id) is not null
             and private.effective_staff_role(p_user_id) <> 'provider', false) as is_admin,
    coalesce(private.effective_staff_role(p_user_id) in ('owner','admin_manager'), false) as is_admin_level;
$fn$;

revoke all on function public.staff_access_for(uuid) from public, anon, authenticated;
grant execute on function public.staff_access_for(uuid) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- 3. Postconditions. Read these; do not trust an exit code.
-- ---------------------------------------------------------------------------
select 'privilege guard accepts a direct connection (must be true)' as what,
       (pg_get_functiondef('public.tg_doctor_profiles_privilege_guard()'::regprocedure)
          like '%''service_role'', ''direct''%')::text as value
union all
select 'sync trigger present (must be 1)',
       (select count(*)::text from pg_trigger
         where tgrelid='public.doctor_profiles'::regclass
           and tgname='doctor_profiles_sync_authority' and not tgisinternal) as value
union all
select 'authenticated may EXECUTE staff_access_for (must be false)',
       has_function_privilege('authenticated','public.staff_access_for(uuid)','EXECUTE')::text
union all
select 'service_role may EXECUTE staff_access_for (must be true)',
       has_function_privilege('service_role','public.staff_access_for(uuid)','EXECUTE')::text
union all
select 'mirror disagrees with authority (must be 0)',
       (select count(*)::text from public.doctor_profiles d
          join private.staff_authority s on s.user_id = d.user_id
         where coalesce(d.is_admin,false) is distinct from
               (s.access_role <> 'provider' and s.is_active and s.revoked_at is null));
