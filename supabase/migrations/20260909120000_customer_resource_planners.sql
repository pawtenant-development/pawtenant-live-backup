-- ESA-PLANNER-CUSTOMER-RESOURCE-TEST-001 — owner-managed customer resource
-- assets (the "Pet Care Planner by PawTenant").
--
-- ONE canonical source of truth for planner assets:
--   * customer_resource_slots     — one row per resource (ESA planner, PSD
--                                   planner). Holds the SINGLE active-version
--                                   pointer, so two versions can never be
--                                   published at once, plus an optimistic
--                                   lock_version so a stale admin edit is
--                                   refused cleanly.
--   * customer_resource_versions  — immutable, append-only version rows
--                                   (bucket, path, sha256, bytes, pages,
--                                   uploader, timestamps, supersession).
--                                   Nothing here is ever deleted by this
--                                   task; storage cleanup is a separate,
--                                   deliberate operation.
--   * customer_resource_events    — who did what, when.
--
-- Storage: `customer-resources` (PRIVATE — the master PDF; no anon or
-- authenticated storage policy exists, so only the service role can read it,
-- and customers reach it exclusively through the `get-customer-resource-url`
-- edge function which mints a 5-minute signed URL after
-- customer_resource_access() says yes). `customer-resource-previews` is a
-- PUBLIC image bucket for thumbnails only — never customer data.
--
-- Authorization lives in SQL, once:
--   customer_resource_order_eligible(orders, family)
--     = status ∉ {lead, cancelled, archived, refunded, disputed}
--       AND order_payment_state(o) ∈ {paid, partially_refunded}
--       AND order_service_family(...) = family
--   Every customer-facing RPC requires an authenticated caller who OWNS such an
--   order (orders.user_id = auth.uid() OR normalize_email(orders.email) =
--   normalize_email(auth.email())). Admin RPCs require public.is_admin_staff()
--   — never editable user_metadata.
--
-- Idempotent and additive. No existing table, function, policy, trigger,
-- price, template or order row is modified.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Storage buckets
-- ────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-resources', 'customer-resources', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 26214400,
      allowed_mime_types = array['application/pdf'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-resource-previews', 'customer-resource-previews', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Thumbnails are public-safe marketing images. The master PDF bucket gets NO
-- policy on purpose: with RLS on storage.objects and no policy, anon and
-- authenticated cannot list, read, write or sign it — only the service role.
drop policy if exists customer_resource_previews_public_read on storage.objects;
create policy customer_resource_previews_public_read
  on storage.objects for select
  using (bucket_id = 'customer-resource-previews');

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Tables
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.customer_resource_slots (
  resource_key       text primary key,
  service_family     text not null,
  display_name       text not null,
  customer_subtitle  text not null,
  -- true = the public site advertises this resource, so an eligible customer
  -- with no published version sees an honest "temporarily unavailable" state.
  -- false = nothing is shown until a version is published (the PSD slot).
  advertised         boolean not null default false,
  active_version_id  uuid,
  lock_version       integer not null default 0,
  published_at       timestamptz,
  published_by       uuid,
  unpublished_at     timestamptz,
  unpublished_by     uuid,
  updated_at         timestamptz not null default now(),
  updated_by         uuid,
  constraint customer_resource_slots_key_chk
    check (resource_key in ('esa_planner', 'psd_planner')),
  constraint customer_resource_slots_family_chk
    check (service_family in ('esa', 'psd'))
);

create table if not exists public.customer_resource_versions (
  id                        uuid primary key default gen_random_uuid(),
  resource_key              text not null references public.customer_resource_slots (resource_key),
  version                   integer not null,
  storage_bucket            text not null default 'customer-resources',
  storage_path              text not null,
  thumbnail_bucket          text,
  thumbnail_path            text,
  original_filename         text not null,
  mime_type                 text not null default 'application/pdf',
  byte_size                 bigint not null,
  sha256                    text not null,
  page_count                integer,
  release_notes             text,
  uploaded_by               uuid not null,
  uploaded_at               timestamptz not null default now(),
  first_published_at        timestamptz,
  last_published_at         timestamptz,
  last_unpublished_at       timestamptz,
  superseded_by_version_id  uuid references public.customer_resource_versions (id),
  retired_at                timestamptz,
  retired_by                uuid,
  constraint customer_resource_versions_key_version_uq unique (resource_key, version),
  constraint customer_resource_versions_object_uq unique (storage_bucket, storage_path),
  constraint customer_resource_versions_version_chk check (version > 0),
  constraint customer_resource_versions_bytes_chk check (byte_size > 0),
  constraint customer_resource_versions_sha_chk check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint customer_resource_versions_mime_chk check (mime_type = 'application/pdf'),
  constraint customer_resource_versions_bucket_chk check (storage_bucket = 'customer-resources'),
  constraint customer_resource_versions_path_chk
    check (storage_path ~ '^(esa_planner|psd_planner)/[A-Za-z0-9._-]+\.pdf$'),
  constraint customer_resource_versions_thumb_chk
    check ((thumbnail_bucket is null and thumbnail_path is null)
        or (thumbnail_bucket = 'customer-resource-previews'
            and thumbnail_path ~ '^(esa_planner|psd_planner)/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$'))
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'customer_resource_slots_active_version_fk'
  ) then
    alter table public.customer_resource_slots
      add constraint customer_resource_slots_active_version_fk
      foreign key (active_version_id) references public.customer_resource_versions (id);
  end if;
end $$;

create table if not exists public.customer_resource_events (
  id            bigint generated always as identity primary key,
  resource_key  text not null references public.customer_resource_slots (resource_key),
  version_id    uuid references public.customer_resource_versions (id),
  action        text not null,
  actor_id      uuid,
  actor_email   text,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  constraint customer_resource_events_action_chk
    check (action in ('upload', 'publish', 'rollback', 'unpublish', 'thumbnail', 'retire'))
);

create index if not exists customer_resource_versions_key_idx
  on public.customer_resource_versions (resource_key, version desc);
create index if not exists customer_resource_events_key_idx
  on public.customer_resource_events (resource_key, created_at desc);

-- Tables are reachable ONLY through the RPCs below. No policy is created for
-- anon or authenticated, and their table grants are revoked by name (default
-- privileges on this project grant them otherwise).
alter table public.customer_resource_slots    enable row level security;
alter table public.customer_resource_versions enable row level security;
alter table public.customer_resource_events   enable row level security;
revoke all on public.customer_resource_slots    from public, anon, authenticated;
revoke all on public.customer_resource_versions from public, anon, authenticated;
revoke all on public.customer_resource_events   from public, anon, authenticated;
grant all on public.customer_resource_slots    to service_role;
grant all on public.customer_resource_versions to service_role;
grant all on public.customer_resource_events   to service_role;

-- The two slots. Only the ESA slot is advertised; the PSD slot stays inactive
-- and invisible until the owner uploads AND publishes a PSD asset.
insert into public.customer_resource_slots
  (resource_key, service_family, display_name, customer_subtitle, advertised)
values
  ('esa_planner', 'esa', 'Pet Care Planner by PawTenant', 'Included with your ESA package', true),
  ('psd_planner', 'psd', 'Pet Care Planner by PawTenant', 'Included with your PSD package', false)
on conflict (resource_key) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Eligibility — the ONE predicate
-- ────────────────────────────────────────────────────────────────────────────
-- Reuses the canonical helpers, never a second definition:
--   * public.order_payment_state(orders)  — the lifecycle payment truth
--   * public.order_service_family(...)    — the asymmetric ESA/PSD classifier
--     (any PSD evidence wins; unknown fails closed)
-- and the portal's own entitlement policy for refunds/cancellations:
-- a full refund, a cancellation, an archive or a dispute ends access; a
-- PARTIAL refund keeps it (the portal still treats that order as paid).
create or replace function public.customer_resource_order_eligible(o public.orders, p_family text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_family in ('esa', 'psd')
     and coalesce(o.status, '') not in ('lead', 'cancelled', 'archived', 'refunded', 'disputed')
     and public.order_payment_state(o) in ('paid', 'partially_refunded')
     and public.order_service_family(
           o.letter_type, o.package_key, o.package_display_name, o.plan_type, o.parent_order_id
         ) = p_family;
$$;

-- Caller identity for the customer RPCs. An admin may preview a customer's
-- entitlement by email (the portal's Customer View); nobody else may name an
-- email. Anonymous callers resolve to no identity at all.
create or replace function public.customer_resource_caller_identity(
  p_preview_email text,
  out v_uid uuid,
  out v_email text,
  out v_preview boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_preview_email is not null and btrim(p_preview_email) <> '' then
    if not public.is_admin_staff() then
      raise exception 'customer preview requires admin staff' using errcode = '42501';
    end if;
    v_uid := null;
    v_email := public.normalize_email(p_preview_email);
    v_preview := true;
    return;
  end if;
  v_uid := auth.uid();
  v_email := case when v_uid is null then null else public.normalize_email(auth.email()) end;
  v_preview := false;
end;
$$;

-- Does this identity own at least one eligible order of this family?
create or replace function public.customer_resource_identity_eligible(
  p_uid uuid, p_email text, p_family text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (p_uid is not null or p_email is not null)
     and exists (
       select 1
         from public.orders o
        where ((p_uid is not null and o.user_id = p_uid)
            or (p_email is not null and public.normalize_email(o.email) = p_email))
          and public.customer_resource_order_eligible(o, p_family)
     );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Customer RPCs (projections only — never a storage path)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.customer_resource_entitlements(p_preview_email text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_email text;
  v_preview boolean;
  v_out jsonb;
begin
  select * into v_uid, v_email, v_preview
    from public.customer_resource_caller_identity(p_preview_email);
  if v_uid is null and v_email is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'resource_key',    s.resource_key,
           'service_family',  s.service_family,
           'display_name',    s.display_name,
           'subtitle',        s.customer_subtitle,
           'eligible',        true,
           'available',       (v.id is not null),
           'version',         v.version,
           'published_at',    s.published_at,
           'file_name',       v.original_filename,
           'byte_size',       v.byte_size,
           'page_count',      v.page_count,
           'thumbnail_bucket', v.thumbnail_bucket,
           'thumbnail_path',  v.thumbnail_path,
           'preview',         v_preview
         ) order by s.resource_key), '[]'::jsonb)
    into v_out
    from public.customer_resource_slots s
    left join public.customer_resource_versions v
      on v.id = s.active_version_id and v.retired_at is null
   where (v.id is not null or s.advertised)
     and public.customer_resource_identity_eligible(v_uid, v_email, s.service_family);

  return v_out;
end;
$$;

-- Used by the get-customer-resource-url edge function WITH THE CALLER'S JWT.
-- Returns exactly one row. eligible=false → 403; available=false → 404.
create or replace function public.customer_resource_access(
  p_resource_key text,
  p_preview_email text default null
)
returns table (
  eligible boolean,
  available boolean,
  storage_bucket text,
  storage_path text,
  file_name text,
  version integer,
  display_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_email text;
  v_preview boolean;
  v_slot public.customer_resource_slots%rowtype;
  v_ver public.customer_resource_versions%rowtype;
  v_elig boolean := false;
begin
  select * into v_uid, v_email, v_preview
    from public.customer_resource_caller_identity(p_preview_email);

  select * into v_slot from public.customer_resource_slots s where s.resource_key = p_resource_key;
  if not found then
    return query select false, false, null::text, null::text, null::text, null::integer, null::text;
    return;
  end if;

  v_elig := public.customer_resource_identity_eligible(v_uid, v_email, v_slot.service_family);
  if not v_elig then
    return query select false, false, null::text, null::text, null::text, null::integer, null::text;
    return;
  end if;

  if v_slot.active_version_id is null then
    return query select true, false, null::text, null::text, null::text, null::integer, v_slot.display_name;
    return;
  end if;

  select * into v_ver from public.customer_resource_versions v
   where v.id = v_slot.active_version_id and v.retired_at is null;
  if not found then
    return query select true, false, null::text, null::text, null::text, null::integer, v_slot.display_name;
    return;
  end if;

  return query select true, true, v_ver.storage_bucket, v_ver.storage_path,
                      v_ver.original_filename, v_ver.version, v_slot.display_name;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Admin RPCs — is_admin_staff() gated, every mutation audited
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_customer_resources_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_slots jsonb;
  v_events jsonb;
begin
  if not public.is_admin_staff() then
    raise exception 'admin staff only' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'resource_key',      s.resource_key,
           'service_family',    s.service_family,
           'display_name',      s.display_name,
           'customer_subtitle', s.customer_subtitle,
           'advertised',        s.advertised,
           'active_version_id', s.active_version_id,
           'lock_version',      s.lock_version,
           'published_at',      s.published_at,
           'published_by',      s.published_by,
           'unpublished_at',    s.unpublished_at,
           'updated_at',        s.updated_at,
           'versions', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'id',                 v.id,
                      'version',            v.version,
                      'storage_bucket',     v.storage_bucket,
                      'storage_path',       v.storage_path,
                      'thumbnail_bucket',   v.thumbnail_bucket,
                      'thumbnail_path',     v.thumbnail_path,
                      'original_filename',  v.original_filename,
                      'byte_size',          v.byte_size,
                      'sha256',             v.sha256,
                      'page_count',         v.page_count,
                      'release_notes',      v.release_notes,
                      'uploaded_by',        v.uploaded_by,
                      'uploaded_by_email',  (select u.email from auth.users u where u.id = v.uploaded_by),
                      'uploaded_at',        v.uploaded_at,
                      'first_published_at', v.first_published_at,
                      'last_published_at',  v.last_published_at,
                      'last_unpublished_at', v.last_unpublished_at,
                      'superseded_by_version_id', v.superseded_by_version_id,
                      'retired_at',         v.retired_at,
                      'is_active',          (v.id = s.active_version_id),
                      'storage_object_exists', exists (
                        select 1 from storage.objects so
                         where so.bucket_id = v.storage_bucket and so.name = v.storage_path)
                    ) order by v.version desc), '[]'::jsonb)
               from public.customer_resource_versions v
              where v.resource_key = s.resource_key
           )
         ) order by s.resource_key), '[]'::jsonb)
    into v_slots
    from public.customer_resource_slots s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'resource_key', e.resource_key, 'version_id', e.version_id,
           'action', e.action, 'actor_id', e.actor_id, 'actor_email', e.actor_email,
           'details', e.details, 'created_at', e.created_at
         ) order by e.created_at desc), '[]'::jsonb)
    into v_events
    from (select * from public.customer_resource_events order by created_at desc limit 60) e;

  return jsonb_build_object('slots', v_slots, 'events', v_events);
