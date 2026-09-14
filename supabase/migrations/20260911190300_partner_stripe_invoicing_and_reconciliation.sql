-- PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 (part 4)
--
-- Stripe partner receivables and manual per-order reconciliation.
--
--   uninvoiced ──(admin selects / weekly cron)──▶ invoiced
--   invoiced ──(signed Stripe invoice.paid)──▶ invoice_paid_unreconciled
--   invoice_paid_unreconciled ──(admin marks the order paid)──▶ paid
--
-- `invoice.paid` stops at the MIDDLE state on purpose. Nothing between an
-- incoming Stripe event and an order's clinical record is automatic.
-- ───────────────────────────────────────────────────────────────────────────
-- 1. WHAT CAN BE INVOICED
--
-- Billable work that is not on any invoice yet. Never customer names, never
-- pet names: an invoice describes an order id, a service and a charge.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.partner_admin_invoiceable_orders(p_partner_id uuid)
returns table(
  order_id uuid, confirmation_id text, service text, amount_cents integer, currency text,
  completed_at timestamptz, billable_event_id uuid, rate_card_version integer
)
language sql
stable
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
  select o.id, o.confirmation_id, e.service, e.amount_cents, e.currency,
         e.occurred_at, e.id, e.rate_card_version
    from public.partner_billable_events e
    join public.orders o on o.id = e.order_id
    join public.partner_order_financials f on f.order_id = e.order_id
   where public.is_chat_admin()
     and e.partner_id = p_partner_id
     and e.event_kind = 'charge'
     and f.invoice_eligible = true
     and f.invoice_status = 'uninvoiced'
     and not exists (
       select 1 from public.partner_invoice_lines l
         join public.partner_invoices i on i.id = l.invoice_id
        where l.billable_event_id = e.id and i.status <> 'void')
   order by e.occurred_at;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. PREPARE AN INVOICE (shared by the admin action and the weekly job)
