-- Marketing ROI + per-platform sync-health RPC for the Accounts area.
-- Additive and read-only: does NOT touch get_marketing_spend_summary or any
-- Accounts Books / Operating Net logic. Admin-gated via is_accounts_admin().
-- FX fixed at 1 USD = 280 PKR (matches the rest of the analytics/accounts layer).
--
-- Returns one object per platform (Google / Meta / Microsoft) with synced spend
-- (USD), order attribution (orders / paid orders / revenue), CPA, ROAS, ROI,
-- connection status, last sync info, and Operating-Net impact. Microsoft is
-- always "pending_oauth" (no spend sync yet) but still reports attributed orders
-- from msclkid; its Operating-Net impact stays $0.
create or replace function public.get_marketing_roi_health(p_from date, p_to date)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_fx numeric := 280.0;
  v_result jsonb;
begin
  if not public.is_accounts_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  with
  spend as (
    select platform,
      sum(spend_amount * (case upper(coalesce(currency,'USD')) when 'PKR' then 1/v_fx else 1 end)) as spend_usd,
      max(currency) as cur,
      count(*) as rows
    from public.marketing_ad_spend_daily
    where spend_date between p_from and p_to
    group by platform
  ),
  classified as (
    select o.id, o.created_at, o.paid_at, o.price,
      case
        when (o.attribution_json->>'channel') ilike '%google%'
          or lower(coalesce(o.attribution_json->>'utm_source', o.utm_source)) in ('google','google_ads','adwords')
          or coalesce(o.gclid, o.attribution_json->>'gclid','') <> '' then 'google_ads'
        when (o.attribution_json->>'channel') ~* '(facebook|meta|instagram)'
          or lower(coalesce(o.attribution_json->>'utm_source', o.utm_source)) in ('fb','facebook','ig','instagram','meta')
          or coalesce(o.fbclid, o.attribution_json->>'fbclid','') <> '' then 'meta_ads'
        when (o.attribution_json->>'channel') ~* '(microsoft|bing)'
          or lower(coalesce(o.attribution_json->>'utm_source', o.utm_source)) in ('bing','microsoft','msn')
          or coalesce(o.attribution_json->>'msclkid','') <> '' then 'microsoft_ads'
        else 'other'
      end as platform
    from public.orders o
    where (o.created_at >= p_from::timestamptz and o.created_at < (p_to + 1)::timestamptz)
       or (o.paid_at is not null and o.paid_at >= p_from::timestamptz and o.paid_at < (p_to + 1)::timestamptz)
  ),
  orders_agg as (
    select platform,
      count(*) filter (where created_at >= p_from::timestamptz and created_at < (p_to + 1)::timestamptz) as orders_attributed,
      count(*) filter (where paid_at is not null and paid_at >= p_from::timestamptz and paid_at < (p_to + 1)::timestamptz) as paid_orders,
      coalesce(sum(price) filter (where paid_at is not null and paid_at >= p_from::timestamptz and paid_at < (p_to + 1)::timestamptz), 0) as revenue
    from classified
    group by platform
  ),
  syncs as (
    select distinct on (platform) platform, status, error, rows_upserted, finished_at
    from public.marketing_ad_spend_sync_runs
    order by platform, started_at desc
  ),
  plat_list as (
    select * from (values
      ('google_ads',    'Google Ads',           1),
      ('meta_ads',      'Meta / Facebook Ads',  2),
      ('microsoft_ads', 'Microsoft Ads',        3)
    ) as t(platform, display_name, sort)
  ),
  built as (
    select
      pl.platform, pl.display_name, pl.sort,
      coalesce(sp.spend_usd, 0)            as spend_usd,
      coalesce(sp.cur, 'USD')              as cur,
      coalesce(sp.rows, 0)                 as spend_rows,
      coalesce(oa.orders_attributed, 0)    as orders_attributed,
      coalesce(oa.paid_orders, 0)          as paid_orders,
      coalesce(oa.revenue, 0)              as revenue,
      sy.status                            as last_status,
      sy.error                             as last_error,
      sy.rows_upserted                     as last_rows,
      sy.finished_at                       as last_synced_at
    from plat_list pl
    left join spend sp       on sp.platform = pl.platform
    left join orders_agg oa  on oa.platform = pl.platform
    left join syncs sy       on sy.platform = pl.platform
  )
  select jsonb_build_object(
    'date_from', p_from,
    'date_to', p_to,
    'currency', 'USD',
    'fx_pkr_per_usd', v_fx,
    'platforms', (
      select jsonb_agg(
        jsonb_build_object(
          'platform', b.platform,
          'display_name', b.display_name,
          'spend_usd', round(b.spend_usd, 2),
          'spend_currency', b.cur,
          'spend_rows', b.spend_rows,
          'orders_attributed', b.orders_attributed,
          'paid_orders_attributed', b.paid_orders,
          'revenue_usd', round(b.revenue, 2),
          'cpa', case when b.paid_orders > 0 and b.spend_usd > 0 then round(b.spend_usd / b.paid_orders, 2) end,
          'roas', case when b.spend_usd > 0 then round(b.revenue / b.spend_usd, 2) end,
          'roi_pct', case when b.spend_usd > 0 then round((b.revenue - b.spend_usd) / b.spend_usd * 100, 1) end,
          'connection', (case
            when b.platform = 'microsoft_ads' then 'pending_oauth'
            when b.last_status = 'error' and coalesce(b.last_error,'') ~* '(permission|token|ads_read|oauth|invalid_grant|unauthor|forbidden|scope)' then 'permission_error'
            when b.last_status = 'error' then 'last_sync_failed'
            when b.last_status = 'success' or b.spend_rows > 0 then 'connected'
            else 'no_data'
          end),
          'last_synced_at', b.last_synced_at,
          'last_status', b.last_status,
          'last_error', b.last_error,
          'last_rows', b.last_rows,
          'operating_net_impact', case when b.platform <> 'microsoft_ads' then round(-b.spend_usd, 2) else 0 end
        ) order by b.sort
      ) from built b
    )
  ) into v_result;

  return v_result;
end;
$function$;

grant execute on function public.get_marketing_roi_health(date, date) to authenticated;
