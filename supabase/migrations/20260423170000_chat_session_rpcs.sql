-- Phase 2: provider-agnostic session match/create + atomic message recording.
-- Safe, idempotent, non-destructive. SECURITY DEFINER, service_role execute only.

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
  -- 1. Exact match on provider + external session id
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
      RETURN v_session_id;
    END IF;
  END IF;

  -- 2. Recent open session by same email (fallback when provider id is unavailable)
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
      RETURN v_session_id;
    END IF;
  END IF;

  -- 3. Create new session (race-safe via unique index)
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

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.match_or_create_chat_session(text,text,text,text,int) FROM public;
GRANT EXECUTE ON FUNCTION public.match_or_create_chat_session(text,text,text,text,int) TO service_role;


CREATE OR REPLACE FUNCTION public.record_chat_message(
  p_session_id          uuid,
  p_message             text,
  p_sender              text    DEFAULT 'visitor',
  p_provider            text    DEFAULT NULL,
  p_provider_message_id text    DEFAULT NULL,
  p_metadata            jsonb   DEFAULT '{}'::jsonb,
  p_email               text    DEFAULT NULL,
  p_name                text    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id     uuid;
  v_sender_norm text := COALESCE(NULLIF(trim(p_sender), ''), 'visitor');
  v_prov_norm   text := NULLIF(trim(p_provider), '');
  v_pmid_norm   text := NULLIF(trim(p_provider_message_id), '');
BEGIN
  IF v_sender_norm NOT IN ('visitor','agent','system') THEN
    RAISE EXCEPTION 'invalid sender: %', v_sender_norm;
  END IF;

  -- Idempotency: dedup by (provider, provider_message_id)
  IF v_prov_norm IS NOT NULL AND v_pmid_norm IS NOT NULL THEN
    SELECT id INTO v_chat_id
      FROM public.chats
     WHERE provider = v_prov_norm
       AND provider_message_id = v_pmid_norm
     LIMIT 1;
    IF v_chat_id IS NOT NULL THEN
      RETURN v_chat_id;
    END IF;
  END IF;

  INSERT INTO public.chats (
    session_id, email, name, message, source,
    sender, provider, provider_message_id, metadata
  ) VALUES (
    p_session_id,
    NULLIF(lower(trim(p_email)), ''),
    NULLIF(trim(p_name), ''),
    p_message,
    'website_chat',
    v_sender_norm,
    v_prov_norm,
    v_pmid_norm,
    COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_chat_id;

  UPDATE public.chat_sessions
     SET last_message_at      = now(),
         last_message_preview = left(p_message, 160),
         unread_count         = CASE
           WHEN v_sender_norm = 'visitor' THEN unread_count + 1
           ELSE unread_count
         END
   WHERE id = p_session_id;

  RETURN v_chat_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_chat_message(uuid,text,text,text,text,jsonb,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_chat_message(uuid,text,text,text,text,jsonb,text,text) TO service_role;
