-- PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 (part 6)
--
-- Found by the deployed-surface QA: the three admin READ projections were
-- `language sql` with is_chat_admin() inside the WHERE clause, so a partner
-- caller received HTTP 200 and an empty array instead of a refusal.
--
-- No data leaked either way. The problem is the SHAPE of the gate. A predicate
-- buried in a WHERE clause can be dropped by a later edit and the function
-- would silently begin returning every partner's rows; an explicit check at the
-- top fails loudly if it is ever removed, and tells an honest caller why it was
-- refused instead of pretending there is nothing to see.
create or replace function public.partner_admin_list_users(p_partner_id uuid default null)
returns table(
  id uuid, partner_id uuid, partner_name text, email text, role text, status text,
  invited_by_email text, invited_at timestamptz, invitation_sent_count integer,
  invitation_last_sent_at timestamptz, accepted_at timestamptz, revoked_at timestamptz,
  revoke_reason text, last_access_at timestamptz, has_auth_user boolean
)
language plpgsql stable security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return query
    select u.id, u.partner_id, o.display_name, u.email, u.role, u.status,
           u.invited_by_email, u.invited_at, u.invitation_sent_count,
           u.invitation_last_sent_at, u.accepted_at, u.revoked_at, u.revoke_reason,
           u.last_access_at, (u.user_id is not null)
      from public.partner_users u
      join public.partner_organizations o on o.id = u.partner_id
     where (p_partner_id is null or u.partner_id = p_partner_id)
     order by o.display_name, u.email;
end;
$fn$;

create or replace function public.partner_admin_invoiceable_orders(p_partner_id uuid)
returns table(
  order_id uuid, confirmation_id text, service text, amount_cents integer, currency text,
  completed_at timestamptz, billable_event_id uuid, rate_card_version integer
)
language plpgsql stable security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return query
    select o.id, o.confirmation_id, e.service, e.amount_cents, e.currency,
           e.occurred_at, e.id, e.rate_card_version
      from public.partner_billable_events e
      join public.orders o on o.id = e.order_id
      join public.partner_order_financials f on f.order_id = e.order_id
     where e.partner_id = p_partner_id
       and e.event_kind = 'charge'
       and f.invoice_eligible = true
       and f.invoice_status = 'uninvoiced'
       and not exists (
         select 1 from public.partner_invoice_lines l
           join public.partner_invoices i on i.id = l.invoice_id
          where l.billable_event_id = e.id and i.status <> 'void')
     order by e.occurred_at;
end;
$fn$;

create or replace function public.partner_admin_billing_summary(p_partner_id uuid default null)
returns table(
  partner_id uuid, partner_name text, currency text,
  orders_awaiting_invoice integer, awaiting_invoice_cents integer,
  open_invoice_count integer, open_invoice_cents integer,
  paid_invoice_count integer, paid_invoice_cents integer,
  orders_unreconciled integer, unreconciled_cents integer,
  orders_paid integer, paid_order_cents integer,
  partner_charges_cents integer, provider_cost_cents integer, adjustments_cents integer,
  net_contribution_cents integer
)
language plpgsql stable security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return query
  with scope as (
    select o.id as partner_id, o.display_name, coalesce(bp.currency, 'USD') as currency
      from public.partner_organizations o
      left join public.partner_billing_profiles bp on bp.partner_id = o.id
     where (p_partner_id is null or o.id = p_partner_id)
  ),
  fin as (
    select f.partner_id,
           count(*) filter (where f.invoice_status = 'uninvoiced' and f.invoice_eligible)::int as await_n,
           coalesce(sum(f.wholesale_fee_cents) filter (where f.invoice_status = 'uninvoiced' and f.invoice_eligible), 0)::int as await_c,
           count(*) filter (where f.invoice_status = 'invoice_paid_unreconciled')::int as unrec_n,
           coalesce(sum(f.wholesale_fee_cents) filter (where f.invoice_status = 'invoice_paid_unreconciled'), 0)::int as unrec_c,
           count(*) filter (where f.invoice_status = 'paid')::int as paid_n,
           coalesce(sum(f.wholesale_fee_cents) filter (where f.invoice_status = 'paid'), 0)::int as paid_c,
           coalesce(sum(f.wholesale_fee_cents) filter (where f.billable_status = 'billable'), 0)::int as charges_c
      from public.partner_order_financials f
     group by f.partner_id
  ),
  inv as (
    select i.partner_id,
           count(*) filter (where i.status in ('issued','partially_paid'))::int as open_n,
           coalesce(sum(i.total_cents) filter (where i.status in ('issued','partially_paid')), 0)::int as open_c,
           count(*) filter (where i.status = 'paid')::int as paid_n,
           coalesce(sum(i.amount_paid_cents) filter (where i.status = 'paid'), 0)::int as paid_c
      from public.partner_invoices i
     group by i.partner_id
  ),
  adj as (
    select e.partner_id, coalesce(sum(e.amount_cents) filter (where e.event_kind = 'credit'), 0)::int as adj_c
      from public.partner_billable_events e group by e.partner_id
  ),
  earn as (
    -- Provider cost actually recorded against this partner's orders. The
    -- snapshot column is a projection; the ledger is what was really earned.
    select d.partner_id, (coalesce(sum(d.doctor_amount), 0) * 100)::int as cost_c
      from public.doctor_earnings d where d.partner_id is not null group by d.partner_id
  )
  select s.partner_id, s.display_name, s.currency,
         coalesce(f.await_n,0), coalesce(f.await_c,0),
         coalesce(v.open_n,0), coalesce(v.open_c,0),
         coalesce(v.paid_n,0), coalesce(v.paid_c,0),
         coalesce(f.unrec_n,0), coalesce(f.unrec_c,0),
         coalesce(f.paid_n,0), coalesce(f.paid_c,0),
         coalesce(f.charges_c,0), coalesce(e.cost_c,0), coalesce(a.adj_c,0),
         coalesce(f.charges_c,0) - coalesce(e.cost_c,0) + coalesce(a.adj_c,0)
    from scope s
    left join fin  f on f.partner_id = s.partner_id
    left join inv  v on v.partner_id = s.partner_id
    left join adj  a on a.partner_id = s.partner_id
    left join earn e on e.partner_id = s.partner_id
   order by s.display_name;
end;
$fn$;

revoke all on function public.partner_admin_list_users(uuid) from public, anon;
revoke all on function public.partner_admin_invoiceable_orders(uuid) from public, anon;
revoke all on function public.partner_admin_billing_summary(uuid) from public, anon;
grant execute on function public.partner_admin_list_users(uuid) to authenticated;
grant execute on function public.partner_admin_invoiceable_orders(uuid) to authenticated;
grant execute on function public.partner_admin_billing_summary(uuid) to authenticated;
