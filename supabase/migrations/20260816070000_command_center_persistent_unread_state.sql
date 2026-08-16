-- COMMAND-CENTER-PERSISTENT-UNREAD-001
--
-- The Command Center queue had no read/unread concept at all outside live chat,
-- and chat's own model (chat_sessions.unread_count / last_viewed_at) is a pair
-- of GLOBAL columns on the session row — one admin opening a chat clears it for
-- every other admin. That is fine for the notifier (which is a "something just
-- happened" siren) but wrong for a per-operator work queue.
--
-- This adds a PER-ADMIN, server-side read model covering all five queue
-- channels, plus one RPC that returns server-authoritative LAST INBOUND
-- activity per conversation so ordering and counts never depend on whatever the
-- browser happens to have merged.
--
-- Deliberately NOT touched: chat_sessions.unread_count, last_viewed_at, the
-- chat notifier, and the Chats tab. Those keep their existing global behaviour.
-- Nothing here widens RLS on any existing table; the only new grants are on the
-- new table and the two new functions.
--
-- Idempotent and non-destructive.

-- ── Read state ───────────────────────────────────────────────────────────────

create table if not exists public.admin_conversation_reads (
  admin_user_id     uuid        not null references auth.users(id) on delete cascade,
  -- Matches the Command Center CommRow.key vocabulary exactly:
  --   chat:<chat_sessions.id> | sms:<ai_support_conversations.id>
  --   call:<communications.id> | email:<contact_submissions.id>
  --   order:<orders.id>
  conversation_key  text        not null,
  last_read_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (admin_user_id, conversation_key),
  constraint admin_conversation_reads_key_shape
    check (conversation_key ~ '^(chat|sms|call|email|order):[A-Za-z0-9_-]{1,128}$')
);

comment on table public.admin_conversation_reads is
  'COMMAND-CENTER-PERSISTENT-UNREAD-001 — per-admin read watermark for the Communications Command Center queue. A conversation is unread when its last INBOUND activity is newer than this admin''s last_read_at. Never written by outbound sends.';

create index if not exists admin_conversation_reads_admin_idx
  on public.admin_conversation_reads (admin_user_id, last_read_at desc);

alter table public.admin_conversation_reads enable row level security;

-- An admin sees and writes ONLY their own watermarks. check_is_admin() is the
-- same predicate the existing Command Center RPCs and communications RLS use —
-- no new authorization surface is introduced.
drop policy if exists admin_conversation_reads_select_own on public.admin_conversation_reads;
create policy admin_conversation_reads_select_own
  on public.admin_conversation_reads for select
  using (admin_user_id = auth.uid() and public.check_is_admin());

drop policy if exists admin_conversation_reads_insert_own on public.admin_conversation_reads;
create policy admin_conversation_reads_insert_own
  on public.admin_conversation_reads for insert
  with check (admin_user_id = auth.uid() and public.check_is_admin());

drop policy if exists admin_conversation_reads_update_own on public.admin_conversation_reads;
create policy admin_conversation_reads_update_own
  on public.admin_conversation_reads for update
  using (admin_user_id = auth.uid() and public.check_is_admin())
  with check (admin_user_id = auth.uid() and public.check_is_admin());

-- "from public" does NOT undo the implicit grant — revoke each role by name.
revoke all on public.admin_conversation_reads from public;
revoke all on public.admin_conversation_reads from anon;
revoke all on public.admin_conversation_reads from authenticated;
grant select, insert, update on public.admin_conversation_reads to authenticated;
grant all on public.admin_conversation_reads to service_role;

-- ── Server-authoritative queue state ─────────────────────────────────────────

create or replace function public.admin_conversation_queue_state(p_limit integer default 400)
returns table (
  conversation_key text,
  last_inbound_at  timestamptz,
  last_read_at     timestamptz,
  is_unread        boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 400), 1), 1000);
  v_uid   uuid    := auth.uid();
