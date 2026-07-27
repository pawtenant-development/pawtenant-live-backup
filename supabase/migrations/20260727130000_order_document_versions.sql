-- ORDER-ENTITLEMENT-AND-DOCUMENT-VERSIONING-FOUNDATION-001 · Phase C
--
-- VERSIONED documents + a per-version verification contract.
--
-- WHY: today `letter_verifications.letter_id` is UNIQUE and
-- provider-submit-letter's generateVerificationId() deliberately REUSES the
-- order's existing ID ("Reusing existing"). With no version column anywhere and
-- `orders.signed_letter_url` single-valued, the only way to publish a revised
-- letter was to repoint that one ID — silently changing what a landlord
-- verifying the ORIGINAL letter sees. That is why ORDER-ADDITIONAL-PET-UPGRADE-001
-- was blocked.
--
-- Owner decisions encoded (2026-07-27):
--   • every revised letter is a NEW immutable version
--   • every revision gets a NEW verification ID
--   • the original letter remains stored
--   • the original verification ID keeps resolving to the ORIGINAL version
--   • the original result may INDICATE that a newer version exists
--   • the newest approved revision becomes the active customer-facing document
--   • NO existing verification ID is ever repointed to another file
--
-- Backward compatible: legacy verification IDs keep working unchanged. This
-- migration ADDS fields to letter_verifications; it repoints nothing and
-- rewrites no existing verification result.

-- ── 1. Version table ────────────────────────────────────────────────────────
create table if not exists public.order_document_versions (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  confirmation_id     text,
  doc_type            text not null,
  version             integer not null check (version >= 1),
  parent_version_id   uuid references public.order_document_versions(id),

  -- link to the existing document row (kept — this table does not replace it)
  order_document_id   uuid references public.order_documents(id) on delete set null,
  storage_path        text,
  file_url            text,
  processed_file_url  text,

  -- verification ID for THIS version — unique, never shared, never repointed
  letter_id           text unique,

  provider_id         uuid,
  approval_status     text not null default 'pending'
                        check (approval_status in ('pending','approved','failed','superseded')),
  is_active           boolean not null default false,

  revision_reason     text,
  -- immutable copy of the pets included in THIS version
  pet_snapshot        jsonb,

  generated_at        timestamptz,
  activated_at        timestamptz,
  superseded_at       timestamptz,
  superseded_by_id    uuid references public.order_document_versions(id),
  generation_error    text,

  idempotency_key     text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint uq_docver_order_type_version unique (order_id, doc_type, version)
);

comment on table public.order_document_versions is
  'ORDER-ENTITLEMENT-...-001: immutable document versions. One row per generated letter version. The original is never overwritten; each version carries its OWN verification letter_id.';

-- EXACTLY ONE active version per (order, doc_type). This is the invariant that
-- makes an active-document pointer safe.
create unique index if not exists uq_docver_one_active_per_order_type
  on public.order_document_versions (order_id, doc_type)
  where is_active;

create index if not exists idx_docver_order on public.order_document_versions (order_id);
create index if not exists idx_docver_letter_id on public.order_document_versions (letter_id);
create index if not exists idx_docver_status on public.order_document_versions (approval_status);

-- ── 2. Version immutability ─────────────────────────────────────────────────
-- A published version's identity and file may never change. Lifecycle columns
-- (activation / supersession / failure) remain writable by the controlled
-- functions below.
create or replace function public.tg_document_version_immutable()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.order_id   is distinct from old.order_id
     or new.doc_type  is distinct from old.doc_type
     or new.version   is distinct from old.version
     or new.letter_id is distinct from old.letter_id
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

drop trigger if exists trg_document_version_immutable on public.order_document_versions;
create trigger trg_document_version_immutable
  before update on public.order_document_versions
  for each row execute function public.tg_document_version_immutable();

-- ── 3. letter_verifications: version linkage (ADDITIVE) ─────────────────────
alter table public.letter_verifications
  add column if not exists document_version_id    uuid references public.order_document_versions(id),
  add column if not exists version                integer not null default 1,
  add column if not exists superseded_at          timestamptz,
  add column if not exists superseded_by_letter_id text;

