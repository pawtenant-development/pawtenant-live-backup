-- ORDER-PAYMENT-INTENT-LIFECYCLE-TRIGGER-HARDENING-001
--
-- `detect_order_lifecycle_events` treated a PaymentIntent IDENTIFIER as
-- evidence of payment COMPLETION:
--
--     is_paid := (p_new.payment_intent_id is not null or p_new.paid_at is not null)
--
-- and `orders_lifecycle_before_write` then does, for a 'payment_received'
-- event, `NEW.paid_at := coalesce(NEW.paid_at, ev_at)` with ev_at = now().
-- So writing ONLY `payment_intent_id` onto an unpaid order silently stamped
-- paid_at = now() and marked the order paid. A PaymentIntent is created BEFORE
-- the customer pays; its id is an identifier, not a receipt. An open,
-- incomplete, failed or cancelled PI carries exactly the same id as a
-- successful one.
--
-- It is also the gate behind the entitlement snapshot: that trigger fires on
-- (old.paid_at IS NULL AND new.paid_at IS NOT NULL), so a PI-only write would
-- have minted an entitlement snapshot for an unpaid order too.
--
-- AUDITED BEFORE CHANGING — no historical row was affected:
--   * 60 payment_received events exist since the trigger shipped (2026-08-01);
--     58 are corroborated by a succeeded payment_attempt. The 2 that are not
--     both show complete fulfilment journeys (payment -> provider assigned ->
--     pending delivery -> completed -> customer notified) with real prices and
--     real live PI ids; payment_attempts is simply an incomplete source —
--     25 of 449 orders (5.6%) paid since attempt-recording began have no
--     attempt rows at all.
--   * 0 orders are paid-but-still-lead, 0 are paid-and-never-assigned after
--     2 days, 0 paid orders lack a payment intent.
--   * The 18 rows where paid_at = created_at are a Dec-2025..Feb-2026 data
--     import (sequential PT-4110xx ids), all predating this trigger entirely.
-- NO historical paid_at value is altered by this migration.
--
-- SAFE BECAUSE EVERY AUTHORITATIVE WRITER ALREADY SETS paid_at ITSELF:
--   stripe-webhook        -> paid_at: new Date().toISOString()
--   check-payment-status  -> paid_at + `.is("paid_at", null)` idempotency guard
--   fix-order-payment     -> paid_at: order.paid_at ?? paidAt
-- None of them relies on the trigger to infer payment from the identifier, so
-- removing the inference changes no real path.
--
-- The PaymentIntent identifier is still recorded, and a renewal that reuses or
-- replaces a PI on an ALREADY-paid order still raises
-- 'additional_payment_received' -> last_payment_at. Only the inference
-- "identifier exists therefore paid" is removed.
--
-- Applied as a targeted rewrite of the function's OWN definition so unrelated
-- arms cannot be disturbed, and it refuses to run on an unexpected shape.
do $mig$
declare
  v_def text;
  v_new text;
  v_a1  text := 'if p_new.payment_intent_id is not null or p_new.paid_at is not null then';
  v_b1  text := 'was_paid := (p_old.payment_intent_id is not null or p_old.paid_at is not null);';
  v_b2  text := 'is_paid  := (p_new.payment_intent_id is not null or p_new.paid_at is not null);';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'detect_order_lifecycle_events';

  if v_def is null then
    raise exception 'detect_order_lifecycle_events() not found';
  end if;

  -- Already hardened: re-running must be a no-op.
  if position(v_a1 in v_def) = 0
     and position('was_paid := (p_old.paid_at is not null);' in v_def) > 0 then
    return;
  end if;

  if position(v_a1 in v_def) = 0
     or position(v_b1 in v_def) = 0
     or position(v_b2 in v_def) = 0 then
    raise exception 'detect_order_lifecycle_events() is not in the expected shape — refusing to rewrite';
  end if;

  v_new := replace(v_def, v_a1, 'if p_new.paid_at is not null then');
  v_new := replace(v_new, v_b1, 'was_paid := (p_old.paid_at is not null);');
  v_new := replace(v_new, v_b2, 'is_paid  := (p_new.paid_at is not null);');

  execute v_new;
end
$mig$;
