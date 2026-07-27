-- ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001 · Phase F
--
-- Accounts bridge: surface Additional Pet upgrades as order-linked ADD-ON
-- revenue alongside Additional Documentation, under an explicit `subtype`.
--
-- This is a SURGICAL replace of get_accounts_reconciliation: the tuned join
-- shape from 20260726160000 (materialized `paid`/`prov`, hash LEFT JOINs, no
-- correlated per-row subqueries) is preserved byte-for-byte. Only the add-on
-- projection and the add-on refund total change.
--
-- Invariants:
--   • a paid upgrade appears EXACTLY ONCE, order-linked, never as a new order
--   • a $0 (included) pet produces NO revenue row (paid_at stays null)
--   • a refund reverses only the add-on, once, in the window it occurred
--   • orders.price is never read for, or altered by, an add-on

create or replace function public.get_accounts_reconciliation(p_from date, p_to date)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_orders jsonb;
  v_addons jsonb;
  v_basis jsonb;
  v_timing jsonb;
begin
  if not public.is_accounts_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  with paid as materialized (
    select
      o.id,
      o.payment_intent_id,
      o.confirmation_id,
      coalesce(o.price, 0)::numeric as gross_usd,
      coalesce(o.refund_amount, 0)::numeric as refund_usd,
      o.doctor_status
    from public.orders o
    where o.paid_at is not null
      and o.paid_at >= p_from::timestamptz
      and o.paid_at <  (p_to + 1)::timestamptz
  ),
  -- Single-owner earning attribution (same rule as providerPaymentExport /
  -- get_channel_contribution_orders): each non-cancelled earning belongs to
  -- exactly one paid order - order_id first, else confirmation_id - so a
  -- component is never double-counted. orders.confirmation_id is unique,
  -- so the confirmation join cannot multiply rows.
  earn as materialized (
    select coalesce(po.id, pc.id) as owner_order_id, de.doctor_amount
    from public.doctor_earnings de
    left join paid po on po.id = de.order_id
    left join paid pc on de.confirmation_id is not null
                     and pc.confirmation_id = de.confirmation_id
    where lower(coalesce(de.status,'')) <> 'cancelled'
      and (po.id is not null or pc.id is not null)
  ),
  prov as materialized (
    select owner_order_id as oid, coalesce(sum(doctor_amount), 0) as provider_usd
    from earn
    group by owner_order_id
  ),
  proj as (
    select
      p.payment_intent_id,
      p.confirmation_id,
      p.gross_usd,
      p.refund_usd,
      (case when p.doctor_status = 'patient_notified'
        then coalesce(pr.provider_usd, 0)
        else 0
      end)::numeric as provider_usd
    from paid p
    left join prov pr on pr.oid = p.id
  )
  select
    coalesce(jsonb_agg(to_jsonb(pr)), '[]'::jsonb),
    jsonb_build_object(
      'paid_orders',  count(*),
      'gross_usd',    round(coalesce(sum(pr.gross_usd), 0), 2),
      'refund_usd',   round(coalesce(sum(pr.refund_usd), 0), 2),
      'net_usd',      round(coalesce(sum(pr.gross_usd - pr.refund_usd), 0), 2),
      'provider_usd', round(coalesce(sum(pr.provider_usd), 0), 2)
    )
  into v_orders, v_basis
  from proj pr;

  -- Additional-document payments: real Stripe charges with their own payment
  -- intents that never appear as order rows (the #1 cause of "more charges
  -- than orders" in a window). LIVE evidence 2026-07-25: July had 5 such
  -- payments totalling $230.00, none with an orders.payment_intent_id row.
  -- ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001 §18: Additional Pet upgrades are
  -- order-linked ADD-ON revenue in the same category as Additional
  -- Documentation, distinguished by `subtype`. Two formulas never share a
  -- label, so each add-on kind is named explicitly rather than merged.
  --
  -- $0 (included) requests are deliberately EXCLUDED: `paid_at is not null`
  -- can only be true for a real Stripe charge, so a covered pet contributes no
  -- revenue row at all. A refund reverses only the add-on, exactly once, in
  -- the window it occurred.
  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_addons
  from (
    select
      r.stripe_payment_intent_id as payment_intent_id,
      r.confirmation_id,
      'Order add-on payments'::text as category,
      'Additional documentation'::text as subtype,
      round(coalesce(r.amount_cents, 0) / 100.0, 2) as amount_usd,
      round(case
        when r.refunded_at is not null
         and r.refunded_at >= p_from::timestamptz
         and r.refunded_at <  (p_to + 1)::timestamptz
        then coalesce(r.refund_amount_cents, 0) / 100.0 else 0 end, 2) as refund_in_window_usd
    from public.order_additional_documentation_requests r
    where r.paid_at is not null
      and r.paid_at >= p_from::timestamptz
      and r.paid_at <  (p_to + 1)::timestamptz

    union all

    select
      p.stripe_payment_intent_id as payment_intent_id,
      p.confirmation_id,
      'Order add-on payments'::text as category,
      'Additional pet'::text as subtype,
      round(coalesce(p.amount_cents, 0) / 100.0, 2) as amount_usd,
      round(case
        when p.refunded_at is not null
         and p.refunded_at >= p_from::timestamptz
         and p.refunded_at <  (p_to + 1)::timestamptz
        then coalesce(p.refund_amount_cents, 0) / 100.0 else 0 end, 2) as refund_in_window_usd
    from public.order_additional_pet_requests p
    where p.paid_at is not null
      and p.amount_cents > 0
      and p.paid_at >= p_from::timestamptz
      and p.paid_at <  (p_to + 1)::timestamptz
  ) a;

  -- Refund timing splits (single canonical DB signal: orders.refunded_at +
  -- cumulative orders.refund_amount; partial-refund multi-date edge cases are
  -- absorbed by the bridge residual, never hidden).
  select jsonb_build_object(
    'prior_order_refunds_usd', round(coalesce((
      select sum(coalesce(o.refund_amount, 0)) from public.orders o
      where o.refunded_at >= p_from::timestamptz
        and o.refunded_at <  (p_to + 1)::timestamptz
        and (o.paid_at is null or o.paid_at < p_from::timestamptz or o.paid_at >= (p_to + 1)::timestamptz)
    ), 0), 2),
    'addon_refunds_usd', round(coalesce((
      select sum(coalesce(r.refund_amount_cents, 0)) / 100.0
      from public.order_additional_documentation_requests r
      where r.refunded_at >= p_from::timestamptz
        and r.refunded_at <  (p_to + 1)::timestamptz
    ), 0), 2) + round(coalesce((
      select sum(coalesce(p.refund_amount_cents, 0)) / 100.0
      from public.order_additional_pet_requests p
      where p.refunded_at >= p_from::timestamptz
        and p.refunded_at <  (p_to + 1)::timestamptz
    ), 0), 2),
    'window_order_refunds_outside_usd', round(coalesce((
      select sum(coalesce(o.refund_amount, 0)) from public.orders o
      where o.paid_at >= p_from::timestamptz
        and o.paid_at <  (p_to + 1)::timestamptz
        and coalesce(o.refund_amount, 0) > 0
        and (o.refunded_at is null
          or o.refunded_at < p_from::timestamptz
          or o.refunded_at >= (p_to + 1)::timestamptz)
    ), 0), 2)
  ) into v_timing;

  return jsonb_build_object(
    'date_from', p_from,
    'date_to', p_to,
    'currency', 'USD',
    'order_basis', v_basis,
    'orders', v_orders,
    'addon_payments', v_addons,
    'refund_timing', v_timing
  );
end;
$function$;

-- Explicit ACL (TEST hardening, ACCOUNTS-LIVE-TO-TEST-PARITY-001): Postgres
-- grants EXECUTE on new functions to PUBLIC by default, and revoking "from
-- public" does NOT undo an explicit role grant. Revoke by name first, then
-- grant only to authenticated. The in-function is_accounts_admin() gate is
-- still the real authorization; this just removes the anon/public surface.
revoke all on function public.get_accounts_reconciliation(date, date) from public;
revoke all on function public.get_accounts_reconciliation(date, date) from anon;
grant execute on function public.get_accounts_reconciliation(date, date) to authenticated;
