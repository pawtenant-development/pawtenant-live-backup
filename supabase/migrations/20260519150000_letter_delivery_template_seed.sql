-- Seed the Letter Delivery email template into public.email_templates.
--
-- Why this exists (EMAIL-LETTER-DELIVERY-TEMPLATE-HUB + EMAIL-LETTER-
-- DELIVERY-HTML-TEMPLATE-PARITY):
--   The Communications Templates Hub already manages Order Confirmation
--   and Review Request, but the actual Letter Delivery email — the one
--   sent the moment a provider clicks Notify Patient or an admin clicks
--   Resend / Send All — was hardcoded inside notify-patient-letter and
--   not editable from the admin UI.
--
--   This seed inserts a DB-managed row at slug='letter_delivery',
--   channel='email' so the existing Templates Hub editor surfaces it
--   alongside the other transactional templates. notify-patient-letter
--   prefers this row when present and falls back to the hardcoded
--   buildDocumentsReadyEmail layout when missing or empty.
--
--   The body below is the FULL polished email-safe HTML — same header /
--   cards / footer the hardcoded original produced, with placeholders
--   for everything that varies per send. Plain-text bodies used to be
--   wrapped in a second master layout and the cards collapsed to ugly
--   newlines; full-HTML bodies are now rendered directly by
--   notify-patient-letter (no double wrap) and the Templates Hub
--   preview (also no double wrap).
--
-- ── Actual schema of public.email_templates (confirmed by introspection):
--      id          text          NOT NULL
--      label       text          NOT NULL
--      "group"     text          NOT NULL          -- RESERVED — must be quoted
--      subject     text          NOT NULL
--      body        text          NOT NULL
--      cta_label   text          NOT NULL
--      cta_url     text          NOT NULL
--      channel     text          NOT NULL
--      slug        text          NULL              -- the key edge fns look up by
--      archived    boolean       NOT NULL
--      created_at  timestamptz   NOT NULL
--      updated_at  timestamptz   NOT NULL
--
-- Placeholders supported by notify-patient-letter at send time:
--   {name}             customer first name
--   {order_id}         confirmation_id (PT-XXXX)
--   {document_list}    pre-rendered HTML <tr> rows (icon + label +
--                       Download button — matches the polished design)
--   {portal_url}       https://pawtenant.com/my-orders
--   {verification_id}  letter_id (or empty string when no letter issued)
--   {verification_url} https://pawtenant.com/verify/<letter_id>
--   {provider_name}    order.doctor_name
--   {review_url}       https://pawtenant.com/review/<confirmation_id>
--   {review_cta_label} review button text — defaults to "Leave a Review"
--   {support_email}    hello@pawtenant.com
--
-- Idempotent. Re-runnable.
--
-- We CANNOT use ON CONFLICT (slug, channel) DO NOTHING because the
-- table has no unique constraint on (slug, channel). Instead the DO
-- block does:
--   1. INSERT … SELECT … WHERE NOT EXISTS  (fresh environments)
--   2. UPDATE … WHERE body NOT LIKE %<!DOCTYPE% AND body NOT LIKE %<table%
--      (one-shot upgrade for environments that already have the OLD
--       plain-text seed). Admin-edited HTML bodies — those that already
--       contain <!DOCTYPE or <table or <html — are preserved untouched.

