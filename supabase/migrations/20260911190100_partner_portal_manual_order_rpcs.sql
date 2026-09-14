-- PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 (part 2)
--
-- The authorization surface. Partner tables stay admin-only under RLS; every
-- partner-facing read and write is a SECURITY DEFINER projection that derives
-- the caller's organisation from auth.uid() through public.partner_users.
--
-- READ THIS BEFORE CHANGING ANYTHING HERE
--   * p_partner_id is ADVISORY. For a partner caller it is overridden by
--     current_partner_id() and a mismatch is refused outright, so a forged
--     partner id can never reach a write.
--   * The questionnaire text is clinical free text. It is stored verbatim on
--     the order and NEVER copied into an audit metadata payload, a webhook, a
--     notification or a log line. Audit rows carry ids, lengths and counts.
--   * Nothing in this file may change orders.status, orders.doctor_status,
--     documents or doctor_earnings. Billing is a separate ledger.
-- ───────────────────────────────────────────────────────────────────────────
-- 0. CANONICAL ORDER CREATION — teach the shared transaction the new method
--
-- Rewritten from this database's own pg_get_functiondef. The ONLY changes are
-- the accepted intake methods and the answer `source` mapping; everything else
-- is byte-for-byte the deployed body, so API orders keep behaving identically.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.partner_accept_order(p_partner_id uuid, p_payload jsonb, p_payload_hash text, p_schema_version text, p_idempotency_key text, p_request_id text, p_target_assessment_version text DEFAULT NULL::text, p_intake_method text DEFAULT 'api'::text)
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
  v_stored_version text := coalesce(p_target_assessment_version, p_schema_version);
