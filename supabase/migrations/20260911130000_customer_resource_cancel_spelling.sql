-- ESA-PSD-PLANNERS-MARKETING-LIVE-001 — harden the customer-resource
-- eligibility predicate against BOTH spellings of a cancelled order.
--
-- The LIVE access matrix (run inside a rolled-back transaction, no residue)
-- proved that an order whose status is the US spelling `canceled` but which
-- still carries a payment intent stayed eligible for the planner. LIVE data
-- carries both spellings (`cancelled` ×21, `canceled` ×1 — the latter unpaid,
-- so nothing had leaked), and the status exclusion list only named one.
-- Same body as 20260909120000 otherwise: paid / partially refunded per the
-- canonical order_payment_state(), and the order's service family must equal
-- the slot's family. Idempotent; no data is rewritten.
create or replace function public.customer_resource_order_eligible(o public.orders, p_family text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_family in ('esa', 'psd')
     and coalesce(o.status, '') not in ('lead', 'cancelled', 'canceled', 'archived', 'refunded', 'disputed')
     and public.order_payment_state(o) in ('paid', 'partially_refunded')
     and public.order_service_family(
           o.letter_type, o.package_key, o.package_display_name, o.plan_type, o.parent_order_id
         ) = p_family;
$$;

-- create or replace re-applies default privileges: revoke by NAME again.
revoke all on function public.customer_resource_order_eligible(public.orders, text) from public, anon, authenticated;
grant execute on function public.customer_resource_order_eligible(public.orders, text) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.customer_resource_order_eligible(public.orders, text)', 'execute') then
    raise exception 'anon can execute customer_resource_order_eligible';
  end if;
  if has_function_privilege('authenticated', 'public.customer_resource_order_eligible(public.orders, text)', 'execute') then
    raise exception 'authenticated can execute customer_resource_order_eligible';
  end if;
end $$;
