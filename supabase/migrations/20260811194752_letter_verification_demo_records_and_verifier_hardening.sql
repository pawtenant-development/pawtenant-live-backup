-- QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001
-- TEST-only schema hardening. Creates no demo rows.

begin;

do $preflight$
begin
  if to_regclass('public.letter_verifications') is null then
    raise exception 'preflight: letter_verifications is missing';
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.letter_verifications'::regclass
      and attname = 'is_demo' and attnum > 0 and not attisdropped
      and attnotnull
  ) then
    raise exception 'preflight: required NOT NULL is_demo column is missing';
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.letter_verifications'::regclass
      and attname = 'order_id' and attnum > 0 and not attisdropped
      and attnotnull
  ) then
    raise exception 'preflight: order_id is not in the expected NOT NULL state';
  end if;
  if exists (select 1 from public.letter_verifications where is_demo) then
    raise exception 'preflight: demo rows already exist';
  end if;
  if exists (select 1 from public.letter_verifications where order_id is null) then
    raise exception 'preflight: an existing genuine row has no order';
  end if;
  if exists (select 1 from public.letter_verifications where state = 'ZZ' or letter_id like '%-ZZ-%') then
    raise exception 'preflight: reserved ZZ is already in use';
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.letter_verifications'::regclass
      and conname = 'letter_verifications_demo_isolation'
  ) then
    raise exception 'preflight: demo-isolation constraint already exists';
  end if;
  if to_regclass('public.letter_verifications_one_demo_per_type') is not null then
    raise exception 'preflight: one-demo-per-type index already exists';
  end if;
  if to_regprocedure('public.verify_letter_public(text,text)') is null
     or to_regprocedure('public.verify_letter_name_match(text,text,text)') is null then
    raise exception 'preflight: verifier function missing';
  end if;
  if not has_function_privilege('service_role', 'public.verify_letter_public(text,text)', 'execute')
     or not has_function_privilege('service_role', 'public.verify_letter_name_match(text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.verify_letter_public(text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.verify_letter_public(text,text)', 'execute') then
    raise exception 'preflight: verifier ACL drift detected';
  end if;
end
$preflight$;

alter table public.letter_verifications
  alter column order_id drop not null;

alter table public.letter_verifications
  add constraint letter_verifications_demo_isolation check (
    (
      is_demo = false
      and order_id is not null
      and state <> 'ZZ'
    )
    or
    (
      is_demo = true
      and order_id is null
      and provider_id is null
      and document_version_id is null
      and confirmation_id is null
      and file_url is null
      and processed_file_url is null
      and superseded_at is null
      and superseded_by_letter_id is null
      and revoked_at is null
      and revoke_reason is null
      and expires_at is null
      and status = 'valid'
      and version = 1
      and state = 'ZZ'
      and letter_type in ('esa', 'psd')
      and public_token is not null
      and letter_id ~ '^(ESA|PSD)-ZZ-[A-HJ-NP-Z2-9]{7}$'
      and left(letter_id, 3) = upper(letter_type)
    )
  ) not valid;

alter table public.letter_verifications
  validate constraint letter_verifications_demo_isolation;

create unique index letter_verifications_one_demo_per_type
  on public.letter_verifications (letter_type)
  where is_demo;

revoke all on table public.letter_verifications from public;
revoke all on table public.letter_verifications from anon;
revoke all on table public.letter_verifications from authenticated;
grant select on table public.letter_verifications to authenticated;
revoke all on table public.letter_verifications from service_role;
grant select, insert, update, delete on table public.letter_verifications to service_role;

create or replace function public.verify_letter_public(
  p_token text default null,
  p_letter_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $verify_letter_public$
declare
  v_rec record;
  v_dp record;
  v_o record;
  v_status text;
  v_masked text;
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
  );
end;
$verify_letter_public$;

