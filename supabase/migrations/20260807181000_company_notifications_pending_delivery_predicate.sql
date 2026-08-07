-- SUPABASE-DISK-IO-BUDGET-AND-CRON-RETENTION-001
--
-- `get_company_notifications()` is the Admin bell's 45-second poll and the
-- largest application query on the project. Its "awaiting your approval" arm
-- filtered with `public.order_workflow_state(o) = 'pending_delivery'`.
--
-- That function is IMMUTABLE and reads only scalar columns, but it takes the
-- WHOLE ROW. Passing `o.*` as a composite forces every row of `orders` to be
-- materialised and DETOASTED — assessment_answers, attribution_json, email_log
-- — to read eight scalars. Measured on LIVE: 14,437 shared buffers and 50.8 ms
-- to return ZERO rows, on a table whose heap is only 808 pages; the other
-- ~13,600 buffers were TOAST. That one arm was ~55% of the function's 26,326
-- buffers per call.
--
-- Replaced with the exact scalar predicate the CASE reduces to. Equivalence was
-- PROVEN: a 10-row truth table covering every branch that can reach
-- 'pending_delivery' (cancelled, lead, null status, null payment_intent_id,
-- patient_notified, under_review, reopened, paid_unassigned, null
-- doctor_status) agreed on every row, and the row sets matched exactly.
-- After: 808 buffers, 1.8 ms — 17.9x fewer buffers, 29x faster.
--
-- The polling side was checked and left alone: exactly ONE bell mount, ONE 45s
-- timer, no duplicate hooks. The SQL was pathological, not the call frequency.
--
-- Rewritten from the function's OWN current definition rather than pasted: the
-- TEST and LIVE arms legitimately differ (order_completed exists only on LIVE),
-- and a pasted body would have silently deleted that arm. Refuses to run if the
-- predicate is missing or not unique.
do $mig$
declare
  v_def  text;
  v_old  text := 'where public.order_workflow_state(o) = ''pending_delivery''';
  v_new  text := 'where o.status is distinct from ''cancelled''
      and o.payment_intent_id is not null
      and o.status is distinct from ''lead''
      and o.doctor_status = ''pending_admin_approval''';
  v_hits integer;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_company_notifications';

  if v_def is null then
    raise exception 'get_company_notifications() not found';
  end if;

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);

  -- Already migrated is not an error; re-running must be a no-op.
  if v_hits = 0 and position('doctor_status = ''pending_admin_approval''' in v_def) > 0 then
    return;
  end if;

  if v_hits <> 1 then
    raise exception 'expected exactly one pending_delivery predicate, found %', v_hits;
  end if;

  execute replace(v_def, v_old, v_new);
end
$mig$;
