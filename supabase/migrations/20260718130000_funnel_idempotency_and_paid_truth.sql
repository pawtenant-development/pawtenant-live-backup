-- ASSESSMENT-FUNNEL-TRACKING-TEST-CLOSEOUT-002
--
-- Two additive, idempotent, non-destructive concerns:
--
-- (A) PHASE 3 — kill the false visitor_sessions.paid_at stamp.
--     link_session_to_order() historically set `paid_at = COALESCE(paid_at, now())`
--     on EVERY call (a legacy analytics_phase1 behaviour). Because the thank-you
--     page calls it, an order reached by URL/resume that was never paid still got
--     a session paid_at, which the Admin funnel then read as "paid". Back-linking a
--     session to an order is an IDENTITY operation, not a payment one — so this
--     rewrite sets ONLY confirmation_id and never touches paid_at. From now on the
--     single writer of visitor_sessions.paid_at is mark_visitor_session_event('paid'),
--     which is called only from the confirmed-success markPaid() path. Admin paid
--     truth is orders.paid_at regardless (webhook-owned).
--
-- (B) PHASE 5 — durable idempotency for one-time funnel milestones.
--     otp_verified / assessment_submitted / payment_fields_completed / payment_success
--     must record at most ONCE per order, surviving refresh, resume, remount, callback
--     replay and multiple tabs/devices — the in-memory FIRED set does not. We add a
--     PARTIAL unique index over exactly those four event names (keyed by
--     event_name + props->>'confirmation_id') and a dedicated record_event_once() RPC
--     that inserts with ON CONFLICT DO NOTHING against that index. Repeatable events
--     (checkout_viewed, customer_portal_viewed, payment_attempted, payment_failed,
--     otp_requested, page_view, …) keep using record_event and are UNAFFECTED — the
--     index does not cover them, so their counts and first/latest timestamps are
--     preserved. No new analytics table; the existing events ledger is reused.
--
-- Safe to re-run: CREATE OR REPLACE FUNCTION, dedupe-then-CREATE UNIQUE INDEX IF NOT
-- EXISTS, all guarded.

-- ─────────────────────────────────────────────────────────────────────────────
-- (A) link_session_to_order — identity only, never stamps paid_at.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.link_session_to_order(
  p_session_id uuid,
  p_confirmation_id text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_session_id is null or p_confirmation_id is null or length(trim(p_confirmation_id)) = 0 then
    return;
  end if;

  -- Back-link visitor_sessions → order: set confirmation_id only when missing.
  -- paid_at is DELIBERATELY not touched here — payment is confirmed elsewhere.
  begin
    update public.visitor_sessions
       set confirmation_id = coalesce(confirmation_id, p_confirmation_id)
     where session_id = p_session_id;
  exception when others then
    null;
  end;

  -- Forward-link order → session: fill only when missing so a session_id stamped
  -- by the lead save is never clobbered by a later thank-you-page link call.
  begin
    update public.orders
       set session_id = p_session_id
     where confirmation_id = p_confirmation_id
       and session_id is null;
  exception when others then
    null;
  end;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- (B) One-time milestone durability.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Collapse any pre-existing duplicates for the one-time events (keep the
--    earliest row per event_name + confirmation_id) so the unique index can build.
--    Bounded to exactly the four one-time event names; never touches other events.
with ranked as (
  select id,
         row_number() over (
           partition by event_name, (props->>'confirmation_id')
           order by created_at asc, id asc
         ) as rn
    from public.events
   where event_name in ('otp_verified','assessment_submitted','payment_fields_completed','payment_success')
     and props->>'confirmation_id' is not null
)
delete from public.events e
 using ranked r
 where e.id = r.id
   and r.rn > 1;

-- 2. Partial unique index — one row per (one-time event, order). Covers ONLY the
--    four milestone names + non-null confirmation_id, so repeatable events are free.
create unique index if not exists uniq_events_one_time_milestone
  on public.events (event_name, (props->>'confirmation_id'))
  where event_name in ('otp_verified','assessment_submitted','payment_fields_completed','payment_success')
    and (props->>'confirmation_id') is not null;

-- 3. record_event_once — same insert shape as record_event, but idempotent for the
--    one-time milestones via ON CONFLICT DO NOTHING against the partial index.
--    A duplicate refresh/resume/replay/second-tab simply no-ops. Errors swallowed.
create or replace function public.record_event_once(
  p_session_id text default null,
  p_event_name text default null,
  p_page_url text default null,
  p_props jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_event_name is null or length(trim(p_event_name)) = 0 then
    return;
  end if;

  begin
    insert into public.events (session_id, event_name, page_url, props, created_at)
    values (
      case when p_session_id is not null and length(trim(p_session_id)) > 0
           then p_session_id::uuid else null end,
      p_event_name,
      p_page_url,
      coalesce(p_props, '{}'::jsonb),
      now()
    )
    on conflict (event_name, (props->>'confirmation_id'))
      where event_name in ('otp_verified','assessment_submitted','payment_fields_completed','payment_success')
        and (props->>'confirmation_id') is not null
    do nothing;
  exception when others then
    return;
  end;
end;
$function$;

grant execute on function public.record_event_once(text, text, text, jsonb) to anon, authenticated, service_role;
