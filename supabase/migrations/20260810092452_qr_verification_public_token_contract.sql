-- QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001 · Stage 1
-- Public verification contract: opaque QR token, privacy-safe patient-name match,
-- honest expiry, demo isolation.
--
-- WHY A SEPARATE TOKEN. The QR must not encode an enumerable identifier. The
-- existing Verification ID is `ESA-<ST>-<7 chars>` built by
-- generate_letter_verification_id() from `random()` over a 32-char alphabet:
-- ~35 bits, and `random()` is NOT cryptographically secure (it is seeded and
-- predictable). That is fine for a human-typed reference printed on a letter,
-- and it stays exactly as-is for manual lookup and every historical ID — but it
-- is not a credential to hand a scanner. `public_token` is 16 bytes from
-- pgcrypto's CSPRNG rendered base64url (22 chars, 128 bits), so the QR target is
-- not guessable while the printed ID keeps working.
--
-- WHY THE EXPIRY CHANGES. verify_letter_id() returned
-- `coalesce(expires_at, issued_at + interval '1 year')`. Every one of the 19
-- TEST rows (and the LIVE population) has expires_at IS NULL, so the public
-- page has been showing a FABRICATED expiration date on every letter. The new
-- contract returns NULL and lets the UI say "No expiration date recorded".
--
-- Idempotent and non-destructive: additive columns, CREATE OR REPLACE, and a
-- token backfill that only ever fills NULLs.

-- ── 1. Opaque public token + demo flag ───────────────────────────────────────
alter table public.letter_verifications
  add column if not exists public_token text,
  add column if not exists is_demo      boolean not null default false;

comment on column public.letter_verifications.public_token is
  'Opaque 128-bit base64url token encoded in the letter QR. NOT the Verification ID. Rotatable via rotate_letter_public_token().';
comment on column public.letter_verifications.is_demo is
  'True only for the canonical SAMPLE/demo letters used on the website. Never a real customer record.';

-- 22-char base64url from 16 CSPRNG bytes. `-` and `_` keep it URL-safe; `=`
-- padding is stripped so the QR payload stays short (shorter payload = fewer
-- modules = larger, more scannable modules at the same printed size).
create or replace function public.generate_letter_public_token()
returns text
language sql
volatile
security definer
set search_path to 'public, extensions'
as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
$$;

-- Backfill: fills only NULLs, so re-running is a no-op and never rotates a
-- token that is already printed on a customer's letter.
do $$
declare r record;
begin
  for r in select id from public.letter_verifications where public_token is null loop
    update public.letter_verifications
       set public_token = public.generate_letter_public_token()
     where id = r.id and public_token is null;
  end loop;
end $$;

create unique index if not exists letter_verifications_public_token_key
  on public.letter_verifications (public_token)
  where public_token is not null;

-- New rows mint their own token without every writer having to remember.
create or replace function public.trg_letter_verifications_public_token()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.public_token is null then
    new.public_token := public.generate_letter_public_token();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_letter_verifications_public_token on public.letter_verifications;
create trigger trg_letter_verifications_public_token
  before insert on public.letter_verifications
  for each row execute function public.trg_letter_verifications_public_token();

