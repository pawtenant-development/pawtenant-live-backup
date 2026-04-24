-- Phase 1: PawTenant-native chat sessions + message log extension.
-- Provider-agnostic. Tawk (and future GHL) live as metadata, not primary shape.
-- Safe, idempotent, non-destructive. Schema only — no data writes.

-- Sessions (PawTenant-native header)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 text,
  name                  text,
  status                text NOT NULL DEFAULT 'open',
  provider              text,
  provider_session_id   text,
  external_metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_message_at       timestamptz,
  last_message_preview  text,
  unread_count          integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS chat_sessions_last_message_idx
  ON public.chat_sessions (last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS chat_sessions_status_idx
  ON public.chat_sessions (status);
CREATE INDEX IF NOT EXISTS chat_sessions_email_idx
  ON public.chat_sessions (email);

-- Per-provider external id uniqueness (only when both set)
CREATE UNIQUE INDEX IF NOT EXISTS chat_sessions_provider_extid_uniq
  ON public.chat_sessions (provider, provider_session_id)
  WHERE provider IS NOT NULL AND provider_session_id IS NOT NULL;

-- Status check
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_status_check') THEN
    ALTER TABLE public.chat_sessions
      ADD CONSTRAINT chat_sessions_status_check
      CHECK (status IN ('open','closed'));
  END IF;
END$$;

-- Unread count stays non-negative
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_unread_nonneg_check') THEN
    ALTER TABLE public.chat_sessions
      ADD CONSTRAINT chat_sessions_unread_nonneg_check
      CHECK (unread_count >= 0);
  END IF;
END$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.chat_sessions_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_sessions_updated_at ON public.chat_sessions;
CREATE TRIGGER chat_sessions_updated_at
BEFORE UPDATE ON public.chat_sessions
FOR EACH ROW EXECUTE FUNCTION public.chat_sessions_set_updated_at();

-- Extend chats (message log) with session + sender + provider metadata
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS session_id          uuid REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender              text NOT NULL DEFAULT 'visitor',
  ADD COLUMN IF NOT EXISTS provider            text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS metadata            jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Sender check
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chats_sender_check') THEN
    ALTER TABLE public.chats
      ADD CONSTRAINT chats_sender_check
      CHECK (sender IN ('visitor','agent','system'));
  END IF;
END$$;

-- Thread lookup
CREATE INDEX IF NOT EXISTS chats_session_created_idx
  ON public.chats (session_id, created_at);

-- Optional lookup for adapter dedup
CREATE INDEX IF NOT EXISTS chats_provider_msg_idx
  ON public.chats (provider, provider_message_id)
  WHERE provider IS NOT NULL AND provider_message_id IS NOT NULL;

-- RLS: mirror existing chats (enabled, service-role only — no anon)
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- Realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chat_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_sessions;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
  END IF;
END$$;
