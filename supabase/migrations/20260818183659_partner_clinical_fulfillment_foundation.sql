-- PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001
--
-- Generic B2B clinical-fulfillment partner model. Rapid ESA Letter is the first
-- configured partner, but nothing here is Rapid-specific: Rapid is one row in
-- partner_organizations plus two rows in partner_rate_cards.
--
-- REUSE, NOT DUPLICATION (see docs/partner-api/ARCHITECTURE-NOTE.md):
--   * partner orders are ordinary public.orders rows
--   * the clinical assessment lives in public.assessment_answers
--   * the provider payout truth stays doctor_profiles.per_order_rate ->
--     doctor_earnings.doctor_amount. Nothing here recomputes it.
--   * lifecycle stays order_workflow_state(); one origin-guarded arm is added
--     and direct-order output is provably unchanged (see §6 of the note).
--
-- SECURITY POSTURE
--   * every new public table: RLS ENABLED *and* FORCED, privileges revoked from
--     public/anon/authenticated BY NAME, then granted narrowly.
--   * canonical admin predicate is public.is_chat_admin() (owner/admin_manager,
--     active). auth.jwt()->'user_metadata' is never consulted.
--   * credential material and server-only integration state live in the private
--     schema, which is not exposed to the Data API.
--   * money never touches public.orders: providers can read their assigned
--     orders, so the wholesale fee and margin live in a separate admin-only
--     table (partner_order_financials).


-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Shared vocabulary
-- ═══════════════════════════════════════════════════════════════════════════

-- Communication policy. 'pawtenant_managed' is the historical behaviour for
-- every direct order; 'partner_managed' means WE send the customer nothing.
create table if not exists public.partner_policy_vocabulary (
  kind  text not null,
  value text not null,
  description text not null,
  primary key (kind, value)
);

insert into public.partner_policy_vocabulary (kind, value, description) values
  ('communication', 'pawtenant_managed', 'PawTenant owns customer communication (default for direct orders).'),
  ('communication', 'partner_managed',   'The partner owns ALL customer communication. PawTenant sends the customer nothing.'),
  ('document',      'pawtenant_branded', 'PawTenant letter, QR verification and footer (default for direct orders).'),
  ('document',      'partner_neutral',   'Provider letterhead only. No PawTenant logo, QR, verification ID, footer or portal delivery.')
on conflict (kind, value) do update set description = excluded.description;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Partner organization
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.partner_organizations (
  id                            uuid primary key default gen_random_uuid(),
  slug                          text not null,
  legal_name                    text not null,
  display_name                  text not null,
  status                        text not null default 'draft',
  production_enabled            boolean not null default false,
  billing_contact               jsonb not null default '{}'::jsonb,
  technical_contact             jsonb not null default '{}'::jsonb,
  -- Who answers the customer. For a wholesale partner this is the partner.
  support_owner                 text not null default 'partner',
  -- Services the partner may order. Values are orders.letter_type values, so the
  -- ESA/PSD taxonomy has exactly one definition (_shared/letterType.ts).
  allowed_services              text[] not null default '{}',
  -- Explicit state allowlist. EMPTY means "derive from the provider licence
  -- matrix" -- we never assert coverage we cannot staff.
  allowed_states                text[] not null default '{}',
  default_communication_policy  text not null default 'partner_managed',
  default_document_policy       text not null default 'partner_neutral',
  notes                         text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  created_by                    uuid,
  updated_by                    uuid,
  constraint partner_org_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint partner_org_status_valid
    check (status in ('draft','sandbox','active','paused','terminated')),
  constraint partner_org_support_owner_valid
    check (support_owner in ('partner','pawtenant')),
  constraint partner_org_services_valid
    check (allowed_services <@ array['esa','psd']::text[]),
  constraint partner_org_comm_policy_valid
    check (default_communication_policy in ('pawtenant_managed','partner_managed')),
  constraint partner_org_doc_policy_valid
    check (default_document_policy in ('pawtenant_branded','partner_neutral')),
  -- A partner may only be production-enabled once it is genuinely active. This
  -- is a database-level backstop for the go-live checklist, not a substitute
  -- for it.
  constraint partner_org_production_requires_active
    check (production_enabled = false or status = 'active')
);

