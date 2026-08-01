-- ADMIN-ORDERS-KPI-CARD-LIST-PARITY-AND-MONTH-SEMANTICS-001
--
-- The MONTHLY lead count (`leadUnpaid`) did not exclude archived orders, while
-- the current-state count (`leadUnpaidCurrent`) did. Now that the Lead card
-- reads the monthly field, that inconsistency would let an archived lead created
-- this month inflate the card. Zero rows are affected today (neither environment
-- has archived orders), so this closes a latent defect rather than changing a
-- displayed number.
--
-- Only the v_lead SELECT changes; every other branch is byte-identical to the
-- previously deployed definition.

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

  -- CHANGED: archived leads are excluded, matching v_lead_now.
  select count(*) into v_lead
    from public.orders o
   where public.order_workflow_state(o) = 'lead'
     and o.status <> 'archived'
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

-- Re-assert the grant posture explicitly. CREATE OR REPLACE preserves existing
-- grants on an already-deployed function, but this file must be safe to replay
-- into a fresh environment on its own — where the default EXECUTE grant to every
-- role would otherwise survive. Revoking "from public" alone does NOT undo it;
-- anon must be named.
revoke all on function public.get_admin_orders_monthly_kpis() from public, anon;
grant execute on function public.get_admin_orders_monthly_kpis() to authenticated, service_role;
