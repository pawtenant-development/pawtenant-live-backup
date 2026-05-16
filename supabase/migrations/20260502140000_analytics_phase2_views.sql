-- ─────────────────────────────────────────────────────────────────────────────
-- Analytics Phase 2 — Views for the admin dashboard.
--
-- Read-only views over visitor_sessions / events / orders. Idempotent.
-- All views are SECURITY INVOKER (default). RLS still applies to base tables,
-- so we add explicit GRANT SELECT to the authenticated role only — admin
-- session loads use authenticated role through the supabase-js client.
-- Views are not exposed to anon.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. funnel_summary ──────────────────────────────────────────────────────
-- Single-row view with the funnel counts:
--   total_sessions      — all rows in visitor_sessions
--   assessment_step_1   — distinct sessions that fired step:1 view
--   assessment_step_2   — distinct sessions that fired step:2 view
--   assessment_step_3   — distinct sessions that fired step:3 view
--   payment_attempted   — distinct sessions that fired payment_attempted
--   orders_completed    — orders rows with payment_intent_id present and
--                         status not in (refunded, cancelled, archived)
CREATE OR REPLACE VIEW public.funnel_summary AS
SELECT
  (SELECT count(*) FROM public.visitor_sessions)                         AS total_sessions,
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
     WHERE event_name = 'payment_attempted')                             AS payment_attempted,
  (SELECT count(*)
     FROM public.orders
     WHERE payment_intent_id IS NOT NULL
       AND status NOT IN ('refunded','cancelled','archived'))            AS orders_completed;

COMMENT ON VIEW public.funnel_summary IS
  'Phase 2 — single-row funnel counts: visitors → steps → payment → orders.';


-- ── 2. channel_performance ─────────────────────────────────────────────────
-- Sessions and converted-orders rolled up per channel.
--   channel — visitor_sessions.channel (canonical key from buildChannel)
--   sessions — count of distinct visitor_sessions
--   orders   — orders rows linked to those sessions (via session_id) AND paid
--   conversion_rate — orders / sessions, NULL-safe
CREATE OR REPLACE VIEW public.channel_performance AS
WITH session_orders AS (
  SELECT
    vs.session_id,
    COALESCE(NULLIF(trim(vs.channel), ''), 'direct') AS channel,
    EXISTS (
      SELECT 1
        FROM public.orders o
       WHERE o.session_id = vs.session_id
         AND o.payment_intent_id IS NOT NULL
         AND o.status NOT IN ('refunded','cancelled','archived')
    ) AS converted
  FROM public.visitor_sessions vs
)
SELECT
  channel,
  count(*)::int                                                            AS sessions,
  count(*) FILTER (WHERE converted)::int                                   AS orders,
  ROUND(
    (count(*) FILTER (WHERE converted))::numeric
    / NULLIF(count(*), 0)::numeric * 100,
    2
  )                                                                        AS conversion_rate
FROM session_orders
GROUP BY channel
ORDER BY sessions DESC;

COMMENT ON VIEW public.channel_performance IS
  'Phase 2 — sessions + paid orders + conversion_rate (%) per visitor_sessions.channel.';


-- ── 3. landing_page_performance ────────────────────────────────────────────
-- Same shape as channel_performance, grouped by landing_url path.
-- We strip the query string so /assessment?utm_source=foo and /assessment
-- bucket together. NULL/empty landing_url → '(unknown)'.
CREATE OR REPLACE VIEW public.landing_page_performance AS
WITH session_pages AS (
  SELECT
    vs.session_id,
    COALESCE(
      NULLIF(trim(split_part(vs.landing_url, '?', 1)), ''),
      '(unknown)'
    ) AS landing_url,
    EXISTS (
      SELECT 1
        FROM public.orders o
       WHERE o.session_id = vs.session_id
         AND o.payment_intent_id IS NOT NULL
         AND o.status NOT IN ('refunded','cancelled','archived')
    ) AS converted
  FROM public.visitor_sessions vs
)
SELECT
  landing_url,
  count(*)::int                                                            AS sessions,
  count(*) FILTER (WHERE converted)::int                                   AS orders,
  ROUND(
    (count(*) FILTER (WHERE converted))::numeric
    / NULLIF(count(*), 0)::numeric * 100,
    2
  )                                                                        AS conversion_rate
FROM session_pages
GROUP BY landing_url
ORDER BY sessions DESC;

COMMENT ON VIEW public.landing_page_performance IS
  'Phase 2 — sessions + paid orders + conversion_rate (%) grouped by landing_url path.';


-- ── 4. Grants ──────────────────────────────────────────────────────────────
-- Admin pages call these via the supabase-js client. Only the authenticated
-- role is granted SELECT. Anon stays denied.
GRANT SELECT ON public.funnel_summary           TO authenticated;
GRANT SELECT ON public.channel_performance      TO authenticated;
GRANT SELECT ON public.landing_page_performance TO authenticated;

REVOKE SELECT ON public.funnel_summary           FROM anon;
REVOKE SELECT ON public.channel_performance      FROM anon;
REVOKE SELECT ON public.landing_page_performance FROM anon;
