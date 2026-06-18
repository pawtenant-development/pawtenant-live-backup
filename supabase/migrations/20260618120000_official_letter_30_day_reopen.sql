-- 30-DAY OFFICIAL LETTER REOPEN WORKFLOW (TEST)
-- =============================================================================
-- Business rule (California + other "30-day relationship" states):
--   1. When a paid 30-day-state order with an assigned provider is marked
--      completed for the FIRST time, keep it completed and schedule a reopen
--      30 days later (the relationship/official-letter timing window).
--   2. Exactly 30 days after that first completion, the order is automatically
--      moved back to 'under-review' (SAME provider preserved) for the
--      official/final letter document.
--   3. When the order is completed the SECOND time (after the auto reopen),
--      the cycle is marked complete and the automation permanently stops.
--   4. The order never loops back to under-review again after that.
--
-- 30-day states = AR, CA, IA, LA, MT — mirrors the frontend source of truth
-- COMPLIANCE_STATES in src/pages/assessment/components/StateComplianceBanner.tsx
-- (and the STATE_NAMES map in supabase/functions/notify-thirty-day-reissue).
--
-- Idempotent / loop-safe by construction:
--   * Enrollment only happens once (official_letter_first_completed_at is set
--     only when NULL).
--   * Reopen only happens once (official_letter_reopened_at must be NULL to be
--     selected, and it is set on reopen).
--   * Finalization sets official_letter_cycle_complete = true, after which the
--     completion trigger and the reopen selector both skip the order forever.
--
-- Notes:
--   * No customer/provider email or SMS is sent by this automation. The
--     existing notify-thirty-day-reissue email function is intentionally NOT
--     wired in here to avoid surprise sends.
--   * Provider payouts are unaffected: doctor_earnings is de-duped by
--     confirmation_id in notify-patient-letter, so the second completion does
--     not create a duplicate earning.
--   * order_status_logs is already written automatically by the existing
--     orders_status_change_trigger -> log_order_status_change(); the reopen
--     function therefore only adds the richer audit_logs context (no manual
--     order_status_logs insert, to avoid double-logging).
-- =============================================================================

-- 1. Workflow tracking columns ------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS official_letter_30_day_required    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS official_letter_first_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS official_letter_due_at             timestamptz,
  ADD COLUMN IF NOT EXISTS official_letter_reopened_at        timestamptz,
  ADD COLUMN IF NOT EXISTS official_letter_final_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS official_letter_cycle_complete     boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.official_letter_30_day_required    IS '30-day official-letter rule applies to this order (set on first completion of a paid 30-day-state order with a provider).';
COMMENT ON COLUMN public.orders.official_letter_first_completed_at IS 'Timestamp of the first completion that enrolled the order in the 30-day workflow.';
COMMENT ON COLUMN public.orders.official_letter_due_at            IS 'When the automated reopen-to-under-review fires (first completion + 30 days).';
COMMENT ON COLUMN public.orders.official_letter_reopened_at       IS 'When the automation moved the order back to under-review for the official letter. Set once; gate that prevents repeated reopens.';
COMMENT ON COLUMN public.orders.official_letter_final_completed_at IS 'Timestamp of the second/final completion (official letter submitted after reopen).';
COMMENT ON COLUMN public.orders.official_letter_cycle_complete    IS 'TRUE once the official-letter cycle is finished. When TRUE the order is never reopened again.';

