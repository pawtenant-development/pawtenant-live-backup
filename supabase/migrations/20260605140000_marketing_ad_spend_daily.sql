-- Marketing ad spend (Google Ads + Meta Ads) daily sync + Accounts/Payments ROI layer.
-- Additive, idempotent, non-destructive. Does NOT touch existing finance/accounts logic.
--   * marketing_ad_spend_daily      — one row per platform/day/account/campaign (upsert target)
--   * marketing_ad_spend_sync_runs  — append-only log of each sync run (last synced / errors)
--   * get_marketing_spend_summary() — admin-gated read used by the Accounts UI
-- Business Net rule is unchanged. Marketing is a separate layer:
--   Net After Marketing = Business Net - Total Marketing Spend (USD).

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Daily spend table
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_ad_spend_daily (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_date           date NOT NULL,
  platform             text NOT NULL CHECK (platform IN ('google_ads','meta_ads')),
  account_id           text NOT NULL,
  account_name         text,
  campaign_id          text NOT NULL DEFAULT '',
  campaign_name        text,
  currency             text NOT NULL DEFAULT 'USD',
  spend_amount         numeric NOT NULL DEFAULT 0,
  clicks               integer,
  impressions          integer,
  platform_conversions numeric,
  raw_payload          jsonb,
  fetched_at           timestamptz DEFAULT now(),
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- Upsert key: platform + spend_date + account_id + campaign_id (campaign_id is
-- NOT NULL DEFAULT '' so the constraint is clean and supabase-js onConflict works).
CREATE UNIQUE INDEX IF NOT EXISTS marketing_ad_spend_daily_uniq
  ON public.marketing_ad_spend_daily (platform, spend_date, account_id, campaign_id);

CREATE INDEX IF NOT EXISTS marketing_ad_spend_daily_date_idx
  ON public.marketing_ad_spend_daily (spend_date);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Sync run log (drives "last synced" + "sync errors/status" in the UI)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_ad_spend_sync_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform           text NOT NULL CHECK (platform IN ('google_ads','meta_ads')),
  status             text NOT NULL CHECK (status IN ('success','error')),
  date_from          date,
  date_to            date,
  rows_upserted      integer DEFAULT 0,
  total_spend        numeric DEFAULT 0,   -- native account currency
  currency           text,
  error              text,
  started_at         timestamptz DEFAULT now(),
  finished_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_ad_spend_sync_runs_platform_idx
  ON public.marketing_ad_spend_sync_runs (platform, started_at DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. RLS — admin read only. Writes are service-role only (bypasses RLS).
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.marketing_ad_spend_daily     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ad_spend_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_spend_admin_read ON public.marketing_ad_spend_daily;
CREATE POLICY marketing_spend_admin_read ON public.marketing_ad_spend_daily
  FOR SELECT USING (public.is_accounts_admin());

DROP POLICY IF EXISTS marketing_spend_runs_admin_read ON public.marketing_ad_spend_sync_runs;
CREATE POLICY marketing_spend_runs_admin_read ON public.marketing_ad_spend_sync_runs
  FOR SELECT USING (public.is_accounts_admin());

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Admin-gated summary RPC used by Accounts/Payments UI
--    Returns spend in USD (fixed FX: PKR 280/USD, matching the app's analytics),
--    paid-order counts from the orders table (PawTenant truth, NOT platform
--    conversions), and per-platform cost-per-order + last sync status.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_marketing_spend_summary(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_google numeric := 0;
  v_meta   numeric := 0;
  v_total  numeric := 0;
  v_orders_total  integer := 0;
  v_orders_google integer := 0;
  v_orders_meta   integer := 0;
  v_last jsonb;
BEGIN
  IF NOT public.is_accounts_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  -- Spend → USD. Fixed FX rate matches the rest of the analytics layer.
  SELECT
    COALESCE(SUM(CASE WHEN platform = 'google_ads'
      THEN spend_amount * (CASE currency WHEN 'PKR' THEN (1/280.0) WHEN 'USD' THEN 1 ELSE 1 END) END), 0),
    COALESCE(SUM(CASE WHEN platform = 'meta_ads'
      THEN spend_amount * (CASE currency WHEN 'PKR' THEN (1/280.0) WHEN 'USD' THEN 1 ELSE 1 END) END), 0)
  INTO v_google, v_meta
  FROM public.marketing_ad_spend_daily
  WHERE spend_date BETWEEN p_from AND p_to;

  v_total := v_google + v_meta;

  -- Paid orders in range (truth source). Channel from canonical attribution_json.
  SELECT
    COUNT(*),
    COUNT(*) FILTER (
      WHERE lower(coalesce(attribution_json->>'channel','')) LIKE '%google%'
         OR lower(coalesce(attribution_json->>'utm_source','')) IN ('google','google_ads','adwords')),
    COUNT(*) FILTER (
      WHERE lower(coalesce(attribution_json->>'channel','')) ~ '(facebook|meta|instagram)'
         OR lower(coalesce(attribution_json->>'utm_source','')) IN ('fb','facebook','ig','instagram','meta'))
  INTO v_orders_total, v_orders_google, v_orders_meta
  FROM public.orders
  WHERE paid_at IS NOT NULL
    AND paid_at >= p_from::timestamptz
    AND paid_at < (p_to + 1)::timestamptz;

  -- Latest sync run per platform.
  SELECT jsonb_object_agg(platform, info) INTO v_last FROM (
    SELECT DISTINCT ON (platform) platform,
      jsonb_build_object(
        'last_synced_at', finished_at,
        'status', status,
        'error', error,
        'rows', rows_upserted,
        'date_from', date_from,
        'date_to', date_to
      ) AS info
    FROM public.marketing_ad_spend_sync_runs
    ORDER BY platform, started_at DESC
  ) s;

  RETURN jsonb_build_object(
    'date_from', p_from,
    'date_to', p_to,
    'currency', 'USD',
    'google_spend_usd', round(v_google, 2),
    'meta_spend_usd',   round(v_meta, 2),
    'total_spend_usd',  round(v_total, 2),
    'paid_orders_total',  v_orders_total,
    'paid_orders_google', v_orders_google,
    'paid_orders_meta',   v_orders_meta,
    'cost_per_paid_order',        CASE WHEN v_orders_total  > 0 THEN round(v_total  / v_orders_total, 2)  END,
    'google_cost_per_paid_order', CASE WHEN v_orders_google > 0 THEN round(v_google / v_orders_google, 2) END,
    'meta_cost_per_paid_order',   CASE WHEN v_orders_meta   > 0 THEN round(v_meta   / v_orders_meta, 2)   END,
    'last_sync', COALESCE(v_last, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_marketing_spend_summary(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketing_spend_summary(date, date) TO authenticated;