begin
  if coalesce(p_intake_method, '') not in ('api','manual','partner_portal_manual') then
    raise exception 'intake_method must be api, manual or partner_portal_manual' using errcode = '22023';
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
      'source', case when p_intake_method = 'api' then 'partner_api' else 'partner_manual' end,
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
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. SHARED VALIDATION — one rule set for the portal, the admin form and
--    (later) any API-connected partner that routes through here.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.partner_manual_order_validate(
  p_partner   public.partner_organizations,
  p_service   text,
  p_customer  jsonb,
  p_pets      jsonb,
  p_questionnaire text
) returns text[]
language plpgsql
immutable
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
declare
  v_errors text[] := '{}';
  v_states text[] := array[
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
    'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR',
    'PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
  v_state  text := upper(trim(coalesce(p_customer->>'state','')));
  v_email  text := lower(trim(coalesce(p_customer->>'email','')));
  v_dob    text := trim(coalesce(p_customer->>'dob',''));
  v_birth  date;
  v_pet    jsonb;
  v_count  int;
  v_i      int := 0;
begin
  if p_service is null or p_service not in ('esa','psd') then
    v_errors := array_append(v_errors, 'service_invalid');
  elsif cardinality(p_partner.allowed_services) > 0 and not (p_service = any (p_partner.allowed_services)) then
    v_errors := array_append(v_errors, 'service_not_enabled_for_partner');
  end if;

  if coalesce(trim(p_customer->>'firstName'),'') = '' then v_errors := array_append(v_errors, 'customer_first_name_required'); end if;
  if coalesce(trim(p_customer->>'lastName'),'')  = '' then v_errors := array_append(v_errors, 'customer_last_name_required');  end if;

  -- Same rules as the customer assessment Step 2: RFC-5322-lite email, a phone,
  -- a served state, and 18+ calculated from the date of birth.
  if v_email = '' then
    v_errors := array_append(v_errors, 'customer_email_required');
  elsif v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    v_errors := array_append(v_errors, 'customer_email_invalid');
  end if;

  if coalesce(trim(p_customer->>'phone'),'') = '' then v_errors := array_append(v_errors, 'customer_phone_required'); end if;

  if v_dob = '' then
    v_errors := array_append(v_errors, 'customer_dob_required');
  else
    begin
      v_birth := v_dob::date;
      if v_birth > (current_date - interval '18 years') then
        v_errors := array_append(v_errors, 'customer_must_be_18');
      end if;
    exception when others then
      v_errors := array_append(v_errors, 'customer_dob_invalid');
    end;
  end if;

  if v_state = '' then
    v_errors := array_append(v_errors, 'customer_state_required');
  elsif not (v_state = any (v_states)) then
    v_errors := array_append(v_errors, 'customer_state_invalid');
  elsif cardinality(p_partner.allowed_states) > 0 and not (v_state = any (p_partner.allowed_states)) then
    v_errors := array_append(v_errors, 'customer_state_not_enabled_for_partner');
  end if;

  -- Animals: 1–3, matching MAX_PETS in the customer assessment. A PSD order is
  -- a task-trained dog; anything else is refused rather than silently coerced.
  v_count := coalesce(jsonb_array_length(p_pets), 0);
  if v_count < 1 then
    v_errors := array_append(v_errors, 'at_least_one_pet_required');
  elsif v_count > 3 then
    v_errors := array_append(v_errors, 'too_many_pets');
  end if;

  for v_pet in select * from jsonb_array_elements(coalesce(p_pets,'[]'::jsonb)) loop
    v_i := v_i + 1;
    if coalesce(trim(v_pet->>'name'),'')  = '' then v_errors := array_append(v_errors, 'pet_' || v_i || '_name_required');  end if;
    if coalesce(trim(v_pet->>'type'),'')  = '' then v_errors := array_append(v_errors, 'pet_' || v_i || '_type_required');  end if;
    if coalesce(trim(v_pet->>'age'),'')   = '' then v_errors := array_append(v_errors, 'pet_' || v_i || '_age_required');   end if;
    if coalesce(trim(v_pet->>'breed'),'') = '' then v_errors := array_append(v_errors, 'pet_' || v_i || '_breed_required'); end if;
    if p_service = 'psd' and lower(coalesce(trim(v_pet->>'type'),'')) <> 'dog' then
      v_errors := array_append(v_errors, 'pet_' || v_i || '_must_be_dog_for_psd');
    end if;
  end loop;

  if coalesce(trim(p_questionnaire),'') = '' then
    v_errors := array_append(v_errors, 'questionnaire_required');
  elsif length(p_questionnaire) > 20000 then
    v_errors := array_append(v_errors, 'questionnaire_too_long');
  end if;

  return v_errors;
end;
$fn$;

revoke all on function public.partner_manual_order_validate(public.partner_organizations,text,jsonb,jsonb,text) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. PARTNER IDENTITY — accept an invitation, read own context
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.partner_portal_accept_invitation()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email', ''));
  v_row   public.partner_users%rowtype;
begin
  if v_uid is null or v_email = '' then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_row from public.partner_users where user_id = v_uid;
  if found then
    if v_row.status <> 'active' then
      raise exception 'partner access revoked' using errcode = '42501';
    end if;
    update public.partner_users set last_access_at = now() where id = v_row.id;
    return jsonb_build_object('accepted', false, 'partner_id', v_row.partner_id, 'role', v_row.role);
  end if;

  -- Bind the invitation to this authenticated user exactly once. An invitation
  -- is matched on the address it was issued to — never on anything the client
  -- sends.
  select * into v_row from public.partner_users
   where email = v_email and status = 'invited' and user_id is null
   for update;
  if not found then
    raise exception 'no partner invitation for this account' using errcode = '42501';
  end if;

  update public.partner_users
     set user_id = v_uid, status = 'active', accepted_at = now(), last_access_at = now()
   where id = v_row.id;

  perform private.partner_admin_audit('partner_user_accepted_invitation', 'partner_user', v_row.id::text,
          jsonb_build_object('partner_id', v_row.partner_id, 'role', v_row.role));

  return jsonb_build_object('accepted', true, 'partner_id', v_row.partner_id, 'role', v_row.role);
end;
$fn$;

create or replace function public.partner_portal_context()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
declare
  v_pid  uuid := public.current_partner_id();
  v_org  public.partner_organizations%rowtype;
  v_env  text;
begin
  if v_pid is null then
    raise exception 'partner access required' using errcode = '42501';
  end if;
  select * into v_org from public.partner_organizations where id = v_pid;
  v_env := case when v_org.production_enabled then 'production' else 'sandbox' end;

  update public.partner_users set last_access_at = now()
   where user_id = auth.uid() and status = 'active';

  return jsonb_build_object(
    'partner_id',       v_org.id,
    'display_name',     v_org.display_name,
    'legal_name',       v_org.legal_name,
    'status',           v_org.status,
    'intake_mode',      v_org.intake_mode,
    'allowed_services', to_jsonb(v_org.allowed_services),
    'allowed_states',   to_jsonb(v_org.allowed_states),
    'role',             public.current_partner_role(),
    'rates', coalesce((
      select jsonb_agg(jsonb_build_object('service', r.service, 'amount_cents', r.wholesale_unit_price_cents,
                                          'currency', r.currency, 'version', r.version) order by r.service)
        from public.partner_rate_cards r
       where r.partner_id = v_pid and r.environment = v_env
         and r.effective_from <= now() and (r.effective_to is null or r.effective_to > now())
    ), '[]'::jsonb)
  );
end;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. PARTNER ORDER LIST — no provider identity, no provider pay, no margin
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.partner_portal_orders(p_limit integer default 100, p_offset integer default 0)
returns table(
  order_id uuid, confirmation_id text, partner_reference text, service text,
  customer_name text, pet_names text, pet_count integer,
  submitted_at timestamptz, clinical_status text, billing_status text,
  invoice_number text, invoice_status text, partner_charge_cents integer, currency text
)
language sql
stable
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
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
    coalesce(f.currency, 'USD')
  from public.orders o
  left join public.partner_order_financials f on f.order_id = o.id
  left join public.partner_invoices inv       on inv.id = f.invoice_id
  where o.order_origin = 'partner'
    and o.partner_id = public.current_partner_id()
    and public.current_partner_id() is not null
  order by o.partner_accepted_at desc nulls last, o.created_at desc
  limit greatest(least(coalesce(p_limit, 100), 500), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$fn$;

create or replace function public.partner_portal_invoices()
returns table(
  invoice_id uuid, invoice_number text, status text, total_cents integer, currency text,
  issued_at timestamptz, due_at timestamptz, paid_at timestamptz, amount_paid_cents integer,
  hosted_invoice_url text, order_count integer
)
language sql
stable
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
  select i.id, i.invoice_number, i.status, i.total_cents, i.currency,
         i.issued_at, i.due_at, i.paid_at, i.amount_paid_cents,
         i.stripe_hosted_invoice_url,
         (select count(*)::int from public.partner_invoice_lines l where l.invoice_id = i.id)
    from public.partner_invoices i
   where i.partner_id = public.current_partner_id()
     and public.current_partner_id() is not null
   order by i.created_at desc;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. DRAFTS — a partner may save and delete only their OWN unsubmitted draft
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.partner_portal_drafts()
returns setof public.partner_order_drafts
language sql
stable
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
  select d.* from public.partner_order_drafts d
   where d.partner_id = public.current_partner_id()
     and public.current_partner_id() is not null
     and d.created_by = auth.uid()
     and d.status = 'draft'
   order by d.updated_at desc;
$fn$;

create or replace function public.partner_portal_save_draft(
  p_draft_id uuid, p_service text, p_form jsonb, p_questionnaire text, p_reference text
) returns uuid
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
declare
  v_pid uuid := public.current_partner_id();
  v_id  uuid;
begin
  if v_pid is null then raise exception 'partner access required' using errcode = '42501'; end if;
  if p_questionnaire is not null and length(p_questionnaire) > 20000 then
    raise exception 'questionnaire_too_long' using errcode = '22023';
  end if;

  if p_draft_id is null then
    insert into public.partner_order_drafts (partner_id, created_by, created_by_email, created_by_kind,
                                             service, form, questionnaire_text, partner_reference)
    values (v_pid, auth.uid(),
            lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email', '')),
            'partner', nullif(lower(coalesce(p_service,'')), ''), coalesce(p_form,'{}'::jsonb),
            p_questionnaire, nullif(trim(coalesce(p_reference,'')), ''))
    returning id into v_id;
    return v_id;
  end if;

  update public.partner_order_drafts
     set service = nullif(lower(coalesce(p_service,'')), ''),
         form = coalesce(p_form,'{}'::jsonb),
         questionnaire_text = p_questionnaire,
         partner_reference = nullif(trim(coalesce(p_reference,'')), '')
   where id = p_draft_id and partner_id = v_pid and created_by = auth.uid() and status = 'draft'
  returning id into v_id;

  if v_id is null then raise exception 'draft_not_found' using errcode = 'P0002'; end if;
  return v_id;
end;
$fn$;

create or replace function public.partner_portal_delete_draft(p_draft_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
declare
  v_pid uuid := public.current_partner_id();
  v_n   int;
begin
  if v_pid is null then raise exception 'partner access required' using errcode = '42501'; end if;
  -- A SUBMITTED draft is history and is never deletable — only an unsubmitted
  -- draft belonging to this very user can be removed.
  delete from public.partner_order_drafts
   where id = p_draft_id and partner_id = v_pid and created_by = auth.uid() and status = 'draft';
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$fn$;

revoke all on function public.partner_portal_accept_invitation() from public, anon;
revoke all on function public.partner_portal_context()           from public, anon;
revoke all on function public.partner_portal_orders(integer,integer) from public, anon;
revoke all on function public.partner_portal_invoices()          from public, anon;
revoke all on function public.partner_portal_drafts()            from public, anon;
revoke all on function public.partner_portal_save_draft(uuid,text,jsonb,text,text) from public, anon;
revoke all on function public.partner_portal_delete_draft(uuid)  from public, anon;
grant execute on function public.partner_portal_accept_invitation() to authenticated;
grant execute on function public.partner_portal_context()           to authenticated;
grant execute on function public.partner_portal_orders(integer,integer) to authenticated;
grant execute on function public.partner_portal_invoices()          to authenticated;
grant execute on function public.partner_portal_drafts()            to authenticated;
grant execute on function public.partner_portal_save_draft(uuid,text,jsonb,text,text) to authenticated;
grant execute on function public.partner_portal_delete_draft(uuid)  to authenticated;