comment on column public.letter_verifications.superseded_at is
  'Set when a NEWER approved version exists. The row itself is never repointed — status and file_url stay as issued.';

create index if not exists idx_lv_document_version
  on public.letter_verifications (document_version_id);

-- ── 4. Active-document lookup ───────────────────────────────────────────────
create or replace function public.get_active_document_version(
  p_order_id uuid,
  p_doc_type text
)
returns public.order_document_versions
language sql
stable
security definer
set search_path to 'public'
as $$
  select * from public.order_document_versions
   where order_id = p_order_id
     and doc_type = p_doc_type
     and is_active
   limit 1;
$$;

-- ── 5. Create a version (idempotent) ────────────────────────────────────────
-- Allocates the next version number atomically. Does NOT activate: a version
-- becomes customer-facing only after generation succeeds (see activate_*).
create or replace function public.create_document_version(
  p_order_id        uuid,
  p_doc_type        text,
  p_idempotency_key text,
  p_letter_id       text default null,
  p_provider_id     uuid default null,
  p_revision_reason text default null,
  p_pet_snapshot    jsonb default null,
  p_order_document_id uuid default null,
  p_file_url        text default null,
  p_storage_path    text default null
)
returns public.order_document_versions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row     public.order_document_versions;
  v_next    integer;
  v_parent  uuid;
  v_conf    text;
begin
  if auth.uid() is not null and not public.is_admin_staff() then
    raise exception 'create_document_version: not authorised'
      using errcode = 'insufficient_privilege';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'create_document_version: idempotency_key is required'
      using errcode = 'null_value_not_allowed';
  end if;

  -- Idempotent: a retry with the same key returns the SAME row, never a second
  -- version. This is what makes function retry / double-click / webhook replay
  -- safe.
  select * into v_row from public.order_document_versions
   where idempotency_key = p_idempotency_key;
  if found then return v_row; end if;

  -- Serialise version allocation for this order+type.
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text || ':' || p_doc_type, 0));

  select * into v_row from public.order_document_versions
   where idempotency_key = p_idempotency_key;
  if found then return v_row; end if;

  select coalesce(max(version), 0) + 1 into v_next
    from public.order_document_versions
   where order_id = p_order_id and doc_type = p_doc_type;

  select id into v_parent from public.order_document_versions
   where order_id = p_order_id and doc_type = p_doc_type and version = v_next - 1;

  select confirmation_id into v_conf from public.orders where id = p_order_id;

  insert into public.order_document_versions (
    order_id, confirmation_id, doc_type, version, parent_version_id,
    order_document_id, storage_path, file_url, letter_id, provider_id,
    approval_status, is_active, revision_reason, pet_snapshot,
    generated_at, idempotency_key)
  values (
    p_order_id, v_conf, p_doc_type, v_next, v_parent,
    p_order_document_id, p_storage_path, p_file_url, p_letter_id, p_provider_id,
    'pending', false, p_revision_reason, p_pet_snapshot,
    now(), p_idempotency_key)
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 6. Activate a version ───────────────────────────────────────────────────
-- Called ONLY after generation succeeded. Supersedes the prior active version
-- without touching its file or its verification ID.
create or replace function public.activate_document_version(p_version_id uuid)
returns public.order_document_versions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row  public.order_document_versions;
  v_prev public.order_document_versions;
