-- Phase 5b: visitor-side identity capture on chat_sessions.
-- Adds visitor_name / visitor_email and exposes a safe SECURITY DEFINER
-- RPC the anon visitor can call from the PawChat widget.
--
-- Safe, idempotent, non-destructive.
--   - ADD COLUMN IF NOT EXISTS
--   - CREATE OR REPLACE FUNCTION
--   - COALESCE-only writes (never overwrites existing values)
--   - Scoped to the visitor's provider + provider_session_id (no other rows reachable)

-- 1. Columns
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS visitor_name  text,
  ADD COLUMN IF NOT EXISTS visitor_email text;

-- 2. RPC: visitor-facing identity update, keyed by their own session pair.
-- Anon is allowed to execute because the function can only ever touch a
-- single row identified by (provider, provider_session_id) that the caller
-- already possesses (same key pair used by capture-chat). Values are never
-- overwritten once set — COALESCE ensures a stable first-wins identity.
-- The mirror into legacy name/email keeps the existing admin UI unchanged.
CREATE OR REPLACE FUNCTION public.update_chat_visitor_identity(
  p_provider            text,
  p_provider_session_id text,
  p_visitor_name        text,
  p_visitor_email       text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_prov_norm  text := NULLIF(trim(p_provider), '');
  v_ext_norm   text := NULLIF(trim(p_provider_session_id), '');
  v_name_norm  text := NULLIF(trim(p_visitor_name), '');
  v_email_norm text := NULLIF(lower(trim(p_visitor_email)), '');
  v_name_len   int;
  v_email_len  int;
BEGIN
  IF v_prov_norm IS NULL OR v_ext_norm IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_name_norm IS NULL AND v_email_norm IS NULL THEN
    RETURN NULL;
  END IF;

  -- Cheap size caps — mirrors capture-chat edge function limits.
  IF v_name_norm IS NOT NULL THEN
    v_name_len := char_length(v_name_norm);
    IF v_name_len > 200 THEN
      v_name_norm := left(v_name_norm, 200);
    END IF;
  END IF;
  IF v_email_norm IS NOT NULL THEN
    v_email_len := char_length(v_email_norm);
    IF v_email_len > 320 THEN
      v_email_norm := left(v_email_norm, 320);
    END IF;
  END IF;

  SELECT id INTO v_session_id
    FROM public.chat_sessions
   WHERE provider = v_prov_norm
     AND provider_session_id = v_ext_norm
   LIMIT 1;

  IF v_session_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.chat_sessions
     SET visitor_name  = COALESCE(visitor_name,  v_name_norm),
         visitor_email = COALESCE(visitor_email, v_email_norm),
         name          = COALESCE(name,          v_name_norm),
         email         = COALESCE(email,         v_email_norm)
   WHERE id = v_session_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_chat_visitor_identity(text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.update_chat_visitor_identity(text,text,text,text) TO anon, authenticated, service_role;
