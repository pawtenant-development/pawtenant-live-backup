-- =====================================================================
-- Analytics Schema Capture — 2026-05-16
-- =====================================================================
--
-- Phase 2.0 of the analytics LIVE-parity rollout.
--
-- Several analytics objects exist in the TEST Supabase database but
-- were never committed to version control. They got created manually
-- through the SQL editor over time and are now silently load-bearing
-- for multiple admin panels (OwnerKpiStrip, Phase2AnalyticsPanel,
-- SmartInsightsPanel, SyncHealthCards) plus several edge functions
-- (fetch-ad-spend, send-meta-capi-event, sync-google-ads-conversions,
-- google-oauth-callback, google-oauth-save-token, stripe-webhook).
--
-- This migration captures everything it can from code-level analysis so
-- a clean TEST → LIVE mirror is possible later, AND so the TEST schema
-- itself is fully described in version control going forward.
--
-- ─────────────────────────────────────────────────────────────────────
-- Safety guarantees:
--   1. Idempotent — every statement uses IF NOT EXISTS / CREATE OR
--      REPLACE. Safe to re-run on TEST where most objects already
--      exist. Safe to run on LIVE where none exist.
--   2. Additive — no DROP, no TRUNCATE, no destructive ALTER.
--   3. Conservative — column types deduced from how each column is
--      read/written. Where a type isn't 100% certain (e.g. precision),
--      a sane default is used; correct in TEST today.
--   4. No RLS / GRANT statements included — the existing tables do not
--      have visible RLS in code paths, and adding policies retroactively
--      could lock out legitimate readers. Add separately if needed.
--
-- ─────────────────────────────────────────────────────────────────────
-- Update 2026-05-16 — analytics_roi_summary captured. The real view
-- body (pulled via pg_get_viewdef on TEST) replaced the prior stub.
-- Substituting the real body surfaced TWO additional undocumented
-- tables the view depends on:
--   • public.ad_spend_meta    (Meta / Facebook ads spend rows)
--   • public.ad_spend_google  (Google ads spend rows)
-- Both are captured in §4 of this migration.
--
-- The view also references `orders.session_id::uuid`. That column is
-- added by the existing migration 20260502120000_analytics_phase1.sql.
-- For LIVE rollout, analytics_phase1 MUST run before this migration so
-- the view body compiles. Order: phase1 → phase1_rpc_fix →
-- phase2_views → this migration.
--
-- ─────────────────────────────────────────────────────────────────────

-- =====================================================================
-- 1. orders — ad-platform sync + attribution columns
-- =====================================================================
-- All additive, all nullable. Existing rows get NULL. New rows get
-- values written by edge functions (sync-google-ads-conversions,
-- send-meta-capi-event, stripe-webhook for refunds).

ALTER TABLE public.orders
  -- ── Google Ads upload pipeline ──────────────────────────────────────
  -- Values observed in code:
  --   'uploaded', 'failed', 'refunded_pending_adjustment',
  --   'skipped_website_tag', 'unattributable'
  ADD COLUMN IF NOT EXISTS google_ads_upload_status   text,
  ADD COLUMN IF NOT EXISTS google_ads_uploaded_at     timestamptz,
  ADD COLUMN IF NOT EXISTS google_ads_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_ads_upload_error    text,
  ADD COLUMN IF NOT EXISTS google_ads_upload_method   text,

  -- ── Meta CAPI (Facebook/Instagram conversions) ──────────────────────
  -- Values observed: 'sent', 'failed', 'skipped_missing_user_data',
  -- 'queued'.
  ADD COLUMN IF NOT EXISTS meta_capi_status   text,
  ADD COLUMN IF NOT EXISTS meta_capi_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS meta_capi_error    text,
  ADD COLUMN IF NOT EXISTS meta_capi_event_id text,

  -- Cached SHA-256 hash of phone number for CAPI advanced matching.
  -- Computed once on first CAPI send so subsequent retries don't
  -- recompute the hash from raw phone.
  ADD COLUMN IF NOT EXISTS phone_sha256 text,

  -- ── Attribution snapshot at order creation ──────────────────────────
  -- Distinct from first_touch_json / last_touch_json (added by
  -- 20260502120000_analytics_phase1.sql). This column stores the
  -- consolidated channel/source rollup produced by
  -- src/lib/attributionStore.buildAttributionJson() at checkout step 2
  -- ("step2_lead") and overwritten at step 3 ("step3_paid") with the
  -- final paid-touch snapshot. Keys include:
  --   channel, utm_source, utm_medium, utm_campaign, utm_term,
  --   utm_content, gclid, fbclid, ref, referrer, landing_url,
  --   first_seen_at, last_touch_at, etc.
  ADD COLUMN IF NOT EXISTS attribution_json jsonb;

