-- ─────────────────────────────────────────────────────────────────────────
-- 2026-07 pricing update + PSD Consultation product (TEST)
-- ─────────────────────────────────────────────────────────────────────────
-- New selling prices (checkout amounts live in create-payment-intent; the
-- rows here are the admin-managed DISPLAY prices in site_pricing_settings):
--   • ESA letter one-time, 1 pet:      $110 → $129
--   • ESA letter one-time, 2-3 pets:   $145 FIXED TOTAL (replaces the $25
--     per-additional-pet add-on model — esa_additional_pet is deactivated)
--   • PSD letter one-time:             $139 FLAT (up to 3 dogs, Standard and
--     Priority delivery at the same price)
--   • PSD Consultation (new product):  $79 — clinical guidance call
-- Subscriptions are unchanged (ESA $99/yr + $20/pet; PSD $99/$109/$129).
--
-- Also extends consultation_requests.source_context with
-- 'psd_consultation_purchase' so paid consultations are attributable.
--
-- Idempotent: UPDATEs pin exact values (safe to re-run), INSERTs use
-- ON CONFLICT DO NOTHING, constraint swap is guarded.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Display price updates ────────────────────────────────────────────────
update public.site_pricing_settings
   set amount_cents = 12900,
       display_text = null,
       description  = 'One-time ESA letter price for one pet.'
 where key = 'esa_single_pet';

-- The per-additional-pet add-on no longer exists on the one-time letter —
-- deactivate rather than delete so historical references stay resolvable.
update public.site_pricing_settings
   set is_active   = false,
       description = 'RETIRED 2026-07: replaced by esa_multi_pet fixed total.'
 where key = 'esa_additional_pet';

update public.site_pricing_settings
   set amount_cents = 13900,
       display_text = null,
       label        = 'PSD Letter — Standard (up to 3 dogs)',
       description  = 'PSD letter, standard delivery (2-3 business days). $139 flat — covers up to 3 dogs.'
 where key = 'psd_standard';

update public.site_pricing_settings
   set amount_cents = 13900,
       display_text = null,
       label        = 'PSD Letter — Priority 24h (up to 3 dogs)',
       description  = 'PSD letter, priority delivery (within 24 hours). $139 flat — covers up to 3 dogs.'
 where key = 'psd_priority';

-- ── 2. New display keys ─────────────────────────────────────────────────────
insert into public.site_pricing_settings (key, label, service_type, amount_cents, currency, description, sort_order) values
  ('esa_multi_pet',    'ESA Letter — 2 or 3 Pets (fixed total)', 'esa', 14500, 'USD', 'One-time ESA letter fixed total covering 2 or 3 pets (no per-pet add-on).', 11),
  ('psd_consultation', 'PSD Consultation (guidance call)',       'psd',  7900, 'USD', 'Clinical guidance call with a licensed provider about whether PSD documentation may be appropriate. Not a letter; no letter is guaranteed.', 23)
on conflict (key) do nothing;

-- ── 3. orders.letter_type — allow the new consultation product ─────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_letter_type_check') THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_letter_type_check;
  END IF;

  ALTER TABLE public.orders
    ADD CONSTRAINT orders_letter_type_check
    CHECK (letter_type = ANY (ARRAY['esa'::text, 'psd'::text, 'psd-consultation'::text]));
END$$;

-- ── 4. consultation_requests source for paid consultations ─────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultation_requests_source_check') THEN
    ALTER TABLE public.consultation_requests
      DROP CONSTRAINT consultation_requests_source_check;
  END IF;

  ALTER TABLE public.consultation_requests
    ADD CONSTRAINT consultation_requests_source_check
    CHECK (source_context IN (
      'email_recovery',
      'manual_recovery',
      'checkout_prompt',
      'assessment_prompt',
      'manual',
      'direct_link',
      'psd_consultation_purchase'
    ));
END$$;
