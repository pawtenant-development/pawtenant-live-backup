-- ADMIN-NOTIFICATIONS-UNIFIED-EMAIL-THREAD-LIVE-PARITY-001 · LIVE
-- Forward-only.
--
-- THE DEAD ARM. The bell's 'email' group read public.communications for
-- direction='inbound' AND type like 'email%'. ZERO such rows have ever existed
-- on this project — 10,317 communications rows since 2026-03-26, 7,688 of them
-- email, every one outbound. Nothing writes an inbound email there, so the
-- group was permanently empty and no admin has ever seen an email notification.
--
-- WHY NOT PORT TEST'S ARMS. TEST reads admin_email_threads /
-- admin_email_messages. Those tables DO NOT EXIST on LIVE: the unified email
-- conversation model is TEST-only (Phase 1), gated on an owner decision.
-- Porting the arms alone would swap one permanently-empty source for another.
--
-- WHY NOT RETIRE. LIVE really does receive inbound customer email — it lands in
-- public.contact_submissions (95 rows, 8 in the trailing week) and is worked in
-- the Contact Requests tab. Deleting the arm would leave Email as the only
-- communication type with no durable, per-admin, cross-device bell surface.
--
-- SO: repoint the arm at the store LIVE actually uses, with the same contract
-- the SMS/call arms got in ADMIN-NOTIFICATIONS-CUSTOMER-NAME-...-001 —
-- contact first, subject second, order id as traceability, masked sender when
-- nothing resolved. Each environment reads its own canonical inbound-email
-- store; the BEHAVIOUR is what reaches parity, not the storage.
--
-- The SMS and call arms are reproduced byte-for-byte from the previous task.
-- The signature is unchanged, so this is CREATE OR REPLACE and grants are
-- untouched (no DROP, therefore no re-added anon EXECUTE to revoke).

