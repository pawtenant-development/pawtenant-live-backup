-- 30-DAY OFFICIAL LETTER — DAY-29 + CUSTOMER EMAIL + FUTURE-ONLY BACKFILL (LIVE)
-- =============================================================================
-- LIVE mirror of TEST 20260710130000 (commit 9f5fa6b), with two LIVE adaptations
-- required by production reality and the owner's rollout decision:
--
-- (1) NO-AUTH edge-fn calls. LIVE notify-thirty-day-reissue is verify_jwt=FALSE
--     and the existing LIVE reopen fn calls it with a Content-Type-only header
--     (no vault key / no Bearer). This migration keeps that pattern and calls the
--     new notify-thirty-day-customer (also deployed verify_jwt=FALSE on LIVE) the
--     same no-auth way. (TEST used verify_jwt=true + a vault service key.)
--
-- (2) FUTURE-ONLY backfill (owner decision, THIRTY-DAY-STATE-REVIEW-AUTOMATION-
--     LIVE-MIRROR-001). Orders whose computed day-29 has ALREADY passed were
--     handled manually and MUST NOT be auto-reopened or emailed. So the backfill
--     enrolls ONLY orders whose (first_completed + 29 days) is still in the
--     FUTURE. Already-crossed orders are left completely untouched (no enroll, no
--     past due_at, no reopen queue). The re-align step is likewise future-guarded.
--
-- Everything else matches TEST: day-29 scheduling, date-based reopen selector,
-- customer-notify marker column, provider email/bell unchanged, status='completed'
-- gate (excludes cancelled/refunded/disputed/under-review), idempotency.
-- =============================================================================

-- 1. Customer-notification idempotency marker --------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS official_letter_customer_notified_at timestamptz;

COMMENT ON COLUMN public.orders.official_letter_customer_notified_at IS
  'When the calm customer "official letter review has started" email was sent for the 30-day reopen. Set once; gate that prevents duplicate customer emails.';

