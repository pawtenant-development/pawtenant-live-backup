-- UNIFIED-ADMIN-COMMAND-CENTER-UNKNOWN-SMS-CALLS-SEARCH-INLINE-SMS-GHL-SYNC-001
--
-- WHY THIS EXISTS (LIVE forensics, read-only, 2026-08-15)
-- -------------------------------------------------------
-- 1. The inbound SMS from +16202539921 is stored COMPLETE (176 chars). Admin
--    could not read it because the SMS/Calls table renders the body with a CSS
--    `truncate` class and the Command Center queue only surfaces rows that have
--    an `ai_support_conversations` record — which that SMS never got. The data
--    was never truncated; the UI simply had no way to show it.
--
-- 2. Every one of the 570 LIVE `call_inbound` rows stores `phone_from` in US
--    NATIONAL DISPLAY format — "(832) 726-0357" — because `ghl-call-inbound`
--    writes the GHL payload value verbatim. Any E.164-keyed lookup (GHL contact
--    match, conversation identity, admin search) misses them entirely. That is
--    why the (832) calls "appear in PawTenant but not correctly in GHL".
--
-- 3. `communications.twilio_sid` on INBOUND rows holds the GHL **contact** id,
--    not a per-event message/call id: 16 distinct inbound SMS on TEST share
--    `ghl:vdJZ4ZzqKMyY2JcfRNIg`. So inbound events have NO per-event provider
--    id, no idempotency key, and cannot be reconciled against GHL by id.
--    (`ghl-message-sync-webhook` already does this correctly for OUTBOUND —
--    messageId + dedupe_key. The inbound writers were never brought in line.)
--
-- WHAT THIS MIGRATION ADDS
-- ------------------------
--   * `pt_normalize_e164()` — one normalisation rule, byte-identical in intent
--     to `_shared/ghlSms.ts:normalizeE164`, so SQL and TypeScript agree.
--   * `communications.contact_e164` — a STORED GENERATED column holding the
--     OTHER PARTY's number. Generated, not trigger-maintained, so it can never
--     drift from `phone_from`/`phone_to`.
--   * GHL sync state columns + a bounded-retry contract.
--   * Two admin RPCs (search + thread) gated on `check_is_admin()` — the SAME
--     predicate the existing `communications` RLS policy uses. No RLS is
--     widened; no customer or provider gains any new visibility.
--
-- SAFETY: additive only. No existing column, row, index, policy or function is
-- altered or dropped. Re-runnable.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Canonical E.164 normalisation
-- ─────────────────────────────────────────────────────────────────────────────
-- Mirrors `_shared/ghlSms.ts:normalizeE164` exactly:
--   strip non-digits → 10 digits get a US "1" → accept 11..15 → else NULL.
-- IMMUTABLE is required because `contact_e164` below is a generated column.
create or replace function public.pt_normalize_e164(p_raw text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
           when length(d.digits) = 10               then '+1' || d.digits
           when length(d.digits) between 11 and 15  then '+'  || d.digits
           else null
         end
  from (select regexp_replace(coalesce(p_raw, ''), '[^0-9]', '', 'g') as digits) as d;
$$;

comment on function public.pt_normalize_e164(text) is
  'Canonical E.164 normaliser. Mirrors _shared/ghlSms.ts:normalizeE164. Returns NULL when the input is not a dialable 10-15 digit number. IMMUTABLE — communications.contact_e164 is generated from it.';

revoke all on function public.pt_normalize_e164(text) from public;
revoke all on function public.pt_normalize_e164(text) from anon;
revoke all on function public.pt_normalize_e164(text) from authenticated;
grant execute on function public.pt_normalize_e164(text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Conversation identity key
-- ─────────────────────────────────────────────────────────────────────────────
-- The OTHER party's number: who the conversation is WITH. For an inbound event
-- that is the sender; for an outbound event the recipient. Email/chat rows have
-- no phone and stay NULL — they join a thread through order_id instead.
--
-- GENERATED ... STORED (not a trigger) so a future writer that forgets to
-- normalise still lands in the right conversation. This is exactly the class of
-- bug that produced the 570 unreachable "(832) ..." call rows.
alter table public.communications
  add column if not exists contact_e164 text
  generated always as (
    public.pt_normalize_e164(
      case when direction = 'inbound' then phone_from else phone_to end
    )
  ) stored;

comment on column public.communications.contact_e164 is
  'Normalised E.164 of the OTHER party (inbound → phone_from, outbound → phone_to). THE conversation identity key for the Command Center. Generated; never write it directly.';

create index if not exists idx_communications_contact_e164_created
  on public.communications (contact_e164, created_at desc)
  where contact_e164 is not null;

-- Order-scoped thread lookup (emails/chat rows join a thread this way).
create index if not exists idx_communications_order_created
  on public.communications (order_id, created_at desc)
  where order_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. GHL synchronisation state
-- ─────────────────────────────────────────────────────────────────────────────
-- DIRECTION RULE (loop prevention, §8):
--   An event that ARRIVED FROM GHL, or that PawTenant sent THROUGH GHL, is
--   already present in GHL. Pushing it back would create the synchronisation
--   loop the task forbids. Those rows are `ghl_origin` and are never pushed.
--   Only events that GHL has never seen are eligible to sync.
alter table public.communications
  add column if not exists ghl_sync_state       text,
  add column if not exists ghl_sync_error_code  text,
  add column if not exists ghl_sync_attempts    integer not null default 0,
  add column if not exists ghl_sync_next_retry_at timestamptz,
  add column if not exists ghl_synced_at        timestamptz,
  add column if not exists ghl_conversation_id  text,
  -- Per-event provider id. DISTINCT from `twilio_sid`, which on inbound rows
  -- historically holds a CONTACT id and is therefore not unique per event.
  add column if not exists provider_event_id    text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'communications_ghl_sync_state_chk'
  ) then
    alter table public.communications
      add constraint communications_ghl_sync_state_chk
      check (ghl_sync_state is null or ghl_sync_state in
             ('ghl_origin', 'pending', 'synced', 'failed', 'not_applicable'));
  end if;
end $$;

comment on column public.communications.ghl_sync_state is
  'ghl_origin = arrived from / was sent through GHL; NEVER push back (loop prevention). pending/synced/failed = PawTenant-origin event being mirrored into GHL. not_applicable = channel GHL does not carry.';
comment on column public.communications.provider_event_id is
  'Per-EVENT provider id (GHL message id / call id). twilio_sid is NOT this: on inbound rows it holds a contact id shared by every event from that contact.';

-- Idempotency key for reconciliation and webhook replay. Partial-unique so the
-- historical rows that have no per-event id are unaffected.
create unique index if not exists uq_communications_provider_event_id
  on public.communications (provider_event_id)
  where provider_event_id is not null;

create index if not exists idx_communications_ghl_sync_pending
  on public.communications (ghl_sync_next_retry_at)
  where ghl_sync_state in ('pending', 'failed');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Classify EXISTING rows (evidence-preserving, no deletes)
-- ─────────────────────────────────────────────────────────────────────────────
-- Rows already carrying a `ghl:` provider reference, or sent by the GHL-backed
-- sender, demonstrably transited GHL. Everything else on a GHL-carried channel
-- is left NULL for the reconciler to classify explicitly rather than guessed at
-- here.
-- ORIGIN CLASSIFICATION. A "ghl:" twilio_sid prefix means only "an identifier a
-- GHL webhook handed us". It is NOT evidence that GHL holds the event.
--
-- Proven by a read-only reconciliation against the live GHL Conversations API
-- (2026-08-15): conversation L8TogKM7D3n9NrqUGnDi for +16202539921 contains
-- exactly three messages, ALL OUTBOUND, all matching PawTenant rows by provider
-- id. The customer's INBOUND SMS is absent from GHL entirely — it arrived at
-- 20:00:43Z when GHL had no contact for that number (created 20:11:41Z by a
-- later outbound call), so the automation webhook fired but nothing was filed in
-- the inbox.
--
-- So only OUTBOUND traffic PawTenant deliberately sent THROUGH GHL is provably
-- present there and may be excluded from reconciliation.
update public.communications
   set ghl_sync_state = 'ghl_origin'
 where ghl_sync_state is null
   and direction = 'outbound'
   and (dedupe_key like 'ghl-out:%' or dedupe_key like 'ghl-call:%' or sent_by = 'GHL');

-- Inbound presence in GHL is UNKNOWN until reconciled by provider event id.
-- Marking these `ghl_origin` would permanently exclude exactly the events that
-- are missing from GHL — the ones this task exists to find.
update public.communications
   set ghl_sync_state = 'pending'
 where ghl_sync_state is null
   and direction = 'inbound'
   and type in ('sms_inbound', 'call_inbound');

update public.communications
   set ghl_sync_state = 'not_applicable'
 where ghl_sync_state is null
   and type = 'email';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Admin conversation search
-- ─────────────────────────────────────────────────────────────────────────────
-- AUTHORIZATION: SECURITY DEFINER, but the first statement is the SAME
-- predicate as the existing `communications` RLS policy
-- (doctor_profiles.is_admin = true, via check_is_admin()). A non-admin gets an
-- exception, not rows. This grants no access the RLS policy did not already.
--
-- IDENTITY RESOLUTION (§7) — fails safe, in strict priority order:
--   1. an explicit authoritative order link on a communications row
--   2. a UNIQUE complete-E.164 match against orders.phone
--   3. otherwise Unknown — and a phone that maps to MORE THAN ONE customer is
--      reported as `ambiguous`, never silently attached to a guess.
-- A PARTIAL phone may FIND a conversation; it may never IDENTIFY one.
create or replace function public.admin_search_conversations(
  p_query text,
  p_limit integer default 25
)
returns table (
  contact_e164    text,
  display_name    text,
  email           text,
  order_id        uuid,
  confirmation_id text,
  match_kind      text,
  identity_state  text,
  candidate_count integer,
  last_at         timestamptz,
  last_channel    text,
  last_preview    text,
  message_count   bigint
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_q       text := btrim(coalesce(p_query, ''));
  v_digits  text := regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g');
  v_e164    text := public.pt_normalize_e164(p_query);
  v_like    text;
  v_limit   integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  if not public.check_is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Below two characters every query is a table scan that returns the whole
  -- inbox. Callers debounce; this is the server-side floor.
  if length(v_q) < 2 then
    return;
  end if;

  v_like := '%' || replace(replace(v_q, '%', '\%'), '_', '\_') || '%';

  return query
  with
  -- Conversations that actually have messages, keyed by normalised phone.
  --
  -- NOTE the column aliases `ce`, `mk`, `c_last_at`. In a plpgsql function
  -- EVERY RETURNS TABLE column is also an in-scope VARIABLE, so a CTE column
  -- named `match_kind` or `last_at` makes any UNQUALIFIED reference ambiguous
  -- and the function raises at runtime. That shipped once: the query body was
  -- validated standalone (no OUT parameters, so unambiguous) and the RPC itself
  -- was only exercised by the authorization negative control, which raises
  -- 42501 before reaching the query. Clicking search in a real browser was what
  -- surfaced `column reference "match_kind" is ambiguous`.
  convo as (
    select c.contact_e164 as ce,
           max(c.created_at) as c_last_at,
           count(*)          as n,
           -- Authoritative link: any row on this thread that a writer
           -- explicitly attached to an order.
           (array_agg(c.order_id order by c.created_at desc)
              filter (where c.order_id is not null))[1]        as linked_order,
           (array_agg(c.confirmation_id order by c.created_at desc)
              filter (where c.confirmation_id is not null))[1] as linked_conf
      from public.communications c
     where c.contact_e164 is not null
     group by c.contact_e164
  ),
  convo_last as (
    select distinct on (c.contact_e164)
           c.contact_e164 as ce, c.type as last_type, c.body as last_body
      from public.communications c
     where c.contact_e164 is not null
     order by c.contact_e164, c.created_at desc
  ),
  -- Customers reachable at a given normalised phone. DISTINCT PERSON, not
  -- distinct order: four orders from one email is one customer, not ambiguity.
  ident as (
    select public.pt_normalize_e164(o.phone) as ce,
           count(distinct lower(o.email))    as people,
           (array_agg(o.id order by o.created_at desc))[1]              as any_order,
           (array_agg(o.confirmation_id order by o.created_at desc))[1] as any_conf,
           (array_agg(btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''))
                      order by o.created_at desc))[1]                   as any_name,
           (array_agg(o.email order by o.created_at desc))[1]           as any_email
      from public.orders o
     where o.phone is not null
       and public.pt_normalize_e164(o.phone) is not null
     group by 1
  ),
  -- Match sources. A partial phone matches by suffix on the NORMALISED key, so
  -- "2539921", "(620) 253-9921" and "+16202539921" all land on one conversation.
  hits as (
    select cv.ce,
           case
             when v_e164 is not null and cv.ce = v_e164                 then 'phone'
             when length(v_digits) >= 4 and cv.ce like '%' || v_digits   then 'phone'
             when v_q ilike 'PT-%' and (cv.linked_conf ilike v_like)     then 'order'
             when id.any_email ilike v_like                             then 'email'
             when id.any_name  ilike v_like                             then 'name'
             when cv.linked_conf ilike v_like                           then 'order'
             else null
           end as mk,
           cv.c_last_at, cv.n, cv.linked_order, cv.linked_conf,
           id.people, id.any_order, id.any_conf, id.any_name, id.any_email
      from convo cv
      left join ident id on id.ce = cv.ce
  ),
  -- Customers with an order but no messages yet: still selectable, so an admin
  -- can open the (empty) thread and reply. "Do not require an order" cuts both
  -- ways — do not require a MESSAGE either.
  order_only as (
    select id.ce,
           case
             when v_e164 is not null and id.ce = v_e164                 then 'phone'
             when length(v_digits) >= 4 and id.ce like '%' || v_digits   then 'phone'
             when id.any_conf  ilike v_like                             then 'order'
             when id.any_email ilike v_like                             then 'email'
             when id.any_name  ilike v_like                             then 'name'
             else null
           end as mk,
           null::timestamptz as c_last_at, 0::bigint as n,
           null::uuid as linked_order, null::text as linked_conf,
           id.people, id.any_order, id.any_conf, id.any_name, id.any_email
      from ident id
     where not exists (select 1 from convo cv where cv.ce = id.ce)
  ),
  merged as (
    select * from hits       where hits.mk is not null
    union all
    select * from order_only where order_only.mk is not null
  ),
  -- PRIORITY. Found by fixture probe, not by review: an earlier ordering let a
  -- row-level `communications.order_id` promote a thread to `linked` even when
  -- the phone demonstrably belongs to SEVERAL customers — TEST +18323309603 is
  -- used by 4 distinct customers and was attaching "Ada Tester" to all 39
  -- messages. That row-level link is NOT evidence of thread identity: it is
  -- written by `ghl-call-inbound`, which did
  --     .ilike("phone", "%" + last10).limit(1)
  -- and therefore PICKED THE FIRST of several matching orders. Promoting on
  -- that basis is exactly the guessed customer §7 forbids.
  --
  --   people > 1                     -> ambiguous  (ALWAYS; nothing outranks it)
  --   people = 1                     -> linked
  --   people = 0 + explicit row link -> linked     (authoritative, no rival)
  --   otherwise                      -> unknown
  resolved as (
    select m.*,
           case
             when coalesce(m.people, 0) > 1  then 'ambiguous'
             when m.people = 1               then 'linked'
             when m.linked_order is not null then 'linked'
             else 'unknown'
           end as istate
      from merged m
  )
  select
    r.ce,
    -- An ambiguous thread NEVER shows a customer name: the number belongs to
    -- several people and picking one is a guess presented as a fact.
    case when r.istate = 'linked' then nullif(btrim(coalesce(r.any_name, '')), '') end,
    case when r.istate = 'linked' then r.any_email end,
    case when r.istate = 'linked' then coalesce(r.linked_order, r.any_order) end,
    case when r.istate = 'linked' then coalesce(r.linked_conf,  r.any_conf)  end,
    r.mk,
    r.istate,
    coalesce(r.people, 0)::integer,
    r.c_last_at,
    cl.last_type,
    -- PREVIEW ONLY. The full body is served by admin_conversation_thread; this
    -- is the list-row summary and is deliberately short.
    left(regexp_replace(coalesce(cl.last_body, ''), '\s+', ' ', 'g'), 140),
    r.n
  from resolved r
  left join convo_last cl on cl.ce = r.ce
  order by r.c_last_at desc nulls last, r.ce
  limit v_limit;
