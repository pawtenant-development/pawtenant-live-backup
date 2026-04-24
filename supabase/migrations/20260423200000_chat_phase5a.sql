-- Phase 5A: persistent order linking + missed-session support.
-- Safe, idempotent, non-destructive. No data is deleted.
--
-- Adds:
--   chat_sessions.matched_order_id  (uuid, FK -> orders.id, ON DELETE SET NULL)
--   chat_sessions.last_viewed_at    (timestamptz, nullable)
--
-- Adds RPC:
--   link_chat_session_to_order(p_session_id uuid)
--
-- Updates RPCs (idempotent CREATE OR REPLACE):
--   match_or_create_chat_session — also persists order link when email known
--   mark_chat_session_read       — also bumps last_viewed_at = now()
--
-- Backfills matched_order_id using the LATEST order per email
-- (DISTINCT ON + ORDER BY created_at DESC).

-- 1. New columns on chat_sessions.
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS matched_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_viewed_at   timestamptz;

CREATE INDEX IF NOT EXISTS chat_sessions_matched_order_idx
  ON public.chat_sessions (matched_order_id)
  WHERE matched_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_sessions_last_viewed_idx
  ON public.chat_sessions (last_viewed_at DESC NULLS LAST);

-- 2. Helper RPC: link a session to an order by email (idempotent).
--    Uses the LATEST order per email (created_at DESC).
CREATE OR REPLACE FUNCTION public.link_chat_session_to_order(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_norm text;
  v_order_id   uuid;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;

  SELECT NULLIF(lower(trim(email)), '')
    INTO v_email_norm
    FROM public.chat_sessions
   WHERE id = p_session_id
   LIMIT 1;

  IF v_email_norm IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_order_id
    FROM public.orders
   WHERE NULLIF(lower(trim(email)), '') = v_email_norm
   ORDER BY created_at DESC NULLS LAST
   LIMIT 1;

  IF v_order_id IS NOT NULL THEN
    UPDATE public.chat_sessions
       SET matched_order_id = v_order_id
     WHERE id = p_session_id
       AND matched_order_id IS DISTINCT FROM v_order_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.link_chat_session_to_order(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.link_chat_session_to_order(uuid) TO service_role;

-- 3. match_or_create_chat_session — persist matched_order_id whenever we see
--    an email. Behavior for provider matching / email fallback / new-session
--    creation is unchanged; we just call link_chat_session_to_order after.
CREATE OR REPLACE FUNCTION public.match_or_create_chat_session(
  p_provider            text,
  p_provider_session_id text,
  p_email               text,
  p_name                text,
  p_window_minutes      int DEFAULT 30
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_email_norm text := NULLIF(lower(trim(p_email)), '');
  v_name_norm  text := NULLIF(trim(p_name), '');
  v_prov_norm  text := NULLIF(trim(p_provider), '');
  v_ext_norm   text := NULLIF(trim(p_provider_session_id), '');
BEGIN
  -- 1. Exact match on provider + external session id.
  IF v_prov_norm IS NOT NULL AND v_ext_norm IS NOT NULL THEN
    SELECT id INTO v_session_id
      FROM public.chat_sessions
     WHERE provider = v_prov_norm
       AND provider_session_id = v_ext_norm
     LIMIT 1;
    IF v_session_id IS NOT NULL THEN
      UPDATE public.chat_sessions
         SET email = COALESCE(email, v_email_norm),
             name  = COALESCE(name,  v_name_norm)
       WHERE id = v_session_id;
      IF v_email_norm IS NOT NULL THEN
        PERFORM public.link_chat_session_to_order(v_session_id);
      END IF;
      RETURN v_session_id;
    END IF;
  END IF;

  -- 2. Recent open session by same email (fallback).
  IF v_email_norm IS NOT NULL THEN
    SELECT id INTO v_session_id
      FROM public.chat_sessions
     WHERE lower(email) = v_email_norm
       AND status = 'open'
       AND last_message_at > (now() - make_interval(mins => p_window_minutes))
     ORDER BY last_message_at DESC NULLS LAST
     LIMIT 1;
    IF v_session_id IS NOT NULL THEN
      UPDATE public.chat_sessions
         SET provider            = COALESCE(provider, v_prov_norm),
             provider_session_id = COALESCE(provider_session_id, v_ext_norm),
             name                = COALESCE(name, v_name_norm)
       WHERE id = v_session_id;
      PERFORM public.link_chat_session_to_order(v_session_id);
      RETURN v_session_id;
    END IF;
  END IF;

  -- 3. Create new session (race-safe via unique index).
  BEGIN
    INSERT INTO public.chat_sessions (email, name, provider, provider_session_id)
         VALUES (v_email_norm, v_name_norm, v_prov_norm, v_ext_norm)
      RETURNING id INTO v_session_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_session_id
      FROM public.chat_sessions
     WHERE provider = v_prov_norm
       AND provider_session_id = v_ext_norm
     LIMIT 1;
  END;

  IF v_email_norm IS NOT NULL AND v_session_id IS NOT NULL THEN
    PERFORM public.link_chat_session_to_order(v_session_id);
  END IF;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.match_or_create_chat_session(text,text,text,text,int) FROM public;
GRANT EXECUTE ON FUNCTION public.match_or_create_chat_session(text,text,text,text,int) TO service_role;

-- 4. mark_chat_session_read — also stamp last_viewed_at unconditionally.
--    The RPC runs on every admin selection, so last_viewed_at always reflects
--    the last time an admin actually opened the session.
CREATE OR REPLACE FUNCTION public.mark_chat_session_read(p_session_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.chat_sessions
     SET unread_count  = 0,
         last_viewed_at = now()
   WHERE id = p_session_id;
$$;

REVOKE ALL ON FUNCTION public.mark_chat_session_read(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_chat_session_read(uuid)
  TO anon, authenticated, service_role;

-- 5. Backfill matched_order_id for sessions that already have an email.
--    DISTINCT ON keeps the LATEST order per email.
WITH latest_orders AS (
  SELECT DISTINCT ON (lower(trim(o.email)))
         lower(trim(o.email)) AS email_norm,
         o.id                 AS order_id
    FROM public.orders o
   WHERE NULLIF(lower(trim(o.email)), '') IS NOT NULL
   ORDER BY lower(trim(o.email)), o.created_at DESC NULLS LAST
)
UPDATE public.chat_sessions cs
   SET matched_order_id = lo.order_id
  FROM latest_orders lo
 WHERE cs.matched_order_id IS NULL
   AND NULLIF(lower(trim(cs.email)), '') IS NOT NULL
   AND lower(trim(cs.email)) = lo.email_norm;