begin
  if auth.uid() is not null and not public.is_admin_staff() then
    raise exception 'activate_document_version: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.order_document_versions where id = p_version_id;
  if not found then
    raise exception 'activate_document_version: version % not found', p_version_id;
  end if;
  if v_row.is_active and v_row.approval_status = 'approved' then
    return v_row;                              -- idempotent re-activation
  end if;
  -- A failed generation may NEVER replace a valid active document.
  if v_row.approval_status = 'failed' then
    raise exception 'activate_document_version: version % failed generation and cannot be activated', p_version_id
      using errcode = 'check_violation';
  end if;
  if v_row.file_url is null and v_row.storage_path is null then
    raise exception 'activate_document_version: version % has no generated file', p_version_id
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_row.order_id::text || ':' || v_row.doc_type, 0));

  select * into v_prev from public.order_document_versions
   where order_id = v_row.order_id and doc_type = v_row.doc_type
     and is_active and id <> v_row.id;

  if found then
    -- Deactivate FIRST so the one-active partial unique index never sees two.
    update public.order_document_versions
       set is_active        = false,
           approval_status  = 'superseded',
           superseded_at    = now(),
           superseded_by_id = v_row.id
     where id = v_prev.id;

    -- Flag the OLD verification as superseded. Its status, file_url and
    -- letter_id are deliberately left untouched: the original ID must keep
    -- resolving to the original document.
    update public.letter_verifications
       set superseded_at           = now(),
           superseded_by_letter_id = v_row.letter_id
     where letter_id = v_prev.letter_id;
  end if;

  update public.order_document_versions
     set is_active       = true,
         approval_status = 'approved',
         activated_at    = now()
   where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 7. Mark a generation failure ────────────────────────────────────────────
-- Preserves the approval decision and leaves the PRIOR active version in place.
create or replace function public.fail_document_version(
  p_version_id uuid,
  p_error      text
)
returns public.order_document_versions
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_row public.order_document_versions;
begin
  if auth.uid() is not null and not public.is_admin_staff() then
    raise exception 'fail_document_version: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  update public.order_document_versions
     set approval_status  = 'failed',
         generation_error = left(coalesce(p_error,'generation failed'), 500),
         is_active        = false
   where id = p_version_id
  returning * into v_row;

  if not found then
    raise exception 'fail_document_version: version % not found', p_version_id;
  end if;
  return v_row;
end;
$$;

-- ── 8. Legacy version-1 registration (idempotent) ───────────────────────────
-- Maps every EXISTING provider letter into the version table so history works
-- from day one, WITHOUT regenerating a single document.
--
-- Two real legacy shapes are handled:
--   • an order holding MORE THAN ONE letter document (a re-issue) becomes
--     versions 1..N ordered by upload time, only the newest active;
--   • the pathology this task removes — ONE verification ID stamped onto
--     several documents of the same order by footer injection. A verification
--     ID may belong to exactly one version, so it is bound to the version whose
--     file it ACTUALLY resolves to today (matching letter_verifications
--     file_url / processed_file_url), falling back to the newest. Older
--     duplicates keep their file and their place in history but carry no
--     verification ID. Nothing is repointed; no historical result changes.
create or replace function public.register_legacy_document_versions(p_dry_run boolean default true)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_inserted integer := 0; v_linked integer := 0;
  v_cand integer; v_multi integer; v_orphaned integer;
