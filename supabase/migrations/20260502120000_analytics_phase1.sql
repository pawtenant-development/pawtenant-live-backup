-- ─────────────────────────────────────────────────────────────────────────────
-- Analytics Phase 1 — Session linking, first-touch preservation, event log.
--
-- Fully idempotent. Non-destructive. Adds columns / tables / RPCs only.
-- Does NOT alter, drop, or rewrite any existing column or constraint.
--
-- All RPCs:
--   • SECURITY DEFINER (run with table owner privileges, bypass RLS)
--   • EXECUTE granted to anon + authenticated
--   • Wrapped in EXCEPTION blocks → never raise to the client
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. orders: link to visitor_sessions + dual-touch attribution ────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS session_id        uuid,
  ADD COLUMN IF NOT EXISTS first_touch_json  jsonb,
  ADD COLUMN IF NOT EXISTS last_touch_json   jsonb;

CREATE INDEX IF NOT EXISTS orders_session_id_idx
  ON public.orders (session_id);

COMMENT ON COLUMN public.orders.session_id IS
  'FK-style link to public.visitor_sessions.session_id. Set on lead creation.';
COMMENT ON COLUMN public.orders.first_touch_json IS
  'Attribution snapshot at the very first landing — never overwritten.';
COMMENT ON COLUMN public.orders.last_touch_json IS
  'Attribution snapshot at the most recent campaign touch — overwritable.';


-- ── 2. visitor_sessions: link back to the order it produced ─────────────────
ALTER TABLE public.visitor_sessions
  ADD COLUMN IF NOT EXISTS confirmation_id text;

CREATE INDEX IF NOT EXISTS visitor_sessions_confirmation_id_idx
  ON public.visitor_sessions (confirmation_id);

COMMENT ON COLUMN public.visitor_sessions.confirmation_id IS
  'Set when this session converts to an order. Backfilled on payment.';


-- ── 3. events table — typed funnel event log ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid,
  event_name  text          NOT NULL,
  page_url    text,
  props       jsonb,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_session_id_idx
  ON public.events (session_id);
CREATE INDEX IF NOT EXISTS events_event_name_idx
  ON public.events (event_name);
CREATE INDEX IF NOT EXISTS events_created_idx
  ON public.events (created_at DESC);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Lock direct table access. All inserts go through the SECURITY DEFINER RPC.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'events_no_direct_select'
  ) THEN
    CREATE POLICY events_no_direct_select
      ON public.events FOR SELECT TO anon, authenticated USING (false);
  END IF;
END $$;


-- ── 4. record_event RPC ─────────────────────────────────────────────────────
-- Fire-and-forget event insert. Anon-callable. Failures swallowed.
CREATE OR REPLACE FUNCTION public.record_event(
  p_session_id uuid,
  p_event_name text,
  p_page_url   text  DEFAULT NULL,
  p_props      jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate minimally — never raise.
  IF p_event_name IS NULL OR length(trim(p_event_name)) = 0 THEN
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.events (session_id, event_name, page_url, props)
    VALUES (p_session_id, p_event_name, p_page_url, p_props);
  EXCEPTION WHEN OTHERS THEN
    -- Swallow all errors so analytics can never block the request path.
    RETURN;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.record_event(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_event(uuid, text, text, jsonb)
  TO anon, authenticated;

COMMENT ON FUNCTION public.record_event(uuid, text, text, jsonb) IS
  'Fire-and-forget structured event logger. SECURITY DEFINER, anon-callable, never raises.';


-- ── 5. link_session_to_order RPC ────────────────────────────────────────────
-- Back-link visitor_sessions row to its order on conversion.
-- Anon-callable. Idempotent (uses COALESCE). Failures swallowed.
CREATE OR REPLACE FUNCTION public.link_session_to_order(
  p_session_id      uuid,
  p_confirmation_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL OR p_confirmation_id IS NULL OR length(trim(p_confirmation_id)) = 0 THEN
    RETURN;
  END IF;

  BEGIN
    UPDATE public.visitor_sessions
       SET confirmation_id = COALESCE(confirmation_id, p_confirmation_id),
           paid_at         = COALESCE(paid_at, now())
     WHERE session_id = p_session_id;
  EXCEPTION WHEN OTHERS THEN
    -- Swallow all errors — link is best-effort only.
    RETURN;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.link_session_to_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_session_to_order(uuid, text)
  TO anon, authenticated;

COMMENT ON FUNCTION public.link_session_to_order(uuid, text) IS
  'Idempotent back-link from visitor_sessions to orders.confirmation_id. SECURITY DEFINER, anon-callable, never raises.';
