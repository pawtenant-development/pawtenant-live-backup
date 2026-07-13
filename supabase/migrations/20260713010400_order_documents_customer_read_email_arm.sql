-- Customer document RLS email-ownership correction (Slice 1). The portal matches
-- orders by EMAIL (many orders have user_id = NULL), so the prior user_id-only
-- policy hid customers' own docs. Adds the email arm + customer_visible filter.
-- LIVE-data-verified safe: all order_documents rows are customer_visible = true,
-- so the added filter hides nothing. Idempotent (DROP ... IF EXISTS).
DROP POLICY IF EXISTS customers_read_own_docs ON public.order_documents;

CREATE POLICY customers_read_own_docs ON public.order_documents
  FOR SELECT
  USING (
    order_documents.customer_visible = true
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_documents.order_id
        AND (
          o.user_id = auth.uid()
          OR (o.email IS NOT NULL AND lower(o.email) = lower(auth.email()))
        )
    )
  );