create unique index if not exists partner_organizations_slug_key
  on public.partner_organizations (slug);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Rate cards -- RECORDS, never business logic in code
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.partner_rate_cards (
  id                             uuid primary key default gen_random_uuid(),
  partner_id                     uuid not null references public.partner_organizations(id) on delete restrict,
  service                        text not null,
  environment                    text not null default 'sandbox',
  version                        integer not null default 1,
  wholesale_unit_price_cents     integer not null,
  currency                       text not null default 'USD',
  -- A REFERENCE to the canonical provider-earning rule. The amount itself is
  -- resolved from doctor_profiles.per_order_rate at assignment time. This
  -- column exists so an order can record WHICH rule applied, never to restate
  -- the rule or become a second payout truth.
  provider_earning_rule          text not null default 'doctor_profiles.per_order_rate',
  provider_earning_rule_version  integer not null default 1,
  effective_from                 timestamptz not null default now(),
  effective_to                   timestamptz,
  additional_service_rules       jsonb not null default '{}'::jsonb,
  -- When a case is billable despite cancellation / non-qualification. Clinical
  -- independence lives here: a completed evaluation is billable and payable
  -- regardless of the qualification outcome.
  cancellation_policy            jsonb not null default '{}'::jsonb,
  notes                          text,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  created_by                     uuid,
  constraint partner_rate_card_service_valid     check (service in ('esa','psd')),
  constraint partner_rate_card_environment_valid check (environment in ('sandbox','production')),
  constraint partner_rate_card_price_positive    check (wholesale_unit_price_cents > 0),
  constraint partner_rate_card_currency_valid    check (currency ~ '^[A-Z]{3}$'),
  constraint partner_rate_card_window_ordered    check (effective_to is null or effective_to > effective_from)
);

create unique index if not exists partner_rate_cards_version_key
  on public.partner_rate_cards (partner_id, service, environment, version);

-- Only ONE rate card may be open-ended (currently in force) per
-- partner/service/environment. Without this a second "current" card makes
-- "which price applies" ambiguous.
create unique index if not exists partner_rate_cards_one_current
  on public.partner_rate_cards (partner_id, service, environment)
  where effective_to is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Partner identity ON public.orders -- identity + policy ONLY, never money
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists order_origin                   text not null default 'direct',
  add column if not exists partner_id                     uuid references public.partner_organizations(id) on delete restrict,
  add column if not exists partner_order_id               text,
  add column if not exists partner_payload_schema_version text,
  add column if not exists partner_payload_hash           text,
  add column if not exists partner_payment_reference      text,
  add column if not exists partner_support_owner          text,
  add column if not exists partner_communication_policy   text,
  add column if not exists partner_document_policy        text,
  add column if not exists partner_accepted_at            timestamptz,
  add column if not exists partner_clinical_completed_at  timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_order_origin_valid') then
    alter table public.orders
      add constraint orders_order_origin_valid check (order_origin in ('direct','partner'));
  end if;

  -- A partner order MUST carry partner identity; a direct order must carry
  -- none. This is what stops a half-populated row existing at all.
  if not exists (select 1 from pg_constraint where conname = 'orders_partner_identity_consistent') then
    alter table public.orders
      add constraint orders_partner_identity_consistent check (
        (order_origin = 'direct'
           and partner_id is null
           and partner_order_id is null
           and partner_communication_policy is null
           and partner_document_policy is null)
        or
        (order_origin = 'partner'
           and partner_id is not null
           and partner_order_id is not null
           and partner_payload_hash is not null
           and partner_communication_policy is not null
           and partner_document_policy is not null)
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'orders_partner_comm_policy_valid') then
    alter table public.orders
      add constraint orders_partner_comm_policy_valid check (
        partner_communication_policy is null
        or partner_communication_policy in ('pawtenant_managed','partner_managed')
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'orders_partner_doc_policy_valid') then
    alter table public.orders
      add constraint orders_partner_doc_policy_valid check (
        partner_document_policy is null
        or partner_document_policy in ('pawtenant_branded','partner_neutral')
      );
  end if;
end $$;

-- THE uniqueness contract: one internal order per (partner, partner order id).
-- A retry can therefore never create a second order even if the idempotency
-- ledger were bypassed.
create unique index if not exists orders_partner_order_unique
  on public.orders (partner_id, partner_order_id)
  where partner_id is not null;