create or replace function public.verify_letter_name_match(
  p_name text,
  p_token text default null,
  p_letter_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $verify_letter_name_match$
declare
  v_rec record;
  v_o record;
  v_stored text;
  v_given text;
begin
  v_given := public.normalize_person_name(p_name);
  if v_given is null then
    return pg_catalog.jsonb_build_object(
      'checked', false, 'matches', false,
      'message', 'Enter the name printed on the letter.'
    );
  end if;

  if p_token is not null and pg_catalog.btrim(p_token) <> '' then
    select * into v_rec from public.letter_verifications
    where public_token = pg_catalog.btrim(p_token) limit 1;
  elsif p_letter_id is not null and pg_catalog.btrim(p_letter_id) <> '' then
    select * into v_rec from public.letter_verifications
    where letter_id = pg_catalog.upper(pg_catalog.btrim(p_letter_id)) limit 1;
  end if;

  if v_rec.id is null then
    return pg_catalog.jsonb_build_object(
      'checked', false, 'matches', false,
      'message', 'We could not verify this letter.'
    );
  end if;

  if v_rec.is_demo then
    return pg_catalog.jsonb_build_object(
      'checked', false, 'matches', false,
      'message', 'Name matching is not available for sample records.'
    );
  end if;

  select first_name, last_name into v_o from public.orders where id = v_rec.order_id limit 1;
  v_stored := public.normalize_person_name(pg_catalog.concat_ws(' ', v_o.first_name, v_o.last_name));

  if v_stored is null then
    return pg_catalog.jsonb_build_object(
      'checked', false, 'matches', false,
      'message', 'No patient name is recorded for this letter.'
    );
  end if;

  return pg_catalog.jsonb_build_object('checked', true, 'matches', v_given = v_stored);
end;
$verify_letter_name_match$;

revoke all on function public.verify_letter_public(text, text) from public, anon, authenticated;
revoke all on function public.verify_letter_name_match(text, text, text) from public, anon, authenticated;
grant execute on function public.verify_letter_public(text, text) to service_role;
grant execute on function public.verify_letter_name_match(text, text, text) to service_role;

comment on constraint letter_verifications_demo_isolation on public.letter_verifications is
  'Genuine rows require an order and cannot use ZZ. Demo rows use ZZ and have no operational, patient, provider, document, signing, payment, file, or lifecycle relationship.';
comment on index public.letter_verifications_one_demo_per_type is
  'Exactly one canonical demonstration record per ESA/PSD letter type.';

do $postflight$
declare
  v_indexdef text;
  v_shape jsonb;
begin
  if (select attnotnull from pg_attribute
      where attrelid = 'public.letter_verifications'::regclass and attname = 'order_id') then
    raise exception 'postflight: order_id is still NOT NULL';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.letter_verifications'::regclass
      and conname = 'letter_verifications_demo_isolation' and convalidated
  ) then
    raise exception 'postflight: isolation constraint missing/unvalidated';
  end if;
  select pg_get_indexdef('public.letter_verifications_one_demo_per_type'::regclass)
    into v_indexdef;
  if v_indexdef <> 'CREATE UNIQUE INDEX letter_verifications_one_demo_per_type ON public.letter_verifications USING btree (letter_type) WHERE is_demo' then
    raise exception 'postflight: unexpected demo index: %', v_indexdef;
  end if;
  if has_table_privilege('anon', 'public.letter_verifications', 'select')
     or has_table_privilege('anon', 'public.letter_verifications', 'insert')
     or has_table_privilege('anon', 'public.letter_verifications', 'update')
     or has_table_privilege('anon', 'public.letter_verifications', 'delete')
     or has_table_privilege('anon', 'public.letter_verifications', 'truncate')
     or has_table_privilege('anon', 'public.letter_verifications', 'references')
     or has_table_privilege('anon', 'public.letter_verifications', 'trigger') then
    raise exception 'postflight: anon retains a direct table privilege';
  end if;
  if not has_table_privilege('authenticated', 'public.letter_verifications', 'select')
     or has_table_privilege('authenticated', 'public.letter_verifications', 'insert')
     or has_table_privilege('authenticated', 'public.letter_verifications', 'update')
     or has_table_privilege('authenticated', 'public.letter_verifications', 'delete') then
    raise exception 'postflight: authenticated ACL is not SELECT-only';
  end if;
  if not (has_table_privilege('service_role', 'public.letter_verifications', 'select')
      and has_table_privilege('service_role', 'public.letter_verifications', 'insert')
      and has_table_privilege('service_role', 'public.letter_verifications', 'update')
      and has_table_privilege('service_role', 'public.letter_verifications', 'delete')) then
    raise exception 'postflight: service_role lost a required privilege';
  end if;
  if has_table_privilege('service_role', 'public.letter_verifications', 'truncate')
     or has_table_privilege('service_role', 'public.letter_verifications', 'references')
     or has_table_privilege('service_role', 'public.letter_verifications', 'trigger') then
    raise exception 'postflight: service_role retains an unnecessary privilege';
  end if;
  if has_function_privilege('anon', 'public.verify_letter_public(text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.verify_letter_public(text,text)', 'execute')
     or not has_function_privilege('service_role', 'public.verify_letter_public(text,text)', 'execute') then
    raise exception 'postflight: public verifier ACL is wrong';
  end if;
  if not exists (
    select 1 from pg_proc
    where oid = 'public.verify_letter_public(text,text)'::regprocedure
      and prosecdef and proconfig = array['search_path=""']::text[]
  ) or not exists (
    select 1 from pg_proc
    where oid = 'public.verify_letter_name_match(text,text,text)'::regprocedure
      and prosecdef and proconfig = array['search_path=""']::text[]
  ) then
    raise exception 'postflight: verifier search_path/security state is wrong';
  end if;
  select public.verify_letter_public(null, (
    select letter_id from public.letter_verifications where not is_demo order by created_at limit 1
  )) into v_shape;
  if (v_shape->>'found') <> 'true' or v_shape->>'status' = 'demo'
     or not (v_shape ? 'provider_name') or not (v_shape ? 'state') then
    raise exception 'postflight: genuine verification changed: %', v_shape;
  end if;
  select public.verify_letter_public(null, 'ESA-QQ-0000000') into v_shape;
  if v_shape <> pg_catalog.jsonb_build_object(
    'found', false, 'status', 'not_found', 'message', 'We could not verify this letter.'
  ) then
    raise exception 'postflight: not-found response changed: %', v_shape;
  end if;
end
$postflight$;

commit;
