-- Seed the Order Cancelled + Refund templates into public.email_templates.
--
-- Why this exists (REFUND-EMAIL-MISSING):
--   The Refund + Cancel workflow in OrderDetailModal sends the customer
--   notice through send-templated-email using the DB slug
--   `order_cancelled_refund` (email) and renders the SMS from the DB row
--   `sms_order_cancelled_refund` (channel='sms'). Neither row was ever
--   seeded by a migration — they only existed if an admin created them by
--   hand via the Templates Hub "Save to DB" button.
--
--   Result on any environment WITHOUT the manual rows (e.g. production):
--     - send-templated-email returns 404 "Template not found for slug:
--       order_cancelled_refund"  → the refund EMAIL silently fails.
--     - the SMS path has a hardcoded fallback string in OrderDetailModal
--       → the refund SMS still sends.
--   So the customer receives an SMS but NO email when an order is
--   cancelled/refunded. This migration codifies both rows so the email
--   send works everywhere and both surface in the Templates Hub.
--
-- Placeholders substituted at send time:
--   {name}      customer first name (explicit override from the modal)
--   {order_id}  confirmation_id (PT-XXXX)
--   {amount}    formatted refund amount, e.g. $115.00
--   {reason}    cancellation reason
--
-- Idempotent + NON-DESTRUCTIVE. Safe to re-run. ON CONFLICT (id) DO
-- NOTHING preserves any admin-edited body already in the table — we only
-- insert when the row is missing.

-- 1) Customer refund/cancellation EMAIL
INSERT INTO public.email_templates
  (id, label, "group", subject, body, cta_label, cta_url, channel, slug)
VALUES (
  'order_cancelled_refund',
  'Order Cancelled + Refund',
  'Transactional',
  'PawTenant Order Update & Refund Confirmation',
  $body$Hi {name},

We sincerely apologize, but we are currently unable to complete your consultation due to {reason}.

Your order ({order_id}) has been cancelled and a refund of {amount} has been issued to your original payment method.

Refunds generally appear within 3–5 business days, depending on your bank or card provider.

We appreciate your understanding and apologize for the inconvenience. If you have any questions, please reply to this email or contact us at hello@pawtenant.com.

With care,
The PawTenant Team$body$,
  'View My Order',
  'https://pawtenant.com/my-orders',
  'email',
  'order_cancelled_refund'
)
ON CONFLICT (id) DO NOTHING;

-- 2) Customer refund/cancellation SMS (matches the hardcoded fallback in
--    OrderDetailModal so DB becomes the single source of truth).
INSERT INTO public.email_templates
  (id, label, "group", subject, body, cta_label, cta_url, channel, slug)
VALUES (
  'sms_order_cancelled_refund',
  'Order Cancelled + Refund',
  'Transactional',
  '',
  $body$Hi {name}, your PawTenant order {order_id} has been cancelled and a refund of {amount} has been issued. We apologize for the inconvenience — refund timing depends on your bank/provider.$body$,
  '',
  '',
  'sms',
  'sms_order_cancelled_refund'
)
ON CONFLICT (id) DO NOTHING;
