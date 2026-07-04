-- ─────────────────────────────────────────────────────────────────────────
-- 2026-07-02 (2): annual subscription DISPLAY → $109 + consultation label
-- ─────────────────────────────────────────────────────────────────────────
-- Owner decision: ESA and PSD annual subscription pricing = $109.
--   • This migration updates the DISPLAY rows only (site_pricing_settings).
--   • The amounts Stripe actually BILLS come from recurring Price objects in
--     the Stripe TEST catalog (ESA annual base currently $99/yr, PSD annual
--     tier-1 currently $99/yr). The owner must create replacement $109/yr
--     Prices in Stripe TEST and swap the IDs in create-payment-intent +
--     create-checkout-session — until then, TEST subscription checkouts
--     charge the OLD amounts.
--   • Also overwrites the stale admin test values found on TEST
--     (esa_subscription_annual was $10, psd_annual was $55).
-- Consultation display row relabeled to the 15-minute call positioning.
-- Idempotent: UPDATEs pin exact values; safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

update public.site_pricing_settings
   set amount_cents = 10900,
       display_text = null,
       description  = 'Annual ESA subscription base price for one pet (per year).'
 where key = 'esa_subscription_annual';

update public.site_pricing_settings
   set amount_cents = 10900,
       display_text = null,
       description  = 'Annual PSD subscription (per year, 1 dog).'
 where key = 'psd_annual';

update public.site_pricing_settings
   set label       = 'Consultation — 15-Minute Call',
       description = 'Quick 15-minute call with a licensed provider covering ESA or PSD requirements, eligibility questions, the documentation process, and next steps. Not a guaranteed letter; does not replace the full ESA or PSD assessment.'
 where key = 'psd_consultation';
