-- ============================================================================
-- admin_find_auth_user_by_email  (PORTAL-RESET-SELF-HEAL, 2026-07-02)
--
-- Service-role-only lookup of an auth.users row by normalized email.
--
-- Why this exists:
--   request-customer-password-reset previously found the auth user with
--   `auth.admin.listUsers({ page: 1, perPage: 1000 })` and scanned the array
--   client-side. That silently misses any user beyond the first 1000 once the
--   project grows — the NEWEST customers would fall off the end and get no
--   reset email. This RPC does an indexed, O(1) lookup instead and returns
--   just the fields the reset flow needs (existence, confirmed/banned/deleted
--   state, and recovery_sent_at for the soft rate limit).
--
-- Security:
--   - SECURITY DEFINER so it can read the protected auth.users table.
--   - EXECUTE is REVOKED from public/anon/authenticated and GRANTED only to
--     service_role. The browser never calls this; only the edge function
--     (running with the service-role key) does. It therefore cannot be used
--     to enumerate customers from the client — anti-enumeration is preserved.
--   - Returns at most one row and never exposes password hashes or tokens.
--
-- Idempotent: CREATE OR REPLACE + explicit grant/revoke.
-- ============================================================================

create or replace function public.admin_find_auth_user_by_email(p_email text)
returns table (
  id uuid,
  email text,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz,
  recovery_sent_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    u.id,
    u.email,
    u.email_confirmed_at,
    u.banned_until,
    u.deleted_at,
    u.recovery_sent_at
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  order by u.created_at desc
  limit 1;
$$;

revoke all on function public.admin_find_auth_user_by_email(text) from public;
revoke all on function public.admin_find_auth_user_by_email(text) from anon;
revoke all on function public.admin_find_auth_user_by_email(text) from authenticated;
grant execute on function public.admin_find_auth_user_by_email(text) to service_role;
