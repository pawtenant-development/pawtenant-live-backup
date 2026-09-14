-- PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 8 · Part D
-- Partner invoice / remittance PDF artifacts.
--
-- PRINCIPLES
--   * A PDF is RENDERED FROM the immutable issued-invoice line snapshots
--     (partner_invoice_lines + partner_invoices + partner_invoice_payments).
--     Never from a rate card: an issued invoice re-priced by a newer rate card
--     is the exact bug the freeze-at-issue trigger exists to prevent.
--   * One artifact per (invoice, kind). Once rendered, the artifact row and
--     the storage object are immutable — a repeat render request returns the
--     EXISTING artifact (idempotent), never a re-render.
--   * Voids and credits are SEPARATE artifacts ('void_notice' beside the
--     original 'invoice'), never a rewrite of the original bytes.
--   * Artifacts live in the private partner-invoices bucket; retrieval is
--     admin-only signed URLs (short TTL). No automatic email exists.
--   * Content discipline: partner legal/display identity, invoice identity,
--     service-level lines, quantities, unit amounts, credits, payments,
--     balance, status and TEST-placeholder remittance text. NEVER a customer
--     name/contact, an assessment detail, an internal order UUID, provider
--     compensation or margin.

-- ── §1. Private bucket ──────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('partner-invoices', 'partner-invoices', false)
on conflict (id) do update set public = false;

-- ── §2. Artifact ledger ─────────────────────────────────────────────────────
create table if not exists public.partner_invoice_documents (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.partner_invoices(id) on delete cascade,
  kind            text not null check (kind in ('invoice','void_notice')),
  storage_bucket  text not null default 'partner-invoices',
  storage_path    text not null,
  file_sha256     text not null,
  file_size_bytes integer,
  rendered_by     text not null,
  created_at      timestamptz not null default now(),
  constraint partner_invoice_documents_unique unique (invoice_id, kind)
);

comment on table public.partner_invoice_documents is
  'Immutable rendered invoice/remittance PDFs. One per (invoice, kind); '
  'rendered from frozen invoice lines, never from current rate cards. Voids '
  'get a separate void_notice artifact — the original is never rewritten.';

create or replace function public.tg_partner_invoice_document_immutable()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE' then
    raise exception 'partner_invoice_documents: rendered artifacts are immutable (%)', old.id
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.fixture_cleanup', true), '') <> 'on'
  then
    raise exception 'partner_invoice_documents: artifacts are append-only (%)', old.id
      using errcode = '23514';
  end if;
  return old;
end;
$function$;

drop trigger if exists partner_invoice_documents_immutable on public.partner_invoice_documents;
create trigger partner_invoice_documents_immutable
  before update or delete on public.partner_invoice_documents
  for each row execute function public.tg_partner_invoice_document_immutable();

-- ── §3. Access ──────────────────────────────────────────────────────────────
alter table public.partner_invoice_documents enable row level security;
alter table public.partner_invoice_documents force row level security;

revoke all on public.partner_invoice_documents from public, anon, authenticated;
grant select on public.partner_invoice_documents to authenticated;
grant all on public.partner_invoice_documents to service_role;

drop policy if exists partner_invoice_documents_admin_read on public.partner_invoice_documents;
create policy partner_invoice_documents_admin_read on public.partner_invoice_documents
  for select to authenticated using (public.is_chat_admin());
