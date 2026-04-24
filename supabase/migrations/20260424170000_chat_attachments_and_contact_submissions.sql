-- Phase 9: chat attachments + contact submissions.
--
-- Two additive features, shipped in one migration so the corresponding
-- edge functions + UI can be rolled out atomically.
--
-- A) chat_attachments — visitor/agent file uploads tied to a chat session
--    and optionally a specific chats row. Files live in Supabase Storage
--    bucket 'chat-attachments' (private). Row knows the path + MIME + size.
--
-- B) contact_submissions — replaces third-party Readdy forms. Contact Us,
--    homepage contact section, and my-orders support widget all POST into
--    a Supabase edge function which inserts into this table + sends a
--    Resend notification to hello@pawtenant.com.
--
-- Storage bucket is created + locked down via storage.objects policies.
-- No existing rows/policies are modified.
--
-- Rollback notes (safe, non-destructive — nothing here drops existing data):
--   BEGIN;
--     DROP POLICY IF EXISTS "chat_attachments_read_all"       ON public.chat_attachments;
--     DROP POLICY IF EXISTS "contact_submissions_read_all"    ON public.contact_submissions;
--     DROP POLICY IF EXISTS "storage_chat_attachments_select" ON storage.objects;
--     DROP TABLE  IF EXISTS public.chat_attachments;
--     DROP TABLE  IF EXISTS public.contact_submissions;
--     -- Optional: DELETE FROM storage.buckets WHERE id = 'chat-attachments';
--     -- (Only do this after manually removing all objects via dashboard.)
--   COMMIT;

-- ──────────────────────────────────────────────────────────────────────────
-- A) chat_attachments
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_session_id  uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  chat_message_id  uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  uploaded_by      text NOT NULL DEFAULT 'visitor',
  file_name        text NOT NULL,
  file_path        text NOT NULL,
  file_type        text,
  file_size        bigint,
  created_at       timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_attachments_uploaded_by_check') THEN
    ALTER TABLE public.chat_attachments
      ADD CONSTRAINT chat_attachments_uploaded_by_check
      CHECK (uploaded_by IN ('visitor','agent','system'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_attachments_file_size_check') THEN
    ALTER TABLE public.chat_attachments
      ADD CONSTRAINT chat_attachments_file_size_check
      CHECK (file_size IS NULL OR (file_size >= 0 AND file_size <= 26214400));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS chat_attachments_session_idx
  ON public.chat_attachments (chat_session_id, created_at);

CREATE INDEX IF NOT EXISTS chat_attachments_message_idx
  ON public.chat_attachments (chat_message_id)
  WHERE chat_message_id IS NOT NULL;

ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

-- Mirror chats_read_all / chat_sessions_read_all so the admin UI can list
-- attachments via the anon/authenticated client. Writes are locked down
-- — only SECURITY DEFINER RPCs / service role can insert.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='chat_attachments'
       AND policyname='chat_attachments_read_all'
  ) THEN
    CREATE POLICY "chat_attachments_read_all"
      ON public.chat_attachments
      FOR SELECT
      USING (true);
  END IF;
END$$;

-- Realtime publication (so admin MiniChatPanel refreshes attachments too)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chat_attachments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_attachments;
  END IF;
END$$;

-- ──────────────────────────────────────────────────────────────────────────
-- B) contact_submissions
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  email              text NOT NULL,
  phone              text,
  subject            text,
  message            text NOT NULL,
  source_page        text,
  status             text NOT NULL DEFAULT 'new',
  assigned_admin_id  uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_submissions_status_check') THEN
    ALTER TABLE public.contact_submissions
      ADD CONSTRAINT contact_submissions_status_check
      CHECK (status IN ('new','read','resolved'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS contact_submissions_created_at_desc_idx
  ON public.contact_submissions (created_at DESC);

CREATE INDEX IF NOT EXISTS contact_submissions_status_idx
  ON public.contact_submissions (status);

CREATE INDEX IF NOT EXISTS contact_submissions_email_idx
  ON public.contact_submissions (email);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- Admin portal reads via anon client (same posture as chats/chat_sessions).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='contact_submissions'
       AND policyname='contact_submissions_read_all'
  ) THEN
    CREATE POLICY "contact_submissions_read_all"
      ON public.contact_submissions
      FOR SELECT
      USING (true);
  END IF;
END$$;

-- Admin portal updates (mark read / resolve / assign) via anon client.
-- Writes pass through the anon key already scoped to this table only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='contact_submissions'
       AND policyname='contact_submissions_update_all'
  ) THEN
    CREATE POLICY "contact_submissions_update_all"
      ON public.contact_submissions
      FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;

-- Inserts are NOT permitted from anon — all inserts go through the
-- contact-submit edge function (service role), which validates input.

-- Realtime publication for admin live-refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='contact_submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_submissions;
  END IF;
END$$;

-- ──────────────────────────────────────────────────────────────────────────
-- C) Storage bucket 'chat-attachments' + policies
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- SELECT policy: allow anon + authenticated to createSignedUrl.
-- (Objects themselves are private — only signed URLs or service role can
-- fetch the actual file bytes. This policy is what lets the admin UI's
-- supabase.storage.createSignedUrl call succeed.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='storage' AND tablename='objects'
       AND policyname='storage_chat_attachments_select'
  ) THEN
    CREATE POLICY "storage_chat_attachments_select"
      ON storage.objects
      FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'chat-attachments');
  END IF;
END$$;

-- No INSERT/UPDATE/DELETE policies on storage.objects for this bucket —
-- writes must go through the chat-attachment-upload edge function
-- (service role), which validates MIME + size + session ownership.

-- ──────────────────────────────────────────────────────────────────────────
-- D) Visitor-safe RPC for listing attachments on the visitor's own session.
--
-- Mirrors get_visitor_chat_thread: keyed by (provider, provider_session_id),
-- SECURITY DEFINER, exposes only safe columns. Visitor needs this because
-- chat_attachments_read_all is anon-readable but the visitor does not know
-- chat_session_id (the internal uuid) — they only know provider_session_id.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_visitor_chat_attachments(
  p_provider            text,
  p_provider_session_id text
) RETURNS TABLE (
  id              uuid,
  chat_message_id uuid,
  uploaded_by     text,
  file_name       text,
  file_path       text,
  file_type       text,
  file_size       bigint,
  created_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.chat_message_id, a.uploaded_by,
         a.file_name, a.file_path, a.file_type, a.file_size, a.created_at
    FROM public.chat_attachments a
    JOIN public.chat_sessions    s ON s.id = a.chat_session_id
   WHERE s.provider            = p_provider
     AND s.provider_session_id = p_provider_session_id
   ORDER BY a.created_at ASC
   LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.get_visitor_chat_attachments(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_visitor_chat_attachments(text, text)
  TO anon, authenticated, service_role;
