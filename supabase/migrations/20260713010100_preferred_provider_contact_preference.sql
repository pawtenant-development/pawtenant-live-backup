-- CUSTOMER-PORTAL-ORDER-GUIDANCE-RA-PROVIDER-SLOTS-001 (Slice 1).
-- Optional customer-set "preferred provider contact time" preference.
-- Narrow, additive, idempotent. No lifecycle impact; provider reads read-only.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS preferred_provider_contact_date date,
  ADD COLUMN IF NOT EXISTS preferred_provider_contact_window text,
  ADD COLUMN IF NOT EXISTS preferred_provider_contact_note text,
  ADD COLUMN IF NOT EXISTS preferred_provider_contact_timezone text,
  ADD COLUMN IF NOT EXISTS preferred_provider_contact_updated_at timestamptz;

COMMENT ON COLUMN public.orders.preferred_provider_contact_window IS
  'Customer preferred contact window (e.g. morning/afternoon/evening). Preference only — not a scheduled/guaranteed call time.';
