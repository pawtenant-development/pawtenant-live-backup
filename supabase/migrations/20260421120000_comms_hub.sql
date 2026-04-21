-- comms_hub: create email_templates if missing, unify email+SMS templates
-- Safe for fresh (pawtenant-test) and live (table already exists) DBs

CREATE TABLE IF NOT EXISTS email_templates (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL DEFAULT '',
  "group"      TEXT NOT NULL DEFAULT 'General',
  subject      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  cta_label    TEXT NOT NULL DEFAULT '',
  cta_url      TEXT NOT NULL DEFAULT '',
  channel      TEXT NOT NULL DEFAULT 'email',
  slug         TEXT,
  archived     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add new columns idempotently (no-op if table was pre-existing with them)
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS channel  TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS slug     TEXT,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS email_templates_channel_idx ON email_templates (channel);
CREATE INDEX IF NOT EXISTS email_templates_slug_idx    ON email_templates (slug);

-- Settings table
CREATE TABLE IF NOT EXISTS comms_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO comms_settings (key, value) VALUES
  ('seq_template_30min', 'seq_30min'),
  ('seq_template_24h',   'seq_24h'),
  ('seq_template_3day',  'seq_3day')
ON CONFLICT (key) DO NOTHING;

-- Seed SMS templates
INSERT INTO email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug)
VALUES
  ('sms_order_confirmed',    'Order Confirmed',        'Transactional', '', 'Hi {name}, your ESA consultation with PawTenant is confirmed! Your Order ID is {order_id}. Track your order anytime at pawtenant.com/my-orders', '', '', 'sms', 'sms_order_confirmed'),
  ('sms_documents_ready',    'Documents Ready',        'Transactional', '', 'Hi {name}, great news! Your ESA letter is ready. Log in to download your documents at pawtenant.com/my-orders', '', '', 'sms', 'sms_documents_ready'),
  ('sms_under_review',       'Under Review',           'Transactional', '', 'Hi {name}, your ESA assessment is under review by our licensed provider. We''ll notify you as soon as it''s complete, usually within 24 hours.', '', '', 'sms', 'sms_under_review'),
  ('sms_finish_esa',         'Finish Your ESA Letter', 'Lead Recovery',  '', 'Hi {name}, you''re one step away from your ESA letter! Complete your order here: pawtenant.com/assessment?resume={order_id}', '', '', 'sms', 'sms_finish_esa'),
  ('sms_still_thinking',     'Still Thinking?',        'Lead Recovery',  '', 'Hi {name}, still thinking about your ESA letter? Get it today and avoid housing issues. Complete here: pawtenant.com/assessment?resume={order_id}', '', '', 'sms', 'sms_still_thinking'),
  ('sms_consultation_booked','Consultation Booked',    'Lead Recovery',  '', 'Hi {name}, your provider consultation with PawTenant is confirmed! Complete your payment to lock in your spot: pawtenant.com/assessment?resume={order_id}', '', '', 'sms', 'sms_consultation_booked'),
  ('sms_need_more_info',     'Need More Info',          'Transactional', '', 'Hi {name}, we need a bit more information to complete your ESA assessment. Please reply here or call us and we''ll get you sorted quickly!', '', '', 'sms', 'sms_need_more_info'),
  ('sms_follow_up',          'Follow Up',              'General',        '', 'Hi {name}, just checking in on your ESA order. Is there anything we can help you with?', '', '', 'sms', 'sms_follow_up'),
  ('sms_refund_processed',   'Refund Processed',       'Transactional', '', 'Hi {name}, your refund has been processed and should appear in your account within 3-5 business days. Thank you for your patience.', '', '', 'sms', 'sms_refund_processed')
ON CONFLICT (id) DO NOTHING;

