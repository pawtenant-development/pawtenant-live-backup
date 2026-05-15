-- Phase A — Visitor Source Rankings: admin-only read RPC.
--
-- Returns visitor_sessions rows + their attribution fields + landing URL
-- + milestone timestamps inside a date window, so the client-side
-- acquisitionClassifier can normalize each row into one of the 15
-- canonical labels and the panel can aggregate visitors / assessment
-- starts / paid / conversion rate per label.
--
-- Why a dedicated RPC instead of a plain SELECT:
--   * visitor_sessions is RLS-locked (only SECURITY DEFINER RPCs can read).
--   * Admin gate inline so anon/non-admin always gets an empty set.
--   * Hard cap on row count keeps the dashboard responsive even after the
--     visitor table grows.
--
-- Pure read. No writes. No new column. No new table. No new policy.
-- ADDITIVE + IDEMPOTENT — safe to re-run.

CREATE OR REPLACE FUNCTION public.get_visitor_source_data(
  p_from  timestamptz DEFAULT (now() - interval '30 days'),
  p_to    timestamptz DEFAULT now(),
  p_limit integer     DEFAULT 5000
) RETURNS TABLE (
  session_id            uuid,
  created_at            timestamptz,
  last_seen_at          timestamptz,
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
  assessment_started_at timestamptz,
  paid_at               timestamptz,
  chat_opened_at        timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin boolean := false;
  v_from     timestamptz := COALESCE(p_from, now() - interval '30 days');
  v_to       timestamptz := COALESCE(p_to, now());
  v_limit    integer     := GREATEST(LEAST(COALESCE(p_limit, 5000), 20000), 1);
BEGIN
  -- Inline admin gate, mirroring get_live_visitors / get_visitor_journey.
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
    SELECT vs.session_id,
           vs.created_at,
           vs.last_seen_at,
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
           vs.assessment_started_at,
           vs.paid_at,
           vs.chat_opened_at
      FROM public.visitor_sessions vs
     WHERE vs.created_at >= v_from
       AND vs.created_at <  v_to
     ORDER BY vs.created_at DESC
     LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_visitor_source_data(timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_visitor_source_data(timestamptz, timestamptz, integer)
  TO authenticated;

COMMENT ON FUNCTION public.get_visitor_source_data(timestamptz, timestamptz, integer) IS
  'Admin-only visitor_sessions read for analytics aggregation. Returns rows in the date window for client-side classifier aggregation. Empty set for non-admins. Limit clamped to 1..20000.';
