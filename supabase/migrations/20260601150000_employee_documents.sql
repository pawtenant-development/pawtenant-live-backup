-- Employee Documents / Contracts. Private bucket; admin manages, employee reads
-- only their own employee_and_admin documents. Additive + idempotent.
-- Employees only (team_members); providers/customers excluded.
-- Applied to TEST (opudhofjbydrljgleofq) via Supabase MCP on 2026-06-01.

-- 1) Table
create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  company_id uuid,                                   -- future-ready, nullable, no FK
  document_type text not null default 'other',
  title text not null,
  description text,
  file_path text not null,                           -- equals storage.objects.name
  file_name text,
  file_mime_type text,
  file_size_bytes bigint,
  visibility text not null default 'employee_and_admin',
  requires_acknowledgment boolean not null default false,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id),
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='employee_documents_type_chk') then
    alter table public.employee_documents add constraint employee_documents_type_chk
      check (document_type in ('signing_letter','employment_contract','id_document','policy',
                               'tax_payment','warning_letter','training_certificate','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname='employee_documents_visibility_chk') then
    alter table public.employee_documents add constraint employee_documents_visibility_chk
      check (visibility in ('admin_only','employee_and_admin'));
  end if;
end $$;

create index if not exists idx_employee_documents_member on public.employee_documents (team_member_id);
create index if not exists idx_employee_documents_type on public.employee_documents (document_type);

alter table public.employee_documents enable row level security;

-- Admin (owner/admin_manager + is_admin): full manage.
drop policy if exists edocs_admin_all on public.employee_documents;
create policy edocs_admin_all on public.employee_documents
  for all to authenticated
  using (exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')))
  with check (exists (select 1 from public.doctor_profiles dp
                 where dp.user_id = auth.uid() and dp.is_admin = true
                   and coalesce(dp.role,'') in ('owner','admin_manager')));

-- Employee: read ONLY their own employee_and_admin documents (never admin_only).
drop policy if exists edocs_self_read on public.employee_documents;
create policy edocs_self_read on public.employee_documents
  for select to authenticated
  using (
    visibility = 'employee_and_admin'
    and team_member_id in (select tm.id from public.team_members tm where tm.user_id = auth.uid())
  );

create or replace function public.employee_documents_set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists edocs_set_updated_at on public.employee_documents;
create trigger edocs_set_updated_at before update on public.employee_documents
  for each row execute function public.employee_documents_set_updated_at();

-- 2) Private storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-documents','employee-documents', false, 20971520,
        array['application/pdf','image/jpeg','image/png','image/webp',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Admin: full object access in this bucket.
drop policy if exists edocs_obj_admin_all on storage.objects;
create policy edocs_obj_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'employee-documents'
         and exists (select 1 from public.doctor_profiles dp
                     where dp.user_id = auth.uid() and dp.is_admin = true
                       and coalesce(dp.role,'') in ('owner','admin_manager')))
  with check (bucket_id = 'employee-documents'
              and exists (select 1 from public.doctor_profiles dp
                          where dp.user_id = auth.uid() and dp.is_admin = true
                            and coalesce(dp.role,'') in ('owner','admin_manager')));

-- Employee: read a storage object ONLY if a matching employee_and_admin document
-- row is visible to them (the employee_documents RLS above enforces own+visible).
drop policy if exists edocs_obj_self_read on storage.objects;
create policy edocs_obj_self_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'employee-documents'
    and exists (
      select 1 from public.employee_documents d
      join public.team_members tm on tm.id = d.team_member_id
      where d.file_path = storage.objects.name
        and tm.user_id = auth.uid()
        and d.visibility = 'employee_and_admin'
    )
  );

-- 3) Acknowledge RPC — employee acknowledges their OWN visible document only.
create or replace function public.acknowledge_my_document(p_document_id uuid)
returns public.employee_documents
language plpgsql security definer set search_path = public
as $$
declare v_row public.employee_documents;
begin
  update public.employee_documents d
     set acknowledged_at = now(), acknowledged_by = auth.uid()
   where d.id = p_document_id
     and d.requires_acknowledgment = true
     and d.visibility = 'employee_and_admin'
     and d.team_member_id in (select tm.id from public.team_members tm where tm.user_id = auth.uid())
   returning * into v_row;
  if v_row.id is null then
    raise exception 'document not found or not acknowledgeable by you';
  end if;
  return v_row;
end; $$;

grant execute on function public.acknowledge_my_document(uuid) to authenticated;
