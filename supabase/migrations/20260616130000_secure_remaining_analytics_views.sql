-- ─────────────────────────────────────────────────────────────────────────────
-- Security Advisor remediation — remaining SECURITY DEFINER analytics views (LIVE).
-- Mirror of approved TEST migration 20260616130000 (commit 1a707d2).
--   • public.landing_page_performance
--   • public.analytics_roi_summary
--
-- LIVE state before this migration (verified): both views SECURITY DEFINER
-- (advisor security_definer_view ERROR). Additionally `analytics_roi_summary`
-- still granted SELECT to `anon`, so the definer view exposed ad-spend campaign
-- + revenue rows to anonymous clients — this migration revokes that.
--
-- Why not a plain `security_invoker = true` flip:
--   - Both read visitor_sessions (admin-only RLS) + orders (admin via check_is_admin),
--     so a plain invoker view returns rows only for admins anyway.
--   - analytics_roi_summary ALSO reads ad_spend_meta/ad_spend_google (authenticated
--     can read those). Under a plain invoker view a NON-admin authenticated user would
--     still get the `spend` CTE rows (campaign_name/spend/clicks/impressions) — a partial
--     ad-spend leak. The admin gate closes that: non-admins get 0 rows.
--
-- Output shape byte-identical (same column names/types/order; spend/revenue kept
-- numeric(12,2)) → no app-code change. Reversible; idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. landing_page_performance_secure() ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.landing_page_performance_secure()
RETURNS TABLE (
  landing_url     text,
  sessions        integer,
  orders          integer,
  conversion_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH session_pages AS (
    SELECT
      vs.session_id,
      COALESCE(NULLIF(trim(split_part(vs.landing_url, '?', 1)), ''), '(unknown)') AS landing_url,
      EXISTS (
        SELECT 1
          FROM public.orders o
         WHERE o.session_id::uuid = vs.session_id
           AND o.payment_intent_id IS NOT NULL
           AND o.status NOT IN ('refunded','cancelled','archived')
      ) AS converted
    FROM public.visitor_sessions vs
  )
  SELECT
    landing_url,
    count(*)::int                         AS sessions,
    count(*) FILTER (WHERE converted)::int AS orders,
    ROUND(
      count(*) FILTER (WHERE converted)::numeric
      / NULLIF(count(*), 0)::numeric * 100,
      2
    )                                      AS conversion_rate
  FROM session_pages
  WHERE public.check_is_admin()
  GROUP BY landing_url
  ORDER BY sessions DESC;
$$;

COMMENT ON FUNCTION public.landing_page_performance_secure() IS
  'Admin-gated definer read backing the invoker view public.landing_page_performance. Returns 0 rows for non-admins.';

-- ── 2. analytics_roi_summary_secure() ───────────────────────────────────────
-- spend/revenue declared plain numeric here; the view casts them back to
-- numeric(12,2) so the view column types match the original exactly.
CREATE OR REPLACE FUNCTION public.analytics_roi_summary_secure()
RETURNS TABLE (
  campaign_name  text,
  channel        text,
  spend          numeric,
  sessions       integer,
  orders         integer,
  revenue        numeric,
  cost_per_order numeric,
  roi            numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH spend AS (
    SELECT 'facebook_ads'::text AS channel,
           ad_spend_meta.campaign_name,
           sum(ad_spend_meta.cost)::numeric(12,2)    AS spend,
           sum(ad_spend_meta.clicks)::int            AS clicks,
           sum(ad_spend_meta.impressions)::int       AS impressions
      FROM public.ad_spend_meta
     GROUP BY ad_spend_meta.campaign_name
    UNION ALL
    SELECT 'google_ads'::text AS channel,
           ad_spend_google.campaign_name,
           sum(ad_spend_google.cost)::numeric(12,2)  AS spend,
           sum(ad_spend_google.clicks)::int          AS clicks,
           sum(ad_spend_google.impressions)::int     AS impressions
      FROM public.ad_spend_google
     GROUP BY ad_spend_google.campaign_name
  ), attributed AS (
    SELECT COALESCE(NULLIF(trim(vs.channel), ''), 'direct')          AS channel,
           COALESCE(NULLIF(trim(vs.utm_campaign), ''), '(none)')     AS campaign_name,
           vs.session_id,
           EXISTS (
             SELECT 1 FROM public.orders o
              WHERE o.session_id::uuid = vs.session_id
                AND o.payment_intent_id IS NOT NULL
                AND o.status NOT IN ('refunded','cancelled','archived')
           ) AS converted,
           ( SELECT COALESCE(sum(o.price), 0::bigint)::numeric(12,2)
               FROM public.orders o
              WHERE o.session_id::uuid = vs.session_id
                AND o.payment_intent_id IS NOT NULL
                AND o.status NOT IN ('refunded','cancelled','archived') ) AS session_revenue
      FROM public.visitor_sessions vs
  ), attribution_rollup AS (
    SELECT attributed.channel,
           attributed.campaign_name,
           count(*)::int                                AS sessions,
           count(*) FILTER (WHERE attributed.converted)::int AS orders,
           sum(attributed.session_revenue)::numeric(12,2)    AS revenue
      FROM attributed
     GROUP BY attributed.channel, attributed.campaign_name
  )
  SELECT
    COALESCE(s.campaign_name, a.campaign_name)            AS campaign_name,
    COALESCE(s.channel, a.channel)                        AS channel,
    COALESCE(s.spend, 0::numeric)::numeric(12,2)          AS spend,
    COALESCE(a.sessions, 0)                               AS sessions,
    COALESCE(a.orders, 0)                                 AS orders,
    COALESCE(a.revenue, 0::numeric)::numeric(12,2)        AS revenue,
    CASE WHEN COALESCE(a.orders, 0) > 0
         THEN round(COALESCE(s.spend, 0::numeric) / a.orders::numeric, 2)
         ELSE NULL::numeric END                           AS cost_per_order,
    CASE WHEN COALESCE(s.spend, 0::numeric) > 0::numeric
         THEN round((COALESCE(a.revenue, 0::numeric) - s.spend) / s.spend * 100::numeric, 2)
         ELSE NULL::numeric END                           AS roi
  FROM spend s
  FULL JOIN attribution_rollup a
    ON lower(trim(s.channel)) = lower(trim(a.channel))
   AND lower(trim(s.campaign_name)) = lower(trim(a.campaign_name))
  WHERE public.check_is_admin()
  ORDER BY COALESCE(s.spend, 0::numeric) DESC NULLS LAST,
           COALESCE(a.revenue, 0::numeric) DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.analytics_roi_summary_secure() IS
  'Admin-gated definer read backing the invoker view public.analytics_roi_summary. Returns 0 rows for non-admins.';

-- ── 3. Function grants — authenticated + service_role only, never anon ──────
REVOKE EXECUTE ON FUNCTION public.landing_page_performance_secure() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.analytics_roi_summary_secure()    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.landing_page_performance_secure() TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.analytics_roi_summary_secure()    TO authenticated, service_role;

-- ── 4. Recreate views as SECURITY INVOKER over the functions ────────────────
CREATE OR REPLACE VIEW public.landing_page_performance
  WITH (security_invoker = true) AS
  SELECT landing_url, sessions, orders, conversion_rate
  FROM public.landing_page_performance_secure();

COMMENT ON VIEW public.landing_page_performance IS
  'Phase 2 — sessions + paid orders + conversion_rate (%) per landing_url path. SECURITY INVOKER; privileged read + admin gate in landing_page_performance_secure().';

CREATE OR REPLACE VIEW public.analytics_roi_summary
  WITH (security_invoker = true) AS
  SELECT
    campaign_name,
    channel,
    spend::numeric(12,2)   AS spend,
    sessions,
    orders,
    revenue::numeric(12,2) AS revenue,
    cost_per_order,
    roi
  FROM public.analytics_roi_summary_secure();

COMMENT ON VIEW public.analytics_roi_summary IS
  'Phase 3 — spend to attribution ROI rollup per campaign. SECURITY INVOKER; privileged read + admin gate in analytics_roi_summary_secure().';

-- ── 5. View grants — authenticated only, anon/public denied ─────────────────
REVOKE SELECT ON public.landing_page_performance FROM anon, PUBLIC;
REVOKE SELECT ON public.analytics_roi_summary    FROM anon, PUBLIC;
GRANT  SELECT ON public.landing_page_performance TO authenticated;
GRANT  SELECT ON public.analytics_roi_summary    TO authenticated;
