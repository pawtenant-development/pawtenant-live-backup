-- LIVE-PSD-ONE-TWO-DOG-129-ROLLOUT-001
-- Public display metadata only. Charge amounts are server-authoritative in the
-- two payment Edge Functions; historical orders are never recalculated.

update public.site_pricing_settings
set
  label = 'PSD Letter — One-Time (up to 2 dogs)',
  description = 'One-time PSD letter covering up to 2 dogs for $129. Exactly 3 dogs = $149 fixed total. Letters are typically delivered within 24 hours after provider review.',
  updated_at = now()
where key = 'psd_standard';

update public.site_pricing_settings
set
  label = 'PSD Letter — 3 Dogs (fixed total)',
  description = 'One-time PSD letter fixed total covering exactly 3 dogs.',
  updated_at = now()
where key = 'psd_multi_dog';
