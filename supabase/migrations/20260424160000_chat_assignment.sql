-- Phase 8: chat assignment (admin ownership + resolved status).
--
-- Adds assignment metadata + resolution lifecycle to chat_sessions, and
-- exposes three SECURITY DEFINER RPCs so the admin portal can claim /
-- resolve / reopen sessions via the anon/authenticated client.
--
-- Contract:
--   - New chat_sessions are status='open' with no assigned_admin_id.
--   - First admin reply auto-assigns (app-level call to assign_chat_session
--     with p_force=false — already-assigned sessions are NOT overwritten,
--     only their last_handled_at is bumped).
--   - resolve_chat_session marks status='resolved' and stamps resolved_at
--     + resolved_by_admin_id.
--   - reopen_chat_session clears resolution fields back to status='open'.
--
-- Safe, idempotent, non-destructive. No changes to chats, no RLS edits, no
-- changes to existing RPCs (record_chat_message, post_agent_chat_message,
-- mark_chat_session_read). No data rewrites.

-- 1. Columns
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS assigned_admin_id      uuid,
  ADD COLUMN IF NOT EXISTS assigned_admin_email   text,
  ADD COLUMN IF NOT EXISTS assigned_admin_name    text,
  ADD COLUMN IF NOT EXISTS first_handled_at       timestamptz,
  ADD COLUMN IF NOT EXISTS last_handled_at        timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at            timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by_admin_id   uuid;

-- 2. Expand status check to allow 'resolved' alongside 'open'/'closed'.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_status_check'
  ) THEN
    ALTER TABLE public.chat_sessions
      DROP CONSTRAINT chat_sessions_status_check;
  END IF;
  ALTER TABLE public.chat_sessions
    ADD CONSTRAINT chat_sessions_status_check
    CHECK (status IN ('open','closed','resolved'));
END$$;

-- 3. Assignment lookup index (partial, keeps it tiny).
CREATE INDEX IF NOT EXISTS chat_sessions_assigned_admin_idx
  ON public.chat_sessions (assigned_admin_id)
  WHERE assigned_admin_id IS NOT NULL;

-- 4. Assign RPC.
--    With p_force=false, assignment fields are only set when the session
--    is currently unassigned. In all cases, last_handled_at is bumped and
--    first_handled_at is stamped (once).
CREATE OR REPLACE FUNCTION public.assign_chat_session(
  p_session_id   uuid,
  p_admin_id     uuid,
  p_admin_email  text,
  p_admin_name   text,
  p_force        boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_assigned uuid;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'assign_chat_session: session_id is required';
  END IF;

  SELECT assigned_admin_id INTO v_current_assigned
    FROM public.chat_sessions
   WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assign_chat_session: session % not found', p_session_id;
  END IF;

  IF v_current_assigned IS NOT NULL AND NOT p_force THEN
    -- Already assigned to someone. Do NOT overwrite — just bump handled.
    UPDATE public.chat_sessions
       SET last_handled_at  = now(),
           first_handled_at = COALESCE(first_handled_at, now())
     WHERE id = p_session_id;
    RETURN;
  END IF;

  UPDATE public.chat_sessions
     SET assigned_admin_id    = p_admin_id,
         assigned_admin_email = NULLIF(trim(COALESCE(p_admin_email, '')), ''),
         assigned_admin_name  = NULLIF(trim(COALESCE(p_admin_name,  '')), ''),
         first_handled_at     = COALESCE(first_handled_at, now()),
         last_handled_at      = now()
   WHERE id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_chat_session(uuid, uuid, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.assign_chat_session(uuid, uuid, text, text, boolean)
  TO anon, authenticated, service_role;

-- 5. Resolve RPC.
CREATE OR REPLACE FUNCTION public.resolve_chat_session(
  p_session_id uuid,
  p_admin_id   uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'resolve_chat_session: session_id is required';
  END IF;

  UPDATE public.chat_sessions
     SET status               = 'resolved',
         resolved_at          = now(),
         resolved_by_admin_id = p_admin_id,
         last_handled_at      = now()
   WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'resolve_chat_session: session % not found', p_session_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_chat_session(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_chat_session(uuid, uuid)
  TO anon, authenticated, service_role;

-- 6. Reopen RPC.
CREATE OR REPLACE FUNCTION public.reopen_chat_session(
  p_session_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'reopen_chat_session: session_id is required';
  END IF;

  UPDATE public.chat_sessions
     SET status               = 'open',
         resolved_at          = NULL,
         resolved_by_admin_id = NULL
   WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reopen_chat_session: session % not found', p_session_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_chat_session(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reopen_chat_session(uuid)
  TO anon, authenticated, service_role;
