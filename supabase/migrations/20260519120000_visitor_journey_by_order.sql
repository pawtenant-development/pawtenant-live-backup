-- Multi-session order journey — aggregate events across ALL visitor
-- sessions ever linked to a given confirmation_id.
--
-- Why this exists (ATTR-MULTI-SESSION-ORDER-JOURNEY):
--   A single order can be touched by multiple browser sessions:
--     Session 1: Facebook UTM → /meta-esa-letter → /assessment (lead saved)
--                → abandons checkout
--     Session 2: new incognito → /r/manual?o=PT-XXXX → /assessment?resume=
--                → payment → /assessment/thank-you
--   The existing get_visitor_journey(p_session_id) RPC is keyed on ONE
--   session_id and returns ONLY the events for that session. orders.session_id
--   is "first writer wins" (Session 1), so the admin Attribution/Journey tab
--   only sees Session 1's events and Session 2's recovery + checkout flow is
--   invisible — even though visitor_sessions[Session 2].confirmation_id was
--   stamped on resume.
--
-- What this migration adds:
--   public.get_visitor_journey_by_order(p_confirmation_id text, p_limit int)
--   Returns events from EVERY visitor_sessions row whose confirmation_id
--   matches the order, PLUS the order's own primary session_id (read off
--   orders.session_id). One unified flat stream that includes a session_id
--   column so the client can group events by session and label them
--   "Session 1 / Session 2 / …" by chronological order of first_seen_at.
--
-- Why a flat stream (not nested):
--   PostgREST returns flat TABLE results most efficiently. The client
--   already groups events by session_id for the Page Journey panel; this
--   keeps consumer logic minimal.
--
-- Admin gate is inline (same pattern as get_visitor_journey).
--
-- All operations are ADDITIVE and IDEMPOTENT. Safe to re-run.

