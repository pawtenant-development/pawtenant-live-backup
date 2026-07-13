-- Provider document RLS email-ownership arm (Slice 1). An assigned provider may
-- read THEIR assigned order's documents by doctor_user_id OR matching doctor_email
-- (mirrors the orders provider policy). Only broadens to the same assigned
-- provider. Idempotent (DROP ... IF EXISTS).
DROP POLICY IF EXISTS providers_select_assigned_documents ON public.order_documents;

CREATE POLICY providers_select_assigned_documents ON public.order_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_documents.order_id
        AND (
          orders.doctor_user_id = auth.uid()
          OR (orders.doctor_email IS NOT NULL AND lower(orders.doctor_email) = lower(auth.email()))
        )
    )
  );