-- ---------------------------------------------------------------------------
-- 1. Display-safe sender. great_person26@gmail.com -> g***@gmail.com
--    The bell is admin-only, but the full address is never the thing it prints.
-- ---------------------------------------------------------------------------
create or replace function public.mask_email_for_display(p_email text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
           when s.e = '' or position('@' in s.e) = 0 then 'unknown sender'
           when length(s.local) <= 1 then '***@' || s.domain
           else left(s.local, 1) || '***@' || s.domain
         end
    from (select lower(btrim(coalesce(p_email, ''))) as e,
                 split_part(lower(btrim(coalesce(p_email, ''))), '@', 1) as local,
                 split_part(lower(btrim(coalesce(p_email, ''))), '@', 2) as domain) s;
$$;

comment on function public.mask_email_for_display(text) is
  'ADMIN-NOTIFICATIONS-UNIFIED-EMAIL-...-001 — display-safe sender. Never returns the full address.';

-- ---------------------------------------------------------------------------
-- 2. Preview sanitiser. Markup is REMOVED server-side rather than relied upon
--    to be inert in React, so an HTML email body can never reach the panel as
--    markup and can never smuggle a tag into a title attribute.
-- ---------------------------------------------------------------------------
create or replace function public.safe_text_preview(p_text text, p_len int)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select left(btrim(regexp_replace(
           regexp_replace(coalesce(p_text, ''), '<[^>]*>', ' ', 'g'),
           '\s+', ' ', 'g')), greatest(p_len, 1));
$$;

comment on function public.safe_text_preview(text, int) is
  'ADMIN-NOTIFICATIONS-UNIFIED-EMAIL-...-001 — strips markup and collapses whitespace before truncation. The bell never renders HTML.';

-- ---------------------------------------------------------------------------
-- 3. Email -> customer resolution. Same discipline as
--    resolve_communication_contact(): explicit first, ambiguity fails closed.
--      1. an explicit order id carried on the row (unused on LIVE today —
--         contact_submissions has no order column — but kept identical to TEST
--         so one resolver serves both)
--      2. the submission's metadata->>'order_reference', only when it matches
--         exactly one order (the literal 'general' sentinel is ignored)
--      3. normalized sender email: a NAME only when every matching order
--         agrees on it, an ORDER ID only when exactly one order matches
--    No partial matching, no email-prefix guessing, no "most recent order".
--    SECURITY INVOKER: the only caller is the SECURITY DEFINER bell RPC.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_email_contact(
  p_order_id        uuid,
  p_confirmation_id text,
  p_email           text
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
  v_email    text;
  v_orders   int;
  v_names    int;
  v_name_any text;
  v_oid_any  uuid;
  v_cid_any  text;
begin
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

  if v_order_id is null and nullif(btrim(coalesce(p_confirmation_id, '')), '') is not null
     and lower(btrim(p_confirmation_id)) <> 'general' then
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

  if v_order_id is null and v_name is null then
    v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
    if v_email is not null and position('@' in v_email) > 1 then
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
               where lower(btrim(coalesce(o.email, ''))) = v_email) m;

      if v_names = 1 then
        v_name  := v_name_any;
        v_basis := 'email';
      end if;
      if v_orders = 1 then
        v_order_id := v_oid_any;
        v_conf     := v_cid_any;
        v_basis    := 'email';
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

comment on function public.resolve_email_contact(uuid, text, text) is
  'ADMIN-NOTIFICATIONS-UNIFIED-EMAIL-...-001 — explicit-first email->customer resolution. Mirrors the contact-form auto-link rule: an order reference or a sender email is used ONLY when it identifies exactly one order.';

revoke all on function public.mask_email_for_display(text) from public;
revoke all on function public.mask_email_for_display(text) from anon;
revoke all on function public.mask_email_for_display(text) from authenticated;
revoke all on function public.safe_text_preview(text, int) from public;
revoke all on function public.safe_text_preview(text, int) from anon;
revoke all on function public.safe_text_preview(text, int) from authenticated;
revoke all on function public.resolve_email_contact(uuid, text, text) from public;
revoke all on function public.resolve_email_contact(uuid, text, text) from anon;
revoke all on function public.resolve_email_contact(uuid, text, text) from authenticated;


-- ---------------------------------------------------------------------------
-- 4. get_company_notifications() — only the 'email' arm changes; it moves from
--    the permanently-empty public.communications inbound-email filter to
--    public.contact_submissions. Every other arm is reproduced verbatim,
--    including the SMS/call arms and the LIVE-only order_completed arm.
--    Signature identical, so CREATE OR REPLACE keeps the existing grants.
-- ---------------------------------------------------------------------------
create or replace function public.get_company_notifications()
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

  -- CUSTOMER EMAILS · reads public.contact_submissions, which is where LIVE
  -- actually stores inbound customer email. The previous arm read
  -- public.communications for direction='inbound' AND type like 'email%' — 0
  -- such rows have EVER existed on this project, so the group could never fire.
  -- The unified thread model (admin_email_threads/_messages) does not exist
  -- here; it is TEST-only. Contract matches the TEST arms: contact first,
  -- subject second, order id as traceability, masked sender when nothing
  -- resolved. Archived submissions are excluded; read state stays per-admin in
  -- company_notification_reads and no submission status is written.
  return query
  (select 'email'::text, 'contact_submission'::text, cs.id::text,
          coalesce(k.display_name, nullif(btrim(cs.name), ''), 'Unknown contact'),
          'Email: "' || coalesce(nullif(public.safe_text_preview(coalesce(nullif(btrim(cs.subject), ''), cs.message), 70), ''), 'No subject') || '"'
            || case when k.confirmation_id is not null then ' · ' || k.confirmation_id
                    else ' · ' || public.mask_email_for_display(cs.email) end,
          cs.created_at, 'communications'::text,
          cs.created_at > coalesce((select r.last_read_at from public.company_notification_reads r
                                     where r.user_id = v_uid and r.group_key = 'email'), 'epoch'::timestamptz),
          k.order_id::text
     from (select c2.id, c2.name, c2.email, c2.subject, c2.message, c2.metadata, c2.created_at
             from public.contact_submissions c2
            where c2.created_at >= v_since
              and coalesce(c2.status, '') <> 'archived'
              and c2.archived_at is null
            order by c2.created_at desc limit 8) cs
     join lateral public.resolve_email_contact(null, nullif(btrim(cs.metadata->>'order_reference'), ''), cs.email) k on true
    order by cs.created_at desc);

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
