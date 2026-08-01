-- MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-LIVE-ROLLOUT-001 §A/§C
-- Lifecycle EVENT timestamps as first-class order columns + range-event KPIs.
-- LIVE port of TEST 20260801150000 — built from LIVE's CURRENT function bodies
-- (which carry a pinned search_path and comments TEST lacks) + ONLY the task's
-- additions. NOT a blind copy of the TEST file.
--
-- Adds:
--   orders.last_under_review_entered_at / last_pending_delivery_entered_at /
--   orders.last_cancelled_at — trigger-maintained; backfilled from
--   order_status_logs (dense since 2026-03-30). Rows with no logged transition
--   stay NULL: that gap is REPORTED, never invented (no speculative repair).
--   New 'entered_pending_delivery' lifecycle event + CHECK-whitelist widening
--   (the after-write insert is silently swallowed otherwise — proven on TEST).
--   get_admin_orders_range_event_kpis(p_from, p_to): period-event KPI counts
--   for a custom range in America/New_York (DST-safe via make_timestamptz),
--   archived rows excluded so every card reconciles with its list view.

-- 1 ── columns ---------------------------------------------------------------
alter table public.orders
  add column if not exists last_under_review_entered_at     timestamptz,
  add column if not exists last_pending_delivery_entered_at timestamptz,
  add column if not exists last_cancelled_at                timestamptz;

comment on column public.orders.last_under_review_entered_at is
  'Most recent instant the order entered the under-review workflow (provider assigned or status moved to under-review). Trigger-maintained since 2026-08-01; backfilled from order_status_logs. NULL = event never observed.';
comment on column public.orders.last_pending_delivery_entered_at is
  'Most recent instant doctor_status became pending_admin_approval (entered Pending Delivery). Trigger-maintained since 2026-08-01; backfilled from order_status_logs. NULL = event never observed.';
comment on column public.orders.last_cancelled_at is
  'Most recent instant status became cancelled. Trigger-maintained since 2026-08-01; backfilled from order_status_logs. NULL = event never observed (legacy cancellations have no usable timestamp).';

-- 2 ── event-type whitelist ---------------------------------------------------
alter table public.order_lifecycle_events
  drop constraint if exists order_lifecycle_events_event_type_check;
alter table public.order_lifecycle_events
  add constraint order_lifecycle_events_event_type_check
  check (event_type = any (array[
    'lead_created','payment_received','additional_payment_received',
    'order_reopened','document_uploaded','provider_assigned',
    'provider_reassigned','moved_under_review','entered_pending_delivery',
    'provider_completed','customer_notified','refund_completed','order_cancelled'
  ]));

-- 3 ── event detection (LIVE body + the entered_pending_delivery arm) ---------
create or replace function public.detect_order_lifecycle_events(p_old orders, p_new orders)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
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

  -- MONTH-END-...-LIVE-ROLLOUT-001: Entered Pending Delivery — provider
  -- finished, letter awaiting admin approval. Previously produced NO event,
  -- which is why the workflow state had no entry timestamp anywhere but
  -- order_status_logs.
  if p_old.doctor_status is distinct from 'pending_admin_approval' and p_new.doctor_status = 'pending_admin_approval' then
    ev := ev || jsonb_build_object('type','entered_pending_delivery','at', v_now,
      'key', 'pd:' || to_char(v_now,'YYYYMMDDHH24MISSMS'));
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
$function$;

-- 4 ── rank (LIVE body + the new event) ----------------------------------------
create or replace function public.order_lifecycle_event_rank(p_event_type text)
 returns integer
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case p_event_type
    when 'payment_received'             then 100
    when 'additional_payment_received'  then 95
    when 'order_reopened'               then 90
    when 'refund_completed'             then 85
    when 'order_cancelled'              then 84
    when 'customer_notified'            then 80
    when 'provider_completed'           then 75
    when 'entered_pending_delivery'     then 72
    when 'document_uploaded'            then 70
    when 'provider_reassigned'          then 65
    when 'provider_assigned'            then 60
    when 'moved_under_review'           then 55
    when 'lead_created'                 then 10
    else 0
  end;
$function$;

-- 5 ── column maintenance (LIVE body + three new arms) -------------------------
create or replace function public.orders_lifecycle_before_write()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  events       jsonb;
  e            jsonb;
  best_at      timestamptz;
  best_type    text;
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
    -- immutability before this point erases the only evidence that an annual
    -- renewal happened (it reuses the same payment_intent_id).
    events := public.detect_order_lifecycle_events(OLD, NEW);

    if OLD.paid_at is not null
       and NEW.paid_at is distinct from OLD.paid_at
       and coalesce(current_setting('app.allow_first_paid_override', true), 'off') <> 'on' then
      if NEW.paid_at is not null then
        NEW.last_payment_at := greatest(coalesce(NEW.last_payment_at, NEW.paid_at), NEW.paid_at);
      end if;
      NEW.paid_at := OLD.paid_at;
    end if;
  end if;

  -- Hand the decision to the AFTER trigger verbatim (transaction-local).
  perform set_config('app.lce_' || replace(NEW.id::text, '-', ''), coalesce(events::text, '[]'), true);

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
    elsif ev_type in ('provider_assigned','moved_under_review') then
      NEW.last_under_review_entered_at := greatest(coalesce(NEW.last_under_review_entered_at, ev_at), ev_at);
    elsif ev_type = 'entered_pending_delivery' then
      NEW.last_pending_delivery_entered_at := greatest(coalesce(NEW.last_pending_delivery_entered_at, ev_at), ev_at);
    elsif ev_type = 'order_cancelled' then
      NEW.last_cancelled_at := greatest(coalesce(NEW.last_cancelled_at, ev_at), ev_at);
    end if;

    if best_at is null or ev_at > best_at then best_at := ev_at; end if;

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
$function$;