-- Seed sequence email templates
INSERT INTO email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug)
VALUES
  ('seq_30min', '30-Min Sequence', 'Sequence',
   'Complete Your {letter_type} Letter — Your answers are saved',
   E'Hi {name},\n\nYou started your {letter_type} letter assessment with PawTenant but didn''t complete checkout. Your answers are saved — pick up right where you left off in just one click.\n\nYour Application Status:\n✓ Assessment complete — answers saved\n● Payment pending — one step left\n\nQuestions? Call us at (409) 965-5885 or reply to this email.',
   'Complete My {letter_type} Letter Payment', '{resume_url}', 'email', 'seq_30min'),

  ('seq_24h', '24-Hour Sequence', 'Sequence',
   'Still thinking? Get your {letter_type} letter today and avoid housing issues.',
   E'Hi {name},\n\nStill thinking about your {letter_type} letter? Thousands of pet owners rely on their ESA letter to avoid housing issues, pet fees, and lease restrictions. Don''t let your pet''s housing security wait.\n\n🐶 Protect your pet''s right to live with you\n🏡 Avoid housing discrimination under the Fair Housing Act\n✅ 100% money-back guarantee if not approved\n\nYour assessment answers are still saved. Complete checkout in under 2 minutes.',
   'Get My {letter_type} Letter Today', '{resume_url}', 'email', 'seq_24h'),

  ('seq_3day', '3-Day Sequence + Discount', 'Sequence',
   'Here''s $20 off your {letter_type} letter (limited time) — Discount code: {discount_code}',
   E'Hi {name},\n\nWe want to make it easy for you to get your {letter_type} letter. Here''s an exclusive $20 off just for you — limited time only.\n\nUse promo code at checkout: {discount_code}\n\nApplies automatically — expires in 48 hours\n\nYour assessment answers are still saved. This discount expires in 48 hours — don''t miss it!',
   'Claim My $20 Discount', '{resume_url_with_promo}', 'email', 'seq_3day')
ON CONFLICT (id) DO NOTHING;

-- Seed checkout recovery templates
INSERT INTO email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug)
VALUES
  ('checkout_recovery', 'Checkout Recovery', 'Lead Recovery',
   'Complete Your {letter_type} Consultation — Order {order_id}',
   E'Hi {name},\n\nYou started a {letter_type} assessment with PawTenant but didn''t complete checkout. Your assessment answers have been saved — pick up right where you left off without filling anything out again.\n\nQuestions? Call us at (409) 965-5885 or reply to this email.',
   'Complete My {letter_type} Payment', '{resume_url}', 'email', 'checkout_recovery'),

  ('checkout_recovery_discount', 'Checkout Recovery + Discount', 'Lead Recovery',
   'Your {letter_type} + Exclusive {discount_savings} Discount Inside — Order {order_id}',
   E'Hi {name},\n\nWe noticed you started a {letter_type} assessment but didn''t complete checkout. We''re offering you an exclusive discount to help you complete your letter today.\n\nUse promo code at checkout: {discount_code}\n\nApplies automatically — expires in 48 hours.\n\nYour assessment answers are still saved. Don''t miss it!',
   'Claim My Discount & Complete', '{resume_url_with_promo}', 'email', 'checkout_recovery_discount')
ON CONFLICT (id) DO NOTHING;

-- Seed review request templates
INSERT INTO email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug)
VALUES
  ('review_request', 'Review Request', 'Transactional',
   '{name}, share your PawTenant experience ⭐',
   E'Hi {name},\n\nWe hope your ESA letter is everything you needed. It was a pleasure supporting you and your pet through this process.\n\nIf you had a positive experience, we''d love to hear about it! Your review helps other pet owners find the support they need — and it means the world to our small team.\n\nTakes less than 60 seconds.',
   '⭐ Write My Review', '{review_url}', 'email', 'review_request'),

  ('review_request_sms', 'Review Request SMS', 'Transactional',
   '', 'Hi {name}! Your ESA letter from PawTenant is complete. If you had a great experience, we''d love a quick Trustpilot review! ⭐ {review_url}',
   '', '', 'sms', 'review_request_sms')
ON CONFLICT (id) DO NOTHING;
