-- Provider approval is a self-service setup flow. No onboarding meeting is
-- required; providers receive a clear checklist before case assignment.

DO $migration$
DECLARE
  v_subject text := 'Welcome to PawTenant — Complete Your Provider Setup';
  v_body text := $body$<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
<tr><td style="background:#4a9e8a;padding:32px;text-align:center;">
<img src="https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png" width="180" alt="PawTenant" style="display:block;margin:0 auto 16px;height:auto;" />
<div style="display:inline-block;background:rgba(255,255,255,0.22);color:#ffffff;padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px;">Welcome Aboard</div>
<h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#ffffff;line-height:1.3;">Welcome to PawTenant</h1>
<p style="margin:0;font-size:14px;color:rgba(255,255,255,0.82);">Complete your provider setup at your own pace</p>
</td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>{name}</strong>,</p>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Your application has been approved &mdash; welcome to the PawTenant provider network. Your confirmed rate is <strong>${per_order_rate} per completed, approved case</strong>.</p>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;"><strong>No onboarding meeting is required.</strong> You can complete the remaining setup by email and through your Provider Portal.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f9;border:1px solid #b8cce4;border-radius:12px;margin:0 0 24px;"><tr><td style="padding:20px 24px;">
<p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#2f5d8a;text-transform:uppercase;letter-spacing:0.08em;">Required before case assignment</p>
<p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.6;">&bull; A <strong>voided check</strong> or ACH details so we can set up payouts</p>
<p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.6;">&bull; Your professional <strong>headshot and short bio</strong></p>
<p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.6;">&bull; Active <strong>license details</strong> for every state and your <strong>NPI</strong></p>
<p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">&bull; Your preferred <strong>display name and professional title</strong></p>
</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:12px;margin:0 0 24px;"><tr><td style="padding:20px 24px;">
<p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Optional</p>
<p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">&bull; Your LinkedIn profile link</p>
</td></tr></table>
<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.7;">Please reply to this email with anything outstanding. Once the required payout, profile, and licensing details are complete and verified, your account will be ready for case assignments. You can then manage assigned cases through the Provider Portal.</p>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">Welcome again,<br/><strong style="color:#374151;">The PawTenant Provider Partnerships Team</strong><br/><a href="mailto:hello@pawtenant.com" style="color:#4a7fb5;text-decoration:none;">hello@pawtenant.com</a></p>
</td></tr>
<tr><td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant &nbsp;&middot;&nbsp; <a href="https://pawtenant.com" style="color:#4a7fb5;text-decoration:none;">pawtenant.com</a></p>
</td></tr></table></td></tr></table></body></html>$body$;
BEGIN
  UPDATE public.email_templates
  SET label = 'Provider Welcome and Setup',
      "group" = 'Provider Recruitment',
      subject = v_subject,
      body = v_body,
      cta_label = '',
      cta_url = '',
      archived = false
  WHERE slug = 'provider_final_onboarding_welcome'
    AND channel = 'email';

  IF NOT FOUND THEN
    INSERT INTO public.email_templates
      (id, label, "group", subject, body, cta_label, cta_url, channel, slug, archived)
    VALUES
      ('provider_final_onboarding_welcome', 'Provider Welcome and Setup', 'Provider Recruitment',
       v_subject, v_body, '', '', 'email', 'provider_final_onboarding_welcome', false);
  END IF;
END
$migration$;
