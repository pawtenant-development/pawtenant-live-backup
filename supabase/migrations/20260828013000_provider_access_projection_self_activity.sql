-- PROVIDER-PORTAL-ACCESS-PROJECTION-001
--
-- The provider portal normally calls mark_provider_portal_access() after an
-- authenticated portal load. A provider can still make an authenticated
-- self-service profile update when that best-effort marker was missed (for
-- example, around a first-login gate transition). Treat that proven
-- provider-authenticated write as portal activity so assignment readiness and
-- the admin roster cannot remain stale.

create or replace function public.project_provider_portal_access_from_self_activity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_accessed_at timestamptz := statement_timestamp();
begin
  -- Service-role/admin writes have no matching auth.uid() and must not project
  -- provider access. Only the provider's own authenticated write qualifies.
  if auth.uid() is not null and auth.uid() = new.user_id then
    new.portal_first_accessed_at := coalesce(new.portal_first_accessed_at, v_accessed_at);
    new.portal_last_accessed_at := v_accessed_at;
    new.account_setup_completed_at := coalesce(new.account_setup_completed_at, v_accessed_at);
  end if;

  return new;
end;
$$;

drop trigger if exists doctor_profiles_project_provider_portal_access
  on public.doctor_profiles;

create trigger doctor_profiles_project_provider_portal_access
before update on public.doctor_profiles
for each row
execute function public.project_provider_portal_access_from_self_activity();

revoke all on function public.project_provider_portal_access_from_self_activity() from public;
revoke all on function public.project_provider_portal_access_from_self_activity() from anon;
revoke all on function public.project_provider_portal_access_from_self_activity() from authenticated;

comment on function public.project_provider_portal_access_from_self_activity() is
  'Projects authenticated provider self-service profile activity into portal access timestamps; service-role/admin writes do not qualify.';
