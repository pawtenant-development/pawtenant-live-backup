-- Chat capture table (safe, additive only)
-- Stores inbound chat messages from website (e.g. Tawk.to, JS hook)
-- Non-destructive: only creates new objects, does not touch existing tables.

CREATE TABLE IF NOT EXISTS public.chats (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text,
  name       text,
  message    text NOT NULL,
  source     text DEFAULT 'website_chat',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chats_email_idx
  ON public.chats (email);

CREATE INDEX IF NOT EXISTS chats_created_at_desc_idx
  ON public.chats (created_at DESC);

-- Enable RLS but allow edge function (service role) full access.
-- Anon/public clients will NOT be able to read or write directly;
-- all writes must go through the capture-chat edge function.
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