end;
$$;

comment on function public.admin_search_conversations(text, integer) is
  'Command Center conversation search. Admin-only (check_is_admin). Finds by name, email, complete-or-partial phone and confirmation id. A partial phone may FIND a conversation but never IDENTIFY one. AMBIGUITY OUTRANKS EVERYTHING: a phone used by >1 customer returns identity_state=ambiguous with NO name, email or order attached, even if some row carries an order_id written by an automated first-match guess.';

revoke all on function public.admin_search_conversations(text, integer) from public;
revoke all on function public.admin_search_conversations(text, integer) from anon;
revoke all on function public.admin_search_conversations(text, integer) from authenticated;
grant execute on function public.admin_search_conversations(text, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Unified conversation thread
-- ─────────────────────────────────────────────────────────────────────────────
-- ONE chronological thread for a person: every SMS, call and email that belongs
-- either to the normalised phone or to the linked order. Bodies are returned in
-- FULL — the truncation that hid the +16202539921 message was presentational,
-- and this endpoint is what makes the complete text reachable.
--
-- Keyset pagination on (created_at, id) so a long history loads progressively
-- without the offset drift that duplicates rows when new messages arrive.
create or replace function public.admin_conversation_thread(
  p_contact_e164 text default null,
  p_order_id     uuid default null,
  p_limit        integer default 50,
  p_before_at    timestamptz default null,
  p_before_id    uuid default null
)
returns table (
  id                uuid,
  type              text,
  direction         text,
  body              text,
  subject           text,
  phone_from        text,
  phone_to          text,
  contact_e164      text,
  email_from        text,
  email_to          text,
  duration_seconds  integer,
  status            text,
  sent_by           text,
  recording_url     text,
  twilio_sid        text,
  provider_event_id text,
  ghl_sync_state    text,
  ghl_sync_error_code text,
  ghl_sync_attempts integer,
  order_id          uuid,
  confirmation_id   text,
  failure_code      text,
  failure_reason    text,
  created_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_e164  text := public.pt_normalize_e164(p_contact_e164);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if not public.check_is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- An un-normalisable phone with no order is not a thread. Returning the whole
  -- table for a malformed key is exactly the leak this guard prevents.
  if v_e164 is null and p_order_id is null then
    return;
  end if;

  return query
  select c.id, c.type, c.direction, c.body, c.subject,
         c.phone_from, c.phone_to, c.contact_e164,
         c.email_from, c.email_to,
         c.duration_seconds, c.status, c.sent_by, c.recording_url,
         c.twilio_sid, c.provider_event_id,
         c.ghl_sync_state, c.ghl_sync_error_code, c.ghl_sync_attempts,
         c.order_id, c.confirmation_id,
         c.failure_code, c.failure_reason,
         c.created_at
    from public.communications c
   -- NOTE the outer parentheses. AND binds tighter than OR: without them the
   -- keyset filter would apply only to the order branch and the phone branch
   -- would re-serve page 1 forever.
   where (
           (v_e164 is not null and c.contact_e164 = v_e164)
           or (p_order_id is not null and c.order_id = p_order_id)
         )
     and (
       p_before_at is null
       or (c.created_at, c.id) < (p_before_at, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))
     )
   order by c.created_at desc, c.id desc
   limit v_limit;
end;
$$;

comment on function public.admin_conversation_thread(text, uuid, integer, timestamptz, uuid) is
  'One chronological unified thread (SMS + calls + email) for a normalised phone and/or a linked order. Admin-only. Returns COMPLETE bodies — the SMS/Calls table preview is presentational only.';

revoke all on function public.admin_conversation_thread(text, uuid, integer, timestamptz, uuid) from public;
revoke all on function public.admin_conversation_thread(text, uuid, integer, timestamptz, uuid) from anon;
revoke all on function public.admin_conversation_thread(text, uuid, integer, timestamptz, uuid) from authenticated;
grant execute on function public.admin_conversation_thread(text, uuid, integer, timestamptz, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Later linking of an unknown conversation
-- ─────────────────────────────────────────────────────────────────────────────
-- When an unknown number turns out to be a customer, its history must join the
-- order WITHOUT duplication and WITHOUT deletion. This only ever FILLS a NULL
-- link — an event already attached to a different order is left untouched, so a
-- mis-click can never re-parent somebody else's history.
create or replace function public.admin_link_conversation_to_order(
  p_contact_e164 text,
  p_order_id     uuid
)
returns integer
language plpgsql
volatile
security definer
set search_path = 'public'
as $$
declare
  v_e164       text := public.pt_normalize_e164(p_contact_e164);
  v_conf       text;
  v_updated    integer := 0;
  v_actor_name text;
  v_actor_role text;
begin
  if not public.check_is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_e164 is null or p_order_id is null then
    raise exception 'contact_e164 and order_id are both required' using errcode = '22023';
  end if;

  select o.confirmation_id into v_conf from public.orders o where o.id = p_order_id;
  if v_conf is null then
    raise exception 'order_not_found' using errcode = '22023';
  end if;

  update public.communications c
     set order_id        = p_order_id,
         confirmation_id = coalesce(c.confirmation_id, v_conf)
   where c.contact_e164 = v_e164
     and c.order_id is null;          -- fill NULLs only; never re-parent
  get diagnostics v_updated = row_count;

  select coalesce(dp.full_name, dp.email, 'Admin'), coalesce(dp.role, 'admin')
    into v_actor_name, v_actor_role
    from public.doctor_profiles dp
   where dp.user_id = auth.uid()
   limit 1;

  insert into public.audit_logs (
    actor_id, actor_name, actor_role, actor_type, category, source,
    object_type, object_id, order_id, entity_type,
    action, description, metadata
  ) values (
    auth.uid(), coalesce(v_actor_name, 'Admin'), coalesce(v_actor_role, 'admin'), 'human',
    'communications', 'admin_portal',
    'order', v_conf, p_order_id, 'communication',
    'conversation_linked_to_order',
    format('Linked %s prior communication(s) from an unknown number to %s.', v_updated, v_conf),
    -- Masked identity only. No message bodies, no PHI (§10).
    jsonb_build_object(
      'contact_masked', '***' || right(v_e164, 4),
      'rows_linked', v_updated,
      'confirmation_id', v_conf
    )
  );

  return v_updated;
end;
$$;

comment on function public.admin_link_conversation_to_order(text, uuid) is
  'Attach an unknown-number history to an order. Fills NULL links only — never re-parents an event already attached elsewhere. Audited with a MASKED number and no message content.';

revoke all on function public.admin_link_conversation_to_order(text, uuid) from public;
revoke all on function public.admin_link_conversation_to_order(text, uuid) from anon;
revoke all on function public.admin_link_conversation_to_order(text, uuid) from authenticated;
grant execute on function public.admin_link_conversation_to_order(text, uuid) to authenticated;
