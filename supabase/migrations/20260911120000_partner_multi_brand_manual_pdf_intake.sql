-- PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001
--
-- Multi-partner profile fields, effective-dated rate management, the manual
-- (PDF) intake draft store, the private intake bucket, the intake-method stamp
-- on canonical acceptance, and the Accounts "Partner Contribution" projection.
--
-- PRINCIPLES (unchanged from the foundation):
--   * A partner is a ROW. Nothing here names Rapid ESA Letter or SignMyESA.
--   * Manual and API orders converge on ONE acceptance path:
--     public.partner_accept_order(). The manual path only adds a reviewed,
--     admin-confirmed payload in front of it and stamps intake_method.
--   * Economics stay admin-only (is_chat_admin). Providers get zero rows.
--   * Every function: SECURITY DEFINER + pinned search_path + revoke by name
--     from public, anon AND authenticated, then an explicit grant.
--   * Audit metadata carries field NAMES and identifiers, never PHI, never a
--     raw page of text, never a secret, never a wholesale amount.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Partner profile: verified domain + intake mode
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.partner_organizations
  add column if not exists domain text,
  add column if not exists domain_verified_at timestamptz,
  add column if not exists intake_mode text not null default 'api';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partner_org_intake_mode_valid') then
    alter table public.partner_organizations
      add constraint partner_org_intake_mode_valid check (intake_mode in ('manual','api','both'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'partner_org_domain_format') then
    alter table public.partner_organizations
      add constraint partner_org_domain_format
      check (domain is null or domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$');
  end if;
end $$;

create unique index if not exists partner_organizations_domain_key
  on public.partner_organizations (domain) where domain is not null;

comment on column public.partner_organizations.intake_mode is
  'How this partner delivers paid orders: manual (admin uploads the partner PDF), api, or both. Manual intake is refused for api-only partners and vice versa.';
comment on column public.partner_organizations.domain is
  'The partner''s own web domain (display / verification only). NEVER used for attribution, UTM, GHL, Stripe or ad-platform data.';

-- ── partner_admin_update_profile: allowlisted jsonb patch ────────────────────
create or replace function public.partner_admin_update_profile(p_partner_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_org     public.partner_organizations%rowtype;
  v_key     text;
  v_allowed constant text[] := array[
    'domain','domain_verified','intake_mode','default_communication_policy',
    'default_document_policy','support_owner','allowed_services','allowed_states'];
  v_domain  text;
  v_fields  text[] := '{}';
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch must be a JSON object' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (v_allowed)) then
      raise exception 'unknown profile field: %', v_key using errcode = '22023';
    end if;
    v_fields := array_append(v_fields, v_key);
  end loop;

  select * into v_org from public.partner_organizations where id = p_partner_id for update;
  if not found then raise exception 'partner not found' using errcode = 'P0002'; end if;
  if v_org.status = 'terminated' then
    raise exception 'this organization is archived' using errcode = '42501';
  end if;

  if p_patch ? 'domain' then
    v_domain := nullif(lower(trim(coalesce(p_patch->>'domain', ''))), '');
    v_domain := regexp_replace(coalesce(v_domain, ''), '^https?://', '');
    v_domain := regexp_replace(v_domain, '/.*$', '');
    v_domain := nullif(regexp_replace(v_domain, '^www\.', ''), '');
    if v_domain is not null and v_domain !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then
      raise exception 'domain must be a bare hostname such as example.com' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'intake_mode' and coalesce(p_patch->>'intake_mode','') not in ('manual','api','both') then
    raise exception 'intake_mode must be manual, api or both' using errcode = '22023';
  end if;
  if p_patch ? 'default_communication_policy' and not exists (
      select 1 from public.partner_policy_vocabulary
       where kind = 'communication' and value = p_patch->>'default_communication_policy') then
    raise exception 'unknown communication policy' using errcode = '22023';
  end if;
  if p_patch ? 'default_document_policy' and not exists (
      select 1 from public.partner_policy_vocabulary
       where kind = 'document' and value = p_patch->>'default_document_policy') then
    raise exception 'unknown document policy' using errcode = '22023';
  end if;
  if p_patch ? 'support_owner' and coalesce(p_patch->>'support_owner','') not in ('partner','pawtenant') then
    raise exception 'support_owner must be partner or pawtenant' using errcode = '22023';
  end if;
  if p_patch ? 'allowed_services' and (
      jsonb_typeof(p_patch->'allowed_services') <> 'array'
      or exists (select 1 from jsonb_array_elements_text(p_patch->'allowed_services') s where s not in ('esa','psd'))) then
    raise exception 'allowed_services may only contain esa and psd' using errcode = '22023';
  end if;
  if p_patch ? 'allowed_states' and (
      jsonb_typeof(p_patch->'allowed_states') <> 'array'
      or exists (select 1 from jsonb_array_elements_text(p_patch->'allowed_states') s where s !~ '^[A-Z]{2}$')) then
    raise exception 'allowed_states must be two-letter state codes' using errcode = '22023';
  end if;

  begin
    update public.partner_organizations
       set domain = case when p_patch ? 'domain' then v_domain else domain end,
           domain_verified_at = case
             when p_patch ? 'domain' and v_domain is distinct from domain then null
             when p_patch ? 'domain_verified' and (p_patch->>'domain_verified')::boolean then coalesce(domain_verified_at, now())
             when p_patch ? 'domain_verified' and not (p_patch->>'domain_verified')::boolean then null
             else domain_verified_at end,
           intake_mode = coalesce(p_patch->>'intake_mode', intake_mode),
           default_communication_policy = coalesce(p_patch->>'default_communication_policy', default_communication_policy),
           default_document_policy = coalesce(p_patch->>'default_document_policy', default_document_policy),
           support_owner = coalesce(p_patch->>'support_owner', support_owner),
           allowed_services = case when p_patch ? 'allowed_services'
             then (select coalesce(array_agg(s), '{}') from jsonb_array_elements_text(p_patch->'allowed_services') s)
             else allowed_services end,
           allowed_states = case when p_patch ? 'allowed_states'
             then (select coalesce(array_agg(s), '{}') from jsonb_array_elements_text(p_patch->'allowed_states') s)
             else allowed_states end,
           updated_by = auth.uid()
     where id = p_partner_id;
  exception when unique_violation then
    raise exception 'that domain already belongs to another partner' using errcode = '23505';
  end;

  perform private.partner_admin_audit('partner_admin_profile_updated', 'partner_organization', p_partner_id::text,
    jsonb_build_object('fields', to_jsonb(v_fields)));
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Effective-dated rate management (history preserved, old orders untouched)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A rate change CLOSES the open card (effective_to = new effective_from) and
-- inserts version+1. Accepted orders carry their own immutable
-- partner_order_financials snapshot, so a later card can never re-price them;
-- issued invoices are frozen by tg_partner_invoice_guard. This function never
-- updates an amount on an existing card.

create or replace function public.partner_admin_set_rate(
  p_partner_id uuid,
  p_service text,
  p_environment text,
  p_amount_cents integer,
  p_effective_from timestamptz default now(),
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_org      public.partner_organizations%rowtype;
  v_open     public.partner_rate_cards%rowtype;
  v_version  integer;
  v_id       uuid;
  v_from     timestamptz := coalesce(p_effective_from, now());
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_service not in ('esa','psd') then
    raise exception 'service must be esa or psd' using errcode = '22023';
  end if;
  if p_environment not in ('sandbox','production') then
    raise exception 'environment must be sandbox or production' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'amount must be a positive number of cents' using errcode = '22023';
  end if;
  if v_from < now() - interval '5 minutes' then
    raise exception 'a rate cannot be back-dated; historical orders keep their own snapshot' using errcode = '22023';
  end if;

  select * into v_org from public.partner_organizations where id = p_partner_id for update;
  if not found then raise exception 'partner not found' using errcode = 'P0002'; end if;
  if v_org.status = 'terminated' then
    raise exception 'this organization is archived' using errcode = '42501';
  end if;

  select * into v_open from public.partner_rate_cards
   where partner_id = p_partner_id and service = p_service and environment = p_environment
     and effective_to is null
   for update;
  if found then
    if v_open.effective_from > v_from then
      raise exception 'a later-dated rate is already scheduled for this service' using errcode = '22023';
    end if;
    update public.partner_rate_cards
       set effective_to = v_from
     where id = v_open.id;
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.partner_rate_cards
   where partner_id = p_partner_id and service = p_service and environment = p_environment;

  insert into public.partner_rate_cards (
    partner_id, service, environment, version, wholesale_unit_price_cents, currency,
    provider_earning_rule, provider_earning_rule_version, effective_from, effective_to,
    additional_service_rules, cancellation_policy, notes, created_by
  ) values (
    p_partner_id, p_service, p_environment, v_version, p_amount_cents, coalesce(v_open.currency, 'USD'),
    coalesce(v_open.provider_earning_rule, 'doctor_profiles.per_order_rate'),
    coalesce(v_open.provider_earning_rule_version, 1),
    v_from, null,
    coalesce(v_open.additional_service_rules, '{}'::jsonb),
    coalesce(v_open.cancellation_policy, '{}'::jsonb),
    p_notes, auth.uid()
  ) returning id into v_id;

  -- Version + timing only. The amount is economics and stays out of the
  -- broadly-readable audit stream; the rate card itself is is_chat_admin-only.
  perform private.partner_admin_audit('partner_admin_rate_set', 'partner_rate_card', v_id::text,
    jsonb_build_object('service', p_service, 'environment', p_environment, 'version', v_version,
                       'supersedes_version', v_open.version, 'effective_from', v_from));
  return v_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Intake method on the canonical order (api | manual)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.orders add column if not exists partner_intake_method text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_partner_intake_method_valid') then
    alter table public.orders add constraint orders_partner_intake_method_valid
      check (partner_intake_method is null or partner_intake_method in ('api','manual'));
  end if;
end $$;

-- Freeze the new column with the other partner snapshot columns. Body is the
-- deployed definition plus one array element.
create or replace function public.tg_orders_partner_snapshot_immutable()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_frozen constant text[] := array['partner_id','partner_order_id','partner_payload_hash',
    'partner_payload_schema_version','partner_communication_policy','partner_document_policy','partner_accepted_at',
    'partner_intake_method'];
  v_col text; v_old jsonb := to_jsonb(old); v_new jsonb := to_jsonb(new);
begin
  if old.order_origin is distinct from 'partner' then return new; end if;
  if new.order_origin is distinct from 'partner' then
    raise exception 'orders: order_origin is immutable once an order is accepted as a partner order' using errcode='23514';
  end if;
  foreach v_col in array v_frozen loop
    if (v_old -> v_col) is distinct from (v_new -> v_col)
       and (v_old -> v_col) is not null and (v_old ->> v_col) <> '' then
      raise exception 'orders: % is an immutable partner snapshot (order %)', v_col, old.id using errcode='23514';
    end if;
  end loop;
  return new;
end; $$;

-- partner_accept_order: the deployed 7-arg body verbatim + p_intake_method.
-- The 7-arg signature is dropped so PostgREST resolution stays unambiguous;
-- every existing caller passes named arguments and the new one defaults.
drop function if exists public.partner_accept_order(uuid, jsonb, text, text, text, text, text);

create or replace function public.partner_accept_order(
  p_partner_id uuid,
  p_payload jsonb,
  p_payload_hash text,
  p_schema_version text,
  p_idempotency_key text,
  p_request_id text,
  p_target_assessment_version text default null,
  p_intake_method text default 'api'
)
returns table(order_id uuid, confirmation_id text, accepted_at timestamptz, communication_policy text, document_policy text, replayed boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
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
  v_stored_version text := coalesce(p_target_assessment_version, p_schema_version);
begin
  if coalesce(p_intake_method, '') not in ('api','manual') then
    raise exception 'intake_method must be api or manual' using errcode = '22023';
  end if;

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

  select * into v_rate from public.partner_rate_cards
   where partner_id = p_partner_id and service = v_service
     and environment = case when v_partner.production_enabled then 'production' else 'sandbox' end
     and effective_from <= now() and (effective_to is null or effective_to > now())
   order by version desc limit 1;
  if not found then raise exception 'no_rate_card' using errcode = 'P0002'; end if;

  v_is_test := v_email like '%.test' or v_email like '%.invalid';

  loop
    v_attempt := v_attempt + 1;
    v_conf := 'PT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (select 1 from public.orders o where o.confirmation_id = v_conf);
    if v_attempt > 10 then raise exception 'confirmation_id_collision'; end if;
  end loop;

  insert into public.orders (
    confirmation_id, email, first_name, last_name, phone, state, letter_type,
    status, doctor_status,
    paid_at,
    price,
    assessment_answers, is_test,
    order_origin, partner_id, partner_order_id,
    partner_payload_schema_version, partner_payload_hash, partner_payment_reference,
    partner_support_owner, partner_communication_policy, partner_document_policy,
    partner_accepted_at, partner_intake_method
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
      'source', case when p_intake_method = 'manual' then 'partner_manual' else 'partner_api' end,
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
    now(), p_intake_method
  )
  returning id into v_order_id;

  for v_answer in
    select key as question_id, value as answer_value
    from jsonb_each(coalesce(p_payload#>'{assessment,answers}', '{}'::jsonb))
  loop
    insert into public.assessment_answers (order_id, assessment_version, question_id, answer_value, source_step, answered_at)
    values (v_order_id, v_stored_version, v_answer.question_id, v_answer.answer_value,
            case when p_target_assessment_version is null then 'partner_api' else 'partner_api_normalized' end,
            now());
  end loop;

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
$$;

revoke all on function public.partner_accept_order(uuid, jsonb, text, text, text, text, text, text) from public;
revoke all on function public.partner_accept_order(uuid, jsonb, text, text, text, text, text, text) from anon;
revoke all on function public.partner_accept_order(uuid, jsonb, text, text, text, text, text, text) from authenticated;
grant execute on function public.partner_accept_order(uuid, jsonb, text, text, text, text, text, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Private intake bucket (no public URL, no client policy: service role only)
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-intake', 'partner-intake', false, 15728640, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 15728640, allowed_mime_types = array['application/pdf'];

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Manual intake drafts
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.partner_intake_drafts (
  id                      uuid primary key default gen_random_uuid(),
  partner_id              uuid not null references public.partner_organizations(id) on delete restrict,
  status                  text not null default 'uploaded',
  source_kind             text not null default 'pdf',
  original_filename       text not null,
  mime_type               text not null default 'application/pdf',
  file_size_bytes         integer not null,
  file_sha256             text not null,
  page_count              integer,
  storage_bucket          text not null default 'partner-intake',
  storage_path            text not null,
  uploaded_by             uuid not null,
  uploaded_by_email       text,
  uploaded_at             timestamptz not null default now(),
  extraction_engine       text,
  extraction_version      text,
  extraction_method       text,
  extraction_attempts     integer not null default 0,
  extraction_started_at   timestamptz,
  extraction_completed_at timestamptz,
  extraction_error_code   text,
  extracted_fields        jsonb not null default '{}'::jsonb,
  extracted_pets          jsonb not null default '[]'::jsonb,
  extracted_qa            jsonb not null default '[]'::jsonb,
  reviewed_fields         jsonb,
  review_issues           jsonb not null default '[]'::jsonb,
  review_version          integer not null default 0,
  reviewed_by             uuid,
  reviewed_at             timestamptz,
  external_order_id       text,
  service                 text,
  -- RESTRICT, not SET NULL: a committed draft must never lose the order it
  -- produced (the committed_consistent check below would refuse it anyway).
  committed_order_id      uuid references public.orders(id) on delete restrict,
  committed_at            timestamptz,
  committed_by            uuid,
  commit_claimed_at       timestamptz,
  commit_error_code       text,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  cancel_reason           text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint partner_intake_status_valid check (status in (
    'uploaded','extraction_pending','ocr_required','extraction_failed',
    'review_required','reviewed','committing','committed','cancelled')),
  constraint partner_intake_source_valid check (source_kind in ('pdf')),
  constraint partner_intake_method_valid check (extraction_method is null or extraction_method in ('text','ocr','mixed')),
  constraint partner_intake_service_valid check (service is null or service in ('esa','psd')),
  constraint partner_intake_sha_format check (file_sha256 ~ '^[0-9a-f]{64}$'),
  constraint partner_intake_size_positive check (file_size_bytes > 0),
  constraint partner_intake_committed_consistent check (
    (status = 'committed') = (committed_order_id is not null))
);

-- Duplicate boundaries. Per partner, never across partners: two partners may
-- legitimately reuse the same external order number.
create unique index if not exists partner_intake_drafts_sha_active
  on public.partner_intake_drafts (partner_id, file_sha256) where status <> 'cancelled';
create unique index if not exists partner_intake_drafts_external_active
  on public.partner_intake_drafts (partner_id, lower(external_order_id))
  where external_order_id is not null and status <> 'cancelled';
create index if not exists partner_intake_drafts_partner_idx
  on public.partner_intake_drafts (partner_id, created_at desc);
create index if not exists partner_intake_drafts_status_idx
  on public.partner_intake_drafts (status) where status not in ('committed','cancelled');

comment on table public.partner_intake_drafts is
  'Manual partner-order intake. A PDF upload becomes a draft; extraction fills extracted_*; an admin reviews and corrects; commit runs the canonical partner_accept_order(). Extraction NEVER creates an order.';

create or replace function public.tg_partner_intake_draft_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_cleanup boolean := coalesce(current_setting('app.fixture_cleanup', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    if v_cleanup or old.status = 'cancelled' then return old; end if;
    raise exception 'partner_intake_drafts: only cancelled drafts may be deleted' using errcode = '23514';
  end if;
  -- UPDATE
  if v_cleanup then new.updated_at := now(); return new; end if;
  if new.partner_id is distinct from old.partner_id
     or new.file_sha256 is distinct from old.file_sha256
     or new.storage_bucket is distinct from old.storage_bucket
     or new.storage_path is distinct from old.storage_path
     or new.uploaded_by is distinct from old.uploaded_by
     or new.uploaded_at is distinct from old.uploaded_at
     or new.file_size_bytes is distinct from old.file_size_bytes then
    raise exception 'partner_intake_drafts: the uploaded artifact identity is immutable' using errcode = '23514';
  end if;
  if old.status = 'committed' then
    raise exception 'partner_intake_drafts: a committed draft is immutable' using errcode = '23514';
  end if;
  if old.committed_order_id is not null and new.committed_order_id is distinct from old.committed_order_id then
    raise exception 'partner_intake_drafts: committed_order_id is immutable once set' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists partner_intake_draft_guard on public.partner_intake_drafts;
create trigger partner_intake_draft_guard
  before update or delete on public.partner_intake_drafts
  for each row execute function public.tg_partner_intake_draft_guard();

alter table public.partner_intake_drafts enable row level security;
alter table public.partner_intake_drafts force row level security;
revoke all on public.partner_intake_drafts from public;
revoke all on public.partner_intake_drafts from anon;
revoke all on public.partner_intake_drafts from authenticated;
grant select on public.partner_intake_drafts to authenticated;
grant all on public.partner_intake_drafts to service_role;
drop policy if exists partner_intake_drafts_admin_read on public.partner_intake_drafts;
create policy partner_intake_drafts_admin_read on public.partner_intake_drafts
  for select to authenticated using (public.is_chat_admin());

-- Extracted page text lives in the deny-all private schema: it is PHI, it is
-- needed for extraction retry without re-upload, and no client role may read it.
create table if not exists private.partner_intake_page_text (
  id          uuid primary key default gen_random_uuid(),
  draft_id    uuid not null references public.partner_intake_drafts(id) on delete cascade,
  page_no     integer not null,
  method      text not null,
  engine      text not null,
  char_count  integer not null default 0,
  text        text not null,
  created_at  timestamptz not null default now(),
  constraint partner_intake_page_method_valid check (method in ('text','ocr')),
  constraint partner_intake_page_no_positive check (page_no >= 1)
);
create unique index if not exists partner_intake_page_text_key
  on private.partner_intake_page_text (draft_id, page_no, method);
alter table private.partner_intake_page_text enable row level security;
revoke all on private.partner_intake_page_text from public;
revoke all on private.partner_intake_page_text from anon;
revoke all on private.partner_intake_page_text from authenticated;
grant all on private.partner_intake_page_text to service_role;

-- The private schema is NOT exposed through the Data API (a .from() against it
-- is silently empty), so page text is written and read ONLY through these
-- service-role RPCs. No client role can execute them.
create or replace function public.partner_intake_store_page_text(p_draft_id uuid, p_method text, p_engine text, p_pages jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare v_n integer := 0; v_p jsonb;
begin
  if p_method not in ('text','ocr') then raise exception 'method must be text or ocr' using errcode = '22023'; end if;
  if p_pages is null or jsonb_typeof(p_pages) <> 'array' then raise exception 'pages must be an array' using errcode = '22023'; end if;
  if not exists (select 1 from public.partner_intake_drafts where id = p_draft_id) then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;
  for v_p in select * from jsonb_array_elements(p_pages) loop
    insert into private.partner_intake_page_text (draft_id, page_no, method, engine, char_count, text)
    values (p_draft_id, (v_p->>'page')::integer, p_method, coalesce(p_engine, 'unknown'),
            length(coalesce(v_p->>'text', '')), coalesce(v_p->>'text', ''))
    on conflict (draft_id, page_no, method) do update
      set engine = excluded.engine, char_count = excluded.char_count, text = excluded.text, created_at = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.partner_intake_read_page_text(p_draft_id uuid)
returns table(page_no integer, method text, engine text, char_count integer, text text)
language sql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
  select t.page_no, t.method, t.engine, t.char_count, t.text
    from private.partner_intake_page_text t
   where t.draft_id = p_draft_id
   order by t.page_no, t.method;
$$;

create or replace function public.partner_intake_purge_page_text(p_draft_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare v_n integer;
begin
  delete from private.partner_intake_page_text where draft_id = p_draft_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.partner_intake_store_page_text(uuid, text, text, jsonb)',
    'public.partner_intake_read_page_text(uuid)',
    'public.partner_intake_purge_page_text(uuid)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('revoke all on function %s from authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Intake audit writer (service-role only; called by the edge function with
--    the VERIFIED admin identity). Never PHI, never page text.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.partner_intake_audit(
  p_actor_id uuid,
  p_actor_email text,
  p_action text,
  p_draft_id uuid,
  p_partner_id uuid,
  p_order_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_forbidden constant text[] := array['email','phone','first_name','last_name','address','answers','text','page_text','secret','token'];
  v_key text;
begin
  if p_action !~ '^partner_intake_[a-z_]+$' then
    raise exception 'unknown intake audit action' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(coalesce(p_metadata, '{}'::jsonb)) loop
    if v_key = any (v_forbidden) then
      raise exception 'intake audit metadata must not carry %', v_key using errcode = '22023';
    end if;
  end loop;
  insert into public.audit_logs (actor_id, actor_name, actor_role, actor_type,
                                 object_type, object_id, action, entity_type, entity_id,
                                 order_id, category, source, metadata)
  values (p_actor_id, coalesce(p_actor_email, 'admin'), 'admin', 'admin',
          'partner_platform', p_draft_id::text, p_action, 'partner_intake_draft', p_draft_id::text,
          p_order_id, 'partner_intake', 'partner-manual-intake',
          coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('partner_id', p_partner_id));
end;
$$;
revoke all on function public.partner_intake_audit(uuid, text, text, uuid, uuid, uuid, jsonb) from public;
revoke all on function public.partner_intake_audit(uuid, text, text, uuid, uuid, uuid, jsonb) from anon;
revoke all on function public.partner_intake_audit(uuid, text, text, uuid, uuid, uuid, jsonb) from authenticated;
grant execute on function public.partner_intake_audit(uuid, text, text, uuid, uuid, uuid, jsonb) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Contribution recognised on clinical completion: the deployed billable
--    trigger verbatim + one audit row (no amount in the audit stream).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.tg_partner_billable_on_completion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_fin public.partner_order_financials%rowtype;
  v_event_id uuid;
begin
  if new.order_origin is distinct from 'partner' then return new; end if;
  if new.doctor_status is distinct from 'patient_notified' then return new; end if;
  if old.doctor_status is not distinct from new.doctor_status then return new; end if;

  select * into v_fin from public.partner_order_financials where order_id = new.id;
  if not found then
    raise exception 'partner order % has no financial snapshot — completion refused', new.id
      using errcode = '23514';
  end if;

  insert into public.partner_billable_events (
    order_id, partner_id, service, event_kind, event_type,
    occurred_at, amount_cents, currency, rate_card_id, rate_card_version, created_by
  ) values (
    new.id, new.partner_id, lower(coalesce(new.letter_type, 'esa')), 'charge', 'clinical_work_completed',
    now(), v_fin.wholesale_fee_cents, v_fin.currency, v_fin.rate_card_id, v_fin.rate_card_version,
    'orders_completion_trigger'
  )
  on conflict (order_id) where event_kind = 'charge' do nothing
  returning id into v_event_id;

  update public.partner_order_financials
     set billable_status = 'billable',
         billable_reason = 'clinical work completed',
         clinical_completed_at = coalesce(clinical_completed_at, now()),
         invoice_eligible = true
   where order_id = new.id and billable_status = 'pending';

  if v_event_id is not null then
    insert into public.audit_logs (actor_type, actor_name, actor_role, object_type, object_id,
                                   action, entity_type, entity_id, order_id, category, source, metadata)
    values ('system', 'orders_completion_trigger', 'system', 'partner_platform', new.id::text,
            'partner_contribution_recognized', 'partner_billable_event', v_event_id::text, new.id,
            'partner_finance', 'tg_partner_billable_on_completion',
            jsonb_build_object('partner_id', new.partner_id, 'service', lower(coalesce(new.letter_type, 'esa')),
                               'rate_card_version', v_fin.rate_card_version,
                               'intake_method', coalesce(new.partner_intake_method, 'api')));
  end if;

  new.partner_clinical_completed_at := coalesce(new.partner_clinical_completed_at, now());
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Accounts › Partner Contribution (admin-only projection; NY calendar)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- One row per RECOGNISED partner charge (the clinical_work_completed billable
-- event). Net Partner Contribution = recognised charge − provider payout −
-- approved partner credits. Provider payout is the canonical earnings ledger
-- (doctor_earnings, dollars) for that order — never derived from the charge.
-- This projection reads nothing from Stripe and writes nothing anywhere.

create or replace function public.get_partner_contribution_summary(p_from date, p_to date)
returns table (
  event_id uuid,
  partner_id uuid,
  partner_name text,
  partner_slug text,
  order_id uuid,
  confirmation_id text,
  partner_order_id text,
  service text,
  intake_method text,
  is_test boolean,
  recognized_at timestamptz,
  recognized_date_ny date,
  charge_cents integer,
  credit_cents integer,
  provider_payout_cents integer,
  net_contribution_cents integer,
  billable_status text,
  invoice_status text,
  invoice_number text,
  invoice_payment_status text
)
language sql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
  select
    e.id as event_id,
    e.partner_id,
    po.display_name as partner_name,
    po.slug as partner_slug,
    o.id as order_id,
    o.confirmation_id,
    o.partner_order_id,
    e.service,
    coalesce(o.partner_intake_method, 'api') as intake_method,
    coalesce(o.is_test, false) as is_test,
    e.occurred_at as recognized_at,
    (e.occurred_at at time zone 'America/New_York')::date as recognized_date_ny,
    e.amount_cents as charge_cents,
    coalesce((select sum(c.amount_cents)::integer from public.partner_billable_events c
               where c.related_event_id = e.id and c.event_kind = 'credit'), 0) as credit_cents,
    coalesce((select (sum(de.doctor_amount) * 100)::integer from public.doctor_earnings de
               where de.order_id = o.id and coalesce(de.status, '') not in ('refunded','voided','cancelled')), 0) as provider_payout_cents,
    e.amount_cents
      + coalesce((select sum(c.amount_cents)::integer from public.partner_billable_events c
                   where c.related_event_id = e.id and c.event_kind = 'credit'), 0)
      - coalesce((select (sum(de.doctor_amount) * 100)::integer from public.doctor_earnings de
                   where de.order_id = o.id and coalesce(de.status, '') not in ('refunded','voided','cancelled')), 0)
      as net_contribution_cents,
    f.billable_status,
    f.invoice_status,
    inv.invoice_number,
    inv.status as invoice_payment_status
  from public.partner_billable_events e
  join public.orders o on o.id = e.order_id
  join public.partner_organizations po on po.id = e.partner_id
  left join public.partner_order_financials f on f.order_id = o.id
  left join public.partner_invoice_lines il on il.billable_event_id = e.id
  left join public.partner_invoices inv on inv.id = il.invoice_id and inv.status <> 'void'
  where public.is_chat_admin()
    and e.event_kind = 'charge'
    and (e.occurred_at at time zone 'America/New_York')::date between p_from and p_to
  order by e.occurred_at desc;
$$;
revoke all on function public.get_partner_contribution_summary(date, date) from public;
revoke all on function public.get_partner_contribution_summary(date, date) from anon;
grant execute on function public.get_partner_contribution_summary(date, date) to authenticated;
grant execute on function public.get_partner_contribution_summary(date, date) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. ACLs for the new admin functions
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare f text;
begin
  foreach f in array array[
    'public.partner_admin_update_profile(uuid, jsonb)',
    'public.partner_admin_set_rate(uuid, text, text, integer, timestamptz, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
