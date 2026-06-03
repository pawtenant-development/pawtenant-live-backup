-- PROVIDER ASSIGNMENT READINESS GATE
-- ----------------------------------------------------------------------------
-- An order may only be assigned to a provider once that provider has actually
-- set up their account and accessed the provider portal at least once.
--
-- Source of truth: doctor_profiles portal-access timestamps below.
-- Readiness definition (documented):
--   A doctor_profiles provider is "assignment ready" when
--     is_active = true  AND  portal_first_accessed_at IS NOT NULL
--   i.e. an auth account exists (user_id) and the provider has loaded the
--   provider portal at least once (which only happens after they accept the
--   invite / set their password and sign in).
--
--   Legacy externally-managed providers in doctor_contacts (no portal account)
--   are intentionally NOT gated by this rule — they remain assignable as today.
--
-- Idempotent + non-destructive.
-- ----------------------------------------------------------------------------

alter table public.doctor_profiles
  add column if not exists portal_first_accessed_at   timestamptz,
  add column if not exists portal_last_accessed_at     timestamptz,
  add column if not exists account_setup_completed_at  timestamptz;

comment on column public.doctor_profiles.portal_first_accessed_at  is 'First time the provider authenticated into the provider portal. NULL = never accessed → NOT assignment-ready.';
comment on column public.doctor_profiles.portal_last_accessed_at   is 'Most recent provider portal access (updated on each portal load, once per session).';
comment on column public.doctor_profiles.account_setup_completed_at is 'When the provider completed account setup (first successful authenticated portal load).';

-- ── Backfill existing providers who have already signed in ───────────────────
-- auth.users.last_sign_in_at is the authoritative "has logged in" signal.
-- Only fill when currently NULL so re-running never clobbers real values.
update public.doctor_profiles dp
set portal_first_accessed_at   = coalesce(dp.portal_first_accessed_at,   u.last_sign_in_at),
    portal_last_accessed_at    = coalesce(dp.portal_last_accessed_at,    u.last_sign_in_at),
    account_setup_completed_at = coalesce(dp.account_setup_completed_at,  u.last_sign_in_at)
from auth.users u
where u.id = dp.user_id
  and u.last_sign_in_at is not null;

-- ── Self-service portal access marker (called by the provider portal) ────────
-- SECURITY DEFINER so it can write portal-access timestamps, but it ONLY ever
-- touches the calling user's own row (user_id = auth.uid()). No service role
-- on the frontend; anon cannot execute.
create or replace function public.mark_provider_portal_access()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.doctor_profiles
  set portal_last_accessed_at    = now(),
      portal_first_accessed_at   = coalesce(portal_first_accessed_at, now()),
      account_setup_completed_at = coalesce(account_setup_completed_at, now())
  where user_id = auth.uid();
end;
$$;

revoke all     on function public.mark_provider_portal_access() from public;
revoke all     on function public.mark_provider_portal_access() from anon;
grant  execute on function public.mark_provider_portal_access() to authenticated;
