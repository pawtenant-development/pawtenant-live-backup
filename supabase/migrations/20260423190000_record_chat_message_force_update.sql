-- Force every insert through record_chat_message to bump the parent session's
-- last_message_at, preview, and unread counter unconditionally. This is what
-- the admin inbox poller watches; without an unconditional bump, polling can
-- see identical rows and fail to re-render.
--
-- Also hardens the RPC: rejects NULL session_id and empty messages, and fails
-- loudly if the target session vanishes between insert and update.
--
-- Safe, idempotent (CREATE OR REPLACE), non-destructive.

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
  v_chat_id       uuid;
  v_sender_norm   text := COALESCE(NULLIF(trim(p_sender), ''), 'visitor');
  v_prov_norm     text := NULLIF(trim(p_provider), '');
  v_pmid_norm     text := NULLIF(trim(p_provider_message_id), '');
  v_rows_affected int;
BEGIN
  -- Safety: never insert a chat without a session. The caller
  -- (capture-chat edge function) must resolve or create a session first
  -- via match_or_create_chat_session before calling this RPC.
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'record_chat_message: p_session_id is required';
  END IF;

  IF v_sender_norm NOT IN ('visitor','agent','system') THEN
    RAISE EXCEPTION 'record_chat_message: invalid sender %', v_sender_norm;
  END IF;

  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN
    RAISE EXCEPTION 'record_chat_message: p_message is required';
  END IF;

  -- Idempotency: dedup by (provider, provider_message_id). On a replay we
  -- return the pre-existing chat_id WITHOUT bumping the session, because no
  -- new message was actually inserted.
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

  -- FORCE session bump after every insert. Unconditional last_message_at =
  -- now() so the admin poller always sees a changed timestamp, even if the
  -- preview text happens to match the previous message verbatim. Never
  -- short-circuits on "looks same" comparisons.
  UPDATE public.chat_sessions
     SET last_message_at      = now(),
         last_message_preview = left(p_message, 200),
         unread_count         = CASE
           WHEN v_sender_norm = 'visitor' THEN chat_sessions.unread_count + 1
           ELSE chat_sessions.unread_count
         END
   WHERE id = p_session_id;

  -- If the session vanished between insert and update (impossible under the
  -- chats.session_id FK, but belt-and-suspenders for forward compatibility),
  -- fail loudly instead of silently orphaning the chat row.
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION
      'record_chat_message: chat_sessions row % not found after insert',
      p_session_id;
  END IF;

  RETURN v_chat_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_chat_message(uuid,text,text,text,text,jsonb,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_chat_message(uuid,text,text,text,text,jsonb,text,text) TO service_role;
