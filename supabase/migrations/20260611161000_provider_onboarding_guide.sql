-- Provider Portal — first-login onboarding guide tracking (LIVE mirror of TEST).
-- Adds a seen-marker on doctor_profiles plus a self-scoped SECURITY DEFINER
-- RPC (same pattern as mark_provider_portal_access). DB-backed so the guide
-- stays dismissed across devices; the portal also keeps a localStorage
-- fallback in case the RPC write fails.
--
-- LIVE-SPECIFIC BACKFILL (not in TEST): existing providers who have ALREADY
-- accessed the portal are marked as already-seen using their actual first
-- access time, so the guide never surprises current providers. Providers who
-- have never accessed the portal (and all newly activated providers after this
-- deploy) keep NULL and see the guide once on first login. Idempotent.

alter table public.doctor_profiles
  add column if not exists provider_onboarding_seen_at timestamptz;

comment on column public.doctor_profiles.provider_onboarding_seen_at is
  'When the provider dismissed/completed the first-login portal guide. NULL = guide not yet seen.';

create or replace function public.mark_provider_onboarding_seen()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.doctor_profiles
     set provider_onboarding_seen_at = coalesce(provider_onboarding_seen_at, now())
   where user_id = auth.uid();
end;
$$;

grant execute on function public.mark_provider_onboarding_seen() to authenticated;

-- Backfill: providers who already used the portal are treated as already-seen.
update public.doctor_profiles
   set provider_onboarding_seen_at = portal_first_accessed_at
 where portal_first_accessed_at is not null
   and provider_onboarding_seen_at is null;
