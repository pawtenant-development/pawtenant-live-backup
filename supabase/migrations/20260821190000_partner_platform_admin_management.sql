-- PARTNER-PLATFORM-ADMIN-WORKSPACE-001 — server-side management layer
--
-- Adds the Stripe-like admin management functions the Partner Platform
-- workspace needs. Everything here REUSES the canonical authorization gate
-- (public.is_chat_admin()) and the Slice 1-8 storage: no second authorization
-- system, no schema forks, no plaintext secrets at rest.
--
-- Ground rules enforced below, uniformly:
--   * SECURITY DEFINER + pinned search_path on every function.
--   * First statement of every function: the is_chat_admin() capability gate.
--   * API-key secrets are returned EXACTLY ONCE from the creating/rotating
--     function; only sha256 verification material + a display last4 are stored.
--   * Webhook signing secrets are returned EXACTLY ONCE (create/rotate); no
--     read path exists for them outside the private schema.
--   * environment is validated by NAME ('sandbox' | 'production'); anything
--     else — including a forged 'live' — fails closed. 'production' requires
--     partner_organizations.production_enabled, which stays FALSE on TEST and
--     is flipped only by the separately authorized production activation.
--   * Every management action writes an append-only audit_logs row that never
--     contains a secret, a hash, or credential material of any kind.

-- ── 1. Credential display metadata ──────────────────────────────────────────
alter table private.partner_api_credentials
  add column if not exists label text,
  add column if not exists secret_last4 text;

-- ── 2. Webhook outbox: allow the safe operator-triggered test event ─────────
alter table public.partner_webhook_events
  drop constraint if exists partner_webhook_events_event_type_check;
alter table public.partner_webhook_events
  add constraint partner_webhook_events_event_type_check
  check (event_type = any (array[
    'order.accepted','order.provider_assigned','order.additional_information_required',
    'order.correction_required','order.document_approved','order.completed',
    'order.document_ready','order.cancelled','invoice.issued','invoice.paid',
    'billing.credit_issued','test.ping'
  ]));

