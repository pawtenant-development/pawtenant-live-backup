-- Swap the text-only "PawTenant" heading in the master email layout for the
-- actual PawTenant white logo, hosted on the PawTenant domain. Because the
-- image lives on www.pawtenant.com (same domain as the From address),
-- Resend Insights does not flag it as third-party / CDN — unlike the prior
-- static.readdy.ai image which was removed by 20260519160000.
--
-- Idempotent + non-destructive: REPLACE matches only the previous text-only
-- <h1>PawTenant</h1> swap; re-runs are no-ops, and any admin edits beyond
-- that exact string are preserved.

UPDATE comms_settings
SET value = REPLACE(
  value,
  '<h1 style="margin:0 0 6px 0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.01em;">PawTenant</h1>',
  '<img src="https://www.pawtenant.com/assets/brand/pawtenant-logo-white-02.png" width="160" alt="PawTenant" style="display:block;margin:0 auto;height:auto;max-width:160px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />'
)
WHERE key = 'email_layout_html'
  AND value LIKE '%>PawTenant</h1>%';
