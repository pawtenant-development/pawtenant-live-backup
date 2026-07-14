-- BATCH-0.2A-ATTRIBUTION-PERSISTENCE-COMPLETION-001
-- Additive, non-destructive migration. Adds dedicated flat attribution /
-- checkout-lifecycle columns on public.orders, mirroring the existing flat
-- gclid / fbclid / msclkid pattern:
--
--   gbraid              text        — Google Ads GBRAID click id (iOS / app path).
--                                     Parity with gclid; kept distinct so an
--                                     uploader/reporting path can key on it later.
--   wbraid              text        — Google Ads WBRAID click id (web-to-app path).
--                                     Parity with gclid; kept distinct.
--   checkout_started_at timestamptz — authoritative moment the customer genuinely
--                                     initiates checkout (a PaymentIntent /
--                                     Checkout Session is minted at the Step-3 pay
--                                     gate — NOT a pricing/assessment page load).
--                                     First-write-wins. NULL for assessment-only
--                                     leads and for historical orders (never
--                                     fabricated / inferred).
--
-- All columns NULLABLE, no defaults, no NOT NULL. IF NOT EXISTS = idempotent.
-- No index is added: there is no query path today that filters by gbraid/wbraid
-- (the Google Ads uploader still keys on gclid; uploader support is Batch 0.2B).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gbraid              text,
  ADD COLUMN IF NOT EXISTS wbraid              text,
  ADD COLUMN IF NOT EXISTS checkout_started_at timestamptz;

COMMENT ON COLUMN public.orders.gbraid IS
  'Google Ads GBRAID click identifier (iOS/app). Promoted from first_touch_json/attribution_json. Parity with gclid. Nullable.';
COMMENT ON COLUMN public.orders.wbraid IS
  'Google Ads WBRAID click identifier (web-to-app). Promoted from first_touch_json/attribution_json. Parity with gclid. Nullable.';
COMMENT ON COLUMN public.orders.checkout_started_at IS
  'Timestamp the customer genuinely initiated checkout (PI/Checkout Session minted at the pay gate). First-write-wins; NULL for leads and historical orders. Never fabricated.';

-- ── Safe backfill: gbraid / wbraid ONLY ───────────────────────────────────────
-- Populate the new flat columns from AUTHORITATIVE existing attribution JSON where
-- safely parseable. Precedence = first_touch (canonical origin) → attribution_json
-- → last_touch. Only writes when the flat column is currently NULL and the parsed
-- value is a non-empty, non-macro string (a raw '{gbraid}' / '{{...}}' placeholder
-- is rejected). No fabricated values.
--
-- checkout_started_at is intentionally NOT backfilled — there is no authoritative
-- historical source and the spec forbids inferring/fabricating it.

UPDATE public.orders o
SET gbraid = v.val
FROM (
  SELECT id,
    COALESCE(
      NULLIF(btrim(first_touch_json->>'gbraid'), ''),
      NULLIF(btrim(attribution_json->>'gbraid'), ''),
      NULLIF(btrim(last_touch_json->>'gbraid'), '')
    ) AS val
  FROM public.orders
) v
WHERE o.id = v.id
  AND o.gbraid IS NULL
  AND v.val IS NOT NULL
  AND v.val !~ '^\{';   -- reject unresolved macro tokens ({gbraid} / {{...}})

UPDATE public.orders o
SET wbraid = v.val
FROM (
  SELECT id,
    COALESCE(
      NULLIF(btrim(first_touch_json->>'wbraid'), ''),
      NULLIF(btrim(attribution_json->>'wbraid'), ''),
      NULLIF(btrim(last_touch_json->>'wbraid'), '')
    ) AS val
  FROM public.orders
) v
WHERE o.id = v.id
  AND o.wbraid IS NULL
  AND v.val IS NOT NULL
  AND v.val !~ '^\{';

-- Refresh PostgREST schema cache so the new columns are immediately visible to
-- the edge functions (get-resume-order / create-payment-intent / create-checkout-session).
NOTIFY pgrst, 'reload schema';
