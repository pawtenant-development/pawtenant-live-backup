-- Phase 6: visitor-side read access for the PawTenant native chat widget.
--
-- Returns the message thread for one session, keyed by (provider,
-- provider_session_id). Bypasses RLS on public.chats via SECURITY DEFINER
-- and exposes ONLY safe columns (no email/name/metadata). Knowing the
-- client-side UUID is what proves you own the session.
--
-- Safe, idempotent (CREATE OR REPLACE), non-destructive. No schema change.

CREATE OR REPLACE FUNCTION public.get_visitor_chat_thread(
  p_provider            text,
  p_provider_session_id text
) RETURNS TABLE (
  id         uuid,
  session_id uuid,
  sender     text,
  message    text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.session_id, c.sender, c.message, c.created_at
    FROM public.chats c
    JOIN public.chat_sessions s ON s.id = c.session_id
   WHERE s.provider            = p_provider
     AND s.provider_session_id = p_provider_session_id
   ORDER BY c.created_at ASC
   LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.get_visitor_chat_thread(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_visitor_chat_thread(text, text)
  TO anon, authenticated, service_role;
