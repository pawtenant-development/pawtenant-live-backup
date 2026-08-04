-- ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001 — stable checkout slugs.
--
-- Replaces the customer-facing `/assessment?rt=<single-use token>` recovery URL
-- with a short, stable, opaque link:
--
--     https://pawtenant.com/checkout/<slug>
--
-- Properties required by the owner:
--   • no query string, no confirmation id, no email/phone, no coupon
--   • randomly generated, not sequential, not derived from customer data
--   • stable for the whole unpaid life of the order — no expiry
--   • reusable: refresh, email scanners, multiple devices
--   • automatically dead once the order is paid / completed / cancelled /
--     refunded / archived (delegated to public.order_is_resumable)
--   • admin revocable AND regenerable
--
-- The slug IS the credential, so it is generated from a CSPRNG and the resolver
-- returns a single generic "not available" shape for every failure mode.
-- Assessment answers are deliberately NOT exposed by the resolver.
--
-- Slug alphabet excludes 0/1/I/L/O/U to stay readable over the phone and in
-- print. 31 symbols ^ 8 characters ~= 8.5e11 — combined with the resolver's
-- generic failure and edge-side rate limiting, that is a sane budget for a
-- link that carries no medical data.
--
-- Forward-only. Safe to re-run.

create extension if not exists pgcrypto;

-- ── table ────────────────────────────────────────────────────────────────────
create table if not exists public.order_checkout_links (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  slug           text not null,
  status         text not null default 'active',
  created_by     text not null default 'system',
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,
  use_count      integer not null default 0,
  revoked_at     timestamptz,
  revoked_reason text,
  constraint order_checkout_links_status_chk check (status in ('active','revoked')),
  constraint order_checkout_links_slug_chk   check (slug ~ '^[2-9A-HJ-NP-TV-Z]{8}$')
);

-- Global slug uniqueness — the slug is the credential.
create unique index if not exists order_checkout_links_slug_key
  on public.order_checkout_links (slug);

-- Exactly ONE active slug per order. Revoked rows are retained for audit.
create unique index if not exists order_checkout_links_one_active_per_order
  on public.order_checkout_links (order_id) where status = 'active';

create index if not exists order_checkout_links_order_idx
  on public.order_checkout_links (order_id);

alter table public.order_checkout_links enable row level security;
-- No policies on purpose: only service_role (which bypasses RLS) may touch this
-- table. anon/authenticated get nothing, ever.
revoke all on table public.order_checkout_links from public, anon, authenticated;

comment on table public.order_checkout_links is
  'Stable opaque checkout recovery slugs. One active slug per order, no expiry; validity is derived from order_is_resumable(). ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001.';

-- ── slug generator ───────────────────────────────────────────────────────────
create or replace function public.generate_checkout_slug()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';  -- 30 symbols, no 0/1/I/L/O/U
  n        constant int  := length(alphabet);
  out      text := '';
  i        int;
  b        bytea;
begin
  -- pgcrypto lives in the `extensions` schema on Supabase. search_path stays
  -- pinned to `public`, so this call MUST be schema-qualified.
  b := extensions.gen_random_bytes(8);
  for i in 0..7 loop
    -- get_byte is 0..255; modulo bias across 30 symbols is negligible here and
    -- the entropy budget already assumes it.
    out := out || substr(alphabet, (get_byte(b, i) % n) + 1, 1);
  end loop;
  return out;
end;
$$;

revoke all on function public.generate_checkout_slug() from public, anon, authenticated;
grant execute on function public.generate_checkout_slug() to service_role;

