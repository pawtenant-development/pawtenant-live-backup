-- ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001 §I
-- Narrow, concurrency-safe rate limiting for resume-credential endpoints.
--
-- Applied to TEST (opudhofjbydrljgleofq) via explicit MCP SQL.
-- NOT applied to LIVE.
--
-- PRIVACY: this table never stores a raw IP, a raw token, a confirmation id or
-- any customer PII. The only identifying column is `bucket_key`, an HMAC of
-- (scope, subject) taken with a server-side pepper that never leaves the Edge
-- Function environment. A plain sha256 would be inadequate here — the IPv4
-- space is only ~2^32 and would be trivially brute-forceable from a table dump.
-- Rows are short-lived and purged on write (see `consume_resume_rate_limit`).

create table if not exists public.resume_rate_limits (
  bucket_key    text primary key,
  scope         text        not null check (scope in (
                              'exchange','request_new_link','issue_admin','bridge')),
  window_start  timestamptz not null default now(),
  attempt_count integer     not null default 0,
  expires_at    timestamptz not null,
  constraint resume_rate_limits_key_len check (char_length(bucket_key) = 64)
);

create index if not exists resume_rate_limits_expiry_idx
  on public.resume_rate_limits (expires_at);

comment on table public.resume_rate_limits is
  'ORDER-RESUME-SECURE-TOKEN-001 §I: peppered-HMAC rate-limit buckets. Never store a raw IP, raw token, confirmation id or PII here.';

alter table public.resume_rate_limits enable row level security;
-- RLS on with zero policies = deny-all for anon/authenticated.

revoke all on public.resume_rate_limits from public;
revoke all on public.resume_rate_limits from anon;
revoke all on public.resume_rate_limits from authenticated;

-- Atomic consume-and-test.
--
-- CONCURRENCY: the whole decision is ONE `insert ... on conflict do update`
-- statement. On conflict Postgres takes a row lock, so N concurrent callers
-- serialise on that row and each observes a distinct post-increment count.
-- There is no read-then-write window, so 8 simultaneous requests against a
-- limit of 5 yield exactly 5 allowed and 3 denied.
--
-- Returns TRUE when the caller is within budget, FALSE when it should be
-- throttled. Fails OPEN only on a caller-side omission (null key), which the
-- Edge Functions never do — they always supply a key.
create or replace function public.consume_resume_rate_limit(
  p_bucket_key     text,
  p_scope          text,
  p_window_seconds integer,
  p_max_attempts   integer
) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  v_window integer := least(greatest(coalesce(p_window_seconds, 600), 10), 86400);
  v_max    integer := least(greatest(coalesce(p_max_attempts, 10), 1), 10000);
  v_count  integer;
begin
  if p_bucket_key is null or char_length(p_bucket_key) <> 64 then
    raise exception 'invalid rate limit key';
  end if;
  if p_scope not in ('exchange','request_new_link','issue_admin','bridge') then
    raise exception 'invalid rate limit scope';
  end if;

  -- Bounded opportunistic purge. Keeps retention automatic without a cron and
  -- without ever scanning the whole table.
  delete from public.resume_rate_limits
   where bucket_key in (
     select bucket_key from public.resume_rate_limits
      where expires_at < now() limit 50
   );

  insert into public.resume_rate_limits as r
    (bucket_key, scope, window_start, attempt_count, expires_at)
  values
    (p_bucket_key, p_scope, now(), 1, now() + make_interval(secs => v_window))
  on conflict (bucket_key) do update
     set attempt_count = case
           when r.window_start < now() - make_interval(secs => v_window) then 1
           else r.attempt_count + 1
         end,
         window_start  = case
           when r.window_start < now() - make_interval(secs => v_window) then now()
           else r.window_start
         end,
         expires_at    = case
           when r.window_start < now() - make_interval(secs => v_window)
             then now() + make_interval(secs => v_window)
           else r.expires_at
         end
  returning r.attempt_count into v_count;

  return v_count <= v_max;
end;
$$;

-- Explicit, by name: revoking "from public" does NOT undo the default EXECUTE
-- grant PostgreSQL hands to every role.
revoke all on function public.consume_resume_rate_limit(text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.consume_resume_rate_limit(text,text,integer,integer)
  to service_role;
