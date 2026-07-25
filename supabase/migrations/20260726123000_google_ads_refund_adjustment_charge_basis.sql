-- GOOGLE-ADS-REFUND-ADJUSTMENT-CONSUMER-001 (follow-up)
--
-- The refund basis is the amount actually CHARGED, not the value uploaded to
-- Google. At LIVE these differ, and using the uploaded value as the basis
-- produces WRONG adjustments:
--
--   PT-MRJKQA4X  uploaded 89, charged 109, refunded 20 → customer kept 89
--   PT-MR1HX27H  uploaded 59, charged  99, refunded 40 → customer kept 59
--
-- Both are coupon OVERCHARGE CORRECTIONS: retained revenue already equals what
-- Google was told, so no adjustment is owed. The naive rule would have restated
-- them to 69 and 19, understating retained revenue by $60.
--
-- Additive + idempotent. No order financial data is mutated.

alter table public.google_ads_conversion_adjustments
  add column if not exists charged_amount numeric(12,2);
alter table public.google_ads_conversion_adjustments
  add column if not exists true_retained_revenue numeric(12,2);
alter table public.google_ads_conversion_adjustments
  add column if not exists charge_basis_known boolean not null default false;

comment on column public.google_ads_conversion_adjustments.charged_amount is
  'Amount actually charged (proven from payment_attempts). The refund basis. NULL = unproven, in which case a partial refund is blocked rather than restated.';

alter table public.google_ads_conversion_adjustments
  drop constraint if exists google_ads_conv_adj_status_chk;
alter table public.google_ads_conversion_adjustments
  add constraint google_ads_conv_adj_status_chk check (status in (
    'pending','dry_run_ready',
    'blocked_original_not_uploaded','blocked_missing_identifier',
    'blocked_outside_adjustment_window','blocked_conversion_too_recent',
    'blocked_value_integrity',
    'uploaded','retryable_error','terminal_error','superseded',
    'skipped_no_successful_refund','skipped_not_google_attributed',
    'skipped_no_effective_reduction'
  ));

-- Return type changes, so the function must be dropped before recreation.
drop function if exists public.get_google_ads_refund_adjustment_candidates(integer);

create function public.get_google_ads_refund_adjustment_candidates(
  p_limit integer default 50
)
returns table (
  order_id                  uuid,
  order_transaction_id      text,
  source_payment_id         text,
  original_uploaded         boolean,
  original_uploaded_at      timestamptz,
  original_value            numeric,
  charged_amount            numeric,
  refund_status             text,
  cumulative_refund         numeric,
  conversion_at             timestamptz,
  refunded_at               timestamptz,
  upload_method             text,
  ads_upload_status         text
)
language sql
stable
security definer
set search_path = public
as $$
  -- The candidate set is bounded FIRST, so the lateral charge lookup runs at
  -- most p_limit (<=200) times — no full-table correlated subquery.
  with candidate as (
    select o.*
    from public.orders o
    where o.refund_status in ('partial','full')
      and coalesce(o.refund_amount, 0) > 0
    order by o.refunded_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  )
  select
    c.id,
    c.confirmation_id,
    c.payment_intent_id,
    (c.google_ads_uploaded_at is not null),
    c.google_ads_uploaded_at,
    c.price::numeric,
    pa.amount::numeric,
    c.refund_status,
    coalesce(c.refund_amount, 0)::numeric,
    coalesce(c.paid_at, c.created_at),
    c.refunded_at,
    c.google_ads_upload_method,
    c.google_ads_upload_status
  from candidate c
  left join lateral (
    select p.amount
    from public.payment_attempts p
    where p.confirmation_id = c.confirmation_id
      and p.status = 'succeeded'
    order by p.created_at desc
    limit 1
  ) pa on true;
$$;

revoke all on function public.get_google_ads_refund_adjustment_candidates(integer) from public, anon;
grant execute on function public.get_google_ads_refund_adjustment_candidates(integer) to service_role;
