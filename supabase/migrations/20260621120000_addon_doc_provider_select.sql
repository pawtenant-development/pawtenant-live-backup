-- ADDON-DOC-PROVIDER-VISIBILITY (2026-06-21)
-- Lets the assigned provider SELECT the additional-documentation request rows
-- for their own orders, so the provider portal can show "Additional
-- Documentation paid — action needed" alongside the customer-uploaded form.
--
-- Additive only: existing admin (is_admin_staff) and customer (own email)
-- SELECT policies are untouched. Providers get SELECT — never write — and only
-- for orders where they are the assigned doctor (orders.doctor_user_id = auth.uid()).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_additional_documentation_requests'
      AND policyname = 'addon_doc_provider_select'
  ) THEN
    CREATE POLICY addon_doc_provider_select
      ON public.order_additional_documentation_requests
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = order_additional_documentation_requests.order_id
            AND o.doctor_user_id = auth.uid()
        )
      );
  END IF;
END $$;
