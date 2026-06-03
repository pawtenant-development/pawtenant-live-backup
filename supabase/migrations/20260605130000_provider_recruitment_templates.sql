-- PAWTENANT-PROVIDER-RECRUITMENT-V2: editable email templates
-- Two branded, self-contained HTML templates editable in the Communications
-- Template Hub. Variables use single-brace {var} substitution (matches
-- send-templated-email). Bodies start with <!DOCTYPE so they ship as-is
-- (already branded with the apex logo header) without double-wrapping.
--
-- Idempotent: INSERT only when the slug does not already exist, so admin edits
-- are never overwritten on re-run.

DO $migration$
DECLARE
  v_logo text := 'https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png';
  -- ── Recruitment outreach ────────────────────────────────────────────────
  v_rec_subject text := 'Partner with PawTenant — Licensed Provider Network';
  v_rec_body text := $body$<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
<tr><td style="background:#4a9e8a;padding:32px;text-align:center;">
<img src="https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png" width="180" alt="PawTenant" style="display:block;margin:0 auto 16px;height:auto;" />
<div style="display:inline-block;background:rgba(255,255,255,0.22);color:#ffffff;padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px;">Provider Network</div>
<h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#ffffff;line-height:1.3;">Partner with PawTenant</h1>
<p style="margin:0;font-size:14px;color:rgba(255,255,255,0.82);">Join our licensed mental health provider network</p>
</td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>{name}</strong>,</p>
{custom_intro}
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">PawTenant helps clients obtain compliant ESA and PSD documentation through licensed mental health providers. We&rsquo;re expanding our provider network and are looking to partner with licensed providers authorized to practice in the state(s) below.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:12px;margin:0 0 24px;"><tr><td style="padding:18px 22px;">
<p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">States We&rsquo;re Expanding In</p>
<p style="margin:0;font-size:14px;font-weight:700;color:#2f5d8a;">{states}</p>
</td></tr></table>
<p style="margin:0 0 22px;font-size:15px;color:#374151;line-height:1.7;">Providers review structured client intake, apply their own clinical judgment, and approve only when clinically appropriate. PawTenant handles checkout, intake routing, document delivery, and admin support. You accept cases on your own schedule.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td align="center">
<a href="{join_url}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">Join Our Provider Network &rarr;</a>
</td></tr></table>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">Prefer to ask first? Just reply to this email with your licensed state(s) and we&rsquo;ll follow up.<br/><br/>Warm regards,<br/><strong style="color:#374151;">The PawTenant Provider Partnerships Team</strong><br/><a href="mailto:hello@pawtenant.com" style="color:#4a7fb5;text-decoration:none;">hello@pawtenant.com</a></p>
</td></tr>
<tr><td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant &nbsp;&middot;&nbsp; <a href="https://pawtenant.com" style="color:#4a7fb5;text-decoration:none;">pawtenant.com</a></p>
</td></tr></table></td></tr></table></body></html>$body$;

  -- ── Final onboarding / welcome ──────────────────────────────────────────
  v_onb_subject text := 'Welcome to PawTenant — Final Onboarding Steps';
  v_onb_body text := $body$<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
<tr><td style="background:#4a9e8a;padding:32px;text-align:center;">
<img src="https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png" width="180" alt="PawTenant" style="display:block;margin:0 auto 16px;height:auto;" />
<div style="display:inline-block;background:rgba(255,255,255,0.22);color:#ffffff;padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px;">Welcome Aboard</div>
<h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#ffffff;line-height:1.3;">Welcome to PawTenant</h1>
<p style="margin:0;font-size:14px;color:rgba(255,255,255,0.82);">A few final steps to get you set up</p>
</td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>{name}</strong>,</p>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Your application has been approved &mdash; welcome to the PawTenant provider network. Your confirmed rate is <strong>${per_order_rate} per completed, approved case</strong>. To finish setting up your profile and payouts, please reply to this email with the items below.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f9;border:1px solid #b8cce4;border-radius:12px;margin:0 0 24px;"><tr><td style="padding:20px 24px;">
<p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#2f5d8a;text-transform:uppercase;letter-spacing:0.08em;">To finish onboarding</p>
<p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.6;">&bull; <strong>Voided check</strong> (or ACH details) so we can set up your payouts</p>
<p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.6;">&bull; <strong>LinkedIn profile</strong> link (optional)</p>
<p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.6;">&bull; <strong>Availability</strong> for a short onboarding call, if you&rsquo;d like one</p>
</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:12px;margin:0 0 24px;"><tr><td style="padding:20px 24px;">
<p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Please confirm (already on file)</p>
<p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.6;">&bull; Your <strong>headshot</strong> and short bio for your provider profile</p>
<p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.6;">&bull; Your <strong>license details</strong> and any additional licensed states</p>
<p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">&bull; Your preferred <strong>display name and title</strong></p>
</td></tr></table>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">Just reply to this email with anything outstanding and we&rsquo;ll take it from there.<br/><br/>Welcome again,<br/><strong style="color:#374151;">The PawTenant Provider Partnerships Team</strong><br/><a href="mailto:hello@pawtenant.com" style="color:#4a7fb5;text-decoration:none;">hello@pawtenant.com</a></p>
</td></tr>
<tr><td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant &nbsp;&middot;&nbsp; <a href="https://pawtenant.com" style="color:#4a7fb5;text-decoration:none;">pawtenant.com</a></p>
</td></tr></table></td></tr></table></body></html>$body$;
BEGIN
  PERFORM 1 FROM public.email_templates WHERE slug = 'provider_recruitment_outreach' AND channel = 'email';
  IF NOT FOUND THEN
    INSERT INTO public.email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug, archived)
    VALUES ('provider_recruitment_outreach', 'Provider Recruitment Outreach', 'Provider Recruitment',
            v_rec_subject, v_rec_body, 'Join Our Provider Network', '{join_url}', 'email', 'provider_recruitment_outreach', false);
  END IF;

  PERFORM 1 FROM public.email_templates WHERE slug = 'provider_final_onboarding_welcome' AND channel = 'email';
  IF NOT FOUND THEN
    INSERT INTO public.email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug, archived)
    VALUES ('provider_final_onboarding_welcome', 'Provider Final Onboarding Welcome', 'Provider Recruitment',
            v_onb_subject, v_onb_body, '', '', 'email', 'provider_final_onboarding_welcome', false);
  END IF;
END
$migration$;