create index if not exists orders_order_origin_idx
  on public.orders (order_origin)
  where order_origin <> 'direct';

create index if not exists orders_partner_lookup_idx
  on public.orders (partner_id, created_at desc)
  where partner_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Immutable partner snapshots on orders
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Mirrors the proven tg_order_entitlement_immutable / order_price_quotes_immutable
-- discipline: once an order is accepted, the economics and policy it was
-- accepted under can never be rewritten by editing a rate card or a partner
-- default. Historical orders keep their snapshotted policy.

create or replace function public.tg_orders_partner_snapshot_immutable()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_frozen constant text[] := array[
    'partner_id', 'partner_order_id', 'partner_payload_hash',
    'partner_payload_schema_version', 'partner_communication_policy',
    'partner_document_policy', 'partner_accepted_at'
  ];
  v_col text;
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
begin
  -- Only partner orders carry a snapshot to protect.
  if old.order_origin is distinct from 'partner' then
    return new;
  end if;

  -- order_origin itself can never flip away from 'partner'.
  if new.order_origin is distinct from 'partner' then
    raise exception 'orders: order_origin is immutable once an order is accepted as a partner order'
      using errcode = '23514';
  end if;

  foreach v_col in array v_frozen loop
    if (v_old -> v_col) is distinct from (v_new -> v_col)
       and (v_old -> v_col) is not null
       and (v_old ->> v_col) <> ''
    then
      raise exception 'orders: % is an immutable partner snapshot (order %)', v_col, old.id
        using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$function$;

drop trigger if exists orders_partner_snapshot_immutable on public.orders;
create trigger orders_partner_snapshot_immutable
  before update on public.orders
  for each row execute function public.tg_orders_partner_snapshot_immutable();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Partner order financials -- ADMIN ONLY (providers must never see these)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.partner_order_financials (
  id                              uuid primary key default gen_random_uuid(),
  order_id                        uuid not null references public.orders(id) on delete cascade,
  partner_id                      uuid not null references public.partner_organizations(id) on delete restrict,
  rate_card_id                    uuid not null references public.partner_rate_cards(id) on delete restrict,
  rate_card_version               integer not null,
  wholesale_fee_cents             integer not null,
  currency                        text not null default 'USD',
  provider_earning_rule           text not null,
  provider_earning_rule_version   integer not null,
  -- Snapshot of the canonical provider earning for this case. Sourced from
  -- doctor_profiles.per_order_rate at assignment; the ledger row in
  -- doctor_earnings remains the single payout truth. This is a reporting
  -- snapshot for margin, NOT a payment instruction.
  provider_earning_snapshot_cents integer,
  other_fulfillment_cost_cents    integer not null default 0,
  fulfillment_margin_cents        integer generated always as (
    wholesale_fee_cents
      - coalesce(provider_earning_snapshot_cents, 0)
      - other_fulfillment_cost_cents
  ) stored,
  -- The BILLABLE event is clinical completion, NOT qualification. A completed
  -- evaluation that returns 'not qualified' is still billable and still pays
  -- the provider in full.
  billable_status                 text not null default 'pending',
  billable_reason                 text,
  invoice_eligible                boolean not null default false,
  invoice_status                  text not null default 'uninvoiced',
  -- Deferred Phase 2 (invoicing). Deliberately un-FK'd: no invoice table exists
  -- yet and inventing one now would be building the phase we were told to defer.
  invoice_id                      uuid,
  invoice_item_ref                text,
  clinical_completed_at           timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint partner_fin_billable_valid
    check (billable_status in ('pending','billable','not_billable')),
  constraint partner_fin_invoice_status_valid
    check (invoice_status in ('uninvoiced','invoiced','paid','void')),
  constraint partner_fin_fee_non_negative
    check (wholesale_fee_cents >= 0),
  constraint partner_fin_other_cost_non_negative
    check (other_fulfillment_cost_cents >= 0),
  -- Invoice eligibility is a CONSEQUENCE of being billable, never an
  -- independent flag someone can tick.
  constraint partner_fin_eligible_requires_billable
    check (invoice_eligible = false or billable_status = 'billable'),
  constraint partner_fin_invoiced_requires_eligible
    check (invoice_status = 'uninvoiced' or invoice_status = 'void' or invoice_eligible = true)
);

