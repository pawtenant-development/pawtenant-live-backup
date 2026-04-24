-- Phase 7: admin chat messages read policy.
--
-- Bug: admin portal MiniChatPanel + ChatsTab query
--   supabase.from('chats').select(...).eq('session_id', sid)
-- via the anon/authenticated client. public.chats has RLS enabled but NO
-- SELECT policy was ever created, so PostgREST silently returns zero rows.
-- Admins saw "No messages in this session." even when messages existed.
--
-- Fix: add a SELECT policy on public.chats mirroring chat_sessions_read_all.
--
-- Scope / privacy note:
--   - Visitor-side reads continue to go through get_visitor_chat_thread
--     (SECURITY DEFINER RPC). This policy does NOT change that path.
--   - chat_sessions already has `chat_sessions_read_all USING (true)`, so
--     we are not changing the privacy posture of the chat system — we are
--     restoring the symmetric read access the admin UI has always assumed.
--   - Writes into chats remain locked down (only record_chat_message and
--     post_agent_chat_message SECURITY DEFINER paths can insert).
--
-- Safe, idempotent, non-destructive. No data changes. No schema change.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'chats'
       AND policyname = 'chats_read_all'
  ) THEN
    CREATE POLICY "chats_read_all"
      ON public.chats
      FOR SELECT
      USING (true);
  END IF;
END$$;
