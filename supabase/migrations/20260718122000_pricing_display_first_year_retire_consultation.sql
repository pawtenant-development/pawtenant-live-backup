-- CHECKOUT-PRICING-PHASED-SUBSCRIPTION-003 · Phase 9/12 (display layer)
-- Move the DISPLAY-only site_pricing_settings rows to the new first-year
-- subscription pricing and retire the $79 PSD consultation. One-time rows
-- ($129 / $149) and combo are unchanged. Idempotent, non-destructive: existing
-- historical consultation orders keep their own recorded amounts; we only flip
-- the active flag so it stops appearing in new-purchase/marketing surfaces.

update public.site_pricing_settings set amount_cents = 11500, updated_at = now() where key = 'esa_subscription_annual';
update public.site_pricing_settings set amount_cents = 13500, updated_at = now() where key = 'esa_subscription_multi';
update public.site_pricing_settings set amount_cents = 11500, updated_at = now() where key = 'psd_annual';
update public.site_pricing_settings set amount_cents = 13500, updated_at = now() where key = 'psd_annual_multi';
update public.site_pricing_settings set is_active = false, updated_at = now() where key = 'psd_consultation';
