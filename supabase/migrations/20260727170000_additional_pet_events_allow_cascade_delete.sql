-- ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001 · correction
--
-- The append-only trigger on order_additional_pet_request_events blocked EVERY
-- delete, including the ON DELETE CASCADE from its parent request (and, through
-- it, from orders). That made an order row undeletable: the cascade fired the
-- trigger and the whole statement aborted. Erasure and fixture teardown were
-- impossible.
--
-- "Append-only" must mean history is never REWRITTEN, not that a record can
-- outlive its parent. So:
--   • UPDATE is still forbidden, always.
--   • A standalone DELETE is still forbidden.
--   • A CASCADE delete is allowed: in a cascade the parent request row is
--     removed first, so if the parent no longer exists the delete is part of a
--     legitimate lifecycle teardown rather than history tampering.
--
-- Both negative controls were re-proven on TEST after this change: an UPDATE
-- raises, and a standalone DELETE (parent present) raises.
create or replace function public.tg_addpet_events_append_only()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'order_additional_pet_request_events is append-only: history cannot be rewritten'
      using errcode = 'check_violation';
  end if;

  -- DELETE: permitted only as part of the parent's cascade.
  if exists (select 1 from public.order_additional_pet_requests r where r.id = old.request_id) then
    raise exception 'order_additional_pet_request_events is append-only: an event cannot be deleted while its request still exists'
      using errcode = 'check_violation';
  end if;

  return old;
end;
$$;

revoke all on function public.tg_addpet_events_append_only() from public, anon, authenticated;
