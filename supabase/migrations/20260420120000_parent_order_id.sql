-- Returning-customer checkout: link child orders to parent paid order.
-- Set only by service-role create-returning-order function.
-- Presence of parent_order_id is the authorization signal for the paid-email
-- bypass in create-payment-intent and create-checkout-session.
alter table public.orders
  add column if not exists parent_order_id uuid references public.orders(id);

create index if not exists orders_parent_order_id_idx
  on public.orders(parent_order_id);
