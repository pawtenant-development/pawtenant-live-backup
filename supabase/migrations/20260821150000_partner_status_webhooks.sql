-- PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 8 · Part B
-- Signed server-to-server partner status webhooks.
--
-- SHAPE
--   * partner_webhook_endpoints (public, admin-read)  — where to deliver.
--   * private.partner_webhook_endpoint_secrets        — HMAC secrets. Private
--     schema: invisible to the Data API, returned exactly ONCE at registration
--     (the credential ceremony), never by any read path afterwards.
--   * partner_webhook_events                          — the IMMUTABLE outbox.
--     One row per logical event; idempotent creation via a dedupe key. The
--     payload stored here is byte-identical to what gets delivered, so what
--     was sent is always auditable.
--   * partner_webhook_deliveries                      — one row per event ×
--     endpoint. UNIQUE(event_id, endpoint_id): a successful delivery can never
--     be repeated, and a manual retry can only ever re-drive THIS row — it is
--     structurally incapable of creating a second logical event.
--   * partner_webhook_delivery_attempts               — append-only attempt
--     history (status code, error, duration) for every wire attempt.
--
-- PAYLOAD DISCIPLINE (what a webhook may carry)
--   event_id, event_type, event_version, the partner's own order reference,
--   our confirmation reference, occurred_at, and coarse status data. NEVER:
--   assessment answers, diagnosis or any clinical content, customer contact
--   fields, provider identity, internal UUIDs, wholesale margins, credentials.
--   Invoice events carry the invoice's own commercial identity (number,
--   status, totals) — that is the partner's receivable and is addressed TO
--   them.
--
-- DELIVERY DISCIPLINE
--   Build payload → CLAIM (status 'delivering') → send → record. A failure
--   releases the claim with exponential backoff; a crash leaves a stale claim
--   that the next dispatch run reclaims after 10 minutes. Terminal failure
--   after 8 attempts is recorded, never silently dropped. Success freezes the
--   delivery row permanently (trigger-enforced).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Endpoints + private secrets
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.partner_webhook_endpoints (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid not null references public.partner_organizations(id),
  environment     text not null check (environment in ('sandbox','production')),
  url             text not null check (url like 'https://%'),
  description     text,
  active          boolean not null default true,
  -- Empty array = subscribed to every event family.
  event_types     text[] not null default '{}',
  created_by      text not null,
  created_at      timestamptz not null default now(),
  disabled_at     timestamptz,
  disabled_reason text
);

comment on table public.partner_webhook_endpoints is
  'Partner webhook destinations. HTTPS only (check + dispatcher re-check). '
  'Secrets live in private.partner_webhook_endpoint_secrets and are returned '
  'exactly once at registration.';

create index if not exists partner_webhook_endpoints_partner_idx
  on public.partner_webhook_endpoints (partner_id, active);

create table if not exists private.partner_webhook_endpoint_secrets (
  endpoint_id uuid primary key references public.partner_webhook_endpoints(id) on delete cascade,
  secret      text not null,
  created_at  timestamptz not null default now()
);

comment on table private.partner_webhook_endpoint_secrets is
  'HMAC-SHA256 signing secrets for partner webhook endpoints. Private schema: '
  'no Data API exposure, deny-all RLS, service-role only. No RPC returns a '
  'secret after registration.';

alter table private.partner_webhook_endpoint_secrets enable row level security;
revoke all on private.partner_webhook_endpoint_secrets from public, anon, authenticated;
grant all on private.partner_webhook_endpoint_secrets to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The immutable outbox
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.partner_webhook_events (
  id                  uuid primary key,
  partner_id          uuid not null references public.partner_organizations(id),
  order_id            uuid references public.orders(id) on delete cascade,
  invoice_id          uuid references public.partner_invoices(id) on delete cascade,
  event_type          text not null check (event_type in (
    'order.accepted', 'order.provider_assigned', 'order.additional_information_required',
    'order.correction_required', 'order.document_approved', 'order.completed',
    'order.document_ready', 'order.cancelled',
    'invoice.issued', 'invoice.paid', 'billing.credit_issued'
  )),
  event_version       text not null default '1',
  partner_order_id    text,
  pawtenant_reference text,
  occurred_at         timestamptz not null default now(),
  -- The exact envelope delivered on the wire. Safe fields only — the emitter
  -- function builds it from an explicit allowlist, never from row spreads.
  payload             jsonb not null,
  dedupe_key          text not null,
  created_by          text not null default 'system',
  created_at          timestamptz not null default now(),
  constraint partner_webhook_events_dedupe unique (partner_id, event_type, dedupe_key)
);

