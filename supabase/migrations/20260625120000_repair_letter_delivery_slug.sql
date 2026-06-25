-- Repair the Letter Delivery template slug.
--
-- Why (ACTIVE-DB-EDITABLE 2026-06-25):
--   letter_delivery was seeded (20260519150000) with a UUID id and
--   slug='letter_delivery'. The Templates Hub "Save to DB" handler used to
--   write slug = id for EVERY row, so once an admin saved, the Letter
--   Delivery row's slug got clobbered to its UUID. After that:
--     - notify-patient-letter looks up slug='letter_delivery', no longer
--       finds the row, and silently falls back to its hardcoded layout —
--       so admin edits in the hub never go live.
--     - the hub showed the row as "Not wired" and (after the preset-merge)
--       a duplicate "Letter Delivery" preset appeared.
--   The Save handler is now fixed to preserve the real slug; this migration
--   repairs rows already clobbered.
--
--   Keyed on the body placeholder {document_list}, which is unique to the
--   Letter Delivery template — so it works regardless of the row's UUID id
--   or any admin-edited label, on TEST and LIVE alike.
--
-- Idempotent (no-op once slug is correct) + non-destructive (only the slug
-- column is touched; subject/body/cta are preserved).

UPDATE public.email_templates
   SET slug = 'letter_delivery',
       updated_at = now()
 WHERE channel = 'email'
   AND body LIKE '%{document_list}%'
   AND COALESCE(slug, '') <> 'letter_delivery';
