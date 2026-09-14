-- PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 7 · Part A
-- Canonical partner PSD intake: normalized snapshots + raw-payload preservation.
--
-- THE CONTRACT (enforced in partner-orders-v1/validate.ts, recorded here)
-- A partner PSD order must be submitted under the versioned contract
-- 'partner.assessment.psd.v1', which is the canonical retail 'psd_v1' question
-- catalog verbatim: all 16 required question ids, only catalog question ids,
-- server-validated answer shapes. Nothing is inferred from the old generic
-- fields (primaryConcern / symptomDescription / durationOfSymptoms carry no
-- clinical equivalence and are never mapped). The normalization is therefore
-- an IDENTITY mapping on question ids — 'norm.psd_v1.identity.1' — and its
-- provenance is still recorded per order so a future non-identity mapping has
-- the same audit shape.
--
-- WHAT THIS MIGRATION ADDS
--   1. public.partner_assessment_snapshots — one immutable normalization
--      record per order: source/target schema versions, normalization version,
--      source payload hash, accepted timestamp, partner org, external order
--      reference, and the normalized QUESTION IDS ONLY (never answer values —
--      the snapshot is audit provenance, not a PHI store).
--   2. private.partner_raw_submissions — the partner's original payload,
--      verbatim, in the Data-API-invisible private schema (same placement as
--      credential material). UPDATE is blocked; this is the raw record.
--   3. partner_accept_order gains p_target_assessment_version: when supplied,
--      canonical answer rows are written under the TARGET version (psd_v1) so
--      the one canonical PSD completion gate — psd_assessment_status — works
--      natively, and the snapshot + raw submission rows are written in the
--      same transaction. When null, behaviour is byte-identical to before
--      (the ESA path and any legacy caller are untouched).
--
-- Retries stay idempotent and can NEVER replace an accepted snapshot: the
-- replay arm of partner_accept_order returns the existing order before any
-- write, snapshots are UNIQUE per order, and UPDATE on the snapshot is
-- refused by trigger. Changed clinical answers require the documented
-- revision workflow (support-mediated re-submission), not a silent overwrite.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Normalized snapshot provenance (public, admin-readable, no PHI)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.partner_assessment_snapshots (
  id                        uuid primary key default gen_random_uuid(),
  order_id                  uuid not null unique references public.orders(id) on delete cascade,
  partner_id                uuid not null references public.partner_organizations(id),
  partner_order_id          text not null,
  source_schema_version     text not null,
  target_assessment_version text not null,
  normalization_version     text not null,
  source_payload_hash       text not null,
  -- Normalized question identifiers only. Values live in assessment_answers;
  -- this row must stay safe to show an admin and to log.
  question_ids              jsonb not null default '[]'::jsonb,
  accepted_at               timestamptz not null default now(),
  created_by                text not null default 'partner-orders-v1'
);

comment on table public.partner_assessment_snapshots is
  'Immutable per-order provenance of partner assessment normalization: which '
  'source contract was accepted, which canonical target it was normalized to, '
  'under which normalization version, with the source payload hash. Question '
  'ids only — never answer values.';

-- UPDATE is never allowed: a retry or a re-submission can only be a NEW,
-- explicitly-mediated record, not a rewrite. DELETE is allowed only for the
-- explicit fixture-cleanup escape hatch (TEST hygiene) or via order deletion.
create or replace function public.tg_partner_snapshot_immutable()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE' then
    raise exception 'partner_assessment_snapshots: snapshots are immutable (order %)', old.order_id
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.fixture_cleanup', true), '') <> 'on'
  then
    raise exception 'partner_assessment_snapshots: snapshots are append-only (order %)', old.order_id
      using errcode = '23514';
  end if;
  return old;
end;
$function$;

drop trigger if exists partner_assessment_snapshots_immutable on public.partner_assessment_snapshots;
create trigger partner_assessment_snapshots_immutable
  before update or delete on public.partner_assessment_snapshots
  for each row execute function public.tg_partner_snapshot_immutable();

alter table public.partner_assessment_snapshots enable row level security;
alter table public.partner_assessment_snapshots force row level security;

revoke all on public.partner_assessment_snapshots from public;
revoke all on public.partner_assessment_snapshots from anon;
revoke all on public.partner_assessment_snapshots from authenticated;
grant select on public.partner_assessment_snapshots to authenticated;
grant all on public.partner_assessment_snapshots to service_role;

