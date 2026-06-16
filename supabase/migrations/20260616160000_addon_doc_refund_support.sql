-- Add-on (Additional Documentation) refund support. LIVE mirror of TEST
-- (applied via MCP apply_migration on 2026-06-16). Adds 'refunded' to the
-- status check + refund tracking columns.
alter table public.order_additional_documentation_requests drop constraint if exists addon_doc_status_chk;
alter table public.order_additional_documentation_requests
  add constraint addon_doc_status_chk check (status in ('pending','paid','cancelled','expired','refunded'));
alter table public.order_additional_documentation_requests add column if not exists refunded_at timestamptz;
alter table public.order_additional_documentation_requests add column if not exists stripe_refund_id text;
alter table public.order_additional_documentation_requests add column if not exists refund_amount_cents integer;
