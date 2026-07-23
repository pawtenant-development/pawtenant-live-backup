-- ACCOUNTS-CHANNEL-CONTRIBUTION-BREAKDOWN-001
-- Secured, read-only aggregate feed for the Accounts "Channel Contribution"
-- drilldown. Admin-gated via is_accounts_admin(). Additive: does NOT touch
-- orders, doctor_earnings, marketing spend, or any Accounts P&L logic.
--
-- Returns, for paid orders in [p_from, p_to+1) by paid_at:
--   • a PII-SAFE attribution projection per order (presence sentinels for
--     click IDs, host-only referrer, path-only landing, normalized tokens —
--     NEVER names / emails / raw click IDs / full URLs), and
--   • canonical money per order in USD dollars: gross = orders.price,
--     refund = orders.refund_amount, provider payment via the
--     providerPaymentExport rule (doctor_status='patient_notified' → sum of
--     non-cancelled doctor_earnings.doctor_amount, single-owner: order_id
--     first, else confirmation_id; else 0).
-- Plus the window's synced Google Ads spend (USD, PKR→USD @ fixed 280).
--
-- Classification into the 4-category / leaf taxonomy is done client-side by the
-- single pure classifier src/lib/channelContribution.ts (reused + unit-guarded)
-- — this RPC only projects the evidence + money it needs, never a channel.
create or replace function public.get_channel_contribution_orders(p_from date, p_to date)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_fx numeric := 280.0;
  v_google_spend numeric := 0;
  v_orders jsonb;
begin
  if not public.is_accounts_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Synced Google Ads spend for the window (PKR→USD @ fixed FX; ad-account-local dates).
  select coalesce(sum(spend_amount * (case upper(coalesce(currency,'USD')) when 'PKR' then 1/v_fx else 1 end)), 0)
    into v_google_spend
  from public.marketing_ad_spend_daily
  where lower(coalesce(platform,'')) in ('google_ads','google')
    and spend_date between p_from and p_to;

  with paid as (
    select o.*
    from public.orders o
    where o.paid_at is not null
      and o.paid_at >= p_from::timestamptz
      and o.paid_at <  (p_to + 1)::timestamptz
  ),
  -- Single-owner earning attribution (mirrors providerPaymentExport):
  -- each non-cancelled earning belongs to exactly one paid order — order_id
  -- first, else confirmation_id — so a component is never double-counted.
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
      -- presence sentinels — never the real click id
      case when nullif(trim(coalesce(p.gclid, p.attribution_json->>'gclid', p.first_touch_json->>'gclid', p.last_touch_json->>'gclid')), '') is not null then 'present' end as gclid,
      case when nullif(trim(coalesce(p.attribution_json->>'gbraid', p.first_touch_json->>'gbraid', p.last_touch_json->>'gbraid')), '') is not null then 'present' end as gbraid,
      case when nullif(trim(coalesce(p.attribution_json->>'wbraid', p.first_touch_json->>'wbraid', p.last_touch_json->>'wbraid')), '') is not null then 'present' end as wbraid,
      case when nullif(trim(coalesce(p.fbclid, p.attribution_json->>'fbclid', p.first_touch_json->>'fbclid', p.last_touch_json->>'fbclid')), '') is not null then 'present' end as fbclid,
      case when nullif(trim(coalesce(p.attribution_json->>'msclkid', p.first_touch_json->>'msclkid', p.last_touch_json->>'msclkid')), '') is not null then 'present' end as msclkid,
      case when nullif(trim(coalesce(p.attribution_json->>'ttclid', p.first_touch_json->>'ttclid', p.last_touch_json->>'ttclid')), '') is not null then 'present' end as ttclid,
      lower(nullif(trim(coalesce(p.utm_source, p.attribution_json->>'utm_source', p.last_touch_json->>'utm_source', p.first_touch_json->>'utm_source')), '')) as utm_source,
      lower(nullif(trim(coalesce(p.utm_medium, p.attribution_json->>'utm_medium', p.last_touch_json->>'utm_medium', p.first_touch_json->>'utm_medium')), '')) as utm_medium,
      -- host only (no path / no query → no PII)
      nullif(regexp_replace(lower(coalesce(p.attribution_json->>'referrer', p.last_touch_json->>'referrer', p.first_touch_json->>'referrer', '')), '^\s*(?:https?://)?([^/?#]+).*$', '\1'), '') as referrer_host,
      -- ref only when it is a recovery-sequence tag
      case when lower(coalesce(p.attribution_json->>'ref', p.last_touch_json->>'ref', p.first_touch_json->>'ref', '')) ~ '^(seq_|recovery)' then 'seq_' end as ref,
      -- referred_by normalized to a RECOGNIZED classifier token only. Legacy
      -- referred_by is noisy (often a non-empty tag on otherwise-Direct orders),
      -- so an unrecognized value → NULL (dropped) rather than a 'referral'
      -- sentinel, which would otherwise hijack a genuine Direct order into
      -- Referral via the classifier's referred_by salvage path.
      (case
        when nullif(trim(lower(coalesce(p.referred_by,''))), '') is null then null
        when lower(p.referred_by) like '%google%' and lower(p.referred_by) like '%organic%' then 'google organic'
        when lower(p.referred_by) like '%google%' then 'google'
        when lower(p.referred_by) like '%facebook%' or lower(p.referred_by) like '%instagram%' or lower(p.referred_by) like '%meta%' then 'facebook'
        when lower(p.referred_by) like '%tiktok%' then 'tiktok'
        when lower(p.referred_by) ~ '^seq_' then 'seq_'
        when lower(p.referred_by) like '%recovery%' or lower(p.referred_by) like '%email%' then 'email'
        when lower(p.referred_by) like '%seo%' or lower(p.referred_by) like '%organic%' then 'organic'
        else null
      end) as referred_by,
      -- path only (no host / no query → no PII)
      nullif(regexp_replace(regexp_replace(lower(coalesce(nullif(p.landing_url,''), p.attribution_json->>'landing_url', p.last_touch_json->>'landing_url', p.first_touch_json->>'landing_url', '')), '^(?:https?://)?[^/]*', ''), '[?#].*$', ''), '') as landing_path,
      lower(nullif(trim(coalesce(p.attribution_json->>'channel', p.last_touch_json->>'channel', p.first_touch_json->>'channel')), '')) as canonical_channel,
      coalesce(p.price, 0) as gross_usd,
      coalesce(p.refund_amount, 0) as refund_usd,
      case when p.doctor_status = 'patient_notified'
        then coalesce((select pr.provider_usd from prov pr where pr.oid = p.id), 0)
        else 0
      end as provider_usd
    from paid p
  )
  select coalesce(jsonb_agg(to_jsonb(pr)), '[]'::jsonb) into v_orders from proj pr;

  return jsonb_build_object(
    'date_from', p_from,
    'date_to', p_to,
    'currency', 'USD',
    'fx_pkr_per_usd', v_fx,
    'google_ads_spend_usd', round(v_google_spend, 2),
    'orders', v_orders
  );
end;
$function$;

grant execute on function public.get_channel_contribution_orders(date, date) to authenticated;
