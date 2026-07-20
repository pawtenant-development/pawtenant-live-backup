-- PORTAL-ADDON-ELIGIBILITY-PARITY-001 (2026-07-20)
-- One ACTIVE/OWNED standalone Additional Documentation add-on per order.
--
-- Race-hardening for the app-level eligibility gates in create-additional-doc-invoice:
-- at most ONE request per order among the statuses that represent an ACTIVE (pending)
-- or ALREADY-OWNED (paid) add-on. Closes the TOCTOU window between the eligibility
-- SELECT and the INSERT (two concurrent creates can no longer both succeed).
--
-- Owner decision (2026-07-20): a REFUNDED request does NOT count as owned — a refund
-- means the provider could not complete the service, so the customer may retry; and
-- genuinely-unpaid terminals (cancelled/failed) also allow a retry. So `refunded` and
-- `cancelled` are EXCLUDED from the predicate.
--
-- Idempotent (IF NOT EXISTS). Non-destructive: creates an index only; touches no rows;
-- historical paid/refunded/cancelled rows are preserved. Pre-check on TEST confirmed
-- 0 orders violate the predicate (5 paid rows on 5 distinct orders; 0 pending).
create unique index if not exists uq_addon_doc_active_per_order
  on public.order_additional_documentation_requests (order_id)
  where status in ('pending', 'paid');
