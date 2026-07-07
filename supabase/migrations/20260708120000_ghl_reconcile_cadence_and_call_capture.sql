-- 20260708120000_ghl_reconcile_cadence_and_call_capture  (LIVE cvwbozlbbmrjxznknouq)
-- GHL-CALL-CAPTURE-AND-RECONCILE-CADENCE-001:
--   1. Speed up the outbound-SMS reconcile from every 15 min to every 3 min.
--   2. Schedule the new outbound-CALL reconcile every 3 min.
-- Both are capture-only pollers of the GHL export API; dedupe is airtight
-- (twilio_sid = ghl:<id> + unique dedupe_key), so a tighter cadence with an
-- overlapping lookback is safe and cheap (≈1–3 GHL calls/run, far under limits).
--
-- LIVE-only job names (no TEST collision), so a migration is appropriate here.
-- Idempotent: unschedule the prior job(s) by name, then (re)schedule.
-- ⚠ LIVE project URL below — change the ref before any hypothetical mirror.

-- 1. ghl-message-reconcile: */15 → */3
do $$
begin
  perform cron.unschedule('ghl-message-reconcile');
exception when others then null;
end $$;

select cron.schedule(
  'ghl-message-reconcile',
  '*/3 * * * *',
  $cron$
  select net.http_post(
    url := 'https://cvwbozlbbmrjxznknouq.supabase.co/functions/v1/ghl-message-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'payout_cron_service_key' limit 1), '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);

-- 2. ghl-call-reconcile: new, */3
do $$
begin
  perform cron.unschedule('ghl-call-reconcile');
exception when others then null;
end $$;

select cron.schedule(
  'ghl-call-reconcile',
  '*/3 * * * *',
  $cron$
  select net.http_post(
    url := 'https://cvwbozlbbmrjxznknouq.supabase.co/functions/v1/ghl-call-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'payout_cron_service_key' limit 1), '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);