begin
  if not public.check_is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Every arm yields INBOUND activity only. An outbound SMS, an agent chat
  -- reply or a system notification changes nothing here, so replying can never
  -- make a thread unread again. (CTE columns are aliased because a plpgsql
  -- RETURNS TABLE column is ALSO an in-scope variable — an unqualified
  -- reference to `last_inbound_at` below would be ambiguous at RUNTIME.)
  return query
  with inbound as (
    -- Live chat: visitor messages only. chat_sessions.last_message_at would
    -- include agent replies, which is exactly the bug we are avoiding.
    select ('chat:' || c.session_id::text) as k, max(c.created_at) as at
      from public.chats c
     where c.sender = 'visitor' and c.session_id is not null
     group by c.session_id

    union all
    -- AI SMS conversations already track an inbound-only watermark.
    select ('sms:' || a.id::text), a.last_inbound_at
      from public.ai_support_conversations a
     where a.channel = 'sms' and a.last_inbound_at is not null

    union all
    -- Inbound calls are inbound by construction.
    select ('call:' || m.id::text), m.created_at
      from public.communications m
     where m.type = 'call_inbound'

    union all
    -- Contact-form email awaiting triage.
    select ('email:' || s.id::text), s.created_at
      from public.contact_submissions s
     where s.status = 'new'

    union all
    -- A new paid order is a work item, not a message; paid_at is its arrival.
    select ('order:' || o.id::text), o.paid_at
      from public.orders o
     where o.paid_at is not null
  ),
  ranked as (
    select i.k as rk, max(i.at) as r_at
      from inbound i
     where i.at is not null
     group by i.k
     order by max(i.at) desc
     limit v_limit
  )
  select r.rk,
         r.r_at,
         acr.last_read_at,
         (acr.last_read_at is null or r.r_at > acr.last_read_at) as unread
    from ranked r
    left join public.admin_conversation_reads acr
      on acr.conversation_key = r.rk
     and acr.admin_user_id = v_uid;
end;
$function$;

revoke all on function public.admin_conversation_queue_state(integer) from public;
revoke all on function public.admin_conversation_queue_state(integer) from anon;
revoke all on function public.admin_conversation_queue_state(integer) from authenticated;
grant execute on function public.admin_conversation_queue_state(integer) to authenticated;
grant execute on function public.admin_conversation_queue_state(integer) to service_role;

-- ── Marking read ─────────────────────────────────────────────────────────────

create or replace function public.admin_mark_conversation_read(
  p_conversation_key text,
  p_read_at          timestamptz default now()
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid        := auth.uid();
  v_at  timestamptz := least(coalesce(p_read_at, now()), now());
  v_out timestamptz;
begin
  if not public.check_is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_conversation_key !~ '^(chat|sms|call|email|order):[A-Za-z0-9_-]{1,128}$' then
    raise exception 'invalid_conversation_key' using errcode = '22023';
  end if;

  -- The watermark only ever moves FORWARD. A stale in-flight request from an
  -- older render can therefore never re-hide a message that arrived since.
  insert into public.admin_conversation_reads (admin_user_id, conversation_key, last_read_at, updated_at)
  values (v_uid, p_conversation_key, v_at, now())
  on conflict (admin_user_id, conversation_key) do update
    set last_read_at = greatest(public.admin_conversation_reads.last_read_at, excluded.last_read_at),
        updated_at   = now()
  returning last_read_at into v_out;

  return v_out;
end;
$function$;

revoke all on function public.admin_mark_conversation_read(text, timestamptz) from public;
revoke all on function public.admin_mark_conversation_read(text, timestamptz) from anon;
revoke all on function public.admin_mark_conversation_read(text, timestamptz) from authenticated;
grant execute on function public.admin_mark_conversation_read(text, timestamptz) to authenticated;
grant execute on function public.admin_mark_conversation_read(text, timestamptz) to service_role;
