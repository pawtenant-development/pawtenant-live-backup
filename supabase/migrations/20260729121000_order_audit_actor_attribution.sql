-- PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001 · Part B
--
-- The owner needs to be able to answer, per order: WHO assigned the provider,
-- WHO initiated a refund, WHO marked it under review or complete, WHO texted or
-- emailed the customer, and WHO approved and delivered the document.
--
-- audit_logs already exists and is already the right table — it is extended
-- here rather than replaced. Every new column is nullable and nothing is
-- backfilled: an old row whose actor cannot be PROVEN keeps a NULL actor and
-- the timeline renders it as "Legacy event · actor unavailable". Inferring an
-- employee from the current assignee would be a fabricated audit trail.

begin;

alter table public.audit_logs
  add column if not exists actor_type       text,
  add column if not exists category         text,
  add column if not exists source           text,
  add column if not exists order_id         uuid,
  add column if not exists entity_type      text,
  add column if not exists entity_id        text,
  add column if not exists communication_id uuid,
  add column if not exists document_id      uuid,
  add column if not exists refund_reference text,
  add column if not exists provider_id      uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'audit_logs_actor_type_check') then
    alter table public.audit_logs
      add constraint audit_logs_actor_type_check
      check (actor_type is null or actor_type in
        ('employee','admin','provider','customer','system','webhook'));
  end if;
end $$;

create index if not exists idx_audit_logs_order_id
  on public.audit_logs (order_id, created_at desc)
  where order_id is not null;

create index if not exists idx_audit_logs_object_id_created
  on public.audit_logs (object_id, created_at desc);

comment on column public.audit_logs.actor_type is
  'Who acted: employee/admin = a real person; system/webhook = automated. An automated action must NEVER be recorded as employee.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Order status change with SERVER-SIDE actor attribution.
--
-- This replaces a bare client-side `update orders set status = ...` which wrote
-- NO audit row at all — the "who marked this complete?" question was previously
-- unanswerable for the ordinary status control. Attribution is auth.uid(); the
-- client cannot supply an actor.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_order_status_action(
  p_order_id          uuid,
  p_new_status        text,
  p_new_doctor_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order    public.orders;
  v_actor_id uuid := auth.uid();
  v_name     text;
  v_role     text;
  v_old_s    text;
  v_old_ds   text;
  v_action   text;
begin
  if not public.is_admin_staff() then
    raise exception 'record_order_status_action: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'record_order_status_action: order % not found', p_order_id;
  end if;

  v_old_s  := v_order.status;
  v_old_ds := v_order.doctor_status;

  if p_new_status is null and p_new_doctor_status is null then
    raise exception 'record_order_status_action: nothing to change'
      using errcode = 'check_violation';
  end if;

  -- Idempotent: a repeated click that changes nothing writes no audit row.
  if coalesce(p_new_status, v_old_s) is not distinct from v_old_s
     and coalesce(p_new_doctor_status, v_old_ds) is not distinct from v_old_ds then
    return jsonb_build_object('transitioned', false, 'reason', 'no_change',
      'status', v_old_s, 'doctor_status', v_old_ds);
  end if;

  update public.orders
     set status        = coalesce(p_new_status, status),
         doctor_status = coalesce(p_new_doctor_status, doctor_status)
   where id = p_order_id
  returning * into v_order;

  select display_name, role into v_name, v_role from public.current_staff_actor();
  v_name := coalesce(v_name, 'Employee');
  v_role := coalesce(v_role, 'admin');

  v_action := case
    when v_order.status = 'under-review' then 'order_marked_under_review'
    when v_order.status = 'completed'    then 'order_marked_complete'
    when v_old_s in ('completed','cancelled') and v_order.status not in ('completed','cancelled')
                                         then 'order_reopened'
    else 'order_status_updated'
  end;

  insert into public.audit_logs (
    actor_id, actor_name, actor_role, actor_type, category, source,
    object_type, object_id, order_id, entity_type, entity_id,
    action, description, old_values, new_values, metadata
  ) values (
    v_actor_id, v_name, v_role, 'employee', 'status', 'admin_portal',
    'order', v_order.confirmation_id, v_order.id, 'order', v_order.id::text,
    v_action,
    format('%s changed the order status from %s to %s.',
           v_name, coalesce(v_old_s, '—'), coalesce(v_order.status, '—')),
    jsonb_build_object('status', v_old_s, 'doctor_status', v_old_ds),
    jsonb_build_object('status', v_order.status, 'doctor_status', v_order.doctor_status),
    jsonb_build_object('order_id', v_order.id, 'confirmation_id', v_order.confirmation_id)
  );

  return jsonb_build_object('transitioned', true, 'action', v_action,
    'status', v_order.status, 'doctor_status', v_order.doctor_status,
    'actor_name', v_name);
end;
$$;

revoke all on function public.record_order_status_action(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_order_status_action(uuid, text, text) to authenticated;

commit;
