-- PROVIDER-PROFESSIONAL-CONTACT-PUBLIC-CONSENT-001 · consent revocation.
--
-- A snapshot alone is not permission to keep publishing. Revoking approval must
-- suppress that contact type from EVERY public result immediately, including
-- results for letters already issued. The snapshot stays on the row for
-- audit/version integrity — it is simply no longer published.
--
-- What this migration does NOT do, deliberately:
--   • it never republishes the CURRENT profile value on a historical record.
--     The published value is always the issuance snapshot, so re-approving a
--     changed address cannot silently rewrite an old result.
--   • it never widens what the verifier can read. The join selects exactly two
--     booleans, so this cannot become a path to read arbitrary provider-profile
--     columns.
--
-- Body is the deployed definition (md5 667b26be5e87b51d3a3f5853dc19898e).

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
  v_email_ok boolean := false;
  v_phone_ok boolean := false;
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

  -- CURRENT consent, read as two booleans and nothing else.
  select coalesce(dp.professional_email_public_approved, false),
         coalesce(dp.professional_phone_public_approved, false)
    into v_email_ok, v_phone_ok
  from public.doctor_profiles dp
  where dp.id = v_rec.provider_id;

  -- Publish the ISSUANCE snapshot (never the current profile value), and only
  -- while consent for that contact type is still granted.
  v_contact := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'provider_phone', case when coalesce(v_phone_ok, false) then v_rec.provider_professional_phone end,
    'provider_email', case when coalesce(v_email_ok, false) then v_rec.provider_professional_email end
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

revoke all on function public.verify_letter_public(text, text) from public, anon, authenticated;
grant execute on function public.verify_letter_public(text, text) to anon, authenticated, service_role;