-- ── ensure (idempotent create-or-return) ─────────────────────────────────────
create or replace function public.ensure_order_checkout_slug(
  p_order_id uuid, p_created_by text default 'system'
) returns text language plpgsql volatile security definer set search_path = public as $$
declare v_slug text; v_try text; v_i int := 0;
begin
  if not public.order_is_resumable(p_order_id) then
    raise exception 'order is not resumable';
  end if;

  select slug into v_slug
    from public.order_checkout_links
   where order_id = p_order_id and status = 'active'
   limit 1;
  if v_slug is not null then
    return v_slug;  -- STABLE: same order always yields the same live slug
  end if;

  loop
    v_i := v_i + 1;
    v_try := public.generate_checkout_slug();
    begin
      insert into public.order_checkout_links (order_id, slug, created_by)
      values (p_order_id, v_try, coalesce(p_created_by, 'system'));
      return v_try;
    exception
      when unique_violation then
        -- Either a slug collision (retry) or another session created the active
        -- row first (return theirs).
        select slug into v_slug
          from public.order_checkout_links
         where order_id = p_order_id and status = 'active'
         limit 1;
        if v_slug is not null then return v_slug; end if;
        if v_i >= 8 then raise exception 'could not allocate checkout slug'; end if;
    end;
  end loop;
end;
$$;

revoke all on function public.ensure_order_checkout_slug(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_order_checkout_slug(uuid, text) to service_role;

-- ── resolve (the only read path; never returns assessment answers) ───────────
create or replace function public.resolve_order_checkout_slug(p_slug text)
returns table (
  order_id uuid, confirmation_id text, first_name text, last_name text,
  email text, phone text, state text, letter_type text, package_key text,
  billing_plan text, plan_type text, delivery_speed text, price integer,
  coupon_code text, coupon_discount integer, otp_verified boolean
) language plpgsql volatile security definer set search_path = public as $$
declare v_link public.order_checkout_links%rowtype;
begin
  if p_slug is null or p_slug !~ '^[2-9A-HJ-NP-TV-Z]{8}$' then
    return;  -- generic empty: malformed slugs are indistinguishable from misses
  end if;

  select * into v_link from public.order_checkout_links
   where slug = p_slug and status = 'active' limit 1;
  if not found then return; end if;

  if not public.order_is_resumable(v_link.order_id) then
    return;  -- paid / completed / cancelled / refunded / archived
  end if;

  update public.order_checkout_links
     set use_count = use_count + 1, last_used_at = now()
   where id = v_link.id;   -- audit only; NEVER consumes the link

  return query
  select o.id, o.confirmation_id, o.first_name, o.last_name,
         o.email, o.phone, o.state, o.letter_type, o.package_key,
         o.billing_plan, o.plan_type, o.delivery_speed, o.price,
         -- Only a coupon already saved server-side on the order survives. No
         -- link, parameter or template may introduce one.
         o.coupon_code, o.coupon_discount,
         -- Durable "this customer completed OTP for this order" marker.
         -- NOT customer_otp_codes.verified_at: verify-customer-otp DELETES that
         -- row on success. What it does instead is create the auth user and
         -- back-link unpaid orders to it, so user_id is the signal that
         -- survives. Using the OTP table here returned a false negative for an
         -- order that had genuinely verified.
         (o.user_id is not null) as otp_verified
    from public.orders o
   where o.id = v_link.order_id;
end;
$$;

revoke all on function public.resolve_order_checkout_slug(text) from public, anon, authenticated;
grant execute on function public.resolve_order_checkout_slug(text) to service_role;

-- ── revoke / regenerate (admin) ──────────────────────────────────────────────
create or replace function public.revoke_order_checkout_slug(
  p_order_id uuid, p_reason text default 'admin_revoked'
) returns integer language plpgsql volatile security definer set search_path = public as $$
declare v_n integer;
begin
  update public.order_checkout_links
     set status = 'revoked', revoked_at = now(),
         revoked_reason = coalesce(p_reason, 'admin_revoked')
   where order_id = p_order_id and status = 'active';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.revoke_order_checkout_slug(uuid, text) from public, anon, authenticated;
grant execute on function public.revoke_order_checkout_slug(uuid, text) to service_role;

create or replace function public.regenerate_order_checkout_slug(
  p_order_id uuid, p_created_by text default 'admin'
) returns text language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.revoke_order_checkout_slug(p_order_id, 'regenerated');
  return public.ensure_order_checkout_slug(p_order_id, coalesce(p_created_by, 'admin'));
end;
$$;

revoke all on function public.regenerate_order_checkout_slug(uuid, text) from public, anon, authenticated;
grant execute on function public.regenerate_order_checkout_slug(uuid, text) to service_role;
