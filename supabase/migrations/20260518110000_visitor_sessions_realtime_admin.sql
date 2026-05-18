-- Visitor sessions — Realtime push + admin SELECT RLS.
--
-- Why this exists:
--   Admin clients need a push channel so the new-visitor chime fires
--   within ~100ms of arrival, including for browser tabs that are in
--   the background. Chrome throttles setInterval to about 1/min in
--   background tabs, so the previous 5s get_live_visitors polling
--   loop went effectively silent when the admin tab was not focused.
--   WebSocket connections used by Supabase Realtime are NOT throttled,
--   so postgres_changes events still arrive in background tabs.
--
-- Security model:
--   * public.visitor_sessions has had RLS enabled since 2026-04-24 with
--     no SELECT policy — anon and customer-facing traffic stay locked
--     out of direct reads. They keep writing rows via the existing
--     record_visitor_session SECURITY DEFINER RPC.
--   * This migration adds a narrow SELECT policy for authenticated
--     users whose doctor_profiles.is_admin = true (auth.uid()). That is
--     the same gate the get_live_visitors RPC already enforces inline,
--     so the data surface for admins is unchanged — they could already
--     read every row through the RPC, just inside a time window.
--   * Realtime postgres_changes evaluates this RLS policy before
--     delivering each event to a subscriber. Anon, non-admin, and
--     unauthenticated clients receive nothing through the channel.
--   * Pattern mirrors what chat_sessions / chats / chat_attachments /
--     contact_submissions / contact_submission_replies already do.
--
-- All operations are ADDITIVE and IDEMPOTENT. Safe to re-run. No existing
-- rows, columns, indexes, policies, RPCs, triggers, or publications are
-- modified.

-- 1) Add the table to the supabase_realtime publication so the Realtime
--    server picks up postgres-level INSERT events.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'visitor_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.visitor_sessions;
  END IF;
END$$;

-- 2) Admin-only SELECT policy. Identical gate to get_live_visitors —
--    doctor_profiles.is_admin = true for the caller's auth.uid().
--    Anon, non-admin authenticated users, and customer-portal users
--    continue to receive nothing.
DROP POLICY IF EXISTS visitor_sessions_admin_select ON public.visitor_sessions;
CREATE POLICY visitor_sessions_admin_select
  ON public.visitor_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.doctor_profiles dp
      WHERE dp.user_id  = auth.uid()
        AND dp.is_admin = true
    )
  );

COMMENT ON POLICY visitor_sessions_admin_select ON public.visitor_sessions IS
  'Admin-only read access for Realtime postgres_changes and any direct SELECT. Mirrors the inline admin gate in get_live_visitors. Anon and non-admin authenticated users receive nothing.';
