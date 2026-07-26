-- ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001
--
-- Durable lifecycle-date semantics for Admin Orders.
--
-- PROBLEM
-- -------
-- The Admin Orders list sorts by `created_at`. A lead created in June that pays
-- in July stays buried in June, so the operator never sees the payment. There is
-- also no immutable first-paid timestamp (`paid_at` is OVERWRITTEN by the annual
-- renewal branch of stripe-webhook), no first/last completion split for orders
-- that reopen under the 30-day state rule, and no single field that means
-- "latest real business activity".
--
-- CONTRACT ESTABLISHED HERE
-- -------------------------
--   orders.created_at                    IMMUTABLE  lead/order record created
--   orders.paid_at                       IMMUTABLE  FIRST successful payment (canonical
--                                                   first-paid — reused, not duplicated;
--                                                   now enforced set-once by trigger)
--   orders.last_payment_at               MUTABLE    latest successful payment (incl. add-ons,
--                                                   upgrades, renewals)
--   orders.first_completed_at            IMMUTABLE  first fulfilment (letter delivered)
--   orders.last_completed_at             MUTABLE    latest fulfilment (reissue / reopen cycle)
--   orders.last_reopened_at              MUTABLE    latest genuine workflow reopening
--   orders.last_meaningful_activity_at   MUTABLE    DEFAULT ADMIN ORDERS SORT KEY
--   orders.last_meaningful_activity_type MUTABLE    which business event set it
--
-- `orders` has NO `updated_at` column, and this migration deliberately does not
-- add one: activity is derived from BUSINESS COLUMN TRANSITIONS only. Background
-- writes (google_ads_*, meta_*, ghl_*, email_log, seq_*, attribution, upload
-- status, read markers) change no column this trigger inspects, so they can never
-- move an order to the top of the list. That is the guarantee, by construction —
-- not by convention.
--
-- Payment state and workflow state stay SEPARATE dimensions. Nothing here
-- overloads `orders.status`, and no existing status/refund/classification
-- contract is modified.
--
-- Idempotent + non-destructive. Safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Canonical lifecycle columns
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists last_payment_at               timestamptz,
  add column if not exists first_completed_at            timestamptz,
  add column if not exists last_completed_at             timestamptz,
  add column if not exists last_reopened_at              timestamptz,
  add column if not exists last_meaningful_activity_at   timestamptz,
  add column if not exists last_meaningful_activity_type text;

comment on column public.orders.paid_at is
  'ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001: canonical FIRST successful payment. '
  'Immutable once set (enforced by orders_lifecycle_before_write). Use last_payment_at '
  'for the most recent payment. Unique paid-order reporting keys on THIS column.';
comment on column public.orders.last_payment_at is
  'Latest successful payment linked to this order (add-on, upgrade, renewal). '
  'Never replaces paid_at. Revenue is still reported from actual transactions.';
comment on column public.orders.first_completed_at is
  'First fulfilment (letter delivered to customer). Immutable — a 30-day reopen '
  'never erases the original completion.';
comment on column public.orders.last_completed_at is
  'Latest fulfilment. Updates on a reissue/reopen completion.';
comment on column public.orders.last_reopened_at is
  'Latest genuine workflow reopening. Creates NO revenue and never alters paid_at.';
comment on column public.orders.last_meaningful_activity_at is
  'DEFAULT Admin Orders sort key. Set ONLY by a real business event (see '
  'order_lifecycle_events.event_type). Background/metadata writes never touch it.';
comment on column public.orders.last_meaningful_activity_type is
  'The order_lifecycle_events.event_type that produced last_meaningful_activity_at.';

