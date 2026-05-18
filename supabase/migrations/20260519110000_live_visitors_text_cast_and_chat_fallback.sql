-- Live Visitors — text-cast hotfix + chat-identity fallback join.
--
-- Why this exists:
--
-- 1. ord.session_id::text = vs.session_id::text
--    The previous migration (20260519100000) joined orders to
--    visitor_sessions with `ord.session_id = vs.session_id`. In TEST this
--    succeeded because both columns are uuid. In LIVE the two columns
--    have drifted to different DB types and the JOIN raises a type
--    mismatch. Production was hotfixed with `::text` casts on both
--    sides; this migration mirrors that hotfix into the repo so future
--    deploys to LIVE work. The cast is a no-op on TEST (both already
--    uuid → text → equality) and a fix on LIVE (text → text → equality).
--    DO NOT revert to the unqualified `=` form.
--
-- 2. Chat-visitor identity fallback (CHAT-IDENTITY-NO-DOWNGRADE)
--    The Live Visitors panel resolves identity by priority:
--      1. linked order name
--      2. linked order email
--      3. chat visitor name (NEW)
--      4. chat visitor email (NEW)
--      5. anonymous short id
--    Until this migration the RPC only returned (1) and (2). When a
--    known visitor (e.g. a completed-assessment lead "Charlotte Miller")
--    started a chat from a NEW browser session that had not yet been
--    linked to the order, the panel fell straight to the anonymous
--    short-id fallback. Adding chat_visitor_name / chat_visitor_email
--    via a LEFT JOIN onto the latest open chat_sessions row for the
--    same visitor_session_id keeps the panel from "downgrading" the
--    row to Anonymous when the visitor opens chat.
--
-- All operations idempotent. DROP + CREATE is required because RETURNS
-- TABLE shape changes are not reconcilable with CREATE OR REPLACE.

DROP FUNCTION IF EXISTS public.get_live_visitors(integer, integer);

CREATE FUNCTION public.get_live_visitors(
  p_window_seconds integer DEFAULT 90,
  p_limit          integer DEFAULT 200
) RETURNS TABLE (
  session_id            uuid,
  current_page          text,
  last_seen_at          timestamptz,
  first_seen_at         timestamptz,
  page_count            integer,
  channel               text,
  utm_source            text,
  utm_medium            text,
  utm_campaign          text,
  gclid                 text,
  fbclid                text,
  ref                   text,
  landing_url           text,
  referrer              text,
  device                text,
  geo                   jsonb,
  chat_opened_at        timestamptz,
  first_message_at      timestamptz,
  assessment_started_at timestamptz,
  paid_at               timestamptz,
  -- Linked order identity (from 20260519100000).
  order_confirmation_id text,
  order_first_name      text,
  order_last_name       text,
  order_email           text,
  order_status          text,
  order_paid_at         timestamptz,
  order_doctor_status   text,
  -- Chat-side identity fallback (NEW — CHAT-IDENTITY-NO-DOWNGRADE).
  chat_visitor_name     text,
  chat_visitor_email    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  SELECT COALESCE(BOOL_OR(dp.is_admin), false)
    INTO v_is_admin
    FROM public.doctor_profiles dp
   WHERE dp.user_id = auth.uid();

  IF NOT v_is_admin THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT vs.session_id,
           vs.current_page,
           vs.last_seen_at,
           vs.created_at AS first_seen_at,
           COALESCE(vs.page_count, 0) AS page_count,
           vs.channel,
           vs.utm_source,
           vs.utm_medium,
           vs.utm_campaign,
           vs.gclid,
           vs.fbclid,
           vs.ref,
           vs.landing_url,
           vs.referrer,
           vs.device,
           vs.geo,
           vs.chat_opened_at,
           vs.first_message_at,
           vs.assessment_started_at,
           vs.paid_at,
           o.confirmation_id  AS order_confirmation_id,
           o.first_name       AS order_first_name,
           o.last_name        AS order_last_name,
           o.email            AS order_email,
           o.status           AS order_status,
           o.paid_at          AS order_paid_at,
           o.doctor_status    AS order_doctor_status,
           c.visitor_name     AS chat_visitor_name,
           c.visitor_email    AS chat_visitor_email
      FROM public.visitor_sessions vs
      LEFT JOIN LATERAL (
        SELECT ord.confirmation_id,
               ord.first_name,
               ord.last_name,
               ord.email,
               ord.status,
               ord.paid_at,
               ord.doctor_status
          FROM public.orders ord
         WHERE ord.session_id::text = vs.session_id::text
           AND COALESCE(ord.status, '') NOT IN ('archived', 'refunded', 'cancelled')
         ORDER BY ord.paid_at DESC NULLS LAST,
                  ord.created_at DESC
         LIMIT 1
      ) o ON TRUE
      LEFT JOIN LATERAL (
        SELECT cs.visitor_name,
               cs.visitor_email
          FROM public.chat_sessions cs
         WHERE cs.visitor_session_id::text = vs.session_id::text
           AND (cs.visitor_name IS NOT NULL OR cs.visitor_email IS NOT NULL)
         ORDER BY cs.last_message_at DESC NULLS LAST,
                  cs.created_at DESC
         LIMIT 1
      ) c ON TRUE
     WHERE vs.last_seen_at IS NOT NULL
       AND vs.last_seen_at > now() - make_interval(secs => GREATEST(p_window_seconds, 10))
     ORDER BY vs.last_seen_at DESC NULLS LAST
     LIMIT GREATEST(LEAST(COALESCE(p_limit, 200), 500), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.get_live_visitors(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_visitors(integer, integer)
  TO authenticated;

COMMENT ON FUNCTION public.get_live_visitors(integer, integer) IS
  'Admin-only live visitor list. LEFT JOINs orders (by session_id::text) AND chat_sessions (by visitor_session_id::text) for identity fallback. Returns 29 columns: visitor session fields + order identity + chat visitor identity. SECURITY DEFINER, anon returns empty.';
