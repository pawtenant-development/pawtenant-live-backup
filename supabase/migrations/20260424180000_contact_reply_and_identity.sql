-- Phase 9b: contact-submission status fix + replies + admin chat identity edit.
--
-- A) contact_submissions_status_check: the initial migration allowed
--    ('new','read','resolved'), but the admin UI uses 'viewed' as the
--    middle state. That mismatch caused UPDATE failures from the Contacts
--    tab ("violates check constraint contact_submissions_status_check").
--    This migration:
--       - backfills any existing rows with status='read' to 'viewed'
--       - drops the old check
--       - installs a new check allowing ('new','viewed','resolved')
--    Idempotent and non-destructive. No row data is lost.
--
-- B) contact_submission_replies — new table storing admin-sent email
--    replies to contact submissions. Mirrors chats table posture: anon
--    SELECT for admin UI listing, INSERT only via service role (edge
--    function contact-reply).
--
-- C) update_chat_admin_identity — SECURITY DEFINER RPC to let the admin
--    correct a chat session's visitor name/email. Does NOT touch
--    matched_order_id or any other field, and does not re-run order
--    matching. Input is trimmed, email is lightly validated, empty
--    strings become NULL.
--
-- Rollback:
--   BEGIN;
--     DROP FUNCTION IF EXISTS public.update_chat_admin_identity(uuid, text, text);
--     DROP TABLE    IF EXISTS public.contact_submission_replies;
--     ALTER TABLE   public.contact_submissions
--       DROP CONSTRAINT IF EXISTS contact_submissions_status_check;
--     ALTER TABLE   public.contact_submissions
--       ADD CONSTRAINT contact_submissions_status_check
--       CHECK (status IN ('new','read','resolved'));
--   COMMIT;

-- ──────────────────────────────────────────────────────────────────────────
-- A) contact_submissions_status_check fix
-- ──────────────────────────────────────────────────────────────────────────

UPDATE public.contact_submissions
   SET status = 'viewed'
 WHERE status = 'read';

ALTER TABLE public.contact_submissions
  DROP CONSTRAINT IF EXISTS contact_submissions_status_check;

ALTER TABLE public.contact_submissions
  ADD CONSTRAINT contact_submissions_status_check
  CHECK (status IN ('new','viewed','resolved'));

-- ──────────────────────────────────────────────────────────────────────────
-- B) contact_submission_replies
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contact_submission_replies (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_submission_id  uuid NOT NULL REFERENCES public.contact_submissions(id) ON DELETE CASCADE,
  admin_id               uuid,
  admin_email            text,
  admin_name             text,
  message                text NOT NULL,
  resend_message_id      text,
  email_sent             boolean NOT NULL DEFAULT false,
  email_error            text,
  sent_at                timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_submission_replies_submission_idx
  ON public.contact_submission_replies (contact_submission_id, created_at DESC);

ALTER TABLE public.contact_submission_replies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='contact_submission_replies'
       AND policyname='contact_submission_replies_read_all'
  ) THEN
    CREATE POLICY "contact_submission_replies_read_all"
      ON public.contact_submission_replies
      FOR SELECT
      USING (true);
  END IF;
END$$;

-- No INSERT/UPDATE/DELETE policies — only service role (edge function
-- contact-reply) writes to this table.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='contact_submission_replies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_submission_replies;
  END IF;
END$$;

-- ──────────────────────────────────────────────────────────────────────────
-- C) update_chat_admin_identity RPC
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_chat_admin_identity(
  p_session_id uuid,
  p_name       text,
  p_email      text
) RETURNS TABLE (
  id             uuid,
  visitor_name   text,
  visitor_email  text,
  name           text,
  email          text,
  updated_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name  text := NULLIF(btrim(coalesce(p_name, '')), '');
  v_email text := NULLIF(btrim(lower(coalesce(p_email, ''))), '');
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'session_id is required';
  END IF;

  -- Light email validation. Empty/null is allowed (admin clearing the field).
  IF v_email IS NOT NULL AND v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'invalid email format';
  END IF;

  RETURN QUERY
    UPDATE public.chat_sessions cs
       SET visitor_name  = v_name,
           visitor_email = v_email,
           -- Keep legacy mirror columns in sync so existing UI that reads
           -- session.name / session.email continues to work.
           name  = v_name,
           email = v_email,
           updated_at = now()
     WHERE cs.id = p_session_id
     RETURNING cs.id, cs.visitor_name, cs.visitor_email, cs.name, cs.email, cs.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.update_chat_admin_identity(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.update_chat_admin_identity(uuid, text, text)
  TO anon, authenticated, service_role;
