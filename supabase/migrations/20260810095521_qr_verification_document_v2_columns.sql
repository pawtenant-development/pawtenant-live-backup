-- RECOVERED FILENAME — TEST ledger version 20260810095521.
--
-- WHAT THIS IS. The ledger records a third QR migration, "document v2 columns",
-- for which no file existed. Catalog extraction from the deployed TEST database
-- showed the columns it names — document_version_id, version, superseded_at,
-- superseded_by_letter_id, and the file/revocation fields — were ALREADY created
-- earlier by 20260727130000_order_document_versions.sql (ledger
-- 20260726191252) and by the original letter_verifications table. Nothing was
-- lost; the ledger entry simply has no dedicated source file.
--
-- So this file does not invent DDL. It restates the same additive, idempotent
-- column set so that:
--
--   • the repository has a file for every applied ledger version, and
--   • a fresh database (or a LIVE arm that somehow lacks one of them) converges
--     to the same shape rather than failing later inside the verifier.
--
-- Structural equivalence was confirmed against LIVE before porting: LIVE
-- already carries all nine columns (confirmation_id, document_version_id,
-- file_url, processed_file_url, revoke_reason, revoked_at, superseded_at,
-- superseded_by_letter_id, version) and needs only public_token and is_demo,
-- which belong to 20260810092452. Applying this file to LIVE is therefore a
-- verified no-op that exists for ledger completeness.

alter table public.letter_verifications
  add column if not exists document_version_id     uuid references public.order_document_versions(id),
  add column if not exists version                 integer not null default 1,
  add column if not exists superseded_at           timestamptz,
  add column if not exists superseded_by_letter_id text,
  add column if not exists confirmation_id         text,
  add column if not exists file_url                text,
  add column if not exists processed_file_url      text,
  add column if not exists revoked_at              timestamptz,
  add column if not exists revoke_reason           text;

comment on column public.letter_verifications.superseded_at is
  'Set when a NEWER approved version exists. The row itself is never repointed — status and file_url stay as issued.';

create index if not exists idx_lv_document_version
  on public.letter_verifications (document_version_id);
