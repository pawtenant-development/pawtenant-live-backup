-- Recovery SMS sequence — Phase 3 follow-up to EMAIL-RECOVERY-SEQUENCE-CONTROL
--
-- Adds the missing SMS half of the recovery sequence:
--   1. comms_settings keys for the 3 SMS stage timings
--   2. orders columns for SMS stage stamps
--   3. email_templates rows (channel='sms') for the 3 SMS stages
--
-- Idempotent + non-destructive. Safe to re-run.
-- Existing email recovery rows from 20260502150000 are not modified.

-- ─── 1. SMS recovery stage timings ──────────────────────────────────────────
INSERT INTO comms_settings (key, value) VALUES
  ('recovery_sms_stage_1_hours', '3'),
  ('recovery_sms_stage_2_hours', '48'),
  ('recovery_sms_stage_final_days', '5')
ON CONFLICT (key) DO NOTHING;

-- ─── 2. Orders columns: SMS stage stamps ────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS sms_seq_stage1_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_seq_stage2_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_seq_final_sent_at  TIMESTAMPTZ;

-- ─── 3. SMS templates (admin can edit in Settings hub) ──────────────────────
INSERT INTO email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug)
VALUES
  ('seq_sms_stage1', 'Recovery SMS — Stage 1', 'Sequence',
   '',
   'Hi {name}! Your PawTenant assessment is saved. Use code {discount_code} to finish: {checkout_link}',
   '', '', 'sms', 'seq_sms_stage1'),

  ('seq_sms_stage2', 'Recovery SMS — Stage 2', 'Sequence',
   '',
   'Hi {name}, still saved. Code {discount_code} for your ESA letter — finish here: {checkout_link}',
   '', '', 'sms', 'seq_sms_stage2'),

  ('seq_sms_final', 'Recovery SMS — Final', 'Sequence',
   '',
   'Hi {name}, final reminder. Use {discount_code} — last chance to finish: {checkout_link}',
   '', '', 'sms', 'seq_sms_final')
ON CONFLICT (id) DO NOTHING;
