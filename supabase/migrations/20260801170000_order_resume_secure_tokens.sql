-- ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001
-- Expiring, order-bound, purpose-bound, environment-bound resume credentials.
-- The RAW token is NEVER stored: only sha256(raw). No customer PII lives here.
--
-- Applied to TEST (opudhofjbydrljgleofq) 2026-08-01 via explicit MCP SQL.
-- NOT applied to LIVE — see docs/ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001.md.

create table if not exists public.order_resume_tokens (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  purpose        text not null check (purpose in ('resume_checkout','resume_assessment')),
  token_hash     text not null,
  environment    text not null check (environment in ('test','live')),
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now(),
  created_by     text,
  used_at        timestamptz,
  last_used_at   timestamptz,
  use_count      integer not null default 0,
  revoked_at     timestamptz,
  revoked_reason text,
  constraint order_resume_tokens_hash_len check (char_length(token_hash) = 64),
  constraint order_resume_tokens_expiry_future check (expires_at > created_at)
);

create unique index if not exists order_resume_tokens_hash_uidx
  on public.order_resume_tokens (token_hash);

create index if not exists order_resume_tokens_active_idx
  on public.order_resume_tokens (order_id, purpose)
  where revoked_at is null and used_at is null;

comment on table public.order_resume_tokens is
  'ORDER-RESUME-SECURE-TOKEN-001: hash-only resume credentials. Never store a raw token or customer PII here.';

alter table public.order_resume_tokens enable row level security;
-- No policies on purpose: RLS on + zero policies = deny-all for anon/authenticated.

revoke all on public.order_resume_tokens from public;
revoke all on public.order_resume_tokens from anon;
revoke all on public.order_resume_tokens from authenticated;

create or replace function public.order_is_resumable(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.paid_at is null
      and coalesce(o.status,'') not in ('completed','cancelled','refunded','archived')
      and o.refunded_at is null
  );
$$;

create or replace function public.issue_order_resume_token(
  p_order_id uuid, p_purpose text, p_token_hash text,
  p_environment text, p_ttl_minutes integer, p_created_by text default 'system'
) returns table (token_id uuid, expires_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
declare v_ttl integer := least(greatest(coalesce(p_ttl_minutes, 1440), 5), 4320);
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64 then raise exception 'invalid token digest'; end if;
  if p_purpose not in ('resume_checkout','resume_assessment') then raise exception 'invalid purpose'; end if;
  if p_environment not in ('test','live') then raise exception 'invalid environment'; end if;
  if not public.order_is_resumable(p_order_id) then raise exception 'order is not resumable'; end if;

  update public.order_resume_tokens
     set revoked_at = now(), revoked_reason = 'superseded_by_new_token'
   where order_id = p_order_id and purpose = p_purpose
     and revoked_at is null and used_at is null;

  return query
  insert into public.order_resume_tokens
    (order_id, purpose, token_hash, environment, expires_at, created_by)
  values
    (p_order_id, p_purpose, p_token_hash, p_environment,
     now() + make_interval(mins => v_ttl), coalesce(p_created_by,'system'))
  returning id, order_resume_tokens.expires_at;
end;
$$;

-- ATOMIC single-use consume: one UPDATE ... WHERE used_at IS NULL, so exactly
-- one concurrent caller can ever win the row.
create or replace function public.consume_order_resume_token(
  p_token_hash text, p_purpose text, p_environment text
) returns table (order_id uuid, purpose text)
language plpgsql volatile security definer set search_path = public as $$
begin
  return query
  update public.order_resume_tokens t
     set used_at = now(), last_used_at = now(), use_count = t.use_count + 1
   where t.token_hash = p_token_hash
     and t.purpose = p_purpose
     and t.environment = p_environment
     and t.used_at is null
     and t.revoked_at is null
     and t.expires_at > now()
     and public.order_is_resumable(t.order_id)
  returning t.order_id, t.purpose;
end;
$$;

create or replace function public.revoke_order_resume_tokens(
  p_order_id uuid, p_purpose text default null, p_reason text default 'manual_revocation'
) returns integer language plpgsql volatile security definer set search_path = public as $$
declare v_n integer;
begin
  update public.order_resume_tokens
     set revoked_at = now(), revoked_reason = coalesce(p_reason,'manual_revocation')
   where order_id = p_order_id
     and (p_purpose is null or purpose = p_purpose)
     and revoked_at is null and used_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Explicit, by name: revoking "from public" does NOT undo the default EXECUTE
-- grant PostgreSQL hands to every role.
revoke all on function public.order_is_resumable(uuid)                                     from public, anon, authenticated;
revoke all on function public.issue_order_resume_token(uuid,text,text,text,integer,text)   from public, anon, authenticated;
revoke all on function public.consume_order_resume_token(text,text,text)                   from public, anon, authenticated;
revoke all on function public.revoke_order_resume_tokens(uuid,text,text)                   from public, anon, authenticated;

grant execute on function public.order_is_resumable(uuid)                                   to service_role;
grant execute on function public.issue_order_resume_token(uuid,text,text,text,integer,text) to service_role;
grant execute on function public.consume_order_resume_token(text,text,text)                 to service_role;
grant execute on function public.revoke_order_resume_tokens(uuid,text,text)                 to service_role;