-- 6 ── backfill from order_status_logs (NULL-guarded, idempotent) --------------
-- Derived from authoritative logged transitions only — not speculative repair.
update public.orders o
   set last_under_review_entered_at = e.entered_at
  from (
    select order_id, max(changed_at) as entered_at
      from public.order_status_logs
     where order_id is not null
       and (new_doctor_status in ('pending_review','in_review') or new_status = 'under-review')
     group by order_id
  ) e
 where e.order_id = o.id
   and o.last_under_review_entered_at is null;

update public.orders o
   set last_under_review_entered_at = e.entered_at
  from (
    select order_id, max(occurred_at) as entered_at
      from public.order_lifecycle_events
     where event_type in ('provider_assigned','moved_under_review')
     group by order_id
  ) e
 where e.order_id = o.id
   and o.last_under_review_entered_at is null;

update public.orders o
   set last_pending_delivery_entered_at = e.entered_at
  from (
    select order_id, max(changed_at) as entered_at
      from public.order_status_logs
     where order_id is not null
       and new_doctor_status = 'pending_admin_approval'
     group by order_id
  ) e
 where e.order_id = o.id
   and o.last_pending_delivery_entered_at is null;

update public.orders o
   set last_cancelled_at = e.cancelled_at
  from (
    select order_id, max(changed_at) as cancelled_at
      from public.order_status_logs
     where order_id is not null
       and new_status = 'cancelled'
     group by order_id
  ) e
 where e.order_id = o.id
   and o.last_cancelled_at is null;

-- 7 ── range-event KPI RPC ------------------------------------------------------
create or replace function public.get_admin_orders_range_event_kpis(p_from text default null, p_to text default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_tz constant text := 'America/New_York';
  v_ps timestamptz := null;
  v_pe timestamptz := null;
  v_leads integer; v_paid integer; v_ur integer; v_pd integer; v_done integer;
begin
  if not public.check_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_from is not null and p_from ~ '^\d{4}-\d{2}-\d{2}$' then
    v_ps := make_timestamptz(
      split_part(p_from,'-',1)::int, split_part(p_from,'-',2)::int, split_part(p_from,'-',3)::int,
      0, 0, 0, v_tz);
  end if;
  if p_to is not null and p_to ~ '^\d{4}-\d{2}-\d{2}$' then
    v_pe := make_timestamptz(
      extract(year  from (p_to::date + 1))::int,
      extract(month from (p_to::date + 1))::int,
      extract(day   from (p_to::date + 1))::int,
      0, 0, 0, v_tz);
  end if;

  -- Archived rows are hidden from the list everywhere but the Archived tab, so
  -- they are excluded here too — a card must equal its reconciling list view.
  select count(*) into v_leads from public.orders o
   where o.status <> 'archived'
     and (v_ps is null or o.created_at >= v_ps) and (v_pe is null or o.created_at < v_pe);

  select count(*) into v_paid from public.orders o
   where o.paid_at is not null and o.status <> 'archived'
     and (v_ps is null or o.paid_at >= v_ps) and (v_pe is null or o.paid_at < v_pe);

  select count(*) into v_ur from public.orders o
   where o.last_under_review_entered_at is not null and o.status <> 'archived'
     and (v_ps is null or o.last_under_review_entered_at >= v_ps)
     and (v_pe is null or o.last_under_review_entered_at < v_pe);

  select count(*) into v_pd from public.orders o
   where o.last_pending_delivery_entered_at is not null and o.status <> 'archived'
     and (v_ps is null or o.last_pending_delivery_entered_at >= v_ps)
     and (v_pe is null or o.last_pending_delivery_entered_at < v_pe);

  select count(*) into v_done from public.orders o
   where o.last_completed_at is not null and o.status <> 'archived'
     and (v_ps is null or o.last_completed_at >= v_ps)
     and (v_pe is null or o.last_completed_at < v_pe);

  return jsonb_build_object(
    'timezone',               v_tz,
    'periodStart',            v_ps,
    'periodEndExclusive',     v_pe,
    'from',                   p_from,
    'to',                     p_to,
    'leadsCreated',           v_leads,
    'ordersPaid',             v_paid,
    'enteredUnderReview',     v_ur,
    'enteredPendingDelivery', v_pd,
    'completed',              v_done
  );
end;
$function$;

comment on function public.get_admin_orders_range_event_kpis(text, text) is
  'MONTH-END-...-LIVE-ROLLOUT-001: event-based Admin Orders KPI counts for a custom date range, interpreted in America/New_York (DST-safe). Each count keys on the authoritative lifecycle event timestamp column and reconciles with the Admin Orders list filtered to the same Date Basis with status=All. Admin-gated; anon holds no EXECUTE.';

revoke all on function public.get_admin_orders_range_event_kpis(text, text) from public, anon;
grant execute on function public.get_admin_orders_range_event_kpis(text, text) to authenticated, service_role;