-- Rotation / revocation of a leaked QR target. Never touches letter_id, so the
-- printed Verification ID and every historical reference keep resolving.
create or replace function public.rotate_letter_public_token(p_letter_id text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_new text;
begin
  v_new := public.generate_letter_public_token();
  update public.letter_verifications
     set public_token = v_new, updated_at = now()
   where letter_id = p_letter_id;
  if not found then return null; end if;
  return v_new;
end;
$$;

-- ── 2. Privacy-safe patient name helpers ─────────────────────────────────────
-- Normalisation absorbs harmless differences (case, padding, repeated spaces,
-- periods/commas/apostrophes/hyphens) WITHOUT becoming fuzzy: after
-- normalisation the comparison is exact, so a different person cannot pass.
create or replace function public.normalize_person_name(p_name text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(regexp_replace(
      regexp_replace(lower(coalesce(p_name, '')), '[.,''\-]', '', 'g'),
      '\s+', ' ', 'g')),
    '');
$$;

-- "John Smith" -> "J••• S••••". Never returns the stored name.
create or replace function public.mask_person_name(p_first text, p_last text)
returns text
language sql
immutable
as $$
  select nullif(btrim(concat_ws(' ',
    case when coalesce(btrim(p_first),'') = '' then null
         else left(btrim(p_first),1) || repeat('•', greatest(length(btrim(p_first)) - 1, 1)) end,
    case when coalesce(btrim(p_last),'') = '' then null
         else left(btrim(p_last),1) || repeat('•', greatest(length(btrim(p_last)) - 1, 1)) end
  )), '');
$$;

-- ── 3. Canonical public verification lookup ──────────────────────────────────
-- Resolves by opaque token (QR) OR Verification ID (manual entry) and returns
-- ONE allowlisted shape. Nothing here reads diagnosis, intake, payment, address,
-- phone, email, storage paths or internal ids — the field list below IS the
-- contract, and a caller cannot widen it.
create or replace function public.verify_letter_public(
  p_token     text default null,
  p_letter_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rec letter_verifications%rowtype;
  v_dp  doctor_profiles%rowtype;
  v_o   record;
  v_status text;
  v_masked text;
begin
  if p_token is not null and btrim(p_token) <> '' then
    select * into v_rec from letter_verifications
      where public_token = btrim(p_token) limit 1;
  elsif p_letter_id is not null and btrim(p_letter_id) <> '' then
    select * into v_rec from letter_verifications
      where letter_id = upper(btrim(p_letter_id)) limit 1;
  end if;

  -- One indistinguishable answer for "bad token", "bad id" and "no input", so
  -- the endpoint cannot be used to probe which identifiers exist.
  if v_rec.id is null then
    return jsonb_build_object('found', false, 'status', 'not_found',
      'message', 'We could not verify this letter.');
  end if;

  if v_rec.is_demo then
    v_status := 'demo';
  elsif v_rec.status = 'revoked' then
    v_status := 'revoked';
  elsif v_rec.expires_at is not null and v_rec.expires_at < now() then
    v_status := 'expired';
  elsif v_rec.superseded_at is not null then
    v_status := 'superseded';
  else
    v_status := coalesce(v_rec.status, 'valid');
  end if;

  select * into v_dp from doctor_profiles where id = v_rec.provider_id limit 1;
  select first_name, last_name into v_o from orders where id = v_rec.order_id limit 1;
  v_masked := public.mask_person_name(v_o.first_name, v_o.last_name);

  return jsonb_build_object(
    'found',        true,
    'status',       v_status,
    'is_demo',      v_rec.is_demo,
    'letter_id',    v_rec.letter_id,
    'letter_type',  v_rec.letter_type,
    'state',        v_rec.state,
    'issued_at',    to_char(v_rec.issued_at at time zone 'UTC', 'YYYY-MM-DD'),
    -- Honest: NULL when no authoritative expiry exists. The previous
    -- coalesce(..., issued_at + 1 year) invented a date for every letter.
    'expires_at',   case when v_rec.expires_at is not null
                         then to_char(v_rec.expires_at at time zone 'UTC', 'YYYY-MM-DD')
                         else null end,
    'patient_name_masked',   v_masked,
    'patient_name_checkable', v_masked is not null,
    'provider_name',          v_dp.full_name,
    'provider_title',         v_dp.title,
    'provider_npi',           v_dp.npi_number,
    'provider_license',       v_dp.license_number,
    'provider_state_licenses', case
        when v_dp.state_license_numbers is not null and v_dp.state_license_numbers::text <> '{}'
        then v_dp.state_license_numbers else null end,
    'document_version',  coalesce(v_rec.version, 1),
    'has_newer_version', v_rec.superseded_at is not null,
    'superseded_at',     case when v_rec.superseded_at is not null
                              then to_char(v_rec.superseded_at at time zone 'UTC', 'YYYY-MM-DD')
                              else null end);
end;
$$;

-- ── 4. Patient-name match — returns a BOOLEAN, never the name ────────────────
-- The verifier types the name already printed on the document in front of them.
-- A wrong guess learns only "does not match"; it never echoes the stored value,
-- so this cannot be used to extract a name one attempt at a time.
create or replace function public.verify_letter_name_match(
  p_name      text,
  p_token     text default null,
  p_letter_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rec letter_verifications%rowtype;
  v_o   record;
  v_stored text;
  v_given  text;
begin
  v_given := public.normalize_person_name(p_name);
  if v_given is null then
    return jsonb_build_object('checked', false, 'matches', false,
      'message', 'Enter the name printed on the letter.');
  end if;

  if p_token is not null and btrim(p_token) <> '' then
    select * into v_rec from letter_verifications where public_token = btrim(p_token) limit 1;
  elsif p_letter_id is not null and btrim(p_letter_id) <> '' then
    select * into v_rec from letter_verifications where letter_id = upper(btrim(p_letter_id)) limit 1;
  end if;

  if v_rec.id is null then
    return jsonb_build_object('checked', false, 'matches', false,
      'message', 'We could not verify this letter.');
  end if;

  select first_name, last_name into v_o from orders where id = v_rec.order_id limit 1;
  v_stored := public.normalize_person_name(concat_ws(' ', v_o.first_name, v_o.last_name));

  if v_stored is null then
    return jsonb_build_object('checked', false, 'matches', false,
      'message', 'No patient name is recorded for this letter.');
  end if;

  return jsonb_build_object('checked', true, 'matches', v_given = v_stored);
end;
$$;

-- ── 5. Honest expiry for the legacy path too ─────────────────────────────────
-- verify_letter_id() stays (the manual /verify/:letterId flow and any external
-- caller still use it) but stops inventing an expiration date.
create or replace function public.verify_letter_id(p_letter_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return public.verify_letter_public(null, p_letter_id);
end;
$$;

-- ── 6. Least privilege ───────────────────────────────────────────────────────
-- "revoke from public" does NOT undo the default EXECUTE grant that anon and
-- authenticated already hold, so every role is named explicitly. Only the
-- service role (the verify-letter edge function) may call these; the browser
-- never touches them directly.
revoke all on function public.verify_letter_public(text, text)              from public, anon, authenticated;
revoke all on function public.verify_letter_name_match(text, text, text)    from public, anon, authenticated;
revoke all on function public.verify_letter_id(text)                        from public, anon, authenticated;
revoke all on function public.generate_letter_public_token()                from public, anon, authenticated;
revoke all on function public.rotate_letter_public_token(text)              from public, anon, authenticated;
revoke all on function public.trg_letter_verifications_public_token()       from public, anon, authenticated;

grant execute on function public.verify_letter_public(text, text)           to service_role;
grant execute on function public.verify_letter_name_match(text, text, text) to service_role;
grant execute on function public.verify_letter_id(text)                     to service_role;
grant execute on function public.rotate_letter_public_token(text)           to service_role;

-- mask/normalize are pure helpers with no data access; keep them callable by
-- the definer functions above without widening anything.
revoke all on function public.mask_person_name(text, text)  from public, anon, authenticated;
revoke all on function public.normalize_person_name(text)   from public, anon, authenticated;
grant execute on function public.mask_person_name(text, text) to service_role;
grant execute on function public.normalize_person_name(text)  to service_role;