-- ── 3. Shared audit helper (definer-internal; not grantable) ────────────────
create or replace function private.partner_admin_audit(
  p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
begin
  insert into public.audit_logs (actor_id, actor_name, actor_role, actor_type,
                                 object_type, object_id, action, entity_type, entity_id, metadata)
  values (auth.uid(),
          coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email', 'admin'),
          'admin', 'admin',
          'partner_platform', p_entity_id, p_action, p_entity_type, p_entity_id,
          coalesce(p_metadata, '{}'::jsonb));
end;
$$;
revoke all on function private.partner_admin_audit(text, text, text, jsonb) from public;
revoke all on function private.partner_admin_audit(text, text, text, jsonb) from anon;
revoke all on function private.partner_admin_audit(text, text, text, jsonb) from authenticated;

-- ── 4. Organization management ──────────────────────────────────────────────
create or replace function public.partner_admin_create_organization(
  p_display_name text,
  p_legal_name text,
  p_slug text,
  p_billing_contact jsonb default null,
  p_technical_contact jsonb default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_id uuid;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'display name is required' using errcode = '22023';
  end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'slug must be lowercase letters, digits and single hyphens' using errcode = '22023';
  end if;
  begin
    insert into public.partner_organizations (
      slug, legal_name, display_name, status, production_enabled,
      billing_contact, technical_contact, support_owner, allowed_services,
      default_communication_policy, default_document_policy, notes, created_by
    ) values (
      p_slug, coalesce(nullif(trim(p_legal_name), ''), trim(p_display_name)), trim(p_display_name),
      'draft', false,
      coalesce(p_billing_contact, '{}'::jsonb), coalesce(p_technical_contact, '{}'::jsonb), 'partner', array['esa','psd'],
      'partner_managed', 'partner_neutral', p_notes, auth.uid()
    ) returning id into v_id;
  exception when unique_violation then
    raise exception 'an organization with slug % already exists', p_slug using errcode = '23505';
  end;
  perform private.partner_admin_audit('partner_admin_org_created', 'partner_organization', v_id::text,
    jsonb_build_object('slug', p_slug, 'display_name', trim(p_display_name)));
  return v_id;
end;
$$;

create or replace function public.partner_admin_update_organization(
  p_partner_id uuid,
  p_display_name text default null,
  p_legal_name text default null,
  p_billing_contact jsonb default null,
  p_technical_contact jsonb default null,
  p_notes text default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_old public.partner_organizations%rowtype;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select * into v_old from public.partner_organizations where id = p_partner_id for update;
  if not found then raise exception 'partner not found' using errcode = 'P0002'; end if;
  update public.partner_organizations
     set display_name      = coalesce(nullif(trim(coalesce(p_display_name, '')), ''), display_name),
         legal_name        = coalesce(nullif(trim(coalesce(p_legal_name, '')), ''), legal_name),
         billing_contact   = coalesce(p_billing_contact, billing_contact),
         technical_contact = coalesce(p_technical_contact, technical_contact),
         notes             = coalesce(p_notes, notes),
         updated_by        = auth.uid()
   where id = p_partner_id;
  perform private.partner_admin_audit('partner_admin_org_updated', 'partner_organization', p_partner_id::text,
    jsonb_build_object(
      'fields', (select jsonb_agg(f) from unnest(array[
        case when p_display_name is not null then 'display_name' end,
        case when p_legal_name is not null then 'legal_name' end,
        case when p_billing_contact is not null then 'billing_contact' end,
        case when p_technical_contact is not null then 'technical_contact' end,
        case when p_notes is not null then 'notes' end]) f where f is not null)));
end;
$$;

create or replace function public.partner_admin_set_sandbox_access(
  p_partner_id uuid,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_status text;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select status into v_status from public.partner_organizations where id = p_partner_id for update;
  if not found then raise exception 'partner not found' using errcode = 'P0002'; end if;
  if v_status = 'active' then
    raise exception 'this organization is production-active — sandbox toggling is an owner decision'
      using errcode = '42501';
  end if;
  if v_status = 'terminated' then
    raise exception 'this organization is archived' using errcode = '42501';
  end if;
  update public.partner_organizations
     set status = case when p_enabled then 'sandbox' else 'paused' end,
         updated_by = auth.uid()
   where id = p_partner_id;
  perform private.partner_admin_audit(
    case when p_enabled then 'partner_admin_sandbox_enabled' else 'partner_admin_sandbox_disabled' end,
    'partner_organization', p_partner_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.partner_admin_archive_organization(
  p_partner_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_org public.partner_organizations%rowtype;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select * into v_org from public.partner_organizations where id = p_partner_id for update;
  if not found then raise exception 'partner not found' using errcode = 'P0002'; end if;
  if v_org.production_enabled then
    raise exception 'a production-enabled organization cannot be archived from here' using errcode = '42501';
  end if;
  if exists (select 1 from public.orders where partner_id = p_partner_id) then
    raise exception 'organization has orders — archiving is refused' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.partner_invoices where partner_id = p_partner_id) then
    raise exception 'organization has invoices — archiving is refused' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.partner_billable_events where partner_id = p_partner_id) then
    raise exception 'organization has billable events — archiving is refused' using errcode = 'P0001';
  end if;
  if exists (select 1 from private.partner_api_credentials c
              where c.partner_id = p_partner_id and c.status = 'active') then
    raise exception 'organization still has active API keys — revoke them first' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.partner_webhook_endpoints e
              where e.partner_id = p_partner_id and e.active) then
    raise exception 'organization still has active webhook endpoints — disable or remove them first'
      using errcode = 'P0001';
  end if;
  update public.partner_organizations
     set status = 'terminated', updated_by = auth.uid()
   where id = p_partner_id;
  perform private.partner_admin_audit('partner_admin_org_archived', 'partner_organization', p_partner_id::text, '{}'::jsonb);
end;
$$;

-- ── 5. API key management ───────────────────────────────────────────────────
create or replace function public.partner_admin_list_api_keys(
  p_partner_id uuid
) returns table (
  id uuid, key_id text, label text, environment text, scopes text[],
  status text, secret_last4 text, created_at timestamptz, last_used_at timestamptz,
  expires_at timestamptz, revoked_at timestamptz, revoked_reason text,
  rotated_from_key_id text, rate_limit_per_minute integer, max_payload_bytes integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return query
  select c.id, c.key_id, c.label, c.environment, c.scopes,
         c.status, c.secret_last4, c.created_at, c.last_used_at,
         c.expires_at, c.revoked_at, c.revoked_reason,
         c.rotated_from_key_id, c.rate_limit_per_minute, c.max_payload_bytes
    from private.partner_api_credentials c
   where c.partner_id = p_partner_id
   order by c.created_at desc;
end;
$$;

create or replace function public.partner_admin_create_api_key(
  p_partner_id uuid,
  p_label text,
  p_scopes text[],
  p_environment text default 'sandbox',
  p_expires_at timestamptz default null
) returns table (credential_id uuid, key_id text, secret text)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_org      public.partner_organizations%rowtype;
  v_key_id   text;
  v_secret   text;
  v_id       uuid;
  v_allowed  text[] := array['orders:create','orders:read','documents:read'];
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_environment is null or p_environment not in ('sandbox','production') then
    raise exception 'environment must be sandbox or production' using errcode = '22023';
  end if;
  select * into v_org from public.partner_organizations where id = p_partner_id;
  if not found then raise exception 'partner not found' using errcode = 'P0002'; end if;
  if p_environment = 'production' and not v_org.production_enabled then
    raise exception 'production credentials require production_enabled — a separately authorized activation'
      using errcode = '42501';
  end if;
  if v_org.status not in ('sandbox','active') then
    raise exception 'sandbox access is not enabled for this organization' using errcode = '42501';
  end if;
  if p_scopes is null or cardinality(p_scopes) = 0 or not (p_scopes <@ v_allowed) then
    raise exception 'scopes must be a non-empty subset of orders:create, orders:read, documents:read'
      using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'expiration must be in the future' using errcode = '22023';
  end if;

  v_key_id := 'pk_' || p_environment || '_' || encode(extensions.gen_random_bytes(8), 'hex');
  v_secret := 'sk_' || p_environment || '_' || encode(extensions.gen_random_bytes(24), 'hex');

  insert into private.partner_api_credentials (
    partner_id, key_id, secret_hash, secret_algo, environment, scopes, status,
    rate_limit_per_minute, max_payload_bytes, created_by, expires_at, label, secret_last4
  ) values (
    p_partner_id, v_key_id, encode(extensions.digest(v_secret, 'sha256'), 'hex'), 'sha256',
    p_environment, p_scopes, 'active',
    60, 65536, auth.uid(), p_expires_at, nullif(trim(coalesce(p_label, '')), ''), right(v_secret, 4)
  ) returning id into v_id;

  perform private.partner_admin_audit('partner_admin_api_key_created', 'partner_api_credential', v_id::text,
    jsonb_build_object('partner_id', p_partner_id, 'key_id', v_key_id,
                       'environment', p_environment, 'scopes', p_scopes,
                       'expires_at', p_expires_at));
  return query select v_id, v_key_id, v_secret;
end;
$$;

create or replace function public.partner_admin_revoke_api_key(
  p_credential_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_cred private.partner_api_credentials%rowtype;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select * into v_cred from private.partner_api_credentials where id = p_credential_id for update;
  if not found then raise exception 'credential not found' using errcode = 'P0002'; end if;
  if v_cred.status = 'revoked' then
    raise exception 'credential is already revoked' using errcode = '22023';
  end if;
  update private.partner_api_credentials
     set status = 'revoked', revoked_at = now(), revoked_reason = p_reason
   where id = p_credential_id;
  perform private.partner_admin_audit('partner_admin_api_key_revoked', 'partner_api_credential', p_credential_id::text,
    jsonb_build_object('partner_id', v_cred.partner_id, 'key_id', v_cred.key_id, 'reason', p_reason));
end;
$$;

-- Rotation mints the REPLACEMENT first and leaves the old key ACTIVE for a
-- controlled overlap window; revoking the old key is a separate, explicit
-- action. Nothing here can silently break a working integration.
create or replace function public.partner_admin_rotate_api_key(
  p_credential_id uuid,
  p_label text default null
) returns table (credential_id uuid, key_id text, secret text)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_old    private.partner_api_credentials%rowtype;
  v_key_id text;
  v_secret text;
  v_id     uuid;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select * into v_old from private.partner_api_credentials where id = p_credential_id for update;
  if not found then raise exception 'credential not found' using errcode = 'P0002'; end if;
  if v_old.status <> 'active' then
    raise exception 'only an active credential can be rotated' using errcode = '22023';
  end if;

  v_key_id := 'pk_' || v_old.environment || '_' || encode(extensions.gen_random_bytes(8), 'hex');
  v_secret := 'sk_' || v_old.environment || '_' || encode(extensions.gen_random_bytes(24), 'hex');

  insert into private.partner_api_credentials (
    partner_id, key_id, secret_hash, secret_algo, environment, scopes, status,
    ip_allowlist, rate_limit_per_minute, max_payload_bytes, created_by,
    rotated_from_key_id, label, secret_last4
  ) values (
    v_old.partner_id, v_key_id, encode(extensions.digest(v_secret, 'sha256'), 'hex'), 'sha256',
    v_old.environment, v_old.scopes, 'active',
    v_old.ip_allowlist, v_old.rate_limit_per_minute, v_old.max_payload_bytes, auth.uid(),
    v_old.key_id, coalesce(nullif(trim(coalesce(p_label, '')), ''), v_old.label), right(v_secret, 4)
  ) returning id into v_id;

  perform private.partner_admin_audit('partner_admin_api_key_rotated', 'partner_api_credential', v_id::text,
    jsonb_build_object('partner_id', v_old.partner_id, 'key_id', v_key_id,
                       'rotated_from_key_id', v_old.key_id, 'environment', v_old.environment));
  return query select v_id, v_key_id, v_secret;
end;
$$;

-- ── 6. Private-ledger readers (safe projections only) ───────────────────────
create or replace function public.partner_admin_list_api_requests(
  p_partner_id uuid,
  p_limit integer default 50
) returns table (
  created_at timestamptz, outcome text, response_code text,
  http_status integer, partner_order_id text, key_id text
)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return query
  select r.created_at, r.outcome, r.response_code, r.http_status, r.partner_order_id, r.key_id
    from private.partner_api_requests r
   where r.partner_id = p_partner_id
   order by r.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- Authoritative onboarding evidence for the Overview checklist. Every number
-- is computed from the operational tables, not from UI state: a step reads
-- Complete only when the thing it names has actually happened.
create or replace function public.partner_admin_onboarding_state(
  p_partner_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v jsonb;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'org_status', o.status,
    'production_enabled', o.production_enabled,
    'active_sandbox_keys', (
      select count(*) from private.partner_api_credentials c
       where c.partner_id = o.id and c.environment = 'sandbox' and c.status = 'active'
         and c.revoked_at is null and (c.expires_at is null or c.expires_at > now())),
    'total_keys', (
      select count(*) from private.partner_api_credentials c where c.partner_id = o.id),
    'active_sandbox_endpoints', (
      select count(*) from public.partner_webhook_endpoints e
       where e.partner_id = o.id and e.environment = 'sandbox' and e.active),
    'accepted_api_requests', (
      select count(*) from private.partner_api_requests r
       where r.partner_id = o.id and r.outcome in ('accepted','revision_accepted')),
    'last_accepted_api_request_at', (
      select max(r.created_at) from private.partner_api_requests r
       where r.partner_id = o.id and r.outcome in ('accepted','revision_accepted')),
    'orders_total', (
      select count(*) from public.orders x
       where x.partner_id = o.id and x.order_origin = 'partner'),
    'orders_completed', (
      select count(*) from public.orders x
       where x.partner_id = o.id and x.order_origin = 'partner'
         and x.doctor_status = 'patient_notified'),
    'document_releases', (
      select count(*) from public.partner_document_releases rel
        join public.orders oo on oo.id = rel.order_id
       where oo.partner_id = o.id),
    'webhook_deliveries_succeeded', (
      select count(*) from public.partner_webhook_deliveries d
        join public.partner_webhook_endpoints e on e.id = d.endpoint_id
       where e.partner_id = o.id and d.status = 'succeeded'),
    'last_webhook_delivered_at', (
      select max(d.succeeded_at) from public.partner_webhook_deliveries d
        join public.partner_webhook_endpoints e on e.id = d.endpoint_id
       where e.partner_id = o.id and d.status = 'succeeded'),
    'webhook_deliveries_failed', (
      select count(*) from public.partner_webhook_deliveries d
        join public.partner_webhook_endpoints e on e.id = d.endpoint_id
       where e.partner_id = o.id and d.status = 'failed_terminal')
  ) into v
  from public.partner_organizations o where o.id = p_partner_id;
  if v is null then raise exception 'partner not found' using errcode = 'P0002'; end if;
  return v;
end;
$$;

-- ── 7. Webhook endpoint management ──────────────────────────────────────────
create or replace function public.partner_admin_enable_webhook_endpoint(
  p_endpoint_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  update public.partner_webhook_endpoints
     set active = true, disabled_at = null, disabled_reason = null
   where id = p_endpoint_id;
  if not found then raise exception 'endpoint not found' using errcode = 'P0002'; end if;
  perform private.partner_admin_audit('partner_admin_webhook_enabled', 'partner_webhook_endpoint', p_endpoint_id::text, '{}'::jsonb);
end;
$$;

-- Rotation policy (documented, deliberate): IMMEDIATE CUTOVER. The next signed
-- delivery uses the new secret; the previous secret is gone the moment this
-- returns. The partner must install the new secret before re-enabling traffic.
create or replace function public.partner_admin_rotate_webhook_secret(
  p_endpoint_id uuid
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_secret text;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.partner_webhook_endpoints where id = p_endpoint_id) then
    raise exception 'endpoint not found' using errcode = 'P0002';
  end if;
  v_secret := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
  update private.partner_webhook_endpoint_secrets
     set secret = v_secret, created_at = now()
   where endpoint_id = p_endpoint_id;
  if not found then
    insert into private.partner_webhook_endpoint_secrets (endpoint_id, secret)
    values (p_endpoint_id, v_secret);
  end if;
  perform private.partner_admin_audit('partner_admin_webhook_secret_rotated', 'partner_webhook_endpoint', p_endpoint_id::text, '{}'::jsonb);
  return v_secret;
end;
$$;

-- Removal is for UNUSED endpoints only: any delivery history makes the
-- endpoint part of the audit trail, and the answer is disable, not delete.
create or replace function public.partner_admin_delete_webhook_endpoint(
  p_endpoint_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.partner_webhook_endpoints where id = p_endpoint_id) then
    raise exception 'endpoint not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.partner_webhook_deliveries where endpoint_id = p_endpoint_id) then
    raise exception 'endpoint has delivery history — disable it instead of deleting' using errcode = 'P0001';
  end if;
  delete from private.partner_webhook_endpoint_secrets where endpoint_id = p_endpoint_id;
  delete from public.partner_webhook_endpoints where id = p_endpoint_id;
  perform private.partner_admin_audit('partner_admin_webhook_deleted', 'partner_webhook_endpoint', p_endpoint_id::text, '{}'::jsonb);
end;
$$;

-- A safe, operator-triggered signed test event. Targets exactly ONE endpoint,
-- carries no order, no invoice, no PHI and no internal identifier — just a
-- fixed notice string. Delivery then flows through the normal outbox
-- discipline (claim → sign → send → record) like any real event.
create or replace function public.partner_admin_send_test_webhook(
  p_endpoint_id uuid
) returns table (event_id uuid, delivery_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_ep       public.partner_webhook_endpoints%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_delivery uuid;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select * into v_ep from public.partner_webhook_endpoints where id = p_endpoint_id;
  if not found then raise exception 'endpoint not found' using errcode = 'P0002'; end if;
  if not v_ep.active then
    raise exception 'endpoint is disabled — enable it before sending a test event' using errcode = '22023';
  end if;

  insert into public.partner_webhook_events (
    id, partner_id, event_type, partner_order_id, pawtenant_reference, payload, dedupe_key
  ) values (
    v_event_id, v_ep.partner_id, 'test.ping', null, null,
    jsonb_build_object(
      'event_id', v_event_id,
      'event_type', 'test.ping',
      'event_version', '1',
      'partner_order_id', null,
      'pawtenant_reference', null,
      'occurred_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'data', jsonb_build_object('note', 'PawTenant signed webhook test event — safe to ignore')
    ),
    'test-ping-' || v_event_id
  );

  insert into public.partner_webhook_deliveries (event_id, endpoint_id)
  values (v_event_id, p_endpoint_id)
  returning id into v_delivery;

  perform private.partner_admin_audit('partner_admin_webhook_test_sent', 'partner_webhook_endpoint', p_endpoint_id::text,
    jsonb_build_object('event_id', v_event_id));
  return query select v_event_id, v_delivery;
end;
$$;

-- ── 8. Registration hardening: refuse unsafe hosts at registration time ─────
-- The dispatcher already re-checks at send time (the boundary that matters);
-- this closes the operator-experience gap where an unsafe URL could sit
-- registered-but-undeliverable. Mirrors the dispatcher's PRIVATE_HOST_RE.
create or replace function public.partner_register_webhook_endpoint(
  p_partner_id uuid, p_environment text, p_url text,
  p_description text default null, p_event_types text[] default '{}'::text[]
) returns table (endpoint_id uuid, secret text)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
declare
  v_partner   public.partner_organizations%rowtype;
  v_id        uuid;
  v_secret    text;
  v_authority text;
  v_host      text;
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
  v_authority := split_part(substring(p_url from 9), '/', 1);
  if v_authority = '' then
    raise exception 'webhook URL has no host' using errcode = '22023';
  end if;
  if position('@' in v_authority) > 0 then
    raise exception 'webhook URLs must not embed credentials' using errcode = '22023';
  end if;
  if v_authority like '[%' then
    raise exception 'IPv6 literal hosts are not accepted' using errcode = '22023';
  end if;
  v_host := split_part(v_authority, ':', 1);
  if v_host ~* '^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2[0-9]|3[01])\.)' then
    raise exception 'webhook endpoints must not target loopback or private networks' using errcode = '22023';
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

  perform private.partner_admin_audit('partner_admin_webhook_registered', 'partner_webhook_endpoint', v_id::text,
    jsonb_build_object('partner_id', p_partner_id, 'environment', p_environment, 'url', p_url));

  return query select v_id, v_secret;
end;
$$;

-- ── 9. Privileges: explicit, by name, for every function above ──────────────
do $$
declare
  sig text;
begin
  foreach sig in array array[
    'public.partner_admin_create_organization(text,text,text,jsonb,jsonb,text)',
    'public.partner_admin_update_organization(uuid,text,text,jsonb,jsonb,text)',
    'public.partner_admin_set_sandbox_access(uuid,boolean)',
    'public.partner_admin_archive_organization(uuid)',
    'public.partner_admin_list_api_keys(uuid)',
    'public.partner_admin_create_api_key(uuid,text,text[],text,timestamptz)',
    'public.partner_admin_revoke_api_key(uuid,text)',
    'public.partner_admin_rotate_api_key(uuid,text)',
    'public.partner_admin_list_api_requests(uuid,integer)',
    'public.partner_admin_onboarding_state(uuid)',
    'public.partner_admin_enable_webhook_endpoint(uuid)',
    'public.partner_admin_rotate_webhook_secret(uuid)',
    'public.partner_admin_delete_webhook_endpoint(uuid)',
    'public.partner_admin_send_test_webhook(uuid)',
    'public.partner_register_webhook_endpoint(uuid,text,text,text,text[])'
  ] loop
    execute format('revoke all on function %s from public', sig);
    execute format('revoke all on function %s from anon', sig);
    execute format('grant execute on function %s to authenticated', sig);
  end loop;
end $$;
