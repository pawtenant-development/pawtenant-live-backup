-- ORDER-PARTIAL-REFUND-STATUS-FIX-001
-- Additive, idempotent, non-destructive.
--
-- Adds orders.refund_status to distinguish a PARTIAL refund (money returned but
-- the order is still operationally active) from a FULL refund (order.status is
-- flipped to 'refunded'). Before this, create-refund + the stripe-webhook
-- charge.refunded handler set status='refunded' on ANY refund, so a partial
-- refund (e.g. Desiree PT-MR1HX27H — $40 refunded on a completed order) wrongly
-- read as fully refunded. refund_amount (cumulative dollars) + refunded_at stay
-- the source of truth for the money; refund_status only classifies the state.

alter table public.orders
  add column if not exists refund_status text not null default 'none';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_refund_status_check'
  ) then
    alter table public.orders
      add constraint orders_refund_status_check
      check (refund_status in ('none', 'partial', 'full'));
  end if;
end $$;

-- Best-effort backfill for existing refunded orders. Runs only on rows still at
-- the default ('none') that show refund evidence, so re-running is a no-op.
--   partial  = a positive refund strictly less than the recorded price
--   full     = everything else with refund evidence (incl. legacy status=refunded
--              rows where amount/price were not captured)
update public.orders
set refund_status = case
  when refund_amount is not null
   and price is not null
   and refund_amount > 0
   and refund_amount < price then 'partial'
  else 'full'
end
where refund_status = 'none'
  and (status = 'refunded' or refunded_at is not null)
  and (refund_amount is not null or status = 'refunded');

comment on column public.orders.refund_status is
  'Refund classification: none | partial | full. A partial refund keeps the operational status; only a full refund sets status=refunded. (ORDER-PARTIAL-REFUND-STATUS-FIX-001)';
