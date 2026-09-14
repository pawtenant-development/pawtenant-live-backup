-- PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 (TEST)
--
-- 1. Partner completion contact (partner_organizations.completion_notification_email).
-- 2. Structured questionnaire storage: the wizard sends the parsed Q&A blocks
--    alongside the verbatim text; the database re-checks that the blocks are
--    LOSSLESS against the raw text before storing them. Raw text stays canonical.
-- 3. Admin rebuild of the parsed representation for an existing partner order
--    (same lossless check; never touches the raw text).
-- 4. Provider-cost snapshot at clinical completion, from the canonical
--    doctor_earnings ledger (fulfillment_margin_cents was always the full fee).
-- 5. Finance: per-order snapshot (charge − provider cost − adjustments),
--    per-partner rows, and a billing summary that also reports the pending
--    pipeline and orders that need financial reconciliation.
-- 6. Partner portal: document availability + completion timestamp per order.
-- 7. admin_force_complete_order: never asks the client to notify a partner order's customer.
--
-- Idempotent. Every function is rewritten from this database's own definition.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Partner completion contact
-- ───────────────────────────────────────────────────────────────────────────
alter table public.partner_organizations
  add column if not exists completion_notification_email text;

comment on column public.partner_organizations.completion_notification_email is
  'PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001: the partner contact notified when clinical work on one of its orders is completed. Minimum-necessary email (order id, partner reference, status, portal path). NULL = no email; API partners rely on webhooks.';

create or replace function public.partner_admin_set_completion_contact(p_partner_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $fn$
declare
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  update public.partner_organizations
     set completion_notification_email = v_email, updated_at = now(), updated_by = auth.uid()
   where id = p_partner_id;
  if not found then
    raise exception 'partner_not_found' using errcode = 'P0002';
  end if;
  insert into public.audit_logs (actor_id, actor_type, actor_name, actor_role, object_type, object_id,
                                 action, entity_type, entity_id, category, source, metadata)
  values (auth.uid(), 'admin', 'admin', 'admin', 'partner_platform', p_partner_id::text,
          'partner_completion_contact_updated', 'partner_organization', p_partner_id::text,
          'partner_platform', 'partner_admin_set_completion_contact',
          jsonb_build_object('partner_id', p_partner_id, 'contact_set', v_email is not null));
  return jsonb_build_object('ok', true, 'partner_id', p_partner_id, 'contact_set', v_email is not null);
end;
$fn$;

revoke all on function public.partner_admin_set_completion_contact(uuid, text) from public, anon;
grant execute on function public.partner_admin_set_completion_contact(uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Lossless questionnaire blocks
-- ───────────────────────────────────────────────────────────────────────────
-- Mirrors src/lib/partnerQuestionnaire.ts › questionnaireIsLossless():
--   • every non-blank raw line (numbering prefix normalised) is present in the
--     parsed text, and
--   • the parsed text carries exactly the raw text's letters and digits.
-- Nothing dropped, nothing invented. Punctuation and whitespace are the only
-- things the parser may normalise.
create or replace function public.partner_questionnaire_blocks_lossless(
  p_raw text, p_blocks jsonb, p_additional jsonb default '[]'::jsonb
) returns boolean
language plpgsql
immutable
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $fn$
declare
  v_raw   text := replace(replace(coalesce(p_raw, ''), E'\r\n', E'\n'), E'\r', E'\n');
  v_bag   text := '';
  v_line  text;
  v_key   text;
  v_chars int := 0;
  v_item  jsonb;
begin
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then return false; end if;
  if p_additional is not null and jsonb_typeof(p_additional) <> 'array' then return false; end if;
  if jsonb_array_length(p_blocks) > 500 then return false; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_additional, '[]'::jsonb)) loop
    if jsonb_typeof(v_item) <> 'string' then return false; end if;
    v_bag := v_bag || E'\n' || (v_item #>> '{}');
  end loop;
  for v_item in select value from jsonb_array_elements(p_blocks) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'number') <> 'number'
       or jsonb_typeof(v_item -> 'question') <> 'string'
       or jsonb_typeof(v_item -> 'answer') <> 'string' then
      return false;
    end if;
    v_bag := v_bag || E'\n' || (v_item ->> 'number') || ' ' || (v_item ->> 'question')
                    || E'\n' || (v_item ->> 'answer');
  end loop;
  v_bag := regexp_replace(v_bag, '[^A-Za-z0-9]', '', 'g');

  foreach v_line in array string_to_array(v_raw, E'\n') loop
    v_key := regexp_replace(v_line, '^\s*(?:[Qq](?:uestion)?\s*)?#?(?=\d)', '');
    v_key := regexp_replace(v_key, '[^A-Za-z0-9]', '', 'g');
    if v_key = '' then continue; end if;
    v_chars := v_chars + length(v_key);
    if position(v_key in v_bag) = 0 then return false; end if;
  end loop;
  return length(v_bag) = v_chars;
