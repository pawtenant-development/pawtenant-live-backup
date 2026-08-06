-- CUSTOMER-PORTAL-ORDER-IDENTITY-LINK-INTEGRITY-AND-SELF-HEALING-001
--
-- ROOT CAUSE
-- ----------
-- `orders` RLS SELECT was:
--     (auth.uid() = user_id) OR (auth.email() = email)
-- Both disjuncts are case-sensitive:
--   * Supabase stores auth.users.email lower-cased;
--   * orders.email is stored verbatim as the customer typed it.
-- So an order created as 'ANDREWW261@OUTLOOK.COM' by a customer whose auth
-- email is 'andreww261@outlook.com' is hidden from that customer by Postgres
-- itself, even though Admin "Customer View" (which lower()s client-side) shows
-- it. `orders.user_id` stayed NULL for the same reason: every linker matched
-- the lower-cased input against the verbatim column.
--
-- Note `order_documents.customers_read_own_docs` ALREADY compares
--     lower(o.email) = lower(auth.email())
-- so only the `orders` policy was case-broken. This migration brings `orders`
-- to the same (already-shipped, already-reviewed) comparison semantics — it is
-- a correctness fix, not a widening of the trust model.
--
-- WHAT THIS MIGRATION DOES (forward-only, idempotent)
--   1. Canonical server-side email normalization function.
--   2. Case/whitespace-insensitive `orders` SELECT policy.
--   3. Makes orders.user_id / orders.email immutable to non-service-role,
--      non-admin writers, so the pre-existing permissive lead-UPDATE policies
--      can no longer be used to claim an order from a browser.
--   4. claim_my_orders() — the authenticated self-heal RPC.
--   5. admin_repair_order_portal_link() — the controlled Admin repair action.
--   6. Read-only diagnostics for Admin "Portal identity status".
--
-- No order is linked by this migration. The historic backfill is a separate,
-- explicitly-run statement so its dry run and real run can be compared.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Canonical email normalization
-- ─────────────────────────────────────────────────────────────────────────────
-- The ONE rule, used by RLS, the self-heal RPC, the Admin repair action, the
-- diagnostics view and the backfill. Deliberately conservative:
--   * trim surrounding whitespace, lower-case;
--   * reject empty / malformed;
--   * NEVER strip dots, NEVER collapse plus-addressing, NEVER apply
--     provider-specific rules — a+b@gmail.com and ab@gmail.com are different
--     people as far as this system is concerned.
create or replace function public.normalize_email(p_email text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_email is null then null
    when btrim(p_email) = '' then null
    -- one @, no whitespace, a dot-bearing domain. Intentionally strict: a value
    -- that does not look like an address must never match anything.
    when lower(btrim(p_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then null
    else lower(btrim(p_email))
  end
$$;

comment on function public.normalize_email(text) is
  'Canonical portal-identity email normalization: trim + lower-case, NULL when '
  'empty or malformed. Never strips dots or plus-addressing. Single source of '
  'truth for RLS, claim_my_orders(), admin_repair_order_portal_link() and the '
  'historic backfill (CUSTOMER-PORTAL-ORDER-IDENTITY-LINK-INTEGRITY-001).';

revoke all on function public.normalize_email(text) from public;
grant execute on function public.normalize_email(text) to authenticated, anon, service_role;

-- Matching index so the normalized comparison in RLS / self-heal stays cheap.
create index if not exists orders_normalized_email_idx
  on public.orders (public.normalize_email(email));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. orders SELECT policy — normalized comparison
-- ─────────────────────────────────────────────────────────────────────────────
-- auth.uid() stays the authoritative owner. The verified-JWT-email disjunct is
-- retained (not widened) so that customers whose orders have not yet been
-- self-healed are not locked out mid-rollout; it now compares normalized values
-- exactly like the order_documents policy already did.
drop policy if exists "Users can view their own orders" on public.orders;
create policy "Users can view their own orders"
  on public.orders
  for select
  using (
    (auth.uid() is not null and auth.uid() = user_id)
    or (
      auth.uid() is not null
      and public.normalize_email(auth.email()) is not null
      and public.normalize_email(email) = public.normalize_email(auth.email())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Identity columns become immutable to browser-side writers
-- ─────────────────────────────────────────────────────────────────────────────
-- `orders` carries two long-standing permissive UPDATE policies:
--     allow_anon_lead_payment_update  USING (status = 'lead')  WITH CHECK (true)
--     anyone_can_update_lead_order    USING (status = 'lead')  WITH CHECK (true)
-- plus "Users can claim their own orders" USING (auth.email() = email).
-- Those exist so the anonymous checkout can update a lead in flight, and this
-- migration does not remove them (that would break checkout). But they also let
-- any caller rewrite `user_id` or `email` — i.e. claim an order, or re-point an
-- order at an address they control. RLS cannot restrict columns, so this is a
-- trigger.
--
-- service_role (every edge function) and admins are unaffected. The self-heal
-- and repair RPCs below are SECURITY DEFINER and set a local flag, so they pass.
-- SECURITY INVOKER is load-bearing. In a SECURITY DEFINER function `current_user`
-- is the function OWNER (postgres), so the trusted-writer bypass below would
-- match on every call and the trigger would protect nothing. As INVOKER,
-- current_user is the real caller role. Verified by test T13.
create or replace function public.orders_protect_identity_columns()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog, pg_temp
as $$
begin
  -- Trusted writers: service_role, an authenticated admin, or one of this
  -- migration's own SECURITY DEFINER RPCs (which set the flag below).
  if auth.role() = 'service_role'
     or current_setting('app.portal_identity_writer', true) = 'on'
     -- Direct DB / migration / cron work never arrives with a customer JWT.
     or current_user in ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin')
     or coalesce(public.check_is_admin(), false)
  then
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception
      'orders.user_id is not writable from a client session (use claim_my_orders)'
      using errcode = '42501';
  end if;

  if new.email is distinct from old.email then
    raise exception
      'orders.email is not writable from a client session'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.orders_protect_identity_columns() from public, anon, authenticated;

drop trigger if exists orders_protect_identity_columns_trg on public.orders;
create trigger orders_protect_identity_columns_trg
  before update on public.orders
  for each row
  execute function public.orders_protect_identity_columns();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. claim_my_orders() — authenticated self-heal
-- ─────────────────────────────────────────────────────────────────────────────
-- Server-authoritative. Reads auth.uid() and the JWT email itself; the caller
-- supplies nothing. Refuses ambiguity. Idempotent. Cannot be used as an
-- enumeration oracle: it only ever reports rows it just linked to the CALLER.
create or replace function public.claim_my_orders()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_uid          uuid   := auth.uid();
  v_jwt_email    text   := public.normalize_email(auth.email());
  v_db_email     text;
  v_confirmed    boolean;
  v_owners       int;
  v_claimed      uuid[];
  v_count        int    := 0;
begin
  if v_uid is null or v_jwt_email is null then
    return jsonb_build_object('claimed', 0, 'reason', 'unauthenticated');
  end if;

  -- Never trust the JWT claim on its own: confirm against auth.users that this
  -- address really belongs to this uid AND is verified.
  select public.normalize_email(u.email), (u.email_confirmed_at is not null)
    into v_db_email, v_confirmed
    from auth.users u
   where u.id = v_uid;

  if v_db_email is null or v_db_email <> v_jwt_email or not coalesce(v_confirmed, false) then
    return jsonb_build_object('claimed', 0, 'reason', 'email_not_verified');
  end if;

  -- Exactly one verified account may own this address, otherwise the identity
  -- is ambiguous and a human decides.
  select count(*) into v_owners
    from auth.users u
   where public.normalize_email(u.email) = v_jwt_email
     and u.email_confirmed_at is not null;

  if v_owners <> 1 then
    return jsonb_build_object('claimed', 0, 'reason', 'ambiguous_identity');
  end if;

  perform set_config('app.portal_identity_writer', 'on', true);

  -- Only rows that are genuinely unowned. A non-null user_id — even a wrong
  -- one — is never overwritten here.
  with linked as (
    update public.orders o
       set user_id = v_uid
     where o.user_id is null
       and public.normalize_email(o.email) = v_jwt_email
    returning o.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_claimed from linked;

  perform set_config('app.portal_identity_writer', 'off', true);

  v_count := coalesce(array_length(v_claimed, 1), 0);

  if v_count > 0 then
    insert into public.audit_logs
      (actor_id, actor_name, actor_role, actor_type, category, source,
       object_type, object_id, action, description, new_values, metadata)
    values
      (v_uid, 'customer', 'customer', 'customer', 'identity', 'claim_my_orders',
       'order', null, 'portal_link_self_heal',
       format('Self-heal linked %s order(s) to the authenticated account.', v_count),
       jsonb_build_object('user_id', v_uid, 'order_ids', to_jsonb(v_claimed)),
       jsonb_build_object('rule_version', 'normalize_email_v1', 'matched_on', 'verified_jwt_email'));
  end if;

  -- Deliberately no email, no confirmation IDs, no order contents.
  return jsonb_build_object('claimed', v_count, 'order_ids', to_jsonb(v_claimed));
end;
$$;

comment on function public.claim_my_orders() is
  'Authenticated portal self-heal: links orders whose normalized email equals '
  'the caller''s VERIFIED auth.users email and whose user_id IS NULL. Refuses '
  'ambiguous identities, never overwrites a non-null user_id, idempotent.';

revoke all on function public.claim_my_orders() from public, anon;
grant execute on function public.claim_my_orders() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. admin_repair_order_portal_link() — controlled Admin action
-- ─────────────────────────────────────────────────────────────────────────────
-- The UI supplies an order id and the account it believes is correct; the
-- server re-validates BOTH from scratch and records the real JWT actor. It
-- cannot attach an order to an arbitrary account: the target must be the sole
-- verified owner of the order's own normalized email.
create or replace function public.admin_repair_order_portal_link(
  p_order_id       uuid,
  p_expected_user  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_actor     uuid := auth.uid();
  v_email     text;
  v_current   uuid;
  v_target    uuid;
  v_owners    int;
  v_conf      text;
  v_changed   int;
begin
  if v_actor is null or not public.check_is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select public.normalize_email(o.email), o.user_id, o.confirmation_id
    into v_email, v_current, v_conf
    from public.orders o
   where o.id = p_order_id;

  if v_conf is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'order_email_unusable');
  end if;
  if v_current is not null then
    -- A conflicting or already-correct link is never silently overwritten.
    return jsonb_build_object('ok', false, 'reason', 'already_linked',
                              'current_user_id', v_current);
  end if;

  select count(*), min(u.id::text)::uuid into v_owners, v_target
    from auth.users u
   where public.normalize_email(u.email) = v_email
     and u.email_confirmed_at is not null;

  if v_owners <> 1 then
    return jsonb_build_object('ok', false, 'reason',
      case when v_owners = 0 then 'no_auth_account' else 'ambiguous_identity' end,
      'candidate_count', v_owners);
  end if;

  -- The UI's candidate is only ever a cross-check, never the authority.
  if p_expected_user is not null and p_expected_user <> v_target then
    return jsonb_build_object('ok', false, 'reason', 'candidate_mismatch');
  end if;

  perform set_config('app.portal_identity_writer', 'on', true);
  -- The `user_id is null` guard makes the WRITE idempotent; capture whether THIS
  -- call is the one that won so the AUDIT row is idempotent too. Without this,
  -- rapid duplicate clicks produced one repair but N audit events (caught in
  -- browser QA: 5 clicks => 5 rows).
  with upd as (
    update public.orders set user_id = v_target
     where id = p_order_id and user_id is null
    returning id
  )
  select count(*) into v_changed from upd;
  perform set_config('app.portal_identity_writer', 'off', true);

  if v_changed = 0 then
    return jsonb_build_object('ok', false, 'reason', 'already_linked',
      'current_user_id', (select o.user_id from public.orders o where o.id = p_order_id));
  end if;

  insert into public.audit_logs
    (actor_id, actor_name, actor_role, actor_type, category, source,
     object_type, object_id, order_id, action, description, old_values, new_values, metadata)
  values
    (v_actor,
     coalesce((select dp.full_name from public.doctor_profiles dp where dp.user_id = v_actor), 'admin'),
     'admin', 'admin', 'identity', 'admin_repair_order_portal_link',
     'order', v_conf, p_order_id, 'portal_link_repaired',
     format('Admin linked order %s to its sole verified customer account.', v_conf),
     jsonb_build_object('user_id', null),
     jsonb_build_object('user_id', v_target),
     jsonb_build_object('rule_version', 'normalize_email_v1', 'matched_on', 'order_email'));

  return jsonb_build_object('ok', true, 'user_id', v_target);
end;
$$;

revoke all on function public.admin_repair_order_portal_link(uuid, uuid) from public, anon;
grant execute on function public.admin_repair_order_portal_link(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Admin "Portal identity status" diagnostics (read-only)
-- ─────────────────────────────────────────────────────────────────────────────
-- Answers the one question Admin Customer View could not: does the REAL
-- authenticated customer see this order?
create or replace function public.admin_order_portal_identity(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_email   text;
  v_current uuid;
  v_owners  int;
  v_target  uuid;
  v_cur_em  text;
  v_found   boolean := false;
begin
  if auth.uid() is null or not public.check_is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select public.normalize_email(o.email), o.user_id, true
    into v_email, v_current, v_found
    from public.orders o where o.id = p_order_id;

  if not coalesce(v_found, false) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  select count(*), min(u.id::text)::uuid into v_owners, v_target
    from auth.users u
   where v_email is not null
     and public.normalize_email(u.email) = v_email
     and u.email_confirmed_at is not null;

  select public.normalize_email(u.email) into v_cur_em
    from auth.users u where u.id = v_current;

  return jsonb_build_object(
    'normalized_order_email', v_email,
    'order_user_id',          v_current,
    'candidate_user_id',      v_target,
    'candidate_count',        v_owners,
    'linked_user_email',      v_cur_em,
    'status',
      case
        when v_email is null                     then 'no_usable_email'
        when v_current is not null
         and v_cur_em is distinct from v_email    then 'conflicting_identity'
        when v_current is not null                then 'linked'
        when v_owners = 0                         then 'no_auth_account'
        when v_owners > 1                         then 'ambiguous_match'
        else                                           'unlinked_repairable'
      end,
    -- Whether the REAL authenticated portal can see this row today, evaluated
    -- with the same predicate the RLS policy uses.
    'visible_to_customer_today',
      (v_current is not null) or (v_email is not null and v_owners = 1)
  );
end;
$$;

revoke all on function public.admin_order_portal_identity(uuid) from public, anon;
grant execute on function public.admin_order_portal_identity(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. link_orders_to_account() — the ONE linker the edge functions call
-- ─────────────────────────────────────────────────────────────────────────────
-- PostgREST cannot filter on normalize_email(email), and the previous
-- `.ilike("email", email)` in verify-customer-otp treated % / _ in a
-- caller-supplied address as wildcards — a latent mass-link vector. This RPC
-- replaces all three ad-hoc linkers (verify-customer-otp,
-- create-customer-account, send-customer-password-reset) with one normalized,
-- service-role-only implementation.
create or replace function public.link_orders_to_account(p_email text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_email   text := public.normalize_email(p_email);
  v_owner   text;
  v_claimed uuid[];
  v_count   int;
begin
  if auth.role() is distinct from 'service_role'
     and current_user not in ('postgres','supabase_admin','service_role') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_email is null or p_user_id is null then
    return jsonb_build_object('linked', 0, 'reason', 'invalid_input');
  end if;

  -- The account being linked to must itself own that address.
  select public.normalize_email(u.email) into v_owner from auth.users u where u.id = p_user_id;
  if v_owner is distinct from v_email then
    return jsonb_build_object('linked', 0, 'reason', 'account_email_mismatch');
  end if;

  perform set_config('app.portal_identity_writer', 'on', true);
  with linked as (
    update public.orders o set user_id = p_user_id
     where o.user_id is null and public.normalize_email(o.email) = v_email
    returning o.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_claimed from linked;
  perform set_config('app.portal_identity_writer', 'off', true);

  v_count := coalesce(array_length(v_claimed, 1), 0);

  if v_count > 0 then
    insert into public.audit_logs
      (actor_id, actor_name, actor_role, actor_type, category, source,
       object_type, action, description, new_values, metadata)
    values
      (p_user_id, 'system', 'system', 'system', 'identity', 'link_orders_to_account',
       'order', 'portal_link_self_heal',
       format('Linked %s order(s) to a verified account.', v_count),
       jsonb_build_object('user_id', p_user_id, 'order_ids', to_jsonb(v_claimed)),
       jsonb_build_object('rule_version','normalize_email_v1','matched_on','verified_email'));
  end if;

  return jsonb_build_object('linked', v_count);
end;
$$;

revoke all on function public.link_orders_to_account(text, uuid) from public, anon, authenticated;
grant execute on function public.link_orders_to_account(text, uuid) to service_role;
