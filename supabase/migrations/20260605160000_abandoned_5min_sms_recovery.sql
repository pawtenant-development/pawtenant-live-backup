-- Abandoned-payment recovery: enable a 5-minute SMS stage for unpaid leads.
-- Additive + idempotent. Does NOT change checkout/payment logic or existing
-- email stages. Adds two columns on orders:
--   sms_5min_sent_at  — idempotency stamp for the one-time 5-minute recovery SMS
--   sms_opted_out     — SMS-specific opt-out (separate from email followup_opt_out)
--
-- SAFE ROLLOUT: backfill sms_5min_sent_at = now() on all EXISTING rows so the
-- new SMS stage never fires retroactively against historical unpaid leads.
-- Only leads created AFTER this migration (sms_5min_sent_at IS NULL) can receive
-- the 5-minute recovery SMS.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sms_5min_sent_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sms_opted_out boolean NOT NULL DEFAULT false;

-- One-time safe backfill (only touches NULLs, so re-running is a no-op).
UPDATE public.orders SET sms_5min_sent_at = now() WHERE sms_5min_sent_at IS NULL;