comment on table public.partner_webhook_events is
  'Immutable partner webhook outbox. One row per logical event; the stored '
  'payload is byte-identical to what is delivered. Idempotent creation via '
  '(partner_id, event_type, dedupe_key). No PHI, no economics beyond the '
  'partner''s own invoice identity, no internal UUID leaves this payload.';

create index if not exists partner_webhook_events_partner_idx
  on public.partner_webhook_events (partner_id, occurred_at);
create index if not exists partner_webhook_events_order_idx
  on public.partner_webhook_events (order_id);

create or replace function public.tg_partner_webhook_event_append_only()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE' then
    raise exception 'partner_webhook_events: the outbox is immutable (event %)', old.id
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.fixture_cleanup', true), '') <> 'on'
  then
    raise exception 'partner_webhook_events: outbox rows are append-only (event %)', old.id
      using errcode = '23514';
  end if;
  return old;
end;
$function$;

drop trigger if exists partner_webhook_events_append_only on public.partner_webhook_events;
create trigger partner_webhook_events_append_only
  before update or delete on public.partner_webhook_events
  for each row execute function public.tg_partner_webhook_event_append_only();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Deliveries + attempts
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.partner_webhook_deliveries (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.partner_webhook_events(id) on delete cascade,
  endpoint_id      uuid not null references public.partner_webhook_endpoints(id) on delete cascade,
  status           text not null default 'pending'
                   check (status in ('pending','delivering','succeeded','failed_terminal')),
  attempt_count    integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  claimed_at       timestamptz,
  last_attempt_at  timestamptz,
  last_status_code integer,
  last_error       text,
  succeeded_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- THE duplicate-delivery boundary: one delivery row per event × endpoint,
  -- and the guard trigger freezes it permanently once it succeeds.
  constraint partner_webhook_deliveries_unique unique (event_id, endpoint_id)
);

create index if not exists partner_webhook_deliveries_due_idx
  on public.partner_webhook_deliveries (status, next_attempt_at);

create or replace function public.tg_partner_webhook_delivery_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('app.fixture_cleanup', true), '') <> 'on' then
      raise exception 'partner_webhook_deliveries: delivery history is append-only (delivery %)', old.id
        using errcode = '23514';
    end if;
    return old;
  end if;

  -- A succeeded delivery is FINAL. No retry, no re-open, no edit — the only
  -- way to send again would be a NEW logical event, which is exactly what a
  -- duplicate-delivery bug looks like, so it is refused at the boundary.
  if old.status = 'succeeded' then
    raise exception 'partner_webhook_deliveries: delivery % already succeeded and is frozen', old.id
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists partner_webhook_delivery_guard on public.partner_webhook_deliveries;
create trigger partner_webhook_delivery_guard
  before update or delete on public.partner_webhook_deliveries
  for each row execute function public.tg_partner_webhook_delivery_guard();

create table if not exists public.partner_webhook_delivery_attempts (
  id             uuid primary key default gen_random_uuid(),
  delivery_id    uuid not null references public.partner_webhook_deliveries(id) on delete cascade,
  attempt_number integer not null,
  requested_at   timestamptz not null default now(),
  ok             boolean not null,
  status_code    integer,
  error          text,
  duration_ms    integer
);

create index if not exists partner_webhook_delivery_attempts_delivery_idx
  on public.partner_webhook_delivery_attempts (delivery_id, attempt_number);