end;
$fn$;

revoke all on function public.partner_questionnaire_blocks_lossless(text, jsonb, jsonb) from public, anon, authenticated;

-- partner_submit_manual_order gains two optional arguments. The previous
-- 9-argument overload is dropped so PostgREST never sees two candidates.
drop function if exists public.partner_submit_manual_order(uuid, text, jsonb, jsonb, text, text, boolean, text, uuid);

create or replace function public.partner_submit_manual_order(
  p_partner_id uuid, p_service text, p_customer jsonb, p_pets jsonb, p_questionnaire_text text,
  p_partner_reference text, p_authorization_confirmed boolean, p_client_request_id text,
  p_draft_id uuid default null::uuid,
  p_questionnaire_blocks jsonb default null,
  p_questionnaire_additional jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_actor_partner uuid := public.current_partner_id();
  v_is_admin      boolean := coalesce(public.is_admin_staff(), false);
  v_pid           uuid;
  v_org           public.partner_organizations%rowtype;
  v_service       text := lower(nullif(trim(coalesce(p_service,'')), ''));
  v_errors        text[];
  v_ref           text := nullif(trim(coalesce(p_partner_reference,'')), '');
  v_partner_order text;
  v_payload       jsonb;
  v_hash          text;
  v_existing      uuid;
  v_actor_kind    text;
  v_email         text := lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email', ''));
  v_res           record;
  v_pets          jsonb;
  v_rate          public.partner_rate_cards%rowtype;
  v_env           text;
  v_answers       jsonb;
  v_blocks_ok     boolean := false;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(trim(coalesce(p_client_request_id,'')), '') = '' then
    raise exception 'client_request_id_required' using errcode = '22023';
  end if;
  if p_authorization_confirmed is not true then
    raise exception 'authorization_confirmation_required' using errcode = '22023';
  end if;

  if v_actor_partner is not null then
    if p_partner_id is not null and p_partner_id <> v_actor_partner then
      raise exception 'partner_mismatch' using errcode = '42501';
    end if;
    v_pid := v_actor_partner;
    v_actor_kind := 'partner';
  elsif v_is_admin then
    if p_partner_id is null then raise exception 'partner_id_required' using errcode = '22023'; end if;
    v_pid := p_partner_id;
    v_actor_kind := 'admin';
  else
    raise exception 'partner or admin access required' using errcode = '42501';
  end if;

  select * into v_org from public.partner_organizations where id = v_pid;
  if not found then raise exception 'partner_not_found' using errcode = 'P0002'; end if;
  if v_org.status not in ('sandbox','active') then
    raise exception 'partner_not_active' using errcode = '42501';
  end if;

  v_pets := coalesce(p_pets, '[]'::jsonb);
  v_errors := public.partner_manual_order_validate(v_org, v_service, coalesce(p_customer,'{}'::jsonb),
                                                   v_pets, p_questionnaire_text);
  if cardinality(v_errors) > 0 then
    raise exception 'validation_failed: %', array_to_string(v_errors, ',') using errcode = '22023';
  end if;

  -- The parsed representation is optional and NEVER trusted blindly: it is
  -- stored only when it is provably lossless against the verbatim text.
  -- Otherwise the raw text alone is stored and every reader re-parses it.
  if p_questionnaire_blocks is not null then
    v_blocks_ok := public.partner_questionnaire_blocks_lossless(
      p_questionnaire_text, p_questionnaire_blocks, coalesce(p_questionnaire_additional, '[]'::jsonb));
    if not v_blocks_ok then
      raise exception 'questionnaire_blocks_not_lossless' using errcode = '22023';
    end if;
  end if;

  v_env := case when v_org.production_enabled then 'production' else 'sandbox' end;
  select * into v_rate from public.partner_rate_cards
   where partner_id = v_pid and service = v_service and environment = v_env
     and effective_from <= now() and (effective_to is null or effective_to > now())
   order by version desc limit 1;
  if not found then
    raise exception 'no_active_rate' using errcode = 'P0002';
  end if;

  select r.order_id into v_existing
    from private.partner_api_requests r
   where r.partner_id = v_pid and r.idempotency_key = p_client_request_id
   limit 1;
  if v_existing is not null then
    return (select jsonb_build_object('order_id', o.id, 'confirmation_id', o.confirmation_id,
                                      'partner_order_id', o.partner_order_id, 'replayed', true)
              from public.orders o where o.id = v_existing);
  end if;

  v_partner_order := coalesce(v_ref, 'portal-' || p_client_request_id);
  if exists (select 1 from public.orders o where o.partner_id = v_pid and o.partner_order_id = v_partner_order) then
    raise exception 'duplicate_partner_reference' using errcode = '23505';
  end if;

  v_answers := jsonb_build_object(
    'partnerQuestionnaireText', p_questionnaire_text,
    'partnerIntakeChannel', 'partner_portal_manual');
  if v_blocks_ok then
    v_answers := v_answers || jsonb_build_object(
      'partnerQuestionnaireBlocks', p_questionnaire_blocks,
      'partnerQuestionnaireAdditional', coalesce(p_questionnaire_additional, '[]'::jsonb),
      'partnerQuestionnaireFormat', 'qa_blocks.v1');
  end if;

  v_payload := jsonb_build_object(
    'partner_order_id', v_partner_order,
    'service', v_service,
    'customer', jsonb_build_object(
      'legal_first_name', trim(p_customer->>'firstName'),
      'legal_last_name',  trim(p_customer->>'lastName'),
      'email',            lower(trim(p_customer->>'email')),
      'phone',            nullif(trim(coalesce(p_customer->>'phone','')), ''),
      'date_of_birth',    trim(p_customer->>'dob'),
      'current_physical_state', upper(trim(p_customer->>'state'))
    ),
    'animals', v_pets,
    'consents', jsonb_build_object(
      'partnerSubmissionAuthorization', jsonb_build_object(
        'accepted', true, 'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'evidence', v_actor_kind || '_portal')
    ),
    'assessment', jsonb_build_object('answers', v_answers),
    'address', coalesce(p_customer->'address', '{}'::jsonb)
  );
  v_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

  select * into v_res from public.partner_accept_order(
    v_pid, v_payload, v_hash, 'portal.manual.v1', p_client_request_id,
    p_client_request_id, null, 'partner_portal_manual');

  -- Metadata is ids, counts and lengths only — never the questionnaire, the
  -- customer or the animals (partner_intake_audit refuses PHI-shaped keys).
  perform public.partner_intake_audit(
    auth.uid(), v_email, 'partner_intake_portal_order_submitted', null, v_pid, v_res.order_id,
    jsonb_build_object(
      'actor_kind', v_actor_kind,
      'service', v_service,
      'intake_method', 'partner_portal_manual',
      'pet_count', jsonb_array_length(v_pets),
      'questionnaire_chars', length(coalesce(p_questionnaire_text,'')),
      'questionnaire_blocks', case when v_blocks_ok then jsonb_array_length(p_questionnaire_blocks) else 0 end,
      'has_partner_reference', v_ref is not null,
      'rate_card_version', v_rate.version,
      'replayed', v_res.replayed));

  if p_draft_id is not null then
    update public.partner_order_drafts
       set status = 'submitted', submitted_order_id = v_res.order_id, submitted_at = now(),
           questionnaire_text = null
     where id = p_draft_id and partner_id = v_pid and status = 'draft';
  end if;

  return jsonb_build_object('order_id', v_res.order_id, 'confirmation_id', v_res.confirmation_id,
                            'partner_order_id', v_partner_order, 'replayed', v_res.replayed);
end;
$function$;

revoke all on function public.partner_submit_manual_order(uuid, text, jsonb, jsonb, text, text, boolean, text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.partner_submit_manual_order(uuid, text, jsonb, jsonb, text, text, boolean, text, uuid, jsonb, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Admin rebuild of the parsed representation (existing partner orders)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.partner_admin_store_questionnaire_blocks(
  p_order_id uuid, p_blocks jsonb, p_additional jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $fn$
declare
  v_order public.orders%rowtype;
  v_raw   text;
  v_email text := lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email', ''));
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_order.order_origin is distinct from 'partner' or v_order.partner_id is null then
    raise exception 'not_a_partner_order' using errcode = '22023';
  end if;
  v_raw := v_order.assessment_answers ->> 'partnerQuestionnaireText';
  if coalesce(trim(v_raw), '') = '' then
    raise exception 'no_raw_questionnaire_text' using errcode = '22023';
  end if;
  if not public.partner_questionnaire_blocks_lossless(v_raw, p_blocks, coalesce(p_additional, '[]'::jsonb)) then
    raise exception 'questionnaire_blocks_not_lossless' using errcode = '22023';
  end if;

  -- Adds the parsed keys; the verbatim text and every other key are untouched.
  update public.orders
     set assessment_answers = coalesce(assessment_answers, '{}'::jsonb) || jsonb_build_object(
           'partnerQuestionnaireBlocks', p_blocks,
           'partnerQuestionnaireAdditional', coalesce(p_additional, '[]'::jsonb),
           'partnerQuestionnaireFormat', 'qa_blocks.v1')
   where id = p_order_id;

  perform public.partner_intake_audit(
    auth.uid(), v_email, 'partner_intake_questionnaire_blocks_rebuilt', null, v_order.partner_id, p_order_id,
    jsonb_build_object('questionnaire_chars', length(v_raw),
                       'questionnaire_blocks', jsonb_array_length(p_blocks),
                       'additional_lines', jsonb_array_length(coalesce(p_additional, '[]'::jsonb))));

  return jsonb_build_object('ok', true, 'order_id', p_order_id,
                            'blocks', jsonb_array_length(p_blocks),
                            'additional', jsonb_array_length(coalesce(p_additional, '[]'::jsonb)));
end;
$fn$;

revoke all on function public.partner_admin_store_questionnaire_blocks(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.partner_admin_store_questionnaire_blocks(uuid, jsonb, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Provider-cost snapshot at clinical completion
-- ───────────────────────────────────────────────────────────────────────────
-- Rewritten from this database's own definition; the ONLY change is the
-- provider_earning_snapshot_cents assignment (from the canonical ledger).
create or replace function public.tg_partner_billable_on_completion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_fin public.partner_order_financials%rowtype;
  v_event_id uuid;
  v_provider_cents integer;
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

  -- PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001: the provider cost the
  -- canonical payout ledger already established for this case. NULL when the
  -- ledger has no row yet — the finance views then flag the order for
  -- reconciliation instead of assuming zero cost.
  select (sum(d.doctor_amount) * 100)::int into v_provider_cents
    from public.doctor_earnings d
   where d.order_id = new.id
     and coalesce(d.status, '') not in ('cancelled', 'voided', 'refunded');

  update public.partner_order_financials
     set billable_status = 'billable',
         billable_reason = 'clinical work completed',
         clinical_completed_at = coalesce(clinical_completed_at, now()),
         invoice_eligible = true,
         provider_earning_snapshot_cents = coalesce(provider_earning_snapshot_cents, v_provider_cents)
   where order_id = new.id and billable_status = 'pending';

  if v_event_id is not null then
    insert into public.audit_logs (actor_type, actor_name, actor_role, object_type, object_id,
                                   action, entity_type, entity_id, order_id, category, source, metadata)
    values ('system', 'orders_completion_trigger', 'system', 'partner_platform', new.id::text,
            'partner_contribution_recognized', 'partner_billable_event', v_event_id::text, new.id,
            'partner_finance', 'tg_partner_billable_on_completion',
            jsonb_build_object('partner_id', new.partner_id, 'service', lower(coalesce(new.letter_type, 'esa')),
                               'rate_card_version', v_fin.rate_card_version,
                               'intake_method', coalesce(new.partner_intake_method, 'api'),
                               'provider_cost_snapshotted', v_provider_cents is not null));
  end if;

  new.partner_clinical_completed_at := coalesce(new.partner_clinical_completed_at, now());
  return new;
end;
$function$;

revoke all on function public.tg_partner_billable_on_completion() from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Finance
-- ───────────────────────────────────────────────────────────────────────────
-- Per-order finance rows. ONE definition of the order-level numbers, reused
-- by the summary, the Finance tab and the Payments tab:
--   charge        = frozen wholesale_fee_cents (immutable since acceptance)
--   provider cost = doctor_earnings for the order, excluding cancelled/voided/refunded
--   adjustments   = credit events against the order's charge (negative)
--   net           = charge − provider cost + adjustments
-- "Needs financial reconciliation" is TRUE when the order is billable but the
-- ledger has no provider cost row, or when the order has no financial snapshot
-- at all — the value is flagged, never guessed.
drop function if exists public.partner_admin_order_finance_rows(uuid);
create or replace function public.partner_admin_order_finance_rows(p_partner_id uuid default null)
returns table (
  order_id uuid, confirmation_id text, partner_id uuid, partner_name text, partner_reference text,
  service text, intake_method text, created_at timestamptz, clinical_state text,
  billable_status text, charge_cents integer, rate_card_version integer,
  provider_cost_cents integer, provider_cost_known boolean, adjustments_cents integer, net_contribution_cents integer,
  invoice_status text, invoice_number text, invoice_payment_status text,
  manual_paid_at timestamptz, manual_paid_by text,
  needs_reconciliation boolean, reconciliation_reason text, currency text
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $fn$
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return query
  with base as (
    select o.id, o.confirmation_id, o.partner_id, po.display_name, o.partner_order_id,
           lower(coalesce(o.letter_type, 'esa')) as service,
           coalesce(o.partner_intake_method, 'api') as intake_method,
           o.created_at,
           public.partner_clinical_state(o.*) as clinical_state,
           f.billable_status, f.wholesale_fee_cents, f.rate_card_version, f.invoice_status, f.invoice_id, f.currency,
           f.order_id as fin_order_id
      from public.orders o
      join public.partner_organizations po on po.id = o.partner_id
      left join public.partner_order_financials f on f.order_id = o.id
     where o.order_origin = 'partner'
       and (p_partner_id is null or o.partner_id = p_partner_id)
  ),
  cost as (
    select d.order_id, (sum(d.doctor_amount) * 100)::int as cents, count(*)::int as rows_n
      from public.doctor_earnings d
     where coalesce(d.status, '') not in ('cancelled', 'voided', 'refunded')
     group by d.order_id
  ),
  adj as (
    select c.order_id, coalesce(sum(c.amount_cents), 0)::int as cents
      from public.partner_billable_events c
     where c.event_kind = 'credit'
     group by c.order_id
  ),
  recon as (
    select r.order_id, max(r.marked_at) as marked_at,
           (array_agg(r.marked_by_email order by r.marked_at desc))[1] as marked_by
      from public.partner_order_reconciliations r
     group by r.order_id
  )
  select b.id, b.confirmation_id, b.partner_id, b.display_name,
         case when b.partner_order_id like 'portal-%' then null else b.partner_order_id end,
         b.service, b.intake_method, b.created_at, b.clinical_state,
         coalesce(b.billable_status, 'missing'),
         coalesce(b.wholesale_fee_cents, 0), b.rate_card_version,
         coalesce(c.cents, 0), c.rows_n is not null,
         coalesce(a.cents, 0),
         coalesce(b.wholesale_fee_cents, 0) - coalesce(c.cents, 0) + coalesce(a.cents, 0),
         coalesce(b.invoice_status, 'uninvoiced'), inv.invoice_number, inv.status,
         rc.marked_at, rc.marked_by,
         (b.fin_order_id is null) or (b.billable_status = 'billable' and c.rows_n is null),
         case when b.fin_order_id is null then 'no financial snapshot'
              when b.billable_status = 'billable' and c.rows_n is null then 'no provider cost evidence'
              else null end,
         coalesce(b.currency, 'USD')
    from base b
    left join cost c on c.order_id = b.id
    left join adj a on a.order_id = b.id
    left join recon rc on rc.order_id = b.id
    left join public.partner_invoices inv on inv.id = b.invoice_id
   order by b.created_at desc;
end;
$fn$;

revoke all on function public.partner_admin_order_finance_rows(uuid) from public, anon;
grant execute on function public.partner_admin_order_finance_rows(uuid) to authenticated;

-- One order, for the admin Payments tab.
create or replace function public.partner_admin_order_finance(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $fn$
declare
  v_row record;
  v_pid uuid;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select o.partner_id into v_pid from public.orders o where o.id = p_order_id and o.order_origin = 'partner';
  if v_pid is null then return null; end if;
  select * into v_row from public.partner_admin_order_finance_rows(v_pid) r where r.order_id = p_order_id;
  if not found then return null; end if;
  return to_jsonb(v_row);
end;
$fn$;

revoke all on function public.partner_admin_order_finance(uuid) from public, anon;
grant execute on function public.partner_admin_order_finance(uuid) to authenticated;

-- Billing summary: same columns as before (the UI consumes them) plus the
-- pending pipeline and reconciliation flags. Provider cost is scoped to the
-- SAME billable orders whose charges are counted, so the three figures
-- reconcile to the order-level rows above.
drop function if exists public.partner_admin_billing_summary(uuid);
create or replace function public.partner_admin_billing_summary(p_partner_id uuid default null::uuid)
returns table (
  partner_id uuid, partner_name text, currency text,
  orders_awaiting_invoice integer, awaiting_invoice_cents integer,
  open_invoice_count integer, open_invoice_cents integer,
  paid_invoice_count integer, paid_invoice_cents integer,
  orders_unreconciled integer, unreconciled_cents integer,
  orders_paid integer, paid_order_cents integer,
  partner_charges_cents integer, provider_cost_cents integer, adjustments_cents integer, net_contribution_cents integer,
  orders_in_progress integer, in_progress_charges_cents integer, in_progress_provider_cost_cents integer,
  orders_needing_reconciliation integer
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return query
  with scope as (
    select o.id as partner_id, o.display_name, coalesce(bp.currency, 'USD') as currency
      from public.partner_organizations o
      left join public.partner_billing_profiles bp on bp.partner_id = o.id
     where (p_partner_id is null or o.id = p_partner_id)
  ),
  rows_ as (
    select * from public.partner_admin_order_finance_rows(p_partner_id)
  ),
  fin as (
    select r.partner_id,
           count(*) filter (where r.invoice_status = 'uninvoiced' and r.billable_status = 'billable')::int as await_n,
           coalesce(sum(r.charge_cents) filter (where r.invoice_status = 'uninvoiced' and r.billable_status = 'billable'), 0)::int as await_c,
           count(*) filter (where r.invoice_status = 'invoice_paid_unreconciled')::int as unrec_n,
           coalesce(sum(r.charge_cents) filter (where r.invoice_status = 'invoice_paid_unreconciled'), 0)::int as unrec_c,
           count(*) filter (where r.invoice_status = 'paid')::int as paid_n,
           coalesce(sum(r.charge_cents) filter (where r.invoice_status = 'paid'), 0)::int as paid_c,
           coalesce(sum(r.charge_cents) filter (where r.billable_status = 'billable'), 0)::int as charges_c,
           coalesce(sum(r.provider_cost_cents) filter (where r.billable_status = 'billable'), 0)::int as cost_c,
           coalesce(sum(r.adjustments_cents) filter (where r.billable_status = 'billable'), 0)::int as adj_c,
           count(*) filter (where r.billable_status = 'pending' and r.clinical_state not in ('cancelled'))::int as prog_n,
           coalesce(sum(r.charge_cents) filter (where r.billable_status = 'pending' and r.clinical_state not in ('cancelled')), 0)::int as prog_c,
           coalesce(sum(r.provider_cost_cents) filter (where r.billable_status = 'pending' and r.clinical_state not in ('cancelled')), 0)::int as prog_cost_c,
           count(*) filter (where r.needs_reconciliation)::int as recon_n
      from rows_ r
     group by r.partner_id
  ),
  inv as (
    select i.partner_id,
           count(*) filter (where i.status in ('issued','partially_paid'))::int as open_n,
           coalesce(sum(i.total_cents) filter (where i.status in ('issued','partially_paid')), 0)::int as open_c,
           count(*) filter (where i.status = 'paid')::int as paid_n,
           coalesce(sum(i.amount_paid_cents) filter (where i.status = 'paid'), 0)::int as paid_c
      from public.partner_invoices i
     group by i.partner_id
  )
  select s.partner_id, s.display_name, s.currency,
         coalesce(f.await_n,0), coalesce(f.await_c,0),
         coalesce(v.open_n,0), coalesce(v.open_c,0),
         coalesce(v.paid_n,0), coalesce(v.paid_c,0),
         coalesce(f.unrec_n,0), coalesce(f.unrec_c,0),
         coalesce(f.paid_n,0), coalesce(f.paid_c,0),
         coalesce(f.charges_c,0), coalesce(f.cost_c,0), coalesce(f.adj_c,0),
         coalesce(f.charges_c,0) - coalesce(f.cost_c,0) + coalesce(f.adj_c,0),
         coalesce(f.prog_n,0), coalesce(f.prog_c,0), coalesce(f.prog_cost_c,0),
         coalesce(f.recon_n,0)
    from scope s
    left join fin f on f.partner_id = s.partner_id
    left join inv v on v.partner_id = s.partner_id
   order by s.display_name;
end;
$function$;

revoke all on function public.partner_admin_billing_summary(uuid) from public, anon;
grant execute on function public.partner_admin_billing_summary(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Partner portal orders: document availability + completion timestamp
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists public.partner_portal_orders(integer, integer);
create or replace function public.partner_portal_orders(p_limit integer default 100, p_offset integer default 0)
returns table (
  order_id uuid, confirmation_id text, partner_reference text, service text, customer_name text,
  pet_names text, pet_count integer, submitted_at timestamptz, clinical_status text,
  billing_status text, invoice_number text, invoice_status text, partner_charge_cents integer, currency text,
  document_available boolean, clinical_completed_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
  select
    o.id,
    o.confirmation_id,
    o.partner_order_id,
    lower(coalesce(o.letter_type,'esa')),
    nullif(trim(coalesce(o.first_name,'') || ' ' || coalesce(o.last_name,'')), ''),
    coalesce((select string_agg(nullif(trim(p->>'name'),''), ', ')
                from jsonb_array_elements(coalesce(o.assessment_answers->'pets','[]'::jsonb)) p), ''),
    coalesce(jsonb_array_length(o.assessment_answers->'pets'), 0),
    o.partner_accepted_at,
    public.partner_clinical_state(o.*),
    coalesce(f.invoice_status, 'uninvoiced'),
    inv.invoice_number,
    inv.status,
    f.wholesale_fee_cents,
    coalesce(f.currency, 'USD'),
    exists (select 1 from public.order_documents d
             where d.order_id = o.id and d.doc_type in ('esa_letter','psd_letter')
               and d.review_status = 'approved' and d.customer_visible = true
               and d.superseded_by_document_id is null),
    o.partner_clinical_completed_at
  from public.orders o
  left join public.partner_order_financials f on f.order_id = o.id
  left join public.partner_invoices inv       on inv.id = f.invoice_id
  where o.order_origin = 'partner'
    and o.partner_id = public.current_partner_id()
    and public.current_partner_id() is not null
  order by o.partner_accepted_at desc nulls last, o.created_at desc
  limit greatest(least(coalesce(p_limit, 100), 500), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

revoke all on function public.partner_portal_orders(integer, integer) from public, anon;
grant execute on function public.partner_portal_orders(integer, integer) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. admin_force_complete_order — partner orders never ask for a customer email
-- ───────────────────────────────────────────────────────────────────────────
-- Rewritten from this database's own definition. The ONLY change: the two
-- notify flags are false when the order is partner-origin (the partner owns
-- customer communication; the completion trigger and notify-patient-letter's
-- gate already refuse the send server-side — this keeps the CLIENT from asking).
-- LIVE ADAPTATION (PARTNER-PLATFORM-LIVE-FOUNDATION-ROLLOUT-004): rewritten from the
-- LIVE database's own admin_force_complete_order definition (comments preserved); the
-- only change is v_notify (partner-origin orders never ask the client to notify).
CREATE OR REPLACE FUNCTION public.admin_force_complete_order(p_order_id uuid, p_reason text, p_expected_status text DEFAULT NULL::text, p_expected_doctor_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order    public.orders;
  v_actor_id uuid := auth.uid();
  v_name     text;
  v_role     text;
  v_reason   text;
  v_prev_s   text;
  v_prev_ds  text;
  v_has_doc  boolean;
  v_provider boolean;
  v_notify   boolean;
BEGIN
  -- AUTHORIZATION. The canonical predicate, and nothing else. UI visibility is
  -- not security: a provider, a customer, an authenticated non-admin, the anon
  -- key and a forged JWT all land here and all fail.
  IF NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'admin_force_complete_order: not authorised' USING errcode = 'insufficient_privilege';
  END IF;

  v_reason := public.validate_reopen_reason(p_reason);   -- shared reason contract

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_force_complete_order: order % not found', p_order_id;
  END IF;

  -- STALE / CONCURRENT EDIT. A clean, final refusal — not an exception the UI
  -- would retry, and not a partial write. `orders` has no updated_at by design
  -- (see src/lib/orderLifecycle.ts), so the optimistic token is the pair of
  -- lifecycle values the admin was actually looking at.
  IF p_expected_status IS NOT NULL
     AND (v_order.status IS DISTINCT FROM p_expected_status
          OR coalesce(v_order.doctor_status, '') IS DISTINCT FROM coalesce(p_expected_doctor_status, '')) THEN
    RETURN jsonb_build_object(
      'transitioned', false, 'reason', 'stale_order', 'retryable', false,
      'order_id', v_order.id, 'confirmation_id', v_order.confirmation_id,
      'status', v_order.status, 'doctor_status', v_order.doctor_status,
      'message', 'This order changed while the dialog was open. Close it, reopen the order and try again.');
  END IF;

  v_has_doc  := public.order_has_customer_visible_document(v_order.id);
  v_provider := (v_order.doctor_user_id IS NOT NULL OR v_order.doctor_email IS NOT NULL);
  -- PARTNER-PLATFORM: a partner-origin order never asks the client to email the
  -- customer (the partner owns customer communication; the server-side gates
  -- refuse the send anyway — this keeps the CLIENT from asking).
  v_notify   := v_has_doc AND coalesce(v_order.order_origin, 'direct') <> 'partner';

  -- IDEMPOTENT. A repeated submission writes nothing: no second order write, no
  -- second audit row, no second lifecycle event, no second email, no earning.
  IF v_order.status = 'completed' AND v_order.doctor_status = 'patient_notified' THEN
    RETURN jsonb_build_object(
      'transitioned', false, 'reason', 'already_completed', 'idempotent', true,
      'order_id', v_order.id, 'confirmation_id', v_order.confirmation_id,
      'status', v_order.status, 'doctor_status', v_order.doctor_status,
      'has_customer_document', v_has_doc, 'has_provider', v_provider,
      'notify_customer', false,
      'completed_without_customer_document', v_order.completed_without_customer_document,
      'provider_earning_created', false,
      'message', 'This order is already Completed. Nothing was changed.');
  END IF;

  SELECT display_name, role INTO v_name, v_role FROM public.current_staff_actor();
  v_name := coalesce(v_name, 'Employee');
  v_role := coalesce(v_role, 'admin');

  v_prev_s  := v_order.status;
  v_prev_ds := v_order.doctor_status;

  -- The transition RECORDS a decision. It manufactures nothing: no document row,
  -- no document URL, no signature, no verification record, no provider
  -- submission, no provider earning, no provider assignment.
  UPDATE public.orders
     SET status                              = 'completed',
         doctor_status                       = 'patient_notified',
         admin_force_completed_at            = now(),
         admin_force_completed_by            = v_actor_id,
         admin_force_complete_reason         = v_reason,
         completed_without_customer_document = NOT v_has_doc
   WHERE id = v_order.id
  RETURNING * INTO v_order;

  INSERT INTO public.audit_logs (
    actor_id, actor_name, actor_role, actor_type, category, source,
    object_type, object_id, order_id, entity_type, entity_id,
    action, description, old_values, new_values, metadata
  ) VALUES (
    v_actor_id, v_name, v_role, 'employee', 'status', 'admin_portal',
    'order', v_order.confirmation_id, v_order.id, 'order', v_order.id::text,
    'order_admin_force_completed',
    format('%s force-completed order %s (was %s / %s)%s. Reason: %s',
           v_name, v_order.confirmation_id,
           coalesce(v_prev_s, '-'), coalesce(v_prev_ds, '-'),
           CASE WHEN v_has_doc THEN '' ELSE ' with NO customer-visible document' END,
           v_reason),
    jsonb_build_object('status', v_prev_s, 'doctor_status', v_prev_ds),
    jsonb_build_object('status', v_order.status, 'doctor_status', v_order.doctor_status),
    jsonb_build_object(
      'confirmation_id',                    v_order.confirmation_id,
      'order_id',                           v_order.id,
      'override_type',                      'admin_force_complete',
      'reason',                             v_reason,
      'document_present',                   v_has_doc,
      'provider_present',                   v_provider,
      'provider_user_id',                   v_order.doctor_user_id,
      'completed_without_customer_document', NOT v_has_doc,
      'customer_notification_allowed',      v_notify,
      'partner_order',                      coalesce(v_order.order_origin, 'direct') = 'partner',
      'provider_earning_created',           false,
      'task',                               'ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001'));

  RETURN jsonb_build_object(
    'transitioned', true,
    'order_id', v_order.id,
    'confirmation_id', v_order.confirmation_id,
    'previous_status', v_prev_s,
    'previous_doctor_status', v_prev_ds,
    'status', v_order.status,
    'doctor_status', v_order.doctor_status,
    'reason', v_reason,
    'actor_name', v_name,
    'has_provider', v_provider,
    'has_customer_document', v_has_doc,
    -- The client sends the completion email ONLY when this is true.
    -- notify-order-status independently refuses the send when it is not.
    'notify_customer', v_notify,
    'completed_without_customer_document', NOT v_has_doc,
    'provider_earning_created', false);
END;
$function$;
