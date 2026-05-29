-- EARN-PAYOUT-ACCURACY-PROVIDER-FILTERS-REMINDERS (LIVE mirror)
-- LIVE-SAFE payout reminder cron fix. Mirrors the TEST fix but targets the LIVE
-- Supabase project URL (cvwbozlbbmrjxznknouq). Do NOT use the TEST migration on
-- LIVE — it hardcodes the TEST URL.
--
-- Problem: LIVE cron jobs payout-reminder-12th / -27th called
-- current_setting('app.supabase_url'), a GUC that was never set, so every run
-- failed: ERROR: unrecognized configuration parameter "app.supabase_url".
-- Result: no LIVE payout reminder ever auto-sent.
--
-- Fix: point the jobs at the LIVE function URL and read the auth key from Vault
-- (no secret in the repo). Idempotent — safe to run repeatedly.
--
-- ONE-TIME MANUAL STEP (run once in the LIVE Supabase SQL editor; key never enters git):
--   select vault.create_secret('PASTE_LIVE_SERVICE_ROLE_KEY_HERE','payout_cron_service_key','LIVE service role key for payout reminder cron');
-- Until that secret exists the Authorization header is empty and the function
-- safely returns 401 (no email sent).

do $$
declare r record;
begin
  for r in select jobid from cron.job where command ilike '%send-payout-reminder%' loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'payout-reminder-12th',
  '0 9 12 * *',
  $cmd$SELECT net.http_post(
  url := 'https://cvwbozlbbmrjxznknouq.supabase.co/functions/v1/send-payout-reminder',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name='payout_cron_service_key' limit 1), '')
  ),
  body := '{"force":true}'::jsonb
);$cmd$
);

select cron.schedule(
  'payout-reminder-27th',
  '0 9 27 * *',
  $cmd$SELECT net.http_post(
  url := 'https://cvwbozlbbmrjxznknouq.supabase.co/functions/v1/send-payout-reminder',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'Authorization','Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name='payout_cron_service_key' limit 1), '')
  ),
  body := '{"force":true}'::jsonb
);$cmd$
);