DO $migration$
DECLARE
  v_subject    text := 'Your ESA Letter is here — Order {order_id}';
  v_cta_label  text := 'Leave a Review';
  -- REVIEW-PANEL-GOOGLE-URL-SWITCH (2026-05-19): canonical Google
  -- reviews URL the owner picked. Stored directly in cta_url so the
  -- DB row is the source of truth (admin edits in the Templates Hub
  -- propagate to every subsequent send without an env / redeploy).
  -- notify-patient-letter prefers t.cta_url over GOOGLE_REVIEW_URL
  -- env when resolving {review_url}; the env stays as an override
  -- escape hatch and the hardcoded fallback is a last resort.
  v_cta_url    text := 'https://www.google.com/search?sca_esv=08d3373863b39b87&si=AL3DRZEsmMGCryMMFSHJ3StBhOdZ2-6yYkXd_doETEE1OR-qOcgBj58jmxujTZ7byPAw8npggXTcPRI82lkEhuTmamSruv_EA9uwdfELsrB4RPReQ-OPCTj609pZy3sSjc4oz_EHV8no&q=PawTenant+Reviews&sa=X&ved=2ahUKEwjQzuTHjMSUAxUSA9sEHYkzJfIQ0bkNegQIIRAF';
  v_body       text := $body$<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr>
        <td style="background:#4a9e8a;padding:32px;text-align:center;">
          <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png" width="180" alt="PawTenant" style="display:block;margin:0 auto 16px;height:auto;" />
          <div style="display:inline-block;background:rgba(255,255,255,0.22);color:#ffffff;padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px;">Documents Ready</div>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#ffffff;line-height:1.3;">Your ESA Letter is here!</h1>
          <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.82);">Your signed documents are ready for download</p>
        </td>
      </tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>{name}</strong>,</p>
        <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
          Your ESA letter has been signed and is ready for download. You can access all your documents below or directly through your portal.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f9;border:1px solid #b8cce4;border-radius:12px;margin-bottom:24px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Your Documents</p>
            <table width="100%" cellpadding="0" cellspacing="0">{document_list}</table>
          </td></tr>
        </table>

        <div style="background:#fff8f0;border:1px solid #fed7aa;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.08em;">&#128274; Letter Verification ID</p>
          <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#c2410c;letter-spacing:0.05em;">{verification_id}</p>
          <p style="margin:0;font-size:12px;color:#78350f;">
            Landlords can verify this letter at
            <a href="{verification_url}" style="color:#c2410c;text-decoration:none;font-weight:700;">{verification_url}</a>
          </p>
        </div>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f9;border:1px solid #b8cce4;border-radius:12px;margin-bottom:24px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Order Summary</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:7px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">Order ID</td>
                <td style="padding:7px 0;font-size:13px;font-weight:600;color:#4a7fb5;">{order_id}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">Completed By</td>
                <td style="padding:7px 0;font-size:13px;font-weight:600;color:#4a7fb5;">{provider_name}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;font-size:13px;color:#6b7280;width:160px;vertical-align:top;">Status</td>
                <td style="padding:7px 0;font-size:13px;font-weight:600;color:#111827;"><span style="color:#059669;font-weight:700;">Completed</span></td>
              </tr>
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr><td align="center">
            <a href="{portal_url}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">View All Documents &rarr;</a>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">What To Do With Your Letter</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:7px 0;vertical-align:top;width:30px;">
                  <div style="width:22px;height:22px;background:#4a7fb5;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#fff;">1</div>
                </td>
                <td style="padding:7px 0 7px 10px;font-size:13px;color:#374151;line-height:1.5;">Download your signed ESA letter and keep a digital copy</td>
              </tr>
              <tr>
                <td style="padding:7px 0;vertical-align:top;width:30px;">
                  <div style="width:22px;height:22px;background:#4a7fb5;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#fff;">2</div>
                </td>
                <td style="padding:7px 0 7px 10px;font-size:13px;color:#374151;line-height:1.5;">Present it to your landlord or housing provider as needed</td>
              </tr>
              <tr>
                <td style="padding:7px 0;vertical-align:top;width:30px;">
                  <div style="width:22px;height:22px;background:#4a7fb5;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#fff;">3</div>
                </td>
                <td style="padding:7px 0 7px 10px;font-size:13px;color:#374151;line-height:1.5;">Contact us at any time if you need a renewal or have questions</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px;">
          <tr><td style="padding:24px;text-align:center;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#1a5c4f;text-transform:uppercase;letter-spacing:0.08em;">A Quick Favor</p>
            <h2 style="margin:0 0 10px;font-size:18px;font-weight:800;color:#0f3d34;">How was your PawTenant experience?</h2>
            <p style="margin:0 0 18px;font-size:13px;color:#374151;line-height:1.6;">If everything looks good, we&rsquo;d love a quick review. It takes 30 seconds and helps other pet owners find us. If anything is off, just reply to this email &mdash; we&rsquo;ll make it right.</p>
            <a href="{review_url}" style="display:inline-block;background:#1a5c4f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;">{review_cta_label}</a>
          </td></tr>
        </table>

        <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
          Your ESA letter is legally recognized under the Fair Housing Act. If you ever need assistance, we&rsquo;re always here at <a href="mailto:{support_email}" style="color:#4a7fb5;text-decoration:none;">{support_email}</a>.
        </p>
      </td></tr>
      <tr>
        <td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Questions? Reply to this email or contact us at <a href="mailto:{support_email}" style="color:#4a7fb5;text-decoration:none;">{support_email}</a></p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant &mdash; ESA Consultation &nbsp;&middot;&nbsp; <a href="https://pawtenant.com" style="color:#4a7fb5;text-decoration:none;">pawtenant.com</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>$body$;
BEGIN
  -- 1. Fresh environments: INSERT new row with full HTML body.
  INSERT INTO public.email_templates (
    id, label, "group", subject, body, cta_label, cta_url,
    channel, slug, archived, created_at, updated_at
  )
  SELECT
    gen_random_uuid()::text,
    'Letter Delivery',
    'Transactional',
    v_subject,
    v_body,
    v_cta_label,
    v_cta_url,
    'email',
    'letter_delivery',
    false,
    now(),
    now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.email_templates
     WHERE slug = 'letter_delivery'
       AND channel = 'email'
  );

  -- 2. Upgrade-in-place for environments that already had the OLD
  --    plain-text seed. The LIKE guard ensures we ONLY rewrite rows
  --    that look like the old plain-text body — any admin-edited HTML
  --    body (which would already contain <!DOCTYPE / <table / <html)
  --    is left untouched.
  UPDATE public.email_templates
     SET body       = v_body,
         subject    = v_subject,
         cta_label  = v_cta_label,
         cta_url    = v_cta_url,
         updated_at = now()
   WHERE slug    = 'letter_delivery'
     AND channel = 'email'
     AND body    NOT LIKE '%<!DOCTYPE%'
     AND body    NOT LIKE '%<table%'
     AND body    NOT LIKE '%<html%';

  -- 3. REVIEW-PANEL-GOOGLE-URL-SWITCH (2026-05-19): independently
  --    upgrade cta_url + cta_label for rows that already have the
  --    new HTML body but were seeded with the unsubstituted
  --    '{review_url}' placeholder or an old trustpilot.com URL.
  --    Admin-edited cta_url values (anything else) are preserved.
  UPDATE public.email_templates
     SET cta_url    = v_cta_url,
         cta_label  = v_cta_label,
         updated_at = now()
   WHERE slug    = 'letter_delivery'
     AND channel = 'email'
     AND (
           cta_url = '{review_url}'
        OR cta_url IS NULL
        OR cta_url = ''
        OR cta_url LIKE '%trustpilot.com%'
        OR cta_url LIKE '%pawtenant.com/review/%'
     );
END
$migration$;

COMMENT ON COLUMN public.email_templates.slug IS
  'Template key referenced by edge functions. Notable values: order_confirmation, letter_delivery (DOCS notify-patient-letter), review_request, checkout_recovery, seq_30min/24h/3day.';
