-- REFUND-ONLY-PROVIDER-EARNINGS-SEPARATION-002
-- Atomic, idempotent "Refund + Cancel" DB action.
--
-- Context: the ONLY payout-exclusion sentinel every reader honors is
-- doctor_earnings.status = 'cancelled' (resolve_charge_payouts, companyExpenses P&L,
-- monthly report all filter `status <> 'cancelled'`). 'refunded' is NOT excluded by
-- those readers. create-refund and stripe-webhook are now FINANCIAL ONLY and never
-- touch provider earnings; earnings voiding on a genuine cancellation is owned here.
--
-- This is an explicit RPC (called only by the cancel-order edge function via
-- service_role) — deliberately NOT a trigger on orders.status, to avoid hidden
-- side effects for future writers / imports / manual corrections.
--
-- Behavior (single transaction):
--   * lock the order row (serialize concurrent cancels)
--   * if already status='cancelled' -> no-op, return already_cancelled=true
--   * else set orders.status='cancelled' and void ONLY non-completed provider
--     earnings (status -> 'cancelled'), never touching 'paid' or 'cancelled' rows
--   * completed work (doctor_status in patient_notified/letter_sent) preserves earnings
-- Idempotent: re-running finds status='cancelled' and returns without re-voiding.

CREATE OR REPLACE FUNCTION public.cancel_order_and_void_earnings(
  p_confirmation_id text,
  p_actor           text DEFAULT 'system'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id  uuid;
  v_status    text;
  v_doctor_st text;
  v_completed boolean;
  v_voided    integer := 0;
BEGIN
  -- Serialize concurrent Refund + Cancel calls for this order.
  SELECT id, status, doctor_status
    INTO v_order_id, v_status, v_doctor_st
    FROM public.orders
   WHERE confirmation_id = p_confirmation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found',
                              'confirmation_id', p_confirmation_id);
  END IF;

  -- Idempotency: already cancelled -> no-op (no re-void; caller writes no new audit).
  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'already_cancelled', true,
                              'confirmation_id', p_confirmation_id,
                              'status', v_status, 'earnings_voided', 0);
  END IF;

  v_completed := v_doctor_st IN ('patient_notified', 'letter_sent');

  -- Claim the cancellation (fires the existing status-change log trigger only).
  UPDATE public.orders SET status = 'cancelled' WHERE id = v_order_id;

  -- Void only NON-completed earnings; never touch already-paid or already-cancelled
  -- rows. 'cancelled' is the sentinel all payout/P&L readers exclude.
  IF NOT v_completed THEN
    UPDATE public.doctor_earnings
       SET status = 'cancelled',
           notes  = left(
                      COALESCE(NULLIF(notes, ''), '')
                      || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE ' | ' END
                      || 'Voided on Refund + Cancel by ' || p_actor,
                      1000)
     WHERE confirmation_id = p_confirmation_id
       AND COALESCE(status, '') NOT IN ('paid', 'cancelled');
    GET DIAGNOSTICS v_voided = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'already_cancelled', false,
                            'confirmation_id', p_confirmation_id,
                            'status', 'cancelled',
                            'earnings_voided', v_voided,
                            'was_completed', v_completed);
END;
$$;

-- Only the cancel-order edge function (service_role) may run this. It is never
-- callable by anon/authenticated PostgREST clients.
REVOKE ALL ON FUNCTION public.cancel_order_and_void_earnings(text, text) FROM public;
REVOKE ALL ON FUNCTION public.cancel_order_and_void_earnings(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_order_and_void_earnings(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_and_void_earnings(text, text) TO service_role;
