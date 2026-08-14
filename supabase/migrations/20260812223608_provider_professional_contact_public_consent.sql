-- PROVIDER-PROFESSIONAL-CONTACT-PUBLIC-CONSENT-001
--
-- A landlord who verifies a letter should be able to reach the issuing
-- clinician. The only contact columns that existed were
-- `doctor_profiles.email` and `.phone`, and an audit of both arms showed
-- `email` is byte-identical to the provider's auth/login address for EVERY
-- provider (TEST 14/14, LIVE 22/22 — 18 of the LIVE ones consumer mailboxes),
-- while `phone` is unlabelled and present for only some. Publishing either on
-- the unauthenticated verification page would publish a login credential and
-- personal data.
--
-- So public contact becomes a separate, explicitly approved pair of fields:
--
--   • professional_email / professional_phone — typed by the provider or an
--     authorised admin. NEVER copied from auth.users, the login email, a
--     recovery address, or the pre-existing unlabelled `phone`. There is
--     deliberately no backfill in this migration.
--   • *_public_approved — the consent bit. A value alone is not permission to
--     publish it; the row is only published when the value is present AND the
--     approval flag is true.
--
-- The verification record snapshots the approved values at issuance, so a
-- historical result cannot silently change when a provider later edits their
-- profile.

-- ── 1 · profile columns ──────────────────────────────────────────────────────

alter table public.doctor_profiles
  add column if not exists professional_email text,
  add column if not exists professional_phone text,
  add column if not exists professional_email_public_approved boolean not null default false,
  add column if not exists professional_phone_public_approved boolean not null default false;

comment on column public.doctor_profiles.professional_email is
  'Provider-approved PROFESSIONAL email shown publicly on a successful letter verification. Never populated from auth.users, the login email or a recovery address. Publication also requires professional_email_public_approved.';
comment on column public.doctor_profiles.professional_phone is
  'Provider-approved PROFESSIONAL phone shown publicly on a successful letter verification. Never populated from the legacy unlabelled doctor_profiles.phone. Publication also requires professional_phone_public_approved.';
comment on column public.doctor_profiles.professional_email_public_approved is
  'Explicit consent to publish professional_email on the public verification result.';
comment on column public.doctor_profiles.professional_phone_public_approved is
  'Explicit consent to publish professional_phone on the public verification result.';

-- Consent cannot be granted for a value that does not exist. This is what makes
-- "approved" a meaningful gate rather than a flag that drifts away from data.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.doctor_profiles'::regclass
      and conname = 'doctor_profiles_professional_contact_consent_needs_value'
  ) then
    alter table public.doctor_profiles
      add constraint doctor_profiles_professional_contact_consent_needs_value
      check (
        (not professional_email_public_approved
           or (professional_email is not null and btrim(professional_email) <> ''))
        and
        (not professional_phone_public_approved
           or (professional_phone is not null and btrim(professional_phone) <> ''))
      );
  end if;
end $$;

-- ── 2 · verification snapshot columns ────────────────────────────────────────

alter table public.letter_verifications
  add column if not exists provider_professional_email text,
  add column if not exists provider_professional_phone text;

comment on column public.letter_verifications.provider_professional_email is
  'Snapshot of the APPROVED professional email at issuance. Null when the provider had not approved one. Never re-read live, so an old result cannot change when a profile is edited.';
comment on column public.letter_verifications.provider_professional_phone is
  'Snapshot of the APPROVED professional phone at issuance. Null when the provider had not approved one.';

-- ── 3 · issuance snapshots the approved values ───────────────────────────────
--
-- Rewritten from this database's own pg_get_functiondef with the INSERT column
-- list extended. The only behavioural change is the two snapshot columns; the
-- authorisation gate, advisory lock, prefix logic and retry loop are unchanged.

create or replace function public.ensure_revision_verification_id(
  p_version_id uuid, p_state text, p_letter_type text, p_provider_id uuid default null::uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row public.order_document_versions;
  v_state text := upper(trim(coalesce(p_state,'')));
  v_id text; v_gen text; v_prefix text;
  v_prof_email text; v_prof_phone text;
begin
  if auth.uid() is not null and not public.is_admin_staff() then
    raise exception 'ensure_revision_verification_id: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.order_document_versions where id = p_version_id;
  if not found then
    raise exception 'ensure_revision_verification_id: version % not found', p_version_id;
  end if;
  if v_row.letter_id is not null then
    return v_row.letter_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('docver_mint:' || p_version_id::text, 0));

  select letter_id into v_id from public.order_document_versions where id = p_version_id;
  if v_id is not null then return v_id; end if;

  v_state := left(regexp_replace(v_state, '[^A-Z]', '', 'g'), 2);
  if length(v_state) <> 2 then
    raise exception 'ensure_revision_verification_id: invalid state %', p_state
      using errcode = 'check_violation';
  end if;

  v_prefix := case when lower(coalesce(p_letter_type,'esa')) = 'psd' then 'PSD-' else 'ESA-' end;

  -- Approved-only, and only when a value actually exists. An unapproved or
  -- blank value snapshots as NULL, which the verifier renders as no row at all.
  select
    case when dp.professional_email_public_approved
              and btrim(coalesce(dp.professional_email,'')) <> ''
         then btrim(dp.professional_email) end,
    case when dp.professional_phone_public_approved
              and btrim(coalesce(dp.professional_phone,'')) <> ''
         then btrim(dp.professional_phone) end
    into v_prof_email, v_prof_phone
  from public.doctor_profiles dp
  where dp.id = p_provider_id;

  for i in 1..8 loop
    v_gen := public.generate_letter_verification_id(v_state);
    v_gen := v_prefix || regexp_replace(v_gen, '^(ESA|PSD)-', '');
    begin
      insert into public.letter_verifications (
        letter_id, order_id, provider_id, state, letter_type,
        issued_at, status, expires_at, version, confirmation_id,
        provider_professional_email, provider_professional_phone)
      values (
        v_gen, v_row.order_id, p_provider_id, v_state,
        lower(coalesce(p_letter_type,'esa')),
        now(), 'valid', null, v_row.version, v_row.confirmation_id,
        v_prof_email, v_prof_phone);

      update public.order_document_versions set letter_id = v_gen where id = p_version_id;
      return v_gen;
    exception when unique_violation then
      null;
    end;
  end loop;

  raise exception 'ensure_revision_verification_id: could not generate a unique ID after 8 attempts';
