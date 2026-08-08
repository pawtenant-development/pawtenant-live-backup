-- ADMIN-ORDER-DELETE-REPAIR-001 — LIVE arm.
--
-- NOT a copy of the TEST migration. The blocker set genuinely differs:
--   TEST blockers: doctor_earnings, shared_order_notes, orders.parent_order_id
--   LIVE blockers: those THREE plus
--                  google_ads_conversion_adjustments (RESTRICT — CASCADE on TEST)
--                  google_ads_conversion_uploads     (RESTRICT — absent on TEST)
-- Pasting the TEST function here would have left LIVE deletes failing for any
-- order carrying Google Ads conversion records.
--
-- WHAT IS BROKEN ON LIVE
-- ----------------------
-- `order_price_quotes` CASCADEs from `orders` and its append-only trigger
-- raises on EVERY delete. A cascade fires child row triggers, so the child
-- vetoes the parent delete: any order that ever reached checkout is
-- permanently undeletable — measured here, 1073 of 1905 orders (56.3%), and
-- rising, because create-payment-intent issues a quote per call. It is not an
-- FK error, so the admin screen's FK-message parser does not even match it.

-- ── 0. Shape guard — refuse to run against an unexpected trigger body ───────
-- TEST and LIVE arms legitimately differ, so this asserts the thing it is
-- about to replace is the exact unconditional-raise shape it expects.
do $$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where proname = 'order_price_quotes_immutable';
  if v_def is null then
    raise exception 'ABORT: order_price_quotes_immutable() not found on this database';
  end if;
  if position('tg_op = ''DELETE''' in v_def) > 0 then
    raise notice 'order_price_quotes_immutable() already carries the DELETE exemption — re-applying is idempotent';
  elsif position('append-only (attempted %)' in v_def) = 0 then
    raise exception 'ABORT: unexpected order_price_quotes_immutable() body — review before replacing. Got: %', v_def;
  end if;
end $$;

-- ── 1. Narrow the append-only guard to what it is actually for ─────────────
-- A quote is a PRICE RECORD: the invariant worth protecting is that one is
-- never REWRITTEN — that is what makes it trustworthy as a charge basis.
-- UPDATE therefore stays banned for absolutely everyone, including the server.
--
-- An unconditional DELETE ban protects nothing extra, because quotes only ever
-- go away as part of deleting the whole parent order. DELETE is now permitted
-- ONLY for the privileged server roles, i.e. a deliberate server-side purge.
-- An anon or authenticated client session still cannot delete a quote.
create or replace function public.order_price_quotes_immutable()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if tg_op = 'DELETE'
     and (auth.role() = 'service_role'
          or current_user in ('postgres', 'supabase_admin', 'service_role'))
  then
    return old;
  end if;

  raise exception 'order_price_quotes is append-only (attempted %)', tg_op
    using errcode = '42501';
end;
$function$;

-- ── 2. One server-side, admin-gated purge ──────────────────────────────────
-- SECURITY DEFINER so it runs as the function owner: that is what satisfies
-- the exemption above, and it is why this cannot be done from the browser.
--
-- Only the NO ACTION children are removed. The two RESTRICT children are
-- REFUSED rather than deleted: those rows record what was reported to Google
-- Ads, and destroying that provenance silently would desync conversion and
-- refund-retraction accounting. RESTRICT is a deliberate "do not delete this
-- order" signal, so the RPC names it and lets an operator decide.
create or replace function public.admin_delete_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_confirmation_id text;
  v_children    int;
  v_adjustments int;
  v_uploads     int;
  v_earnings    int;
  v_notes       int;
begin
  if not coalesce(public.check_is_admin(), false) then
    raise exception 'admin access required to delete an order'
      using errcode = '42501';
  end if;

  select confirmation_id into v_confirmation_id
    from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  select count(*) into v_children
    from public.orders where parent_order_id = p_order_id;
  if v_children > 0 then
    return jsonb_build_object(
      'ok', false, 'error', 'has_child_orders', 'child_count', v_children);
  end if;

  select count(*) into v_adjustments
    from public.google_ads_conversion_adjustments where order_id = p_order_id;
  select count(*) into v_uploads
    from public.google_ads_conversion_uploads where order_id = p_order_id;
  if (v_adjustments + v_uploads) > 0 then
    return jsonb_build_object(
      'ok', false, 'error', 'has_ad_conversion_records',
      'adjustments', v_adjustments, 'uploads', v_uploads);
  end if;

  delete from public.doctor_earnings    where order_id = p_order_id;
  get diagnostics v_earnings = row_count;

  delete from public.shared_order_notes where order_id = p_order_id;
  get diagnostics v_notes = row_count;

  delete from public.orders where id = p_order_id;

  return jsonb_build_object(
    'ok', true,
    'confirmation_id', v_confirmation_id,
    'doctor_earnings_deleted', v_earnings,
    'shared_order_notes_deleted', v_notes);
end;
$function$;

-- `revoke ... from public` does NOT undo the default PUBLIC execute grant on
-- functions, so each role is named explicitly.
revoke all on function public.admin_delete_order(uuid) from public;
revoke all on function public.admin_delete_order(uuid) from anon;
revoke all on function public.admin_delete_order(uuid) from authenticated;

-- `authenticated` is granted deliberately: the admin console calls this with a
-- normal customer-tier JWT. Authorisation is the `check_is_admin()` gate INSIDE
-- the function, not the grant — a signed-in non-admin gets 42501, anon is
-- refused at the grant and never reaches the body.
grant execute on function public.admin_delete_order(uuid) to authenticated;
grant execute on function public.admin_delete_order(uuid) to service_role;

comment on function public.admin_delete_order(uuid) is
  'ADMIN-ORDER-DELETE-REPAIR-001 (LIVE arm). Admin-gated permanent order purge. '
  'Runs as definer so the order_price_quotes append-only DELETE exemption '
  'applies; the browser cannot do this directly. Deletes the NO ACTION children '
  '(doctor_earnings, shared_order_notes); REFUSES orders that still have child '
  'orders or Google Ads conversion records (RESTRICT) rather than destroying '
  'them. Everything else CASCADEs.';
