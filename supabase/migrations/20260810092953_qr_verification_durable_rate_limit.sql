-- RECOVERED FILENAME — TEST ledger version 20260810092953.
--
-- The durable rate limit was authored inside the token-contract migration but
-- recorded in the migration ledger as its own entry. The SQL below is that
-- section moved out BYTE-FOR-BYTE, so the repository filename matches the
-- applied ledger version and a LIVE port applies the two concerns in the
-- recorded order. Every statement is idempotent, so re-running against a
-- database that already has these objects is a no-op.

-- ── 7. Durable rate limit (Stage 1b) ─────────────────────────────────────────
-- verify-letter's limiter was `new Map()` inside the Deno isolate. Supabase
-- spreads requests across isolates and recycles them, so the counter reset
-- constantly: measured 15/15 requests allowed against a declared 10/60s limit.
-- The IP is never stored — only a salted SHA-256 prefix.
create table if not exists public.verification_rate_limits (
  ip_hash      text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (ip_hash, window_start)
);

alter table public.verification_rate_limits enable row level security;
revoke all on table public.verification_rate_limits from public, anon, authenticated;

comment on table public.verification_rate_limits is
  'Durable per-IP-bucket counters for the public letter verification endpoint. Stores a salted hash prefix, never an IP.';

create or replace function public.check_verification_rate_limit(
  p_ip_hash        text,
  p_limit          integer default 10,
  p_window_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  if p_ip_hash is null or btrim(p_ip_hash) = '' then
    return jsonb_build_object('allowed', false, 'hits', 0, 'limit', p_limit);
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.verification_rate_limits (ip_hash, window_start, hits)
  values (btrim(p_ip_hash), v_window, 1)
  on conflict (ip_hash, window_start)
  do update set hits = public.verification_rate_limits.hits + 1
  returning hits into v_hits;

  if random() < 0.02 then
    delete from public.verification_rate_limits
     where window_start < now() - interval '1 hour';
  end if;

  return jsonb_build_object('allowed', v_hits <= p_limit, 'hits', v_hits, 'limit', p_limit);
end;
$$;

revoke all on function public.check_verification_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_verification_rate_limit(text, integer, integer)
  to service_role;
