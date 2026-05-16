-- ─────────────────────────────────────────────────────────────────────────────
-- Analytics Phase 1 — RPC fix.
--
-- The original migration's record_event() left p_session_id without a
-- DEFAULT, which makes PostgREST overload resolution stricter than we want
-- when the client sends a null session_id. Re-create with explicit
-- DEFAULT NULL on every parameter so PostgREST can resolve any caller shape.
--
-- Also re-grants execute to anon/authenticated. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Drop the prior signature if present (CASCADE-safe — no dependents) ──
DROP FUNCTION IF EXISTS public.record_event(uuid, text, text, jsonb);

-- ── 2. Re-create with all-default params ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_event(
  p_session_id uuid  DEFAULT NULL,
  p_event_name text  DEFAULT NULL,
  p_page_url   text  DEFAULT NULL,
  p_props      jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event_name IS NULL OR length(trim(p_event_name)) = 0 THEN
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.events (session_id, event_name, page_url, props)
    VALUES (p_session_id, p_event_name, p_page_url, p_props);
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.record_event(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_event(uuid, text, text, jsonb)
  TO anon, authenticated;

COMMENT ON FUNCTION public.record_event(uuid, text, text, jsonb) IS
  'Fire-and-forget structured event logger. SECURITY DEFINER, anon-callable, never raises. All params nullable.';


-- ── 3. Re-affirm link_session_to_order grants (no signature change) ────────
GRANT EXECUTE ON FUNCTION public.link_session_to_order(uuid, text)
  TO anon, authenticated;


-- ── 4. Re-affirm record_visitor_session grants (no signature change) ───────
-- Already granted in 20260424140000_visitor_sessions.sql; re-running for safety.
GRANT EXECUTE ON FUNCTION public.record_visitor_session(
  uuid, text, text, text, text, text, text,
  text, text, text, text, text, text, text, jsonb
) TO anon, authenticated;
