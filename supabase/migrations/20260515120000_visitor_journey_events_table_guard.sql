-- LIVE hotfix 2026-05-15 — guard get_visitor_journey + get_chat_pre_chat_context
-- against the case where public.events does not exist.
--
-- Phase 2A (2026-05-14) introduced two admin-only RPCs that read
-- public.events. LIVE Supabase does not have public.events provisioned
-- (the analytics_phase1 migration ships from TEST). Without this guard
-- the Visitor Context panel in ChatsTab returns a red
--   "relation \"public.events\" does not exist"
-- error every time it opens.
--
-- Strategy:
--   * Both functions check to_regclass('public.events') at runtime.
--   * If the table is missing, the function returns:
--       - get_visitor_journey            → empty result set (no journey)
--       - get_chat_pre_chat_context      → row with pre_chat_event_count = 0
--   * If the table IS present (e.g. once analytics_phase1 lands on LIVE)
--     the original SELECT runs unchanged. No callers need to be updated
--     and no further migration is required to "re-enable" journey data.
--
-- Dynamic SQL is used only for the events-table portion so the static
-- planner of CREATE FUNCTION accepts the body even when public.events
-- is absent. All other behavior is byte-identical to the Phase 2A
-- migration (same arg shapes, same return shapes, same admin gate, same
-- REVOKE/GRANT, same comment).
--
-- Idempotent. Safe to re-run. Non-destructive.