create unique index if not exists partner_order_financials_order_key
  on public.partner_order_financials (order_id);

create index if not exists partner_order_financials_invoice_idx
  on public.partner_order_financials (partner_id, invoice_status, invoice_eligible);

-- The accepted economics are frozen. Only the workflow columns may move.
create or replace function public.tg_partner_financials_immutable()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if new.order_id                      is distinct from old.order_id
     or new.partner_id                 is distinct from old.partner_id
     or new.rate_card_id               is distinct from old.rate_card_id
     or new.rate_card_version          is distinct from old.rate_card_version
     or new.wholesale_fee_cents        is distinct from old.wholesale_fee_cents
     or new.currency                   is distinct from old.currency
     or new.provider_earning_rule      is distinct from old.provider_earning_rule
     or new.provider_earning_rule_version is distinct from old.provider_earning_rule_version
  then
    raise exception 'partner_order_financials: accepted economics are immutable (order %)', old.order_id
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists partner_financials_immutable on public.partner_order_financials;
create trigger partner_financials_immutable
  before update on public.partner_order_financials
  for each row execute function public.tg_partner_financials_immutable();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Earnings dimension -- ONE ledger, one extra dimension
-- ═══════════════════════════════════════════════════════════════════════════
--
-- doctor_earnings stays the single payout truth. We add only a denormalised
-- origin/partner dimension so Admin Earnings can filter Direct vs Partner
-- Fulfillment vs a named partner without joining orders on every query. A
-- trigger derives it from the order, so orders remains the source of truth and
-- the dimension cannot drift.

alter table public.doctor_earnings
  add column if not exists order_origin text not null default 'direct',
  add column if not exists partner_id   uuid references public.partner_organizations(id) on delete restrict;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'doctor_earnings_order_origin_valid') then
    alter table public.doctor_earnings
      add constraint doctor_earnings_order_origin_valid check (order_origin in ('direct','partner'));
  end if;
end $$;

create index if not exists doctor_earnings_origin_idx
  on public.doctor_earnings (order_origin, partner_id);

create or replace function public.tg_doctor_earnings_derive_origin()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_origin text;
  v_partner uuid;
begin
  if new.order_id is null then
    new.order_origin := coalesce(new.order_origin, 'direct');
    return new;
  end if;

  select o.order_origin, o.partner_id into v_origin, v_partner
  from public.orders o where o.id = new.order_id;

  -- An earning whose order cannot be read is left at its declared value rather
  -- than silently relabelled 'direct'.
  if v_origin is not null then
    new.order_origin := v_origin;
    new.partner_id   := v_partner;
  end if;
  return new;
end;
$function$;

drop trigger if exists doctor_earnings_derive_origin on public.doctor_earnings;
create trigger doctor_earnings_derive_origin
  before insert or update of order_id on public.doctor_earnings
  for each row execute function public.tg_doctor_earnings_derive_origin();

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Lifecycle -- the ONE minimal change (architecture note §6)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A partner order is genuinely paid, but by Rapid to Rapid, so it has paid_at
-- and NO payment_intent_id. Unchanged, every partner order would classify as a
-- 'lead'.
--
-- The original second arm was:
--     when o.payment_intent_id is null or o.status = 'lead' then 'lead'
-- It is split into two arms that return the same value, plus one
-- origin-guarded exception. For any DIRECT order the guard is false, so the
-- pair collapses to exactly the original disjunction. Direct output is
-- unchanged by construction and is verified row-by-row after this migration.

create or replace function public.order_workflow_state(o orders)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when o.status = 'cancelled'                                     then 'cancelled'
    when o.status = 'lead'                                          then 'lead'
    when o.payment_intent_id is null
         and not (o.order_origin = 'partner' and o.paid_at is not null)
                                                                    then 'lead'
    when o.doctor_status = 'patient_notified'                       then 'completed'
    when o.doctor_status = 'pending_admin_approval'                 then 'pending_delivery'
    when public.classify_order_service_family(
           o.letter_type, o.package_key, o.package_display_name, o.plan_type) = 'esa'
         and o.official_letter_reopened_at is not null
         and o.official_letter_final_completed_at is null           then 'reopened'
    when o.doctor_user_id is not null or o.doctor_email is not null then 'under_review'
    else 'paid_unassigned'
  end;
