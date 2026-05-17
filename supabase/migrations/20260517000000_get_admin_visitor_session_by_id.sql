-- Admin-only RPC: read a single visitor_sessions row by session_id.
--
-- public.visitor_sessions has RLS enabled with no read policy — only
-- SECURITY DEFINER RPCs may read it. The existing get_live_visitors RPC
-- only returns sessions in a recent activity window (clamped to ≥10s),
-- which can't be used to look up an arbitrary historical session linked
-- from an order row.
--
-- This RPC fills the gap: pass the session_id from orders.session_id and
-- get the full visitor_sessions row back (or no rows if the session
-- doesn't exist or the caller isn't admin). Used by the new
-- "Attribution / Journey" tab in Order Detail.
--
-- Admin gate identical to get_live_visitors / get_visitor_journey:
-- doctor_profiles.is_admin = true for the caller's auth.uid().
--
-- Idempotent. CREATE OR REPLACE. Safe to re-run.

CREATE OR REPLACE FUNCTION public.get_admin_visitor_session_by_id(
  p_session_id uuid
) RETURNS TABLE (
  session_id            uuid,
  channel               text,
  utm_source            text,
  utm_medium            text,
  utm_campaign          text,
  utm_term              text,
  utm_content           text,
  gclid                 text,
  fbclid                text,
  ref                   text,
  landing_url           text,
  referrer              text,
  device                text,
  user_agent            text,
  geo                   jsonb,
  chat_opened_at        timestamptz,
  first_message_at      timestamptz,
  assessment_started_at timestamptz,
  paid_at               timestamptz,
  created_at            timestamptz,
  updated_at            timestamptz,
  last_seen_at          timestamptz,
  current_page          text,
  page_count            integer,
  confirmation_id       text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin boolean := false;
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

  RETURN QUERY
    SELECT vs.session_id,
           vs.channel,
           vs.utm_source,
           vs.utm_medium,
           vs.utm_campaign,
           vs.utm_term,
           vs.utm_content,
           vs.gclid,
           vs.fbclid,
           vs.ref,
           vs.landing_url,
           vs.referrer,
           vs.device,
           vs.user_agent,
           vs.geo,
           vs.chat_opened_at,
           vs.first_message_at,
           vs.assessment_started_at,
           vs.paid_at,
           vs.created_at,
           vs.updated_at,
           vs.last_seen_at,
           vs.current_page,
           COALESCE(vs.page_count, 0) AS page_count,
           vs.confirmation_id
      FROM public.visitor_sessions vs
     WHERE vs.session_id = p_session_id
     LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_visitor_session_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_visitor_session_by_id(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_admin_visitor_session_by_id(uuid) IS
  'Admin-only single-session lookup for the Attribution / Journey tab in Order Detail. Returns empty set for non-admins or missing sessions. STABLE, no writes.';
