-- Recovery sequence control — Phase 3 follow-up
-- EMAIL-RECOVERY-SEQUENCE-CONTROL
--
-- Adds:
--   1. comms_settings keys for the recovery toggles + 5-stage timings
--   2. orders columns for stages 3 & 5 stamps + per-channel unsubscribe flags
--   3. email_templates rows for seq_48h and seq_5day (additive only)
--
-- Idempotent + non-destructive. Safe to re-run.
-- Does NOT modify existing template content for seq_30min, seq_24h, seq_3day.

-- ─── 1. Recovery settings (defaults) ────────────────────────────────────────
INSERT INTO comms_settings (key, value) VALUES
  ('recovery_enabled',         'true'),
  ('recovery_email_enabled',   'true'),
  ('recovery_sms_enabled',     'false'),
  ('recovery_stage_1_minutes', '30'),
  ('recovery_stage_2_hours',   '24'),
  ('recovery_stage_3_hours',   '48'),
  ('recovery_stage_4_days',    '3'),
  ('recovery_stage_5_days',    '5')
ON CONFLICT (key) DO NOTHING;

-- ─── 2. Orders columns ──────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS seq_48h_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seq_5day_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_unsubscribed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_unsubscribed   BOOLEAN NOT NULL DEFAULT false;

-- ─── 3. New email templates (admin can edit in Settings hub) ────────────────
INSERT INTO email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug)
VALUES
  ('seq_48h', '48-Hour Sequence + Discount', 'Sequence',
   'Still saved — here''s {discount_code} for your {letter_type}',
   E'Hi {name},\n\nYour {letter_type} assessment answers are still saved with PawTenant. Here''s an exclusive code to help you finish today.\n\nUse promo code at checkout: {discount_code}\n\nApplies automatically — limited time only.',
   'Complete With My Discount', '{resume_url_with_promo}', 'email', 'seq_48h'),

  ('seq_5day', '5-Day Sequence + Final Offer', 'Sequence',
   'One last chance — {discount_code} for your {letter_type}',
   E'Hi {name},\n\nThis is the last reminder we''ll send. Your {letter_type} assessment answers are still saved, and we''d love to help you complete your application.\n\nUse this final code at checkout: {discount_code}\n\nThis offer won''t be repeated.',
   'Claim My Final Offer', '{resume_url_with_promo}', 'email', 'seq_5day')
ON CONFLICT (id) DO NOTHING;