$function$;

-- Partner clinical lifecycle. This is an ADAPTER over the canonical classifier,
-- not a second lifecycle: it calls order_workflow_state() for the shared arms
-- and only adds the states that genuinely do not exist for direct orders
-- (validation hold, the qualification determination, and the billing tail).
--
-- CLINICAL INDEPENDENCE: 'qualified' and 'not_qualified' are determinations;
-- 'clinical_work_completed' is the billable/payable event. They are separate on
-- purpose and non-qualification is never treated as unfinished work.
create or replace function public.partner_clinical_state(o orders)
returns text
language sql
stable
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
  select case
    when o.order_origin is distinct from 'partner' then null
    when o.status = 'cancelled'                    then 'cancelled'
    -- Held before assignment: accepted but not yet safe to staff.
    when o.doctor_user_id is null
         and o.doctor_email is null
         and o.status = 'validation_hold'          then 'validation_hold'
    else (
      case public.order_workflow_state(o)
        when 'lead'            then 'received'
        when 'paid_unassigned' then 'ready_for_assignment'
        when 'under_review'    then
          case when o.additional_documentation_required
                    and coalesce(o.additional_documentation_status, '') <> 'completed'
               then 'consultation_required'
               else 'provider_review' end
        when 'pending_delivery' then 'document_ready'
        when 'completed'        then 'clinical_work_completed'
        when 'reopened'         then 'correction_required'
        else public.order_workflow_state(o)
      end
    )
  end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. PRIVATE schema -- credential material and server-only integration state
-- ═══════════════════════════════════════════════════════════════════════════
-- The private schema is not in the Data API's exposed schema list, so none of
-- this is reachable by anon or authenticated clients at all.

create schema if not exists private;

create table if not exists private.partner_api_credentials (
  id                    uuid primary key default gen_random_uuid(),
  partner_id            uuid not null references public.partner_organizations(id) on delete cascade,
  -- Public, non-secret identifier presented alongside the secret. Safe to log.
  key_id                text not null,
  -- We store ONLY a verifier. The secret itself is never persisted anywhere,
  -- never returned by any function, and never logged.
  secret_hash           text not null,
  secret_algo           text not null default 'sha256',
  environment           text not null default 'sandbox',
  scopes                text[] not null default array['orders:create','orders:read'],
  status                text not null default 'active',
  ip_allowlist          text[],
  rate_limit_per_minute integer not null default 60,
  max_payload_bytes     integer not null default 65536,
  last_used_at          timestamptz,
  last_used_ip          text,
  rotated_from_key_id   text,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  expires_at            timestamptz,
  revoked_at            timestamptz,
  revoked_reason        text,
  constraint partner_cred_env_valid    check (environment in ('sandbox','production')),
  constraint partner_cred_status_valid check (status in ('active','revoked')),
  constraint partner_cred_algo_valid   check (secret_algo in ('sha256')),
  constraint partner_cred_revoked_consistent
    check ((status = 'revoked') = (revoked_at is not null)),
  constraint partner_cred_rate_positive check (rate_limit_per_minute > 0),
  constraint partner_cred_payload_positive check (max_payload_bytes > 0)
);

create unique index if not exists partner_api_credentials_key_id
  on private.partner_api_credentials (key_id);

-- Idempotency + replay ledger. Server-only: an idempotency key is a
-- partner-supplied secret-ish value and must not be readable via the API.
create table if not exists private.partner_api_requests (
  id                uuid primary key default gen_random_uuid(),
  partner_id        uuid not null references public.partner_organizations(id) on delete cascade,
  idempotency_key   text not null,
  -- Hash of the canonicalised request body. Same key + same payload replays the
  -- stored result; same key + different payload is a conflict.
  request_hash      text not null,
  partner_order_id  text,
  order_id          uuid references public.orders(id) on delete set null,
  outcome           text not null,
  response_code     text,
  http_status       integer,
  key_id            text,
  created_at        timestamptz not null default now(),
  constraint partner_api_req_outcome_valid check (outcome in ('accepted','rejected'))
);

create unique index if not exists partner_api_requests_idem_key
  on private.partner_api_requests (partner_id, idempotency_key);

create index if not exists partner_api_requests_order_idx
  on private.partner_api_requests (order_id);

