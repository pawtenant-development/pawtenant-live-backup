-- AI-SUPPORT-LIVE-FOUNDATION-001 — LIVE AI-support foundation (draft-only chat).
-- Ports the TEST-verified AI-support data model to LIVE. Idempotent +
-- non-destructive (creates only; never drops/overwrites data). Draft-only by
-- design: customer-facing automation is OFF; admins-only RLS; nothing here can
-- send a customer-visible message.
--
-- Admin gates already exist in LIVE with identical semantics to TEST:
--   is_admin_staff()  = doctor_profiles is_admin + is_active
--   is_chat_admin()   = + role in (owner, admin_manager)

-- ── 0. Usage/budget metering (service-role only) ─────────────────────────────
create table if not exists public.ai_usage_log (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  feature         text not null default 'sms_reply',
  channel         text not null default 'sms',
  model           text,
  source          text,
  status          text not null default 'blocked',
  blocked_reason  text,
  intent          text,
  order_id        text,
  confirmation_id text,
  admin_user_id   uuid,
  inbound_len     integer not null default 0,
  inbound_sha256  text,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  est_cost_usd    numeric(12,6) not null default 0
);
create index if not exists ai_usage_log_created_at_idx on public.ai_usage_log (created_at);
alter table public.ai_usage_log enable row level security;
revoke all on public.ai_usage_log from anon, authenticated;