begin
  if auth.uid() is not null and not public.is_admin_staff() then
    raise exception 'register_legacy_document_versions: not authorised' using errcode = 'insufficient_privilege';
  end if;

  drop table if exists _legacy_docver;
  create temporary table _legacy_docver on commit drop as
  with docs as (
    select
      od.id as order_document_id, od.order_id, od.confirmation_id, od.doc_type,
      od.file_url, od.processed_file_url, od.file_path as storage_path,
      od.uploaded_at, od.footer_letter_id,
      row_number() over (partition by od.order_id, od.doc_type
                         order by od.uploaded_at nulls first, od.id) as version_no,
      count(*)    over (partition by od.order_id, od.doc_type) as doc_count
    from public.order_documents od
    where od.order_id is not null
      and od.doc_type in ('esa_letter','psd_letter','ra_letter')
  ),
  claimed as (
    select
      d.*,
      (d.version_no = d.doc_count) as is_newest,
      case
        when d.footer_letter_id is not null then d.footer_letter_id
        when d.doc_count = 1 then (
          select lv.letter_id from public.letter_verifications lv
           where lv.order_id = d.order_id limit 1)
        else null
      end as claimed_letter_id
    from docs d
  ),
  ranked as (
    select
      c.*,
      case
        when c.claimed_letter_id is null then null
        else row_number() over (
          partition by c.claimed_letter_id
          order by (exists (
                      select 1 from public.letter_verifications lv
                       where lv.letter_id = c.claimed_letter_id
                         and (lv.processed_file_url is not distinct from c.processed_file_url
                              or lv.file_url is not distinct from c.file_url))) desc,
                   c.is_newest desc,
                   c.uploaded_at desc nulls last,
                   c.order_document_id)
      end as letter_id_rank
    from claimed c
  )
  select
    r.order_document_id, r.order_id, r.confirmation_id, r.doc_type,
    r.file_url, r.processed_file_url, r.storage_path, r.uploaded_at,
    r.version_no, r.doc_count, r.is_newest,
    case when r.letter_id_rank = 1 then r.claimed_letter_id else null end as letter_id,
    (r.claimed_letter_id is not null and r.letter_id_rank <> 1) as lost_shared_letter_id,
    (select lv2.provider_id from public.letter_verifications lv2
      where lv2.order_id = r.order_id limit 1) as provider_id,
    'legacy_v1:' || r.order_document_id::text as idem
  from ranked r;

  select count(*) into v_cand  from _legacy_docver;
  select count(*) into v_multi from _legacy_docver where doc_count > 1;
  select count(*) into v_orphaned from _legacy_docver where lost_shared_letter_id;

  if not p_dry_run then
    with ins as (
      insert into public.order_document_versions (
        order_id, confirmation_id, doc_type, version, order_document_id,
        storage_path, file_url, processed_file_url, letter_id, provider_id,
        approval_status, is_active, revision_reason, generated_at, idempotency_key)
      select
        l.order_id, l.confirmation_id, l.doc_type, l.version_no, l.order_document_id,
        l.storage_path, l.file_url, l.processed_file_url, l.letter_id, l.provider_id,
        case when l.is_newest then 'approved' else 'superseded' end,
        l.is_newest,
        'legacy registration — pre-versioning document mapped to version ' || l.version_no
          || case when l.lost_shared_letter_id
                  then ' (shared verification ID retained by the version it resolves to)'
                  else '' end,
        l.uploaded_at, l.idem
      from _legacy_docver l
      on conflict (idempotency_key) do nothing
      returning 1
    )
    select count(*) into v_inserted from ins;

    with upd as (
      update public.letter_verifications lv
         set document_version_id = dv.id, version = dv.version
        from public.order_document_versions dv
       where dv.letter_id = lv.letter_id and lv.document_version_id is null
      returning 1
    )
    select count(*) into v_linked from upd;
  end if;

  return jsonb_build_object(
    'dry_run', p_dry_run, 'candidates', v_cand,
    'orders_with_multiple_letters', v_multi,
    'shared_letter_id_conflicts_resolved', v_orphaned,
    'versions_inserted', v_inserted, 'verifications_linked', v_linked,
    'total_versions', (select count(*) from public.order_document_versions));
end;
$$;


