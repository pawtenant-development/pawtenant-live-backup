-- Company OS — Grouped notification bell (TEST).
--
-- Notifications are DERIVED from existing event tables (communications,
-- consultation_requests, orders, approval_requests + the three HR request
-- tables via get_admin_company_os_notifications). No event duplication, no
-- notification spam: the only new durable state is the per-user, per-group
-- read marker below.
--
-- Future department scoping (designed-for, not yet active): scoping is added
-- by filtering inside get_company_notifications() — e.g. parameters/joins on
-- department_id / recipient_user_id / role_scope — without changing the read
-- model. The read table is already per-user, so per-recipient read state
-- works unchanged when scoping lands.
--
-- Group keys: sms | call | email | consultation | order_paid |
--             order_completed | approval

-- 1) Per-user read markers ---------------------------------------------------
create table if not exists public.company_notification_reads (
  user_id      uuid not null,
  group_key    text not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, group_key)
);

alter table public.company_notification_reads enable row level security;

drop policy if exists "cnr_select_own" on public.company_notification_reads;
create policy "cnr_select_own" on public.company_notification_reads
  for select using (user_id = auth.uid());

-- Writes go through the SECURITY DEFINER RPC below; no insert/update policy
-- for direct client writes.

-- 2) Aggregator RPC -----------------------------------------------------------
create or replace function public.get_company_notifications()
returns table (
  group_key   text,
  entity_type text,
  entity_id   text,
  title       text,
  preview     text,
  created_at  timestamptz,
  target_tab  text,
  is_unread   boolean
)
language plpgsql stable security definer set search_path = public
as $$
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

  -- Communications: inbound SMS
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

  -- Communications: inbound calls
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

  -- Communications: inbound customer emails (none logged yet — future-proof)
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

  -- New consultation bookings (status = new is actionable: no time window)
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

  -- New paid orders
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

  -- Completed orders (patient notified)
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

  -- Approvals required (managers only): pending approval_requests + HR requests
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
$$;

grant execute on function public.get_company_notifications() to authenticated;

-- 3) Mark-as-read RPC ----------------------------------------------------------
create or replace function public.mark_company_notifications_read(p_group_key text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.doctor_profiles dp where dp.user_id = v_uid and dp.is_admin = true
  ) then
    raise exception 'not authorized';
  end if;

  if p_group_key is null then
    insert into public.company_notification_reads (user_id, group_key, last_read_at)
    select v_uid, g, now()
      from unnest(array['sms','call','email','consultation','order_paid','order_completed','approval']) as g
    on conflict (user_id, group_key) do update set last_read_at = now();
  else
    insert into public.company_notification_reads (user_id, group_key, last_read_at)
    values (v_uid, p_group_key, now())
    on conflict (user_id, group_key) do update set last_read_at = now();
  end if;
end;
$$;

grant execute on function public.mark_company_notifications_read(text) to authenticated;