end;
$$;

-- Called by admin-upload-customer-resource AFTER the object is in storage,
-- with the admin's own JWT — so auth.uid() is the real uploader and the
-- storage object's existence is verified here, not trusted.
create or replace function public.admin_customer_resource_register_version(
  p_resource_key text,
  p_storage_bucket text,
  p_storage_path text,
  p_original_filename text,
  p_byte_size bigint,
  p_sha256 text,
  p_page_count integer,
  p_release_notes text default null,
  p_thumbnail_bucket text default null,
  p_thumbnail_path text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot public.customer_resource_slots%rowtype;
  v_next integer;
  v_id uuid;
  v_actor uuid := auth.uid();
  v_actor_email text := public.normalize_email(auth.email());
begin
  if not public.is_admin_staff() then
    raise exception 'admin staff only' using errcode = '42501';
  end if;

  select * into v_slot from public.customer_resource_slots s
   where s.resource_key = p_resource_key for update;
  if not found then
    raise exception 'unknown resource slot %', p_resource_key using errcode = '22023';
  end if;

  if not exists (select 1 from storage.objects so
                  where so.bucket_id = p_storage_bucket and so.name = p_storage_path) then
    raise exception 'storage object % / % does not exist', p_storage_bucket, p_storage_path
      using errcode = '22023';
  end if;
  if p_thumbnail_path is not null and not exists (
       select 1 from storage.objects so
        where so.bucket_id = p_thumbnail_bucket and so.name = p_thumbnail_path) then
    raise exception 'thumbnail object does not exist' using errcode = '22023';
  end if;

  select coalesce(max(v.version), 0) + 1 into v_next
    from public.customer_resource_versions v where v.resource_key = p_resource_key;

  insert into public.customer_resource_versions
    (resource_key, version, storage_bucket, storage_path, thumbnail_bucket, thumbnail_path,
     original_filename, byte_size, sha256, page_count, release_notes, uploaded_by)
  values
    (p_resource_key, v_next, p_storage_bucket, p_storage_path, p_thumbnail_bucket, p_thumbnail_path,
     p_original_filename, p_byte_size, lower(p_sha256), p_page_count, nullif(btrim(p_release_notes), ''), v_actor)
  returning id into v_id;

  insert into public.customer_resource_events (resource_key, version_id, action, actor_id, actor_email, details)
  values (p_resource_key, v_id, 'upload', v_actor, v_actor_email,
          jsonb_build_object('version', v_next, 'original_filename', p_original_filename,
                             'byte_size', p_byte_size, 'sha256', lower(p_sha256),
                             'page_count', p_page_count, 'has_thumbnail', p_thumbnail_path is not null));

  return jsonb_build_object('ok', true, 'id', v_id, 'version', v_next, 'resource_key', p_resource_key);
end;
$$;

-- Publish (or roll back to) a version. Stale-safe: the caller must pass the
-- lock_version it last saw. Refuses a version of another slot, a retired
-- version, or one whose storage object is missing. Idempotent when the
-- version is already active.
create or replace function public.admin_customer_resource_publish(
  p_resource_key text,
  p_version_id uuid,
  p_expected_lock_version integer,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot public.customer_resource_slots%rowtype;
  v_new public.customer_resource_versions%rowtype;
  v_old public.customer_resource_versions%rowtype;
  v_action text := 'publish';
  v_actor uuid := auth.uid();
  v_actor_email text := public.normalize_email(auth.email());
begin
  if not public.is_admin_staff() then
    raise exception 'admin staff only' using errcode = '42501';
  end if;

  select * into v_slot from public.customer_resource_slots s
   where s.resource_key = p_resource_key for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_slot');
  end if;
  if v_slot.lock_version <> p_expected_lock_version then
    return jsonb_build_object('ok', false, 'reason', 'stale',
                              'current_lock_version', v_slot.lock_version);
  end if;

  select * into v_new from public.customer_resource_versions v
   where v.id = p_version_id and v.resource_key = p_resource_key;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_version');
  end if;
  if v_new.retired_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'retired_version');
  end if;
  if not exists (select 1 from storage.objects so
                  where so.bucket_id = v_new.storage_bucket and so.name = v_new.storage_path) then
    return jsonb_build_object('ok', false, 'reason', 'storage_object_missing');
  end if;

  if v_slot.active_version_id = v_new.id then
    return jsonb_build_object('ok', true, 'unchanged', true,
                              'lock_version', v_slot.lock_version, 'version', v_new.version);
  end if;

  if v_slot.active_version_id is not null then
    select * into v_old from public.customer_resource_versions v where v.id = v_slot.active_version_id;
    if found then
      if v_new.version < v_old.version then
        v_action := 'rollback';
      end if;
      update public.customer_resource_versions
         set superseded_by_version_id = v_new.id,
             last_unpublished_at = now()
       where id = v_old.id;
    end if;
  end if;

  -- A version being (re)published is current again: clear its supersession.
  update public.customer_resource_versions
     set superseded_by_version_id = null,
         first_published_at = coalesce(first_published_at, now()),
         last_published_at = now()
   where id = v_new.id;

  update public.customer_resource_slots
     set active_version_id = v_new.id,
         published_at = now(),
         published_by = v_actor,
         lock_version = lock_version + 1,
         updated_at = now(),
         updated_by = v_actor
   where resource_key = p_resource_key;

  insert into public.customer_resource_events (resource_key, version_id, action, actor_id, actor_email, details)
  values (p_resource_key, v_new.id, v_action, v_actor, v_actor_email,
          jsonb_build_object('version', v_new.version,
                             'previous_version', v_old.version,
                             'previous_version_id', v_old.id,
                             'note', nullif(btrim(p_note), '')));

  return jsonb_build_object('ok', true, 'action', v_action,
                            'lock_version', v_slot.lock_version + 1, 'version', v_new.version);
end;
$$;

create or replace function public.admin_customer_resource_unpublish(
  p_resource_key text,
  p_expected_lock_version integer,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot public.customer_resource_slots%rowtype;
  v_old public.customer_resource_versions%rowtype;
  v_actor uuid := auth.uid();
  v_actor_email text := public.normalize_email(auth.email());
begin
  if not public.is_admin_staff() then
    raise exception 'admin staff only' using errcode = '42501';
  end if;

  select * into v_slot from public.customer_resource_slots s
   where s.resource_key = p_resource_key for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_slot');
  end if;
  if v_slot.lock_version <> p_expected_lock_version then
    return jsonb_build_object('ok', false, 'reason', 'stale',
                              'current_lock_version', v_slot.lock_version);
  end if;
  if v_slot.active_version_id is null then
    return jsonb_build_object('ok', true, 'unchanged', true, 'lock_version', v_slot.lock_version);
  end if;

  select * into v_old from public.customer_resource_versions v where v.id = v_slot.active_version_id;
  update public.customer_resource_versions
     set last_unpublished_at = now()
   where id = v_slot.active_version_id;

  update public.customer_resource_slots
     set active_version_id = null,
         unpublished_at = now(),
         unpublished_by = v_actor,
         lock_version = lock_version + 1,
         updated_at = now(),
         updated_by = v_actor
   where resource_key = p_resource_key;

  insert into public.customer_resource_events (resource_key, version_id, action, actor_id, actor_email, details)
  values (p_resource_key, v_slot.active_version_id, 'unpublish', v_actor, v_actor_email,
          jsonb_build_object('version', v_old.version, 'note', nullif(btrim(p_note), '')));

  return jsonb_build_object('ok', true, 'action', 'unpublish', 'lock_version', v_slot.lock_version + 1);
end;
$$;

-- Attach / replace the customer-facing thumbnail on a version. The object
-- must already exist in the public previews bucket.
create or replace function public.admin_customer_resource_set_thumbnail(
  p_version_id uuid,
  p_thumbnail_bucket text,
  p_thumbnail_path text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ver public.customer_resource_versions%rowtype;
  v_actor uuid := auth.uid();
  v_actor_email text := public.normalize_email(auth.email());
begin
  if not public.is_admin_staff() then
    raise exception 'admin staff only' using errcode = '42501';
  end if;
  select * into v_ver from public.customer_resource_versions v where v.id = p_version_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_version');
  end if;
  if not exists (select 1 from storage.objects so
                  where so.bucket_id = p_thumbnail_bucket and so.name = p_thumbnail_path) then
    return jsonb_build_object('ok', false, 'reason', 'storage_object_missing');
  end if;
  update public.customer_resource_versions
     set thumbnail_bucket = p_thumbnail_bucket, thumbnail_path = p_thumbnail_path
   where id = p_version_id;
  insert into public.customer_resource_events (resource_key, version_id, action, actor_id, actor_email, details)
  values (v_ver.resource_key, p_version_id, 'thumbnail', v_actor, v_actor_email,
          jsonb_build_object('version', v_ver.version, 'thumbnail_path', p_thumbnail_path));
  return jsonb_build_object('ok', true);
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Privileges — revoke by NAME (default privileges grant anon/authenticated)
-- ────────────────────────────────────────────────────────────────────────────
revoke all on function public.customer_resource_order_eligible(public.orders, text) from public, anon, authenticated;
revoke all on function public.customer_resource_caller_identity(text) from public, anon, authenticated;
revoke all on function public.customer_resource_identity_eligible(uuid, text, text) from public, anon, authenticated;
revoke all on function public.customer_resource_entitlements(text) from public, anon, authenticated;
revoke all on function public.customer_resource_access(text, text) from public, anon, authenticated;
revoke all on function public.admin_customer_resources_overview() from public, anon, authenticated;
revoke all on function public.admin_customer_resource_register_version(text, text, text, text, bigint, text, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_customer_resource_publish(text, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.admin_customer_resource_unpublish(text, integer, text) from public, anon, authenticated;
revoke all on function public.admin_customer_resource_set_thumbnail(uuid, text, text) from public, anon, authenticated;

-- Signed-in callers only. Each function decides authorization internally
-- (ownership of an eligible order, or is_admin_staff()).
grant execute on function public.customer_resource_entitlements(text) to authenticated, service_role;
grant execute on function public.customer_resource_access(text, text) to authenticated, service_role;
grant execute on function public.admin_customer_resources_overview() to authenticated, service_role;
grant execute on function public.admin_customer_resource_register_version(text, text, text, text, bigint, text, integer, text, text, text) to authenticated, service_role;
grant execute on function public.admin_customer_resource_publish(text, uuid, integer, text) to authenticated, service_role;
grant execute on function public.admin_customer_resource_unpublish(text, integer, text) to authenticated, service_role;
grant execute on function public.admin_customer_resource_set_thumbnail(uuid, text, text) to authenticated, service_role;
-- Internal helpers: service role only.
grant execute on function public.customer_resource_order_eligible(public.orders, text) to service_role;
grant execute on function public.customer_resource_caller_identity(text) to service_role;
grant execute on function public.customer_resource_identity_eligible(uuid, text, text) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Self-check — the migration refuses to finish if any gate is open
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if has_function_privilege('anon', 'public.customer_resource_access(text, text)', 'execute') then
    raise exception 'anon can execute customer_resource_access';
  end if;
  if has_function_privilege('anon', 'public.customer_resource_entitlements(text)', 'execute') then
    raise exception 'anon can execute customer_resource_entitlements';
  end if;
  if has_function_privilege('authenticated', 'public.customer_resource_order_eligible(public.orders, text)', 'execute') then
    raise exception 'authenticated can execute the internal eligibility helper';
  end if;
  if has_table_privilege('authenticated', 'public.customer_resource_versions', 'select') then
    raise exception 'authenticated can read customer_resource_versions directly';
  end if;
  if has_table_privilege('anon', 'public.customer_resource_slots', 'select') then
    raise exception 'anon can read customer_resource_slots directly';
  end if;
  if exists (select 1 from storage.buckets where id = 'customer-resources' and public) then
    raise exception 'customer-resources bucket must be private';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and coalesce(qual, '') || coalesce(with_check, '') like '%customer-resources''%'
              and policyname <> 'customer_resource_previews_public_read') then
    raise exception 'a storage policy exposes the private customer-resources bucket';
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Admin preview of ANY version (draft or published) + admin thumbnail write
-- ────────────────────────────────────────────────────────────────────────────
-- "Preview before publishing" needs a signed URL for a draft. The edge
-- function asks THIS admin-gated function for the location with the admin's
-- JWT; no customer path can reach it.
create or replace function public.admin_customer_resource_version_location(p_version_id uuid)
returns table (
  storage_bucket text,
  storage_path text,
  file_name text,
  version integer,
  resource_key text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin_staff() then
    raise exception 'admin staff only' using errcode = '42501';
  end if;
  return query
    select v.storage_bucket, v.storage_path, v.original_filename, v.version, v.resource_key
      from public.customer_resource_versions v
     where v.id = p_version_id;
end;
$$;
revoke all on function public.admin_customer_resource_version_location(uuid) from public, anon, authenticated;
grant execute on function public.admin_customer_resource_version_location(uuid) to authenticated, service_role;

-- Admin staff may write thumbnails into the PUBLIC previews bucket directly
-- (the same client-side storage-RLS pattern every other admin upload uses);
-- the version row is then updated through admin_customer_resource_set_thumbnail.
drop policy if exists customer_resource_previews_admin_insert on storage.objects;
create policy customer_resource_previews_admin_insert
  on storage.objects for insert
  with check (bucket_id = 'customer-resource-previews' and public.is_admin_staff());
drop policy if exists customer_resource_previews_admin_update on storage.objects;
create policy customer_resource_previews_admin_update
  on storage.objects for update
  using (bucket_id = 'customer-resource-previews' and public.is_admin_staff())
  with check (bucket_id = 'customer-resource-previews' and public.is_admin_staff());

do $$
begin
  if has_function_privilege('anon', 'public.admin_customer_resource_version_location(uuid)', 'execute') then
    raise exception 'anon can execute admin_customer_resource_version_location';
  end if;
end $$;
