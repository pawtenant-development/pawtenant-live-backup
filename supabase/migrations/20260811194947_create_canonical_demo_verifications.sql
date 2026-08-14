-- QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001
-- Creates exactly one canonical demo verification per supported product.
--
-- LIVE arm. The TEST arm of this migration minted its two demo Verification IDs
-- from generate_letter_verification_id('ZZ') and happened to land on
-- ESA-ZZ-826EK9F / PSD-ZZ-EEVBTMN. Those two values are no longer free to vary:
-- scripts/sample-letter-demos.json bakes them into the QR module geometry of the
-- PUBLISHED sample letters, whose QR targets https://pawtenant.com/verify/<id>.
-- Re-minting at random here would publish samples whose QR resolves to
-- "not found" on production, so this arm pins the two approved identifiers
-- instead of generating them.
--
-- Everything else matches the TEST arm exactly: two rows, is_demo = true, state
-- ZZ, no order, no provider, no file, no confirmation id — a demo record carries
-- no patient or provider identity of any kind.

begin;

do $fixtures$
declare
  v_esa_id  constant text := 'ESA-ZZ-826EK9F';
  v_psd_id  constant text := 'PSD-ZZ-EEVBTMN';
  v_esa_token text;
  v_psd_token text;
begin
  if (select count(*) from public.letter_verifications where is_demo) <> 0 then
    raise exception 'fixture preflight: demo rows already exist';
  end if;

  -- Conflict check against the genuine corpus. A collision would mean a real
  -- letter answers as a sample, so refuse rather than overwrite.
  if exists (
    select 1 from public.letter_verifications
     where letter_id in (v_esa_id, v_psd_id)
  ) then
    raise exception 'fixture preflight: a genuine record already holds a canonical demo id';
  end if;

  v_esa_token := pg_catalog.translate(
    pg_catalog.rtrim(pg_catalog.encode(extensions.gen_random_bytes(16), 'base64'), '='),
    '+/', '-_'
  );
  v_psd_token := pg_catalog.translate(
    pg_catalog.rtrim(pg_catalog.encode(extensions.gen_random_bytes(16), 'base64'), '='),
    '+/', '-_'
  );

  if pg_catalog.length(v_esa_token) <> 22 or pg_catalog.length(v_psd_token) <> 22
     or v_esa_token !~ '^[A-Za-z0-9_-]{22}$'
     or v_psd_token !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'fixture preflight: generated token shape is invalid';
  end if;

  insert into public.letter_verifications (
    letter_id, order_id, provider_id, state, letter_type, status,
    expires_at, revoked_at, revoke_reason, confirmation_id, file_url,
    processed_file_url, document_version_id, version, superseded_at,
    superseded_by_letter_id, public_token, is_demo
  ) values
  (
    v_esa_id, null, null, 'ZZ', 'esa', 'valid',
    null, null, null, null, null, null, null, 1, null, null,
    v_esa_token, true
  ),
  (
    v_psd_id, null, null, 'ZZ', 'psd', 'valid',
    null, null, null, null, null, null, null, 1, null, null,
    v_psd_token, true
  );

  if (select count(*) from public.letter_verifications where is_demo) <> 2
     or (select count(*) from public.letter_verifications where is_demo and letter_type='esa') <> 1
     or (select count(*) from public.letter_verifications where is_demo and letter_type='psd') <> 1
     or (select count(*) from public.letter_verifications where is_demo and letter_id = v_esa_id) <> 1
     or (select count(*) from public.letter_verifications where is_demo and letter_id = v_psd_id) <> 1 then
    raise exception 'fixture postflight: canonical demo set is wrong';
  end if;
end
$fixtures$;

commit;