create or replace function public.tg_partner_webhook_attempt_append_only()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE' then
    raise exception 'partner_webhook_delivery_attempts: attempts are append-only' using errcode = '23514';
  end if;
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.fixture_cleanup', true), '') <> 'on'
  then
    raise exception 'partner_webhook_delivery_attempts: attempts are never deleted' using errcode = '23514';
  end if;
  return old;
end;
$function$;

drop trigger if exists partner_webhook_attempt_append_only on public.partner_webhook_delivery_attempts;
create trigger partner_webhook_attempt_append_only
  before update or delete on public.partner_webhook_delivery_attempts
  for each row execute function public.tg_partner_webhook_attempt_append_only();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Event emission — one explicit allowlisted builder
-- ═══════════════════════════════════════════════════════════════════════════

-- Idempotently mint one logical event and fan it out to the partner's active,
-- environment-matching endpoints. The payload is built HERE, from an explicit
-- field allowlist — emitting call sites hand in coarse data only, and nothing
-- assembled anywhere else ever reaches the wire.
create or replace function public.partner_emit_webhook_event(
  p_partner_id uuid,
  p_event_type text,
  p_dedupe_key text,
  p_order_id uuid default null,
  p_invoice_id uuid default null,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_event_id  uuid := gen_random_uuid();
  v_env       text;
  v_ref       text;
  v_conf      text;
  v_payload   jsonb;
  v_inserted  uuid;
begin
  select case when production_enabled then 'production' else 'sandbox' end
    into v_env
    from public.partner_organizations where id = p_partner_id;
  if v_env is null then return null; end if;

  if p_order_id is not null then
    select o.partner_order_id, o.confirmation_id into v_ref, v_conf
      from public.orders o where o.id = p_order_id;
  end if;

  -- The envelope. Field allowlist — nothing else is ever added here without a
  -- payload review. p_data is coarse status data supplied by the emitters
  -- below (also allowlisted at each call site).
  v_payload := jsonb_build_object(
    'event_id',            v_event_id,
    'event_type',          p_event_type,
    'event_version',       '1',
    'partner_order_id',    v_ref,
    'pawtenant_reference', v_conf,
    'occurred_at',         to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'data',                coalesce(p_data, '{}'::jsonb)
  );

  insert into public.partner_webhook_events (
    id, partner_id, order_id, invoice_id, event_type, partner_order_id,
    pawtenant_reference, payload, dedupe_key
  ) values (
    v_event_id, p_partner_id, p_order_id, p_invoice_id, p_event_type, v_ref,
    v_conf, v_payload, p_dedupe_key
  )
  on conflict (partner_id, event_type, dedupe_key) do nothing
  returning id into v_inserted;

  -- Replay (conflict) mints nothing and fans out nothing.
  if v_inserted is null then return null; end if;

  insert into public.partner_webhook_deliveries (event_id, endpoint_id)
  select v_inserted, e.id
    from public.partner_webhook_endpoints e
   where e.partner_id = p_partner_id
     and e.active
     and e.environment = v_env
     and (cardinality(e.event_types) = 0 or p_event_type = any(e.event_types))
  on conflict (event_id, endpoint_id) do nothing;

  return v_inserted;
end;
$function$;

revoke all on function public.partner_emit_webhook_event(uuid, text, text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.partner_emit_webhook_event(uuid, text, text, uuid, uuid, jsonb)
  to service_role;

-- ── 4a. Order lifecycle emitters ────────────────────────────────────────────
-- AFTER triggers so the row change is already committed-in-transaction; every
-- path (edge function, admin action, ad-hoc SQL) emits identically. Partner
-- origin only — a direct PawTenant order never mints a partner event.

create or replace function public.tg_partner_webhook_on_order_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if new.order_origin is distinct from 'partner' or new.partner_id is null then return new; end if;
  perform public.partner_emit_webhook_event(
    new.partner_id, 'order.accepted', new.id::text, new.id, null,
    jsonb_build_object('service', lower(coalesce(new.letter_type, 'esa')), 'clinical_status', 'received')
  );
  return new;
end;
$function$;

drop trigger if exists partner_webhook_on_order_insert on public.orders;
create trigger partner_webhook_on_order_insert
  after insert on public.orders
  for each row execute function public.tg_partner_webhook_on_order_insert();

create or replace function public.tg_partner_webhook_on_order_update()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_service text := lower(coalesce(new.letter_type, 'esa'));
begin
  if new.order_origin is distinct from 'partner' or new.partner_id is null then return new; end if;

  -- Provider assigned. The payload deliberately carries NO provider identity:
  -- the provider's name, email and rate are PawTenant-internal.
  if (old.doctor_user_id is null and old.doctor_email is null)
     and (new.doctor_user_id is not null or new.doctor_email is not null) then
    perform public.partner_emit_webhook_event(
      new.partner_id, 'order.provider_assigned', new.id::text, new.id, null,
      jsonb_build_object('service', v_service, 'provider_assigned', true)
    );
  end if;

  -- Additional information required from the customer.
  if coalesce(old.additional_documentation_required, false) = false
     and new.additional_documentation_required = true then
    perform public.partner_emit_webhook_event(
      new.partner_id, 'order.additional_information_required', new.id::text, new.id, null,
      jsonb_build_object('service', v_service)
    );
  end if;

  -- Submission returned for correction (the "rejected" family, truthfully
  -- named: nothing in this platform auto-rejects a customer).
  if old.official_letter_reopened_at is null and new.official_letter_reopened_at is not null then
    perform public.partner_emit_webhook_event(
      new.partner_id, 'order.correction_required',
      new.id::text || ':' || to_char(new.official_letter_reopened_at, 'YYYYMMDDHH24MISS'),
      new.id, null,
      jsonb_build_object('service', v_service)
    );
  end if;

  -- Clinical work completed (the billable milestone; outcome-independent).
  if old.doctor_status is distinct from 'patient_notified'
     and new.doctor_status = 'patient_notified' then
    perform public.partner_emit_webhook_event(
      new.partner_id, 'order.completed', new.id::text, new.id, null,
      jsonb_build_object('service', v_service, 'clinical_status', 'clinical_work_completed')
    );
  end if;

  -- Cancelled.
  if old.status is distinct from 'cancelled' and new.status = 'cancelled' then
    perform public.partner_emit_webhook_event(
      new.partner_id, 'order.cancelled', new.id::text, new.id, null,
      jsonb_build_object('service', v_service)
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists partner_webhook_on_order_update on public.orders;
create trigger partner_webhook_on_order_update
  after update on public.orders
  for each row execute function public.tg_partner_webhook_on_order_update();

-- ── 4b. Document approval / readiness emitters ──────────────────────────────

create or replace function public.tg_partner_webhook_on_document_approved()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
begin
  if new.review_status is distinct from 'approved' or old.review_status is not distinct from 'approved' then
    return new;
  end if;
  if new.order_id is null then return new; end if;
  select * into v_order from public.orders where id = new.order_id;
  if not found or v_order.order_origin is distinct from 'partner' or v_order.partner_id is null then
    return new;
  end if;
  perform public.partner_emit_webhook_event(
    v_order.partner_id, 'order.document_approved', new.id::text, v_order.id, null,
    jsonb_build_object('service', lower(coalesce(v_order.letter_type, 'esa')))
  );
  return new;
end;
$function$;

drop trigger if exists partner_webhook_on_document_approved on public.order_documents;
create trigger partner_webhook_on_document_approved
  after update on public.order_documents
  for each row execute function public.tg_partner_webhook_on_document_approved();

create or replace function public.tg_partner_webhook_on_document_release()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  perform public.partner_emit_webhook_event(
    new.partner_id, 'order.document_ready', new.id::text, new.order_id, null,
    jsonb_build_object('service', new.service, 'document_sha256', new.file_sha256)
  );
  return new;
end;
$function$;

drop trigger if exists partner_webhook_on_document_release on public.partner_document_releases;
create trigger partner_webhook_on_document_release
  after insert on public.partner_document_releases
  for each row execute function public.tg_partner_webhook_on_document_release();

-- ── 4c. Finance emitters ────────────────────────────────────────────────────
-- Invoice identity (number, status, totals) is the partner's own receivable,
-- addressed to them. Order-level wholesale detail and margins never appear.

create or replace function public.tg_partner_webhook_on_invoice_update()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if old.status is distinct from new.status then
    if new.status = 'issued' then
      perform public.partner_emit_webhook_event(
        new.partner_id, 'invoice.issued', new.id::text, null, new.id,
        jsonb_build_object(
          'invoice_number', new.invoice_number, 'status', new.status,
          'currency', new.currency, 'total_cents', new.total_cents,
          'due_at', new.due_at
        )
      );
    elsif new.status = 'paid' then
      perform public.partner_emit_webhook_event(
        new.partner_id, 'invoice.paid', new.id::text, null, new.id,
        jsonb_build_object(
          'invoice_number', new.invoice_number, 'status', new.status,
          'currency', new.currency, 'total_cents', new.total_cents
        )
      );
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists partner_webhook_on_invoice_update on public.partner_invoices;
create trigger partner_webhook_on_invoice_update
  after update on public.partner_invoices
  for each row execute function public.tg_partner_webhook_on_invoice_update();

create or replace function public.tg_partner_webhook_on_credit()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if new.event_kind is distinct from 'credit' then return new; end if;
  perform public.partner_emit_webhook_event(
    new.partner_id, 'billing.credit_issued', new.id::text, new.order_id, null,
    jsonb_build_object(
      'service', new.service, 'currency', new.currency, 'amount_cents', new.amount_cents
    )
  );
  return new;
end;
$function$;

drop trigger if exists partner_webhook_on_credit on public.partner_billable_events;
create trigger partner_webhook_on_credit
  after insert on public.partner_billable_events
  for each row execute function public.tg_partner_webhook_on_credit();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Registration / dispatch / retry RPCs
-- ═══════════════════════════════════════════════════════════════════════════

-- Register an endpoint. The secret is generated server-side and RETURNED
-- EXACTLY ONCE — the same ceremony as partner API credentials. It is never
-- readable again through any surface.
create or replace function public.partner_register_webhook_endpoint(
  p_partner_id uuid, p_environment text, p_url text,
  p_description text default null, p_event_types text[] default '{}'
)
returns table(endpoint_id uuid, secret text)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_partner public.partner_organizations%rowtype;
  v_id      uuid;
  v_secret  text;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_environment not in ('sandbox','production') then
    raise exception 'environment must be sandbox or production' using errcode = '22023';
  end if;
  if p_url not like 'https://%' then
    raise exception 'webhook endpoints must be HTTPS' using errcode = '22023';
  end if;
  select * into v_partner from public.partner_organizations where id = p_partner_id;
  if not found then raise exception 'partner not found' using errcode = 'P0002'; end if;
  if p_environment = 'production' and not v_partner.production_enabled then
    raise exception 'production endpoints require production_enabled — a separately authorized activation'
      using errcode = '42501';
  end if;

  v_secret := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.partner_webhook_endpoints (partner_id, environment, url, description, event_types, created_by)
  values (p_partner_id, p_environment, p_url, p_description, coalesce(p_event_types, '{}'),
          coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email', 'admin'))
  returning id into v_id;

  insert into private.partner_webhook_endpoint_secrets (endpoint_id, secret)
  values (v_id, v_secret);

  return query select v_id, v_secret;
end;
$function$;

create or replace function public.partner_disable_webhook_endpoint(p_endpoint_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  update public.partner_webhook_endpoints
     set active = false, disabled_at = now(), disabled_reason = p_reason
   where id = p_endpoint_id;
  if not found then raise exception 'endpoint not found' using errcode = 'P0002'; end if;
end;
$function$;

-- CLAIM due deliveries for the dispatcher. Service-role only: the returned
-- rows carry the signing secret, which must never reach a browser session.
-- 'delivering' claims older than 10 minutes are stale (dispatcher crash) and
-- are reclaimed.
create or replace function public.partner_webhook_claim_deliveries(p_limit integer default 20)
returns table(
  delivery_id uuid, event_id uuid, event_type text, payload jsonb,
  endpoint_id uuid, url text, environment text, secret text, attempt_count integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_ids uuid[];
begin
  select array_agg(d.id) into v_ids from (
    select d.id
      from public.partner_webhook_deliveries d
      join public.partner_webhook_endpoints e on e.id = d.endpoint_id
     where e.active
       and (
         (d.status = 'pending' and d.next_attempt_at <= now())
         or (d.status = 'delivering' and d.claimed_at < now() - interval '10 minutes')
       )
     order by d.next_attempt_at
     limit greatest(coalesce(p_limit, 20), 1)
       for update of d skip locked
  ) d;

  if v_ids is null then return; end if;

  update public.partner_webhook_deliveries d
     set status = 'delivering', claimed_at = now()
   where d.id = any(v_ids);

  return query
  select d.id, ev.id, ev.event_type, ev.payload,
         e.id, e.url, e.environment, s.secret, d.attempt_count
    from public.partner_webhook_deliveries d
    join public.partner_webhook_events ev on ev.id = d.event_id
    join public.partner_webhook_endpoints e on e.id = d.endpoint_id
    join private.partner_webhook_endpoint_secrets s on s.endpoint_id = e.id
   where d.id = any(v_ids);
end;
$function$;

-- Record one wire attempt and settle the claim. Success is final; failure
-- releases the claim with exponential backoff (1m, 5m, 25m, ~2h, 12h cap) and
-- becomes terminal after 8 attempts.
create or replace function public.partner_webhook_record_attempt(
  p_delivery_id uuid, p_ok boolean, p_status_code integer default null,
  p_error text default null, p_duration_ms integer default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_d public.partner_webhook_deliveries%rowtype;
  v_attempt integer;
begin
  select * into v_d from public.partner_webhook_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'delivery not found' using errcode = 'P0002'; end if;
  if v_d.status = 'succeeded' then
    raise exception 'delivery % already succeeded — a second success is a duplicate delivery', p_delivery_id
      using errcode = '23514';
  end if;

  v_attempt := v_d.attempt_count + 1;

  insert into public.partner_webhook_delivery_attempts
    (delivery_id, attempt_number, ok, status_code, error, duration_ms)
  values (p_delivery_id, v_attempt, p_ok, p_status_code, left(p_error, 500), p_duration_ms);

  if p_ok then
    update public.partner_webhook_deliveries
       set status = 'succeeded', succeeded_at = now(), attempt_count = v_attempt,
           last_attempt_at = now(), last_status_code = p_status_code, last_error = null,
           claimed_at = null
     where id = p_delivery_id;
  elsif v_attempt >= 8 then
    update public.partner_webhook_deliveries
       set status = 'failed_terminal', attempt_count = v_attempt,
           last_attempt_at = now(), last_status_code = p_status_code,
           last_error = left(p_error, 500), claimed_at = null
     where id = p_delivery_id;
  else
    update public.partner_webhook_deliveries
       set status = 'pending', attempt_count = v_attempt,
           next_attempt_at = now() + make_interval(secs =>
             least(60 * power(5, v_attempt - 1), 43200)),
           last_attempt_at = now(), last_status_code = p_status_code,
           last_error = left(p_error, 500), claimed_at = null
     where id = p_delivery_id;
  end if;
end;
$function$;

-- Manual admin retry. Re-drives the EXISTING delivery row only — it cannot
-- create a second logical event (no INSERT into the outbox exists here) and
-- cannot touch a succeeded delivery (guard trigger + explicit check).
create or replace function public.partner_webhook_retry_delivery(p_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_status text;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select status into v_status from public.partner_webhook_deliveries where id = p_delivery_id for update;
  if v_status is null then raise exception 'delivery not found' using errcode = 'P0002'; end if;
  if v_status = 'succeeded' then
    raise exception 'delivery already succeeded — retrying it would be a duplicate delivery'
      using errcode = '23514';
  end if;
  update public.partner_webhook_deliveries
     set status = 'pending', next_attempt_at = now(), claimed_at = null
   where id = p_delivery_id;
end;
$function$;

-- Dispatcher credential (the verify_payout_cron_secret pattern): compared
-- inside the database against the vault; boolean only; never returned.
create or replace function public.verify_partner_webhook_cron_secret(p_secret text)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select coalesce(
    nullif(p_secret, '') = (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'partner_webhook_dispatch_secret'
      limit 1
    ),
    false
  );
$function$;

-- LIVE ADAPTATION (PARTNER-PLATFORM-LIVE-FOUNDATION-ROLLOUT-004): section 6 (sandbox
-- receiver receipts, TEST verification surface) is not migrated to LIVE; the
-- partner-webhook-sandbox-sink function is TEST-only (PRODUCTION-ACTIVATION-CHECKLIST section 3).

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Access
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.partner_webhook_endpoints          enable row level security;
alter table public.partner_webhook_endpoints          force row level security;
alter table public.partner_webhook_events             enable row level security;
alter table public.partner_webhook_events             force row level security;
alter table public.partner_webhook_deliveries         enable row level security;
alter table public.partner_webhook_deliveries         force row level security;
alter table public.partner_webhook_delivery_attempts  enable row level security;
alter table public.partner_webhook_delivery_attempts  force row level security;

revoke all on public.partner_webhook_endpoints         from public, anon, authenticated;
revoke all on public.partner_webhook_events            from public, anon, authenticated;
revoke all on public.partner_webhook_deliveries        from public, anon, authenticated;
revoke all on public.partner_webhook_delivery_attempts from public, anon, authenticated;

grant select on public.partner_webhook_endpoints         to authenticated;
grant select on public.partner_webhook_events            to authenticated;
grant select on public.partner_webhook_deliveries        to authenticated;
grant select on public.partner_webhook_delivery_attempts to authenticated;
grant all on public.partner_webhook_endpoints         to service_role;
grant all on public.partner_webhook_events            to service_role;
grant all on public.partner_webhook_deliveries        to service_role;
grant all on public.partner_webhook_delivery_attempts to service_role;

drop policy if exists partner_webhook_endpoints_admin_read on public.partner_webhook_endpoints;
create policy partner_webhook_endpoints_admin_read on public.partner_webhook_endpoints
  for select to authenticated using (public.is_chat_admin());
drop policy if exists partner_webhook_events_admin_read on public.partner_webhook_events;
create policy partner_webhook_events_admin_read on public.partner_webhook_events
  for select to authenticated using (public.is_chat_admin());
drop policy if exists partner_webhook_deliveries_admin_read on public.partner_webhook_deliveries;
create policy partner_webhook_deliveries_admin_read on public.partner_webhook_deliveries
  for select to authenticated using (public.is_chat_admin());
drop policy if exists partner_webhook_delivery_attempts_admin_read on public.partner_webhook_delivery_attempts;
create policy partner_webhook_delivery_attempts_admin_read on public.partner_webhook_delivery_attempts
  for select to authenticated using (public.is_chat_admin());

revoke all on function public.partner_register_webhook_endpoint(uuid, text, text, text, text[]) from public, anon;
revoke all on function public.partner_disable_webhook_endpoint(uuid, text) from public, anon;
revoke all on function public.partner_webhook_retry_delivery(uuid) from public, anon;
grant execute on function public.partner_register_webhook_endpoint(uuid, text, text, text, text[]) to authenticated, service_role;
grant execute on function public.partner_disable_webhook_endpoint(uuid, text) to authenticated, service_role;
grant execute on function public.partner_webhook_retry_delivery(uuid) to authenticated, service_role;

-- The claim/record pair carries or touches signing secrets: service_role ONLY.
revoke all on function public.partner_webhook_claim_deliveries(integer) from public, anon, authenticated;
revoke all on function public.partner_webhook_record_attempt(uuid, boolean, integer, text, integer) from public, anon, authenticated;
grant execute on function public.partner_webhook_claim_deliveries(integer) to service_role;
grant execute on function public.partner_webhook_record_attempt(uuid, boolean, integer, text, integer) to service_role;

revoke all on function public.verify_partner_webhook_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_partner_webhook_cron_secret(text) to service_role;
