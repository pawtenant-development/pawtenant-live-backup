-- ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 §6 — renewal-path regression fix.
--
-- BUG FOUND BY THE §6 CONTROLLED REGRESSION
-- -----------------------------------------
-- `stripe-webhook` L1192 books an annual RENEWAL like this:
--
--     update orders set status='processing', price=<amt>, paid_at=now(),
--            payment_failed_at=null, payment_failure_reason=null
--      where id = <order>;
--
-- It deliberately does NOT change `payment_intent_id`. Two problems followed:
--
--   1. `orders_lifecycle_before_write` enforced paid_at immutability BEFORE
--      calling the detector, so by detection time NEW.paid_at had already been
--      reset to OLD.paid_at and the write looked like a no-op.
--   2. Even with the raw row, the detector's "additional payment" arm only
--      keyed on payment_intent_id / subscription_id changing.
--
-- Net effect: a renewal payment correctly preserved the first-paid date and
-- advanced last_payment_at, but produced NO lifecycle event and did NOT move
-- the order to the top of Admin Orders — the exact failure this task exists to
-- prevent, for the one payment path that reuses the same PaymentIntent row.
--
-- FIX
-- ---
--   A. Detect on the RAW incoming row, then enforce immutability.
--   B. Add a detector arm: already-paid AND incoming paid_at is LATER than the
--      stored paid_at  →  `additional_payment_received` at the incoming instant.
--
-- The idempotency key uses the incoming paid_at, so a replayed renewal webhook
-- (same instant) is deduped by the unique index. Ordering inside the trigger is
-- the only behavioural change; nothing else about the contract moves.
--
-- Idempotent + non-destructive.

-- ── A + B: detector sees the raw row and understands a paid_at advance ───────
create or replace function public.detect_order_lifecycle_events(
  p_old public.orders, p_new public.orders
) returns jsonb language plpgsql volatile as $fn$
declare
  ev jsonb := '[]'::jsonb;
  v_now timestamptz := clock_timestamp();
  was_paid boolean; is_paid boolean; had_prov boolean; has_prov boolean;
begin
  if p_old is null then
    ev := ev || jsonb_build_object('type','lead_created','at',coalesce(p_new.created_at, v_now),'key','insert');
    if p_new.payment_intent_id is not null or p_new.paid_at is not null then
      ev := ev || jsonb_build_object('type','payment_received',
        'at', coalesce(p_new.paid_at, p_new.created_at, v_now),
        'key', coalesce(p_new.payment_intent_id, 'insert'));
    end if;
    return ev;
  end if;

  was_paid := (p_old.payment_intent_id is not null or p_old.paid_at is not null);
  is_paid  := (p_new.payment_intent_id is not null or p_new.paid_at is not null);

  if (not was_paid) and is_paid then
    ev := ev || jsonb_build_object('type','payment_received',
      'at', coalesce(p_new.paid_at, v_now),
      'key', coalesce(p_new.payment_intent_id, to_char(v_now,'YYYYMMDDHH24MISSMS')));
  elsif was_paid and (
        p_old.payment_intent_id is distinct from p_new.payment_intent_id
     or p_old.subscription_id   is distinct from p_new.subscription_id
  ) and p_new.payment_intent_id is not null then
    -- New Stripe PaymentIntent / subscription on an already-paid order.
    ev := ev || jsonb_build_object('type','additional_payment_received','at', v_now,
      'key', coalesce(p_new.payment_intent_id, p_new.subscription_id, to_char(v_now,'YYYYMMDDHH24MISSMS')));
  elsif was_paid
        and p_old.paid_at is not null and p_new.paid_at is not null
        and p_new.paid_at > p_old.paid_at then
    -- SAME PaymentIntent row, LATER payment instant — the annual-renewal and
    -- retry/recovery shape. Keyed on the incoming instant so a replayed webhook
    -- collapses onto the same idempotency key.
    ev := ev || jsonb_build_object('type','additional_payment_received',
      'at', p_new.paid_at,
      'key', 'padv:' || to_char(p_new.paid_at,'YYYYMMDDHH24MISSMS'));
  end if;

  if p_old.official_letter_reopened_at is null and p_new.official_letter_reopened_at is not null then
    ev := ev || jsonb_build_object('type','order_reopened','at', p_new.official_letter_reopened_at,
      'key', 'olr:' || to_char(p_new.official_letter_reopened_at,'YYYYMMDDHH24MISSMS'));
  elsif p_old.doctor_status = 'patient_notified' and p_new.doctor_status is distinct from 'patient_notified' then
    ev := ev || jsonb_build_object('type','order_reopened','at', v_now,
      'key', 'wf:' || to_char(v_now,'YYYYMMDDHH24MISSMS'));
  end if;

  had_prov := (p_old.doctor_user_id is not null or p_old.doctor_email is not null);
  has_prov := (p_new.doctor_user_id is not null or p_new.doctor_email is not null);

  if (not had_prov) and has_prov then
    ev := ev || jsonb_build_object('type','provider_assigned','at', v_now,
      'key', 'prov:' || coalesce(p_new.doctor_user_id::text, p_new.doctor_email));
  elsif had_prov and has_prov and (
        p_old.doctor_user_id is distinct from p_new.doctor_user_id
     or p_old.doctor_email   is distinct from p_new.doctor_email
  ) then
    ev := ev || jsonb_build_object('type','provider_reassigned','at', v_now,
      'key', 'prov:' || coalesce(p_new.doctor_user_id::text, p_new.doctor_email) || ':' || to_char(v_now,'YYYYMMDDHH24MISSMS'));
  end if;

  if p_old.status is distinct from p_new.status and p_new.status = 'under-review' then
    ev := ev || jsonb_build_object('type','moved_under_review','at', v_now,
      'key', 'ur:' || to_char(v_now,'YYYYMMDDHH24MISSMS'));
  end if;

  if p_old.doctor_status is distinct from 'patient_notified' and p_new.doctor_status = 'patient_notified' then
    ev := ev || jsonb_build_object('type','provider_completed',
      'at', coalesce(p_new.patient_notification_sent_at, v_now),
      'key', 'pc:' || to_char(coalesce(p_new.patient_notification_sent_at, v_now),'YYYYMMDDHH24MISSMS'));
  end if;

  if p_old.patient_notification_sent_at is distinct from p_new.patient_notification_sent_at
     and p_new.patient_notification_sent_at is not null then
    ev := ev || jsonb_build_object('type','customer_notified','at', p_new.patient_notification_sent_at,
      'key', 'cn:' || to_char(p_new.patient_notification_sent_at,'YYYYMMDDHH24MISSMS'));
  end if;

  if p_old.customer_uploaded_additional_document_at is distinct from p_new.customer_uploaded_additional_document_at
     and p_new.customer_uploaded_additional_document_at is not null then
    ev := ev || jsonb_build_object('type','document_uploaded','at', p_new.customer_uploaded_additional_document_at,
      'key', 'du:' || to_char(p_new.customer_uploaded_additional_document_at,'YYYYMMDDHH24MISSMS'));
  end if;

  if (p_old.refunded_at is null and p_new.refunded_at is not null)
     or (p_old.refund_status is distinct from p_new.refund_status and p_new.refund_status in ('partial','full')) then
    ev := ev || jsonb_build_object('type','refund_completed','at', coalesce(p_new.refunded_at, v_now),
      'key', 'rf:' || coalesce(p_new.refund_status,'none') || ':' || to_char(coalesce(p_new.refunded_at, v_now),'YYYYMMDDHH24MISSMS'));
  end if;

  if p_old.status is distinct from 'cancelled' and p_new.status = 'cancelled' then
    ev := ev || jsonb_build_object('type','order_cancelled','at', v_now,
      'key', 'cx:' || to_char(v_now,'YYYYMMDDHH24MISSMS'));
  end if;

  return ev;