--
-- Creates the PawTenant-side invoice and locks its orders to it BEFORE Stripe
-- is called, so a Stripe failure leaves a draft we can retry or void — never a
-- silently double-billed order.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.partner_prepare_invoice(
  p_partner_id        uuid,
  p_order_ids         uuid[],
  p_source            text default 'manual',
  p_billing_period_key text default null,
  p_period_start      timestamptz default null,
  p_period_end        timestamptz default null,
  p_due_days          integer default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
declare
  v_is_admin   boolean := coalesce(public.is_chat_admin(), false);
  v_is_service boolean := coalesce(current_setting('request.jwt.claims', true), '') = ''
                          or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role';
  v_prof   public.partner_billing_profiles%rowtype;
  v_inv    public.partner_invoices%rowtype;
  v_ev     public.partner_billable_events%rowtype;
  v_fin    public.partner_order_financials%rowtype;
  v_oid    uuid;
  v_conf   text;
  v_total  integer := 0;
  v_number text;
  v_terms  integer;
  v_ccy    text;
begin
  if not (v_is_admin or v_is_service) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_order_ids is null or cardinality(p_order_ids) = 0 then
    raise exception 'no_orders_selected' using errcode = '22023';
  end if;
  if p_source not in ('manual','weekly') then
    raise exception 'invalid_source' using errcode = '22023';
  end if;

  select * into v_prof from public.partner_billing_profiles where partner_id = p_partner_id;
  if not found then raise exception 'no_billing_profile' using errcode = 'P0002'; end if;
  if v_prof.billing_email is null then raise exception 'no_billing_email' using errcode = 'P0002'; end if;

  -- Retrying a weekly period must find the invoice it already made, not build
  -- a second one.
  if p_billing_period_key is not null then
    select * into v_inv from public.partner_invoices
     where partner_id = p_partner_id and billing_period_key = p_billing_period_key;
    if found then
      return jsonb_build_object('invoice_id', v_inv.id, 'already_existed', true,
                                'invoice_number', v_inv.invoice_number, 'total_cents', v_inv.total_cents,
                                'currency', v_inv.currency, 'status', v_inv.status);
    end if;
  end if;

  v_terms  := coalesce(p_due_days, v_prof.payment_terms_days);
  v_number := 'PTINV-' || to_char(now(), 'YYYY') || '-'
              || lpad(nextval('public.partner_invoice_number_seq')::text, 4, '0');

  insert into public.partner_invoices (
    partner_id, invoice_number, created_by, due_at, source, billing_period_key,
    period_start, period_end, currency, billing_email, stripe_customer_id)
  values (
    p_partner_id, v_number,
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email', 'system'),
    now() + make_interval(days => greatest(v_terms, 0)), p_source, p_billing_period_key,
    p_period_start, p_period_end, v_prof.currency, v_prof.billing_email, v_prof.stripe_customer_id)
  returning * into v_inv;

  foreach v_oid in array p_order_ids loop
    select * into v_fin from public.partner_order_financials where order_id = v_oid for update;
    if not found then raise exception 'order % has no partner financial snapshot', v_oid using errcode = 'P0002'; end if;
    if v_fin.partner_id <> p_partner_id then
      raise exception 'order % belongs to a different partner', v_oid using errcode = '42501';
    end if;
    if v_fin.invoice_eligible is not true then
      raise exception 'order % is not invoice eligible', v_oid using errcode = '22023';
    end if;
    -- The double-billing gate. An order that is already invoiced, already paid
    -- or already credited can never join a second invoice.
    if v_fin.invoice_status <> 'uninvoiced' then
      raise exception 'order % is already %', v_oid, v_fin.invoice_status using errcode = '23505';
    end if;

    select * into v_ev from public.partner_billable_events
     where order_id = v_oid and event_kind = 'charge' limit 1;
    if not found then raise exception 'order % has no billable charge', v_oid using errcode = 'P0002'; end if;

    v_ccy := coalesce(v_ccy, v_ev.currency);
    if v_ev.currency <> v_ccy then
      raise exception 'mixed currencies on one invoice' using errcode = '22023';
    end if;

    select confirmation_id into v_conf from public.orders where id = v_oid;

    -- LINE DESCRIPTION: PawTenant order id, service and charge ONLY. No
    -- customer name, no pet name, no health information — this text is sent to
    -- Stripe and appears on the partner's invoice.
    insert into public.partner_invoice_lines (invoice_id, billable_event_id, service, description, amount_cents)
    values (v_inv.id, v_ev.id, v_ev.service,
            v_conf || ' — ' || upper(v_ev.service) || ' clinical fulfillment',
            v_ev.amount_cents);

    update public.partner_order_financials
       set invoice_status = 'invoiced', invoice_id = v_inv.id, invoice_item_ref = v_conf
     where order_id = v_oid;

    v_total := v_total + v_ev.amount_cents;
  end loop;

  update public.partner_invoices set total_cents = v_total, currency = coalesce(v_ccy, currency)
   where id = v_inv.id
  returning * into v_inv;

  insert into public.audit_logs (actor_type, actor_name, actor_role, object_type, object_id,
                                 action, entity_type, entity_id, category, source, metadata)
  values ('system', coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email', 'system'),
          case when v_is_admin then 'admin' else 'system' end, 'partner_platform', p_partner_id::text,
          'partner_invoice_prepared', 'partner_invoice', v_inv.id::text, 'partner_finance', 'partner_prepare_invoice',
          jsonb_build_object('partner_id', p_partner_id, 'invoice_number', v_inv.invoice_number,
                             'order_count', cardinality(p_order_ids), 'total_cents', v_total,
                             'source', p_source, 'billing_period_key', p_billing_period_key));

  return jsonb_build_object('invoice_id', v_inv.id, 'already_existed', false,
                            'invoice_number', v_inv.invoice_number, 'total_cents', v_inv.total_cents,
                            'currency', v_inv.currency, 'status', v_inv.status,
                            'billing_email', v_inv.billing_email, 'stripe_customer_id', v_inv.stripe_customer_id,
                            'due_at', v_inv.due_at,
                            'lines', coalesce((select jsonb_agg(jsonb_build_object(
                                                 'line_id', l.id, 'description', l.description,
                                                 'amount_cents', l.amount_cents, 'service', l.service) order by l.created_at)
                                                 from public.partner_invoice_lines l where l.invoice_id = v_inv.id), '[]'::jsonb));
end;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. ATTACH THE STRIPE INVOICE (service role only — the edge function)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.partner_attach_stripe_invoice(
  p_invoice_id uuid, p_stripe_customer_id text, p_stripe_invoice_id text,
  p_stripe_invoice_number text, p_hosted_url text, p_stripe_status text, p_idempotency_key text
) returns public.partner_invoices
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
declare v_row public.partner_invoices%rowtype;
begin
  update public.partner_invoices
     set stripe_customer_id = p_stripe_customer_id,
         stripe_invoice_id = p_stripe_invoice_id,
         stripe_invoice_number = p_stripe_invoice_number,
         stripe_hosted_invoice_url = p_hosted_url,
         stripe_status = p_stripe_status,
         stripe_idempotency_key = coalesce(stripe_idempotency_key, p_idempotency_key),
         status = case when status = 'draft' then 'issued' else status end,
         issued_at = coalesce(issued_at, now())
   where id = p_invoice_id
  returning * into v_row;
  if v_row.id is null then raise exception 'invoice_not_found' using errcode = 'P0002'; end if;
  return v_row;
end;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. STRIPE SAYS THE INVOICE IS PAID
--
-- This is the whole of what a paid partner invoice does. It writes to the
-- invoice ledger and moves its orders to `invoice_paid_unreconciled`.
--
-- IT MUST NEVER: touch orders.status / orders.doctor_status, create or modify
-- a document, create a doctor_earnings row, send a customer communication, or
-- set an order's partner billing state to `paid`.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.partner_record_stripe_invoice_paid(
  p_stripe_invoice_id text, p_amount_paid_cents integer, p_currency text,
  p_paid_at timestamptz, p_stripe_event_id text
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
declare
  v_inv   public.partner_invoices%rowtype;
  v_moved integer := 0;
begin
  select * into v_inv from public.partner_invoices
   where stripe_invoice_id = p_stripe_invoice_id for update;
  if not found then
    return jsonb_build_object('matched', false);
  end if;

  -- Event idempotency: a replayed webhook finds the invoice already paid and
  -- changes nothing.
  if v_inv.status = 'paid' then
    return jsonb_build_object('matched', true, 'already_paid', true, 'invoice_id', v_inv.id, 'orders_moved', 0);
  end if;

  update public.partner_invoices
     set status = 'paid',
         stripe_status = 'paid',
         amount_paid_cents = greatest(coalesce(p_amount_paid_cents, 0), 0),
         paid_currency = coalesce(upper(nullif(trim(coalesce(p_currency,'')), '')), currency),
         paid_at = coalesce(p_paid_at, now())
   where id = v_inv.id;

  -- Orders stop HERE. `paid` is a human decision, recorded later, by hand.
  update public.partner_order_financials
     set invoice_status = 'invoice_paid_unreconciled'
   where invoice_id = v_inv.id and invoice_status = 'invoiced';
  get diagnostics v_moved = row_count;

  insert into public.partner_invoice_payments (invoice_id, amount_cents, received_at, method, reference, recorded_by, note)
  values (v_inv.id, greatest(coalesce(p_amount_paid_cents, 0), 0), coalesce(p_paid_at, now()),
          'stripe', p_stripe_invoice_id, 'stripe_webhook', 'invoice.paid ' || coalesce(p_stripe_event_id, ''));

  insert into public.audit_logs (actor_type, actor_name, actor_role, object_type, object_id,
                                 action, entity_type, entity_id, category, source, metadata)
  values ('system', 'stripe_webhook', 'system', 'partner_platform', v_inv.partner_id::text,
          'partner_invoice_paid', 'partner_invoice', v_inv.id::text, 'partner_finance', 'partner_record_stripe_invoice_paid',
          jsonb_build_object('invoice_number', v_inv.invoice_number, 'stripe_event_id', p_stripe_event_id,
                             'amount_paid_cents', p_amount_paid_cents, 'orders_awaiting_reconciliation', v_moved,
                             'clinical_status_changed', false));

  return jsonb_build_object('matched', true, 'already_paid', false, 'invoice_id', v_inv.id,
                            'partner_id', v_inv.partner_id, 'orders_moved', v_moved);
end;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. MANUAL RECONCILIATION — the partner counterpart of "Mark Payout Complete"
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.partner_admin_mark_orders_paid(p_order_ids uuid[], p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
declare
  v_oid   uuid;
  v_fin   public.partner_order_financials%rowtype;
  v_inv   public.partner_invoices%rowtype;
  v_email text := lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email', ''));
  v_done  integer := 0;
  v_ids   uuid[] := '{}';
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_order_ids is null or cardinality(p_order_ids) = 0 then
    raise exception 'no_orders_selected' using errcode = '22023';
  end if;

  foreach v_oid in array p_order_ids loop
    select * into v_fin from public.partner_order_financials where order_id = v_oid for update;
    if not found then raise exception 'order % has no partner financial snapshot', v_oid using errcode = 'P0002'; end if;
    -- Only an order inside an invoice Stripe has actually paid may be settled.
    if v_fin.invoice_status <> 'invoice_paid_unreconciled' then
      raise exception 'order % is % — only invoice_paid_unreconciled can be reconciled', v_oid, v_fin.invoice_status
        using errcode = '22023';
    end if;
    select * into v_inv from public.partner_invoices where id = v_fin.invoice_id;
    if not found or v_inv.status <> 'paid' then
      raise exception 'order % is not on a paid invoice', v_oid using errcode = '22023';
    end if;

    insert into public.partner_order_reconciliations (
      order_id, partner_id, invoice_id, amount_allocated_cents, currency, marked_by, marked_by_email, note)
    values (v_oid, v_fin.partner_id, v_fin.invoice_id, v_fin.wholesale_fee_cents, v_fin.currency,
            auth.uid(), coalesce(nullif(v_email, ''), 'admin'), nullif(trim(coalesce(p_note,'')), ''));

    update public.partner_order_financials set invoice_status = 'paid' where order_id = v_oid;

    v_done := v_done + 1;
    v_ids  := v_ids || v_oid;
  end loop;

  insert into public.audit_logs (actor_type, actor_name, actor_role, object_type, object_id,
                                 action, entity_type, entity_id, category, source, metadata)
  values ('admin', coalesce(nullif(v_email, ''), 'admin'), 'admin', 'partner_platform', v_fin.partner_id::text,
          'partner_orders_marked_paid', 'partner_order_reconciliation', v_fin.invoice_id::text,
          'partner_finance', 'partner_admin_mark_orders_paid',
          jsonb_build_object('order_count', v_done, 'invoice_id', v_fin.invoice_id,
                             'clinical_status_changed', false, 'provider_earning_created', false));

  return jsonb_build_object('marked', v_done, 'order_ids', to_jsonb(v_ids));
end;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. ACCOUNTS — per-partner receivables picture
-- ───────────────────────────────────────────────────────────────────────────
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
language sql
stable
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
  with scope as (
    select o.id as partner_id, o.display_name, coalesce(bp.currency, 'USD') as currency
      from public.partner_organizations o
      left join public.partner_billing_profiles bp on bp.partner_id = o.id
     where public.is_chat_admin() and (p_partner_id is null or o.id = p_partner_id)
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
$fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. WEEKLY CANDIDATES (service role — the scheduled job)
--
-- America/New_York throughout: the weekday and the hour a partner configured
-- are wall-clock New York, and the period key is the New York ISO week.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.partner_weekly_invoice_candidates()
returns table(
  partner_id uuid, partner_name text, billing_email text, stripe_customer_id text,
  currency text, payment_terms_days integer, billing_period_key text,
  period_start timestamptz, period_end timestamptz, order_ids uuid[], total_cents integer
)
language sql
stable
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
  with ny as (select (now() at time zone 'America/New_York') as local_now),
  due as (
    select bp.partner_id, o.display_name, bp.billing_email, bp.stripe_customer_id,
           bp.currency, bp.payment_terms_days,
           'w:' || to_char((select local_now from ny), 'IYYY-"W"IW') as period_key,
           (date_trunc('week', (select local_now from ny)) at time zone 'America/New_York') as p_start,
           ((date_trunc('week', (select local_now from ny)) + interval '7 days') at time zone 'America/New_York') as p_end
      from public.partner_billing_profiles bp
      join public.partner_organizations o on o.id = bp.partner_id
     where bp.weekly_invoicing_enabled = true
       and bp.active = true
       and bp.billing_email is not null
       and bp.stripe_customer_id is not null
       and extract(dow from (select local_now from ny))::int  = bp.invoice_weekday
       and extract(hour from (select local_now from ny))::int >= bp.invoice_hour
  )
  select d.partner_id, d.display_name, d.billing_email, d.stripe_customer_id, d.currency,
         d.payment_terms_days, d.period_key, d.p_start, d.p_end,
         array_agg(f.order_id order by f.created_at),
         coalesce(sum(f.wholesale_fee_cents), 0)::int
    from due d
    join public.partner_order_financials f on f.partner_id = d.partner_id
   where f.invoice_eligible = true and f.invoice_status = 'uninvoiced'
     and not exists (select 1 from public.partner_invoices i
                      where i.partner_id = d.partner_id and i.billing_period_key = d.period_key)
   group by d.partner_id, d.display_name, d.billing_email, d.stripe_customer_id, d.currency,
            d.payment_terms_days, d.period_key, d.p_start, d.p_end;
$fn$;

revoke all on function public.partner_admin_invoiceable_orders(uuid) from public, anon;
revoke all on function public.partner_prepare_invoice(uuid,uuid[],text,text,timestamptz,timestamptz,integer) from public, anon, authenticated;
revoke all on function public.partner_attach_stripe_invoice(uuid,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.partner_record_stripe_invoice_paid(text,integer,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.partner_admin_mark_orders_paid(uuid[],text) from public, anon;
revoke all on function public.partner_admin_billing_summary(uuid) from public, anon;
revoke all on function public.partner_weekly_invoice_candidates() from public, anon, authenticated;
grant execute on function public.partner_admin_invoiceable_orders(uuid) to authenticated;
grant execute on function public.partner_admin_mark_orders_paid(uuid[],text) to authenticated;
grant execute on function public.partner_admin_billing_summary(uuid) to authenticated;