-- ── 9. verify_letter_id — version aware, BACKWARD COMPATIBLE ────────────────
-- Every key the previous version returned is preserved with the same meaning.
-- `status` is deliberately NOT changed for a superseded-but-valid letter: an
-- existing verification result must not flip. Supersession is surfaced through
-- NEW additive fields only.
create or replace function public.verify_letter_id(p_letter_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rec    letter_verifications%ROWTYPE;
  v_dp     doctor_profiles%ROWTYPE;
  v_status text;
  v_ver    integer;
  v_newer  boolean;
  v_state  text;
begin
  select * into v_rec from letter_verifications where letter_id = p_letter_id limit 1;

  if not found then
    return jsonb_build_object(
      'found', false, 'status', 'not_found',
      'message', 'Verification ID not found.');
  end if;

  if v_rec.status = 'revoked' then
    v_status := 'revoked';
  elsif v_rec.expires_at is not null and v_rec.expires_at < now() then
    v_status := 'expired';
  else
    v_status := coalesce(v_rec.status, 'valid');
  end if;

  v_ver   := coalesce(v_rec.version, 1);
  v_newer := v_rec.superseded_at is not null;

  -- Safe display state for the verification page.
  v_state := case
    when v_status = 'revoked'  then 'revoked'
    when v_status = 'expired'  then 'expired'
    when v_newer               then 'superseded'
    else 'active'
  end;

  select * into v_dp from doctor_profiles where id = v_rec.provider_id limit 1;

  return jsonb_build_object(
    'found',      true,
    'status',     v_status,
    'letter_id',  v_rec.letter_id,
    'issued_at',  to_char(v_rec.issued_at at time zone 'UTC', 'YYYY-MM-DD'),
    'expires_at', case when v_rec.expires_at is not null
                       then to_char(v_rec.expires_at at time zone 'UTC', 'YYYY-MM-DD')
                       else to_char((v_rec.issued_at + interval '1 year') at time zone 'UTC', 'YYYY-MM-DD')
                  end,
    'state',       v_rec.state,
    'letter_type', v_rec.letter_type,
    'provider_name',    v_dp.full_name,
    'provider_title',   v_dp.title,
    'provider_npi',     v_dp.npi_number,
    'provider_license', v_dp.license_number,
    'provider_state_licenses', case
        when v_dp.state_license_numbers is not null
             and v_dp.state_license_numbers::text <> '{}'
        then v_dp.state_license_numbers else null end,
    -- ── additive, version-aware fields ──────────────────────────────────────
    'document_version',   v_ver,
    'document_state',     v_state,
    'has_newer_version',  v_newer,
    -- date only; the newer verification ID is NOT disclosed here
    'superseded_at', case when v_rec.superseded_at is not null
                          then to_char(v_rec.superseded_at at time zone 'UTC', 'YYYY-MM-DD')
                          else null end
  );
end;
$$;

-- ── 10. RLS + grants (fail closed) ──────────────────────────────────────────
alter table public.order_document_versions enable row level security;
alter table public.order_document_versions force row level security;

-- Admin staff read everything.
drop policy if exists docver_admin_select on public.order_document_versions;
create policy docver_admin_select on public.order_document_versions
  for select to authenticated
  using (public.is_admin_staff());

-- The owning customer may read their OWN versions (portal history). No pricing
-- or evidence lives on this table, so this exposes nothing financial.
drop policy if exists docver_customer_select on public.order_document_versions;
create policy docver_customer_select on public.order_document_versions
  for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_document_versions.order_id
       and (o.user_id = auth.uid()
            or lower(o.email) = lower(coalesce(auth.jwt()->>'email','')))
  ));

-- The assigned provider may read versions for their OWN orders (workflow
-- context only — this table carries no price, discount or Stripe identifier).
drop policy if exists docver_provider_select on public.order_document_versions;
create policy docver_provider_select on public.order_document_versions
  for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_document_versions.order_id
       and o.doctor_user_id = auth.uid()
  ));

-- NOBODY with a JWT may write. All writes go through the SECURITY DEFINER
-- functions above, which are service-role/admin gated.
revoke all on public.order_document_versions from public, anon, authenticated;
grant select on public.order_document_versions to authenticated;

-- Revoke each function from every role BY NAME — revoking "from public" does
-- NOT undo PostgreSQL's default EXECUTE grant.
revoke all on function public.tg_document_version_immutable() from public, anon, authenticated;
revoke all on function public.get_active_document_version(uuid,text) from public, anon, authenticated;
revoke all on function public.create_document_version(uuid,text,text,text,uuid,text,jsonb,uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.activate_document_version(uuid) from public, anon, authenticated;
revoke all on function public.fail_document_version(uuid,text) from public, anon, authenticated;
revoke all on function public.register_legacy_document_versions(boolean) from public, anon, authenticated;

-- verify_letter_id stays PUBLICLY callable — it is the public verification
-- endpoint and returns only non-PII credential fields.
grant execute on function public.verify_letter_id(text) to anon, authenticated;
