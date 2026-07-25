-- LIVE-ACCOUNTS-FINANCIAL-RECONCILIATION-UX-001
-- Secured, read-only feed for the Accounts "Stripe <-> Orders Reconciliation"
-- bridge. Admin-gated via is_accounts_admin(). Additive: does NOT touch
-- orders, doctor_earnings, the channel-contribution RPC, or any P&L logic.
--
-- WHY: the company summary cards are STRIPE CASH BASIS (charges/refunds by
-- Stripe event date, via the stripe-payment-history edge fn) while the
-- Channel Contribution section is ORDER BASIS (orders.price / refund_amount /
-- doctor_earnings for orders with paid_at in the window). Both are correct on
-- their own basis but visibly disagree (July 2026: 150 charges vs 144 orders,
-- $15,921 vs $15,621 net). This RPC exposes the ORDER-BASIS side keyed by
-- payment intent so the client can join it against the live Stripe charge
-- list it already fetched and render an itemized, always-tied-out bridge.
--
-- Money model is IDENTICAL to get_channel_contribution_orders (gross =
-- orders.price, refund = orders.refund_amount, provider = single-owner sum of
-- non-cancelled doctor_earnings, gated on doctor_status='patient_notified'),
-- so order_basis here reconciles to the Channel Contribution totals by
-- construction. Never invents per-order Stripe fees.
--
-- PII posture: returns confirmation ids + payment-intent ids only (same
-- exposure as the existing admin-gated resolve_charge_payouts RPC). No names,
-- emails, or click IDs.
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

  with paid as (
    select o.*
    from public.orders o
    where o.paid_at is not null
      and o.paid_at >= p_from::timestamptz
      and o.paid_at <  (p_to + 1)::timestamptz
  ),
  -- Single-owner earning attribution (mirrors providerPaymentExport /
  -- get_channel_contribution_orders): each non-cancelled earning belongs to
  -- exactly one paid order - order_id first, else confirmation_id - so a
  -- component is never double-counted.
  earn as (
    select de.id,
      coalesce(
        (select p2.id from paid p2 where p2.id = de.order_id),
        (select p3.id from paid p3 where de.confirmation_id is not null and p3.confirmation_id = de.confirmation_id limit 1)
      ) as owner_order_id,
      de.doctor_amount
    from public.doctor_earnings de
    where lower(coalesce(de.status,'')) <> 'cancelled'
  ),
  prov as (
    select owner_order_id as oid, coalesce(sum(doctor_amount),0) as provider_usd
    from earn
    where owner_order_id is not null
    group by owner_order_id
  ),
  proj as (
    select
      p.payment_intent_id,
      p.confirmation_id,
      coalesce(p.price, 0)::numeric as gross_usd,
      coalesce(p.refund_amount, 0)::numeric as refund_usd,
      (case when p.doctor_status = 'patient_notified'
        then coalesce((select pr.provider_usd from prov pr where pr.oid = p.id), 0)
        else 0
      end)::numeric as provider_usd
    from paid p
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
  -- than orders" in a window).
  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_addons
  from (
    select
      r.stripe_payment_intent_id as payment_intent_id,
      r.confirmation_id,
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

grant execute on function public.get_accounts_reconciliation(date, date) to authenticated;
