-- LIVE-PUBLIC-PAGES-CONVERSION-PRICING-VERIFICATION-HERO-PROVIDER-FIX-001
--
-- Public-safe provider projection for the marketing site.
--
-- WHY THIS IS REQUIRED (it is not a convenience wrapper):
--   1. `doctor_profiles` has NO anon SELECT policy. Verified with RLS enforced as
--      `anon`: 0 rows. `doctor_profiles.is_published` is the admin "Published"
--      toggle and therefore the authoritative public gate — but an anonymous
--      visitor can never read it. The existing client-side gate in
--      src/lib/providerVisibility.ts consequently fails closed for EVERY visitor,
--      which is why /doctors/<slug> renders "Provider not found" in production.
--   2. `approved_providers` has a policy literally named "Public can read active
--      approved providers" whose USING expression is `true`. Verified as `anon`:
--      all 21 rows readable INCLUDING all 21 provider email addresses, and
--      including inactive providers. Reading provider status from the browser
--      therefore cannot be done without exposing private contact data.
--
-- This SECURITY DEFINER function is the ONLY public read path. It returns a
-- fixed, minimal public projection for providers the authoritative admin record
-- says are active + approved + published. It never returns email, phone,
-- per_order_rate, internal ids, notes, availability, or assignment data.
--
-- The gate is DATA-DRIVEN. There is no provider-name / provider-email exclusion
-- list anywhere in this function: a provider disappears from the public site
-- because Admin marked them inactive or unpublished, and for no other reason.

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
  select
    ap.slug,
    ap.full_name,
    -- Admin uploads the display picture to doctor_profiles.photo_url; the older
    -- approved_providers.photo_url is the fallback. Blank strings normalise to
    -- NULL so the frontend renders initials rather than a broken <img>.
    coalesce(
      nullif(btrim(dp.photo_url), ''),
      nullif(btrim(ap.photo_url), '')
    ) as photo_url,
    nullif(btrim(dp.npi_number), '') as npi_number
  from public.approved_providers ap
  join public.doctor_profiles dp
    on lower(btrim(dp.email)) = lower(btrim(ap.email))
  where ap.is_active  is true
    and dp.is_active  is true
    and dp.is_published is true;
$$;

comment on function public.get_public_provider_directory() is
  'LIVE-PUBLIC-PAGES-...-PROVIDER-FIX-001. Public-safe provider projection: slug, name, public photo URL, NPI. Rows are gated on approved_providers.is_active AND doctor_profiles.is_active AND doctor_profiles.is_published. Never exposes email/phone/rate/internal ids. Executable by anon + authenticated by design.';

-- Grants. Revoking "from public" does NOT undo the implicit grant Postgres gives
-- to PUBLIC on a new function in every deployment path, so revoke each role by
-- name first, then grant back only what is intended.
revoke all on function public.get_public_provider_directory() from public;
revoke all on function public.get_public_provider_directory() from anon;
revoke all on function public.get_public_provider_directory() from authenticated;

-- This function IS the intended public surface — anon execution is deliberate.
grant execute on function public.get_public_provider_directory() to anon;
grant execute on function public.get_public_provider_directory() to authenticated;
