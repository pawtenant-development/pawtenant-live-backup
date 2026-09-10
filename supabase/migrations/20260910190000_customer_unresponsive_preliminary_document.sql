-- CUSTOMER-UNRESPONSIVE-PRELIMINARY-DOCUMENT-001 (TEST)
CREATE OR REPLACE FUNCTION public.order_has_customer_visible_document(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.order_documents d
            WHERE d.order_id = p_order_id
              AND d.customer_visible = true
              AND d.doc_type <> 'preliminary_document'
              AND d.superseded_by_document_id IS NULL
              AND lower(coalesce(d.review_status, 'not_applicable')) IN ('approved', 'not_applicable'))
      OR EXISTS (
           SELECT 1 FROM public.orders o
            WHERE o.id = p_order_id
              AND nullif(btrim(coalesce(o.signed_letter_url, '')), '') IS NOT NULL);
$$;
COMMENT ON FUNCTION public.order_has_customer_visible_document(uuid) IS
  'CUSTOMER-UNRESPONSIVE-PRELIMINARY-DOCUMENT-001: completion-notification gate. Preliminary documents never count as final delivery.';
REVOKE ALL ON FUNCTION public.order_has_customer_visible_document(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_has_customer_visible_document(uuid) TO service_role;