CREATE OR REPLACE FUNCTION public.get_visitor_journey_by_order(
  p_confirmation_id text,
  p_limit           integer DEFAULT 500
) RETURNS TABLE (
  event_id      uuid,
  session_id    uuid,
  event_name    text,
  page_url      text,
  props         jsonb,
  created_at    timestamptz,
  -- Per-session context the client uses for session-grouped rendering.
  session_first_seen_at timestamptz,
  session_last_seen_at  timestamptz,
  session_landing_url   text,
  session_channel       text,
  session_utm_source    text,
  session_utm_campaign  text,
  session_fbclid        text,
  session_gclid         text,
  session_paid_at       timestamptz,
  session_chat_opened_at  timestamptz,
  session_assessment_at   timestamptz,
  -- Whether this session is THE primary one (orders.session_id) or a later
  -- recovery/resume session linked via visitor_sessions.confirmation_id.
  is_primary_session    boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin     boolean := false;
  v_norm_conf    text;
  v_primary_sid  uuid;
BEGIN
  IF p_confirmation_id IS NULL OR length(trim(p_confirmation_id)) = 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(BOOL_OR(dp.is_admin), false)
    INTO v_is_admin
    FROM public.doctor_profiles dp
   WHERE dp.user_id = auth.uid();

  IF NOT v_is_admin THEN
    RETURN;
  END IF;

  v_norm_conf := trim(p_confirmation_id);

  -- The "primary" session is whichever session_id is stamped on the
  -- orders row itself (set on the FIRST lead save). visitor_sessions.
  -- confirmation_id may match additional sessions (resume / recovery
  -- visits) but only one of them lives on orders.session_id.
  BEGIN
    SELECT ord.session_id INTO v_primary_sid
      FROM public.orders ord
     WHERE ord.confirmation_id = v_norm_conf
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_primary_sid := NULL;
  END;

  RETURN QUERY
    WITH linked_sessions AS (
      -- Sessions linked via the visitor_sessions back-link.
      SELECT vs.session_id            AS sid,
             vs.created_at            AS s_first_seen,
             vs.last_seen_at          AS s_last_seen,
             vs.landing_url           AS s_landing,
             vs.channel               AS s_channel,
             vs.utm_source            AS s_utm_source,
             vs.utm_campaign          AS s_utm_campaign,
             vs.fbclid                AS s_fbclid,
             vs.gclid                 AS s_gclid,
             vs.paid_at               AS s_paid,
             vs.chat_opened_at        AS s_chat,
             vs.assessment_started_at AS s_assess
        FROM public.visitor_sessions vs
       WHERE vs.confirmation_id = v_norm_conf
      UNION
      -- The primary session referenced by the order itself, even if its
      -- visitor_sessions row never got back-linked (rare — happens when
      -- the lead save fired but link_session_to_order didn't).
      SELECT vs2.session_id,
             vs2.created_at,
             vs2.last_seen_at,
             vs2.landing_url,
             vs2.channel,
             vs2.utm_source,
             vs2.utm_campaign,
             vs2.fbclid,
             vs2.gclid,
             vs2.paid_at,
             vs2.chat_opened_at,
             vs2.assessment_started_at
        FROM public.visitor_sessions vs2
       WHERE v_primary_sid IS NOT NULL
         AND vs2.session_id::text = v_primary_sid::text
    )
    SELECT e.id           AS event_id,
           e.session_id   AS session_id,
           e.event_name,
           e.page_url,
           e.props,
           e.created_at,
           ls.s_first_seen   AS session_first_seen_at,
           ls.s_last_seen    AS session_last_seen_at,
           ls.s_landing      AS session_landing_url,
           ls.s_channel      AS session_channel,
           ls.s_utm_source   AS session_utm_source,
           ls.s_utm_campaign AS session_utm_campaign,
           ls.s_fbclid       AS session_fbclid,
           ls.s_gclid        AS session_gclid,
           ls.s_paid         AS session_paid_at,
           ls.s_chat         AS session_chat_opened_at,
           ls.s_assess       AS session_assessment_at,
           (v_primary_sid IS NOT NULL AND ls.sid::text = v_primary_sid::text)
                             AS is_primary_session
      FROM linked_sessions ls
      LEFT JOIN public.events e ON e.session_id::text = ls.sid::text
     WHERE e.id IS NOT NULL
     ORDER BY ls.s_first_seen ASC NULLS LAST,
              e.created_at    ASC
     LIMIT GREATEST(LEAST(COALESCE(p_limit, 500), 2000), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.get_visitor_journey_by_order(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_visitor_journey_by_order(text, integer)
  TO authenticated;

COMMENT ON FUNCTION public.get_visitor_journey_by_order(text, integer) IS
  'Admin-only multi-session journey. Returns events from ALL visitor_sessions linked to a confirmation_id (via visitor_sessions.confirmation_id OR orders.session_id), with per-session context columns and an is_primary_session flag so the client can render Session 1 / Session 2 / … groupings. SECURITY DEFINER.';


-- Lightweight helper: return the bare session list (no events) for an order.
-- Used by the Attribution/Journey tab to render the session-group headers
-- even when a session has zero events captured (e.g. session_id stamped on
-- the order but the visitor hit a CDN-cached page that didn't fire the
-- heartbeat — still useful to surface in the journey).
CREATE OR REPLACE FUNCTION public.get_order_linked_sessions(
  p_confirmation_id text
) RETURNS TABLE (
  session_id            uuid,
  first_seen_at         timestamptz,
  last_seen_at          timestamptz,
  landing_url           text,
  channel               text,
  utm_source            text,
  utm_campaign          text,
  fbclid                text,
  gclid                 text,
  paid_at               timestamptz,
  chat_opened_at        timestamptz,
  assessment_started_at timestamptz,
  page_count            integer,
  is_primary_session    boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin    boolean := false;
  v_norm_conf   text;
  v_primary_sid uuid;
BEGIN
  IF p_confirmation_id IS NULL OR length(trim(p_confirmation_id)) = 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(BOOL_OR(dp.is_admin), false)
    INTO v_is_admin
    FROM public.doctor_profiles dp
   WHERE dp.user_id = auth.uid();

  IF NOT v_is_admin THEN
    RETURN;
  END IF;

  v_norm_conf := trim(p_confirmation_id);

  BEGIN
    SELECT ord.session_id INTO v_primary_sid
      FROM public.orders ord
     WHERE ord.confirmation_id = v_norm_conf
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_primary_sid := NULL;
  END;

  RETURN QUERY
    SELECT vs.session_id,
           vs.created_at            AS first_seen_at,
           vs.last_seen_at,
           vs.landing_url,
           vs.channel,
           vs.utm_source,
           vs.utm_campaign,
           vs.fbclid,
           vs.gclid,
           vs.paid_at,
           vs.chat_opened_at,
           vs.assessment_started_at,
           COALESCE(vs.page_count, 0) AS page_count,
           (v_primary_sid IS NOT NULL AND vs.session_id::text = v_primary_sid::text)
                                      AS is_primary_session
      FROM public.visitor_sessions vs
     WHERE vs.confirmation_id = v_norm_conf
        OR (v_primary_sid IS NOT NULL AND vs.session_id::text = v_primary_sid::text)
     ORDER BY vs.created_at ASC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_linked_sessions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_linked_sessions(text)
  TO authenticated;

COMMENT ON FUNCTION public.get_order_linked_sessions(text) IS
  'Admin-only list of visitor_sessions linked to a confirmation_id, ordered by first_seen_at ASC. is_primary_session=true for the session stamped on orders.session_id. SECURITY DEFINER.';
