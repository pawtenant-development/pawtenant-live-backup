-- ADMIN-NOTIFICATIONS-CUSTOMER-NAME-FOR-COMMUNICATIONS-001 · LIVE mirror
-- Forward-only. Admin notification bell: incoming SMS and incoming calls must
-- lead with the CUSTOMER NAME, not with the communication text or the order
-- confirmation id. Resolution happens server-side, batched (at most 8 helper
-- calls per group), and only from explicit relationships or a fully normalized,
-- unambiguous phone match. A wrong name is worse than no name.
--
-- MIRROR NOTE. Only the 'sms' and 'call' arms change. Every other arm is
-- reproduced verbatim from the LIVE definition, which legitimately differs from
-- TEST: LIVE still has the legacy communications-backed 'email' arm plus
-- 'order_completed', and does NOT have the TEST-only unified-email arms
-- ('email', 'email_reply', 'email_failed' on admin_email_threads). Do not
-- "reconcile" those here.

-- ---------------------------------------------------------------------------
-- 1. Phone masking. (817) 240-3794 -> (817) ***-3794
-- ---------------------------------------------------------------------------
create or replace function public.mask_phone_for_display(p_phone text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
           when s.d = ''            then 'unknown number'
           when length(s.d) >= 10   then '(' || substr(right(s.d, 10), 1, 3) || ') ***-' || substr(right(s.d, 10), 7, 4)
           when length(s.d) >= 4    then '***-' || right(s.d, 4)
           else '***'
         end
    from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) s;
$$;

comment on function public.mask_phone_for_display(text) is
  'ADMIN-NOTIFICATIONS-CUSTOMER-NAME-001 — display-safe phone. Never returns the full number.';

-- ---------------------------------------------------------------------------
-- 2. Communication -> customer resolution. Explicit first, fails closed.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_communication_contact(
  p_order_id        uuid,
  p_confirmation_id text,
  p_phone           text
)
returns table(order_id uuid, confirmation_id text, display_name text, match_basis text)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_order_id uuid;
  v_conf     text;
  v_name     text;
  v_basis    text := 'none';
  v_digits   text;
  v_orders   int;
  v_names    int;
  v_name_any text;
  v_oid_any  uuid;
  v_cid_any  text;
begin
  -- 1. explicit order relationship
  if p_order_id is not null then
    select o.id,
           o.confirmation_id,
           nullif(btrim(regexp_replace(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''), '\s+', ' ', 'g')), '')
      into v_order_id, v_conf, v_name
      from public.orders o
     where o.id = p_order_id
     limit 1;
    if v_order_id is not null then
      v_basis := 'order_id';
    end if;
  end if;

  -- 2. explicit confirmation id — accepted only when it identifies ONE order
  if v_order_id is null and nullif(btrim(coalesce(p_confirmation_id, '')), '') is not null then
    select count(*)::int,
           (array_agg(m.oid))[1],
           (array_agg(m.cid))[1],
           (array_agg(m.nm) filter (where m.nm is not null))[1]
      into v_orders, v_oid_any, v_cid_any, v_name_any
      from (select o.id as oid,
                   o.confirmation_id as cid,
                   nullif(btrim(regexp_replace(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''), '\s+', ' ', 'g')), '') as nm
              from public.orders o
             where upper(o.confirmation_id) = upper(btrim(p_confirmation_id))) m;
    if v_orders = 1 then
      v_order_id := v_oid_any;
      v_conf     := v_cid_any;
      v_name     := v_name_any;
      v_basis    := 'confirmation_id';
    elsif v_orders > 1 then
      v_basis := 'ambiguous';
    end if;
  end if;

  -- 3. normalized full phone. Last resort, and it fails closed.
  if v_order_id is null and v_name is null then
    v_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
    if length(v_digits) >= 10 then
      v_digits := right(v_digits, 10);
      select count(*)::int,
             count(distinct lower(m.nm))::int,
             (array_agg(m.nm) filter (where m.nm is not null))[1],
             (array_agg(m.oid))[1],
             (array_agg(m.cid))[1]
        into v_orders, v_names, v_name_any, v_oid_any, v_cid_any
        from (select o.id as oid,
                     o.confirmation_id as cid,
                     nullif(btrim(regexp_replace(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''), '\s+', ' ', 'g')), '') as nm
                from public.orders o
               where length(regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g')) >= 10
                 and right(regexp_replace(coalesce(o.phone, ''), '[^0-9]', '', 'g'), 10) = v_digits) m;

      -- one name across every match -> safe to show it
      if v_names = 1 then
        v_name  := v_name_any;
        v_basis := 'phone';
      end if;
      -- one order across every match -> safe to carry its id / confirmation id
      if v_orders = 1 then
        v_order_id := v_oid_any;
        v_conf     := v_cid_any;
        v_basis    := 'phone';
      end if;
      if v_basis = 'none' and v_orders > 0 then
        v_basis := 'ambiguous';
      end if;
    end if;
  end if;

  order_id        := v_order_id;
  confirmation_id := v_conf;
  display_name    := v_name;
  match_basis     := v_basis;
  return next;