drop policy if exists partner_snapshots_admin_read on public.partner_assessment_snapshots;
create policy partner_snapshots_admin_read on public.partner_assessment_snapshots
  for select to authenticated using (public.is_chat_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Raw partner submissions (private schema — invisible to the Data API)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists private.partner_raw_submissions (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null unique references public.orders(id) on delete cascade,
  partner_id       uuid not null,
  partner_order_id text not null,
  schema_version   text not null,
  payload          jsonb not null,
  payload_hash     text not null,
  received_at      timestamptz not null default now()
);

comment on table private.partner_raw_submissions is
  'The partner''s original accepted payload, verbatim. PHI: lives in the '
  'private schema (no Data API exposure), deny-all RLS, service-role only. '
  'UPDATE refused; the raw record is what was actually received.';

create or replace function private.tg_partner_raw_submissions_immutable()
returns trigger
language plpgsql
set search_path to 'private', 'pg_catalog', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE' then
    raise exception 'partner_raw_submissions: raw submissions are immutable (order %)', old.order_id
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.fixture_cleanup', true), '') <> 'on'
  then
    raise exception 'partner_raw_submissions: raw submissions are append-only (order %)', old.order_id
      using errcode = '23514';
  end if;
  return old;
end;
$function$;

drop trigger if exists partner_raw_submissions_immutable on private.partner_raw_submissions;
create trigger partner_raw_submissions_immutable
  before update or delete on private.partner_raw_submissions
  for each row execute function private.tg_partner_raw_submissions_immutable();

-- Deny-all: same discipline as the credential tables. INFO advisor expected.
alter table private.partner_raw_submissions enable row level security;
revoke all on private.partner_raw_submissions from public;
revoke all on private.partner_raw_submissions from anon;
revoke all on private.partner_raw_submissions from authenticated;
grant all on private.partner_raw_submissions to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. partner_accept_order — target-version normalization arm
-- ═══════════════════════════════════════════════════════════════════════════
-- Postgres identifies functions by argument types: a 7-arg variant with a
-- default alongside the old 6-arg one would make every 6-arg call ambiguous,
-- so the old signature is dropped and privileges are re-applied explicitly.

drop function if exists public.partner_accept_order(uuid, jsonb, text, text, text, text);

create or replace function public.partner_accept_order(
  p_partner_id uuid, p_payload jsonb, p_payload_hash text, p_schema_version text,
  p_idempotency_key text, p_request_id text,
  p_target_assessment_version text default null
)
returns table(order_id uuid, confirmation_id text, accepted_at timestamp with time zone,
              communication_policy text, document_policy text, replayed boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_partner        public.partner_organizations%rowtype;
  v_rate           public.partner_rate_cards%rowtype;
  v_service        text := lower(p_payload->>'service');
  v_partner_order  text := p_payload->>'partner_order_id';
  v_email          text := lower(p_payload#>>'{customer,email}');
  v_conf           text;
  v_order_id       uuid;
  v_existing       public.orders%rowtype;
  v_answer         record;
  v_is_test        boolean;
  v_attempt        int := 0;
  -- Slice 7: the version canonical answer rows are stored under. Null target
  -- (ESA / legacy) keeps the historical behaviour: rows carry the SOURCE
  -- schema version and the canonical PSD gate treats it as unmapped.
  v_stored_version text := coalesce(p_target_assessment_version, p_schema_version);
begin
  select * into v_partner from public.partner_organizations where id = p_partner_id;
  if not found then raise exception 'partner_not_found' using errcode = 'P0002'; end if;

  -- REPLAY: this partner order already exists -> return it. Never a second
  -- order, and NEVER a touch on the accepted answers or snapshot.
  select * into v_existing from public.orders
   where partner_id = p_partner_id and partner_order_id = v_partner_order;
  if found then
    return query select v_existing.id, v_existing.confirmation_id, v_existing.partner_accepted_at,
                        v_existing.partner_communication_policy, v_existing.partner_document_policy, true;
    return;
  end if;

  -- The rate card IN FORCE right now for this partner/service/environment.
  select * into v_rate from public.partner_rate_cards
   where partner_id = p_partner_id and service = v_service
     and environment = case when v_partner.production_enabled then 'production' else 'sandbox' end
     and effective_from <= now() and (effective_to is null or effective_to > now())
   order by version desc limit 1;
  if not found then raise exception 'no_rate_card' using errcode = 'P0002'; end if;

  -- Fixture orders are flagged so they never pollute reporting. Reserved,
  -- non-deliverable TLDs (RFC 2606) are the same convention the existing
  -- TEST suppression gate uses.
  v_is_test := v_email like '%.test' or v_email like '%.invalid';

  -- Unique confirmation id. Retries on the (astronomically unlikely) collision
  -- rather than failing the request.
  loop
    v_attempt := v_attempt + 1;
    v_conf := 'PT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (select 1 from public.orders o where o.confirmation_id = v_conf);
    if v_attempt > 10 then raise exception 'confirmation_id_collision'; end if;
  end loop;

  insert into public.orders (
    confirmation_id, email, first_name, last_name, phone, state, letter_type,
    status, doctor_status,
    -- PAID, but by the partner. payment_intent_id stays NULL: there is no
    -- Stripe charge, and inventing one would corrupt payment reconciliation.
    paid_at,
    -- price stays NULL. The partner's RETAIL price is not our revenue and must
    -- never reach a PawTenant retail KPI.
    price,
    assessment_answers, is_test,
    order_origin, partner_id, partner_order_id,
    partner_payload_schema_version, partner_payload_hash, partner_payment_reference,
    partner_support_owner, partner_communication_policy, partner_document_policy,
    partner_accepted_at
  ) values (
    v_conf, v_email,
    p_payload#>>'{customer,legal_first_name}',
    p_payload#>>'{customer,legal_last_name}',
    p_payload#>>'{customer,phone}',
    upper(p_payload#>>'{customer,current_physical_state}'),
    v_service,
    'processing', 'pending_review',
    now(),
    null,
    jsonb_build_object(
      'source', 'partner_api',
      'schema_version', p_schema_version,
      'pets', coalesce(p_payload->'animals', '[]'::jsonb),
      'dob', p_payload#>>'{customer,date_of_birth}',
      'consents', coalesce(p_payload->'consents', '{}'::jsonb)
    ) || coalesce(p_payload#>'{assessment,answers}', '{}'::jsonb),
    v_is_test,
    'partner', p_partner_id, v_partner_order,
    p_schema_version, p_payload_hash, p_payload#>>'{payment,reference}',
    v_partner.support_owner,
    v_partner.default_communication_policy,
    v_partner.default_document_policy,
    now()
  )
  returning id into v_order_id;

  -- Structured assessment -> the CANONICAL model. The partner's own PDF is
  -- never the source of truth; this is. Under a validated target contract the
  -- rows are stored at the TARGET version so the one canonical completion
  -- gate (psd_assessment_status) evaluates them natively.
  for v_answer in
    select key as question_id, value as answer_value
    from jsonb_each(coalesce(p_payload#>'{assessment,answers}', '{}'::jsonb))
  loop
    insert into public.assessment_answers (order_id, assessment_version, question_id, answer_value, source_step, answered_at)
    values (v_order_id, v_stored_version, v_answer.question_id, v_answer.answer_value,
            case when p_target_assessment_version is null then 'partner_api' else 'partner_api_normalized' end,
            now());
  end loop;

  -- Slice 7: normalization provenance + verbatim raw payload, same transaction
  -- as the order itself. Only for target-versioned (contract) submissions.
  if p_target_assessment_version is not null then
    insert into public.partner_assessment_snapshots (
      order_id, partner_id, partner_order_id,
      source_schema_version, target_assessment_version, normalization_version,
      source_payload_hash, question_ids
    ) values (
      v_order_id, p_partner_id, v_partner_order,
      p_schema_version, p_target_assessment_version, 'norm.psd_v1.identity.1',
      p_payload_hash,
      coalesce((select jsonb_agg(k order by k)
                  from jsonb_object_keys(coalesce(p_payload#>'{assessment,answers}', '{}'::jsonb)) as k),
               '[]'::jsonb)
    );

    insert into private.partner_raw_submissions (
      order_id, partner_id, partner_order_id, schema_version, payload, payload_hash
    ) values (
      v_order_id, p_partner_id, v_partner_order, p_schema_version, p_payload, p_payload_hash
    );
  end if;

  -- Financial snapshot. Frozen at acceptance, so editing the rate card later
  -- can never rewrite this order's economics.
  insert into public.partner_order_financials (
    order_id, partner_id, rate_card_id, rate_card_version,
    wholesale_fee_cents, currency, provider_earning_rule, provider_earning_rule_version,
    billable_status, billable_reason
  ) values (
    v_order_id, p_partner_id, v_rate.id, v_rate.version,
    v_rate.wholesale_unit_price_cents, v_rate.currency,
    v_rate.provider_earning_rule, v_rate.provider_earning_rule_version,
    'pending', 'awaiting clinical completion'
  );

  insert into private.partner_api_requests (
    partner_id, idempotency_key, request_hash, partner_order_id, order_id, outcome, response_code, http_status)
  values (p_partner_id, p_idempotency_key, p_payload_hash, v_partner_order, v_order_id, 'accepted', 'accepted', 201)
  on conflict (partner_id, idempotency_key) do nothing;

  return query select v_order_id, v_conf, now()::timestamptz,
                      v_partner.default_communication_policy, v_partner.default_document_policy, false;
end;
$function$;

revoke all on function public.partner_accept_order(uuid, jsonb, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.partner_accept_order(uuid, jsonb, text, text, text, text, text)
  to service_role;