-- ── 1. Settings (key/value, DB-driven) ───────────────────────────────────────
create table if not exists public.ai_support_settings (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ── 2. Conversations ─────────────────────────────────────────────────────────
create table if not exists public.ai_support_conversations (
  id                 uuid primary key default gen_random_uuid(),
  channel            text not null check (channel in ('sms','voice','email','chat')),
  customer_phone     text,
  customer_email     text,
  customer_name      text,
  order_id           text,
  user_id            uuid,
  status             text not null default 'open'
                     check (status in ('open','escalated','human_replied','closed')),
  ai_enabled         boolean not null default true,
  ai_mode            text not null default 'draft_only'
                     check (ai_mode in ('draft_only','auto_send_safe','paused','human_only','disabled')),
  ai_paused_at       timestamptz,
  ai_paused_by       uuid,
  ai_paused_reason   text,
  human_owner_id     uuid,
  last_inbound_at    timestamptz,
  last_ai_reply_at   timestamptz,
  last_human_reply_at timestamptz,
  external_session_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_ai_support_conversations_phone
  on public.ai_support_conversations (customer_phone);
create index if not exists idx_ai_support_conversations_order
  on public.ai_support_conversations (order_id);
create index if not exists idx_ai_support_conversations_status
  on public.ai_support_conversations (status, ai_enabled);
create index if not exists idx_ai_support_conversations_last_inbound
  on public.ai_support_conversations (last_inbound_at desc);
create index if not exists idx_ai_support_conversations_ext_session
  on public.ai_support_conversations (external_session_id)
  where external_session_id is not null;
comment on column public.ai_support_conversations.external_session_id is
  'Channel-specific external key: chat_sessions.id for channel=chat. NULL for SMS/voice.';

-- ── 3. Messages ──────────────────────────────────────────────────────────────
create table if not exists public.ai_support_messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.ai_support_conversations(id) on delete cascade,
  direction           text not null check (direction in ('inbound','outbound','internal')),
  channel             text not null check (channel in ('sms','voice','email','chat')),
  body                text not null,
  provider_message_id text,
  provider_call_id    text,
  from_phone          text,
  to_phone            text,
  from_email          text,
  to_email            text,
  source              text not null default 'customer'
                      check (source in ('customer','ai','human','system','guardrail')),
  sent_by             uuid,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  metadata            jsonb not null default '{}'::jsonb
);
create index if not exists idx_ai_support_messages_conversation
  on public.ai_support_messages (conversation_id, created_at);

-- ── 4. AI decision events (audit trail) ──────────────────────────────────────
create table if not exists public.ai_support_ai_events (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references public.ai_support_conversations(id) on delete cascade,
  message_id        uuid references public.ai_support_messages(id) on delete set null,
  intent            text,
  risk_level        text not null default 'low'
                    check (risk_level in ('low','medium','high','blocked')),
  action            text not null
                    check (action in ('auto_sent','drafted','escalated','blocked','skipped','error',
                                      'paused','resumed','human_takeover','closed')),
  confidence        numeric,
  guardrail_code    text,
  model             text,
  prompt_tokens     integer,
  completion_tokens integer,
  cost_usd          numeric,
  reply_body        text,
  error             text,
  actor_user_id     uuid,
  created_at        timestamptz not null default now(),
  metadata          jsonb not null default '{}'::jsonb
);
create index if not exists idx_ai_support_ai_events_conversation
  on public.ai_support_ai_events (conversation_id, created_at);
create index if not exists idx_ai_support_ai_events_action
  on public.ai_support_ai_events (action, created_at desc);

-- ── 5. Notifications (admin-facing) ──────────────────────────────────────────
create table if not exists public.ai_support_notifications (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_support_conversations(id) on delete cascade,
  type            text not null,
  recipient       text,
  channel         text,
  status          text not null default 'pending'
                  check (status in ('pending','sent','read','error','skipped')),
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  read_at         timestamptz,
  read_by         uuid,
  error           text
);
create index if not exists idx_ai_support_notifications_status
  on public.ai_support_notifications (status, created_at desc);
create index if not exists idx_ai_support_notifications_conversation
  on public.ai_support_notifications (conversation_id);

-- ── updated_at touch trigger ─────────────────────────────────────────────────
create or replace function public.ai_support_touch_updated_at()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_ai_support_conversations_touch on public.ai_support_conversations;
create trigger trg_ai_support_conversations_touch
  before update on public.ai_support_conversations
  for each row execute function public.ai_support_touch_updated_at();
drop trigger if exists trg_ai_support_settings_touch on public.ai_support_settings;
create trigger trg_ai_support_settings_touch
  before update on public.ai_support_settings
  for each row execute function public.ai_support_touch_updated_at();

-- ── RLS (admins only; customers/visitors/anon cannot read) ───────────────────
alter table public.ai_support_settings      enable row level security;
alter table public.ai_support_conversations enable row level security;
alter table public.ai_support_messages      enable row level security;
alter table public.ai_support_ai_events     enable row level security;
alter table public.ai_support_notifications enable row level security;

drop policy if exists ai_support_settings_read on public.ai_support_settings;
create policy ai_support_settings_read on public.ai_support_settings
  for select using (public.is_admin_staff());
drop policy if exists ai_support_settings_write on public.ai_support_settings;
create policy ai_support_settings_write on public.ai_support_settings
  for all using (public.is_chat_admin()) with check (public.is_chat_admin());

drop policy if exists ai_support_conversations_admin on public.ai_support_conversations;
create policy ai_support_conversations_admin on public.ai_support_conversations
  for all using (public.is_admin_staff()) with check (public.is_admin_staff());
drop policy if exists ai_support_messages_admin on public.ai_support_messages;
create policy ai_support_messages_admin on public.ai_support_messages
  for all using (public.is_admin_staff()) with check (public.is_admin_staff());
drop policy if exists ai_support_ai_events_admin on public.ai_support_ai_events;
create policy ai_support_ai_events_admin on public.ai_support_ai_events
  for all using (public.is_admin_staff()) with check (public.is_admin_staff());
drop policy if exists ai_support_notifications_admin on public.ai_support_notifications;
create policy ai_support_notifications_admin on public.ai_support_notifications
  for all using (public.is_admin_staff()) with check (public.is_admin_staff());

-- ── Pause / resume RPCs (audited human takeover) ─────────────────────────────
create or replace function public.ai_support_pause_conversation(
  p_conversation_id uuid, p_reason text default null, p_take_over boolean default false
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin_staff() then raise exception 'Admin access required'; end if;
  update public.ai_support_conversations
     set ai_mode          = case when p_take_over then 'human_only' else 'paused' end,
         ai_enabled       = false,
         ai_paused_at     = now(),
         ai_paused_by     = auth.uid(),
         ai_paused_reason = coalesce(p_reason, case when p_take_over then 'human_takeover' else 'paused_by_admin' end),
         human_owner_id   = case when p_take_over then auth.uid() else human_owner_id end
   where id = p_conversation_id;
  insert into public.ai_support_ai_events (conversation_id, action, actor_user_id, metadata)
  values (p_conversation_id, case when p_take_over then 'human_takeover' else 'paused' end,
          auth.uid(), jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.ai_support_resume_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin_staff() then raise exception 'Admin access required'; end if;
  update public.ai_support_conversations
     set ai_mode='draft_only', ai_enabled=true, ai_paused_at=null, ai_paused_by=null, ai_paused_reason=null
   where id = p_conversation_id;
  insert into public.ai_support_ai_events (conversation_id, action, actor_user_id)
  values (p_conversation_id, 'resumed', auth.uid());
end;
$$;

-- ── Realtime (admin browser notifications only) ──────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='ai_support_notifications'
  ) then
    alter publication supabase_realtime add table public.ai_support_notifications;
  end if;
end $$;

-- ── Seed safe defaults — DRAFT-ONLY, everything customer-facing OFF ───────────
-- on conflict do nothing → never overwrites an existing value.
insert into public.ai_support_settings (key, value) values
  ('ai_global_kill_switch',                        'false'::jsonb),
  ('ai_sms_enabled',                               'true'::jsonb),
  ('ai_sms_auto_send_enabled',                     'false'::jsonb),
  ('ai_sms_default_mode',                          '"draft_only"'::jsonb),
  ('ai_call_enabled',                              'false'::jsonb),
  ('ai_missed_call_sms_enabled',                   'false'::jsonb),
  ('ai_business_hours_mode',                       '"always"'::jsonb),
  ('ai_max_auto_replies_per_conversation_per_day', '3'::jsonb),
  ('ai_confidence_threshold',                      '0.78'::jsonb),
  -- Chat: DRAFT-only rollout mode (LIVE-safe). Never auto-post to a visitor.
  ('ai_chat_reply_mode',                           '"draft"'::jsonb),
  ('ai_chat_auto_reply_enabled',                   'false'::jsonb),
  ('ai_chat_auto_reply_test_sessions',             '[]'::jsonb),
  ('ai_chat_auto_reply_blacklisted_sessions',      '[]'::jsonb),
  ('ai_chat_auto_reply_cooldown_seconds',          '120'::jsonb),
  ('ai_chat_max_auto_replies_per_session_per_day', '3'::jsonb),
  -- SMS master toggle exists but auto-send stays off (above).
  ('ai_sms_auto_reply_enabled',                    'true'::jsonb),
  -- Nataisa protection parity (SMS-LIVE-INCIDENT-001): never AI-reply.
  ('ai_sms_auto_reply_blacklisted_numbers',        '["+17138780013"]'::jsonb),
  ('ai_category_modes', '{
    "order_status":          "auto_send_safe",
    "letter_timing":         "auto_send_safe",
    "landlord_verification": "auto_send_safe",
    "upload_documents":      "auto_send_safe",
    "pricing":               "auto_send_safe",
    "eligibility_general":   "draft_only",
    "psd_general":           "draft_only",
    "technical_issue":       "draft_only",
    "provider_review":       "draft_only",
    "refund":                "draft_only",
    "complaint":             "escalate",
    "legal_eviction":        "escalate",
    "medical_crisis":        "block",
    "fraud":                 "block",
    "unknown":               "draft_only"
  }'::jsonb)
on conflict (key) do nothing;
