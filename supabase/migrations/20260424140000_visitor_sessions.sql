-- Visitor session tracking.
-- Captures every browser session (not just chat users) with attribution,
-- device, landing URL, and milestone timestamps. Non-destructive, idempotent.
--
-- Privacy: we intentionally do NOT store IP. Geo (if available from the
-- client-side geo lookup cached in sessionStorage) is stored as a minimal
-- { country } JSON blob.

CREATE TABLE IF NOT EXISTS public.visitor_sessions (
  session_id             uuid        PRIMARY KEY,
  channel                text,
  utm_source             text,
  utm_medium             text,
  utm_campaign           text,
  utm_term               text,
  utm_content            text,
  gclid                  text,
  fbclid                 text,
  ref                    text,
  landing_url            text,
  referrer               text,
  device                 text,
  user_agent             text,
  geo                    jsonb,
  chat_opened_at         timestamptz,
  first_message_at       timestamptz,
  assessment_started_at  timestamptz,
  paid_at                timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visitor_sessions_created_idx
  ON public.visitor_sessions (created_at DESC);

CREATE INDEX IF NOT EXISTS visitor_sessions_channel_idx
  ON public.visitor_sessions (channel);

CREATE INDEX IF NOT EXISTS visitor_sessions_paid_idx
  ON public.visitor_sessions (paid_at DESC NULLS LAST);

-- Keep anon/public locked out of raw table — only SECURITY DEFINER RPCs
-- may read/write it.
ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.visitor_sessions_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS visitor_sessions_updated_at ON public.visitor_sessions;
CREATE TRIGGER visitor_sessions_updated_at
BEFORE UPDATE ON public.visitor_sessions
FOR EACH ROW EXECUTE FUNCTION public.visitor_sessions_set_updated_at();

-- ── record_visitor_session (idempotent insert) ──────────────────────────────
-- Called once per browser session from the client. First-write wins, so
-- subsequent calls with the same session_id are no-ops.
CREATE OR REPLACE FUNCTION public.record_visitor_session(
  p_session_id   uuid,
  p_channel      text  DEFAULT NULL,
  p_utm_source   text  DEFAULT NULL,
  p_utm_medium   text  DEFAULT NULL,
  p_utm_campaign text  DEFAULT NULL,
  p_utm_term     text  DEFAULT NULL,
  p_utm_content  text  DEFAULT NULL,
  p_gclid        text  DEFAULT NULL,
  p_fbclid       text  DEFAULT NULL,
  p_ref          text  DEFAULT NULL,
  p_landing_url  text  DEFAULT NULL,
  p_referrer     text  DEFAULT NULL,
  p_device       text  DEFAULT NULL,
  p_user_agent   text  DEFAULT NULL,
  p_geo          jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.visitor_sessions (
    session_id, channel,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    gclid, fbclid, ref, landing_url, referrer,
    device, user_agent, geo
  ) VALUES (
    p_session_id, p_channel,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_term, p_utm_content,
    p_gclid, p_fbclid, p_ref, p_landing_url, p_referrer,
    p_device, p_user_agent, p_geo
  )
  ON CONFLICT (session_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.record_visitor_session(
  uuid, text, text, text, text, text, text,
  text, text, text, text, text, text, text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_visitor_session(
  uuid, text, text, text, text, text, text,
  text, text, text, text, text, text, text, jsonb
) TO anon, authenticated;

-- ── mark_visitor_session_event (idempotent update) ──────────────────────────
-- Sets the milestone timestamp for a given event if not already set.
-- Unknown events are silently ignored. If no row exists for the session_id,
-- the update is a harmless no-op (the row gets recorded on the next nav).
CREATE OR REPLACE FUNCTION public.mark_visitor_session_event(
  p_session_id uuid,
  p_event      text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL OR p_event IS NULL THEN
    RETURN;
  END IF;

  CASE p_event
    WHEN 'chat_opened' THEN
      UPDATE public.visitor_sessions
        SET chat_opened_at = COALESCE(chat_opened_at, now())
        WHERE session_id = p_session_id;
    WHEN 'first_message' THEN
      UPDATE public.visitor_sessions
        SET first_message_at = COALESCE(first_message_at, now())
        WHERE session_id = p_session_id;
    WHEN 'assessment_started' THEN
      UPDATE public.visitor_sessions
        SET assessment_started_at = COALESCE(assessment_started_at, now())
        WHERE session_id = p_session_id;
    WHEN 'paid' THEN
      UPDATE public.visitor_sessions
        SET paid_at = COALESCE(paid_at, now())
        WHERE session_id = p_session_id;
    ELSE
      NULL;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_visitor_session_event(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_visitor_session_event(uuid, text) TO anon, authenticated;
