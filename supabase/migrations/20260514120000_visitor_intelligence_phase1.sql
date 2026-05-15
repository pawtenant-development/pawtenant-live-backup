-- Visitor Intelligence — Phase 1 foundation.
--
-- Adds heartbeat fields to public.visitor_sessions and two new RPCs:
--   * bump_visitor_pulse(p_session_id, p_current_page)
--   * get_live_visitors(p_window_seconds, p_limit)
--
-- All operations are ADDITIVE and IDEMPOTENT. No existing rows are
-- modified. No existing columns, indexes, RLS policies, RPCs, or
-- behaviors are altered. Safe to re-run.

-- ── 1. Heartbeat columns on visitor_sessions ───────────────────────────────
-- last_seen_at: bumped by every heartbeat tick from a visible tab.
-- current_page: most-recent SPA path (query string + hash stripped client-side).
-- page_count : incremented by bump_visitor_pulse only when current_page changes.
ALTER TABLE public.visitor_sessions
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_page text,
  ADD COLUMN IF NOT EXISTS page_count   integer DEFAULT 0;

-- Index that backs the active-visitor list query in get_live_visitors().
CREATE INDEX IF NOT EXISTS visitor_sessions_last_seen_idx
  ON public.visitor_sessions (last_seen_at DESC NULLS LAST);


-- ── 2. bump_visitor_pulse — heartbeat RPC ──────────────────────────────────
-- Called every ≤30s by the visitor's browser tab while the tab is visible.
-- Best-effort UPDATE — if the visitor_sessions row does not exist yet (race
-- with ensureVisitorSession), the call no-ops and the NEXT pulse lands.
--
-- page_count is incremented ONLY when p_current_page differs from the row's
-- stored current_page. This keeps the page_count meaningful (one per route
-- change) and avoids inflation from the 30s same-page heartbeat.
--
-- Anon-callable, swallow-all, never raises. Mirrors the safety style of
-- record_event / record_visitor_session.
CREATE OR REPLACE FUNCTION public.bump_visitor_pulse(
  p_session_id   uuid,
  p_current_page text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    UPDATE public.visitor_sessions
       SET last_seen_at = now(),
           current_page = COALESCE(p_current_page, current_page),
           page_count = COALESCE(page_count, 0)
             + CASE
                 WHEN p_current_page IS NOT NULL
                  AND p_current_page IS DISTINCT FROM current_page
                 THEN 1
                 ELSE 0
               END
     WHERE session_id = p_session_id;
  EXCEPTION WHEN OTHERS THEN
    -- Heartbeat is best-effort only — never raise.
    RETURN;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_visitor_pulse(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_visitor_pulse(uuid, text)
  TO anon, authenticated;

COMMENT ON FUNCTION public.bump_visitor_pulse(uuid, text) IS
  'Fire-and-forget visitor heartbeat. Updates last_seen_at and current_page; increments page_count only on page change. SECURITY DEFINER, anon-callable, never raises.';


-- ── 3. get_live_visitors — admin-only read API ─────────────────────────────
-- Returns the active visitor list: visitor_sessions rows whose last_seen_at
-- is within the requested window (default 90s).
--
-- Admin auth is enforced inline: the caller must own a row in
-- doctor_profiles with is_admin = true (matches the rest of the admin
-- portal's auth model). Non-admin and anon callers get an empty result set.
-- Raw visitor_sessions remains RLS-locked — this function is the ONLY
-- approved read surface for the live list.
CREATE OR REPLACE FUNCTION public.get_live_visitors(
  p_window_seconds integer DEFAULT 90,
  p_limit          integer DEFAULT 200
) RETURNS TABLE (
  session_id            uuid,
  current_page          text,
  last_seen_at          timestamptz,
  first_seen_at         timestamptz,
  page_count            integer,
  channel               text,
  utm_source            text,
  utm_medium            text,
  utm_campaign          text,
  gclid                 text,
  fbclid                text,
  ref                   text,
  landing_url           text,
  referrer              text,
  device                text,
  geo                   jsonb,
  chat_opened_at        timestamptz,
  first_message_at      timestamptz,
  assessment_started_at timestamptz,
  paid_at               timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  -- Inline admin gate. auth.uid() is null for anon → no rows → empty result.
  SELECT COALESCE(BOOL_OR(dp.is_admin), false)
    INTO v_is_admin
    FROM public.doctor_profiles dp
   WHERE dp.user_id = auth.uid();

  IF NOT v_is_admin THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT vs.session_id,
           vs.current_page,
           vs.last_seen_at,
           vs.created_at AS first_seen_at,
           COALESCE(vs.page_count, 0) AS page_count,
           vs.channel,
           vs.utm_source,
           vs.utm_medium,
           vs.utm_campaign,
           vs.gclid,
           vs.fbclid,
           vs.ref,
           vs.landing_url,
           vs.referrer,
           vs.device,
           vs.geo,
           vs.chat_opened_at,
           vs.first_message_at,
           vs.assessment_started_at,
           vs.paid_at
      FROM public.visitor_sessions vs
     WHERE vs.last_seen_at IS NOT NULL
       AND vs.last_seen_at > now() - make_interval(secs => GREATEST(p_window_seconds, 10))
     ORDER BY vs.last_seen_at DESC NULLS LAST
     LIMIT GREATEST(LEAST(COALESCE(p_limit, 200), 500), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.get_live_visitors(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_visitors(integer, integer)
  TO authenticated;

COMMENT ON FUNCTION public.get_live_visitors(integer, integer) IS
  'Admin-only live visitor list. Enforces doctor_profiles.is_admin = true via auth.uid(). Returns empty set for non-admins. Window clamped to 10s minimum, limit clamped to 1..500.';
