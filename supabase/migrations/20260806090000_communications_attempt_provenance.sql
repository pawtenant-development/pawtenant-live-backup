-- 20260806090000_communications_attempt_provenance.sql
--
-- LEAD-FOLLOWUP-GHL-DELIVERY-AND-ADMIN-RESUME-CHECKOUT-EMAIL-002
--
-- One provider attempt must produce exactly ONE communications row, and that
-- row must be able to explain itself without a human cross-referencing another
-- table.
--
-- During the 2026-08-04 incident the comms log held 642 rows that all said the
-- same thing — status 'failed', no code, no stage, no attempt identity — so
-- there was no way to tell a permanent misconfiguration from a transient blip,
-- or a first attempt from the ninety-fourth, from the log alone.
--
-- Three additive nullable columns close that:
--   failure_code    — machine-readable, PII-free (see _shared/ghlSms.ts)
--   failure_reason  — short, safe, human-readable. Never a credential or body.
--   sequence_stage  — which automated stage produced this row, e.g. 'sms_5min'
--
-- The idempotency key itself needs no new column: `dedupe_key` already exists
-- and already carries a UNIQUE partial index
-- (communications_dedupe_key_uniq ... WHERE dedupe_key IS NOT NULL), which is
-- what actually enforces one-row-per-attempt. Application code cannot be the
-- guarantee here — two concurrent cron runs would both pass a SELECT check.
--
-- Additive and non-destructive: every column is nullable with no default, so
-- existing rows and every current writer are untouched.

alter table public.communications
  add column if not exists failure_code   text,
  add column if not exists failure_reason text,
  add column if not exists sequence_stage text;

comment on column public.communications.failure_code is
  'Machine-readable, PII-free provider failure code (see _shared/ghlSms.ts GhlSmsFailureCode). NULL on success.';
comment on column public.communications.failure_reason is
  'Short human-readable failure detail. Never contains credentials or the message body. NULL on success.';
comment on column public.communications.sequence_stage is
  'Automated sequence stage that produced this row (e.g. sms_5min). NULL for manual/admin sends.';

-- Operational lookup: "show me every failed attempt for this stage".
create index if not exists communications_sequence_stage_idx
  on public.communications (sequence_stage)
  where sequence_stage is not null;
