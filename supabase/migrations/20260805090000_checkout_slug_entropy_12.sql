-- ORDER-CHECKOUT-SLUG-ENTROPY-HARDENING-AND-CONTROLLED-RESEND-001
--
-- Raise NEW stable checkout slugs from 8 to 12 characters.
--
-- ENTROPY
--   alphabet = 23456789ABCDEFGHJKMNPQRSTVWXYZ  (30 symbols, no 0/1/I/L/O/U)
--     8 chars : 30^8  = 6.561e11   ~= 39.3 bits
--    12 chars : 30^12 = 5.314e17   ~= 58.9 bits   (+19.6 bits, ~810,000x)
--
--   The slug is the credential for a checkout page, so the guessing budget is
--   what matters: with the resolver's per-IP rate limit and a single generic
--   failure for every miss, 58.9 bits is far beyond reach.
--
-- BACKWARD COMPATIBILITY — deliberate and narrow.
--   Links already in customers' inboxes are 8 characters and MUST keep working;
--   invalidating them would recreate exactly the outage this system was built to
--   end. So the constraint and the resolver accept EXACTLY 8 or EXACTLY 12 —
--   the two documented formats — and nothing else. No arbitrary-length wildcard.
--
--   Only newly generated / regenerated slugs are 12. Existing rows are left
--   untouched; there is no backfill and no forced rotation.
--
-- Forward-only. Safe to re-run.

-- ── 1 · constraint: accept ONLY the two documented lengths ───────────────────
alter table public.order_checkout_links
  drop constraint if exists order_checkout_links_slug_chk;

alter table public.order_checkout_links
  add constraint order_checkout_links_slug_chk
  check (slug ~ '^([2-9A-HJ-NP-TV-Z]{8}|[2-9A-HJ-NP-TV-Z]{12})$');

comment on constraint order_checkout_links_slug_chk on public.order_checkout_links is
  '8 = legacy slugs already delivered to customers; 12 = current format. No other length is valid.';

-- ── 2 · generator: 12 characters ─────────────────────────────────────────────
create or replace function public.generate_checkout_slug()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';  -- 30 symbols
  n        constant int  := length(alphabet);
  len      constant int  := 12;                                 -- ~58.9 bits
  out      text := '';
  i        int;
  b        bytea;
begin
  -- pgcrypto lives in the `extensions` schema on Supabase and search_path is
  -- pinned to `public`, so this call MUST stay schema-qualified.
  b := extensions.gen_random_bytes(len);
  for i in 0..(len - 1) loop
    out := out || substr(alphabet, (get_byte(b, i) % n) + 1, 1);
  end loop;
  return out;
end;
$$;

revoke all on function public.generate_checkout_slug() from public, anon, authenticated;
grant execute on function public.generate_checkout_slug() to service_role;

-- ── 3 · resolver: accept both documented formats ─────────────────────────────
drop function if exists public.resolve_order_checkout_slug(text);

create or replace function public.resolve_order_checkout_slug(p_slug text)
returns table (
  order_id uuid, confirmation_id text, first_name text, last_name text,
  email text, phone text, state text, letter_type text, package_key text,
  billing_plan text, plan_type text, delivery_speed text, price integer,
  coupon_code text, coupon_discount integer, otp_verified boolean, pet_count integer
) language plpgsql volatile security definer set search_path = public as $$
declare v_link public.order_checkout_links%rowtype;
begin
  -- 8 (legacy, still in customer inboxes) or 12 (current). Nothing else.
  if p_slug is null or p_slug !~ '^([2-9A-HJ-NP-TV-Z]{8}|[2-9A-HJ-NP-TV-Z]{12})$' then
    return;
  end if;

  select * into v_link from public.order_checkout_links
   where slug = p_slug and status = 'active' limit 1;
  if not found then return; end if;

  if not public.order_is_resumable(v_link.order_id) then return; end if;

  update public.order_checkout_links
     set use_count = use_count + 1, last_used_at = now()
   where id = v_link.id;   -- audit only; never consumes the link

  return query
  select o.id, o.confirmation_id, o.first_name, o.last_name,
         o.email, o.phone, o.state, o.letter_type, o.package_key,
         o.billing_plan, o.plan_type, o.delivery_speed, o.price,
         o.coupon_code, o.coupon_discount,
         (o.user_id is not null) as otp_verified,
         -- COUNT only. Drives multi-pet pricing (1 -> $129, 2-3 -> $149).
         -- Omitting it defaults checkout to one pet and undercharges by $20.
         greatest(
           coalesce(jsonb_array_length(
             case when jsonb_typeof(o.assessment_answers->'pets') = 'array'
                  then o.assessment_answers->'pets' end), 1), 1
         )::integer as pet_count
    from public.orders o
   where o.id = v_link.order_id;
end;
$$;

revoke all on function public.resolve_order_checkout_slug(text) from public, anon, authenticated;
grant execute on function public.resolve_order_checkout_slug(text) to service_role;
