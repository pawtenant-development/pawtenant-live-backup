-- Phase 5c: refine chat→order linking.
-- Safe, idempotent, non-destructive. No data is deleted.
--
-- Changes:
--   1. link_chat_session_to_order — never overwrites an existing match.
--      Uses COALESCE(visitor_email, email) so visitor-provided identity
--      takes priority over legacy/auto-captured email.
--   2. update_chat_visitor_identity — automatically calls
--      link_chat_session_to_order after persisting the visitor's email,
--      so the order link happens at the earliest possible moment.

-- 1. Refined link function.
CREATE OR REPLACE FUNCTION public.link_chat_session_to_order(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing   uuid;
  v_email_norm text;
  v_order_id   uuid;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;

  -- Prefer visitor-provided email, fall back to legacy/auto-captured email.
  SELECT matched_order_id,
         NULLIF(lower(trim(COALESCE(visitor_email, email))), '')
    INTO v_existing, v_email_norm
    FROM public.chat_sessions
   WHERE id = p_session_id
   LIMIT 1;

  -- Never overwrite an existing match.
  IF v_existing IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_email_norm IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_order_id
    FROM public.orders
   WHERE NULLIF(lower(trim(email)), '') = v_email_norm
   ORDER BY created_at DESC NULLS LAST
   LIMIT 1;

  IF v_order_id IS NOT NULL THEN
    UPDATE public.chat_sessions
       SET matched_order_id = v_order_id
     WHERE id = p_session_id
       AND matched_order_id IS NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.link_chat_session_to_order(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.link_chat_session_to_order(uuid) TO service_role;

-- 2. update_chat_visitor_identity — also triggers order linking.
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

  -- Auto-link order as soon as the visitor provides an email. No-op if
  -- already linked (link function guards against overwrite).
  IF v_email_norm IS NOT NULL THEN
    PERFORM public.link_chat_session_to_order(v_session_id);
  END IF;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_chat_visitor_identity(text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.update_chat_visitor_identity(text,text,text,text) TO anon, authenticated, service_role;
