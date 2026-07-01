-- Company OS admin operations batch (TEST-first).
-- 1) contact_submissions: archived status + archive metadata (soft archive, never delete).
-- 2) provider_internal_documents: admin-only internal provider files (bank docs,
--    contracts, verification proofs). Keyed by provider_email like provider_admin_notes.
-- 3) provider_bank_details: MASKED payout metadata only — deliberately no full
--    account/routing columns (no pgcrypto column-encryption utilities exist in this
--    project yet; full structured bank storage needs encrypted-column work before LIVE).
--    Full bank documents are uploaded to the private provider-internal bucket instead.
-- 4) provider-internal storage bucket: private, owner/admin_manager/finance only.
-- All idempotent. Providers (role='provider', is_admin=false) can never read these.

-- ---------------------------------------------------------------------------
-- 1) contact_submissions: allow 'archived' + archive metadata
-- ---------------------------------------------------------------------------
alter table public.contact_submissions drop constraint if exists contact_submissions_status_check;
alter table public.contact_submissions add constraint contact_submissions_status_check
  check (status = any (array['new'::text, 'viewed'::text, 'resolved'::text, 'archived'::text]));

alter table public.contact_submissions add column if not exists archived_at timestamptz;
alter table public.contact_submissions add column if not exists archived_by uuid;

-- ---------------------------------------------------------------------------
-- Shared role predicate: owner / admin_manager / finance admins only.
-- Support and read_only staff are deliberately excluded (bank data access).
-- ---------------------------------------------------------------------------
create or replace function public.is_provider_records_admin()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.doctor_profiles dp
    where dp.user_id = auth.uid()
      and dp.is_admin = true
      and dp.is_active = true
      and coalesce(dp.role, '') = any (array['owner', 'admin_manager', 'finance'])
  );
$$;

-- ---------------------------------------------------------------------------
-- 2) provider_internal_documents
-- ---------------------------------------------------------------------------
create table if not exists public.provider_internal_documents (
  id uuid primary key default gen_random_uuid(),
  provider_email text not null,
  doctor_profile_id uuid references public.doctor_profiles (id) on delete set null,
  category text not null default 'other'
    check (category = any (array[
      'bank_payout_details', 'contract', 'license_verification',
      'insurance_verification', 'psypact_apit_verification', 'tax_form',
      'payout_receipt', 'compliance', 'other'])),
  title text not null,
  notes text,
  file_path text not null,
  file_name text,
  file_mime_type text,
  file_size_bytes bigint,
  status text not null default 'active' check (status = any (array['active', 'archived'])),
  uploaded_by uuid,
  uploaded_by_name text,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_internal_documents_email_idx
  on public.provider_internal_documents (provider_email, status, created_at desc);

alter table public.provider_internal_documents enable row level security;

drop policy if exists pid_records_admin_all on public.provider_internal_documents;
create policy pid_records_admin_all on public.provider_internal_documents
  for all to authenticated
  using (public.is_provider_records_admin())
  with check (public.is_provider_records_admin());

drop trigger if exists provider_internal_documents_touch on public.provider_internal_documents;
create trigger provider_internal_documents_touch
  before update on public.provider_internal_documents
  for each row execute function public.company_os_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3) provider_bank_details (masked metadata only)
-- ---------------------------------------------------------------------------
create table if not exists public.provider_bank_details (
  id uuid primary key default gen_random_uuid(),
  provider_email text not null unique,
  doctor_profile_id uuid references public.doctor_profiles (id) on delete set null,
  account_holder_name text,
  bank_name text,
  account_last4 text check (account_last4 is null or account_last4 ~ '^[0-9]{2,4}$'),
  payment_method text,
  payment_notes text,
  status text not null default 'active' check (status = any (array['active', 'archived'])),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.provider_bank_details is
  'Masked provider payout metadata ONLY (bank name, holder, last-4, method). Full account/routing numbers are intentionally NOT stored here — upload the bank document to the private provider-internal bucket instead. Structured full bank storage requires encrypted columns before LIVE.';

alter table public.provider_bank_details enable row level security;

drop policy if exists pbd_records_admin_all on public.provider_bank_details;
create policy pbd_records_admin_all on public.provider_bank_details
  for all to authenticated
  using (public.is_provider_records_admin())
  with check (public.is_provider_records_admin());

drop trigger if exists provider_bank_details_touch on public.provider_bank_details;
create trigger provider_bank_details_touch
  before update on public.provider_bank_details
  for each row execute function public.company_os_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) provider-internal storage bucket (private; admin download via signed URLs)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('provider-internal', 'provider-internal', false)
on conflict (id) do nothing;

drop policy if exists "provider_internal_admin_select" on storage.objects;
create policy "provider_internal_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'provider-internal' and public.is_provider_records_admin());

drop policy if exists "provider_internal_admin_insert" on storage.objects;
create policy "provider_internal_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'provider-internal' and public.is_provider_records_admin());

drop policy if exists "provider_internal_admin_update" on storage.objects;
create policy "provider_internal_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'provider-internal' and public.is_provider_records_admin())
  with check (bucket_id = 'provider-internal' and public.is_provider_records_admin());

drop policy if exists "provider_internal_admin_delete" on storage.objects;
create policy "provider_internal_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'provider-internal' and public.is_provider_records_admin());
