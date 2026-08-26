-- Keep provider-facing email copy aligned with the automated application flow.
-- The application already captures and validates licensing and NPI data, so
-- the approval email must not request those details again.

DO $migration$
DECLARE
  v_body text;
BEGIN
  SELECT body
    INTO v_body
    FROM public.email_templates
   WHERE slug = 'provider_final_onboarding_welcome'
     AND channel = 'email'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider welcome template is missing';
  END IF;

  v_body := replace(
    v_body,
    '<strong>No onboarding meeting is required.</strong> You can complete the remaining setup by email and through your Provider Portal.',
    'Please complete any outstanding account details by email and through your Provider Portal before cases can be assigned.'
  );

  -- Earlier environments used a different welcome-template generation. Keep
  -- this cleanup narrowly targeted to those exact provider-visible elements.
  v_body := regexp_replace(
    v_body,
    '<p[^>]*>To finish onboarding</p>',
    '<p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#2f5d8a;text-transform:uppercase;letter-spacing:0.08em;">Required before case assignment</p>',
    'gi'
  );

  v_body := regexp_replace(
    v_body,
    '<p[^>]*>&bull; <strong>Availability</strong> for a short onboarding call, if you&rsquo;d like one</p>',
    '',
    'gi'
  );

  v_body := replace(
    v_body,
    '<p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.6;">&bull; Active <strong>license details</strong> for every state and your <strong>NPI</strong></p>',
    ''
  );

  v_body := replace(
    v_body,
    'Once the required payout, profile, and licensing details are complete and verified,',
    'Once the required payout and profile details are complete and verified,'
  );

  IF position('onboarding' IN lower(v_body)) > 0 THEN
    RAISE EXCEPTION 'Provider welcome body still contains prohibited meeting/setup terminology';
  END IF;

  IF position('npi' IN lower(v_body)) > 0 THEN
    RAISE EXCEPTION 'Provider welcome body still requests NPI information';
  END IF;

  UPDATE public.email_templates
     SET body = v_body,
         label = 'Provider Welcome and Setup'
   WHERE slug = 'provider_final_onboarding_welcome'
     AND channel = 'email';
END
$migration$;
