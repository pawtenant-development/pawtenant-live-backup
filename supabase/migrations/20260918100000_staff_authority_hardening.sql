-- PAWTENANT-SEO-EDITOR-RBAC-AND-ADMIN-ESCALATION-HARDENING-001 -- part 1/3.
--
-- THE VULNERABILITY THIS CLOSES (proven by capability probe, not by reading policies)
--
-- public.doctor_profiles carried:
--   * policy "Doctors manage own profile" FOR ALL USING/WITH CHECK (user_id = auth.uid())
--   * column-level UPDATE for `authenticated` on EVERY column, including
--     is_admin, role, custom_tab_access and user_id
--   * table-level INSERT/DELETE for `authenticated`
--
-- Because a FOR ALL policy covers INSERT, and permissive policies are OR'ed, the
-- live consequences were:
--
--   1. a provider could PATCH their own row to is_admin = true       -> 200
--   2. a provider could set role = 'owner'                            -> 204
--   3. a provider could grant themselves ANY Company OS tab via
--      custom_tab_access                                              -> 204
--   4. check_is_admin() then returned true for them
--   5. WORST: a user with NO staff profile at all -- i.e. any ordinary
--      CUSTOMER account -- could INSERT a doctor_profiles row for themselves
--      with is_admin = true, role = 'owner'                           -> 201
--      and check_is_admin() returned true.
--
-- One authenticated HTTP request turned any customer into a full admin. The same
-- grants and policies were confirmed read-only on LIVE.
--
-- THE FIX, IN DEPTH
--
--   A. A new canonical authority source, private.staff_authority, that NO
--      browser role can read or write. `private` is not exposed through the Data
--      API, and the table additionally has RLS on with no policies and no grants.
--
--   B. check_is_admin() reads THAT, never doctor_profiles and never
--      raw_user_meta_data. Its signature and semantics are unchanged, so every
--      existing RLS policy that calls it keeps working.
--
--   C. doctor_profiles keeps its columns as a DISPLAY MIRROR for the ~dozens of
--      read sites, but they are no longer authoritative and no longer writable
--      by the account they describe:
--        * the self policy is narrowed from FOR ALL to UPDATE only, so a
--          profile-less user can no longer INSERT one (closing #5);
--        * column UPDATE on the four authorization columns is revoked from
--          `authenticated` outright;
--        * a fail-closed trigger refuses any privilege-column change that did
--          not come from the service role or from admin_set_staff_access().
--
--   D. One writer. admin_set_staff_access() is the only path that changes
--      authority, and it writes the authority table and the mirror together, so
--      the two cannot drift into disagreeing.
--
-- WHY is_admin IS DERIVED AND NOT STORED
-- The UI already treats it as derived: TeamTab's ROLE_CONFIG marks every role
-- except `provider` as isAdmin. Storing it again is an opportunity for the flag
-- and the role to disagree; deriving it makes that impossible. The existing
-- behaviour is preserved exactly -- support/finance/read_only remain admins for
-- check_is_admin() purposes, as they are today.

begin;

-- ---------------------------------------------------------------------------
-- A. The canonical authority table
-- ---------------------------------------------------------------------------
create table if not exists private.staff_authority (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  access_role  text not null check (access_role in
                 ('owner','admin_manager','support','finance','read_only','provider')),
  -- NULL means "role defaults". A non-null array is an explicit override, the
  -- same contract getVisibleTabs() already implements for custom_tab_access.
  --
  -- jsonb, NOT text[]: public.doctor_profiles.custom_tab_access is jsonb, and
  -- mirroring the type exactly removes a conversion that would otherwise sit
  -- between the authority and its mirror. (Discovered the hard way -- the first
  -- backfill failed on the type mismatch, and `supabase db query` reported
  -- success anyway, leaving the authority table empty and every admin locked
  -- out until it was spotted.)
  tab_access   jsonb,
  is_active    boolean not null default true,
  granted_by   uuid,
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  note         text
);

comment on table private.staff_authority is
  'PAWTENANT-SEO-EDITOR-RBAC-AND-ADMIN-ESCALATION-HARDENING-001. The ONLY source of administrative authority. Lives in `private` (not exposed through the Data API), has RLS enabled with no policies, and no grants to anon or authenticated. public.doctor_profiles.is_admin/role/custom_tab_access are a display mirror of this table and are never read for authorization.';

alter table private.staff_authority enable row level security;
revoke all on private.staff_authority from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;

create index if not exists staff_authority_role_idx on private.staff_authority (access_role) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- B. The hardened predicates
-- ---------------------------------------------------------------------------

-- Effective authority for one user, in one place, so every predicate below
-- agrees by construction.
create or replace function private.effective_staff_role(p_user uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select s.access_role
    from private.staff_authority s
   where s.user_id = p_user
     and s.is_active
     and s.revoked_at is null;
$fn$;

revoke all on function private.effective_staff_role(uuid) from public, anon, authenticated;

/**
 * check_is_admin -- unchanged signature, hardened source.
 *
 * Still EXECUTE-able by authenticated, because dozens of existing RLS policies
 * call it and it only ever answers a question about the CALLER. What changed is
 * what it reads: private.staff_authority, which no browser role can write.
 *
 * `provider` is the one staff role that is not an admin, matching the existing
 * TeamTab ROLE_CONFIG mapping exactly. Support / finance / read_only stay
 * admins for this predicate, as they are today -- this migration must not
 * quietly narrow anyone's access while it is closing an escalation.
 */
create or replace function public.check_is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select coalesce(private.effective_staff_role(auth.uid()) is distinct from 'provider'
                  and private.effective_staff_role(auth.uid()) is not null, false);
$fn$;

/**
 * is_admin_level -- owner / admin_manager only.
 *
 * The canonical "may perform destructive or privileged operations" tier, mirroring
 * isAdminLevel() in src/lib/adminPermissions.ts. SEO Editor approval, publishing
 * and rollback are gated on THIS, not on check_is_admin(), so a support or
 * read_only account cannot approve content.
 */
create or replace function public.is_admin_level()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select coalesce(private.effective_staff_role(auth.uid()) in ('owner','admin_manager'), false);
$fn$;

/**
 * current_staff_access -- what the signed-in user may see.
 *
 * The UI's single source for navigation. It returns the caller's OWN access and
 * nothing else, so it is safe to expose to `authenticated`; it cannot be used to
 * enumerate anyone else. Hiding a nav item is never the security boundary --
 * every endpoint re-checks -- but the nav and the backend now read the same
 * table, so they cannot disagree.
 */
create or replace function public.current_staff_access()
returns table (access_role text, tab_access jsonb, is_admin boolean, is_admin_level boolean)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select
    private.effective_staff_role(auth.uid()) as access_role,
    (select s.tab_access from private.staff_authority s
      where s.user_id = auth.uid() and s.is_active and s.revoked_at is null) as tab_access,
    public.check_is_admin()  as is_admin,
    public.is_admin_level()  as is_admin_level;
$fn$;

revoke all on function public.check_is_admin()        from public, anon;
revoke all on function public.is_admin_level()        from public, anon;
revoke all on function public.current_staff_access()  from public, anon;
grant execute on function public.check_is_admin()       to authenticated;
grant execute on function public.is_admin_level()       to authenticated;
grant execute on function public.current_staff_access() to authenticated;

-- ---------------------------------------------------------------------------
-- C. Lock doctor_profiles
-- ---------------------------------------------------------------------------

-- C1. The self policy becomes UPDATE-only. FOR ALL is what let a profile-less
--     user INSERT an admin row for themselves, and what let anyone delete their
--     own record. Reads are already covered by doctors_read_own_and_all_profiles;
--     INSERT and DELETE keep their existing admin-only policies.
drop policy if exists "Doctors manage own profile" on public.doctor_profiles;

drop policy if exists doctors_update_own_profile on public.doctor_profiles;
create policy doctors_update_own_profile
  on public.doctor_profiles for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- C2. The four AUTHORIZATION columns are revoked outright. Even a genuine admin's
--     browser session cannot write them directly any more; admin_set_staff_access()
--     is the only path. `user_id` is included because re-pointing a profile row at
--     another auth user is an ownership transfer, not a profile edit.
-- A COLUMN-LEVEL REVOKE DOES NOTHING WHILE A TABLE-LEVEL GRANT EXISTS: in
-- PostgreSQL a table-level UPDATE covers every column, and revoking at column
-- granularity cannot carve a hole in it. `authenticated` held exactly such a
-- table grant, so the obvious `revoke update (is_admin, ...)` silently did
-- nothing. Revoke the table privilege, then grant it back per column.
revoke update on public.doctor_profiles from authenticated;

grant update (
  id, full_name, title, license_number, licensed_states, bio, created_at, email,
  phone, is_active, photo_url, per_order_rate, availability_status, npi_number,
  state_license_numbers, lifecycle_status, is_published, application_id,
  onboarded_at, portal_first_accessed_at, portal_last_accessed_at,
  account_setup_completed_at, provider_onboarding_seen_at, professional_email,
  professional_phone, professional_email_public_approved,
  professional_phone_public_approved
) on public.doctor_profiles to authenticated;

-- C3. Fail-closed trigger. Belt to C2's braces, and the only protection for the
--     OPERATIONAL columns below, which admins legitimately write from the
--     browser and providers must never touch.
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
  v_service boolean := coalesce((select auth.role()) = 'service_role', false);
  v_admin   boolean;
begin
  if v_service or v_authorized_write then
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
  --   per_order_rate    the provider's own payout rate  (financial)
  --   is_published      visibility in the public provider directory
  --   is_active         whether the account works at all
  --   lifecycle_status  application/approval lifecycle
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

drop trigger if exists doctor_profiles_privilege_guard on public.doctor_profiles;
create trigger doctor_profiles_privilege_guard
  before insert or update on public.doctor_profiles
  for each row execute function public.tg_doctor_profiles_privilege_guard();

revoke all on function public.tg_doctor_profiles_privilege_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- D. The single writer
-- ---------------------------------------------------------------------------

/**
 * admin_set_staff_access -- the ONLY way authority changes.
 *
 * SECURITY DEFINER because it must write private.staff_authority, which no
 * browser role holds any privilege on -- not to paper over a permission error.
 * It verifies the caller through the hardened source before doing anything, and
 * `authenticated` may EXECUTE it precisely because that check is inside.
 *
 * Writes the authority row and the doctor_profiles mirror in ONE transaction, so
 * the two can never disagree about who is an admin.
 */
create or replace function public.admin_set_staff_access(
  p_user_id     uuid,
  p_access_role text,
  p_tab_access  jsonb default null,
  p_revoke      boolean default false
)
returns table (out_user_id uuid, out_access_role text, out_is_admin boolean)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_caller is null then
    raise exception 'staff_access_unauthenticated' using errcode = 'insufficient_privilege';
  end if;
  -- owner / admin_manager only. Support and read_only are admins for read
  -- purposes but must never confer authority.
  if not public.is_admin_level() then
    raise exception 'staff_access_forbidden: only an owner or admin manager may change staff access'
      using errcode = 'insufficient_privilege';
  end if;
  if p_access_role not in ('owner','admin_manager','support','finance','read_only','provider') then
    raise exception 'staff_access_unknown_role: %', p_access_role using errcode = 'check_violation';
  end if;
  -- Nobody may change their own authority, in either direction. That removes
  -- self-promotion AND the accident of an owner locking themselves out.
  if p_user_id = v_caller then
    raise exception 'staff_access_no_self_change: ask another owner or admin manager'
      using errcode = 'insufficient_privilege';
  end if;

  insert into private.staff_authority as s
    (user_id, access_role, tab_access, is_active, granted_by, granted_at, revoked_at)
  values
    (p_user_id, p_access_role, p_tab_access, not p_revoke, v_caller, now(),
     case when p_revoke then now() else null end)
  on conflict (user_id) do update
    set access_role = excluded.access_role,
        tab_access  = excluded.tab_access,
        is_active   = excluded.is_active,
        granted_by  = excluded.granted_by,
        granted_at  = now(),
        revoked_at  = excluded.revoked_at;

  v_is_admin := (p_access_role <> 'provider') and not p_revoke;

  -- Mirror, so every existing read site keeps working unchanged.
  perform set_config('pawtenant.staff_authority_write', 'on', true);
  update public.doctor_profiles
     set is_admin = v_is_admin,
         role = p_access_role,
         custom_tab_access = p_tab_access
   where user_id = p_user_id;
  perform set_config('pawtenant.staff_authority_write', 'off', true);

  insert into public.audit_logs
    (actor_id, actor_name, actor_role, actor_type, object_type, object_id, action, description, new_values, category, source)
  values
    (v_caller, 'admin', private.effective_staff_role(v_caller), 'staff', 'staff_access', p_user_id::text,
     case when p_revoke then 'revoke' else 'grant' end,
     'Staff access ' || (case when p_revoke then 'revoked' else 'set' end) || ' to ' || p_access_role,
     jsonb_build_object('access_role', p_access_role, 'tab_access', p_tab_access, 'revoked', p_revoke),
     'security', 'admin_set_staff_access');

  return query select p_user_id, p_access_role, v_is_admin;
end;
$fn$;

revoke all on function public.admin_set_staff_access(uuid, text, jsonb, boolean) from public, anon;
grant execute on function public.admin_set_staff_access(uuid, text, jsonb, boolean) to authenticated;

commit;
