-- GOOGLE-ADS-REFUND-ADJUSTMENT-LEDGER-RECONCILIATION-FIX-001
--
-- The refund classifier re-derives candidates from `orders` on every run and has
-- no memory, so an order whose conversion was ALREADY retracted still looks like
-- a perfect candidate. Application code now overlays the durable ledger outcome,
-- but application-only checks are not sufficient for financial evidence: this
-- migration makes an ACCEPTED adjustment immutable in the database itself.
--
-- Additive + idempotent. No Google call. No cron. No data reclassified.

-- ── 1. Accepted adjustments are immutable ────────────────────────────────────
-- A row is "accepted" once uploaded_at is set (or it carries Google identifiers).
-- After that, the fields that prove WHAT happened cannot change, and the row can
-- never be walked back to an actionable state.
create or replace function public.tg_google_ads_adjustment_protect_uploaded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  was_accepted boolean;
begin
  was_accepted := old.uploaded_at is not null
               or old.status = 'uploaded'
               or old.google_request_id is not null
               or old.google_job_id is not null;

  if not was_accepted then
    return new;   -- pending rows stay freely updatable
  end if;

  if tg_op = 'DELETE' then
    raise exception 'google_ads_conversion_adjustments: accepted adjustment % is immutable (delete blocked)', old.id
      using errcode = 'check_violation';
  end if;

  -- Status may never leave 'uploaded' for an actionable state.
  if new.status is distinct from old.status then
    raise exception 'google_ads_conversion_adjustments: accepted adjustment % cannot change status (% -> %)', old.id, old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- Acceptance evidence is write-once.
  if new.uploaded_at            is distinct from old.uploaded_at
     or new.google_request_id   is distinct from old.google_request_id
     or new.google_job_id       is distinct from old.google_job_id
     or new.google_response_summary is distinct from old.google_response_summary
     or new.attempt_count       is distinct from old.attempt_count
     or new.original_order_or_transaction_id is distinct from old.original_order_or_transaction_id
     or new.conversion_action_id is distinct from old.conversion_action_id
     or new.adjustment_type     is distinct from old.adjustment_type
     or new.idempotency_key     is distinct from old.idempotency_key
  then
    raise exception 'google_ads_conversion_adjustments: accepted adjustment % has immutable completion fields', old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_google_ads_adjustment_protect_uploaded on public.google_ads_conversion_adjustments;
create trigger trg_google_ads_adjustment_protect_uploaded
  before update or delete on public.google_ads_conversion_adjustments
  for each row execute function public.tg_google_ads_adjustment_protect_uploaded();

revoke all on function public.tg_google_ads_adjustment_protect_uploaded() from public, anon, authenticated;

-- ── 2. Read-only discrepancy report for `reconcile` ──────────────────────────
-- Reports drift WITHOUT mutating anything and WITHOUT reopening an uploaded row.
create or replace function public.get_google_ads_adjustment_discrepancies()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cand as (
    select * from public.get_google_ads_refund_adjustment_candidates(200)
  ),
  led as (
    select * from public.google_ads_conversion_adjustments
  )
  select jsonb_build_object(
    -- An uploaded adjustment whose order STILL re-derives as a candidate. This is
    -- expected and benign — it is exactly the drift the ledger overlay suppresses.
    'uploaded_but_rediscovered', (
      select count(*) from led l join cand c
        on c.order_transaction_id = l.original_order_or_transaction_id
      where l.uploaded_at is not null),
    'ready',            (select count(*) from led where status = 'dry_run_ready'),
    'uploaded',         (select count(*) from led where status = 'uploaded'),
    'blocked',          (select count(*) from led where status like 'blocked%'),
    'skipped',          (select count(*) from led where status like 'skipped%'),
    'superseded',       (select count(*) from led where status = 'superseded'),
    'terminal_error',   (select count(*) from led where status = 'terminal_error'),
    -- A live candidate with no ledger row at all (newly discovered).
    'candidate_missing_from_ledger', (
      select count(*) from cand c
      where not exists (select 1 from led l
                        where l.original_order_or_transaction_id = c.order_transaction_id)),
    -- A ledger row whose order no longer appears in source refund data.
    'ledger_row_unsupported_by_source', (
      select count(*) from led l
      where not exists (select 1 from cand c
                        where c.order_transaction_id = l.original_order_or_transaction_id)),
    -- More than one ACTIVE row per conversion (the partial unique index should
    -- make this impossible; reported so a regression cannot hide).
    'duplicate_active_rows', (
      select coalesce(sum(n - 1), 0) from (
        select count(*) as n from led
        where status in ('pending','dry_run_ready','retryable_error')
        group by original_order_or_transaction_id, conversion_action_id
        having count(*) > 1) d),
    -- An uploaded row missing its acceptance evidence.
    'uploaded_missing_evidence', (
      select count(*) from led
      where status = 'uploaded'
        and (uploaded_at is null or google_request_id is null)),
    'ready_value',    (select coalesce(sum(original_value),0) from led where status = 'dry_run_ready'),
    'uploaded_value', (select coalesce(sum(original_value),0) from led where status = 'uploaded')
  );
$$;

revoke all on function public.get_google_ads_adjustment_discrepancies() from public, anon, authenticated;
grant execute on function public.get_google_ads_adjustment_discrepancies() to service_role;