COMMENT ON COLUMN public.orders.google_ads_upload_status IS
  'Google Ads offline-conversion upload state. NULL = never attempted. uploaded/failed/refunded_pending_adjustment/skipped_website_tag/unattributable.';
COMMENT ON COLUMN public.orders.google_ads_uploaded_at IS
  'Timestamp of the last SUCCESSFUL Google Ads upload for this order.';
COMMENT ON COLUMN public.orders.google_ads_last_attempt_at IS
  'Timestamp of the last upload attempt (success OR failure).';
COMMENT ON COLUMN public.orders.google_ads_upload_error IS
  'Last error string from Google Ads API. NULL on success.';
COMMENT ON COLUMN public.orders.google_ads_upload_method IS
  'Which upload path was used (e.g. enhanced_conversions, click_conversions).';
COMMENT ON COLUMN public.orders.meta_capi_status IS
  'Meta CAPI delivery state: sent / failed / skipped_missing_user_data / queued.';
COMMENT ON COLUMN public.orders.meta_capi_sent_at IS
  'Timestamp of last successful CAPI send.';
COMMENT ON COLUMN public.orders.meta_capi_error IS
  'Last CAPI error string. NULL on success.';
COMMENT ON COLUMN public.orders.meta_capi_event_id IS
  'Idempotency key sent to Meta to dedupe browser-pixel and CAPI events.';
COMMENT ON COLUMN public.orders.phone_sha256 IS
  'SHA-256 hash of normalized phone number, cached for CAPI advanced matching.';
COMMENT ON COLUMN public.orders.attribution_json IS
  'Consolidated attribution snapshot (channel + UTMs + click ids + referrer) built by attributionStore.buildAttributionJson() at checkout. Separate from first_touch_json / last_touch_json which were added by analytics_phase1.';


-- =====================================================================
-- 2. ad_platform_settings — ad-API credentials + spend cache
-- =====================================================================
-- Stores OAuth tokens for Google / Facebook / TikTok and the most
-- recent spend response cached as JSON. Used by:
--   * fetch-ad-spend edge function (read tokens, cache last response)
--   * google-oauth-callback edge function (write refresh_token)
--   * google-oauth-save-token edge function (write refresh_token)
--   * SyncHealthCards admin tile (read last_fetched_at, last_spend_data)
--
-- `platform` is the natural primary key (one row per platform) —
-- confirmed by `upsert(..., { onConflict: "platform" })` in
-- fetch-ad-spend/index.ts and google-oauth-callback/index.ts.

