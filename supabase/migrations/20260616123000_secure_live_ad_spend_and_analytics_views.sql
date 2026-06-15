-- ─────────────────────────────────────────────────────────────────────────────
-- Security Advisor remediation — LIVE (project cvwbozlbbmrjxznknouq).
-- Mirror of the approved TEST fix (pawtenant-test migration 20260616120000),
-- plus the ad-spend RLS block that LIVE additionally needs.
--
-- LIVE state before this migration:
--   • public.ad_spend_meta / public.ad_spend_google — RLS DISABLED, no policies,
--     and the `anon` role holds a SELECT grant → marketing spend rows are
--     publicly readable. (advisor: rls_disabled_in_public)
--   • public.funnel_summary / public.channel_performance — SECURITY DEFINER views
--     (advisor: security_definer_view, ERROR).
--
-- Why not a plain `security_invoker = true` flip on the views:
--   public.events SELECT RLS policy = `false` for anon AND authenticated (only the
--   owner / service_role can read raw events). An invoker funnel_summary would
--   return 0 for every event-based funnel count and BREAK the admin analytics.
--   visitor_sessions / orders SELECT are admin-gated. So we keep the privileged
--   read inside admin-gated SECURITY DEFINER functions and make the VIEWS invoker.
--
-- Output shape is byte-identical → no app-code change (LIVE admin dashboard still
-- reads .from('funnel_summary') / .from('channel_performance') / ad_spend_*).
-- service_role bypasses RLS, so sync-marketing-spend writes are unaffected.
-- Fully reversible; idempotent (CREATE OR REPLACE / IF EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — Ad spend tables: enable RLS, authenticated-read policy, deny anon.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.ad_spend_meta   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_spend_google ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ad_spend_meta_authenticated_read   ON public.ad_spend_meta;
DROP POLICY IF EXISTS ad_spend_google_authenticated_read ON public.ad_spend_google;

-- Admin dashboard (SourceLandingPaidRatePanel) reads these via the authenticated
-- supabase-js client. Mirror the TEST policy: authenticated SELECT only.
CREATE POLICY ad_spend_meta_authenticated_read
  ON public.ad_spend_meta   FOR SELECT TO authenticated USING (true);
CREATE POLICY ad_spend_google_authenticated_read
  ON public.ad_spend_google FOR SELECT TO authenticated USING (true);

-- Remove the public read grant (RLS already blocks anon, but revoke for clarity
-- and defense-in-depth). service_role keeps full access (sync jobs) and bypasses RLS.
REVOKE SELECT ON public.ad_spend_meta   FROM anon;
REVOKE SELECT ON public.ad_spend_google FROM anon;

-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — Analytics views: invoker views over admin-gated definer functions.
-- ════════════════════════════════════════════════════════════════════════════

-- ── funnel_summary_secure() — admin-gated definer read ──────────────────────
CREATE OR REPLACE FUNCTION public.funnel_summary_secure()
RETURNS TABLE (
  total_sessions    bigint,
  assessment_step_1 bigint,
  assessment_step_2 bigint,
  assessment_step_3 bigint,
  payment_attempted bigint,
  orders_completed  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM (
    SELECT
      (SELECT count(*) FROM public.visitor_sessions)                        AS total_sessions,
      (SELECT count(DISTINCT session_id)
         FROM public.events
        WHERE event_name = 'assessment_step_view'
          AND (props->>'step')::int = 1)                                    AS assessment_step_1,
      (SELECT count(DISTINCT session_id)
         FROM public.events
        WHERE event_name = 'assessment_step_view'
          AND (props->>'step')::int = 2)                                    AS assessment_step_2,
      (SELECT count(DISTINCT session_id)
         FROM public.events
        WHERE event_name = 'assessment_step_view'
          AND (props->>'step')::int = 3)                                    AS assessment_step_3,
      (SELECT count(DISTINCT session_id)
         FROM public.events
        WHERE event_name = 'payment_attempted')                            AS payment_attempted,
      (SELECT count(*)
         FROM public.orders
        WHERE payment_intent_id IS NOT NULL
          AND status NOT IN ('refunded','cancelled','archived'))           AS orders_completed
  ) f
  WHERE public.check_is_admin();
$$;

COMMENT ON FUNCTION public.funnel_summary_secure() IS
  'Admin-gated definer read backing the invoker view public.funnel_summary. Aggregates RLS-locked public.events; returns 0 rows for non-admins.';

-- ── channel_performance_secure() — admin-gated definer read ─────────────────
CREATE OR REPLACE FUNCTION public.channel_performance_secure()
RETURNS TABLE (
  channel         text,
  sessions        integer,
  orders          integer,
  conversion_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM (
    WITH session_orders AS (
      SELECT
        vs.session_id,
        COALESCE(NULLIF(trim(vs.channel), ''), 'direct') AS channel,
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
      channel,
      count(*)::int                          AS sessions,
      count(*) FILTER (WHERE converted)::int  AS orders,
      ROUND(
        (count(*) FILTER (WHERE converted))::numeric
        / NULLIF(count(*), 0)::numeric * 100,
        2
      )                                       AS conversion_rate
    FROM session_orders
    GROUP BY channel
    ORDER BY sessions DESC
  ) c
  WHERE public.check_is_admin();
$$;

COMMENT ON FUNCTION public.channel_performance_secure() IS
  'Admin-gated definer read backing the invoker view public.channel_performance. Returns 0 rows for non-admins.';

-- ── Function grants — authenticated + service_role only, never anon ─────────
REVOKE EXECUTE ON FUNCTION public.funnel_summary_secure()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.channel_performance_secure() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.funnel_summary_secure()      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.channel_performance_secure() TO authenticated, service_role;

-- ── Recreate the views as SECURITY INVOKER over the functions ───────────────
CREATE OR REPLACE VIEW public.funnel_summary
  WITH (security_invoker = true) AS
  SELECT * FROM public.funnel_summary_secure();

COMMENT ON VIEW public.funnel_summary IS
  'Phase 2 — single-row funnel counts. SECURITY INVOKER; privileged read + admin gate in funnel_summary_secure().';

CREATE OR REPLACE VIEW public.channel_performance
  WITH (security_invoker = true) AS
  SELECT * FROM public.channel_performance_secure();

COMMENT ON VIEW public.channel_performance IS
  'Phase 2 — sessions + paid orders + conversion_rate (%) per channel. SECURITY INVOKER; privileged read + admin gate in channel_performance_secure().';

-- ── View grants — authenticated only, anon/public denied ────────────────────
REVOKE SELECT ON public.funnel_summary      FROM anon, PUBLIC;
REVOKE SELECT ON public.channel_performance FROM anon, PUBLIC;
GRANT  SELECT ON public.funnel_summary      TO authenticated;
GRANT  SELECT ON public.channel_performance TO authenticated;
