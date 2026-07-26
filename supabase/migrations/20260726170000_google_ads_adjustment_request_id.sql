-- GOOGLE-ADS-REFUND-ADJUSTMENT-CANARY-EXECUTION-PREP-001
--
-- The protected single-item canary records Google's request-id so a validate-only
-- run and a later real send can each be traced back to an exact API request.
-- Additive + idempotent. No data mutated, no cron, no Google call.

alter table public.google_ads_conversion_adjustments
  add column if not exists google_request_id text;

comment on column public.google_ads_conversion_adjustments.google_request_id is
  'Google Ads request-id header from the most recent adjustment request (validate-only or real). Diagnostic trace only.';

-- Validate-only runs must never look like a completed upload: they write only
-- last_attempt_at + a safe google_response_summary.last_validation block, and
-- must leave uploaded_at NULL and status unchanged.
comment on column public.google_ads_conversion_adjustments.uploaded_at is
  'Set ONLY after Google accepts a REAL (validateOnly=false) adjustment. A validate-only canary must never set this.';
