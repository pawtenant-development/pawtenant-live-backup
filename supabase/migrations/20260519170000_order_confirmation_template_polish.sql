-- Polish the order_confirmation template body.
--
-- Remove the inline plain-text "Order ID/State/Plan/Delivery/Amount Paid"
-- block from the body — those fields are now rendered as a structured,
-- mobile-safe details card by the edge functions (resend-confirmation-email
-- and send-templated-email), via the shared _shared/orderConfirmationLayout
-- helper. This guarantees the automatic webhook + client_fallback email and
-- the admin Comms manual email look identical.
--
-- The new body uses the [ORDER_DETAILS] marker on its own line to control
-- where the card renders inside the body. If an admin accidentally removes
-- the marker, the card falls through to the end (graceful default).
--
-- Idempotent + non-destructive: WHERE clause only matches the prior
-- seed-default body, so re-runs are no-ops and any later admin edits beyond
-- the seed are preserved (the migration won't overwrite them).
-- Letter delivery template is NOT touched.

UPDATE email_templates
SET body = E'Hi {name},\n\nThank you for choosing PawTenant. Your ESA consultation has been confirmed and a licensed mental health provider will be reviewing your case shortly.\n\n[ORDER_DETAILS]\n\nWhat happens next:\n1. A licensed provider reviews your assessment and pet information.\n2. They prepare and sign your official ESA letter.\n3. You receive your completed documents by email and in your portal.\n\nYou don''t need to do anything right now. We''ll send you another email the moment your documents are ready.'
WHERE id = 'order_confirmation'
  AND slug = 'order_confirmation'
  AND channel = 'email'
  AND body LIKE '%Order ID: {order_id}%'
  AND body LIKE '%State: {state}%';
