-- LEAD-FOLLOWUP-SMS-RETRY-LOOP-AND-ADMIN-RESUME-EMAIL-001
--
-- INCIDENT (LIVE, 2026-08-04 18:15 -> 2026-08-05 17:15 ET):
--   669 recovery SMS, 642 failed, 19 customers looped. Worst case 94 attempts
--   to one customer. Every failure had the same cause:
--     "Twilio not configured or phone missing"
--   i.e. a PERMANENT configuration failure, retried every 15 minutes forever.
--
-- MECHANISM:
--   lead-followup-sequence claims a stage by stamping `sms_5min_sent_at`, sends,
--   and on failure RELEASES the claim back to NULL. The release exists for a good
--   reason — it prevents a false "sent" stamp when the provider never accepted
--   the message (an earlier incident left 7 false SMS stamps). But with no
--   attempt counter and no backoff, releasing turns a permanent failure into an
--   unbounded loop: the stage looks "never attempted" again on the next run.
--
-- FIX: keep the claim/release (transient failures must still be retryable) and
-- add durable per-(order, stage, channel) attempt state so eligibility is
-- bounded. The cron may keep running every 15 minutes — that is only how often
-- the scheduler LOOKS. It must never be the customer contact frequency.
--
-- Forward-only. Safe to re-run.

create table if not exists public.sms_sequence_attempts (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  stage               text not null,
  channel             text not null default 'sms',
  idempotency_key     text not null,
  attempt_count       integer not null default 0,
  first_attempted_at  timestamptz,
  last_attempted_at   timestamptz,
  delivered_at        timestamptz,
  failed_at           timestamptz,
  next_retry_at       timestamptz,
  terminal_failure    boolean not null default false,
  provider_status     text,
  provider_message_id text,
  failure_code        text,
  failure_reason      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint sms_sequence_attempts_channel_chk check (channel in ('sms','email'))
);

-- ONE durable row per (order, stage, channel). This is the idempotency anchor:
-- repeated cron runs and concurrent workers converge on the same row.
create unique index if not exists sms_sequence_attempts_key
  on public.sms_sequence_attempts (order_id, stage, channel);
create unique index if not exists sms_sequence_attempts_idem
  on public.sms_sequence_attempts (idempotency_key);
create index if not exists sms_sequence_attempts_retry_idx
  on public.sms_sequence_attempts (next_retry_at)
  where terminal_failure = false and delivered_at is null;

alter table public.sms_sequence_attempts enable row level security;
revoke all on table public.sms_sequence_attempts from public, anon, authenticated;

comment on table public.sms_sequence_attempts is
  'Durable per-(order,stage,channel) send-attempt state. Bounds retries so a permanently failing provider can never re-notify a customer every cron tick. LEAD-FOLLOWUP-SMS-RETRY-LOOP-001.';

-- ── retry policy ─────────────────────────────────────────────────────────────
--   attempt 1 -> +1 hour
--   attempt 2 -> +6 hours
--   attempt 3 -> terminal (max 2 retries after the original attempt)
-- Permanent failures skip retries entirely regardless of count.
create or replace function public.sms_attempt_is_eligible(
  p_order_id uuid, p_stage text, p_channel text default 'sms'
) returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.sms_sequence_attempts a
    where a.order_id = p_order_id and a.stage = p_stage and a.channel = p_channel
      and (
        a.delivered_at is not null            -- already delivered: never resend
        or a.terminal_failure                 -- permanent failure: never retry
        or (a.next_retry_at is not null and now() < a.next_retry_at)  -- backing off
      )
  );
$$;
revoke all on function public.sms_attempt_is_eligible(uuid, text, text) from public, anon, authenticated;
grant execute on function public.sms_attempt_is_eligible(uuid, text, text) to service_role;

-- Record the outcome of one attempt. Returns the new terminal state.
create or replace function public.sms_attempt_record(
  p_order_id uuid,
  p_stage text,
  p_channel text,
  p_delivered boolean,
  p_permanent boolean,
  p_provider_status text default null,
  p_provider_message_id text default null,
  p_failure_code text default null,
  p_failure_reason text default null,
  p_max_retries integer default 2
) returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_key   text := p_order_id::text || ':' || p_stage || ':' || p_channel;
  v_count integer;
  v_term  boolean;
  v_next  timestamptz;
begin
  insert into public.sms_sequence_attempts (order_id, stage, channel, idempotency_key)
  values (p_order_id, p_stage, p_channel, v_key)
  on conflict (order_id, stage, channel) do nothing;

  select attempt_count into v_count
    from public.sms_sequence_attempts
   where order_id = p_order_id and stage = p_stage and channel = p_channel
   for update;

  v_count := coalesce(v_count, 0) + 1;

  if p_delivered then
    v_term := false; v_next := null;
  elsif p_permanent then
    -- Config error, invalid destination, opt-out/DND: retrying cannot help.
    v_term := true;  v_next := null;
  elsif v_count > p_max_retries then
    v_term := true;  v_next := null;
  else
    v_term := false;
    v_next := now() + (case when v_count = 1 then interval '1 hour' else interval '6 hours' end);
  end if;

  update public.sms_sequence_attempts
     set attempt_count       = v_count,
         first_attempted_at  = coalesce(first_attempted_at, now()),
         last_attempted_at   = now(),
         delivered_at        = case when p_delivered then now() else delivered_at end,
         failed_at           = case when p_delivered then failed_at else now() end,
         next_retry_at       = v_next,
         terminal_failure    = v_term,
         provider_status     = coalesce(p_provider_status, provider_status),
         provider_message_id = coalesce(p_provider_message_id, provider_message_id),
         failure_code        = case when p_delivered then failure_code else p_failure_code end,
         failure_reason      = case when p_delivered then failure_reason else p_failure_reason end,
         updated_at          = now()
   where order_id = p_order_id and stage = p_stage and channel = p_channel;

  return v_term;
end;
$$;
revoke all on function public.sms_attempt_record(uuid, text, text, boolean, boolean, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.sms_attempt_record(uuid, text, text, boolean, boolean, text, text, text, text, integer)
  to service_role;

-- ── backfill: close out the incident ─────────────────────────────────────────
-- Every order caught in the loop gets a TERMINAL row for the stage that looped,
-- so re-enabling the cron cannot resume spamming them. This records history; it
-- does not send anything and does not alter any order.
insert into public.sms_sequence_attempts
  (order_id, stage, channel, idempotency_key, attempt_count,
   first_attempted_at, last_attempted_at, failed_at, terminal_failure,
   provider_status, failure_code, failure_reason)
select o.id, 'sms_5min', 'sms', o.id::text || ':sms_5min:sms',
       count(*), min(c.created_at), max(c.created_at), max(c.created_at), true,
       'failed', 'provider_not_configured',
       'Twilio not configured or phone missing (incident LEAD-FOLLOWUP-SMS-RETRY-LOOP-001)'
from public.communications c
join public.orders o on o.confirmation_id = c.confirmation_id
where lower(coalesce(c.type,'')) like '%sms%'
  and lower(coalesce(c.status,'')) like '%fail%'
  and c.created_at >= now() - interval '7 days'
group by o.id
on conflict (order_id, stage, channel) do nothing;
