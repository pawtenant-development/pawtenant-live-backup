-- REFUND-POLICY-RUNTIME-CLEANUP-001
-- Align the two active refund-timing templates to the approved 5-10 business days.
-- Idempotent: replace() + LIKE guard => re-runs are no-ops. Fail-safe: raises if a
-- target key is missing/ambiguous. Targets ONLY the two named rows; no other template.
DO $$
DECLARE
  n_email int;
  n_sms int;
BEGIN
  SELECT count(*) INTO n_email FROM public.email_templates
    WHERE id = 'order_cancelled_refund' AND channel = 'email' AND archived = false;
  IF n_email <> 1 THEN
    RAISE EXCEPTION 'order_cancelled_refund: expected exactly 1 active email row, found %', n_email;
  END IF;

  SELECT count(*) INTO n_sms FROM public.email_templates
    WHERE id = 'sms_refund_processed' AND channel = 'sms' AND archived = false;
  IF n_sms <> 1 THEN
    RAISE EXCEPTION 'sms_refund_processed: expected exactly 1 active sms row, found %', n_sms;
  END IF;

  UPDATE public.email_templates
  SET body = replace(body,
        'Refunds generally appear within 3–5 business days, depending on your bank or card provider.',
        'Depending on your bank or payment provider, the credit may take approximately 5–10 business days to appear.'),
      updated_at = now()
  WHERE id = 'order_cancelled_refund' AND channel = 'email' AND archived = false
    AND body LIKE '%3–5 business days%';

  UPDATE public.email_templates
  SET body = replace(body,
        'your refund has been processed and should appear in your account within 3-5 business days.',
        'your refund has been processed. Depending on your bank or payment provider, the credit may take approximately 5-10 business days to appear.'),
      updated_at = now()
  WHERE id = 'sms_refund_processed' AND channel = 'sms' AND archived = false
    AND body LIKE '%3-5 business days%';
END $$;

-- Rollback (manual, if ever needed):
--   UPDATE public.email_templates SET body = replace(body,
--     'Depending on your bank or payment provider, the credit may take approximately 5–10 business days to appear.',
--     'Refunds generally appear within 3–5 business days, depending on your bank or card provider.')
--   WHERE id = 'order_cancelled_refund';
--   UPDATE public.email_templates SET body = replace(body,
--     'your refund has been processed. Depending on your bank or payment provider, the credit may take approximately 5-10 business days to appear.',
--     'your refund has been processed and should appear in your account within 3-5 business days.')
--   WHERE id = 'sms_refund_processed';
