-- 20260628140000_get_ai_assistant_clicks.sql
--
-- Read-only, admin-gated accessor for AI Assistant Trust Card button clicks.
--
-- The public.events table has RLS that blocks ALL direct client SELECTs
-- (policy events_no_direct_select USING(false) for anon + authenticated), so
-- analytics panels read events through SECURITY DEFINER functions. This mirrors
-- the existing get_visitor_source_data() convention exactly:
--   * STABLE SECURITY DEFINER, search_path = public
--   * inline admin gate via doctor_profiles.is_admin = auth.uid()
--   * COALESCE date defaults, inverted-range guard, clamped LIMIT
--
-- Returns the flattened JSON fields the AI Assistant Clicks panel aggregates
-- client-side. Read-only: no writes, no schema changes to events. Idempotent
-- (CREATE OR REPLACE + grant).

CREATE OR REPLACE FUNCTION public.get_ai_assistant_clicks(
  p_from  timestamptz DEFAULT (now() - interval '30 days'),
  p_to    timestamptz DEFAULT now(),
  p_limit integer     DEFAULT 20000
)
RETURNS TABLE (
  assistant        text,
  service_type     text,
  prompt_type      text,
  page_path        text,
  destination_host text,
  clipboard_status text,
  created_at       timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean := false;
  v_from     timestamptz := COALESCE(p_from, now() - interval '30 days');
  v_to       timestamptz := COALESCE(p_to, now());
  v_limit    integer     := GREATEST(LEAST(COALESCE(p_limit, 20000), 50000), 1);
BEGIN
  -- Inline admin gate, mirroring get_visitor_source_data.
  SELECT COALESCE(BOOL_OR(dp.is_admin), false)
    INTO v_is_admin
    FROM public.doctor_profiles dp
   WHERE dp.user_id = auth.uid();

  IF NOT v_is_admin THEN
    RETURN;
  END IF;

  -- Guard against absurd / inverted ranges.
  IF v_from >= v_to THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT (e.props->>'assistant')::text,
           (e.props->>'service_type')::text,
           (e.props->>'prompt_type')::text,
           (e.props->>'page_path')::text,
           (e.props->>'destination_host')::text,
           (e.props->>'clipboard_status')::text,
           e.created_at
      FROM public.events e
     WHERE e.event_name = 'ai_assistant_prompt_click'
       AND e.created_at >= v_from
       AND e.created_at <= v_to
     ORDER BY e.created_at DESC
     LIMIT v_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_ai_assistant_clicks(timestamptz, timestamptz, integer) TO authenticated;