-- 2. 30-day state helper ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_thirty_day_official_letter_state(p_state text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(coalesce(p_state, '')) IN ('AR', 'CA', 'IA', 'LA', 'MT');
$$;

-- 3. Completion enrollment / finalize trigger ---------------------------------
-- BEFORE UPDATE so the bookkeeping columns are written in the SAME row update
-- (no extra write, no recursion). Fires for ANY completion path (admin "Mark as
-- Completed", provider-submit-letter, etc.) because it keys off the status
-- transition into 'completed', not the caller.
CREATE OR REPLACE FUNCTION public.handle_official_letter_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only paid 30-day-state orders that have a provider are ever enrolled.
  IF NOT (
    public.is_thirty_day_official_letter_state(NEW.state)
    AND NEW.payment_intent_id IS NOT NULL
    AND (NEW.doctor_user_id IS NOT NULL OR NEW.doctor_email IS NOT NULL)
  ) THEN
    RETURN NEW;
  END IF;

  -- Cycle already finished -> never touch again.
  IF NEW.official_letter_cycle_complete THEN
    RETURN NEW;
  END IF;

  IF NEW.official_letter_first_completed_at IS NULL THEN
    -- FIRST completion: enroll and schedule the 30-day reopen.
    NEW.official_letter_30_day_required    := true;
    NEW.official_letter_first_completed_at := now();
    NEW.official_letter_due_at             := now() + interval '30 days';

  ELSIF NEW.official_letter_reopened_at IS NOT NULL
        AND NEW.official_letter_final_completed_at IS NULL THEN
    -- SECOND completion, AFTER the automated reopen: official/final letter done.
    NEW.official_letter_final_completed_at := now();
    NEW.official_letter_cycle_complete     := true;
  END IF;
  -- Any other re-completion (e.g. a manual correction BEFORE the auto reopen)
  -- leaves enrollment intact so the 30-day reopen still fires at due_at.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_official_letter_completion ON public.orders;
CREATE TRIGGER orders_official_letter_completion
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.handle_official_letter_completion();

-- 4. Scheduled reopen function ------------------------------------------------
CREATE OR REPLACE FUNCTION public.reopen_due_official_letter_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r                   RECORD;
  v_new_doctor_status text;
  cnt                 integer := 0;
BEGIN
  FOR r IN
    SELECT id, confirmation_id, state, doctor_status
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
    -- Mirror the manual "Mark Back Under Review" behavior: a delivered order
    -- (patient_notified) re-enters the provider queue as in_review; otherwise
    -- the existing doctor_status is preserved. Provider assignment is untouched.
    v_new_doctor_status := CASE
      WHEN r.doctor_status = 'patient_notified' THEN 'in_review'
      ELSE r.doctor_status
    END;

    UPDATE public.orders
    SET status                      = 'under-review',
        doctor_status               = v_new_doctor_status,
        official_letter_reopened_at = now()
    WHERE id = r.id;

    -- order_status_logs row is inserted automatically by the existing
    -- orders_status_change_trigger. Add the 30-day-specific audit context only.
    BEGIN
      INSERT INTO public.audit_logs
        (action, object_type, object_id, actor_name, actor_role,
         description, old_values, new_values, metadata)
      VALUES
        ('official_letter_30_day_reopen', 'order', r.confirmation_id,
         'System · 30-Day Official Letter', 'system',
         'Order automatically moved back to Under Review for the official/final letter '
           || '(30-day relationship rule, ' || coalesce(r.state, '') || '). '
           || 'Same provider preserved. No customer/provider email sent.',
         jsonb_build_object('status', 'completed', 'doctor_status', r.doctor_status),
         jsonb_build_object('status', 'under-review', 'doctor_status', v_new_doctor_status),
         jsonb_build_object('confirmation_id', r.confirmation_id, 'order_id', r.id,
                            'reason', 'thirty_day_official_letter'));
    EXCEPTION WHEN OTHERS THEN
      NULL; -- logging must never block the reopen
    END;

    cnt := cnt + 1;
  END LOOP;

  RETURN cnt;
END;
$$;

-- Cron / service-role only — never exposed to anon/authenticated clients.
REVOKE ALL ON FUNCTION public.reopen_due_official_letter_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_due_official_letter_orders() FROM anon;
REVOKE ALL ON FUNCTION public.reopen_due_official_letter_orders() FROM authenticated;

-- 5. Daily schedule (idempotent) ---------------------------------------------
-- Runs every day at 08:00 UTC. Direct SQL invocation (no edge function / no
-- auth header needed) because the function is SECURITY DEFINER.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'official-letter-30-day-reopen') THEN
    PERFORM cron.unschedule('official-letter-30-day-reopen');
  END IF;
END $$;

SELECT cron.schedule(
  'official-letter-30-day-reopen',
  '0 8 * * *',
  'SELECT public.reopen_due_official_letter_orders();'
);
