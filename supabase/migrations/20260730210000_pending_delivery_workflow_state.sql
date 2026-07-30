-- ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001 · Phase 2
-- EMPLOYEE-ONLY "PENDING DELIVERY" WORKFLOW STATE (LIVE)
-- =============================================================================
-- LIVE port of TEST bd6227d (20260730130000).
--
-- WHY THIS EXTENDS THE EXISTING CLASSIFIER instead of adding a parallel status:
--   order_workflow_state() is already the single server-side answer to "where is
--   this order?", consumed by the KPI RPC and recorded on every lifecycle event.
--   A second, separately-computed status could immediately disagree with it, and
--   the whole point of this state is that the KPI buckets are mutually exclusive.
--
-- >>> LIVE ADAPTATION — THE search_path PIN IS PRESERVED <<<
--   The deployed TEST copy of order_workflow_state() has NO search_path setting:
--   the pin was silently dropped when the pending_delivery arm was added there.
--   The deployed LIVE copy HAS `SET search_path TO 'public'`. Copying TEST
--   verbatim would therefore have un-pinned a security-relevant setting on
--   production. The pin is retained below and was verified post-apply via
--   pg_proc.proconfig (= {search_path=public}).
--
-- WHY THE NEW ARM IS ORDERED AFTER 'completed' AND BEFORE 'reopened':
--   Behind 'completed' so an already-delivered order can never be pulled back
--   into the approval queue. Ahead of 'reopened' because a 30-day reopen sets
--   doctor_status='thirty_day_reissue' and only becomes 'pending_admin_approval'
--   once the provider RESUBMITS, which is strictly later — so "waiting on an
--   employee" is the more current and actionable fact.
--
-- Verified on LIVE before applying: no index, view, matview or constraint
-- depends on order_workflow_state(), so CREATE OR REPLACE cannot silently
-- invalidate a stored expression.
--
-- Measured on LIVE immediately after applying: the state distribution was
-- UNCHANGED (lead 1231 / completed 461 / cancelled 17 / under_review 4), because
-- no order was in doctor_status='pending_admin_approval'.
--
-- Idempotent and non-destructive.
-- =============================================================================

begin;

create or replace function public.order_workflow_state(o orders)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when o.status = 'cancelled'                                     then 'cancelled'
    when o.payment_intent_id is null or o.status = 'lead'           then 'lead'
    when o.doctor_status = 'patient_notified'                       then 'completed'
    -- NEW: provider submitted, awaiting employee approval.
    when o.doctor_status = 'pending_admin_approval'                 then 'pending_delivery'
    when o.official_letter_reopened_at is not null
         and o.official_letter_final_completed_at is null           then 'reopened'
    when o.doctor_user_id is not null or o.doctor_email is not null then 'under_review'
    else 'paid_unassigned'
  end;
$$;

comment on function public.order_workflow_state(orders) is
  'Authoritative employee-facing workflow state. pending_delivery = provider submitted the final letter, awaiting employee approval; it is EMPLOYEE-ONLY and is projected as Under Review to customers and Completed to providers.';

create or replace function public.get_admin_orders_monthly_kpis()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz   constant text := 'America/New_York';
  v_ps   timestamptz;
  v_pe   timestamptz;
  v_lead integer;
  v_paid integer;
  v_ur   integer;
  v_pd   integer;
  v_done integer;
begin
  if not public.check_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_ps := (date_trunc('month', (now() at time zone v_tz)) at time zone v_tz);
  v_pe := ((date_trunc('month', (now() at time zone v_tz)) + interval '1 month') at time zone v_tz);

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

  -- Under Review now EXCLUDES Pending Delivery automatically: an order awaiting
  -- approval classifies as 'pending_delivery', so it can no longer match here.
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

  -- Pending Delivery. Keyed on the TRANSITION into pending_admin_approval, the
  -- same way Under Review is keyed, so the banner stays "what happened this
  -- month" rather than mixing in a timeless backlog.
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

  -- Completed keeps its existing last_completed_at definition, with ONE added
  -- exclusion so the buckets stay mutually exclusive for a reopened-and-
  -- resubmitted order that still carries its FIRST completion timestamp.
  select count(*) into v_done
    from public.orders o
   where o.last_completed_at >= v_ps
     and o.last_completed_at <  v_pe
     and public.order_payment_state(o) <> 'unpaid'
     and public.order_workflow_state(o) <> 'pending_delivery';

  return jsonb_build_object(
    'timezone',           v_tz,
    'periodStart',        v_ps,
    'periodEndExclusive', v_pe,
    'leadUnpaid',         v_lead,
    'paidUnassigned',     v_paid,
    'underReview',        v_ur,
    'pendingDelivery',    v_pd,
    'completed',          v_done
  );
end;
$$;

revoke all on function public.get_admin_orders_monthly_kpis() from public, anon;
grant execute on function public.get_admin_orders_monthly_kpis() to authenticated;

commit;
