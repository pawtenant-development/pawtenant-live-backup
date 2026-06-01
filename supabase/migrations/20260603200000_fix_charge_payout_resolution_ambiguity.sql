-- BUGFIX: resolve_charge_payouts() threw "column reference order_id is ambiguous"
-- at runtime (the RETURNS TABLE OUT param `order_id` collided with the unqualified
-- `order_id` used in the order_root CTE). Every call errored, so the Payments UI
-- got an empty resolution map and showed "provider —" for all rows.
-- Fix: rename the internal CTE column order_id -> oid (no behaviour change) and
-- add #variable_conflict use_column as a guard. Read-only, admin/finance gated.
-- TEST (opudhofjbydrljgleofq).

create or replace function public.resolve_charge_payouts(p_payment_intents text[])
returns table (
  payment_intent text, order_id uuid, confirmation_id text, root_order_id uuid,
  completed boolean, provider_name text, payout_amount numeric, payout_source text,
  classification text, chain_paid_count integer
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not exists (
    select 1 from public.doctor_profiles dp
    where dp.user_id = auth.uid()
      and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))
  ) then
    raise exception 'not authorized';
  end if;

  return query
  with recursive
  all_up as (
    select o.id as oid, o.id as node_id, o.parent_order_id as pid, 0 as d
    from public.orders o
    union all
    select au.oid, o.id, o.parent_order_id, au.d + 1
    from all_up au
    join public.orders o on o.id = au.pid
    where au.pid is not null and au.d < 20
  ),
  order_root as (
    select distinct on (oid) oid, node_id as root_id
    from all_up
    order by oid, d desc
  ),
  root_paid as (
    select orr.root_id, count(*) filter (where o.paid_at is not null)::int as paid_count
    from order_root orr
    join public.orders o on o.id = orr.oid
    group by orr.root_id
  ),
  target as (
    select o.id as t_order_id, o.confirmation_id as t_conf, o.payment_intent_id as t_pi, o.status as t_status
    from public.orders o
    where o.payment_intent_id = any (p_payment_intents)
  ),
  chain as (
    select au.oid as t_order_id, o.id as node_id, o.confirmation_id as conf,
           o.doctor_status, o.doctor_user_id, o.doctor_name
    from all_up au
    join target t on t.t_order_id = au.oid
    join public.orders o on o.id = au.node_id
  ),
  agg as (
    select c.t_order_id,
      bool_or(c.doctor_status = 'patient_notified') as is_completed,
      (array_agg(c.doctor_name order by case when c.doctor_status='patient_notified' and c.doctor_user_id is not null then 0 else 1 end)
        filter (where c.doctor_name is not null))[1] as p_name,
      (array_agg(c.doctor_user_id order by case when c.doctor_status='patient_notified' and c.doctor_user_id is not null then 0 else 1 end)
        filter (where c.doctor_user_id is not null))[1] as p_user_id
    from chain c
    group by c.t_order_id
  ),
  earn as (
    select c.t_order_id,
      (array_agg(de.doctor_amount order by case when de.doctor_amount is not null then 0 else 1 end))[1] as e_amount,
      (array_agg(de.doctor_name) filter (where de.doctor_name is not null))[1] as e_name
    from chain c
    join public.doctor_earnings de
      on (de.order_id = c.node_id or de.confirmation_id = c.conf) and coalesce(de.status,'') <> 'cancelled'
    group by c.t_order_id
  )
  select
    t.t_pi,
    t.t_order_id,
    t.t_conf,
    orr.root_id,
    coalesce(ag.is_completed, false),
    coalesce(e.e_name, ag.p_name),
    (case
      when e.e_amount is not null then e.e_amount
      when coalesce(ag.is_completed,false) and ag.p_user_id is not null then dp.per_order_rate
      else 0
    end)::numeric,
    (case
      when e.e_amount is not null then 'earning'
      when coalesce(ag.is_completed,false) and dp.per_order_rate is not null then 'rate'
      else 'none'
    end),
    (case
      when coalesce(ag.is_completed,false) and e.e_amount is not null then 'confirmed_completed'
      when coalesce(ag.is_completed,false) and e.e_amount is null and dp.per_order_rate is not null then 'confirmed_from_rate'
      when coalesce(ag.is_completed,false) then 'payout_missing_completed'
      when lower(coalesce(t.t_status,'')) in ('cancelled','archived') then 'cancelled_before_completion'
      when ag.p_user_id is not null or e.e_name is not null then 'pending_estimated'
      else 'none'
    end),
    coalesce(rp.paid_count, 1)
  from target t
  left join order_root orr on orr.oid = t.t_order_id
  left join root_paid rp on rp.root_id = orr.root_id
  left join agg ag on ag.t_order_id = t.t_order_id
  left join earn e on e.t_order_id = t.t_order_id
  left join public.doctor_profiles dp on dp.user_id = ag.p_user_id;
end;
$$;

grant execute on function public.resolve_charge_payouts(text[]) to authenticated;