-- 2. Enrollment trigger: schedule reopen at DAY 29 (was 30) ------------------
CREATE OR REPLACE FUNCTION public.handle_official_letter_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT (
    public.is_thirty_day_official_letter_state(NEW.state)
    AND NEW.payment_intent_id IS NOT NULL
    AND (NEW.doctor_user_id IS NOT NULL OR NEW.doctor_email IS NOT NULL)
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.official_letter_cycle_complete THEN
    RETURN NEW;
  END IF;

  IF NEW.official_letter_first_completed_at IS NULL THEN
    NEW.official_letter_30_day_required    := true;
    NEW.official_letter_first_completed_at := now();
    NEW.official_letter_due_at             := now() + interval '29 days';
  ELSIF NEW.official_letter_reopened_at IS NOT NULL
        AND NEW.official_letter_final_completed_at IS NULL THEN
    NEW.official_letter_final_completed_at := now();
    NEW.official_letter_cycle_complete     := true;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Reopen function: DAY-29 (date-based) + provider email + customer email ---
-- LIVE no-auth pattern (Content-Type only), LIVE URLs.
CREATE OR REPLACE FUNCTION public.reopen_due_official_letter_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r              RECORD;
  cnt            integer := 0;
  v_provider_url text := 'https://cvwbozlbbmrjxznknouq.supabase.co/functions/v1/notify-thirty-day-reissue';
  v_customer_url text := 'https://cvwbozlbbmrjxznknouq.supabase.co/functions/v1/notify-thirty-day-customer';
BEGIN
  FOR r IN
    SELECT id, confirmation_id, state, doctor_status, doctor_user_id, doctor_email,
           official_letter_customer_notified_at, official_letter_due_at
    FROM public.orders
    WHERE public.is_thirty_day_official_letter_state(state)
      AND payment_intent_id IS NOT NULL
      AND status = 'completed'
      AND (doctor_user_id IS NOT NULL OR doctor_email IS NOT NULL)
      AND official_letter_first_completed_at IS NOT NULL
      AND official_letter_due_at IS NOT NULL
      AND official_letter_due_at::date <= now()::date   -- DAY 29 (date-based)
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
         'Order automatically moved back to Under Review on day 29 for the official/final letter '
           || '(30-day relationship rule, ' || coalesce(r.state, '') || '). '
           || 'Same provider preserved. Provider + customer notified.',
         jsonb_build_object('status', 'completed', 'doctor_status', r.doctor_status),
         jsonb_build_object('status', 'under-review', 'doctor_status', 'thirty_day_reissue'),
         jsonb_build_object('confirmation_id', r.confirmation_id, 'order_id', r.id,
                            'reason', 'thirty_day_official_letter', 'trigger_day', 29));
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

    -- Provider email (LIVE no-auth pattern).
    BEGIN
      IF r.doctor_email IS NOT NULL THEN
        PERFORM net.http_post(
          url     := v_provider_url,
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body    := jsonb_build_object('confirmationId', r.confirmation_id)
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Customer email (LIVE no-auth pattern). Once per order + defensive 20-day
    -- guard so a "2 business days" note is never sent on a long-elapsed order.
    BEGIN
      IF r.official_letter_customer_notified_at IS NULL
         AND r.official_letter_due_at >= now() - interval '20 days' THEN
        PERFORM net.http_post(
          url     := v_customer_url,
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body    := jsonb_build_object('confirmationId', r.confirmation_id)
        );
        UPDATE public.orders
        SET official_letter_customer_notified_at = now()
        WHERE id = r.id;
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

-- 4. Re-align already-enrolled (not-yet-reopened) orders 30 -> 29 days --------
-- FUTURE-GUARDED: only touch orders whose new day-29 is still in the future, so
-- we never create a past-due (immediate-reopen) date for an already-crossed order.
UPDATE public.orders
SET official_letter_due_at = official_letter_first_completed_at + interval '29 days'
WHERE official_letter_first_completed_at IS NOT NULL
  AND official_letter_reopened_at IS NULL
  AND official_letter_cycle_complete = false
  AND (official_letter_first_completed_at + interval '29 days')::date > now()::date
  AND official_letter_due_at IS DISTINCT FROM official_letter_first_completed_at + interval '29 days';

-- 5. FUTURE-ONLY backfill of never-enrolled orders ---------------------------
-- Enroll paid 30-day-state completed orders w/ provider that were never enrolled,
-- using the earliest 'completed' status-log timestamp as day 0 — BUT ONLY when
-- their computed day-29 is still in the FUTURE. Already-crossed orders (day-29
-- today or past) are left completely untouched: no enroll, no past due_at, no
-- reopen. (Owner: those were handled manually; do not auto-reopen or email them.)
UPDATE public.orders AS o
SET official_letter_30_day_required    = true,
    official_letter_first_completed_at = sub.first_completed,
    official_letter_due_at             = sub.first_completed + interval '29 days'
FROM (
  SELECT x.id,
         (SELECT min(l.changed_at) FROM public.order_status_logs l
            WHERE l.order_id = x.id AND l.new_status = 'completed') AS first_completed
  FROM public.orders x
  WHERE public.is_thirty_day_official_letter_state(x.state)
    AND x.status = 'completed'
    AND x.payment_intent_id IS NOT NULL
    AND (x.doctor_user_id IS NOT NULL OR x.doctor_email IS NOT NULL)
    AND x.official_letter_first_completed_at IS NULL
    AND x.official_letter_cycle_complete = false
) sub
WHERE o.id = sub.id
  AND sub.first_completed IS NOT NULL
  AND (sub.first_completed + interval '29 days')::date > now()::date;  -- FUTURE-ONLY

-- 6. Ensure the daily cron exists (idempotent; 08:00 UTC) --------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'official-letter-30-day-reopen') THEN
    PERFORM cron.schedule(
      'official-letter-30-day-reopen',
      '0 8 * * *',
      'SELECT public.reopen_due_official_letter_orders();'
    );
  END IF;
END $$;
