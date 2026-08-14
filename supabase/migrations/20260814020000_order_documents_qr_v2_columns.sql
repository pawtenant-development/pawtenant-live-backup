-- QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001 · order_documents v2 columns
--
-- RECOVERED DDL. generate-qr-verification-pdf writes five qr_* columns on
-- order_documents. They exist on TEST — with these exact comments — but no
-- repository migration ever created them, so the LIVE port deployed a function
-- that referenced columns the LIVE database does not have. Every call would
-- have failed at the update step with 42703, after the derivative had already
-- been uploaded.
--
-- This is the same class of defect as the three mis-filed QR ledger versions:
-- applied DDL with no file. Rather than apply it untracked a second time, the
-- columns are created here from the deployed TEST catalog (names, types,
-- nullability and comments), so both arms converge and the repo is authoritative.
--
-- Purely additive and idempotent. inject-pdf-footer — the customer-facing letter
-- producer — does NOT use these columns (it writes footer_injected,
-- processed_file_url and footer_letter_id, all long-present), so the forward
-- pipeline was never affected.

alter table public.order_documents
  add column if not exists qr_file_url      text,
  add column if not exists qr_generated_at  timestamptz,
  add column if not exists qr_letter_id     text,
  add column if not exists qr_placement     text,
  add column if not exists qr_source_sha256 text;

comment on column public.order_documents.qr_file_url is
  'verification_qr_letter_v2 — the QR-enabled verification copy. A NEW storage object; never overwrites file_url (original) or processed_file_url (v1).';
comment on column public.order_documents.qr_generated_at is
  'When the v2 QR copy was generated. Presence of both this and qr_file_url is what makes the backfill idempotent.';
comment on column public.order_documents.qr_letter_id is
  'Verification ID stamped into the v2 copy. Must equal the order''s current letter_id; recorded so a mismatch is detectable.';
comment on column public.order_documents.qr_placement is
  'inline | appended — which placement strategy the generator proved safe for this document.';
comment on column public.order_documents.qr_source_sha256 is
  'SHA-256 of the ORIGINAL bytes the v2 copy was built from. Lets a later audit prove the original was unchanged and that v2 derives from it.';

do $postflight$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'order_documents'
         and column_name in ('qr_file_url','qr_generated_at','qr_letter_id',
                             'qr_placement','qr_source_sha256')) <> 5 then
    raise exception 'postflight: the five qr_* columns are not all present';
  end if;
end
$postflight$;
