-- ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001 · Phase 5
-- ADMIN NOTIFICATION CATEGORIES: PENDING DELIVERY + CORRECTION (LIVE)
-- =============================================================================
-- LIVE port of TEST d51ede8 (20260730150000).
--
-- >>> LIVE ADAPTATION — REBUILT FROM THE DEPLOYED LIVE BODY, NOT FROM TEST <<<
--   TEST's version of get_company_notifications() has NO 'order_completed' arm.
--   The DEPLOYED LIVE body HAS one, and the rollout spec explicitly requires
--   "Completed Orders" as a notification category. Porting TEST verbatim would
--   have DELETED a required category from production.
--
--   LIVE's body is therefore preserved in full and receives exactly TWO ADDITIVE
--   arms, inserted directly after order_completed:
--     * order_pending_delivery — NO time window, because it is an actionable
--       queue that must stay surfaced until it is dealt with rather than ageing
--       out of the bell after 7 days (same treatment as consultations).
--     * order_correction — keyed on the DOCUMENT being needs_correction, which is
--       the fact that distinguishes this from a plain under-review order
--       (doctor_status is reset to 'in_review' by
--       request_order_document_correction, deliberately reusing an existing
--       value).
--
--   Every pre-existing arm — sms, call, email, consultation, order_paid,
--   order_completed, and the two manager-only approval arms — is unchanged, as is
--   the return signature, the authorisation check and the search_path pin.
--
-- Idempotent and non-destructive.
-- =============================================================================

create or replace function public.get_company_notifications()
returns table(group_key text, entity_type text, entity_id text, title text, preview text,
              created_at timestamp with time zone, target_tab text, is_unread boolean)
language plpgsql
stable
security definer
set search_path = public
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

  return query
  (select 'sms'::text, 'communication'::text, c.id::text,
          'New SMS'::text,
          coalesce(left(c.body, 90), 'New message')
            || case when c.confirmation_id is not null then ' · ' || c.confirmation_id else '' end,
          c.created_at, 'comms'::text,
          c.created_at > coalesce((select r.last_read_at from public.company_notification_reads r
                                    where r.user_id = v_uid and r.group_key = 'sms'), 'epoch'::timestamptz)
     from public.communications c
    where c.direction = 'inbound' and c.type = 'sms_inbound' and c.created_at >= v_since
    order by c.created_at desc limit 8);

  return query
  (select 'call'::text, 'communication'::text, c.id::text,
          'Incoming call'::text,
          'Call from ' || coalesce(c.phone_from, 'unknown')
            || case when c.confirmation_id is not null then ' · ' || c.confirmation_id else '' end,
          c.created_at, 'comms'::text,
          c.created_at > coalesce((select r.last_read_at from public.company_notification_reads r
                                    where r.user_id = v_uid and r.group_key = 'call'), 'epoch'::timestamptz)
     from public.communications c
    where c.direction = 'inbound' and c.type = 'call_inbound' and c.created_at >= v_since
    order by c.created_at desc limit 8);

  return query
  (select 'email'::text, 'communication'::text, c.id::text,
          'Customer email'::text,
          coalesce(c.subject, left(c.body, 90), 'New email'),
          c.created_at, 'comms'::text,
          c.created_at > coalesce((select r.last_read_at from public.company_notification_reads r
                                    where r.user_id = v_uid and r.group_key = 'email'), 'epoch'::timestamptz)
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
                                     where r.user_id = v_uid and r.group_key = 'consultation'), 'epoch'::timestamptz)
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
                                 where r.user_id = v_uid and r.group_key = 'order_paid'), 'epoch'::timestamptz)
     from public.orders o
    where o.paid_at is not null and o.paid_at >= v_since
    order by o.paid_at desc limit 8);

  -- PRESERVED FROM LIVE (absent on TEST). Required by the rollout spec as the
  -- "Completed Orders" category.
  return query
  (select 'order_completed'::text, 'order'::text, o.id::text,
          'Order completed'::text,
          trim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''))
            || ' · ' || o.confirmation_id,
          coalesce(o.patient_notification_sent_at, o.created_at), 'orders'::text,
          coalesce(o.patient_notification_sent_at, o.created_at)
            > coalesce((select r.last_read_at from public.company_notification_reads r
                         where r.user_id = v_uid and r.group_key = 'order_completed'), 'epoch'::timestamptz)
     from public.orders o
    where o.doctor_status = 'patient_notified'
      and coalesce(o.patient_notification_sent_at, o.created_at) >= v_since
    order by coalesce(o.patient_notification_sent_at, o.created_at) desc limit 8);

  -- NEW · Pending Delivery. Actionable employee queue, so like consultations it
  -- has NO time window: a letter waiting on approval stays surfaced until it is
  -- dealt with. Provider name is included because the reviewer usually wants to
  -- know whose letter it is.
  return query
  (select 'order_pending_delivery'::text, 'order'::text, o.id::text,
          'Awaiting your approval'::text,
          trim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''))
            || ' · ' || o.confirmation_id || coalesce(' · ' || o.state, '')
            || coalesce(' · ' || o.doctor_name, ''),
          coalesce(d.submitted_at, o.created_at), 'orders'::text,
          coalesce(d.submitted_at, o.created_at)
            > coalesce((select r.last_read_at from public.company_notification_reads r
                         where r.user_id = v_uid and r.group_key = 'order_pending_delivery'), 'epoch'::timestamptz)
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
                         where r.user_id = v_uid and r.group_key = 'order_correction'), 'epoch'::timestamptz)
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
                                       where r.user_id = v_uid and r.group_key = 'approval'), 'epoch'::timestamptz)
       from public.approval_requests ar
      where ar.status = 'pending'
      order by ar.created_at desc limit 12);

    return query
    select 'approval'::text, h.source_type, h.id, h.title, h.message, h.created_at, h.target_tab,
           h.created_at > coalesce((select r.last_read_at from public.company_notification_reads r
                                     where r.user_id = v_uid and r.group_key = 'approval'), 'epoch'::timestamptz)
      from public.get_admin_company_os_notifications() h;
  end if;
end;
$function$;

revoke all on function public.get_company_notifications() from public, anon;
grant execute on function public.get_company_notifications() to authenticated;
