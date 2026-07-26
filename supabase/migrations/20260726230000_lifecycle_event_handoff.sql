-- ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 §6 — BEFORE→AFTER event hand-off.
--
-- SECOND HALF OF THE RENEWAL BUG
-- ------------------------------
-- `20260726130000` fixed the BEFORE trigger so an annual renewal (same
-- payment_intent_id, later paid_at) is detected. But the AFTER trigger — the one
-- that writes `order_lifecycle_events` — called the detector a SECOND time, and
-- by then the BEFORE trigger had already reset NEW.paid_at to OLD.paid_at to
-- enforce immutability. So the AFTER pass saw no change and wrote no event:
-- the order moved to the top with the right label but had no audit row.
--
-- Re-deriving the same conclusion twice from two different views of the row was
-- the design flaw. The BEFORE trigger is the single decision point; the AFTER
-- trigger now consumes EXACTLY what it decided.
--
-- MECHANISM
-- ---------
-- The BEFORE trigger stashes its computed event array in a transaction-local
-- GUC keyed by order id (`app.lce_<hex uuid>`); the AFTER trigger reads it and
-- immediately clears it. Transaction-local (`set_config(..., true)`) so nothing
-- leaks between transactions, and per-row because Postgres queues AFTER ROW
-- triggers to the END of the statement — a single shared key would be
-- overwritten by later rows in a multi-row UPDATE before any AFTER pass ran.
--
-- Side benefit: the add-on path can no longer double-write. Previously a
-- re-detecting AFTER trigger would have seen `last_payment_at` advance (written
-- by addon_request_paid_lifecycle) and emitted a second, redundant
-- `additional_payment_received` alongside the add-on's own event row.
--
-- Idempotent + non-destructive.

create or replace function public.orders_lifecycle_before_write()
returns trigger language plpgsql as $fn$
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
$fn$;

create or replace function public.orders_lifecycle_after_write()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare
  key    text := 'app.lce_' || replace(NEW.id::text, '-', '');
  raw    text;
  events jsonb;
  e      jsonb;
begin
  -- Consume the BEFORE trigger's decision. Never re-derive it: after paid_at
  -- immutability has been enforced the row no longer carries the evidence.
  raw := current_setting(key, true);
  perform set_config(key, '', true);   -- clear so a later statement cannot replay it

  if raw is null or raw = '' then
    return null;
  end if;

  begin
    events := raw::jsonb;
  exception when others then
    return null;
  end;

  if events is null or jsonb_array_length(events) = 0 then
    return null;
  end if;

  for e in select * from jsonb_array_elements(events) loop
    begin
      insert into public.order_lifecycle_events
        (order_id, confirmation_id, event_type, occurred_at, source, actor_type, idempotency_key, metadata)
      values (
        NEW.id, NEW.confirmation_id, e->>'type', (e->>'at')::timestamptz,
        'db_trigger', 'system',
        NEW.id::text || ':' || (e->>'type') || ':' || coalesce(e->>'key',''),
        jsonb_build_object(
          'payment_state',  public.order_payment_state(NEW),
          'workflow_state', public.order_workflow_state(NEW)
        )
      )
      on conflict (idempotency_key) do nothing;
    exception when others then
      -- Event history is observability; it must never break an order write.
      null;
    end;
  end loop;

  return null;
end;
$fn$;
