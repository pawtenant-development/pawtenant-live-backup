-- ─────────────────────────────────────────────────────────────────────────
-- 2026-07-03: FINAL pricing structure — display rows (TEST)
-- ─────────────────────────────────────────────────────────────────────────
-- Owner-finalized pricing:
--   ESA one-time:  1 pet $129 · 2 or 3 pets $149 fixed total
--   PSD one-time:  1 dog $129 · 2 or 3 dogs $149 fixed total (both speeds)
--   ESA annual:    1 pet $109/yr · 2 or 3 pets $129/yr fixed total
--   PSD annual:    1 dog $109/yr · 2 or 3 dogs $129/yr fixed total
--   Renewal:       $100/yr subscription renewal
--   Consultation:  $79 (15-minute call) — unchanged
-- DISPLAY ONLY — selling amounts live in create-payment-intent /
-- create-checkout-session (one-time server-computed; annual via the new
-- owner-provided Stripe recurring Price IDs).
-- The retired per-pet add-on row stays deactivated; esa_subscription_addon is
-- deactivated here as the annual model is now a fixed multi-pet total.
-- Idempotent: UPDATEs pin exact values, INSERTs use ON CONFLICT DO NOTHING.
-- ─────────────────────────────────────────────────────────────────────────

-- One-time
update public.site_pricing_settings
   set amount_cents = 14900, display_text = null,
       description  = 'One-time ESA letter fixed total covering 2 or 3 pets (no per-pet add-on).'
 where key = 'esa_multi_pet';

update public.site_pricing_settings
   set amount_cents = 12900, display_text = null,
       label        = 'PSD Letter — Standard (1 dog)',
       description  = 'PSD letter, standard delivery (2-3 business days), 1 dog. 2 or 3 dogs = $149 fixed total.'
 where key = 'psd_standard';

update public.site_pricing_settings
   set amount_cents = 12900, display_text = null,
       label        = 'PSD Letter — Priority 24h (1 dog)',
       description  = 'PSD letter, priority delivery (within 24 hours), 1 dog. 2 or 3 dogs = $149 fixed total.'
 where key = 'psd_priority';

-- Annual — the per-pet add-on model is retired
update public.site_pricing_settings
   set is_active   = false,
       description = 'RETIRED 2026-07: annual multi-pet is now a fixed total — see esa_subscription_multi.'
 where key = 'esa_subscription_addon';

update public.site_pricing_settings
   set amount_cents = 10900, display_text = null,
       label        = 'ESA Annual Subscription (1 pet)',
       description  = 'Annual ESA subscription, 1 pet (per year). 2 or 3 pets = $129/yr fixed total.'
 where key = 'esa_subscription_annual';

update public.site_pricing_settings
   set amount_cents = 10900, display_text = null,
       label        = 'PSD Annual Subscription (1 dog)',
       description  = 'Annual PSD subscription, 1 dog (per year). 2 or 3 dogs = $129/yr fixed total.'
 where key = 'psd_annual';

-- New display keys
insert into public.site_pricing_settings (key, label, service_type, amount_cents, currency, description, sort_order) values
  ('psd_multi_dog',         'PSD Letter — 2 or 3 Dogs (fixed total)',      'psd',          14900, 'USD', 'One-time PSD letter fixed total covering 2 or 3 dogs (both delivery speeds).', 22),
  ('esa_subscription_multi','ESA Annual — 2 or 3 Pets (fixed total/yr)',   'subscription', 12900, 'USD', 'Annual ESA subscription fixed total covering 2 or 3 pets (per year).',        13),
  ('psd_annual_multi',      'PSD Annual — 2 or 3 Dogs (fixed total/yr)',   'psd',          12900, 'USD', 'Annual PSD subscription fixed total covering 2 or 3 dogs (per year).',        24),
  ('renewal_annual',        'Renewal — Annual Subscription',               'subscription', 10000, 'USD', 'Yearly subscription renewal ($100/year) via create-renewal-checkout.',        26)
on conflict (key) do nothing;
