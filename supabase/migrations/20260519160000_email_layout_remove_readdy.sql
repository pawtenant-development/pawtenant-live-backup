-- Strip the Readdy-hosted logo from the master email layout and replace it
-- with a text-only "PawTenant" heading. Resend Insights was flagging the
-- external static.readdy.ai image; this also makes the header render even
-- when the recipient blocks remote images.
--
-- Affects the master layout used by every email rendered through
-- send-templated-email and resend-confirmation-email (loadMasterLayout).
-- Does NOT touch letter_delivery — notify-patient-letter renders its own
-- inline layout and does not read comms_settings.email_layout_html.
--
-- Idempotent: REPLACE is a no-op once the Readdy URL is gone.
-- Non-destructive: only changes the <img> tag inside the header td; the
-- rest of the layout (footer, links, padding, borders) stays intact.

UPDATE comms_settings
SET value = REPLACE(
  value,
  '<img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png" width="160" alt="PawTenant" style="display:block;margin:0 auto 10px;height:auto;" />',
  '<h1 style="margin:0 0 6px 0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.01em;">PawTenant</h1>'
)
WHERE key = 'email_layout_html'
  AND value LIKE '%static.readdy.ai%';
