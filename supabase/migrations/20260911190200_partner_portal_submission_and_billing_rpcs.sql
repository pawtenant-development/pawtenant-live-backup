-- PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 (part 3)
--
-- Submission, partner-user administration, Stripe receivables and MANUAL
-- per-order reconciliation.
--
-- THE RULE THIS FILE EXISTS TO ENFORCE
--   Paying a partner invoice is bookkeeping. It marks the INVOICE paid and
--   moves its orders to `invoice_paid_unreconciled`. It does not complete a
--   clinical order, does not move a provider's workflow, does not deliver a
--   document, does not send a customer anything and does not create a second
--   provider earning. Only a human admin, order by order, sets `paid`.
-- ───────────────────────────────────────────────────────────────────────────
-- 1. ONE ORDER, ONE ACTIVE INVOICE
--
-- A billable event may appear on at most one invoice that has not been voided.
-- Enforced in the database so neither the manual path nor the weekly cron can
-- bill the same work twice.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.tg_partner_invoice_line_single_active()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
begin
  if exists (
    select 1
      from public.partner_invoice_lines l
      join public.partner_invoices i on i.id = l.invoice_id
     where l.billable_event_id = new.billable_event_id
       and l.invoice_id <> new.invoice_id
       and i.status <> 'void'
  ) then
    raise exception 'billable event % is already on an active invoice', new.billable_event_id
      using errcode = '23505';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_partner_invoice_line_single_active on public.partner_invoice_lines;
