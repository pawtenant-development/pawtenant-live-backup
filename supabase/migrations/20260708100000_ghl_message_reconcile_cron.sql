-- 20260708100000_ghl_message_reconcile_cron  (LIVE cvwbozlbbmrjxznknouq)
-- LIVE-GHL-OUTBOUND-CAPTURE-001: schedule the outbound-SMS reconcile poller.
--
-- ghl-message-reconcile pulls recent OUTBOUND SMS from the GHL Conversations
-- export API and inserts any not already logged into communications
-- (capture-only, never sends). Every 15 minutes; the function's default
-- 30-minute lookback overlaps runs so nothing is missed, and its dedupe
-- (twilio_sid = ghl:<id> + unique dedupe_key ghl-out:<id>) makes overlap safe.
-- Idempotent: unschedule any prior job, then (re)schedule.
do $$
begin
  perform cron.unschedule('ghl-message-reconcile');
exception when others then
  null; -- job did not exist yet
end $$;

select cron.schedule(
  'ghl-message-reconcile',
  '*/15 * * * *',
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
