-- 30-DAY OFFICIAL LETTER REOPEN — PROVIDER NOTIFICATION (LIVE)
-- =============================================================================
-- LIVE mirror of TEST 20260618130000 (TEST commit e7e0e15), adapted for LIVE.
--
-- When reopen_due_official_letter_orders() moves an order from 'completed' back
-- to 'under-review' for the official/final 30-day letter, it now ALSO:
--   1. Sets doctor_status = 'thirty_day_reissue' (the provider portal renders
--      this as an orange "30-Day Reissue" badge and counts it as active work).
--   2. Inserts a provider in-portal bell notification (doctor_notifications)
--      when the assigned provider's user id is known.
--   3. Emails the assigned provider via the EXISTING notify-thirty-day-reissue
--      edge function, invoked with pg_net.
--
-- LIVE adaptation vs TEST:
--   * Function URL points at the LIVE project ref (cvwbozlbbmrjxznknouq).
--   * notify-thirty-day-reissue is verify_jwt=FALSE on LIVE, so it is called
--     with no auth header (the same pattern the LIVE pawtenant-health-check
--     cron uses for its verify_jwt=false function). No vault secret dependency.
--
-- Idempotency / once-per-cycle guarantee:
--   Selection is gated on official_letter_reopened_at IS NULL and sets it in the
--   same loop iteration, so each order is processed exactly once per reopen
--   cycle. A second cron run never reselects the order -> no duplicate email,
--   no duplicate bell. After the second (final) completion the cycle is marked
--   complete and the order is never reopened or emailed again.
--
-- The customer is NOT emailed here (notify-thirty-day-reissue is provider-only;
-- it emails order.doctor_email and writes orders.email_log type
-- 'thirty_day_reminder'). No customer/SMS side effects.
-- order_status_logs is written automatically by the existing
-- orders_status_change_trigger; this function only adds the audit_logs context.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reopen_due_official_letter_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r         RECORD;
  cnt       integer := 0;
  v_fn_url  text := 'https://cvwbozlbbmrjxznknouq.supabase.co/functions/v1/notify-thirty-day-reissue';
BEGIN
  FOR r IN
    SELECT id, confirmation_id, state, doctor_status, doctor_user_id, doctor_email
    FROM public.orders
    WHERE public.is_thirty_day_official_letter_state(state)
      AND payment_intent_id IS NOT NULL
      AND status = 'completed'
      AND (doctor_user_id IS NOT NULL OR doctor_email IS NOT NULL)
      AND official_letter_first_completed_at IS NOT NULL
      AND official_letter_due_at IS NOT NULL
      AND official_letter_due_at <= now()
      AND official_letter_final_completed_at IS NULL
      AND official_letter_cycle_complete = false
      AND official_letter_reopened_at IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.orders
    SET status                      = 'under-review',
        doctor_status               = 'thirty_day_reissue',
        official_letter_reopened_at = now()
    WHERE id = r.id;

    BEGIN
      INSERT INTO public.audit_logs
        (action, object_type, object_id, actor_name, actor_role,
         description, old_values, new_values, metadata)
      VALUES
        ('official_letter_30_day_reopen', 'order', r.confirmation_id,
         'System - 30-Day Official Letter', 'system',
         'Order automatically moved back to Under Review for the official/final letter '
           || '(30-day relationship rule, ' || coalesce(r.state, '') || '). '
           || 'Same provider preserved. Provider notified by email + in-portal alert. '
           || 'Customer NOT emailed.',
         jsonb_build_object('status', 'completed', 'doctor_status', r.doctor_status),
         jsonb_build_object('status', 'under-review', 'doctor_status', 'thirty_day_reissue'),
         jsonb_build_object('confirmation_id', r.confirmation_id, 'order_id', r.id,
                            'reason', 'thirty_day_official_letter'));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      IF r.doctor_user_id IS NOT NULL THEN
        INSERT INTO public.doctor_notifications
          (doctor_user_id, title, message, type, confirmation_id, order_id)
        VALUES
          (r.doctor_user_id,
           'Official 30-Day Letter Needed',
           'Order ' || r.confirmation_id || ' has returned to your queue for the '
             || 'official/final 30-day letter. Please review the case and submit '
             || 'the official letter.',
           'thirty_day_reissue', r.confirmation_id, r.id);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Provider email via existing notify-thirty-day-reissue (verify_jwt=false ->
    -- no auth header, matching the LIVE health-check cron pattern). Fire-and-
    -- forget (pg_net); fires once per reopen cycle (see header).
    BEGIN
      IF r.doctor_email IS NOT NULL THEN
        PERFORM net.http_post(
          url     := v_fn_url,
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body    := jsonb_build_object('confirmationId', r.confirmation_id)
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    cnt := cnt + 1;
  END LOOP;

  RETURN cnt;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_due_official_letter_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_due_official_letter_orders() FROM anon;
REVOKE ALL ON FUNCTION public.reopen_due_official_letter_orders() FROM authenticated;
