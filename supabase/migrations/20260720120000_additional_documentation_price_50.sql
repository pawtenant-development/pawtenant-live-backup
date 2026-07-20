-- PORTAL-ADDON-PRICE-RECONCILE-LIVE-001 (2026-07-20)
-- Owner decision: the standalone "Additional Documentation" / Reasonable-
-- Accommodation add-on price is $50 (5,000 cents). This SUPERSEDES the earlier
-- $70 display migration (20260713010300_additional_documentation_price_70.sql).
--
-- The authoritative charge is server-side in create-additional-doc-invoice
-- (ADDON_AMOUNT_CENTS = 5000). This brings the DISPLAY-only
-- public.site_pricing_settings row (admin "Website Pricing" panel + any DB-driven
-- display fallback) back in line with the actual charge.
--
-- Idempotent + non-destructive: only touches the row while it still holds the
-- prior known $70 value, so a deliberate admin override is never clobbered.
-- Re-running finds nothing at 7000 and is a no-op.

update public.site_pricing_settings
set amount_cents = 5000,
    updated_at = now()
where key = 'additional_documentation'
  and amount_cents = 7000;