end;
$function$;

-- ── 4 · the public verifier publishes the snapshot, never the profile ────────
--
-- Rewritten from this database's own definition. Two contact keys are added and
-- they read ONLY from the verification row. The demo branch is untouched and
-- therefore still cannot emit contact data. Null contact keys are stripped so
-- the client omits the row entirely rather than rendering "Not provided".

create or replace function public.verify_letter_public(
  p_token text default null::text, p_letter_id text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_rec record;
  v_dp record;
  v_o record;
  v_status text;
  v_masked text;
  v_contact jsonb;
begin
  if p_token is not null and pg_catalog.btrim(p_token) <> '' then
    select * into v_rec
    from public.letter_verifications
    where public_token = pg_catalog.btrim(p_token)
    limit 1;
  elsif p_letter_id is not null and pg_catalog.btrim(p_letter_id) <> '' then
    select * into v_rec
    from public.letter_verifications
    where letter_id = pg_catalog.upper(pg_catalog.btrim(p_letter_id))
    limit 1;
  end if;

  if v_rec.id is null then
    return pg_catalog.jsonb_build_object(
      'found', false,
      'status', 'not_found',
      'message', 'We could not verify this letter.'
    );
  end if;

  if v_rec.is_demo then
    return pg_catalog.jsonb_build_object(
      'found', true,
      'status', 'demo',
      'is_demo', true,
      'letter_id', v_rec.letter_id,
      'letter_type', v_rec.letter_type,
      'patient_name_checkable', false,
      'message', 'SAMPLE — demonstration record. Not a valid clinical verification.'
    );
  end if;

  if v_rec.status = 'revoked' then
    v_status := 'revoked';
  elsif v_rec.expires_at is not null and v_rec.expires_at < pg_catalog.now() then
    v_status := 'expired';
  elsif v_rec.superseded_at is not null then
    v_status := 'superseded';
  else
    v_status := coalesce(v_rec.status, 'valid');
  end if;

  select * into v_dp from public.doctor_profiles where id = v_rec.provider_id limit 1;
  select first_name, last_name into v_o from public.orders where id = v_rec.order_id limit 1;
  v_masked := public.mask_person_name(v_o.first_name, v_o.last_name);

  -- Snapshot only. Never v_dp.email / v_dp.phone — those are the login address
  -- and an unlabelled number, and publishing them is the defect this exists to
  -- prevent. jsonb_strip_nulls drops an absent key so no empty row renders.
  v_contact := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'provider_phone', v_rec.provider_professional_phone,
    'provider_email', v_rec.provider_professional_email
  ));

  return pg_catalog.jsonb_build_object(
    'found', true,
    'status', v_status,
    'is_demo', v_rec.is_demo,
    'letter_id', v_rec.letter_id,
    'letter_type', v_rec.letter_type,
    'state', v_rec.state,
    'issued_at', pg_catalog.to_char(v_rec.issued_at at time zone 'UTC', 'YYYY-MM-DD'),
    'expires_at', case when v_rec.expires_at is not null
      then pg_catalog.to_char(v_rec.expires_at at time zone 'UTC', 'YYYY-MM-DD') else null end,
    'patient_name_masked', v_masked,
    'patient_name_checkable', v_masked is not null,
    'provider_name', v_dp.full_name,
    'provider_title', v_dp.title,
    'provider_npi', v_dp.npi_number,
    'provider_license', v_dp.license_number,
    'provider_state_licenses', case
      when v_dp.state_license_numbers is not null and v_dp.state_license_numbers::text <> '{}'
      then v_dp.state_license_numbers else null end,
    'document_version', coalesce(v_rec.version, 1),
    'has_newer_version', v_rec.superseded_at is not null,
    'superseded_at', case when v_rec.superseded_at is not null
      then pg_catalog.to_char(v_rec.superseded_at at time zone 'UTC', 'YYYY-MM-DD') else null end
  ) || v_contact;
end;
$function$;

-- The verifier is the only public reader. Keep the direct-grant posture the
-- surrounding migrations established: revoke by name, then grant execute.
revoke all on function public.verify_letter_public(text, text) from public, anon, authenticated;
grant execute on function public.verify_letter_public(text, text) to anon, authenticated, service_role;
