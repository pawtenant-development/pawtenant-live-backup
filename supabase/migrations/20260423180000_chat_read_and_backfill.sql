-- Phase 3: mark-read RPC + admin read policy + backfill legacy chats.
-- Safe, idempotent, non-destructive.

-- 1. Mark-read RPC.
--    Zeroes a session's unread_count (visitor-originated only; agent/system
--    never bump it in record_chat_message).
--    SECURITY DEFINER so it works regardless of future RLS hardening.
CREATE OR REPLACE FUNCTION public.mark_chat_session_read(p_session_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.chat_sessions
     SET unread_count = 0
   WHERE id = p_session_id
     AND unread_count > 0;
$$;

REVOKE ALL ON FUNCTION public.mark_chat_session_read(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_chat_session_read(uuid)
  TO anon, authenticated, service_role;

-- 2. Admin read policy for chat_sessions (mirrors the effective behavior of
--    public.chats, which the admin portal already reads via the anon client).
--    Scoped to SELECT only — writes still go through service-role + RPCs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'chat_sessions'
       AND policyname = 'chat_sessions_read_all'
  ) THEN
    CREATE POLICY "chat_sessions_read_all"
      ON public.chat_sessions
      FOR SELECT
      USING (true);
  END IF;
END$$;

-- 3. Backfill: create synthetic chat_sessions for historical chats that lack
--    session_id, so existing messages keep rendering in the session-based
--    admin inbox.
--
--    Clustering mirrors the live matcher:
--      - Rows WITH email → cluster by email + 30-minute gap
--      - Rows WITHOUT email → one session per row (no correlation id available)
DO $$
DECLARE
  r              RECORD;
  v_session_id   uuid;
  v_last_email   text        := NULL;
  v_last_session uuid        := NULL;
  v_last_time    timestamptz := NULL;
BEGIN
  -- Pass 1: emailed rows
  FOR r IN
    SELECT id, email, name, message, created_at, provider
      FROM public.chats
     WHERE session_id IS NULL
       AND NULLIF(lower(trim(email)), '') IS NOT NULL
     ORDER BY lower(trim(email)), created_at
  LOOP
    IF lower(trim(r.email)) = v_last_email
       AND v_last_time IS NOT NULL
       AND r.created_at <= v_last_time + interval '30 minutes'
    THEN
      v_session_id := v_last_session;
    ELSE
      INSERT INTO public.chat_sessions (
        email, name, provider, last_message_at,
        last_message_preview, unread_count, status,
        created_at, updated_at
      ) VALUES (
        lower(trim(r.email)),
        NULLIF(trim(r.name), ''),
        NULLIF(trim(r.provider), ''),
        r.created_at,
        left(r.message, 160),
        0,
        'open',
        r.created_at,
        r.created_at
      ) RETURNING id INTO v_session_id;
      v_last_session := v_session_id;
      v_last_email   := lower(trim(r.email));
    END IF;

    UPDATE public.chats
       SET session_id = v_session_id
     WHERE id = r.id;

    UPDATE public.chat_sessions
       SET last_message_at      = GREATEST(COALESCE(last_message_at, r.created_at), r.created_at),
           last_message_preview = CASE
             WHEN last_message_at IS NULL OR last_message_at <= r.created_at
               THEN left(r.message, 160)
             ELSE last_message_preview
           END
     WHERE id = v_session_id;

    v_last_time := r.created_at;
  END LOOP;

  -- Pass 2: anonymous rows (one session each)
  FOR r IN
    SELECT id, name, message, created_at, provider
      FROM public.chats
     WHERE session_id IS NULL
     ORDER BY created_at
  LOOP
    INSERT INTO public.chat_sessions (
      email, name, provider, last_message_at,
      last_message_preview, unread_count, status,
      created_at, updated_at
    ) VALUES (
      NULL,
      NULLIF(trim(r.name), ''),
      NULLIF(trim(r.provider), ''),
      r.created_at,
      left(r.message, 160),
      0,
      'open',
      r.created_at,
      r.created_at
    ) RETURNING id INTO v_session_id;

    UPDATE public.chats
       SET session_id = v_session_id
     WHERE id = r.id;
  END LOOP;
END$$;