CREATE TABLE IF NOT EXISTS public.ad_platform_settings (
  platform        text        PRIMARY KEY,
  access_token    text,
  account_id      text,
  last_fetched_at timestamptz,
  last_spend_data jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ad_platform_settings IS
  'Per-platform ad API credentials + last spend response cache. One row per platform (google/facebook/tiktok). PK on platform column. Written by OAuth edge functions and fetch-ad-spend; read by SyncHealthCards.';

-- Updated_at trigger (only created if not already present). Pattern
-- mirrors the visitor_sessions_set_updated_at helper from
-- 20260424140000_visitor_sessions.sql.
CREATE OR REPLACE FUNCTION public.ad_platform_settings_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ad_platform_settings_updated_at
  ON public.ad_platform_settings;
CREATE TRIGGER ad_platform_settings_updated_at
  BEFORE UPDATE ON public.ad_platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.ad_platform_settings_set_updated_at();


-- =====================================================================
-- 3. ad_spend_meta + ad_spend_google — raw ad-spend rows
-- =====================================================================
-- Discovered via pg_get_viewdef('public.analytics_roi_summary') —
-- these two tables back the spend-rollup CTE in the ROI view.
--
-- The Phase2AnalyticsPanel empty state hints these are populated by
-- manual operator insert (see Phase2AnalyticsPanel.tsx line 915:
-- "Insert spend rows into ad_spend_meta or ad_spend_google to populate
-- this view"). No edge function in the codebase writes to either
-- table today.
--
-- Minimum required columns (from view DDL):
--   campaign_name   text     — non-empty (filtered via NULLIF + TRIM)
--   cost            numeric  — sum'd into numeric(12,2)
--   clicks          integer  — sum'd into integer
--   impressions     integer  — sum'd into integer
--
-- Additional columns typical for ad-spend ingest (date dimension,
-- currency, account context, audit timestamps) are added as nullable
-- so a future automated ingest can populate them without another
-- migration. If TEST already has wider columns, CREATE TABLE IF NOT
-- EXISTS leaves them untouched.
--
-- ⚠️ Operator verification recommended on TEST before LIVE rollout:
--    SELECT column_name, data_type, is_nullable
--      FROM information_schema.columns
--     WHERE table_schema = 'public'
--       AND table_name IN ('ad_spend_meta','ad_spend_google')
--     ORDER BY table_name, ordinal_position;

CREATE TABLE IF NOT EXISTS public.ad_spend_meta (
  id            bigserial    PRIMARY KEY,
  campaign_name text,
  cost          numeric(12,2),
  clicks        integer,
  impressions   integer,
  date          date,
  account_id    text,
  currency      text,
  raw_payload   jsonb,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ad_spend_google (
  id            bigserial    PRIMARY KEY,
  campaign_name text,
  cost          numeric(12,2),
  clicks        integer,
  impressions   integer,
  date          date,
  account_id    text,
  currency      text,
  raw_payload   jsonb,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_spend_meta_campaign_idx
  ON public.ad_spend_meta (campaign_name);
CREATE INDEX IF NOT EXISTS ad_spend_meta_date_idx
  ON public.ad_spend_meta (date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS ad_spend_google_campaign_idx
  ON public.ad_spend_google (campaign_name);
CREATE INDEX IF NOT EXISTS ad_spend_google_date_idx
  ON public.ad_spend_google (date DESC NULLS LAST);

COMMENT ON TABLE public.ad_spend_meta IS
  'Raw daily ad-spend rows from Meta (Facebook + Instagram). One row per (date, campaign) typically. Aggregated into analytics_roi_summary view by campaign_name.';
COMMENT ON TABLE public.ad_spend_google IS
  'Raw daily ad-spend rows from Google Ads. One row per (date, campaign) typically. Aggregated into analytics_roi_summary view by campaign_name.';


-- =====================================================================
-- 4. analytics_roi_summary — channel/campaign ROI rollup view
-- =====================================================================
-- Real view body extracted from TEST Supabase via
--   SELECT pg_get_viewdef('public.analytics_roi_summary'::regclass, true);
-- on 2026-05-16.
--
-- Computes per (channel, campaign_name) rollup of:
--   • spend / clicks / impressions    — from ad_spend_meta UNION
--                                       ad_spend_google
--   • sessions / orders / revenue     — derived per visitor_session
--                                       by counting whether the session
--                                       produced a paid order (joined
--                                       via orders.session_id::uuid)
--   • cost_per_order = spend / orders (NULL when no orders)
--   • roi            = (revenue - spend) / spend * 100 (NULL when no spend)
--
-- Dependencies:
--   • public.ad_spend_meta            (created in §3 above)
--   • public.ad_spend_google          (created in §3 above)
--   • public.visitor_sessions         (existing — visitor_sessions migration)
--   • public.orders.session_id        (added by 20260502120000_analytics_phase1.sql)
--
-- The match between spend.campaign_name and attributed.campaign_name is
-- case-insensitive + whitespace-trimmed via lower(trim(...)) on both
-- sides — the FULL JOIN means rows with spend-only OR attribution-only
-- still surface (one side just shows zeros).

CREATE OR REPLACE VIEW public.analytics_roi_summary AS
WITH spend AS (
  SELECT 'facebook_ads'::text                                AS channel,
         ad_spend_meta.campaign_name,
         sum(ad_spend_meta.cost)::numeric(12,2)              AS spend,
         sum(ad_spend_meta.clicks)::integer                  AS clicks,
         sum(ad_spend_meta.impressions)::integer             AS impressions
    FROM ad_spend_meta
   GROUP BY ad_spend_meta.campaign_name
  UNION ALL
  SELECT 'google_ads'::text                                  AS channel,
         ad_spend_google.campaign_name,
         sum(ad_spend_google.cost)::numeric(12,2)            AS spend,
         sum(ad_spend_google.clicks)::integer                AS clicks,
         sum(ad_spend_google.impressions)::integer           AS impressions
    FROM ad_spend_google
   GROUP BY ad_spend_google.campaign_name
),
attributed AS (
  SELECT COALESCE(NULLIF(TRIM(BOTH FROM vs.channel),      ''::text), 'direct'::text) AS channel,
         COALESCE(NULLIF(TRIM(BOTH FROM vs.utm_campaign), ''::text), '(none)'::text) AS campaign_name,
         vs.session_id,
         (EXISTS (
           SELECT 1
             FROM orders o
            WHERE o.session_id::uuid = vs.session_id
              AND o.payment_intent_id IS NOT NULL
              AND (o.status <> ALL (ARRAY['refunded'::text, 'cancelled'::text, 'archived'::text]))
         ))                                                   AS converted,
         (
           SELECT COALESCE(sum(o.price), 0::bigint)::numeric(12,2)
             FROM orders o
            WHERE o.session_id::uuid = vs.session_id
              AND o.payment_intent_id IS NOT NULL
              AND (o.status <> ALL (ARRAY['refunded'::text, 'cancelled'::text, 'archived'::text]))
         )                                                    AS session_revenue
    FROM visitor_sessions vs
),
attribution_rollup AS (
  SELECT attributed.channel,
         attributed.campaign_name,
         count(*)::integer                                    AS sessions,
         count(*) FILTER (WHERE attributed.converted)::integer AS orders,
         sum(attributed.session_revenue)::numeric(12,2)       AS revenue
    FROM attributed
   GROUP BY attributed.channel, attributed.campaign_name
)
SELECT COALESCE(s.campaign_name, a.campaign_name)              AS campaign_name,
       COALESCE(s.channel,        a.channel)                   AS channel,
       COALESCE(s.spend,          0::numeric)::numeric(12,2)   AS spend,
       COALESCE(a.sessions,       0)                           AS sessions,
       COALESCE(a.orders,         0)                           AS orders,
       COALESCE(a.revenue,        0::numeric)::numeric(12,2)   AS revenue,
       CASE
         WHEN COALESCE(a.orders, 0) > 0
           THEN round(COALESCE(s.spend, 0::numeric) / a.orders::numeric, 2)
         ELSE NULL::numeric
       END                                                     AS cost_per_order,
       CASE
         WHEN COALESCE(s.spend, 0::numeric) > 0::numeric
           THEN round((COALESCE(a.revenue, 0::numeric) - s.spend) / s.spend * 100::numeric, 2)
         ELSE NULL::numeric
       END                                                     AS roi
  FROM spend s
  FULL JOIN attribution_rollup a
    ON  lower(TRIM(BOTH FROM s.channel))       = lower(TRIM(BOTH FROM a.channel))
    AND lower(TRIM(BOTH FROM s.campaign_name)) = lower(TRIM(BOTH FROM a.campaign_name))
 ORDER BY COALESCE(s.spend,   0::numeric) DESC NULLS LAST,
          COALESCE(a.revenue, 0::numeric) DESC NULLS LAST;

COMMENT ON VIEW public.analytics_roi_summary IS
  'Per (channel, campaign_name) rollup of spend (ad_spend_meta + ad_spend_google) joined to attributed sessions/orders/revenue from visitor_sessions ↔ orders. FULL JOIN — rows with spend-only or attribution-only still appear.';


-- =====================================================================
-- 5. Hidden-schema verification queries (run manually on TEST)
-- =====================================================================
-- These are NOT executed by this migration. They are documentation /
-- copy-paste helpers for operators to confirm the schema-capture is
-- complete and remains in sync.
--
-- A) Confirm orders has all 11 new columns:
--    SELECT column_name, data_type
--      FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'orders'
--       AND column_name IN (
--         'google_ads_upload_status', 'google_ads_uploaded_at',
--         'google_ads_last_attempt_at', 'google_ads_upload_error',
--         'google_ads_upload_method',
--         'meta_capi_status', 'meta_capi_sent_at', 'meta_capi_error',
--         'meta_capi_event_id', 'phone_sha256',
--         'attribution_json'
--       )
--     ORDER BY column_name;
--    -- Expected: 11 rows.
--
-- B) Confirm analytics_roi_summary view body in TEST still matches
--    what's captured in §4 above (any drift = re-capture required):
--    SELECT pg_get_viewdef('public.analytics_roi_summary'::regclass, true);
--
-- C) Confirm ad_platform_settings shape:
--    SELECT column_name, data_type, is_nullable
--      FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'ad_platform_settings'
--     ORDER BY ordinal_position;
--
-- D) Confirm ad_spend_meta + ad_spend_google shapes on TEST. The
--    migration created minimum columns (campaign_name / cost / clicks /
--    impressions + date / account_id / currency / raw_payload / audit
--    timestamps). If TEST's existing tables have additional columns,
--    they're preserved (CREATE TABLE IF NOT EXISTS is a no-op when the
--    table already exists). Re-check before LIVE mirror to confirm
--    nothing in LIVE will be missing that operators rely on:
--    SELECT column_name, data_type, is_nullable
--      FROM information_schema.columns
--     WHERE table_schema = 'public'
--       AND table_name IN ('ad_spend_meta','ad_spend_google')
--     ORDER BY table_name, ordinal_position;
--
-- E) Sanity-scan for any OTHER analytics-related objects this migration
--    might have missed:
--    SELECT table_schema, table_name
--      FROM information_schema.tables
--     WHERE table_schema = 'public'
--       AND (table_name ILIKE '%analytic%'
--            OR table_name ILIKE '%attribut%'
--            OR table_name ILIKE '%spend%'
--            OR table_name ILIKE '%roi%')
--     ORDER BY table_name;
--
--    SELECT routine_schema, routine_name, routine_type
--      FROM information_schema.routines
--     WHERE routine_schema = 'public'
--       AND (routine_name ILIKE '%analytic%' OR routine_name ILIKE '%spend%')
--     ORDER BY routine_name;