end;
$function$;

comment on function public.resolve_communication_contact(uuid, text, text) is
  'ADMIN-NOTIFICATIONS-CUSTOMER-NAME-001 — explicit-first communication->customer resolution. Never guesses on an ambiguous phone.';

revoke all on function public.mask_phone_for_display(text) from public;
revoke all on function public.mask_phone_for_display(text) from anon;
revoke all on function public.mask_phone_for_display(text) from authenticated;
revoke all on function public.resolve_communication_contact(uuid, text, text) from public;
revoke all on function public.resolve_communication_contact(uuid, text, text) from anon;
revoke all on function public.resolve_communication_contact(uuid, text, text) from authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_company_notifications() — signature gains link_order_id, so DROP +
--    CREATE. Grants restored explicitly afterwards.
-- ---------------------------------------------------------------------------
drop function if exists public.get_company_notifications();

create function public.get_company_notifications()
returns table(group_key text, entity_type text, entity_id text, title text, preview text,
              created_at timestamp with time zone, target_tab text, is_unread boolean,
              link_order_id text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid        uuid := auth.uid();
  v_role       text;
  v_is_manager boolean := false;
  v_since      timestamptz := now() - interval '7 days';
begin
  select coalesce(dp.role, '') into v_role
    from public.doctor_profiles dp
   where dp.user_id = v_uid and dp.is_admin = true
   limit 1;
  if not found then
    raise exception 'not authorized to view company notifications';
  end if;
  v_is_manager := v_role in ('owner', 'admin_manager');

  -- SMS · primary line is the CUSTOMER, not the message.
  return query
  (select 'sms'::text, 'communication'::text, c.id::text,
          coalesce(k.display_name, 'Unknown contact'),
          'SMS: "' || coalesce(nullif(left(btrim(regexp_replace(coalesce(c.body, ''), '\s+', ' ', 'g')), 80), ''), 'New message') || '"'
            || case when k.confirmation_id is not null then ' · ' || k.confirmation_id
                    else ' · ' || public.mask_phone_for_display(c.phone_from) end,
          c.created_at, 'comms'::text,
          c.created_at > coalesce((select r.last_read_at from public.company_notification_reads r
                                    where r.user_id = v_uid and r.group_key = 'sms'), 'epoch'::timestamptz),
          k.order_id::text
     from (select c2.id, c2.order_id, c2.confirmation_id, c2.phone_from, c2.body, c2.created_at
             from public.communications c2
            where c2.direction = 'inbound' and c2.type = 'sms_inbound' and c2.created_at >= v_since
            order by c2.created_at desc limit 8) c
     join lateral public.resolve_communication_contact(c.order_id, c.confirmation_id, c.phone_from) k on true
    order by c.created_at desc);

  return query
  (select 'call'::text, 'communication'::text, c.id::text,
          coalesce(k.display_name, 'Unknown contact'),
          'Incoming call · ' || public.mask_phone_for_display(c.phone_from)
            || case when k.confirmation_id is not null then ' · ' || k.confirmation_id else '' end,
          c.created_at, 'comms'::text,
          c.created_at > coalesce((select r.last_read_at from public.company_notification_reads r
                                    where r.user_id = v_uid and r.group_key = 'call'), 'epoch'::timestamptz),
          k.order_id::text
     from (select c2.id, c2.order_id, c2.confirmation_id, c2.phone_from, c2.created_at
             from public.communications c2
            where c2.direction = 'inbound' and c2.type = 'call_inbound' and c2.created_at >= v_since
            order by c2.created_at desc limit 8) c
     join lateral public.resolve_communication_contact(c.order_id, c.confirmation_id, c.phone_from) k on true
    order by c.created_at desc);

  return query
  (select 'email'::text, 'communication'::text, c.id::text,
          'Customer email'::text,
          coalesce(c.subject, left(c.body, 90), 'New email'),
          c.created_at, 'comms'::text,
          c.created_at > coalesce((select r.last_read_at from public.company_notification_reads r
                                    where r.user_id = v_uid and r.group_key = 'email'), 'epoch'::timestamptz),
          null::text
     from public.communications c
    where c.direction = 'inbound' and c.type like 'email%' and c.created_at >= v_since
    order by c.created_at desc limit 8);

  return query
  (select 'consultation'::text, 'consultation_request'::text, cr.id::text,
          'New consultation booking'::text,
          coalesce(cr.customer_name, cr.customer_email, 'Customer')
            || coalesce(' — ' || cr.preferred_day || ' ' || coalesce(cr.preferred_time_window, ''), ''),
          cr.created_at, 'comms'::text,
          cr.created_at > coalesce((select r.last_read_at from public.company_notification_reads r
                                     where r.user_id = v_uid and r.group_key = 'consultation'), 'epoch'::timestamptz),
          null::text
     from public.consultation_requests cr
    where cr.status = 'new'
    order by cr.created_at desc limit 8);

  return query
  (select 'order_paid'::text, 'order'::text, o.id::text,
          'New paid order'::text,
          trim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''))
            || ' · ' || o.confirmation_id || coalesce(' · ' || o.state, ''),
          o.paid_at, 'orders'::text,
          o.paid_at > coalesce((select r.last_read_at from public.company_notification_reads r
                                 where r.user_id = v_uid and r.group_key = 'order_paid'), 'epoch'::timestamptz),
          o.id::text
     from public.orders o
    where o.paid_at is not null and o.paid_at >= v_since
    order by o.paid_at desc limit 8);

  -- PRESERVED FROM LIVE (absent on TEST). Required by the rollout spec.
  return query
  (select 'order_completed'::text, 'order'::text, o.id::text,
          'Order completed'::text,
          trim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''))
            || ' · ' || o.confirmation_id,
          coalesce(o.patient_notification_sent_at, o.created_at), 'orders'::text,
          coalesce(o.patient_notification_sent_at, o.created_at)
            > coalesce((select r.last_read_at from public.company_notification_reads r
                         where r.user_id = v_uid and r.group_key = 'order_completed'), 'epoch'::timestamptz),
          o.id::text
     from public.orders o
    where o.doctor_status = 'patient_notified'
      and coalesce(o.patient_notification_sent_at, o.created_at) >= v_since
    order by coalesce(o.patient_notification_sent_at, o.created_at) desc limit 8);

  -- NEW · Pending Delivery. Actionable employee queue, so like consultations it
  -- has NO time window: a letter waiting on approval stays surfaced until it is
  -- dealt with, rather than ageing out of the bell in 7 days.
  return query
  (select 'order_pending_delivery'::text, 'order'::text, o.id::text,
          'Awaiting your approval'::text,
          trim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''))
            || ' · ' || o.confirmation_id || coalesce(' · ' || o.state, '')
            || coalesce(' · ' || o.doctor_name, ''),
          coalesce(d.submitted_at, o.created_at), 'orders'::text,
          coalesce(d.submitted_at, o.created_at)
            > coalesce((select r.last_read_at from public.company_notification_reads r
                         where r.user_id = v_uid and r.group_key = 'order_pending_delivery'), 'epoch'::timestamptz),
          o.id::text
     from public.orders o
     join lateral (
       select max(od.submitted_at) as submitted_at
         from public.order_documents od
        where od.order_id = o.id and od.review_status = 'pending_admin_approval'
     ) d on true
    where public.order_workflow_state(o) = 'pending_delivery'
    order by coalesce(d.submitted_at, o.created_at) desc limit 12);

  -- NEW · Correction requested / returned to Under Review. Keyed on the DOCUMENT
  -- being in needs_correction, which is the fact that distinguishes this from a
  -- plain under-review order.
  return query
  (select 'order_correction'::text, 'order'::text, o.id::text,
          'Correction requested'::text,
          trim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''))
            || ' · ' || o.confirmation_id
            || coalesce(' · ' || o.doctor_name, ''),
          coalesce(d.reviewed_at, o.created_at), 'orders'::text,
          coalesce(d.reviewed_at, o.created_at)
            > coalesce((select r.last_read_at from public.company_notification_reads r
                         where r.user_id = v_uid and r.group_key = 'order_correction'), 'epoch'::timestamptz),
          o.id::text
     from public.orders o
     join lateral (
       select max(od.reviewed_at) as reviewed_at
         from public.order_documents od
        where od.order_id = o.id and od.review_status = 'needs_correction'
     ) d on true
    where exists (select 1 from public.order_documents od2
                   where od2.order_id = o.id and od2.review_status = 'needs_correction')
    order by coalesce(d.reviewed_at, o.created_at) desc limit 12);

  if v_is_manager then
    return query
    (select 'approval'::text, 'approval_request'::text, ar.id::text,
            ar.action_label,
            'Requested by ' || ar.requester_name || ' (' || replace(ar.requester_role, '_', ' ') || ')',
            ar.created_at, 'team'::text,
            ar.created_at > coalesce((select r.last_read_at from public.company_notification_reads r
                                       where r.user_id = v_uid and r.group_key = 'approval'), 'epoch'::timestamptz),
            null::text
       from public.approval_requests ar
      where ar.status = 'pending'
      order by ar.created_at desc limit 12);

    return query
    select 'approval'::text, h.source_type, h.id, h.title, h.message, h.created_at, h.target_tab,
           h.created_at > coalesce((select r.last_read_at from public.company_notification_reads r
                                     where r.user_id = v_uid and r.group_key = 'approval'), 'epoch'::timestamptz),
           null::text
      from public.get_admin_company_os_notifications() h;
  end if;
end;
$function$;

revoke all on function public.get_company_notifications() from public;
revoke all on function public.get_company_notifications() from anon;
grant execute on function public.get_company_notifications() to authenticated;
grant execute on function public.get_company_notifications() to service_role;
