-- Additional Documentation add-on price $40 -> $70 (Slice 1). Guarded + idempotent:
-- only bumps the row currently at 4000; re-run is a no-op. Historical paid rows
-- keep their own amount (this only updates the display/config setting).
update public.site_pricing_settings
set amount_cents = 7000,
    updated_at = now()
where key = 'additional_documentation'
  and amount_cents = 4000;