create trigger trg_partner_invoice_line_single_active
  before insert on public.partner_invoice_lines
  for each row execute function public.tg_partner_invoice_line_single_active();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. SUBMISSION — the one path used by the partner portal AND the admin form
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.partner_submit_manual_order(
  p_partner_id              uuid,
  p_service                 text,
  p_customer                jsonb,
  p_pets                    jsonb,
  p_questionnaire_text      text,
  p_partner_reference       text,
  p_authorization_confirmed boolean,
  p_client_request_id       text,
  p_draft_id                uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
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

  -- WHOSE ORDER IS THIS? A partner caller is pinned to their own organisation
  -- and a mismatched p_partner_id is refused rather than quietly corrected, so
  -- a forged id surfaces as an error instead of writing to the wrong partner.
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

  -- No active rate for this partner and service => refuse the SUBMISSION, with
  -- a clear code. The caller keeps its draft; nothing is created.
  v_env := case when v_org.production_enabled then 'production' else 'sandbox' end;
  select * into v_rate from public.partner_rate_cards
   where partner_id = v_pid and service = v_service and environment = v_env
     and effective_from <= now() and (effective_to is null or effective_to > now())
   order by version desc limit 1;
  if not found then
    raise exception 'no_active_rate' using errcode = 'P0002';
  end if;

  -- IDEMPOTENCY. A refresh or a double click replays the recorded request and
  -- returns the SAME order; a reused partner reference that belongs to a
  -- different submission is a duplicate and is refused.
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

  -- The payload handed to the canonical transaction. Shape matches the partner
  -- API contract so manual and API orders stay ONE order type.
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
    'assessment', jsonb_build_object(
      'answers', jsonb_build_object(
        'partnerQuestionnaireText', p_questionnaire_text,
        'partnerIntakeChannel', 'partner_portal_manual'
      )
    ),
    'address', coalesce(p_customer->'address', '{}'::jsonb)
  );
  -- Hash over structure, not over the clinical text alone: it is a provenance
  -- marker, never a way to reconstruct the answers.
  v_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

  select * into v_res from public.partner_accept_order(
    v_pid, v_payload, v_hash, 'portal.manual.v1', p_client_request_id,
    p_client_request_id, null, 'partner_portal_manual');

  -- Audit: ids, counts and lengths only. The questionnaire text, the customer's
  -- name, email, phone, DOB and the pets' details never enter this payload.
  -- The action lives in the canonical `partner_intake_*` namespace that
  -- partner_intake_audit() accepts; anything outside it is rejected there.
  perform public.partner_intake_audit(
    auth.uid(), v_email, 'partner_intake_portal_order_submitted', null, v_pid, v_res.order_id,
    jsonb_build_object(
      'actor_kind', v_actor_kind,
      'service', v_service,
      'intake_method', 'partner_portal_manual',
      'pet_count', jsonb_array_length(v_pets),
      'questionnaire_chars', length(coalesce(p_questionnaire_text,'')),
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
$fn$;

revoke all on function public.partner_submit_manual_order(uuid,text,jsonb,jsonb,text,text,boolean,text,uuid) from public, anon;
grant execute on function public.partner_submit_manual_order(uuid,text,jsonb,jsonb,text,text,boolean,text,uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. PARTNER USER ADMINISTRATION (PawTenant admins only)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.partner_admin_list_users(p_partner_id uuid default null)
returns table(
  id uuid, partner_id uuid, partner_name text, email text, role text, status text,
  invited_by_email text, invited_at timestamptz, invitation_sent_count integer,
  invitation_last_sent_at timestamptz, accepted_at timestamptz, revoked_at timestamptz,
  revoke_reason text, last_access_at timestamptz, has_auth_user boolean
)
language sql
stable
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
  select u.id, u.partner_id, o.display_name, u.email, u.role, u.status,
         u.invited_by_email, u.invited_at, u.invitation_sent_count,
         u.invitation_last_sent_at, u.accepted_at, u.revoked_at, u.revoke_reason,
         u.last_access_at, (u.user_id is not null)
    from public.partner_users u
    join public.partner_organizations o on o.id = u.partner_id
   where public.is_chat_admin()
     and (p_partner_id is null or u.partner_id = p_partner_id)
   order by o.display_name, u.email;
$fn$;

create or replace function public.partner_admin_invite_user(p_partner_id uuid, p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
declare
  v_email text := lower(trim(coalesce(p_email,'')));
  v_role  text := coalesce(nullif(trim(coalesce(p_role,'')), ''), 'partner_staff');
  v_id    uuid;
  v_admin text := lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email', ''));
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if v_role not in ('partner_admin','partner_staff') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if not exists (select 1 from public.partner_organizations where id = p_partner_id and status in ('sandbox','active')) then
    raise exception 'partner_not_active' using errcode = 'P0002';
  end if;
  -- A staff address must never become a partner login: PawTenant admins and
  -- providers live in the same auth pool.
  if exists (select 1 from public.doctor_profiles dp join auth.users au on au.id = dp.user_id
              where lower(au.email) = v_email) then
    raise exception 'address_belongs_to_internal_staff' using errcode = '42501';
  end if;

  insert into public.partner_users (partner_id, email, role, status, invited_by, invited_by_email)
  values (p_partner_id, v_email, v_role, 'invited', auth.uid(), v_admin)
  returning id into v_id;

  perform private.partner_admin_audit('partner_user_invited', 'partner_user', v_id::text,
          jsonb_build_object('partner_id', p_partner_id, 'role', v_role));
  return v_id;
end;
$fn$;

create or replace function public.partner_admin_record_invitation_sent(p_partner_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
declare v_n int;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  update public.partner_users
     set invitation_sent_count = invitation_sent_count + 1, invitation_last_sent_at = now()
   where id = p_partner_user_id and status <> 'revoked';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'partner_user_not_found' using errcode = 'P0002'; end if;
  perform private.partner_admin_audit('partner_user_invitation_resent', 'partner_user', p_partner_user_id::text, '{}'::jsonb);
  return true;
end;
$fn$;

create or replace function public.partner_admin_set_user_access(p_partner_user_id uuid, p_revoked boolean, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
declare v_row public.partner_users%rowtype;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select * into v_row from public.partner_users where id = p_partner_user_id for update;
  if not found then raise exception 'partner_user_not_found' using errcode = 'P0002'; end if;

  if p_revoked then
    update public.partner_users
       set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
           revoke_reason = nullif(trim(coalesce(p_reason,'')), '')
     where id = p_partner_user_id;
    perform private.partner_admin_audit('partner_user_revoked', 'partner_user', p_partner_user_id::text,
            jsonb_build_object('partner_id', v_row.partner_id));
  else
    -- Reinstating returns the row to whichever state it can honestly hold: a
    -- bound user becomes active again, an unbound one goes back to `invited`.
    update public.partner_users
       set status = case when v_row.user_id is not null then 'active' else 'invited' end,
           accepted_at = case when v_row.user_id is not null then coalesce(v_row.accepted_at, now()) else v_row.accepted_at end,
           revoked_at = null, revoked_by = null, revoke_reason = null
     where id = p_partner_user_id;
    perform private.partner_admin_audit('partner_user_reinstated', 'partner_user', p_partner_user_id::text,
            jsonb_build_object('partner_id', v_row.partner_id));
  end if;
  return true;
end;
$fn$;

revoke all on function public.partner_admin_list_users(uuid) from public, anon;
revoke all on function public.partner_admin_invite_user(uuid,text,text) from public, anon;
revoke all on function public.partner_admin_record_invitation_sent(uuid) from public, anon;
revoke all on function public.partner_admin_set_user_access(uuid,boolean,text) from public, anon;
grant execute on function public.partner_admin_list_users(uuid) to authenticated;
grant execute on function public.partner_admin_invite_user(uuid,text,text) to authenticated;
grant execute on function public.partner_admin_record_invitation_sent(uuid) to authenticated;
grant execute on function public.partner_admin_set_user_access(uuid,boolean,text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. BILLING PROFILE
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.partner_admin_upsert_billing_profile(p_partner_id uuid, p_patch jsonb)
returns public.partner_billing_profiles
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $fn$
declare
  v_row public.partner_billing_profiles%rowtype;
  v_org public.partner_organizations%rowtype;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select * into v_org from public.partner_organizations where id = p_partner_id;
  if not found then raise exception 'partner_not_found' using errcode = 'P0002'; end if;

  insert into public.partner_billing_profiles (partner_id, legal_business_name, created_by, updated_by)
  values (p_partner_id, v_org.legal_name, auth.uid(), auth.uid())
  on conflict (partner_id) do nothing;

  update public.partner_billing_profiles p set
    legal_business_name      = coalesce(nullif(trim(coalesce(p_patch->>'legal_business_name','')), ''), p.legal_business_name),
    billing_email            = case when p_patch ? 'billing_email'      then nullif(lower(trim(coalesce(p_patch->>'billing_email',''))), '') else p.billing_email end,
    stripe_customer_id       = case when p_patch ? 'stripe_customer_id' then nullif(trim(coalesce(p_patch->>'stripe_customer_id','')), '') else p.stripe_customer_id end,
    currency                 = coalesce(nullif(upper(trim(coalesce(p_patch->>'currency',''))), ''), p.currency),
    payment_terms_days       = coalesce((p_patch->>'payment_terms_days')::int, p.payment_terms_days),
    weekly_invoicing_enabled = coalesce((p_patch->>'weekly_invoicing_enabled')::boolean, p.weekly_invoicing_enabled),
    invoice_weekday          = coalesce((p_patch->>'invoice_weekday')::smallint, p.invoice_weekday),
    invoice_hour             = coalesce((p_patch->>'invoice_hour')::smallint, p.invoice_hour),
    active                   = coalesce((p_patch->>'active')::boolean, p.active),
    notes                    = case when p_patch ? 'notes' then nullif(trim(coalesce(p_patch->>'notes','')), '') else p.notes end,
    updated_by               = auth.uid()
  where p.partner_id = p_partner_id
  returning * into v_row;

  perform private.partner_admin_audit('partner_billing_profile_updated', 'partner_billing_profile', p_partner_id::text,
          jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(coalesce(p_patch,'{}'::jsonb)) k),
                             'weekly_enabled', v_row.weekly_invoicing_enabled));
  return v_row;
end;
$fn$;

revoke all on function public.partner_admin_upsert_billing_profile(uuid,jsonb) from public, anon;
grant execute on function public.partner_admin_upsert_billing_profile(uuid,jsonb) to authenticated;
