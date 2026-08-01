-- Monthly Business Report — LIVE pg_cron schedule v2 (DST-safe, America/New_York)
-- MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-LIVE-ROLLOUT-001 §I
-- ---------------------------------------------------------------------------
-- THE STRATEGY (proven on TEST)
-- pg_cron evaluates schedules in UTC and cannot express "02:00 America/New_York"
-- across DST (02:00 NY = 06:00Z in summer, 07:00Z in winter). A single fixed
-- UTC time silently drifts an hour twice a year. Instead:
--
--   • The cron fires HOURLY inside a bounded early-month window:
--       '0 6-13 1-5 * *'  =  06:00–13:00 UTC on days 1–5 of each month
--     (= 02:00–09:00 NY in summer, 01:00–08:00 NY in winter — always after the
--     previous business month has fully ended in New York).
--   • The FUNCTION decides, in America/New_York, whether to send:
--       - period = the PREVIOUS business month, only if genuinely complete;
--       - fail-closed gates: LIVE-only, payload loaded, payload reconciled to
--         the cent, paid-media sync available, zero QA fixtures, recipients;
--       - §H delivery gate: a monthly_business_report_runs row with
--         delivery_allowed=false is TERMINAL — neither the cron nor force can
--         send that month. JULY 2026 IS SEEDED THIS WAY (skipped_owner_review),
--         so the first automatically deliverable report is AUGUST 2026,
--         generated in the first firing window of September 2026.
--       - idempotent: unique (report_month, report_type); once status='sent',
--         every later firing is a no-op skip. NO daily duplicate is possible.
--   • Retries across days 1–5 absorb the manual Google Ads spend-sync latency:
--     if spend is not yet synced, the run records status='blocked' (visible!)
--     and the next hourly firing retries; after a send, firings skip.
--
-- Preferred send instant: ~02:00 America/New_York on the 1st (the first firing
-- that passes every gate). DST-safe because the NY-time GATE, not the UTC
-- schedule, decides eligibility.
--
-- Recipient: resolved from monthly_report_recipients (seeded from the LIVE
-- owner-role profile that historically received this report). Never hardcoded
-- in the function or the cron.
--
-- Auth: the LIVE `payout_cron_service_key` Vault secret as the service-role
-- bearer. Secret is read from Vault at runtime — never hardcoded here.

-- ── Create (or replace) the LIVE job — ACTIVE (July is delivery-disabled) ────
select cron.unschedule('monthly-business-report-v2')
where exists (select 1 from cron.job where jobname = 'monthly-business-report-v2');

select cron.schedule(
  'monthly-business-report-v2',
  '0 6-13 1-5 * *',
  $cmd$
  select net.http_post(
    url := 'https://cvwbozlbbmrjxznknouq.supabase.co/functions/v1/send-monthly-business-report',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name='payout_cron_service_key' limit 1), '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cmd$
);

-- ── Rollback (exact) ─────────────────────────────────────────────────────────
--   disable:  select cron.alter_job(job_id := (select jobid from cron.job where jobname='monthly-business-report-v2'), active := false);
--   delete:   select cron.unschedule('monthly-business-report-v2');
--   delivery kill-switch for a specific month (stronger than disabling the cron):
--     update monthly_business_report_runs set delivery_allowed=false, status='skipped_owner_review'
--      where report_month='YYYY-MM' and report_type='monthly_business';

-- ── Manual run examples (admin JWT or service key required) ─────────────────
--   POST .../send-monthly-business-report  {"dry_run":true,"month":"2026-07"}   -- preview only, never sends
--   POST .../send-monthly-business-report  {"month":"2026-07"}                  -- BLOCKED: July delivery_allowed=false (terminal)
--   POST .../send-monthly-business-report  {"month":"2026-08","force":true}     -- resend an already-sent month (idempotency override ONLY)