-- Sort index for the default Admin Orders ordering.
create index if not exists orders_last_meaningful_activity_idx
  on public.orders (last_meaningful_activity_at desc nulls last, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Durable lifecycle event history
-- ═══════════════════════════════════════════════════════════════════════════
-- Existing ledgers are all PARTIAL and none is a unified activity feed:
--   • order_status_logs  — status/doctor_status transitions only (kept, untouched)
--   • payment_attempts   — Stripe payment attempts only (kept, untouched)
--   • audit_logs         — admin/system actions, free-text action strings (kept)
-- None carries an idempotency key or a server-controlled event vocabulary, so a
-- narrow lifecycle table is added rather than overloading any of them.
-- No customer PII is stored in metadata.

create table if not exists public.order_lifecycle_events (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  confirmation_id  text,
  event_type       text not null,
  occurred_at      timestamptz not null default now(),
  source           text not null default 'db_trigger',
  actor_type       text not null default 'system',
  actor_id         uuid,
  idempotency_key  text not null,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

-- Server-controlled event vocabulary. Adding a type is a deliberate migration.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_lifecycle_events_event_type_check'
      and conrelid = 'public.order_lifecycle_events'::regclass
  ) then
    alter table public.order_lifecycle_events
      add constraint order_lifecycle_events_event_type_check
      check (event_type in (
        'lead_created',
        'payment_received',
        'additional_payment_received',
        'order_reopened',
        'document_uploaded',
        'provider_assigned',
        'provider_reassigned',
        'moved_under_review',
        'provider_completed',
        'customer_notified',
        'refund_completed',
        'order_cancelled'
      ));
  end if;
end $$;

create unique index if not exists order_lifecycle_events_idempotency_key_idx
  on public.order_lifecycle_events (idempotency_key);
create index if not exists order_lifecycle_events_order_occurred_idx
  on public.order_lifecycle_events (order_id, occurred_at desc);
create index if not exists order_lifecycle_events_type_occurred_idx
  on public.order_lifecycle_events (event_type, occurred_at desc);

alter table public.order_lifecycle_events enable row level security;

-- Read contract MIRRORS order_status_logs — the established order-history contract.
drop policy if exists service_role_all_lifecycle_events on public.order_lifecycle_events;
create policy service_role_all_lifecycle_events on public.order_lifecycle_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists admins_select_lifecycle_events on public.order_lifecycle_events;
create policy admins_select_lifecycle_events on public.order_lifecycle_events
  for select using (public.check_is_admin());

drop policy if exists providers_select_assigned_lifecycle_events on public.order_lifecycle_events;
create policy providers_select_assigned_lifecycle_events on public.order_lifecycle_events
  for select using (exists (
    select 1 from public.orders o
    where o.id = order_lifecycle_events.order_id and o.doctor_user_id = auth.uid()
  ));

drop policy if exists customers_select_own_lifecycle_events on public.order_lifecycle_events;
create policy customers_select_own_lifecycle_events on public.order_lifecycle_events
  for select using (exists (
    select 1 from public.orders o
    where o.id = order_lifecycle_events.order_id and o.user_id = auth.uid()
  ));

-- No INSERT/UPDATE/DELETE policy for authenticated/anon: writes are trigger-owned
-- (SECURITY DEFINER) or service_role. Event history is append-only in practice.

grant select on public.order_lifecycle_events to authenticated;
grant all    on public.order_lifecycle_events to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Meaningful-activity ranking
-- ═══════════════════════════════════════════════════════════════════════════
-- When several events land in one write, this decides which one names the
-- denormalized latest activity. Higher wins.

create or replace function public.order_lifecycle_event_rank(p_event_type text)
returns integer
language sql
immutable
as $$
  select case p_event_type
    when 'payment_received'             then 100
    when 'additional_payment_received'  then 95
    when 'order_reopened'               then 90
    when 'refund_completed'             then 85
    when 'order_cancelled'              then 84
    when 'customer_notified'            then 80
    when 'provider_completed'           then 75
    when 'document_uploaded'            then 70
    when 'provider_reassigned'          then 65
    when 'provider_assigned'            then 60
    when 'moved_under_review'           then 55
    when 'lead_created'                 then 10
    else 0
  end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Transition detection — the MEANINGFUL ACTIVITY CONTRACT in code
-- ═══════════════════════════════════════════════════════════════════════════
-- Returns a jsonb array of {type, at, key_part} for the business transitions
-- between two order rows. p_old IS NULL means INSERT.
--
-- ONLY these columns are inspected:
--   payment_intent_id, paid_at, subscription_id,
--   doctor_user_id, doctor_email, doctor_status, status,
--   patient_notification_sent_at, official_letter_reopened_at,
--   customer_uploaded_additional_document_at, refunded_at, refund_status
--
-- Everything else on `orders` is invisible here — which is exactly why an
-- attribution enrichment, a Google Ads upload-status write, a GHL sync stamp, an
-- email-delivery marker, a cron heartbeat or a metadata normalisation can never
-- move an order to the top of Admin Orders.

create or replace function public.detect_order_lifecycle_events(
  p_old public.orders,
  p_new public.orders
) returns jsonb
language plpgsql
volatile
as $$
declare
  ev        jsonb := '[]'::jsonb;
  -- clock_timestamp(), NOT now(): now() is the TRANSACTION start instant, so two
  -- business writes inside one transaction would carry identical stamps and the
  -- "never move backwards" guard below would silently drop the second one.
  v_now     timestamptz := clock_timestamp();
  was_paid  boolean;
  is_paid   boolean;
  had_prov  boolean;
  has_prov  boolean;
begin
  -- ── INSERT ───────────────────────────────────────────────────────────────
  if p_old is null then
    ev := ev || jsonb_build_object(
      'type', 'lead_created',
      'at',   coalesce(p_new.created_at, v_now),
      'key',  'insert');
    -- An order created already-paid (legacy import, admin-created paid order)
    -- also records its payment.
    if p_new.payment_intent_id is not null or p_new.paid_at is not null then
      ev := ev || jsonb_build_object(
        'type', 'payment_received',
        'at',   coalesce(p_new.paid_at, p_new.created_at, v_now),
        'key',  coalesce(p_new.payment_intent_id, 'insert'));
    end if;
    return ev;
  end if;

  -- ── PAYMENT ──────────────────────────────────────────────────────────────
  was_paid := (p_old.payment_intent_id is not null or p_old.paid_at is not null);
  is_paid  := (p_new.payment_intent_id is not null or p_new.paid_at is not null);

  if (not was_paid) and is_paid then
    ev := ev || jsonb_build_object(
      'type', 'payment_received',
      'at',   coalesce(p_new.paid_at, v_now),
      'key',  coalesce(p_new.payment_intent_id, to_char(v_now, 'YYYYMMDDHH24MISSMS')));
  elsif was_paid and (
        p_old.payment_intent_id is distinct from p_new.payment_intent_id
     or p_old.subscription_id   is distinct from p_new.subscription_id
  ) and p_new.payment_intent_id is not null then
    -- Already paid, a NEW Stripe payment landed on the same order row
    -- (renewal / upgrade). Never a second "paid order".
    ev := ev || jsonb_build_object(
      'type', 'additional_payment_received',
      'at',   v_now,
      'key',  coalesce(p_new.payment_intent_id, p_new.subscription_id, to_char(v_now, 'YYYYMMDDHH24MISSMS')));
  end if;

  -- ── REOPEN ───────────────────────────────────────────────────────────────
  -- 30-day / state-rule reopen.
  if p_old.official_letter_reopened_at is null
     and p_new.official_letter_reopened_at is not null then
    ev := ev || jsonb_build_object(
      'type', 'order_reopened',
      'at',   p_new.official_letter_reopened_at,
      'key',  'olr:' || to_char(p_new.official_letter_reopened_at, 'YYYYMMDDHH24MISSMS'));
  -- Generic workflow reopen: a completed order leaves the completed state.
  elsif p_old.doctor_status = 'patient_notified'
        and p_new.doctor_status is distinct from 'patient_notified' then
    ev := ev || jsonb_build_object(
      'type', 'order_reopened',
      'at',   v_now,
      'key',  'wf:' || to_char(v_now, 'YYYYMMDDHH24MISSMS'));
  end if;

  -- ── PROVIDER ASSIGNMENT ──────────────────────────────────────────────────
  had_prov := (p_old.doctor_user_id is not null or p_old.doctor_email is not null);
  has_prov := (p_new.doctor_user_id is not null or p_new.doctor_email is not null);

  if (not had_prov) and has_prov then
    ev := ev || jsonb_build_object(
      'type', 'provider_assigned',
      'at',   v_now,
      'key',  'prov:' || coalesce(p_new.doctor_user_id::text, p_new.doctor_email));
  elsif had_prov and has_prov and (
        p_old.doctor_user_id is distinct from p_new.doctor_user_id
     or p_old.doctor_email   is distinct from p_new.doctor_email
  ) then
    ev := ev || jsonb_build_object(
      'type', 'provider_reassigned',
      'at',   v_now,
      'key',  'prov:' || coalesce(p_new.doctor_user_id::text, p_new.doctor_email)
                      || ':' || to_char(v_now, 'YYYYMMDDHH24MISSMS'));
  end if;

  -- ── MOVED UNDER REVIEW ───────────────────────────────────────────────────
  if p_old.status is distinct from p_new.status and p_new.status = 'under-review' then
    ev := ev || jsonb_build_object(
      'type', 'moved_under_review',
      'at',   v_now,
      'key',  'ur:' || to_char(v_now, 'YYYYMMDDHH24MISSMS'));
  end if;

  -- ── COMPLETION ───────────────────────────────────────────────────────────
  if p_old.doctor_status is distinct from 'patient_notified'
     and p_new.doctor_status = 'patient_notified' then
    ev := ev || jsonb_build_object(
      'type', 'provider_completed',
      'at',   coalesce(p_new.patient_notification_sent_at, v_now),
      'key',  'pc:' || to_char(coalesce(p_new.patient_notification_sent_at, v_now), 'YYYYMMDDHH24MISSMS'));
  end if;

  if p_old.patient_notification_sent_at is distinct from p_new.patient_notification_sent_at
     and p_new.patient_notification_sent_at is not null then
    ev := ev || jsonb_build_object(
      'type', 'customer_notified',
      'at',   p_new.patient_notification_sent_at,
      'key',  'cn:' || to_char(p_new.patient_notification_sent_at, 'YYYYMMDDHH24MISSMS'));
  end if;

  -- ── CUSTOMER DOCUMENT UPLOAD ─────────────────────────────────────────────
  if p_old.customer_uploaded_additional_document_at
       is distinct from p_new.customer_uploaded_additional_document_at
     and p_new.customer_uploaded_additional_document_at is not null then
    ev := ev || jsonb_build_object(
      'type', 'document_uploaded',
      'at',   p_new.customer_uploaded_additional_document_at,
      'key',  'du:' || to_char(p_new.customer_uploaded_additional_document_at, 'YYYYMMDDHH24MISSMS'));
  end if;

  -- ── REFUND ───────────────────────────────────────────────────────────────
  if (p_old.refunded_at is null and p_new.refunded_at is not null)
     or (p_old.refund_status is distinct from p_new.refund_status
         and p_new.refund_status in ('partial', 'full')) then
    ev := ev || jsonb_build_object(
      'type', 'refund_completed',
      'at',   coalesce(p_new.refunded_at, v_now),
      'key',  'rf:' || coalesce(p_new.refund_status, 'none')
                    || ':' || to_char(coalesce(p_new.refunded_at, v_now), 'YYYYMMDDHH24MISSMS'));
  end if;

  -- ── CANCELLATION ─────────────────────────────────────────────────────────
  if p_old.status is distinct from 'cancelled' and p_new.status = 'cancelled' then
    ev := ev || jsonb_build_object(
      'type', 'order_cancelled',
      'at',   v_now,
      'key',  'cx:' || to_char(v_now, 'YYYYMMDDHH24MISSMS'));
  end if;

  return ev;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. BEFORE trigger — immutability + denormalized latest activity
-- ═══════════════════════════════════════════════════════════════════════════
-- Runs in the same row write, so there is no recursive UPDATE on orders.

create or replace function public.orders_lifecycle_before_write()
returns trigger
language plpgsql
as $$
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
    -- ── paid_at is the IMMUTABLE first-paid timestamp ──────────────────────
    -- A renewal / upgrade / replayed webhook must never rewrite acquisition
    -- history. The incoming value is preserved as last_payment_at instead.
    -- Escape hatch for genuine corrections: admin_correct_order_first_paid_at().
    if OLD.paid_at is not null
       and NEW.paid_at is distinct from OLD.paid_at
       and coalesce(current_setting('app.allow_first_paid_override', true), 'off') <> 'on' then
      if NEW.paid_at is not null then
        NEW.last_payment_at := greatest(coalesce(NEW.last_payment_at, NEW.paid_at), NEW.paid_at);
      end if;
      NEW.paid_at := OLD.paid_at;
    end if;

    events := public.detect_order_lifecycle_events(OLD, NEW);
  end if;

  if events is null or jsonb_array_length(events) = 0 then
    return NEW;
  end if;

  for e in select * from jsonb_array_elements(events) loop
    ev_type := e->>'type';
    ev_at   := (e->>'at')::timestamptz;
    ev_rank := public.order_lifecycle_event_rank(ev_type);

    -- Canonical per-concept timestamps.
    if ev_type = 'payment_received' then
      NEW.paid_at         := coalesce(NEW.paid_at, ev_at);
      NEW.last_payment_at := greatest(coalesce(NEW.last_payment_at, ev_at), ev_at);
    elsif ev_type = 'additional_payment_received' then
      NEW.last_payment_at := greatest(coalesce(NEW.last_payment_at, ev_at), ev_at);
    elsif ev_type = 'order_reopened' then
      NEW.last_reopened_at := ev_at;
    elsif ev_type in ('provider_completed', 'customer_notified') then
      NEW.first_completed_at := coalesce(NEW.first_completed_at, ev_at);
      NEW.last_completed_at  := greatest(coalesce(NEW.last_completed_at, ev_at), ev_at);
    end if;

    -- Sort INSTANT = the newest instant in this write.
    if best_at is null or ev_at > best_at then best_at := ev_at; end if;

    -- Activity LABEL = the most business-significant event in this write.
    -- Events written together are simultaneous, so significance decides — a
    -- 30-day reopen is never labelled "Moved under review" just because the
    -- consequential status write landed a microsecond later.
    if ev_rank > best_rank or (ev_rank = best_rank and ev_at > best_type_at) then
      best_rank := ev_rank; best_type := ev_type; best_type_at := ev_at;
    end if;
  end loop;

  if best_at is not null then
    -- Never move activity BACKWARDS (a late-delivered webhook cannot un-promote
    -- an order that has since moved on).
    if NEW.last_meaningful_activity_at is null or best_at >= NEW.last_meaningful_activity_at then
      NEW.last_meaningful_activity_at   := best_at;
      NEW.last_meaningful_activity_type := best_type;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists orders_lifecycle_before_write on public.orders;
create trigger orders_lifecycle_before_write
  before insert or update on public.orders
  for each row execute function public.orders_lifecycle_before_write();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Payment state vs workflow state — SEPARATE dimensions
-- ═══════════════════════════════════════════════════════════════════════════
-- Mirrors src/lib/orderClassification.ts. `orders.status` is NOT overloaded and
-- is not changed by these functions — they only DERIVE. An order can validly be
-- payment=paid + workflow=reopened at the same time.

create or replace function public.order_payment_state(o public.orders)
returns text
language sql
immutable
as $$
  select case
    when o.dispute_id is not null or o.status = 'disputed'                       then 'disputed'
    when o.refund_status = 'full' or o.status = 'refunded'                       then 'fully_refunded'
    when o.refund_status = 'partial'                                             then 'partially_refunded'
    when o.payment_intent_id is not null or o.paid_at is not null                then 'paid'
    when o.payment_failure_reason is not null or o.payment_failed_at is not null then 'failed'
    else 'unpaid'
  end;
$$;

create or replace function public.order_workflow_state(o public.orders)
returns text
language sql
immutable
as $$
  select case
    when o.status = 'cancelled'                                                    then 'cancelled'
    when o.payment_intent_id is null or o.status = 'lead'                          then 'lead'
    when o.doctor_status = 'patient_notified'                                      then 'completed'
    when o.official_letter_reopened_at is not null
         and o.official_letter_final_completed_at is null                          then 'reopened'
    when o.doctor_user_id is not null or o.doctor_email is not null                then 'under_review'
    else 'paid_unassigned'
  end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. AFTER trigger — append durable event history (idempotent)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.orders_lifecycle_after_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  events jsonb;
  e      jsonb;
begin
  if TG_OP = 'INSERT' then
    events := public.detect_order_lifecycle_events(null, NEW);
  else
    events := public.detect_order_lifecycle_events(OLD, NEW);
  end if;

  if events is null or jsonb_array_length(events) = 0 then
    return null;
  end if;

  for e in select * from jsonb_array_elements(events) loop
    begin
      insert into public.order_lifecycle_events
        (order_id, confirmation_id, event_type, occurred_at, source, actor_type, idempotency_key, metadata)
      values (
        NEW.id,
        NEW.confirmation_id,
        e->>'type',
        (e->>'at')::timestamptz,
        'db_trigger',
        'system',
        NEW.id::text || ':' || (e->>'type') || ':' || coalesce(e->>'key', ''),
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
$$;

drop trigger if exists orders_lifecycle_after_write on public.orders;
create trigger orders_lifecycle_after_write
  after insert or update on public.orders
  for each row execute function public.orders_lifecycle_after_write();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Add-on / additional-documentation payments
-- ═══════════════════════════════════════════════════════════════════════════
-- An add-on payment is REVENUE on its own transaction date, but it must NOT
-- create a second paid order and must NOT alter the parent's first-paid date.
-- It updates last_payment_at + latest activity only.

create or replace function public.addon_request_paid_lifecycle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_at   timestamptz;
  v_conf text;
begin
  if NEW.order_id is null then return null; end if;
  if not (NEW.status = 'paid' and coalesce(OLD.status, '') <> 'paid') then return null; end if;

  v_at := coalesce(NEW.paid_at, now());

  select confirmation_id into v_conf from public.orders where id = NEW.order_id;

  update public.orders
     set last_payment_at               = greatest(coalesce(last_payment_at, v_at), v_at),
         last_meaningful_activity_at   = greatest(coalesce(last_meaningful_activity_at, v_at), v_at),
         last_meaningful_activity_type = 'additional_payment_received'
   where id = NEW.order_id;

  begin
    insert into public.order_lifecycle_events
      (order_id, confirmation_id, event_type, occurred_at, source, actor_type, idempotency_key, metadata)
    values (
      NEW.order_id, v_conf, 'additional_payment_received', v_at,
      'addon_request', 'customer',
      NEW.order_id::text || ':additional_payment_received:addon:' || NEW.id::text,
      jsonb_build_object('addon_request_id', NEW.id, 'amount_cents', NEW.amount_cents)
    )
    on conflict (idempotency_key) do nothing;
  exception when others then
    null;
  end;

  return null;
end;
$$;

drop trigger if exists addon_request_paid_lifecycle on public.order_additional_documentation_requests;
create trigger addon_request_paid_lifecycle
  after update on public.order_additional_documentation_requests
  for each row execute function public.addon_request_paid_lifecycle();

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Admin escape hatch — correcting a genuinely wrong first-paid date
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.admin_correct_order_first_paid_at(
  p_order_id uuid,
  p_first_paid_at timestamptz
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.check_is_admin() then
    raise exception 'not authorized';
  end if;
  perform set_config('app.allow_first_paid_override', 'on', true);
  update public.orders set paid_at = p_first_paid_at where id = p_order_id;
  perform set_config('app.allow_first_paid_override', 'off', true);

  insert into public.audit_logs
    (action, object_type, object_id, actor_name, actor_role, description, new_values)
  values
    ('order_first_paid_at_corrected', 'order', p_order_id::text,
     coalesce(auth.email(), 'admin'), 'admin',
     'First-paid timestamp corrected via admin_correct_order_first_paid_at.',
     jsonb_build_object('paid_at', p_first_paid_at));
end;
$$;

revoke all on function public.admin_correct_order_first_paid_at(uuid, timestamptz) from public, anon;
grant execute on function public.admin_correct_order_first_paid_at(uuid, timestamptz) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Backfill from existing evidence (idempotent, additive only)
-- ═══════════════════════════════════════════════════════════════════════════
-- Only fills NULLs. Never overwrites an already-derived value, never invents a
-- payment. Historic overwrites of paid_at cannot be recovered — this migration
-- stops FUTURE loss; it does not fabricate past truth.

-- 10a. last_payment_at ← paid_at (best available proof of a payment date)
update public.orders
   set last_payment_at = paid_at
 where last_payment_at is null and paid_at is not null;

-- 10b. last_payment_at ← latest paid add-on request (revenue on its own date)
update public.orders o
   set last_payment_at = greatest(coalesce(o.last_payment_at, a.max_paid), a.max_paid)
  from (
    select order_id, max(paid_at) as max_paid
      from public.order_additional_documentation_requests
     where status = 'paid' and paid_at is not null and order_id is not null
     group by order_id
  ) a
 where o.id = a.order_id;

-- 10c. completion timestamps ← order_status_logs transitions to patient_notified,
--      falling back to the 30-day columns and patient_notification_sent_at.
update public.orders o
   set first_completed_at = coalesce(o.first_completed_at, c.first_at),
       last_completed_at  = coalesce(o.last_completed_at,  c.last_at)
  from (
    select order_id, min(changed_at) as first_at, max(changed_at) as last_at
      from public.order_status_logs
     where new_doctor_status = 'patient_notified' and order_id is not null
     group by order_id
  ) c
 where o.id = c.order_id
   and (o.first_completed_at is null or o.last_completed_at is null);

update public.orders
   set first_completed_at = coalesce(first_completed_at,
                                     official_letter_first_completed_at,
                                     patient_notification_sent_at),
       last_completed_at  = coalesce(last_completed_at,
                                     official_letter_final_completed_at,
                                     patient_notification_sent_at,
                                     official_letter_first_completed_at)
 where doctor_status = 'patient_notified'
   and (first_completed_at is null or last_completed_at is null);

-- 10d. last_reopened_at ← the 30-day reopen column
update public.orders
   set last_reopened_at = official_letter_reopened_at
 where last_reopened_at is null and official_letter_reopened_at is not null;

-- 10e. last_meaningful_activity_* ← the newest business timestamp we can prove.
--      created_at is the floor, so every order has a sort key and no order is
--      pushed to the bottom of the list by the backfill.
update public.orders o
   set last_meaningful_activity_at = d.at,
       last_meaningful_activity_type = d.typ
  from (
    select id,
           at,
           typ
      from (
        select o2.id,
               x.at,
               x.typ,
               row_number() over (
                 partition by o2.id
                 order by x.at desc, public.order_lifecycle_event_rank(x.typ) desc
               ) as rn
          from public.orders o2
          cross join lateral (values
            (o2.created_at,                     'lead_created'),
            (o2.paid_at,                        'payment_received'),
            (o2.last_payment_at,                'additional_payment_received'),
            (o2.last_reopened_at,               'order_reopened'),
            (o2.first_completed_at,             'provider_completed'),
            (o2.last_completed_at,              'customer_notified'),
            (o2.customer_uploaded_additional_document_at, 'document_uploaded'),
            (o2.refunded_at,                    'refund_completed')
          ) as x(at, typ)
         where x.at is not null
      ) ranked
     where rn = 1
  ) d
 where o.id = d.id
   and o.last_meaningful_activity_at is null;

-- 10f. Absolute floor — any row still without a sort key falls back to created_at.
update public.orders
   set last_meaningful_activity_at = created_at,
       last_meaningful_activity_type = coalesce(last_meaningful_activity_type, 'lead_created')
 where last_meaningful_activity_at is null and created_at is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Admin read RPC for the per-order lifecycle timeline
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.get_order_lifecycle_events(p_order_id uuid)
returns setof public.order_lifecycle_events
language sql
stable
security definer
set search_path to 'public'
as $$
  select * from public.order_lifecycle_events
   where order_id = p_order_id
     and public.check_is_admin()
   order by occurred_at desc, created_at desc;
$$;

revoke all on function public.get_order_lifecycle_events(uuid) from public, anon;
grant execute on function public.get_order_lifecycle_events(uuid) to authenticated, service_role;
