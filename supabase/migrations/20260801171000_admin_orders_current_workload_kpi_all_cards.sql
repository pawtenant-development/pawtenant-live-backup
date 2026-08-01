-- MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-LIVE-ROLLOUT-001 §C
-- Extend get_admin_orders_monthly_kpis() to ALL FOUR current-workload cards.
--
-- LIVE's 20260731130000 already made Under Review + Pending Delivery current
-- (that fix originated on LIVE and was back-ported to TEST). This migration
-- completes the contract exactly as TEST 20260801120000 did: Lead (Unpaid) and
-- Paid (Unassigned) also become live queue depths (a queue is sized by what is
-- IN it, never by when each item arrived), while every monthly transition
-- metric is PRESERVED under its original key. Completed stays the only monthly
-- card, keyed on last_completed_at in the current America/New_York month.
--
-- Payload keys are a strict superset of the current LIVE payload, so the
-- deployed frontend keeps working during the rollout window.

create or replace function public.get_admin_orders_monthly_kpis()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_tz        constant text := 'America/New_York';
  v_ps        timestamptz;
  v_pe        timestamptz;
  v_lead      integer;
  v_paid      integer;
  v_ur        integer;
  v_pd        integer;
  v_lead_now  integer;
  v_paid_now  integer;
  v_ur_now    integer;
  v_pd_now    integer;
  v_done      integer;
begin
  if not public.check_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_ps := (date_trunc('month', (now() at time zone v_tz)) at time zone v_tz);
  v_pe := ((date_trunc('month', (now() at time zone v_tz)) + interval '1 month') at time zone v_tz);

  select count(*) into v_lead_now
    from public.orders o
   where public.order_workflow_state(o) = 'lead'
     and o.status <> 'archived';

  select count(*) into v_paid_now
    from public.orders o
   where public.order_workflow_state(o) = 'paid_unassigned'
     and public.order_payment_state(o) not in ('fully_refunded', 'unpaid', 'failed')
     and o.status <> 'archived';

  select count(*) into v_ur_now
    from public.orders o
   where (
           public.order_workflow_state(o) = 'under_review'
           or (public.order_workflow_state(o) = 'reopened'
               and (o.doctor_user_id is not null or o.doctor_email is not null))
         )
     and public.order_payment_state(o) not in ('fully_refunded', 'unpaid', 'failed')
     and o.status <> 'archived';

  select count(*) into v_pd_now
    from public.orders o
   where public.order_workflow_state(o) = 'pending_delivery'
     and public.order_payment_state(o) not in ('fully_refunded', 'unpaid', 'failed')
     and o.status <> 'archived';

  select count(*) into v_lead
    from public.orders o
   where public.order_workflow_state(o) = 'lead'
     and o.created_at >= v_ps
     and o.created_at <  v_pe;

  select count(*) into v_paid
    from public.orders o
   where public.order_workflow_state(o) = 'paid_unassigned'
     and public.order_payment_state(o) in ('paid', 'partially_refunded')
     and o.paid_at >= v_ps
     and o.paid_at <  v_pe;

  select count(*) into v_ur
    from public.orders o
    join (
      select order_id, max(changed_at) as entered_at
        from public.order_status_logs
       where order_id is not null
         and (new_doctor_status in ('pending_review', 'in_review')
              or new_status = 'under-review')
       group by order_id
    ) e on e.order_id = o.id
   where public.order_workflow_state(o) = 'under_review'
     and public.order_payment_state(o) in ('paid', 'partially_refunded')
     and e.entered_at >= v_ps
     and e.entered_at <  v_pe;

  select count(*) into v_pd
    from public.orders o
    join (
      select order_id, max(changed_at) as entered_at
        from public.order_status_logs
       where order_id is not null
         and new_doctor_status = 'pending_admin_approval'
       group by order_id
    ) e on e.order_id = o.id
   where public.order_workflow_state(o) = 'pending_delivery'
     and public.order_payment_state(o) in ('paid', 'partially_refunded')
     and e.entered_at >= v_ps
     and e.entered_at <  v_pe;

  select count(*) into v_done
    from public.orders o
   where o.last_completed_at >= v_ps
     and o.last_completed_at <  v_pe
     and public.order_payment_state(o) <> 'unpaid'
     and public.order_workflow_state(o) <> 'pending_delivery';

  return jsonb_build_object(
    'timezone',               v_tz,
    'periodStart',            v_ps,
    'periodEndExclusive',     v_pe,
    'leadUnpaid',             v_lead,
    'paidUnassigned',         v_paid,
    'underReview',            v_ur,
    'pendingDelivery',        v_pd,
    'leadUnpaidCurrent',      v_lead_now,
    'paidUnassignedCurrent',  v_paid_now,
    'underReviewCurrent',     v_ur_now,
    'pendingDeliveryCurrent', v_pd_now,
    'completed',              v_done
  );
end;
$function$;

comment on function public.get_admin_orders_monthly_kpis() is
  'Admin Orders banner aggregate. Queue cards read the *Current fields (live depth, America/New_York-independent); monthly transition fields preserved under their original keys; Completed = last_completed_at in the current America/New_York month. Admin-gated; anon holds no EXECUTE.';

revoke all on function public.get_admin_orders_monthly_kpis() from public, anon;
grant execute on function public.get_admin_orders_monthly_kpis() to authenticated, service_role;
