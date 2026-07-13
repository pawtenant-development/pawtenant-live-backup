-- PACKAGE-RA-LETTER-BUNDLE-001 (Slice 1). Additive + idempotent.
-- Foundational: package / RA-bundle / additional-documentation columns on orders.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS package_key text,
  ADD COLUMN IF NOT EXISTS package_display_name text,
  ADD COLUMN IF NOT EXISTS billing_plan text,
  ADD COLUMN IF NOT EXISTS includes_reasonable_accommodation_letter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS additional_documentation_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS additional_documentation_status text,
  ADD COLUMN IF NOT EXISTS additional_documentation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_uploaded_additional_document_at timestamptz;

COMMENT ON COLUMN public.orders.package_key IS
  'Canonical package: esa_standard | esa_ra_bundle | psd_standard | psd_ra_bundle (PACKAGE-RA-LETTER-BUNDLE-001).';
COMMENT ON COLUMN public.orders.billing_plan IS
  'Normalized billing plan: one_time | annual (distinct from legacy display plan_type).';
COMMENT ON COLUMN public.orders.includes_reasonable_accommodation_letter IS
  'True when the purchased package includes the Reasonable Accommodation letter bundle.';
COMMENT ON COLUMN public.orders.additional_documentation_status IS
  'RA/additional-doc fulfillment state: not_uploaded | uploaded | in_review | completed (nullable when not applicable).';

CREATE INDEX IF NOT EXISTS idx_orders_ra_bundle
  ON public.orders (includes_reasonable_accommodation_letter)
  WHERE includes_reasonable_accommodation_letter = true;
