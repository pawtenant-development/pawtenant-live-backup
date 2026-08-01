-- MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-LIVE-ROLLOUT-001 §E/§G/§H
-- THE LIVE month-end reporting stack — built new (LIVE never had one).
--
--   • monthly_report_recipients / monthly_business_report_runs — service-role
--     only (RLS enabled with no policies; anon/authenticated revoked by name).
--   • monthly_business_report_runs.delivery_allowed — the JULY NO-SEND
--     mechanism (§H): a run row with delivery_allowed=false is TERMINAL for
--     automated delivery; force cannot override it. July 2026 is seeded as
--     status='skipped_owner_review', delivery_allowed=false, so the recurring
--     cron can never send July accidentally. The first automatically
--     deliverable month is August 2026.
--   • get_monthly_business_report(p_month) — THE canonical payload, identical
--     to TEST 20260801160000 (one formula, America/New_York boundaries via
--     make_timestamptz, internal to-the-cent reconciliation checks, explicit
--     platform/GSC/GA4 availability states). is_accounts_admin() exists on
--     LIVE, so the gate ports unchanged.

create table if not exists public.monthly_report_recipients (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.monthly_report_recipients_touch()
 returns trigger language plpgsql set search_path to 'public'
as $$ begin NEW.updated_at := now(); return NEW; end $$;

drop trigger if exists monthly_report_recipients_touch on public.monthly_report_recipients;
create trigger monthly_report_recipients_touch
  before update on public.monthly_report_recipients
  for each row execute function public.monthly_report_recipients_touch();

create table if not exists public.monthly_business_report_runs (
  id                         uuid primary key default gen_random_uuid(),
  report_month               text not null,
  report_type                text not null default 'monthly_business',
  period_start               date,
  period_end                 date,
  status                     text not null default 'pending',
  -- §H: false = delivery terminally disabled for this month (owner review).
  -- Neither the cron nor force can send while false.
  delivery_allowed           boolean not null default true,
  recipient_count            integer,
  recipients                 jsonb,
  email_provider_message_ids jsonb,
  attachment_path            text,
  error_message              text,
  generated_at               timestamptz,
  sent_at                    timestamptz,
  created_at                 timestamptz not null default now()
);

create unique index if not exists uq_monthly_business_report_month_type
  on public.monthly_business_report_runs (report_month, report_type);

-- Service-role only: RLS on with no policies; default grants revoked BY NAME
-- (revoking "from public" does NOT undo Supabase's default authenticated grant).
alter table public.monthly_report_recipients enable row level security;
alter table public.monthly_business_report_runs enable row level security;
revoke all on table public.monthly_report_recipients from public, anon, authenticated;
revoke all on table public.monthly_business_report_runs from public, anon, authenticated;

-- §H — JULY 2026 NO-SEND PROTECTION (seeded BEFORE any cron exists).
insert into public.monthly_business_report_runs
  (report_month, report_type, period_start, period_end, status, delivery_allowed, error_message, generated_at)
values
  ('2026-07', 'monthly_business', '2026-07-01', '2026-07-31', 'skipped_owner_review', false,
   'July 2026 delivery disabled pending owner review of the reconciled preview (MONTH-END-...-LIVE-ROLLOUT-001 §H). Flip delivery_allowed deliberately to enable a manual resend.',
   now())
on conflict (report_month, report_type) do nothing;

-- ── THE canonical payload (identical to TEST 20260801160000) ────────────────
drop function if exists public.get_monthly_business_report(date, date);

create or replace function public.get_monthly_business_report(p_month text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_tz    constant text := 'America/New_York';
  v_fx    numeric := 280.0;
  v_y     integer;
  v_m     integer;
  v_start timestamptz;
  v_end   timestamptz;
  v_from  date;
  v_to    date;
  v_days  integer;

  -- revenue / pnl scalars
  v_gross numeric := 0;  v_paid_orders integer := 0;
  v_esa integer := 0;    v_psd integer := 0;
  v_stripe_fees numeric := 0;
  v_total_orders integer := 0; v_leads integer := 0;
  v_refund_count integer := 0; v_refund_amount numeric := 0;
  v_payouts numeric := 0;
  v_salary_usd numeric := 0; v_emp_count integer := 0;
  v_other_exp numeric := 0;
  v_new_cust integer := 0; v_ret_cust integer := 0;
  v_recovered integer := 0; v_recovered_rev numeric := 0;

  -- ad platforms
  v_g_spend_native numeric; v_g_currency text; v_g_spend_usd numeric;
  v_g_days integer; v_g_last date; v_g_clicks bigint; v_g_impr bigint; v_g_platform_conv numeric;
  v_m_spend_usd numeric; v_m_days integer; v_m_last date; v_m_rows_ever bigint;
  v_ms_rows_ever bigint; v_ms_manual numeric;
  v_g_state text; v_m_state text; v_ms_state text;
  v_ad_spend numeric := 0; v_ad_spend_available boolean;

  -- operations
  v_completed integer := 0; v_cancelled integer := 0; v_reopened integer := 0;
  v_lead_now integer; v_paid_now integer; v_ur_now integer; v_pd_now integer;

  -- lifecycle counts
  v_assigned_ev integer; v_assigned_cov timestamptz;
  v_ur_entered integer; v_ur_gap integer;
  v_pd_entered integer;
  v_cx_gap integer;
  v_paid_missing integer;
  v_done_missing_pns integer;

  -- acquisition rollups
  v_channels jsonb; v_ch_orders integer; v_ch_revenue numeric;
  v_gb jsonb;      -- google backend block
  v_mb_orders integer; v_mb_revenue numeric;
  v_attr_quality jsonb;
  v_org_orders integer; v_org_revenue numeric; v_org_refunds numeric;

  -- money rollups
  v_business_net numeric; v_total_expenses numeric; v_operating_net numeric;
  v_contribution numeric;

  v_qa integer := 0;
  v_warnings jsonb := '[]'::jsonb;
  v_checks jsonb;
  v_reconciled boolean;
  v_result jsonb;
begin
  if auth.uid() is not null and not public.is_accounts_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_month is null or p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'p_month must be ''YYYY-MM'' (got %)', coalesce(p_month, 'null');
  end if;
  v_y := split_part(p_month, '-', 1)::int;
  v_m := split_part(p_month, '-', 2)::int;
  if v_m not between 1 and 12 then
    raise exception 'p_month month component out of range: %', p_month;
  end if;

  -- The ONLY period arithmetic in the whole reporting stack. DST-safe.
  v_start := make_timestamptz(v_y, v_m, 1, 0, 0, 0, v_tz);
  v_end   := make_timestamptz(case when v_m = 12 then v_y + 1 else v_y end,
                              case when v_m = 12 then 1 else v_m + 1 end,
                              1, 0, 0, 0, v_tz);
  v_from  := make_date(v_y, v_m, 1);
  v_to    := (v_end at time zone v_tz)::date - 1;
  v_days  := (v_to - v_from) + 1;

  -- ── Revenue (orders PAID inside the business month) ──
  select coalesce(sum(price),0), count(*),
         count(*) filter (where lower(coalesce(letter_type,'')) = 'esa'),
         count(*) filter (where lower(coalesce(letter_type,'')) = 'psd'),
         coalesce(sum(case when price > 0 then price*0.029 + 0.30 else 0 end),0)
    into v_gross, v_paid_orders, v_esa, v_psd, v_stripe_fees
    from public.orders where paid_at >= v_start and paid_at < v_end;

  select count(*), count(*) filter (where status = 'lead')
    into v_total_orders, v_leads
    from public.orders where created_at >= v_start and created_at < v_end;

  select count(*), coalesce(sum(refund_amount),0)
    into v_refund_count, v_refund_amount
    from public.orders where refunded_at >= v_start and refunded_at < v_end;

  select coalesce(sum(doctor_amount),0) into v_payouts
    from (select distinct on (coalesce(confirmation_id, id::text)) doctor_amount
            from public.doctor_earnings
           where created_at >= v_start and created_at < v_end and coalesce(status,'') <> 'cancelled'
           order by coalesce(confirmation_id, id::text), created_at) d;

  -- ── Salary estimate (same policy as v1: prorated base + approved adj, owner excluded) ──
  with sal as (
    select coalesce(h.salary_currency,'PKR') cur, coalesce(h.base_salary,0)::numeric base
      from public.employee_hr_private h
      join public.team_members tm on tm.id = h.team_member_id
      left join public.doctor_profiles dp on dp.user_id = tm.user_id
     where coalesce(tm.is_active,true) = true
       and coalesce(tm.employment_status,'active') not in ('terminated','resigned','inactive','suspended','offboarded','deleted')
       and coalesce(h.base_salary,0) > 0
       and coalesce(tm.domain_role,'') <> 'owner'
       and coalesce(dp.role,'') <> 'owner'),
  adj as (
    select coalesce(sum(case when type in ('bonus','commission','reimbursement') and amount_pkr > 0 then amount_pkr
                             when type = 'adjustment' then amount_pkr
                             when type = 'deduction' then -abs(amount_pkr) else 0 end),0) net_pkr
      from public.employee_compensation_adjustments
     where status = 'approved' and deleted_at is null
       and period_month >= date_trunc('month', v_from)::date and period_month <= v_to)
  select count(*)::int,
         round(coalesce(sum(case when cur='PKR' then base/v_fx else base end),0) * (v_days::numeric/30.0) + (select net_pkr from adj)/v_fx, 2)
    into v_emp_count, v_salary_usd from sal;

  -- ── Other company expenses (manual rows only; ads/salary/payout categories excluded) ──
  select coalesce(sum(amount * (case when upper(coalesce(currency,'USD'))='PKR' then 1/v_fx else 1 end)),0)
    into v_other_exp
    from public.company_expenses
   where expense_date >= v_from and expense_date <= v_to
     and coalesce(status,'') <> 'cancelled'
     and coalesce(category,'') not in ('employee_salary','provider_payout','google_ads','facebook_meta')
     and coalesce(source,'') not in ('employee_salary','provider_payout','google_ads','facebook_meta');

  -- ── Ad platforms: spend + connection state (missing sync is NOT $0) ──
  select coalesce(sum(spend_amount),0),
         max(upper(coalesce(currency,'USD'))),
         round(coalesce(sum(spend_amount * (case when upper(coalesce(currency,'USD'))='PKR' then 1/v_fx else 1 end)),0), 2),
         count(distinct spend_date)::int,
         coalesce(sum(clicks),0), coalesce(sum(impressions),0), coalesce(sum(platform_conversions),0)
    into v_g_spend_native, v_g_currency, v_g_spend_usd, v_g_days, v_g_clicks, v_g_impr, v_g_platform_conv
    from public.marketing_ad_spend_daily
   where platform = 'google_ads' and spend_date between v_from and v_to;
  select max(spend_date) into v_g_last from public.marketing_ad_spend_daily where platform = 'google_ads';

  select round(coalesce(sum(spend_amount * (case when upper(coalesce(currency,'USD'))='PKR' then 1/v_fx else 1 end)),0), 2),
         count(distinct spend_date)::int
    into v_m_spend_usd, v_m_days
    from public.marketing_ad_spend_daily
   where platform = 'meta_ads' and spend_date between v_from and v_to;
  select max(spend_date), count(*) into v_m_last, v_m_rows_ever
    from public.marketing_ad_spend_daily where platform = 'meta_ads';

  select count(*) into v_ms_rows_ever
    from public.marketing_ad_spend_daily where platform in ('microsoft_ads','bing_ads');
  select coalesce(sum(amount * (case when upper(coalesce(currency,'USD'))='PKR' then 1/v_fx else 1 end)),0)
    into v_ms_manual
    from public.company_expenses
   where expense_date >= v_from and expense_date <= v_to
     and coalesce(status,'') <> 'cancelled'
     and (category ~* 'microsoft|bing' or source ~* 'microsoft|bing' or description ~* 'microsoft ads|bing ads');

  v_g_state := case
    when v_g_days = 0 and v_g_last is null then 'not_connected'
    when v_g_days = 0 then 'connected_not_synced_for_period'
    when v_g_last >= v_to then 'synced'
    else 'synced_partial' end;
  v_m_state := case
    when v_m_rows_ever = 0 then 'not_connected'
    when v_m_days = 0 then 'connected_not_synced_for_period'
    when v_m_last >= v_to and v_m_spend_usd = 0 then 'connected_no_spend'
    when v_m_last >= v_to then 'synced'
    else 'connected_stale' end;
  v_ms_state := case
    when v_ms_rows_ever > 0 then 'synced'
    when v_ms_manual > 0 then 'not_connected_manual_expense_only'
    else 'not_connected' end;

  -- Ad spend deducted from the synced source ONLY (never company_expenses),
  -- exactly once. States that mean "spend existed but is not fully synced"
  -- make the month UNAVAILABLE for a real send (fail-closed in the sender).
  v_ad_spend := round(coalesce(case when v_g_days > 0 then v_g_spend_usd end, 0)
                    + coalesce(case when v_m_days > 0 then v_m_spend_usd end, 0), 2);
  v_ad_spend_available := (v_g_state in ('synced')) and (v_m_state in ('synced','connected_no_spend','not_connected','connected_stale','connected_not_synced_for_period'));
  -- Google is the load-bearing platform: an unsynced Google month blocks.
  -- Meta stale/absent is disclosed but does not block (its spend has been $0
  -- or absent; the state string is surfaced in the report and email).

  -- ── Operations ──
  select count(*) into v_completed
    from public.orders o
   where o.last_completed_at >= v_start and o.last_completed_at < v_end
     and public.order_payment_state(o) <> 'unpaid'
     and public.order_workflow_state(o) <> 'pending_delivery';

  select count(*) into v_cancelled
    from public.orders where last_cancelled_at >= v_start and last_cancelled_at < v_end;

  select count(*) into v_reopened
    from public.orders where last_reopened_at >= v_start and last_reopened_at < v_end;

  select count(*) into v_lead_now from public.orders o
   where public.order_workflow_state(o) = 'lead' and o.status <> 'archived';
  select count(*) into v_paid_now from public.orders o
   where public.order_workflow_state(o) = 'paid_unassigned'
     and public.order_payment_state(o) not in ('fully_refunded','unpaid','failed')
     and o.status <> 'archived';
  select count(*) into v_ur_now from public.orders o
   where (public.order_workflow_state(o) = 'under_review'
          or (public.order_workflow_state(o) = 'reopened' and (o.doctor_user_id is not null or o.doctor_email is not null)))
     and public.order_payment_state(o) not in ('fully_refunded','unpaid','failed')
     and o.status <> 'archived';
  select count(*) into v_pd_now from public.orders o
   where public.order_workflow_state(o) = 'pending_delivery'
     and public.order_payment_state(o) not in ('fully_refunded','unpaid','failed')
     and o.status <> 'archived';

  -- ── Customers / recovery ──
  select count(*) filter (where is_returning), count(*) filter (where not is_returning)
    into v_ret_cust, v_new_cust
    from (select o.email,
                 exists (select 1 from public.orders o2 where lower(o2.email) = lower(o.email) and o2.paid_at is not null and o2.paid_at < o.paid_at) as is_returning
            from public.orders o
           where o.paid_at >= v_start and o.paid_at < v_end and coalesce(o.email,'') <> '') c;

  select count(*), coalesce(sum(price),0) into v_recovered, v_recovered_rev
    from public.orders where paid_at >= v_start and paid_at < v_end and parent_order_id is not null;

  -- ── Lifecycle event coverage (§E) ──
  select count(*), min(occurred_at) into v_assigned_ev, v_assigned_cov
    from public.order_lifecycle_events
   where event_type = 'provider_assigned' and occurred_at >= v_start and occurred_at < v_end;
  select min(occurred_at) into v_assigned_cov from public.order_lifecycle_events where event_type = 'provider_assigned';

  select count(*) into v_ur_entered from public.orders
   where last_under_review_entered_at >= v_start and last_under_review_entered_at < v_end;
  select count(*) into v_ur_gap from public.orders
   where (doctor_user_id is not null or doctor_email is not null) and last_under_review_entered_at is null;
  select count(*) into v_pd_entered from public.orders
   where last_pending_delivery_entered_at >= v_start and last_pending_delivery_entered_at < v_end;
  select count(*) into v_cx_gap from public.orders
   where status = 'cancelled' and last_cancelled_at is null;
  select count(*) into v_paid_missing from public.orders
   where created_at >= v_start and created_at < v_end
     and status in ('processing','under-review','completed','refunded') and paid_at is null;
  select count(*) into v_done_missing_pns from public.orders
   where last_completed_at >= v_start and last_completed_at < v_end
     and patient_notification_sent_at is null;

  -- ── QA fixtures inside the period (canonical markers ONLY) ──
  select count(*) into v_qa
    from public.orders
   where paid_at >= v_start and paid_at < v_end
     and (coalesce(confirmation_id,'') ~ '^PT-LIVE-PENDINGQA-\d{2,4}$'
          or coalesce(email,'') ~* '@[^@\s]+\.test$');

  -- ── Cross-channel acquisition (single bucket definition, used everywhere) ──
  with paid as (
    select o.price, o.letter_type,
           coalesce(nullif(lower(o.attribution_json->>'channel'),''),
                    nullif(lower(o.last_touch_json->>'channel'),''),
                    nullif(lower(o.utm_source),''), 'unknown') as raw_channel,
           (o.gclid is not null or o.gbraid is not null or o.wbraid is not null) as has_google_click,
           (o.fbclid is not null) as has_fb_click,
           (o.refunded_at is not null or coalesce(o.refund_amount,0) > 0) as is_refunded,
           coalesce(o.refund_amount,0)::numeric as refund_amt,
           o.gclid
      from public.orders o
     where o.paid_at >= v_start and o.paid_at < v_end
  ), buck as (
    select p.*, case
        when raw_channel in ('google_ads','google-ads','googleads','adwords','google_cpc') then 'google_ads'
        when raw_channel in ('meta_ads','facebook','facebook_ads','meta','instagram','fb') then 'meta_ads'
        when raw_channel in ('microsoft_ads','bing','bing_ads','microsoft') then 'microsoft_ads'
        when raw_channel in ('chatgpt.com','chat.openai.com','chatgpt','openai') then 'chatgpt'
        when raw_channel in ('organic_search','organic','seo') then 'organic_search'
        when raw_channel = 'direct' then 'direct'
        when raw_channel = 'referral' then 'referral'
        when raw_channel in ('social_organic','social') then 'social_organic'
        when raw_channel = 'unknown' then 'unknown'
        else 'other'
      end as channel
      from paid p
  ), agg as (
    select channel, count(*) orders, sum(price)::numeric revenue,
           count(*) filter (where is_refunded) refund_count,
           sum(refund_amt) refund_amount,
           string_agg(distinct case when channel = 'other' then raw_channel end, ', ') raw_channels
      from buck group by channel
  )
  select jsonb_agg(jsonb_build_object(
           'channel', channel,
           'orders', orders,
           'revenue', round(revenue,2),
           'pct_orders', case when v_paid_orders > 0 then round(orders::numeric / v_paid_orders * 100, 1) end,
           'pct_revenue', case when v_gross > 0 then round(revenue / v_gross * 100, 1) end,
           'refund_count', refund_count,
           'refund_amount', round(refund_amount,2),
           'refund_adjusted_revenue', round(revenue - refund_amount,2),
           'raw_channels', raw_channels
         ) order by orders desc, revenue desc),
         coalesce(sum(orders),0), coalesce(sum(revenue),0)
    into v_channels, v_ch_orders, v_ch_revenue
    from agg;
  v_channels := coalesce(v_channels, '[]'::jsonb);

  -- Google backend block + attribution quality from the same bucket definition.
  with paid as (
    select o.price, o.letter_type,
           coalesce(nullif(lower(o.attribution_json->>'channel'),''),
                    nullif(lower(o.last_touch_json->>'channel'),''),
                    nullif(lower(o.utm_source),''), 'unknown') as raw_channel,
           (o.gclid is not null or o.gbraid is not null or o.wbraid is not null) as has_google_click,
           (o.fbclid is not null) as has_fb_click,
           (o.refunded_at is not null or coalesce(o.refund_amount,0) > 0) as is_refunded,
           coalesce(o.refund_amount,0)::numeric as refund_amt,
           o.gclid
      from public.orders o
     where o.paid_at >= v_start and o.paid_at < v_end
  ), buck as (
    select p.*, case
        when raw_channel in ('google_ads','google-ads','googleads','adwords','google_cpc') then 'google_ads'
        when raw_channel in ('meta_ads','facebook','facebook_ads','meta','instagram','fb') then 'meta_ads'
        when raw_channel in ('microsoft_ads','bing','bing_ads','microsoft') then 'microsoft_ads'
        when raw_channel in ('chatgpt.com','chat.openai.com','chatgpt','openai') then 'chatgpt'
        when raw_channel in ('organic_search','organic','seo') then 'organic_search'
        when raw_channel = 'direct' then 'direct'
        when raw_channel = 'referral' then 'referral'
        when raw_channel in ('social_organic','social') then 'social_organic'
        when raw_channel = 'unknown' then 'unknown'
        else 'other'
      end as channel
      from paid p
  ), g as (
    select count(*) orders, coalesce(sum(price),0)::numeric revenue,
           count(*) filter (where is_refunded) refunds,
           coalesce(sum(refund_amt),0) refund_amount,
           count(*) filter (where lower(coalesce(letter_type,''))='esa') esa,
           count(*) filter (where lower(coalesce(letter_type,''))='psd') psd,
           count(*) filter (where not has_google_click) missing_click_id
      from buck where channel = 'google_ads'
  ), q as (
    select count(*) filter (where channel = 'unknown') unknown_orders,
           count(*) filter (where channel <> 'google_ads' and has_google_click) conflicting_google,
           count(*) filter (where channel <> 'meta_ads' and has_fb_click) conflicting_meta,
           count(*) filter (where channel not in ('google_ads','meta_ads','microsoft_ads') and (has_google_click or has_fb_click)) paid_click_on_unpaid_channel,
           (select count(*) from (select gclid from buck where gclid is not null group by gclid having count(*) > 1) d) duplicate_gclids
      from buck
  ), mb as (
    select count(*) orders, coalesce(sum(price),0)::numeric revenue from buck where channel = 'meta_ads'
  ), org as (
    select count(*) orders, coalesce(sum(price),0)::numeric revenue, coalesce(sum(refund_amt),0) refunds
      from buck where channel = 'organic_search'
  )
  select jsonb_build_object(
           'attributed_orders', g.orders,
           'attributed_revenue', round(g.revenue,2),
           'cpa', case when g.orders > 0 and v_g_days > 0 then round(v_g_spend_usd / g.orders, 2) end,
           'roas', case when v_g_days > 0 and v_g_spend_usd > 0 then round(g.revenue / v_g_spend_usd, 2) end,
           'refund_count', g.refunds,
           'refund_amount', round(g.refund_amount,2),
           'refund_adjusted_revenue', round(g.revenue - g.refund_amount,2),
           'refund_adjusted_roas', case when v_g_days > 0 and v_g_spend_usd > 0 then round((g.revenue - g.refund_amount) / v_g_spend_usd, 2) end,
           'esa_orders', g.esa, 'psd_orders', g.psd,
           'missing_click_id_orders', g.missing_click_id),
         jsonb_build_object(
           'paid_orders', v_paid_orders,
           'unknown_or_unattributed', q.unknown_orders,
           'conflicting_google_signal', q.conflicting_google,
           'conflicting_meta_signal', q.conflicting_meta,
           'paid_click_on_nonpaid_channel', q.paid_click_on_unpaid_channel,
           'duplicate_gclids_in_period', q.duplicate_gclids,
           'note', 'conflicting = order carries a paid-platform click id while its resolved channel is a different channel; counted, never silently reassigned'),
         mb.orders, mb.revenue,
         org.orders, org.revenue, org.refunds
    into v_gb, v_attr_quality, v_mb_orders, v_mb_revenue, v_org_orders, v_org_revenue, v_org_refunds
    from g, q, mb, org;

  -- ── Money rollups: THE one formula ──
  v_business_net   := round(v_gross - v_stripe_fees - v_refund_amount - v_payouts, 2);
  v_contribution   := v_business_net; -- alias kept for consumers that label it Contribution After Stripe
  v_operating_net  := round(v_business_net - round(v_other_exp,2) - v_salary_usd - v_ad_spend, 2);
  v_total_expenses := round(round(v_stripe_fees,2) + round(v_refund_amount,2) + round(v_payouts,2)
                          + v_salary_usd + round(v_other_exp,2) + v_ad_spend, 2);

  -- ── Warnings ──
  if v_g_state <> 'synced' then
    v_warnings := v_warnings || jsonb_build_array(format('Google Ads spend is %s for %s (last synced day: %s). Operating Net cannot be trusted until the sync covers the full period.', v_g_state, p_month, coalesce(v_g_last::text,'never')));
  end if;
  if v_m_state in ('connected_stale','connected_not_synced_for_period') then
    v_warnings := v_warnings || jsonb_build_array(format('Meta Ads spend is %s (last synced day: %s). Shown spend covers only the synced days; missing sync is NOT $0.', v_m_state, coalesce(v_m_last::text,'never')));
  elsif v_m_state = 'not_connected' then
    v_warnings := v_warnings || jsonb_build_array('Meta Ads is not connected — no spend rows have ever been synced.');
  end if;
  if v_ms_state = 'not_connected_manual_expense_only' then
    v_warnings := v_warnings || jsonb_build_array('Microsoft/Bing Ads: not connected / manual expense only. Manual rows are company expenses, not attributable campaign performance.');
  elsif v_ms_state = 'not_connected' then
    v_warnings := v_warnings || jsonb_build_array('Microsoft/Bing Ads is not connected — no synced spend and no manual expense rows in this period.');
  end if;
  v_warnings := v_warnings || jsonb_build_array('Stripe fees are ESTIMATED at 2.9% + $0.30 per paid order (no per-charge fee is stored on orders).');
  v_warnings := v_warnings || jsonb_build_array('Salary is an ESTIMATE: prorated base salary + approved comp adjustments, converted at 1 USD = 280 PKR. Excludes attendance half-day deductions.');
  if v_g_currency = 'PKR' and v_g_days > 0 then
    v_warnings := v_warnings || jsonb_build_array('Google Ads bills in PKR; spend converted to USD at a fixed 280 PKR/USD.');
  end if;
  v_warnings := v_warnings || jsonb_build_array('Google Search Console is not integrated — organic clicks/impressions/position are unavailable (organic order attribution below is from the backend database).');
  v_warnings := v_warnings || jsonb_build_array('Traffic analytics not connected — no GA4 (or equivalent) reporting integration exists; sessions/users are unavailable.');
  if v_qa > 0 then
    v_warnings := v_warnings || jsonb_build_array(format('%s QA fixture order(s) fall inside this reporting period — a real send is blocked until they are removed.', v_qa));
  end if;
  if v_ur_gap > 0 then
    v_warnings := v_warnings || jsonb_build_array(format('%s assigned order(s) predate under-review entry tracking and have no entry timestamp (event counting began with order_status_logs, 2026-03-30).', v_ur_gap));
  end if;
  v_warnings := v_warnings || jsonb_build_array('Figures are database lifecycle-event basis (orders/doctor_earnings/company_expenses/marketing_ad_spend_daily). The Accounts screen''s Stripe cash-basis cards are a different universe by design; the shared components are ad spend, salary and manual expenses.');

  -- ── Reconciliation (to the cent, inside the payload) ──
  v_checks := jsonb_build_array(
    jsonb_build_object('name','cross_channel_orders_equal_paid_orders',
      'left', v_ch_orders, 'right', v_paid_orders, 'delta', v_ch_orders - v_paid_orders,
      'pass', v_ch_orders = v_paid_orders),
    jsonb_build_object('name','cross_channel_revenue_equals_gross',
      'left', round(v_ch_revenue,2), 'right', round(v_gross,2), 'delta', round(v_ch_revenue - v_gross,2),
      'pass', round(v_ch_revenue,2) = round(v_gross,2)),
    jsonb_build_object('name','business_net_identity',
      'left', round(v_gross - v_stripe_fees - v_refund_amount - v_payouts, 2), 'right', v_business_net,
      'delta', round(v_gross - v_stripe_fees - v_refund_amount - v_payouts, 2) - v_business_net,
      'pass', round(v_gross - v_stripe_fees - v_refund_amount - v_payouts, 2) = v_business_net),
    jsonb_build_object('name','operating_net_one_formula',
      'left', round(v_business_net - round(v_other_exp,2) - v_salary_usd - v_ad_spend, 2), 'right', v_operating_net,
      'delta', round(v_business_net - round(v_other_exp,2) - v_salary_usd - v_ad_spend, 2) - v_operating_net,
      'pass', round(v_business_net - round(v_other_exp,2) - v_salary_usd - v_ad_spend, 2) = v_operating_net),
    jsonb_build_object('name','expense_components_sum_to_total',
      'left', round(round(v_stripe_fees,2) + round(v_refund_amount,2) + round(v_payouts,2) + v_salary_usd + round(v_other_exp,2) + v_ad_spend, 2),
      'right', v_total_expenses,
      'delta', round(round(v_stripe_fees,2) + round(v_refund_amount,2) + round(v_payouts,2) + v_salary_usd + round(v_other_exp,2) + v_ad_spend, 2) - v_total_expenses,
      'pass', round(round(v_stripe_fees,2) + round(v_refund_amount,2) + round(v_payouts,2) + v_salary_usd + round(v_other_exp,2) + v_ad_spend, 2) = v_total_expenses),
    jsonb_build_object('name','gross_minus_total_expenses_equals_operating_net',
      'left', round(v_gross - v_total_expenses, 2), 'right', v_operating_net,
      'delta', round(v_gross - v_total_expenses, 2) - v_operating_net,
      'pass', round(v_gross - v_total_expenses, 2) = v_operating_net),
    jsonb_build_object('name','google_block_matches_channel_bucket',
      'left', (v_gb->>'attributed_orders')::int,
      'right', coalesce((select (c->>'orders')::int from jsonb_array_elements(v_channels) c where c->>'channel' = 'google_ads'), 0),
      'delta', (v_gb->>'attributed_orders')::int - coalesce((select (c->>'orders')::int from jsonb_array_elements(v_channels) c where c->>'channel' = 'google_ads'), 0),
      'pass', (v_gb->>'attributed_orders')::int = coalesce((select (c->>'orders')::int from jsonb_array_elements(v_channels) c where c->>'channel' = 'google_ads'), 0))
  );
  select bool_and((c->>'pass')::boolean) into v_reconciled from jsonb_array_elements(v_checks) c;

  -- ── Assemble ──
  v_result := jsonb_build_object(
    'meta', jsonb_build_object(
      'report_version', 2,
      'month', p_month,
      'label', trim(to_char(v_from, 'FMMonth YYYY')),
      'timezone', v_tz,
      'from', v_from, 'to_inclusive', v_to, 'days', v_days,
      'period_start_utc', v_start, 'period_end_exclusive_utc', v_end,
      'generated_at_utc', now(),
      'currency', 'USD', 'fx_pkr_per_usd', v_fx,
      'source', 'public.get_monthly_business_report(p_month) v2 — the canonical month-end payload',
      'basis', 'database lifecycle events; Stripe cash-basis Accounts cards are a separate universe by design'),
    'period', jsonb_build_object('from', v_from, 'to', v_to, 'days', v_days, 'currency', 'USD', 'fx_pkr_per_usd', v_fx),
    'revenue', jsonb_build_object(
      'gross_revenue', round(v_gross,2), 'paid_orders', v_paid_orders,
      'total_orders_created', v_total_orders, 'leads_created', v_leads,
      'paid_conversion_rate', case when (v_paid_orders + v_leads) > 0 then round(v_paid_orders::numeric / (v_paid_orders + v_leads) * 100, 1) end,
      'avg_order_value', case when v_paid_orders > 0 then round(v_gross / v_paid_orders, 2) else 0 end,
      'esa_orders', v_esa, 'psd_orders', v_psd,
      'new_customers', v_new_cust, 'returning_customers', v_ret_cust),
    'pnl', jsonb_build_object(
      'gross_revenue', round(v_gross,2),
      'stripe_fees_est', round(v_stripe_fees,2),
      'refund_amount', round(v_refund_amount,2), 'refund_count', v_refund_count,
      'provider_payouts', round(v_payouts,2),
      'business_net', v_business_net,
      'contribution_margin', v_contribution,
      'salary_expense_est', v_salary_usd, 'employee_count', v_emp_count,
      'other_expenses', round(v_other_exp,2),
      'ad_spend', v_ad_spend,
      'marketing_spend', v_ad_spend,
      'total_expenses', v_total_expenses,
      'operating_net', v_operating_net,
      'operating_net_formula', 'business_net - other_expenses - salary_expense_est - ad_spend (computeOperatingNet)'),
    'operations', jsonb_build_object(
      'completed_orders', v_completed,
      'cancelled_orders', v_cancelled,
      'reopened_orders', v_reopened,
      'refund_rate', case when v_paid_orders > 0 then round(v_refund_count::numeric / v_paid_orders * 100, 1) else 0 end,
      'queue_now', jsonb_build_object(
        'lead_unpaid', v_lead_now, 'paid_unassigned', v_paid_now,
        'under_review', v_ur_now, 'pending_delivery', v_pd_now,
        'as_of_utc', now()),
      'snapshot_now', (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (select status, count(*) c from public.orders group by status) s)),
    'lifecycle', jsonb_build_object(
      'basis', 'each event counted on its authoritative timestamp; gaps disclosed, never invented',
      'events', jsonb_build_array(
        jsonb_build_object('event','lead_created','source','orders.created_at','count_in_period', v_total_orders,'missing_timestamp_rows', 0),
        jsonb_build_object('event','paid','source','orders.paid_at','count_in_period', v_paid_orders,'missing_timestamp_rows', v_paid_missing,'note','missing = paid-ish orders created this period with NULL paid_at'),
        jsonb_build_object('event','provider_assigned','source','order_lifecycle_events.provider_assigned','count_in_period', v_assigned_ev,'coverage_from', v_assigned_cov,'note','event log begins 2026-07; assignments before coverage_from are not derivable'),
        jsonb_build_object('event','entered_under_review','source','orders.last_under_review_entered_at','count_in_period', v_ur_entered,'missing_timestamp_rows', v_ur_gap,'note','trigger-maintained; backfilled from order_status_logs (dense since 2026-03-30)'),
        jsonb_build_object('event','entered_pending_delivery','source','orders.last_pending_delivery_entered_at','count_in_period', v_pd_entered,'note','workflow introduced 2026-07; complete since introduction'),
        jsonb_build_object('event','completed','source','orders.last_completed_at','count_in_period', v_completed,'legacy_rows_missing_patient_notification_sent_at', v_done_missing_pns),
        jsonb_build_object('event','refunded','source','orders.refunded_at','count_in_period', v_refund_count,'missing_timestamp_rows', 0),
        jsonb_build_object('event','cancelled','source','orders.last_cancelled_at','count_in_period', v_cancelled,'missing_timestamp_rows', v_cx_gap,'note','legacy cancellations without a status log have no usable timestamp and are excluded from period counts'),
        jsonb_build_object('event','reopened','source','orders.last_reopened_at','count_in_period', v_reopened))),
    'acquisition', jsonb_build_object(
      'google_ads', jsonb_build_object(
        'connection', v_g_state,
        'spend_usd', case when v_g_days > 0 then v_g_spend_usd end,
        'spend_native', case when v_g_days > 0 then round(v_g_spend_native,2) end,
        'currency', case when v_g_days > 0 then v_g_currency end,
        'fx_pkr_per_usd', v_fx,
        'days_synced_in_period', v_g_days, 'days_in_period', v_days,
        'last_synced_day', v_g_last,
        'clicks', case when v_g_days > 0 then v_g_clicks end,
        'impressions', case when v_g_days > 0 then v_g_impr end,
        'platform_reported_conversions', case when v_g_days > 0 then round(v_g_platform_conv,1) end,
        'platform_vs_backend', case when v_g_days > 0 then jsonb_build_object(
            'platform_conversions', round(v_g_platform_conv,1),
            'backend_paid_orders', (v_gb->>'attributed_orders')::int,
            'delta', round(v_g_platform_conv - ((v_gb->>'attributed_orders')::int), 1),
            'note', 'Never assess Google Ads from platform conversions alone; the backend paid-order DB is authoritative. Historical PSD secondary-conversion double counting inflated platform numbers.') end,
        'backend', v_gb),
      'meta_ads', jsonb_build_object(
        'connection', v_m_state,
        'spend_usd', case when v_m_days > 0 then v_m_spend_usd end,
        'days_synced_in_period', v_m_days, 'days_in_period', v_days,
        'last_synced_day', v_m_last,
        'attributed_orders', v_mb_orders, 'attributed_revenue', round(v_mb_revenue,2)),
      'microsoft_ads', jsonb_build_object(
        'connection', v_ms_state,
        'label', case when v_ms_state = 'not_connected_manual_expense_only' then 'Not connected / manual expense only' when v_ms_state = 'not_connected' then 'Not connected' else 'Synced' end,
        'manual_expense_usd_in_period', case when v_ms_manual > 0 then round(v_ms_manual,2) end,
        'note', 'manual expense rows are company expenses (already inside other_expenses), not attributable campaign performance'),
      'cross_channel', v_channels,
      'attribution_quality', v_attr_quality,
      'refund_basis_note', 'channel refund figures are cohort basis (refunds observed to date on orders PAID in this period); the P&L refund line is event basis (refunds EXECUTED in this period, whichever month the order was paid)'),
    'organic_search', jsonb_build_object(
      'gsc', jsonb_build_object(
        'connected', false,
        'label', 'Google Search Console not integrated',
        'note', 'no GSC storage or connector exists in this project; clicks/impressions/CTR/position are unavailable. The 2026-07-19 SEO audit is a static baseline document, not live monthly data.'),
      'backend_attribution', jsonb_build_object(
        'organic_orders', v_org_orders,
        'organic_revenue', round(v_org_revenue,2),
        'organic_refund_amount', round(v_org_refunds,2),
        'organic_refund_adjusted_revenue', round(v_org_revenue - v_org_refunds,2))),
    'traffic', jsonb_build_object(
      'connected', false,
      'label', 'Traffic analytics not connected',
      'note', 'no GA4 or equivalent reporting integration exists; users/sessions/engagement are unavailable and are not rendered as zeros'),
    'providers', (select coalesce(jsonb_agg(jsonb_build_object('provider', provider, 'completed_orders', cnt, 'payout_usd', round(payout,2)) order by payout desc), '[]'::jsonb)
        from (select coalesce(doctor_name,'Unknown') provider, count(*) cnt, sum(doctor_amount) payout
                from public.doctor_earnings where created_at >= v_start and created_at < v_end and coalesce(status,'') <> 'cancelled' group by 1) p),
    'top_states', (select coalesce(jsonb_agg(jsonb_build_object('state', state, 'orders', orders, 'revenue', round(revenue,2)) order by orders desc, revenue desc), '[]'::jsonb)
        from (select state, count(*) orders, sum(price)::numeric revenue from public.orders
               where paid_at >= v_start and paid_at < v_end and coalesce(state,'') <> '' group by state order by count(*) desc limit 10) s),
    'refunds', jsonb_build_object(
      'count', v_refund_count, 'amount', round(v_refund_amount,2),
      'rate_pct_of_paid', case when v_paid_orders > 0 then round(v_refund_count::numeric / v_paid_orders * 100, 1) else 0 end,
      'by_state', (select coalesce(jsonb_agg(jsonb_build_object('state', state, 'refunds', c, 'amount', round(amt,2)) order by amt desc), '[]'::jsonb)
          from (select state, count(*) c, sum(coalesce(refund_amount,0))::numeric amt from public.orders
                 where refunded_at >= v_start and refunded_at < v_end and coalesce(state,'') <> '' group by state) r),
      'google_attributed_refunds_in_period', (select count(*) from public.orders o
          where o.refunded_at >= v_start and o.refunded_at < v_end
            and coalesce(nullif(lower(o.attribution_json->>'channel'),''), nullif(lower(o.last_touch_json->>'channel'),''), nullif(lower(o.utm_source),''), 'unknown')
                in ('google_ads','google-ads','googleads','adwords','google_cpc'))),
    'expenses', jsonb_build_object(
      'rows', jsonb_build_array(
        jsonb_build_object('category','stripe_fees_est','label','Stripe Fees (est.)','amount_usd', round(v_stripe_fees,2),'basis','estimated 2.9% + $0.30 per paid order'),
        jsonb_build_object('category','refunds','label','Refunds','amount_usd', round(v_refund_amount,2),'basis','orders.refunded_at event basis'),
        jsonb_build_object('category','provider_payouts','label','Provider Payouts','amount_usd', round(v_payouts,2),'basis','doctor_earnings accrued, de-duplicated, non-cancelled'),
        jsonb_build_object('category','salary_est','label','Salary (est.)','amount_usd', v_salary_usd,'basis','prorated base + approved adjustments, owner excluded, FX 280'),
        jsonb_build_object('category','ad_spend','label','Paid Media (synced)','amount_usd', v_ad_spend,'basis','marketing_ad_spend_daily only — never company_expenses; deducted exactly once'),
        jsonb_build_object('category','other','label','Other Company Expenses','amount_usd', round(v_other_exp,2),'basis','company_expenses manual rows excl. salary/payout/ads categories')),
      'total_usd', v_total_expenses),
    'recovery', jsonb_build_object('abandoned_leads', v_leads, 'recovered_orders', v_recovered, 'recovered_revenue', round(v_recovered_rev,2)),
    'qa_fixture_rows_in_period', v_qa,
    'ad_spend_available', v_ad_spend_available,
    'reconciliation', jsonb_build_object('reconciled', coalesce(v_reconciled,false), 'checks', v_checks),
    'data_warnings', v_warnings);

  return v_result;
end;
$function$;

comment on function public.get_monthly_business_report(text) is
  'MONTH-END-...-001: THE canonical month-end payload (v2). Period = the America/New_York business month named by p_month (YYYY-MM), derived server-side with make_timestamptz (DST-safe). Consumed verbatim by the report email, workbook, and previews; contains internal to-the-cent reconciliation checks. Service role or is_accounts_admin() only; anon/PUBLIC hold no EXECUTE.';

revoke all on function public.get_monthly_business_report(text) from public, anon;
grant execute on function public.get_monthly_business_report(text) to authenticated, service_role;
