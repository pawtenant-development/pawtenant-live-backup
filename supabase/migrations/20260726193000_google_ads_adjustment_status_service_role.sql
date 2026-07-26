-- GOOGLE-ADS-REFUND-ADJUSTMENT-LEDGER-RECONCILIATION-FIX-001 (follow-up)
--
-- `reconcile` is invoked by the SERVER (service_role), which is not an admin
-- USER, so the admin-only gate returned {"error":"forbidden"} and the reconcile
-- response silently lost its ledger block. Allow the service role explicitly.
-- Browser clients remain gated by check_is_admin(); anon still has no grant.
--
-- Additive + idempotent. Read-only function. No Google call, no cron.

create or replace function public.get_google_ads_refund_adjustment_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not (public.check_is_admin() or coalesce(auth.role(), '') = 'service_role')
      then jsonb_build_object('error','forbidden')
    else
    (select jsonb_build_object(
      'pending',                       count(*) filter (where status = 'pending'),
      'dry_run_ready',                 count(*) filter (where status = 'dry_run_ready'),
      'blocked_original_not_uploaded', count(*) filter (where status = 'blocked_original_not_uploaded'),
      'blocked_outside_window',        count(*) filter (where status = 'blocked_outside_adjustment_window'),
      'blocked_value_integrity',       count(*) filter (where status = 'blocked_value_integrity'),
      'retryable_errors',              count(*) filter (where status = 'retryable_error'),
      'terminal_errors',               count(*) filter (where status = 'terminal_error'),
      'uploaded',                      count(*) filter (where status = 'uploaded'),
      'last_shadow_run',               max(last_attempt_at),
      'mutation_calls_sent',           count(*) filter (where uploaded_at is not null)
    ) from public.google_ads_conversion_adjustments)
  end;
$$;

revoke all on function public.get_google_ads_refund_adjustment_status() from public, anon;
grant execute on function public.get_google_ads_refund_adjustment_status() to authenticated, service_role;
