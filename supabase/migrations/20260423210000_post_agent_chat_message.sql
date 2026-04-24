-- Phase 5B: admin reply RPC.
-- Thin, purpose-built function so the admin portal can post agent messages
-- without widening grants on record_chat_message (which accepts arbitrary
-- sender + metadata from the caller).
--
-- Mirrors record_chat_message's session-bump semantics:
--   - inserts a row into public.chats with sender='agent'
--   - updates parent session's last_message_at + preview
--   - DOES NOT increment unread_count (agent messages never do)
--
-- Safe, idempotent (CREATE OR REPLACE), non-destructive. No schema change.

CREATE OR REPLACE FUNCTION public.post_agent_chat_message(
  p_session_id uuid,
  p_message    text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id       uuid;
  v_msg           text := trim(COALESCE(p_message, ''));
  v_rows_affected int;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'post_agent_chat_message: session_id is required';
  END IF;
  IF length(v_msg) = 0 THEN
    RAISE EXCEPTION 'post_agent_chat_message: message is required';
  END IF;
  IF length(v_msg) > 4000 THEN
    RAISE EXCEPTION 'post_agent_chat_message: message too long (max 4000)';
  END IF;

  PERFORM 1 FROM public.chat_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post_agent_chat_message: session % not found', p_session_id;
  END IF;

  INSERT INTO public.chats (
    session_id, email, name, message, source,
    sender, provider, provider_message_id, metadata
  ) VALUES (
    p_session_id,
    NULL, NULL,
    v_msg,
    'admin_reply',
    'agent',
    NULL, NULL,
    jsonb_build_object('origin', 'admin_portal')
  ) RETURNING id INTO v_chat_id;

  -- Bump session. Agent messages don't touch unread_count.
  UPDATE public.chat_sessions
     SET last_message_at      = now(),
         last_message_preview = left(v_msg, 200)
   WHERE id = p_session_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'post_agent_chat_message: session % vanished mid-insert', p_session_id;
  END IF;

  RETURN v_chat_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_agent_chat_message(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.post_agent_chat_message(uuid, text)
  TO anon, authenticated, service_role;