-- ── 1. get_visitor_journey ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_visitor_journey(
  p_session_id uuid,
  p_limit      integer DEFAULT 200
) RETURNS TABLE (
  event_id    uuid,
  session_id  uuid,
  event_name  text,
  page_url    text,
  props       jsonb,
  created_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin boolean := false;
  v_limit    integer := GREATEST(LEAST(COALESCE(p_limit, 200), 1000), 1);
BEGIN
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(BOOL_OR(dp.is_admin), false)
    INTO v_is_admin
    FROM public.doctor_profiles dp
   WHERE dp.user_id = auth.uid();

  IF NOT v_is_admin THEN
    RETURN;
  END IF;

  -- Guard: if public.events isn't provisioned on this Supabase
  -- instance, just return an empty journey instead of erroring.
  IF to_regclass('public.events') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE
    'SELECT e.id          AS event_id,
            e.session_id  AS session_id,
            e.event_name,
            e.page_url,
            e.props,
            e.created_at
       FROM public.events e
      WHERE e.session_id = $1
      ORDER BY e.created_at ASC
      LIMIT $2'
    USING p_session_id, v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_visitor_journey(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_visitor_journey(uuid, integer)
  TO authenticated;

COMMENT ON FUNCTION public.get_visitor_journey(uuid, integer) IS
  'Admin-only journey timeline for one visitor session. Returns empty set when public.events is not provisioned on this instance. Safe on LIVE pre-analytics_phase1.';


-- ── 2. get_chat_pre_chat_context ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_chat_pre_chat_context(
  p_chat_session_id uuid
) RETURNS TABLE (
  chat_session_id        uuid,
  chat_status            text,
  chat_created_at        timestamptz,
  chat_visitor_name      text,
  chat_visitor_email     text,
  chat_matched_order_id  uuid,

  visitor_session_id     uuid,
  visitor_channel        text,
  visitor_utm_source     text,
  visitor_utm_medium     text,
  visitor_utm_campaign   text,
  visitor_gclid          text,
  visitor_fbclid         text,
  visitor_ref            text,
  visitor_landing_url    text,
  visitor_referrer       text,
  visitor_device         text,
  visitor_geo            jsonb,
  visitor_current_page   text,
  visitor_page_count     integer,
  visitor_first_seen_at  timestamptz,
  visitor_last_seen_at   timestamptz,
  assessment_started_at  timestamptz,
  paid_at                timestamptz,

  pre_chat_event_count   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin     boolean := false;
  v_events_ok    boolean := false;
BEGIN
  IF p_chat_session_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(BOOL_OR(dp.is_admin), false)
    INTO v_is_admin
    FROM public.doctor_profiles dp
   WHERE dp.user_id = auth.uid();

  IF NOT v_is_admin THEN
    RETURN;
  END IF;

  v_events_ok := to_regclass('public.events') IS NOT NULL;

  IF v_events_ok THEN
    RETURN QUERY EXECUTE
      'SELECT cs.id                          AS chat_session_id,
              cs.status                      AS chat_status,
              cs.created_at                  AS chat_created_at,
              cs.visitor_name                AS chat_visitor_name,
              cs.visitor_email               AS chat_visitor_email,
              cs.matched_order_id            AS chat_matched_order_id,

              vs.session_id                  AS visitor_session_id,
              vs.channel                     AS visitor_channel,
              vs.utm_source                  AS visitor_utm_source,
              vs.utm_medium                  AS visitor_utm_medium,
              vs.utm_campaign                AS visitor_utm_campaign,
              vs.gclid                       AS visitor_gclid,
              vs.fbclid                      AS visitor_fbclid,
              vs.ref                         AS visitor_ref,
              vs.landing_url                 AS visitor_landing_url,
              vs.referrer                    AS visitor_referrer,
              vs.device                      AS visitor_device,
              vs.geo                         AS visitor_geo,
              vs.current_page                AS visitor_current_page,
              COALESCE(vs.page_count, 0)     AS visitor_page_count,
              vs.created_at                  AS visitor_first_seen_at,
              vs.last_seen_at                AS visitor_last_seen_at,
              vs.assessment_started_at       AS assessment_started_at,
              vs.paid_at                     AS paid_at,

              COALESCE((
                SELECT COUNT(*)::integer
                  FROM public.events e
                 WHERE e.session_id = vs.session_id
                   AND e.created_at < cs.created_at
              ), 0)                          AS pre_chat_event_count
         FROM public.chat_sessions cs
         LEFT JOIN public.visitor_sessions vs
                ON vs.session_id = cs.visitor_session_id
        WHERE cs.id = $1
        LIMIT 1'
      USING p_chat_session_id;
  ELSE
    -- public.events absent — return the same context row but with a
    -- pre_chat_event_count of 0. The Visitor Context panel still
    -- renders the chat + visitor_sessions snapshot; the "browsed N
    -- pages before chatting" headline degrades to 0 instead of erroring.
    RETURN QUERY
      SELECT cs.id                          AS chat_session_id,
             cs.status                      AS chat_status,
             cs.created_at                  AS chat_created_at,
             cs.visitor_name                AS chat_visitor_name,
             cs.visitor_email               AS chat_visitor_email,
             cs.matched_order_id            AS chat_matched_order_id,

             vs.session_id                  AS visitor_session_id,
             vs.channel                     AS visitor_channel,
             vs.utm_source                  AS visitor_utm_source,
             vs.utm_medium                  AS visitor_utm_medium,
             vs.utm_campaign                AS visitor_utm_campaign,
             vs.gclid                       AS visitor_gclid,
             vs.fbclid                      AS visitor_fbclid,
             vs.ref                         AS visitor_ref,
             vs.landing_url                 AS visitor_landing_url,
             vs.referrer                    AS visitor_referrer,
             vs.device                      AS visitor_device,
             vs.geo                         AS visitor_geo,
             vs.current_page                AS visitor_current_page,
             COALESCE(vs.page_count, 0)     AS visitor_page_count,
             vs.created_at                  AS visitor_first_seen_at,
             vs.last_seen_at                AS visitor_last_seen_at,
             vs.assessment_started_at       AS assessment_started_at,
             vs.paid_at                     AS paid_at,

             0                              AS pre_chat_event_count
        FROM public.chat_sessions cs
        LEFT JOIN public.visitor_sessions vs
               ON vs.session_id = cs.visitor_session_id
       WHERE cs.id = p_chat_session_id
       LIMIT 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_chat_pre_chat_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_pre_chat_context(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_chat_pre_chat_context(uuid) IS
  'Admin-only pre-chat context for one chat session. When public.events is missing, pre_chat_event_count degrades to 0 instead of erroring. Safe on LIVE pre-analytics_phase1.';
