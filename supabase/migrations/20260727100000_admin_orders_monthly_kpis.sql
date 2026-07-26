-- ADMIN-ORDERS-MONTHLY-KPI-BANNER-CORRECTION-001
--
-- The upper Admin Orders KPI banner is a CURRENT-MONTH operational summary.
--
-- It regressed to all-time / filter-faceted totals when the banner was wired to
-- orderFacetCounts.ts (which is correct for the LIST, whose universe is the active
-- filter set — but wrong for the banner, whose universe is the calendar month).
--
-- The banner and the list are DELIBERATELY DIFFERENT UNIVERSES:
--   banner -> current Eastern calendar month, server-authoritative, aggregate-only,
--             never touched by search / status / package / sequence filters,
--             Date Basis, pagination or loaded rows.
--   list   -> filter-aware + Date-Basis-aware (orderFacetCounts.ts, unchanged).
-- They must never be forced to reconcile with each other.
--
-- TIMEZONE is hardcoded to America/New_York on purpose: it is a business
-- constant, not a caller preference. Taking it as a parameter would let a caller
-- silently shift the reporting month, so there is no parameter to get wrong.
--
-- Aggregate counts only. No customer PII is selected or returned.

create or replace function public.get_admin_orders_monthly_kpis()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  -- Business constant. See header — deliberately not a parameter.
  v_tz   constant text := 'America/New_York';
  v_ps   timestamptz;
  v_pe   timestamptz;
  v_lead integer;
  v_paid integer;
  v_ur   integer;
  v_done integer;
begin
  -- Fail closed. Ordinary authenticated users get an error, never a number.
  if not public.check_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Calendar-month boundaries in Eastern local time, converted back to
  -- timestamptz. Upper bound is EXCLUSIVE (next month's first instant) so a row
  -- written in the final microsecond of the month cannot be double-counted or lost.
  v_ps := (date_trunc('month', (now() at time zone v_tz)) at time zone v_tz);
  v_pe := ((date_trunc('month', (now() at time zone v_tz)) + interval '1 month') at time zone v_tz);

  -- ── Lead (Unpaid) — created this month, still an unpaid lead ───────────────
  -- order_workflow_state()='lead' already means "no payment intent or status=lead"
  -- and excludes cancelled, so no extra payment predicate is needed.
  select count(*) into v_lead
    from public.orders o
   where public.order_workflow_state(o) = 'lead'
     and o.created_at >= v_ps
     and o.created_at <  v_pe;

  -- ── Paid (Unassigned) — FIRST payment this month, still unassigned ─────────
  -- paid_at is the immutable first successful payment (never last_payment_at:
  -- a renewal or add-on must not pull an old order into this month).
  -- "currently paid" excludes fully_refunded / disputed via the canonical
  -- payment-state derivation, so this stays an ACTIONABLE backlog metric.
  select count(*) into v_paid
    from public.orders o
   where public.order_workflow_state(o) = 'paid_unassigned'
     and public.order_payment_state(o) in ('paid', 'partially_refunded')
     and o.paid_at >= v_ps
     and o.paid_at <  v_pe;

  -- ── Under Review — entered review this month, still under review ──────────
  -- last_meaningful_activity_at is NOT used here. It carries whichever business
  -- event was newest, which on real data is usually payment_received or
  -- refund_completed rather than review work — so it cannot prove "Under Review
  -- activity". The proven transition lives in order_status_logs. Fail-closed: an
  -- order with no review transition on record is NOT counted rather than being
  -- given an invented timestamp.
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

  -- ── Completed — fulfilled this month ──────────────────────────────────────
  -- Keyed on last_completed_at (never created_at / paid_at). Deliberately NOT
  -- gated on the CURRENT workflow state: a letter delivered this month that was
  -- later reopened was still completed this month. The unpaid exclusion drops
  -- rows whose completion timestamp is a stale artifact on an unpaid lead.
  select count(*) into v_done
    from public.orders o
   where o.last_completed_at >= v_ps
     and o.last_completed_at <  v_pe
     and public.order_payment_state(o) <> 'unpaid';

  return jsonb_build_object(
    'timezone',           v_tz,
    'periodStart',        v_ps,
    'periodEndExclusive', v_pe,
    'leadUnpaid',         v_lead,
    'paidUnassigned',     v_paid,
    'underReview',        v_ur,
    'completed',          v_done
  );
end;
$$;

comment on function public.get_admin_orders_monthly_kpis() is
  'ADMIN-ORDERS-MONTHLY-KPI-BANNER-CORRECTION-001: current Eastern calendar-month '
  'counts for the four Admin Orders banner cards. Aggregate-only, no PII, admin-gated, '
  'fail-closed. Independent of every list filter, Date Basis and pagination — the '
  'banner and the list are different universes by design.';

-- Supabase default-grants EXECUTE on new public functions to anon and
-- authenticated as EXPLICIT role grants, and `revoke ... from public` does NOT
-- undo them — so anon is revoked BY NAME. authenticated keeps EXECUTE because
-- the browser calls this as the authenticated role; ordinary (non-admin)
-- authenticated users are rejected inside the function by check_is_admin().
revoke all on function public.get_admin_orders_monthly_kpis() from public, anon;
grant execute on function public.get_admin_orders_monthly_kpis() to authenticated, service_role;

-- Supports the Lead (Unpaid) month window; the other three are already covered by
-- orders_first_paid_basis_idx / orders_last_completed_basis_idx and the
-- order_status_logs order_id index.
create index if not exists orders_created_at_idx on public.orders (created_at desc);
