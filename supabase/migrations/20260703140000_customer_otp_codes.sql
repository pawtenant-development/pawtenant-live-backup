-- ─────────────────────────────────────────────────────────────────────────
-- customer_otp_codes — 6-digit email verification before checkout (TEST)
-- ─────────────────────────────────────────────────────────────────────────
-- Backs the customer email OTP step in the ESA/PSD assessment flow. The code
-- is generated + emailed by send-customer-otp and checked by
-- verify-customer-otp (both service-role only). Mirrors the existing admin OTP
-- convention (plaintext code stored in a locked table, short TTL, single use).
--
-- Security posture:
--   * RLS enabled with NO anon/authenticated policies → only the service role
--     (edge functions) can read/write. The public anon key CANNOT read codes.
--   * Codes expire in 10 minutes and are deleted on successful verification.
--   * A per-email attempt counter caps brute force (verify fn enforces).
-- Idempotent: IF NOT EXISTS throughout.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.customer_otp_codes (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  code            text not null,
  confirmation_id text,
  first_name      text,
  letter_type     text,
  attempts        integer not null default 0,
  expires_at      timestamptz not null,
  verified_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists customer_otp_codes_email_idx on public.customer_otp_codes (lower(email));
create index if not exists customer_otp_codes_created_idx on public.customer_otp_codes (created_at);

comment on table public.customer_otp_codes is
  'Short-lived 6-digit email verification codes for the customer pre-checkout OTP step. Service-role only (no anon/authenticated RLS policies). Codes expire in 10 min and are deleted on use.';

alter table public.customer_otp_codes enable row level security;

-- Lock the table down: revoke all from public roles. The edge functions use
-- the service role, which bypasses RLS. No SELECT/INSERT policies for
-- anon/authenticated are created, so those roles cannot touch the table.
revoke all on public.customer_otp_codes from anon;
revoke all on public.customer_otp_codes from authenticated;
