-- CASSANDRA-PUBLIC-PROVIDER-VISIBILITY-001
--
-- get_public_provider_directory() previously INNER JOINed approved_providers.
-- Cassandra Enriquez is active + published in doctor_profiles, but has no
-- approved_providers row, so the public RPC returned no row for her even though
-- Admin said she should appear on the website.
--
-- doctor_profiles is the authoritative Admin visibility record. Keep the
-- public projection minimal and private-field-free, but allow active/published
-- profile-only providers to appear by deriving the public slug from their name
-- when approved_providers.slug is absent.

create or replace function public.get_public_provider_directory()
returns table (
  slug         text,
  full_name    text,
  photo_url    text,
  npi_number   text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with visible_profiles as (
    select
      dp.email,
      nullif(btrim(dp.full_name), '') as profile_name,
      nullif(btrim(dp.photo_url), '') as profile_photo_url,
      nullif(btrim(dp.npi_number), '') as profile_npi_number,
      lower(coalesce(dp.role, '')) as profile_role
    from public.doctor_profiles dp
    where dp.is_active is true
      and dp.is_published is true
      and nullif(btrim(dp.email), '') is not null
      and lower(coalesce(dp.role, '')) not in ('owner', 'admin_manager', 'support', 'finance', 'read_only')
  )
  select
    coalesce(
      nullif(btrim(ap.slug), ''),
      regexp_replace(
        regexp_replace(lower(vp.profile_name), '[^a-z0-9]+', '-', 'g'),
        '(^-|-$)',
        '',
        'g'
      )
    ) as slug,
    coalesce(vp.profile_name, nullif(btrim(ap.full_name), '')) as full_name,
    coalesce(vp.profile_photo_url, nullif(btrim(ap.photo_url), '')) as photo_url,
    vp.profile_npi_number as npi_number
  from visible_profiles vp
  left join public.approved_providers ap
    on lower(btrim(ap.email)) = lower(btrim(vp.email))
  where (ap.id is null or ap.is_active is true)
    and coalesce(vp.profile_name, nullif(btrim(ap.full_name), '')) is not null
    and coalesce(
      nullif(btrim(ap.slug), ''),
      regexp_replace(
        regexp_replace(lower(vp.profile_name), '[^a-z0-9]+', '-', 'g'),
        '(^-|-$)',
        '',
        'g'
      )
    ) <> '';
$$;

comment on function public.get_public_provider_directory() is
  'CASSANDRA-PUBLIC-PROVIDER-VISIBILITY-001. Public-safe provider projection: slug, name, public photo URL, NPI. Rows are gated on doctor_profiles.is_active AND doctor_profiles.is_published, with approved_providers.is_active honored when present. Never exposes email/phone/rate/internal ids. Executable by anon + authenticated by design.';

revoke all on function public.get_public_provider_directory() from public;
revoke all on function public.get_public_provider_directory() from anon;
revoke all on function public.get_public_provider_directory() from authenticated;

grant execute on function public.get_public_provider_directory() to anon;
grant execute on function public.get_public_provider_directory() to authenticated;
