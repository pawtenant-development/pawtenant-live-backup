-- ADMIN-ORDER-DELETE-REPAIR-002 — 2026-09-16
--
-- Why this exists
-- ---------------
-- ADMIN-ORDER-DELETE-REPAIR-001 (2026-08-09) moved the order purge out of the
-- browser and into this admin-gated SECURITY DEFINER RPC, and hand-listed the
-- children that block a delete: the self-FK (parent_order_id) and, on LIVE
-- only, the two google_ads_conversion_* tables.
--
-- That hand-list drifted the moment the Partner Platform shipped. It added
-- four more blocking references to public.orders that the RPC never learned
-- about:
--
--     partner_billable_events.order_id            NO ACTION
--     partner_intake_drafts.committed_order_id    RESTRICT
--     partner_order_drafts.submitted_order_id     RESTRICT
--     partner_order_reconciliations.order_id      RESTRICT
--
-- An order touched by any of them failed with a bare Postgres 23503 string
-- naming a constraint the administrator has no way to interpret.
--
-- The fix is to stop hand-listing. This version reads the blocking children
-- straight out of pg_constraint at call time: every foreign key that points at
-- public.orders with ON DELETE NO ACTION or RESTRICT is, by definition, a
-- delete blocker. A future migration can add as many as it likes and this
-- function reports them correctly without being touched. Everything declared
-- CASCADE or SET NULL is left to the database, exactly as before.
--
-- What is deliberately UNCHANGED
-- ------------------------------
--   * The admin gate (public.check_is_admin()), and its 42501 error.
--   * doctor_earnings and shared_order_notes are still cleared by this
--     function — they are NO ACTION but purging them has always been part of
--     what "delete this order" means here.
--   * Nothing else is deleted. Partner billing events, partner provenance
--     drafts/reconciliations and Google Ads conversion records are financial
--     and audit records: this function REFUSES and explains, it never destroys
--     them. That follows the precedent already set for the ads tables rather
--     than inventing a new destructive behaviour.
--   * SECURITY DEFINER is still what satisfies the order_price_quotes
--     append-only trigger's DELETE exemption.
--
-- Return contract (consumed by src/lib/adminDeleteOrder.ts)
-- --------------------------------------------------------
--   { ok: true,  confirmation_id, doctor_earnings_deleted, shared_order_notes_deleted }
--   { ok: false, error: 'order_not_found' }
--   { ok: false, error: 'has_child_orders', child_count }
--   { ok: false, error: 'blocked_by_related_records',
--                blocking: { "<table>.<column>": <row count>, ... },
--                blocking_tables: [ "<table>", ... ] }
--
-- 'blocked_by_related_records' is the single code for every non-child blocker.
-- The caller renders the reason from `blocking`, so a newly added constraint
-- produces a useful sentence on day one instead of a raw SQLSTATE.

create or replace function public.admin_delete_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_confirmation_id text;
  v_children   int;
  v_earnings   int;
  v_notes      int;
  v_blocking   jsonb := '{}'::jsonb;
  v_tables     text[] := '{}';
  v_count      bigint;
  v_constraint text;
  v_detail     text;
  rec          record;
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

  -- Child orders (Additional-Pet) keep their own dedicated message: deleting
  -- the parent would orphan them, and the operator's next step is different
  -- from every other blocker.
  select count(*) into v_children
    from public.orders where parent_order_id = p_order_id;
  if v_children > 0 then
    return jsonb_build_object(
      'ok', false, 'error', 'has_child_orders', 'child_count', v_children);
  end if;

  -- Catalog-driven blocker scan. Any FK into public.orders declared NO ACTION
  -- ('a') or RESTRICT ('r') will abort the delete, so ask the catalog which
  -- those are instead of trusting a list that goes stale.
  for rec in
    select src.relname::text as child_table,
           att.attname::text as child_column
      from pg_constraint c
      join pg_class src on src.oid = c.conrelid
      join pg_class tgt on tgt.oid = c.confrelid
      join lateral unnest(c.conkey) as k(attnum) on true
      join pg_attribute att
        on att.attrelid = src.oid and att.attnum = k.attnum
     where c.contype = 'f'
       and c.confdeltype in ('a', 'r')
       and tgt.relname = 'orders'
       and tgt.relnamespace = 'public'::regnamespace
       and src.relnamespace = 'public'::regnamespace
       -- the self-FK is reported above with its own message
       and src.relname <> 'orders'
       -- these two are cleared by this function, not reported as blockers
       and src.relname not in ('doctor_earnings', 'shared_order_notes')
     order by src.relname, att.attname
  loop
    execute format('select count(*) from public.%I where %I = $1',
                   rec.child_table, rec.child_column)
      into v_count
      using p_order_id;

    if v_count > 0 then
      v_blocking := v_blocking || jsonb_build_object(
        rec.child_table || '.' || rec.child_column, v_count);
      if not (rec.child_table = any(v_tables)) then
        v_tables := v_tables || rec.child_table;
      end if;
    end if;
  end loop;

  if v_blocking <> '{}'::jsonb then
    return jsonb_build_object(
      'ok', false,
      'error', 'blocked_by_related_records',
      'blocking', v_blocking,
      'blocking_tables', to_jsonb(v_tables));
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

exception
  -- Belt and braces. The scan above should catch every blocker, but a
  -- deferred constraint or a trigger-raised FK error must still reach the
  -- administrator as a sentence rather than a raw SQLSTATE.
  when foreign_key_violation then
    get stacked diagnostics
      v_constraint = constraint_name,
      v_detail     = pg_exception_detail;
    return jsonb_build_object(
      'ok', false,
      'error', 'blocked_by_related_records',
      'blocking', jsonb_build_object(coalesce(v_constraint, 'unknown_constraint'), 1),
      'blocking_tables', to_jsonb(array[coalesce(v_constraint, 'unknown_constraint')]),
      'detail', v_detail);
end;
$function$;

-- Privileges: admins call this through PostgREST as `authenticated`. Nothing
-- else may execute it — the function's own check_is_admin() gate is the real
-- authorisation, this just removes the surface. (Memory rule: revoke from
-- public/anon/authenticated BY NAME, then grant back only what is needed.)
revoke all on function public.admin_delete_order(uuid) from public;
revoke all on function public.admin_delete_order(uuid) from anon;
revoke all on function public.admin_delete_order(uuid) from authenticated;
grant execute on function public.admin_delete_order(uuid) to authenticated;
grant execute on function public.admin_delete_order(uuid) to service_role;

comment on function public.admin_delete_order(uuid) is
  'ADMIN-ORDER-DELETE-REPAIR-002: admin-gated hard delete of an order. Blocking '
  'children are read from pg_constraint at call time (NO ACTION / RESTRICT FKs '
  'into public.orders) so the refusal reason can never drift out of date with '
  'the schema. Clears doctor_earnings + shared_order_notes; refuses rather than '
  'destroying partner billing/provenance and Google Ads conversion records.';