-- Throttle state. Same shape as the resume rate limiter: a peppered digest of
-- the subject, never the subject itself.
create table if not exists private.partner_api_rate_limits (
  id           uuid primary key default gen_random_uuid(),
  subject_hash text not null,
  scope        text not null,
  window_start timestamptz not null default now(),
  attempts     integer not null default 1,
  expires_at   timestamptz not null
);

create unique index if not exists partner_api_rate_limits_key
  on private.partner_api_rate_limits (subject_hash, scope, window_start);

create index if not exists partner_api_rate_limits_expiry
  on private.partner_api_rate_limits (expires_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Credential verification -- the secret is compared INSIDE the database
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Modelled on the proven verify_payout_cron_secret(): SECURITY DEFINER, empty
-- search_path, and it returns the partner SCOPE only -- never the secret, never
-- the hash. A caller that fails verification learns nothing beyond "no".
--
-- Comparison is constant-time-ish via a single digest equality on fixed-length
-- hex, and the function is deliberately silent about WHICH condition failed.

create or replace function public.partner_verify_api_credential(
  p_key_id       text,
  p_secret       text,
  p_environment  text default 'sandbox',
  p_client_ip    text default null
)
returns table (
  partner_id            uuid,
  partner_slug          text,
  partner_status        text,
  production_enabled    boolean,
  scopes                text[],
  rate_limit_per_minute integer,
  max_payload_bytes     integer,
  credential_id         uuid
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    o.id, o.slug, o.status, o.production_enabled,
    c.scopes, c.rate_limit_per_minute, c.max_payload_bytes, c.id
  from private.partner_api_credentials c
  join public.partner_organizations o on o.id = c.partner_id
  where c.key_id = p_key_id
    and c.status = 'active'
    and c.revoked_at is null
    and (c.expires_at is null or c.expires_at > now())
    and c.environment = p_environment
    -- Constant-shape digest comparison. encode(digest()) is fixed-length hex,
    -- so this does not leak length information.
    and c.secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')
    -- Optional IP allowlist: NULL/empty means "not enforced"; a populated list
    -- is enforced strictly and an unknown caller IP fails closed.
    and (
      c.ip_allowlist is null
      or cardinality(c.ip_allowlist) = 0
      or (p_client_ip is not null and p_client_ip = any (c.ip_allowlist))
    )
    -- A paused / terminated / draft partner cannot transact at all.
    and o.status in ('sandbox','active')
    -- Production credentials only work for a production-enabled partner.
    and (p_environment = 'sandbox' or o.production_enabled = true)
  limit 1;
$function$;

-- Last-used telemetry. Separate from verification so the read path stays STABLE
-- and a failed attempt never writes.
create or replace function public.partner_touch_api_credential(
  p_credential_id uuid,
  p_client_ip     text default null
)
returns void
language sql
volatile
security definer
set search_path to ''
as $function$
  update private.partner_api_credentials
     set last_used_at = now(),
         last_used_ip = p_client_ip
   where id = p_credential_id;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Row Level Security -- enable AND force, revoke BY NAME, then grant
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.partner_organizations       enable row level security;
alter table public.partner_organizations       force  row level security;
alter table public.partner_rate_cards          enable row level security;
alter table public.partner_rate_cards          force  row level security;
alter table public.partner_order_financials    enable row level security;
alter table public.partner_order_financials    force  row level security;
alter table public.partner_policy_vocabulary   enable row level security;
alter table public.partner_policy_vocabulary   force  row level security;

alter table private.partner_api_credentials    enable row level security;
alter table private.partner_api_credentials    force  row level security;
alter table private.partner_api_requests       enable row level security;
alter table private.partner_api_requests       force  row level security;
alter table private.partner_api_rate_limits    enable row level security;
alter table private.partner_api_rate_limits    force  row level security;

-- "revoke from public" does NOT undo the default grant to the authenticated
-- role, so every role is named explicitly.
revoke all on public.partner_organizations     from public, anon, authenticated;
revoke all on public.partner_rate_cards        from public, anon, authenticated;
revoke all on public.partner_order_financials  from public, anon, authenticated;
revoke all on public.partner_policy_vocabulary from public, anon, authenticated;

revoke all on private.partner_api_credentials  from public, anon, authenticated;
revoke all on private.partner_api_requests     from public, anon, authenticated;
revoke all on private.partner_api_rate_limits  from public, anon, authenticated;
revoke all on schema private                   from public, anon, authenticated;

-- The admin console reads these through the Data API as an authenticated admin,
-- so `authenticated` needs the table privilege -- but RLS then admits only
-- is_chat_admin(). Privilege alone grants nothing: with FORCE RLS on and no
-- permissive policy, an ordinary authenticated user still sees zero rows.
grant select on public.partner_organizations     to authenticated;
grant select on public.partner_rate_cards        to authenticated;
grant select on public.partner_order_financials  to authenticated;
grant select on public.partner_policy_vocabulary to authenticated;

-- Credential material is NEVER granted to the Data API roles. Only the
-- service_role (edge functions) and SECURITY DEFINER functions reach it.
grant all on private.partner_api_credentials to service_role;
grant all on private.partner_api_requests    to service_role;
grant all on private.partner_api_rate_limits to service_role;
grant usage on schema private                to service_role;

drop policy if exists partner_orgs_admin_read on public.partner_organizations;
create policy partner_orgs_admin_read on public.partner_organizations
  for select to authenticated using (public.is_chat_admin());

drop policy if exists partner_rate_cards_admin_read on public.partner_rate_cards;
create policy partner_rate_cards_admin_read on public.partner_rate_cards
  for select to authenticated using (public.is_chat_admin());

-- Partner economics: the $45 wholesale fee, the provider earning snapshot and
-- the margin. Providers must never read this, so the narrowest admin predicate
-- is used and there is no provider-side policy at all.
drop policy if exists partner_financials_admin_read on public.partner_order_financials;
create policy partner_financials_admin_read on public.partner_order_financials
  for select to authenticated using (public.is_chat_admin());

drop policy if exists partner_policy_vocab_admin_read on public.partner_policy_vocabulary;
create policy partner_policy_vocab_admin_read on public.partner_policy_vocabulary
  for select to authenticated using (public.is_chat_admin());

-- Function privileges: revoke the default EXECUTE-to-everyone, then grant only
-- where needed. The verifier is service_role-only -- an authenticated browser
-- session must never be able to test candidate API secrets.
revoke all on function public.partner_verify_api_credential(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.partner_verify_api_credential(text, text, text, text)
  to service_role;

revoke all on function public.partner_touch_api_credential(uuid, text)
  from public, anon, authenticated;
grant execute on function public.partner_touch_api_credential(uuid, text)
  to service_role;

revoke all on function public.partner_clinical_state(orders) from public, anon;
grant execute on function public.partner_clinical_state(orders) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. updated_at maintenance
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.tg_partner_touch_updated_at()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists partner_orgs_touch on public.partner_organizations;
create trigger partner_orgs_touch before update on public.partner_organizations
  for each row execute function public.tg_partner_touch_updated_at();

drop trigger if exists partner_rate_cards_touch on public.partner_rate_cards;
create trigger partner_rate_cards_touch before update on public.partner_rate_cards
  for each row execute function public.tg_partner_touch_updated_at();

-- LIVE ADAPTATION (PARTNER-PLATFORM-LIVE-FOUNDATION-ROLLOUT-004): section 12 of the TEST
-- migration seeded the TEST sandbox organisation 'rapid-esa-letter' and its USD 45 sandbox
-- rate cards. Production partners are created by the owner through the admin workspace;
-- no organisation or rate card is seeded on LIVE. order_workflow_state() above is
-- rewritten from THIS database's own definition (keeps SET search_path and the ESA-only
-- 30-day 'reopened' arm) plus the single partner-origin exception.

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. Rate limiting -- one atomic statement, no read-then-write race
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.partner_bump_rate_limit(
  p_subject_hash text,
  p_scope text,
  p_window_seconds integer default 60
)
returns integer
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_window timestamptz;
  v_count  integer;
begin
  v_window := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);

  -- INSERT ... ON CONFLICT DO UPDATE ... RETURNING is atomic, so two concurrent
  -- requests cannot both observe "1 of 60" and both be admitted.
  insert into private.partner_api_rate_limits (subject_hash, scope, window_start, attempts, expires_at)
  values (p_subject_hash, p_scope, v_window, 1, v_window + make_interval(secs => p_window_seconds * 2))
  on conflict (subject_hash, scope, window_start)
  do update set attempts = private.partner_api_rate_limits.attempts + 1
  returning attempts into v_count;

  delete from private.partner_api_rate_limits
   where expires_at < clock_timestamp() - interval '1 hour';

  return v_count;
end;
$function$;

revoke all on function public.partner_bump_rate_limit(text, text, integer) from public, anon, authenticated;
grant execute on function public.partner_bump_rate_limit(text, text, integer) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. Partner API server functions
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The private schema is deliberately NOT exposed to the Data API, so the edge
-- function cannot reach the idempotency ledger through PostgREST. These
-- SECURITY DEFINER functions are the only door -- which keeps credential
-- material unreachable from any browser session while still letting the API
-- enforce idempotency.
--
-- This mattered in practice: the first cut of the edge function read the ledger
-- with PostgREST, which silently returned nothing, so an idempotent retry fell
-- through to a fresh create. Only the database-level unique index on
-- (partner_id, partner_order_id) stopped a duplicate order being written.

CREATE OR REPLACE FUNCTION public.partner_clinical_state_for_order(p_order_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
  select public.partner_clinical_state(o.*) from public.orders o where o.id = p_order_id;
$function$;

revoke all on function public.partner_clinical_state_for_order(uuid) from public, anon, authenticated;
grant execute on function public.partner_clinical_state_for_order(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.partner_lookup_idempotency(p_partner_id uuid, p_idempotency_key text)
 RETURNS TABLE(request_hash text, order_id uuid, partner_order_id text, outcome text, response_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select r.request_hash, r.order_id, r.partner_order_id, r.outcome, r.response_code
  from private.partner_api_requests r
  where r.partner_id = p_partner_id and r.idempotency_key = p_idempotency_key
  limit 1;
$function$;

revoke all on function public.partner_lookup_idempotency(uuid, text) from public, anon, authenticated;
grant execute on function public.partner_lookup_idempotency(uuid, text) to service_role;

CREATE OR REPLACE FUNCTION public.partner_record_api_rejection(p_partner_id uuid, p_idempotency_key text, p_request_hash text, p_partner_order_id text, p_response_code text, p_http_status integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  insert into private.partner_api_requests
    (partner_id, idempotency_key, request_hash, partner_order_id, outcome, response_code, http_status)
  values (p_partner_id, p_idempotency_key, p_request_hash, p_partner_order_id, 'rejected', p_response_code, p_http_status)
  on conflict (partner_id, idempotency_key) do nothing;
$function$;

revoke all on function public.partner_record_api_rejection(uuid, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.partner_record_api_rejection(uuid, text, text, text, text, integer) to service_role;

-- ── ATOMIC ACCEPTANCE ───────────────────────────────────────────────────────
-- Order + canonical assessment + immutable financial snapshot + idempotency
-- ledger, in ONE transaction. Four edge-function round trips would let a crash
-- leave an order with no financial snapshot, or an assessment with no order.
--
-- Idempotency is enforced by the DATABASE via the partial unique index on
-- (partner_id, partner_order_id): a concurrent duplicate loses the race and is
-- handed the winner's order rather than creating a second one.

CREATE OR REPLACE FUNCTION public.partner_accept_order(p_partner_id uuid, p_payload jsonb, p_payload_hash text, p_schema_version text, p_idempotency_key text, p_request_id text)
 RETURNS TABLE(order_id uuid, confirmation_id text, accepted_at timestamp with time zone, communication_policy text, document_policy text, replayed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
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
begin
  select * into v_partner from public.partner_organizations where id = p_partner_id;
  if not found then raise exception 'partner_not_found' using errcode = 'P0002'; end if;

  -- REPLAY: this partner order already exists -> return it. Never a second order.
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
  -- never the source of truth; this is.
  for v_answer in
    select key as question_id, value as answer_value
    from jsonb_each(coalesce(p_payload#>'{assessment,answers}', '{}'::jsonb))
  loop
    insert into public.assessment_answers (order_id, assessment_version, question_id, answer_value, source_step, answered_at)
    values (v_order_id, p_schema_version, v_answer.question_id, v_answer.answer_value, 'partner_api', now());
  end loop;

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

revoke all on function public.partner_accept_order(uuid, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.partner_accept_order(uuid, jsonb, text, text, text, text) to service_role;
