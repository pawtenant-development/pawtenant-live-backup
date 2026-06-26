-- Archive redundant legacy email_templates rows on LIVE.
--
-- Why (LIVE Templates Hub cleanup):
--   finish_esa / order_confirmed / letter_ready are old DB rows (a past
--   "Save to DB" persisted the DEFAULT_TEMPLATES presets). They are now fully
--   redundant with the real DB-backed editable rows:
--     finish_esa     -> seq_30min / seq_24h / seq_3day / checkout_recovery / checkout_recovery_discount
--     order_confirmed-> order_confirmation
--     letter_ready   -> letter_delivery
--   No automatic sender / edge function looks these up as template slugs, and
--   no comms_settings pointer references them (verified read-only). They only
--   cluttered the Templates Hub sidebar + the manual-send list.
--
-- Soft-hide via the existing `archived` column (NON-DESTRUCTIVE, reversible —
-- set archived=false to restore). Body/subject/content untouched. No deletes.
--
-- CommunicationTab already filters `!archived`; the Templates Hub gets a
-- render-time archived filter in the same change.

UPDATE public.email_templates
   SET archived = true,
       updated_at = now()
 WHERE id IN ('finish_esa', 'order_confirmed', 'letter_ready')
   AND archived = false;
