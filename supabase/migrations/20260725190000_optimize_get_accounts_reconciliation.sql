-- LIVE-ACCOUNTS-FINANCIAL-RECONCILIATION-UX-001 (correction addendum)
-- FIX: get_accounts_reconciliation timed out on LIVE with
-- "canceling statement due to statement timeout".
--
-- ROOT CAUSE (proven via EXPLAIN ANALYZE on LIVE, 2026-07-25):
-- the original body attributed provider earnings with correlated subqueries
-- ((select ... from paid) per doctor_earnings row) and then referenced the
-- `prov` CTE from inside a per-order CASE expression. Postgres inlined that
-- reference as a subplan re-executed once PER PAID ORDER and PER AGGREGATE
-- (jsonb_agg + sums), so the whole doctor_earnings scan - itself full of
-- correlated subqueries - ran ~300 times. July 2026: 8,007 ms, right at the
-- 8 s authenticated statement_timeout. Not an index problem: orders has
-- 1,603 rows; the fix is join shape, not more indexes (a paid_at index
-- saves <2 ms here and is deliberately NOT added).
--
-- FIX SHAPE: identical money model and payload, but
--   * `paid` projects only the needed columns (was o.* at width ~3,730),
--   * earnings ownership uses hash LEFT JOINs (order_id first, else
--     confirmation_id - orders.confirmation_id is UNIQUE so no fan-out),
--   * `prov` is MATERIALIZED and LEFT JOINed once, never re-executed.
-- Verified equivalent on LIVE for June + July 2026 (identical per-row
-- md5 hashes) and 7.5 ms for the ALL-TIME range (456 paid orders):
-- one scan of orders + one scan of doctor_earnings, regardless of range.
--
-- Guard: scripts/check-accounts-reconciliation.mjs asserts this function
-- stays join-based (no correlated per-row subqueries reappear).
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
