-- CUSTOMER-DELIVERY-24-HOUR-PROMISE-PARITY-001-LIVE (owner-approved, 2026-09-04)
--
-- PawTenant no longer offers a 2-3-day letter-delivery option, but the active
-- `site_pricing_settings` rows still described the retired two-speed PSD offer:
--
--   psd_standard   label "PSD Letter — Standard (1 dog)"
--                  desc  "PSD letter, standard delivery (2-3 business days),
--                         1 dog. 2 or 3 dogs = $149 fixed total."
--   psd_priority   label "PSD Letter — Priority 24h (1 dog)"
--                  desc  "PSD letter, priority delivery (within 24 hours), ..."
--   psd_multi_dog  desc  "... covering 2 or 3 dogs (both delivery speeds)."
--
-- WHY THIS IS A SEPARATE LIVE MIGRATION.
-- TEST carries 20260904120000_delivery_24_hour_promise_pricing_copy.sql, whose
-- wording assumes the TEST-only PSD two-dog offer ($129 covers up to 2 dogs,
-- $149 for exactly 3 — ESA-HOUSING-FABLE-51-CRO-TEST-003). That pricing is NOT
-- promoted to LIVE. LIVE charges 1 dog $129 and 2 OR 3 dogs $149, so applying
-- the TEST text here would have written a price LIVE does not charge into the
-- Admin pricing panel. This migration therefore carries the SAME delivery
-- change against LIVE's OWN dog-count semantics, and the TEST file is not
-- shipped to this repo.
--
-- These rows are DISPLAY ONLY (src/lib/sitePricing.ts): the Admin ->
-- Settings -> Website Pricing panel and public price text. They do NOT drive
-- Stripe amounts, order totals, refunds or payouts.
--
-- This migration changes LABEL and DESCRIPTION text only. `amount_cents` is
-- deliberately never written, so no price moves.
--
-- Idempotent: every statement is guarded on the stale text, so a re-run is a
-- no-op and a row an admin has since re-worded by hand is left alone.

begin;

-- 1. The one-time PSD letter is no longer "Standard (2-3 business days)".
--    LIVE dog-count semantics preserved exactly: 1 dog here, 2 or 3 = $149.
update public.site_pricing_settings
   set label       = 'PSD Letter — One-Time (1 dog)',
       description = 'One-time PSD letter, 1 dog. 2 or 3 dogs = $149 fixed total. Letters are typically delivered within 24 hours after provider review.',
       updated_at  = now()
 where key = 'psd_standard'
   and (label ~* 'standard' or description ~* '(2-3|2–3)\s*business\s*day');

-- 2. There is no separate "Priority 24h" product to choose any more; the single
--    one-time offer already carries the 24-hour promise. Kept ACTIVE (the key is
--    referenced by PRICING_KEYS.psdPriority) but relabelled so neither an admin
--    nor a page can present it as a paid delivery upgrade.
update public.site_pricing_settings
   set label       = 'PSD Letter — One-Time (legacy priority key)',
       description = 'Retired delivery tier. All PSD letters are typically delivered within 24 hours after provider review; this key exists only so historical references resolve.',
       updated_at  = now()
 where key = 'psd_priority'
   and (label ~* 'priority 24h' or description ~* 'priority delivery');

-- 3. The multi-dog fixed total no longer straddles "both delivery speeds".
--    The 2-or-3-dog grouping is LIVE's real offer and is left unchanged.
update public.site_pricing_settings
   set description = 'One-time PSD letter fixed total covering 2 or 3 dogs. Letters are typically delivered within 24 hours after provider review.',
       updated_at  = now()
 where key = 'psd_multi_dog'
   and description ~* 'both delivery speeds';

commit;
