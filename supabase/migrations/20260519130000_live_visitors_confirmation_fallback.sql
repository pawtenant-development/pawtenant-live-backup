-- Live Visitors — dual-match order join (session_id OR confirmation_id).
--
-- Why this exists (ATTR-RESUME-SESSION-IDENTITY-SYNC):
--   Resume / recovery sessions are linked to the original order via
--   visitor_sessions.confirmation_id (stamped by link_session_to_order
--   when /assessment?resume= loads). orders.session_id intentionally
--   stays at the ORIGINAL Session 1 id (first-writer-wins) so the
--   primary attribution remains anchored to acquisition.
--
--   The previous get_live_visitors (20260519110000) only joined orders
--   by ord.session_id::text = vs.session_id::text. That worked for the
--   primary Session 1 visitor but left Session 2 (resume) visitors as
--   Anonymous because their session_id is NOT on any order row.
--
-- Fix: the LATERAL subquery now matches orders by EITHER:
--     1. ord.session_id::text = vs.session_id::text         (exact)
--     2. ord.confirmation_id  = vs.confirmation_id          (fallback)
--   and prefers (1) over (2) via the ORDER BY CASE rank.
--
-- This restores order identity for resume / recovery visitors, the
-- corresponding Session-2-paid render after thank-you, and any chat
-- that opens during the resume session (the panel resolver also
-- inherits the order_first_name / order_last_name / order_email
-- fields populated by this join).
--
-- The ::text casts on the session_id comparison are PRESERVED — LIVE
-- has uuid/text type drift that breaks the unqualified equality. Do
-- NOT remove the casts.
--
-- Return shape extends 20260519110000 with two more columns so the
-- LiveVisitorsPanel can derive the order chip (PT-XXXX · Paid /
-- Attempted / Lead) directly from the RPC rather than a separate
-- session_id-only fetch that would miss resume sessions:
--     • order_id                  uuid
--     • order_payment_intent_id   text
--
-- All operations idempotent. DROP IF EXISTS first because the RETURNS
-- TABLE shape changes by +2 columns.

DROP FUNCTION IF EXISTS public.get_live_visitors(integer, integer);

CREATE FUNCTION public.get_live_visitors(
  p_window_seconds integer DEFAULT 90,
  p_limit          integer DEFAULT 200
) RETURNS TABLE (
  session_id              uuid,
  current_page            text,
  last_seen_at            timestamptz,
  first_seen_at           timestamptz,
  page_count              integer,
  channel                 text,
  utm_source              text,
  utm_medium              text,
  utm_campaign            text,
  gclid                   text,
  fbclid                  text,
  ref                     text,
  landing_url             text,
  referrer                text,
  device                  text,
  geo                     jsonb,
  chat_opened_at          timestamptz,
  first_message_at        timestamptz,
  assessment_started_at   timestamptz,
  paid_at                 timestamptz,
  -- Linked order identity (matched by session_id OR confirmation_id).
  order_id                uuid,
  order_confirmation_id   text,
  order_first_name        text,
  order_last_name         text,
  order_email             text,
  order_status            text,
  order_paid_at           timestamptz,
  order_doctor_status     text,
  order_payment_intent_id text,
  -- Chat-side identity fallback (from 20260519110000).
  chat_visitor_name       text,
  chat_visitor_email      text
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
           o.id                  AS order_id,
           o.confirmation_id     AS order_confirmation_id,
           o.first_name          AS order_first_name,
           o.last_name           AS order_last_name,
           o.email               AS order_email,
           o.status              AS order_status,
           o.paid_at             AS order_paid_at,
           o.doctor_status       AS order_doctor_status,
           o.payment_intent_id   AS order_payment_intent_id,
           c.visitor_name        AS chat_visitor_name,
           c.visitor_email       AS chat_visitor_email
      FROM public.visitor_sessions vs
      LEFT JOIN LATERAL (
        SELECT ord.id,
               ord.confirmation_id,
               ord.first_name,
               ord.last_name,
               ord.email,
               ord.status,
               ord.paid_at,
               ord.doctor_status,
               ord.payment_intent_id
          FROM public.orders ord
         WHERE COALESCE(ord.status, '') NOT IN ('archived', 'refunded', 'cancelled')
           AND (
                 ord.session_id::text = vs.session_id::text
              OR (vs.confirmation_id IS NOT NULL
                  AND ord.confirmation_id = vs.confirmation_id)
               )
         ORDER BY
           -- Prefer exact session match over confirmation_id fallback so
           -- the original Session 1 visitor still resolves to its own
           -- session-bound order while a Session 2 resume visitor falls
           -- through to the confirmation_id match.
           CASE WHEN ord.session_id::text = vs.session_id::text THEN 0 ELSE 1 END ASC,
           ord.paid_at  DESC NULLS LAST,
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
                  cs.created_at      DESC
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
  'Admin-only live visitor list. Order LATERAL matches by session_id::text=session_id::text OR confirmation_id=confirmation_id (session_id preferred). Adds order_id + order_payment_intent_id so the panel can render the order chip without a second fetch. Preserves chat_visitor_name/email fallback. SECURITY DEFINER, anon returns empty.';
