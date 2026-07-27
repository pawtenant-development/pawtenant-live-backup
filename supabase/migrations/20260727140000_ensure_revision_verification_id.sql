-- DOCUMENT-REVISION-ID-AND-CUSTOMER-QA-CLOSURE-001 §8/§9
--
-- Atomic, exactly-once verification-ID minting for a document REVISION.
--
-- WHY: minting the ID in the edge function BEFORE create_document_version()
-- dedupes means N concurrent revision submissions mint N verification IDs even
-- though they correctly converge on ONE version row. The surplus IDs are
-- publicly resolvable but belong to no version — orphaned verifications.
-- Measured on TEST: 5 concurrent revision calls produced 1 version row and
-- 5 verification IDs (4 orphaned).
--
-- Fix: the ID is minted INSIDE the database, keyed on the version row, under an
-- advisory lock. The first caller mints; every other caller gets the same ID
-- back. One version = one verification ID, always.
--
-- ADDITIVE ONLY. Creates one function and relaxes one trigger predicate.
-- Updates NO existing row.

-- ── 1. Allow filling an EMPTY letter_id slot ────────────────────────────────
-- "Cannot repoint" must not mean "cannot fill". Setting letter_id when it was
-- NULL is an initial assignment, not a repoint — the same distinction the
-- trigger already makes for file_url / processed_file_url / storage_path.
-- Changing a letter_id that ALREADY has a value stays forbidden.
create or replace function public.tg_document_version_immutable()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.order_id   is distinct from old.order_id
     or new.doc_type  is distinct from old.doc_type
     or new.version   is distinct from old.version
     -- letter_id: NULL -> value is allowed (initial assignment).
     -- value -> different value is a REPOINT and stays forbidden.
     or (old.letter_id is not null and new.letter_id is distinct from old.letter_id)
     or (old.file_url is not null and new.file_url is distinct from old.file_url)
     or (old.processed_file_url is not null
         and new.processed_file_url is distinct from old.processed_file_url)
     or (old.storage_path is not null and new.storage_path is distinct from old.storage_path)
  then
    raise exception
      'order_document_versions is immutable: cannot repoint version % of order % (letter_id=%)',
      old.version, old.order_id, old.letter_id
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ── 2. Exactly-once revision ID ─────────────────────────────────────────────
create or replace function public.ensure_revision_verification_id(
  p_version_id  uuid,
  p_state       text,
  p_letter_type text,
  p_provider_id uuid default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row     public.order_document_versions;
  v_state   text := upper(trim(coalesce(p_state,'')));
  v_id      text;
  v_gen     text;
  v_prefix  text;
begin
  if auth.uid() is not null and not public.is_admin_staff() then
    raise exception 'ensure_revision_verification_id: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.order_document_versions where id = p_version_id;
  if not found then
    raise exception 'ensure_revision_verification_id: version % not found', p_version_id;
  end if;

  -- Already minted (by us on a previous attempt, or by a concurrent winner).
  if v_row.letter_id is not null then
    return v_row.letter_id;
  end if;

  -- Serialise minting for THIS version so only one caller can ever create an ID.
  perform pg_advisory_xact_lock(hashtextextended('docver_mint:' || p_version_id::text, 0));

  select letter_id into v_id from public.order_document_versions where id = p_version_id;
  if v_id is not null then
    return v_id;
  end if;

  v_state := left(regexp_replace(v_state, '[^A-Z]', '', 'g'), 2);
  if length(v_state) <> 2 then
    raise exception 'ensure_revision_verification_id: invalid state %', p_state
      using errcode = 'check_violation';
  end if;

  v_prefix := case when lower(coalesce(p_letter_type,'esa')) = 'psd' then 'PSD-' else 'ESA-' end;

  for i in 1..8 loop
    v_gen := public.generate_letter_verification_id(v_state);
    -- Force the product prefix while keeping the unique (state, code) tail —
    -- the same rewrite the first-letter path performs.
    v_gen := v_prefix || regexp_replace(v_gen, '^(ESA|PSD)-', '');

    begin
      insert into public.letter_verifications (
        letter_id, order_id, provider_id, state, letter_type,
        issued_at, status, expires_at, version, confirmation_id)
      values (
        v_gen, v_row.order_id, p_provider_id, v_state,
        lower(coalesce(p_letter_type,'esa')),
        now(), 'valid', null, v_row.version, v_row.confirmation_id);

      update public.order_document_versions
         set letter_id = v_gen
       where id = p_version_id;

      return v_gen;
    exception when unique_violation then
      -- generated ID collided; try again
      null;
    end;
  end loop;

  raise exception 'ensure_revision_verification_id: could not generate a unique ID after 8 attempts';
end;
$$;

comment on function public.ensure_revision_verification_id is
  'DOCUMENT-REVISION-...-001: mints EXACTLY ONE verification ID per document version, under an advisory lock. Concurrent callers receive the same ID. Never touches an existing verification row.';

revoke all on function public.ensure_revision_verification_id(uuid,text,text,uuid)
  from public, anon, authenticated;
