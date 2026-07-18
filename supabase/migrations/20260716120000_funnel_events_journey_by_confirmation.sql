-- ASSESSMENT-FUNNEL-ATTRIBUTION-TRACKING-001
--
-- Additive, non-destructive. NO new table: the assessment→checkout funnel
-- reuses the existing public.events ledger + record_event RPC. This migration
-- only strengthens the ADMIN READ path so per-order funnel milestones stitch
-- to the order even when an event was recorded from a session that was never
-- back-linked to the order (e.g. the customer opened the portal or checkout on
-- a different device). Identity linking, not new storage.
--
-- 1. Functional index so the confirmation_id union stays fast as events grows.
-- 2. get_visitor_journey_by_order: same signature, now UNIONs events matched by
--    props->>'confirmation_id' with the existing session-linked events, deduped
--    by event id. Admin gate (doctor_profiles.is_admin) is preserved unchanged.
--
-- Safe to re-run: index IF NOT EXISTS + CREATE OR REPLACE FUNCTION.

create index if not exists idx_events_props_confirmation_id
  on public.events ((props->>'confirmation_id'));

create or replace function public.get_visitor_journey_by_order(
  p_confirmation_id text,
  p_limit integer default 500
)
returns table(
  event_id uuid,
  session_id uuid,
  event_name text,
  page_url text,
  props jsonb,
  created_at timestamptz,
  session_first_seen_at timestamptz,
  session_last_seen_at timestamptz,
  session_landing_url text,
  session_channel text,
  session_utm_source text,
  session_utm_campaign text,
  session_fbclid text,
  session_gclid text,
  session_paid_at timestamptz,
  session_chat_opened_at timestamptz,
  session_assessment_at timestamptz,
  is_primary_session boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin    boolean := false;
  v_norm_conf   text;
  v_primary_sid uuid;
begin
  if p_confirmation_id is null or length(trim(p_confirmation_id)) = 0 then
    return;
  end if;

  select coalesce(bool_or(dp.is_admin), false)
    into v_is_admin
    from public.doctor_profiles dp
   where dp.user_id = auth.uid();

  if not v_is_admin then
    return;
  end if;

  v_norm_conf := trim(p_confirmation_id);

  begin
    select ord.session_id into v_primary_sid
      from public.orders ord
     where ord.confirmation_id = v_norm_conf
     limit 1;
  exception when others then
    v_primary_sid := null;
  end;

  return query
    with linked_sessions as (
      select vs.session_id            as sid,
             vs.created_at            as s_first_seen,
             vs.last_seen_at          as s_last_seen,
             vs.landing_url           as s_landing,
             vs.channel               as s_channel,
             vs.utm_source            as s_utm_source,
             vs.utm_campaign          as s_utm_campaign,
             vs.fbclid                as s_fbclid,
             vs.gclid                 as s_gclid,
             vs.paid_at               as s_paid,
             vs.chat_opened_at        as s_chat,
             vs.assessment_started_at as s_assess
        from public.visitor_sessions vs
       where vs.confirmation_id = v_norm_conf
      union
      select vs2.session_id,
             vs2.created_at,
             vs2.last_seen_at,
             vs2.landing_url,
             vs2.channel,
             vs2.utm_source,
             vs2.utm_campaign,
             vs2.fbclid,
             vs2.gclid,
             vs2.paid_at,
             vs2.chat_opened_at,
             vs2.assessment_started_at
        from public.visitor_sessions vs2
       where v_primary_sid is not null
         and vs2.session_id::text = v_primary_sid::text
    ),
    -- Events reachable through a linked visitor session (existing behaviour).
    sess_ev as (
      select e.id                as ev_id,
             e.session_id        as ev_session,
             e.event_name        as ev_name,
             e.page_url          as ev_page,
             e.props             as ev_props,
             e.created_at        as ev_created,
             ls.s_first_seen, ls.s_last_seen, ls.s_landing, ls.s_channel,
             ls.s_utm_source, ls.s_utm_campaign, ls.s_fbclid, ls.s_gclid,
             ls.s_paid, ls.s_chat, ls.s_assess
        from linked_sessions ls
        join public.events e on e.session_id::text = ls.sid::text
    ),
    -- Funnel events tagged with this order's confirmation_id whose session was
    -- never back-linked (cross-device portal/checkout view, etc.). Deduped
    -- against sess_ev by event id so nothing is double-counted.
    conf_ev as (
      select e.id                as ev_id,
             e.session_id        as ev_session,
             e.event_name        as ev_name,
             e.page_url          as ev_page,
             e.props             as ev_props,
             e.created_at        as ev_created,
             null::timestamptz   as s_first_seen,
             null::timestamptz   as s_last_seen,
             null::text          as s_landing,
             null::text          as s_channel,
             null::text          as s_utm_source,
             null::text          as s_utm_campaign,
             null::text          as s_fbclid,
             null::text          as s_gclid,
             null::timestamptz   as s_paid,
             null::timestamptz   as s_chat,
             null::timestamptz   as s_assess
        from public.events e
       where e.props->>'confirmation_id' = v_norm_conf
         and e.id not in (select ev_id from sess_ev)
    ),
    all_ev as (
      select * from sess_ev
      union all
      select * from conf_ev
    )
    select a.ev_id        as event_id,
           a.ev_session   as session_id,
           a.ev_name      as event_name,
           a.ev_page      as page_url,
           a.ev_props     as props,
           a.ev_created   as created_at,
           a.s_first_seen as session_first_seen_at,
           a.s_last_seen  as session_last_seen_at,
           a.s_landing    as session_landing_url,
           a.s_channel    as session_channel,
           a.s_utm_source as session_utm_source,
           a.s_utm_campaign as session_utm_campaign,
           a.s_fbclid     as session_fbclid,
           a.s_gclid      as session_gclid,
           a.s_paid       as session_paid_at,
           a.s_chat       as session_chat_opened_at,
           a.s_assess     as session_assessment_at,
           (v_primary_sid is not null and a.ev_session::text = v_primary_sid::text)
                          as is_primary_session
      from all_ev a
     order by coalesce(a.s_first_seen, a.ev_created) asc nulls last,
              a.ev_created asc
     limit greatest(least(coalesce(p_limit, 500), 2000), 1);
end;
$function$;