end;
$fn$;

-- ── A: detect BEFORE enforcing paid_at immutability ─────────────────────────
create or replace function public.orders_lifecycle_before_write()
returns trigger language plpgsql as $fn$
declare
  events       jsonb;
  e            jsonb;
  best_at      timestamptz;  -- NEWEST instant across the events in THIS write
  best_type    text;         -- most business-SIGNIFICANT event in THIS write
  best_rank    integer := -1;
  best_type_at timestamptz;
  ev_at        timestamptz;
  ev_type      text;
  ev_rank      integer;
begin
  if TG_OP = 'INSERT' then
    events := public.detect_order_lifecycle_events(null, NEW);
    if NEW.paid_at is not null then
      NEW.last_payment_at := greatest(coalesce(NEW.last_payment_at, NEW.paid_at), NEW.paid_at);
    end if;
  else
    -- ORDER MATTERS: detect on the RAW incoming row first. Enforcing paid_at
    -- immutability before this point erased the only evidence that an annual
    -- renewal had happened (it reuses the same payment_intent_id).
    events := public.detect_order_lifecycle_events(OLD, NEW);

    -- paid_at is the IMMUTABLE first-paid timestamp. A renewal / upgrade /
    -- replayed webhook must never rewrite acquisition history; the incoming
    -- value is preserved as last_payment_at instead. Escape hatch for genuine
    -- corrections: admin_correct_order_first_paid_at().
    if OLD.paid_at is not null
       and NEW.paid_at is distinct from OLD.paid_at
       and coalesce(current_setting('app.allow_first_paid_override', true), 'off') <> 'on' then
      if NEW.paid_at is not null then
        NEW.last_payment_at := greatest(coalesce(NEW.last_payment_at, NEW.paid_at), NEW.paid_at);
      end if;
      NEW.paid_at := OLD.paid_at;
    end if;
  end if;

  if events is null or jsonb_array_length(events) = 0 then
    return NEW;
  end if;

  for e in select * from jsonb_array_elements(events) loop
    ev_type := e->>'type';
    ev_at   := (e->>'at')::timestamptz;
    ev_rank := public.order_lifecycle_event_rank(ev_type);

    if ev_type = 'payment_received' then
      NEW.paid_at         := coalesce(NEW.paid_at, ev_at);
      NEW.last_payment_at := greatest(coalesce(NEW.last_payment_at, ev_at), ev_at);
    elsif ev_type = 'additional_payment_received' then
      NEW.last_payment_at := greatest(coalesce(NEW.last_payment_at, ev_at), ev_at);
    elsif ev_type = 'order_reopened' then
      NEW.last_reopened_at := ev_at;
    elsif ev_type in ('provider_completed','customer_notified') then
      NEW.first_completed_at := coalesce(NEW.first_completed_at, ev_at);
      NEW.last_completed_at  := greatest(coalesce(NEW.last_completed_at, ev_at), ev_at);
    end if;

    -- Sort INSTANT = the newest instant in this write.
    if best_at is null or ev_at > best_at then best_at := ev_at; end if;

    -- Activity LABEL = the most business-significant event in this write.
    if ev_rank > best_rank or (ev_rank = best_rank and ev_at > best_type_at) then
      best_rank := ev_rank; best_type := ev_type; best_type_at := ev_at;
    end if;
  end loop;

  if best_at is not null then
    if NEW.last_meaningful_activity_at is null or best_at >= NEW.last_meaningful_activity_at then
      NEW.last_meaningful_activity_at   := best_at;
      NEW.last_meaningful_activity_type := best_type;
    end if;
  end if;

  return NEW;
end;
$fn$;
