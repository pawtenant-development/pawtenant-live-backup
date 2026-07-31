-- ADMIN-ORDERS-UNDER-REVIEW-KPI-CURRENT-WORKLOAD-FIX-001
-- CURRENT-WORKLOAD KPI FIELDS FOR UNDER REVIEW AND PENDING DELIVERY (LIVE)
-- =============================================================================
-- THE DEFECT
-- ----------
-- Under Review and Pending Delivery are QUEUES, not monthly events. Both were
-- counted as "entered this state during the current Eastern calendar month",
-- keyed on a transition row in order_status_logs. An order that entered the
-- queue earlier and is STILL SITTING THERE is current, actionable work — but it
-- was silently absent from the card that exists to size that work.
--
-- Two ways it bites, both proven on LIVE before this migration:
--   1. MONTH ROLLOVER. At 2026-08-01 00:00 America/New_York every one of the 6
--      orders then in Under Review would have dropped out of the card (their
--      review transitions are all dated July) while the Under Review TAB still
--      listed all 6. The card would have read 0 against a 6-row queue.
--   2. FAIL-CLOSED ON A MISSING LOG. The count is an inner join on
--      order_status_logs. An order that reaches the queue without a matching
--      transition row is uncountable, so the card under-reports and there is no
--      signal that it did.
--
-- Lead / Paid (Unassigned) / Completed are genuinely MONTHLY questions ("what
-- arrived / what did we ship this month") and are deliberately UNCHANGED here.
--
-- THE FIX — ADDITIVE, NOT A REDEFINITION
-- --------------------------------------
-- `underReview` and `pendingDelivery` keep their existing monthly meaning and
-- their existing values, so any consumer that wants the monthly transition
-- metric is untouched. Two NEW fields carry the current workload:
--
--   underReviewCurrent      -- the queue right now
--   pendingDeliveryCurrent  -- the approval queue right now
--
-- Only the Admin Orders banner reads the RPC today (audited: no Accounts,
-- Analytics, export or report consumer), but the monthly fields are preserved
-- anyway — silently changing the meaning of a field under a caller is exactly
-- the class of defect this task exists to fix.
--
-- WHY THE CURRENT PREDICATE IS SHAPED THIS WAY
-- --------------------------------------------
-- It must equal the Under Review TAB, or the card and the list disagree again.
-- The tab's universe (orderFacetCounts.ts / isUnderReview) is: paid, not in the
-- refunded/cancelled bucket, not completed, provider assigned, not Pending
-- Delivery, not archived. Expressed through the canonical classifier:
--
--   • order_workflow_state(o) = 'under_review'
--       covers not-cancelled, not-lead, not-completed, not-pending_delivery and
--       provider-assigned in one authoritative place. NOT re-derived here.
--
--   • ...OR 'reopened' WITH a provider. order_workflow_state() tests the reopen
--     arm BEFORE the provider arm, so a 30-day reopen (doctor_status =
--     'thirty_day_reissue') classifies as 'reopened' — but the tab shows it
--     under Under Review, because isUnderReview only asks "not completed, has a
--     provider". Omitting this arm would recreate the very mismatch being fixed,
--     one reopen later. The provider condition is required because a reopened
--     order WITHOUT a provider belongs to Paid (Unassigned) in the tab.
--
--   • payment state NOT IN ('fully_refunded','unpaid','failed'). Mirrors
--     isRefundedBucket. 'disputed' is deliberately NOT excluded: the tab counts
--     a disputed order in Under Review (Disputed is a separate, overlapping
--     tab), and the previous `in ('paid','partially_refunded')` whitelist
--     dropped it — a second, independent source of card-vs-tab drift.
--
--   • status <> 'archived'. order_workflow_state() has no archived arm and the
--     list hides archived rows off the Archived tab.
--
-- Pending Delivery stays mutually exclusive with Under Review for free:
-- 'pending_delivery' is tested ahead of 'under_review' inside the classifier, so
-- one order can never satisfy both arms.
--
-- Verified on LIVE immediately before applying (2026-07-31, filters cleared):
--   Under Review tab = 6 · new current predicate = 6 · monthly predicate = 6
--   Pending Delivery tab = 1 · new current predicate = 1 · monthly = 1
-- The month-gated and current values agree TODAY and diverge at the rollover —
-- which is precisely why the change is safe to ship now.
--
-- Aggregate counts only. No PII. Admin-gated, fail-closed. Idempotent and
-- non-destructive: one CREATE OR REPLACE, no data is read, written or moved.
-- =============================================================================

begin;

create or replace function public.get_admin_orders_monthly_kpis()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_tz      constant text := 'America/New_York';
  v_ps      timestamptz;
  v_pe      timestamptz;
  v_lead    integer;
  v_paid    integer;
  v_ur      integer;  -- monthly, preserved
  v_pd      integer;  -- monthly, preserved
  v_ur_now  integer;  -- NEW: current workload
  v_pd_now  integer;  -- NEW: current workload
  v_done    integer;
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

  -- ── CURRENT Under Review workload — what the card now shows ───────────────
  -- No month window and no order_status_logs join BY DESIGN: a queue is sized by
  -- what is in it, not by when each item arrived. See the header for why the
  -- 'reopened' arm and the disputed-inclusive payment filter are required for
  -- this to equal the Under Review tab.
  select count(*) into v_ur_now
    from public.orders o
   where (
           public.order_workflow_state(o) = 'under_review'
           or (public.order_workflow_state(o) = 'reopened'
               and (o.doctor_user_id is not null or o.doctor_email is not null))
         )
     and public.order_payment_state(o) not in ('fully_refunded', 'unpaid', 'failed')
     and o.status <> 'archived';

  -- ── CURRENT Pending Delivery workload — what the card now shows ───────────
  select count(*) into v_pd_now
    from public.orders o
   where public.order_workflow_state(o) = 'pending_delivery'
     and public.order_payment_state(o) not in ('fully_refunded', 'unpaid', 'failed')
     and o.status <> 'archived';

  -- ── MONTHLY Under Review — PRESERVED, no longer drives the card ───────────
  -- "How many orders entered review this month and are still there." Kept so the
  -- historical metric stays available and no consumer silently changes meaning.
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

  -- ── MONTHLY Pending Delivery — PRESERVED, no longer drives the card ───────
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

  -- Completed stays MONTHLY and stays keyed on last_completed_at: "what did we
  -- deliver this month" is a genuine monthly question, unlike a queue depth.
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
    'underReviewCurrent',     v_ur_now,
    'pendingDeliveryCurrent', v_pd_now,
    'completed',              v_done
  );
end;
$$;

comment on function public.get_admin_orders_monthly_kpis() is
  'ADMIN-ORDERS-UNDER-REVIEW-KPI-CURRENT-WORKLOAD-FIX-001: Admin Orders banner aggregate. '
  'leadUnpaid / paidUnassigned / completed are current-Eastern-month metrics. '
  'underReviewCurrent / pendingDeliveryCurrent are CURRENT QUEUE DEPTHS (no month window) and '
  'are what the two workflow cards display, so each card equals its status tab. '
  'underReview / pendingDelivery retain the older monthly transition meaning for historical use. '
  'Aggregate-only, no PII, admin-gated, fail-closed.';

-- Supabase default-grants EXECUTE on public functions to anon and authenticated
-- as EXPLICIT role grants, and `revoke ... from public` does NOT undo them — so
-- anon is revoked BY NAME. authenticated keeps EXECUTE because the browser calls
-- this as the authenticated role; non-admins are rejected by check_is_admin().
revoke all on function public.get_admin_orders_monthly_kpis() from public, anon;
grant execute on function public.get_admin_orders_monthly_kpis() to authenticated;

commit;
