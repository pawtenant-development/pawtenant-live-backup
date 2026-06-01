-- Reliable provider-payout resolution per Stripe charge for the admin Payments /
-- Accounts reporting. Resolves completion + provider + payout through the
-- parent_order_id recovery chain so recovery/child orders inherit the provider
-- payout from the completed order in their chain. Payout amount = the linked
-- doctor_earnings amount, else the completing provider's per_order_rate.
-- Also returns chain_paid_count so the UI can flag duplicate/over-charged chains.
-- Read-only, admin/finance gated. Additive + idempotent. TEST (opudhofjbydrljgleofq).

create or replace function public.resolve_charge_payouts(p_payment_intents text[])
returns table (
  payment_intent text,
  order_id uuid,
  confirmation_id text,
  root_order_id uuid,
  completed boolean,
  provider_name text,
  payout_amount numeric,
  payout_source text,        -- 'earning' | 'rate' | 'none'
  classification text,       -- confirmed_completed | confirmed_from_rate | payout_missing_completed | pending_estimated | cancelled_before_completion | none
  chain_paid_count integer   -- paid charges sharing this order's root (duplicate advisory)
)
language plpgsql
security definer
set search_path = public
as $$
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
    -- self + every ancestor for every order (used for root + chain resolution)
    select o.id as order_id, o.id as node_id, o.parent_order_id as pid, 0 as d
    from public.orders o
    union all
    select au.order_id, o.id, o.parent_order_id, au.d + 1
    from all_up au
    join public.orders o on o.id = au.pid
    where au.pid is not null and au.d < 20
  ),
  order_root as (
    select distinct on (order_id) order_id, node_id as root_id
    from all_up
    order by order_id, d desc          -- deepest reachable = root (parent is null)
  ),
  root_paid as (
    select orr.root_id, count(*) filter (where o.paid_at is not null)::int as paid_count
    from order_root orr
    join public.orders o on o.id = orr.order_id
    group by orr.root_id
  ),
  target as (
    select o.id as t_order_id, o.confirmation_id as t_conf, o.payment_intent_id as t_pi, o.status as t_status
    from public.orders o
    where o.payment_intent_id = any (p_payment_intents)
  ),
  chain as (
    -- self + ancestor order fields for each target charge
    select au.order_id as t_order_id, o.id as node_id, o.confirmation_id,
           o.doctor_status, o.doctor_user_id, o.doctor_name
    from all_up au
    join target t on t.t_order_id = au.order_id
    join public.orders o on o.id = au.node_id
  ),
  agg as (
    select c.t_order_id,
      bool_or(c.doctor_status = 'patient_notified') as completed,
      (array_agg(c.doctor_name order by case when c.doctor_status='patient_notified' and c.doctor_user_id is not null then 0 else 1 end)
        filter (where c.doctor_name is not null))[1] as provider_name,
      (array_agg(c.doctor_user_id order by case when c.doctor_status='patient_notified' and c.doctor_user_id is not null then 0 else 1 end)
        filter (where c.doctor_user_id is not null))[1] as provider_user_id
    from chain c
    group by c.t_order_id
  ),
  earn as (
    -- best non-cancelled earning anywhere in the chain
    select c.t_order_id,
      (array_agg(de.doctor_amount order by case when de.doctor_amount is not null then 0 else 1 end))[1] as e_amount,
      (array_agg(de.doctor_name) filter (where de.doctor_name is not null))[1] as e_name
    from chain c
    join public.doctor_earnings de
      on (de.order_id = c.node_id or de.confirmation_id = c.confirmation_id)
     and coalesce(de.status,'') <> 'cancelled'
    group by c.t_order_id
  )
  select
    t.t_pi,
    t.t_order_id,
    t.t_conf,
    orr.root_id,
    coalesce(ag.completed, false),
    coalesce(e.e_name, ag.provider_name),
    (case
      when e.e_amount is not null then e.e_amount
      when coalesce(ag.completed,false) and ag.provider_user_id is not null then dp.per_order_rate
      else 0
    end)::numeric,
    (case
      when e.e_amount is not null then 'earning'
      when coalesce(ag.completed,false) and dp.per_order_rate is not null then 'rate'
      else 'none'
    end),
    (case
      when coalesce(ag.completed,false) and e.e_amount is not null then 'confirmed_completed'
      when coalesce(ag.completed,false) and e.e_amount is null and dp.per_order_rate is not null then 'confirmed_from_rate'
      when coalesce(ag.completed,false) then 'payout_missing_completed'
      when lower(coalesce(t.t_status,'')) in ('cancelled','archived') then 'cancelled_before_completion'
      when ag.provider_user_id is not null or e.e_name is not null then 'pending_estimated'
      else 'none'
    end),
    coalesce(rp.paid_count, 1)
  from target t
  left join order_root orr on orr.order_id = t.t_order_id
  left join root_paid rp on rp.root_id = orr.root_id
  left join agg ag on ag.t_order_id = t.t_order_id
  left join earn e on e.t_order_id = t.t_order_id
  left join public.doctor_profiles dp on dp.user_id = ag.provider_user_id;
end;
$$;

grant execute on function public.resolve_charge_payouts(text[]) to authenticated;
