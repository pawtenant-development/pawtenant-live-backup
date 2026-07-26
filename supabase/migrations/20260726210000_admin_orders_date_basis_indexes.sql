-- ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001 §12/§21 — date-basis sort indexes.
--
-- Added only AFTER query plans proved the need (§12: "Do not add an index
-- without checking query plans"). Measured on TEST, 582 orders:
--
--   Latest Activity basis (default list + KPI counts)
--     → Index Scan / Bitmap Index Scan on orders_last_meaningful_activity_idx
--       (124 buffers for the list page; 0.23 ms for a filtered count)  ✅ covered
--
--   First Paid basis      → Seq Scan, 559 of 582 rows discarded by filter  ❌
--   Completed basis       → same shape, no supporting index               ❌
--
-- At TEST size a seq scan is genuinely the cheaper plan and Postgres will keep
-- choosing it; these indexes exist for LIVE-scale selectivity. Both are PARTIAL
-- (`where <col> is not null`) because the columns are sparse — 142 of 582 orders
-- have paid_at and 83 have last_completed_at — so the indexes stay small and a
-- NULL-valued row (which can never satisfy a bounded date range anyway) is not
-- indexed at all.
--
-- Column order mirrors the §12 deterministic ordering: <basis> DESC,
-- created_at DESC, id DESC.
--
-- Idempotent + non-destructive.

create index if not exists orders_first_paid_basis_idx
  on public.orders (paid_at desc, created_at desc, id desc)
  where paid_at is not null;

create index if not exists orders_last_completed_basis_idx
  on public.orders (last_completed_at desc, created_at desc, id desc)
  where last_completed_at is not null;

comment on index public.orders_first_paid_basis_idx is
  'ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001: supports the "First paid date" '
  'Admin Orders basis (sort + From/To range + KPI facet counts). Partial — a NULL '
  'paid_at can never satisfy a bounded range.';
comment on index public.orders_last_completed_basis_idx is
  'ADMIN-ORDERS-LIFECYCLE-DATE-SEMANTICS-001: supports the "Completed date" '
  'Admin Orders basis. Partial — a never-completed order is excluded from a '
  'bounded completed-date range by contract.';
