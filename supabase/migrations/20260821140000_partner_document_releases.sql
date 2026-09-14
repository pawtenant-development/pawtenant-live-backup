-- PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 8 · Part A
-- Secure partner document retrieval: the partner-safe release artifact.
--
-- WHY A SEPARATE ARTIFACT INSTEAD OF SIGNING THE PROVIDER'S UPLOAD
-- The provider's original upload lives in provider-letters/letters storage next
-- to retail artifacts, under paths that embed internal identity, and the same
-- object is what admin review and any future internal derivative work from.
-- A partner API that signs THAT object hands an external company a URL into
-- PawTenant's internal document store. Instead, approval of a partner order's
-- letter mints a partner-safe RELEASE: the approved bytes are copied by the
-- edge function into the private `partner-documents` bucket under a path that
-- contains nothing but the release's own random id. The partner API signs only
-- release objects, so:
--   * a leaked URL identifies nothing (no internal order id, no partner id,
--     no customer name in the path);
--   * cross-partner isolation is a table predicate on partner_id, proven
--     before any signing happens;
--   * the provider's original object and every internal derivative stay
--     unreachable from the partner surface.
--
-- The release ledger is append-only: a superseded document's release row stays
-- for audit, and "current" is DERIVED (the release whose source document is
-- still the order's approved, non-superseded letter) — never stored state that
-- could go stale.
--
-- ACCESS: admins read (is_chat_admin), service_role writes (the partner API
-- edge function). Providers, customers and anon: nothing.

-- ── §1. Private bucket for partner-safe releases ────────────────────────────
insert into storage.buckets (id, name, public)
  values ('partner-documents', 'partner-documents', false)
on conflict (id) do update set public = false;

-- No storage.objects policies are added: with RLS enabled and no policy, only
-- the service role can touch the bucket. Partners get short-lived signed URLs
-- minted by the edge function; nothing else can read an object.

-- ── §2. The release ledger ──────────────────────────────────────────────────
create table if not exists public.partner_document_releases (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete cascade,
  partner_id         uuid not null references public.partner_organizations(id),
  partner_order_id   text not null,
  source_document_id uuid not null references public.order_documents(id) on delete cascade,
  service            text not null check (service in ('esa','psd')),
  storage_bucket     text not null default 'partner-documents',
  storage_path       text not null,
  mime_type          text not null default 'application/pdf',
  file_size_bytes    integer,
  file_sha256        text not null,
  created_by         text not null default 'partner-orders-v1',
  created_at         timestamptz not null default now(),
  -- One release per source document. A re-approval after supersession is a NEW
  -- source document and therefore a NEW release; a retry of the same approval
  -- finds this row and reuses it (idempotent GET).
  constraint partner_document_releases_source_unique unique (source_document_id)
);

comment on table public.partner_document_releases is
  'Partner-safe copies of approved partner-order letters, stored in the '
  'private partner-documents bucket under release-id-only paths. The partner '
  'API signs ONLY these objects — never a provider upload, never an internal '
  'derivative. Append-only; current = the release of the order''s approved, '
  'non-superseded letter.';

create index if not exists partner_document_releases_order_idx
  on public.partner_document_releases (order_id);
create index if not exists partner_document_releases_partner_idx
  on public.partner_document_releases (partner_id, created_at);

-- Releases are provenance: never rewritten. DELETE only under the explicit
-- fixture-cleanup escape hatch (TEST hygiene) or via order deletion under it.
create or replace function public.tg_partner_document_release_append_only()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE' then
    raise exception 'partner_document_releases: releases are immutable (release %)', old.id
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.fixture_cleanup', true), '') <> 'on'
  then
    raise exception 'partner_document_releases: releases are append-only (release %)', old.id
      using errcode = '23514';
  end if;
  return old;
end;
$function$;

drop trigger if exists partner_document_releases_append_only on public.partner_document_releases;
create trigger partner_document_releases_append_only
  before update or delete on public.partner_document_releases
  for each row execute function public.tg_partner_document_release_append_only();

-- ── §3. Access ──────────────────────────────────────────────────────────────
alter table public.partner_document_releases enable row level security;
alter table public.partner_document_releases force row level security;

revoke all on public.partner_document_releases from public, anon, authenticated;
grant select on public.partner_document_releases to authenticated;
grant all on public.partner_document_releases to service_role;

drop policy if exists partner_document_releases_admin_read on public.partner_document_releases;
create policy partner_document_releases_admin_read on public.partner_document_releases
  for select to authenticated using (public.is_chat_admin());
